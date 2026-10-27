// Cost tracking and the hard budget cap for a review run.
import type { StepResult, StopCondition, ToolSet } from "ai";

export const DEFAULT_MAX_COST_USD = 0.1;
// ~25-30k tokens: fits a 32k llama-server context next to the prompt, and bounds what a
// single OpenRouter call can be billed for input.
export const DEFAULT_MAX_DIFF_BYTES = 100_000;

export function readMaxCost(env: NodeJS.ProcessEnv): number {
  const raw = env.REVIEW_MAX_COST_USD;
  if (!raw) return DEFAULT_MAX_COST_USD;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`REVIEW_MAX_COST_USD must be a positive number, got "${raw}"`);
  }
  return value;
}

export function readMaxDiffBytes(env: NodeJS.ProcessEnv): number {
  const raw = env.REVIEW_MAX_DIFF_BYTES;
  if (!raw) return DEFAULT_MAX_DIFF_BYTES;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`REVIEW_MAX_DIFF_BYTES must be a positive integer, got "${raw}"`);
  }
  return value;
}

type CostStep = Pick<StepResult<ToolSet>, "providerMetadata">;

// OpenRouter reports the billed cost per step under providerMetadata.openrouter.usage.cost.
// Other providers (llama.cpp) report none: null, not 0, so "free" and "unknown" stay distinct.
export function stepCost(step: CostStep): number | null {
  const usage = step.providerMetadata?.openrouter?.usage;
  if (typeof usage !== "object" || usage === null || !("cost" in usage)) return null;
  return typeof usage.cost === "number" ? usage.cost : null;
}

export function totalCost(steps: CostStep[]): number | null {
  const costs = steps.map(stepCost).filter((cost) => cost !== null);
  return costs.length ? costs.reduce((sum, cost) => sum + cost, 0) : null;
}

// Stops the loop as soon as the accumulated cost passes maxCostUsd. It is evaluated between
// steps, so it bounds the number of further calls, not the cost of the call already in flight.
// With tools: {} a review is a single step, so this never stops a paid call: the cost of that
// call is bounded up front by the diff-size cap and maxOutputTokens (agent/reviewer.ts), and
// the CLI exits 2 when it still ends over budget. Never trips when the provider reports no cost.
export function costExceeds(maxCostUsd: number): StopCondition<ToolSet> {
  return ({ steps }) => (totalCost(steps) ?? 0) > maxCostUsd;
}
