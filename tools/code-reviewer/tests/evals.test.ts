import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { MockLanguageModelV4 } from "ai/test";
import { CRITERIA, gradeReview } from "../evals/assertions.js";
import ReviewerProvider, {
  assertFreeModel,
  createCallCounter,
  DEFAULT_EVAL_MAX_CALLS,
  openrouterCallsUsed,
  readEvalMaxCalls,
  resetEvalStateForTests,
} from "../evals/provider.js";
import { buildReviewPrompt } from "../src/prompts/index.js";
import type { ProviderName } from "../src/provider.js";
import type { Review } from "../src/review-schema.js";

const DIFF = "diff --git a/x.ts b/x.ts\n+const answer = 42;";
const FREE_MODEL = "vendor/model:free";

const REVIEW: Review = {
  implementationCorrectness: 8,
  idiomaticity: 7,
  complexity: 9,
  testRiskCoverage: 5,
  documentation: 6,
  securitySafety: 10,
  verdict: "pass",
  summary: "Mała, poprawna zmiana.",
};

// One step answering with the review JSON; a cost only when given, as OpenRouter reports it.
function mockModel(text = JSON.stringify(REVIEW), cost?: number) {
  return new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 120, noCache: 120, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 30, text: 30, reasoning: undefined },
      },
      ...(cost !== undefined && { providerMetadata: { openrouter: { usage: { cost } } } }),
      warnings: [],
    },
  });
}

function provider(name: ProviderName, model: MockLanguageModelV4, env: NodeJS.ProcessEnv = {}) {
  return new ReviewerProvider(
    { label: name, config: { provider: name } },
    { reviewModel: { provider: name, modelId: "mock", model }, env: { REVIEW_MODEL: FREE_MODEL, ...env } }
  );
}

function userPrompt(model: MockLanguageModelV4): unknown {
  return model.doGenerateCalls[0]!.prompt.find((message) => message.role === "user")?.content;
}

// promptfoo vars are VarValue: string, number, boolean, object or array.
const vars = (extra: Record<string, string | number | boolean | object>) => ({ vars: extra });

describe("gradeReview", () => {
  const failing: Review = { ...REVIEW, verdict: "fail", securitySafety: 2 };

  it("passes a fail verdict with a score under its maximum", () => {
    const result = gradeReview(failing, vars({ expectedVerdict: "fail", maxScores: { securitySafety: 3 } }));
    assert.equal(result.pass, true);
    assert.equal(result.score, 1);
  });

  it("fails a right verdict whose score is over the maximum, naming actual and expected", () => {
    const review = { ...failing, securitySafety: 6 };
    const result = gradeReview(review, vars({ expectedVerdict: "fail", maxScores: { securitySafety: 3 } }));
    assert.equal(result.pass, false);
    assert.equal(result.score, 0.5);
    assert.match(result.reason, /securitySafety 6, expected <= 3/);
    assert.doesNotMatch(result.reason, /verdict/);
  });

  it("fails a fail verdict when pass is expected", () => {
    const result = gradeReview(failing, vars({ expectedVerdict: "pass" }));
    assert.equal(result.pass, false);
    assert.equal(result.score, 0);
    assert.match(result.reason, /verdict fail, expected pass/);
  });

  it("applies minScore to all six criteria", () => {
    const review = { ...REVIEW, documentation: 3 };
    const result = gradeReview(review, vars({ expectedVerdict: "pass", minScore: 4 }));
    assert.equal(CRITERIA.length, 6);
    assert.equal(result.pass, false);
    assert.equal(result.score, 6 / 7);
    assert.equal(result.reason, "documentation 3, expected >= 4");
  });

  it("lists every unmet condition", () => {
    const review = { ...REVIEW, verdict: "fail" as const, documentation: 3, testRiskCoverage: 2 };
    const result = gradeReview(review, vars({ expectedVerdict: "pass", minScore: 4 }));
    assert.equal(result.score, 4 / 7);
    assert.match(result.reason, /verdict fail, expected pass/);
    assert.match(result.reason, /testRiskCoverage 2, expected >= 4/);
    assert.match(result.reason, /documentation 3, expected >= 4/);
  });

  it("accepts the output as a JSON string", () => {
    const result = gradeReview(JSON.stringify(REVIEW), vars({ expectedVerdict: "pass", minScore: 4 }));
    assert.equal(result.pass, true);
  });

  it("fails an output outside the schema", () => {
    const { summary: _summary, ...withoutSummary } = REVIEW;
    for (const output of [withoutSummary, { ...REVIEW, verdict: "maybe" }, "not json", null]) {
      const result = gradeReview(output, vars({ expectedVerdict: "pass" }));
      assert.equal(result.pass, false);
      assert.equal(result.score, 0);
      assert.match(result.reason, /REVIEW_SCHEMA|not JSON/);
    }
  });

  it("fails on a maxScores key that is not a criterion", () => {
    const result = gradeReview(failing, vars({ expectedVerdict: "fail", maxScores: { security: 3 } }));
    assert.equal(result.pass, false);
    assert.match(result.reason, /maxScores\.security is not a criterion of REVIEW_SCHEMA/);
  });

  it("fails without expectedVerdict", () => {
    const result = gradeReview(REVIEW, vars({ minScore: 4 }));
    assert.equal(result.pass, false);
    assert.match(result.reason, /expectedVerdict/);
  });

  it("fails on a non-numeric threshold", () => {
    const result = gradeReview(REVIEW, vars({ expectedVerdict: "pass", minScore: "4" }));
    assert.equal(result.pass, false);
    assert.match(result.reason, /minScore must be a number/);
  });
});

describe("eval provider helpers", () => {
  it("accepts only a model with the :free suffix", () => {
    assert.equal(assertFreeModel(FREE_MODEL), FREE_MODEL);
    for (const model of [undefined, "", "  ", "anthropic/claude-sonnet-5.5", "vendor/free"]) {
      assert.throws(() => assertFreeModel(model), /must end with ":free"/);
    }
  });

  it("reads EVAL_MAX_CALLS with a default of 10", () => {
    assert.equal(DEFAULT_EVAL_MAX_CALLS, 10);
    assert.equal(readEvalMaxCalls({}), 10);
    assert.equal(readEvalMaxCalls({ EVAL_MAX_CALLS: "3" }), 3);
    for (const raw of ["0", "-1", "1.5", "abc"]) {
      assert.throws(() => readEvalMaxCalls({ EVAL_MAX_CALLS: raw }), /EVAL_MAX_CALLS/);
    }
  });

  it("reserves slots up to the limit", () => {
    const counter = createCallCounter();
    assert.equal(counter.reserve(2), true);
    assert.equal(counter.reserve(2), true);
    assert.equal(counter.reserve(2), false);
    assert.equal(counter.used, 2);
  });
});

describe("eval provider", () => {
  beforeEach(() => resetEvalStateForTests());

  it("rejects an unknown config.provider", () => {
    assert.throws(() => new ReviewerProvider({ config: { provider: "cloud" } }), /config\.provider/);
  });

  for (const model of ["anthropic/claude-sonnet-5.5", ""]) {
    it(`refuses openrouter with REVIEW_MODEL "${model}" without calling the model`, async () => {
      const mock = mockModel();
      const response = await provider("openrouter", mock, { REVIEW_MODEL: model }).callApi(DIFF);
      assert.match(response.error ?? "", /must end with ":free"/);
      assert.equal(response.output, undefined);
      assert.equal(mock.doGenerateCalls.length, 0);
      assert.equal(openrouterCallsUsed(), 0);
    });
  }

  it("refuses openrouter calls over EVAL_MAX_CALLS, counted across instances", async () => {
    const mock = mockModel();
    const env = { EVAL_MAX_CALLS: "2" };
    assert.equal((await provider("openrouter", mock, env).callApi(DIFF)).error, undefined);
    assert.equal((await provider("openrouter", mock, env).callApi(DIFF)).error, undefined);
    const third = await provider("openrouter", mock, env).callApi(DIFF);
    assert.match(third.error ?? "", /EVAL_MAX_CALLS reached: 2/);
    assert.equal(mock.doGenerateCalls.length, 2);
  });

  it("refuses openrouter on an invalid EVAL_MAX_CALLS", async () => {
    const mock = mockModel();
    const response = await provider("openrouter", mock, { EVAL_MAX_CALLS: "ten" }).callApi(DIFF);
    assert.match(response.error ?? "", /EVAL_MAX_CALLS must be a positive integer/);
    assert.equal(mock.doGenerateCalls.length, 0);
  });

  it("stops the run after the first reported cost above 0", async () => {
    const paid = mockModel(JSON.stringify(REVIEW), 0.0021);
    const first = await provider("openrouter", paid).callApi(DIFF);
    assert.match(first.error ?? "", /reported a cost of \$0\.0021/);
    assert.equal(first.output, undefined);
    assert.deepEqual(first.metadata?.review, REVIEW);
    assert.equal(first.metadata?.metrics.cost, 0.0021);

    const next = mockModel();
    const second = await provider("openrouter", next).callApi(DIFF);
    assert.match(second.error ?? "", /reported a cost/);
    assert.equal(next.doGenerateCalls.length, 0);
  });

  it("keeps a reported cost of 0 and goes on", async () => {
    const response = await provider("openrouter", mockModel(JSON.stringify(REVIEW), 0)).callApi(DIFF);
    assert.equal(response.error, undefined);
    assert.equal(response.cost, 0);
  });

  it("applies neither the :free check nor the call cap to local", async () => {
    const mock = mockModel();
    const env = { REVIEW_MODEL: "", EVAL_MAX_CALLS: "1" };
    for (let i = 0; i < 3; i++) {
      assert.equal((await provider("local", mock, env).callApi(DIFF)).error, undefined);
    }
    assert.equal(mock.doGenerateCalls.length, 3);
    assert.equal(openrouterCallsUsed(), 0);
  });

  it("maps a review to output, tokenUsage and metadata.metrics", async () => {
    const response = await provider("local", mockModel()).callApi(DIFF);
    assert.equal(response.error, undefined);
    assert.deepEqual(response.output, REVIEW);
    assert.deepEqual(response.tokenUsage, { prompt: 120, completion: 30, total: 150 });
    assert.equal(response.metadata?.metrics.provider, "local");
    assert.equal(response.metadata?.metrics.steps, 1);
  });

  it("omits cost when the provider reports none", async () => {
    const response = await provider("local", mockModel()).callApi(DIFF);
    assert.equal(response.metadata?.metrics.cost, null);
    assert.equal("cost" in response, false);
  });

  it("turns a ReviewError into an error with the metrics", async () => {
    const response = await provider("local", mockModel(JSON.stringify({ verdict: "maybe" }))).callApi(DIFF);
    assert.match(response.error ?? "", /^AI_NoObjectGeneratedError: /);
    assert.equal(response.metadata?.metrics.input_tokens, 120);
  });

  it("returns any other failure as an error instead of throwing", async () => {
    const mock = mockModel();
    const tiny = provider("local", mock, { REVIEW_MAX_DIFF_BYTES: "1" });
    const response = await tiny.callApi(DIFF);
    assert.match(response.error ?? "", /REVIEW_MAX_DIFF_BYTES/);
    assert.equal(mock.doGenerateCalls.length, 0);
  });

  it("creates the reviewer lazily and reports a missing API key as an error", async () => {
    const options = { label: "openrouter", config: { provider: "openrouter" } };
    const unconfigured = new ReviewerProvider(options, { env: { REVIEW_MODEL: FREE_MODEL } });
    const response = await unconfigured.callApi(DIFF);
    assert.match(response.error ?? "", /OPENROUTER_API_KEY/);
    assert.equal(openrouterCallsUsed(), 0);
  });

  it("reviews vars.diff rather than the rendered prompt", async () => {
    const mock = mockModel();
    await provider("local", mock).callApi("rendered prompt", vars({ diff: DIFF }));
    assert.deepEqual(userPrompt(mock), [{ type: "text", text: buildReviewPrompt(DIFF) }]);
  });

  it("falls back to the prompt when vars.diff is missing", async () => {
    const mock = mockModel();
    await provider("local", mock).callApi(DIFF, vars({}));
    assert.deepEqual(userPrompt(mock), [{ type: "text", text: buildReviewPrompt(DIFF) }]);
  });
});
