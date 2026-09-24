import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { formatCalories, parseCalories } from "@/lib/utils/diary-calories";
import { AI_NOTICE, type EstimationState } from "@/lib/utils/diary-estimation";
import { setEntryCaloriesSchema } from "@/lib/validations/diary/set-calories";
import type { CalorieOriginEnum, DiaryEntryDto } from "../../types";

interface DiaryEntryCaloriesProps {
  entry: DiaryEntryDto;
  state: EstimationState;
  /** Ta wyspa ma dla tego wpisu żądanie faktycznie w locie - jedyny powód, by zablokować pole. */
  isInFlight: boolean;
  /** Wpis czeka w kolejce FIFO na swoją turę. Z punktu widzenia użytkownika też "jest w toku". */
  isQueued: boolean;
  onEstimate: (entryId: number) => void;
  onCancel: (entryId: number) => void;
  onSetCalories: (entryId: number, calories: number) => Promise<void>;
}

/**
 * Adnotacja o pochodzeniu wartości. Tylko dwa pochodzenia, bo tylko dwa może dziś wyprodukować ta
 * ścieżka; `recipe_nutrition` i `ai_from_recipe` dołoży S-04, dopisując tu dwa wiersze i nie
 * ruszając listy.
 */
const ORIGIN_LABELS: Partial<Record<CalorieOriginEnum, string>> = {
  ai_from_description: "oszacowane z opisu",
  manual: "wpisane ręcznie",
};

/**
 * Wartość kaloryczna jednego wpisu we wszystkich swoich stanach.
 *
 * Osobny komponent, bo tych stanów jest cztery i rozsypane po liście przestałyby się zgadzać po
 * pierwszej zmianie. S-04 pokaże tutaj piąte i szóste pochodzenie, nie dotykając `DiaryEntryList`.
 *
 * **Pole na liczbę jest nieaktywne wyłącznie przy `isInFlight`, nie w całym stanie `estimating`.**
 * Ten stan obejmuje trzy różne sytuacje i tylko jedna uzasadnia blokadę:
 *
 * - żądanie w locie - "Liczę...", pole nieaktywne, "Anuluj" przerywa żądanie,
 * - wpis w kolejce - "W kolejce...", pole aktywne, "Anuluj" wyjmuje z kolejki (cena kolejki FIFO:
 *   przy pięciu zleceniach naraz ostatni czekałby kilka minut, a przez ten czas nie mógłby dostać
 *   liczby wpisanej ręcznie),
 * - świeży znacznik po przeładowaniu strony - "Liczę...", pole aktywne, i **bez** "Anuluj": ta
 *   wyspa nie ma czego przerwać, więc zamiast przycisku, który nic nie robi, stoi tu
 *   "Policz ponownie".
 *
 * Pole w stanie `valued` nie jest ozdobą: US-01 wymaga, by ustaloną liczbę dało się zastąpić własną
 * ("accept the established value or replace it"), a `PATCH` z Fazy 1 ustawia `manual` bezwarunkowo
 * dokładnie po to. Po takim zapisie wpis nadal jest `valued`, zmienia się tylko adnotacja.
 */
export default function DiaryEntryCalories({
  entry,
  state,
  isInFlight,
  isQueued,
  onEstimate,
  onCancel,
  onSetCalories,
}: DiaryEntryCaloriesProps) {
  const [draft, setDraft] = useState(() => formatCalories(entry.calories));
  const [seededFrom, setSeededFrom] = useState<number | null>(entry.calories);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Pole jest pochodną wartości z wiersza, więc dostosowujemy je w trakcie renderu zamiast
  // w efekcie ("adjusting state when props change", tak jak `RecipeFormModal.tsx:61-68`).
  // Kluczem jest sama wartość, a nie każdy nowy obiekt wpisu: odświeżenie listy, które nic nie
  // zmieniło, nie może skasować liczby, którą użytkownik właśnie wpisuje.
  if (seededFrom !== entry.calories) {
    setSeededFrom(entry.calories);
    setDraft(formatCalories(entry.calories));
    setError(null);
  }

  const canCancel = isInFlight || isQueued;
  const isFieldDisabled = isInFlight || isSaving;

  const handleSave = async () => {
    // Ten sam schemat co na trasie `PATCH` - granice i komunikaty nie mają jak się rozjechać.
    const result = setEntryCaloriesSchema.safeParse({ calories: parseCalories(draft) });

    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Nieprawidłowa wartość kalorii");
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      await onSetCalories(entry.id, result.data.calories);
    } finally {
      setIsSaving(false);
    }
  };

  const originLabel = entry.calorie_origin ? ORIGIN_LABELS[entry.calorie_origin] : undefined;
  const inputId = `diary-entry-${entry.id}-calories`;
  const errorId = `${inputId}-error`;

  return (
    <div className="flex shrink-0 flex-col items-end gap-2">
      {state === "valued" ? (
        <div className="text-right">
          <p className="text-sm font-semibold" data-testid="diary-entry-calories">
            {entry.calories} kcal
          </p>
          {originLabel && (
            <p className="text-xs text-muted-foreground" data-testid="diary-entry-origin">
              {originLabel}
            </p>
          )}
        </div>
      ) : state === "estimating" ? (
        <span
          className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"
          data-testid="diary-entry-estimating"
        >
          {isQueued && !isInFlight ? "W kolejce…" : "Liczę…"}
        </span>
      ) : (
        <span
          className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"
          data-testid="diary-entry-calories-missing"
        >
          Nie policzono
        </span>
      )}

      <div className="flex items-center gap-2">
        <label htmlFor={inputId} className="sr-only">
          Kalorie wpisu: {entry.content}
        </label>
        <input
          type="text"
          inputMode="numeric"
          id={inputId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={isFieldDisabled}
          className={`w-24 rounded-md border px-2 py-1 text-sm ${
            error ? "border-destructive bg-destructive/10" : "border-input bg-background"
          } disabled:opacity-50`}
          placeholder="kcal"
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          data-testid="diary-entry-calories-input"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSave}
          disabled={isFieldDisabled}
          data-testid="diary-entry-calories-save"
        >
          {isSaving ? <LoadingSpinner size="sm" /> : "Zapisz"}
        </Button>
      </div>

      {error && (
        <p id={errorId} role="alert" className="text-right text-xs text-destructive">
          {error}
        </p>
      )}

      {state !== "valued" &&
        (canCancel ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onCancel(entry.id)}
            data-testid="diary-entry-cancel-button"
          >
            Anuluj
          </Button>
        ) : state === "idle" ? (
          <>
            <Button
              type="button"
              size="sm"
              onClick={() => onEstimate(entry.id)}
              data-testid="diary-entry-estimate-button"
            >
              Policz kalorie
            </Button>
            <p className="max-w-52 text-right text-xs text-muted-foreground" data-testid="diary-ai-notice">
              {AI_NOTICE}
            </p>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onEstimate(entry.id)}
              data-testid="diary-entry-retry-button"
            >
              Policz ponownie
            </Button>
            <p className="max-w-52 text-right text-xs text-muted-foreground" data-testid="diary-ai-notice">
              {AI_NOTICE}
            </p>
          </>
        ))}
    </div>
  );
}
