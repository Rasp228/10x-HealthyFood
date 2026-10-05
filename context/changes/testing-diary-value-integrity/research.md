---
date: 2026-10-05T15:09:20+02:00
researcher: Claude (10x-research) dla Rasp228
git_commit: 795f57cbfcd734ab592a83600819f2e6c1108ad3
branch: master
repository: Rasp228/10x-HealthyFood
topic: "Faza 1 test-planu: integralność wartości i sumy dnia (ryzyka #1, #2) — stan kodu, testów i wyroczni"
tags: [research, testing, diary, diary-totals, recipe-nutrition, calorie-estimation, openrouter, ai-service]
status: complete
last_updated: 2026-10-05
last_updated_by: Claude (10x-research)
---

# Research: integralność wartości i sumy dnia (test-plan, faza 1)

**Date**: 2026-10-05T15:09:20+02:00
**Researcher**: Claude (10x-research)
**Git Commit**: 795f57cbfcd734ab592a83600819f2e6c1108ad3 (drzewo robocze z niezacommitowanym `context/`; kod `src/` i `tests/` zgodny z HEAD)
**Branch**: master
**Repository**: Rasp228/10x-HealthyFood

Nic nie zostało uruchomione — wszystkie ustalenia pochodzą z lektury kodu, testów, PRD i archiwum.
Odwołania są lokalne (`plik:linia`), bo dokument powstał na drzewie z niezacommitowanymi zmianami.

## Research Question

Dla fazy 1 z `context/foundation/test-plan.md` §3 (ryzyka §2 #1 i #2): gdzie dziś w kodzie żyją
zachowania, które mają udowodnić testy z `change.md` (suma dnia i adnotacja „N oczekuje”, nagłówek
z kilkoma porcjami, spóźniona wycena, zła odpowiedź modelu, ścieżka ręczna, generowanie przepisu),
co już pokrywają istniejące testy, czy ich wyrocznie są niezależne od kodu, gdzie jest najniższy
szew do mockowania krawędzi HTTP, i jakie rozjazdy między PRD a kodem musi rozstrzygnąć `/10x-plan`.

## Summary

1. **Trzy z intencji `change.md` opisują zachowanie, którego kod dziś nie ma** — test pisany
   z wyroczni PRD będzie czerwony, więc plan musi zdecydować, czy faza naprawia kod, czy tylko
   dokumentuje lukę (`it.failing`/`known-drift`):
   - **Adnotacja „N oczekuje” nie istnieje.** `summarizeDay` zwraca jeden licznik `missingCount`
     dla każdego wpisu z `calories === null` (`src/lib/utils/diary-totals.ts:19-37`), a widok mówi
     „Bez policzonych kalorii: N z M. Suma ich nie obejmuje.” (`src/components/diary/DiaryDaySummary.tsx:34-37`).
     PRD FR-011 (`context/foundation/prd.md:164`) i US-01 (`prd.md:101`) wymagają wskazania wpisów
     *wciąż liczonych*. Wymóg „suma niepełna mówi, że jest niepełna” (`prd.md:208`) jest spełniony;
     rozróżnienie oczekujący / niepoliczony — nie. W `src/` jedyne trafienie „oczekuj” to komentarz
     w `DiaryEntryForm.tsx:58`.
   - **F2 (CRITICAL, SKIPPED) wciąż jest w kodzie.** Nagłówek przechodzi, gdy linia zawiera znacznik
     bloku i podciąg `porcj`/`serving`/`portion` (`src/lib/utils/recipe-nutrition.ts:30,40,92-99`),
     więc „Wartości odżywcze na 4 porcje:” / „dla 4 porcji” / „(całość, 4 porcje)” są czytane jako
     wartość na jedną porcję. Reprodukcja z przeglądu: przy `portions = 1` wpis dostaje 2000 zamiast
     500 z etykietą „z przepisu” (`context/archive/2026-09-25-recipe-entry-with-portions/reviews/impl-review.md:81-108`).
     Łamie to FR-009 (`prd.md:155-157`: mnożenie tylko gdy figury deklarują *jedną* porcję).
   - **Generowanie przepisu przy złej odpowiedzi zwraca 200 ze śmieciowym przepisem**, a przy awarii
     dostawcy — ogólne 500 (szczegóły w §Ryzyko #2.5).
2. **Ochrona przed spóźnioną wyceną istnieje w kodzie, ale nie jest dowiedziona testem.**
   `applyEstimate` zapisuje tylko przy `calories IS NULL` **i** zgodnym `estimation_requested_at`
   (`src/lib/services/diary.service.ts:241-251`). Testy sprawdzają, że filtry zostały *wywołane*
   (`tests/unit/diary-service.test.ts:500,529,558`), a lokalna atrapa Supabase zwraca odpowiedzi
   z kolejki niezależnie od filtrów (`diary-service.test.ts:54-91`) — test przeszedłby też przy
   filtrze, który niczego nie filtruje.
3. **Ścieżka zła odpowiedź modelu → wycena kalorii jest w dużej mierze dobrze broniona i dobrze
   pokryta na poziomie serwisu** (`tests/unit/calorie-estimation.service.test.ts:156-265`):
   tekst, ujemne, >5000, brak pola, nieparsowalne → `null` → trasa 200 bez zapisu; awaria dostawcy
   → 502 `AI_UNAVAILABLE`. Czytając kod, awaria modelu w trasie wyceny nie kończy się 500
   (`src/pages/api/diary-entries/[id]/estimate.ts:128-144`). Luki są na trasie (502 tylko na gałęzi
   przepisowej przetestowane) i w warstwie `OpenRouterService`, której nie dotyka żaden test.
4. **Najniższy działający szew mockowania to moduł `@/lib/api/openrouter.service`** (`sendMessage`),
   nie HTTP. Prawdziwą krawędzią jest instancja `axios.create` (`src/lib/api/openrouter.service.ts:66-81`),
   ale import tego modułu w ts-jest pada na `import.meta.env` (`openrouter.service.ts:43`;
   udokumentowane w `src/lib/services/calorie-estimation.service.ts:67-75` i
   `tests/unit/calorie-estimation.service.test.ts:11-13`). Żeby test „mock tylko na krawędzi HTTP”
   z test-planu §2 był możliwy, plan musi najpierw usunąć tę przeszkodę.
5. **Znaleziony przy okazji defekt warstwy HTTP (z lektury, nieuruchomiony):** interceptor zamienia
   każdy błąd axios na `OpenRouterError` bez `.response` (`openrouter.service.ts:78-81,259-262`),
   więc `isRetryableError` widzi „brak odpowiedzi” i ponawia każdy błąd, także 401/429
   (`:206-208`), a po wyczerpaniu prób `mapErrorToCustomError` zwraca `NetworkError` (`:195-196,227-228`).
   Dla wyceny kalorii (`retries: 1`) nieszkodliwe — trasa sprawdza tylko `instanceof OpenRouterError`.

## Detailed Findings

### Ryzyko #1.1 — suma dnia i adnotacja o brakach

- Liczona wyłącznie na kliencie w `summarizeDay` (`src/lib/utils/diary-totals.ts:19-37`); jedyny
  konsument to `DiaryDaySummary.tsx:23` (grep `summarizeDay` w `src/`). Decyzja „suma na kliencie”:
  `context/archive/2026-09-23-manual-diary-entry/plan.md:139-140`.
- Reguła w kodzie: `calories === null` → `missingCount += 1`, pominięty; każda inna wartość (także
  `0`) dodana. Bez zaokrąglania — kolumna `integer` (`supabase/migrations/20260922140906_create_diary_entries.sql:39`);
  zaokrągla się wcześniej (`recipe-nutrition.ts:243`, `estimate.ts:124`, `calorie-estimation.service.ts:223`).
- Stan pojedynczego wpisu (`valued`/`estimating`/`stale`/`idle`, okno 60 s) liczy
  `resolveEstimationState` (`src/lib/utils/diary-estimation.ts:8,62-78`), ale nie trafia on do
  podsumowania dnia.
- Testy: `tests/unit/diary-totals.test.ts:25-99` — pusty dzień, wszystkie z wartością (450+320+0=770),
  mieszany (570, braki 2), żaden z wartością. **Wyrocznie to niezależne literały.** Fixture ma tylko
  `calorie_origin` `manual`/`null` i zawsze `estimation_requested_at: null` (`:9-23`).
- Luki: dzień mieszany z `recipe_nutrition` + `ai_*` + świeżym znacznikiem (estimating) + `stale`;
  test komponentu `DiaryDaySummary` (tekst sumy, przełączanie `diary-day-missing`/`diary-day-count`);
  E2E sprawdza tylko przyrosty (`tests/e2e/diary-entry.spec.ts:129-157,173-198,253`).

### Ryzyko #1.2 — parser bloku odżywczego i porcje

- Nagłówek: `isSelfDeclaringHeader` (`recipe-nutrition.ts:92-99`) — po normalizacji (`:81-86`)
  `includes` znacznika z `NUTRITION_MARKERS` (`:30`) **i** z `PORTION_MARKERS` (`:40`). Brak
  odrzucenia liczby ≠ 1 przed słowem o porcji i brak słów „całość/łącznie/razem/total” w regule
  nagłówka (sam „(całość)” bez słowa porcji jest odrzucany — test `recipe-nutrition.test.ts:44`).
- Blok: od nagłówka do pustej linii, nagłówka kolejnej sekcji albo 10 linii (`:63,110-114,167-184`);
  dwa przebiegi — etykieta, potem kotwica `kcal` (fix F1, `:205-221`; regresja `recipe-nutrition.test.ts:137-144`).
- Skalowanie: `resolveRecipeCalories` → `Math.round(perPortion * portions)`, poza 0–5000 →
  `total: null`, `reason: "out_of_range"` (`:71-72,236-250`). Nigdy nie dzieli.
- Ten sam parser działa w trzech miejscach: tworzenie wpisu (`diary.service.ts:100-105`),
  `recalculate` w PATCH (`diary.service.ts:338-345`), podgląd formularza (`DiaryEntryForm.tsx:265`).
- Testy: `recipe-nutrition.test.ts` (nagłówki akceptowane `:14-36`, odrzucane `:40-54`, skalowanie
  `:242-304`: 250×3=750, 333×0,5=167, 1000×5=5000, 900×6→out_of_range) — literały, zgodne
  z wyrocznią planu (`context/archive/2026-09-25-recipe-entry-with-portions/plan.md:281-282`).
  `diary-service.test.ts:255-311`: 250×2=500, 250×99→null na payloadzie `insert`.
  `diary-portions.test.ts` sprawdza tylko odmianę słowa „porcja”.
- **Luka główna: żaden test nie dotyka F2.** Dalej: nagłówek mieszany, spójność podgląd ↔ zapis.
- Wnioskowanie, nieodtworzone: „Nutrition per 4 servings” też przejdzie bramkę (`serving` w `:40`).

### Ryzyko #1.3 — świeżość wyceny (spóźniony wynik AI vs wartość użytkownika)

- `markEstimationRequested` (`diary.service.ts:177-203`): warunkowy UPDATE znacznika z
  `.is("calories", null)`; trasa przy wpisie z wartością zwraca 200 bez modelu (`estimate.ts:76-78`).
- `applyEstimate` (`diary.service.ts:230-264`): `requestedAt === null` → bez zapisu (`:237-239`);
  UPDATE z `.is("calories", null)` (`:250`) i `.eq("estimation_requested_at", requestedAt)` (`:251`,
  fix F1 z `context/archive/2026-09-29-edit-and-delete-entry/reviews/impl-review.md:33-50`);
  brak trafienia → świeży odczyt (`:261-262`). Trasa przekazuje znacznik z kroku stemplowania
  (`estimate.ts:168`).
- `updateEntry` (`diary.service.ts:293-380`): `calories: N` → `manual`, znacznik nietknięty
  (`:350-353`, ochronę daje `.is("calories", null)` w `applyEstimate`); `calories: null`
  i `recalculate` zerują znacznik (`:317-320,346-349`); zmiana treści/ilości/porcji wpisu bez wartości
  zeruje znacznik (`:358-363`).
- Testy: `diary-service.test.ts:414-486` (mark), `:488-610` (apply), `:637-668` (zerowanie znacznika);
  `diary-estimate-route.test.ts:184-193` (przekazanie znacznika). **Charakter: testy interakcji** —
  asercje `toHaveBeenCalledWith("calories", null)` itd.; atrapa `createSupabaseStub`
  (`diary-service.test.ts:54-91`) nie interpretuje filtrów, a wynik „ręczna liczba wygrywa”
  (`:551-561`) jest zaskryptowany kolejką odpowiedzi. W testach trasy wszystkie metody `DiaryService`
  są podmienione `spyOn` (`diary-estimate-route.test.ts:38-41,79-89`).
- Luki: wyścig jako scenariusz z asercją na końcowym wierszu (stempel → PATCH `calories: N` →
  spóźniony `applyEstimate`); dwa zlecenia, starsze wraca później; „Zapisz i przelicz” w trakcie
  wyceny. Do tego potrzebna atrapa, która **egzekwuje** `.eq/.is` na rekordach w pamięci, albo
  prawdziwa baza — dziś nie ma ani jednej (jedyny dowód na bazie: `supabase/checks/diary-entries-rls.sql`,
  RLS, nie warunkowe zapisy; `supabase/` jest poza zakresem test-planu §7).
- Ryzyko szczątkowe (niezweryfikowane): równość `timestamptz` w `.eq` — znacznik wraca z bazy,
  więc format się zgadza, ale nic tego nie sprawdza na prawdziwym Postgresie.
- **F3 z `context/archive/2026-09-23-ai-estimate-for-free-text/reviews/impl-review.md:104-133`
  (SKIPPED) wciąż obecny w UI:** niezapisana liczba wpisywana w pole kolejkowanego wpisu znika,
  gdy wróci wycena (`src/components/diary/DiaryEntryCalories.tsx:67-80`, klucz `seededFrom !== entry.calories`).
  Do bazy nic złego nie trafia.

### Ryzyko #1.4 — kaskada pochodzenia

- Tworzenie (`diary.service.ts:94-105`): liczba użytkownika → `manual`; przepis + porcje + `total`
  z parsera → `recipe_nutrition`; inaczej oba `null`. Edycja (`:317-353`): `manual` / `recipe_nutrition`
  / `null`. Wycena (`estimate.ts:98`): `ai_from_recipe` przy czytelnej treści własnego przepisu,
  inaczej `ai_from_description`; sierota wysyła `formatPortions` jako ilość bez mnożenia (`estimate.ts:107`).
  Baza wiąże `calories` ↔ `calorie_origin` (`migracja:55`); klient nie podaje pochodzenia
  (`src/lib/validations/diary/create-entry.ts:83`, `update-entry.ts:34`).
- Testy na payloadzie (literały): `diary-service.test.ts:154-198,255-327,514-549,669-790`;
  gałęzie trasy: `diary-estimate-route.test.ts:195-265`.
- **Tautologia:** `tests/unit/diary-entry-route.test.ts:91-97` — atrapa `updateEntry` sama wpisuje
  `"manual"` (`:61-66`), więc asercja na `calorie_origin` sprawdza atrapę.
- Luka: kaskada jednego wpisu przez kolejne źródła; `out_of_range` z przepisu → ścieżka `ai_from_recipe`.

### Ryzyko #2.1 — granica HTTP z dostawcą

- Jedyny klient HTTP: `axios.create({ baseURL, timeout })` + interceptor (`openrouter.service.ts:66-81`),
  `httpClient.post("/chat/completions")` w pętli ponowień (`:171-192`). Bez `fetch` po stronie serwera.
- Oba serwisy budują `OpenRouterService` same, bez wstrzykiwania: `calorie-estimation.service.ts:57-97,121-123`,
  `ai.service.ts:26-28`.
- Szwy: (a) `jest.mock("axios")` z fałszywym `create()` / nock — zablokowane przez `import.meta.env`
  (`openrouter.service.ts:43`, `ai.service.ts:27`) w ts-jest; (b) moduł `openrouter.service`
  (`sendMessage`) — działa, używa go `calorie-estimation.service.test.ts:15-17,66`. `AIService`
  nie da się dziś zaimportować w Jest bez obejścia `import.meta`.
- Defekt interceptora — patrz Summary pkt 5. Konsekwencja dla `AIService` (domyślne `retries: 2`,
  `openrouter.service.ts:63`): 401/429 ponawiane i raportowane jako `NetworkError`.

### Ryzyko #2.2 — parsowanie odpowiedzi wyceny i łańcuch timeoutów

- `extractCalories` (`calorie-estimation.service.ts:185-230`): pusta/nie-string → `null`; najpierw
  blok ```json, potem **ostatni** `{…}` (regex nie-zachłanny); `JSON.parse` w try → `null`; brak pola
  → `null`; nie-skończona liczba (np. `"420"`) → `null`; `Math.round`, potem 0–5000 (`:6-7,223-227`).
- Przypadki z lektury: `5000.4` → 5000, `5000.6` → `null`, `1e3` w JSON → 1000 (nieprzetestowane),
  `{"calories":500,"note":"{x}"}` → regex ucina obiekt, parse pada → `null`.
- Brak kontroli wiarygodności poza zakresem 0–5000 (PRD nie podaje liczby; zakres pochodzi z
  `context/archive/2026-09-23-manual-diary-entry/plan.md:217-224`).
- Timeouty: klient wyceny `timeout: 55_000`, `retries: 1` = jedna próba (`calorie-estimation.service.ts:82,87`);
  platforma `maxDuration: 60` (`astro.config.mjs:36`); przeglądarka abort 65 s i okno „liczę” 60 s
  (`diary-estimation.ts:8,17`, `useCalorieEstimation.ts:92`). Łańcuch zgodny z
  `context/archive/2026-09-23-ai-estimate-for-free-text/plan.md:419`.

### Ryzyko #2.3 — trasa wyceny

- Kolejność: stempel przed modelem (`estimate.ts:63-65`); `OpenRouterError` → 502
  `{error:"Usługa AI jest chwilowo niedostępna", code:"AI_UNAVAILABLE"}`, wiersz ze znacznikiem i bez
  wartości (`:128-142`); inny błąd → rethrow → 500 ze stałym ciałem (`:144,178-186`); `null` → 200
  ze świeżym odczytem wiersza (`:153-163`, fix F4); iloczyn przepisowy poza 0–5000 → `null` (`:124-126`).
- Czy awaria modelu kończy się 500? Z lektury — nie: `sendMessage` opakowuje błędy w `OpenRouterError`
  (`openrouter.service.ts:146-154`), brak klucza też (`calorie-estimation.service.ts:89-96`),
  `extractCalories` nie rzuca. Pozostaje ubicie funkcji przez platformę po 60 s (strona błędu Vercel,
  nie 502), gdy narzut przed wywołaniem przekroczy ~5 s (`estimate.ts:77-81`, komentarz). Błędy bazy → 500.
- Testy (`diary-estimate-route.test.ts`): >5000 nie dochodzi do zapisu (`:156-170`), `null` → 200 bez
  zapisu (`:172-181`), **502 tylko na gałęzi przepisowej** (`:267-281`). Mock: cały
  `CalorieEstimationService` przez `jest.mock` (`:22-24`).
- Luki: 502 na gałęzi opisowej; nie-`OpenRouterError` → 500 bez wycieku treści; błąd
  `markEstimationRequested` → 500; asercja stanu wiersza po 502 (dziś tylko „`applyEstimate` nie wywołany”).

### Ryzyko #2.4 — ścieżka ręczna

- Serwer: niezależna od AI — `POST`/`PATCH` z `calories: N` ustawia `manual` (`diary.service.ts:95,350-352`);
  trasy `src/pages/api/diary-entries/index.ts` i `[id].ts` nie importują nic z AI.
- UI: pole kalorii jest zablokowane, dopóki leci zlecenie wyceny danego wpisu (`DiaryEntryCalories.tsx:83,146,158`),
  z przyciskiem anulowania (`:82`); wiersz zablokowany w `DiaryEntryList.tsx:62`. PRD FR-004 mówi
  „at any time” (`prd.md:138-139`) — blokada do ~55–65 s z możliwością anulowania to napięcie do
  świadomej oceny w planie, nie oczywisty defekt.
- Testy: ręczny PATCH w `diary-entry-route.test.ts:91-96` (tautologiczny, patrz #1.4). Brak testu
  „ręczna wartość działa na wierszu po nieudanej wycenie (znacznik, brak wartości)”.

### Ryzyko #2.5 — generowanie przepisu (`/api/ai/*`)

- Pusta treść → przepis „Błąd generowania” zwracany jako sukces (`src/lib/services/ai.service.ts:306-311`);
  wyjątek parsowania → to samo (`:359-366`); odpowiedź nie-JSON → `fallbackTextParsing` robi przepis
  z dowolnego tekstu (`:357-358,392-481`); nie-zachłanny regex (`:374-383`) ucina JSON na pierwszym `}`.
- `save-recipe.ts` zapisze taki przepis — sprawdza tylko długości `title`/`content` (`src/pages/api/ai/save-recipe.ts:9-21,160`).
- Awaria/timeout dostawcy: `generateRecipe`/`modifyRecipe` łapią wszystko i zwracają `null`
  (`ai.service.ts:159-162,291-294`) → trasy 500 „Nie udało się wygenerować/zmodyfikować przepisu”
  (`generate-recipe.ts:58-67`, `modify-recipe.ts:86-92`), bez 502. Brak klucza → `Error` z konstruktora
  → zewnętrzny catch → 500 z `details` = komunikat błędu (`generate-recipe.ts:77-89`). Nie-JSON body
  żądania → 500 (`generate-recipe.ts:34`, `modify-recipe.ts:32`).
- Budżet czasu: domyślnie 60 s × 2 próby (`openrouter.service.ts:62-63`) wobec `maxDuration: 60` —
  platforma może ubić funkcję, zanim powstanie czytelny błąd. Klient: abort 60 s, ponawia przy 5xx/`AI_TIMEOUT`
  (`src/hooks/ai/useAI.ts:34,59-65,88-114`).
- Testy: **brak** — grep `tests/` po `ai`/`openrouter` trafia tylko w dwa pliki wyceny kalorii;
  e2e celowo nie klika „Policz kalorie” (`tests/e2e/diary-entry.spec.ts:160-161,309-310`).

## Code References

- `src/lib/utils/diary-totals.ts:19-37` — `summarizeDay`, jeden licznik braków
- `src/components/diary/DiaryDaySummary.tsx:23,34-37` — jedyny konsument, tekst adnotacji
- `src/lib/utils/diary-estimation.ts:8,17,62-78` — stan wpisu, okno 60 s, abort 65 s
- `src/lib/utils/recipe-nutrition.ts:30,40,92-99,236-250` — markery, reguła nagłówka (F2), skalowanie
- `src/lib/services/diary.service.ts:94-105,177-203,230-264,293-380` — kaskada, stempel, warunkowy zapis, edycja
- `src/pages/api/diary-entries/[id]/estimate.ts:63-78,118-186` — trasa wyceny i mapowanie błędów
- `src/lib/services/calorie-estimation.service.ts:6-7,57-97,185-230` — zakres, konfiguracja klienta, `extractCalories`
- `src/lib/api/openrouter.service.ts:43,62-81,171-232,259-262` — axios, interceptor, pętla ponowień
- `src/lib/services/ai.service.ts:26-28,159-162,291-311,355-385` — generowanie przepisu, fallbacki
- `src/components/diary/DiaryEntryCalories.tsx:67-83` — F3 i blokada pola
- `tests/unit/diary-service.test.ts:54-91` — atrapa Supabase bez semantyki filtrów
- `tests/unit/calorie-estimation.service.test.ts:11-17` — szew mocka i powód (`import.meta`)
- `tests/unit/diary-entry-route.test.ts:61-66,91-97` — tautologia `manual`

## Architecture Insights

- Wzorzec mocków w dzienniku: testy serwisu — lokalna atrapa `createSupabaseStub` z kolejką odpowiedzi;
  testy tras — `jest.spyOn(DiaryService.prototype, …)` + `jest.mock` serwisu wyceny; środowisko
  `@jest-environment node` dla kodu serwerowego (`tests/setup/jest.setup.ts:17-22`). Wspólny
  `tests/mocks/supabase.mock.ts` (płaski `mockReturnThis`) używa tylko `user-settings-service.test.ts`.
- `jest.setup.ts` nie mockuje ani `fetch`, ani axios; MSW nie ma (test-plan §4).
- Stałe zakresu 0–5000 są zdublowane: `calorie-estimation.service.ts:6-7`, `estimate.ts` (`MIN/MAX_TOTAL_CALORIES`),
  `recipe-nutrition.ts:71-72`, `caloriesValueSchema`, check w migracji.

## Historical Context (from prior changes)

Każde twierdzenie historyczne z osobnym werdyktem względem obecnego kodu:

- `2026-09-25-recipe-entry-with-portions/reviews/impl-review.md:46-79` F1 (CRITICAL, FIXED) — **potwierdzone**: dwa przebiegi w `recipe-nutrition.ts:205-221` + test.
- tamże `:81-108` F2 (CRITICAL, SKIPPED) — **potwierdzone, wciąż obecne** (`recipe-nutrition.ts:40,92-99` bez zmian).
- tamże `:110-143` F3 (sierota) — **potwierdzone**, opisane w `docs/reference/known-drift.md`.
- `2026-09-23-ai-estimate-for-free-text/reviews/impl-review.md:44-68` F1 (klient 55 s) — **potwierdzone** (`calorie-estimation.service.ts:82`).
- tamże `:70-102` F2 (brak limitu, ACCEPTED) — **potwierdzone**; poza fazą wg test-planu §7.
- tamże `:104-133` F3 (szkic nadpisany, SKIPPED) — **potwierdzone, wciąż obecne** (`DiaryEntryCalories.tsx:67-80`).
- tamże `:135-158` F4 (świeży odczyt po `null`) — **potwierdzone** (`estimate.ts:153-163`).
- `2026-09-29-edit-and-delete-entry/reviews/impl-review.md:33-50` F1 (spóźniona wycena, Fix A) — **potwierdzone w kodzie** (`diary.service.ts:251`), **niedowiedzione testem zachowania**.
- `2026-09-25-ai-estimate-from-recipe/reviews/impl-review.md:34-51` F1 (sierota ignoruje porcje) — **częściowo nieaktualne**: od S-05 sierota wysyła `formatPortions` jako ilość (`estimate.ts:107`), zgodnie z `2026-09-29-edit-and-delete-entry/plan.md:64-65`.
- `2026-09-23-ai-estimate-for-free-text/plan.md:290-295` (`null` = normalna odpowiedź, 200; awaria dostawcy 502) — **potwierdzone**.
- tamże `:291` vs `:690` (ułamek „nie do zaokrąglenia” vs „zaimplementowana reguła”) — kod **zaokrągla** (`calorie-estimation.service.ts:223`); `:291` nie opisuje kodu.

## Related Research

- `context/archive/*/research.md` dla slice'ów S-01…S-05 — nie czytane ponownie; potrzebne fakty pobrano z planów i przeglądów.

## Open Questions

Decyzje dla `/10x-plan` (nie luki dowodowe):

1. **„N oczekuje”**: dodać rozróżnienie oczekujący/niepoliczony w podsumowaniu dnia (zmiana zachowania, wyrocznia PRD FR-011/US-01), czy uznać obecne „Bez policzonych kalorii: N z M” za wystarczające i skorygować intencję w `change.md`?
2. **F2**: naprawić regułę nagłówka (np. odrzucić liczbę ≠ 1 przy słowie porcji i słowa całość/łącznie/total) z testem regresyjnym, czy zapisać test jako oczekiwanie porażki i zostawić jako znany dług? PRD FR-009 rozstrzyga kierunek naprawy.
3. **Wyścig wyceny**: stanowa atrapa w pamięci egzekwująca `.eq/.is` (tania, mieści się w unit+integration) czy test na prawdziwej bazie (poza zakresem §7)? Bez jednego z nich ryzyko #1 „spóźniona wycena” nie ma dowodu zachowania.
4. **Szew HTTP**: czy faza usuwa blokadę `import.meta.env` w `OpenRouterService` (np. wstrzyknięcie konfiguracji/klienta), żeby mock siedział na axios, czy akceptuje mock modułu `openrouter.service` jako „krawędź”? Od tego zależy, czy da się przetestować defekt interceptora i `/api/ai/*`.
5. **`/api/ai/*`**: test-plan §2 #2 wymaga „czytelny błąd, nie 500 i nie śmieciowy przepis” — kod dziś daje oba. Czy faza naprawia `ai.service.ts`/trasy (502/422 zamiast 500, brak przepisu „Błąd generowania” z 200), czy tylko pinuje obecne zachowanie i zgłasza dług?
6. **F3 i blokada pola przy wycenie** — w zakresie fazy (test komponentu RTL), czy poza nim?
