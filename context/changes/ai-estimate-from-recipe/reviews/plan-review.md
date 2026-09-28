<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Oszacowanie kalorii z treści przepisu

- **Plan**: context/changes/ai-estimate-from-recipe/plan.md
- **Mode**: Deep
- **Date**: 2026-09-28
- **Verdict**: SOUND
- **Findings**: 0 critical, 2 warnings, 3 observations

Przegląd wykonany po wdrożeniu Faz 1–2 i automatycznej części Fazy 3 — twierdzenia planu
sprawdzone bezpośrednio na kodzie.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
8/8 paths ✓, 4/4 symbols ✓ (estimateFromRecipe, applyEstimate(origin), readOwnRecipeContent public, AI_NOTICE_RECIPE), brief↔plan ✓, contract surfaces: Database (diary_entries, calorie_origin_enum) opisane zgodnie ze stanem, bez zmiany nazw ✓

## Findings

### F1 — Krok ręczny 6 nie da się wykonać tak, jak go opisano

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Testing Strategy → Manual Testing Steps, krok 6
- **Detail**: Wpis z kroku 3 jest już wyceniony. W stanie „valued” nie ma przycisku „Policz ponownie”, a trasa przy `calories !== null` kończy się bez modelu (estimate.ts:77). Gałąź „usunięty przepis → opis” nie miała ręcznej weryfikacji, którą da się przejść.
- **Fix**: Osobny, niewyceniony wpis → usuń przepis → „Policz kalorie” → „oszacowane z opisu”.
- **Decision**: FIXED — krok 6 rozbity na kroki 6–7

### F2 — Testy trasy i zmiana jest.setup są w kodzie, ale nie w planie

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 3 → Changes Required vs Testing Strategy
- **Detail**: Testing Strategy obiecywała testy mnożenia porcji i limitu 5000 kcal, a Faza 3 wymieniała tylko testy serwisów, które nie dosięgają trasy. Wdrożenie dodało samo `tests/unit/diary-estimate-route.test.ts` i warunek `typeof window` w `tests/setup/jest.setup.ts`.
- **Fix**: Punkt #5 w Fazie 3.
- **Decision**: FIXED — dopisano Fazę 3, punkt 5

### F3 — „null * cokolwiek to NaN” jest nieprawdą

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details, akapit 2; komentarz w estimate.ts
- **Detail**: W JS `null * x === 0`. Bez `?? 1` wpis po cichu dostałby 0 kcal z etykietą „oszacowane z przepisu”, a nie wywróciłby się na ograniczeniu bazy.
- **Fix**: Poprawić uzasadnienie w planie i w komentarzu.
- **Decision**: FIXED — plan i komentarz w `src/pages/api/diary-entries/[id]/estimate.ts`

### F4 — Nie ustalono, którą wersję przepisu czyta wycena

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Implementation Approach / D2
- **Detail**: Wycena czyta treść przepisu w chwili kliknięcia, a nie w chwili utworzenia wpisu. Plan tego nie deklarował.
- **Fix**: Jedno zdanie w Implementation Approach.
- **Decision**: FIXED

### F5 — Tytuły 1.5 i 1.6 w Progress nie są kopią kryteriów

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Progress → Phase 1, Manual
- **Detail**: Tytuły różniły się od kryteriów pogrubieniem i nawiasem.
- **Fix**: Wyrównać tytuły.
- **Decision**: FIXED
