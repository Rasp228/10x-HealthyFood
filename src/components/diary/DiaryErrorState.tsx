import React from "react";
import { Button } from "@/components/ui/button";

interface DiaryErrorStateProps {
  message: string;
  onRetry: () => void;
}

/**
 * Błąd ładowania wpisów dnia. Komponent bez hooków danych, żeby kitchen sink mógł go wyrenderować
 * z samych propsów.
 *
 * Przycisk to `ghost` z własną ramką, nie `outline`: wariant `outline` ma `dark:border-input
 * dark:bg-input/30`, które w ciemnym motywie wygrywały z ramką i tłem w kolorze `destructive`.
 */
export default function DiaryErrorState({ message, onRetry }: DiaryErrorStateProps) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-card p-4 text-center" data-testid="diary-error-state">
      <h3 className="mb-2 text-lg font-semibold text-destructive">Wystąpił błąd</h3>
      <p className="text-destructive">{message}</p>
      <Button
        variant="ghost"
        className="mt-4 border border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={onRetry}
        data-testid="diary-retry-button"
      >
        Spróbuj ponownie
      </Button>
    </div>
  );
}
