import { z } from "zod";
import { caloriesValueSchema } from "./create-entry";

/**
 * Identyfikator wpisu dziennika czytany z `params.id`.
 *
 * Parametr ścieżki jest napisem (albo go nie ma), więc walidacja zaczyna się od kształtu, a nie
 * od `parseInt`: `parseInt("12abc")` oddaje 12 i cicho przepuszcza adres, którego nikt nie
 * zamierzał obsłużyć. `Number.isSafeInteger` domyka górną stronę - `id` jest w bazie typu
 * `serial`, a napis dłuższy niż zakres bezpiecznej liczby nie jest żadnym wierszem.
 */
export const entryIdSchema = z
  .string("Identyfikator wpisu jest wymagany")
  .regex(/^\d+$/, "Identyfikator wpisu musi być dodatnią liczbą całkowitą")
  .transform((value) => Number(value))
  .refine((value) => Number.isSafeInteger(value) && value > 0, "Nieprawidłowy identyfikator wpisu");

export type EntryIdSchema = z.infer<typeof entryIdSchema>;

/**
 * Schemat ręcznego ustawienia wartości kalorycznej w istniejącym wpisie.
 *
 * Wąsko z rozmysłem: jedyne pole, które ta ścieżka pozwala zmienić, to liczba kalorii. Reguła
 * jest wspólna z tworzeniem wpisu (`caloriesValueSchema`), ale tutaj liczba jest **wymagana
 * i nie może być `null`** - wyzerowanie wartości pociągałoby za sobą wyzerowanie
 * `estimation_requested_at` (reguła, której baza nie egzekwuje), a tego ta zmiana nie obsługuje.
 *
 * Osobny plik zamiast rozszerzania `create-entry.ts`: gdy edycja wpisu obejmie treść, ilość
 * i dzień, ten plik stanie się `update-entry.ts` bez dotykania ścieżki tworzenia.
 */
export const setEntryCaloriesSchema = z.object({
  calories: caloriesValueSchema,
});

export type SetEntryCaloriesSchema = z.infer<typeof setEntryCaloriesSchema>;
