# Parallel check — `fix/recipe-search-escape`

> Po `/10x-new` przenieś ten plik do `context/changes/<change-id>/parallel-check.md`.
> Przygotowane 2026-10-01, przed rozwidleniem z `master` @ `f3f3537`.

## Ten slice

Termin `search` wklejany surowo w łańcuch PostgREST `or()` — `src/pages/api/recipes/index.ts`
(gałąź `else` przy `query.or(...)`). Opis luki: `docs/reference/known-drift.md`, „Trasy przepisów".

## Slice równoległy

`fix/ui-focus-ring` (worktree `../Szkolenie-focus-ring`) — pierścień fokusu ≥ 3:1 w prymitywach
`src/components/ui/{button,input,textarea,badge}.tsx`.

## Punkty styku

| Obszar | Ten slice | Slice równoległy | Wspólne? |
|---|---|---|---|
| Pliki kodu | `src/pages/api/recipes/index.ts`, nowy test w `tests/unit/` | `src/components/ui/*.tsx`, ew. komentarz w `src/styles/global.css` | nie |
| Dokumentacja | usuwa sekcję „Trasy przepisów" z `known-drift.md` | usuwa sekcję „Prymitywy UI" z `known-drift.md` | **tak — `docs/reference/known-drift.md`** |
| Kontrakty | kształt odpowiedzi `RecipesDto`, `list-recipes.ts` — bez zmian | API wariantów `cva` — bez zmian | nie |
| Konsumenci | `useRecipes.ts` (ekran przepisów); `useRecipeSearch.ts` (dziennik) idzie gałęzią `search_field=title` i fixu nie dotyka | 20 plików importujących prymitywy — tylko wygląd | nie |
| Migracje | brak | brak | nie |
| Usługi zewnętrzne | Supabase (zapytania) | brak | E2E obu na tej samej bazie testowej |

## Zasady na czas równoległej pracy

- `known-drift.md`: ruszaj **tylko** sekcję „Trasy przepisów". Kto merguje drugi, robi rebase
  i rozwiązuje konflikt.
- Nie poprawiaj przy okazji inline Zod w `recipes/index.ts` (inny wpis drift) — osobna zmiana.
- E2E równolegle: inny port niż drugi worktree, np. `E2E_PORT=3101`.
