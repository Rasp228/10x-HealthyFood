// promptfoo provider over createReviewer: one review per test case, so the evals measure exactly
// the run the CLI and CI make. It also enforces the 0 USD limit of the OpenRouter evals: a model
// without the ":free" suffix is refused, a per-process call cap bounds the shared daily key limit,
// and the first call that reports a cost stops the rest of the run.
import path from "node:path";
import dotenv from "dotenv";
import type { ApiProvider, CallApiContextParams, ProviderOptions, ProviderResponse } from "promptfoo";
import { createReviewer, ReviewError, type ReviewMetrics } from "../src/agent/reviewer.js";
import { PROVIDERS, type ProviderName, type ReviewModel } from "../src/provider.js";

const PACKAGE_DIR = path.resolve(import.meta.dirname, "..");

// promptfoo reads .env from the working directory, not from the package; quiet as in src/index.ts.
dotenv.config({ path: path.join(PACKAGE_DIR, ".env"), quiet: true });

// One review can be two HTTP requests (MAX_RETRIES in src/agent/reviewer.ts), so 10 reviews can
// spend up to 20 requests of the key's daily free-model limit, which CI shares.
export const DEFAULT_EVAL_MAX_CALLS = 10;
export const FREE_MODEL_SUFFIX = ":free";

export function readEvalMaxCalls(env: NodeJS.ProcessEnv): number {
  const raw = env.EVAL_MAX_CALLS;
  if (!raw) return DEFAULT_EVAL_MAX_CALLS;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`EVAL_MAX_CALLS must be a positive integer, got "${raw}"`);
  }
  return value;
}

// An empty REVIEW_MODEL would fall back to the paid default model (src/provider.ts), so it is
// refused like any other model without the suffix.
export function assertFreeModel(modelId: string | undefined): string {
  const model = modelId?.trim() ?? "";
  if (!model.endsWith(FREE_MODEL_SUFFIX)) {
    throw new Error(
      `OpenRouter evals run only on a free model: REVIEW_MODEL must end with "${FREE_MODEL_SUFFIX}", got "${model}"`
    );
  }
  return model;
}

// Counts reviews, not HTTP requests. reserve() takes the slot before the call is awaited, so cases
// running in parallel cannot all pass the check, and a failed call still uses its slot.
export function createCallCounter() {
  let used = 0;
  return {
    reserve(limit: number): boolean {
      if (used >= limit) return false;
      used++;
      return true;
    },
    get used(): number {
      return used;
    },
  };
}

// Module state, shared by every provider instance in the process (one promptfoo run).
let openrouterCalls = createCallCounter();
let costAlarm: number | null = null;

// Test-only: a fresh counter and no cost alarm, as at the start of a run.
export function resetEvalStateForTests(): void {
  openrouterCalls = createCallCounter();
  costAlarm = null;
}

export function openrouterCallsUsed(): number {
  return openrouterCalls.used;
}

interface ProviderConfig {
  provider?: string;
}

// Test seam: a mock model and an env that does not depend on the developer's .env.
export interface ReviewerProviderOverrides {
  reviewModel?: ReviewModel;
  env?: NodeJS.ProcessEnv;
}

type Reviewer = ReturnType<typeof createReviewer>;

function readProviderName(config: ProviderConfig | undefined): ProviderName {
  const raw = config?.provider;
  if (!(PROVIDERS as readonly (string | undefined)[]).includes(raw)) {
    throw new Error(`config.provider must be one of ${PROVIDERS.join("|")}, got "${raw}"`);
  }
  return raw as ProviderName;
}

function tokenUsage(metrics: ReviewMetrics): ProviderResponse["tokenUsage"] {
  return {
    prompt: metrics.input_tokens ?? undefined,
    completion: metrics.output_tokens ?? undefined,
    total: metrics.total_tokens ?? undefined,
  };
}

function costAlarmMessage(cost: number): string {
  return `OpenRouter reported a cost of $${cost} for a ":free" eval run; later OpenRouter cases are refused`;
}

export default class ReviewerProvider implements ApiProvider {
  readonly label: string;
  private readonly provider: ProviderName;
  private readonly env: NodeJS.ProcessEnv;
  private readonly reviewModel: ReviewModel | undefined;
  private reviewer: Reviewer | undefined;

  constructor(options: ProviderOptions<ProviderConfig> = {}, overrides: ReviewerProviderOverrides = {}) {
    this.provider = readProviderName(options.config);
    this.label = options.label ?? this.provider;
    this.env = { ...(overrides.env ?? process.env), REVIEW_PROVIDER: this.provider };
    this.reviewModel = overrides.reviewModel;
  }

  id(): string {
    return `code-reviewer:${this.provider}`;
  }

  // Lazy, so a run filtered to "local" never trips over a missing OPENROUTER_API_KEY.
  private getReviewer(): Reviewer {
    this.reviewer ??= createReviewer({ env: this.env, reviewModel: this.reviewModel });
    return this.reviewer;
  }

  // Never throws: promptfoo shows the error on the case and moves on to the next one.
  async callApi(prompt: string, context?: Pick<CallApiContextParams, "vars">): Promise<ProviderResponse> {
    try {
      const diff = typeof context?.vars?.diff === "string" ? context.vars.diff : prompt;
      if (this.provider === "openrouter") {
        // Order matters: every check that can refuse runs before the slot is taken, and the slot
        // is taken before the first await.
        if (costAlarm !== null) return { error: costAlarmMessage(costAlarm) };
        assertFreeModel(this.env.REVIEW_MODEL);
        const maxCalls = readEvalMaxCalls(this.env);
        const reviewer = this.getReviewer();
        if (!openrouterCalls.reserve(maxCalls)) {
          return { error: `EVAL_MAX_CALLS reached: ${maxCalls} OpenRouter reviews in this run` };
        }
        return await this.review(reviewer, diff);
      }
      return await this.review(this.getReviewer(), diff);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async review(reviewer: Reviewer, diff: string): Promise<ProviderResponse> {
    try {
      const { review, metrics } = await reviewer.review(diff);
      if (this.tripsCostAlarm(metrics)) {
        return { error: costAlarmMessage(metrics.cost!), metadata: { review, metrics } };
      }
      return {
        output: review,
        tokenUsage: tokenUsage(metrics),
        ...(metrics.cost !== null && { cost: metrics.cost }),
        metadata: { metrics },
      };
    } catch (error) {
      // The call reached the model and may have been billed, so its metrics travel with the error.
      if (error instanceof ReviewError) {
        const message = this.tripsCostAlarm(error.metrics)
          ? `${error.message}; ${costAlarmMessage(error.metrics.cost!)}`
          : error.message;
        return { error: message, metadata: { metrics: error.metrics } };
      }
      throw error;
    }
  }

  // null means "not reported" (llama.cpp), not free, so only a reported positive cost trips it.
  private tripsCostAlarm(metrics: ReviewMetrics): boolean {
    if (this.provider !== "openrouter" || metrics.cost === null || metrics.cost <= 0) return false;
    costAlarm = metrics.cost;
    return true;
  }
}
