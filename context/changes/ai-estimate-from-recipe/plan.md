# Oszacowanie kalorii z treści przepisu — plan wdrożenia

## Overview

Trasa wyceny kalorii przestaje widzieć wyłącznie pole `content` wpisu. Dla wpisu utworzonego
z własnego przepisu czyta treść tego przepisu, pyta model o wartość **jednej porcji**, mnoży ją
przez `portions` i zapisuje z pochodzeniem `ai_from_recipe`. Ścieżka opisowa zostaje dokładnie taka,
jaka jest dzisiaj.

To domknięcie kaskady FR-009 → FR-010: przepis, który nie deklaruje wartości odżywczych na porcję,
przestaje być ślepym zaułkiem prowadzącym do wpisania liczby z palca. Zamyka też znalezisko F1
z `docs/reference/known-drift.md`, gdzie wiersz pokazywał „3 porcje" obok wartości niepomnożonej
przez trzy, z etykietą „oszacowane z opisu" na wpisie pochodzącym z przepisu.

## Current State Analysis

**Co już jest i czego ta zmiana nie buduje:**

- **Baza jest gotowa.** `calorie_origin_enum` niesie wartość `ai_from_recipe` od migracji F-01
  (`src/db/database.types.ts`); kolumny `portions numeric(6,2)` i `source_recipe_id` wypełnia S-03.
  Ograniczenie `diary_entries_value_has_origin` wymusza zapis `calories` i `calorie_origin` razem.
  **Żadnej migracji.**
- **Mechanika „zapisz teraz, wartość później" działa.** `markEstimationRequested`
  (`src/lib/services/diary.service.ts:148`) stempluje wiersz, kolejka FIFO
  (`src/hooks/diary/useCalorieEstimation.ts`) trzyma jedno żądanie w locie,
  `resolveEstimationState` (`src/lib/utils/diary-estimation.ts:53`) rysuje cztery stany wartości.
- **Parser bloku odżywczego rozróżnia dwa powody braku wartości.**
  `resolveRecipeCalories` (`src/lib/utils/recipe-nutrition.ts:230`) zwraca `no_declared_block`
  albo `out_of_range` — to pierwsze jest dokładnie wyzwalaczem ścieżki FR-010.
- **Formularz już dziś zna granicę między S-03 a S-04.** `recipeAlreadyCounted`
  (`src/components/diary/DiaryEntryForm.tsx:284`) gasi przycisk „Zapisz i policz kalorie", gdy blok
  odżywczy dał wartość. Gdy nie dał — przycisk zostaje aktywny i **to jest wejście w tę zmianę**.

**Czego brakuje — trzy miejsca, i tylko trzy:**

1. `src/pages/api/diary-entries/[id]/estimate.ts:70` woła bezwarunkowo
   `estimateFromDescription(entry.content, entry.amount_text)`. Trasa nigdy nie czyta
   `source_recipe_id` ani `portions`.
2. `DiaryService.applyEstimate` (`src/lib/services/diary.service.ts:188`) zaszywa
   `calorie_origin: "ai_from_description"` na sztywno (`:193`).
3. `ORIGIN_LABELS` (`src/components/diary/DiaryEntryCalories.tsx:25`) nie ma wiersza dla
   `ai_from_recipe`; komentarz nad nim (`:22`) wprost zapowiada, że dołoży go ta zmiana.

**Trzy ograniczenia odkryte przy badaniu, które kształtują plan:**

- **Wpis z przepisu ma `amount_text = null`.** Reguła wzajemna w `createDiaryEntrySchema`
  (`src/lib/validations/diary/create-entry.ts:120-128`) zabrania pary „przepis + ilość tekstowa".
  Dzisiejsza wycena wysyła więc do modelu **sam tytuł przepisu** i słowo „nie podano".
- **Pole `content` wpisu jest edytowalne.** S-03 wstawia tam tytuł przepisu, ale zostawia pole
  otwarte (`DiaryEntryForm.tsx:174`), więc to jedyne miejsce, gdzie może stać poprawka użytkownika
  („bez sera", „pół blachy").
- **`readOwnRecipeContent` jest prywatne** (`src/lib/services/diary.service.ts:115`) i rzuca
  `RecipeNotFoundError`. Trasa wyceny potrzebuje tego odczytu, ale **nie** może zamieniać jego
  porażki na 404 wpisu — wpis istnieje, brakuje tylko przepisu.

## Desired End State

Użytkownik wybiera własny przepis bez bloku odżywczego, podaje liczbę porcji i klika „Zapisz
i policz kalorie". Wpis pojawia się natychmiast. Chwilę później stoi przy nim wartość kaloryczna
z adnotacją **„oszacowane z przepisu"**, a liczba uwzględnia podaną liczbę porcji — dwie porcje
dają dwukrotność jednej. Przy przycisku stoi zdanie mówiące, że do dostawcy modelu pojedzie treść
przepisu, a nie tylko opis posiłku.

Wpis opisowy zachowuje się identycznie jak przed zmianą: to samo zdanie, to samo pochodzenie
`ai_from_description`, ten sam prompt.

**Jak to sprawdzić:** wpis z przepisu na 2 porcje i ten sam przepis na 1 porcję różnią się wartością
mniej więcej dwukrotnie, oba mają etykietę „oszacowane z przepisu"; wpis opisowy nadal ma
„oszacowane z opisu". `npm run typecheck` i `npm run lint` bez błędów, `npm run test` zielone.

### Key Discoveries:

- Trasa `/estimate` nie przyjmuje ciała żądania z rozmysłem (`estimate.ts:13-17`) — opis pochodzi
  z wiersza, nie od klienta. Ta zasada zostaje: treść przepisu też czytamy z bazy, nigdy z żądania.
- `CalorieEstimationService` celowo **nie** woła `setResponseFormat`
  (`calorie-estimation.service.ts:82-96`): domyślny model ignoruje `response_format`, a w pomiarach
  z 2026-09-24 jego obecność psuła treść odpowiedzi. Nowa metoda dzieli ten sam klient i ten sam
  `extractCalories`.
- `extractCalories` (`calorie-estimation.service.ts:139`) tnie odpowiedź do przedziału 0–5000.
  Dla wartości **na porcję** ta granica nadal jest sensowna, a iloczyn dostaje ją drugi raz.
- Klucz obcy `diary_entries_source_recipe_id_fkey` ma `on delete set null`, więc niezerowe
  `source_recipe_id` zawsze wskazuje istniejący wiersz — ale `portions` potrafi przeżyć bez niego
  (znalezisko F3 w `known-drift.md`).
- Precedens testowy: `tests/unit/calorie-estimation.service.test.ts` mockuje
  `openrouter.service`, więc suita nie płaci za wywołania modelu. Ta zmiana idzie tą samą drogą.

## What We're NOT Doing

- **Żadnej migracji.** `ai_from_recipe`, `portions` i `source_recipe_id` już są.
- **Żadnego zapisu do `recipes`.** FR-010 i FR-014 wprost tego zabraniają — wynik nie wraca do
  przepisu ani w żadnej postaci nie jest przy nim utrwalany.
- **Nie czytamy bloku odżywczego przy wycenie** (decyzja D2). Kaskada FR-009 rozstrzyga się przy
  tworzeniu wpisu; przycisk „Policz kalorie" realizuje wyłącznie FR-010.
- **Nie zamykamy znaleziska F2** z `known-drift.md` (decyzja D6): trasa wyceny nadal nie ma limitu
  częstości ani deduplikacji, a `estimation_requested_at` nadal nie ma czytelnika po stronie
  serwera.
- **Nie naprawiamy znaleziska „nagłówek deklarujący kilka porcji"** z przeglądu S-03 — to dług
  parsera, nie tej ścieżki.
- **Edycja i usuwanie wpisu (S-05), dzienny cel i pasek postępu (S-06)** — poza zakresem.
- **Żadnej nowej zależności, żadnej nowej zmiennej środowiskowej, żadnego zapisu do `logs`.**
  Obserwowalność jest zaparkowana do zamknięcia M-1.
- **Nie dotykamy `useCalorieEstimation`.** Kolejka, abort i timeout są niezmienione — zmienia się
  wyłącznie to, co serwer robi po drugiej stronie tego samego żądania.

## Implementation Approach

Rozgałęzienie żyje **w trasie**, a nie w serwisie modelu i nie w serwisie bazy. Trasa jest jedynym
miejscem, które widzi naraz wiersz wpisu i oba serwisy, więc tylko ona może rozstrzygnąć, którą
gałąź kaskady wpis obejmuje. Oba serwisy zostają cienkie i niezależne: `CalorieEstimationService`
dostaje treść i oddaje liczbę bez wiedzy o bazie, `DiaryService` zapisuje liczbę z podanym
pochodzeniem bez wiedzy o modelu.

Arytmetyka porcji jest **po stronie serwera** (decyzja D1). Model odpowiada na jedno pytanie —
ile kalorii ma jedna porcja — a mnożenie i zaokrąglenie robi kod, tak samo jak w
`resolveRecipeCalories`. Dzięki temu wynik dla 1,5 porcji daje się sprawdzić testem jednostkowym
bez wywołania modelu, a granica 5000 kcal nakłada się na iloczyn dokładnie tam, gdzie nakłada się
dzisiaj na iloczyn z bloku odżywczego.

Kaskada w trasie ma trzy gałęzie, w tej kolejności:

```
POST /api/diary-entries/[id]/estimate
  └── markEstimationRequested()                    [bez zmian]
        ├── entry.calories !== null                → 200, bez modelu       [bez zmian]
        ├── entry.source_recipe_id !== null
        │     └── readOwnRecipeContent()
        │           ├── treść jest  → estimateFromRecipe(treść, entry.content)
        │           │                 × (entry.portions ?? 1) → zaokrąglenie → bramka 0-5000
        │           │                 applyEstimate(..., "ai_from_recipe")
        │           └── RecipeNotFoundError → zejdź na gałąź opisową
        └── inaczej                                → estimateFromDescription()  [bez zmian]
                                                     applyEstimate(..., "ai_from_description")
```

Wiersz-sierota (`portions` bez `source_recipe_id`, po usuniętym przepisie) trafia do trzeciej
gałęzi bez żadnego dodatkowego warunku — brak `source_recipe_id` sam go tam kieruje (decyzja D3).

## Critical Implementation Details

**Kolejność w trasie: iloczyn liczymy PRZED `applyEstimate`, nie po.** `applyEstimate` zapisuje
warunkowo (`.is("calories", null)`), więc każda liczba, która do niego trafia, jest liczbą
gotową do wejścia w sumę dnia. Iloczyn przekraczający 5000 kcal nie może dojechać do zapisu —
musi zostać potraktowany jak brak wartości (odczyt wiersza i 200), inaczej wpis dostałby
`calories: 12000` i etykietę „oszacowane z przepisu", której suma dnia nie ma jak zakwestionować.

**`entry.portions` bywa `null` mimo niezerowego `source_recipe_id`.** Schemat tworzenia wpisu
wymusza tę parę (`create-entry.ts:129-137`), ale tylko w chwili zapisu; kolumna w bazie jej nie
pilnuje. `?? 1` w trasie jest tu obowiązkowe, nie defensywne — `null * cokolwiek` to `NaN`, które
przeszłoby zaokrąglenie i wywróciło się dopiero na ograniczeniu bazy.

## Phase 1: Kontrakt serwerowy

### Overview

Cała ścieżka od żądania do zapisanego wiersza z pochodzeniem `ai_from_recipe`, sprawdzalna
`curl`-em, bez ani jednej zmiany w UI. Ten kontrakt dziedziczy S-05, więc błąd w nim płaci się
dwa razy.

### Changes Required:

#### 1. Metoda wyceny z treści przepisu

**File**: `src/lib/services/calorie-estimation.service.ts`

**Intent**: Dołożyć drugą metodę pytającą model o kalorie **jednej porcji** przepisu, obok
istniejącej `estimateFromDescription`. Wiadomość systemowa jest własna, bo pytanie jest inne:
tam „ile ma ta porcja, którą opisano", tu „na ile porcji dzieli się ten przepis i ile ma jedna".
Klient OpenRoutera, `extractCalories` i granice 0–5000 zostają wspólne.

**Contract**: `estimateFromRecipe(recipeContent: string, entryNote: string | null): Promise<number | null>`
— zwraca kalorie **jednej porcji** albo `null`, gdy odpowiedź jest bezużyteczna; rzuca
`OpenRouterError` przy awarii dostawcy, dokładnie jak `estimateFromDescription`
(`calorie-estimation.service.ts:113`).

Drugi argument to pole `content` wpisu przekazane jako **własna notatka użytkownika**, nie jako
opis dania (decyzja D4). Wiadomość systemowa musi rozstrzygnąć pierwszeństwo, bo oba źródła potrafią
sobie przeczyć:

```
- Treść przepisu jest źródłem składników i ich ilości.
- Notatka użytkownika, jeśli jest, koryguje przepis (np. "bez sera", "połowa porcji sera").
  Gdy notatka jest samym tytułem przepisu albo nic nie wnosi, zignoruj ją.
- Zwracasz kalorie JEDNEJ porcji, nie całego przepisu.
- Jeśli przepis nie mówi, na ile porcji jest, przyjmij typowy podział dla takiego dania.
```

Format odpowiedzi zostaje ten sam — `{"calories": <liczba>}` albo `{"calories": null}` — żeby
`extractCalories` nie musiał znać dwóch kształtów.

#### 2. Pochodzenie jako parametr zapisu

**File**: `src/lib/services/diary.service.ts`

**Intent**: `applyEstimate` przestaje zaszywać `ai_from_description` (`:193`) i przyjmuje
pochodzenie od wywołującego. Warunek `.is("calories", null)`, odczyt rezerwowy i cała reszta
metody zostają bez zmian — to jedno pole, nie przebudowa.

**Contract**: `applyEstimate(userId: string, entryId: number, calories: number, origin: Extract<CalorieOriginEnum, "ai_from_description" | "ai_from_recipe">)`.

Typ zawężony, a nie pełny `CalorieOriginEnum`: ta metoda jest wyjściem dla oszacowań AI, a
`manual` i `recipe_nutrition` mają własne, bezwarunkowe ścieżki zapisu (`setCaloriesManually`,
`createEntry`). Bez zawężenia można by tą trasą zapisać `manual` na wpisie, którego użytkownik
nie tknął.

#### 3. Publiczny odczyt treści własnego przepisu

**File**: `src/lib/services/diary.service.ts`

**Intent**: Zdjąć `private` z `readOwnRecipeContent` (`:115`), żeby trasa wyceny mogła przeczytać
treść przepisu tym samym filtrem po `user_id`, którym czyta ją zapis wpisu. Ciało metody bez zmian.

**Contract**: `readOwnRecipeContent(userId: string, recipeId: number | null): Promise<string | null>`
— publiczna; nadal `null` dla `recipeId === null` i nadal `RecipeNotFoundError`, gdy wiersza nie ma
u tego użytkownika. Komentarz metody dostaje zdanie o drugim wywołującym: trasa wyceny traktuje ten
rzut jako zejście na gałąź opisową, nie jako 404.

#### 4. Rozgałęzienie w trasie wyceny

**File**: `src/pages/api/diary-entries/[id]/estimate.ts`

**Intent**: Zastąpić bezwarunkowe wywołanie `estimateFromDescription` (`:70`) kaskadą z sekcji
Implementation Approach: wpis z `source_recipe_id` idzie po treść przepisu i mnoży wynik przez
`portions`, każdy inny zachowuje się jak dzisiaj. Pochodzenie ustalone w tej samej gałęzi, w której
policzono wartość, i przekazane do `applyEstimate`.

**Contract**: sygnatura trasy, kody odpowiedzi i kształt ciała (`DiaryEntryDto`) **bez zmian** —
zmienia się wyłącznie to, co trasa robi między stemplem a zapisem. Obowiązujące niezmienniki:

- `OpenRouterError` z **każdej** gałęzi kończy się tym samym 502 `AI_UNAVAILABLE` (`estimate.ts:71-88`).
- `RecipeNotFoundError` **nigdy** nie daje 404 — schodzi na gałąź opisową.
- Iloczyn poza `0..5000` jest traktowany jak `estimate === null`: odczyt wiersza i 200, wpis zostaje
  „Nie policzono".

Mnożenie i bramka zakresu mieszczą się w kilku linijkach i żyją w trasie:

```ts
const perPortion = await estimationService.estimateFromRecipe(recipeContent, entry.content);
const total = perPortion === null ? null : Math.round(perPortion * (entry.portions ?? 1));
estimate = total !== null && total >= 0 && total <= 5000 ? total : null;
```

### Success Criteria:

#### Automated Verification:

- Sprawdzenie typów przechodzi: `npm run typecheck`
- Lint przechodzi: `npm run lint`
- Testy jednostkowe przechodzą: `npm run test`

#### Manual Verification:

- `curl -X POST` na `/api/diary-entries/<id>/estimate` dla wpisu z przepisem bez bloku odżywczego
  i `portions = 2` zwraca wiersz z `calorie_origin: "ai_from_recipe"` i wartością mniej więcej
  dwukrotnie większą niż ten sam przepis z `portions = 1`
- Ten sam `curl` na wpisie **opisowym** zwraca `calorie_origin: "ai_from_description"` i wartość
  porównywalną z tą sprzed zmiany
- Wpis z `portions` i `source_recipe_id = null` (wiersz po usuniętym przepisie) dostaje
  `ai_from_description`, a trasa nie zwraca 404
- Wywołanie z nieprawidłowym `OPENROUTER_API_KEY` nadal kończy się 502 `AI_UNAVAILABLE`, a nie 500

**Implementation Note**: po przejściu weryfikacji automatycznej zatrzymaj się i poczekaj na
potwierdzenie weryfikacji ręcznej, zanim ruszysz z Fazą 2.

---

## Phase 2: Powierzchnia dziennika

### Overview

Dwie rzeczy widoczne dla użytkownika: etykieta nowego pochodzenia i uczciwe zdanie o tym, co
opuszcza produkt. Faza krótka — dwa pliki, trzy miejsca.

### Changes Required:

#### 1. Drugie zdanie uprzedzenia

**File**: `src/lib/utils/diary-estimation.ts`

**Intent**: Dołożyć stałą obok `AI_NOTICE` (`:24`) dla ścieżki z przepisu. NFR wymaga, żeby
użytkownik wiedział, **co** opuszcza produkt, zanim to nastąpi; na tej ścieżce wychodzi treść
przepisu, więc dotychczasowe zdanie o samym opisie posiłku przestało być prawdziwe.

**Contract**: `AI_NOTICE_RECIPE = "Treść przepisu i Twój opis zostaną wysłane do dostawcy modelu."`
— stała eksportowana obok `AI_NOTICE`, która zostaje niezmieniona co do znaku. Komentarz nad parą
mówi, który warunek wybiera które zdanie: `source_recipe_id !== null` po zapisie, wybrany przepis
przed zapisem.

#### 2. Etykieta pochodzenia i wybór zdania przy wierszu listy

**File**: `src/components/diary/DiaryEntryCalories.tsx`

**Intent**: Dopisać `ai_from_recipe` do `ORIGIN_LABELS` (`:25`) — komentarz nad mapą (`:22`) wprost
to zapowiada. Oba miejsca pokazujące `AI_NOTICE` (`:190`, `:205`) wybierają zdanie po tym, czy
wiersz ma `source_recipe_id`.

**Contract**: `ORIGIN_LABELS.ai_from_recipe = "oszacowane z przepisu"`; mapa przestaje być
`Partial<Record<...>>` i pokrywa wszystkie cztery wartości enuma. Wybór zdania liczony raz
w ciele komponentu, nie dwa razy w JSX. Testid `diary-ai-notice` zostaje bez zmian — spec E2E
pyta o treść, nie o drugi identyfikator.

#### 3. Wybór zdania w formularzu

**File**: `src/components/diary/DiaryEntryForm.tsx`

**Intent**: Zdanie pod przyciskami (`:553`) wybiera się po tym, czy wybrano przepis. Przed zapisem
wiersza jeszcze nie ma, więc warunkiem jest `selectedRecipe !== null`, a nie `source_recipe_id`.

**Contract**: `selectedRecipe !== null ? AI_NOTICE_RECIPE : AI_NOTICE`. Logika `recipeAlreadyCounted`
(`:284`) i warunek `disabled` przycisku (`:544`) **bez zmian** — przepis z rozpoznanym blokiem nadal
gasi wycenę, bo ma już wartość.

### Success Criteria:

#### Automated Verification:

- Sprawdzenie typów przechodzi: `npm run typecheck`
- Lint przechodzi: `npm run lint`
- Formatowanie zgodne: `npm run format:check`

#### Manual Verification:

- Wpis zapisany z przepisu bez bloku odżywczego po wycenie pokazuje „oszacowane z przepisu"
- Wpis opisowy po wycenie nadal pokazuje „oszacowane z opisu"
- Po wybraniu przepisu w formularzu zdanie pod przyciskami mówi o treści przepisu; po „Usuń wybór"
  wraca zdanie o opisie posiłku
- Przy wierszu wpisu z przepisu w stanie „Nie policzono" stoi zdanie o treści przepisu, a przy
  wierszu opisowym — o opisie posiłku

**Implementation Note**: po przejściu weryfikacji automatycznej zatrzymaj się i poczekaj na
potwierdzenie weryfikacji ręcznej, zanim ruszysz z Fazą 3.

---

## Phase 3: Testy i domknięcie bramki

### Overview

Pokrycie nowej gałęzi testami niepłacącymi za wywołania modelu, rozszerzenie suity E2E i
zaktualizowanie rejestru długu.

### Changes Required:

#### 1. Testy jednostkowe wyceny z przepisu

**File**: `tests/unit/calorie-estimation.service.test.ts`

**Intent**: Rozszerzyć istniejący zestaw o `estimateFromRecipe`, tym samym mockiem
`openrouter.service`, którym objęta jest `estimateFromDescription`. Pokryć: czystą liczbę,
odpowiedź w ogrodzeniu markdown, `{"calories": null}`, wartość spoza 0–5000 i rzut
`OpenRouterError` przepuszczony na zewnątrz.

**Contract**: mock pozostaje ten sam, żeby plik nadal nie ładował `import.meta` (powód opisany
w `calorie-estimation.service.ts:39-52`). Asercja na treść promptu sprawdza, że do modelu poszła
treść przepisu **oraz** notatka użytkownika.

#### 2. Testy arytmetyki porcji i wyboru gałęzi

**File**: `tests/unit/diary-service.test.ts`

**Intent**: Pokryć `applyEstimate` z oboma pochodzeniami — że `ai_from_recipe` faktycznie dojeżdża
do `update`, i że warunek `.is("calories", null)` nadal chroni liczbę wpisaną ręcznie.

**Contract**: rozszerzenie istniejącego pliku, ten sam mock klienta Supabase. Bez nowego pliku —
metoda jest ta sama, zmienił się jeden argument.

#### 3. Scenariusz E2E dla wpisu z przepisu bez bloku

**File**: `tests/e2e/diary-entry.spec.ts` oraz odpowiedni page object w `tests/e2e/page-objects/`

**Intent**: Rozszerzyć suitę o ścieżkę: utwórz przepis **bez** bloku odżywczego, zrób z niego wpis
z liczbą porcji, sprawdź, że wpis ląduje w stanie „Nie policzono" i że przy nim stoi zdanie o treści
przepisu. **Spec nie klika „Policz kalorie"** — precedens z S-02: suita nie dotyka OpenRoutera.

**Contract**: scenariusz sam tworzy przepis, tak jak spec S-03 — nie zakłada, że konto testowe ma
przepis w odpowiednim stanie. Sprzątanie przepisów przez `cleanup.service.ts` jak dotąd; wierszy
dziennika nadal nie da się posprzątać (trasa `DELETE` przychodzi z S-05).

#### 4. Aktualizacja rejestru długu

**File**: `docs/reference/known-drift.md`

**Intent**: Zamknąć wpis „Wycena AI na wpisie z przepisu ignoruje liczbę porcji" — ta zmiana go
usuwa. Rozszerzyć wpis o braku limitu częstości i deduplikacji o nową ścieżkę: treść przepisu jest
większa od opisu, więc koszt niekontrolowanej pętli wzrósł.

**Contract**: sekcja „Trasy AI" — pierwszy wpis usunięty, drugi uzupełniony o zdanie o wycenie
z przepisu i o tym, że decyzja D6 tego planu świadomie zostawiła go otwartym dla S-05.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą: `npm run test`
- Testy E2E przechodzą: `npm run test:e2e`
- Sprawdzenie typów przechodzi: `npm run typecheck`
- Lint przechodzi: `npm run lint`
- Formatowanie zgodne: `npm run format:check`
- Audyt bezpieczeństwa przechodzi: `npm run test:security`

#### Manual Verification:

- Pełne przejście ścieżki w przeglądarce: przepis bez bloku → wpis na 2 porcje → „Policz kalorie"
  → wartość z etykietą „oszacowane z przepisu", wchodząca do sumy dnia
- Ekrany sprzed zmiany — przepisy z wyszukiwarką, profil, logowanie, rejestracja — zachowują się
  jak dotąd
- Usunięcie przepisu, z którego powstał wpis, nie zmienia ani wpisu, ani sumy tamtego dnia

---

## Testing Strategy

### Unit Tests:

- `estimateFromRecipe`: czysta liczba, ogrodzenie markdown, `null`, wartość spoza zakresu, rzut
  `OpenRouterError`, obecność obu źródeł w prompcie
- `applyEstimate` z pochodzeniem `ai_from_recipe` i `ai_from_description`
- Arytmetyka porcji: 1, 2, 1,5 oraz przypadek `portions = null` przy niezerowym `source_recipe_id`
- Bramka zakresu: iloczyn ponad 5000 kcal zostawia wpis bez wartości

### Integration Tests:

Brak — projekt nie ma katalogu `tests/integration`, a ścieżka serwerowa jest pokryta przez
weryfikację `curl`-em w Fazie 1 i przez E2E w Fazie 3.

### Manual Testing Steps:

1. Utwórz przepis **bez** bloku „Wartości odżywcze (porcja)" i drugi **z** takim blokiem
2. Wpis z przepisu z blokiem: podgląd pokazuje wartość, przycisk „Zapisz i policz kalorie" jest
   wygaszony — ścieżka S-03 niezmieniona
3. Wpis z przepisu bez bloku na 1 porcję: zapisz i policz, zanotuj wartość
4. Ten sam przepis na 2 porcje: wartość powinna być mniej więcej dwukrotnie większa
5. Wpis opisowy („zjadłem frytki", „około 200 g"): wartość i etykieta jak przed zmianą
6. Usuń przepis użyty w kroku 3 i sprawdź, że wpis i suma dnia się nie zmieniły; kliknij przy nim
   „Policz ponownie" i sprawdź, że dostaje „oszacowane z opisu" zamiast błędu

## Performance Considerations

Treść przepisu jest większa od opisu posiłku, więc prompt rośnie — przy typowym przepisie o kilka
kilobajtów. Budżet czasu zostaje bez zmian (`timeout: 55_000` w `calorie-estimation.service.ts:57`,
`maxDuration: 60` w `astro.config.mjs`), bo rozmiar promptu wpływa na czas odpowiedzi znacznie
słabiej niż długość rozumowania modelu, a ten sam model odpowiada dziś na ścieżce opisowej w tym
samym oknie. Gdyby wycena z przepisu zaczęła regularnie dobijać do timeoutu, pierwszym krokiem jest
skrócenie treści przepisu przed wysłaniem, a nie poszerzanie okna — `maxDuration: 60` to sufit
darmowego planu Vercela.

## Migration Notes

Brak. Ta zmiana nie dotyka schematu bazy i nie wymaga żadnego zabiegu na istniejących danych.
Wiersze utworzone przed nią, noszące `ai_from_description` mimo pochodzenia z przepisu, zostają
w bazie bez zmian — nie ma z czego odtworzyć, ile porcji zjedzono w chwili tamtego oszacowania,
a ich przeliczenie znaczyłoby nadpisanie wartości, których użytkownik mógł już użyć.

## References

- Roadmapa: `context/foundation/roadmap.md` — slice **S-04**, kamień milowy `calorie-diary-v1`
- PRD: `context/foundation/prd.md` — **FR-010**, FR-011, FR-014, US-02
- Poprzedni plaster ścieżki AI: `context/archive/2026-09-23-ai-estimate-for-free-text/plan.md`
- Poprzedni plaster ścieżki przepisu: `context/archive/2026-09-25-recipe-entry-with-portions/plan.md`
- Dług zamykany i rozszerzany: `docs/reference/known-drift.md`, sekcja „Trasy AI"
- Trasa do rozszerzenia: `src/pages/api/diary-entries/[id]/estimate.ts:70`
- Zapis do sparametryzowania: `src/lib/services/diary.service.ts:188-193`
- Etykieta do dopisania: `src/components/diary/DiaryEntryCalories.tsx:25`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Kontrakt serwerowy

#### Automated

- [x] 1.1 Sprawdzenie typów przechodzi: `npm run typecheck` — f8cdfc2
- [x] 1.2 Lint przechodzi: `npm run lint` — f8cdfc2
- [x] 1.3 Testy jednostkowe przechodzą: `npm run test` — f8cdfc2

#### Manual

- [x] 1.4 `curl -X POST` na `/api/diary-entries/<id>/estimate` dla wpisu z przepisem bez bloku odżywczego i `portions = 2` zwraca wiersz z `calorie_origin: "ai_from_recipe"` i wartością mniej więcej dwukrotnie większą niż ten sam przepis z `portions = 1` — f8cdfc2
- [x] 1.5 Ten sam `curl` na wpisie opisowym zwraca `calorie_origin: "ai_from_description"` i wartość porównywalną z tą sprzed zmiany — f8cdfc2
- [x] 1.6 Wpis z `portions` i `source_recipe_id = null` dostaje `ai_from_description`, a trasa nie zwraca 404 — f8cdfc2
- [x] 1.7 Wywołanie z nieprawidłowym `OPENROUTER_API_KEY` nadal kończy się 502 `AI_UNAVAILABLE`, a nie 500 — f8cdfc2

### Phase 2: Powierzchnia dziennika

#### Automated

- [x] 2.1 Sprawdzenie typów przechodzi: `npm run typecheck`
- [x] 2.2 Lint przechodzi: `npm run lint`
- [x] 2.3 Formatowanie zgodne: `npm run format:check`

#### Manual

- [x] 2.4 Wpis zapisany z przepisu bez bloku odżywczego po wycenie pokazuje „oszacowane z przepisu"
- [x] 2.5 Wpis opisowy po wycenie nadal pokazuje „oszacowane z opisu"
- [x] 2.6 Po wybraniu przepisu w formularzu zdanie pod przyciskami mówi o treści przepisu; po „Usuń wybór" wraca zdanie o opisie posiłku
- [x] 2.7 Przy wierszu wpisu z przepisu w stanie „Nie policzono" stoi zdanie o treści przepisu, a przy wierszu opisowym — o opisie posiłku

### Phase 3: Testy i domknięcie bramki

#### Automated

- [ ] 3.1 Testy jednostkowe przechodzą: `npm run test`
- [ ] 3.2 Testy E2E przechodzą: `npm run test:e2e`
- [ ] 3.3 Sprawdzenie typów przechodzi: `npm run typecheck`
- [ ] 3.4 Lint przechodzi: `npm run lint`
- [ ] 3.5 Formatowanie zgodne: `npm run format:check`
- [ ] 3.6 Audyt bezpieczeństwa przechodzi: `npm run test:security`

#### Manual

- [ ] 3.7 Pełne przejście ścieżki w przeglądarce: przepis bez bloku → wpis na 2 porcje → „Policz kalorie" → wartość z etykietą „oszacowane z przepisu", wchodząca do sumy dnia
- [ ] 3.8 Ekrany sprzed zmiany — przepisy z wyszukiwarką, profil, logowanie, rejestracja — zachowują się jak dotąd
- [ ] 3.9 Usunięcie przepisu, z którego powstał wpis, nie zmienia ani wpisu, ani sumy tamtego dnia
