# Dzienny cel kaloryczny i postęp — plan wdrożenia

## Overview

Użytkownik ustawia w profilu, obok preferencji żywieniowych, opcjonalny dzienny cel kaloryczny jako
liczbę wpisaną przez siebie (FR-012). W dzienniku widzi sumę dnia względem tego celu jako pasek
postępu (FR-013). Przekroczenie celu to fakt podany neutralnie, nie stan błędu. Preferencje
żywieniowe przetrwają zmianę nietknięte (FR-015) — w tym planie nie są w ogóle dotykane, bo cel
dostaje własną tabelę. Roadmapa: S-06, `daily-goal-and-progress`.

## Current State Analysis

- **Nie istnieje „rekord profilu”, na który PRD (`## Constraints & Compatibility`) i roadmapa
  (S-06, Risk) kładą cel.** `/profile` to strona (`src/pages/profile.astro:7-10`,
  `src/components/profile/ProfilePage.tsx`). Preferencje to osobne wiersze tabeli `preferences`
  (`supabase/migrations/20250427130913_healthymeal_schema.sql:30-38`), które czyta i zapisuje
  `usePreferences` (`src/hooks/profile/usePreferences.ts:39,71,111,152`) przez
  `/api/preferences`. Nikt w `src/` nie zapisuje `user_metadata`. Nigdzie nie ma pojęcia celu.
- **Preferencje nie mogą nieść celu.** `AIService.getUserPreferences` (`src/lib/services/ai.service.ts:500`)
  wczytuje wszystkie wiersze preferencji do promptu przepisów, POST ma limit 50 wierszy
  (`src/pages/api/preferences/index.ts:116-130`), a kategoria to enum.
- **Suma dnia**: `DiaryDaySummary.tsx:13-33` woła `summarizeDay` (`src/lib/utils/diary-totals.ts:19-37`).
  Karta ma `data-testid="diary-day-summary"`, liczba ma `diary-day-total`, a adnotacja o brakach ma
  `diary-day-missing` / `diary-day-count`. `DiaryPage.tsx:257-265` renderuje kartę tylko wtedy,
  gdy dzień ma wpisy.
- **`src/pages/diary.astro:1-10` nie przekazuje wyspie żadnych propsów.** `DiaryPage` pobiera
  wszystko w przeglądarce (`useDiaryEntries`, `src/hooks/diary/useDiaryEntries.ts:36`).
- **UI**: w `src/components/ui/` nie ma prymitywu Progress. Kolory w `src/styles/global.css` to
  neutralne tokeny, `--destructive` i `--chart-1..5`; nie ma tokenów success/warning. Kolory
  sukcesu i ostrzeżeń to surowe klasy palety (`src/components/feedback/Toast.tsx:28-29,71-72`).
  `@components.json` przypina `new-york`, `cssVariables`, lucide.
- **Baza**: migracje nie mają triggera `updated_at`, więc kolumnę ustawia kod. Wzorzec 8 polityk
  RLS: `supabase/migrations/20260922140906_create_diary_entries.sql:69-109`. Wzorzec dowodu izolacji:
  `supabase/checks/diary-entries-rls.sql`.
- **Testy**: profilu nie pokrywa żaden test. E2E dziennika to `tests/e2e/diary-entry.spec.ts` z page
  objectem `tests/e2e/page-objects/DiaryPage.ts`, gdzie `expectTotal` (:234-236) porównuje
  dokładny tekst `${n} kcal`. Testów zrzutów ekranu w repo nie ma (brak `toHaveScreenshot`).

## Desired End State

- Tabela `user_settings` (jeden wiersz na użytkownika) z kolumną `daily_calorie_goal integer null`,
  CHECK 500–10000, RLS i 8 politykami per użytkownik. Izolację potwierdza
  `supabase/checks/user-settings-rls.sql`. Tabela `preferences`, jej migracje i trasy są bez zmian.
- `GET /api/user-settings` zwraca `{ daily_calorie_goal: number | null }`. `PUT /api/user-settings`
  ustawia cel albo czyści go (`null`). Błąd walidacji wychodzi przez `zodIssues`.
- Profil ma kartę „Dzienny cel kaloryczny”: pole liczby, „Zapisz”, „Usuń cel”, toast po zapisie
  i komunikat walidacji.
- W dzienniku z ustawionym celem i co najmniej jednym wpisem karta sumy pokazuje pasek (shadcn
  Progress na tokenach `--progress` / `--progress-track`) i opis `X / Y kcal`, a do tego jedno z:
  - `zostało Z kcal`;
  - `cel osiągnięty`;
  - `N kcal ponad cel` — przy przekroczeniu pasek jest pełny, ma ten sam kolor, bez czerwieni
    i bez ikon.

  Pasek liczy wyłącznie wpisy z wartością. Istniejąca adnotacja „Bez policzonych kalorii: N z M”
  zostaje, a etykieta paska mówi, że pasek jej nie obejmuje. Bez celu karta wygląda jak dziś.
  Pusty dzień pokazuje pusty stan jak dziś.
- Weryfikacja: `npm run lint`, `npm run typecheck` (0 błędów), `npm run format:check`,
  `npm run test`, `npm run test:security`, `npm run test:e2e`. Do tego zrzuty strony kitchen-sink
  w jasnym i ciemnym motywie.

### Key Discoveries:

- `src/lib/services/ai.service.ts:500` — wszystkie wiersze `preferences` trafiają do promptu AI.
  To dyskwalifikuje przechowywanie celu jako preferencji.
- `src/pages/api/diary-entries/index.ts:10-58` to wzorzec trasy: `getUser` → 401, `safeParse` → 400
  z `zodIssues`, serwis, JSON, 500 w `catch`.
- `src/lib/validations/diary/list-entries.ts` to najmniejszy wzorzec pliku schematu.
  `caloriesValueSchema` (`create-entry.ts:35`) ma inny zakres (0–5000, pojedynczy wpis) i nie jest
  współdzielony z celem.
- `tests/e2e/page-objects/DiaryPage.ts:234` — dokładne dopasowanie `diary-day-total`. Tekst celu
  nie może trafić do tego elementu.
- `ProfilePage.tsx:341` już renderuje `<ToastContainer />`, więc karta celu może wołać `showToast`.

## What We're NOT Doing

- Żadnej zmiany w tabeli `preferences`, jej enumie, trasach `/api/preferences*`, `usePreferences`
  ani w `ai.service.ts`. Nie naprawiamy też znalezionego przy okazji błędu mapy kolorów
  w `PreferenceChip.tsx:66-73`.
- Żadnego wyliczania celu z wagi, wzrostu i aktywności. Żadnego kalkulatora (FR-012).
- Bez `user_metadata` w Supabase Auth.
- Bez paska na pustym dniu (decyzja: pusty stan jak dziś).
- Bez celów dla makroskładników i bez celów różnych dla różnych dni.
- Bez statystyk w poprzek dni (PRD Non-Goals).
- Bez `shadcn init`. Dokładamy wyłącznie prymityw `progress`.
- Bez testów zrzutów ekranu (`toHaveScreenshot`) — repo ich nie ma. Zrzuty kitchen-sink robimy
  ręcznie.
- Bez przepisywania PRD. Korekta „rekordu profilu” żyje w `change.md` i w tym planie; roadmapę
  aktualizuje tylko synchronizacja statusu.

## Implementation Approach

Cel dostaje osobną, wąską tabelę. Dzięki temu jedyny zapis do „danych profilu” nie dotyka żadnego
istniejącego wiersza. Całe ryzyko FR-015 z roadmapy znika, zamiast być pilnowane.

Kolejność: kontrakt danych (migracja, typy) → serwis i trasa → profil (zapis) → dziennik
(odczyt i wizualizacja) → E2E.

Dziennik dostaje cel jako prop SSR z `diary.astro`: frontmatter czyta go przez
`UserSettingsService` z `locals.supabase`. Dzięki temu pasek nie mruga przy hydratacji i nie
powstaje drugi fetch. Po zmianie celu w profilu przejście przez `ClientRouter` i tak pobiera
świeży SSR.

Kontrakt UI według CLAUDE.md:
- semantyczne tokeny w `global.css` (jedno źródło, wartości z komentarzem o pochodzeniu);
- prymityw shadcn w `ui/`;
- aplikacyjny komponent w `components/diary/`;
- matematyka paska w czystej funkcji obok `summarizeDay`, żeby dało się ją testować w Jest.

## Critical Implementation Details

- **Upsert, nie insert.** Wiersz `user_settings` może nie istnieć (użytkownik nigdy nie ustawił
  celu). `PUT` robi `upsert` po `user_id` i ustawia `updated_at` jawnie. Brak wiersza oznacza dla
  `GET` wynik `daily_calorie_goal: null`, nie 404. Polityki INSERT i UPDATE muszą obie przepuszczać
  `user_id = auth.uid()`, bo upsert trafia w obie.
- **`diary.astro` przestaje być stroną bez danych.** Frontmatter czyta `Astro.locals.user` i nie
  może dostać `export const prerender = true` (`docs/reference/astro-react-runtime.md`). Błąd
  odczytu celu nie może wywrócić dziennika: łapiemy go i przekazujemy `null`, bo dziennik jest
  używalny bez celu.

## Phase 1: Magazyn celu

### Overview

Nowa tabela `user_settings` z RLS, dowód izolacji, zregenerowane typy i wpis w rejestrach
konwencji.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/<timestamp>_create_user_settings.sql` (przez
`npm run supabase:new-migration create_user_settings`)

**Intent**: Utworzyć tabelę na ustawienia użytkownika z jedną opcjonalną kolumną celu. Nagłówek
i komentarze w stylu `20260922140906_create_diary_entries.sql` mają wyjaśniać, czemu cel nie
leży w `preferences`.

**Contract**:
- `user_settings(user_id uuid primary key references auth.users(id) on delete cascade,
  daily_calorie_goal integer null check (daily_calorie_goal is null or daily_calorie_goal between 500 and 10000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now())`;
- `enable row level security`;
- 8 polityk: `anon_cannot_{select,insert,update,delete}_user_settings` oraz
  `users_can_{select,insert,update,delete}_own_user_settings` z `user_id = auth.uid()`, a UPDATE
  z `using` i `with check`;
- migracja nie zmienia żadnego istniejącego obiektu.

#### 2. Dowód izolacji RLS

**File**: `supabase/checks/user-settings-rls.sql`

**Intent**: Powtarzalny dowód, że użytkownik B nie czyta ani nie zmienia celu użytkownika A.
Skrypt kopiuje strukturę `supabase/checks/diary-entries-rls.sql`: sprawdzenie 8 nazw polityk
w `pg_policies` i `relrowsecurity`, sprzątanie, blok `do` z podszyciem się pod dwa podmioty przez
`request.jwt.claims` i celowym wyjątkiem `[PASS]`/`[FAIL]`.

**Contract**: placeholdery `<uuid-a>` / `<uuid-b>`. Asercje:
- B nie widzi wiersza A;
- update wiersza A przez B zmienia 0 wierszy;
- insert z `user_id = A` przez B jest odrzucony;
- anon nie widzi niczego.

#### 3. Typy

**File**: `src/db/database.types.ts` (generowany), `src/types.ts`

**Intent**: Zregenerować typy po zaaplikowaniu migracji (`npm run supabase:push`, potem
`npm run supabase:gen`). Dodać DTO, żeby kod aplikacji nie sięgał do pliku generowanego.

**Contract**:
- `export type UserSettingsDto = Tables<"user_settings">`;
- `export interface DailyGoalDto { daily_calorie_goal: number | null }`;
- `export interface UpdateDailyGoalCommand { daily_calorie_goal: number | null }`.

#### 4. Rejestry konwencji

**File**: `AGENTS.md`, `docs/reference/contract-surfaces.md`

**Intent**: Dopisać `user_settings` do listy istniejących tabel i do listy skryptów
`supabase/checks/` w `AGENTS.md`. Dodać tabelę do wpisu „Tables” w `contract-surfaces.md`
(migracja, zakres CHECK 500–10000 zdublowany w Zod, `null` = brak celu).

**Contract**: sekcje `## Project structure` (AGENTS.md) i `### Tables — …` (contract-surfaces.md).

### Success Criteria:

#### Automated Verification:

- Migracja aplikuje się bez błędów: `npm run supabase:push`
- Typy zregenerowane i zawierają `user_settings`: `npm run supabase:gen`
- Typecheck bez błędów: `npm run typecheck`
- Lint i format przechodzą: `npm run lint` oraz `npm run format:check`

#### Manual Verification:

- `supabase/checks/user-settings-rls.sql` uruchomiony w edytorze SQL z dwoma prawdziwymi UUID kończy się `[PASS]`
- Tabela `preferences` i jej polityki bez zmian (porównanie `pg_policies` przed i po)

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się
na ręczne potwierdzenie przed przejściem dalej.

---

## Phase 2: Serwis i trasa celu

### Overview

Warstwa serwera: schemat Zod, serwis konstruowany z klientem request-scoped i trasa `GET/PUT`.

### Changes Required:

#### 1. Schemat walidacji

**File**: `src/lib/validations/user-settings/update-goal.ts`

**Intent**: Jedna reguła celu, zgodna z CHECK w migracji: liczba całkowita 500–10000 albo `null`
(czyszczenie). Komunikaty po polsku. Wzorzec pliku: `src/lib/validations/diary/list-entries.ts`.

**Contract**:
- `dailyGoalValueSchema` (`z.number().int().min(500).max(10000)`);
- `updateDailyGoalSchema = z.object({ daily_calorie_goal: dailyGoalValueSchema.nullable() })`;
- brak klucza to błąd, nie „bez zmian”.

#### 2. Serwis

**File**: `src/lib/services/user-settings.service.ts`

**Intent**: Serwis serwerowy na wzór `ai.service.ts` / `diary.service.ts`. Konstruktor przyjmuje
`SupabaseClient<Database>`, metody przyjmują już zwalidowane dane.

**Contract**:
- `class UserSettingsService`;
- `getDailyGoal(userId: string): Promise<number | null>` — brak wiersza daje `null`;
- `setDailyGoal(userId: string, goal: number | null): Promise<number | null>` — `upsert`
  z `onConflict: "user_id"` i jawnym `updated_at`;
- błąd Supabase to rzucony `Error`.

#### 3. Trasa

**File**: `src/pages/api/user-settings/index.ts`

**Intent**: Trasa robi tylko parsowanie, delegację do serwisu i odpowiedź. Nie trafia do
`PUBLIC_PATHS`, więc wymaga sesji.

**Contract**:
- `export const prerender = false`;
- `GET` → 200 `DailyGoalDto`;
- `PUT` → 200 `DailyGoalDto`;
- 400 `{ error, details: zodIssues(...) }`, także dla ciała, które nie jest JSON-em;
- 401 bez użytkownika, 500 w `catch`.

#### 4. Testy jednostkowe

**File**: `tests/unit/user-settings-validations.test.ts`, `tests/unit/user-settings-service.test.ts`,
`tests/unit/user-settings-route.test.ts`

**Intent**: Pokryć granice schematu i zachowanie serwisu oraz trasy na mocku
`tests/mocks/supabase.mock.ts`, na wzór `diary-validations.test.ts` / `diary-entry-route.test.ts`.

**Contract**:
- schemat: 499 ✗, 500 ✓, 10000 ✓, 10001 ✗, 1500.5 ✗, `"2000"` ✗, `null` ✓, brak klucza ✗;
- serwis: brak wiersza daje `null`, upsert wywołany z `user_id` i `updated_at`;
- trasa: 401, 400 z `details` w kształcie `ValidationIssue[]`, 200 dla `GET` i `PUT`, `PUT null`
  czyści cel.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą: `npm run test`
- Typecheck bez błędów: `npm run typecheck`
- Lint przechodzi: `npm run lint`

#### Manual Verification:

- `GET /api/user-settings` w zalogowanej przeglądarce zwraca `{"daily_calorie_goal":null}` dla konta bez celu

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się
na ręczne potwierdzenie przed przejściem dalej.

---

## Phase 3: Cel w profilu

### Overview

Karta ustawiania celu na stronie profilu, obok istniejących kart. Bez zmian w kodzie preferencji.

### Changes Required:

#### 1. Hook

**File**: `src/hooks/profile/useDailyGoal.ts`

**Intent**: Pobranie celu przy montowaniu i zapis przez `PUT`, na wzór `usePreferences`. Stan jest
lokalny. Nie ustawiamy stanu w efekcie w sposób, który łamie `react-hooks/set-state-in-effect`:
ustawienie stanu po `await` w callbacku fetcha jest dozwolone, tak jak w `useDiaryEntries`.

**Contract**:
- zwraca `{ goal: number | null, isLoading, error, saveGoal(goal: number | null): Promise<boolean> }`;
- zapis wysyła `credentials: "include"`;
- błąd 400 niesie komunikat z `details`.

#### 2. Karta celu

**File**: `src/components/profile/DailyGoalCard.tsx`, `src/components/profile/ProfilePage.tsx`

**Intent**: Karta „Dzienny cel kaloryczny” w stylu istniejących kart profilu, jako nowy wiersz
między siatką `md:grid-cols-2` a sekcją „Twoje preferencje”. Zawiera:
- pole liczby z jednostką kcal;
- podpowiedź „Opcjonalnie. Liczba, np. od dietetyka (500–10000)”;
- „Zapisz” oraz „Usuń cel” (widoczny, gdy cel jest ustawiony);
- walidację klienta tym samym `dailyGoalValueSchema`;
- `showToast` po zapisie i po usunięciu.

Pole zasiane zapisanym celem korzysta ze wzorca „adjusting state when props change”
(`RecipeFormModal.tsx`), nie z efektu.

**Contract**: `data-testid`: `daily-goal-card`, `daily-goal-input`, `daily-goal-save`,
`daily-goal-clear`, `daily-goal-error`. `ProfilePage` dostaje tylko import i jedno miejsce
renderowania.

### Success Criteria:

#### Automated Verification:

- Typecheck bez błędów: `npm run typecheck`
- Lint (w tym reguły React Compiler) przechodzi: `npm run lint`
- Testy jednostkowe przechodzą: `npm run test`

#### Manual Verification:

- Ustawienie 2000 w profilu i odświeżenie strony pokazuje 2000
- „Usuń cel” czyści pole i po odświeżeniu pole jest puste
- Wpisanie 300 albo 20000 pokazuje komunikat walidacji i nie zapisuje
- Dodawanie, edycja i usuwanie preferencji działa jak przed zmianą

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się
na ręczne potwierdzenie przed przejściem dalej.

---

## Phase 4: Pasek postępu w dzienniku

### Overview

Tokeny, prymityw shadcn, czysta funkcja postępu, komponent paska w karcie sumy, cel przekazywany
z SSR i strona kitchen-sink jako bramka wizualna.

### Changes Required:

#### 1. Tokeny

**File**: `src/styles/global.css`

**Intent**: Semantyczne tokeny paska w jednym źródle. Wartości wzięte z istniejącej palety repo
(odcień `--chart-2`), opisane komentarzem o pochodzeniu. Kolor paska jest ten sam poniżej i powyżej
celu, więc nie ma tokenu „przekroczenia”.

**Contract**:
- `--progress` i `--progress-track` w `:root` oraz `.dark`;
- mapowania `--color-progress` i `--color-progress-track` w `@theme inline`;
- żadnych innych zmian tokenów.

#### 2. Prymityw Progress

**File**: `src/components/ui/progress.tsx` (przez `npx shadcn@latest add progress`), `package.json`,
`package-lock.json`

**Intent**: Dodać prymityw shadcn (new-york). Jest to **nowa zależność** Radix (pakiet, który wskaże
shadcn). Klasy tła i wskaźnika zamieniamy z `bg-primary*` na `bg-progress-track` / `bg-progress`,
żeby prymityw czytał tokeny z punktu 1.

**Contract**: eksport `Progress` z `value: number` (0–100). `npm run test:security` musi przejść bez
nowego wpisu w allowliście `audit-ci.jsonc`. To jedyny nowy plik w `src/components/ui/`.

#### 3. Matematyka paska

**File**: `src/lib/utils/diary-totals.ts`, `tests/unit/diary-totals.test.ts`

**Intent**: Czysta funkcja obok `summarizeDay`, która z sumy policzonej i celu wylicza procent
wypełnienia (obcięty do 100) i relację do celu.

**Contract**: `goalProgress(calorieTotal: number, goal: number): { percent: number; status: "under" | "reached" | "over"; remaining: number; excess: number }`:
- `reached` tylko przy równości;
- `percent` zaokrąglony i obcięty do 0–100.

Przypadki testowe: 0/2000 (percent 0), 1500/2000 (75, remaining 500), 2000/2000 (`reached`),
2300/2000 (percent 100, excess 300), 1999/2000 (`under`, remaining 1 — zaokrąglony procent nie
decyduje o statusie).

#### 4. Komponent paska i karta sumy

**File**: `src/components/diary/DailyGoalProgress.tsx`, `src/components/diary/DiaryDaySummary.tsx`

**Intent**: `DailyGoalProgress` renderuje:
- `Progress`;
- opis `X / Y kcal · zostało Z kcal` | `· cel osiągnięty` | `· N kcal ponad cel`
  w `text-muted-foreground`, bez czerwieni i bez ikon ostrzegawczych.

Gdy `missingCount > 0`, etykieta dostaje dopisek, że pasek nie obejmuje wpisów bez wartości.
Istniejąca adnotacja `diary-day-missing` zostaje bez zmian. `DiaryDaySummary` dostaje opcjonalny
prop `dailyGoal` i renderuje pasek pod liczbą tylko przy ustawionym celu. `diary-day-total` zostaje
nietknięty, więc `expectTotal` dalej przechodzi.

**Contract**:
- `DiaryDaySummary({ entries, dailyGoal?: number | null })`;
- `data-testid`: `diary-goal-progress` (kontener), `diary-goal-text` (opis);
- `Progress` ma dostępną nazwę (`aria-label` „Postęp względem dziennego celu”).

#### 5. Cel z SSR do wyspy

**File**: `src/pages/diary.astro`, `src/components/diary/DiaryPage.tsx`

**Intent**: Frontmatter `diary.astro` czyta cel przez `new UserSettingsService(Astro.locals.supabase)`
dla `Astro.locals.user.id`. Błąd łapie i przekazuje `null`. `DiaryPage` przyjmuje
`dailyGoal: number | null` i przekazuje go do `DiaryDaySummary`. Gałąź pustego stanu bez zmian.

**Contract**: `<DiaryPage client:load dailyGoal={dailyGoal} />`. Bez `prerender = true`.

#### 6. Kitchen-sink (bramka wizualna)

**File**: `src/pages/dev/diary-goal-states.astro`

**Intent**: Strona wyłącznie deweloperska: poza `import.meta.env.DEV` zwraca 404. Renderuje
`DiaryDaySummary` na danych stałych we wszystkich stanach:
- bez celu;
- 0 / 2000;
- 1500 / 2000;
- 2000 / 2000;
- 2300 / 2000;
- 1500 / 2000 z dwoma wpisami bez wartości.

Służy do zrzutów w jasnym i ciemnym motywie. Wymaga sesji jak każda strona spoza `PUBLIC_PATHS`.

**Contract**: ścieżka `/dev/diary-goal-states`, każdy stan w sekcji z nagłówkiem nazywającym stan.

### Success Criteria:

#### Automated Verification:

- Testy `goalProgress` i reszta suite przechodzą: `npm run test`
- Typecheck bez błędów: `npm run typecheck`
- Lint i format przechodzą: `npm run lint` oraz `npm run format:check`
- Audyt zależności przechodzi bez nowego wpisu w allowliście: `npm run test:security`
- Istniejące E2E dziennika przechodzą bez zmian asercji: `npm run test:e2e -- diary-entry`

#### Manual Verification:

- Zrzuty `/dev/diary-goal-states` w jasnym i ciemnym motywie: przekroczenie nie wygląda jak błąd, pasek i opis czytelne na szerokości telefonu (375 px)
- Dziennik z celem 2000 i wpisem 450 kcal pokazuje pasek i `450 / 2000 kcal · zostało 1550 kcal`
- Dziennik bez celu wygląda jak przed zmianą
- `/dev/diary-goal-states` zwraca 404 w buildzie produkcyjnym (`npm run build` + `npm run preview`)

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się
na ręczne potwierdzenie przed przejściem dalej.

---

## Phase 5: E2E celu

### Overview

Scenariusz przeglądarkowy od profilu do dziennika oraz sprzątanie celu konta testowego.

### Changes Required:

#### 1. Page object profilu

**File**: `tests/e2e/page-objects/ProfilePage.ts`, `tests/e2e/page-objects/index.ts`

**Intent**: Lokatory karty celu i akcje `setGoal(n)` / `clearGoal()` na `data-testid` z fazy 3.

**Contract**: eksport z `index.ts` i rejestracja w `Application.ts` na wzór `DiaryPage`.

#### 2. Lokatory paska w page objecie dziennika

**File**: `tests/e2e/page-objects/DiaryPage.ts`

**Intent**: Lokatory `diary-goal-progress` i `diary-goal-text` oraz `expectGoalText(text)`. Dla
braku paska: `expectNoGoalProgress()`.

**Contract**: istniejące metody (`expectTotal`, `readTotal`…) bez zmian.

#### 3. Scenariusz

**File**: `tests/e2e/daily-goal.spec.ts`

**Intent**: Scenariusz:
1. Ustaw cel 2000 w profilu.
2. Dodaj ręczny wpis 450 kcal w dzienniku.
3. Sprawdź `450 / 2000 kcal · zostało 1550 kcal`.
4. Dodaj wpis 1900 kcal i sprawdź `N kcal ponad cel`.
5. Usuń cel w profilu i sprawdź, że w dzienniku nie ma paska.

**Contract**: dni sprzątane przez `deleteDiaryEntriesForDays`, cel czyszczony w `afterEach`.

#### 4. Sprzątanie celu

**File**: `tests/e2e/services/cleanup.service.ts`

**Intent**: Metoda czyszcząca cel konta testowego przez `PUT /api/user-settings` z
`{ daily_calorie_goal: null }`.

**Contract**: `clearDailyGoal(): Promise<{ errors: string[] }>`. Żądanie niesie nagłówek
`Origin: this.baseUrl` (`security.checkOrigin`).

### Success Criteria:

#### Automated Verification:

- Cały zestaw E2E przechodzi: `npm run test:e2e`
- Lint i typecheck przechodzą: `npm run lint` oraz `npm run typecheck`

#### Manual Verification:

- Po przebiegu E2E konto testowe nie ma ustawionego celu (`GET /api/user-settings` zwraca `null`)

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się
na ręczne potwierdzenie przed przejściem dalej.

---

## Testing Strategy

### Unit Tests:

- Schemat celu: granice 499/500/10000/10001, ułamek, napis, `null`, brak klucza.
- `UserSettingsService`: brak wiersza daje `null`, kształt upsertu.
- Trasa `/api/user-settings`: 401, 400 przez `zodIssues`, 200 dla `GET` i `PUT`, czyszczenie `null`.
- `goalProgress`: poniżej, równo, powyżej, zero, obcięcie procentu.

### Integration Tests:

- `supabase/checks/user-settings-rls.sql` — izolacja dwóch użytkowników i blokada anon.
- E2E `daily-goal.spec.ts` — profil → dziennik → przekroczenie → usunięcie celu.

### Manual Testing Steps:

1. Ustaw cel 2000 w profilu, odśwież stronę i sprawdź, że wartość została.
2. W dzienniku dodaj wpis 450 kcal i sprawdź pasek oraz opis.
3. Dodaj wpis opisowy z wyceną AI; w trakcie wyceny sprawdź dopisek o wpisach bez wartości.
4. Przekrocz cel i sprawdź pełny pasek w tym samym kolorze oraz opis „ponad cel”, bez czerwieni.
5. Przejdź przez `/dev/diary-goal-states` w obu motywach i na 375 px.
6. Usuń cel i sprawdź, że dziennik wygląda jak przed zmianą.
7. Dodaj i usuń preferencję w profilu, a potem wygeneruj przepis z AI — działa jak dotąd.

## Performance Considerations

Jedno dodatkowe zapytanie po kluczu głównym przy SSR dziennika. Przy 3–4 użytkownikach jest to
pomijalne.

## Migration Notes

Migracja jest czysto addytywna (nowa tabela), więc istniejące dane nie wymagają przeniesienia.
Wycofanie: `drop table user_settings` usuwa tylko cele i nie rusza żadnych innych danych.

## References

- Roadmapa: `context/foundation/roadmap.md` (S-06)
- PRD: `context/foundation/prd.md` (FR-012, FR-013, FR-015; `## Constraints & Compatibility`)
- Wzorzec migracji i RLS: `supabase/migrations/20260922140906_create_diary_entries.sql:69-109`
- Wzorzec dowodu RLS: `supabase/checks/diary-entries-rls.sql`
- Wzorzec trasy: `src/pages/api/diary-entries/index.ts:10-58`
- Suma dnia: `src/components/diary/DiaryDaySummary.tsx:13-33`, `src/lib/utils/diary-totals.ts:19-37`
- Poprzednia zmiana: `context/archive/2026-09-29-edit-and-delete-entry/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Magazyn celu

#### Automated

- [x] 1.1 Migracja aplikuje się bez błędów: `npm run supabase:push` — fdb55d0
- [x] 1.2 Typy zregenerowane i zawierają `user_settings`: `npm run supabase:gen` — fdb55d0
- [x] 1.3 Typecheck bez błędów: `npm run typecheck` — fdb55d0
- [x] 1.4 Lint i format przechodzą: `npm run lint` oraz `npm run format:check` — fdb55d0

#### Manual

- [x] 1.5 `supabase/checks/user-settings-rls.sql` uruchomiony w edytorze SQL z dwoma prawdziwymi UUID kończy się `[PASS]` — fdb55d0
- [x] 1.6 Tabela `preferences` i jej polityki bez zmian (porównanie `pg_policies` przed i po) — fdb55d0

### Phase 2: Serwis i trasa celu

#### Automated

- [x] 2.1 Testy jednostkowe przechodzą: `npm run test`
- [x] 2.2 Typecheck bez błędów: `npm run typecheck`
- [x] 2.3 Lint przechodzi: `npm run lint`

#### Manual

- [ ] 2.4 `GET /api/user-settings` w zalogowanej przeglądarce zwraca `{"daily_calorie_goal":null}` dla konta bez celu

### Phase 3: Cel w profilu

#### Automated

- [ ] 3.1 Typecheck bez błędów: `npm run typecheck`
- [ ] 3.2 Lint (w tym reguły React Compiler) przechodzi: `npm run lint`
- [ ] 3.3 Testy jednostkowe przechodzą: `npm run test`

#### Manual

- [ ] 3.4 Ustawienie 2000 w profilu i odświeżenie strony pokazuje 2000
- [ ] 3.5 „Usuń cel” czyści pole i po odświeżeniu pole jest puste
- [ ] 3.6 Wpisanie 300 albo 20000 pokazuje komunikat walidacji i nie zapisuje
- [ ] 3.7 Dodawanie, edycja i usuwanie preferencji działa jak przed zmianą

### Phase 4: Pasek postępu w dzienniku

#### Automated

- [ ] 4.1 Testy `goalProgress` i reszta suite przechodzą: `npm run test`
- [ ] 4.2 Typecheck bez błędów: `npm run typecheck`
- [ ] 4.3 Lint i format przechodzą: `npm run lint` oraz `npm run format:check`
- [ ] 4.4 Audyt zależności przechodzi bez nowego wpisu w allowliście: `npm run test:security`
- [ ] 4.5 Istniejące E2E dziennika przechodzą bez zmian asercji: `npm run test:e2e -- diary-entry`

#### Manual

- [ ] 4.6 Zrzuty `/dev/diary-goal-states` w jasnym i ciemnym motywie: przekroczenie nie wygląda jak błąd, pasek i opis czytelne na szerokości telefonu (375 px)
- [ ] 4.7 Dziennik z celem 2000 i wpisem 450 kcal pokazuje pasek i `450 / 2000 kcal · zostało 1550 kcal`
- [ ] 4.8 Dziennik bez celu wygląda jak przed zmianą
- [ ] 4.9 `/dev/diary-goal-states` zwraca 404 w buildzie produkcyjnym (`npm run build` + `npm run preview`)

### Phase 5: E2E celu

#### Automated

- [ ] 5.1 Cały zestaw E2E przechodzi: `npm run test:e2e`
- [ ] 5.2 Lint i typecheck przechodzą: `npm run lint` oraz `npm run typecheck`

#### Manual

- [ ] 5.3 Po przebiegu E2E konto testowe nie ma ustawionego celu (`GET /api/user-settings` zwraca `null`)
