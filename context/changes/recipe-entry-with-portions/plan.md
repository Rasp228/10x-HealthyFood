# Wpis dziennika z własnego przepisu z liczbą porcji — plan wdrożenia

## Overview

Wpis dziennika może wskazać własny przepis użytkownika i liczbę zjedzonych porcji. Serwer odczytuje
kalorie z bloku odżywczego przepisu — wyłącznie tam, gdzie blok sam deklaruje, że opisuje porcję —
mnoży przez liczbę porcji i zapisuje wartość z pochodzeniem `recipe_nutrition`. Przepisy są
wyłącznie czytane; nic nie wraca do rekordu przepisu (FR-014, FR-015).

To kawałek S-03 roadmapy: domyka US-02 **bez ścieżki FR-010** („oszacuj z treści przepisu"), którą
przejmuje S-04 — roadmapa wymienia US-02 w PRD refs obu kawałków. Nie wymaga migracji: `portions`, `source_recipe_id`
i wartość `recipe_nutrition` w `calorie_origin_enum` czekają w bazie od F-01.

## Current State Analysis

**Baza jest gotowa i nietknięta przez ten plan.**
`supabase/migrations/20260922140906_create_diary_entries.sql:34-40` deklaruje
`portions numeric(6,2) check (portions is null or portions > 0)`,
`source_recipe_id integer references recipes(id) on delete set null` oraz
`calorie_origin calorie_origin_enum`. Constraint `diary_entries_value_has_origin` (`:55`) wymusza,
że `calories` i `calorie_origin` występują razem albo wcale. `ON DELETE SET NULL` (nie `CASCADE`)
sprawia, że kryterium akceptacji US-02 „usunięcie przepisu zostawia ten wpis i sumy minionych dni
bez zmian" jest już spełnione na poziomie schematu.

**Kaskada kalorii ma dziś dwie z czterech gałęzi.**
`DiaryService.createEntry` (`src/lib/services/diary.service.ts:49`) ustawia
`calorie_origin: command.calories === null ? null : "manual"`. `applyEstimate` (`:123`) wpisuje na
sztywno `ai_from_description`. `ORIGIN_LABELS` w `src/components/diary/DiaryEntryCalories.tsx:26-29`
zna dwie etykiety, z komentarzem w `:23`, że `recipe_nutrition` i `ai_from_recipe` dołoży następny
plaster.

**Formularz wpisu nie ma pojęcia o przepisach.**
`DiaryEntryForm.tsx` (326 linii) trzyma `DiaryFormValues { content, amount_text, calories }`
(`:21-25`), waliduje po stronie klienta tym samym `createDiaryEntrySchema`, którego używa trasa
(`:71`), i ma dwa przyciski: „Zapisz" oraz „Zapisz i policz kalorie" (`:295-317`). Grep za `recipe`
w `src/components/diary/**` i `src/hooks/diary/**` zwraca wyłącznie dwa komentarze.

**Wyszukiwarka przepisów istnieje, ale nie taka, jakiej wymaga FR-007.**
`GET /api/recipes?search=` (`src/pages/api/recipes/index.ts:59-64`) buduje
`or("title.ilike.%…%,content.ilike.%…%,additional_params.ilike.%…%")` — szuka w treści i w
parametrach, nie tylko po nazwie. Nie ma `limit` ani projekcji, więc każde naciśnięcie klawisza
ściągałoby wszystkie trafienia z pełnym `content` (do 5000 znaków każde). Termin jest wklejany
surowo w łańcuch PostgREST `or()`, bez ucieczki znaków. Jedyny UI wyszukiwania jest wklejony
w `src/components/pages/HomePage.tsx:199-236` (opóźnienie 500 ms w `:47-55`) i nie jest wydzielony.
`useFetchRecipes` (`src/hooks/recipe/useRecipes.ts:18-65`) nie ma zabezpieczenia przed odpowiedziami
przychodzącymi poza kolejnością.

**Parsera bloku odżywczego nie ma i nie ma czego kopiować.**
Nagłówek `Wartości odżywcze (porcja):` żyje wyłącznie w dokumentach
(`context/foundation/prd.md:44-50`). Prompty generujące przepisy
(`src/lib/services/ai.service.ts:120` i `:232`) proszą tylko o „wartości odżywcze" — bez nagłówka,
bez formatu, bez jednostek. Fixture `tests/fixtures/recipes.ts` z polem `nutrition.calories` opisuje
model, którego w bazie nie ma, nie jest przez nic importowany i **nie jest podstawą tej zmiany**.
`src/components/ui/RecipeContent.tsx` to heurystyczny renderer, nie parser markdownu: linię kończącą
się dwukropkiem renderuje jako `h3`, a `- Kalorie: 250 kcal` przepuszcza dosłownie.

**Wzorce do naśladowania są mocne.** Warstwa jest ustalona: strona `.astro` → wyspa `client:load`
→ hook z `fetch` → trasa `/api/*` (401 → Zod → delegacja) → serwis z `locals.supabase`. Schematy Zod
są współdzielone dosłownie między formularzem a trasą. `useDiaryEntries.ts:29` pokazuje strażnika
`isCurrent` przeciw odpowiedziom poza kolejnością. `RecipeFormModal.tsx` pokazuje wzorzec
„dostrajanie stanu przy zmianie propsów" wymagany przez `react-hooks/set-state-in-effect`.

## Desired End State

W formularzu wpisu dziennika, pod polem opisu, stoi opcjonalne pole **„Z mojego przepisu"**. Wpisanie
fragmentu nazwy pokazuje listę własnych przepisów; wybór jednego wstawia jego tytuł do pola opisu
(pole zostaje edytowalne), ukrywa pole ilości tekstowej oraz pole kalorii i odsłania **liczbę
porcji** z wartością początkową `1`. Pod spodem stoi podgląd: albo `≈ 750 kcal — z przepisu,
3 porcje`, albo zdanie „Ten przepis nie podaje wartości odżywczych na porcję — kalorie ustalisz po
zapisaniu wpisu".

Po zapisaniu wpis na liście dnia pokazuje `3 porcje` jako ilość i etykietę `z przepisu` przy
wartości, a suma dnia tę wartość obejmuje. Wartość da się zastąpić liczbą wpisaną ręcznie —
istniejącą już ścieżką `PATCH`, która przestawia pochodzenie na `manual`. Usunięcie przepisu nie
zmienia ani wpisu, ani sumy dnia.

Weryfikacja: pełne przejście US-02 na prawdziwym przepisie oraz `npm run test`, `npm run test:e2e`
i cała bramka `code-quality` na zielono, przy niezmienionym `tests/e2e/recipe-management.spec.ts`.

### Key Discoveries:

- Baza nie wymaga migracji — `supabase/migrations/20260922140906_create_diary_entries.sql:34-40`
  przewidział ten plaster w całości, łącznie z `ON DELETE SET NULL`.
- Reguła „pochodzenie wartości ustala serwer, nie klient" jest ustalona od S-01:
  `src/lib/services/diary.service.ts:61` i `:141`; `CreateDiaryEntryCommand` (`src/types.ts:121-128`)
  celowo nie ma pola `calorie_origin`.
- Wartości `calorie_origin_enum` są zarejestrowane jako powierzchnia kontraktowa
  (`docs/reference/contract-surfaces.md`, sekcja Enums): cztery wartości to dokładnie cztery kroki
  kaskady FR-009/FR-010/FR-003/FR-004, więc użycie niewłaściwej wartości psuje odczyt pochodzenia
  wstecz.
- Granica 0–5000 kcal mieszka w jednym eksportowanym symbolu `caloriesValueSchema`
  (`src/lib/validations/diary/create-entry.ts:35`), konsumowanym przez obie istniejące ścieżki.
- `GET /api/recipes` nie ma dziś żadnej paginacji: `select("*", { count: "exact" })` bez `.limit()`
  oznacza, że `data.length === total` zawsze (`src/pages/api/recipes/index.ts:56`).
- `security.checkOrigin` odrzuca żądania nie-GET bez nagłówka `Origin`
  (`docs/reference/astro-react-runtime.md`) — dotyczy ręcznej weryfikacji `curl`-em w Fazie 2.

## What We're NOT Doing

- **Żadnej migracji.** Ani nowej tabeli, ani nowej kolumny, ani zmiany istniejącej.
- **Żadnego zapisu do `recipes`.** Przepisy są czytane. Nic — ani wyliczona wartość, ani znacznik —
  nie wraca do rekordu przepisu (FR-014, FR-015).
- **Oszacowania kalorii z treści przepisu (FR-010).** To S-04. Ten plan zostawia dla niego gotowe
  wejście: `resolveRecipeCalories` odróżnia „brak zadeklarowanego bloku" od „wartość poza zakresem",
  a wpis niesie `source_recipe_id`.
- **Edycji ani usuwania zapisanego wpisu.** To S-05, łącznie z przeliczeniem po zmianie liczby
  porcji. Po zapisaniu wpisu liczby porcji nie da się w tej zmianie poprawić.
- **Dziennego celu i paska postępu.** To S-06.
- **Poprawiania nieuciekniętej interpolacji terminu w `or()`** (`src/pages/api/recipes/index.ts:61-63`).
  Ścieżka dziennika omija ją, bo używa `.ilike()`, które klient parametryzuje. Istniejąca ścieżka
  zostaje nietknięta, żeby nie ryzykować regresji w ekranie przepisów; znalezisko ląduje w
  `docs/reference/known-drift.md`.
- **Naprawiania `useFetchRecipes`** (brak anulowania żądań). Dziennik dostaje własny hook; hook
  HomePage zostaje, bo jego zmiana dotyka ekranu spoza tej zmiany.
- **Wydzielania wyszukiwarki z `HomePage.tsx`** do wspólnego komponentu. Kuszące, ale to refaktor
  ekranu, którego ten plaster nie dotyczy.
- **Limitu częstości i deduplikacji wywołań AI** (`docs/reference/known-drift.md`, „Trasy AI").
  Ta zmiana nie woła modelu ani razu.
- **Nowej zależności, nowej zmiennej środowiskowej, zapisu do `logs`, telemetrii.**
- **Usuwania martwego `tests/fixtures/recipes.ts`.** Nie należy do tej zmiany, choć wprowadza w błąd.

## Implementation Approach

Cztery fazy, każda sprawdzalna osobno, w kolejności rosnącego ryzyka regresji.

Parser stoi w Fazie 1 sam, bo jest jedynym miejscem, w którym ta zmiana może **policzyć źle**
zamiast **nie policzyć wcale**. Wszystko inne degraduje się do stanu „Nie policzono", który S-02 już
umie narysować; błędnie odczytana liczba wchodzi do sumy dnia i nikt się o tym nie dowie. Parser jest
czystą funkcją bez bazy, sieci i UI, więc jego bramka to sam `npm run test` plus jedno ręczne
przejście po prawdziwych przepisach — i musi być zamknięta, zanim cokolwiek zacznie z niego czytać.

Faza 2 trzyma się reguły ustalonej w S-01: **liczbę wylicza i pochodzenie ustala serwer**. Klient
przysyła `source_recipe_id` i `portions`, nigdy gotowej wartości z pochodzeniem `recipe_nutrition`.
Ta sama czysta funkcja działa w formularzu jako podgląd — jeden moduł, dwa wywołania, zero duplikatu
reguły.

Faza 2 zawiera też jedyne wyjście tej zmiany poza dziennik: dwa **addytywne** parametry w
`GET /api/recipes`. Wywołanie bez nich musi zachować się co do znaku tak jak dziś. Dowody są dwa
i trzeba je rozróżnić, bo pokrywają różne gałęzie:

- **Ścieżka bez parametrów** — niezmieniony `tests/e2e/recipe-management.spec.ts` przechodzący
  w Fazie 4. Ten spec loguje się, dodaje przepis i sprawdza siatkę; woła więc `GET /api/recipes`
  bez `search`. Tę samą ścieżkę przechodzi `tests/e2e/services/cleanup.service.ts:26`, które
  wylicza przepisy do skasowania — regresja w kształcie odpowiedzi ucisza sprzątanie po cichu.
- **Gałąź `?search=`** — czyli dokładnie to, co ta zmiana przepisuje (`.or(...)` → warunkowy
  `.ilike`) — **nie jest pokryta żadnym testem automatycznym**. Ten spec nigdy nie wpisuje nic
  w pole wyszukiwania. Jedynym dowodem jest ręczne porównanie z kroku 2.10 i to trzeba przyjąć
  świadomie, a nie odkryć po fakcie.

Faza 3 dokłada powierzchnię, Faza 4 domyka bramkę.

**Reguła pierwszeństwa wartości ręcznej.** FR-004 mówi „w dowolnym momencie", więc liczba wpisana
przez użytkownika wygrywa także przy tworzeniu wpisu: gdy formularz przyśle `calories`, serwis
zapisuje ją z pochodzeniem `manual` i **nie czyta przepisu**, mimo że `source_recipe_id` i `portions`
zapisuje normalnie. Przepis pozostaje wtedy udokumentowanym źródłem treści, nie źródłem liczby.

**Wycena AI zostaje dostępna także dla wpisu z przepisu.** Trasa
`POST /api/diary-entries/[id]/estimate` szacuje z `content` i `amount_text` i stempluje pochodzenie
`ai_from_description`. Rozważaliśmy ukrycie tej ścieżki dla wpisów z przepisu — zarówno przycisku
„Zapisz i policz kalorie" w formularzu, jak i „Policz kalorie" na wierszu listy
(`DiaryEntryCalories.tsx:182-187`, rysowany dla każdego wiersza z `calories === null`). Odrzucone:
przepis bez rozpoznanego bloku ląduje w stanie „Nie policzono", a jedyne, co użytkownik może wtedy
zrobić bez tej ścieżki, to wpisać liczbę z palca. Zabieranie mu wyceny w stanie, w którym nie ma nic
innego, jest gorsze niż jej niedoskonałość.

Pochodzenie `ai_from_description` jest przy tym uczciwe, nie obejściem: trasa faktycznie czyta
`content`, a `content` na tej ścieżce jest edytowalne — użytkownik może dopisać do tytułu, co zjadł.
Kontrakt `calorie_origin_enum` zostaje nienaruszony.

**Czego ta ścieżka nie robi: nie skaluje wyniku przez `portions`.** Wiersz pokaże wtedy `3 porcje`
obok wartości, której przez trzy nie pomnożono — model dostał opis, nie przepis i nie liczbę porcji.
To znany ubytek do czasu S-04, która dokłada właściwą trzecią ścieżkę („oszacuj z treści przepisu",
pochodzenie `ai_from_recipe`) i dopiero ona umie liczbę porcji uwzględnić. Trafia do
`docs/reference/known-drift.md` razem ze znaleziskiem o interpolacji (Faza 2 §7).

## Critical Implementation Details

- **Kolejność Fazy 1 przed Fazą 2 jest wiążąca, nie estetyczna.** `DiaryService.createEntry` po
  zmianie nie ma jak zasygnalizować „policzyłem źle" — zapisuje liczbę albo `null`. Jedyną bramką na
  błędny odczyt jest komplet testów parsera zamknięty wcześniej.
- **Podgląd w formularzu liczy się w trakcie renderu, nie w efekcie.**
  `react-hooks/set-state-in-effect` jest `error` (`eslint.config.js`). Wynik
  `resolveRecipeCalories(selectedRecipe.content, portions)` jest czystą funkcją dwóch rzeczy, które
  i tak są w stanie — wolno go policzyć bezpośrednio przy renderowaniu i nie wolno kopiować do
  `useState`.
- **`numeric(6,2)` wraca z PostgREST jako liczba JSON**, więc `portions` w `DiaryEntryDto` to
  `number | null` i `0.5` przechodzi w obie strony bez konwersji. Separator dziesiętny w polu
  formularza jest sprawą warstwy prezentacji: użytkownik wpisuje przecinek, do JSON-a idzie kropka.

---

## Faza 1: Parser bloku odżywczego

### Overview

Czysty moduł, który z treści przepisu odczytuje kalorie na porcję — ale tylko z bloku, który sam
deklaruje, że opisuje porcję — i skaluje je przez liczbę porcji. Bez bazy, bez sieci, bez UI.
Pokryty testami jednostkowymi w całości.

### Changes Required:

#### 1. Moduł parsera

**File**: `src/lib/utils/recipe-nutrition.ts` (nowy)

**Intent**: Zamknąć całą interpretację treści przepisu w jednym miejscu, z którego czytają zarówno
serwis po stronie serwera, jak i podgląd w formularzu. Moduł rozróżnia trzy wyniki, bo formularz musi
umieć powiedzieć użytkownikowi, **dlaczego** nie ma wartości, a S-04 musi umieć rozpoznać przypadek,
w którym wchodzi jego oszacowanie.

**Contract**: Trzy eksporty. Sygnatury są kontraktem, na którym stoją Fazy 2 i 3 oraz cała S-04:

```ts
export type RecipeCalorieReason = "ok" | "no_declared_block" | "out_of_range";

export interface RecipeCalorieResult {
  /** Kalorie na jedną porcję odczytane z bloku; `null`, gdy bloku nie rozpoznano. */
  perPortion: number | null;
  /** Wartość dla wpisu: `perPortion * portions`, zaokrąglona. `null`, gdy nie ma czego zapisać. */
  total: number | null;
  reason: RecipeCalorieReason;
}

export function readPerPortionCalories(content: string): number | null;
export function resolveRecipeCalories(content: string, portions: number): RecipeCalorieResult;
```

Reguły rozpoznania, w całości:

1. **Nagłówek samodeklarujący porcję** — linia zawierająca jednocześnie znacznik bloku odżywczego
   (`wartości odżywcze` / `wartosci odzywcze` / `nutrition`) **oraz** słowo z rodziny porcji
   (`porcj` — pokrywa porcja/porcję/porcji — / `serving` / `portion`). Porównanie po złożeniu liter
   do małych i zdjęciu znaków diakrytycznych (`normalize("NFD")` + usunięcie `\p{Diacritic}`), żeby
   `Wartosci odzywcze (porcja)` bez ogonków działało tak samo. Brak takiej linii ⇒
   `reason: "no_declared_block"`, oba pola `null`. To jest decyzja D1 i zamknięcie otwartego pytania
   `context/foundation/roadmap.md:131`.
2. **Zakres bloku** — od linii nagłówka **włącznie** (bo liczba bywa w tej samej linii) do pierwszej
   pustej linii, do kolejnej linii wyglądającej na nagłówek, albo do końca treści; nie więcej niż
   10 linii. Przy kilku pasujących nagłówkach liczy się pierwszy.

   **„Wygląda na nagłówek" to: linia, która po przycięciu białych znaków kończy się dwukropkiem
   i nie zawiera ani jednej cyfry.** Dwukropek sam nie wystarczy — `Kalorie: 250 kcal` też go ma,
   tyle że w środku i z liczbą, więc zostaje w bloku; `Przygotowanie:` nie ma cyfry i blok ucina.
   Ten predykat jest bliski heurystyce `h3` z `src/components/ui/RecipeContent.tsx`, ale nie jest
   z niej importowany — tamta rysuje, ta liczy, i wolno im się rozejść.
3. **Linia z kaloriami** — pierwsza linia bloku pasująca do etykiety z zamkniętej listy (`kalorie`,
   `kaloryczność`, `energia`, `calories`, `energy`), po której stoi liczba całkowita lub dziesiętna.
   Jednostka `kcal` jest opcjonalna.

   **`kJ` dyskwalifikuje liczbę, nie linię.** Bloki pisane z obu jednostek —
   `Energia: 1046 kJ (250 kcal)` — są częste, a odrzucenie całej linii kosztowałoby rozpoznanie
   tam, gdzie właściwa liczba stoi obok. Skanujemy więc liczby w linii po kolei i bierzemy pierwszą,
   po której **nie** stoi `kJ` (z opcjonalną spacją, bez czułości na wielkość liter); liczba z `kJ`
   jest przeskakiwana, nie kończy przetwarzania linii. Tu leży jedyne w tej zmianie ryzyko wyniku
   zawyżonego ~4×, więc regułę czyta się dosłownie: brak jawnego wykluczenia `kJ` przy liczbie **nie**
   znaczy „weź pierwszą liczbę".

   Brak pasującej linii w rozpoznanym bloku ⇒ `reason: "no_declared_block"` (z punktu widzenia
   kaskady blok bez liczby to blok, którego nie ma).
4. **Skalowanie** — `Math.round(perPortion * portions)`. Wynik spoza `0..5000` ⇒ `total: null`,
   `reason: "out_of_range"`, przy zachowanym `perPortion` (formularz ma co pokazać w komunikacie).
   Granica jest ta sama, którą `caloriesValueSchema` nakłada na obie istniejące ścieżki.

#### 2. Testy parsera

**File**: `tests/unit/recipe-nutrition.test.ts` (nowy)

**Intent**: Pokryć całą listę wariantów nagłówka i etykiety, bo to ona — a nie kod — jest tu decyzją
produktową. Test jest jedynym miejscem, gdzie ta lista jest widoczna w całości.

**Contract**: Przypadki obowiązkowe: rozpoznane nagłówki (`Wartości odżywcze (porcja):`,
`Wartości odżywcze na porcję`, `Wartości odżywcze — 1 porcja`, `Wartosci odzywcze (porcja)` bez
ogonków, `Nutrition (per serving)`); odrzucone (`Wartości odżywcze:`, `Wartości odżywcze (całość)`,
`Składniki:`); etykiety `Kalorie` / `Kaloryczność` / `Energia` / `Calories` / `Energy`; liczba bez
jednostki; liczba w linii nagłówka; **pominięcie linii z `kJ`** i wzięcie sąsiedniej z `kcal`;
**`Energia: 1046 kJ (250 kcal)` w jednej linii ⇒ `250`, nigdy `1046` i nigdy `null`** — to jedyny
przypadek, w którym parser może zwrócić wartość zawyżoną ~4×; blok bez linii kalorii; dwa bloki,
liczy się pierwszy; zakres bloku ucięty pustą linią, żeby liczba spod kolejnego nagłówka nie
wyciekła; **zakres ucięty nagłówkiem bez pustej linii przed nim** (`Przygotowanie:` bezpośrednio po
linii z kaloriami następnego bloku) oraz dowód, że `Kalorie: 250 kcal` bloku **nie** ucina, mimo
dwukropka; skalowanie `250 × 3 = 750`, zaokrąglenie `333 × 0,5 = 167`; `900 × 6 = 5400` ⇒
`out_of_range` z zachowanym `perPortion: 900`; pusta treść.

### Success Criteria:

#### Automated Verification:

- Nowe testy jednostkowe parsera przechodzą: `npm run test -- recipe-nutrition`
- Cała suita jednostkowa przechodzi: `npm run test`
- Sprawdzenie typów bez błędów: `npm run typecheck`
- Lint i formatowanie przechodzą: `npm run lint` oraz `npm run format:check`

#### Manual Verification:

- Na co najmniej trzech prawdziwych przepisach z aplikacji (w tym co najmniej jednym wygenerowanym
  przez AI i jednym napisanym ręcznie) sprawdzone, że rozpoznanie zgadza się z oczekiwaniem — w tym
  co najmniej jeden przepis rozpoznany i co najmniej jeden świadomie odrzucony. Jeśli żaden
  prawdziwy przepis nie przechodzi, bramka jest zamknięta i trzeba sięgnąć po jeden z dwóch środków
  **przed** Fazą 2 — rozstrzygnięcie należy do właściciela, nie do wdrażającego:

  1. **Rozszerzyć listę wariantów z reguły 1** o to, co faktycznie stoi w przepisach. Tanie,
     odwracalne, ale to zgadywanie o krok dalej: działa wstecz na przepisy, które już są, i nic nie
     obiecuje o następnych.
  2. **Ograniczyć producenta.** `src/lib/services/ai.service.ts:120` i `:232` proszą model
     o „wartości odżywcze" bez nagłówka, bez formatu i bez jednostek — ta aplikacja sama pisze
     większość tekstu, który parser potem zgaduje. Jedna linia w obu promptach („emituj blok
     `Wartości odżywcze (na porcję):` z linią `Kalorie: N kcal`") sprawia, że każdy **przyszły**
     przepis z AI parsuje się z definicji, a nie z heurystyki. Kosztem jest dotknięcie promptów,
     których ten plan poza tym nie rusza, i brak testu na poziomie promptu w repo. Nie zastępuje
     parsera — przepisy napisane ręcznie i te już zapisane nadal przez niego przechodzą.

  Środek 2 jest tym, po który warto sięgnąć, jeśli bramka nie zamyka się od razu: 1 poprawia
  przeszłość, 2 zamyka przyszłość, i tylko drugi zmniejsza ryzyko, że FR-009 okaże się ścieżką
  rzadką.

**Implementation Note**: Po zamknięciu weryfikacji automatycznej zatrzymaj się i poczekaj na
potwierdzenie ręcznego przejścia, zanim ruszysz Fazę 2. Ta faza jest bramką na jedyny błąd, który
w tej zmianie jest niewidoczny. Bloki faz używają zwykłych punktów — odpowiadające im pola wyboru
żyją w sekcji `## Progress` na końcu planu.

---

## Faza 2: Kontrakt serwerowy

### Overview

Trasa tworzenia wpisu przyjmuje `source_recipe_id` i `portions`, a serwis wylicza z nich wartość
i ustala pochodzenie. Trasa przepisów dostaje dwa addytywne parametry, żeby wyszukiwanie po nazwie
było wyszukiwaniem po nazwie. Wszystko sprawdzalne `curl`-em, bez jednej linii UI.

### Changes Required:

#### 1. Schemat tworzenia wpisu

**File**: `src/lib/validations/diary/create-entry.ts`

**Intent**: Wpuścić dwa nowe pola i zapisać w jednym miejscu regułę, że wpis z przepisu ma liczbę
porcji **zamiast** ilości tekstowej — tak, żeby wiersza z dwiema sprzecznymi ilościami nie dało się
utworzyć ani z formularza, ani `curl`-em.

**Contract**: Nowy eksport `portionsSchema` (liczba, `> 0`, `<= 99`, najwyżej dwa miejsca po
przecinku — dokładnie zakres, który przyjmuje `numeric(6,2) check (portions > 0)`). Do
`createDiaryEntrySchema` dochodzą `source_recipe_id` (dodatnia liczba całkowita, `nullable`,
`optional`) i `portions` (`portionsSchema`, `nullable`, `optional`) oraz `superRefine` z trzema
regułami wzajemnymi:

- `portions` bez `source_recipe_id` ⇒ błąd na `portions`;
- `source_recipe_id` bez `portions` ⇒ błąd na `portions` (liczba porcji jest obowiązkowa dla wpisu
  z przepisu; formularz i tak wstawia `1`);
- `source_recipe_id` razem z niepustym `amount_text` ⇒ błąd na `amount_text`.

Reguły wzajemne muszą stać w `superRefine`, a nie w `refine` na całym obiekcie, żeby komunikat
trafiał na konkretne pole — `DiaryEntryForm` przypisuje błędy po `issue.path[0]`
(`DiaryEntryForm.tsx:70-79`), a błąd bez ścieżki wylądowałby w ogólnej ramce formularza.

#### 2. Typ komendy

**File**: `src/types.ts`

**Intent**: Doprowadzić `CreateDiaryEntryCommand` do zgodności z nowym schematem.

**Contract**: `CreateDiaryEntryCommand` (`src/types.ts:121-128`) zyskuje
`source_recipe_id: number | null` i `portions: number | null`. Nadal bez `calorie_origin` i bez
`user_id` — obie reguły zostają nietknięte.

#### 3. Wyliczenie wartości przy tworzeniu wpisu

**File**: `src/lib/services/diary.service.ts`

**Intent**: Umieścić całą kaskadę dla tej ścieżki w serwisie, tam gdzie od S-01 mieszka reguła
„pochodzenie ustala serwer". Trasa ma zostać cienka.

**Contract**: `createEntry` rozstrzyga w kolejności:

0. **Weryfikacja własności przepisu, przed rozgałęzieniem.** `command.source_recipe_id !== null` ⇒
   odczyt przepisu (`select("content")` z `.eq("id", …)` i `.eq("user_id", userId)`, tak jak
   `src/pages/api/recipes/[id].ts:39-44`); brak wiersza ⇒ rzucony `RecipeNotFoundError`. Ten krok
   biegnie **także wtedy, gdy przyszła wartość ręczna**. Powód: sekcja „Architecture / Approach"
   obiecuje, że wskazanie cudzego przepisu jest jedynym błędem tej ścieżki, a FK wskazuje
   `recipes(id)` bez predykatu właściciela i RLS na `diary_entries` pilnuje wyłącznie `user_id` —
   bez tego kroku `POST` z `calories` i cudzym id zapisałby wiersz wskazujący przepis, którego
   właściciel wpisu nie może przeczytać, a S-04 odczytałaby z niego nic.
1. `command.calories !== null` ⇒ zapis tej liczby z `calorie_origin: "manual"`, **bez używania
   treści przepisu** odczytanej w kroku 0. Wartość ręczna wygrywa (FR-004), a `source_recipe_id`
   i `portions` i tak są zapisywane — teraz już jako id, o którym wiadomo, że należy do tego
   użytkownika.
2. `command.source_recipe_id !== null` ⇒ `resolveRecipeCalories(recipe.content, command.portions)`
   na treści z kroku 0 i zapis: `total !== null` ⇒ `calories: total`,
   `calorie_origin: "recipe_nutrition"`; `total === null` ⇒ oba pola `null` (constraint
   `diary_entries_value_has_origin`).
3. W pozostałych wypadkach zachowanie dzisiejsze, bez zmian — żadnego dodatkowego zapytania dla
   wpisu bez przepisu.

`estimation_requested_at` nie jest dotykane na żadnej z tych ścieżek — pozostaje własnością trasy
oszacowania. Nowy eksport `RecipeNotFoundError` (klasa dziedzicząca po `Error`) mieszka w tym pliku;
idiom typowanych klas błędów jest już w repo (`src/lib/api/openrouter.service.ts`).

#### 4. Trasa tworzenia wpisu

**File**: `src/pages/api/diary-entries/index.ts`

**Intent**: Przekazać dwa nowe pola do komendy i zamienić jeden typowany błąd serwisu na status HTTP.

**Contract**: Budowa `CreateDiaryEntryCommand` (dziś `index.ts:88-93`) dostaje
`source_recipe_id: … ?? null` i `portions: … ?? null`. W `catch` dochodzi gałąź
`error instanceof RecipeNotFoundError` ⇒ **404** `{ error: "Przepis nie został znaleziony" }`, przed
istniejącym 500. Komunikat celowo ten sam, którym odpowiada `src/pages/api/recipes/[id].ts:50`.

#### 5. Wyszukiwanie przepisów po nazwie

**File**: `src/pages/api/recipes/index.ts`

**Intent**: Dać dziennikowi wyszukiwanie zgodne z FR-007 („po nazwie") i ograniczyć rozmiar
odpowiedzi, nie zmieniając ani o jotę zachowania widzianego przez ekran przepisów.

**Contract**: `listSchema` (`index.ts:16-20`) zyskuje dwa opcjonalne pola:
`search_field: z.enum(["title"]).optional()` oraz `limit` (koercja z tekstu, liczba całkowita,
`1..50`). W budowie zapytania:

- `search_field === "title"` ⇒ `query.ilike("title", "%" + searchTerm + "%")` **zamiast** dzisiejszego
  `.or(...)`. Klient Supabase parametryzuje `.ilike()`, więc ścieżka dziennika omija problem
  nieuciekniętej interpolacji w `or()`;
- `limit` obecny ⇒ `.limit(limit)` po `.order()`.

Gdy żadnego z dwóch nowych parametrów nie ma, zapytanie musi być **identyczne** z dzisiejszym.
`count: "exact"` zostaje, więc `total` nadal podaje pełną liczbę trafień także przy ustawionym
`limit` — dzięki temu dziennik może uczciwie napisać „pokazano 10 z 23".

#### 6. Stub Supabase w testach serwisu

**File**: `tests/unit/diary-service.test.ts`

**Intent**: Dać testom możliwość powiedzenia, **które** zapytanie niosło który filtr. Bez tego
kryterium 2.2 („cudzy przepis ⇒ `RecipeNotFoundError`") nie da się uczciwie zamknąć.

**Contract**: `createSupabaseStub` (`:41-67`) ma dziś jeden mock `from`, który ignoruje argument
i zwraca jeden współdzielony builder; odpowiedzi idą z kolejki (`nextResponse` zdejmuje, dopóki
zostaje więcej niż jedna). Drugie zapytanie w `createEntry` zadziała bez żadnej zmiany — ale
`select`/`eq` z odczytu przepisu przeplotą się w tym samym `jest.fn()` z insertem wpisu, przez co
`expect(stub.from).toHaveBeenCalledWith("diary_entries")` (`:111`) staje się prawdą trywialną,
a `.eq("user_id", …)` przestaje być przypisywalne do konkretnego zapytania.

Zmiana: builder kluczowany nazwą tabeli — `from` zwraca builder per tabela, a stub wystawia je pod
nazwami (`stub.builders.recipes`, `stub.builders.diary_entries`), zachowując dzisiejsze `stub.builder`
jako alias na `diary_entries`, żeby istniejące asercje nie wymagały przepisania. Odpowiedzi nadal
z jednej kolejki, w kolejności wywołań.

**Odczyt przepisu jest warunkowy** (`command.source_recipe_id !== null`, §3 gałąź 2) — to nie jest
detal implementacyjny, tylko powód, dla którego siedem istniejących testów `createEntry` (`:106-190`)
przechodzi z jedną odpowiedzią w kolejce, tak jak dziś.

**Promień rażenia zmiany `CreateDiaryEntryCommand`** (§2): `BASE_COMMAND` (`:86-91`) zyskuje oba nowe
pola; literały pod `:151` i `:160` spreadują je i naprawiają się same. `DiaryEntryForm.tsx` buduje
ciało `POST` bez nazywania typu (`:137-142`), więc TypeScript **nie** wskaże tam braku — Faza 3 musi
dopisać oba pola ręcznie i w `toPayload`, i w ciele żądania.

#### 7. Zapis znaleziska o interpolacji

**File**: `docs/reference/known-drift.md`

**Intent**: Zostawić w repo — nie w historii czatu — fakt, że termin wyszukiwania jest wklejany
surowo w łańcuch PostgREST `or()`, razem z informacją, że ścieżka dziennika go omija.

**Contract**: Dwie nowe pozycje.

Pierwsza wskazuje `src/pages/api/recipes/index.ts:59-64`, nazywa znaki, które łamią filtr
(`,`, `(`, `)`, `%`), i odnotowuje, że `search_field=title` używa parametryzowanego `.ilike()`.

Druga notuje, że wycena AI wywołana na wpisie z przepisu
(`src/pages/api/diary-entries/[id]/estimate.ts`) ignoruje `portions` i stempluje
`ai_from_description`, więc wiersz pokazuje liczbę porcji obok wartości, której przez nie nie
pomnożono. Przyjęte świadomie (przegląd planu `recipe-entry-with-portions`, ustalenie F1):
alternatywą było odebranie użytkownikowi jedynej ścieżki wyceny w stanie „Nie policzono". Zamyka to
S-04, która dokłada `ai_from_recipe`.

### Success Criteria:

#### Automated Verification:

- Rozszerzone testy schematu przechodzą (reguły wzajemne `portions` / `source_recipe_id` /
  `amount_text`): `npm run test -- diary-validations`
- Rozszerzone testy serwisu przechodzą (gałąź przepisu, pierwszeństwo wartości ręcznej, brak
  przepisu, wartość poza zakresem): `npm run test -- diary-service`
- Cała suita jednostkowa przechodzi: `npm run test`
- Sprawdzenie typów bez błędów: `npm run typecheck`
- Lint i formatowanie przechodzą: `npm run lint` oraz `npm run format:check`

#### Manual Verification:

- `POST /api/diary-entries` z `source_recipe_id` i `portions: 3` na przepisie z rozpoznanym blokiem
  zwraca **201** z niezerowym `calories` i `calorie_origin: "recipe_nutrition"` (żądanie musi nieść
  nagłówek `Origin`, inaczej odrzuci je `security.checkOrigin`)
- Ten sam `POST` z dodanym `calories` zapisuje liczbę z formularza i `calorie_origin: "manual"`, mimo
  obecnego `source_recipe_id`
- `POST` z `source_recipe_id` wskazującym cudzy lub nieistniejący przepis zwraca **404** — również
  wtedy, gdy w tym samym żądaniu przyszło `calories`, bo weryfikacja własności biegnie przed regułą
  pierwszeństwa
- `POST` z `source_recipe_id` i niepustym `amount_text` zwraca **400** z błędem na polu `amount_text`
- `GET /api/recipes?search=<fraza>` **bez** nowych parametrów zwraca dokładnie to samo co przed
  zmianą (porównane z wynikiem sprzed zmiany dla tej samej frazy)
- `GET /api/recipes?search=<fraza>&search_field=title&limit=5` zwraca wyłącznie przepisy z frazą
  w tytule, nie więcej niż pięć, a `total` nadal podaje pełną liczbę trafień

**Implementation Note**: Po zamknięciu weryfikacji automatycznej zatrzymaj się i poczekaj na
potwierdzenie ręcznego przejścia, zanim ruszysz Fazę 3.

---

## Faza 3: Powierzchnia dziennika

### Overview

Formularz dostaje opcjonalne pole wyboru przepisu, pole porcji i podgląd wartości; lista dnia uczy
się pokazywać porcje i etykietę nowego pochodzenia.

### Changes Required:

#### 1. Hook wyszukiwania przepisów

**File**: `src/hooks/diary/useRecipeSearch.ts` (nowy)

**Intent**: Dać formularzowi wyszukiwanie z opóźnieniem i odpornością na odpowiedzi przychodzące poza
kolejnością. Własny hook zamiast `useFetchRecipes`, bo tamten nie ma strażnika kolejności, a jego
zmiana dotyka ekranu przepisów spoza tej zmiany.

**Contract**: `useRecipeSearch(term: string)` zwraca
`{ recipes: RecipeDto[]; total: number; isSearching: boolean; error: Error | null }`. Opóźnienie
500 ms, tak jak w `HomePage.tsx:47-55`. Poniżej dwóch znaków po przycięciu białych znaków nie woła
niczego i zwraca pustą listę. Woła
`/api/recipes?search=…&search_field=title&limit=10&sort=title&order=asc` z `credentials: "include"`
i strażnikiem `isCurrent` w stylu `useDiaryEntries.ts:29`. Zwraca pełne wiersze, bo podgląd
w formularzu potrzebuje `content` wybranego przepisu bez drugiego żądania.

#### 2. Odmiana liczby porcji

**File**: `src/lib/utils/diary-portions.ts` (nowy)

**Intent**: Wyświetlić `1 porcja` / `2 porcje` / `5 porcji` / `0,5 porcji` poprawnie po polsku,
w jednym miejscu, z którego korzystają i lista, i podgląd w formularzu.

**Contract**: `formatPortions(portions: number): string` zwraca liczbę z przecinkiem jako separatorem
dziesiętnym i odmienionym rzeczownikiem. Reguła polska: `1` ⇒ „porcja"; końcówka 2–4 poza zakresem
12–14 ⇒ „porcje"; reszta, w tym każda wartość ułamkowa ⇒ „porcji".

#### 3. Wybór przepisu i porcje w formularzu

**File**: `src/components/diary/DiaryEntryForm.tsx`

**Intent**: Wpuścić drugą ścieżkę wejścia do istniejącego formularza tak, żeby ścieżka opisowa —
podłoga całego modułu — nie zmieniła zachowania.

**Contract**: `DiaryFormValues` zyskuje `portions: string` (wartość początkowa `"1"`, trzymana jako
tekst, bo pole jest tekstowe i przyjmuje przecinek — dokładnie jak `calories`). Obok wartości
formularza dochodzi stan `selectedRecipe: RecipeDto | null` oraz `searchTerm: string`.

Zachowanie:

- Pole „Z mojego przepisu (opcjonalnie)" z listą wyników i przyciskiem czyszczenia wyboru.
- Wybór przepisu: wstawia `recipe.title` do `content` (pole zostaje edytowalne), **ukrywa**
  `amount_text` **i pole kalorii** oraz czyści obie wartości, **odsłania** pole porcji z wartością
  `1`.
- **Pole kalorii znika razem z ilością tekstową, i z tego samego powodu.** Reguła pierwszeństwa
  z Fazy 2 (`calories !== null` wygrywa, przepis nieczytany) sprawia, że liczba zostawiona w tym polu
  po cichu unieważnia całe wyliczenie: podgląd mówiłby `≈ 750 kcal — z przepisu`, a zapis dałby 300
  i `wpisane ręcznie`. Na tej ścieżce jedynym źródłem liczby przed zapisem jest podgląd. FR-004 nic
  nie traci — wpis przyjmuje liczbę wpisaną ręcznie natychmiast po zapisaniu, istniejącą ścieżką
  `PATCH`, i wtedy etykieta uczciwie przechodzi na `wpisane ręcznie`. Reguła 1 z Fazy 2 zostaje
  w serwisie jako kontrakt trasy (`curl`, przyszłe klienty), nie jako stan osiągalny z formularza.
- Usunięcie wyboru: przywraca `amount_text` **i pole kalorii**, chowa porcje, zostawia `content` bez
  zmian — użytkownik mógł go już poprawić, a kasowanie jego tekstu byłoby utratą pracy.
- Podgląd wartości liczony **w trakcie renderu** z
  `resolveRecipeCalories(selectedRecipe.content, parsedPortions)`, nigdy kopiowany do stanu
  (`react-hooks/set-state-in-effect` jest `error`). Trzy warianty tekstu:
  `≈ 750 kcal — z przepisu, 3 porcje`; „Ten przepis nie podaje wartości odżywczych na porcję —
  kalorie ustalisz po zapisaniu wpisu" (`no_declared_block`); „Wartość dla tylu porcji przekracza
  5000 kcal — kalorie ustalisz po zapisaniu wpisu" (`out_of_range`). Oba komunikaty kierują po
  zapisie, a nie do pola w formularzu, bo pole kalorii na tej ścieżce jest ukryte; wpis ląduje
  w stanie „Nie policzono", gdzie ma i aktywne pole na liczbę, i wycenę AI (F1). Oba mają czytać się
  jak
  informacja, nie jak błąd walidacji — inny wariant kolorystyczny niż komunikaty w `errors`.
- Ładunek `POST` zyskuje `source_recipe_id` i `portions` (liczba, przecinek zamieniony na kropkę)
  albo `null` w obu polach, gdy przepisu nie wybrano.
- **Oba przyciski zostają**, także przy wybranym przepisie — powód w „Implementation Approach".
  Wpis z przepisu bez rozpoznanego bloku ma więc tę samą ścieżkę wyceny co wpis opisowy, w formularzu
  i na wierszu listy. Ten punkt nie wymaga żadnej zmiany w kodzie; stoi tu, bo poprzednia wersja
  planu zakładała odwrotnie.
- Nowe `data-testid` dla page objectu: `diary-recipe-search-input`, `diary-recipe-result-<id>`,
  `diary-recipe-selected`, `diary-recipe-clear-button`, `diary-portions-input`,
  `diary-portions-error`, `diary-recipe-preview`.

#### 4. Porcje na liście dnia

**File**: `src/components/diary/DiaryEntryList.tsx`

**Intent**: Pokazać ilość, która faktycznie wyznaczyła wartość. Dziś lista renderuje wyłącznie
`amount_text`, więc wpis z przepisu byłby bez ilości.

**Contract**: Ilość wpisu to `formatPortions(entry.portions)`, gdy `entry.portions !== null`,
w przeciwnym razie dotychczasowe `entry.amount_text`. Oba warianty w tym samym miejscu układu i pod
tym samym `data-testid`, żeby page object miał jeden selektor ilości.

#### 5. Etykieta nowego pochodzenia

**File**: `src/components/diary/DiaryEntryCalories.tsx`

**Intent**: Powiedzieć przy wartości, skąd pochodzi — to gwarancja, którą PRD stawia **każdej**
wartości.

**Contract**: Do `ORIGIN_LABELS` (`:26-29`) dochodzi `recipe_nutrition: "z przepisu"`. Komentarz
w `:23` traci połowę aktualności — zostaje w nim wyłącznie `ai_from_recipe` jako dług S-04.

#### 6. Testy nowych czystych modułów

**File**: `tests/unit/diary-portions.test.ts` (nowy)

**Intent**: Odmiana liczebnika to reguła z wyjątkami (12–14), a nie formatowanie — należy jej się
test.

**Contract**: `1`, `2`, `4`, `5`, `12`, `13`, `14`, `22`, `25`, `0,5`, `1,5`, `99`.

### Success Criteria:

#### Automated Verification:

- Testy odmiany porcji przechodzą: `npm run test -- diary-portions`
- Cała suita jednostkowa przechodzi: `npm run test`
- Sprawdzenie typów bez błędów: `npm run typecheck`
- Lint i formatowanie przechodzą: `npm run lint` oraz `npm run format:check`

#### Manual Verification:

- Wpisanie fragmentu nazwy w polu „Z mojego przepisu" pokazuje podpowiedzi; wybór wstawia tytuł do
  opisu, ukrywa pole ilości tekstowej i pokazuje porcje z wartością `1`
- Zmiana liczby porcji natychmiast przelicza podgląd; wartość `0,5` jest przyjmowana i przeliczana
- Przepis bez zadeklarowanego bloku pokazuje zdanie informacyjne, wyglądem odróżnialne od błędu;
  zapis daje wpis „Nie policzono" z aktywnym polem na liczbę
- Zapisany wpis z przepisu pokazuje na liście dnia liczbę porcji i etykietę „z przepisu", a suma dnia
  obejmuje jego wartość
- Zastąpienie wartości liczbą wpisaną ręcznie przestawia etykietę na „wpisane ręcznie"
- Usunięcie wyboru przepisu przywraca pole ilości tekstowej i zostawia wpisany opis nietknięty
- Ścieżka opisowa (bez przepisu) zachowuje się dokładnie jak przed zmianą, z oboma przyciskami
- Ekrany sprzed zmiany — lista przepisów z wyszukiwarką, szczegóły przepisu, profil, logowanie —
  zachowują się jak dotąd
- Liczba wpisana w pole kalorii **przed** wybraniem przepisu znika razem z polem po wyborze, a po
  usunięciu wyboru pole wraca puste; zapisany wpis nigdy nie pokazuje `wpisane ręcznie` tam, gdzie
  podgląd mówił `z przepisu`
- Wpis z przepisu bez rozpoznanego bloku ma na wierszu listy działający przycisk „Policz kalorie":
  wycena wraca, etykieta mówi „oszacowane z opisu", a wartość **nie** jest przemnożona przez liczbę
  porcji — to ubytek świadomie przyjęty do czasu S-04 (patrz „Implementation Approach")

**Implementation Note**: Po zamknięciu weryfikacji automatycznej zatrzymaj się i poczekaj na
potwierdzenie ręcznego przejścia, zanim ruszysz Fazę 4.

---

## Faza 4: Testy i domknięcie bramki

### Overview

Pokrycie ścieżki end-to-end w przeglądarce i pełna bramka `code-quality`, łącznie z dowodem, że ekran
przepisów nie zauważył zmiany w swojej trasie.

### Changes Required:

#### 1. Page object dziennika

**File**: `tests/e2e/page-objects/DiaryPage.ts`

**Intent**: Dołożyć do istniejącego page objectu obsługę nowych pól, bez zmiany metod, z których
korzystają dzisiejsze specyfikacje.

**Contract**: Nowe lokatory i metody na `data-testid` z Fazy 3: szukanie przepisu, wybór wyniku,
odczyt podglądu, ustawienie liczby porcji, odczyt ilości i etykiety pochodzenia z wiersza listy.
Istniejące metody zostają nietknięte.

#### 2. Scenariusz E2E dla wpisu z przepisu

**File**: `tests/e2e/diary-entry.spec.ts`

**Intent**: Przejść US-02 w przeglądarce, na przepisie utworzonym w trakcie testu — bo suita nie może
zakładać, że konto testowe ma przepis z blokiem odżywczym.

**Contract**: Nowy scenariusz: utwórz przepis z treścią zawierającą rozpoznawany blok (przez
istniejącą powierzchnię tworzenia przepisu), otwórz dziennik na dniu sygnaturowym, wyszukaj ten
przepis po nazwie, wybierz go, ustaw porcje na `2`, sprawdź podgląd, zapisz i sprawdź na liście dnia:
ilość, etykietę „z przepisu", wartość równą podwojonej liczbie z bloku oraz sumę dnia. Drugi,
krótszy scenariusz: przepis bez bloku daje wpis „Nie policzono" z aktywnym polem na liczbę.

Przepis tworzy istniejąca powierzchnia UI: `app.homePage.clickAddRecipe()` →
`app.recipeFormPage.fillRecipeForm(...)` → `submitForm()`. Helpera API do tworzenia przepisu w suicie
nie ma i ten plan go nie dokłada.

**Sprzątanie trzeba podpiąć — `diary-entry.spec.ts` go dziś nie ma.** `CleanupService` istnieje, ale
wywołuje go wyłącznie `recipe-management.spec.ts`, przez `app.initializeCleanup(baseURL, userId)`
w ciele testu i bramkowany `afterEach` (`:42-50`, sprząta tylko po teście zaliczonym). Ten spec nie
ma żadnego `afterEach` i nigdy nie inicjalizuje sprzątania, więc bez skopiowania obu elementów
przepisy z każdego przebiegu zostają na koncie. Żądania `CleanupService` niosą nagłówek `Origin`
(`docs/reference/astro-react-runtime.md`) — to już działa i nie wymaga zmiany.

**`deleteAllTestUserRecipes` kasuje wszystkie przepisy konta testowego**, nie tylko te z przebiegu:
wylicza je przez `GET /api/recipes` bez filtra (`cleanup.service.ts:20-69`). Konto E2E nie może więc
być tym samym kontem, na którym stoją przepisy do weryfikacji ręcznej z Faz 1–3.

Wierszy dziennika nadal nie da się posprzątać — trasa `DELETE` przychodzi dopiero z S-05. Dlatego
nowy scenariusz trzyma dyscyplinę istniejących: dzień sygnaturowy `2000-01-01`, unikalna treść wpisu
przez `Date.now()` i asercje na **przyrost** sumy, nie na jej wartość bezwzględną
(`diary-entry.spec.ts:44-45`, `:71`).

### Success Criteria:

#### Automated Verification:

- Rozszerzona suita E2E przechodzi: `npm run test:e2e`
- `tests/e2e/recipe-management.spec.ts` przechodzi **bez żadnej zmiany w pliku** — dowód na FR-014
  dla **ścieżki bez nowych parametrów** (`GET /api/recipes` bez `search`). Gałęzi `?search=` ten spec
  nie dotyka; jej jedynym dowodem jest ręczny krok 2.10
- Cała suita jednostkowa przechodzi: `npm run test`
- Pełna bramka `code-quality` w kolejności: `npm run lint` → `npm run typecheck` →
  `npm run format:check` → `npm run test:security`

#### Manual Verification:

- Pełne przejście US-02 na prawdziwym przepisie z blokiem odżywczym: wyszukanie po nazwie, wybór,
  podanie porcji, zapis, poprawna wartość i suma dnia
- Usunięcie przepisu użytego we wpisie zostawia ten wpis i sumę jego dnia bez zmian — ostatnie
  kryterium akceptacji US-02

---

## Testing Strategy

### Unit Tests:

- **Parser** (`tests/unit/recipe-nutrition.test.ts`) — pełna lista wariantów nagłówka i etykiety,
  pominięcie `kJ`, zakres bloku, skalowanie, zaokrąglanie, granica 5000. To jedyne miejsce, gdzie
  decyzje o rozpoznawaniu bloku i o odczycie liczby są widoczne w całości.
- **Schemat** (rozszerzenie `tests/unit/diary-validations.test.ts`) — trzy reguły wzajemne, granice
  `portions` (`0`, `0,5`, `99`, `99,01`, trzy miejsca po przecinku).
- **Serwis** (rozszerzenie `tests/unit/diary-service.test.ts`) — cztery gałęzie `createEntry`:
  wartość ręczna wygrywa z przepisem, przepis z rozpoznanym blokiem, przepis bez bloku (wiersz bez
  wartości i bez pochodzenia), cudzy przepis (`RecipeNotFoundError`).
- **Odmiana porcji** (`tests/unit/diary-portions.test.ts`) — reguła polska z wyjątkiem 12–14.

### Integration Tests:

Katalog `tests/integration/` nie istnieje w tym repo i ten plan go nie tworzy. Rolę testu
integracyjnego pełni ręczna weryfikacja `curl`-em w Fazie 2 i suita E2E w Fazie 4 — tak samo jak
w S-01 i S-02.

### Manual Testing Steps:

1. Wygeneruj albo napisz przepis z blokiem `Wartości odżywcze (porcja):` i linią `Kalorie: 250 kcal`.
2. Otwórz dziennik, wpisz fragment nazwy tego przepisu w polu „Z mojego przepisu", wybierz go.
3. Sprawdź: opis wypełniony tytułem, pole ilości tekstowej zniknęło, porcje pokazują `1`, podgląd
   mówi `≈ 250 kcal`.
4. Zmień porcje na `3` — podgląd pokazuje `≈ 750 kcal`. Zmień na `0,5` — pokazuje `≈ 125 kcal`.
5. Zapisz. Wpis na liście: ilość `3 porcje`, wartość `750 kcal`, etykieta `z przepisu`. Suma dnia
   wzrosła o 750.
6. Powtórz z przepisem bez bloku odżywczego: podgląd mówi, że przepis nie podaje wartości na porcję;
   po zapisie wpis czyta się „Nie policzono", a pole na liczbę jest aktywne.
7. Wpisz ręcznie liczbę na tym wpisie — etykieta zmienia się na `wpisane ręcznie`.
8. Usuń przepis użyty w kroku 5. Wróć do dziennika: wpis i suma dnia bez zmian.
9. Otwórz listę przepisów i użyj jej wyszukiwarki — działa jak przed zmianą, łącznie z trafieniami po
   treści przepisu.

## Performance Considerations

Wyszukiwanie w formularzu woła serwer po 500 ms bezczynności i najwyżej dziesięć wierszy, więc
odpowiedź jest o rząd wielkości mniejsza niż przy dzisiejszym `?search=` bez limitu. Brak indeksu pod
`ilike` na `title` (`supabase/migrations/20250427130913_healthymeal_schema.sql:71` ma tylko
`idx_recipes_user_created`) jest bez znaczenia przy kilku użytkownikach i kilkudziesięciu przepisach;
dokładanie indeksu wymagałoby migracji, której ten plan świadomie nie robi.

Parser przebiega treść przepisu raz, liniowo, na treści ograniczonej do 5000 znaków. Wołany jest przy
każdym renderze formularza z wybranym przepisem — to koszt pomijalny i cena za brak kopii wyniku
w stanie, której zabrania `react-hooks/set-state-in-effect`.

## Migration Notes

Brak migracji. Wszystkie kolumny i wartości enuma, których ten plan używa, istnieją od F-01 i są dziś
w bazie puste. Istniejące wiersze `diary_entries` mają `portions` i `source_recipe_id` równe `null`,
więc lista dnia po zmianie renderuje je dokładnie tak jak dotąd.

Wycofanie zmiany nie wymaga niczego po stronie bazy: wiersze utworzone tą ścieżką mają wypełnione
kolumny, które starszy kod po prostu ignoruje.

## References

- Roadmapa, kawałek S-03: `context/foundation/roadmap.md:124-133`
- Wymagania: `context/foundation/prd.md:106-127` (US-02), `:149-158` (FR-007, FR-008, FR-009),
  `:175-177` (FR-014, FR-015)
- Poprzedni plaster tej samej domeny: `context/archive/2026-09-23-ai-estimate-for-free-text/plan.md`
- Magazyn i jego kontrakty: `supabase/migrations/20260922140906_create_diary_entries.sql`
- Powierzchnie kontraktowe (wartości `calorie_origin_enum`, `zodIssues`, aliasy):
  `docs/reference/contract-surfaces.md`
- Zachowania środowiska uruchomieniowego (`security.checkOrigin`, blokada serwera dev):
  `docs/reference/astro-react-runtime.md`
- Wzorzec wyszukiwania z opóźnieniem: `src/components/pages/HomePage.tsx:47-55`
- Wzorzec strażnika kolejności odpowiedzi: `src/hooks/diary/useDiaryEntries.ts:29`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Parser bloku odżywczego

#### Automated

- [x] 1.1 Nowe testy jednostkowe parsera przechodzą: `npm run test -- recipe-nutrition`
- [x] 1.2 Cała suita jednostkowa przechodzi: `npm run test`
- [x] 1.3 Sprawdzenie typów bez błędów: `npm run typecheck`
- [x] 1.4 Lint i formatowanie przechodzą: `npm run lint` oraz `npm run format:check`

#### Manual

- [x] 1.5 Rozpoznanie sprawdzone na co najmniej trzech prawdziwych przepisach, w tym jednym odrzuconym

### Phase 2: Kontrakt serwerowy

#### Automated

- [ ] 2.1 Rozszerzone testy schematu przechodzą: `npm run test -- diary-validations`
- [ ] 2.2 Rozszerzone testy serwisu przechodzą: `npm run test -- diary-service`
- [ ] 2.3 Cała suita jednostkowa przechodzi: `npm run test`
- [ ] 2.4 Sprawdzenie typów bez błędów: `npm run typecheck`
- [ ] 2.5 Lint i formatowanie przechodzą: `npm run lint` oraz `npm run format:check`

#### Manual

- [ ] 2.6 `POST` z przepisem i porcjami zwraca 201 z wartością i pochodzeniem `recipe_nutrition`
- [ ] 2.7 `POST` z `calories` zapisuje wartość ręczną mimo obecnego `source_recipe_id`
- [ ] 2.8 `POST` z cudzym lub nieistniejącym przepisem zwraca 404, także razem z `calories`
- [ ] 2.9 `POST` z przepisem i niepustym `amount_text` zwraca 400 z błędem na tym polu
- [ ] 2.10 `GET /api/recipes?search=` bez nowych parametrów zwraca to samo co przed zmianą
- [ ] 2.11 `GET /api/recipes` z `search_field=title&limit=5` filtruje po tytule, tnie do pięciu, zachowuje `total`

### Phase 3: Powierzchnia dziennika

#### Automated

- [ ] 3.1 Testy odmiany porcji przechodzą: `npm run test -- diary-portions`
- [ ] 3.2 Cała suita jednostkowa przechodzi: `npm run test`
- [ ] 3.3 Sprawdzenie typów bez błędów: `npm run typecheck`
- [ ] 3.4 Lint i formatowanie przechodzą: `npm run lint` oraz `npm run format:check`

#### Manual

- [ ] 3.5 Wyszukanie i wybór przepisu wypełnia opis, ukrywa ilość tekstową i pokazuje porcje z wartością 1
- [ ] 3.6 Zmiana liczby porcji przelicza podgląd; wartość `0,5` jest przyjmowana
- [ ] 3.7 Przepis bez bloku pokazuje zdanie informacyjne i daje wpis „Nie policzono" z aktywnym polem
- [ ] 3.8 Wpis z przepisu pokazuje na liście porcje i etykietę „z przepisu", a suma dnia go obejmuje
- [ ] 3.9 Ręczne zastąpienie wartości przestawia etykietę na „wpisane ręcznie"
- [ ] 3.10 Usunięcie wyboru przepisu przywraca pole ilości i zostawia opis nietknięty
- [ ] 3.11 Ścieżka opisowa zachowuje się jak przed zmianą, z oboma przyciskami
- [ ] 3.12 Ekrany sprzed zmiany — przepisy, profil, logowanie — zachowują się jak dotąd
- [ ] 3.13 Pole kalorii znika i czyści się przy wyborze przepisu, wraca puste po usunięciu wyboru
- [ ] 3.14 Wpis z przepisu bez bloku ma działającą wycenę „Policz kalorie" (bez skalowania porcjami)

### Phase 4: Testy i domknięcie bramki

#### Automated

- [ ] 4.1 Rozszerzona suita E2E przechodzi: `npm run test:e2e`
- [ ] 4.2 `tests/e2e/recipe-management.spec.ts` przechodzi bez zmiany w pliku (ścieżka bez `search`)
- [ ] 4.3 Cała suita jednostkowa przechodzi: `npm run test`
- [ ] 4.4 Pełna bramka `code-quality`: `lint` → `typecheck` → `format:check` → `test:security`

#### Manual

- [ ] 4.5 Pełne przejście US-02 na prawdziwym przepisie z blokiem odżywczym
- [ ] 4.6 Usunięcie przepisu użytego we wpisie zostawia wpis i sumę dnia bez zmian
