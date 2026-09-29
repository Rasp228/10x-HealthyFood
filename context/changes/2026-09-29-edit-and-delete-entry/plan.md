# Edycja i usuwanie wpisu dziennika — plan wdrożenia

## Overview

Użytkownik poprawia dowolną część zapisanego wpisu — treść, ilość (tekst albo liczbę porcji),
wartość kaloryczną i dzień — oraz usuwa wpis po potwierdzeniu (FR-005, FR-006, roadmapa S-05).
Przeliczenie wartości po edycji dzieje się wyłącznie na jawne żądanie („Zapisz i przelicz”);
dopóki go nie ma, stoi wartość zapisana wraz ze swoim pochodzeniem. Automatyczne przeliczanie
skasowałoby po cichu liczbę poprawioną ręcznie — dokładnie to, przed czym chroni FR-004.

## Current State Analysis

- `src/pages/api/diary-entries/[id].ts:16-82` ma tylko wąski `PATCH`: jedno pole `calories`,
  wymagane i nigdy `null` (`src/lib/validations/diary/set-calories.ts:20-33`). Komentarz w tym pliku
  (:28-29) zapowiada, że stanie się on `update-entry.ts`, gdy edycja obejmie treść, ilość i dzień.
  Trasy `DELETE` nie ma.
- `DiaryService` (`src/lib/services/diary.service.ts`) nie ma metody edycji innych pól ani
  usuwania. `setCaloriesManually` (:238-263) zapisuje bezwarunkowo z pochodzeniem `manual`.
  `markEstimationRequested` (:153-179) i `applyEstimate` (:197-225) zapisują warunkowo, przy
  `.is("calories", null)`.
- Trasa `/estimate` (`src/pages/api/diary-entries/[id]/estimate.ts:73-77`) kończy się bez modelu,
  gdy wpis ma wartość. Przeliczenie wpisu z wartością wymaga więc najpierw wyzerowania wartości.
- Parser wartości odżywczych (`resolveRecipeCalories`, `src/lib/utils/recipe-nutrition.ts:236`)
  działa dziś tylko przy tworzeniu wpisu (`diary.service.ts:76-81`). Trasa `/estimate` od razu
  sięga po model.
- Reguły bazy (`supabase/migrations/20260922140906_create_diary_entries.sql`):
  - `diary_entries_value_has_origin` (:54-55) wiąże `calories` z `calorie_origin`;
  - reguły „wyzerowanie wartości zeruje `estimation_requested_at`” baza nie egzekwuje (:49-53),
    więc musi jej pilnować aplikacja;
  - polityki RLS UPDATE (:103-105) i DELETE (:107-109) istnieją;
  - nie ma triggera na `updated_at`, więc ustawia go kod aplikacji;
  - nie ma checku między `portions` a `source_recipe_id`.
- Wiersz-sierota (`docs/reference/known-drift.md`, „Reguła porcje tylko razem z przepisem”):
  po usunięciu przepisu zostaje wiersz `portions = 2`, `source_recipe_id = NULL`. Znalezisko
  wymaga, żeby schemat edycji go nie odrzucał. Przy wycenie taki wiersz idzie gałęzią opisową
  z `amount_text = null` i porcje giną (`estimate.ts:102-103`).
- UI (`src/components/diary/`):
  - wiersz `DiaryEntryList.tsx:50-75` nie ma akcji edycji ani usuwania;
  - `DiaryEntryCalories` pokazuje inline pole kalorii, które woła `DiaryPage.handleSetCalories`
    (`DiaryPage.tsx:116-142`, inline `fetch` PATCH);
  - kolejka wyceny `useCalorieEstimation` kluczuje po id wpisu i ma `estimate(id)` / `cancel(id)`;
  - `useDiaryEntries` odświeża stan tylko przez `refetch()`.
- Istniejące prymitywy:
  - `BaseModal` (`src/components/ui/BaseModal.tsx`);
  - `ConfirmDialog` (`src/components/common/ConfirmDialog.tsx`), bez `data-testid`, użyty przy
    usuwaniu przepisu w `HomePage.tsx:394-403`;
  - wzorzec „adjusting state when props change” w `RecipeFormModal.tsx:61-68`.
- E2E (`tests/e2e/diary-entry.spec.ts`): wpisy gromadzą się pod `SIGNATURE_DAY = "2000-01-01"`,
  bo nie było `DELETE`. `CleanupService` sprząta tylko przepisy.

## Desired End State

- **Edycja.** Każdy wiersz dziennika ma „Edytuj” i „Usuń”. „Edytuj” otwiera modal z polami
  wpisu: treść, ilość albo porcje (zależnie od kształtu wiersza), kalorie i dzień. Modal ma dwa
  przyciski:
  - **„Zapisz”** zapisuje zmienione pola i nie rusza wartości ani pochodzenia, chyba że użytkownik
    sam zmienił albo wyczyścił liczbę;
  - **„Zapisz i przelicz”** zapisuje zmiany, zeruje wartość i uruchamia kaskadę: parser przepisu,
    a gdy ten nic nie znajdzie, wycenę AI z kolejki.
- **Usuwanie** wymaga potwierdzenia w `ConfirmDialog`. Po usunięciu wpis znika, a suma dnia się
  przelicza.
- **Zmiana dnia.** Wpis przeniesiony na inny dzień znika z bieżącej listy, a toast mówi, dokąd
  trafił. Widok zostaje na bieżącym dniu.
- **Sierota.** Wiersz-sierota przechodzi edycję, a jego przeliczenie wysyła do modelu ilość
  w postaci liczby porcji.
- Weryfikacja: testy jednostkowe walidacji, serwisu i tras; scenariusze E2E edycji, przeliczenia,
  zmiany dnia i usunięcia; ręczne przejście po UI.

### Key Discoveries:

- `set-calories.ts:28-29` — ten plik miał się stać `update-entry.ts`; `entryIdSchema` (:12-16)
  zostaje tam, gdzie jest, i jest dalej importowany przez `estimate.ts`.
- `create-entry.ts:35-63` — `caloriesValueSchema` i `portionsSchema` są wspólne dla tworzenia
  i edycji. Edycja ich nie poszerza: `null` dokłada schemat edycji, nie reguła wartości
  (`context/archive/2026-09-23-ai-estimate-for-free-text/change.md:27-30`).
- `diary.service.ts:156-158` — `.maybeSingle()` zamiast `.single()` przy zapisach warunkowych.
  Dla bezwarunkowego zapisu `setCaloriesManually` używa `.single()` i kodu `PGRST116` (:252-257).
- `estimate.ts:143-146` — ciało odpowiedzi `/estimate` jest kontraktem, który dziedziczy S-05;
  tej trasy nie przebudowujemy.
- `useCalorieEstimation.ts` — `estimate(id)` usuwa id z `settledIds` i wraca do fazy `live`,
  więc wpis wyzerowany przez „Zapisz i przelicz” przechodzi przez istniejące stany „W kolejce…” /
  „Liczę…” bez nowego kodu.
- `DiaryEntryForm.tsx:41, 201-216` — błędy walidacji rozdzielane po `issue.path[0]`, a klucze
  spoza `FIELD_KEYS` trafiają do ogólnej ramki. Modal edycji stosuje to samo mapowanie.

## What We're NOT Doing

- Migracja, nowe kolumny, trigger `updated_at`, check na parę `portions`/`source_recipe_id`.
- Zmiana przepisu wpisu. `source_recipe_id` jest niezmienny: nie podpinamy przepisu do wpisu
  opisowego i nie odpinamy go od wpisu z przepisu. Zmiana przepisu to usunięcie i nowy wpis.
- Konwersja wpisu między kształtami (porcje ↔ tekst ilości), także dla sieroty.
- Przycisk „Przelicz” w wierszu listy. Przeliczenie zleca się wyłącznie z modala edycji.
- Automatyczne przeliczanie po zmianie treści, ilości albo porcji. Wartość i pochodzenie stoją
  do jawnego „Zapisz i przelicz”.
- Utrzymywanie starej wartości do przyjścia nowej. „Zapisz i przelicz” zeruje ją od razu.
- Limit częstości i deduplikacja wywołań modelu (znalezisko F2 w `known-drift.md`). Zostaje
  otwarte i jest rozszerzane o ścieżkę przeliczenia.
- Serwerowa blokada przyszłych dat. Ograniczenie do „dziś” zostaje po stronie klienta, jak przy
  tworzeniu wpisu.
- Cofnięcie usunięcia (undo) i miękkie usuwanie.
- Przenoszenie tras `recipes`/`preferences` na wzorzec serwisowy i inne wpisy z known-drift
  niezwiązane z dziennikiem.

## Implementation Approach

Serwer najpierw, potem powierzchnia, na końcu E2E — ten sam układ co S-04. Poszerzony `PATCH`
przyjmuje częściowe ciało: zmienia tylko pola, które przyszły. Dzięki temu obecne wywołanie
`{calories: N}` z pola w wierszu działa bez zmian, a wartość i pochodzenie stoją, dopóki
użytkownik ich jawnie nie dotknie. Przeliczenie nie ma własnej trasy. `recalculate: true` zeruje
wartość i znacznik w tym samym zapisie, a dla wpisu z istniejącym przepisem od razu uruchamia
parser, jak przy tworzeniu wpisu. Gdy parser nie ustali wartości, przeglądarka kolejkuje
niezmienione `POST /estimate`. Cała reszta — warunkowe zapisy, wygrana liczby wpisanej ręcznie
w wyścigu, stany wiersza — zostaje taka, jaka jest.

Reguły kształtu ilości zależą od zapisanego wiersza, nie od ciała żądania. Dlatego schemat Zod
pilnuje tylko kształtu pól, a regułę „porcje tylko w wierszu, który je ma; tekst ilości tylko
w wierszu bez porcji” sprawdza serwis typowanym błędem, który trasa zamienia na 400 z `path`.

## Critical Implementation Details

- **Kolejność zapisu przy przeliczeniu.** Dla wpisu z przepisem parser musi dostać porcje
  **po** edycji: nowe, jeśli przyszły w tym samym żądaniu, inaczej zapisane. Wynik parsera
  i zmiany pól idą w jednym UPDATE. Nie zapisujemy najpierw pól, a potem wyniku — między
  zapisami wiersz byłby bez wartości przy starym `estimation_requested_at`.
- **Zerowanie wartości zawsze zeruje znacznik.** Każda gałąź, która ustawia `calories = null`
  (`calories: null` albo `recalculate: true`), ustawia w tym samym UPDATE `calorie_origin = null`
  i `estimation_requested_at = null`. Bez tego `resolveEstimationState` pokazałby wiersz jako
  „Liczę…”/„Policz ponownie” według starego znacznika.
- **Kolejka a mutacje.** Przed zapisem edycji i przed usunięciem przeglądarka woła `cancel(id)`.
  Po „Zapisz i przelicz” woła `estimate(id)` tylko wtedy, gdy odpowiedź ma `calories === null`
  i wpis został na bieżącym dniu. Wpis przeniesiony na inny dzień nie trafia do kolejki, bo jego
  wiersz zniknął z listy; zostaje z „Policz kalorie” na swoim nowym dniu.

## Faza 1: Kontrakt serwera

### Overview

Schemat edycji, metody serwisu, poszerzony `PATCH`, nowy `DELETE`, porcje sieroty w wycenie,
testy jednostkowe i asercje RLS dla UPDATE/DELETE.

### Changes Required:

#### 1. Schemat edycji

**File**: `src/lib/validations/diary/update-entry.ts` (nowy); `src/lib/validations/diary/set-calories.ts`

**Intent**: Jeden schemat częściowej edycji wpisu, który zastępuje `setEntryCaloriesSchema`.
`entryIdSchema` zostaje w `set-calories.ts` albo przechodzi do nowego pliku; wybór należy do
implementującego, byle importy w `estimate.ts` i `[id].ts` się zgadzały. Po przeniesieniu
`setEntryCaloriesSchema` jest usuwany razem z `SetEntryCaloriesCommand`. Jego jedyny kliencki
użytkownik (`DiaryEntryCalories.handleSave`) przechodzi na wspólną regułę `caloriesValueSchema`
albo na nowy schemat.

**Contract**: `updateDiaryEntrySchema` — obiekt z polami opcjonalnymi:
- `entry_date` (`entryDateSchema`);
- `content` (ta sama reguła trim/1–500 co przy tworzeniu);
- `amount_text` (ta sama reguła i transformacja pustego napisu na `null`);
- `portions` (`portionsSchema`, bez `null`);
- `calories` (`caloriesValueSchema.nullable()`);
- `recalculate` (`z.literal(true)`).

Obiekt jest `.strict()`, więc `source_recipe_id`, `calorie_origin`, `user_id` i
`estimation_requested_at` w ciele dają 400. Reguły wzajemne idą w `superRefine`, z `path`:
- `recalculate` razem z `calories` daje issue na `calories`;
- ciało bez żadnego pola daje issue bez sensu dla pola — `path: []` trafia do ogólnej ramki.

Typy `UpdateDiaryEntrySchema` i `UpdateDiaryEntryCommand` (w `src/types.ts`, obok
`CreateDiaryEntryCommand`).

#### 2. Serwis: edycja i usuwanie

**File**: `src/lib/services/diary.service.ts`

**Intent**: Dwie nowe metody i typowany błąd kształtu. `updateEntry` czyta wiersz użytkownika,
sprawdza kształt ilości względem niego, ustala `calories`/`calorie_origin`/`estimation_requested_at`
i robi jeden UPDATE. `deleteEntry` usuwa wiersz użytkownika. `setCaloriesManually` znika —
jego przypadek to `updateEntry` z samym `calories`.

**Contract**:
- `class EntryShapeError extends Error { path: "portions" | "amount_text" }`, w idiomie
  `RecipeNotFoundError`.
- `updateEntry(userId, entryId, command: UpdateDiaryEntryCommand): Promise<DiaryEntryDto | null>`.
  - `null` znaczy „nie ma takiego wpisu u tego użytkownika”.
  - `portions` na wierszu z `portions === null` rzuca `EntryShapeError("portions")`.
  - `amount_text` różne od `null` na wierszu z `portions !== null` rzuca
    `EntryShapeError("amount_text")`. Sierota (`portions` bez `source_recipe_id`) przyjmuje
    `portions`.
  - Wartość:
    - brak `calories` i `recalculate` — kolumny wartości nietknięte;
    - `calories: N` — `N` / `manual`;
    - `calories: null` — `null` / `null` / znacznik `null`;
    - `recalculate: true` — jak `null`, chyba że `readOwnRecipeContent` oddał treść i
      `resolveRecipeCalories(treść, porcje_po_edycji).total` nie jest `null`; wtedy
      `total` / `recipe_nutrition` / znacznik `null`.
  - `RecipeNotFoundError` z `readOwnRecipeContent` na tej ścieżce nie jest błędem, tylko brakiem
    treści.
  - `updated_at` ustawiane jawnie.
  - UPDATE filtrowany po `id` i `user_id`, `.select().maybeSingle()`.
- `deleteEntry(userId, entryId): Promise<boolean>` — DELETE po `id` i `user_id` z `.select("id")`;
  `false`, gdy nic nie usunięto.

#### 3. Trasa `[id]`: `PATCH` i `DELETE`

**File**: `src/pages/api/diary-entries/[id].ts`

**Intent**: `PATCH` parsuje `updateDiaryEntrySchema` i deleguje do `updateEntry`. `DELETE`
deleguje do `deleteEntry`. Szkielet obu handlerów jest taki sam jak obecnego `PATCH`: 401,
400 na id, JSON-parse z `.catch(() => null)`, stały komunikat 500 bez szczegółów, a pełny błąd
w logu. Nagłówek JSDoc opisuje nowy, szerszy kontrakt.

**Contract**:
- `PATCH /api/diary-entries/:id`:
  - 200 z wierszem;
  - 400 `{error, details: zodIssues(...)}` przy błędzie schematu;
  - 400 `{error, details: [{path: [e.path], message}]}` przy `EntryShapeError`, w kształcie
    `ValidationIssue`;
  - 404 dla cudzego lub nieistniejącego wpisu.
  Dotychczasowe ciało `{calories: N}` daje identyczny wynik jak dziś.
- `DELETE /api/diary-entries/:id`: 204 bez ciała, 404 `{error: "Wpis nie został znaleziony"}`.
- `export const prerender = false` zostaje.

#### 4. Porcje sieroty w wycenie

**File**: `src/pages/api/diary-entries/[id]/estimate.ts`

**Intent**: Na gałęzi opisowej wiersz z `portions !== null` (sierota — przepis usunięty albo
cudzy) wysyła do modelu ilość `formatPortions(portions)` zamiast `amount_text`. Zwykłe wpisy
opisowe (`portions === null`) idą bez zmian. Komentarz w miejscu gałęzi odsyła do decyzji
w tym planie.

**Contract**: argument `amountText` przekazywany do `estimateFromDescription` przy
`recipeContent === null` to
`entry.portions !== null ? formatPortions(entry.portions) : entry.amount_text`. Pochodzenie
zostaje `ai_from_description`, wynik nie jest mnożony.

#### 5. Testy jednostkowe

**File**: `tests/unit/diary-validations.test.ts`, `tests/unit/diary-service.test.ts`,
`tests/unit/diary-estimate-route.test.ts`, nowy `tests/unit/diary-entry-route.test.ts`

**Intent**: Pokrycie nowego kontraktu. Nowy plik trasy stosuje wzorzec
`diary-estimate-route.test.ts`: `@jest-environment node`, prawdziwy `DiaryService` z podmienionymi
metodami.

**Contract** — przypadki nazwane:
- **Schemat:**
  - częściowe ciało przechodzi;
  - puste ciało daje 400;
  - `recalculate` + `calories` daje issue na `calories`;
  - `source_recipe_id` w ciele jest odrzucane;
  - `calories: null` przechodzi;
  - `portions: null` jest odrzucane;
  - pusty `amount_text` zamienia się na `null`.
- **Serwis:**
  - edycja samej treści nie dotyka kolumn wartości;
  - `calories: null` zeruje trzy kolumny;
  - `recalculate` na wpisie z przepisem z blokiem wartości daje `recipe_nutrition` z porcjami
    po edycji;
  - `recalculate` na wpisie z przepisem bez bloku daje `null`;
  - `recalculate` na sierocie daje `null` bez błędu;
  - `portions` na wpisie opisowym daje `EntryShapeError("portions")`;
  - `amount_text` na wpisie z porcjami daje `EntryShapeError("amount_text")`;
  - sierota przyjmuje nowe `portions`;
  - `deleteEntry` na cudzym wpisie daje `false`.
- **Trasa `[id]`:**
  - 401;
  - 400 na id;
  - 400 z `path` z `EntryShapeError`;
  - 404 na `PATCH` i `DELETE`;
  - 204 na `DELETE`;
  - `{calories: N}` zwraca wiersz z `manual`;
  - 500 bez szczegółów.
- **Trasa `/estimate`:** sierota z `portions = 2` wysyła `"2 porcje"` jako ilość; zwykły wpis
  opisowy dalej wysyła `amount_text`.

#### 6. Asercje RLS dla UPDATE i DELETE

**File**: `supabase/checks/diary-entries-rls.sql`

**Intent**: Skrypt sprawdza dziś tylko izolację SELECT (sekcja 3). Nowe trasy opierają się na
politykach UPDATE i DELETE, więc dopisujemy próby zmiany i usunięcia cudzego wiersza pod
podszytym `request.jwt.claims`. Obie mają trafić zero wierszy. Werdykt zostaje w istniejącym
wyjątku `[PASS]`/`[FAIL]`.

**Contract**: nowe asercje w bloku asercji: `update … where id = <wiersz B>` jako A zmienia
0 wierszy, a `delete … where id = <wiersz B>` jako A usuwa 0 wierszy. Placeholdery `<uuid-a>` /
`<uuid-b>` bez zmian.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą: `npm run test`
- Typy bez błędów: `npm run typecheck`
- Lint przechodzi: `npm run lint`
- Formatowanie zgodne: `npm run format:check`
- W `src/` nie ma już odwołań do `setCaloriesManually` ani `setEntryCaloriesSchema` (`grep -rn "setCaloriesManually\|setEntryCaloriesSchema" src` nic nie zwraca)

#### Manual Verification:

- `supabase/checks/diary-entries-rls.sql` kończy się `[PASS]` (edytor SQL Supabase, podstawione UUID)
- `PATCH` z `{calories: N}` z pola w wierszu dalej zapisuje liczbę „wpisane ręcznie”

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na ręczne
potwierdzenie przed fazą 2.

---

## Faza 2: Powierzchnia dziennika

### Overview

Akcje „Edytuj” i „Usuń” w wierszu, modal edycji z „Zapisz” / „Zapisz i przelicz”, dialog
potwierdzenia usunięcia, obsługa mutacji w `DiaryPage`.

### Changes Required:

#### 1. Modal edycji wpisu

**File**: `src/components/diary/DiaryEntryEditModal.tsx` (nowy)

**Intent**: Formularz edycji na `BaseModal`, zasiewany z wpisu wzorcem „adjusting state when
props change” (klucz `${isOpen}:${entry?.id}`, jak w `RecipeFormModal.tsx:61-68`).

Pola zależą od kształtu wiersza:
- zawsze treść, kalorie (puste = „nie policzono”) i dzień (`type="date"`, `max` = dziś);
- porcje, gdy `entry.portions !== null`, w przeciwnym razie tekst ilości.

Wysyłane są tylko pola zmienione względem wpisu, więc „Zapisz” bez zmiany liczby nie dotyka
pochodzenia. „Zapisz i przelicz” dokłada `recalculate: true`, nie wysyła `calories` i jest
nieaktywne, gdy użytkownik wpisał w modalu liczbę. Pod przyciskiem stoi `AI_NOTICE` /
`AI_NOTICE_RECIPE` (według `source_recipe_id`).

Walidacja na żywo i przy zapisie przez `updateDiaryEntrySchema`, błędy rozdzielane po
`issue.path[0]`. Błędy 400 z serwera, w tym `EntryShapeError`, trafiają pod pola z `details`.
Wyjście w dół przez `onSaved(updated)`.

**Contract**:
- Props: `{ entry: DiaryEntryDto | null; isOpen: boolean; today: string; onClose(): void;
  onSaved(entry: DiaryEntryDto, recalculated: boolean): void }`.
- `data-testid`: `diary-edit-modal`, `diary-edit-content-input`, `diary-edit-amount-input`,
  `diary-edit-portions-input`, `diary-edit-calories-input`, `diary-edit-date-input`,
  `diary-edit-save-button`, `diary-edit-save-recalculate-button`, błędy `diary-edit-<pole>-error`,
  ramka ogólna `diary-edit-form-error`.
- Zapis to inline `fetch` `PATCH /api/diary-entries/:id`, jak pozostałe wywołania dziennika.

#### 2. Akcje w wierszu

**File**: `src/components/diary/DiaryEntryList.tsx`

**Intent**: Każdy wiersz dostaje przyciski „Edytuj” i „Usuń” (`button.tsx`, warianty
`ghost`/`outline` i `size="sm"`, ikony lucide `Pencil` / `Trash2` z `aria-label`). Oba są
nieaktywne, gdy wpis jest w locie (`inFlightId === entry.id`).

**Contract**: nowe props `onEdit(entry: DiaryEntryDto): void`, `onDelete(entry: DiaryEntryDto): void`;
`data-testid` `diary-entry-edit-button`, `diary-entry-delete-button` wewnątrz `diary-entry-${id}`.

#### 3. `ConfirmDialog` z identyfikatorami testowymi

**File**: `src/components/common/ConfirmDialog.tsx`

**Intent**: Opcjonalny prop `data-testid` przekazywany do `BaseModal`, a przyciski dostają
`${testid}-confirm` / `${testid}-cancel`, gdy prop jest podany. Istniejące użycia bez zmian.

**Contract**: `"data-testid"?: string`. Brak propu nie zmienia renderowanego DOM.

#### 4. Obsługa mutacji w `DiaryPage`

**File**: `src/components/diary/DiaryPage.tsx`

**Intent**: Stan `entryToEdit` i `entryToDelete`. `ConfirmDialog` ma tytuł „Usuń wpis”, treść
z nazwą wpisu, `severity="danger"` i `data-testid="diary-delete-confirm"`.

- **Potwierdzenie usunięcia:** `cancel(id)`, potem inline `fetch` `DELETE`, potem `refetch()`
  i toast „Wpis został usunięty”. 404 traktujemy jak sukces z odświeżeniem, bo wpisu już nie ma.
  Inny błąd daje toast błędu.
- **`onSaved`:** `cancel(id)`, potem `refetch()`. Gdy `entry_date` się zmieniło, toast
  „Wpis przeniesiono na <dzień>”; w przeciwnym razie „Wpis został zapisany”. Gdy `recalculated`,
  `calories === null` i dzień się nie zmienił, `estimate(id)`.
- `handleSetCalories` zostaje na nowym `PATCH`, z tym samym ciałem.

**Contract**: dzień w toaście formatowany tą samą funkcją, której używa `DayNavigator` albo
`diary-day.ts`, bez nowego formatera. `<ToastContainer />` już jest wyrenderowany (:202).

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą: `npm run test`
- Typy bez błędów: `npm run typecheck`
- Lint, w tym reguły React Compiler, przechodzi: `npm run lint`
- Formatowanie zgodne: `npm run format:check`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Edycja samej treści zostawia liczbę i etykietę pochodzenia
- Zmiana porcji i „Zapisz i przelicz” daje wartość „z przepisu” bez modelu
- „Zapisz i przelicz” na wpisie opisowym przechodzi przez kolejkę do nowej wartości AI
- Wyczyszczenie liczby daje „Nie policzono” i zmienia sumę dnia
- Zmiana dnia usuwa wpis z listy, pokazuje toast i wpis jest na nowym dniu
- Usunięcie wymaga potwierdzenia, „Anuluj” zostawia wpis
- Modal i dialog działają z klawiatury i na szerokości telefonu

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na ręczne
potwierdzenie przed fazą 3.

---

## Faza 3: E2E i porządki

### Overview

Scenariusze Playwright dla edycji, przeliczenia, zmiany dnia i usunięcia; sprzątanie wpisów
dziennika po testach; aktualizacja `known-drift.md`.

### Changes Required:

#### 1. Page object dziennika

**File**: `tests/e2e/page-objects/DiaryPage.ts`

**Intent**: Metody dla nowych akcji, oparte na `entryRow(content)` i identyfikatorach z fazy 2.

**Contract**: `openEdit(content)`, `editEntry(content, changes)`, `saveEdit()`,
`saveEditAndRecalculate()`, `expectEditError(field, message?)`, `deleteEntry(content)` (z
potwierdzeniem), `cancelDelete(content)`, `expectEntryAbsent(content)`.

#### 2. Scenariusze E2E

**File**: `tests/e2e/diary-entry.spec.ts`

**Intent**: Nowe testy na `SIGNATURE_DAY` i dniu sąsiednim. Model nie jest wołany w żadnym
teście. Scenariusz przeliczenia korzysta z przepisu z blokiem wartości, więc wynik ustala
parser, bez udziału AI.

**Contract** — testy nazwane:
- edycja treści zostawia wartość i pochodzenie;
- zmiana porcji wpisu z przepisem i „Zapisz i przelicz” daje nową wartość „z przepisu”;
- wyczyszczenie liczby daje „Nie policzono” i zmienia sumę dnia;
- zmiana dnia przenosi wpis i pokazuje toast;
- usunięcie z anulowaniem, a potem z potwierdzeniem.

Komentarz przy `SIGNATURE_DAY` o braku trasy `DELETE` jest aktualizowany.

#### 3. Sprzątanie wpisów dziennika

**File**: `tests/e2e/services/cleanup.service.ts`, `tests/e2e/diary-entry.spec.ts`

**Intent**: `deleteDiaryEntriesForDays(days: string[])` pobiera `GET /api/diary-entries?date=`
dla każdego dnia i usuwa wpisy przez `DELETE` z nagłówkiem `Origin`. `afterEach` sprząta
`SIGNATURE_DAY` i dzień używany w scenariuszu zmiany dnia, **przed** usunięciem przepisów.

**Contract**: zwraca `{ deleted: number; errors: string[] }` jak `deleteAllTestUserRecipes`.
Kolejność: wpisy, potem przepisy. Inaczej usunięcie przepisu zostawiałoby sieroty.

#### 4. Aktualizacja known-drift

**File**: `docs/reference/known-drift.md`

**Intent**: Sekcja „Reguła porcje tylko razem z przepisem…” opisuje teraz stan po S-05:
- schemat edycji przyjmuje sierotę;
- wycena wysyła jej porcje jako ilość;
- zostaje tylko brak reguły w bazie, bo migracja jest wciąż wykluczona.

Akapit o E2E bez sprzątania wpisów usuwamy. Sekcja F2 dostaje zdanie o ścieżce „Zapisz
i przelicz”, która także woła model bez limitu.

**Contract**: bez nowych sekcji. Treść po polsku, w stylu istniejących wpisów.

### Success Criteria:

#### Automated Verification:

- Scenariusze E2E dziennika przechodzą: `npm run test:e2e -- tests/e2e/diary-entry.spec.ts`
- Testy jednostkowe przechodzą: `npm run test`
- Typy bez błędów: `npm run typecheck`
- Lint przechodzi: `npm run lint`
- Formatowanie zgodne: `npm run format:check`

#### Manual Verification:

- Po E2E konto testowe nie ma wpisów pod dniami scenariuszy
- `known-drift.md` opisuje stan sieroty i F2 zgodnie z kodem

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na ręczne
potwierdzenie przed zamknięciem zmiany.

---

## Testing Strategy

### Unit Tests:

- Schemat edycji: częściowe ciało, puste ciało, `recalculate` + `calories`, pola zakazane,
  `calories: null`, transformacja pustego `amount_text`.
- Serwis: każda gałąź ustalania wartości, reguły kształtu ilości względem zapisanego wiersza,
  sierota, `deleteEntry` bez trafienia.
- Trasy: statusy 200/204/400/401/404/500 dla `PATCH` i `DELETE`; porcje sieroty w `/estimate`.

### Integration Tests:

- E2E z fazy 3: edycja bez przeliczenia, przeliczenie parserem, wyczyszczenie liczby, zmiana
  dnia, usunięcie z potwierdzeniem i bez.

### Manual Testing Steps:

1. Dodaj wpis opisowy, policz go przez AI, zmień treść i „Zapisz” — liczba i etykieta AI stoją.
2. Ten sam wpis: „Zapisz i przelicz” — wiersz przechodzi przez „Liczę…” do nowej wartości.
3. Wpis z przepisu z blokiem wartości: zmień porcje z 1 na 2 i „Zapisz i przelicz” — wartość
   się podwaja, etykieta „z przepisu”.
4. Wyczyść liczbę i zapisz — „Nie policzono”, suma dnia i licznik brakujących się zmieniają.
5. Przenieś wpis na wczoraj — znika z listy, toast z datą, wpis widoczny na wczorajszym dniu.
6. Usuń wpis — „Anuluj” zostawia go, potwierdzenie usuwa.
7. Na telefonie (DevTools, 375 px) modal i dialog mieszczą się i obsługują dotyk.

## Performance Considerations

`updateEntry` robi odczyt wiersza przed UPDATE (i przy `recalculate` odczyt przepisu), czyli
jedno lub dwa zapytania więcej na zapis. Przy 3–4 użytkownikach bez znaczenia. Po każdej
mutacji `refetch()` pokazuje spinner listy — istniejące zachowanie, nie poprawiamy go tutaj.

## Migration Notes

Brak migracji i zmian danych. Wiersze-sieroty zostają, jakie są. Po zmianie da się je edytować
i przeliczyć z uwzględnieniem porcji.

## References

- Roadmapa: `context/foundation/roadmap.md` (S-05)
- PRD: `context/foundation/prd.md:141-145` (FR-005, FR-006)
- Znaleziska: `docs/reference/known-drift.md` (sierota, F2)
- Poprzednie zmiany: `context/archive/2026-09-23-ai-estimate-for-free-text/plan.md` (wąski
  `PATCH`, zapowiedź `update-entry.ts`), `context/archive/2026-09-25-recipe-entry-with-portions/reviews/impl-review.md`
  (F3), `context/archive/2026-09-25-ai-estimate-from-recipe/plan.md` (D3, D6)
- Wzorce: `src/components/recipe/RecipeFormModal.tsx:61-68`, `src/components/pages/HomePage.tsx:394-403`,
  `tests/unit/diary-estimate-route.test.ts`

## Addenda

- **Sprzątanie E2E tylko po zdanym teście** (faza 3, pkt 3; przegląd wdrożenia, F5). `afterEach`
  w `tests/e2e/diary-entry.spec.ts` sprząta `SCENARIO_DAYS` wyłącznie wtedy, gdy test przeszedł.
  Nieudany test zostawia swoje wiersze pod `2000-01-01`/`1999-12-31` do obejrzenia, bo tych dni
  nikt w dzienniku nie otwiera. Koszt: po porażce następny przebieg zaczyna z tymi wierszami, więc
  asercje sumy dnia mogą się rozjechać, dopóki następny zdany test ich nie sprzątnie albo nie
  zrobimy tego ręcznie.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Kontrakt serwera

#### Automated

- [x] 1.1 Testy jednostkowe przechodzą: `npm run test` — a5bd9b7
- [x] 1.2 Typy bez błędów: `npm run typecheck` — a5bd9b7
- [x] 1.3 Lint przechodzi: `npm run lint` — a5bd9b7
- [x] 1.4 Formatowanie zgodne: `npm run format:check` — a5bd9b7
- [x] 1.5 W `src/` nie ma już odwołań do `setCaloriesManually` ani `setEntryCaloriesSchema` (`grep -rn "setCaloriesManually\|setEntryCaloriesSchema" src` nic nie zwraca) — a5bd9b7

#### Manual

- [ ] 1.6 `supabase/checks/diary-entries-rls.sql` kończy się `[PASS]` (edytor SQL Supabase, podstawione UUID)
- [x] 1.7 `PATCH` z `{calories: N}` z pola w wierszu dalej zapisuje liczbę „wpisane ręcznie” — a5bd9b7

### Phase 2: Powierzchnia dziennika

#### Automated

- [x] 2.1 Testy jednostkowe przechodzą: `npm run test` — 989c838
- [x] 2.2 Typy bez błędów: `npm run typecheck` — 989c838
- [x] 2.3 Lint, w tym reguły React Compiler, przechodzi: `npm run lint` — 989c838
- [x] 2.4 Formatowanie zgodne: `npm run format:check` — 989c838
- [x] 2.5 Build przechodzi: `npm run build` — 989c838

#### Manual

- [x] 2.6 Edycja samej treści zostawia liczbę i etykietę pochodzenia — 989c838
- [x] 2.7 Zmiana porcji i „Zapisz i przelicz” daje wartość „z przepisu” bez modelu — 989c838
- [x] 2.8 „Zapisz i przelicz” na wpisie opisowym przechodzi przez kolejkę do nowej wartości AI — 989c838
- [x] 2.9 Wyczyszczenie liczby daje „Nie policzono” i zmienia sumę dnia — 989c838
- [x] 2.10 Zmiana dnia usuwa wpis z listy, pokazuje toast i wpis jest na nowym dniu — 989c838
- [x] 2.11 Usunięcie wymaga potwierdzenia, „Anuluj” zostawia wpis — 989c838
- [x] 2.12 Modal i dialog działają z klawiatury i na szerokości telefonu — 989c838

### Phase 3: E2E i porządki

#### Automated

- [x] 3.1 Scenariusze E2E dziennika przechodzą: `npm run test:e2e -- tests/e2e/diary-entry.spec.ts` — 157ebb5
- [x] 3.2 Testy jednostkowe przechodzą: `npm run test` — 157ebb5
- [x] 3.3 Typy bez błędów: `npm run typecheck` — 157ebb5
- [x] 3.4 Lint przechodzi: `npm run lint` — 157ebb5
- [x] 3.5 Formatowanie zgodne: `npm run format:check` — 157ebb5

#### Manual

- [x] 3.6 Po E2E konto testowe nie ma wpisów pod dniami scenariuszy — 157ebb5
- [x] 3.7 `known-drift.md` opisuje stan sieroty i F2 zgodnie z kodem — 157ebb5
