import React from "react";
import { Card } from "@/components/ui/card";
import { summarizeDay } from "@/lib/utils/diary-totals";
import DailyGoalProgress from "./DailyGoalProgress";
import type { DiaryEntryDto } from "../../types";

interface DiaryDaySummaryProps {
  entries: DiaryEntryDto[];
  /** Dzienny cel w kcal; `null` albo brak - pasek się nie rysuje. */
  dailyGoal?: number | null;
}

/**
 * Liczba dnia razem z klauzulą uczciwości: jeśli część wpisów nie ma kalorii, suma nigdy nie
 * pokazuje się sama, bo udawałaby pełny bilans.
 *
 * Pasek celu stoi pod liczbą, ale poza `diary-day-total` - tekst sumy zostaje dokładnie `N kcal`.
 * Karta ma akcent marki i większą liczbę niż karty wpisów, żeby suma była pierwszym, co widać.
 * Tło najwyżej `primary/3`: przy `/5` `text-muted-foreground` w jasnym motywie spada do ~4.4:1,
 * przy `/3` trzyma ~4.5:1 (WCAG 1.4.3).
 */
export default function DiaryDaySummary({ entries, dailyGoal = null }: DiaryDaySummaryProps) {
  const { calorieTotal, missingCount, entryCount } = summarizeDay(entries);

  return (
    <Card className="gap-0 border-primary/40 bg-primary/3 p-4 sm:p-5" data-testid="diary-day-summary">
      <p className="text-sm text-muted-foreground">Suma dnia</p>
      <p className="text-4xl font-bold tracking-tight tabular-nums" data-testid="diary-day-total">
        {calorieTotal} kcal
      </p>
      {dailyGoal !== null && (
        <DailyGoalProgress calorieTotal={calorieTotal} goal={dailyGoal} missingCount={missingCount} />
      )}
      {missingCount > 0 ? (
        <p className="mt-1 text-xs text-muted-foreground" data-testid="diary-day-missing">
          Bez policzonych kalorii: {missingCount} z {entryCount}. Suma ich nie obejmuje.
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground" data-testid="diary-day-count">
          Wszystkie wpisy dnia: {entryCount}.
        </p>
      )}
    </Card>
  );
}
