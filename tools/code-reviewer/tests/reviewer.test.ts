import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import { MockLanguageModelV4 } from "ai/test";
import {
  createReviewer,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_TIMEOUT_MS,
  readMaxOutputTokens,
  readTimeoutMs,
  reviewDiff,
  ReviewError,
  type ReviewResult,
} from "../src/agent/reviewer.js";
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
function mockModel(text = JSON.stringify(REVIEW)) {
  return new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: "text", text }],
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
    // Without REVIEW_* the module must neither throw nor print. NODE_OPTIONS is dropped so an
    // inherited flag cannot print a warning to stderr.
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) =>
          !key.startsWith("REVIEW_") && !["OPENROUTER_API_KEY", "NODE_TEST_CONTEXT", "NODE_OPTIONS"].includes(key)
      )
    );
    const script = [
      `const mod = await import(${JSON.stringify(REVIEWER_URL)});`,
      `if (typeof mod.createReviewer !== "function") process.exit(2);`,
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

  it("leaves dotenv to the CLI entry", () => {
    // A runtime check would only catch a leak when the developer's .env sets a REVIEW_* value,
    // so this reads the sources: only src/index.ts may import dotenv.
    const srcDir = path.join(PACKAGE_DIR, "src");
    const modules = readdirSync(srcDir, { recursive: true, encoding: "utf8" }).filter(
      (file) => file.endsWith(".ts") && file !== "index.ts"
    );
    assert.ok(modules.length > 0);
    for (const file of modules) {
      const source = readFileSync(path.join(srcDir, file), "utf8");
      assert.doesNotMatch(source, /["']dotenv(\/[^"']*)?["']/, `${file} imports dotenv`);
    }
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

  for (const provider of ["local", "openrouter"] as const) {
    it(`caps the output tokens of the call for ${provider}`, async () => {
      const model = mockModel();
      await createReviewer({ ...reviewerOptions(provider, model), env: {} }).review(DIFF);
      assert.equal(model.doGenerateCalls[0]!.maxOutputTokens, DEFAULT_MAX_OUTPUT_TOKENS[provider]);
    });
  }

  it("rejects a diff over the size cap before calling the model", async () => {
    const model = mockModel();
    const options = { ...reviewerOptions("local", model), maxDiffBytes: Buffer.byteLength(DIFF) - 1 };
    await assert.rejects(createReviewer(options).review(DIFF), /REVIEW_MAX_DIFF_BYTES/);
    assert.equal(model.doGenerateCalls.length, 0);
  });

  it("keeps the metrics of a billed call whose output fails the schema", async () => {
    const model = mockModel(JSON.stringify({ verdict: "maybe" }));
    const error = await createReviewer(reviewerOptions("local", model))
      .review(DIFF)
      .then(
        () => assert.fail("expected the review to reject"),
        (rejection: unknown) => rejection
      );
    assert.ok(error instanceof ReviewError);
    assert.match(error.message, /^AI_NoObjectGeneratedError: /);
    assert.deepEqual(Object.keys(error.metrics), METRIC_KEYS);
    assert.equal(error.metrics.steps, 1);
    assert.equal(error.metrics.input_tokens, 120);
    assert.equal(error.metrics.output_tokens, 30);
  });

  it("accepts a diff exactly at the size cap", async () => {
    const options = { ...reviewerOptions("local"), maxDiffBytes: Buffer.byteLength(DIFF) };
    assertResultShape(await createReviewer(options).review(DIFF));
  });
});

describe("readTimeoutMs", () => {
  it("defaults per provider", () => {
    assert.equal(readTimeoutMs({}, "local"), DEFAULT_TIMEOUT_MS.local);
    assert.equal(readTimeoutMs({}, "openrouter"), DEFAULT_TIMEOUT_MS.openrouter);
    assert.ok(DEFAULT_TIMEOUT_MS.local > DEFAULT_TIMEOUT_MS.openrouter);
  });

  it("lets REVIEW_TIMEOUT_MS override both", () => {
    assert.equal(readTimeoutMs({ REVIEW_TIMEOUT_MS: "5000" }, "local"), 5000);
    assert.equal(readTimeoutMs({ REVIEW_TIMEOUT_MS: "5000" }, "openrouter"), 5000);
  });

  for (const raw of ["0", "-1", "1.5", "abc"]) {
    it(`rejects "${raw}"`, () => {
      assert.throws(() => readTimeoutMs({ REVIEW_TIMEOUT_MS: raw }, "local"), /REVIEW_TIMEOUT_MS/);
    });
  }
});

describe("readMaxOutputTokens", () => {
  it("defaults per provider: 32768 local, 8192 openrouter", () => {
    assert.equal(readMaxOutputTokens({}, "local"), 32_768);
    assert.equal(readMaxOutputTokens({}, "openrouter"), 8_192);
  });

  it("lets REVIEW_MAX_OUTPUT_TOKENS override both", () => {
    assert.equal(readMaxOutputTokens({ REVIEW_MAX_OUTPUT_TOKENS: "4096" }, "local"), 4096);
    assert.equal(readMaxOutputTokens({ REVIEW_MAX_OUTPUT_TOKENS: "4096" }, "openrouter"), 4096);
  });

  for (const raw of ["0", "-1", "1.5", "abc"]) {
    it(`rejects "${raw}"`, () => {
      assert.throws(() => readMaxOutputTokens({ REVIEW_MAX_OUTPUT_TOKENS: raw }, "local"), /REVIEW_MAX_OUTPUT_TOKENS/);
    });
  }
});

describe("reviewDiff", () => {
  it("returns the same shape as the reviewer method", async () => {
    const result = await reviewDiff(DIFF, reviewerOptions("local"));
    assertResultShape(result);
  });
});
