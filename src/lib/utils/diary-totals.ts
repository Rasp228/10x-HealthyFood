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
