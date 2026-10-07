# Dane chronione i twarde limity — plan wdrożenia (faza 3 test-planu)

## Overview

Faza 3 z `context/foundation/test-plan.md` §3 dowodzi dwóch rzeczy.

- **#5:** zapis celu dziennego i każda operacja w dzienniku zostawiają preferencje i przepisy
  nietknięte, a usunięcie jednej preferencji nie rusza pozostałych. Dowodem jest stan tabel po
  operacji, nie status HTTP.
- **#6:** każdy twardy limit przepuszcza wartość na granicy i odrzuca o krok dalej z 400, nie z 500.

Tam, gdzie dziś wychodzi 500, faza **naprawia** trasę. To odstępstwo od faz 1–2, które tylko
przypinały defekty: cel fazy brzmi „każdy limit kończy się 400”, a poprawki są małe.

## Current State Analysis

Pełne ugruntowanie: `context/changes/testing-protected-data-and-limits/research.md`.

- **#5.** Ścieżki celu i dziennika nie piszą do `preferences` ani `recipes`:
  - cel to jeden upsert `user_settings` (`src/lib/services/user-settings.service.ts:48-55`);
  - dziennik tylko czyta przepis (`src/lib/services/diary.service.ts:149-154`);
  - w migracjach nie ma triggerów.

  Nic tego nie pilnuje. Testy celu szpiegują metody serwisu (`tests/unit/user-settings-route.test.ts:11-13`),
  testy dziennika używają atrap jednej tabeli, a preferencje nie mają żadnego testu. Jedyne realne
  miejsce utraty preferencji to filtr DELETE (`src/pages/api/preferences/[id].ts:135`).
- **#6.** Dziennik, cel i wyszukiwanie zwracają 400 (`safeParse` + `zodIssues`). Granice schematów
  są przetestowane (`tests/unit/diary-validations.test.ts`, `tests/unit/user-settings-validations.test.ts`),
  ale na poziomie tras jest tylko po jednym ogólnym przypadku 400. 500 wychodzi w trzech obszarach:
  - preferencje: `.parse()` → 500 z JSON-em `ZodError` (`src/pages/api/preferences/index.ts:109,154-166`,
    `[id].ts:38,80-92`), do tego duplikat, `limit=51` i ciało nie-JSON;
  - `/api/recipes` POST/PUT: brak `max`, więc baza odrzuca `varchar(255)` i `char_length <= 5000`,
    a trasa zwraca 500 z `details` (`src/pages/api/recipes/index.ts:10-15,123,154-164`,
    `[id].ts:8-12,98,144-155`); ciało nie-JSON też daje 500;
  - identyfikatory: `entryIdSchema` przyjmuje każdą bezpieczną liczbę JS, a kolumny są int4
    (`src/lib/validations/diary/update-entry.ts:18-22`). `parseInt` w trasach preferencji i przepisów
    nie ma sufitu i przyjmuje `"12abc"` jako 12.
- **Przyszła data** jest blokowana tylko w przeglądarce. To świadoma decyzja z
  `context/archive/2026-09-23-manual-diary-entry/plan-brief.md:89-93`.
- **`1e3`** nie istnieje na granicy API (JSON `1e3` = 1000). Ochrona to `parseCalories` i
  `parsePortions`, które nie mają testów.

## Desired End State

- Wspólna stanowa atrapa wielu tabel w `tests/helpers/` dowodzi #5 na prawdziwych trasach
  i serwisach. Asercje są głęboką równością tabel `preferences` i `recipes` przed i po operacji.
- Każdy twardy limit z tabeli research §#6 ma test trasy: granica → 2xx, o krok dalej → 400
  z `details` w kształcie `ValidationIssue`, a zapis w atrapie nie nastąpił. Wyrocznią są literały
  migracji albo decyzje produktowe, nie schemat pod testem.
- Preferencje i `/api/recipes` POST/PUT nie zwracają 500 na złe wejście. Ich schematy leżą
  w `src/lib/validations/`, a 500 ma stałe ciało bez treści błędu.
- Identyfikatory ponad 2147483647 dają 400 we wszystkich trasach dziennika, preferencji i przepisów.
- Przyszła data jest przypięta testem jako 201 i opisana w `docs/reference/known-drift.md`.
- `test-plan.md` §6.5 opisuje wzorzec, a §6.6 ma notatkę fazy 3.

### Key Discoveries:

- Wzorzec stanowej atrapy do rozszerzenia: `tests/unit/recipes-route.test.ts:107-175` (§6.3).
- Wzorzec trasy z `safeParse` + `zodIssues` + `.catch(() => null)` na `request.json()`:
  `src/pages/api/user-settings/index.ts:58-69`.
- Stałe 500 bez treści błędu: `src/pages/api/diary-entries/[id].ts:94-102`.
- Zod 4 `.max(n)` liczy znaki jak `char_length` (sprawdzone w research), więc literał migracji
  można przenieść do schematu 1:1.
- `jest.config.js` **nie ma** aliasu `@tests/*` (`moduleNameMapper` ma tylko `@/`, `@components/` itd.),
  choć `AGENTS.md` twierdzi, że jest w obu plikach. Helper importuj ścieżką względną.

## What We're NOT Doing

- **Bez reguły przyszłej daty na serwerze.** Luka zostaje (decyzja z archiwum o strefie czasowej),
  tylko przypięta i opisana.
- **Bez dowodu `on delete set null` na prawdziwej bazie.** SQL jest wykluczony w test-plan §7,
  a Playwright jest poza tą fazą. Jest dowodzi tylko tego, że kod DELETE przepisu nie dotyka
  `diary_entries` ani `preferences`.
- **Bez zmian w sufitach UI.** Tytuł zostaje 100 w `RecipeFormModal` i `save-recipe`, a serwer
  `/api/recipes` przyjmuje 255. Rozjazd jest opisany.
- **Bez atomowego limitu 50 preferencji** (wyścig count → insert, spekulatywny).
- **Bez zmian tras `/api/ai/*`.** Ciało nie-JSON w `modify-recipe` i brak sufitów promptu należą
  do ryzyka #2 i `known-drift.md` „Trasy AI”.
- **Bez zmian `GET`/`POST /api/diary-entries` 500 z `details`.** To nie dotyczy limitów, bo dziennik
  na złe wejście zwraca już 400.
- **Bez naprawy D5** (DELETE cudzego przepisu → 200). Testy `test.failing` w
  `tests/unit/recipes-route.test.ts:197-207` zostają nietknięte. Zmiana parsowania `id` nie może ich
  przełączyć.
- **Bez dodawania aliasu `@tests` do `jest.config.js`.**
- Bez pisania sufitów kalorii i porcji do bazy (migracja).

## Implementation Approach

Kolejność według ryzyka: najpierw #5 (High impact), bez zmian w kodzie produkcyjnym. Potem granice
dziennika i celu, gdzie zmienia się tylko schemat identyfikatora. Na koniec naprawy tras sprzed
konwencji, po jednej trasie na fazę, i dokumentacja.

Każda poprawka produkcyjna w fazach 2–4 idzie razem z testem, który czerwienieje bez niej. To
kontrola wyroczni z §6.1: przed commitem cofnij linię poprawki, zobacz czerwień, przywróć.

Wyrocznie (literały źródłowe, nie wartości liczone kodem):

| Limit | Granica → oczekiwane | Krok dalej → oczekiwane | Źródło wyroczni |
|---|---|---|---|
| Wpis `content` | 500 znaków → 201/200 | 501 → 400 | `create_diary_entries.sql:33` |
| Wpis `amount_text` | 100 → 201 | 101 → 400 | `create_diary_entries.sql:35` |
| `calories` | 0 i 5000 → 201 | -1 i 5001 → 400 | migracja `>= 0`; decyzja produktowa 5000 (`manual-diary-entry/reviews/plan-review.md`) |
| `portions` | 99 → 201 | 99.01 i 0 → 400 | `numeric(6,2) > 0`; decyzja produktowa 99 |
| Cel | 500 i 10000 → 200 | 499 i 10001 → 400 | `create_user_settings.sql:27-28` |
| Identyfikator / `source_recipe_id` | 2147483647 → przechodzi schemat | 2147483648 → 400 | typ `serial` / `integer` = int4 |
| Preferencja `value` | 50 → 201 | 51 → 400; `"   "` → 400 | `healthymeal_schema.sql:34`; decyzja trim + 1–50 |
| Preferencje GET `limit` | 50 → 200 | 51 → 400 | schemat trasy |
| Przepis `title` | 255 → 201 | 256 → 400 | `healthymeal_schema.sql:45` |
| Przepis `content` / `additional_params` | 5000 → 201 | 5001 → 400 | `healthymeal_schema.sql:46-47` |
| Ciało nie-JSON (preferencje, przepisy) | — | → 400 | wzorzec `user-settings/index.ts:58` |
| Duplikat preferencji | — | → 409 | unikat `healthymeal_schema.sql:38` |
| Przyszła data `2999-01-01` | → 201 (przypięte obecne zachowanie) | — | decyzja z archiwum |

## Critical Implementation Details

- **Atrapa nie jest bazą.** Unikat `(user_id, category, value)` atrapa egzekwuje tylko jako
  odwzorowanie literału migracji (błąd `{ code: "23505" }`). Nie wolno jej uczyć `on delete set null`
  ani żadnego CHECK. Wtedy test dowodziłby atrapy, nie kodu.
- **Sufit identyfikatora a D5.** Po zmianie parsowania `id` w `recipes/[id].ts` zielony DELETE `10`
  przez B musi nadal zwracać 200. Dwa `test.failing` D5 muszą zostać „passed” w podsumowaniu Jest.

## Faza 1: Stanowa atrapa wielu tabel i dowód zachowania danych (#5)

### Overview

Bez zmian w kodzie produkcyjnym. Wspólny helper i jeden plik testów, które przepuszczają prawdziwe
trasy i serwisy przez atrapę czterech tabel.

### Changes Required:

#### 1. Helper atrapy

**File**: `tests/helpers/supabase-tables.ts` (nowy)

**Intent**: Stanowa atrapa klienta Supabase z wieloma tabelami. Trasy i prawdziwe serwisy wykonują
na niej swoje łańcuchy, a test porównuje stan tabel przed i po. Uogólnia atrapę z
`recipes-route.test.ts` na wiele tabel i operacji zapisu.

**Contract**:
- Fabryka przyjmuje początkowe wiersze per tabela i `userId` dla `auth.getUser`. Zwraca
  `{ supabase, tables, snapshot() }`; `snapshot()` to głęboka kopia stanu.
- Obsługuje dokładnie łańcuchy używane przez trasy objęte fazami 1–4: `select` (z `count: "exact"`),
  `insert`, `upsert` (z `onConflict`), `update`, `delete`, filtry `eq`/`is`, a do tego `order`,
  `range`, `limit`, `single`, `maybeSingle` i `then`.
- `insert` nadaje kolejne `id`. `upsert` scala po kolumnie `onConflict`. `update` i `delete` działają
  tylko na wierszach spełniających **każdy** filtr. `single()` przy zerze trafień zwraca błąd
  `{ code: "PGRST116" }`.
- Opcjonalna deklaracja unikatu per tabela kończy kolizję błędem `{ code: "23505" }`.
- Nieznana tabela kończy się wyjątkiem.
- Brak `any`, bo `npm run typecheck` obejmuje `tests/**`. Import w testach ścieżką względną (brak
  aliasu `@tests` w Jest).

#### 2. Testy zachowania danych

**File**: `tests/unit/protected-data.test.ts` (nowy, `/** @jest-environment node */`)

**Intent**: Dla każdej operacji celu i dziennika sprawdzić, że `preferences` i `recipes` są po niej
głęboko równe stanowi sprzed niej, a tabela docelowa faktycznie się zmieniła (kontrola pozytywna).
Bez tej kontroli zielony test przeszedłby też dla atrapy, która niczego nie zapisuje.

**Contract** — przypadki, z wierszami dwóch użytkowników w każdej tabeli. Użytkownik A ma co
najmniej 3 preferencje, w tym dwie w tej samej kategorii, oraz 2 przepisy, w tym jeden z blokiem
„Wartości odżywcze na porcję”:
- `PUT /api/user-settings` z 2000, a potem z `null` (prawdziwy `UserSettingsService`):
  `user_settings` zmienia się, `preferences` i `recipes` nie;
- `POST /api/diary-entries`: wpis opisowy z ręczną wartością oraz wpis z przepisu z porcjami
  (prawdziwy parser liczy wartość, przepis zostaje bez zmian, także `updated_at`);
- `PATCH /api/diary-entries/:id`: `calories`, `recalculate: true` na wpisie z przepisu oraz zmiana
  `portions`;
- `DELETE /api/diary-entries/:id`;
- `POST /api/diary-entries/:id/estimate` dla wpisu z przepisu. `@/lib/services/calorie-estimation.service`
  jest zamockowany jak w `tests/unit/diary-estimate-route.test.ts:21-23`, a `estimateFromRecipe` zwraca liczbę;
- `DELETE /api/preferences/:id` jednej z dwóch preferencji tej samej kategorii: pozostałe preferencje
  A i wszystkie B są co do pola nietknięte, a usunięta zniknęła;
- `DELETE /api/recipes/:id`: `diary_entries` i `preferences` są nietknięte w atrapie. Komentarz
  w teście mówi, że zachowanie wpisów po usunięciu przepisu (`on delete set null`) zapewnia baza
  i ten test go nie dowodzi.

### Success Criteria:

#### Automated Verification:

- Nowe testy przechodzą: `npx jest tests/unit/protected-data.test.ts`
- Cała suita przechodzi: `npm run test`
- Typy: `npm run typecheck` — 0 błędów
- Lint: `npm run lint`

#### Manual Verification:

- Kontrola wyroczni: usunięcie `.eq("id", preferenceId)` z DELETE w `src/pages/api/preferences/[id].ts`
  czerwieni test „DELETE jednej preferencji”; po przywróceniu jest zielono
- Kontrola wyroczni: tymczasowe `update` na `recipes` w `DiaryService.createEntry` czerwieni test
  wpisu z przepisu; po przywróceniu jest zielono

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na potwierdzenie kontroli
wyroczni przez człowieka.

---

## Faza 2: Granice dziennika, celu i identyfikatorów (#6)

### Overview

Testy tras na granicy i o krok dalej, sufit int4 dla identyfikatorów dziennika, unit testy parserów
UI i przypięcie przyszłej daty.

### Changes Required:

#### 1. Sufit int4 identyfikatora

**File**: `src/lib/validations/common/id.ts` (nowy), `src/lib/validations/diary/update-entry.ts`,
`src/lib/validations/diary/create-entry.ts`

**Intent**: Jeden schemat dodatniego identyfikatora int4 z parametru ścieżki, który zastępuje logikę
`entryIdSchema`, oraz wspólna stała sufitu dla `source_recipe_id`. Wartość ponad zakres kolumny
`serial` daje 400 zanim dotrze do PostgREST.

**Contract**: Stała `MAX_INT4_ID = 2147483647` i schemat napisu `^\d+$` → liczba w `1..MAX_INT4_ID`.
`entryIdSchema` reeksportuje go albo z niego korzysta. Komunikaty `entryIdSchema` się nie zmieniają.
`source_recipe_id` dostaje `.max(MAX_INT4_ID)`.

#### 2. Testy granic schematu i tras

**Files**:
- `tests/unit/diary-validations.test.ts` (id 2147483647 / 2147483648, `source_recipe_id` 2147483648);
- `tests/unit/diary-entries-route.test.ts` (POST);
- `tests/unit/diary-entry-route.test.ts` (PATCH, DELETE id);
- `tests/unit/user-settings-route.test.ts` (PUT).

**Intent**: Dla każdego limitu z tabeli wyroczni: granica przechodzi, a krok dalej daje 400
z `details` wskazującym pole i **brak zapisu**. Brak zapisu to pusta lista insertów w atrapie albo
`not.toHaveBeenCalled()` na szpiegu serwisu. Testy sparametryzowane (`it.each`), wyrocznia
w komentarzu nad tablicą przypadków.

**Contract**:
- POST wpisu: content 500/501, amount_text 100/101, calories 0/5000/-1/5001, portions 99/99.01/0
  z przepisem, `source_recipe_id` 2147483648;
- PATCH: content 501, calories 5001, portions 99.01, id 2147483648 → 400 bez wywołania serwisu;
- DELETE: id 2147483648 → 400;
- PUT celu: 500/10000 → 200, 499/10001 → 400 bez wywołania `setDailyGoal`;
- przyszła data: POST z `entry_date: "2999-01-01"` → 201. Nazwa testu kończy się „(obecne
  zachowanie — luka zaakceptowana)”, a komentarz odsyła do wpisu w `known-drift.md` (faza 5).

#### 3. Unit testy parserów UI

**File**: `tests/unit/diary-input-parsers.test.ts` (nowy)

**Intent**: Przypiąć ochronę przed `1e3`, która dziś istnieje tylko w kodzie bez testu.

**Contract**:
- `parseCalories`: `"1e3"`, `"0x1f"`, `"-5"`, `"12.5"`, `"123456"` → `NaN`; `""` i `"  "` → `null`;
  `" 250 "` → 250;
- `parsePortions`: `"1e3"` → `NaN`; `"1,5"` i `"1.5"` → 1.5; `""` → `null`; `"abc"` → `NaN`.

### Success Criteria:

#### Automated Verification:

- Testy fazy przechodzą: `npx jest tests/unit/diary-validations.test.ts tests/unit/diary-entries-route.test.ts tests/unit/diary-entry-route.test.ts tests/unit/user-settings-route.test.ts tests/unit/diary-input-parsers.test.ts`
- Cała suita przechodzi: `npm run test`
- Typy: `npm run typecheck` — 0 błędów
- Lint: `npm run lint`

#### Manual Verification:

- Kontrola wyroczni: usunięcie `.max(MAX_INT4_ID)` czerwieni testy 2147483648; po przywróceniu jest zielono
- Kontrola wyroczni: zmiana sufitu `caloriesValueSchema` na 5001 czerwieni test 5001 → 400

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na potwierdzenie kontroli
wyroczni przez człowieka.

---

## Faza 3: Preferencje — 400 zamiast 500

### Overview

Trasy preferencji przechodzą na konwencję: schemat w `src/lib/validations/`, `safeParse` + `zodIssues`,
ciało nie-JSON → 400, id przez schemat int4, duplikat → 409, stałe 500.

### Changes Required:

#### 1. Schematy preferencji

**File**: `src/lib/validations/preferences/upsert-preference.ts`, `src/lib/validations/preferences/list-preferences.ts` (nowe)

**Intent**: Jeden schemat ciała dla POST i PUT (decyzja: trim, 1–50) oraz schemat parametrów GET.
Zastępują inline schematy z obu tras.

**Contract**:
- `category`: enum czterech polskich wartości z `Constants` (`database.types.ts`);
- `value`: `string().trim().min(1).max(50)` z polskimi komunikatami;
- GET: `category` opcjonalne, `limit` z koercją, liczba całkowita 0–50 (zakres jak dziś); `offset`
  z koercją, liczba całkowita ≥ 0.

#### 2. Trasy preferencji

**File**: `src/pages/api/preferences/index.ts`, `src/pages/api/preferences/[id].ts`

**Intent**: Każdy błąd wejścia daje 400 w kształcie `{ error, details: ValidationIssue[] }`. Duplikat
daje 409. Awaria daje 500 ze stałym ciałem, bez `error.message`. Kolejność i filtry zapytań oraz
limit 50 wierszy (400) zostają bez zmian.

**Contract**:
- `request.json().catch(() => null)` → 400;
- błąd insertu albo update z `code === "23505"` → 409 `{ error: "Taka preferencja już istnieje" }`;
- `params.id` przez wspólny schemat int4 z fazy 2 → 400 dla `"12abc"`, `"0"`, `"2147483648"`;
- 500 → `{ error: "Błąd wewnętrzny serwera" }` i `console.error` z pełnym błędem;
- 401, 404 i 204 bez zmian.

#### 3. Testy tras preferencji

**File**: `tests/unit/preferences-route.test.ts` (nowy, `@jest-environment node`, atrapa z fazy 1)

**Intent**: Pierwsze testy tras preferencji. Pokrywają granice z tabeli wyroczni oraz brak zapisu
przy 400 i 409.

**Contract**:
- POST: value 50 → 201; 51 → 400 z `details[0].path === "value"`; `"   "` → 400;
  `"  wega  "` → zapis `"wega"`; duplikat (także po trim) → 409 i tabela bez zmian; nie-JSON → 400;
  50 istniejących wierszy → 400 (dzisiejszy komunikat); 500 nie zawiera treści błędu atrapy;
- PUT: value 51 → 400; `"12abc"` → 400; obca preferencja → 404 (z poprawnym ciałem);
- GET: `limit=50` → 200; `limit=51` → 400;
- DELETE: `"12abc"` i `"2147483648"` → 400, tabela bez zmian.

### Success Criteria:

#### Automated Verification:

- Testy przechodzą: `npx jest tests/unit/preferences-route.test.ts tests/unit/protected-data.test.ts`
- Cała suita przechodzi: `npm run test`
- Typy: `npm run typecheck` — 0 błędów
- Lint: `npm run lint`

#### Manual Verification:

- W `/profile`: dodanie preferencji o istniejącej wartości pokazuje toast „Taka preferencja już
  istnieje”, nie surowy JSON ani komunikat Postgresa
- W `/profile`: dodanie, edycja i usunięcie preferencji działają jak przed zmianą
- Kontrola wyroczni: powrót do `.parse()` w POST czerwieni test 51 → 400

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na potwierdzenie testów
ręcznych przez człowieka.

---

## Faza 4: Przepisy POST/PUT — limity bazy na serwerze

### Overview

`/api/recipes` POST i PUT dostają sufity z migracji, ciało nie-JSON daje 400, identyfikator przechodzi
przez schemat int4, a 500 traci `details`.

### Changes Required:

#### 1. Schematy przepisów

**File**: `src/lib/validations/recipe/create-recipe.ts`, `src/lib/validations/recipe/update-recipe.ts` (nowe)

**Intent**: Przenieść inline schematy z `recipes/index.ts:10-15` i `recipes/[id].ts:8-12` do konwencji
i dodać sufity bazy (decyzja: tytuł 255, nie 100).

**Contract**:
- `title`: `min(1).max(255)`;
- `content`: `min(1).max(5000)`;
- `additional_params`: `max(5000).nullable().optional()`;
- `is_ai_generated` tylko w create, domyślnie `false`.

Bez trim: zachowanie poniżej sufitu ma zostać co do znaku (FR-014 „exactly as before”).

#### 2. Trasy przepisów

**File**: `src/pages/api/recipes/index.ts` (POST), `src/pages/api/recipes/[id].ts` (GET, PUT, DELETE)

**Intent**: 400 zamiast 500 dla ciała nie-JSON i identyfikatora ponad int4. Ciało 500 bez `details`.
GET listy, filtry i zachowanie DELETE (D5) bez zmian.

**Contract**:
- `request.json().catch(() => null)` → 400;
- `params.id` przez wspólny schemat int4 → 400 z dzisiejszym komunikatem `"Nieprawidłowe ID przepisu"`;
- 500 → `{ error: "Błąd wewnętrzny serwera" }` bez `details`, z `console.error`.

#### 3. Testy

**File**: `tests/unit/recipes-route.test.ts` (nowe bloki `POST /api/recipes` i `PUT /api/recipes/:id`)

**Intent**: Granice z tabeli wyroczni, brak zapisu przy 400 i ciało 500 bez treści błędu.

**Contract**:
- POST i PUT: title 255 → 201/200, 256 → 400; content 5000/5001; additional_params 5000/5001;
  nie-JSON → 400; błąd bazy → 500, a ciało nie zawiera komunikatu atrapy;
- GET, PUT i DELETE z id `2147483648` → 400;
- istniejące bloki GET i DELETE (z `test.failing` D5) przechodzą bez zmian.

### Success Criteria:

#### Automated Verification:

- Testy przechodzą: `npx jest tests/unit/recipes-route.test.ts tests/unit/protected-data.test.ts`
- Cała suita przechodzi: `npm run test` (oba `test.failing` D5 nadal liczone jako oczekiwane porażki)
- Typy: `npm run typecheck` — 0 błędów
- Lint: `npm run lint`

#### Manual Verification:

- Na ekranie przepisów: tworzenie, edycja i usunięcie przepisu działają jak przed zmianą
- Kontrola wyroczni: usunięcie `.max(255)` czerwieni test 256 → 400

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na potwierdzenie testów
ręcznych przez człowieka.

---

## Faza 5: Dokumentacja i cookbook

### Overview

Rejestry kontraktów i dryfu odzwierciedlają nowy stan. Test-plan §6 dostaje wzorzec fazy.

### Changes Required:

#### 1. `docs/reference/known-drift.md`

**Intent**: Usunąć z „Routes with inline Zod schemas” `preferences/index.ts`, `preferences/[id].ts`,
`recipes/index.ts` i `recipes/[id].ts`. Dopisać do „Wpisy dziennika” lukę przyszłej daty: co
przechodzi, decyzja z archiwum, który test ją przypina. Dopisać rozjazd tytułu 100 (UI,
`save-recipe`) ↔ 255 (`/api/recipes`, baza) z kierunkiem zbieżności.

**Contract**: Sekcje „Validation” i „Wpisy dziennika”, nowy wpis o tytule przepisu.

#### 2. `docs/reference/contract-surfaces.md`

**Intent**: Zarejestrować `MAX_INT4_ID` (co pęka, gdy rozjedzie się z typem kolumny) i duplikaty
limitów przepisów i preferencji (schemat ↔ migracja), tak jak dziś opisany jest zakres celu.

**Contract**: Sekcje „Validation” i „Database”.

#### 3. `context/foundation/test-plan.md` §6.5 i §6.6

**Intent**: §6.5 zastępuje TBD wzorcem fazy. §6.6 dostaje 2–3 linie notatki z tego, czego faza
nauczyła.

**Contract**:
- §6.5: lokalizacja (`tests/helpers/supabase-tables.ts`, `tests/unit/protected-data.test.ts`,
  `preferences-route.test.ts`), wyrocznia z literałów migracji, granica i krok dalej → 400 + brak
  zapisu, stan przed i po (głęboka równość) z kontrolą pozytywną, czego atrapa nie dowodzi
  (FK, CHECK, RLS), polecenie uruchomienia;
- §6.6: notatka dla fazy 3.

Statusu §3 nie zmieniaj — robi to orkiestrator `/10x-test-plan`.

### Success Criteria:

#### Automated Verification:

- `npm run format:check` przechodzi (`context/` jest wyłączony w `.prettierignore`; dotyczy `docs/`)
- Cała suita przechodzi: `npm run test`

#### Manual Verification:

- §6.5 da się przeczytać jako odpowiedź na „jak dodać test granicy albo zachowania danych” bez
  sięgania do tego planu
- `known-drift.md` nie wymienia już tras preferencji i `/api/recipes` jako inline schematów

---

## Testing Strategy

### Unit Tests:

- Parsery UI (`1e3`, `0x1f`, znak, ułamek, pusty).
- Schemat identyfikatora int4: granica i krok dalej.

### Integration Tests:

- Trasy z prawdziwymi serwisami na stanowej atrapie wielu tabel (#5).
- Trasy dziennika, celu, preferencji i przepisów: granica i krok dalej, ciało nie-JSON, brak zapisu
  przy 400 i 409, stałe 500 (#6).

### Manual Testing Steps:

1. `/profile`: dodaj, edytuj i usuń preferencję. Dodaj duplikat i sprawdź czytelny toast.
2. Ekran przepisów: utwórz, edytuj i usuń przepis.
3. `/diary`: dodaj wpis, edytuj go, użyj „Zapisz i przelicz”, usuń — bez regresji.

## References

- Research: `context/changes/testing-protected-data-and-limits/research.md`
- Test-plan: `context/foundation/test-plan.md` §2 (#5, #6), §6.1–§6.3
- Wzorzec atrapy: `tests/unit/recipes-route.test.ts:107-175`
- Wzorzec trasy: `src/pages/api/user-settings/index.ts:41-86`
- Decyzja o przyszłej dacie: `context/archive/2026-09-23-manual-diary-entry/plan-brief.md:89-93`
- PRD: `context/foundation/prd.md:84,175-176,193-195`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Stanowa atrapa wielu tabel i dowód zachowania danych (#5)

#### Automated

- [x] 1.1 Nowe testy przechodzą: `npx jest tests/unit/protected-data.test.ts` — c0549ce
- [x] 1.2 Cała suita przechodzi: `npm run test` — c0549ce
- [x] 1.3 Typy: `npm run typecheck` — 0 błędów — c0549ce
- [x] 1.4 Lint: `npm run lint` — c0549ce

#### Manual

- [x] 1.5 Kontrola wyroczni: usunięcie filtra `id` z DELETE preferencji czerwieni test — c0549ce
- [x] 1.6 Kontrola wyroczni: `update` na `recipes` w `createEntry` czerwieni test — c0549ce

### Phase 2: Granice dziennika, celu i identyfikatorów (#6)

#### Automated

- [x] 2.1 Testy fazy przechodzą (walidacje, trasy dziennika, cel, parsery) — ba1e2f3
- [x] 2.2 Cała suita przechodzi: `npm run test` — ba1e2f3
- [x] 2.3 Typy: `npm run typecheck` — 0 błędów — ba1e2f3
- [x] 2.4 Lint: `npm run lint` — ba1e2f3

#### Manual

- [x] 2.5 Kontrola wyroczni: usunięcie `.max(MAX_INT4_ID)` czerwieni testy 2147483648 — ba1e2f3
- [x] 2.6 Kontrola wyroczni: sufit kalorii 5001 czerwieni test 5001 → 400 — ba1e2f3

### Phase 3: Preferencje — 400 zamiast 500

#### Automated

- [x] 3.1 Testy przechodzą: `npx jest tests/unit/preferences-route.test.ts tests/unit/protected-data.test.ts` — 6b6f969
- [x] 3.2 Cała suita przechodzi: `npm run test` — 6b6f969
- [x] 3.3 Typy: `npm run typecheck` — 0 błędów — 6b6f969
- [x] 3.4 Lint: `npm run lint` — 6b6f969

#### Manual

- [x] 3.5 `/profile`: duplikat pokazuje toast „Taka preferencja już istnieje” — 6b6f969
- [x] 3.6 `/profile`: dodanie, edycja i usunięcie preferencji bez regresji — 6b6f969
- [x] 3.7 Kontrola wyroczni: powrót do `.parse()` czerwieni test 51 → 400 — 6b6f969

### Phase 4: Przepisy POST/PUT — limity bazy na serwerze

#### Automated

- [x] 4.1 Testy przechodzą: `npx jest tests/unit/recipes-route.test.ts tests/unit/protected-data.test.ts` — 0f798db
- [x] 4.2 Cała suita przechodzi, `test.failing` D5 nadal oczekiwane — 0f798db
- [x] 4.3 Typy: `npm run typecheck` — 0 błędów — 0f798db
- [x] 4.4 Lint: `npm run lint` — 0f798db

#### Manual

- [x] 4.5 Ekran przepisów: tworzenie, edycja i usunięcie bez regresji — 0f798db
- [x] 4.6 Kontrola wyroczni: usunięcie `.max(255)` czerwieni test 256 → 400 — 0f798db

### Phase 5: Dokumentacja i cookbook

#### Automated

- [x] 5.1 `npm run format:check` przechodzi — 08968c9
- [x] 5.2 Cała suita przechodzi: `npm run test` — 08968c9

#### Manual

- [x] 5.3 §6.5 czytelny bez sięgania do planu — 08968c9
- [x] 5.4 `known-drift.md` nie wymienia tras preferencji i `/api/recipes` jako inline schematów — 08968c9
