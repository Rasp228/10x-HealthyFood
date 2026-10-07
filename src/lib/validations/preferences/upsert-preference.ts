import { z } from "zod";
import { Constants } from "../../../db/database.types";

/**
 * Kategoria preferencji - cztery polskie wartości `preference_category_enum`, czytane z `Constants`,
 * żeby schemat nie trzymał własnej kopii listy. Wartości idą do bazy tak, jak są.
 */
export const preferenceCategorySchema = z.enum(
  Constants.public.Enums.preference_category_enum,
  "Nieprawidłowa kategoria preferencji"
);

/**
 * Wartość preferencji. Sufit 50 to literał kolumny `value varchar(50) check (char_length(value) <= 50)`
 * z `20250427130913_healthymeal_schema.sql` - zmiana tutaj bez migracji (albo odwrotnie) zamienia
 * 400 w 500. `trim()` przed `min(1)`: wartość z samych spacji nic nie opisuje, a ta sama wartość
 * ze spacjami wokół trafia na ten sam unikat `(user_id, category, value)`.
 */
export const preferenceValueSchema = z
  .string("Wartość preferencji musi być tekstem")
  .trim()
  .min(1, "Wartość preferencji jest wymagana")
  .max(50, "Wartość preferencji może mieć najwyżej 50 znaków");

/** Schemat ciała `POST /api/preferences` i `PUT /api/preferences/:id` - oba zapisują całą parę. */
export const upsertPreferenceSchema = z.object({
  category: preferenceCategorySchema,
  value: preferenceValueSchema,
});

export type UpsertPreferenceSchema = z.infer<typeof upsertPreferenceSchema>;
