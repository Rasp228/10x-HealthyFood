/**
 * Ucieczka terminu wyszukiwania przepisów - dwa poziomy, każdy z własną gramatyką.
 *
 * 1. Wzorzec LIKE. `%` i `_` są w `ilike` wieloznacznikami, a `\` to domyślny znak ucieczki LIKE
 *    w PostgreSQL. Uciekamy więc `\` -> `\\`, `%` -> `\%`, `_` -> `\_` i owijamy wynik w `%…%`,
 *    żeby termin znaczył „zawiera dosłownie". Dodatkowo `*` -> `_`: PostgREST zamienia `*` na `%`
 *    w filtrach like/ilike, więc `\*` dałoby `\%` (dosłowny procent, nie gwiazdkę). `_` dopasowuje
 *    gwiazdkę niezależnie od tego, czy ten alias działa także wewnątrz cytowanej wartości.
 * 2. Gramatyka `or()` PostgREST. Przecinek rozdziela ogniwa, nawiasy otwierają grupy, więc każdą
 *    wartość owijamy w `"…"`, uciekając w niej `\` -> `\\` i `"` -> `\"`. Ten poziom dotyczy tylko
 *    napisu dla `.or()` - `.ilike(kolumna, wzorzec)` przekazuje wartość osobnym parametrem.
 *
 * Moduł nie zna Supabase: przyjmuje i zwraca napisy.
 */

/** Zamienia termin na wzorzec LIKE „zawiera dosłownie". Termin nie jest przycinany - to robi trasa. */
export function toContainsPattern(term: string): string {
  // Jedno przejście, żeby `*` -> `_` nie zostało potem ucieknięte jako `\_`.
  const escaped = term.replace(/[\\%_*]/g, (ch) => (ch === "*" ? "_" : `\\${ch}`));

  return `%${escaped}%`;
}

/** Składa warunek `or()` z `ilike` na każdej kolumnie, z wartością cytowaną w gramatyce PostgREST. */
export function buildIlikeOrFilter(columns: readonly string[], pattern: string): string {
  const quoted = `"${pattern.replace(/[\\"]/g, (ch) => `\\${ch}`)}"`;

  return columns.map((column) => `${column}.ilike.${quoted}`).join(",");
}
