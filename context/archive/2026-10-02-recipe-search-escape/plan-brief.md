# Ucieczka terminu wyszukiwania przepisów — Plan Brief

> Full plan: `context/changes/recipe-search-escape/plan.md`

## What & Why

`GET /api/recipes` wkleja wpisany termin surowo w łańcuch PostgREST `or()`. Przecinek i nawiasy
rozbijają filtr (błąd 500), a `%`, `_` i `*` działają jak wieloznaczniki i cicho poszerzają wynik.
Spłacamy wpis „Trasy przepisów" z `docs/reference/known-drift.md`: wpisany tekst ma być szukany
dosłownie.

## Starting Point

Gałąź ogólna (`src/pages/api/recipes/index.ts:61-63`, ekran przepisów) składa
`title.ilike.%…%,content.ilike.%…%,additional_params.ilike.%…%` bez ucieczki. Gałąź
`search_field=title` (dziennik) używa `.ilike()` — chroni gramatykę, ale nie wieloznaczniki.
`postgrest-js` nie cytuje niczego w `.or()`; sam stosuje cytowanie `"…"` tylko w `.in()`.

## Desired End State

Termin z `,()"\` zwraca 200 i trafienia z tym tekstem. `%` i `_` są dosłowne w obu wyszukiwarkach,
`*` dopasowuje jeden dowolny znak. Obie gałęzie korzystają z jednego pomocnika z testami, a wpis
w `known-drift.md` znika.

## Key Decisions Made

| Decision                | Choice                                 | Why (1 sentence)                                                                          |
| ----------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------- |
| Wieloznaczniki `%` `_`  | Szukane dosłownie (ucieczka `\`)       | Wynik zgadza się z tym, co wpisał użytkownik — domyka „cicho poszerzony wynik".           |
| Gwiazdka `*`            | Mapowana na `_`                        | PostgREST zamienia `*` na `%`, więc `\*` dałoby dosłowny `%`; `_` to najwęższe dopasowanie. |
| Zakres                  | Obie gałęzie trasy                     | Ekran przepisów i dziennik szukają identycznie; jedna reguła w jednym miejscu.            |
| Gramatyka `or()`        | Cytowanie `"…"` z ucieczką `\` i `"`   | Ten sam mechanizm, którego `postgrest-js` używa w `.in()`.                                |
| Testy                   | Unit pomocnika + test trasy, bez E2E   | Szybkie i w CI; semantykę PostgREST potwierdza krok ręczny.                               |

## Scope

**In scope:**
- Nowy `src/lib/utils/recipe-search.ts` (`toContainsPattern`, `buildIlikeOrFilter`)
- Obie gałęzie `GET` w `src/pages/api/recipes/index.ts`
- `tests/unit/recipe-search.test.ts`, `tests/unit/recipes-route.test.ts`
- Usunięcie sekcji „Trasy przepisów" z `known-drift.md`; przeniesienie `parallel-check.md`

**Out of scope:**
- Przeniesienie logiki trasy do serwisu, wyciągnięcie `createRecipeSchema`
- Zmiany `listRecipesSchema`, `RecipesDto`, hooków, serwisu klienta
- Full-text search, RPC, migracje, scenariusz E2E
- Inne sekcje `known-drift.md` (równoległy `fix/ui-focus-ring`)

## Architecture / Approach

Dwa poziomy ucieczki w jednym module: najpierw wzorzec LIKE (`\%_` z ukośnikiem, `*` → `_`,
owinięcie `%…%`), potem — tylko dla `or()` — cytowanie każdej wartości. Przykład dla `100%`:
wzorzec `%100\%%`, człon `or()` → `title.ilike."%100\\%%"`. Trasa tylko wywołuje pomocnik;
kontrakt odpowiedzi bez zmian.

## Phases at a Glance

| Phase                                   | What it delivers                                  | Key risk                                                       |
| --------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------- |
| 1. Pomocnik, trasa i testy              | Ucieczka w obu gałęziach, przypięta testami       | Kolejność ucieczki (`*` → `_` nie może zostać uciekniętym `_`) |
| 2. Dokumentacja i weryfikacja na bazie  | Dryf usunięty, zachowanie PostgREST potwierdzone  | Cytowanie w `or()` / alias `*` zachowują się inaczej niż zakładamy |

**Prerequisites:** zalogowane konto na bazie developerskiej (`npm run dev`) do kroku ręcznego.
**Estimated effort:** ~1 sesja, 2 fazy.

## Open Risks & Assumptions

- Zakładamy, że PostgREST stosuje domyślny `ESCAPE '\'` dla `ilike` i honoruje cytowanie `"…"`
  w `or()` — potwierdza to krok 2.4–2.6.
- Zmiana zachowania jest celowa: terminy z `%`/`_`/`*` zwracają odtąd węższy wynik.
- Konflikt w `known-drift.md` z `fix/ui-focus-ring` rozwiązuje ten, kto merguje drugi.

## Success Criteria (Summary)

- Wyszukanie `Sos (pomidorowy), 100%` na ekranie przepisów działa i nie kończy się 500.
- `100%` nie znajduje `1000 g` — ani na ekranie przepisów, ani w dzienniku.
- `npm run test`, `typecheck`, `lint`, `format:check` zielone.
