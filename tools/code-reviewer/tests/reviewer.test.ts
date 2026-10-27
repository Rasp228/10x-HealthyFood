import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import { MockLanguageModelV4 } from "ai/test";
import { createReviewer, review, type ReviewResult } from "../src/agent/reviewer.js";
import { buildReviewPrompt, renderSchemaFields, SYSTEM_PROMPT } from "../src/prompts/index.js";
import type { ProviderName } from "../src/provider.js";
import { REVIEW_SCHEMA, type Review } from "../src/review-schema.js";

const PACKAGE_DIR = path.resolve(import.meta.dirname, "..");
const REVIEWER_URL = pathToFileURL(path.join(PACKAGE_DIR, "src", "agent", "reviewer.ts")).href;

const DIFF = "diff --git a/x.ts b/x.ts\n+const answer = 42;";
const METRIC_KEYS = [
  "provider",
  "model",
  "steps",
  "input_tokens",
  "output_tokens",
  "total_tokens",
  "cost",
  "budget",
  "duration_ms",
];

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

// One step answering with the review JSON; no providerMetadata, as from llama.cpp.
function mockModel() {
  return new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: "text", text: JSON.stringify(REVIEW) }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 120, noCache: 120, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 30, text: 30, reasoning: undefined },
      },
      warnings: [],
    },
  });
}

function reviewerOptions(provider: ProviderName, model = mockModel()) {
  return { reviewModel: { provider, modelId: "mock", model }, maxCostUsd: 0.1 };
}

function systemPrompt(model: MockLanguageModelV4): string {
  assert.equal(model.doGenerateCalls.length, 1);
  const system = model.doGenerateCalls[0]!.prompt.filter((message) => message.role === "system");
  assert.equal(system.length, 1);
  return system[0]!.content as string;
}

function assertResultShape(result: ReviewResult): void {
  assert.deepEqual(REVIEW_SCHEMA.parse(result.review), REVIEW);
  assert.deepEqual(Object.keys(result.metrics), METRIC_KEYS);
  const { duration_ms, ...metrics } = result.metrics;
  assert.deepEqual(metrics, {
    provider: "local",
    model: "mock",
    steps: 1,
    input_tokens: 120,
    output_tokens: 30,
    total_tokens: 150,
    cost: null,
    budget: 0.1,
  });
  assert.ok(Number.isInteger(duration_ms) && duration_ms >= 0);
}

describe("reviewer module", () => {
  it("imports without side effects", () => {
    // Without REVIEW_* the module must neither throw nor load .env (which may set REVIEW_MODEL).
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) => !key.startsWith("REVIEW_") && key !== "OPENROUTER_API_KEY" && key !== "NODE_TEST_CONTEXT"
      )
    );
    const script = [
      `const mod = await import(${JSON.stringify(REVIEWER_URL)});`,
      `if (typeof mod.createReviewer !== "function") process.exit(2);`,
      `if (process.env.REVIEW_MODEL !== undefined) process.exit(3);`,
    ].join("\n");
    const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
      cwd: PACKAGE_DIR,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });

    assert.equal(child.error, undefined);
    assert.equal(child.stdout, "");
    assert.equal(child.stderr, "");
    assert.equal(child.status, 0);
  });
});

describe("createReviewer", () => {
  it("returns the review and metrics in the contract", async () => {
    const result = await createReviewer(reviewerOptions("local")).review(DIFF);
    assertResultShape(result);
  });

  it("sends the diff as the prompt", async () => {
    const model = mockModel();
    await createReviewer(reviewerOptions("local", model)).review(DIFF);
    const user = model.doGenerateCalls[0]!.prompt.find((message) => message.role === "user");
    assert.deepEqual(user?.content, [{ type: "text", text: buildReviewPrompt(DIFF) }]);
  });

  it("gives the local model the schema rubrics", async () => {
    const model = mockModel();
    await createReviewer(reviewerOptions("local", model)).review(DIFF);
    assert.equal(systemPrompt(model), `${SYSTEM_PROMPT}\n\n${renderSchemaFields()}`);
  });

  it("gives openrouter the system prompt without rubrics", async () => {
    const model = mockModel();
    await createReviewer(reviewerOptions("openrouter", model)).review(DIFF);
    assert.equal(systemPrompt(model), SYSTEM_PROMPT);
  });
});

describe("review", () => {
  it("returns the same shape as the reviewer method", async () => {
    const result = await review(DIFF, reviewerOptions("local"));
    assertResultShape(result);
  });
});
