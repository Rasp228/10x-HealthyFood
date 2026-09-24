import React from "react";
import DiaryEntryCalories from "./DiaryEntryCalories";
import type { EstimationState } from "@/lib/utils/diary-estimation";
import type { DiaryEntryDto } from "../../types";

interface DiaryEntryListProps {
  entries: DiaryEntryDto[];
  /** Stan wartości wpisu liczy wyspa - ona jedna zna zegar i swoje żądania w locie. */
  entryState: (entry: DiaryEntryDto) => EstimationState;
  inFlightId: number | null;
  queuedIds: readonly number[];
  onEstimate: (entryId: number) => void;
  onCancel: (entryId: number) => void;
  onSetCalories: (entryId: number, calories: number) => Promise<void>;
}

/**
 * Lista wpisów dnia. Sama nie rysuje już ani liczby, ani etykiety "Nie policzono" - tę rolę,
 * razem z polem na ręczną wartość i przyciskami wyceny, przejął `DiaryEntryCalories`.
 */
export default function DiaryEntryList({
  entries,
  entryState,
  inFlightId,
  queuedIds,
  onEstimate,
  onCancel,
  onSetCalories,
}: DiaryEntryListProps) {
  return (
    <ul className="flex flex-col gap-3" data-testid="diary-entry-list">
      {entries.map((entry) => (
        <li key={entry.id} className="rounded-lg border bg-card p-4 shadow-sm" data-testid={`diary-entry-${entry.id}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium break-words" data-testid="diary-entry-content">
                {entry.content}
              </p>
              {entry.amount_text && (
                <p className="mt-1 text-xs text-muted-foreground" data-testid="diary-entry-amount">
                  {entry.amount_text}
                </p>
              )}
            </div>

            <DiaryEntryCalories
              entry={entry}
              state={entryState(entry)}
              isInFlight={inFlightId === entry.id}
              isQueued={queuedIds.includes(entry.id)}
              onEstimate={onEstimate}
              onCancel={onCancel}
              onSetCalories={onSetCalories}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
