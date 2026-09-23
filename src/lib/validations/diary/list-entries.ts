import { z } from "zod";
import { entryDateSchema } from "./create-entry";

/**
 * Schemat parametrów listowania dnia dziennika.
 *
 * `date` jest wymagana i nigdy nie jest domyślana po stronie serwera: to przeglądarka wie,
 * który dzień jest "dzisiaj" dla użytkownika. Brak lub błędny parametr to 400, nie cicha
 * podmiana na dzień serwera.
 */
export const listDiaryEntriesSchema = z.object({
  date: entryDateSchema,
});

export type ListDiaryEntriesSchema = z.infer<typeof listDiaryEntriesSchema>;
