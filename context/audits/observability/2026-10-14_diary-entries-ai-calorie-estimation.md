---
type: observability-audit
date: 2026-10-14 14:51
mode: audit
commit: 4e14c93
branch: master
dirty_tree: false
areas: [diary-entries, ai-calorie-estimation]
area_source: user
runtime_proof: observed
error_tracker: none (console.* → Vercel Runtime Logs)
previous_report: null
findings: { critical: 4, high: 7, medium: 14, low: 9 }
---

# Audyt observability — wpisy dziennika i wycena kalorii AI (2026-10-14)

## 1. TL;DR

- **Awaria auth udaje wylogowanie, a zapis udaje sukces.** Middleware gubi `error` z `getUser()` i każdą
  ścieżkę chronioną — także JSON `/api/*` — kończy 302 na `/auth/login`. `fetch` idzie za
  przekierowaniem, dostaje 200 HTML, a `DiaryPage` patrzy tylko na `response.ok`: wygasła sesja
  albo awaria Supabase przy PATCH/DELETE wpisu kończy się toastem „Kalorie zostały zapisane” /
  „Wpis został usunięty”, choć nic się nie zapisało. W logach: same 302. **Udowodnione w runtime.**
- **Każda awaria OpenRoutera to w logu „NetworkError”.** Klient mapuje błąd dwa razy (interceptor,
  potem pętla ponowień), więc 401 (klucz), 429 (limit) i 404 (model usunięty) dają identyczną
  linię bez statusu i bez komunikatu dostawcy. **Udowodnione.**
- **„Brak wartości” jest stanem danych, nie błędem — także w logach.** Odpowiedź modelu bez liczby,
  200 z `{error}` od OpenRoutera, odrzucenie zakresu, zapis przeterminowany: 200 z `calories: null`
  i zero linii w logu. Regresja modelu na produkcji jest całkowicie niewidoczna. **Udowodnione.**
- **Błędy PostgREST to zwykłe obiekty, a kod zakłada `Error`.** `instanceof Error` jest fałszem,
  więc `GET /api/diary-entries` przy awarii bazy odsyła `details: "Nieznany błąd"` i niczego nie
  loguje; `throw error` nie niesie stosu; `new Error(error.message)` gubi `code`/`hint`.
  **Udowodnione.**
- **Błędy wynikowe SDK są mapowane na 4xx bez logu** — logowanie (awaria GoTrue = „złe hasło”),
  `getUser()` w trasach (= 401), zapisy z zerem wierszy (= 404, a DELETE 404 UI traktuje jako sukces).
- **Logi, które powstają, nie mówią kto/co/który krok** — brak `userId`, `entryId`, modelu, kroku
  kaskady, czasu trwania i identyfikatora żądania; przeglądarka nie oddaje niczego poza urządzenie.

## 2. Model przechwytywania

- **Runtime:** Astro 7 SSR (`output: "server"`) na funkcjach Vercela przez `@astrojs/vercel` 11.0.12,
  `maxDuration: 60` (`astro.config.mjs`), plus wyspy React 19 w przeglądarce.
- **Error tracker: brak.** Żadnego SDK (Sentry/Datadog/OTel) w `src/` ani `package.json`. Jedyna
  ścieżka serwerowa: `console.*` → Vercel Runtime Logs; statusy w logach żądań Vercela.
  Vercel Web Analytics włączone (`astro.config.mjs`) — nie zbiera błędów JS.
- **Granice przechwytywania:**
  - Niezłapany wyjątek w trasie/stronie: Astro łapie go w `node_modules/astro/dist/core/routing/handler.js:101-108`
    i loguje `err.stack || err.message` jako **napis** przez `console.error`, potem 500. Brak
    `src/pages/500.astro` → pusta treść 500.
  - Błąd po pierwszym bajcie strumienia SSR (`runtime/server/render/astro/render.js:66-72`) idzie do
    `controller.error` bez logu Astro; status już 200.
  - Middleware `src/middleware/index.ts` biegnie przed każdą trasą, ale niczego nie raportuje; błędy
    `getUser()` zwracane są jako wynik (`auth-js GoTrueClient._getUser`), nie rzucane.
  - Przeglądarka: brak `window.onerror`, `unhandledrejection`, error boundary,
    `onRecoverableError`. Jedynym ujściem jest toast (`src/hooks/common/useToast.ts`) i konsola
    przeglądarki.
- **Logowanie:** surowe `console.error("<etykieta>:", error)` (~40 wywołań serwerowych). Błędy
  PostgREST (postgrest-js 2.116 bez `throwOnError`) to zwykłe obiekty z `JSON.parse(body)`
  (`node_modules/@supabase/postgrest-js/dist/index.mjs:516`) — `console.error` wypisuje
  `code/message`, ale bez stosu. 0 użyć `cause:` w `src/`.
- **Scrubbing / sampling:** brak w kodzie.
- **Tożsamość wdrożenia:** brak — nic nie czyta `VERCEL_ENV` / `VERCEL_GIT_COMMIT_SHA`;
  `src/pages/api/health.ts:13` ma zaszyte `"1.0.0"` i niczego nie sprawdza.

**Założenia (poza repo, nie ustalenia):**
- Vercel Runtime Logs zbierają `console.*` funkcji — potwierdzone przez użytkownika („tylko Vercel logs”).
- Brak alertów i log drain — potwierdzone przez użytkownika; każda linia logu jest więc „do znalezienia,
  jeśli wiesz, czego szukać”.
- Logi Vercela niosą metadane wdrożenia/środowiska — niepotwierdzone.
- Czy runtime Node na Vercelu loguje `controller.error` strumienia — niepotwierdzone.

## 3. Co trafia do logów (próby runtime)

Dev-server `astro dev --mode test` w izolowanym worktree, fałszywy OpenRouter na :9877, projekt
Supabase `integration`, konto E2E. Wszystkie wiersze **observed**, chyba że zaznaczono.

| Kształt awarii | Odpowiedź | Konsola serwera | Werdykt |
|---|---|---|---|
| R1 PATCH/DELETE wpisu z wygasłą sesją (refresh token unieważniony), `redirect: follow` | **200 ok=true**, końcowy URL `/auth/login`, text/html (drugi skok to `PATCH /auth/login`) | `AuthApiError: Refresh token is not valid` (z auth-js, bez trasy/użytkownika), `[302] PATCH /api/diary-entries/…` | **missed** — klient pokazałby toast sukcesu |
| R1 bez ciasteczka / zepsute ciasteczko | 200 ok=true, `/auth/login` | tylko 302/200 (+ ostrzeżenie `@supabase/ssr` przy zepsutym) | **missed** |
| R2 awaria GoTrue (`getUser` → `{user:null, error}`) na `/diary` i `/api/diary-entries` | 302 → `/auth/login` | tylko `[302] …` | **missed** — awaria = „wylogowanie” |
| R3 OpenRouter 401 / 429 / 404 | 502 `AI_UNAVAILABLE` | **ta sama linia** dla trzech: `Błąd dostawcy AI…: NetworkError: Błąd sieci podczas komunikacji z API` + stos z `mapErrorToCustomError` | **poor** |
| R3 OpenRouter 200 z `{"error":…}`, bez `choices` | 200, `calories: null` | tylko `[200] POST …/estimate` | **missed** |
| R3 odpowiedź „I cannot help with that” | 200, `calories: null` | tylko `[200] …` | **missed** |
| R3 `{"calories":450}` (kontrola) | 200, 450 | `[200]` | good |
| R4 `throw new Error(…, {cause})` w trasie | 500 | stos + „Caused by” (format dev; produkcja może pominąć cause — *inferred*) | good |
| R5 `throw` błędu PostgREST | 500 | `instanceof Error=false`, `relation … does not exist` + ostrzeżenie Astro „throw Error objects instead of object”; brak stosu do kodu aplikacji | **poor** |
| R6 błąd PostgREST przez istniejący `catch` w `GET /api/diary-entries` | 500 `{"details":"Nieznany błąd"}` | tylko `[500] …` | **missed** |

Uwaga dev ≠ prod: produkcyjny Astro nie loguje linii `[status] ścieżka` per żądanie; tam R2, R3-200err,
R3-garbage i R6 zostawiają **wyłącznie** status w logu żądań Vercela (*inferred*).

## 4. Systemowe przyczyny

1. **RC1 — przekierowanie zamiast błędu przed API JSON.** `src/middleware/index.ts:69-80` destrukturyzuje
   tylko `user`, gubi `error` i dla każdej nie-publicznej ścieżki, także `/api/*`, zwraca 302.
   Klienci (`src/components/diary/DiaryPage.tsx:139-150`, `:213-219`, `DiaryEntryEditModal.tsx:241-250`,
   `DiaryEntryForm.tsx:225-243`, `useDiaryEntries.ts:44-66`) sprawdzają tylko `response.ok`, a
   przekierowany `fetch` jest `ok`. Rozsądne dla stron, złe dla API. Wyjaśnia D1, D10, D6, P1-pokrewne.
2. **RC2 — podwójne mapowanie błędów w kliencie OpenRoutera.** Interceptor
   `src/lib/api/openrouter.service.ts:78-81` → `handleRequestError` (`:259-265`) mapuje błąd axios na
   podklasę `OpenRouterError` bez `.response`; `executeRequest` (`:170-197`) uznaje go za ponawialny
   (`isRetryableError`, `:205-210`) i po próbach mapuje ponownie na `NetworkError` (`:227-228`).
   Taksonomia błędów istnieje, ale jest martwym kodem. Wyjaśnia E1, E13, część E4.
3. **RC3 — „brak wartości” jako normalny stan przenosi się na logi.** Świadoma decyzja produktowa
   (dziennik używalny bez estymacji) zrealizowana tak, że każda degradacja zwraca `null` bez śladu:
   `extractCalories` (`src/lib/services/calorie-estimation.service.ts:185-230`), `processResponse`
   jako gołe rzutowanie typu (`openrouter.service.ts:270-281`), przeterminowany `applyEstimate`
   (`src/lib/services/diary.service.ts:240-262`), odcięcie >5000 (`src/pages/api/diary-entries/[id]/estimate.ts:123-126`),
   porzucony `reason` parsera (`diary.service.ts:100-105`, `:338-345`). Wyjaśnia E2, E3, E5, E9, E10, D9.
4. **RC4 — błędy PostgREST to zwykłe obiekty, kod traktuje je jak `Error`.** postgrest-js zwraca
   `error = JSON.parse(body)` (`index.mjs:516`). Skutki: `error instanceof Error ? … : "Nieznany błąd"`
   bez logu (`src/pages/api/diary-entries/index.ts:47`, `:115`; `recipes/index.ts:85`;
   `users/stats.ts:59`); `throw error` bez stosu (`diary.service.ts`, trasy); przepakowanie
   `new Error(error.message)` gubi `code/hint` (`src/lib/services/user-settings.service.ts:30`, `:58`;
   `ai.service.ts:539`). Wyjaśnia D2, D5, P3, P4 i koryguje wpis known-drift „GET /api/recipes
   oddaje przy 500 treść błędu” (dla błędów bazy oddaje stałe „Nieznany błąd”).
5. **RC5 — błędy wynikowe mapowane na 4xx/404 bez logu.** `{ error }` z auth/PostgREST oraz zapis
   z zerem wierszy zamieniane na 401/400/404: `login.ts:30-40`, `register.ts:30-41`,
   `reset-password.ts:65-75`, `getUser()` w trasach (`diary-entries/index.ts:14-25`, `:63-74`,
   `user-settings/index.ts:14-23`), `diary.service.ts:367-379` i `:392-405`, lookupy w
   `ai/modify-recipe.ts:69-76`, `ai/save-recipe.ts:98-108`, `preferences/[id].ts:83-87`, `:158-162`.
   Wyjaśnia D3, D4, D6, P1, P2.
6. **RC6 — logi bez kontekstu i korelacji.** `console.error` z samą etykietą (`estimate.ts:133`, `:181`;
   `[id].ts:97`, `:151`; `user-settings/index.ts:31`, `:79`), zero `cause`, zero identyfikatora
   żądania w odpowiedzi, zero tożsamości wdrożenia, brak globalnych handlerów w przeglądarce.
   Wyjaśnia D7, D11, E4, E7, E8, E11, P6, P8.

## 5. Ustalenia według obszarów

### Wpisy dziennika

| # | Lokalizacja | Kategoria | Waga | Co się dzieje na produkcji | Kierunek naprawy |
|---|---|---|---|---|---|
| D1 | `src/middleware/index.ts:69-80`; `DiaryPage.tsx:139-150`, `:213-219` | flattened-response | critical | Wygasła sesja albo awaria GoTrue przy zapisie kalorii/usunięciu → 302 → 200 HTML → toast sukcesu, nic nie zapisane; refetch kończy się „Unexpected token <”. Logi: same 302 (R1, R1x, R2 observed) | Dla `/api/*` 401 JSON zamiast redirectu; logować `error` z `getUser()` poza `AuthSessionMissingError` (503 dla retryable); klient sprawdza `response.redirected`/content-type |
| D2 | `src/pages/api/diary-entries/index.ts:44-50`, `:112-124` | flattened-response | high | Awaria bazy przy ładowaniu dnia lub tworzeniu wpisu → 500 `details: "Nieznany błąd"`, **zero logu** (R6 observed); FK 23503 (przepis usunięty w trakcie) i 23514 (`diary_entries_value_has_origin`, błąd kaskady) też jako cichy 500 | `console.error` z obiektem i `code`; stałe ciało; 23503 → 404 (rozszerza known-drift) |
| D3 | `diary.service.ts:392-405`; `[id].ts:141`; `DiaryPage.tsx:213` | flattened-response | high | Regresja RLS/filtra przy DELETE → 0 wierszy → 404 → UI „Wpis został usunięty”, wpis wraca po odświeżeniu; w logu 404 identyczny z drugą kartą (*static*) | Przy 0 wierszy sprawdzić istnienie; jeśli wiersz jest — `console.error` z id i 500 |
| D4 | `diary.service.ts:293-298`, `:367-379`; `[id].ts:86` | flattened-response | medium | PATCH czyta wiersz, UPDATE trafia w 0 → 404 „nie znaleziono” bez logu; regresja polityki UPDATE wygląda jak wyścig | `console.warn` z id, gdy odczyt był, a zapis nie |
| D5 | `user-settings.service.ts:30`, `:58`; `src/pages/diary.astro:14-17`; `DiaryDaySummary.tsx:403` | identity-lost | high | Awaria odczytu celu → pasek celu znika bez komunikatu („brak celu”); log: `new Error(message)` bez `code/hint/details`, bez userId; CHECK 23514 przy zapisie nie do odróżnienia od RLS | `throw error` opakowany z `cause`; flaga `goalError` do wyspy |
| D6 | `diary-entries/index.ts:14-25`, `:63-74`; `[id].ts` PATCH/DELETE; `user-settings/index.ts:14-23` | missing-throw | medium | Druga `getUser()` w trasie ignoruje `error` → czkawka GoTrue = 401 „Nieautoryzowany dostęp” bez przyczyny | Czytać `locals.user`; logować `error` |
| D7 | `[id].ts:97`, `:151`; `user-settings/index.ts:31`, `:79` | missing-context | medium | 500 w logu bez userId/entryId/kluczy komendy (`recalculate`?) — nie da się powiązać ze zgłoszeniem | Strukturalny log `{route, userId, entryId, keys, error}` |
| D9 | `diary.service.ts:100-105`, `:338-345` | logged-not-captured | medium | `reason` parsera (`out_of_range`, `no_declared_block`) wyrzucony; nie da się wyjaśnić „Nie policzono” ani znanego błędu nagłówka F2 | Log info `{entryId, recipeId, reason, perPortion}` |
| D10 | `useDiaryEntries.ts:44-66`; `DiaryEntryEditModal.tsx:241-250`; `DiaryEntryForm.tsx:225-243` | identity-lost | medium | Klient redukuje odpowiedź do `errorData.error`, gubi status i `details`; odpowiedź HTML po redirect pokazuje użytkownikowi „Unexpected token '<'” | Zachować status; nie-JSON → „zaloguj się ponownie” |
| D11 | wszystkie toasty/500 w obszarze | missing-context | low | Użytkownik widzi „Błąd wewnętrzny serwera” bez identyfikatora; dopasowanie do logu tylko po czasie | Zwracać `x-vercel-id`/własny id w ciele 500 i logować go |

### Wycena kalorii AI

| # | Lokalizacja | Kategoria | Waga | Co się dzieje na produkcji | Kierunek naprawy |
|---|---|---|---|---|---|
| E1 | `src/lib/api/openrouter.service.ts:78-81`, `:170-197`, `:205-228`, `:259-265` | identity-lost | critical | Unieważniony klucz, wyczerpany limit, usunięty model `:free`, timeout → ta sama linia „NetworkError: Błąd sieci” + 502 `AI_UNAVAILABLE`; ponadto nieponawialne 4xx są ponawiane (R3 observed) | `instanceof OpenRouterError` → rzucić bez zmian przed `isRetryableError`; `status`, `model`, `cause` na błędzie |
| E2 | `calorie-estimation.service.ts:185-230`; `estimate.ts:153-163` | swallowed | critical | Pusta/ucięta (`finish_reason: length`), nie-JSON, bez `calories`, NaN, poza zakresem → 200 „Nie policzono”, **zero logu** (R3 garbage observed); systemowa regresja modelu niewidoczna | Zwracać powód i `console.warn({reason, finish_reason, model, raw: slice})` |
| E3 | `openrouter.service.ts:270-281`; `calorie-estimation.service.ts:186` | missing-throw | critical | 200 od OpenRoutera z `{error}` bez `choices` (błąd dostawcy zawinięty w 200) → ta sama cicha ścieżka 200/null (R3 200err observed) | Walidować kopertę; `ResponseParsingError` przy braku `choices[0]` lub obecności `error` |
| E4 | `estimate.ts:133`, `:181`; `openrouter.types.ts:102-106` | missing-context | high | Log błędu AI bez userId, entryId, gałęzi (`ai_from_recipe`/`ai_from_description`), modelu, statusu, czasu, kroku (`markEstimationRequested`/`readOwnRecipeContent`/`applyEstimate`) | Jeden obiekt `{entryId, userId, branch, model, status, ms, step}` |
| E5 | `diary.service.ts:240-262`; `estimate.ts:168-177` | swallowed | high | Przeterminowany `applyEstimate` zapisuje 0 wierszy: model opłacony, wynik wyrzucony, 200 bez wartości, zero logu — znana luka „bez dedup” jest przez to niemierzalna | `console.warn("estimate discarded: stale stamp", {entryId, requestedAt})` |
| E6 | `calorie-estimation.service.ts:57-96`; `estimate.ts:132-141` | config | medium | Brak `OPENROUTER_API_KEY` → 502 `AI_UNAVAILABLE` jak chwilowa awaria (log ma treść, więc diagnozowalne); w statusach miesza się trwała misconfiguracja z blipami | Osobny kod `AI_MISCONFIGURED` |
| E7 | `src/hooks/diary/useCalorieEstimation.ts:105-118`; `src/lib/utils/diary-estimation.ts:38` | logged-not-captured | high | 401/404/500/502/sieć → tylko konsola przeglądarki; UI pokazuje ten sam stan „Nie policzono” co uczciwe `null` modelu — użytkownik nie ma czego zgłosić | Pokazywać `body.code` („AI niedostępne”); ujście błędów przeglądarki |
| E8 | `estimate.ts:65`; `diary-estimation.ts:3-8`; `openrouter.service.ts:183` | missing-context | medium | Brak pary start/koniec z czasem w łańcuchu 55/60/65 s; zabicie funkcji przy 60 s widać tylko jako timeout platformy; 55 s + backoff + 3–4 zapytania Supabase mogą przekroczyć `maxDuration` | Log start/koniec z `ms` |
| E9 | `estimate.ts:123-126` | swallowed | medium | Wartość z gałęzi przepisu × porcje > 5000 → `null`/200 bez logu; model odpowiadający „całe danie” zamiast „porcja” nieodróżnialny od „nie umiem” | `console.warn({perPortion, portions})` |
| E10 | `estimate.ts:86-92` | swallowed | low | `RecipeNotFoundError` cicho przełącza na gałąź opisową; widać to tylko w zapisanym `calorie_origin` | Log info o przełączeniu |
| E11 | `openrouter.service.ts:151`; `calorie-estimation.service.ts:94-95` | identity-lost | medium | Błędy odbudowane z samego komunikatu, bez `cause` — kod axios (`ECONNABORTED`/`ENOTFOUND`) i stos przepadają | `new OpenRouterError(msg, { cause })` |
| E12 | `openrouter.service.ts:72-73` | config | low | `HTTP-Referer: https://api.example.com`, `X-Title: "OpenRouter Service Integration"` — w panelu OpenRoutera wywołania aplikacji nieodróżnialne, brak korelacji z Vercelem | Prawdziwy URL i nazwa z env |
| E13 | `openrouter.service.ts:53` | missing-context | low | Domyślny model zaszyty i nigdy nie logowany; przy usunięciu modelu (razem z E1) log nie mówi, o który chodzi | Logować model w każdym błędzie |

### Platforma / infrastruktura przekrojowa

| # | Lokalizacja | Kategoria | Waga | Co się dzieje na produkcji | Kierunek naprawy |
|---|---|---|---|---|---|
| P1 | `src/pages/api/auth/login.ts:30-40`; `register.ts:30-41`; `reset-password.ts:65-75` | flattened-response | high | Awaria GoTrue (5xx, `AuthRetryableFetchError`) → 401 „Nieprawidłowy email lub hasło” / 400, bez logu; awaria logowania wygląda jak literówki użytkowników | `isAuthApiError`/status: 4xx klienta → jak dziś, reszta → log + 5xx |
| P2 | `ai/modify-recipe.ts:69-76`; `ai/save-recipe.ts:98-108`; `preferences/[id].ts:83-87`, `:158-162` | flattened-response | medium | Każdy błąd bazy przy lookupie → 404 bez logu (`recipes/[id].ts:60-68` robi to dobrze przez `PGRST116`) | 404 tylko dla `PGRST116`/brak danych, reszta → log + 500 |
| P3 | `src/pages/api/users/stats.ts:57-67` | swallowed | medium | 500 bez logu, `details` = „Nieznany błąd” dla błędów bazy (bliźniak known-drift `GET /api/recipes`) | `console.error` + stałe ciało |
| P4 | `throw error` w trasach/serwisach (`diary.service.ts`, `recipes/index.ts:73`, `users/stats.ts:30`); `ai.service.ts:539` | identity-lost | medium | Rzucany zwykły obiekt: Astro loguje tylko message, brak stosu do kodu aplikacji (R5 observed); przepakowanie gubi `code/hint` | Helper `new Error(msg, { cause: error })` z `code` na wierzchu |
| P5 | `astro/.../render.js:66-72`; brak error boundary; brak `src/pages/500.astro` | coverage-gap | medium | Crash SSR wyspy po pierwszym bajcie → ucięty HTML ze statusem 200, bez logu Astro; niezłapany 500 → pusta strona | Error boundary wokół wysp z logiem; `500.astro` |
| P6 | brak globalnych handlerów; `useAuth.ts` (7× `catch {`); `useSecurityGuard.ts:17-20`; `recipe.service.ts` | coverage-gap | medium | Błędy przeglądarki nigdy nie opuszczają urządzenia; `useSecurityGuard` wylogowuje przy dowolnym błędzie sieci | `window` `error`/`unhandledrejection` → beacon do trasy logującej |
| P7 | `src/middleware/index.ts:82` | missing-throw | low | Wyjątek w `next()` omija `flushCookies` — zrotowany token przepada przy każdym 500 (uogólnia known-drift „Middleware”) | `try/finally` wokół `next()` |
| P8 | `src/pages/api/health.ts:13-14`; brak `VERCEL_*` | identity-lost | low | Linii logu nie da się przypisać do wdrożenia z poziomu kodu; preview i prod raportują `MODE=production`; health niczego nie sprawdza | Logować `VERCEL_ENV`/`VERCEL_GIT_COMMIT_SHA`; ping bazy w health |
| P9 | `ai.service.ts:652-694` | swallowed | low | Nieudany insert do `logs` połknięty (200 dla przepisu), `updateAIActionLog` bez `.select()` — 0 wierszy niewidoczne | `.select()`; kontekst `{logId, userId}` |
| P10 | `request.json()` w zewnętrznym `try` (login, register, reset-password, update-password, generate-recipe, modify-recipe) | noise | low | Zły JSON od klienta → 500 + zalogowany SyntaxError | `.catch(() => null)` → 400, jak w nowszych trasach |
| P11 | `src/hooks/useAI.ts:88-106` | noise | low | Auto-ponawianie 5xx łącznie z 504 Vercela → jedno kliknięcie = N wywołań modelu i N linii błędu | Wykluczyć 504 |

## 6. Rekomendowana kolejność napraw

1. **Middleware: 401 JSON dla `/api/*` + log błędu `getUser()`** (zamyka D1, D10 w dużej części,
   D6 przy okazji przejścia na `locals.user`). Jedna zmiana w jednym pliku usuwa jedyne ustalenie,
   które wprowadza użytkownika w błąd co do *zapisu danych*. Uwaga: `flushCookies` na każdym wyjściu
   (lessons.md); `AuthSessionMissingError` to normalny gość — nie logować go (noise).
2. **OpenRouter: jedno mapowanie błędu** (E1, E13, E11). Kilka linii w `executeRequest`; od razu
   rozróżnia klucz/limit/model w logach i przestaje ponawiać 4xx. Brak testów `openrouter.service.ts` —
   dopisać test na 401/429/404.
3. **Wycena: powód zamiast gołego `null` + walidacja koperty + warn przy stale/odcięciu** (E2, E3, E5,
   E9, E10). `console.warn` z obciętą surową odpowiedzią — bez treści wpisu użytkownika poza tym, co
   już idzie do modelu; nie logować e-maili.
4. **Helper błędów PostgREST** (`toError(error, msg)` z `cause` i `code`) użyty w serwisach i
   `catch`-ach tras (D2, D5, P3, P4, część D4). Zastępuje `instanceof Error ? … : "Nieznany błąd"`.
5. **Strukturalny kontekst w logach** `{route, userId, entryId, step, model, ms}` + id żądania w ciele
   500 (D7, D11, E4, E8). userId to UUID, nie PII w sensie e-maila.
6. **Mapowanie 4xx tylko dla błędów klienta** w auth i lookupach (P1, P2, D3, D4).
7. **Ujście błędów przeglądarki** i error boundary wysp (E7, P5, P6) — największy zasięg, ale wymaga
   nowej trasy logującej (w `PUBLIC_PATHS`? raczej nie — tylko zalogowani) i limitu.
8. Reszta (P7–P11, E6, E12, D9) przy okazji.

## 8. Metoda i ograniczenia

- **Agenci:** audytor „wpisy dziennika”, audytor „wycena kalorii AI”, audytor infrastruktury
  (read-only, równolegle) + próbnik runtime w izolowanym worktree.
- **Sprawdzone ręcznie:** podwójne mapowanie OpenRoutera (`openrouter.service.ts:170-265`);
  `extractCalories` zwracający `null` bez logu; `DiaryPage` sprawdzający tylko `response.ok`;
  `UserSettingsService` przepakowujący `new Error(error.message)`; kształt błędu postgrest-js 2.116
  (`index.mjs:516` — **zwykły obiekt**; audytor dziennika twierdził, że `PostgrestError extends Error`
  bez `throwOnError` — to nieprawda, teza odrzucona); `login.ts:30-40`; `users/stats.ts:57-67`.
- **Runtime:** `astro dev --mode test` (adaptera Vercela nie da się serwować lokalnie produkcyjnie) —
  różnice dev/prod opisane w §3. Wpisy próbne (id 908, 909) usunięte (DELETE 204, GET potwierdza).
  Prawdziwy OpenRouter nie był wołany (fałszywy serwer zarejestrował `probe-key`).
- **Statyczne (nie udowodnione runtime):** D3, D4, D5, P1, P2, P5, E5, E8, E9.
- **Przegląd repo (`src/`, bez testów, 141 plików):** `catch {` bez wiązania 12; puste `catch(e){}` 0;
  `.catch(() =>` 22 (15 klient `response.json()`, 7 serwer `request.json()`); `console.error` 65
  (~40 serwer), z samym komunikatem 5; `throw new Error(` 36, z `cause` 0.
- **Harness prób:** `.claude/worktrees/agent-a223709405b9fc6f4/probe/` (`suite.mjs`,
  `fake-openrouter.mjs`, `junc.cjs`). Zmienione w worktree: `src/lib/api/openrouter.service.ts`
  (override `OPENROUTER_API_URL`), `src/middleware/index.ts` (`x-probe: supabase-down`),
  `src/pages/api/diary-entries/index.ts` (`x-probe: throw|pgrst|pgrst-logged|pgrst-caught`).
  Worktree zawiera `.env`/`.env.test` z prawdziwymi poświadczeniami Supabase/E2E — usunąć po użyciu.
  Ponowne uruchomienie (z katalogu worktree):
  ```
  node probe/junc.cjs create
  node probe/fake-openrouter.mjs            # w tle
  npx astro dev --mode test --port 4399 --ignore-lock > probe/server.log 2>&1   # w tle
  node probe/suite.mjs
  node probe/junc.cjs remove
  ```
