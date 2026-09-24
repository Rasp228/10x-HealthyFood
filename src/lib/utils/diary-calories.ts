/**
 * Zamiana tego, co użytkownik wpisał w pole kalorii, na liczbę dla schematu.
 *
 * Puste pole to brak wartości, nie zero. Poza tym `Number` czyta więcej form liczby, niż to pole
 * kiedykolwiek miało przyjmować: "1e3" cicho robi się 1000 kcal, a "0x1f" - 31, i jedno i drugie
 * przechodzi potem każdą kontrolę schematu. Cyfry i tylko cyfry; wszystko inne zwracamy jako NaN,
 * żeby schemat odrzucił to tym samym komunikatem co "abc".
 *
 * Wspólne dla formularza nowego wpisu i dla pola przy wpisie na liście: dwie kopie tej reguły
 * rozjechałyby się przy pierwszej zmianie, a rozjazd byłby widoczny dopiero w odpowiedzi serwera.
 */
export const parseCalories = (raw: string): number | null => {
  const trimmed = raw.trim();

  if (trimmed === "") return null;

  return /^[0-9]{1,5}$/.test(trimmed) ? Number(trimmed) : Number.NaN;
};

/** Droga powrotna: wartość z wiersza jako zawartość pola tekstowego. Brak liczby to puste pole. */
export const formatCalories = (calories: number | null): string => (calories === null ? "" : String(calories));
