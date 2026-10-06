<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Granice sesji i dostępu (faza 2 test-planu) — plan implementacji

- **Plan**: context/changes/testing-session-and-access-boundaries/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-10-06
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING (1 observation) |
| Safety & Quality | WARNING (3 warnings, 1 observation) |
| Architecture | PASS |
| Pattern Consistency | WARNING (2 observations) |
| Success Criteria | PASS |

Automatyczne kryteria uruchomione ponownie 2026-10-06: `test` 27/27 suit, 525/525 testów; `lint` bez
błędów; `typecheck` 0 błędów / 0 ostrzeżeń; `format:check` OK; `grep -c "TBD — see §3 Phase 2"` → 0.
E2E nie uruchamiane w przeglądzie; 4.5 (CI `e2e-tests`) potwierdzone przez użytkownika. Kod produkcyjny
nietknięty (`git diff d0062c8^..HEAD -- src/ supabase/ .github/` pusty). Każdy z sześciu
`test.failing`/`it.failing` pada na asercji opisanego defektu, nie na harnessie. Commity `chore(deps)`
(`56bbeba`, `0936f73`) leżą poza tą zmianą i nie były oceniane.

## Findings

### F1 — Test „odpowiedź na przepis A nie zdradza jego treści” nie może się zaczerwienić

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/unit/diary-entries-route.test.ts:109-113
- **Detail**: Żadna gałąź trasy POST ani `DiaryService.createEntry` nie wkłada treści przepisu do odpowiedzi. Po usunięciu `.eq("user_id", …)` z `readOwnRecipeContent` trasa daje 201 z wpisem (`content: "Obiad z przepisu"`), a test dalej przechodzi. §6.3 test-planu podaje, że kontrola wyroczni „czerwieniła 4 testy” — to właśnie pozostałe cztery. Przypadek „ciało odpowiedzi nie zawiera treści rekordu A” z §6.3 niczego dziś nie pilnuje.
- **Fix**: Dopisać `expect(response.status).toBe(404)` przed asercją na treści (albo usunąć test i przypadek z §6.3).
- **Decision**: FIXED — asercja 404 dopisana; kontrola wyroczni (usunięty filtr `user_id`) czerwieni test, przywrócone; §6.3 „czerwieni 5 testów”

### F2 — Krok 6 e2e sprawdza API i stronę na jednym kontekście odtworzenia

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/session-boundaries.spec.ts:81-94
- **Detail**: `GET /diary`, `GET /api/user-settings` i `page.goto("/")` idą przez ten sam `replayContext`. `context.request` zapisuje `Set-Cookie` z odpowiedzi do słoika kontekstu, a middleware po nieudanym `getUser` (unieważniona sesja) wypuszcza przez `flushCookies` ciasteczka kasujące. Drugie i trzecie sprawdzenie mogą więc biec już bez odtworzonych ciasteczek i przejść trywialnie — dowód granicy API (D2, „trasa API nie ma drugiej linii obrony”) jest szczelny tylko dla pierwszego żądania.
- **Fix**: Każde z trzech sprawdzeń w osobnym świeżym kontekście z `cookiesBeforeLogout` (helper `contextWithCookies` już istnieje).
- **Decision**: FIXED — helper `withReplayedCookies` (kontekst na sprawdzenie, zamykany w `finally`), cztery sprawdzenia w osobnych kontekstach; spec zielony lokalnie (`E2E_PORT=3100`); §6.4 zaktualizowany

### F3 — Globalne wylogowanie konta testowego uderza w równoległe przebiegi e2e

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/session-boundaries.spec.ts:5-20, 72-78; .github/workflows/ci-cd.yml:25-27
- **Detail**: `signOut()` z zakresem `global` unieważnia wszystkie sesje `E2E_USERNAME`. Komentarz nagłówka rozważa tylko `workers: 1` w jednym przebiegu. Grupa `concurrency` w CI to `${{ github.workflow }}-${{ github.ref }}`, więc przebiegi z różnych gałęzi/PR (i lokalne `npm run test:e2e` na tym samym projekcie `integration`) biegną równolegle na jednym koncie. Spec z innego przebiegu, który jest w trakcie sesji, dostanie przekierowanie na `/auth/login` — sporadyczny czerwony, trudny do skojarzenia z tym specem.
- **Fix A ⭐ Recommended**: Opisać efekt między przebiegami w komentarzu specu i w §6.4, a dedykowane konto zapisać jako follow-up
  - Strength: Bez zmian CI i sekretów (plan wprost wyklucza zmiany w `ci-cd.yml`); kto zobaczy flaka, znajdzie przyczynę.
  - Tradeoff: Ryzyko flaka zostaje, tylko jest nazwane.
  - Confidence: HIGH — dziś jeden zespół, mało równoległych gałęzi.
  - Blind spot: Nie sprawdzono, jak często w praktyce biegną równoległe pipeline'y.
- **Fix B**: Osobne konto testowe tylko dla tego specu (nowe `E2E_LOGOUT_USERNAME`/`PASSWORD` w `.env.test` i sekretach CI)
  - Strength: Usuwa interferencję u źródła.
  - Tradeoff: Nowe sekrety, zmiana `test-data.ts` i workflow — poza zakresem planu („What We're NOT Doing”, D4).
  - Confidence: MED — wymaga konta w Supabase `integration`, którego nie ma.
  - Blind spot: Kto zarządza kontami w środowisku `integration`.
- **Decision**: FIXED via Fix A — efekt między przebiegami opisany w nagłówku specu i w §6.4; osobne konto w `follow-ups/review-fixes.md`

### F4 — Wyrocznie 404 dla DELETE przepisu nie zrobią się czerwone po planowanej naprawie

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/unit/recipes-route.test.ts (describe „DELETE /api/recipes/:id”, atrapa ok. l. 115-130)
- **Detail**: Stanowa atrapa nie ma `select()` po `delete().eq().eq()`. Kierunek naprawy z `known-drift.md` to `.select("id")`; po nim trasa rzuci TypeError → 500, a oba `test.failing` (oczekujące 404) dalej „przejdą”. To przeczy zdaniu „Po naprawie zrobią się czerwone” w komentarzu testu i w `known-drift.md`. Naprawy nie przeoczy się, bo kontrola pozytywna `it` (200 dla A) zaczerwieni się — ale naprawiający musi najpierw rozbudować atrapę.
- **Fix**: Dodać do łańcucha DELETE w atrapie `select()` zwracające usunięte wiersze (`data: [{ id }]`), tak żeby wyrocznie przełączyły się na czerwone dokładnie przy naprawie.
- **Decision**: FIXED — `select()` w atrapie oddaje usunięte wiersze; symulowana naprawa trasy (`.select("id")` + 404 przy pustej liście) czerwieni oba `test.failing`, test stanu i kontrola pozytywna zostają zielone; trasa przywrócona

### F5 — Edycja zamrożonego §2 test-planu w commicie fazy 1

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/foundation/test-plan.md §2 (wiersze #3, #4), commit d0062c8
- **Detail**: `d0062c8` doprecyzował wiersze ryzyk #3 i #4 w §2, a CLAUDE.md traktuje §1–§5 jako zamrożone (zmiany strategii idą przez `/10x-test-plan --refresh`). To doprecyzowania z researchu, nie zmiana priorytetów; faza 5 sama §1–§5 nie ruszała.
- **Fix**: Zaakceptować jako doprecyzowanie i przy następnym `/10x-test-plan --refresh` potwierdzić brzmienie §2 #3/#4.
- **Decision**: ACCEPTED — doprecyzowanie z researchu; brzmienie §2 #3/#4 do potwierdzenia przy następnym `--refresh`

### F6 — Docblock „`test.failing` celowo” stoi nad zwykłym `it`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/unit/middleware.test.ts:274-288
- **Detail**: Komentarz opisujący `test.failing` (i „po zakodowaniu… zamień go na zwykłe `it`”) poprzedza `it("…dziś wywraca przekierowanie… (obecne zachowanie)")`, a właściwy `it.failing` w l. 288 nie ma komentarza. Czytający zamieni nie ten test. Przypadek F (wyjątek) i pin defektu to uzasadniony dodatek do fazy 1 — tylko układ komentarza jest mylący.
- **Fix**: Rozbić komentarz: nad `it` „obecne zachowanie — usuń po naprawie”, nad `it.failing` „wyrocznia — zamień na `it` po naprawie”.
- **Decision**: FIXED — komentarz rozbity na dwa; `middleware.test.ts` 74/74

### F7 — Wylogowanie w specu z surowego lokatora zamiast page objectu

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/e2e/session-boundaries.spec.ts:47, 72-78
- **Detail**: Krok „Wyloguj” to `page.locator("#logout-button")` plus inline `waitForResponse`/`waitForURL`, choć AGENTS.md trzyma akcje w `tests/e2e/page-objects/`. Do tego fallback `baseURL ?? "http://localhost:3000"` ignoruje `E2E_PORT` (martwy, bo config zawsze ustawia `baseURL`).
- **Fix**: Dodać `logout()` do page objectu strony głównej i wywołać go w specu; fallback zastąpić rzuceniem błędu przy braku `baseURL`.
- **Decision**: FIXED — `HomePage.logout()` (lokator `logoutButton`, zwraca odpowiedź `POST /api/auth/logout`); spec rzuca przy braku `baseURL`; spec zielony lokalnie (`E2E_PORT=3100`)
