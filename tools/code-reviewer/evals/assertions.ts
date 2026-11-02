// The one deterministic assertion of every eval case. The verdict is necessary; the score
// thresholds make sure a right verdict was not reached by accident. Expectations are data in the
// case's vars, so the YAML names schema fields and a renamed field must fail loudly here.
import type { AssertionValueFunctionContext, GradingResult } from "promptfoo";
import { REVIEW_SCHEMA, type Review } from "../src/review-schema.js";

type Criterion = Exclude<keyof Review, "verdict" | "summary">;

// The six scored criteria, read from the schema so a new criterion is checked by minScore at once.
export const CRITERIA = Object.keys(REVIEW_SCHEMA.shape).filter(
  (key) => key !== "verdict" && key !== "summary"
) as Criterion[];

const VERDICTS = REVIEW_SCHEMA.shape.verdict.options;

// The 1-10 scale of every criterion. REVIEW_SCHEMA carries it only in the field descriptions
// (plain z.number(), see src/review-schema.ts), so it cannot be read from the shape; change both
// together. A threshold outside it would always pass (maxScores) or always fail (minScore).
const SCORE_RANGE = { min: 1, max: 10 } as const;

function isScore(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= SCORE_RANGE.min && (value as number) <= SCORE_RANGE.max;
}

const SCORE_RANGE_TEXT = `an integer ${SCORE_RANGE.min}-${SCORE_RANGE.max}`;

interface Expectations {
  verdict: Review["verdict"];
  maxScores: [Criterion, number][];
  minScore: number | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(reason: string): GradingResult {
  return { pass: false, score: 0, reason };
}

// Returns the expectations, or every problem with the vars at once. A problem here means the YAML
// and the schema drifted apart, so it fails the case instead of skipping the check.
function readExpectations(vars: Record<string, unknown>): Expectations | string[] {
  const problems: string[] = [];

  const verdict = vars.expectedVerdict;
  if (!(VERDICTS as readonly unknown[]).includes(verdict)) {
    problems.push(`vars.expectedVerdict must be one of ${VERDICTS.join("|")}, got ${JSON.stringify(verdict)}`);
  }

  const maxScores: [Criterion, number][] = [];
  if (vars.maxScores !== undefined) {
    if (!isRecord(vars.maxScores)) {
      problems.push(`vars.maxScores must be a map of criterion to maximum, got ${JSON.stringify(vars.maxScores)}`);
    } else {
      for (const [key, max] of Object.entries(vars.maxScores)) {
        if (!(CRITERIA as string[]).includes(key)) {
          problems.push(`vars.maxScores.${key} is not a criterion of REVIEW_SCHEMA (${CRITERIA.join(", ")})`);
        } else if (!isScore(max)) {
          problems.push(`vars.maxScores.${key} must be ${SCORE_RANGE_TEXT}, got ${JSON.stringify(max)}`);
        } else {
          maxScores.push([key as Criterion, max]);
        }
      }
    }
  }

  const minScore = vars.minScore;
  if (minScore !== undefined && !isScore(minScore)) {
    problems.push(`vars.minScore must be ${SCORE_RANGE_TEXT}, got ${JSON.stringify(minScore)}`);
  }

  if (problems.length) return problems;
  return { verdict: verdict as Review["verdict"], maxScores, minScore: minScore as number | undefined };
}

function parseReview(output: unknown): Review | string {
  let value = output;
  if (typeof output === "string") {
    try {
      value = JSON.parse(output);
    } catch {
      return `output is not JSON: ${output.slice(0, 200)}`;
    }
  }
  const parsed = REVIEW_SCHEMA.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
    return `output does not match REVIEW_SCHEMA: ${issues.join("; ")}`;
  }
  return parsed.data;
}

export function gradeReview(output: unknown, context: Pick<AssertionValueFunctionContext, "vars">): GradingResult {
  const expectations = readExpectations(context.vars);
  if (Array.isArray(expectations)) return fail(`invalid test vars: ${expectations.join("; ")}`);

  const review = parseReview(output);
  if (typeof review === "string") return fail(review);

  const checks: { met: boolean; text: string }[] = [
    {
      met: review.verdict === expectations.verdict,
      text: `verdict ${review.verdict}, expected ${expectations.verdict}`,
    },
  ];
  for (const [criterion, max] of expectations.maxScores) {
    checks.push({ met: review[criterion] <= max, text: `${criterion} ${review[criterion]}, expected <= ${max}` });
  }
  if (expectations.minScore !== undefined) {
    for (const criterion of CRITERIA) {
      const min = expectations.minScore;
      checks.push({ met: review[criterion] >= min, text: `${criterion} ${review[criterion]}, expected >= ${min}` });
    }
  }

  const unmet = checks.filter((check) => !check.met);
  const score = (checks.length - unmet.length) / checks.length;
  if (unmet.length) return { pass: false, score, reason: unmet.map((check) => check.text).join("; ") };
  return { pass: true, score, reason: `all ${checks.length} conditions met: verdict ${review.verdict}` };
}
