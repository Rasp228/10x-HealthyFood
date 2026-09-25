# Wpis dziennika z własnego przepisu z liczbą porcji — streszczenie planu

> Pełny plan: `context/changes/recipe-entry-with-portions/plan.md`

## What & Why

Roadmap **S-03** domyka US-02 bez ścieżki FR-010 (tę przejmuje S-04): przepisy użytkownika żyją
w tej aplikacji, a liczenie kalorii — dotąd
w jakiejś innej. Kto ugotował z własnego przepisu, wpisuje to danie drugi raz do narzędzia, które
tego przepisu nigdy nie widziało. Ten plaster usuwa podwójny wpis: wyszukujesz swój przepis po
nazwie, podajesz liczbę zjedzonych porcji, a wartość kaloryczna bierze się z bloku odżywczego
przepisu — tylko tam, gdzie ten blok sam deklaruje, że opisuje porcję (FR-009).

## Starting Point

F-01 zbudowało magazyn, S-01 panel dnia, S-02 ścieżkę AI dla opisu. W bazie czekają nietknięte:
`portions numeric(6,2)`, `source_recipe_id` z `ON DELETE SET NULL` i wartość `recipe_nutrition`
w `calorie_origin_enum` — **żadnej migracji nie trzeba**. Brakuje trzech rzeczy: parsera bloku
odżywczego (nie ma go i nie ma czego kopiować — nagłówek `Wartości odżywcze (porcja)` żyje wyłącznie
w PRD, prompty generujące przepisy nie narzucają żadnego formatu), wyszukiwania przepisów **po
nazwie** (dzisiejsze `?search=` przeszukuje też treść i parametry, bez limitu) oraz jakiegokolwiek
śladu przepisów w formularzu wpisu.

## Desired End State

Pod polem opisu stoi opcjonalne „Z mojego przepisu". Wybór przepisu wstawia jego tytuł do opisu,
ukrywa ilość tekstową i pole kalorii, odsłania liczbę porcji z wartością `1` i pokazuje podgląd `≈ 750 kcal —
z przepisu, 3 porcje` albo zdanie, że ten przepis nie podaje wartości na porcję. Zapisany wpis
pokazuje na liście `3 porcje` i etykietę `z przepisu`, a jego wartość wchodzi do sumy dnia. Usunięcie
przepisu nie zmienia ani wpisu, ani sumy minionego dnia.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego (jedno zdanie) | Źródło |
| --- | --- | --- | --- |
| Które nagłówki deklarują porcję | Linia musi zawierać naraz znacznik bloku odżywczego i słowo z rodziny „porcja" (`porcj` / `serving` / `portion`), bez czułości na wielkość liter i ogonki | Łapie realne warianty zapisu, a brak słowa o porcji jest jednoznacznym spadkiem do FR-010; zamyka otwarte pytanie roadmapy `roadmap.md:131` | Plan |
| Skąd liczba w bloku | Pierwsza linia z etykietą z listy (Kalorie / Kaloryczność / Energia / Calories / Energy) i liczbą; linia z `kJ` pomijana | Etykieta odróżnia kalorie od białka i węglowodanów stojących w tym samym bloku, a `kJ` dałoby wartość zawyżoną ~4× | Plan |
| Gdzie liczy się wartość | Serwer przy `POST`, a formularz pokazuje podgląd z **tego samego** czystego modułu | Reguła „pochodzenie ustala serwer" obowiązuje od S-01, a jeden moduł znaczy zero duplikatu reguły | Plan |
| Kształt formularza | Jeden formularz z opcjonalnym polem „Z mojego przepisu" | Najmniejsza zmiana w ścieżce opisowej, która jest podłogą całego modułu i ma już testy E2E | Plan |
| Kolizja ilości | Liczba porcji **zastępuje** pole ilości tekstowej; wpis z przepisu ma `amount_text = null` | FR-002 wprost dzieli ilość na liczbę porcji dla przepisu i tekst dla opisu; wiersza z dwiema ilościami nie da się utworzyć | Plan |
| Wyszukiwanie po nazwie | Addytywne `search_field=title` i `limit` w `GET /api/recipes`; brak obu = dzisiejsze zachowanie co do znaku | FR-007 mówi „po nazwie", a `.ilike()` jest parametryzowane, więc ścieżka dziennika omija nieuciekniętą interpolację w `or()` | Plan |
| Treść wpisu | Tytuł przepisu, pole zostaje edytowalne | Wpis trzyma własną kopię treści, więc usunięcie przepisu nie rusza minionych dni; S-05 i tak to pole otworzy | Plan |
| Przepis bez rozpoznanego bloku | Zdanie informacyjne w podglądzie, zapis z `calories = null` | Użytkownik wie przed zapisem, a wpis ląduje w stanie „Nie policzono", który S-02 umie narysować i który S-04 przejmie oszacowaniem z treści | Plan |
| Iloczyn ponad 5000 kcal | Traktowany jak brak wartości, z własnym komunikatem | Ta sama granica, którą S-02 stosuje do odpowiedzi modelu — cała kaskada trzyma jedną regułę | Plan |
| Zakres liczby porcji | Liczba `> 0`, `<= 99`, do dwóch miejsc po przecinku, domyślnie `1` | Dokładnie to, co przyjmuje `numeric(6,2) check (portions > 0)` z migracji F-01 | Plan |
| Wartość ręczna a przepis | Przysłane `calories` wygrywa: zapis z pochodzeniem `manual`, bez użycia treści przepisu — ale własność `source_recipe_id` weryfikowana i tak, a formularz na ścieżce przepisu chowa to pole, więc stan ten jest osiągalny tylko z trasy, nie z UI | FR-004 mówi „w dowolnym momencie", a po zapisie `PATCH` i tak przyjmuje liczbę; widoczne pole kalorii obok podglądu `z przepisu` po cichu unieważniałoby wyliczenie | PRD + przegląd planu, F2 |
| Wycena AI dla wpisu z przepisu | Zostaje dostępna, w formularzu i na wierszu listy | Bez niej wpis „Nie policzono" nie ma żadnej ścieżki poza wpisaniem liczby z palca; `content` jest edytowalne, więc `ai_from_description` opisuje to, co trasa faktycznie czyta — kosztem jest brak skalowania przez `portions` do czasu S-04 | Przegląd planu, F1 |

## Scope

**W zakresie:** moduł `src/lib/utils/recipe-nutrition.ts` z pełnym pokryciem testami; `portionsSchema`
i trzy reguły wzajemne w `createDiaryEntrySchema`; gałąź przepisu w `DiaryService.createEntry`
z typowanym `RecipeNotFoundError`; mapowanie tego błędu na 404 w trasie wpisów; addytywne
`search_field` i `limit` w `GET /api/recipes`; hook `useRecipeSearch` z opóźnieniem i strażnikiem
kolejności; helper `formatPortions`; pole wyboru przepisu, pole porcji i podgląd w `DiaryEntryForm`;
porcje na liście dnia; etykieta `recipe_nutrition`; dwie pozycje w `known-drift.md`; testy
jednostkowe i rozszerzenie suity E2E.

**Poza zakresem:** jakakolwiek migracja; jakikolwiek zapis do `recipes`; oszacowanie z treści
przepisu (S-04); edycja i usuwanie wpisu, w tym poprawienie liczby porcji po zapisie (S-05); dzienny
cel i pasek postępu (S-06); poprawianie interpolacji w istniejącym `or()`; naprawa `useFetchRecipes`;
wydzielanie wyszukiwarki z `HomePage.tsx`; limit częstości wywołań AI; nowa zależność, nowa zmienna
środowiskowa, zapis do `logs`.

## Architecture / Approach

```
Formularz: pole "Z mojego przepisu" → useRecipeSearch (500 ms, strażnik kolejności)
  └── GET /api/recipes?search=&search_field=title&limit=10   → pełne wiersze (content dla podglądu)
        └── podgląd: resolveRecipeCalories(recipe.content, portions)   [w trakcie renderu]

Zapis: POST /api/diary-entries { content, source_recipe_id, portions, calories? }
  └── createDiaryEntrySchema  [3 reguły wzajemne: portions ↔ source_recipe_id, ✗ amount_text]
        └── DiaryService.createEntry
              ├── source_recipe_id ≠ null → odczyt przepisu (własny, RLS) — ZAWSZE, przed gałęziami
              │                             brak wiersza → RecipeNotFoundError → 404
              ├── calories !== null      → zapis, origin = "manual"        (FR-004 wygrywa)
              ├── source_recipe_id       → resolveRecipeCalories(content, portions)
              │           ├── total !== null → calories, origin = "recipe_nutrition"
              │           └── total === null → oba null → wpis "Nie policzono"
              └── inaczej                → zachowanie dzisiejsze

Lista dnia: formatPortions(entry.portions) ?? entry.amount_text
            ORIGIN_LABELS.recipe_nutrition = "z przepisu"
```

Ten sam czysty moduł liczy po obu stronach, ale **zapisuje wyłącznie serwer**. Brak wartości nigdy
nie jest błędem HTTP — to wiersz bez `calories` i status 201. Jedynym błędem jest wskazanie przepisu,
którego użytkownik nie ma: 404.

## Phases at a Glance

| Faza | Co dostarcza | Główne ryzyko |
| --- | --- | --- |
| 1. Parser bloku odżywczego | Czysty moduł + komplet testów; zero bazy, sieci i UI | Jedyne miejsce, gdzie ta zmiana może **policzyć źle** zamiast nie policzyć wcale; lista wariantów nagłówka jest decyzją produktową bez wzorca w repo |
| 2. Kontrakt serwerowy | Schemat, gałąź przepisu w serwisie, 404, dwa addytywne parametry w trasie przepisów — sprawdzalne `curl`-em | Jedyne wyjście tej zmiany poza dziennik; regresja w `GET /api/recipes` łamie FR-014 |
| 3. Powierzchnia dziennika | Wyszukiwarka, porcje, podgląd, porcje na liście, etykieta pochodzenia | Przebudowa formularza, który jest podłogą modułu; podgląd musi liczyć się w renderze, bo `react-hooks/set-state-in-effect` jest `error` |
| 4. Testy i domknięcie bramki | Rozszerzony page object i spec E2E, pełne `code-quality` | Scenariusz E2E musi sam utworzyć przepis z blokiem — suita nie może zakładać, że konto testowe taki ma |

**Prerequisites:** `manual-diary-entry` (S-01) i `ai-estimate-for-free-text` (S-02) w `master` — panel
dnia, stan „Nie policzono", `PATCH` z wartością ręczną i etykieta pochodzenia są tu założeniem.
Do Fazy 1 i 2 potrzebny co najmniej jeden własny przepis z blokiem odżywczym i jeden bez; do Fazy 4
`.env.test` z `E2E_USERNAME_ID` / `E2E_USERNAME` / `E2E_PASSWORD`. Klucz OpenRoutera **nie** jest
potrzebny — ta zmiana nie woła modelu ani razu.

**Estimated effort:** ~3–4 sesje, po jednej na fazę; Faza 1 najkrótsza, Faza 3 najdłuższa.

## Open Risks & Assumptions

- **Lista rozpoznawanych nagłówków jest zgadywana, nie zmierzona.** Nic w `src/` nie emituje ani nie
  waliduje bloku odżywczego, a prompty AI proszą tylko o „wartości odżywcze". Ręczna weryfikacja
  Fazy 1 na prawdziwych przepisach jest jedynym momentem, w którym ta lista zderza się z danymi —
  i jest bramką: jeśli żaden prawdziwy przepis nie przechodzi, przed Fazą 2 trzeba albo rozszerzyć
  listę, albo dopisać format do promptów w `ai.service.ts` (Faza 1, notatka przy bramce). To druga
  opcja zamyka sprawę na przyszłość — aplikacja sama pisze większość tego tekstu.
- **Ścieżka FR-009 może w praktyce okazać się rzadka.** PRD świadomie wybrało tańszy błąd („nie
  rozpoznamy" zamiast „policzymy kilkakrotnie za dużo"), więc przepisy z blokiem bez deklaracji
  porcji spadają do wyceny ręcznej, a po S-04 do oszacowania z treści. To projekt, nie usterka — ale
  po wdrożeniu warto policzyć, ile własnych przepisów faktycznie przechodzi, i wtedy rozstrzygnąć
  sprawę formatu w promptach.
- **Liczby porcji nie da się poprawić po zapisie.** Edycja wpisu należy do S-05; do tego czasu pomyłka
  w porcjach oznacza nowy wpis albo ręczne nadpisanie samej liczby kalorii.
- **Wycena AI na wpisie z przepisu nie skaluje się przez `portions`.** Trasa wyceny czyta `content`,
  nie przepis i nie liczbę porcji, więc wiersz pokaże `3 porcje` obok wartości niepomnożonej przez
  trzy. Świadomie przyjęte (F1): odebranie tej ścieżki zostawiłoby wpis „Nie policzono" bez żadnej
  opcji poza liczbą z palca. Zamyka to S-04 wraz z `ai_from_recipe`.
- **Zmiana wychodzi poza dziennik w dokładnie jednym miejscu.** Dwa nowe parametry w
  `GET /api/recipes` są addytywne. Niezmieniony `tests/e2e/recipe-management.spec.ts` dowodzi tego
  dla ścieżki **bez** `search` — tej samej, którą chodzi `cleanup.service.ts`. Gałąź `?search=`,
  czyli jedyna faktycznie przepisywana, nie ma testu automatycznego; jej dowodem jest ręczne
  porównanie 2.10 i to jest przyjęte świadomie.
- **Nieucięta interpolacja w istniejącym `or()` zostaje.** Ścieżka dziennika jej nie dotyka, ale
  ekran przepisów nadal wkleja termin surowo; znalezisko idzie do `known-drift.md` zamiast do
  naprawy, żeby nie mieszać refaktoru z dostarczeniem plastra.
- **Wierszy dziennika z E2E nadal nie da się posprzątać** — trasa `DELETE` przychodzi z S-05.
  Przepisy testowe sprząta `cleanup.service.ts`, ale `diary-entry.spec.ts` musi go **sam podpiąć** —
  dziś woła go wyłącznie `recipe-management.spec.ts`. I kasuje on wszystkie przepisy konta
  testowego, nie tylko te z przebiegu.

## Success Criteria (Summary)

- Użytkownik wyszukuje swój przepis po nazwie, podaje liczbę porcji i dostaje wartość kaloryczną
  wprost z tego przepisu, z widoczną informacją, skąd pochodzi — bez ani jednego wywołania modelu.
- Przepis, który nie deklaruje wartości na porcję, nie zatrzymuje niczego: wpis powstaje, mówi „Nie
  policzono" i przyjmuje liczbę wpisaną ręcznie.
- Usunięcie przepisu zostawia wpis i sumę minionego dnia bez zmian, a wszystkie ekrany sprzed zmiany
  — przepisy z ich wyszukiwarką, profil, logowanie, rejestracja — zachowują się dokładnie jak dotąd.
