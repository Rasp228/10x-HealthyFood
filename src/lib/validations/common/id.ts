import { z } from "zod";

/**
 * Największa wartość kolumny `serial` / `integer` (int4) w Postgresie.
 *
 * Identyfikator spoza tego zakresu nie jest żadnym wierszem, ale bez sufitu w schemacie dociera do
 * PostgREST, który odrzuca go błędem zakresu - i trasa oddaje 500 tam, gdzie poprawne było 400.
 */
export const MAX_INT4_ID = 2147483647;

/** Komunikaty schematu identyfikatora - każda trasa nazywa swój zasób własnymi słowami. */
export interface PositiveIdMessages {
  /** Parametru nie ma (albo nie jest napisem). */
  required: string;
  /** Napis nie składa się z samych cyfr. */
  format: string;
  /** Same cyfry, ale wartość poza `1..MAX_INT4_ID`. */
  invalid: string;
}

/**
 * Dodatni identyfikator int4 czytany z parametru ścieżki.
 *
 * Parametr ścieżki jest napisem (albo go nie ma), więc walidacja zaczyna się od kształtu, a nie
 * od `parseInt`: `parseInt("12abc")` oddaje 12 i cicho przepuszcza adres, którego nikt nie
 * zamierzał obsłużyć. Sufit `MAX_INT4_ID` domyka górną stronę i zarazem trzyma wartość w zakresie
 * bezpiecznej liczby - dłuższy napis cyfr daje liczbę ponad sufitem, więc odpada tą samą regułą.
 */
export const positiveIdParamSchema = (messages: PositiveIdMessages) =>
  z
    .string(messages.required)
    .regex(/^\d+$/, messages.format)
    .transform((value) => Number(value))
    .refine((value) => value > 0 && value <= MAX_INT4_ID, messages.invalid);
