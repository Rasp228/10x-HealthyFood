import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/utils";
import { useDailyGoal } from "../../hooks/profile/useDailyGoal";
import { useToast } from "../../hooks/common/useToast";
import { dailyGoalValueSchema } from "../../lib/validations/user-settings/update-goal";

const INPUT_ID = "daily-goal";
const HINT_ID = "daily-goal-hint";
const ERROR_ID = "daily-goal-error";

/**
 * Zamienia tekst pola na liczbę i sprawdza ją tą samą regułą, którą stosuje trasa.
 * Zwraca liczbę albo polski komunikat błędu.
 */
function parseGoal(raw: string, hasSavedGoal: boolean): { value: number } | { error: string } {
  const trimmed = raw.trim();

  if (trimmed === "") {
    return {
      error: hasSavedGoal ? "Wpisz cel w kcal albo użyj „Usuń cel”" : "Wpisz cel w kcal",
    };
  }

  // `Number` zwraca NaN dla tekstu nieliczbowego - schemat odrzuca je komunikatem "Cel musi być liczbą".
  const result = dailyGoalValueSchema.safeParse(Number(trimmed));

  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "Nieprawidłowy cel" };
  }

  return { value: result.data };
}

export default function DailyGoalCard() {
  const { goal, isLoading, isSaving, error, saveGoal } = useDailyGoal();
  const { showToast } = useToast();

  const [inputValue, setInputValue] = useState<string>(() => (goal === null ? "" : String(goal)));
  const [validationError, setValidationError] = useState<string | null>(null);

  // Pole jest zasiane zapisanym celem. Ustawiamy je w trakcie renderu, gdy zmieni się zapisana
  // wartość (po pobraniu albo po zapisie), zamiast kopiować ją do stanu w efekcie.
  const seedKey = `${isLoading}:${goal ?? ""}`;
  const [prevSeedKey, setPrevSeedKey] = useState(seedKey);

  if (prevSeedKey !== seedKey) {
    setPrevSeedKey(seedKey);
    setInputValue(goal === null ? "" : String(goal));
    setValidationError(null);
  }

  const displayedError = validationError ?? error?.message ?? null;
  const isBusy = isLoading || isSaving;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = parseGoal(inputValue, goal !== null);

    if ("error" in parsed) {
      setValidationError(parsed.error);
      return;
    }

    setValidationError(null);

    if (await saveGoal(parsed.value)) {
      showToast("Dzienny cel kaloryczny został zapisany", "success");
    }
  };

  const handleClear = async () => {
    setValidationError(null);

    if (await saveGoal(null)) {
      showToast("Dzienny cel kaloryczny został usunięty", "success");
    }
  };

  return (
    <div className="bg-card rounded-lg p-6 shadow-sm mt-6" data-testid="daily-goal-card">
      <h2 className="text-xl font-semibold mb-4">Dzienny cel kaloryczny</h2>
      <form onSubmit={handleSubmit} noValidate className="space-y-2">
        <label htmlFor={INPUT_ID} className="block text-sm font-medium">
          Cel na dzień
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <input
              type="number"
              id={INPUT_ID}
              inputMode="numeric"
              step={1}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setValidationError(null);
              }}
              className={cn(
                "w-36 rounded-md border px-3 py-2 text-sm",
                displayedError ? "border-destructive bg-destructive/10" : "border-input bg-background"
              )}
              placeholder="np. 2000"
              disabled={isBusy}
              aria-invalid={!!displayedError}
              aria-describedby={displayedError ? `${HINT_ID} ${ERROR_ID}` : HINT_ID}
              data-testid="daily-goal-input"
            />
            <span className="text-sm text-muted-foreground">kcal</span>
          </div>
          <Button type="submit" disabled={isBusy} data-testid="daily-goal-save">
            {isSaving ? "Zapisywanie..." : "Zapisz"}
          </Button>
          {goal !== null && (
            <Button
              type="button"
              variant="outline"
              onClick={handleClear}
              disabled={isBusy}
              data-testid="daily-goal-clear"
            >
              Usuń cel
            </Button>
          )}
        </div>
        <p id={HINT_ID} className="text-xs text-muted-foreground">
          Opcjonalnie. Liczba, np. od dietetyka (500–10000)
        </p>
        {displayedError && (
          <p id={ERROR_ID} className="text-xs text-destructive" role="alert" data-testid="daily-goal-error">
            {displayedError}
          </p>
        )}
      </form>
    </div>
  );
}
