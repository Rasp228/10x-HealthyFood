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

/**
 * Zamiana tego, co użytkownik wpisał w pole porcji, na liczbę dla schematu.
 *
 * Ta sama ostrożność co w `parseCalories`: `Number` czyta więcej form liczby, niż to pole miało
 * kiedykolwiek przyjmować ("1e3" cicho robi się tysiącem porcji). Przepuszczamy więc wyłącznie
 * cyfry z opcjonalną częścią dziesiętną, a resztę zwracamy jako NaN - i celowo nie sprawdzamy tu
 * ani zakresu, ani liczby miejsc po przecinku, żeby to `portionsSchema` powiedziało, co dokładnie
 * jest nie tak. Wspólne dla formularza nowego wpisu i modala edycji: dwie kopie tej reguły
 * rozjechałyby się przy pierwszej zmianie.
 */
export const parsePortions = (raw: string): number | null => {
  const trimmed = raw.trim();

  if (trimmed === "") return null;

  return /^[0-9]+([.,][0-9]+)?$/.test(trimmed) ? Number(trimmed.replace(",", ".")) : Number.NaN;
};

/** Droga powrotna: liczba porcji z wiersza jako zawartość pola tekstowego, z polskim przecinkiem. */
export const formatPortionsInput = (portions: number | null): string =>
  portions === null ? "" : String(portions).replace(".", ",");
