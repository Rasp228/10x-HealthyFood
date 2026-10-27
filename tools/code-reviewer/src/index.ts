// Entry point: git diff on stdin -> structured JSON review on stdout.
// Everything diagnostic (usage, cost, budget) goes to stderr so stdout stays pure JSON
// for the CI gate and the evals.
//
//   git diff | npm run review
//   npm run review < /dev/null   # falls back to data/sample.diff
import { readFile } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { createReviewer } from "./agent/reviewer.js";

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
  console.error(`[review] stdin is empty, using ${path.relative(process.cwd(), SAMPLE_DIFF_PATH)}`);
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
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error: unknown) => {
  console.error("[review] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
