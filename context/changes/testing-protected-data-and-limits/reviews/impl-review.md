<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Dane chronione i twarde limity — plan wdrożenia (faza 3 test-planu)

- **Plan**: context/changes/testing-protected-data-and-limits/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-10-07
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

Bramki automatyczne (uruchomione 2026-10-07): `npm run test` 30/30 suit, 628/628 testów; `npm run typecheck` 0 błędów; `npm run lint` czysto; `npm run format:check` czysto.

## Findings

### F1 — PUT /api/recipes/:id bez testu izolacji właściciela

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/unit/recipes-route.test.ts:235-249 (seed bloku „zapis przepisów - sufity bazy na serwerze”)
- **Detail**: Seed bloku POST/PUT ma wiersz tylko jednego właściciela. Gdyby z UPDATE w `src/pages/api/recipes/[id].ts` zniknęło `.eq("user_id", user.id)`, każdy przypadek bloku nadal by przechodził. Trasa jest dziś poprawna, brakuje tylko strażnika; DELETE (`:178`) i PUT preferencji (`preferences-route.test.ts:294`) taki przypadek mają.
- **Fix**: Dodać przypadek „PUT B na przepisie A → 404, wiersz A nietknięty (snapshot)”, z drugim właścicielem w seedzie.
- **Decision**: FIXED — dodany test „PUT na cudzym przepisie → 404, cudzy wiersz nietknięty”; kontrola wyroczni: bez `.eq("user_id")` czerwony

### F2 — Pusty `limit` w GET /api/preferences daje pustą listę z 200

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/validations/preferences/list-preferences.ts:12-17
- **Detail**: `z.coerce.number()` zamienia `?limit=` i `?limit=%20` na `0`; `0` przechodzi `.min(0)`, domyślne 50 się nie stosuje, a trasa woła `.range(offset, offset - 1)` → 200 `{ data: [], total: N }`. Koercja przyjmuje też `0x10` (16) i `1e1` (10). Zachowanie istniało przed zmianą (przeniesione 1:1, plan: „zakres jak dziś”); UI nie wysyła dziś parametrów. Kłóci się jednak z celem fazy „każdy limit kończy się 400”.
- **Fix**: Zamienić pusty / biały napis na `undefined` przed koercją (`z.preprocess`) albo podnieść dolną granicę do `.min(1)` jak w `list-recipes.ts`; dopisać `limit=""` do `it.each` w `preferences-route.test.ts`.
- **Decision**: FIXED — `z.preprocess(blankToUndefined, …)` dla `limit` i `offset`; testy `?limit=`, `?limit=%20`, `?offset=`, `?limit=&offset=` → 200 z domyślną stroną (bez poprawki 3 z 4 czerwone)

### F3 — Cookbook §6.5 obiecuje przypadki id, których suita nie ma

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/test-plan.md:308; tests/unit/recipes-route.test.ts; tests/unit/preferences-route.test.ts:352
- **Detail**: §6.5 mówi „Dla każdej trasy także: … identyfikator `"12abc"`, `"0"` i 2147483648 → 400”. Przepisy mają tylko 2147483648 (GET/PUT/DELETE), bez `"12abc"` i `"0"`; DELETE preferencji nie ma `"0"`. Kod jest poprawny (wszystkie trasy idą przez `positiveIdParamSchema`), ale cookbook — źródło dla `/10x-tdd` — opisuje więcej, niż suita pilnuje.
- **Fix**: Rozszerzyć `it.each` id w obu plikach o brakujące wartości (`"12abc"`, `"0"`).
- **Decision**: FIXED — przepisy: GET/PUT/DELETE × `"12abc"`, `"0"`, 2147483648 (blok „nieprawidłowy identyfikator przepisu”); DELETE preferencji: dodane `"0"`

### F4 — Kryterium ręczne 3.5 odhaczone, choć nie zostało spełnione

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/testing-protected-data-and-limits/plan.md:538
- **Detail**: Progress 3.5 („duplikat pokazuje toast „Taka preferencja już istnieje””) jest `[x]`, a kod (`src/components/profile/ProfilePage.tsx:106` `setFormError`) i wpis „Preferencje” w `known-drift.md` mówią, że komunikat pojawia się w linii pod polem, a przy edycji tylko ogólny toast. Odstępstwo zostało świadomie przyjęte w known-drift, ale checkbox tego nie mówi.
- **Fix**: Dopisać przy 3.5 adnotację „spełnione w zmienionej formie: komunikat w linii (`role="alert"`), nie toast — patrz known-drift „Preferencje””.
- **Decision**: FIXED — adnotacja pod 3.5 w Progress planu (forma w linii, odsyłacz do known-drift „Preferencje”)

### F5 — Status §3 test-planu zmieniony w commicie implementacji; wiersz fazy 3 nieaktualny

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/foundation/test-plan.md:68 (commit ba1e2f3)
- **Detail**: Commit p2 przestawił §3 (faza 2 → `complete`, faza 3 → `change opened`), choć statusy należą do orkiestratora `/10x-test-plan`. Wiersz fazy 3 stoi na `change opened`, mimo że cały Progress jest `[x]`.
- **Fix**: Zostawić korektę orkiestratorowi — następne `/10x-test-plan` oznaczy wiersz jako `complete`.
- **Decision**: ACCEPTED — korektę statusu §3 zostawiamy orkiestratorowi `/10x-test-plan`

### F6 — Słabości atrapy `supabase-tables.ts`, które mogą dać zielony test bez dowodu

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/helpers/supabase-tables.ts:17,106-193,164-168,203
- **Detail**: (a) Nieobsługiwana metoda (`.or`, `.ilike`, `.in`) rzuca `TypeError`, który `catch` trasy zamienia w 500 — test asertujący tylko „500 i tabele bez zmian” przeszedłby z niewłaściwego powodu (dzisiejsze testy 500 sprawdzają też konkretny błąd w `console.error`, więc są bezpieczne). (b) Filtry porównują `===`, więc wiersz seeda bez kolumny nie trafi w `.is(col, null)`, a `eq("id", "5")` nie trafi w `5` — asercja „nic się nie zmieniło” byłaby pusta. Dzisiejsze seedy są kompletne.
- **Fix**: W nagłówku helpera zapisać, że test 500 musi asertować zalogowany błąd, a w `is(col, null)` traktować `undefined` jak `null`.
- **Decision**: FIXED — notka w nagłówku helpera (test 500 asertuje błąd z `console.error`); `is()` zapisuje operator i dopasowuje brak kolumny jako `null`

### F7 — `offset` poza końcem listy prawdopodobnie daje 500

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/preferences/index.ts:47-52
- **Detail**: `offset` nie ma sufitu; PostgREST przy `count: "exact"` i offsecie za końcem odpowiada najpewniej PGRST103 (416), który trasa zamienia w 500 (teraz ze stałym ciałem). Niesprawdzone na żywym PostgREST — atrapa tnie po cichu. Zachowanie sprzed zmiany; UI nie wysyła `offset`.
- **Fix**: Po potwierdzeniu zmapować PGRST103 na 200 z pustą listą; do tego czasu nic.
- **Decision**: SKIPPED

### F8 — AGENTS.md nadal twierdzi, że alias `@tests/*` jest w jest.config.js

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: AGENTS.md (sekcja „Code style”, akapit o aliasach); jest.config.js `moduleNameMapper`
- **Detail**: Plan sam to odkrył („Key Discoveries”) i słusznie nie dodał aliasu, ale fałszywe zdanie w AGENTS.md zostało. Kolejny agent zaimportuje `@tests/helpers/...` i dostanie błąd dopiero w Jest. To samo w `contract-surfaces.md` („Path aliases”).
- **Fix**: Poprawić AGENTS.md i contract-surfaces.md: `@tests/*` jest tylko w `tsconfig.json`, w testach Jest importować helpery ścieżką względną.
- **Decision**: FIXED — AGENTS.md („Code style”) i contract-surfaces.md („Path aliases”) mówią teraz, że `@tests/*` jest tylko w tsconfig.json
