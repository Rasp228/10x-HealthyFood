// Code-review agent on ToolLoopAgent: diff in, structured review plus run metrics out.
// Importable without side effects (no dotenv, no stdin, no output), so the CLI and the
// evals share it; process.env is read only inside createReviewer, as a default.
import { performance } from "node:perf_hooks";
import { isStepCount, Output, ToolLoopAgent, type LanguageModelUsage, type StepResult } from "ai";
import { costExceeds, readMaxCost, readMaxDiffBytes, totalCost } from "../cost.js";
import { buildInstructions, buildReviewPrompt, type PrContext } from "../prompts/index.js";
import { selectModel, type ProviderName, type ReviewModel } from "../provider.js";
import { REVIEW_SCHEMA, type Review } from "../review-schema.js";

// Safety net next to the budget cap; a review without tools needs a single step.
export const MAX_STEPS = 10;
// Output cap per call; reasoning tokens count here too. A local thinking model needs room to
// think on a large diff and costs nothing per token. On OpenRouter the cap bounds the bill:
// 8192 output tokens stay under the 0.10 USD default budget at Sonnet-class prices.
export const DEFAULT_MAX_OUTPUT_TOKENS: Record<ProviderName, number> = {
  local: 32_768,
  openrouter: 8_192,
};
// One retry on a transient error; each attempt is billed, so not the SDK default of two.
export const MAX_RETRIES = 1;
// Whole-run timeout. A local model with thinking took 155-240 s on the sample diffs; a hosted
// one answers in seconds, so a stuck request fails a CI job well before the runner's timeout.
export const DEFAULT_TIMEOUT_MS: Record<ProviderName, number> = {
  local: 600_000,
  openrouter: 120_000,
};

function readPositiveInteger(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  return value;
}

export function readTimeoutMs(env: NodeJS.ProcessEnv, provider: ProviderName): number {
  return readPositiveInteger(env, "REVIEW_TIMEOUT_MS", DEFAULT_TIMEOUT_MS[provider]);
}

export function readMaxOutputTokens(env: NodeJS.ProcessEnv, provider: ProviderName): number {
  return readPositiveInteger(env, "REVIEW_MAX_OUTPUT_TOKENS", DEFAULT_MAX_OUTPUT_TOKENS[provider]);
}

export interface ReviewerOptions {
  env?: NodeJS.ProcessEnv;
  maxCostUsd?: number;
  maxDiffBytes?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
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

// A review that reached the model but produced no usable output (e.g. JSON outside the
// schema). The call was still billed, so the metrics travel with the error.
export class ReviewError extends Error {
  override name = "ReviewError";

  constructor(
    message: string,
    readonly metrics: ReviewMetrics,
    options?: ErrorOptions
  ) {
    super(message, options);
  }
}

type UsageStep = Pick<StepResult<{}>, "usage" | "providerMetadata">;
type TokenKey = keyof Pick<LanguageModelUsage, "inputTokens" | "outputTokens" | "totalTokens">;

// Sums one token count over the steps; null when no step reports it.
function sumTokens(steps: UsageStep[], key: TokenKey): number | null {
  const counts = steps.map((step) => step.usage[key]).filter((count) => count !== undefined);
  return counts.length ? counts.reduce((sum, count) => sum + count, 0) : null;
}

// Throws on misconfiguration (provider, API key, budget) before any request is made.
export function createReviewer(options: ReviewerOptions = {}) {
  const env = options.env ?? process.env;
  const { provider, modelId, model } = options.reviewModel ?? selectModel(env);
  const maxCostUsd = options.maxCostUsd ?? readMaxCost(env);
  const maxDiffBytes = options.maxDiffBytes ?? readMaxDiffBytes(env);
  const timeoutMs = options.timeoutMs ?? readTimeoutMs(env, provider);
  const maxOutputTokens = options.maxOutputTokens ?? readMaxOutputTokens(env, provider);

  // One reviewer = one provider: the instructions are fixed here, at construction.
  const agent = new ToolLoopAgent({
    model,
    instructions: buildInstructions(provider),
    tools: {},
    output: Output.object({ schema: REVIEW_SCHEMA }),
    maxOutputTokens,
    maxRetries: MAX_RETRIES,
    stopWhen: [isStepCount(MAX_STEPS), costExceeds(maxCostUsd)],
  });

  // The PR context does not count toward the diff cap; the description has its own cap
  // (MAX_PR_BODY_BYTES), applied when the prompt is built.
  async function review(diff: string, context?: PrContext): Promise<ReviewResult> {
    // Checked before the request, so an oversized diff costs nothing.
    const diffBytes = Buffer.byteLength(diff, "utf8");
    if (diffBytes > maxDiffBytes) {
      throw new Error(`diff is ${diffBytes} bytes, over the ${maxDiffBytes}-byte cap (REVIEW_MAX_DIFF_BYTES)`);
    }

    // Steps are collected as they end, so usage survives when the output fails to parse
    // after the loop and generate() rejects without a result.
    const steps: UsageStep[] = [];
    const startedAt = performance.now();
    const metrics = (): ReviewMetrics => ({
      provider,
      model: modelId,
      steps: steps.length,
      input_tokens: sumTokens(steps, "inputTokens"),
      output_tokens: sumTokens(steps, "outputTokens"),
      total_tokens: sumTokens(steps, "totalTokens"),
      cost: totalCost(steps),
      budget: maxCostUsd,
      duration_ms: Math.round(performance.now() - startedAt),
    });

    let output: Review;
    try {
      const result = await agent.generate({
        prompt: buildReviewPrompt(diff, context),
        timeout: timeoutMs,
        onStepEnd: (step) => {
          steps.push(step);
        },
      });
      output = result.output;
    } catch (error) {
      const cause = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      throw new ReviewError(cause, metrics(), { cause: error });
    }
    return { review: output, metrics: metrics() };
  }

  return { provider, modelId, agent, review };
}

export function reviewDiff(diff: string, options?: ReviewerOptions): Promise<ReviewResult> {
  return createReviewer(options).review(diff);
}
