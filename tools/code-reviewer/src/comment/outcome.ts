// Turns what the CI action leaves behind (outcome name, review stdout/stderr, exit code) into a
// CommentOutcome for renderComment. Pure, so the parsing is unit-tested without spawning the CLI.
import { z } from "zod";
import type { ReviewMetrics } from "../agent/reviewer.js";
import { PROVIDERS } from "../provider.js";
import { REVIEW_SCHEMA } from "../review-schema.js";
import type { CommentOutcome } from "./render.js";

export interface CommentInputs {
  // AI_CR_OUTCOME: review | error | empty-diff | missing-model | daily-cap.
  outcome: string;
  // Contents of AI_CR_REVIEW_FILE / AI_CR_STDERR_FILE; null when the review step never ran.
  reviewStdout: string | null;
  stderr: string | null;
  // AI_CR_EXIT_CODE of `npm run review`; null when absent.
  exitCode: number | null;
  // AI_CR_DAILY_CAP, raw.
  dailyCap?: string;
  runUrl?: string;
  excluded?: string[];
}

// Mirrors ReviewMetrics, the "[review] {...}" line of src/index.ts.
const METRICS_SCHEMA = z.object({
  provider: z.enum(PROVIDERS),
  model: z.string(),
  steps: z.number(),
  input_tokens: z.number().nullable(),
  output_tokens: z.number().nullable(),
  total_tokens: z.number().nullable(),
  cost: z.number().nullable(),
  budget: z.number(),
  duration_ms: z.number(),
}) satisfies z.ZodType<ReviewMetrics>;

const METRICS_PREFIX = "[review] {";
const FAILURE_PREFIX = "[review] failed:";

function lines(stderr: string): string[] {
  return stderr.split(/\r?\n/);
}

// The metrics line is the last stderr line starting with "[review] {"; null when there is none
// or it does not parse (a run that failed before the model call prints no metrics).
export function parseMetricsLine(stderr: string | null): ReviewMetrics | null {
  if (!stderr) return null;
  const line = lines(stderr).findLast((candidate) => candidate.startsWith(METRICS_PREFIX));
  if (!line) return null;
  try {
    const parsed = METRICS_SCHEMA.safeParse(JSON.parse(line.slice("[review] ".length)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// The failure message is everything after the last "[review] failed:" prefix: an error message
// can span several lines, and nothing is printed after it.
export function parseFailureMessage(stderr: string | null): string | null {
  if (!stderr) return null;
  const all = lines(stderr);
  const index = all.findLastIndex((line) => line.startsWith(FAILURE_PREFIX));
  if (index === -1) return null;
  const message = [all[index]!.slice(FAILURE_PREFIX.length), ...all.slice(index + 1)].join("\n").trim();
  return message || null;
}

export function parseExcluded(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((pathspec) => pathspec.trim())
    .filter(Boolean);
}

export function parseExitCode(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
}

// For "review" and "error" the exit code decides, as in src/index.ts: 0 review, 2 review over
// budget, anything else a failure. A stdout that is not a schema-valid review is a failure too.
export function buildOutcome(inputs: CommentInputs): CommentOutcome {
  const common = { runUrl: inputs.runUrl || undefined, excluded: inputs.excluded ?? [] };
  const metrics = parseMetricsLine(inputs.stderr);

  switch (inputs.outcome) {
    case "empty-diff":
    case "missing-model":
      return { ...common, kind: inputs.outcome };
    case "daily-cap": {
      const limit = Number(inputs.dailyCap);
      if (!Number.isInteger(limit) || limit <= 0) {
        return {
          ...common,
          kind: "error",
          message: `daily cap reached, but AI_CR_DAILY_CAP is not a positive integer: "${inputs.dailyCap ?? ""}"`,
          metrics: null,
        };
      }
      return { ...common, kind: "daily-cap", limit };
    }
    case "review":
    case "error":
      break;
    default:
      return { ...common, kind: "error", message: `unknown AI_CR_OUTCOME: "${inputs.outcome}"`, metrics };
  }

  if (inputs.exitCode !== 0 && inputs.exitCode !== 2) {
    const message =
      parseFailureMessage(inputs.stderr) ?? `review exited with code ${inputs.exitCode ?? "unknown"} without a message`;
    return { ...common, kind: "error", message, metrics };
  }

  let json: unknown;
  try {
    json = JSON.parse(inputs.reviewStdout ?? "");
  } catch {
    return { ...common, kind: "error", message: "review stdout is not valid JSON", metrics };
  }
  const parsed = REVIEW_SCHEMA.safeParse(json);
  if (!parsed.success) {
    return { ...common, kind: "error", message: "review stdout does not match REVIEW_SCHEMA", metrics };
  }
  return { ...common, kind: "review", review: parsed.data, metrics, budgetExceeded: inputs.exitCode === 2 };
}
