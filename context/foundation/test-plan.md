# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-10-06

## 1. Strategy

Testy w tym projekcie trzymają się trzech zasad, od których nie ma wyjątków:

1. **Koszt × sygnał.** Wygrywa najtańszy test, który daje prawdziwy sygnał dla danego ryzyka.
   Nie promuj testu do e2e tylko dlatego, że e2e „wydaje się bezpieczniejsze”. Nie kładź modelu
   wizyjnego na deterministycznym diffie, który już łapie regresję.
2. **Obawy użytkownika są pełnoprawnym dowodem.** Ryzyko zakotwiczone w „zespół boi się X,
   a awaria wyszłaby gdzieś w <obszarze>” waży tyle samo co linia PRD albo dane o churnie.
3. **Ryzyka to scenariusze, nie miejsca w kodzie.** Ten plan opisuje, *co może się zepsuć*
   i *dlaczego uważamy to za prawdopodobne*: na podstawie dokumentów, wywiadu i *sygnału*
   z kodu (churn, struktura, baza testów). NIE twierdzi, że wie, która linia odpowiada za awarię.
   Tę wiedzę wytwarza `/10x-research` w każdej fazie wdrożenia. Gdy plan i research nie zgadzają
   się co do tego, gdzie leży awaria, prawdą jest research.

Zakres hot-spotów użyty do ważenia prawdopodobieństwa: `src/`, `tests/` (ostatnie 30 dni, 42 commity;
z wyłączeniem `src/db/database.types.ts`, PNG, `supabase/`, `context/`, dokumentacji).

Wyrocznia testu pochodzi z wymagania (PRD, kontrakt, wywiad), nigdy z kodu pod testem. Asercja,
której oczekiwana wartość została policzona tym samym kodem, który testujemy, jest tautologią
i nie spełnia żadnego wiersza §2.

## 2. Risk Map

Najważniejsze scenariusze awarii, uporządkowane według ryzyka = wpływ × prawdopodobieństwo.
Kolumna Źródło cytuje *dowód, który wyniósł ryzyko do góry*, nigdy plik jako „miejsce awarii”
(patrz §1, zasada 3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | Suma dnia pokazuje złą liczbę i wygląda na wiarygodną: wartość „z przepisu” zawyżona krotnie, wpis oczekujący liczony albo pominięty bez adnotacji, spóźniona wycena AI nadpisuje wartość, którą użytkownik ustawił sam | High | High | wywiad Q1; PRD „Quality properties” (niepełna suma mówi, że jest niepełna; każda wartość niesie pochodzenie); archive `2026-09-25-recipe-entry-with-portions` (przegląd F1 naprawione, F2 CRITICAL otwarte), `2026-09-23-ai-estimate-for-free-text` (F3), `2026-09-29-edit-and-delete-entry` (F1); hot-spot dir `src/components/diary` — 44 zmiany/30d |
| 2 | Odpowiedź modelu (słowa zamiast liczby, wartość absurdalna, timeout, zepsuty przepis) zostaje przyjęta i zapisana albo kończy się 500, a ręczna ścieżka wartości przestaje działać | High | High | wywiad Q2, Q3; PRD Guardrails („AI sugeruje, nigdy nie jest jedynym źródłem liczby”), FR-004; hot-spot dirs `src/lib/services` — 16 zmian/30d, `src/pages/api/diary-entries` — 12 zmian/30d |
| 3 | Po „Wyloguj” sesja trwa dalej; logowanie lub rejestracja przekierowuje w złe miejsce; pomyłka w liście ścieżek publicznych otwiera chronioną stronę albo blokuje publiczną | High | High | wywiad Q2, Q4; `context/foundation/lessons.md` (zapis ciasteczek sesji już raz kosztował poprawkę); PRD FR-016; hot-spot dir `src/pages/api/auth` — 10 zmian/30d, ale tylko w 2 commitach, z których merytoryczny jest jeden (poprawka zapisu ciasteczek sesji z `lessons.md`; drugi to podbicie zależności) — churn zawyżony, sygnałem jest ta jedna poprawka (research fazy 2) |
| 4 | Nadużycie: użytkownik czyta, edytuje albo usuwa cudze wpisy dziennika, cel albo preferencje (IDOR, ominięcie izolacji per-użytkownik) | High | Medium | wywiad Q1; PRD „Access Control Changes” (dane prywatne per użytkownik); archive `2026-09-22-diary-entry-store` i `2026-09-29-edit-and-delete-entry` (dowody RLS przepisane i nieuruchomione ponownie; izolacja sprawdzana wyłącznie ręcznie, poza CI) |
| 5 | Preferencje albo przepisy użytkownika zostają usunięte lub uszkodzone przez działanie w profilu albo w dzienniku — jedyna nieodwracalna awaria | High | Low | wywiad Q4; PRD Guardrails, FR-014, FR-015, „Constraints & Compatibility” (przepisy tylko czytane, jeden zapis do profilu); `docs/reference/known-drift.md` (trasy preferencji sprzed konwencji); profil bazy testów (zero testów dla preferencji) |
| 6 | Nadużycie / niezaufane wejście: wartość ponad twardy limit (długość tekstu, kalorie, porcje, cel 500–10000, fraza wyszukiwania, data z przyszłości) przechodzi przez klienta lub trasę i kończy się 500 z bazy, obcięciem albo zepsutym widokiem | Medium | Medium | wywiad Q1; `docs/reference/contract-surfaces.md` (zakres celu zdublowany w bazie i walidacji); archive `2026-09-23-manual-diary-entry` (data z przyszłości blokowana tylko w przeglądarce; notacja `1e3`), `2026-10-02-recipe-search-escape`; hot-spot dir `src/lib/validations` — 14 zmian/30d |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | Dla znanego zestawu wpisów (wartości ręczne, z przepisu, oczekujące, niepoliczone) suma dnia i adnotacja „N oczekuje” są zgodne z regułą z PRD; nagłówek deklarujący kilka porcji nie mnoży wartości; spóźniona wycena nie nadpisuje wartości zmienionej po zleceniu | „Wartość ma etykietę pochodzenia, więc jest poprawna” | gdzie liczona jest suma i adnotacja, kaskada pochodzenia, znacznik świeżości wyceny, rozpoznawanie nagłówka bloku odżywczego | unit (suma, parser) + integracja trasy (wyścig wyceny) | oczekiwana suma liczona tym samym kodem co produkcja (problem wyroczni) |
| #2 | Odpowiedź modelu bez liczby, z liczbą poza rozsądnym zakresem albo przekroczenie czasu nie zapisuje wartości; wpis zostaje „niepoliczony”, a ręczna wartość dalej się zapisuje; generowanie przepisu przy złej odpowiedzi zwraca czytelny błąd, nie 500 i nie śmieciowy przepis | „Status 200 od dostawcy oznacza poprawną wartość” | granica HTTP z dostawcą modelu, parsowanie i walidacja odpowiedzi, tłumaczenie błędów na odpowiedź trasy, łańcuch timeoutów | integracja trasy z mockiem wyłącznie na krawędzi HTTP | mockowanie wewnętrznych serwisów zamiast krawędzi; tylko happy path |
| #3 | Po wylogowaniu ciasteczka sesji sprzed wylogowania, odtworzone w czystym kontekście, dają przekierowanie na login dla chronionej strony i trasy API (dla API dziś 302 na login, nie 401); każda chroniona ścieżka bez sesji przekierowuje, każda publiczna działa bez sesji — zbiór ścieżek pochodzi z wymagania („bez sesji tylko logowanie, rejestracja, reset, weryfikacja”), nie z listy w kodzie; logowanie i rejestracja lądują tam, gdzie dziś — PRD (FR-016 „exactly as before”) miejsca nie nazywa, więc wyrocznię plan zapisuje jako decyzję | „Ciasteczko zniknęło w przeglądarce, więc sesja się skończyła” oraz „ekran logowania po Wyloguj oznacza koniec sesji” (klient może przekierować mimo błędu serwera albo sieci) | każde wyjście z middleware, czyszczenie ciasteczek i unieważnienie sesji przy wylogowaniu, zachowanie klienta wylogowania przy błędzie, mapa przekierowań auth, dokładne dopasowanie ścieżek publicznych (slash na końcu, ścieżki techniczne) | integracja middleware (decyzja: przekierowanie albo przepuszczenie) + wąskie e2e tylko dla martwej sesji po wylogowaniu i lądowania po logowaniu | asercja na zawartości listy ścieżek zamiast na zachowaniu żądania; oczekiwane miejsce lądowania odczytane z kodu przepływu (tautologia) |
| #4 | Użytkownik B dostaje 404 albo pustą listę dla zasobu użytkownika A przy GET, PATCH, DELETE i POST z obcym identyfikatorem; dla celu dnia (brak identyfikatora w żądaniu) — B nie widzi celu A, a zapis B nie zmienia celu A; usunięcie cudzego przepisu nie może zgłaszać sukcesu | „Zalogowany oznacza uprawniony do tego rekordu” oraz „filtr po użytkowniku w kodzie = izolacja” (własność pilnuje i kod, i polityka bazy; atrapa klienta widzi tylko pierwszą warstwę) | czy własność sprawdza trasa, polityka bazy, czy oba — i gdzie broni wyłącznie jedno z nich (odwołanie do cudzego przepisu przy tworzeniu wpisu broni tylko kod); jak zapisy ustalają `user_id`; dostępność drugiego konta testowego | e2e na poziomie API z dwoma zalogowanymi podmiotami na prawdziwej bazie; integracja trasy tylko tam, gdzie obrona leży wyłącznie w kodzie | test z jednym użytkownikiem, który nigdy nie sprawdza izolacji; asercja, że filtr „został wywołany”, zamiast że cudzy rekord nie wycieka |
| #5 | Zapis i zmiana celu dziennego oraz operacje na dzienniku zostawiają preferencje i przepisy bez zmian; usunięcie jednej preferencji nie rusza innych | „Inna tabela, więc nic się nie może stać” | wszystkie ścieżki zapisu dotykające profilu i przepisów; zachowanie usunięcia przepisu wobec wpisów | integracja | asercja tylko na odpowiedzi HTTP bez sprawdzenia stanu po operacji |
| #6 | Wartości na granicy limitu przechodzą, a o jeden dalej dają 400 (nie 500), zarówno w walidacji trasy, jak i względem ograniczeń bazy; reguły pilnowane w przeglądarce mają odpowiednik na serwerze albo są świadomie opisane jako luka | „Klient blokuje, więc serwer też” | lista twardych limitów i ich duplikatów (walidacja ↔ baza ↔ UI) | unit (schematy) + integracja trasy | test tylko typowych wartości, bez granic |

## 3. Phased Rollout

Każdy wiersz to osobna faza wdrożenia, która otworzy własny folder zmiany przez `/10x-new`.
Status przesuwa się od lewej do prawej przez wartości poniżej; orkiestrator aktualizuje go,
gdy artefakty pojawiają się na dysku.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Integralność wartości i sumy dnia | Udowodnić, że suma dnia i wartości kalorii są prawdziwe, także gdy model zwraca śmieci albo spóźnioną odpowiedź | #1, #2 | unit + integration | complete | testing-diary-value-integrity |
| 2 | Granice sesji i dostępu | Udowodnić, że wylogowanie kończy sesję, przekierowania i ścieżki publiczne są poprawne, a użytkownik nie dosięga cudzych rekordów | #3, #4 | integration + narrow e2e | planned | testing-session-and-access-boundaries |
| 3 | Dane chronione i twarde limity | Udowodnić, że preferencje i przepisy przetrwają nietknięte, a każdy limit kończy się 400, nie 500 | #5, #6 | unit + integration | not started | — |
| 4 | Bramki jakości | Zablokować poziom z faz 1–3: wymagane testy w CI i lokalny hook po edycji | cross-cutting | gates, post-edit hook | not started | — |

## 4. Stack

Klasyczna baza testów projektu. Warstwy AI-native (recenzja wizualna, ocena odpowiedzi modelu)
są świadomie poza planem — patrz §7.

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit + integration | Jest + ts-jest | 30.5 / 29.4 | `jest.config.js`, środowisko jsdom, `tsconfig.test.json`; nie `vitest` (AGENTS.md); `.astro` bez transformera |
| component | React Testing Library + jest-dom | 16.3 / 7.0 | testy wysp React w `tests/unit/` |
| API mocking | mocki Jest na krawędzi | n/a | brak MSW; polityka mockowania ustalana w fazie 1 |
| e2e | Playwright | 1.63 | sam startuje serwer (`--ignore-lock`), `TEST_MODE=true`, w CI na środowisku `integration`, bez klucza OpenRouter |
| RLS proof | skrypty SQL `supabase/checks/` | n/a | uruchamiane ręcznie, poza CI i poza zakresem tego planu |
| post-edit hook | none yet — see Phase 4 | n/a | — |

Baza testów: **sparse** — 18 plików unit i 3 specy e2e, skupione na dzienniku i celu dnia; auth,
preferencje, trasy `/api/ai/*` i middleware bez testów.

**Stack grounding tools (current session):**
- Docs: none (Context7 not available in current session) — wersje z `package.json`; checked: 2026-10-05
- Search: WebSearch (generic) — not used; Exa.ai not available in current session; checked: 2026-10-05
- Runtime/browser: none (Playwright MCP not available in current session) — e2e przez lokalny Playwright; checked: 2026-10-05
- Provider/platform: GitHub przez `gh` CLI — możliwe sprawdzenie wymaganych checków PR w fazie 4; Supabase/Vercel MCP not available in current session; checked: 2026-10-05

## 5. Quality Gates

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint + typecheck + format:check | local + CI (`code-quality`) | required | dryf składni, typów (`strict`), formatu, literały UI w `/diary` |
| test:security (audit-ci) | CI (`code-quality`) | required | podatności zależności ≥ moderate |
| unit + integration (`npm run test`) | local + CI (`unit-tests`) | required; nowe testy z faz 1–3 wchodzą automatycznie | regresje logiki, walidacji, tras |
| e2e na krytycznych przepływach | CI (`e2e-tests`, środowisko `integration`) | required; przepływy wylogowania i logowania po §3 Phase 2 | zepsute ścieżki użytkownika |
| wymagane checki PR na `master` | GitHub | required after §3 Phase 4 | merge z czerwonym unit/e2e |
| post-edit hook (testy powiązane z edytowanym plikiem) | local (pętla agenta) | recommended after §3 Phase 4 | regresje w chwili edycji; nie zastępuje CI |

## 6. Cookbook Patterns

Jak dodawać nowe testy w tym projekcie. Każda podsekcja wypełnia się, gdy odpowiednia faza
wdrożenia zostanie dowieziona; do tego czasu brzmi „TBD — see §3 Phase <N>”.

### 6.1 Adding a unit test

- **Lokalizacja**: `tests/unit/` (katalogu `tests/integration/` jeszcze nie ma; testy tras też leżą
  w `tests/unit/`). Jest 30 + ts-jest, nigdy `vitest`; domyślne środowisko to jsdom.
- **Nazewnictwo**: `<moduł>.test.ts` dla czystej logiki (`diary-totals.test.ts`), `<Komponent>.test.tsx`
  dla wyspy React (`DiaryDaySummary.test.tsx`), `use-<hook>.test.tsx` dla hooka. Opisy `describe`/`it`
  po polsku, w języku zachowania („liczy każdy wpis bez wartości jako brak…”).
- **Testy referencyjne**: `tests/unit/diary-totals.test.ts` (czysta funkcja, fabryka `entry(overrides)`
  z pełnym wierszem `DiaryEntryDto`), `tests/unit/DiaryDaySummary.test.tsx` (RTL, asercje po
  `data-testid` na tekście, który widzi użytkownik).
- **Wyrocznia**: literał z PRD, kontraktu albo decyzji planu, zapisany w komentarzu nad przypadkiem
  (np. „500 + 320 + 410 + 0 = 1230 kcal, braki 3 z 7”). Nigdy wartość policzona kodem pod testem (§1).
- **Pełny tekst**: `expect(el.textContent).toBe("…")`, nie `toHaveTextContent("…")` — ten drugi
  z argumentem-napisem sprawdza tylko podciąg i przepuści dopisany albo ucięty fragment.
- **Znany dług**: defekt, którego faza nie naprawia, zapisz jako `test.failing` z wyrocznią
  (referencja: blok F2 w `tests/unit/recipe-nutrition.test.ts`) — jeden `test.failing` na przypadek,
  bo jeden test z kilkoma asercjami „zawodzi” już przy pierwszej. Komentarz nad blokiem odsyła do
  `docs/reference/known-drift.md`. Jest 30 liczy oczekiwaną porażkę jako *passed* w podsumowaniu;
  gdy ktoś naprawi defekt, test zrobi się czerwony — to sygnał, by zamienić go na `it` i usunąć wpis
  z `known-drift.md`.
- **Kontrola wyroczni**: przed commitem celowo zepsuj linię produkcyjną, którą test pilnuje, zobacz
  czerwony test, przywróć. Test, który nie czerwienieje, niczego nie dowodzi.
- **Uruchomienie**: `npx jest tests/unit/<plik>`; cała suita `npm run test` (to samo co w CI).

### 6.2 Adding an integration test for an API route

- **Lokalizacja i nazwa**: `tests/unit/<domena>-<trasa>-route.test.ts`
  (`ai-generate-recipe-route.test.ts`, `diary-estimate-route.test.ts`). Test importuje handler
  (`import { POST } from "@/pages/api/…"`) i woła go z ręcznie zbudowanym kontekstem
  `{ request, params, locals: { supabase: { auth: { getUser } } } }` rzutowanym na
  `Parameters<typeof POST>[0]`.
- **Środowisko**: docblock `/** @jest-environment node */` na początku pliku — trasa buduje
  `Response`, którego jsdom nie dostarcza (`ReferenceError: Response is not defined`).
- **Co mockować**: tylko krawędź dostawcy modelu, nigdy własne serwisy w całości.
  - `jest.mock("@/lib/api/openrouter.service", () => ({ OpenRouterService: jest.fn()… }))` — wymagane
    w każdym pliku, który pośrednio importuje klienta: konstruktor prawdziwego `AIService` buduje
    `OpenRouterService`, a ten moduł czyta `import.meta.env`, czego ts-jest (CommonJS) nie skompiluje.
    Fabryka `jest.mock` jest wynoszona ponad importy, więc nie może sięgać po zmienne spoza siebie.
  - Serwis trasy zostaje **prawdziwą klasą**; podmieniasz metody `jest.spyOn(Service.prototype, "metoda")`.
    Dzięki temu klasy błędów łapane w trasie (`AIResponseParseError`, `RecipeNotFoundError`) są tymi
    samymi bytami, które serwis rzuca w produkcji, i `instanceof` działa.
  - `OpenRouterError` i podklasy (`RateLimitError`) importuj z `@/lib/api/openrouter.types` — ten moduł
    nie jest mockowany, więc `instanceof OpenRouterError` w trasie widzi prawdziwą klasę.
  - Wariant: trasa wyceny mockuje cały moduł `calorie-estimation.service` (on opakowuje dostawcę),
    a `DiaryService` zostaje prawdziwy ze `spyOn` — patrz `diary-estimate-route.test.ts`.
- **Kontrakt błędów (wyrocznia)**: awaria dostawcy (`OpenRouterError`, także rzut konstruktora klienta
  przy braku klucza) → 502 `{error:"Usługa AI jest chwilowo niedostępna", code:"AI_UNAVAILABLE"}`;
  nieczytelna odpowiedź modelu → 502 `{error:"AI zwróciło odpowiedź, której nie da się odczytać",
  code:"AI_PARSE_ERROR"}`; każdy inny błąd → 500 ze stałym ciałem bez `details` (`/api/ai/*`:
  `{error:"Błąd wewnętrzny serwera", code:"SERVER_ERROR"}`; trasa wyceny: samo `{error:"Błąd wewnętrzny serwera"}`).
  Dla 500 czytaj `response.text()` i sprawdź `not.toContain(<komunikat błędu>)` — ciało nie może
  wyciekać nazw ograniczeń ani treści wyjątku. Po awarii sprawdź też, że zapis nie nastąpił
  (`expect(applyEstimate).not.toHaveBeenCalled()`). Zawsze dodaj przypadek 401 bez sesji
  (`getUser` → `{ data: { user: null } }`) i 200 z wynikiem serwisu.
- **Higiena**: `jest.clearAllMocks()` w `beforeEach`, `jest.restoreAllMocks()` w `afterAll`;
  `console.error` wyciszony `spyOn(...).mockImplementation(() => undefined)` w przypadkach błędów.
- **Testy referencyjne**: `tests/unit/ai-generate-recipe-route.test.ts` (pełny kontrakt 200/401/502/500),
  `tests/unit/diary-estimate-route.test.ts` (gałęzie trasy, brak zapisu po awarii). Serwis pod trasą:
  `tests/unit/ai-service.test.ts`; klient przeglądarkowy z `fetch` zamockowanym na krawędzi
  (atrapa odpowiedzi to zwykły obiekt, bo jsdom nie ma `Response`): `tests/unit/use-ai.test.tsx`.
- **Uruchomienie**: `npx jest tests/unit/<plik>-route.test.ts`.

### 6.3 Adding an ownership / access test

- **Lokalizacja i nazwa**: jak trasa w §6.2 — `tests/unit/<domena>-route.test.ts`
  (`diary-entries-route.test.ts`, blok `DELETE /api/recipes/:id` w `recipes-route.test.ts`),
  `/** @jest-environment node */`, handler importowany i wołany z ręcznie zbudowanym kontekstem
  `{ request, params, locals: { supabase } }`.
- **Zakres — tylko obrona w kodzie**: atrapa klienta Supabase widzi wyłącznie pierwszą warstwę
  (filtr po `user_id` w trasie albo serwisie), nigdy RLS. Ten wzorzec dowodzi więc izolacji tylko
  tam, gdzie broni *wyłącznie* kod — referencyjnie odwołanie do cudzego przepisu przy tworzeniu
  wpisu (`source_recipe_id`): klucz obcy jest sprawdzany z pominięciem RLS, więc baza takiego wpisu
  nie odrzuci. Tam, gdzie broni też polityka bazy, zielony test atrapy nie jest dowodem izolacji.
- **Stanowa atrapa dwóch właścicieli**: tablica wierszy A i B w pliku; każde
  `eq(kolumna, wartość)` filtruje zbiór, `delete()` usuwa tylko wiersze spełniające *każdy* filtr,
  `insert()` dopisuje do rejestru (`inserted`). Atrapa obsługuje tylko łańcuchy, których trasa
  faktycznie używa, a nieznaną tabelę kończy wyjątkiem. Stub odpowiadający „nie ma” na wszystko
  jest tautologią — przeszedłby też po usunięciu filtra po użytkowniku.
- **Przypadki (wyrocznia z wymagania, nie z kodu)**: B z identyfikatorem A → 404 z tym samym ciałem
  co dla nieistniejącego identyfikatora (`999`) — cudzy i nieistniejący muszą być nieodróżnialne;
  ciało odpowiedzi nie zawiera treści rekordu A; `user_id` A w ciele żądania nie zmienia podmiotu
  (schemat wycina nieznane pola); wartość podana ręcznie nie omija sprawdzenia własności.
- **Kontrola pozytywna** (obowiązkowa): ten sam łańcuch dla własnego rekordu B → 201/200, a zapis
  idzie z `user_id` B przez prawdziwy kod (np. parser przepisu daje 250 kcal, `recipe_nutrition`).
  Bez niej nie wiadomo, czy atrapa w ogóle cokolwiek znajduje.
- **Stan po operacji, nie tylko status**: sprawdzaj rejestr insertów (`expect(inserted).toEqual([])`)
  i zawartość tabeli atrapy (`ids()` → `[10, 20]` po DELETE B na rekordzie A) osobno od kodu
  odpowiedzi. Status może kłamać — `DELETE /api/recipes/:id` na cudzym przepisie oddaje dziś 200, choć
  wiersz zostaje (defekt D5 przypięty `test.failing`, `docs/reference/known-drift.md`, „Własność rekordów”).
- **Kontrola wyroczni** (§6.1): usuń `.eq("user_id", …)` z odczytu albo DELETE i zobacz czerwień —
  w tej fazie usunięcie filtra z odczytu własnego przepisu czerwieni 5 testów, a z DELETE test stanu
  wiersza A.
- **Testy referencyjne**: `tests/unit/diary-entries-route.test.ts` (POST z obcym `source_recipe_id`,
  atrapa `select/eq/maybeSingle` + rejestr insertów), `tests/unit/recipes-route.test.ts` blok
  `DELETE /api/recipes/:id` (atrapa `delete/eq/then`, stan tabeli, dwa `test.failing` z wyrocznią 404).
- **Uruchomienie**: `npx jest tests/unit/diary-entries-route.test.ts tests/unit/recipes-route.test.ts`.
- **Nie wdrożone — dowód RLS**: izolacja tam, gdzie broni polityka bazy (GET/PATCH/DELETE wpisów,
  cel dnia, preferencje), wymaga e2e na poziomie API z dwoma kontami: dwa konteksty Playwright
  `request`, każdy zalogowany przez `POST /api/auth/login` z nagłówkiem `Origin` (`security.checkOrigin`),
  B woła każdy czasownik z identyfikatorem A i dostaje 404 albo pustą listę, a stan A sprawdza się
  z kontekstu A. Drugiego konta e2e nie ma (decyzja D4 planu `testing-session-and-access-boundaries`),
  więc tego wzorca w repo jeszcze nie ma — dodaj go razem z drugim kontem.

### 6.4 Adding a middleware / session test

- **Lokalizacja**: decyzja dostępu i ciasteczka — `tests/unit/middleware.test.ts` (integracja
  middleware pod Jest); klient wylogowania — `tests/unit/LogoutButton.test.tsx` (RTL); martwa sesja
  po wylogowaniu — `tests/e2e/session-boundaries.spec.ts` (Playwright, prawdziwy Supabase).
- **Szew middleware** (bez serwera Astro):
  - `/** @jest-environment node */` — middleware i atrapa `redirect` budują `Response`.
  - `jest.mock("astro:middleware", () => ({ defineMiddleware: (fn) => fn }), { virtual: true })` —
    moduł wirtualny Vite, którego Jest nie rozwiąże; test woła `onRequest(context, next)` wprost.
  - `jest.mock("@/db/supabase.client", …)` — alias rozwiązuje się do tego samego pliku, który
    middleware importuje jako `../db/supabase.client.ts`, więc atrapa trafia w ten moduł. Atrapa
    zwraca `{ supabase: { auth: { getUser, signOut, exchangeCodeForSession } }, flushCookies }`;
    zmienne sięgane z fabryki mają prefiks `mock` (fabryka jest wynoszona ponad deklaracje).
  - Kontekst budowany ręcznie: `{ locals, url, request, redirect }`, gdzie `redirect` to
    `(path) => new Response(null, { status: 302, headers: { Location: path } })` — ten sam kształt
    co w Astro 7, **bez kodowania** ścieżki, żeby atrapa pokazywała te same błędy co produkcja
    (tak wyszedł defekt `ByteString` — `docs/reference/known-drift.md`, „Middleware”). `next` to
    `jest.fn` zwracający 200 z rozpoznawalnym ciałem — po nim poznajesz przepuszczenie.
- **Atrapa `flushCookies` behawioralna**: dopisuje do odpowiedzi znacznik
  `Set-Cookie` i zwraca ją; test czyta nagłówek z odpowiedzi, którą zwrócił middleware. Sama asercja
  „funkcja wywołana” przepuściłaby wyjście, które spłukuje ciasteczka na innej odpowiedzi
  (`context/foundation/lessons.md`). Każde nowe wyjście z middleware dostaje przypadek ze znacznikiem.
- **Wyrocznia zbioru ścieżek**: z wymagania (PRD: bez sesji tylko logowanie, rejestracja, reset,
  weryfikacja) i z drzewa `src/pages/**` — test mapuje każdy plik strony/trasy na URL (`index` →
  katalog, `[id]` → `1`); pliki z `src/pages/auth/` i `src/pages/api/auth/` mają przejść bez sesji,
  wszystko inne dostać 302 na `/auth/login`. **Nigdy** z `PUBLIC_PATHS`: test nie importuje ani nie
  przepisuje tej listy — asercja na jej zawartości byłaby tautologią. Strażnik mapowania: zbiór
  z drzewa nie może być mniejszy niż przypadki z wymagania. Dokładne dopasowanie (`/auth/login/`,
  `/Auth/Login`) → 302 bez pętli.
- **Kontrakt API bez sesji**: trasa `/api/*` spoza auth dostaje **302 + `Location: /auth/login`**,
  nie 401 (decyzja D2) — zarówno w teście middleware, jak i w e2e. `/api/health` też jest chroniona (D3).
- **Klient wylogowania (RTL)**: `fetch` zamockowany na krawędzi, atrapa odpowiedzi `{ ok, status }`.
  jsdom 26 pod Jest 30 nie pozwala przedefiniować `window.location` ani szpiegować
  `location.replace` („Cannot redefine property”), więc test szpieguje `replace` na obiekcie
  implementacji jsdom (symbol `impl`) — opisane w pliku; gdy jsdom to zmieni, czerwienieje zwykły test
  sukcesu. Ekran logowania wolno pokazać tylko po potwierdzonym wylogowaniu (D1) — przypadki `!ok`
  i błędu sieci są dziś `test.failing` (`known-drift.md`, „Wylogowanie”).
- **Wzorzec e2e martwej sesji**: zaloguj się, zbierz `context.cookies()`; **kontrola pozytywna** —
  te ciasteczka w świeżym `browser.newContext({ baseURL })` (baseURL jawnie) dają 200 na chronionej
  stronie z `request.get(path, { maxRedirects: 0 })`; kliknij „Wyloguj” i poczekaj na
  `POST /api/auth/logout` 200; te same ciasteczka → 302 na `/auth/login` dla strony i dla trasy API,
  a `page.goto("/")` ląduje na `/auth/login` — **każde sprawdzenie w osobnym świeżym kontekście**,
  bo pierwsza odpowiedź 302 zapisuje do słoika kontekstu ciasteczka kasujące i kolejne żądanie
  przeszłoby już bez odtworzonej sesji. Dowodem jest odpowiedź
  serwera, nie zniknięcie ciasteczka z przeglądarki. Test czerwienieje przy `signOut({ scope: "others" })`
  i przy pominięciu `signOut()` (zmierzone: krok po wylogowaniu dał 200); `scope: "local"` go **nie**
  czerwieni — GoTrue i tak unieważnia bieżącą sesję. Wylogowanie jest globalne dla konta testowego,
  więc spec nie dzieli sesji z innymi (`workers: 1`, każdy spec loguje się sam). `workers: 1` nie
  chroni jednak równoległych przebiegów na tym samym koncie (CI z różnych gałęzi, lokalne `test:e2e`
  na `integration`): ten spec może je wylogować w połowie testu. Trwała naprawa — osobne konto dla
  speca — czeka jako follow-up. Same GET — bez `Origin`.
- **Kontrola wyroczni**: dopisanie `/diary` do `PUBLIC_PATHS` czerwieniło przypadki ścieżek chronionych,
  zdjęcie `flushCookies` z przekierowania gościa — przypadek ze znacznikiem.
- **Testy referencyjne**: `tests/unit/middleware.test.ts` (74 przypadki: ścieżki z wymagania, zbiór
  z drzewa, dopasowanie dokładne, sesja, każde wyjście ze znacznikiem, defekt `ByteString` jako `it`
  + `it.failing`), `tests/unit/LogoutButton.test.tsx`, `tests/e2e/session-boundaries.spec.ts`.
- **Uruchomienie**: `npx jest tests/unit/middleware.test.ts tests/unit/LogoutButton.test.tsx`;
  e2e `npm run test:e2e -- session-boundaries` (gdy port 3000 jest zajęty: `E2E_PORT=<wolny port>`).

### 6.5 Adding a boundary / preserved-data test

- TBD — see §3 Phase 3 (wzorzec: granica limitu i o jeden dalej → 400; stan preferencji po operacji).

### 6.6 Per-rollout-phase notes

(Po każdej fazie `/10x-implement` dopisuje tu 2–3 linie o tym, co faza nauczyła.)

**§3 Phase 1 — Integralność wartości i sumy dnia** (`testing-diary-value-integrity`, 2026-10-05):

- F2 (nagłówek „na 4 porcje” mnoży wartość) nie jest naprawiony — przypięty jako cztery `test.failing`
  z wyrocznią FR-009 w `tests/unit/recipe-nutrition.test.ts` i opisany w `docs/reference/known-drift.md`.
- Ochrona przed spóźnioną wyceną (§2 #1) jest dowiedziona tylko testami interakcji
  (`tests/unit/diary-service.test.ts`), nie zachowaniem — bez stanowej atrapy ani prawdziwej bazy
  ryzyko pozostaje częściowo otwarte.
- „N oczekuje” rozstrzygnięte na korzyść obecnego tekstu: „Bez policzonych kalorii: N z M. Suma ich
  nie obejmuje.” spełnia FR-011 i jest przypięty w `tests/unit/DiaryDaySummary.test.tsx`.

**§3 Phase 2 — Granice sesji i dostępu** (`testing-session-and-access-boundaries`, 2026-10-06):

- §2 #4 pozostaje **częściowo otwarte**: dowiedziona jest tylko obrona w kodzie (cudzy przepis przy
  tworzeniu wpisu, stan wiersza przy DELETE przepisu). Izolacja RLS dwoma kontami nie ma automatycznego
  dowodu — drugiego konta e2e nie ma (D4), wzorzec opisany w §6.3 jako „Nie wdrożone”.
- Trzy defekty przypięte `test.failing` i opisane w `docs/reference/known-drift.md`, bez naprawy:
  wyjątek przy wymianie kodu weryfikacji daje 500 zamiast 302 (niezakodowany `Location`, „Middleware”),
  DELETE cudzego albo nieistniejącego przepisu zgłasza 200 („Własność rekordów”), klient wylogowania
  przekierowuje mimo `!ok` i błędu sieci („Wylogowanie”).
- Runtime e2e na prawdziwym Supabase: po `signOut()` access token sprzed wylogowania **jest odrzucany**
  (strona i API → 302 na `/auth/login`), więc §2 #3 po stronie serwera jest dowiedzione; pełne
  `npm run test:e2e` lokalnie 13/13. Przebieg nowego speca w jobie `e2e-tests` w CI czeka na push.

## 7. What We Deliberately Don't Test

- **Zrzuty ekranu UI** — tokeny i lint (`uiTokensConfig`) już pilnują literałów, a zrzuty pękają
  przy każdej zmianie. Wróć do tematu, jeśli regresja wizualna przejdzie przez lint. (Source: Phase 2 interview Q5.)
- **Wygenerowane typy Supabase** — generator jest testem; bramką jest `npm run typecheck`.
  (Source: Phase 2 interview Q5.)
- **Jakość odpowiedzi modelu** — smak przepisu i trafność kalorii to sprawa użytkownika, model jest
  darmowy. Testujemy, co aplikacja robi z odpowiedzią (§2 #2), nie jej treść. (Source: Phase 2 interview Q5.)
- **Brak limitu wywołań modelu** — zabezpieczenia nie ma w kodzie, więc test nie miałby czego
  sprawdzić; to przyjęty dług z `docs/reference/known-drift.md` i sprawa obserwowalności. Wróć,
  gdy limit zostanie dodany albo wzrośnie liczba użytkowników. (Source: challenger pass.)
- **Dowody RLS w SQL** — `supabase/` poza zakresem tego planu z decyzji użytkownika; izolację
  broni §3 Phase 2 na poziomie aplikacji. (Source: Phase 1 scope decision.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-10-05
- Stack versions last verified: 2026-10-05
- AI-native tool references last verified: 2026-10-05

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
