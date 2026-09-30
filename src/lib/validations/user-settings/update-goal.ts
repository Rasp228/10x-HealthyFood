import { z } from "zod";

/**
 * Reguła dziennego celu kalorycznego - ten sam zakres, który przyjmuje kolumna
 * `daily_calorie_goal integer check (daily_calorie_goal between 500 and 10000)` w migracji
 * `user_settings`. Zmiana granic tutaj bez zmiany CHECK (albo odwrotnie) zamienia 400 w 500.
 */
export const dailyGoalValueSchema = z
  .number("Cel musi być liczbą")
  .int("Cel musi być liczbą całkowitą")
  .min(500, "Cel nie może być niższy niż 500 kcal")
  .max(10000, "Cel nie może przekraczać 10000 kcal");

/**
 * Schemat ciała `PUT /api/user-settings`.
 *
 * `null` czyści cel. Brak klucza to błąd, a nie "bez zmian": ciało ma jedno pole, więc żądanie
 * bez niego niczego nie opisuje.
 */
export const updateDailyGoalSchema = z.object({
  daily_calorie_goal: dailyGoalValueSchema.nullable(),
});

export type UpdateDailyGoalSchema = z.infer<typeof updateDailyGoalSchema>;
