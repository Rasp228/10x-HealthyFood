# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-10-05

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
| 3 | Po „Wyloguj” sesja trwa dalej; logowanie lub rejestracja przekierowuje w złe miejsce; pomyłka w liście ścieżek publicznych otwiera chronioną stronę albo blokuje publiczną | High | High | wywiad Q2, Q4; `context/foundation/lessons.md` (zapis ciasteczek sesji już raz kosztował poprawkę); PRD FR-016; hot-spot dir `src/pages/api/auth` — 10 zmian/30d |
| 4 | Nadużycie: użytkownik czyta, edytuje albo usuwa cudze wpisy dziennika, cel albo preferencje (IDOR, ominięcie izolacji per-użytkownik) | High | Medium | wywiad Q1; PRD „Access Control Changes” (dane prywatne per użytkownik); archive `2026-09-22-diary-entry-store` i `2026-09-29-edit-and-delete-entry` (dowody RLS przepisane i nieuruchomione ponownie; izolacja sprawdzana wyłącznie ręcznie, poza CI) |
| 5 | Preferencje albo przepisy użytkownika zostają usunięte lub uszkodzone przez działanie w profilu albo w dzienniku — jedyna nieodwracalna awaria | High | Low | wywiad Q4; PRD Guardrails, FR-014, FR-015, „Constraints & Compatibility” (przepisy tylko czytane, jeden zapis do profilu); `docs/reference/known-drift.md` (trasy preferencji sprzed konwencji); profil bazy testów (zero testów dla preferencji) |
| 6 | Nadużycie / niezaufane wejście: wartość ponad twardy limit (długość tekstu, kalorie, porcje, cel 500–10000, fraza wyszukiwania, data z przyszłości) przechodzi przez klienta lub trasę i kończy się 500 z bazy, obcięciem albo zepsutym widokiem | Medium | Medium | wywiad Q1; `docs/reference/contract-surfaces.md` (zakres celu zdublowany w bazie i walidacji); archive `2026-09-23-manual-diary-entry` (data z przyszłości blokowana tylko w przeglądarce; notacja `1e3`), `2026-10-02-recipe-search-escape`; hot-spot dir `src/lib/validations` — 14 zmian/30d |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | Dla znanego zestawu wpisów (wartości ręczne, z przepisu, oczekujące, niepoliczone) suma dnia i adnotacja „N oczekuje” są zgodne z regułą z PRD; nagłówek deklarujący kilka porcji nie mnoży wartości; spóźniona wycena nie nadpisuje wartości zmienionej po zleceniu | „Wartość ma etykietę pochodzenia, więc jest poprawna” | gdzie liczona jest suma i adnotacja, kaskada pochodzenia, znacznik świeżości wyceny, rozpoznawanie nagłówka bloku odżywczego | unit (suma, parser) + integracja trasy (wyścig wyceny) | oczekiwana suma liczona tym samym kodem co produkcja (problem wyroczni) |
| #2 | Odpowiedź modelu bez liczby, z liczbą poza rozsądnym zakresem albo przekroczenie czasu nie zapisuje wartości; wpis zostaje „niepoliczony”, a ręczna wartość dalej się zapisuje; generowanie przepisu przy złej odpowiedzi zwraca czytelny błąd, nie 500 i nie śmieciowy przepis | „Status 200 od dostawcy oznacza poprawną wartość” | granica HTTP z dostawcą modelu, parsowanie i walidacja odpowiedzi, tłumaczenie błędów na odpowiedź trasy, łańcuch timeoutów | integracja trasy z mockiem wyłącznie na krawędzi HTTP | mockowanie wewnętrznych serwisów zamiast krawędzi; tylko happy path |
| #3 | Po wylogowaniu żądanie do chronionej strony i trasy API przekierowuje na login; każda chroniona ścieżka bez sesji przekierowuje; każda publiczna działa bez sesji; logowanie i rejestracja lądują tam, gdzie mówi przepływ | „Ciasteczko zniknęło w przeglądarce, więc sesja się skończyła” | każde wyjście z middleware, czyszczenie ciasteczek przy wylogowaniu, mapa przekierowań auth, dokładne dopasowanie ścieżek publicznych | integracja middleware + wąskie e2e tylko dla wylogowania i logowania | asercja na zawartości listy ścieżek zamiast na zachowaniu żądania |
| #4 | Użytkownik B dostaje 404 albo pustą listę dla zasobu użytkownika A przy GET, PATCH, DELETE i POST z obcym identyfikatorem | „Zalogowany oznacza uprawniony do tego rekordu” | czy własność sprawdza trasa, polityka bazy, czy oba; jak zapisy ustalają `user_id` | integracja trasy z dwoma podmiotami | test z jednym użytkownikiem, który nigdy nie sprawdza izolacji |
| #5 | Zapis i zmiana celu dziennego oraz operacje na dzienniku zostawiają preferencje i przepisy bez zmian; usunięcie jednej preferencji nie rusza innych | „Inna tabela, więc nic się nie może stać” | wszystkie ścieżki zapisu dotykające profilu i przepisów; zachowanie usunięcia przepisu wobec wpisów | integracja | asercja tylko na odpowiedzi HTTP bez sprawdzenia stanu po operacji |
| #6 | Wartości na granicy limitu przechodzą, a o jeden dalej dają 400 (nie 500), zarówno w walidacji trasy, jak i względem ograniczeń bazy; reguły pilnowane w przeglądarce mają odpowiednik na serwerze albo są świadomie opisane jako luka | „Klient blokuje, więc serwer też” | lista twardych limitów i ich duplikatów (walidacja ↔ baza ↔ UI) | unit (schematy) + integracja trasy | test tylko typowych wartości, bez granic |

## 3. Phased Rollout

Każdy wiersz to osobna faza wdrożenia, która otworzy własny folder zmiany przez `/10x-new`.
Status przesuwa się od lewej do prawej przez wartości poniżej; orkiestrator aktualizuje go,
gdy artefakty pojawiają się na dysku.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Integralność wartości i sumy dnia | Udowodnić, że suma dnia i wartości kalorii są prawdziwe, także gdy model zwraca śmieci albo spóźnioną odpowiedź | #1, #2 | unit + integration | change opened | testing-diary-value-integrity |
| 2 | Granice sesji i dostępu | Udowodnić, że wylogowanie kończy sesję, przekierowania i ścieżki publiczne są poprawne, a użytkownik nie dosięga cudzych rekordów | #3, #4 | integration + narrow e2e | not started | — |
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

- TBD — see §3 Phase 1 (wzorzec: suma dnia i parser bloku odżywczego z wyrocznią z PRD, nie z kodu).

### 6.2 Adding an integration test for an API route

- TBD — see §3 Phase 1 (wzorzec: zła odpowiedź modelu nie zapisuje wartości; mock tylko na krawędzi HTTP).

### 6.3 Adding an ownership / access test

- TBD — see §3 Phase 2 (wzorzec: dwa podmioty, obcy identyfikator przy każdym czasowniku).

### 6.4 Adding a middleware / session test

- TBD — see §3 Phase 2 (wzorzec: wylogowanie kończy sesję; ścieżka publiczna vs chroniona).

### 6.5 Adding a boundary / preserved-data test

- TBD — see §3 Phase 3 (wzorzec: granica limitu i o jeden dalej → 400; stan preferencji po operacji).

### 6.6 Per-rollout-phase notes

(Po każdej fazie `/10x-implement` dopisuje tu 2–3 linie o tym, co faza nauczyła.)

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
