import { useEffect, useState } from "react";
import type { RecipeDto, RecipesDto } from "../../types";

/** Opóźnienie podpowiedzi, to samo co przy wyszukiwarce przepisów (`HomePage.tsx:47-55`). */
const SEARCH_DEBOUNCE_MS = 500;

/**
 * Próg, poniżej którego nie pytamy serwera. Jedna litera pasuje do niemal każdego tytułu, więc
 * żądanie i tak wróciłoby z listą uciętą do `SEARCH_LIMIT` przypadkowych trafień.
 */
const MIN_TERM_LENGTH = 2;

/** Ile podpowiedzi pokazujemy. Pełną liczbę trafień niesie `total`, nie długość listy. */
const SEARCH_LIMIT = 10;

interface UseRecipeSearchResult {
  recipes: RecipeDto[];
  /** Pełna liczba trafień, także gdy lista została ucięta do `SEARCH_LIMIT`. */
  total: number;
  isSearching: boolean;
  error: Error | null;
}

/** Wynik jednego zakończonego wyszukiwania, podpisany hasłem, dla którego powstał. */
interface SearchSnapshot {
  term: string;
  recipes: RecipeDto[];
  total: number;
  error: Error | null;
}

const EMPTY_SNAPSHOT: SearchSnapshot = { term: "", recipes: [], total: 0, error: null };

/**
 * Wyszukiwanie przepisów po tytule na potrzeby formularza dziennika.
 *
 * Osobny hook, a nie `useFetchRecipes`: tamten nie ma strażnika kolejności odpowiedzi, a wpisanie
 * go tam dotknęłoby ekranu przepisów, którego ta zmiana nie obejmuje.
 *
 * Migawka jest podpisana hasłem, dla którego powstała, i to porównanie - a nie kasowanie stanu
 * w efekcie - rozstrzyga, co hook oddaje. Dzięki temu wynik dla poprzedniego hasła nigdy nie
 * udaje wyniku dla bieżącego, a reset przy skróceniu hasła dzieje się w trakcie renderu
 * (`react-hooks/set-state-in-effect` jest `error`).
 *
 * Zwracamy pełne wiersze, nie same tytuły: podgląd wartości w formularzu czyta `content` wybranego
 * przepisu i drugie żądanie po ten sam tekst byłoby zbędne.
 */
export function useRecipeSearch(term: string): UseRecipeSearchResult {
  const [snapshot, setSnapshot] = useState<SearchSnapshot>(EMPTY_SNAPSHOT);

  const trimmed = term.trim();
  const isActive = trimmed.length >= MIN_TERM_LENGTH;

  useEffect(() => {
    if (!isActive) return;

    // Odpowiedź na poprzednie hasło nie może nadpisać bieżącego - przy szybkim pisaniu żądania
    // wracają w dowolnej kolejności (ten sam strażnik co w `useDiaryEntries.ts:29`).
    let isCurrent = true;

    const timeoutId = setTimeout(() => {
      const search = async () => {
        try {
          const params = new URLSearchParams({
            search: trimmed,
            search_field: "title",
            limit: String(SEARCH_LIMIT),
            sort: "title",
            order: "asc",
          });

          const response = await fetch(`/api/recipes?${params.toString()}`, {
            method: "GET",
            credentials: "include", // Ważne dla przesyłania cookies z sesją
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
          }

          const result: RecipesDto = await response.json();

          if (!isCurrent) return;

          setSnapshot({ term: trimmed, recipes: result.data, total: result.total, error: null });
        } catch (err) {
          if (!isCurrent) return;

          const message = err instanceof Error ? err.message : "Błąd podczas wyszukiwania przepisów";
          console.error("Error searching recipes:", err);

          setSnapshot({ term: trimmed, recipes: [], total: 0, error: new Error(message) });
        }
      };

      void search();
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      isCurrent = false;
      clearTimeout(timeoutId);
    };
  }, [trimmed, isActive]);

  // Migawka dla innego hasła jest dla tego renderu tak samo bezużyteczna jak jej brak - i tak samo
  // znaczy "jeszcze szukam".
  const isFresh = isActive && snapshot.term === trimmed;

  return {
    recipes: isFresh ? snapshot.recipes : [],
    total: isFresh ? snapshot.total : 0,
    isSearching: isActive && !isFresh,
    error: isFresh ? snapshot.error : null,
  };
}
