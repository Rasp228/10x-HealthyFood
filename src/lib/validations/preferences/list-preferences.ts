import { z } from "zod";
import { preferenceCategorySchema } from "./upsert-preference";

/**
 * Pusty albo biały parametr adresu (`?limit=`) traktujemy jak nieobecny. Bez tego `z.coerce`
 * zamienia `""` na 0, które przechodzi zakres, a trasa zwraca pustą listę zamiast domyślnej strony.
 */
const blankToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

/**
 * Schemat parametrów `GET /api/preferences`.
 *
 * Koercja, bo parametry adresu przychodzą jako tekst. Zakres `limit` 0-50 jest taki sam jak przed
 * przeniesieniem schematu do `src/lib/validations/`; doszedł tylko wymóg liczby całkowitej, bo
 * `limit` i `offset` wyznaczają granice `range()`.
 */
export const listPreferencesSchema = z.object({
  category: preferenceCategorySchema.optional(),
  limit: z.preprocess(
    blankToUndefined,
    z.coerce
      .number("Limit musi być liczbą")
      .int("Limit musi być liczbą całkowitą")
      .min(0, "Limit nie może być ujemny")
      .max(50, "Limit może wynosić najwyżej 50")
      .optional()
  ),
  offset: z.preprocess(
    blankToUndefined,
    z.coerce
      .number("Offset musi być liczbą")
      .int("Offset musi być liczbą całkowitą")
      .min(0, "Offset nie może być ujemny")
      .optional()
  ),
});

export type ListPreferencesSchema = z.infer<typeof listPreferencesSchema>;
