<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Wpis dziennika z własnego przepisu z liczbą porcji

- **Plan**: `context/changes/recipe-entry-with-portions/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-25
- **Verdict**: REVISE → **SOUND** po triażu
- **Findings**: 2 krytyczne, 5 ostrzeżeń, 3 obserwacje — 9 naprawionych, 1 pominięte

## Verdicts

| Wymiar                     | Przed triażem | Po triażu |
| -------------------------- | ------------- | --------- |
| End-State Alignment        | WARNING       | PASS      |
| Lean Execution             | WARNING       | WARNING   |
| Architectural Fitness      | WARNING       | PASS      |
| Blind Spots                | FAIL          | PASS      |
| Plan Completeness          | WARNING       | PASS      |

`Lean Execution` zostaje na WARNING, bo F8 pominięto świadomie.

## Grounding

16/16 istniejących ścieżek ✓ (2 nowe pliki słusznie nieobecne) · 11/12 symboli ✓ — idiom typowanej
klasy błędu cytowany przy `openrouter.service.ts`, a klasa mieszka w
`src/lib/api/openrouter.types.ts:102` · brief↔plan ✓ · Progress↔Fazy ✓ (4/4 fazy, po triażu 36/36
kryteriów) · powierzchnie kontraktowe: `calorie_origin_enum` używane, nie przemianowane — bez
złamania.

## Findings

### F1 — Przycisk „Policz kalorie" zostaje na wierszu wpisu z przepisu

- **Severity**: ❌ CRITICAL · **Impact**: 🔎 MEDIUM · **Dimension**: Blind Spots
- **Location**: Implementation Approach + Faza 3 §3 / kryterium 3.7
- **Detail**: Plan usuwał z formularza „Zapisz i policz kalorie", bo trasa wyceny stempluje
  `ai_from_description`. `DiaryEntryCalories.tsx:182-187` rysuje „Policz kalorie" na każdym wierszu
  z `calories === null` — czyli dokładnie w stanie z kryterium 3.7.
- **Decision**: FIXED — wariant 4 (poza A/B): wycena **zostaje** wszędzie, także w formularzu.
  Odebranie jej zostawiłoby wpis „Nie policzono" bez żadnej opcji poza liczbą z palca.
  `ai_from_description` jest uczciwe, bo trasa faktycznie czyta edytowalne `content`. Koszt — brak
  skalowania przez `portions` — nazwany w planie i skierowany do `known-drift.md` (Faza 2 §7).
  Nowe kryterium 3.14.

### F2 — Podgląd mówi „z przepisu", serwer zapisuje „manual"

- **Severity**: ❌ CRITICAL · **Impact**: 🔎 MEDIUM · **Dimension**: End-State Alignment
- **Location**: Faza 2 §3 reguła 1 kontra Faza 3 §3
- **Detail**: Faza 3 czyściła `amount_text`, ale o polu kalorii milczała, a `toPayload` zawsze je
  wysyła. Liczba wpisana przed wyborem przepisu po cichu unieważniała całe wyliczenie.
- **Decision**: FIXED via Fix A — wybór przepisu chowa i czyści pole kalorii, jak `amount_text`.
  Reguła 1 zostaje kontraktem trasy, nie stanem osiągalnym z UI. Przy okazji poprawione dwa teksty
  podglądu, które obiecywały pole już nieistniejące. Nowe kryterium 3.13.

### F3 — Reguły parsera nierozstrzygnięte w dwóch miejscach

- **Severity**: ⚠️ WARNING · **Impact**: 🔎 MEDIUM · **Dimension**: Blind Spots
- **Location**: Faza 1 §1, reguły 2 i 3
- **Detail**: (a) „linia wyglądająca na nagłówek" nigdy nie zdefiniowana; (b) `kJ` pomijane bez
  powiedzenia, czy jednostką jest liczba czy linia — `Energia: 1046 kJ (250 kcal)` w jednej linii to
  jedyne miejsce, gdzie parser może zawyżyć ~4×.
- **Decision**: FIXED — predykat nagłówka: kończy się dwukropkiem **i** nie zawiera cyfry; `kJ`
  dyskwalifikuje **liczbę**, nie linię. Trzy nowe przypadki w liście testów.

### F4 — Testy serwisu wymagają pracy przy mocku, której plan nie przewidywał

- **Severity**: ⚠️ WARNING · **Impact**: 🔎 MEDIUM · **Dimension**: Plan Completeness
- **Location**: Testing Strategy + kryterium 2.2
- **Detail**: `createSupabaseStub` (`tests/unit/diary-service.test.ts:41-67`) ma jeden mock `from`
  ignorujący argument, więc `select`/`eq` z odczytu przepisu i z insertu wpisu trafiają do tego
  samego `jest.fn()`. Asercja „filtruje po `user_id`" przestaje być przypisywalna do zapytania.
- **Decision**: FIXED — nowa pozycja Faza 2 §6: builder kluczowany nazwą tabeli z aliasem na
  `diary_entries`, jawna warunkowość odczytu przepisu (dzięki niej 7 istniejących testów przechodzi)
  i promień rażenia `BASE_COMMAND` wraz z notą, że `DiaryEntryForm` nie nazywa typu, więc TypeScript
  tam nie ostrzeże.

### F5 — Obietnica sprzątania E2E nieprawdziwa dla pliku, który Faza 4 edytuje

- **Severity**: ⚠️ WARNING · **Impact**: 🏃 LOW · **Dimension**: Blind Spots
- **Location**: Faza 4 §2
- **Detail**: `CleanupService` wywołuje wyłącznie `recipe-management.spec.ts`. `diary-entry.spec.ts`
  nie ma `afterEach` ani `initializeCleanup`. Dodatkowo `deleteAllTestUserRecipes` kasuje wszystkie
  przepisy konta testowego, nie tylko z przebiegu.
- **Decision**: FIXED — Faza 4 §2 opisuje podpięcie sprzątania, ostrzega o kasowaniu wszystkiego
  i powtarza dyscyplinę dnia sygnaturowego oraz asercji na przyrost.

### F6 — Gałąź wartości ręcznej zapisywała niezweryfikowany `source_recipe_id`

- **Severity**: ⚠️ WARNING · **Impact**: 🏃 LOW · **Dimension**: Blind Spots
- **Location**: Faza 2 §3 reguła 1 kontra „Architecture / Approach"
- **Detail**: FK nie ma predykatu właściciela, RLS pilnuje tylko `user_id` — `POST` z `calories`
  i cudzym id przepisu zapisywał wiersz wskazujący nieczytelny dla właściciela przepis, wbrew
  deklaracji, że jedynym błędem tej ścieżki jest 404.
- **Decision**: FIXED — weryfikacja własności to krok 0, przed regułą pierwszeństwa. Kryterium 2.8
  rozszerzone o przypadek z `calories`.

### F7 — Nazwany dowód na FR-014 nie dotykał zmienianej gałęzi

- **Severity**: ⚠️ WARNING · **Impact**: 🏃 LOW · **Dimension**: Blind Spots
- **Location**: Implementation Approach + kryterium 4.2
- **Detail**: `recipe-management.spec.ts` nigdy nie wpisuje nic w wyszukiwarkę, więc nie wysyła
  `?search=` — jedynej przepisywanej gałęzi.
- **Decision**: FIXED via Fix A — dowód rozdzielony na dwie gałęzie w trzech miejscach; dopisany
  `cleanup.service.ts:26` jako drugi, nienazwany dotąd konsument trasy. Gałąź `?search=` ma wyłącznie
  ręczny krok 2.10 i jest to przyjęte świadomie.

### F8 — `limit=10` tnie po cichu, `total` przeprowadzony i nieużyty

- **Severity**: 💡 OBSERVATION · **Impact**: 🏃 LOW · **Dimension**: Lean Execution
- **Location**: Faza 2 §5, Faza 3 §1
- **Detail**: Faza 2 uzasadnia `count: "exact"` zdaniem „pokazano 10 z 23", którego kontrakt UI nigdy
  nie rysuje. Użytkownik z >10 pasującymi tytułami dostaje uciętą listę bez sygnału.
- **Decision**: SKIPPED

### F9 — „Domknięcie US-02" mówiło więcej, niż plaster domyka

- **Severity**: 💡 OBSERVATION · **Impact**: 🏃 LOW · **Dimension**: End-State Alignment
- **Location**: Overview, `change.md`, `plan-brief.md`
- **Detail**: Kryterium akceptacji US-02 o oszacowaniu z treści przepisu to FR-010, odłożone do S-04;
  roadmapa wymienia US-02 w PRD refs obu kawałków.
- **Decision**: FIXED — sformułowanie poprawione w trzech dokumentach.

### F10 — Aplikacja sama pisze większość przepisów, a plan tylko je czyta

- **Severity**: 💡 OBSERVATION · **Impact**: 🔎 MEDIUM · **Dimension**: Architectural Fitness
- **Location**: Open Risks + bramka ręczna Fazy 1
- **Detail**: `ai.service.ts:120` i `:232` proszą model o „wartości odżywcze" bez formatu. Plan ważył
  tylko „poszerz parser", nigdy „ogranicz producenta".
- **Decision**: FIXED via Fix A — bramka Fazy 1 ma teraz dwa środki: rozszerzenie listy (poprawia
  przeszłość) albo format w promptach (zamyka przyszłość), z rozstrzygnięciem po stronie właściciela.
