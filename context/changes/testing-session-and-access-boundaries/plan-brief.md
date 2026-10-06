# Granice sesji i dostępu — Plan Brief

> Full plan: `context/changes/testing-session-and-access-boundaries/plan.md`
> Research: `context/changes/testing-session-and-access-boundaries/research.md`

## What & Why

Faza 2 test-planu ma udowodnić dwie rzeczy. Po „Wyloguj” sesja naprawdę się kończy, a lista ścieżek
publicznych niczego nie otwiera ani nie blokuje (§2 #3). Użytkownik nie dosięga też cudzych rekordów
(§2 #4). Faza tylko testuje i niczego nie naprawia: znalezione defekty przypina jako `test.failing`
z wpisem w known-drift.

## Starting Point

Middleware, wylogowanie i izolacja nie mają żadnego testu zachowania. Istniejące testy własności
sprawdzają tylko, że filtr `user_id` „został wywołany”, i mają jednego użytkownika. Harness e2e ma jedno
konto testowe.

## Desired End State

- Jest sprawdza decyzję middleware dla każdej ścieżki z wymagania i z drzewa stron oraz to, że każde
  wyjście niesie ciasteczka.
- Jest sprawdza, że cudzy przepis nie trafi do wpisu.
- E2E dowodzi, że ciasteczka sprzed wylogowania nie otwierają ani strony, ani API.
- Dwa defekty (klient wylogowania udaje sukces, DELETE cudzego przepisu odpowiada 200) są przypięte
  i opisane.
- Cookbook §6.3/§6.4 mówi, jak dodać kolejny taki test.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Klient wylogowania przy błędzie | `test.failing` + known-drift, bez naprawy | faza testowa nie zmienia zachowania; defekt ma być widoczny | Plan |
| API bez sesji | 302 → `/auth/login` jest kontraktem | zgodne z guidance §2 #3 i obecnym kodem | Research / Plan |
| `/api/health` | chroniony, bez sesji 302 | PRD: bez sesji tylko auth; endpoint nie ma konsumenta | Plan |
| Drugie konto e2e | brak | decyzja użytkownika; RLS zostaje bez automatycznego dowodu | Plan |
| DELETE cudzego przepisu → 200 | stan wiersza w `it`, status 404 w `test.failing` + known-drift | spójnie z D1; dane są bezpieczne, odpowiedź kłamie | Plan |
| Lądowanie po logowaniu / rejestracji | obecne zachowanie jako wyrocznia (logowanie → `/`) | PRD nie nazywa miejsca; testowane tylko logowanie | Research / Plan |
| `/auth/change-password` | publiczna (część resetu) | link z maila → verify → zmiana hasła | Plan |
| Slash na końcu, wielkość liter | 302 bez pętli (dokładne dopasowanie) | kontrakt `PUBLIC_PATHS` w contract-surfaces | Research / Plan |
| E2E pokaże żywą sesję | stop i eskalacja, bez osłabiania testu | to byłby realny defekt #3 | Plan |

## Scope

**In scope:**

- szew middleware w Jest;
- ścieżka FK `source_recipe_id` (obrona tylko w kodzie);
- DELETE przepisu;
- wyspa wylogowania w RTL;
- jedno e2e martwej sesji;
- known-drift (2 wpisy);
- cookbook §6.3/§6.4/§6.6;
- liczba redirectów w contract-surfaces.

**Out of scope:**

- izolacja RLS dwoma kontami;
- testy atrapą ścieżek z podwójną obroną;
- naprawy defektów;
- 401 dla API;
- e2e rejestracji;
- link weryfikacyjny z maila;
- SQL `supabase/checks/`;
- zmiany CI.

## Architecture / Approach

Najtańsza warstwa z prawdziwym sygnałem:

- Jest dla decyzji middleware. Szew to wirtualny mock `astro:middleware` plus mock `supabase.client`,
  a `flushCookies` dopisuje znacznik `Set-Cookie`.
- Jest dla tras. Atrapa jest stanowa, ma dwóch właścicieli i honoruje filtry, więc nie jest „zawsze null”.
- RTL dla wyspy wylogowania.
- Jedno e2e tam, gdzie decyduje GoTrue.

Każdy test ma kontrolę pozytywną, a każda faza kontrolę wyroczni: zepsuć kod, zobaczyć czerwień, wycofać.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Middleware | 302/next dla ścieżek z wymagania i drzewa stron; 6 wyjść z ciasteczkami | szew ts-jest (import `.ts`, `import.meta.env`) |
| 2. Własność w kodzie | cudzy `source_recipe_id` → 404 bez zapisu; DELETE przepisu przypięty | atrapa za płytka albo „zawsze null” |
| 3. Klient wylogowania | sukces w `it`, dwa błędy w `test.failing` | śledzenie `location.replace` w jsdom |
| 4. E2E martwej sesji | 200 przed, 302 po wylogowaniu (strona + API); logowanie → `/` | runtime GoTrue może nie odrzucić access tokenu (D9) |
| 5. Cookbook | §6.3/§6.4/§6.6, contract-surfaces | §6.6 musi uczciwie mówić, że #4 jest częściowo otwarte |

**Prerequisites:** `.env.test` z obecnym kontem testowym; lokalny Playwright.
**Estimated effort:** ~3 sesje: fazy 1–3 to Jest, faza 4 to e2e, faza 5 to dokumentacja.

## Open Risks & Assumptions

- Ryzyko §2 #4 zostaje częściowo otwarte: RLS bez automatycznego dowodu (D4).
- Wynik runtime z fazy 4 nie jest znany. Jeśli sesja przeżyje, faza staje i wraca do użytkownika.
- Globalne `signOut` wylogowuje konto testowe wszędzie. Bezpieczne przy `workers: 1`.

## Success Criteria (Summary)

- Pomyłka w liście ścieżek publicznych albo wyjście bez `flushCookies` czerwieni `npm run test`.
- Wylogowanie, które nie unieważnia sesji na serwerze, czerwieni `npm run test:e2e`.
- Każdy znany defekt jest przypięty testem i opisany w known-drift.
