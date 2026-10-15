# Widoczność błędów produkcyjnych w dzienniku i wycenie kalorii AI — plan implementacji

## Overview

Audyt observability z 2026-10-14
(`context/audits/observability/2026-10-14_diary-entries-ai-calorie-estimation.md`) pokazał, że
w obszarach „wpisy dziennika” i „wycena kalorii AI” błędy serwera powstają, ale kod gubi je albo
spłaszcza, zanim trafią do `console.*`. W godzinnym oknie Vercel logs nie ma więc czego czytać.
Plan zamyka przyczyny RC2–RC6 i połowę logową RC1. Po zmianie każda awaria w tych obszarach
zostawia w Vercel logs **jedną linię JSON** z tożsamością błędu (`name`, `code`, `status`, `cause`),
kontekstem (`userId`, `entryId`, krok, model, czas) i `requestId`. Ten sam `requestId` użytkownik
dostaje w ciele odpowiedzi 500. Ostatnia faza wyprowadza z przeglądarki błędy, które dziś nie
opuszczają urządzenia.

Problem jest ustalony w frame (`context/changes/observability-error-visibility/frame.md`, confidence
HIGH): RC1/D1 (302 dla `/api/*`, fałszywy sukces zapisu) to błąd kontraktu API, a nie widoczności,
i idzie osobną zmianą.

## Current State Analysis

Źródła: audyt (§3 próby runtime, §4 RC1–RC6, §5 ustalenia) i frame (tabela hipotez). Poniżej tylko
fakty, na których stoi plan.

- **Kanał:** brak trackera i log drain. `console.*` → Vercel Runtime Logs (Hobby, retencja 1 h:
  `context/foundation/infrastructure.md:101`, `:115`). Brak wspólnego loggera. W `src/` jest
  ok. 66 `console.error`, wszystkie w formie `"<etykieta>:", error`. `cause:` nie występuje nigdzie.
- **RC1 (połowa logowa):** `src/middleware/index.ts:69-74` destrukturyzuje tylko `user` i gubi
  `error` z `getUser()`. `return flushCookies(await next())` (`:86`) nie ma `try`, więc wyjątek
  z trasy omija `flushCookies` (P7). Gałąź `catch` wymiany kodu (`:57`) przekierowuje bez
  `encodeURIComponent` (known-drift „Middleware”).
- **RC2:** interceptor `src/lib/api/openrouter.service.ts:78-81` mapuje błąd axios na podklasę
  `OpenRouterError` bez `.response`. `isRetryableError` (`:205-210`) uznaje go więc za ponawialny,
  a `executeRequest` po próbach mapuje go drugi raz na `NetworkError` (`:227-228`). 401/429/404
  dają tę samą linię (R3 observed). Gałęzie `:233-253` są martwe. Plik czyta `import.meta.env`
  (`:43`), więc ts-jest go nie załaduje. Wszystkie testy go mockują (`ai-service.test.ts:20`,
  `calorie-estimation.service.test.ts:15` i trzy testy tras AI). Klienci: `ai.service.ts:37-58`
  i `calorie-estimation.service.ts:57-97`, oba z `retries: 1`.
- **RC3:** `extractCalories` (`calorie-estimation.service.ts:185-230`) ma 7× `return null` i zero
  logów. `processResponse` (`openrouter.service.ts:270-281`) to gołe rzutowanie, więc 200
  z `{error}` bez `choices` zachowuje się jak bezużyteczna odpowiedź (R3 observed). W trasie
  `estimate.ts` po cichu kończą się: przeterminowany `applyEstimate` (`:168-177`,
  `diary.service.ts:240-263`), iloczyn > 5000 (`:123-126`) i przełączenie na gałąź opisową przy
  `RecipeNotFoundError` (`:86-92`). Parser przepisu porzuca `reason` (`diary.service.ts:100-105`,
  `:338-345`).
- **RC4:** postgrest-js zwraca błąd jako zwykły obiekt. `diary.service.ts` ma 9× `throw error`.
  `diary-entries/index.ts:47`, `:115`, `users/stats.ts:59` i `recipes/index.ts:85` odpowiadają
  `details: error instanceof Error ? … : "Nieznany błąd"`, bez logu (R6 observed).
  `user-settings.service.ts:30`, `:58` i `ai.service.ts:539` przepakowują błąd przez
  `new Error(error.message)` i gubią `code`. Nieużywany `AppError` leży w `src/lib/utils/errors.ts`.
- **RC5:** `login.ts:30-39` zamienia każdy `{error}` z GoTrue na 401 „złe hasło”, a `register.ts:30-40`
  na 400. Lookupy `ai/modify-recipe.ts:62-76`, `ai/save-recipe.ts:92-108` i
  `preferences/[id].ts:76-87`, `:151-162` zamieniają każdy błąd bazy na 404. Dobry wzorzec jest
  w `recipes/[id].ts:52-68` (`PGRST116` → 404, reszta `throw`). Trasy dziennika i ustawień wołają
  drugi raz `getUser()` i ignorują `error` (D6). We wszystkich czterech trasach auth
  `request.json()` leży w zewnętrznym `try`, więc zły JSON daje 500 (P10).
- **RC6:** żadnego id żądania, żadnego `VERCEL_*` w `src/`. `health.ts` ma zaszyte `"1.0.0"`
  i niczego nie sprawdza.
- **Przeglądarka:** brak `window` `error`/`unhandledrejection`, brak error boundary i brak
  `src/pages/500.astro`. 502 `AI_UNAVAILABLE` i 200/`null` z `/estimate` dają w UI ten sam stan
  „Nie policzono” (`useCalorieEstimation.ts:105-135`, `diary-estimation.ts:62-78`,
  `DiaryEntryCalories.tsx:129-133`). `useAI.ts:98-106` ponawia każde `>=500` poza 502, czyli
  także 504 Vercela (P11). Trzy layouty z `ClientRouter`: `MainLayout`, `AppLayout`, `AuthLayout`.

## Desired End State

- Każda ścieżka błędu w obszarze (dziennik, wycena, ustawienia, auth, lookupy AI/preferencji)
  kończy się linią `{"level":"error"|"warn"|"info","event":"…",…}` w Vercel logs. Linia ma
  `requestId`, `userId` (gdy znany), kontekst kroku i zserializowany błąd z `code`/`status`/`cause`.
  Do tego dochodzi `env`/`commit` z `VERCEL_ENV`/`VERCEL_GIT_COMMIT_SHA`.
- Każde 500 w obszarze ma stałe ciało `{ error: "Błąd wewnętrzny serwera", requestId }`. Żadne
  `details` z treścią błędu bazy nie wychodzi do przeglądarki.
- Awarie OpenRoutera są odróżnialne w logu (`AuthenticationError` 401, `RateLimitError` 429,
  `ModelUnavailableError` 404 z nazwą modelu, `NetworkError` z kodem axios w `cause`), a 4xx nie
  są ponawiane.
- „Brak wartości” z modelu zostawia warn z powodem i metadanymi, bez treści odpowiedzi. Koperta
  z `error`/bez `choices` daje 502. Wynik wyrzucony przez przeterminowany znacznik, iloczyn poza
  zakresem i przełączenie gałęzi są widoczne w logu.
- Awaria GoTrue przy logowaniu, rejestracji i resecie daje 503 (rate limit: 429) i linię błędu,
  a nie „złe hasło”. Lookup daje 404 tylko dla braku wiersza.
- Błąd w przeglądarce (wyjątek wyspy, `unhandledrejection`, `window.onerror`) trafia przez
  `POST /api/client-errors` do tego samego kanału. `/diary` pokazuje „AI niedostępne”, gdy wycena
  skończyła się 502.

**Weryfikacja:** `npm run lint`, `npm run typecheck` (0 błędów), `npm run format:check`,
`npm run test`, `npm run test:e2e` zielone. Potem harness prób R1–R6 z audytu i
`/10x-observability-audit --verify` pokazują R3 (401/429/404, 200-z-error, śmieć), R5 i R6
z werdyktem `good`.

### Key Discoveries:

- `import.meta` w pliku uniemożliwia jego import w ts-jest (`calorie-estimation.service.ts:60-75`).
  Moduł logowania i nowy moduł błędów OpenRoutera **nie mogą** czytać `import.meta.env`. Tożsamość
  wdrożenia bierzemy z `process.env` (na Vercelu dostępne w funkcji).
- Mock middleware (`tests/unit/middleware.test.ts:44-58`, `:88-90`) zawsze daje `getUser`
  z `error: null`. Logowanie błędu nie łamie istniejących testów; nowe przypadki trzeba dopisać.
- Żaden test nie przypina `details` w ciele 500 (`diary-entries-route.test.ts` ma tylko POST
  i tylko 400). Kształt logu przypinają trzy asercje
  `consoleError toHaveBeenCalledWith(any(String), failure.error)`: `recipes-route.test.ts:345`,
  `:412`, `preferences-route.test.ts:225`.
- `user-settings-service.test.ts:41`, `:70` używają `rejects.toThrow("<fragment message>")`.
  Opakowanie musi zachować oryginalny `message` w swoim `message`, inaczej asercje padną.
- `diary-service.test.ts:225`, `:349`, `:406`, `:480` podają jako błąd Supabase `new Error(...)`
  i sprawdzają `rejects.toThrow("<message>")`. Helper musi przepuścić `message` także dla `Error`.
- `ai-modify-recipe-route.test.ts:92-98` mockuje błąd lookupu `{message:"not found"}` bez `code`.
  Po regule „404 tylko dla `PGRST116`” trzeba go przepiąć na `code: "PGRST116"`. Atrapa
  `tests/helpers/supabase-tables.ts:357` już daje prawdziwe `PGRST116`, więc testy preferencji
  przejdą bez zmian.
- `useAuth.ts:62`, `:98`, `:180`, `:214` pokazują `data.error` przy każdym statusie. Nowe 503/429
  z tras auth nie wymagają zmian w formularzach.
- `ai-service.test.ts:166-172` przypina, że przy błędzie dostawcy nie powstaje wiersz w `logs`.
  To zostaje.
- `diary.astro:13-18` już łapie błąd odczytu celu i rysuje stronę bez celu. D5 to więc tylko
  przekazanie flagi i komunikat, bez zmiany przepływu.

## What We're NOT Doing

- **Bez zmiany 302 → 401 dla `/api/*`** i bez obsługi przekierowanego `fetch` w klientach (D1, D10).
  To uchylenie decyzji D2 (`context/archive/2026-10-05-testing-session-and-access-boundaries/plan.md:101`)
  i osobna zmiana (frame, „What Changes for /10x-plan”).
- **Bez D3** (DELETE z 0 wierszy → 404 traktowane w UI jako sukces). To kontrakt UI z
  `context/archive/2026-09-29-edit-and-delete-entry/plan.md:374-375`, w tej samej osobnej zmianie.
- **Bez trwałego zapisu błędów do tabeli `logs`** ani log drain. Retencja 1 h zostaje jawnym
  założeniem (Open Risks).
- **Bez error trackera** (Sentry itp.) i bez nowej zależności npm.
- **Bez treści odpowiedzi modelu w logach.** Log bezużytecznej odpowiedzi niesie tylko metadane
  (decyzja planu).
- **Bez zmiany zachowania `useSecurityGuard`** (wylogowanie przy błędzie sieci, P6). Faza 6 dodaje
  tylko log.
- **Bez zmiany typu zwracanego `CalorieEstimationService`** (`number | null` zostaje).
- **Bez limitu częstości** na trasach AI ani na `POST /api/client-errors` ponad limit rozmiaru
  i liczby zdarzeń na żądanie (known-drift „Trasy AI” bez zmian).
- **Bez naprawy `fallbackTextParsing`** w `ai.service.ts` (known-drift „Niepusta odpowiedź modelu”).

## Implementation Approach

Najpierw fundament, którego używają wszystkie fazy: moduł logowania i `requestId` w `locals`.
Potem fazy po przyczynach systemowych, w kolejności z §6 audytu (najwięcej odzyskanej widoczności
na jednostkę pracy). RC4 i RC6 idą razem, bo zmieniają te same bloki `catch`. Na końcu
przeglądarka, która dodaje jedyną nową powierzchnię (endpoint przyjmujący dane od klienta). Każda
faza jest osobno wdrażalna. Po każdej fazie serwerowej harness prób z audytu (R1–R6) da się
uruchomić ponownie.

### Decyzje planu

| # | Decyzja | Wybór |
| --- | --- | --- |
| D-1 | Zakres | RC2–RC6 + log `getUser()` z RC1 + faza przeglądarki (E7, P5, P6) jako ostatnia |
| D-2 | Kształt logu | Jedna linia JSON przez `src/lib/utils/log.ts` (`logError`/`logWarn`/`logInfo`) |
| D-3 | Id żądania | `x-vercel-id`, a bez niego `crypto.randomUUID()`; do `locals.requestId`, do logu i do ciała 500 |
| D-4 | „Brak wartości” z wyceny | Log warn w serwisie z powodem; typ zwracany bez zmian; opcjonalny kontekst logu w argumencie |
| D-5 | Treść odpowiedzi modelu w logu | Tylko metadane (`reason`, `finish_reason`, `model`, długość) |
| D-6 | Awaria GoTrue w trasach auth | Błąd klienta 4xx jak dziś; 429 → 429; reszta → `logError` + 503 |

## Critical Implementation Details

- **Brak `import.meta` w nowych modułach.** `src/lib/utils/log.ts`, helper błędów bazy
  i `src/lib/api/openrouter.errors.ts` są importowane przez serwisy testowane w ts-jest. Jedno
  `import.meta` w grafie importu przewraca te testy na samym `import`.
- **`flushCookies` na każdym wyjściu** (`context/foundation/lessons.md`). Nowe wyjście z `catch`
  wokół `next()` też musi przez nie przejść.
- **`AuthSessionMissingError` to zwykły gość, nie błąd.** Logowanie go zalałoby kanał. Wygasły
  albo unieważniony refresh token (`AuthApiError` 4xx) to `warn`, awaria GoTrue (5xx/sieć) to
  `error`.
- **Serializacja błędu musi obsłużyć zwykły obiekt.** `JSON.stringify(new Error())` daje `{}`,
  a błąd PostgREST nie jest `Error`. Serializer czyta jawnie `name`, `message`, `code`, `status`,
  `details`, `hint`, `stack` i rekurencyjnie `cause` (z limitem głębokości). Pola `details`/`hint`
  idą tylko do logu, nigdy do odpowiedzi.

## Phase 1: Moduł logowania, `requestId` i middleware

### Overview

Wspólne narzędzie do logowania jedną linią JSON z tożsamością wdrożenia, `requestId` w `locals`
oraz middleware, który przestaje gubić błąd `getUser()` i wyjątek z trasy.

### Changes Required:

#### 1. Moduł logowania

**File**: `src/lib/utils/log.ts` (nowy), `tests/unit/log.test.ts` (nowy)

**Intent**: Jedno miejsce, które zamienia zdarzenie, kontekst i błąd (`Error`, obiekt PostgREST,
cokolwiek) na jedną linię JSON w `console.error`/`console.warn`/`console.info`. Bez tego każda
faza rozjechałaby się kształtem kontekstu.

**Contract**: `logError(event: string, context: LogContext, error?: unknown)`, `logWarn(...)`,
`logInfo(...)`, `serializeError(error: unknown)`. `LogContext` to płaski rekord
(`requestId?`, `userId?`, `route?`, `step?` i dowolne pola skalarne). Linia ma postać
`{ level, event, time, env, commit, ...context, error? }`, gdzie `env`/`commit` pochodzą
z `process.env.VERCEL_ENV` / `VERCEL_GIT_COMMIT_SHA` (skrócone do 7 znaków) albo `"local"`.
`serializeError` zwraca `{ name, message, code?, status?, details?, hint?, stack?, cause? }`
z rekurencyjnym `cause` do głębokości 3. Napis i `undefined` też obsługuje. Kontekst nie przyjmuje
e-maili: pole `email` jest pomijane.

#### 2. `requestId` w `locals`

**File**: `src/env.d.ts`, `src/middleware/index.ts`, `docs/reference/contract-surfaces.md`

**Intent**: Każde żądanie ma identyfikator, który łączy linię logu z wierszem żądania w panelu
Vercela i który użytkownik może podać przy zgłoszeniu.

**Contract**: `App.Locals.requestId: string`, ustawiane jako pierwsze w middleware:
`request.headers.get("x-vercel-id") ?? crypto.randomUUID()`. Nowy wpis w contract-surfaces
(sekcja „Request pipeline”): kto ustawia, kto czyta, co psuje zmiana nazwy.

#### 3. Middleware: błąd `getUser()`, wyjątek z `next()`, kodowanie `Location`

**File**: `src/middleware/index.ts`

**Intent**: Awaria GoTrue przestaje wyglądać jak wylogowanie bez śladu. Wyjątek z trasy API nie
gubi zrotowanego tokenu (P7). Wyjątek przy wymianie kodu daje przekierowanie zamiast 500
(known-drift „Middleware”).

**Contract**:
- `const { data: { user }, error } = await supabase.auth.getUser()`. Gdy `error` nie jest
  `AuthSessionMissingError` (`isAuthSessionMissingError` z `@supabase/supabase-js`): `AuthApiError`
  ze statusem 4xx daje `logWarn("auth.session_invalid", …)`, reszta daje
  `logError("auth.get_user_failed", …)`. Kontekst: `requestId`, `path`, `method`. Decyzja dostępu
  (redirect na `/auth/login`) bez zmian.
- `next()` w `try/catch`. Dla `url.pathname.startsWith("/api/")`: `logError("request.unhandled", …)`
  i `flushCookies(new Response(JSON.stringify({ error: "Błąd wewnętrzny serwera", requestId }), { status: 500, headers: JSON }))`.
  Dla stron: `logError` i ponowne `throw`, żeby Astro wyrenderowało stronę błędu.
- Gałąź `catch` wymiany kodu: `encodeURIComponent` na komunikacie, jak w dwóch pozostałych
  gałęziach.

#### 4. Testy middleware i known-drift

**File**: `tests/unit/middleware.test.ts`, `docs/reference/known-drift.md`

**Intent**: Przypiąć nowe zachowanie i zdjąć naprawiony dryf.

**Contract**: Nowe przypadki:
- `getUser` z `AuthSessionMissingError`: brak logu;
- `getUser` z błędem 5xx: `console.error` z linią JSON `event: "auth.get_user_failed"`
  i redirect z ciasteczkami;
- `next()` rzuca na `/api/x`: 500 JSON z `requestId` i z ciasteczkami;
- `next()` rzuca na stronie: wyjątek propaguje;
- `requestId` z `x-vercel-id` i z fallbacku.

Test „…dziś wywraca przekierowanie na niezakodowanym Location (obecne zachowanie)” usunięty,
`it.failing` „wyjątek przy wymianie kodu przekierowuje z błędem, z ciasteczkami” zamieniony na `it`.
Wpis „Middleware” w known-drift usunięty.

### Success Criteria:

#### Automated Verification:

- Testy modułu logowania przechodzą (Error, obiekt PostgREST, łańcuch `cause`, napis, pominięcie `email`): `npx jest tests/unit/log.test.ts`
- Testy middleware przechodzą, łącznie z dawnym `it.failing` jako `it`: `npx jest tests/unit/middleware.test.ts`
- Cały zestaw Jest zielony: `npm run test`
- Typecheck bez błędów: `npm run typecheck`
- Lint i format czyste: `npm run lint` i `npm run format:check`

#### Manual Verification:

- `npm run dev`, wejście na `/diary` z ręcznie zepsutym ciasteczkiem sesji: w konsoli serwera jedna linia JSON `auth.session_invalid` z `requestId`, przeglądarka ląduje na `/auth/login`

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na potwierdzenie ręcznych kroków przed fazą 2.

---

## Phase 2: OpenRouter — jedno mapowanie błędu

### Overview

Klient OpenRoutera mapuje błąd raz, nie ponawia 4xx i zostawia na błędzie `status`, `model`
oraz `cause`. Mapowanie przenosi się do modułu bez `import.meta`, więc da się je przetestować.

### Changes Required:

#### 1. Moduł błędów OpenRoutera

**File**: `src/lib/api/openrouter.errors.ts` (nowy), `src/lib/api/openrouter.types.ts`,
`tests/unit/openrouter-errors.test.ts` (nowy)

**Intent**: Czysta logika „jaki to błąd i czy ponawiać” wyjęta z serwisu, żeby testy mogły ją
wołać bez ładowania `openrouter.service.ts`.

**Contract**:
- `OpenRouterError` dostaje opcjonalne `status?: number`, `model?: string` i `cause` (przez
  `ErrorOptions`). Podklasy przekazują je dalej.
- `mapAxiosError(error: unknown, model: string): OpenRouterError`. Gdy wejście jest już
  `OpenRouterError`, zwraca je bez zmian. Gdy ma `response`, mapuje status według obecnej tabeli
  (`openrouter.service.ts:233-253`). Bez `response` daje `NetworkError` z `cause` = oryginał, co
  zachowuje `code` axios (`ECONNABORTED`/`ENOTFOUND`).
- `isRetryable(error: OpenRouterError): boolean`: tylko `NetworkError` i `status` 5xx.
- Testy: 401/403 → `AuthenticationError` ze `status`, 429 → `RateLimitError`, 404 →
  `ModelUnavailableError` z nazwą modelu, 402 → `BudgetExceededError`, timeout → `NetworkError`
  z `cause.code === "ECONNABORTED"`, idempotencja na `OpenRouterError`, `isRetryable` dla 4xx
  zwraca `false`.

#### 2. Serwis OpenRoutera

**File**: `src/lib/api/openrouter.service.ts`

**Intent**: Jedno mapowanie. Ten sam obiekt błędu dochodzi od axios do trasy.

**Contract**:
- Interceptor usunięty albo zredukowany do `mapAxiosError(error, this.defaultModel)`.
- `executeRequest` mapuje raz (`mapAxiosError`), ponawia tylko przy `isRetryable` i rzuca
  zmapowany błąd, a nie `mapErrorToCustomError(lastError)`. `mapErrorToCustomError`
  i `handleRequestError` znikają.
- `sendMessage`: `new OpenRouterError(..., { cause: error })` zamiast samego komunikatu (E11).
- Nagłówki (E12): `X-Title: "HealthyMeal"`, a `HTTP-Referer` z `process.env.SITE_URL`
  (produkcyjny adres aplikacji ustawiony w Vercelu), z fallbackiem na `http://localhost`. Stary
  `https://api.example.com` znika. Czytamy `process.env`, nie `import.meta.env`, żeby nie dokładać
  zależności od build-time env.

#### 3. Log błędu dostawcy w trasach AI

**File**: `src/pages/api/ai/generate-recipe.ts`, `src/pages/api/ai/modify-recipe.ts`

**Intent**: Te same 502 co dziś, ale log niesie status i model (E13). Trasa wyceny dostaje to
w fazie 3.

**Contract**: W gałęzi `OpenRouterError` `logError("ai.provider_failed", { requestId, userId, route, model: error.model, status: error.status }, error)`.
Ciało 502 bez zmian (przypięte w `ai-generate-recipe-route.test.ts:80-137`,
`ai-modify-recipe-route.test.ts:101-131`).

### Success Criteria:

#### Automated Verification:

- Testy mapowania przechodzą (401/403/404/402/429/timeout/idempotencja/brak ponowień 4xx): `npx jest tests/unit/openrouter-errors.test.ts`
- Testy serwisów i tras AI bez zmian zielone: `npx jest tests/unit/ai-service.test.ts tests/unit/calorie-estimation.service.test.ts tests/unit/ai-generate-recipe-route.test.ts tests/unit/ai-modify-recipe-route.test.ts`
- `grep -n "mapErrorToCustomError\|handleRequestError" src/lib/api/openrouter.service.ts` nic nie zwraca
- Cały zestaw Jest, typecheck, lint, format: `npm run test`, `npm run typecheck`, `npm run lint`, `npm run format:check`

#### Manual Verification:

- Harness prób z audytu (R3: fałszywy OpenRouter 401/429/404): trzy różne linie w logu (`AuthenticationError`/`RateLimitError`/`ModelUnavailableError` ze `status` i `model`), fałszywy serwer rejestruje jedno żądanie na 4xx

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na potwierdzenie ręcznych kroków przed fazą 3.

---

## Phase 3: Wycena kalorii — powód zamiast cichego `null`

### Overview

„Brak wartości” zostaje stanem danych dla użytkownika, ale przestaje być niewidoczny w logach.
Błąd dostawcy zawinięty w 200 staje się 502.

### Changes Required:

#### 1. Walidacja koperty odpowiedzi

**File**: `src/lib/api/openrouter.service.ts`

**Intent**: 200 od OpenRoutera z polem `error` albo bez `choices[0]` to awaria dostawcy, nie
bezużyteczna odpowiedź modelu (E3).

**Contract**: `processResponse` rzuca `ResponseParsingError` (podklasa `OpenRouterError`, `model`
ustawione), gdy odpowiedź nie jest obiektem, ma pole `error` albo nie ma tablicy `choices`
z co najmniej jednym elementem. Komunikat dostawcy (`error.message`, `error.code`) trafia do
komunikatu i `cause`. Trasy budują z tego istniejące 502 bez zmian w trasie.

#### 2. Powód braku wartości

**File**: `src/lib/services/calorie-estimation.service.ts`,
`tests/unit/calorie-estimation.service.test.ts`

**Intent**: Każda ścieżka `return null` w `extractCalories` zostawia warn z powodem (E2). Typ
zwracany zostaje (D-4).

**Contract**:
- `estimateFromDescription(content, amountText, logContext?: LogContext)` i
  `estimateFromRecipe(recipeContent, entryNote, logContext?)`. Trzeci argument jest opcjonalny,
  więc istniejące wywołania i mocki działają.
- `extractCalories` przed każdym `null` woła
  `logWarn("estimate.unusable_response", { ...logContext, reason, finishReason, model, contentLength })`,
  gdzie `reason ∈ "empty" | "no_json" | "invalid_json" | "no_field" | "not_number" | "out_of_range"`.
  Odpowiedź `{"calories": null}` to osobny powód `"model_declined"`, logowany przez `logInfo`,
  a nie `logWarn`, bo prompt wprost każe tak odpowiadać, gdy opisu nie da się wycenić.
- Bez treści odpowiedzi (D-5).
- Brak klucza (E6): `createEstimationClient` rzuca `OpenRouterError` z `code = "AI_MISCONFIGURED"`
  (pole na błędzie).
- Testy: istniejące asercje `toBe`/`toBeNull` zostają. Nowy blok sprawdza
  `console.warn` z `reason` dla każdego z sześciu powodów, `console.info` dla `model_declined`,
  brak treści odpowiedzi w linii logu i `code` błędu przy pustym kluczu.

#### 3. Trasa wyceny: kontekst, czas, ciche gałęzie

**File**: `src/pages/api/diary-entries/[id]/estimate.ts`, `tests/unit/diary-estimate-route.test.ts`

**Intent**: Log błędu i degradacji niesie kto/co/która gałąź/ile trwało (E4, E8). Wynik
wyrzucony przez znacznik (E5), iloczyn poza zakresem (E9) i przełączenie gałęzi (E10) są widoczne.

**Contract**:
- Kontekst `{ requestId, userId, entryId, branch: origin, route: "diary.estimate" }` przekazywany
  do metod serwisu jako `logContext`.
- Pomiar `ms` wokół wywołania modelu. `logInfo("estimate.completed", { …, ms, result: "valued" | "empty" })`
  na końcu, `ms` także w logu 502.
- Gałąź `OpenRouterError`: `logError("estimate.provider_failed", { …, model, status, ms }, error)`.
  Gdy `error.code === "AI_MISCONFIGURED"`, 502 z `code: "AI_MISCONFIGURED"`, w przeciwnym razie
  `AI_UNAVAILABLE` jak dziś.
- `RecipeNotFoundError` przy odczycie przepisu: `logInfo("estimate.recipe_missing_fallback", …)`.
- Iloczyn poza zakresem: `logWarn("estimate.total_out_of_range", { …, perPortion, portions })`.
- Po `applyEstimate`, gdy zwrócony wiersz ma `calories === null` (zapis odcięty znacznikiem):
  `logWarn("estimate.discarded_stale", { …, requestedAt })`.
- Zewnętrzny `catch`: `logError("estimate.failed", ctx, error)` i ciało 500 z `requestId`
  (wzorzec z fazy 4).
- Testy: nowe przypadki dla `AI_MISCONFIGURED` → 502 z tym kodem, warn przy iloczynie > 5000,
  warn przy odciętym zapisie, info przy przełączeniu gałęzi, `requestId` w ciele 500. Istniejące
  mocki `mockResolvedValue(n|null)` zostają.

#### 4. Powód parsera przepisu

**File**: `src/lib/services/diary.service.ts`

**Intent**: Wpis z przepisu bez wartości da się wyjaśnić z logu (D9), łącznie ze znanym błędem
nagłówka F2.

**Contract**: W `createEntry` i w gałęzi `recalculate` `updateEntry`, gdy `resolveRecipeCalories`
zwraca `total === null`: `logInfo("diary.recipe_nutrition_unresolved", { userId, entryId?, recipeId, reason, portions })`.
`reason` to pole, które parser już zwraca.

### Success Criteria:

#### Automated Verification:

- Testy serwisu wyceny przechodzą, łącznie z nowym blokiem powodów: `npx jest tests/unit/calorie-estimation.service.test.ts`
- Testy trasy wyceny przechodzą: `npx jest tests/unit/diary-estimate-route.test.ts`
- Testy serwisu dziennika i danych chronionych zielone: `npx jest tests/unit/diary-service.test.ts tests/unit/protected-data.test.ts`
- Cały zestaw Jest, typecheck, lint, format: `npm run test`, `npm run typecheck`, `npm run lint`, `npm run format:check`

#### Manual Verification:

- Harness R3: 200 z `{"error":…}` → 502 `AI_UNAVAILABLE` i linia `estimate.provider_failed` z `ResponseParsingError`; „I cannot help with that” → 200 `calories: null` i linia `estimate.unusable_response` z `reason: "no_json"`, bez treści odpowiedzi
- `/diary`: wpis opisowy policzony z prawdziwym modelem daje linię `estimate.completed` z `ms` i `result: "valued"`

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na potwierdzenie ręcznych kroków przed fazą 4.

---

## Phase 4: Błędy bazy i kontekst w trasach

### Overview

Błąd PostgREST zachowuje `code` i dostaje stos z kodu aplikacji. Każdy `catch` tras w obszarze
loguje z kontekstem, a do przeglądarki oddaje stałe ciało z `requestId`.

### Changes Required:

#### 1. Helper błędów bazy

**File**: `src/lib/utils/db-error.ts` (nowy), `tests/unit/db-error.test.ts` (nowy)

**Intent**: Jeden sposób na zamianę zwykłego obiektu PostgREST na `Error` ze stosem, bez gubienia
`code`/`details`/`hint` (P4).

**Contract**: `class DatabaseError extends Error { code?: string }` i
`dbError(error: unknown, operation: string): DatabaseError`. `message` = `"<operation>: <oryginalny message>"`,
dzięki czemu `rejects.toThrow("<fragment>")` w istniejących testach przechodzi. `code`
przepisany na wierzch, `cause` = oryginał. Wejście, które już jest `DatabaseError`, zwracane bez
zmian.

#### 2. Serwisy

**File**: `src/lib/services/diary.service.ts`, `src/lib/services/user-settings.service.ts`,
`src/lib/services/ai.service.ts`

**Intent**: Żaden serwis w obszarze nie rzuca gołego obiektu ani `new Error(error.message)`.

**Contract**:
- `throw error` → `throw dbError(error, "<metoda>")` we wszystkich dziewięciu miejscach
  `diary.service.ts`.
- `user-settings.service.ts:30`, `:58` → `dbError`.
- `ai.service.ts:539` → `dbError`, z zachowaniem dzisiejszego prefiksu komunikatu.
- `instanceof RecipeNotFoundError`/`EntryShapeError` w trasach działa bez zmian.

#### 3. Trasy: log z kontekstem i stałe ciało 500

**File**: `src/pages/api/diary-entries/index.ts`, `src/pages/api/diary-entries/[id].ts`,
`src/pages/api/user-settings/index.ts`, `src/pages/api/users/stats.ts`,
`src/pages/api/recipes/index.ts` (GET)

**Intent**: Awaria bazy przestaje być cichym „Nieznany błąd” (D2, P3, drift `GET /api/recipes`)
i ma kontekst (D7). Użytkownik dostaje id do zgłoszenia (D11).

**Contract**:
- Każdy zewnętrzny `catch`:
  `logError("<route>.<method>_failed", { requestId, userId, route, …klucze }, error)`
  i `{ error: "Błąd wewnętrzny serwera", requestId }` 500. Klucze kontekstu to
  `entryId` i `Object.keys(command)` w PATCH (bez wartości), `entryDate` w GET, `goal` w PUT
  ustawień.
- `details` z treścią błędu usunięte ze wszystkich pięciu plików.
- Kody 23503 (przepis usunięty w trakcie tworzenia wpisu) i 23514
  (`diary_entries_value_has_origin`) zostają 500, ale linia logu ma `code` z helpera.
- `recipes-route.test.ts:345`, `:412` i `preferences-route.test.ts:225` przepięte z
  `toHaveBeenCalledWith(any(String), failure.error)` na sprawdzenie, że linia JSON ma
  `error.code` z `failure.error` i nie ma go w ciele odpowiedzi. Preferencje i `recipes/[id].ts`
  przechodzą na `logError` w tym samym kroku, żeby te asercje miały jeden kształt.
- Nowe testy: `GET /api/diary-entries` przy błędzie bazy → 500 z `requestId`, bez `details`
  i z linią logu; to samo dla `users/stats` i `GET /api/recipes`.

#### 4. Błąd odczytu celu w `/diary`

**File**: `src/pages/diary.astro`, `src/components/diary/DiaryPage.tsx`,
`src/components/diary/DiaryDaySummary.tsx`, `src/pages/dev/diary-states.astro`

**Intent**: Awaria odczytu celu przestaje wyglądać jak „brak celu” (D5).

**Contract**: `diary.astro` loguje przez `logError("diary.goal_read_failed", { requestId, userId }, error)`
i przekazuje `goalError: boolean` do `DiaryPage`, a dalej do podsumowania dnia. To pokazuje
komunikat „Nie udało się wczytać dziennego celu” w tokenach (`text-destructive`) zamiast paska
celu. Nowa ramka stanu w kitchen sinku `/dev/diary-states` (reguła **States** z `AGENTS.md`).

#### 5. Dokumentacja dryfu

**File**: `docs/reference/known-drift.md`

**Intent**: Zdjąć naprawiony wpis.

**Contract**: Wpis „`GET /api/recipes` oddaje przy 500 treść błędu w `details`” usunięty, łącznie
z uwagą o `GET`/`POST /api/diary-entries`.

### Success Criteria:

#### Automated Verification:

- Testy helpera przechodzą (obiekt PostgREST, `Error`, idempotencja, `code` na wierzchu, `message` z oryginałem): `npx jest tests/unit/db-error.test.ts`
- Testy serwisów i tras w obszarze zielone: `npx jest tests/unit/diary-service.test.ts tests/unit/user-settings-service.test.ts tests/unit/diary-entries-route.test.ts tests/unit/diary-entry-route.test.ts tests/unit/user-settings-route.test.ts tests/unit/recipes-route.test.ts tests/unit/preferences-route.test.ts tests/unit/ai-service.test.ts`
- `grep -rn "Nieznany błąd" src/pages/api` nic nie zwraca
- `grep -rn "throw error;" src/lib/services/diary.service.ts` nic nie zwraca
- Cały zestaw Jest, typecheck, lint, format: `npm run test`, `npm run typecheck`, `npm run lint`, `npm run format:check`

#### Manual Verification:

- Harness R5/R6: `GET /api/diary-entries` z wymuszonym błędem PostgREST → 500 `{ error, requestId }` bez `details`, w logu jedna linia JSON z tym samym `requestId`, `error.code` i stosem z `diary.service.ts`
- `/dev/diary-states` pokazuje ramkę błędu odczytu celu w jasnym i ciemnym motywie

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na potwierdzenie ręcznych kroków przed fazą 5.

---

## Phase 5: 4xx tylko dla błędów klienta + drobne

### Overview

Awaria dostawcy (GoTrue, baza) przestaje udawać błąd użytkownika. Domknięcie drobnych ustaleń
P8, P9, P10 i P11.

### Changes Required:

#### 1. Trasy auth

**File**: `src/pages/api/auth/login.ts`, `register.ts`, `reset-password.ts`, `update-password.ts`,
`tests/unit/auth-routes.test.ts` (nowy)

**Intent**: Awaria GoTrue daje 503 i linię w logu, a nie „złe hasło” (P1, D-6). Zły JSON daje 400,
a nie 500 (P10).

**Contract**:
- Wspólna funkcja w `src/lib/utils/auth-errors.ts` (nowy):
  `classifyAuthError(error): "client" | "rate_limited" | "unavailable"`. Klasyfikacja:
  `isAuthApiError(error) && status 4xx` (poza 429) → `client`, status 429 → `rate_limited`,
  reszta (`AuthRetryableFetchError`, 5xx, brak statusu) → `unavailable`.
- `client`: dzisiejsza odpowiedź i komunikat. `rate_limited`: 429
  „Zbyt wiele prób. Spróbuj ponownie za chwilę.” i `logWarn`. `unavailable`: 503
  „Usługa logowania jest chwilowo niedostępna. Spróbuj ponownie za chwilę.” i `logError`
  z `requestId` (bez e-maila).
- `request.json()` → `.catch(() => null)` przed walidacją, jak w trasach dziennika.
- Testy: dla każdej trasy jeden przypadek na `client`/`rate_limited`/`unavailable` i zły JSON → 400.
  Atrapa `locals.supabase.auth` w stylu `tests/unit/user-settings-route.test.ts`.

#### 2. Lookupy

**File**: `src/pages/api/ai/modify-recipe.ts`, `src/pages/api/ai/save-recipe.ts`,
`src/pages/api/preferences/[id].ts`, `tests/unit/ai-modify-recipe-route.test.ts`

**Intent**: 404 tylko dla braku wiersza (P2), według wzorca `recipes/[id].ts:52-68`.

**Contract**: `if (error) { if (error.code === "PGRST116") → 404; else throw dbError(error, "<lookup>") }`,
a `!data` → 404. Błąd ląduje w zewnętrznym `catch` z `logError` i 500 z `requestId`.
`ai-modify-recipe-route.test.ts:92-98` przepięty na `code: "PGRST116"` i dopisany przypadek
„inny kod → 500”.

#### 3. Zapis z zerem wierszy i druga `getUser()`

**File**: `src/lib/services/diary.service.ts`, `src/pages/api/diary-entries/index.ts`,
`src/pages/api/diary-entries/[id].ts`, `src/pages/api/diary-entries/[id]/estimate.ts`,
`src/pages/api/user-settings/index.ts`

**Intent**: Regresja polityki UPDATE przestaje wyglądać jak wyścig (D4). Czkawka GoTrue przestaje
być 401 bez przyczyny (D6).

**Contract**:
- `updateEntry`: gdy odczyt zwrócił wiersz, a UPDATE `data === null`:
  `logWarn("diary.update_no_rows", { userId, entryId })` i dalej `null`, czyli 404 jak dziś.
- Trasy czytają `locals.user` zamiast drugiego `getUser()`. Brak `locals.user` daje 401 jak dziś
  (druga linia obrony). Testy tras, które mockują `auth.getUser`, przepięte na `locals.user`.

#### 4. Health, tabela `logs`, ponawianie w `useAI`

**File**: `src/pages/api/health.ts`, `src/lib/services/ai.service.ts`, `src/hooks/ai/useAI.ts`,
`tests/unit/use-ai.test.tsx`

**Intent**: Health mówi, które wdrożenie odpowiada i czy baza żyje (P8). Nieudany zapis do `logs`
jest widoczny (P9). Jedno kliknięcie nie mnoży wywołań modelu po 504 (P11).

**Contract**:
- `health.ts`: `version` = `VERCEL_GIT_COMMIT_SHA` (7 znaków) albo `"local"`, `environment` =
  `VERCEL_ENV` albo `MODE`. Ping bazy przez `locals.supabase.from("recipes").select("id", { head: true, count: "exact" }).limit(1)`
  (RLS daje 0 dla gościa, to nadal dowód połączenia). Błąd pingu daje 503 z
  `services.database: "error"` i `logError`. `/api/health` nie jest w `PUBLIC_PATHS`, więc
  zostaje dostępne tylko po zalogowaniu (bez zmian).
- `ai.service.ts`: `logAIAction`/`updateAIActionLog` przez `logError` z `{ userId, logId, actionType }`.
  `updateAIActionLog` z `.select("id")` i `logWarn` przy 0 wierszach. Wynik połykany jak dziś
  (przepis ważniejszy niż log).
- `useAI.ts:98-106`: 504 wyłączone z ponawiania obok 502. Test w `use-ai.test.tsx`.

### Success Criteria:

#### Automated Verification:

- Testy tras auth przechodzą (client/rate_limited/unavailable/zły JSON dla czterech tras): `npx jest tests/unit/auth-routes.test.ts`
- Testy lookupów, dziennika, ustawień, AI i `useAI` zielone: `npx jest tests/unit/ai-modify-recipe-route.test.ts tests/unit/ai-save-recipe-route.test.ts tests/unit/preferences-route.test.ts tests/unit/diary-entries-route.test.ts tests/unit/diary-entry-route.test.ts tests/unit/diary-estimate-route.test.ts tests/unit/user-settings-route.test.ts tests/unit/ai-service.test.ts tests/unit/use-ai.test.tsx`
- `grep -rn "auth.getUser()" src/pages/api/diary-entries src/pages/api/user-settings` nic nie zwraca
- Cały zestaw Jest, typecheck, lint, format: `npm run test`, `npm run typecheck`, `npm run lint`, `npm run format:check`
- E2E zielone (logowanie, izolacja, dziennik): `npm run test:e2e`

#### Manual Verification:

- Logowanie z błędnym hasłem nadal pokazuje „Nieprawidłowy email lub hasło.”; logowanie z odciętym `SUPABASE_URL` (np. zła wartość w `.env` lokalnie) pokazuje komunikat o niedostępności usługi i linię `auth.login_failed` w logu
- `/api/health` po zalogowaniu pokazuje `version` i `services.database: "ok"`

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na potwierdzenie ręcznych kroków przed fazą 6.

---

## Phase 6: Przeglądarka — ujście błędów, error boundary, „AI niedostępne”

### Overview

Błąd w przeglądarce trafia do tego samego kanału co błąd serwera. Wyspa, która się wywróci,
pokazuje komunikat zamiast pustki. `/diary` odróżnia „AI niedostępne” od „Nie policzono”.

### Changes Required:

#### 1. Trasa przyjmująca błędy klienta

**File**: `src/pages/api/client-errors.ts` (nowy), `src/lib/validations/client-errors/report.ts`
(nowy), `tests/unit/client-errors-route.test.ts` (nowy)

**Intent**: Jedyne ujście błędów przeglądarki do Vercel logs (P6).

**Contract**: `POST /api/client-errors`, **nie** w `PUBLIC_PATHS` (tylko zalogowani: middleware
przekierowuje gościa, a trasa dla pewności sprawdza `locals.user`). Schemat Zod v4
(`report.ts`): `{ events: [{ kind: "error" | "unhandledrejection" | "boundary" | "fetch", message, stack?, source?, path, at }] }`
z `max(5)` zdarzeń, `message` ≤ 500 i `stack` ≤ 4000 znaków. Treść żądania odrzucana powyżej
16 KB (sprawdzenie `content-length` i długości tekstu przed `JSON.parse`). Każde zdarzenie daje
`logWarn("client.<kind>", { requestId, userId, path, source, … })`. Odpowiedź 204. Błąd walidacji
daje 400 przez `zodIssues`. Wpis w `docs/reference/contract-surfaces.md`: kto woła, limity.

#### 2. Reporter po stronie klienta

**File**: `src/lib/utils/client-error-reporter.ts` (nowy), `src/layouts/MainLayout.astro`,
`src/layouts/AppLayout.astro`, `src/layouts/AuthLayout.astro`

**Intent**: Globalne `error` i `unhandledrejection` wysyłane raz, bez podwójnej rejestracji przy
nawigacji `ClientRouter`.

**Contract**:
- `reportClientError(event)` buforuje i wysyła przez `navigator.sendBeacon` (fallback
  `fetch(..., { keepalive: true })`) najwyżej 5 zdarzeń na załadowanie strony, z deduplikacją po
  `message+source`. `installGlobalHandlers()` rejestruje handlery tylko raz (strażnik na
  `window`). Wołany ze skryptu w `MainLayout` i `AppLayout`.
- `AuthLayout` bez reportera: strony auth są publiczne, a trasa wymaga sesji.
- Reporter nie wysyła niczego dla `AbortError`.

#### 3. Error boundary wysp i strona 500

**File**: `src/components/common/IslandErrorBoundary.tsx` (nowy), `src/components/diary/DiaryPage.tsx`,
`src/pages/500.astro` (nowy)

**Intent**: Wyjątek renderu wyspy daje komunikat i zgłoszenie, a nie pustą lub uciętą stronę (P5).

**Contract**: Klasowy `IslandErrorBoundary` (`componentDidCatch` → `reportClientError({ kind: "boundary", … })`)
z fallbackiem na prymitywie `Card` w tokenach: „Coś poszło nie tak. Odśwież stronę.”. Owija
zawartość `DiaryPage` (główna wyspa obszaru). Pozostałe wyspy zostają bez zmian (poza zakresem
obszaru). `500.astro` na `AppLayout` z komunikatem i bez danych użytkownika. Ramka fallbacku
boundary w `/dev/diary-states`.

#### 4. „AI niedostępne” w `/diary`

**File**: `src/hooks/diary/useCalorieEstimation.ts`, `src/lib/utils/diary-estimation.ts`,
`src/components/diary/DiaryEntryCalories.tsx`, `src/pages/dev/diary-states.astro`,
`tests/unit/diary-estimation.test.ts`

**Intent**: Użytkownik widzi, że AI nie odpowiedziało, i ma co zgłosić (E7).

**Contract**:
- Hook zapamiętuje `failedIds: Map<entryId, code>` dla odpowiedzi `!ok` z `body.code`
  (`AI_UNAVAILABLE`, `AI_MISCONFIGURED`) i zgłasza je przez `reportClientError({ kind: "fetch", … })`
  z wyjątkiem `AbortError`.
- `resolveEstimationState` dostaje nowy stan `unavailable` (wiersz bez wartości, faza `settled`,
  jest kod porażki). Kolejny klik „Policz ponownie” czyści wpis z `failedIds`.
- `DiaryEntryCalories` dla `unavailable` rysuje odznakę „AI niedostępne” (`text-warning`,
  `bg-warning/10`) z tym samym przyciskiem „Policz ponownie” i aktywnym polem ręcznym.
- Nowa ramka w kitchen sinku. Test `resolveEstimationState` dla `unavailable` i powrotu do `stale`.

### Success Criteria:

#### Automated Verification:

- Testy trasy błędów klienta przechodzą (204, 400 walidacji, >5 zdarzeń, >16 KB, brak `locals.user` → 401): `npx jest tests/unit/client-errors-route.test.ts`
- Testy stanu wyceny przechodzą: `npx jest tests/unit/diary-estimation.test.ts`
- Lint widoku `/diary` z regułą tokenów czysty: `npm run lint`
- Cały zestaw Jest, typecheck, format: `npm run test`, `npm run typecheck`, `npm run format:check`
- E2E zielone: `npm run test:e2e`

#### Manual Verification:

- W `/diary` wywołanie w konsoli `Promise.reject(new Error("probe"))` daje jedno żądanie do `/api/client-errors` i linię `client.unhandledrejection` z `userId`; nawigacja między stronami nie podwaja handlerów (jedno żądanie na zdarzenie)
- Wycena z fałszywym OpenRouterem zwracającym 401 pokazuje przy wpisie „AI niedostępne”, a „Policz ponownie” wraca do „Liczę…”
- `/dev/diary-states` pokazuje ramki `unavailable` i fallback boundary w obu motywach
- Ponowne uruchomienie `/10x-observability-audit --verify` na obszarach z audytu: R3, R5 i R6 z werdyktem `good`

---

## Testing Strategy

### Unit Tests:

- Nowe moduły: `log.ts` (serializacja `Error`/obiektu/napisu, `cause`, pominięcie `email`,
  `env`/`commit`), `openrouter.errors.ts` (tabela statusów, idempotencja, `isRetryable`),
  `db-error.ts`, `auth-errors.ts` (przez testy tras), trasa `client-errors`.
- Asercje logów sprawdzają **sparsowaną linię JSON** (`JSON.parse(spy.mock.calls[0][0])`):
  `event`, `requestId`, `error.code`. Nie sprawdzają pełnego napisu, żeby kolejność kluczy
  nie łamała testów.
- Brak treści użytkownika: test wyceny potwierdza, że linia `estimate.unusable_response` nie
  zawiera tekstu odpowiedzi modelu ani opisu wpisu.

### Integration Tests:

- Testy tras w Jest (wzorzec `diary-entry-route.test.ts:140-149`) dla każdego nowego 500/503/429/404.
- `npm run test:e2e` po fazach 5 i 6 jako regres logowania, izolacji i dziennika.

### Manual Testing Steps:

1. Harness prób z audytu (`.claude/worktrees/agent-a223709405b9fc6f4/probe/`, instrukcja w §8
   audytu) po fazach 2, 3 i 4. Porównać werdykty R3/R5/R6 z tabelą §3.
2. `/diary` z prawdziwym modelem: wycena opisu i przepisu daje linie `estimate.completed`.
3. Strony auth: złe hasło vs odcięty dostawca.
4. `/10x-observability-audit --verify` na koniec.

## Performance Considerations

`JSON.stringify` linii logu i pomiar `ms` są pomijalne wobec wywołania modelu (sekundy)
i zapytań Supabase. Reporter przeglądarki jest ograniczony do 5 zdarzeń na stronę i 16 KB na
żądanie, więc pętla błędów nie zaleje funkcji Vercela (budżet Active CPU,
`infrastructure.md:115`). Ping bazy w `health` to jedno zapytanie `head`.

## Migration Notes

Bez migracji bazy. `App.Locals` dostaje pole `requestId`, a `src/env.d.ts` zmienia się razem
z middleware w fazie 1. Ciała 500 tracą `details`: jedyny konsument to UI, które czyta tylko
`error`.

## Open Risks & Assumptions

- **Retencja Vercel logs na Hobby to 1 h** (`infrastructure.md:101`, `:115`). Kryterium „ja
  w Vercel logs znajduję przyczynę” obowiązuje tylko w tym oknie. Pierwsze zgłoszenie
  „wczoraj nie działało” będzie niediagnozowalne mimo tej zmiany. Trwały zapis (tabela `logs`,
  log drain) to osobna decyzja.
- **Metadane wdrożenia w logach Vercela są niepotwierdzone** (audyt §2), stąd `env`/`commit`
  w każdej linii z `process.env`. Założenie: `VERCEL_ENV` i `VERCEL_GIT_COMMIT_SHA` są dostępne
  w funkcji runtime (system env vars Vercela). Jeśli nie, pola mają `"local"` i nic się nie psuje.
- **`x-vercel-id` ma format platformy** (np. `fra1::abc-123`). Jeśli Vercel go zmieni, zmienia się
  tylko wygląd id. Fallback na UUID zostaje.
- **Fałszywy sukces zapisu (D1) zostaje do osobnej zmiany.** Po tej zmianie jest przynajmniej
  widoczny w logu (`auth.session_invalid`/`auth.get_user_failed`), ale użytkownik dalej widzi
  toast sukcesu.
- **`POST /api/client-errors` przyjmuje tekst od klienta.** Zalogowany użytkownik może wpisać
  do logu dowolny napis do limitu. Akceptowalne przy kilku użytkownikach; bez limitu częstości
  (jak trasy AI).

## References

- Frame: `context/changes/observability-error-visibility/frame.md`
- Audyt: `context/audits/observability/2026-10-14_diary-entries-ai-calorie-estimation.md`
- Retencja: `context/foundation/infrastructure.md:101`, `:115`
- Decyzja D2 (302 dla API): `context/archive/2026-10-05-testing-session-and-access-boundaries/plan.md:74`, `:101`
- Lekcja `flushCookies`: `context/foundation/lessons.md`
- Wzorzec lookupu z `PGRST116`: `src/pages/api/recipes/[id].ts:52-68`
- Wzorzec 500 w testach tras: `tests/unit/diary-entry-route.test.ts:140-149`
- Szew `import.meta` w ts-jest: `src/lib/services/calorie-estimation.service.ts:60-75`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Moduł logowania, requestId i middleware

#### Automated

- [x] 1.1 Testy modułu logowania przechodzą (Error, obiekt PostgREST, łańcuch cause, napis, pominięcie email) — 21951ac
- [x] 1.2 Testy middleware przechodzą, łącznie z dawnym it.failing jako it — 21951ac
- [x] 1.3 Cały zestaw Jest zielony — 21951ac
- [x] 1.4 Typecheck bez błędów — 21951ac
- [x] 1.5 Lint i format czyste — 21951ac

#### Manual

- [x] 1.6 Zepsute ciasteczko na /diary daje linię JSON auth.session_invalid z requestId i redirect na /auth/login — 21951ac

### Phase 2: OpenRouter — jedno mapowanie błędu

#### Automated

- [x] 2.1 Testy mapowania przechodzą (401/403/404/402/429/timeout/idempotencja/brak ponowień 4xx) — 55a6240
- [x] 2.2 Testy serwisów i tras AI bez zmian zielone — 55a6240
- [x] 2.3 Brak mapErrorToCustomError i handleRequestError w openrouter.service.ts — 55a6240
- [x] 2.4 Cały zestaw Jest, typecheck, lint, format — 55a6240

#### Manual

- [x] 2.5 Harness R3: trzy różne linie dla 401/429/404 i jedno żądanie na 4xx — 55a6240

### Phase 3: Wycena kalorii — powód zamiast cichego null

#### Automated

- [x] 3.1 Testy serwisu wyceny przechodzą, łącznie z nowym blokiem powodów — d9f7294
- [x] 3.2 Testy trasy wyceny przechodzą — d9f7294
- [x] 3.3 Testy serwisu dziennika i danych chronionych zielone — d9f7294
- [x] 3.4 Cały zestaw Jest, typecheck, lint, format — d9f7294

#### Manual

- [x] 3.5 Harness R3: 200 z error daje 502 z ResponseParsingError, śmieć daje warn no_json bez treści — d9f7294
- [x] 3.6 Wycena z prawdziwym modelem daje linię estimate.completed z ms — d9f7294

### Phase 4: Błędy bazy i kontekst w trasach

#### Automated

- [x] 4.1 Testy helpera błędów bazy przechodzą — e62c1ef
- [x] 4.2 Testy serwisów i tras w obszarze zielone — e62c1ef
- [x] 4.3 Brak „Nieznany błąd” w src/pages/api — e62c1ef
- [x] 4.4 Brak gołego throw error w diary.service.ts — e62c1ef
- [x] 4.5 Cały zestaw Jest, typecheck, lint, format — e62c1ef

#### Manual

- [x] 4.6 Harness R5/R6: 500 z requestId bez details i linia JSON z code i stosem — e62c1ef
- [x] 4.7 Ramka błędu odczytu celu w /dev/diary-states w obu motywach — e62c1ef

### Phase 5: 4xx tylko dla błędów klienta + drobne

#### Automated

- [x] 5.1 Testy tras auth przechodzą (client/rate_limited/unavailable/zły JSON)
- [x] 5.2 Testy lookupów, dziennika, ustawień, AI i useAI zielone
- [x] 5.3 Brak drugiego auth.getUser() w trasach dziennika i ustawień
- [x] 5.4 Cały zestaw Jest, typecheck, lint, format
- [x] 5.5 E2E zielone

#### Manual

- [ ] 5.6 Złe hasło vs odcięty dostawca: różne komunikaty i linia auth.login_failed
- [ ] 5.7 /api/health pokazuje version i stan bazy

### Phase 6: Przeglądarka — ujście błędów, error boundary, „AI niedostępne”

#### Automated

- [ ] 6.1 Testy trasy błędów klienta przechodzą
- [ ] 6.2 Testy stanu wyceny przechodzą
- [ ] 6.3 Lint widoku /diary z regułą tokenów czysty
- [ ] 6.4 Cały zestaw Jest, typecheck, format
- [ ] 6.5 E2E zielone

#### Manual

- [ ] 6.6 unhandledrejection w /diary daje jedno żądanie i linię client.unhandledrejection, bez podwójnych handlerów po nawigacji
- [ ] 6.7 Wycena z 401 dostawcy pokazuje „AI niedostępne”, ponowienie wraca do „Liczę…”
- [ ] 6.8 Ramki unavailable i fallback boundary w /dev/diary-states w obu motywach
- [ ] 6.9 /10x-observability-audit --verify: R3, R5, R6 z werdyktem good
