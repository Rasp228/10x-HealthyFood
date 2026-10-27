// Code-review agent on ToolLoopAgent: diff in, structured review plus run metrics out.
// Importable without side effects (no dotenv, no stdin, no output), so the CLI and the
// evals share it; process.env is read only inside createReviewer, as a default.
import { performance } from "node:perf_hooks";
import { isStepCount, Output, ToolLoopAgent } from "ai";
import { costExceeds, readMaxCost, totalCost } from "../cost.js";
import { buildInstructions, buildReviewPrompt } from "../prompts/index.js";
import { selectModel, type ProviderName, type ReviewModel } from "../provider.js";
import { REVIEW_SCHEMA, type Review } from "../review-schema.js";

// Safety net next to the budget cap; a review without tools needs a single step.
export const MAX_STEPS = 10;

export interface ReviewerOptions {
  env?: NodeJS.ProcessEnv;
  maxCostUsd?: number;
  reviewModel?: ReviewModel;
}

// Key order is the order of the CLI's "[review] {...}" line; keep it when adding fields.
export interface ReviewMetrics {
  provider: ProviderName;
  model: string;
  steps: number;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  cost: number | null;
  budget: number;
  duration_ms: number;
}

export interface ReviewResult {
  review: Review;
  metrics: ReviewMetrics;
}

// Throws on misconfiguration (provider, API key, budget) before any request is made.
export function createReviewer(options: ReviewerOptions = {}) {
  const env = options.env ?? process.env;
  const { provider, modelId, model } = options.reviewModel ?? selectModel(env);
  const maxCostUsd = options.maxCostUsd ?? readMaxCost(env);

  // One reviewer = one provider: the instructions are fixed here, at construction.
  const agent = new ToolLoopAgent({
    model,
    instructions: buildInstructions(provider),
    tools: {},
    output: Output.object({ schema: REVIEW_SCHEMA }),
    stopWhen: [isStepCount(MAX_STEPS), costExceeds(maxCostUsd)],
  });

  async function review(diff: string): Promise<ReviewResult> {
    const startedAt = performance.now();
    const result = await agent.generate({ prompt: buildReviewPrompt(diff) });
    const durationMs = Math.round(performance.now() - startedAt);

    const { inputTokens, outputTokens, totalTokens } = result.totalUsage;
    return {
      review: result.output,
      metrics: {
        provider,
        model: modelId,
        steps: result.steps.length,
        input_tokens: inputTokens ?? null,
        output_tokens: outputTokens ?? null,
        total_tokens: totalTokens ?? null,
        cost: totalCost(result.steps),
        budget: maxCostUsd,
        duration_ms: durationMs,
      },
    };
  }

  return { provider, modelId, agent, review };
}

export function review(diff: string, options?: ReviewerOptions): Promise<ReviewResult> {
  return createReviewer(options).review(diff);
}
