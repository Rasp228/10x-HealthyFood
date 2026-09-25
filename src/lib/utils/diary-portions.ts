/**
 * Zapis liczby porcji po polsku - jedna reguła dla listy dnia i dla podglądu w formularzu.
 *
 * Odmiana rzeczownika nie jest formatowaniem, tylko regułą z wyjątkiem: końcówka 2-4 bierze
 * "porcje", ale nastolatki (12-14) już nie. Ułamek idzie zawsze do "porcji" - mówimy
 * "0,5 porcji", nigdy "0,5 porcja".
 */

/** Rzeczownik odmieniony przez liczbę, którą opisuje. */
function portionNoun(portions: number): string {
  // Każda wartość ułamkowa czyta się dopełniaczem, niezależnie od tego, jak kończy się jej zapis.
  if (!Number.isInteger(portions)) return "porcji";

  if (portions === 1) return "porcja";

  const lastTwoDigits = portions % 100;
  const lastDigit = portions % 10;
  const isTeen = lastTwoDigits >= 12 && lastTwoDigits <= 14;

  if (!isTeen && lastDigit >= 2 && lastDigit <= 4) return "porcje";

  return "porcji";
}

/**
 * Liczba porcji gotowa do pokazania: separator dziesiętny po polsku i odmieniony rzeczownik.
 *
 * Przykłady: `1 porcja`, `2 porcje`, `5 porcji`, `13 porcji`, `22 porcje`, `0,5 porcji`.
 */
export function formatPortions(portions: number): string {
  return `${String(portions).replace(".", ",")} ${portionNoun(portions)}`;
}
