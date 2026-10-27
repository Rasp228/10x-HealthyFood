// Entry point: git diff on stdin -> structured JSON review on stdout.
// Everything diagnostic (usage, cost, budget) goes to stderr so stdout stays pure JSON
// for the CI gate and the evals.
//
//   git diff | npm run review
//   REVIEW_SAMPLE=1 npm run review < /dev/null   # reviews data/sample.diff
//
// Empty stdin without REVIEW_SAMPLE=1 is an error, so a CI job with a wrong diff range
// fails instead of reviewing the sample.
//
// Exit codes: 0 review printed, 1 failure (config, oversized diff, model error),
// 2 review printed but the run ended over REVIEW_MAX_COST_USD.
import { readFile } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { createReviewer, ReviewError } from "./agent/reviewer.js";

const PACKAGE_DIR = path.resolve(import.meta.dirname, "..");
const SAMPLE_DIFF_PATH = path.join(PACKAGE_DIR, "data", "sample.diff");

// quiet: dotenv 17 otherwise prints an "injecting env" banner to stdout.
dotenv.config({ path: path.join(PACKAGE_DIR, ".env"), quiet: true });

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function readDiff(): Promise<string> {
  const stdinDiff = await readStdin();
  if (stdinDiff.trim()) return stdinDiff;
  const samplePath = path.relative(process.cwd(), SAMPLE_DIFF_PATH);
  if (process.env.REVIEW_SAMPLE !== "1") {
    throw new Error(`stdin is empty, nothing to review (set REVIEW_SAMPLE=1 to review ${samplePath})`);
  }
  console.error(`[review] stdin is empty, using ${samplePath}`);
  return readFile(SAMPLE_DIFF_PATH, "utf8");
}

async function main(): Promise<void> {
  // Built before reading stdin, so a misconfigured run fails fast, as before the refactor.
  const reviewer = createReviewer();
  const diff = await readDiff();
  const { review: result, metrics } = await reviewer.review(diff);

  console.error(`[review] ${JSON.stringify(metrics)}`);
  if (metrics.cost !== null && metrics.cost > metrics.budget) {
    console.error(`[review] budget exceeded: $${metrics.cost.toFixed(6)} > $${metrics.budget.toFixed(2)}`);
    process.exitCode = 2;
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error: unknown) => {
  // A failed model call was still billed: log its usage line before the failure.
  if (error instanceof ReviewError) console.error(`[review] ${JSON.stringify(error.metrics)}`);
  console.error("[review] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
