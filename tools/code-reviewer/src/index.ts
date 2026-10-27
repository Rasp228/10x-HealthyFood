// Entry point: git diff on stdin -> structured JSON review on stdout.
// Everything diagnostic (usage, cost, budget) goes to stderr so stdout stays pure JSON
// for the CI gate and the evals.
//
//   git diff | npm run review
//   npm run review < /dev/null   # falls back to data/sample.diff
import { readFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { generateText, isStepCount, Output, type StepResult, type StopCondition, type ToolSet } from "ai";
import dotenv from "dotenv";
import { selectModel } from "./provider.js";
import { REVIEW_SCHEMA, SYSTEM_PROMPT } from "./review-schema.js";

const PACKAGE_DIR = path.resolve(import.meta.dirname, "..");
const SAMPLE_DIFF_PATH = path.join(PACKAGE_DIR, "data", "sample.diff");
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

type CostStep = Pick<StepResult<ToolSet>, "providerMetadata">;

// OpenRouter reports the billed cost per step under providerMetadata.openrouter.usage.cost.
// Other providers (llama.cpp) report none: null, not 0, so "free" and "unknown" stay distinct.
function stepCost(step: CostStep): number | null {
  const usage = step.providerMetadata?.openrouter?.usage;
  if (typeof usage !== "object" || usage === null || !("cost" in usage)) return null;
  return typeof usage.cost === "number" ? usage.cost : null;
}

function totalCost(steps: CostStep[]): number | null {
  const costs = steps.map(stepCost).filter((cost) => cost !== null);
  return costs.length ? costs.reduce((sum, cost) => sum + cost, 0) : null;
}

// Hard budget cap: stops the loop as soon as the accumulated cost passes maxCostUsd.
// It is evaluated between steps, so it bounds the number of further calls, not the
// cost of the call already in flight. Never trips when the provider reports no cost.
function costExceeds(maxCostUsd: number): StopCondition<ToolSet> {
  return ({ steps }) => (totalCost(steps) ?? 0) > maxCostUsd;
}

async function main(): Promise<void> {
  const { provider, modelId, model } = selectModel();
  const maxCostUsd = readMaxCost();
  const diff = await readDiff();

  const startedAt = performance.now();
  const result = await generateText({
    model,
    instructions: SYSTEM_PROMPT,
    prompt: `Oto diff do recenzji:\n\n${diff}`,
    output: Output.object({ schema: REVIEW_SCHEMA }),
    stopWhen: [isStepCount(MAX_STEPS), costExceeds(maxCostUsd)],
  });
  const durationMs = Math.round(performance.now() - startedAt);

  const cost = totalCost(result.steps);
  const { inputTokens, outputTokens, totalTokens } = result.totalUsage;
  console.error(
    `[review] ${JSON.stringify({
      provider,
      model: modelId,
      steps: result.steps.length,
      input_tokens: inputTokens ?? null,
      output_tokens: outputTokens ?? null,
      total_tokens: totalTokens ?? null,
      cost,
      budget: maxCostUsd,
      duration_ms: durationMs,
    })}`
  );
  if (cost !== null && cost > maxCostUsd) {
    console.error(`[review] budget exceeded: $${cost.toFixed(6)} > $${maxCostUsd.toFixed(2)}`);
  }

  process.stdout.write(`${JSON.stringify(result.output, null, 2)}\n`);
}

main().catch((error: unknown) => {
  console.error("[review] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
