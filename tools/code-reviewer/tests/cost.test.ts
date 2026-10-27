import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { StepResult, ToolSet } from "ai";
import {
  costExceeds,
  DEFAULT_MAX_COST_USD,
  DEFAULT_MAX_DIFF_BYTES,
  readMaxCost,
  readMaxDiffBytes,
  stepCost,
  totalCost,
} from "../src/cost.js";

const withCost = (cost: number) => ({ providerMetadata: { openrouter: { usage: { cost } } } });
const withoutCost = { providerMetadata: undefined };

// costExceeds only reads providerMetadata; the rest of StepResult is irrelevant here.
function exceeds(maxCostUsd: number, steps: object[]): boolean {
  return costExceeds(maxCostUsd)({ steps: steps as StepResult<ToolSet>[] }) as boolean;
}

describe("stepCost", () => {
  it("returns null when the provider reports no metadata", () => {
    assert.equal(stepCost(withoutCost), null);
  });

  it("returns 0, not null, for a reported zero cost", () => {
    assert.equal(stepCost(withCost(0)), 0);
  });
});

describe("totalCost", () => {
  it("returns null for no steps", () => {
    assert.equal(totalCost([]), null);
  });

  it("sums only the steps that report a cost", () => {
    assert.equal(totalCost([withCost(0.25), withoutCost, withCost(0.5)]), 0.75);
  });

  it("returns null when no step reports a cost", () => {
    assert.equal(totalCost([withoutCost, withoutCost]), null);
  });
});

describe("costExceeds", () => {
  it("never trips when the cost is unknown", () => {
    assert.equal(exceeds(0.1, [withoutCost]), false);
  });

  it("does not trip at exactly the limit", () => {
    assert.equal(exceeds(0.1, [withCost(0.1)]), false);
  });

  it("trips above the limit", () => {
    assert.equal(exceeds(0.1, [withCost(0.05), withCost(0.06)]), true);
  });
});

describe("readMaxCost", () => {
  it("defaults to 0.1 when the variable is missing", () => {
    assert.equal(readMaxCost({}), 0.1);
    assert.equal(DEFAULT_MAX_COST_USD, 0.1);
  });

  it("parses a positive number", () => {
    assert.equal(readMaxCost({ REVIEW_MAX_COST_USD: "0.5" }), 0.5);
  });

  for (const raw of ["0", "-1", "abc"]) {
    it(`rejects "${raw}"`, () => {
      assert.throws(() => readMaxCost({ REVIEW_MAX_COST_USD: raw }), /REVIEW_MAX_COST_USD/);
    });
  }
});

describe("readMaxDiffBytes", () => {
  it("defaults to 100000 when the variable is missing", () => {
    assert.equal(readMaxDiffBytes({}), 100_000);
    assert.equal(DEFAULT_MAX_DIFF_BYTES, 100_000);
  });

  it("parses a positive integer", () => {
    assert.equal(readMaxDiffBytes({ REVIEW_MAX_DIFF_BYTES: "2048" }), 2048);
  });

  for (const raw of ["0", "-1", "1.5", "abc"]) {
    it(`rejects "${raw}"`, () => {
      assert.throws(() => readMaxDiffBytes({ REVIEW_MAX_DIFF_BYTES: raw }), /REVIEW_MAX_DIFF_BYTES/);
    });
  }
});
