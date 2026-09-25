# Oszacowanie kalorii z treści przepisu — streszczenie planu

> Pełny plan: `context/changes/ai-estimate-from-recipe/plan.md`

## What & Why

Roadmap **S-04** domyka kaskadę FR-009 → FR-010 i ostatni brakujący kawałek US-02: przepis, który
nie deklaruje wartości odżywczych na porcję, przestaje być ślepym zaułkiem kończącym się wpisaniem
liczby z palca. Użytkownik prosi o oszacowanie z samej treści przepisu, a wynik — przemnożony przez
liczbę zjedzonych porcji — trafia do wpisu z pochodzeniem `ai_from_recipe` i nigdy nie jest
zapisywany do samego przepisu.

## Starting Point

F-01 zbudowało magazyn, S-01 panel dnia, S-02 ścieżkę AI dla opisu, S-03 wpis z przepisu z liczbą
porcji. W bazie czeka nietknięta wartość `ai_from_recipe` w `calorie_origin_enum` — **żadnej
migracji nie trzeba**. Cała luka siedzi w trzech miejscach: trasa
`src/pages/api/diary-entries/[id]/estimate.ts:70` woła bezwarunkowo `estimateFromDescription` i nigdy
nie czyta `source_recipe_id` ani `portions`; `DiaryService.applyEstimate` zaszywa
`ai_from_description` na sztywno (`diary.service.ts:193`); `ORIGIN_LABELS`
(`DiaryEntryCalories.tsx:25`) nie ma wiersza dla nowego pochodzenia. To jest dokładnie znalezisko F1
z `docs/reference/known-drift.md` — wiersz pokazuje dziś „3 porcje" obok wartości niepomnożonej przez
trzy, z etykietą „oszacowane z opisu" na wpisie pochodzącym z przepisu.

## Desired End State

Użytkownik wybiera własny przepis bez bloku odżywczego, podaje liczbę porcji i klika „Zapisz i policz
kalorie". Wpis pojawia się natychmiast, a chwilę później stoi przy nim wartość z adnotacją
**„oszacowane z przepisu"**, uwzględniająca liczbę porcji — dwie porcje dają dwukrotność jednej.
Przy przycisku stoi zdanie mówiące, że do dostawcy modelu pojedzie treść przepisu, a nie tylko opis
posiłku. Ścieżka opisowa zachowuje się co do znaku tak jak przed zmianą.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego (jedno zdanie) | Źródło |
| --- | --- | --- | --- |
| Arytmetyka porcji | Model zwraca kalorie **jednej porcji**, serwer mnoży przez `portions` i zaokrągla | Mnożenie po stronie kodu daje się sprawdzić testem bez wywołania modelu, a granica 5000 kcal nakłada się na iloczyn tam samo, gdzie dziś nakłada się na iloczyn z bloku odżywczego | Plan, D1 |
| Kaskada przy wycenie | Trasa realizuje wyłącznie FR-010 — blok odżywczy czytany jest tylko przy tworzeniu wpisu | Jedna reguła w jednym miejscu; `applyEstimate` zapisuje zawsze pochodzenie AI, a przycisk robi dokładnie to, co obiecuje | Plan, D2 |
| Wiersz po usuniętym przepisie | Brak `source_recipe_id` kieruje wpis na dzisiejszą ścieżkę opisową, bez mnożenia | Zero nowego kodu i zero nowych stanów; wpis zachowuje jedyną dostępną ścieżkę wyceny zamiast zostać bez wyjścia | Plan, D3 |
| Co trafia do modelu | Treść przepisu z bazy **oraz** pole `content` wpisu, oznaczone jako notatka użytkownika | Pole `content` jest edytowalne od S-03, więc to jedyne miejsce, gdzie może stać poprawka („bez sera", „pół blachy") | Plan, D4 |
| Uprzedzenie o wysyłce | Druga stała `AI_NOTICE_RECIPE`, wybierana po tym, czy wpis pochodzi z przepisu | NFR wymaga, żeby użytkownik wiedział, **co** opuszcza produkt; na tej ścieżce wychodzi treść przepisu, więc zdanie o samym opisie przestało być prawdziwe | Plan, D5 |
| Dług F2 (limit częstości, deduplikacja) | Zostaje otwarty; wpis w `known-drift.md` rozszerzony o nową ścieżkę | Roadmapa wprost mówi, że przy 3–4 użytkownikach powtarzane wywołania nie są warte optymalizowania, a cel `speed` nie uzasadnia budowania bramki przed dostarczeniem zakresu | Roadmapa + Plan, D6 |
| Gdzie żyje rozgałęzienie | W trasie `/estimate`, nie w serwisie modelu i nie w serwisie bazy | Trasa jest jedynym miejscem widzącym naraz wiersz wpisu i oba serwisy, więc tylko ona może rozstrzygnąć gałąź kaskady | Plan |
| Zakres testów | Unit z zamockowanym dostawcą; E2E **nie klika** „Policz kalorie" | Precedens z S-02: suita zostaje deterministyczna i nie płaci za wywołania modelu w CI | Plan S-02 |

## Scope

**W zakresie:** metoda `estimateFromRecipe` w `CalorieEstimationService` z własną wiadomością
systemową; pochodzenie jako parametr `DiaryService.applyEstimate` (typ zawężony do dwóch wartości
AI); upublicznienie `readOwnRecipeContent`; rozgałęzienie kaskady w trasie `/estimate` wraz
z mnożeniem przez `portions` i bramką 0–5000; stała `AI_NOTICE_RECIPE`; etykieta `ai_from_recipe`
w `ORIGIN_LABELS`; wybór zdania uprzedzenia w formularzu i przy wierszu listy; testy jednostkowe,
rozszerzony spec E2E; aktualizacja `known-drift.md`.

**Poza zakresem:** jakakolwiek migracja; jakikolwiek zapis do `recipes`; ponowne czytanie bloku
odżywczego przy wycenie; limit częstości i deduplikacja wywołań modelu (F2); naprawa nagłówka
deklarującego kilka porcji w parserze; edycja i usuwanie wpisu (S-05); dzienny cel i pasek postępu
(S-06); zmiany w `useCalorieEstimation`; nowa zależność, nowa zmienna środowiskowa, zapis do `logs`.

## Architecture / Approach

```
POST /api/diary-entries/[id]/estimate
  └── markEstimationRequested()                    [bez zmian]
        ├── entry.calories !== null                → 200, bez modelu       [bez zmian]
        ├── entry.source_recipe_id !== null
        │     └── readOwnRecipeContent()           [dziś prywatne → publiczne]
        │           ├── treść jest  → estimateFromRecipe(treść, entry.content)
        │           │                 × (entry.portions ?? 1) → zaokrąglenie → bramka 0-5000
        │           │                 applyEstimate(..., "ai_from_recipe")
        │           └── RecipeNotFoundError → zejdź na gałąź opisową (NIE 404)
        └── inaczej                                → estimateFromDescription()  [bez zmian]
                                                     applyEstimate(..., "ai_from_description")
```

Sygnatura trasy, kody odpowiedzi i kształt ciała (`DiaryEntryDto`) zostają bez zmian — zmienia się
wyłącznie to, co trasa robi między stemplem a zapisem. Oba serwisy zostają cienkie i niezależne:
`CalorieEstimationService` nie wie nic o bazie, `DiaryService` nie wie nic o modelu. Iloczyn ponad
5000 kcal to brak wartości, nie błąd HTTP: wpis zostaje „Nie policzono" i status 200.

## Phases at a Glance

| Faza | Co dostarcza | Główne ryzyko |
| --- | --- | --- |
| 1. Kontrakt serwerowy | Pełna ścieżka do wiersza z `ai_from_recipe`, sprawdzalna `curl`-em, bez dotykania UI | Ten kontrakt dziedziczy S-05; iloczyn musi przejść bramkę zakresu **przed** zapisem, bo `applyEstimate` nie ma jak zakwestionować liczby, którą dostał |
| 2. Powierzchnia dziennika | Etykieta `ai_from_recipe` i uczciwe zdanie o tym, co opuszcza produkt | Dwa zdania wybierane po dwóch różnych warunkach (`selectedRecipe` przed zapisem, `source_recipe_id` po) — łatwo pomylić stronę |
| 3. Testy i domknięcie bramki | Unit dla promptu i arytmetyki, rozszerzony spec E2E, pełne `code-quality`, aktualizacja rejestru długu | Plik testu wyceny nie może zacząć ładować `import.meta`, bo przestanie się uruchamiać (powód w `calorie-estimation.service.ts:39-52`) |

**Prerequisites:** `ai-estimate-for-free-text` (S-02) i `recipe-entry-with-portions` (S-03)
w `master` — trasa `/estimate`, stan „Nie policzono", kolejka FIFO, parser bloku odżywczego
i etykieta pochodzenia są tu założeniem. Do Fazy 1 i 3 potrzebny działający `OPENROUTER_API_KEY`
oraz co najmniej jeden własny przepis **bez** bloku odżywczego i jeden z blokiem. Do Fazy 3
`.env.test` z `E2E_USERNAME_ID` / `E2E_USERNAME` / `E2E_PASSWORD`.

**Estimated effort:** ~2–3 sesje. Faza 1 najdłuższa, Faza 2 bardzo krótka (trzy miejsca w dwóch
plikach).

## Open Risks & Assumptions

- **Jakość oszacowania z przepisu jest nieznana do ręcznego przejścia.** Model jest darmowy
  i zaszyty na sztywno (`nvidia/nemotron-3-ultra-550b-a55b:free`), a pytanie „na ile porcji dzieli
  się ten przepis" jest trudniejsze niż „ile ma ta porcja, którą opisano". Błąd w założonym podziale
  zostaje przemnożony przez liczbę zjedzonych porcji.
- **Prompt rośnie o całą treść przepisu.** Budżet czasu zostaje bez zmian (55 s w kliencie,
  `maxDuration: 60` na Vercelu), ale to najbliższa granica, o którą ta ścieżka może się otrzeć.
  Gdyby zaczęła dobijać do timeoutu, pierwszym krokiem jest skrócenie treści przed wysłaniem —
  `maxDuration: 60` to sufit darmowego planu.
- **Dług F2 zostaje otwarty świadomie.** Treść przepisu jest większa od opisu, więc pętla w `curl`
  kosztuje teraz więcej niż wcześniej, a `estimation_requested_at` nadal nie ma czytelnika po
  stronie serwera. S-05 dziedziczy ten sam kontrakt.
- **Wiersze utworzone przed tą zmianą zostają z `ai_from_description`,** mimo że pochodzą
  z przepisu. Nie ma z czego odtworzyć, ile porcji zjedzono w chwili tamtego oszacowania, a
  przeliczenie znaczyłoby nadpisanie wartości, których użytkownik mógł już użyć.
- **Wpis-sierota nadal pokazuje liczbę porcji obok wartości niepomnożonej przez nią** (znalezisko F3
  w `known-drift.md`). Zakres tej niespójności kurczy się do wierszy po usuniętym przepisie, ale
  sama niespójność zostaje.
- **Żaden test automatyczny nie przechodzi przez OpenRoutera.** Łańcuch z żywym modelem jest
  pozycją weryfikacji ręcznej — awaria dostawcy nie zatrzyma CI, ale też go nie ostrzeże.
- **Wierszy dziennika z E2E nadal nie da się posprzątać** — trasa `DELETE` przychodzi z S-05.

## Success Criteria (Summary)

- Użytkownik dostaje wartość kaloryczną dla własnego przepisu, który nie podaje wartości na porcję,
  przemnożoną przez liczbę zjedzonych porcji i opisaną jako „oszacowane z przepisu".
- Przed wysłaniem czegokolwiek użytkownik czyta zdanie mówiące, **co** konkretnie opuszcza produkt:
  opis posiłku na ścieżce opisowej, treść przepisu na ścieżce z przepisu.
- Ścieżka opisowa, ekran przepisów, profil, logowanie i rejestracja zachowują się dokładnie jak
  dotąd, a usunięcie przepisu nie zmienia wpisu ani sumy minionego dnia.
