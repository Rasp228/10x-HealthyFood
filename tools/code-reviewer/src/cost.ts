// Cost tracking and the hard budget cap for a review run.
import type { StepResult, StopCondition, ToolSet } from "ai";

export const DEFAULT_MAX_COST_USD = 0.1;

export function readMaxCost(env: NodeJS.ProcessEnv): number {
  const raw = env.REVIEW_MAX_COST_USD;
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
export function stepCost(step: CostStep): number | null {
  const usage = step.providerMetadata?.openrouter?.usage;
  if (typeof usage !== "object" || usage === null || !("cost" in usage)) return null;
  return typeof usage.cost === "number" ? usage.cost : null;
}

export function totalCost(steps: CostStep[]): number | null {
  const costs = steps.map(stepCost).filter((cost) => cost !== null);
  return costs.length ? costs.reduce((sum, cost) => sum + cost, 0) : null;
}

// Hard budget cap: stops the loop as soon as the accumulated cost passes maxCostUsd.
// It is evaluated between steps, so it bounds the number of further calls, not the
// cost of the call already in flight. Never trips when the provider reports no cost.
export function costExceeds(maxCostUsd: number): StopCondition<ToolSet> {
  return ({ steps }) => (totalCost(steps) ?? 0) > maxCostUsd;
}
