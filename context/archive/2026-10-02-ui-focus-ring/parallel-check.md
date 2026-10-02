# Parallel check — `fix/ui-focus-ring`

> Po `/10x-new` przenieś ten plik do `context/changes/<change-id>/parallel-check.md`.
> Przygotowane 2026-10-01, przed rozwidleniem z `master` @ `f3f3537`.

## Ten slice

Pierścień fokusu w jasnym motywie poniżej 3:1 (WCAG 1.4.11) — prymitywy
`src/components/ui/{button,input,textarea,badge}.tsx` rysują `focus-visible:ring-[3px] ring-ring/50`.
Opis i ograniczenia (token sam tego nie naprawi): `docs/reference/known-drift.md`, „Prymitywy UI".
Wejście przez `/10x-ui` — to zmiana wizualna.

## Slice równoległy

`fix/recipe-search-escape` (worktree `../Szkolenie-search-escape`) — uciekanie frazy `search`
w `src/pages/api/recipes/index.ts`.

## Punkty styku

| Obszar | Ten slice | Slice równoległy | Wspólne? |
|---|---|---|---|
| Pliki kodu | `src/components/ui/*.tsx`, ew. komentarz `--ring` w `src/styles/global.css` | `src/pages/api/recipes/index.ts`, nowy test w `tests/unit/` | nie |
| Dokumentacja | usuwa sekcję „Prymitywy UI" z `known-drift.md` | usuwa sekcję „Trasy przepisów" z `known-drift.md` | **tak — `docs/reference/known-drift.md`** |
| Kontrakty | API wariantów `cva` (nazwy `variant`/`size`) — bez zmian | `RecipesDto` — bez zmian | nie |
| Konsumenci | 20 plików importujących prymitywy — zmienia się tylko wygląd fokusu | ekran przepisów | nie |
| Migracje | brak | brak | nie |
| Usługi zewnętrzne | brak | Supabase | E2E obu na tej samej bazie testowej |

## Zasady na czas równoległej pracy

- `known-drift.md`: ruszaj **tylko** sekcję „Prymitywy UI". Kto merguje drugi, robi rebase
  i rozwiązuje konflikt.
- Poza zakresem: ręcznie stylowane pola i linki z fokusem w `HomePage.tsx`, `404.astro`,
  `recipes/[id].astro` — nie są prymitywami; ewentualnie osobna zmiana.
- Kitchen sink `/dev/diary-states` to dobre miejsce na zrzuty fokusu przed/po.
- E2E równolegle: inny port niż drugi worktree, np. `E2E_PORT=3102`.
