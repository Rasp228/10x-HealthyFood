import { z } from "zod";
import { preferenceCategorySchema } from "./upsert-preference";

/**
 * Schemat parametrów `GET /api/preferences`.
 *
 * Koercja, bo parametry adresu przychodzą jako tekst. Zakres `limit` 0-50 jest taki sam jak przed
 * przeniesieniem schematu do `src/lib/validations/`; doszedł tylko wymóg liczby całkowitej, bo
 * `limit` i `offset` wyznaczają granice `range()`.
 */
export const listPreferencesSchema = z.object({
  category: preferenceCategorySchema.optional(),
  limit: z.coerce
    .number("Limit musi być liczbą")
    .int("Limit musi być liczbą całkowitą")
    .min(0, "Limit nie może być ujemny")
    .max(50, "Limit może wynosić najwyżej 50")
    .optional(),
  offset: z.coerce
    .number("Offset musi być liczbą")
    .int("Offset musi być liczbą całkowitą")
    .min(0, "Offset nie może być ujemny")
    .optional(),
});

export type ListPreferencesSchema = z.infer<typeof listPreferencesSchema>;
