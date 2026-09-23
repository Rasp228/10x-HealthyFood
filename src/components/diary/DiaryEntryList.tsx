import React from "react";
import type { DiaryEntryDto } from "../../types";

interface DiaryEntryListProps {
  entries: DiaryEntryDto[];
}

/**
 * Lista wpisów dnia. Wpis bez kalorii dostaje własną, widoczną etykietę - brak wartości jest
 * informacją, nie pustym miejscem.
 */
export default function DiaryEntryList({ entries }: DiaryEntryListProps) {
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

            {entry.calories === null ? (
              <span
                className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"
                data-testid="diary-entry-calories-missing"
              >
                Nie policzono
              </span>
            ) : (
              <span className="shrink-0 text-sm font-semibold" data-testid="diary-entry-calories">
                {entry.calories} kcal
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
