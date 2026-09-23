import React from "react";
import { summarizeDay } from "@/lib/utils/diary-totals";
import type { DiaryEntryDto } from "../../types";

interface DiaryDaySummaryProps {
  entries: DiaryEntryDto[];
}

/**
 * Liczba dnia razem z klauzulą uczciwości: jeśli część wpisów nie ma kalorii, suma nigdy nie
 * pokazuje się sama, bo udawałaby pełny bilans.
 */
export default function DiaryDaySummary({ entries }: DiaryDaySummaryProps) {
  const { calorieTotal, missingCount, entryCount } = summarizeDay(entries);

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm" data-testid="diary-day-summary">
      <p className="text-sm text-muted-foreground">Suma dnia</p>
      <p className="text-2xl font-semibold" data-testid="diary-day-total">
        {calorieTotal} kcal
      </p>
      {missingCount > 0 ? (
        <p className="mt-1 text-xs text-muted-foreground" data-testid="diary-day-missing">
          Bez policzonych kalorii: {missingCount} z {entryCount}. Suma ich nie obejmuje.
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground" data-testid="diary-day-count">
          Wszystkie wpisy dnia: {entryCount}.
        </p>
      )}
    </div>
  );
}
