<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Widoczność błędów produkcyjnych w dzienniku i wycenie kalorii AI

- **Plan**: context/changes/observability-error-visibility/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5, 6
- **Date**: 2026-10-15
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

Bramki automatyczne (2026-10-15): `npm run lint` 0 błędów, `npm run typecheck` 0 błędów, `npm run format:check` czysto, `npm run test` 38 zestawów / 821 testów zielonych. `npm run test:e2e` nie był uruchamiany w przeglądzie (wymaga środowiska `integration`); faza 5 i 6 mają go odhaczonego.

Pliki spoza planu: `install-client-error-reporter.ts`, `preferences/index.ts`, `types.ts`, `recipes/[id].ts`, `client-error-reporter.test.ts` i `users-stats-route.test.ts`. Każdy z nich wynika z planu albo ma uzasadnienie. Lista „What We're NOT Doing” jest przestrzegana.

## Findings

### F1 — Treść wpisu dziennika może trafić do logu przez `details` z PostgREST

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/utils/log.ts:84-90 (razem z `src/lib/utils/db-error.ts`, `cause` = oryginał)
- **Detail**: `serializeError` przepisuje `details` i `hint`, także z `cause`. Przy naruszeniu CHECK (23514, `diary_entries_value_has_origin`) Postgres ustawia DETAIL na `Failing row contains (…)`, czyli cały wiersz: `content` i `amount_text` użytkownika. Kod tras wprost zakłada, że 23514 dotrze do logu z `code`, a sama zmiana deklaruje, że treść posiłku nie należy do logu. Wyzwalacz jest rzadki, bo `createEntry` trzyma parę wartość/pochodzenie spójną.
- **Fix A ⭐ Recommended**: W serializerze redagować `details`, które zaczyna się od `Failing row contains` (albo ma `code` 23514/23502), do samego prefiksu i liczby kolumn.
  - Strength: Zostawia `details` tam, gdzie pomaga (nazwy kluczy przy 23503/23505), i ucina jedyny kształt, który niesie wartości wiersza.
  - Tradeoff: Reguła oparta na tekście komunikatu Postgresa.
  - Confidence: MED — format DETAIL jest stabilny od lat, ale to nadal tekst.
  - Blind spot: Nie sprawdzono innych kodów, które wklejają wartości (np. 23505 `Key (…)=(…)` w trasach, które nie mapują go na 409).
- **Fix B**: Nie serializować `details` w ogóle, zostawić `code`, `hint` i `message`.
  - Strength: Zamyka całą klasę wycieku wartości przez DETAIL.
  - Tradeoff: Traci nazwę naruszonego klucza/kolumny w diagnostyce 23503/23505.
  - Confidence: HIGH — prosta, jednolinijkowa zmiana z testem w `log.test.ts`.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A) — `log.ts` redaguje `details` z prefiksem `Failing row contains`; nowy test w `log.test.ts`, asercja w `db-error.test.ts` przepięta na wersję zredagowaną.

### F2 — Odznaka „AI niedostępne” poniżej kontrastu tekstu WCAG 1.4.3 w jasnym motywie

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/components/diary/DiaryEntryCalories.tsx:132
- **Detail**: `border-warning/30 bg-warning/10 text-warning` na małym tekście. Komentarz w `src/styles/global.css` podaje dla `--warning` na `warning/10` ~4.4:1 i opisuje ten token jako kolor ikony (cel 3:1). Tekst wymaga 4.5:1. Ciemny motyw ma 7.8:1, więc problem dotyczy tylko jasnego.
- **Fix A ⭐ Recommended**: Etykieta w `text-foreground`; tło i ramka zostają w tokenie `warning`.
  - Strength: Zmiana jednej klasy w widoku. Zgodne z tym, jak toasty używają roli stanu (tekst `--foreground`, ~17:1).
  - Tradeoff: Odznaka mniej „ostrzegawcza” kolorem tekstu.
  - Confidence: HIGH — wzorzec już istnieje w Toast.
  - Blind spot: None significant.
- **Fix B**: Przyciemnić `--warning` w `:root` do ≥4.5:1 na `warning/10` i zaktualizować komentarz z kontrastem.
  - Strength: Token nadaje się potem także na tekst w każdym widoku.
  - Tradeoff: Zmienia wszystkie użycia `warning` (ikony toastów, inne odznaki) i wymaga przeliczenia kontrastów.
  - Confidence: MED — trzeba policzyć nową jasność.
  - Blind spot: Wpływ na pozostałe miejsca z `warning` nie sprawdzony.
- **Decision**: FIXED (Fix A) — etykieta odznaki w `text-foreground`.

### F3 — Trasy AI przepisów nie przeszły do końca na `logError` + `requestId`, a jeden komentarz jest nieprawdziwy

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/api/ai/generate-recipe.ts:90, :112; src/pages/api/ai/save-recipe.ts:146, :180, :202; src/pages/api/ai/modify-recipe.ts:131
- **Detail**: Zewnętrzny `catch` `generate-recipe` wciąż robi `console.error` i oddaje 500 bez `requestId`, a gałąź `AIResponseParseError` także loguje surowo. Dwa wewnętrzne 500 w `save-recipe` (update/insert) logują surowy błąd PostgREST przez `console.error` i bez `requestId`. Komentarz przy zewnętrznym `catch` („Tak samo w obu 500 wyżej”) temu przeczy. Cel planu („każde 500 ma stałe ciało z `requestId`”) jest tu spełniony tylko częściowo.
- **Fix**: Przepiąć te miejsca na `logError("ai.<route>_failed", logContext, dbError(...))`, dodać `requestId` do ciał 500 i poprawić komentarz w `save-recipe.ts`.
- **Decision**: FIXED — `generate-recipe` ma `logContext`, `ai.generate_recipe_failed` i `requestId` w 500; `AIResponseParseError` w obu trasach przez `logError("ai.response_unparseable")`; dwa wewnętrzne 500 w `save-recipe` przez `logError` + `dbError` z `requestId` (komunikaty bez zmian); komentarz poprawiony; trzy asercje ciał 500 rozszerzone o `requestId`.

### F4 — Brak logu w `useSecurityGuard` zapowiedzianego w planie

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/hooks/auth/useSecurityGuard.ts:17-20
- **Detail**: „What We're NOT Doing” (plan:127) mówi: „Faza 6 dodaje tylko log” dla wylogowania przy błędzie sieci (P6). Hook dalej robi tylko `console.error` w przeglądarce i wylogowuje. Faza 6 w „Changes Required” tego punktu nie wymienia, więc luka jest po stronie planu i implementacji jednocześnie.
- **Fix**: Dodać `reportClientError({ kind: "fetch", … })` przed wylogowaniem (bez zmiany zachowania) albo skreślić zdanie z planu jako świadomie pominięte.
- **Decision**: FIXED — `useSecurityGuard` zgłasza błąd sieci przez `reportClientError` (`source: "GET /api/auth/me"`, bez `AbortError`); przekierowanie bez zmian.

### F5 — Ręczne kryterium 5.6 odhaczone z nazwą zdarzenia, której kod nie emituje

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/observability-error-visibility/plan.md:625, :862
- **Detail**: Kryterium oczekuje linii `auth.login_failed` przy odciętym `SUPABASE_URL`. Implementacja loguje w tym przypadku `auth.unavailable` (ze `step`), a `auth.login_failed` pochodzi tylko z zewnętrznego `catch`. Albo test ręczny sprawdzono inną nazwą, albo odhaczono go bez obserwacji.
- **Fix**: Poprawić w planie nazwę zdarzenia na `auth.unavailable` (zgodnie z kodem i `auth-routes.test.ts`).
- **Decision**: FIXED — kryterium w bloku fazy 5 (plan.md:625) mówi teraz o `auth.unavailable` ze `step: "signInWithPassword"`; tytuł kroku 5.6 w `## Progress` bez zmian (konwencja: nie zmieniamy tytułów kroków).

### F6 — `estimate.completed` logowane przed `applyEstimate`; odcięty zapis po ręcznej wartości nie zostawia śladu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/diary-entries/[id]/estimate.ts:182, :222
- **Detail**: `estimate.completed` z `result: "valued"` wychodzi przed zapisem, więc wynik później odcięty znacznikiem wygląda w logu na zapisany. `estimate.discarded_stale` odpala tylko przy `calories === null` po zapisie, więc wynik wyrzucony, bo użytkownik w międzyczasie wpisał wartość ręczną, nie zostawia linii.
- **Fix**: Logować `estimate.completed` po `applyEstimate` z `result: "valued" | "discarded" | "empty"`, a odcięcie wykrywać przez `calorie_origin` zwróconego wiersza różne od gałęzi.
- **Decision**: FIXED — `ms` mierzone przy modelu; `estimate.completed` po zapisie z `result: "valued" | "discarded" | "empty"`; odcięcie = wiersz bez tej wyceny (`calories`/`calorie_origin` ≠ wynik/gałąź), więc obejmuje też wartość ręczną. Nowy test na ręczną wartość w trakcie wyceny.

### F7 — `SITE_URL` nie jest nigdzie ustawione, produkcja wysyła `HTTP-Referer: http://localhost`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/api/openrouter.service.ts:65
- **Detail**: Plan (E12) zakładał, że `SITE_URL` jest ustawione w Vercelu. W repo nie ma go w żadnym pliku env ani workflow, więc OpenRouter widzi fallback `http://localhost`.
- **Fix**: Ustawić `SITE_URL` w zmiennych Vercela (Production) i dopisać go do `.env.example`, jeśli istnieje.
- **Decision**: FIXED (częściowo) — `SITE_URL` dopisane do `.env.example` z komentarzem. Zostaje do zrobienia przez właściciela: ustawić `SITE_URL` w zmiennych środowiskowych Vercela (Production).

### F8 — Wyjątek strony w middleware wychodzi bez `flushCookies`, a wyjątek od reguły nie jest opisany

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/middleware/index.ts (gałąź `throw error` dla stron)
- **Detail**: Gałąź nie-`/api/` ponownie rzuca, więc ciasteczka zrotowane w tym przebiegu przepadają. Astro renderuje stronę 500 ponownie przez middleware, więc drugi `getUser()` je odtwarza (o ile GoTrue przyjmie już zrotowany refresh token w oknie reuse) i kosztuje drugi round trip. To nie regresja: przed zmianą żadne wyjście przy wyjątku nie robiło flush. Jednak AGENTS.md mówi o „każdym wyjściu”, a contract-surfaces wymienia tylko wyjście 500 dla API.
- **Fix**: Dopisać jedno zdanie do wpisu `flushCookies` w `docs/reference/contract-surfaces.md`, dlaczego gałąź strony może rzucić.
- **Decision**: FIXED — punkt **Exception** we wpisie `flushCookies` w `contract-surfaces.md`.

### F9 — Wąskie filtry PII: powód odrzucenia jako JSON w reporterze i `email` tylko po dokładnej nazwie klucza

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/utils/client-error-reporter.ts (`describeThrown`); src/lib/utils/log.ts:42
- **Detail**: `describeThrown` robi `JSON.stringify` na powodzie odrzucenia, który nie jest `Error`, więc odrzucony obiekt z ciałem odpowiedzi albo danymi formularza trafia do `message` (≤500 znaków). Filtr kontekstu w `log.ts` pomija tylko klucz `email` (bez rozróżniania wielkości liter), a `userEmail` przejdzie.
- **Fix**: W `describeThrown` dla nie-`Error` logować typ i `Object.keys`, nie wartości; w `log.ts` pomijać klucze pasujące do `/email/i`.
- **Decision**: FIXED — `describeThrown` wysyła typ i do 10 nazw pól; `log.ts` pomija każdy klucz pasujący do `/email/i`. Testy w `log.test.ts` i `client-error-reporter.test.ts`.

## Triage (2026-10-15)

Fixed: F1 (Fix A), F2 (Fix A), F3, F4, F5, F6, F8, F9. F7 fixed in the repo (`.env.example`); setting `SITE_URL` in Vercel is still for the owner to do. Skipped, accepted and rule-recorded: none.

Gates after the fixes: `npm run lint` 0 errors, `npm run typecheck` 0 errors, `npm run format:check` clean, `npm run test` 38 suites / 825 tests green. `npm run test:e2e` was not run.
