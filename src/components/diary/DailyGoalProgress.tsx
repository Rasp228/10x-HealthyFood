import React from "react";
import { Progress } from "@/components/ui/progress";
import { goalProgress } from "@/lib/utils/diary-totals";

interface DailyGoalProgressProps {
  calorieTotal: number;
  goal: number;
  missingCount: number;
}

/**
 * Pasek sumy dnia względem dziennego celu.
 *
 * Przekroczenie celu nie jest błędem: ten sam kolor paska i ten sam stonowany opis po obu stronach
 * celu, bez czerwieni i ikon ostrzegawczych. Liczby bez separatora tysięcy - tak samo jak
 * `diary-day-total` w `DiaryDaySummary`.
 */
export default function DailyGoalProgress({ calorieTotal, goal, missingCount }: DailyGoalProgressProps) {
  const { percent, status, remaining, excess } = goalProgress(calorieTotal, goal);

  const relation =
    status === "reached"
      ? "cel osiągnięty"
      : status === "over"
        ? `${excess} kcal ponad cel`
        : `zostało ${remaining} kcal`;

  return (
    <div className="mt-3 flex flex-col gap-1.5" data-testid="diary-goal-progress">
      <Progress value={percent} aria-label="Postęp względem dziennego celu" />
      <p className="text-xs text-muted-foreground" data-testid="diary-goal-text">
        {calorieTotal} / {goal} kcal · {relation}
      </p>
      {missingCount > 0 && <p className="text-xs text-muted-foreground">Pasek nie obejmuje wpisów bez wartości.</p>}
    </div>
  );
}
