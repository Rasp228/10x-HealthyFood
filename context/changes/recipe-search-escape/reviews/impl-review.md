<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Ucieczka terminu wyszukiwania przepisów

- **Plan**: context/changes/recipe-search-escape/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-02
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Bramki uruchomione w przeglądzie: `npm run test` (384/384), `npm run typecheck` (0 błędów), `npm run lint`, `npm run format:check`, `grep -c "Trasy przepisów" docs/reference/known-drift.md` = 0, a `parallel-check.md` leży w folderze zmiany. Kroki ręczne 2.4–2.7 potwierdził użytkownik po teście na żywym PostgREST.

## Findings

### F1 — Termin `search` bez limitu długości i bez odrzucania NUL

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/validations/recipe/list-recipes.ts (`search: z.string().optional()`)
- **Detail**: Problem istniał już przed tą zmianą i zmiana go nie dotyka. W gałęzi `or()` ucieknięty termin powtarza się trzy razy, a kodowanie procentowe zwiększa znaki spoza ASCII około sześciokrotnie. Termin o długości kilku KB może więc przekroczyć limit adresu na bramie PostgREST (414). Trasa przekazuje ten błąd dalej i użytkownik dostaje 500. Podobnie `\u0000` w terminie: PostgreSQL odrzuca go w typie `text` (22021), co też kończy się 500. Plan celowo nie rusza `listRecipesSchema` („What We're NOT Doing”), więc to temat na osobną zmianę.
- **Fix**: W osobnej zmianie dodać do `search` w `listRecipesSchema` `.max(200)` i odrzucanie NUL. Wtedy zamiast 500 wraca 400 przez `zodIssues`.
- **Decision**: FIXED — `search` ma teraz w `listRecipesSchema` `.max(200)` i odrzuca NUL. W `tests/unit/recipes-route.test.ts` są trzy nowe przypadki: 201 znaków → 400, NUL → 400, 200 znaków → 200. Testy zrobiły się czerwone przy celowo złamanym kodzie. Poprawka świadomie wykracza poza „What We're NOT Doing” planu, na decyzję użytkownika.

### F2 — `*` → `_` dopasowuje dowolny jeden znak

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/utils/recipe-search.ts:19
- **Detail**: `a*b` znajduje też `axb`. Plan przyjmuje to jako najwęższe możliwe zachowanie, bo PostgREST zamienia `*` na `%` (a `\*` stałoby się `\%`). Komentarz modułu to wyjaśnia. Ryzyko: ktoś później „naprawi” to na `\*`.
- **Fix**: Zmiana nie jest wymagana. Opcjonalnie nazwa testu dla `a*b` może mówić wprost, że to celowe („dowolny jeden znak, nie dosłowna gwiazdka”).
- **Decision**: FIXED — przypadek `a*b` wyjęty z tabeli do osobnego testu, którego nazwa mówi, że mapowanie jest celowe i dlaczego nie `\*`.
