// Entry point: git diff on stdin -> structured JSON review on stdout.
// Everything diagnostic (usage, cost, budget) goes to stderr so stdout stays pure JSON
// for the CI gate and the evals.
//
//   git diff | npm run review
//   npm run review < /dev/null   # falls back to data/sample.diff
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, isStepCount, Output, type StepResult, type StopCondition, type ToolSet } from "ai";
import dotenv from "dotenv";
import { REVIEW_SCHEMA, SYSTEM_PROMPT } from "./review-schema.js";

const PACKAGE_DIR = path.resolve(import.meta.dirname, "..");
const SAMPLE_DIFF_PATH = path.join(PACKAGE_DIR, "data", "sample.diff");
const DEFAULT_MODEL = "anthropic/claude-sonnet-5.5";
const DEFAULT_MAX_COST_USD = 0.1;
// Safety net next to the budget cap; a review without tools needs a single step.
const MAX_STEPS = 10;

// quiet: dotenv 17 otherwise prints an "injecting env" banner to stdout.
dotenv.config({ path: path.join(PACKAGE_DIR, ".env"), quiet: true });

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function readDiff(): Promise<string> {
  const stdinDiff = await readStdin();
  if (stdinDiff.trim()) return stdinDiff;
  console.error(`[review] stdin is empty, using ${path.relative(process.cwd(), SAMPLE_DIFF_PATH)}`);
  return readFile(SAMPLE_DIFF_PATH, "utf8");
}

function readMaxCost(): number {
  const raw = process.env.REVIEW_MAX_COST_USD;
  if (!raw) return DEFAULT_MAX_COST_USD;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`REVIEW_MAX_COST_USD must be a positive number, got "${raw}"`);
  }
  return value;
}

// OpenRouter reports the billed cost per step under providerMetadata.openrouter.usage.cost
// (only with usage: { include: true }). providerMetadata is untyped JSON, hence the narrowing.
function stepCost(step: Pick<StepResult<ToolSet>, "providerMetadata">): number {
  const usage = step.providerMetadata?.openrouter?.usage;
  if (typeof usage !== "object" || usage === null || !("cost" in usage)) return 0;
  return typeof usage.cost === "number" ? usage.cost : 0;
}

function totalCost(steps: Pick<StepResult<ToolSet>, "providerMetadata">[]): number {
  return steps.reduce((sum, step) => sum + stepCost(step), 0);
}

// Hard budget cap: stops the loop as soon as the accumulated cost passes maxCostUsd.
// It is evaluated between steps, so it bounds the number of further calls, not the
// cost of the call already in flight.
function costExceeds(maxCostUsd: number): StopCondition<ToolSet> {
  return ({ steps }) => totalCost(steps) > maxCostUsd;
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set (see tools/code-reviewer/.env.example)");

  const modelId = process.env.REVIEW_MODEL || DEFAULT_MODEL;
  const maxCostUsd = readMaxCost();
  const diff = await readDiff();

  const openrouter = createOpenRouter({ apiKey });
  const result = await generateText({
    model: openrouter(modelId, { usage: { include: true } }),
    instructions: SYSTEM_PROMPT,
    prompt: `Oto diff do recenzji:\n\n${diff}`,
    output: Output.object({ schema: REVIEW_SCHEMA }),
    stopWhen: [isStepCount(MAX_STEPS), costExceeds(maxCostUsd)],
  });

  const cost = totalCost(result.steps);
  const { inputTokens, outputTokens, totalTokens } = result.totalUsage;
  console.error(
    `[review] model=${modelId} steps=${result.steps.length} ` +
      `tokens in=${inputTokens ?? "?"} out=${outputTokens ?? "?"} total=${totalTokens ?? "?"} ` +
      `cost=$${cost.toFixed(6)} budget=$${maxCostUsd.toFixed(2)}`
  );
  if (cost > maxCostUsd) {
    console.error(`[review] budget exceeded: $${cost.toFixed(6)} > $${maxCostUsd.toFixed(2)}`);
  }

  process.stdout.write(`${JSON.stringify(result.output, null, 2)}\n`);
}

main().catch((error: unknown) => {
  console.error("[review] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
