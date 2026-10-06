# Granice sesji i dostępu (faza 2 test-planu) — plan implementacji

## Overview

Faza 2 z `context/foundation/test-plan.md` §3 obejmuje ryzyka §2 #3 (sesja po „Wyloguj”, przekierowania,
lista ścieżek publicznych) i #4 (izolacja per-użytkownik). Plan zamienia obie tezy na testy zachowania
żądania na najtańszej warstwie, która daje prawdziwy sygnał:

- integracja middleware w Jest przez nowy szew;
- integracja tras w Jest ze stanową atrapą dwóch właścicieli dla ścieżek, których broni wyłącznie kod;
- test wyspy wylogowania w RTL;
- jedno wąskie e2e martwej sesji po wylogowaniu.

Kończy się wpisem do cookbooka §6.3/§6.4. Faza **nie zmienia zachowania produkcyjnego**. Znalezione
defekty przypina jako `test.failing` z wpisem w `docs/reference/known-drift.md` (wzorzec §6.1).

## Current State Analysis

Źródło: `context/changes/testing-session-and-access-boundaries/research.md`. Nie powtarzam tamtych ustaleń,
podaję tylko te, na których stoi plan.

- Middleware rozstrzyga sesję zawsze. Przekierowuje bez sesji, jeśli ścieżka nie jest w `PUBLIC_PATHS`
  (dokładne dopasowanie napisu, `src/middleware/index.ts:76-84`). Wszystkie sześć wyjść przechodzi
  przez `flushCookies` (`index.ts:45,51,57,66,83,86`). Middleware nie ma żadnego testu.
- Middleware importuje `astro:middleware`, a `supabase.client.ts` czyta `import.meta.env`. Żadnego z nich
  ts-jest (CommonJS) nie załaduje bez mocka. W repo nie ma mapowania ani `__mocks__` (research #3.5).
- Wylogowanie po stronie serwera jest w kodzie poprawne (`signOut()` z zakresem `global`, zapis ciasteczek
  awaitowany przed `flushCookies`). Wynika to z odczytu kodu, runtime tego nie potwierdził (research #3.1).
- Klient wylogowania (`src/components/common/LogoutButton.tsx:17-32`) przekierowuje na `/auth/login`
  także przy odpowiedzi `!ok` i przy błędzie sieci.
- Własność rekordów jest sprawdzana podwójnie: filtrem `user_id` i przez RLS. Wyjątki: ścieżka FK
  `source_recipe_id` przy tworzeniu wpisu (tylko kod, `diary.service.ts:144-162`) i `logs.update`
  (tylko RLS). `DELETE /api/recipes/:id` z obcym id odpowiada 200 (`src/pages/api/recipes/[id].ts:183-193`).
- Harness e2e ma jedno konto testowe (`tests/e2e/config/test-data.ts:7`). Każdy spec loguje się przez UI.
  Żądania inne niż GET wymagają nagłówka `Origin` (`tests/e2e/services/cleanup.service.ts`).
- Istniejące testy izolacji to testy interakcji z jednym podmiotem (asercje `eq("user_id","user-1")`)
  i mapowanie `null → 404` na zamockowanym serwisie (research #4.3).

## Desired End State

- `npm run test` zawiera testy, które:
  - sprawdzają decyzję middleware (302 → `/auth/login` albo przepuszczenie) dla każdej ścieżki ze zbioru
    wyprowadzonego z wymagania i z drzewa `src/pages/**`;
  - sprawdzają, że każde wyjście z middleware niesie ciasteczka z `flushCookies`;
  - sprawdzają, że użytkownik B nie utworzy wpisu z przepisem użytkownika A;
  - przypinają dwa znane defekty jako `test.failing`: klient wylogowania udaje sukces, DELETE cudzego
    przepisu odpowiada 200.
- `npm run test:e2e` zawiera spec, który dowodzi, że ciasteczka sprzed „Wyloguj”, odtworzone w czystym
  kontekście, dają 302 na stronie i na trasie API, a przed wylogowaniem dają 200.
- `docs/reference/known-drift.md` opisuje oba przypięte defekty.
- Test-plan §6.3, §6.4 i §6.6 opisują wzorce, które faza dowiozła, oraz to, czego nie dowiozła (RLS).

### Key Discoveries:

- Wyrocznię zbioru ścieżek daje PRD `prd.md:230` („no new sign-in paths, no unauthenticated access”):
  bez sesji dostępne są tylko logowanie, rejestracja, reset i weryfikacja. Źródłem nie jest `PUBLIC_PATHS`,
  a ta stała i tak nie jest eksportowana.
- `MainLayout.astro:14-18` przekierowuje drugi raz. Pomyłka w liście wyjdzie więc w e2e tylko na stronach
  bez tego layoutu i na trasach API. Dlatego decyzję middleware testuje Jest, nie e2e.
- `readOwnRecipeContent` (`diary.service.ts:144-162`) to jedyna obrona przed FK, który omija RLS. Ten
  przypadek ma najwyższy sygnał w #4 i da się go udowodnić bez prawdziwej bazy.
- Playwright `APIRequestContext` przyjmuje `maxRedirects: 0`, więc 302 i `Location` da się odczytać wprost.

## What We're NOT Doing

- **Izolacja na prawdziwej bazie (RLS) dwoma kontami.** Decyzja D4: brak drugiego konta e2e. Testy wpisów
  dziennika, preferencji i celu dnia z obcym podmiotem na prawdziwym Supabase nie powstają. Ryzyko §2 #4
  zostaje **częściowo otwarte**: dowiedziona jest tylko obrona w kodzie dla ścieżki FK. Zapisujemy to
  w §6.6. Wzorzec Playwright z dwoma podmiotami jest opisany w §6.3 jako „nie wdrożony”.
- Testy atrapą dla ścieżek z podwójną obroną (wpisy GET/PATCH/DELETE, preferencje, cel). Atrapa
  pokazałaby tylko filtr, a §2 #4 wymienia to jako anty-wzorzec. Istniejące testy interakcji zostają
  bez zmian.
- Naprawa klienta wylogowania i DELETE przepisu: oba defekty są tylko przypinane (D1, D5).
- Zmiana 302 na 401 dla `/api/*` (D2) oraz upublicznienie albo usunięcie `/api/health` (D3).
- E2E rejestracji: tworzy konta, a sprzątanie ich kosztuje. Lądowanie po rejestracji zapisujemy jako
  decyzję D6, bez testu.
- Link z maila na `/auth/verify` prowadzący na formularz zmiany hasła (research OQ7). Zależy od
  konfiguracji Supabase spoza repo.
- Skrypty SQL `supabase/checks/` (§7 test-planu), zmiany w `.github/workflows/ci-cd.yml` i martwy bliźniak
  `src/components/auth/LogoutButton.tsx`.

## Implementation Approach

Kolejność według koszt × sygnał i priorytetu ryzyka (#3 High/High przed #4 High/Medium):

1. szew middleware (najtańszy, pokrywa całą listę ścieżek i kontrakt `flushCookies`);
2. ścieżka FK w Jest (jedyna obrona wyłącznie w kodzie);
3. klient wylogowania w RTL;
4. jedno e2e martwej sesji, bo unieważnienie tokenu dzieje się w GoTrue i atrapa niczego tu nie dowodzi;
5. dokumentacja.

Każdy test ma wyrocznię z wymagania albo z decyzji planu (tabela niżej) i kontrolę pozytywną. Kontrola
pozytywna to przypadek, w którym ta sama technika daje odwrotny wynik. Bez niej test byłby pusty:
„zawsze 404” albo „zawsze 302”.

### Decyzje planu (wyrocznie)

| # | Decyzja | Wybór |
|---|---|---|
| D1 | Klient wylogowania przy `!ok` / błędzie sieci (research OQ1) | defekt; `test.failing` z wyrocznią „nie przekierowuje na `/auth/login`” + wpis w known-drift; bez naprawy |
| D2 | Odpowiedź trasy API bez sesji (OQ2) | **302 + `Location: /auth/login`** jest kontraktem; 401 w handlerach chronionych tras pozostaje nieosiągalne |
| D3 | `/api/health` (OQ3) | chroniony; bez sesji 302, tak jak każda inna trasa spoza auth |
| D4 | Drugie konto e2e (OQ4) | **brak**; izolacja RLS niedowiedziona, §2 #4 częściowo otwarte |
| D5 | DELETE cudzego przepisu → 200 (OQ6) | defekt; `test.failing` z wyrocznią 404 + wpis w known-drift; stan wiersza A przypięty zwykłym `it` |
| D6 | Lądowanie po logowaniu / rejestracji | PRD (FR-016 „exactly as before”) miejsca nie nazywa. Wyrocznią jest obecne zachowanie zapisane tutaj: logowanie → `/`; rejestracja bez weryfikacji → `/`; z weryfikacją → komunikat i pozostanie na `/auth/register`. Testowane jest tylko logowanie (e2e) |
| D7 | `/auth/change-password` bez sesji | publiczna jako część przepływu resetu z PRD (link z maila → verify → zmiana hasła) |
| D8 | Slash na końcu i wielkość liter (`/auth/login/`, `/Auth/Login`) | dokładne dopasowanie jest kontraktem (`contract-surfaces.md`, `PUBLIC_PATHS`); oba dają 302 na `/auth/login` bez pętli |
| D9 | Runtime: e2e pokaże, że sesja żyje po wylogowaniu (research OQ5) | nie osłabiać testu; zatrzymać fazę i zgłosić użytkownikowi jako defekt ryzyka #3 |

## Critical Implementation Details

- **Szew Jest dla middleware**:
  - `jest.mock("astro:middleware", () => ({ defineMiddleware: (fn) => fn }), { virtual: true })`;
  - `jest.mock("@/db/supabase.client", …)`. Middleware importuje `../db/supabase.client.ts` z rozszerzeniem,
    a obie ścieżki rozwiązują się do tego samego pliku. Gdyby ts-jest odrzucił import z `.ts`, sprawdź,
    czy `allowImportingTsExtensions` dziedziczy się z `astro/tsconfigs/strict` przez `tsconfig.test.json`;
  - `@jest-environment node`.

  Atrapa `flushCookies` musi być **behawioralna**: dopisuje do odpowiedzi znacznik `Set-Cookie`, a test
  czyta nagłówek z odpowiedzi zwróconej przez middleware. Asercja „`flushCookies` zostało wywołane” nie
  wystarcza.
- **Atrapa dwóch właścicieli musi honorować filtry.** Stub, który zawsze zwraca `null`, przejdzie także
  po usunięciu `.eq("user_id", …)`, więc byłby tautologią. Atrapa trzyma wiersze A i B i stosuje
  `eq(kolumna, wartość)` do zbioru. Regresja w filtrze zwraca wtedy przepis A i czerwieni test.
- **E2E i globalne wylogowanie**: `signOut` z zakresem `global` unieważnia wszystkie sesje konta
  testowego. Playwright ma `workers: 1`, a każdy spec loguje się sam, więc kolejne specy nie cierpią.
  Spec nie może jednak dzielić kontekstu z innym specem.

---

## Phase 1: Middleware — decyzja dostępu i kontrakt `flushCookies` (#3)

### Overview

Pierwszy test middleware w repo. Dowodzi decyzji „przekierowanie albo przepuszczenie” dla zbioru ścieżek
z wymagania i z drzewa stron oraz tego, że każde wyjście niesie ciasteczka. Nie dowodzi, że sesja po
wylogowaniu jest martwa. To robi faza 4.

### Changes Required:

#### 1. Test middleware

**File**: `tests/unit/middleware.test.ts` (nowy)

**Intent**: Wywołać `onRequest` z ręcznie zbudowanym kontekstem `{ locals, url, request, redirect }`
i `next`. Sprawdzić odpowiedź (status, `Location`, nagłówek `Set-Cookie` ze znacznika atrapy) oraz to,
czy `next` został wywołany.

**Contract**: Szew z „Critical Implementation Details”. `redirect(path)` w kontekście buduje `Response`
302 z `Location`. Atrapa klienta wystawia `auth.getUser`, `auth.signOut` i `auth.exchangeCodeForSession`.
Brak importu i odtwarzania `PUBLIC_PATHS`.

Przypadki:

- **A. Bez sesji, ścieżki chronione z wymagania → 302 `Location: /auth/login`, `next` niewywołany**:
  `/`, `/diary`, `/profile`, `/recipes/new`, `/recipes/1`, `/recipes/edit/1`, `/dev/diary-states`,
  nieznany `/nie-ma-takiej-strony`, `/api/diary-entries`, `/api/diary-entries/1/estimate`,
  `/api/user-settings`, `/api/preferences`, `/api/recipes/1`, `/api/ai/generate-recipe`,
  `/api/users/stats`, `/api/health` (D2, D3).
  - Zachowanie: każda ścieżka spoza logowania, rejestracji, resetu i weryfikacji wymaga sesji.
  - Regresja: chroniona trasa dopisana do listy publicznej albo zmiana dopasowania na prefiksowe
    (np. `/api` albo `/auth`).
  - Źródło: research #3.3; PRD `:230`.
  - Granica: `/api/health` i nieznany URL (404) — strony bez `MainLayout`, czyli bez drugiej linii obrony.
  - Anty-wzorzec: asercja na zawartości listy. Tu zbiór pochodzi z wymagania, a sprawdzane jest żądanie.
- **B. Bez sesji, ścieżki publiczne z wymagania → `next` wywołany, brak 302**:
  `/auth/login`, `/auth/register`, `/auth/reset-password`, `/auth/verify` (bez `code`/`error`),
  `/auth/change-password` (D7), `/api/auth/login`, `/api/auth/register`, `/api/auth/reset-password`,
  `/api/auth/logout`, `/api/auth/update-password`, `/api/auth/me`.
  - Zachowanie: przepływy logowania, rejestracji i resetu działają bez sesji.
  - Regresja: publiczna strona albo endpoint usunięte z listy, czyli zablokowane logowanie lub reset.
  - Źródło: research #3.3. Granica: `/api/auth/logout` bez sesji też przechodzi
    (wylogowanie z wygasłym tokenem, research #3.1).
- **C. Zbiór z drzewa stron (odporność na nowe strony)**: test listuje pliki `src/pages/**`
  (`.astro`, `.ts`) przez `fs` i zamienia je na URL-e (`index` → `/`, `[id]`/`[...x]` → `1`).
  Dla każdej ścieżki spoza `src/pages/auth/` i `src/pages/api/auth/` oczekuje 302, a dla każdej
  z tych dwóch katalogów oczekuje `next`.
  - Regresja: nowa strona lub trasa dopisana do `PUBLIC_PATHS` bez decyzji o publiczności, a także nowa
    strona auth, której nikt nie dopisał (zablokowana).
  - Granica: test musi znaleźć co najmniej tyle ścieżek, ile jest w przypadkach A i B. Pusta lista
    oznacza błąd mapowania, nie sukces.
  - Anty-wzorzec: lista ścieżek przepisana ręcznie z kodu.
- **D. Dokładne dopasowanie (D8)**: `/auth/login/` i `/Auth/Login` bez sesji → 302 z `Location`
  dokładnie `/auth/login`, więc bez pętli.
  - Regresja: normalizacja albo prefiks, które przypadkiem otworzą `/auth/login-cokolwiek` lub
    `/api/auth/../diary-entries`.
  - Granica: dopisz `/auth/loginx` → 302.
- **E. Z sesją**: `getUser` zwraca użytkownika z e-mailem; chroniona `/diary` → `next`, a `locals.user`
  równa się `{ id, email }`. Użytkownik **bez e-maila** na chronionej ścieżce → 302 (gałąź `user && user.email`).
  - Regresja: przepuszczenie po samym `user`.
  - Kontrola pozytywna dla A: ta sama ścieżka, która bez sesji dała 302.
- **F. Każde wyjście niesie ciasteczka**: dla sześciu wyjść odpowiedź zwrócona przez middleware ma
  znacznik `Set-Cookie` atrapy:
  - `/auth/verify?code=` z sukcesem → 302 `/auth/change-password?verified=true`;
  - `code` z błędem → `signOut` + 302 `/auth/verify?error=…`;
  - `code` z wyjątkiem → 302 `/auth/verify?error=…`;
  - `?error=` → `signOut` + 302;
  - brak sesji → 302;
  - `next()`.
  - Zachowanie: rotowany lub kasowany token dociera do przeglądarki (`lessons.md`).
  - Regresja: nowy `return redirect(...)` bez `flushCookies`.
  - Źródło: `lessons.md`, research „Historical Context”.
  - Anty-wzorzec: asercja „funkcja wywołana” zamiast „nagłówek w odpowiedzi”.

### Success Criteria:

#### Automated Verification:

- `npx jest tests/unit/middleware.test.ts` przechodzi
- Kontrola wyroczni: tymczasowe dopisanie `"/diary"` do `PUBLIC_PATHS` czerwieni przypadki A i C, usunięcie `flushCookies` z jednego `redirect` czerwieni F; obie zmiany wycofane
- `npm run test`, `npm run lint` i `npm run typecheck` przechodzą (typecheck: 0 błędów)

#### Manual Verification:

- Lista przypadków A/B odpowiada PRD (`prd.md:230`) i decyzjom D2, D3, D7, a nie `PUBLIC_PATHS`

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie.

---

## Phase 2: Własność broniona wyłącznie kodem (#4)

### Overview

Dwa przypadki z §2 #4, które da się udowodnić bez drugiego konta. Pierwszy to POST wpisu z cudzym
`source_recipe_id`, gdzie broni tylko kod, bo FK omija RLS. Drugi to DELETE cudzego przepisu, który
zgłasza sukces. Obie trasy dostają stanową atrapę z dwoma właścicielami, która honoruje filtry.

### Changes Required:

#### 1. Trasa tworzenia wpisu — cudzy przepis

**File**: `tests/unit/diary-entries-route.test.ts` (nowy; obok `diary-entry-route.test.ts` dla `[id]`)

**Intent**: Wywołać `POST` z `src/pages/api/diary-entries/index.ts` jako użytkownik B. Przez trasę
przechodzi **prawdziwy** `DiaryService` z `readOwnRecipeContent`, a podmieniony jest wyłącznie klient
Supabase: atrapa z tabelą `recipes` (przepis 10 należy do A, przepis 20 do B) i rejestrem insertów do
`diary_entries`.

**Contract**: Wzorzec §6.2: `@jest-environment node`, kontekst `{ request, locals: { supabase } }` rzutowany
na `Parameters<typeof POST>[0]`. Atrapa obsługuje łańcuchy, których trasa i serwis faktycznie używają
(`from().select().eq().eq().maybeSingle()`, `insert().select().single()`), i filtruje wiersze po każdym `eq`.

- **Przypadek: B + `source_recipe_id: 10` (przepis A) + `portions: 1` → 404 „Przepis nie został znaleziony”,
  zero insertów do `diary_entries`.**
  - Zachowanie: B nie utworzy wpisu z przepisem A i nie pozna jego treści.
  - Regresja: usunięcie `.eq("user_id", …)` z `readOwnRecipeContent` albo pominięcie odczytu przed
    insertem. Baza tego nie złapie, bo FK omija RLS.
  - Źródło: research #4.1 (wiersz „POST z obcym `source_recipe_id`”), archive
    `2026-09-22-diary-entry-store/plan.md:124-133`.
  - Granica: nieistniejący przepis `999` → ten sam 404 (cudzy i nieistniejący są nieodróżnialne, więc nic
    nie wycieka). `source_recipe_id` A podany razem z `user_id: <A>` w ciele → `user_id` wycięty albo 400
    (`diary-validations.test.ts:363`), a wpis i tak nie powstaje.
  - Anty-wzorzec: stub zawsze zwracający `null` i asercja `eq` wywołane.
- **Kontrola pozytywna: B + `source_recipe_id: 20` (własny) → 201, insert z `user_id` B.** Dowodzi, że
  atrapa nie odpowiada „nie ma” na wszystko.

#### 2. DELETE cudzego przepisu

**File**: `tests/unit/recipes-route.test.ts` (rozszerzenie; nowy `describe("DELETE /api/recipes/:id")`)

**Intent**: Wywołać `DELETE` z `src/pages/api/recipes/[id].ts` jako B dla przepisu A, na atrapie
z wierszami obu właścicieli, której `delete()` usuwa tylko wiersze spełniające filtry.

**Contract**: Istniejący budowniczy w pliku zapisuje tylko wywołania. Dla DELETE potrzebna jest atrapa
stanowa, osobna w tym `describe`.

- **`it`: po DELETE B na przepisie A wiersz A nadal istnieje w atrapie.**
  - Zachowanie: izolacja danych przy usuwaniu.
  - Regresja: usunięcie filtra `user_id` z delete.
  - Źródło: research #4.1, #4.2.2.
- **`test.failing`: ta sama operacja → 404** (wyrocznia §2 #4 „usunięcie cudzego przepisu nie może
  zgłaszać sukcesu”; D5). Komentarz nad testem odsyła do known-drift.
  - Granica: nieistniejące id → też oczekiwane 404 (osobny `test.failing`).
- **Kontrola pozytywna `it`: A usuwa własny przepis → 200, wiersz znika.** Pilnuje też kontraktu, na którym
  stoi `CleanupService.deleteAllTestUserRecipes`.
- Anty-wzorzec: asercja wyłącznie na statusie. Tu stan atrapy po operacji jest sprawdzany osobno.

#### 3. Wpis w known-drift

**File**: `docs/reference/known-drift.md`

**Intent**: Nowy wpis w sekcji o przepisach albo w nowej sekcji „Własność rekordów”. Opisuje:

- objaw: DELETE cudzego lub nieistniejącego przepisu daje 200 `{success:true}`, a dane zostają;
- kierunek naprawy: `.select("id")` i 404 przy zero wierszy, po sprawdzeniu, czy UI i `CleanupService`
  nie liczą na 200;
- test, który przypina zachowanie, i to, co zrobić po naprawie (`test.failing` → `it`).

**Contract**: Styl istniejących wpisów: polski, „Przyjęte świadomie (plan `testing-session-and-access-boundaries`, D5)”.

### Success Criteria:

#### Automated Verification:

- `npx jest tests/unit/diary-entries-route.test.ts tests/unit/recipes-route.test.ts` przechodzi (`test.failing` liczone jako passed)
- Kontrola wyroczni: tymczasowe usunięcie `.eq("user_id", userId)` z `readOwnRecipeContent` czerwieni przypadek 404; wycofane
- `npm run test`, `npm run lint` i `npm run typecheck` przechodzą

#### Manual Verification:

- Wpis w `known-drift.md` jest zrozumiały bez czytania planu i wskazuje test, który przypina zachowanie

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie.

---

## Phase 3: Klient wylogowania nie udaje sukcesu (#3)

### Overview

Test wyspy `LogoutButton` w RTL z `fetch` zamockowanym na krawędzi (wzorzec `use-ai.test.tsx`). Sukces
jest przypięty zwykłym testem, a dwa przypadki błędu jako `test.failing` (D1).

### Changes Required:

#### 1. Test wyspy

**File**: `tests/unit/LogoutButton.test.tsx` (nowy)

**Intent**: Wyrenderować `src/components/common/LogoutButton.tsx` obok `<button id="logout-button">`,
kliknąć przycisk, sprawdzić wywołanie `window.location.replace` i żądanie `POST /api/auth/logout`.

**Contract**: `fetch` to atrapa zwracająca zwykły obiekt `{ ok, status }`, bo jsdom nie ma `Response`.
`window.location.replace` podmieniony tak, żeby jsdom pozwolił go śledzić (właściwość `location`
nadpisana na czas testu i przywrócona w `afterEach`).

- **`it`: `ok: true` → `POST /api/auth/logout`, potem `replace("/auth/login")`.** Kontrola pozytywna
  dla przypadków błędu.
- **`test.failing`: `ok: false` (400 z trasy przy błędzie GoTrue) → `replace` niewywołane.**
  - Zachowanie (D1): ekran logowania pojawia się tylko po potwierdzonym wylogowaniu.
  - Regresja: dziś kod przekierowuje mimo porażki, więc test przypina defekt.
  - Źródło: research #3.2, §2 #3 „Must challenge”.
- **`test.failing`: `fetch` rzuca (błąd sieci) → `replace` niewywołane.**
  - Granica: ciasteczko sesji zostaje nietknięte, więc to najostrzejszy przypadek „sesja trwa za ekranem
    logowania”.
- Anty-wzorzec: test przekierowania tylko na happy path, czyli dokładnie ten, który potwierdza tezę
  „ekran logowania = koniec sesji”.

#### 2. Wpis w known-drift

**File**: `docs/reference/known-drift.md`

**Intent**: Wpis o kliencie wylogowania. Opisuje:

- objaw: przekierowanie na `/auth/login` mimo `!ok` lub błędu sieci;
- skutek: użytkownik widzi ekran logowania przy żywej sesji;
- kierunek naprawy: zostać na stronie i pokazać toast z `useToast`, bo wyspa musi wtedy renderować
  `<ToastContainer />`;
- test, który przypina zachowanie, i to, że `src/components/auth/LogoutButton.tsx` to martwy bliźniak.

**Contract**: Ten sam styl co wpis z fazy 2 (D1).

### Success Criteria:

#### Automated Verification:

- `npx jest tests/unit/LogoutButton.test.tsx` przechodzi
- Kontrola wyroczni: tymczasowe usunięcie `window.location.replace` z gałęzi sukcesu czerwieni test `it`; wycofane
- `npm run test`, `npm run lint` i `npm run typecheck` przechodzą

#### Manual Verification:

- Wpis w `known-drift.md` opisuje skutek dla użytkownika, nie tylko linię kodu

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie.

---

## Phase 4: E2E — sesja po „Wyloguj” jest martwa na serwerze (#3)

### Overview

Jedyny dowód, którego nie da tańsza warstwa: GoTrue unieważnia sesję, a odtworzone ciasteczka sprzed
wylogowania nie otwierają ani strony, ani trasy API. Ten sam spec przypina lądowanie po logowaniu (D6).

### Changes Required:

#### 1. Spec granic sesji

**File**: `tests/e2e/session-boundaries.spec.ts` (nowy)

**Intent**: Jeden scenariusz na jednym koncie testowym:

1. Zaloguj się przez `LoginPage`.
2. Sprawdź `URL === "/"` (D6).
3. Zapisz `context.cookies()`.
4. **Kontrola pozytywna**: nowy kontekst (`browser.newContext()`) z tymi ciasteczkami →
   `request.get("/diary", { maxRedirects: 0 })` daje 200.
5. Kliknij „Wyloguj”. Poczekaj na odpowiedź `POST /api/auth/logout` 200 i na `/auth/login`.
6. Kolejny świeży kontekst z ciasteczkami **sprzed** wylogowania:
   - `GET /diary` → 302 z `Location` kończącym się na `/auth/login`;
   - `GET /api/user-settings` → 302 tak samo (D2);
   - `page.goto("/")` → ląduje na `/auth/login`.

**Contract**:

- Ciasteczka odtwarzane w kontekście, który nie dzielił stanu z przeglądarką.
- Żądania tylko GET, więc bez nagłówka `Origin`.
- Brak sprzątania: scenariusz niczego nie zapisuje.
- Opis i komentarze po polsku. Komentarz nad specem opisuje globalne wylogowanie konta testowego
  („Critical Implementation Details”).

- Zachowanie: wylogowanie kończy sesję na serwerze, nie tylko w przeglądarce.
- Regresja: `signOut({ scope: "local" })`, zapis ciasteczek kasujących po wysłaniu odpowiedzi (`lessons.md`),
  middleware przepuszczający po samym podpisie JWT.
- Źródło: research #3.1 (niezweryfikowane runtime), §2 #3 „Must challenge”.
- Granica: trasa API, nie tylko strona. Strona ma drugą linię obrony w `MainLayout`, a API jej nie ma.
- Anty-wzorzec: asercja, że ciasteczko zniknęło z przeglądarki. Tu dowodem jest odpowiedź serwera na
  odtworzone ciasteczka. Kontrola pozytywna z kroku 4 wyklucza wynik pusty, w którym odtworzenie nigdy
  nie działało.
- **Jeśli krok 6 da 200 (D9):** nie osłabiać testu i nie oznaczać go `test.failing` samodzielnie.
  Zatrzymać fazę i zgłosić użytkownikowi: to realny defekt ryzyka #3 (np. GoTrue nie odrzuca
  wciąż ważnego access tokenu).

### Success Criteria:

#### Automated Verification:

- `npx playwright test tests/e2e/session-boundaries.spec.ts` z `TEST_MODE=true` przechodzi lokalnie
- `npm run test:e2e` przechodzi w całości (pozostałe specy nie cierpią z powodu globalnego wylogowania)
- `npm run lint` i `npm run typecheck` przechodzą

#### Manual Verification:

- Raport Playwrighta pokazuje 200 w kontroli pozytywnej i 302 po wylogowaniu dla obu adresów
- Job `e2e-tests` w CI przechodzi z nowym specem (po pushu użytkownika)

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie.

---

## Phase 5: Cookbook §6.3/§6.4, notatki fazy i dryf dokumentacji

### Overview

Zapisać wzorce, które faza dowiozła, tak żeby `/10x-tdd` mógł je przeczytać, oraz uczciwie opisać to,
czego nie dowiozła.

### Changes Required:

#### 1. Cookbook

**File**: `context/foundation/test-plan.md`

**Intent**: Wypełnić §6.3 i §6.4 i dopisać notatkę fazy 2 w §6.6. Nie ruszać §1–§5 (strategia zamrożona).

**Contract**:

- **§6.4 „Adding a middleware / session test”** opisuje:
  - lokalizację `tests/unit/middleware.test.ts`;
  - szew (`astro:middleware` wirtualny, mock `@/db/supabase.client`, `@jest-environment node`, `redirect`
    budujący 302);
  - atrapę `flushCookies` ze znacznikiem `Set-Cookie`;
  - wyrocznię zbioru ścieżek z PRD i z drzewa `src/pages/**`, nigdy z `PUBLIC_PATHS`;
  - kontrakt 302 dla API (D2);
  - wzorzec e2e martwej sesji: ciasteczka sprzed wylogowania w świeżym kontekście, `maxRedirects: 0`,
    kontrola pozytywna;
  - testy referencyjne i polecenia uruchomienia.
- **§6.3 „Adding an ownership / access test”** opisuje:
  - stanową atrapę dwóch właścicieli, która honoruje filtry, i jej zakres: tylko obrona w kodzie
    (ścieżka FK);
  - kontrolę pozytywną;
  - sprawdzenie stanu po operacji, nie tylko statusu;
  - testy referencyjne;
  - akapit „Nie wdrożone”: dowód RLS wymaga dwóch kont i Playwright `request` z dwoma zalogowanymi
    kontekstami (logowanie przez `POST /api/auth/login` z `Origin`). Drugiego konta nie ma (D4), więc
    tego wzorca jeszcze nie ma w repo.
- **§6.6**: 2–3 linie o fazie 2:
  - §2 #4 częściowo otwarte (RLS bez automatycznego dowodu);
  - dwa defekty przypięte `test.failing`;
  - wynik runtime e2e (czy access token po `signOut` jest odrzucany).

#### 2. Dryf w contract-surfaces

**File**: `docs/reference/contract-surfaces.md`

**Intent**: W wpisie `flushCookies` poprawić „six `redirect()` calls” na pięć `redirect()` plus `next()`
(research „Historical Context”).

**Contract**: Wpis `### flushCookies`, linia „Used by”.

### Success Criteria:

#### Automated Verification:

- `npm run test`, `npm run lint`, `npm run format:check` i `npm run typecheck` przechodzą
- `grep -c "TBD — see §3 Phase 2" context/foundation/test-plan.md` zwraca 0

#### Manual Verification:

- §6.3 i §6.4 pozwalają dodać nowy test middleware albo własności bez czytania tego planu
- §6.6 nie przedstawia ryzyka #4 jako zamkniętego

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie.

---

## Testing Strategy

### Unit / integration (Jest):

- Middleware: zbiór ścieżek z wymagania i z drzewa stron, dokładne dopasowanie, sesja bez e-maila,
  sześć wyjść z ciasteczkami.
- Trasy: cudzy `source_recipe_id` → 404 bez zapisu; DELETE cudzego przepisu (stan w `it`, status
  w `test.failing`).
- Wyspa wylogowania: sukces w `it`, dwa błędy w `test.failing`.

### E2E (Playwright):

- Martwa sesja po wylogowaniu, strona i API, z kontrolą pozytywną; lądowanie po logowaniu.

### Manual Testing Steps:

1. Kontrole wyroczni z każdej fazy: zepsuć linię produkcyjną, zobaczyć czerwony test, wycofać.
2. Przejrzeć raport Playwrighta fazy 4 (200 przed, 302 po).
3. Przeczytać §6.3/§6.4 jako ktoś, kto nie zna tej zmiany.

## Performance Considerations

Spec e2e dodaje jedno logowanie przez UI, ok. 10–15 s. Testy Jest nie dotykają sieci.

## Migration Notes

Nie dotyczy: brak zmian schematu, zachowania i konfiguracji CI.

## References

- Research: `context/changes/testing-session-and-access-boundaries/research.md`
- Test-plan: `context/foundation/test-plan.md` §2 #3, #4, §6.1, §6.2
- Lekcja: `context/foundation/lessons.md` („Every exit from middleware must pass through flushCookies”)
- Wzorzec trasy: `tests/unit/diary-estimate-route.test.ts`, `tests/unit/ai-generate-recipe-route.test.ts`
- Wzorzec `test.failing`: `tests/unit/recipe-nutrition.test.ts` (blok F2)
- Wzorzec RTL z `fetch` na krawędzi: `tests/unit/use-ai.test.tsx`
- Middleware: `src/middleware/index.ts:5-19,36-86`; klient: `src/components/common/LogoutButton.tsx:17-32`
- Obrona FK: `src/lib/services/diary.service.ts:144-162`; DELETE przepisu: `src/pages/api/recipes/[id].ts:183-193`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Middleware — decyzja dostępu i kontrakt flushCookies (#3)

#### Automated

- [x] 1.1 `npx jest tests/unit/middleware.test.ts` przechodzi — d0062c8
- [x] 1.2 Kontrola wyroczni: tymczasowe dopisanie `"/diary"` do `PUBLIC_PATHS` czerwieni przypadki A i C, usunięcie `flushCookies` z jednego `redirect` czerwieni F; obie zmiany wycofane — d0062c8
- [x] 1.3 `npm run test`, `npm run lint` i `npm run typecheck` przechodzą (typecheck: 0 błędów) — d0062c8

#### Manual

- [x] 1.4 Lista przypadków A/B odpowiada PRD (`prd.md:230`) i decyzjom D2, D3, D7, a nie `PUBLIC_PATHS` — d0062c8

### Phase 2: Własność broniona wyłącznie kodem (#4)

#### Automated

- [x] 2.1 `npx jest tests/unit/diary-entries-route.test.ts tests/unit/recipes-route.test.ts` przechodzi (`test.failing` liczone jako passed)
- [x] 2.2 Kontrola wyroczni: tymczasowe usunięcie `.eq("user_id", userId)` z `readOwnRecipeContent` czerwieni przypadek 404; wycofane
- [x] 2.3 `npm run test`, `npm run lint` i `npm run typecheck` przechodzą

#### Manual

- [x] 2.4 Wpis w `known-drift.md` jest zrozumiały bez czytania planu i wskazuje test, który przypina zachowanie

### Phase 3: Klient wylogowania nie udaje sukcesu (#3)

#### Automated

- [ ] 3.1 `npx jest tests/unit/LogoutButton.test.tsx` przechodzi
- [ ] 3.2 Kontrola wyroczni: tymczasowe usunięcie `window.location.replace` z gałęzi sukcesu czerwieni test `it`; wycofane
- [ ] 3.3 `npm run test`, `npm run lint` i `npm run typecheck` przechodzą

#### Manual

- [ ] 3.4 Wpis w `known-drift.md` opisuje skutek dla użytkownika, nie tylko linię kodu

### Phase 4: E2E — sesja po „Wyloguj” jest martwa na serwerze (#3)

#### Automated

- [ ] 4.1 `npx playwright test tests/e2e/session-boundaries.spec.ts` z `TEST_MODE=true` przechodzi lokalnie
- [ ] 4.2 `npm run test:e2e` przechodzi w całości (pozostałe specy nie cierpią z powodu globalnego wylogowania)
- [ ] 4.3 `npm run lint` i `npm run typecheck` przechodzą

#### Manual

- [ ] 4.4 Raport Playwrighta pokazuje 200 w kontroli pozytywnej i 302 po wylogowaniu dla obu adresów
- [ ] 4.5 Job `e2e-tests` w CI przechodzi z nowym specem (po pushu użytkownika)

### Phase 5: Cookbook §6.3/§6.4, notatki fazy i dryf dokumentacji

#### Automated

- [ ] 5.1 `npm run test`, `npm run lint`, `npm run format:check` i `npm run typecheck` przechodzą
- [ ] 5.2 `grep -c "TBD — see §3 Phase 2" context/foundation/test-plan.md` zwraca 0

#### Manual

- [ ] 5.3 §6.3 i §6.4 pozwalają dodać nowy test middleware albo własności bez czytania tego planu
- [ ] 5.4 §6.6 nie przedstawia ryzyka #4 jako zamkniętego
