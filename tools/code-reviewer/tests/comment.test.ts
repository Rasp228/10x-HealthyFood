import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ReviewMetrics } from "../src/agent/reviewer.js";
import {
  buildOutcome,
  parseExcluded,
  parseExitCode,
  parseFailureMessage,
  parseMetricsLine,
  type CommentInputs,
} from "../src/comment/outcome.js";
import { CRITERIA, renderComment, STICKY_MARKER, type CommentOutcome } from "../src/comment/render.js";
import { REVIEW_SCHEMA, type Review } from "../src/review-schema.js";

const REVIEW: Review = {
  implementationCorrectness: 8,
  idiomaticity: 7,
  complexity: 9,
  testRiskCoverage: 5,
  documentation: 6,
  securitySafety: 10,
  verdict: "pass",
  summary: "Mała, **poprawna** zmiana.\n\n- brakuje testu na `null`",
};

const METRICS: ReviewMetrics = {
  provider: "openrouter",
  model: "anthropic/claude-sonnet-5.5",
  steps: 1,
  input_tokens: 1200,
  output_tokens: 300,
  total_tokens: 1500,
  cost: 0.0123,
  budget: 0.1,
  duration_ms: 4321,
};

const METRICS_LINE = `[review] ${JSON.stringify(METRICS)}`;

const OUTCOMES: CommentOutcome[] = [
  { kind: "review", review: REVIEW, metrics: METRICS, budgetExceeded: false },
  { kind: "error", message: "boom", metrics: METRICS },
  { kind: "error", message: "boom", metrics: null },
  { kind: "empty-diff" },
  { kind: "missing-model" },
  { kind: "daily-cap", limit: 5 },
];

describe("renderComment", () => {
  for (const outcome of OUTCOMES) {
    it(`starts the ${outcome.kind} comment with the sticky marker`, () => {
      assert.equal(renderComment(outcome).split("\n")[0], STICKY_MARKER);
    });
  }

  it("uses the marker the action searches for", () => {
    assert.equal(STICKY_MARKER, "<!-- ai-cr:sticky -->");
  });

  it("names the six criteria in Polish, in schema field order", () => {
    const scoreKeys = Object.keys(REVIEW_SCHEMA.shape).filter((key) => !["verdict", "summary"].includes(key));
    assert.deepEqual(
      CRITERIA.map(({ key }) => key),
      scoreKeys
    );
    assert.deepEqual(
      CRITERIA.map(({ label }) => label),
      [
        "Poprawność implementacji",
        "Idiomatyczność",
        "Złożoność",
        "Pokrycie testami proporcjonalne do ryzyka",
        "Dokumentacja",
        "Bezpieczeństwo",
      ]
    );
  });

  it("renders a review: six score rows, verdict, summary and metrics", () => {
    const comment = renderComment({ kind: "review", review: REVIEW, metrics: METRICS, budgetExceeded: false });
    const rows = comment.split("\n").filter((line) => /^\| .+ \| \d+\/10 \|$/.test(line));
    assert.equal(rows.length, 6);
    assert.ok(rows[0]!.includes("Poprawność implementacji") && rows[0]!.includes("8/10"));
    assert.ok(comment.includes("✅ pass"));
    assert.ok(comment.includes(REVIEW.summary));
    assert.ok(comment.includes("`anthropic/claude-sonnet-5.5`"));
    assert.ok(comment.includes("1200 wej. / 300 wyj."));
    assert.ok(comment.includes("$0.012300 / budżet $0.10"));
    assert.ok(!comment.includes("przekroczył budżet"));
  });

  it("renders a failing verdict", () => {
    const comment = renderComment({
      kind: "review",
      review: { ...REVIEW, verdict: "fail" },
      metrics: METRICS,
      budgetExceeded: false,
    });
    assert.ok(comment.includes("❌ fail"));
  });

  it("adds a note when the run went over budget", () => {
    const comment = renderComment({ kind: "review", review: REVIEW, metrics: METRICS, budgetExceeded: true });
    assert.ok(comment.includes("przekroczył budżet"));
  });

  it("renders an unknown cost and missing metrics", () => {
    const free = renderComment({
      kind: "review",
      review: REVIEW,
      metrics: { ...METRICS, provider: "local", cost: null, input_tokens: null },
      budgetExceeded: false,
    });
    assert.ok(free.includes("koszt: brak danych"));
    assert.ok(free.includes("? wej."));
    const none = renderComment({ kind: "review", review: REVIEW, metrics: null, budgetExceeded: false });
    assert.ok(none.includes("Metryki przebiegu niedostępne"));
  });

  it("renders an error with metrics", () => {
    const comment = renderComment({ kind: "error", message: "AI_APICallError: 401", metrics: METRICS });
    assert.ok(comment.includes("AI_APICallError: 401"));
    assert.ok(comment.includes("`anthropic/claude-sonnet-5.5`"));
  });

  it("renders an error without metrics", () => {
    const comment = renderComment({ kind: "error", message: "REVIEW_PROVIDER must be one of", metrics: null });
    assert.ok(comment.includes("REVIEW_PROVIDER must be one of"));
    assert.ok(comment.includes("Metryki przebiegu niedostępne"));
  });

  it("fences an error message longer than any backtick run inside it", () => {
    const comment = renderComment({ kind: "error", message: "a ``` b", metrics: null });
    assert.ok(comment.includes("````\na ``` b\n````"));
  });

  it("states the reason of the outcomes that skip the model", () => {
    assert.match(renderComment({ kind: "empty-diff" }), /diff jest pusty/);
    assert.match(renderComment({ kind: "missing-model" }), /`REVIEW_MODEL` nie jest ustawiona/);
    assert.match(renderComment({ kind: "daily-cap", limit: 5 }), /już 5 przebiegów review/);
  });

  it("lists the excluded paths and links the run", () => {
    const comment = renderComment({
      kind: "empty-diff",
      excluded: ["**/package-lock.json", "src/db/database.types.ts"],
      runUrl: "https://github.com/o/r/actions/runs/1",
    });
    assert.ok(comment.includes("`**/package-lock.json`, `src/db/database.types.ts`"));
    assert.ok(comment.includes("(https://github.com/o/r/actions/runs/1)"));
  });
});

describe("parseMetricsLine", () => {
  it("reads the last metrics line of stderr", () => {
    const older = `[review] ${JSON.stringify({ ...METRICS, steps: 9 })}`;
    const stderr = `${older}\n${METRICS_LINE}\n[review] budget exceeded: $0.2 > $0.10\n`;
    assert.deepEqual(parseMetricsLine(stderr), METRICS);
  });

  it("returns null without a metrics line or with a malformed one", () => {
    assert.equal(parseMetricsLine(null), null);
    assert.equal(parseMetricsLine("[review] failed: boom\n"), null);
    assert.equal(parseMetricsLine("[review] {not json\n"), null);
    assert.equal(parseMetricsLine(`[review] ${JSON.stringify({ model: "x" })}\n`), null);
  });

  it("reads CRLF line endings", () => {
    assert.deepEqual(parseMetricsLine(`${METRICS_LINE}\r\n`), METRICS);
  });
});

describe("parseFailureMessage", () => {
  it("reads the message after the failed: prefix, including further lines", () => {
    const stderr = `${METRICS_LINE}\n[review] failed: AI_NoObjectGeneratedError: bad\nsecond line\n`;
    assert.equal(parseFailureMessage(stderr), "AI_NoObjectGeneratedError: bad\nsecond line");
  });

  it("returns null without a failed line", () => {
    assert.equal(parseFailureMessage(METRICS_LINE), null);
    assert.equal(parseFailureMessage(null), null);
  });
});

describe("parseExcluded / parseExitCode", () => {
  it("splits comma-separated pathspecs", () => {
    assert.deepEqual(parseExcluded(" **/package-lock.json, src/db/database.types.ts ,"), [
      "**/package-lock.json",
      "src/db/database.types.ts",
    ]);
    assert.deepEqual(parseExcluded(undefined), []);
  });

  it("parses an integer exit code", () => {
    assert.equal(parseExitCode("2"), 2);
    assert.equal(parseExitCode(""), null);
    assert.equal(parseExitCode("x"), null);
  });
});

describe("buildOutcome", () => {
  const base: CommentInputs = {
    outcome: "review",
    reviewStdout: `${JSON.stringify(REVIEW, null, 2)}\n`,
    stderr: `${METRICS_LINE}\n`,
    exitCode: 0,
    runUrl: "https://example.test/run",
    excluded: ["**/package-lock.json"],
  };

  it("builds a review from stdout, metrics from stderr", () => {
    assert.deepEqual(buildOutcome(base), {
      kind: "review",
      review: REVIEW,
      metrics: METRICS,
      budgetExceeded: false,
      runUrl: "https://example.test/run",
      excluded: ["**/package-lock.json"],
    });
  });

  it("marks exit code 2 as over budget", () => {
    const outcome = buildOutcome({ ...base, exitCode: 2 });
    assert.equal(outcome.kind, "review");
    assert.equal(outcome.kind === "review" && outcome.budgetExceeded, true);
  });

  it("turns unparsable stdout with exit code 0 into an error", () => {
    const outcome = buildOutcome({ ...base, reviewStdout: "> code-reviewer@0.1.0 review\n{" });
    assert.equal(outcome.kind, "error");
    assert.equal(outcome.kind === "error" && outcome.metrics?.model, METRICS.model);
  });

  it("turns stdout outside the schema into an error", () => {
    const outcome = buildOutcome({ ...base, reviewStdout: JSON.stringify({ verdict: "maybe" }) });
    assert.equal(outcome.kind, "error");
  });

  it("reads the failure message for exit code 1", () => {
    const outcome = buildOutcome({
      ...base,
      outcome: "error",
      reviewStdout: "",
      stderr: `${METRICS_LINE}\n[review] failed: AI_APICallError: 401\n`,
      exitCode: 1,
    });
    assert.deepEqual(outcome, {
      kind: "error",
      message: "AI_APICallError: 401",
      metrics: METRICS,
      runUrl: "https://example.test/run",
      excluded: ["**/package-lock.json"],
    });
  });

  it("reports a failure without a message or exit code", () => {
    const outcome = buildOutcome({ ...base, reviewStdout: null, stderr: null, exitCode: null });
    assert.equal(outcome.kind, "error");
    assert.match(outcome.kind === "error" ? outcome.message : "", /exited with code unknown/);
  });

  it("passes the outcomes that skip the model through", () => {
    assert.equal(buildOutcome({ ...base, outcome: "empty-diff" }).kind, "empty-diff");
    assert.equal(buildOutcome({ ...base, outcome: "missing-model" }).kind, "missing-model");
    assert.deepEqual(buildOutcome({ ...base, outcome: "daily-cap", dailyCap: "5", excluded: [] }), {
      kind: "daily-cap",
      limit: 5,
      runUrl: "https://example.test/run",
      excluded: [],
    });
  });

  it("turns an invalid daily cap or an unknown outcome into an error", () => {
    assert.equal(buildOutcome({ ...base, outcome: "daily-cap", dailyCap: "" }).kind, "error");
    assert.equal(buildOutcome({ ...base, outcome: "bogus" }).kind, "error");
  });
});
