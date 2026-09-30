import { useState, useEffect, useCallback } from "react";
import type { DailyGoalDto, UpdateDailyGoalCommand } from "../../types";
import type { ValidationIssue } from "../../lib/utils/validation-errors";
import { useToast } from "../common/useToast";

interface UseDailyGoalResult {
  goal: number | null;
  isLoading: boolean;
  isSaving: boolean;
  error: Error | null;
  saveGoal: (goal: number | null) => Promise<boolean>;
}

interface ErrorBody {
  error?: string;
  details?: ValidationIssue[];
}

/**
 * Komunikat z odpowiedzi błędu. Dla 400 trasa niesie `details: ValidationIssue[]` - pierwszy
 * wpis mówi użytkownikowi więcej niż ogólne `error`.
 */
async function errorMessageFrom(response: Response, fallback: string): Promise<string> {
  const body: ErrorBody = await response.json().catch(() => ({}));

  if (response.status === 400 && Array.isArray(body.details) && body.details.length > 0) {
    return body.details[0].message;
  }

  return body.error || fallback;
}

// Hook dziennego celu kalorycznego: pobiera go przy montowaniu i zapisuje przez `PUT`.
// Stan ustawiamy wyłącznie w callbacku fetcha (po `await`), tak jak `useDiaryEntries`.
// Błędy sieci i serwera zgłasza toastem sam hook - to on zna komunikat, a pole formularza
// zostaje dla błędów walidacji. Toast rysuje `<ToastContainer />` z `ProfilePage`.
export function useDailyGoal(): UseDailyGoalResult {
  const { showToast } = useToast();
  const [goal, setGoal] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isCurrent = true;

    const fetchGoal = async () => {
      try {
        const response = await fetch("/api/user-settings", {
          method: "GET",
          credentials: "include", // Ważne dla przesyłania cookies z sesją
        });

        if (!response.ok) {
          throw new Error(await errorMessageFrom(response, "Błąd podczas pobierania celu kalorycznego"));
        }

        const result: DailyGoalDto = await response.json();

        if (!isCurrent) return;

        setGoal(result.daily_calorie_goal);
      } catch (err) {
        if (!isCurrent) return;

        const fetchError = err instanceof Error ? err : new Error("Błąd podczas pobierania celu kalorycznego");
        setError(fetchError);
        showToast(fetchError.message, "error");
        console.error("Error fetching daily goal:", err);
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    };

    fetchGoal();

    return () => {
      isCurrent = false;
    };
  }, [showToast]);

  const saveGoal = useCallback(
    async (nextGoal: number | null): Promise<boolean> => {
      setIsSaving(true);
      setError(null);

      try {
        const command: UpdateDailyGoalCommand = { daily_calorie_goal: nextGoal };
        const response = await fetch("/api/user-settings", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(command),
        });

        if (!response.ok) {
          throw new Error(await errorMessageFrom(response, "Błąd podczas zapisywania celu kalorycznego"));
        }

        const result: DailyGoalDto = await response.json();
        setGoal(result.daily_calorie_goal);

        return true;
      } catch (err) {
        const saveError = err instanceof Error ? err : new Error("Błąd podczas zapisywania celu kalorycznego");
        setError(saveError);
        showToast(saveError.message, "error");
        console.error("Error saving daily goal:", err);

        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [showToast]
  );

  return {
    goal,
    isLoading,
    isSaving,
    error,
    saveGoal,
  };
}
