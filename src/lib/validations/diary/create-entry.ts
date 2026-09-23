import { z } from "zod";

/**
 * Sprawdza, czy data faktycznie istnieje w kalendarzu.
 *
 * Sam regex `^\d{4}-\d{2}-\d{2}$` przepuszcza `2026-02-31`: kształt się zgadza, ale Postgres
 * odrzuca taką wartość i użytkownik dostaje 500 tam, gdzie poprawne było 400. Dlatego oprócz
 * kształtu weryfikujemy, że napis wraca z konstruktora daty bez zmian (UTC, żeby strefa
 * serwera nie przesunęła dnia).
 */
function isExistingDate(value: string): boolean {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));

  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Reguła dnia dziennika - wspólna dla tworzenia wpisu i dla listowania dnia. */
export const entryDateSchema = z
  .string("Data jest wymagana")
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data musi być w formacie RRRR-MM-DD")
  .refine(isExistingDate, "Podana data nie istnieje");

/**
 * Schemat tworzenia wpisu dziennika.
 *
 * Bez `calorie_origin`: pochodzenie wartości ustala serwer. Gdyby klient mógł je nazwać,
 * ręcznie wpisana liczba trafiłaby do bazy np. jako `ai_from_recipe`.
 */
export const createDiaryEntrySchema = z.object({
  entry_date: entryDateSchema,
  content: z
    .string("Opis posiłku jest wymagany")
    .trim()
    .min(1, "Opis posiłku jest wymagany")
    .max(500, "Opis posiłku nie może przekraczać 500 znaków"),
  amount_text: z
    .string()
    .trim()
    .max(100, "Ilość nie może przekraczać 100 znaków")
    // Puste pole formularza to brak ilości, nie pusty napis.
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional(),
  // Górne ograniczenie to decyzja produktowa, nie techniczna: pojedynczy wpis powyżej 5000 kcal
  // jest raczej pomyłką niż posiłkiem. Dolne odwzorowuje check z migracji (`calories >= 0`).
  calories: z
    .number("Kalorie muszą być liczbą")
    .int("Kalorie muszą być liczbą całkowitą")
    .min(0, "Kalorie nie mogą być ujemne")
    .max(5000, "Kalorie nie mogą przekraczać 5000 kcal")
    .nullable()
    .optional(),
});

export type CreateDiaryEntrySchema = z.infer<typeof createDiaryEntrySchema>;
