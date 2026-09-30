import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addDays, isAfter } from "@/lib/utils/diary-day";

interface DayNavigatorProps {
  day: string;
  today: string;
  onChange: (next: string) => void;
}

/**
 * Przełącznik dnia: krok wstecz, krok naprzód, skok datownikiem i powrót na dziś.
 *
 * Komponent nie konstruuje żadnego `Date` ani nie liczy dni samodzielnie - całą arytmetykę
 * trzyma `src/lib/utils/diary-day.ts`.
 */
export default function DayNavigator({ day, today, onChange }: DayNavigatorProps) {
  const isToday = day === today;
  // Krok naprzód ma sens tylko wtedy, gdy dziś jest jeszcze przed nami.
  const canGoForward = isAfter(today, day);

  const handleDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;

    // Wyczyszczenie pola daje pusty napis - to nie jest wybór dnia.
    if (value === "") return;

    onChange(value);
  };

  return (
    <div className="flex items-center gap-2" data-testid="day-navigator">
      <Button
        variant="outline"
        size="icon"
        onClick={() => onChange(addDays(day, -1))}
        aria-label="Poprzedni dzień"
        data-testid="day-previous-button"
      >
        <ChevronLeft aria-hidden="true" />
      </Button>

      <Input
        type="date"
        value={day}
        max={today}
        onChange={handleDateChange}
        className="sm:w-auto"
        aria-label="Wybierz dzień dziennika"
        data-testid="day-date-input"
      />

      <Button
        variant="outline"
        size="icon"
        onClick={() => onChange(addDays(day, 1))}
        disabled={!canGoForward}
        aria-label="Następny dzień"
        data-testid="day-next-button"
      >
        <ChevronRight aria-hidden="true" />
      </Button>

      <Button
        variant="outline"
        onClick={() => onChange(today)}
        disabled={isToday}
        aria-label="Wróć na dzisiaj"
        data-testid="day-today-button"
      >
        Dziś
      </Button>
    </div>
  );
}
