import React from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import DiaryEntryCalories from "./DiaryEntryCalories";
import type { EstimationState } from "@/lib/utils/diary-estimation";
import { formatPortions } from "@/lib/utils/diary-portions";
import type { DiaryEntryDto } from "../../types";

interface DiaryEntryListProps {
  entries: DiaryEntryDto[];
  /** Stan wartości wpisu liczy wyspa - ona jedna zna zegar i swoje żądania w locie. */
  entryState: (entry: DiaryEntryDto) => EstimationState;
  inFlightId: number | null;
  /** Wpis, którego `DELETE` jest w drodze - jego akcje czekają na odpowiedź. */
  deletingId: number | null;
  queuedIds: readonly number[];
  onEstimate: (entryId: number) => void;
  onCancel: (entryId: number) => void;
  onSetCalories: (entryId: number, calories: number) => Promise<void>;
  onEdit: (entry: DiaryEntryDto) => void;
  onDelete: (entry: DiaryEntryDto) => void;
}

/**
 * Ilość, którą wiersz pokazuje pod opisem: ta, która faktycznie wyznaczyła wartość wpisu.
 *
 * Wpis z przepisu opisuje ilość liczbą porcji, wpis opisowy - tekstem, i schemat tworzenia nie
 * pozwala mieć obu naraz. Jedno miejsce w układzie i jeden `data-testid`, żeby page object miał
 * jeden selektor ilości niezależnie od ścieżki, którą wpis powstał.
 */
function amountLabel(entry: DiaryEntryDto): string | null {
  if (entry.portions !== null) return formatPortions(entry.portions);

  return entry.amount_text;
}

/**
 * Lista wpisów dnia. Sama nie rysuje już ani liczby, ani etykiety "Nie policzono" - tę rolę,
 * razem z polem na ręczną wartość i przyciskami wyceny, przejął `DiaryEntryCalories`.
 */
export default function DiaryEntryList({
  entries,
  entryState,
  inFlightId,
  deletingId,
  queuedIds,
  onEstimate,
  onCancel,
  onSetCalories,
  onEdit,
  onDelete,
}: DiaryEntryListProps) {
  return (
    <ul className="flex flex-col gap-3" data-testid="diary-entry-list">
      {entries.map((entry) => {
        const amount = amountLabel(entry);
        // Wpis w locie ma zablokowane akcje, żeby nie przerywać wyceny, na którą użytkownik czeka.
        // Wyścigu z `applyEstimate` to nie zamyka - anulowana trasa i tak kończy pracę - zamyka go
        // warunek na `estimation_requested_at`, który edycja zeruje.
        const isInFlight = inFlightId === entry.id;
        const isLocked = isInFlight || deletingId === entry.id;

        return (
          <li
            key={entry.id}
            className="rounded-lg border bg-card p-4 shadow-sm"
            data-testid={`diary-entry-${entry.id}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium break-words" data-testid="diary-entry-content">
                  {entry.content}
                </p>
                {amount && (
                  <p className="mt-1 text-xs text-muted-foreground" data-testid="diary-entry-amount">
                    {amount}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit(entry)}
                    disabled={isLocked}
                    aria-label={`Edytuj wpis: ${entry.content}`}
                    data-testid="diary-entry-edit-button"
                  >
                    <Pencil aria-hidden="true" />
                    Edytuj
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(entry)}
                    disabled={isLocked}
                    aria-label={`Usuń wpis: ${entry.content}`}
                    className="text-destructive hover:text-destructive"
                    data-testid="diary-entry-delete-button"
                  >
                    <Trash2 aria-hidden="true" />
                    Usuń
                  </Button>
                </div>
              </div>

              <DiaryEntryCalories
                entry={entry}
                state={entryState(entry)}
                isInFlight={isInFlight}
                isQueued={queuedIds.includes(entry.id)}
                onEstimate={onEstimate}
                onCancel={onCancel}
                onSetCalories={onSetCalories}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
