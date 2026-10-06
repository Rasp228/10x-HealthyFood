---
date: 2026-10-05T16:35:46+02:00
researcher: Rasp228 (z Claude Code)
git_commit: 466bca167e72a2ee6ed458e89466276538a25112
branch: master
repository: 10x-HealthyFood
topic: "Ugruntowanie fazy 2 test-planu: ryzyka #3 (granice sesji) i #4 (izolacja per-użytkownik)"
tags: [research, test-plan, middleware, auth, session, logout, rls, idor, playwright]
status: complete
last_updated: 2026-10-05
last_updated_by: Rasp228 (z Claude Code)
---

# Research: granice sesji i dostępu (ryzyka #3 i #4)

**Date**: 2026-10-05T16:35:46+02:00
**Researcher**: Rasp228 (z Claude Code)
**Git Commit**: 466bca1 (drzewo robocze: zmodyfikowany `context/foundation/test-plan.md`, nowy folder tej zmiany; kod `src/` bez zmian względem commita)
**Branch**: master
**Repository**: 10x-HealthyFood

## Research Question

Ugruntować w kodzie fazę 2 z `context/foundation/test-plan.md` §3 (zmiana
`testing-session-and-access-boundaries`): ryzyka #3 i #4 z §2. Dla każdego ryzyka: realna ścieżka
awarii z cytatami, weryfikacja albo korekta „Risk Response Guidance”, istniejące testy, najtańsza
użyteczna warstwa, ocena dowodów z hot-spotów.

## Summary

**#3 — sesja.** Serwerowa ścieżka wylogowania jest w kodzie poprawna. `signOut()` domyślnie ma zakres
`global`. Ciasteczka kasujące powstają w tym samym żądaniu, w łańcuchu, który jest awaitowany, i wychodzą
przez `flushCookies(await next())`. Klasa błędu z `lessons.md` (zapis po wysłaniu odpowiedzi) na
tej ścieżce nie występuje — to wynika z odczytu kodu, runtime tego nie potwierdził. Realne luki leżą gdzie indziej:

1. Klient wylogowania ignoruje porażkę serwera i błąd sieci. W obu przypadkach przekierowuje na
   `/auth/login` (`src/components/common/LogoutButton.tsx:17-19,27,32`), więc użytkownik może
   *zobaczyć* ekran logowania, mając żywą sesję. To odwrotność tezy, którą test-plan każe
   zakwestionować.
2. Middleware odpowiada na trasę API bez sesji **302 na `/auth/login`**, nie 401
   (`src/middleware/index.ts:81-83`). 401 zapisane w handlerach chronionych tras są przez
   middleware nieosiągalne.
3. `PUBLIC_PATHS` to dokładne dopasowanie (`index.ts:81`). Chronione są więc także `/api/health`,
   strona 404 i warianty ze slashem na końcu (`/auth/login/`).
4. PRD nie definiuje, gdzie lądują logowanie i rejestracja (FR-016 „exactly as before”,
   `context/foundation/prd.md:177`). Wyrocznią jest obecne zachowanie: `/` po logowaniu i po
   rejestracji bez weryfikacji, komunikat bez przekierowania po rejestracji z weryfikacją.

Odpowiedź na tezę „ciasteczko zniknęło, więc sesja się skończyła” musi być serwerowa: odtworzyć
ciasteczka sprzed wylogowania w czystym kontekście i sprawdzić przekierowanie. To wymaga
prawdziwego Supabase, więc należy do e2e.

**#4 — izolacja.** Dla wpisów dziennika i celu dnia teza „B dostaje 404 albo pustą listę” jest
spełniona w kodzie podwójnie: filtr `user_id` w serwisie oraz RLS w bazie. Dla POST z obcym
`source_recipe_id` route daje 404, zanim zajdzie insert. Korekty do guidance:

- Cel dnia nie ma identyfikatora w żądaniu, więc „obcy id” nie istnieje. Izolację da się tam
  udowodnić tylko dwoma podmiotami na prawdziwej bazie.
- `DELETE /api/recipes/:id` z obcym id zwraca **200** `{success:true}`, nie 404
  (`src/pages/api/recipes/[id].ts:183-193`). Danych nie usuwa, ale odpowiedź kłamie.
- `logs.update` w `AIService.updateAIActionLog` filtruje tylko po `id`. Własność pilnuje tam
  wyłącznie RLS (`src/lib/services/ai.service.ts:686`).
- Istniejące testy dowodzą jedynie, że filtr jest *wołany* (atrapa klienta). To dalej „test
  z jednym użytkownikiem”. Prawdziwa izolacja wymaga dwóch kont, a harness e2e ma dziś jedno
  (`tests/e2e/config/test-data.ts:7`).

**Dowody z hot-spotów.** „`src/pages/api/auth` — 10 zmian/30d” to 10 dotknięć plików w **2**
commitach. Jeden to `bc9c1f6 fix(auth): write supabase session cookies onto the response`, drugi
to podbicie zależności `0a1fb4c`. Churn jest zawyżony. Rzeczywistym sygnałem jest jedna poprawka,
ta sama, którą opisuje `lessons.md`. Dowód z archiwum („RLS ręcznie, poza CI”) jest prawdziwy
i aktualny (szczegóły w Historical Context).

## Detailed Findings

### #3.1 Wylogowanie po stronie serwera

- `src/pages/api/auth/logout.ts:8` wywołuje `await locals.supabase.auth.signOut();` bez argumentu.
  W zainstalowanym `@supabase/auth-js` 2.116.0 domyślny zakres to
  `signOut(options = { scope: 'global' })`
  (`node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:3412`). Wszystkie refresh tokeny
  użytkownika są więc unieważniane na serwerze GoTrue, nie tylko bieżąca sesja.
- Gdy `admin.signOut` zwróci błąd inny niż 401/403/404, `_signOut` i tak usuwa sesję lokalną
  (`removeCurrentSession()`) i dopiero wtedy zwraca błąd (`GoTrueClient.js:3422-3452`). Route
  odpowiada wtedy 400 (`logout.ts:10-13`), ale ciasteczka kasujące i tak powstają.
- Łańcuch zapisu ciasteczek jest awaitowany do końca w obrębie `signOut()`:
  - `_removeSession` → `await this._notifyAllSubscribers('SIGNED_OUT', null)`;
  - `_notifyAllSubscribers` → `await Promise.all(promises)` (`GoTrueClient.js:4364`);
  - listener `@supabase/ssr` 0.12.7 → `await applyServerStorage(...)` dla `SIGNED_OUT`
    (`node_modules/@supabase/ssr/dist/main/createServerClient.js:52-69`), z `maxAge: 0` dla
    usuwanych kluczy (`node_modules/@supabase/ssr/dist/main/cookies.js:444-465`);
  - `setAll` buforuje wpisy (`src/db/supabase.client.ts:42-54`);
  - middleware dopisuje je do odpowiedzi trasy przez `return flushCookies(await next());`
    (`src/middleware/index.ts:86`).

  Na tej ścieżce zapis kończy się przed `flushed = true`. Problem z `lessons.md` (zapis po
  wysłaniu) dotyczy listenera, który rozwiązuje się *później* — tutaj go nie widać. Wniosek
  pochodzi z odczytu kodu biblioteki, nie z runtime.
- `/api/auth/logout` jest w `PUBLIC_PATHS` (`index.ts:16`), więc wylogowanie z wygasłym access
  tokenem dociera do handlera i nie kończy się 302.
- **Niezweryfikowane (runtime):** czy GoTrue po globalnym `signOut` odrzuca wciąż ważny
  kryptograficznie access token JWT. Middleware woła `supabase.auth.getUser()` (`index.ts:72-74`),
  które pyta serwer Auth, a nie tylko weryfikuje podpis. Czy serwer sprawdza istnienie sesji,
  zależy od wersji GoTrue w projekcie Supabase. Rozstrzyga to dopiero test e2e z odtworzonymi
  ciasteczkami.

### #3.2 Wylogowanie po stronie klienta

- Przycisk „Wyloguj” to `<button id="logout-button">` w `src/components/layout/TopNav.astro`.
  Obsługę podpina niewidoczna wyspa `<LogoutButton client:load />` z `src/components/common/`.
  `src/components/auth/LogoutButton.tsx` to bliźniak, którego nic nie importuje — martwy kod.
- `src/components/common/LogoutButton.tsx`:

  ```ts
  if (!response.ok) {
    console.error("Błąd podczas wylogowania");
  }
  ...
  window.location.replace("/auth/login");          // :27
  } catch (error) { ... window.location.replace("/auth/login"); }   // :32
  ```

  Przy błędzie sieci (catch, `:28-32`) ciasteczko sesji zostaje nietknięte, a użytkownik i tak
  ląduje na ekranie logowania. Wejście na `/` pokaże go zalogowanego. Przy odpowiedzi 400
  z serwera (#3.1) ciasteczka zwykle są już skasowane, ale refresh token mógł nie zostać
  unieważniony globalnie. To jest konkretny przypadek „po Wyloguj sesja trwa dalej”, który
  test-plan opisuje ogólnie. Czy to błąd do naprawy, czy przyjęte zachowanie, nie wynika ani
  z PRD, ani z kodu (Open Questions).
- `initLogoutButton` podpina listener przy każdym `astro:page-load` (`:43-45`). Jeśli `TopNav`
  przetrwa nawigację `<ClientRouter />`, ten sam przycisk może dostać kilka listenerów i kilka
  POST-ów. Wynika to z odczytu kodu, runtime tego nie sprawdzono. Dla ryzyka #3 jest to
  nieszkodliwe, bo kolejne `signOut` bez sesji kończą się sukcesem.

### #3.3 Middleware: chronione vs publiczne, kształt odpowiedzi

- Reguła ma postać: `if (user && user.email) { locals.user = ... } else if (!PUBLIC_PATHS.includes(url.pathname)) { return flushCookies(redirect("/auth/login")); }`
  (`src/middleware/index.ts:76-84`). Jest to dokładne dopasowanie napisu.
- **Trasy API bez sesji dostają 302**, nie 401. `fetch` w przeglądarce idzie za
  przekierowaniem, dostaje HTML strony logowania z 200, a `response.json()` rzuca wyjątek.
  Handlery chronionych tras zawierają 401 dla `!user` (np. `tests/unit/user-settings-route.test.ts`
  „401 bez sesji”), ale przez middleware ta gałąź jest nieosiągalna. Osiągalna jest wyłącznie
  w handlerach na ścieżkach publicznych: `src/pages/api/auth/me.ts` i `update-password.ts`.
  Guidance („trasa API przekierowuje na login”) zgadza się więc z obecnym zachowaniem. Test
  powinien wołać z `redirect: "manual"` i sprawdzać `status === 302` oraz
  `Location: /auth/login`.
- Zbiór stron (`src/pages/**`):
  - publiczne (w `PUBLIC_PATHS`, `index.ts:5-19`): `/auth/login`, `/auth/register`,
    `/auth/reset-password`, `/auth/change-password`, `/auth/verify` oraz sześć tras
    `/api/auth/*`;
  - chronione: `/`, `/diary`, `/profile`, `/recipes/new`, `/recipes/[id]`,
    `/recipes/edit/[id]`, `/dev/*`, strona 404 dla nieznanego URL-a oraz wszystkie pozostałe
    `/api/*`, **w tym `/api/health`** (`src/pages/api/health.ts`, endpoint opisany jako „dla
    testów smoke i monitoringu”). W repo nie znalazłem żadnego konsumenta `/api/health`
    (przeszukane `.github/`, `tests/`, `playwright.config.ts`, `lighthouserc.js`, `README.md`).
- Slash na końcu: `astro.config.mjs` nie ustawia `trailingSlash`, więc obowiązuje domyślne
  `"ignore"`. `/auth/login/` nie pasuje do `PUBLIC_PATHS`, więc dostaje 302 na `/auth/login`
  (bez pętli). `POST /api/auth/login/` też dostaje 302. Nie sprawdzono, czy Astro 7 normalizuje
  `url.pathname` przed middleware.
- Drugą linię obrony stanowi `MainLayout.astro:14-18` (`if (!user) return Astro.redirect("/auth/login")`).
  Jest bez znaczenia dla testu middleware, ale oznacza, że strona na `MainLayout` przypadkowo
  dopisana do `PUBLIC_PATHS` dalej przekierowuje. Pomyłka w liście wyjdzie więc tylko na
  stronach bez tego layoutu i na trasach API.
- Zalogowany użytkownik wchodzący na `/auth/login` nie jest przekierowywany. `AuthLayout` nie
  czyta `locals`.
- Żadna strona nie ma `prerender = true` (wynik przeszukania `src/pages/**`), więc ryzyko
  „prerender czyta `locals.user`” nie dotyczy tej fazy.

### #3.4 Dokąd lądują logowanie, rejestracja i reset hasła

- Logowanie: `src/hooks/auth/useAuth.ts:69` → `window.location.href = "/"`. Trasa
  `src/pages/api/auth/login.ts` zwraca JSON i sama nie przekierowuje: 400 przy błędzie Zod, 401
  dla złych lub niezweryfikowanych danych (`:33-39`).
- Rejestracja: `src/components/auth/RegisterForm.tsx:71-76`. Przy `requiresVerification`
  wyświetla komunikat i zostaje na `/auth/register`. W przeciwnym razie przechodzi na `/`. Trasa
  ustawia `requiresVerification` przy `data.user && !data.session` (`register.ts:45`).
- PRD: FR-016 „User can register and log in exactly as before” (`prd.md:177`); „no new sign-in
  paths, no unauthenticated access” (`prd.md:230`). **Docelowe miejsce nie jest nazwane.**
  Wyrocznią może być tylko obecne zachowanie, a plan musi to zapisać jako decyzję. Wyprowadzanie
  oczekiwania z `useAuth.ts` byłoby tautologią w rozumieniu §1.
- `/auth/verify?code=`: middleware wymienia kod na sesję i **zawsze** przekierowuje na
  `/auth/change-password?verified=true` (`index.ts:36-52`). Jeśli projekt Supabase wysyła link
  potwierdzenia rejestracji na `/auth/verify`, nowy użytkownik trafi na formularz zmiany hasła.
  Dokąd prowadzi link z maila, ustawia konfiguracja Supabase (`emailRedirectTo` w `register.ts`
  nie sprawdzono), więc to jest otwarte pytanie, nie potwierdzona awaria.
- Po zmianie hasła `SimpleChangePasswordForm.tsx:85` przechodzi na
  `/auth/login?message=password-updated` **bez wylogowania**, więc sesja żyje za formularzem
  logowania. Zachowanie jest tej samej klasy co #3.2.
- Martwy kod: `useAuth.ts:236` woła nieistniejące `/api/auth/exchange-code`. Nikt nie wywołuje
  tej metody.

### #3.5 Testowalność middleware w Jest (najtańsza warstwa)

- `src/middleware/index.ts:2` importuje `astro:middleware`, a `supabase.client.ts:34` czyta
  `import.meta.env`. ts-jest kompiluje do CommonJS, gdzie `import.meta` jest błędem składni.
  Repo dokumentuje to w komentarzach testów (np. `tests/unit/calorie-estimation.service.test.ts:12-13`).
  `jest.config.js` nie ma mapowania dla `astro:middleware`, a w `tests/` brak `__mocks__`.
- Szew zgodny z istniejącą praktyką (cookbook §6.2) wygląda tak:
  - `jest.mock("astro:middleware", () => ({ defineMiddleware: (f) => f }), { virtual: true })`;
  - `jest.mock("@/db/supabase.client", ...)` zwracające `{ supabase: { auth: { getUser, signOut, exchangeCodeForSession } }, flushCookies }`;
  - `@jest-environment node`;
  - kontekst `{ locals, url, request, redirect }`, gdzie `redirect` buduje `Response` 302.

  Taki test dowodzi decyzji middleware: która ścieżka przekierowuje i czy każde wyjście przechodzi
  przez `flushCookies`. Nie dowodzi, że sesja po wylogowaniu jest martwa.
- Jak uniknąć anty-wzorca „asercja na zawartości listy”: zbiór ścieżek do sprawdzenia powinien
  pochodzić z wymagania („bez sesji dostępne są tylko strony i API logowania, rejestracji, resetu
  i weryfikacji”, PRD `:230`). Dla każdej ścieżki test sprawdza zachowanie żądania (302 +
  `Location` albo `next()`), nie `PUBLIC_PATHS.includes`. Wariant odporny na nowe strony: wygenerować
  listę ścieżek z drzewa `src/pages/**` i oczekiwać 302 dla każdej spoza `/auth/*` i `/api/auth/*`.
  Nowa strona dopisana bez decyzji o publiczności zostanie wtedy objęta automatycznie.
- `collectCoverageFrom` wyklucza `src/middleware/**` (`jest.config.js`). Test zadziała, tylko
  pokrycie go nie policzy, a CI pokrycia i tak nie bramkuje.

### #4.1 Gdzie mieszka własność — trasa, serwis, baza

| Zasób / czasownik | Filtr w kodzie | Obcy id → status | Źródło |
|---|---|---|---|
| wpisy GET `?date=` | `.eq("user_id", userId)` | lista B (pusta) | `src/lib/services/diary.service.ts:66` |
| wpisy POST | `user_id` z `getUser`; schemat bez `user_id` (strip) | — | `diary-entries/index.ts:93-100`, `diary.service.ts:110`, `create-entry.ts:90-105` |
| wpisy POST z obcym `source_recipe_id` | `readOwnRecipeContent` `.eq("id").eq("user_id").maybeSingle()` | **404** „Przepis nie został znaleziony” | `diary.service.ts:149-162`, `diary-entries/index.ts:107-111` |
| wpisy PATCH `/:id` | `getEntry` z `user_id` + update z `user_id`; schemat `.strict()` | **404** (pole `user_id` w ciele → 400) | `diary.service.ts:294-298,367-373,418-430`, `[id].ts:86-91`, `update-entry.ts:53` |
| wpisy DELETE `/:id` | `.delete().eq("id").eq("user_id").select("id")` | **404** | `diary.service.ts:393-404`, `[id].ts:141-146` |
| wpisy POST `/:id/estimate` | `markEstimationRequested` z `user_id` | **404 przed wywołaniem modelu** | `diary.service.ts:183-202`, `estimate.ts:67-72` |
| cel dnia GET/PUT | `.eq("user_id")` / upsert `user_id` z `getUser`, `onConflict: "user_id"` | brak id w żądaniu | `user-settings.service.ts:23-27,48-55` |
| preferencje GET/POST | `.eq("user_id")` / `{...preference, user_id: user.id}` | lista B | `preferences/index.ts:47,136-139` |
| preferencje PUT/DELETE `/:id` | pre-odczyt `.eq("id").eq("user_id").single()` | **404** | `preferences/[id].ts:45-56,63-70,121-131` |
| przepisy GET/PUT `/:id` | `.eq("user_id").single()`, PGRST116 → 404 | **404** | `recipes/[id].ts:39-52,120-135` |
| przepisy DELETE `/:id` | `.delete().eq("id").eq("user_id")` bez liczby wierszy | **200** `{success:true}` | `recipes/[id].ts:183-193` |
| `ai/save-recipe` z `replace_existing.recipe_id` | pre-odczyt z `user_id` | **404** `RECIPE_NOT_FOUND` | `src/pages/api/ai/save-recipe.ts:91-108` |
| `ai/save-recipe` `logId` | `.from("logs").update(...).eq("id", logId)` — **bez `user_id`** | 200/201, cichy no-op pod RLS | `src/lib/services/ai.service.ts:686` |

- RLS jest włączony na wszystkich pięciu tabelach. Każda ma 4 polityki `anon` (`false`) i 4 polityki
  `authenticated` z `user_id = auth.uid()`; UPDATE ma `using` + `with check`, INSERT `with check`.
  Lokalizacje: `supabase/migrations/20250427130913_healthymeal_schema.sql:81-193`,
  `20260922140906_create_diary_entries.sql:69-109`, `20260930074331_create_user_settings.sql:37-80`.
  W tych trzech migracjach żadnej tabeli nie brakuje polityki ani `with check`.
- Wniosek dla tezy „zalogowany = uprawniony”: na każdej ścieżce z tabeli z wyjątkiem `logs`
  własność jest sprawdzana dwa razy, w kodzie i w bazie. Test atrapą klienta może usunąć tylko
  pierwszą warstwę. Zostanie wtedy zielony tak długo, jak RLS działa, a nie wykryje wyłączonego
  RLS. Odwrotnie: test na prawdziwej bazie nie odróżni, która warstwa obroniła.
- Klucz obcy `diary_entries.source_recipe_id references recipes(id)` jest sprawdzany z pominięciem
  RLS. Domknięcie istnieje tylko w serwisie (`readOwnRecipeContent`); archiwum zapisało to jako
  wiążące dla S-03 (`context/archive/2026-09-22-diary-entry-store/plan.md:124-133`). Przypadek
  „POST z obcym `source_recipe_id` → 404” jest jedynym POST-em z obcym id, w którym obrona leży
  **wyłącznie** w kodzie aplikacji. Ma najwyższą wartość sygnału w tej fazie.
- PATCH z `recalculate` i estimate z obcym przepisem nie dają 404. Obcy przepis jest traktowany jak
  usunięty: wartość jest czyszczona albo wycena idzie gałęzią opisową
  (`diary.service.ts:326-332`, `estimate.ts:84-92`). Wpis jest własny, więc treść cudzego
  przepisu nie wycieka. Guidance „404 dla POST z obcym id” nie stosuje się do tych dwóch
  przypadków, bo tam obcy jest *przepis*, a nie zasób, na którym działa czasownik.

### #4.2 Korekty do guidance #4

1. **Cel dnia** nie ma powierzchni „obcego id”. Dowodem izolacji jest: A ustawia cel X, B czyta
   swój cel i dostaje `null` (albo swój), a cel A po PUT B dalej wynosi X. Da się to sprawdzić
   tylko na prawdziwej bazie z dwoma kontami.
2. **DELETE przepisu** z obcym id zwraca 200. Izolacja danych jest zachowana, ale kontrakt „404
   dla cudzego” nie. Plan musi wybrać: przypiąć obecne zachowanie (`test.failing` z wyrocznią 404,
   wzorzec §6.1) albo naprawić. Przepisy formalnie nie są wymienione w #4 („wpisy dziennika, cel
   albo preferencje”), ale należą do tej samej klasy i do FR-014/FR-015.
3. **Preferencje PUT** parsują ciało `preferenceSchema.parse(body)` *przed* sprawdzeniem
   własności (`preferences/[id].ts:37-38` vs `:45`). Obcy id z błędnym ciałem daje 500 z treścią
   ZodError w `error`, nie 404. To nie jest wyciek cudzych danych, tylko ryzyko #6 / faza 3.
   Test izolacji musi więc wysyłać *poprawne* ciało.
4. **`logs`**: jedyna ścieżka, gdzie własność stoi wyłącznie na RLS. Skutek dla danych użytkownika
   jest pomijalny (flaga `is_accepted`), ale guidance „czy własność sprawdza trasa, polityka, czy
   oba” ma tu odpowiedź „tylko polityka”.

### #4.3 Istniejące testy i luka

- Brak testów middleware, `PUBLIC_PATHS`, wylogowania, przekierowań i drugiego użytkownika: żaden
  plik w `tests/` ani `src/` ich nie dotyczy.
- Najbliżej #4:
  - `tests/unit/diary-entry-route.test.ts:131,178` „404 dla cudzego albo nieistniejącego wpisu”:
    serwis zamockowany na `null`, czyli test mapowania null → 404, nie izolacji;
  - `tests/unit/diary-service.test.ts:198,252,363,441,577,728,863,908` i
    `tests/unit/user-settings-service.test.ts:23,46-63`: asercje `eq("user_id","user-1")`;
  - `tests/unit/recipes-route.test.ts:70` (`[["user_id","user-1"]]`);
  - `tests/unit/diary-validations.test.ts:363` (`user_id` w ciele odrzucony albo usunięty).

  To są testy interakcji z jednym podmiotem — dokładnie anty-wzorzec z §2 #4, choć użyteczne jako
  strażnik pierwszej warstwy.
- Brak testów tras preferencji (`src/pages/api/preferences/*`) i tras `GET/POST /api/diary-entries`.
- E2E: 3 specy, każdy loguje się przez UI w swoim ciele; brak `storageState`, globalnego setupu
  i helpera wylogowania (`tests/e2e/page-objects/LoginPage.ts:85` `expectSuccessfulLogin`).
  **Jeden użytkownik testowy**: `tests/e2e/config/test-data.ts:7` wymaga `E2E_USERNAME_ID`,
  `E2E_USERNAME`, `E2E_PASSWORD`. CI przekazuje dokładnie te trzy sekrety plus `SUPABASE_URL`
  i `SUPABASE_KEY` w środowisku `integration` (`.github/workflows/ci-cd.yml:108-117`).

### Najtańsza warstwa z prawdziwym sygnałem

| Dowód | Warstwa | Dlaczego nie taniej |
|---|---|---|
| każda ścieżka bez sesji → 302 `/auth/login`, publiczna → `next()`, każde wyjście przez `flushCookies` | integracja middleware w Jest (szew z #3.5) | — (najtańsza) |
| po wylogowaniu ciasteczka sprzed wylogowania, odtworzone w nowym kontekście, dają 302 dla strony i trasy API | e2e (Playwright, API request context + jedno UI-kliknięcie „Wyloguj”) | unieważnienie refresh tokenu i odrzucenie JWT dzieje się w GoTrue; atrapa niczego nie dowodzi |
| logowanie ląduje na `/`; rejestracja zgodnie z decyzją planu | e2e (logowanie już jest w każdym specu; dopisać asercję URL) albo test komponentu RTL z mockiem `fetch` | rejestracja e2e tworzy konta — koszt sprzątania |
| klient wylogowania nie udaje sukcesu przy błędzie | test wyspy RTL z `fetch` zamockowanym na krawędzi (wzorzec `use-ai.test.tsx`) | — ; tylko jeśli plan uzna obecne zachowanie za błąd |
| B → 404/pusta lista dla zasobu A (wpisy, preferencje; cel: brak przecieku) | e2e na poziomie API (Playwright `request` z dwoma zalogowanymi kontekstami, bez UI) | izolacja = RLS + filtr; atrapa klienta testuje tylko filtr |
| POST wpisu z obcym `source_recipe_id` → 404 | integracja trasy w Jest (obrona wyłącznie w kodzie) **i** e2e API z dwoma kontami | w Jest wystarczy stub zwracający `null` z `maybeSingle`, bo baza tu nie broni |

E2E z dwoma podmiotami wymaga drugiego konta i nowych sekretów (`E2E_USERNAME_2` itp.)
w środowisku `integration`. To zmiana konfiguracji CI poza kodem, a jej właścicielem jest
użytkownik (Open Questions).

## Code References

- `src/middleware/index.ts:5-19` — `PUBLIC_PATHS`
- `src/middleware/index.ts:36-67` — gałęzie `/auth/verify` (`code`, `error`)
- `src/middleware/index.ts:72-86` — `getUser()`, przekierowanie, `flushCookies(await next())`
- `src/db/supabase.client.ts:42-71` — bufor `setAll`, `flushed`, `flushCookies`
- `src/pages/api/auth/logout.ts:8-17` — `signOut()` bez zakresu; 400 przy błędzie
- `src/components/common/LogoutButton.tsx:17-32` — przekierowanie bez względu na wynik
- `src/hooks/auth/useAuth.ts:69` — logowanie → `/`
- `src/components/auth/RegisterForm.tsx:71-76` — rejestracja: komunikat albo `/`
- `src/components/auth/SimpleChangePasswordForm.tsx:85` — po zmianie hasła na login bez wylogowania
- `src/layouts/MainLayout.astro:14-18` — druga linia obrony
- `src/lib/services/diary.service.ts:149-162` — `readOwnRecipeContent` (obrona przed FK)
- `src/pages/api/recipes/[id].ts:183-193` — DELETE bez liczby wierszy → 200
- `src/pages/api/preferences/[id].ts:37-56` — parse przed sprawdzeniem własności
- `src/lib/services/ai.service.ts:686` — `logs.update` bez `user_id`
- `node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:3412-3452` — `signOut` / `_signOut`, zakres `global`
- `node_modules/@supabase/ssr/dist/main/createServerClient.js:52-69` — listener `SIGNED_OUT` → `applyServerStorage`
- `tests/e2e/config/test-data.ts:7` — jeden użytkownik testowy
- `.github/workflows/ci-cd.yml:103-117` — job `e2e-tests`, środowisko `integration`, sekrety

## Architecture Insights

- Autoryzacja ma trzy warstwy. Middleware decyduje „sesja albo 302”. Handler i serwis decydują
  „mój rekord albo 404” filtrem `user_id`. RLS decyduje to samo w bazie. Testy jednostkowe mogą
  izolować tylko dwie pierwsze, a trzecią da się zobaczyć wyłącznie na prawdziwym Supabase.
  §7 wyklucza skrypty SQL z tego planu, więc dowód na poziomie aplikacji z dwoma kontami jest
  jedynym miejscem, gdzie RLS zostaje sprawdzony automatycznie.
- Cookbook §6.3/§6.4 dostanie dwa nowe wzorce. Pierwszy to szew `astro:middleware` +
  `supabase.client` w Jest; dotąd żaden test nie importuje middleware. Drugi to
  Playwright `request` z dwoma kontekstami logowania; dotąd każdy spec loguje się przez UI.

## Historical Context (from prior changes)

- `context/foundation/lessons.md` — „Every exit from middleware must pass through flushCookies”:
  **potwierdzone** jako aktualna reguła; obecny kod ją spełnia na wszystkich sześciu wyjściach (pięć `redirect()` i `next()`)
  (`index.ts:45,51,57,66,83,86`). `docs/reference/contract-surfaces.md` mówi o „six `redirect()` calls”, czyli o jedno za dużo: liczba jest nieaktualna, sama reguła się zgadza. Ścieżka wylogowania
  w obecnym kodzie nie wykazuje opisanej awarii (#3.1).
- `bc9c1f6 fix(auth): write supabase session cookies onto the response` — źródło lekcji i jedyna
  merytoryczna zmiana w `src/pages/api/auth` w ostatnich 30 dniach.
- `context/archive/2026-09-22-diary-entry-store/plan-brief.md:90` „RLS is proven by hand, not by
  CI” — **potwierdzone**. `impl-review.md:88,119` (F2: skrypt przepisany w `dee2aa6`, nigdy
  nieuruchomiony) — **potwierdzone** w repo; czy uruchomiono go poza repo, nie da się stwierdzić.
- `context/archive/2026-09-29-edit-and-delete-entry/impl-review.md:92-110` (F6: skrypt zmieniony,
  „wymaga ponownego uruchomienia — niewykonane”) — **częściowo sprzeczne** z `plan.md:564`
  (`[x] 1.6 … [PASS] — e1edc34`), bo stempel wskazuje commit, który sam zmienił skrypt.
  Nie da się rozstrzygnąć z repo.
- `context/archive/2026-09-30-daily-goal-and-progress` — 1.5 `[PASS]` ostemplowane `fdb55d0`,
  ale `684e4a6` później zmienił `user-settings-rls.sql`. Obecna wersja skryptu mogła nie zostać
  uruchomiona. Ocena: **częściowo**.
- `context/archive/2026-09-22-diary-entry-store/plan.md:124-133` — FK omija RLS, obrona należy
  do trasy: **potwierdzone**, domknięte w `readOwnRecipeContent`.

## Related Research

- `context/changes/testing-diary-value-integrity/research.md` — faza 1; z niej pochodzi wzorzec
  route-testu (cookbook §6.2), do którego nawiązuje szew middleware.

## Open Questions

1. **Wylogowanie przy błędzie** (`LogoutButton.tsx:17-32`): przypiąć obecne zachowanie
   (przekierowanie mimo porażki) czy uznać za defekt (`test.failing` + wpis w `known-drift.md`)?
   Decyzja produktowa dla planu.
2. **302 vs 401 dla tras API bez sesji**: guidance przyjmuje 302. Plan powinien wprost zapisać,
   że wyrocznią jest 302 + `Location: /auth/login`, albo otworzyć to jako dług.
3. **`/api/health` za logowaniem**: świadome czy pomyłka listy? Konsumenta nie znaleziono.
4. **Drugie konto e2e**: czy użytkownik założy drugie konto testowe i doda sekrety do środowiska
   `integration`? Bez tego dowód #4 na prawdziwej bazie zostaje lokalny albo nie powstaje.
5. **Runtime**: czy GoTrue projektu odrzuca access token po globalnym `signOut`, i czy Astro 7
   normalizuje slash w `url.pathname`. Rozstrzyga pierwszy przebieg e2e, nie odczyt kodu.
6. **DELETE przepisu → 200 dla obcego id**: w zakresie fazy 2 (przypięcie) czy osobna poprawka?
7. **Link z maila na `/auth/verify`**: czy potwierdzenie rejestracji prowadzi tam, a więc na
   formularz zmiany hasła? Zależy od konfiguracji Supabase, której repo nie zawiera.
