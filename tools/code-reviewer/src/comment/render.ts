// Markdown of the sticky PR comment, one variant per outcome of the CI action.
// Pure: no env, no fs, no output, so every variant is covered by unit tests; the CLI
// (comment/cli.ts) only gathers the inputs. Every variant starts with STICKY_MARKER, which the
// action searches for to update the one comment instead of adding a new one per run.
import type { ReviewMetrics } from "../agent/reviewer.js";
import { REVIEW_JSON_SCHEMA, type Review } from "../review-schema.js";

// Load-bearing: changing it makes the next run post a second comment instead of updating this one.
export const STICKY_MARKER = "<!-- ai-cr:sticky -->";

// Cap on a rendered error message; a provider error can carry a whole response body.
export const MAX_ERROR_MESSAGE_CHARS = 2000;

interface OutcomeCommon {
  runUrl?: string;
  // Pathspecs left out of the diff sent to the model (e.g. lockfiles, generated types).
  excluded?: string[];
}

export type CommentOutcome = OutcomeCommon &
  (
    | { kind: "review"; review: Review; metrics: ReviewMetrics | null; budgetExceeded: boolean }
    | { kind: "error"; message: string; metrics: ReviewMetrics | null }
    | { kind: "empty-diff" }
    | { kind: "missing-model" }
    | { kind: "daily-cap"; limit: number }
  );

type ScoreKey = {
  [K in keyof Review]: Review[K] extends number ? K : never;
}[keyof Review];

// The six criteria in schema field order, labelled with the Polish name that opens each field
// description ("Poprawność implementacji (skala 1-10). ..."), so review-schema.ts stays the one
// source of both the order and the names.
export const CRITERIA: { key: ScoreKey; label: string }[] = Object.entries(REVIEW_JSON_SCHEMA.properties ?? {})
  .filter(([, property]) => typeof property !== "boolean" && property.type === "number")
  .map(([key, property]) => {
    const description = typeof property === "boolean" ? "" : (property.description ?? "");
    const label = description.split(" (skala")[0]?.trim();
    return { key: key as ScoreKey, label: label || key };
  });

const HEADING = "## AI code review";

function formatTokens(count: number | null): string {
  return count === null ? "?" : String(count);
}

function renderMetrics(metrics: ReviewMetrics | null): string {
  if (!metrics) return "_Metryki przebiegu niedostępne._";
  const cost = metrics.cost === null ? "brak danych" : `$${metrics.cost.toFixed(6)}`;
  return [
    `Model: \`${metrics.model}\` (${metrics.provider})`,
    `tokeny: ${formatTokens(metrics.input_tokens)} wej. / ${formatTokens(metrics.output_tokens)} wyj.`,
    `koszt: ${cost} / budżet $${metrics.budget.toFixed(2)}`,
    `czas: ${(metrics.duration_ms / 1000).toFixed(1)} s`,
  ].join(" · ");
}

// Fenced so Markdown in an error message cannot restyle the comment; the fence is longer than
// any backtick run inside the message.
function renderCodeBlock(text: string): string {
  const longestRun = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return `${fence}\n${text}\n${fence}`;
}

function truncateMessage(message: string): string {
  const trimmed = message.trim() || "(brak komunikatu)";
  return trimmed.length > MAX_ERROR_MESSAGE_CHARS ? `${trimmed.slice(0, MAX_ERROR_MESSAGE_CHARS)}…` : trimmed;
}

function renderBody(outcome: CommentOutcome): string[] {
  switch (outcome.kind) {
    case "review": {
      const { review, metrics, budgetExceeded } = outcome;
      const verdict = review.verdict === "pass" ? "✅ pass" : "❌ fail";
      const rows = CRITERIA.map(({ key, label }) => `| ${label} | ${review[key]}/10 |`);
      const blocks = [
        `${HEADING}: ${verdict}`,
        ["| Kryterium | Ocena |", "| --- | ---: |", ...rows].join("\n"),
        review.summary,
      ];
      if (budgetExceeded) {
        blocks.push(
          "> [!WARNING]\n> Koszt przebiegu przekroczył budżet (`REVIEW_MAX_COST_USD`), więc bramka jest czerwona niezależnie od werdyktu."
        );
      }
      blocks.push(renderMetrics(metrics));
      return blocks;
    }
    case "error":
      return [
        `${HEADING}: ❌ błąd`,
        "Review nie zostało wykonane. Komunikat:",
        renderCodeBlock(truncateMessage(outcome.message)),
        renderMetrics(outcome.metrics),
      ];
    case "empty-diff":
      return [
        `${HEADING}: ⏭️ brak zmian do review`,
        "Po wykluczeniu plików generowanych diff jest pusty, więc model nie został wywołany.",
      ];
    case "missing-model":
      return [
        `${HEADING}: ❌ brak modelu`,
        "Zmienna repozytorium `REVIEW_MODEL` nie jest ustawiona (Settings → Secrets and variables → Actions → Variables), więc model nie został wywołany.",
      ];
    case "daily-cap":
      return [
        `${HEADING}: ❌ dzienny limit wyczerpany`,
        `Dzisiaj (doba UTC) wykonano już ${outcome.limit} przebiegów review, czyli dzienny limit. Model nie został wywołany; ponów review jutro etykietą \`ai-cr:review\`.`,
      ];
  }
}

function renderFooter({ excluded, runUrl }: OutcomeCommon): string[] {
  const footer: string[] = [];
  if (excluded?.length) {
    footer.push(`Wykluczone z diffa: ${excluded.map((pathspec) => `\`${pathspec}\``).join(", ")}`);
  }
  if (runUrl) footer.push(`[Szczegóły przebiegu](${runUrl})`);
  return footer;
}

export function renderComment(outcome: CommentOutcome): string {
  const blocks = [...renderBody(outcome), ...renderFooter(outcome)];
  return `${STICKY_MARKER}\n${blocks.join("\n\n")}\n`;
}
