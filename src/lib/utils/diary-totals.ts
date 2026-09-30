import type { DiaryEntryDto } from "../../types";

export interface DaySummary {
  calorieTotal: number;
  missingCount: number;
  entryCount: number;
}

/**
 * Podsumowanie jednego dnia dziennika.
 *
 * Wpis bez `calories` nie wnosi zera - wnosi brak. Dlatego obok sumy wraca `missingCount`:
 * bez niego wyświetlona liczba udawałaby pełny bilans dnia (FR-011).
 *
 * Nazwy są rozpisane, bo w tej funkcji spotykają się trzy różne liczby: `calorieTotal` to
 * kilokalorie, `entryCount` to wpisy, a `total` z `DiaryEntriesDto` to wiersze. Jedno słowo
 * "total" na wszystkie trzy tylko by je pomieszało.
 */
export function summarizeDay(entries: DiaryEntryDto[]): DaySummary {
  let calorieTotal = 0;
  let missingCount = 0;

  for (const entry of entries) {
    if (entry.calories === null) {
      missingCount += 1;
      continue;
    }

    calorieTotal += entry.calories;
  }

  return {
    calorieTotal,
    missingCount,
    entryCount: entries.length,
  };
}

export interface GoalProgress {
  /** Wypełnienie paska w procentach, zaokrąglone i obcięte do 0-100. */
  percent: number;
  status: "under" | "reached" | "over";
  /** Ile kcal brakuje do celu; `0`, gdy cel osiągnięto lub przekroczono. */
  remaining: number;
  /** O ile kcal przekroczono cel; `0`, gdy go nie przekroczono. */
  excess: number;
}

/**
 * Relacja sumy dnia do dziennego celu.
 *
 * Status liczy się z surowych kilokalorii, nie z procentu: 1999/2000 zaokrągla się do 100%,
 * a mimo to jest `under` z jedną kilokalorią zapasu. `reached` wypada tylko przy równości.
 */
export function goalProgress(calorieTotal: number, goal: number): GoalProgress {
  const rawPercent = goal > 0 ? Math.round((calorieTotal / goal) * 100) : 0;
  const percent = Math.min(100, Math.max(0, rawPercent));

  if (calorieTotal === goal) {
    return { percent, status: "reached", remaining: 0, excess: 0 };
  }

  if (calorieTotal > goal) {
    return { percent, status: "over", remaining: 0, excess: calorieTotal - goal };
  }

  return { percent, status: "under", remaining: goal - calorieTotal, excess: 0 };
}
