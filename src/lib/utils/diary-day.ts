/**
 * Arytmetyka dnia dziennika. Dzień jest tu napisem `RRRR-MM-DD`, nigdy obiektem `Date`.
 *
 * `toISOString().slice(0, 10)` jest w tym pliku zakazane: zwraca dzień w UTC, więc w Warszawie
 * między 00:00 a 02:00 wskazałoby wczoraj. To dokładnie ta pomyłka, przed którą ostrzega
 * komentarz przy `entry_date` w migracji `20260922140906_create_diary_entries.sql` - tyle że
 * przeniesiona z serwera do przeglądarki. Dlatego "dziś" powstaje z lokalnych getterów,
 * a przesuwanie o dobę liczymy w UTC, gdzie doba zawsze ma 24 godziny (zmiana czasu potrafi
 * skrócić lub wydłużyć dobę lokalną i przesunąć wynik o cały dzień).
 */

const pad2 = (value: number): string => String(value).padStart(2, "0");
const pad4 = (value: number): string => String(value).padStart(4, "0");

/** Dzień kalendarzowy przeglądarki w formacie RRRR-MM-DD. */
export function toLocalDay(now: Date): string {
  return `${pad4(now.getFullYear())}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** Przesuwa dzień o `delta` dób, zachowując format RRRR-MM-DD. */
export function addDays(day: string, delta: number): string {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));

  const shifted = new Date(Date.UTC(year, month - 1, date + delta));

  return `${pad4(shifted.getUTCFullYear())}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

/** Czy `a` jest dniem późniejszym niż `b`. Format RRRR-MM-DD porządkuje się leksykograficznie. */
export function isAfter(a: string, b: string): boolean {
  return a > b;
}
