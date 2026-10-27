import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildInstructions, buildReviewPrompt, renderSchemaFields, SYSTEM_PROMPT } from "../src/prompts/index.js";
import { REVIEW_JSON_SCHEMA } from "../src/review-schema.js";

describe("buildInstructions", () => {
  it("gives openrouter the bare system prompt, without rubrics", () => {
    assert.equal(buildInstructions("openrouter"), SYSTEM_PROMPT);
  });

  it("appends the schema rubrics for the local provider", () => {
    const instructions = buildInstructions("local");
    assert.ok(instructions.startsWith(SYSTEM_PROMPT));
    assert.ok(instructions.includes(renderSchemaFields()));
  });
});

describe("renderSchemaFields", () => {
  it("renders a line for every schema property", () => {
    const rendered = renderSchemaFields();
    const keys = Object.keys(REVIEW_JSON_SCHEMA.properties ?? {});
    assert.ok(keys.length > 0);
    for (const key of keys) {
      assert.match(rendered, new RegExp(`^- ${key} \\(`, "m"), `missing line for ${key}`);
    }
  });

  it("renders the verdict enum", () => {
    assert.ok(renderSchemaFields().includes('"pass" | "fail"'));
  });
});

describe("buildReviewPrompt", () => {
  it("carries the diff", () => {
    const diff = "diff --git a/x.ts b/x.ts\n+const answer = 42;";
    assert.ok(buildReviewPrompt(diff).includes(diff));
  });
});
