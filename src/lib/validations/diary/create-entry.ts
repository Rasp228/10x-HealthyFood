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
 * Reguła wartości kalorycznej - wspólna dla tworzenia wpisu i dla ręcznego ustawienia liczby
 * w istniejącym wpisie (`set-calories.ts`). Jedna reguła na obie ścieżki: granice i komunikaty
 * rozjeżdżałyby się przy pierwszej zmianie, gdyby każda trasa miała własną kopię.
 *
 * Górne ograniczenie to decyzja produktowa, nie techniczna: pojedynczy wpis powyżej 5000 kcal
 * jest raczej pomyłką niż posiłkiem. Dolne odwzorowuje check z migracji (`calories >= 0`).
 */
export const caloriesValueSchema = z
  .number("Kalorie muszą być liczbą")
  .int("Kalorie muszą być liczbą całkowitą")
  .min(0, "Kalorie nie mogą być ujemne")
  .max(5000, "Kalorie nie mogą przekraczać 5000 kcal");

/**
 * Czy liczba ma najwyżej dwa miejsca po przecinku.
 *
 * Mnożenie przez 100 samo w sobie nie wystarcza: `1.15 * 100` daje 114.99999999999999, więc
 * porównanie z `Math.round` odrzuciłoby wartość, którą `numeric(6,2)` przyjmuje bez zastrzeżeń.
 * `toFixed(6)` ucina ten szum reprezentacji, zanim zapytamy o całkowitość.
 */
function hasAtMostTwoDecimals(value: number): boolean {
  return Number.isInteger(Number((value * 100).toFixed(6)));
}

/**
 * Reguła liczby porcji - dokładnie ten zakres, który przyjmuje kolumna
 * `portions numeric(6,2) check (portions is null or portions > 0)`.
 *
 * Górne ograniczenie 99 jest decyzją produktową, nie techniczną (`numeric(6,2)` zmieściłby
 * 9999.99): jeden posiłek złożony z setki porcji jest pomyłką, a nie obiadem.
 */
export const portionsSchema = z
  .number("Liczba porcji musi być liczbą")
  .gt(0, "Liczba porcji musi być większa od zera")
  .max(99, "Liczba porcji nie może przekraczać 99")
  .refine(hasAtMostTwoDecimals, "Liczba porcji może mieć najwyżej dwa miejsca po przecinku");

/**
 * Schemat tworzenia wpisu dziennika.
 *
 * Bez `calorie_origin`: pochodzenie wartości ustala serwer. Gdyby klient mógł je nazwać,
 * ręcznie wpisana liczba trafiłaby do bazy np. jako `ai_from_recipe`.
 *
 * Reguły wzajemne stoją w `superRefine`, a nie w `refine` na całym obiekcie: `DiaryEntryForm`
 * rozdziela błędy po `issue.path[0]`, więc problem bez ścieżki wylądowałby w ogólnej ramce
 * formularza zamiast przy polu, którego dotyczy.
 */
export const createDiaryEntrySchema = z
  .object({
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
    // Przy tworzeniu wpisu liczba jest opcjonalna: brak wartości to wpis jeszcze niepoliczony.
    calories: caloriesValueSchema.nullable().optional(),
    // Przepis, z którego wpis powstał. Własność przepisu sprawdza serwis - schemat pilnuje kształtu.
    source_recipe_id: z
      .number("Identyfikator przepisu musi być liczbą")
      .int("Identyfikator przepisu musi być liczbą całkowitą")
      .positive("Identyfikator przepisu musi być dodatni")
      .nullable()
      .optional(),
    portions: portionsSchema.nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const hasRecipe = value.source_recipe_id !== null && value.source_recipe_id !== undefined;
    const hasPortions = value.portions !== null && value.portions !== undefined;

    if (hasPortions && !hasRecipe) {
      ctx.addIssue({
        code: "custom",
        path: ["portions"],
        message: "Liczbę porcji można podać tylko dla wpisu utworzonego z przepisu",
      });
    }

    if (hasRecipe && !hasPortions) {
      // Formularz i tak wstawia 1, więc brak liczby porcji oznacza tu żądanie spoza interfejsu.
      ctx.addIssue({
        code: "custom",
        path: ["portions"],
        message: "Liczba porcji jest wymagana dla wpisu utworzonego z przepisu",
      });
    }

    // Wiersz z dwiema sprzecznymi ilościami nie ma prawa powstać: wpis z przepisu opisuje ilość
    // liczbą porcji, wpis opisowy - tekstem. `amount_text` jest tu już po transformacji, więc
    // pusty napis przyszedł do `superRefine` jako `null`.
    if (hasRecipe && value.amount_text !== null && value.amount_text !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["amount_text"],
        message: "Wpis utworzony z przepisu opisuje ilość liczbą porcji, nie tekstem",
      });
    }
  });

export type CreateDiaryEntrySchema = z.infer<typeof createDiaryEntrySchema>;
