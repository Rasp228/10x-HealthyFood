// Prints the sticky PR comment for the CI action's outcome to stdout.
//
//   AI_CR_OUTCOME=review AI_CR_REVIEW_FILE=review.json AI_CR_STDERR_FILE=review.stderr \
//     AI_CR_EXIT_CODE=0 npm run --silent comment > comment.md
//
// Env, all set by .github/actions/ai-reviewer:
//   AI_CR_OUTCOME      review | error | empty-diff | missing-model | daily-cap
//   AI_CR_REVIEW_FILE  stdout of `npm run review` (the review JSON)
//   AI_CR_STDERR_FILE  stderr of `npm run review` (the "[review] {...}" metrics, "[review] failed: ...")
//   AI_CR_EXIT_CODE    exit code of `npm run review`
//   AI_CR_RUN_URL      link to the workflow run
//   AI_CR_DAILY_CAP    daily run limit, shown for daily-cap
//   AI_CR_EXCLUDED     comma-separated pathspecs left out of the diff
//
// A missing file reads as empty, so the comment is still printed when the review step never ran.
// Exits 1 only when it cannot print a comment at all.
import { readFile } from "node:fs/promises";
import { buildOutcome, parseExcluded, parseExitCode } from "./outcome.js";
import { renderComment } from "./render.js";

async function readOptional(file: string | undefined): Promise<string | null> {
  if (!file) return null;
  try {
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const env = process.env;
  const outcome = buildOutcome({
    outcome: env.AI_CR_OUTCOME ?? "",
    reviewStdout: await readOptional(env.AI_CR_REVIEW_FILE),
    stderr: await readOptional(env.AI_CR_STDERR_FILE),
    exitCode: parseExitCode(env.AI_CR_EXIT_CODE),
    dailyCap: env.AI_CR_DAILY_CAP,
    runUrl: env.AI_CR_RUN_URL,
    excluded: parseExcluded(env.AI_CR_EXCLUDED),
  });
  process.stdout.write(renderComment(outcome));
}

main().catch((error: unknown) => {
  console.error("[comment] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
