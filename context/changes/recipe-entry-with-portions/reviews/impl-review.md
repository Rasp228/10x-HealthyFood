<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Wpis dziennika z własnego przepisu z liczbą porcji

- **Plan**: context/changes/recipe-entry-with-portions/plan.md
- **Scope**: Full plan (Fazy 1–4, wszystkie pola wyboru `## Progress` zaznaczone)
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-09-25
- **Verdict**: REJECTED → po triażu **NEEDS ATTENTION** (jedno znalezisko CRITICAL świadomie
  pominięte i odnotowane w roadmapie)
- **Findings**: 2 critical, 4 warnings, 4 observations
- **Triaż**: 8 naprawionych (F1, F3, F4, F5, F6, F7, F9, F10 — F7 tylko dokumentacyjnie),
  1 pominięte (F2), 1 odrzucone (F8)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | FAIL |
| Architecture | WARNING |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Bramki (uruchomione w trakcie przeglądu)

| Komenda | Wynik |
| --- | --- |
| `npm run test` | 250/250 zielonych, 10 zestawów |
| `npm run lint` | czysto |
| `npm run typecheck` | 0 błędów, 0 ostrzeżeń (145 plików) — patrz F4 |
| `npm run format:check` | czysto |
| `npm run test:security` | przeszedł (jedno dozwolone `GHSA-9wv6-86v2-598j`) |
| `npm run test:e2e` | 5/5 zielonych, w tym nietknięty `recipe-management.spec.ts` (wymagało `E2E_PORT=3011` — port 3000 zajęty lokalnie przez inny proces) |

Po triażu bramki przebiegnięte ponownie: `npm run test` **253/253**, `npm run typecheck` 0 błędów,
`npm run lint` i `npm run format:check` czysto, `npm run test:e2e` **5/5**.

Weryfikacja ręczna: wszystkie 23 pozycje `Manual` w `## Progress` są zaznaczone. Diff niesie
obserwowalny ślad dla każdej z nich (pola formularza, etykieta pochodzenia, page object, scenariusze
E2E), z jednym wyjątkiem opisanym w F7 — pozycja 1.5 nie zostawia śladu, którym ze środków bramka
została zamknięta, choć prompty `ai.service.ts` zmieniono.

## Findings

### F1 — Parser bierze kalorie z linii makroskładnika stojącej nad etykietą

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — realny kompromis; warto się zatrzymać i przemyśleć
- **Dimension**: Safety & Quality
- **Location**: src/lib/utils/recipe-nutrition.ts:195-208
- **Detail**: Pętla po liniach bloku sprawdza dla **każdej linii** najpierw etykietę, a zaraz potem
  kotwicę `KCAL_ANCHORED_NUMBER` (`:54`), i kończy na pierwszym trafieniu. Linia makroskładnika
  z kaloriami w nawiasie, stojąca **nad** linią z etykietą, wygrywa. Zweryfikowane uruchomieniem
  modułu: treść `Wartości odżywcze (na porcję):\nTłuszcze: 12 g (108 kcal)\nKalorie: 250 kcal` daje
  `{"perPortion":108,"total":108,"reason":"ok"}` — 108 zamiast 250, z pochodzeniem
  `recipe_nutrition`, czyli przedstawione użytkownikowi jako wartość autorytatywna i wliczone do sumy
  dnia. Test „etykieta ma pierwszeństwo przed jednostką w tej samej linii"
  (`tests/unit/recipe-nutrition.test.ts:130`) broni tej gwarancji tylko **wewnątrz** jednej linii;
  między liniami jej nie ma. Sama ścieżka kotwicy jest przy tym rozszerzeniem ponad plan: reguła 3
  Fazy 1 mówiła o zamkniętej liście etykiet z **opcjonalną** jednostką, nie o odczycie liczby bez
  etykiety.
- **Fix A ⭐ Recommended**: Dwa przebiegi po bloku — najpierw szukać linii z etykietą w całym bloku,
  kotwicę `kcal` uruchomić dopiero wtedy, gdy żadna linia bloku etykiety nie niosła.
  - Strength: Zachowuje rozpoznanie formy `~450 kcal, 25g białka`, którą ta aplikacja sama generuje,
    i przywraca pierwszeństwo etykiety, które moduł już deklaruje w komentarzu `:45-53`.
  - Tradeoff: Druga pętla po maksymalnie dziesięciu liniach; zero zmian w kontrakcie modułu.
  - Confidence: HIGH — defekt odtworzony uruchomieniem, poprawka lokalna w jednej funkcji.
  - Blind spot: Nie sprawdzono, ile realnych przepisów na koncie ma linię makroskładnika z `kcal`
    przed linią etykiety — czyli jak często to dziś bije.
- **Fix B**: Usunąć ścieżkę kotwicy i wrócić do samej listy etykiet z planu.
  - Strength: Wraca do kontraktu, który plan opisał i który przeszedł przegląd planu.
  - Tradeoff: Traci rozpoznanie bloków wypisujących wartości ciągiem — a to była przyczyna, dla
    której ścieżkę dopisano przy zamykaniu bramki ręcznej 1.5.
  - Confidence: MEDIUM — zależy od tego, ile przepisów stoi dziś na tej formie.
  - Blind spot: To samo co wyżej — brak pomiaru na prawdziwych danych.
- **Decision**: FIXED via Fix A — `readPerPortionCalories` biegnie dwoma przebiegami (etykieta
  w całym bloku, kotwica `kcal` jako fallback); dopisany test regresyjny „etykieta ma pierwszeństwo
  przed jednostką także w linii stojącej NIŻEJ".

### F2 — Nagłówek deklarujący kilka porcji przechodzi bramkę samodeklaracji

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — realny kompromis; warto się zatrzymać i przemyśleć
- **Dimension**: Safety & Quality
- **Location**: src/lib/utils/recipe-nutrition.ts:40,88-96
- **Detail**: `isSelfDeclaringHeader` sprawdza `includes` po obu listach, więc `PORTION_MARKERS`
  (`porcj`) trafia także w nagłówek mówiący wprost, że blok opisuje **kilka** porcji. Zweryfikowane
  uruchomieniem modułu, przy `portions = 1`: `Wartości odżywcze (całość, 4 porcje):` ⇒ 2000,
  `Wartości odżywcze dla 4 porcji:` ⇒ 2000, `Wartości odżywcze na 4 porcje:` ⇒ 2000. Za jedną
  zjedzoną porcję wpis dostaje czterokrotność, z etykietą `z przepisu`. To odwrotność asymetrii
  ryzyka, którą moduł deklaruje jako zamkniętą (`recipe-nutrition.ts:10-12,36-38`: „lepiej nie
  policzyć, niż policzyć kilkakrotnie za dużo") i pod którą PRD zawęził FR-009. Test odrzucający
  `Wartości odżywcze (całość)` (`tests/unit/recipe-nutrition.test.ts:44`) nie pokrywa wariantu
  z liczbą porcji obok. Wdrożenie jest tu **zgodne z planem** — dziura siedzi w regule 1 Fazy 1
  (decyzja D1), nie w kodzie.
- **Fix**: Odrzucać nagłówek, w którym tuż przed słowem z rodziny porcji stoi liczba różna od 1
  (`/(\d+)\s*(porcj|serving|portion)/` z wartością ≠ 1) albo występuje słowo z listy
  `calosc / lacznie / razem / total`; dopisać oba warianty do `tests/unit/recipe-nutrition.test.ts`
  i poprawić regułę 1 w planie, bo to ona jest tu źródłem prawdy.
  - Strength: Zamyka jedyną ścieżkę, na której ta zmiana zawyża wartość, i robi to w tym samym
    predykacie, który już jest jedyną bramką produktową modułu.
  - Tradeoff: Lista wyrazów rośnie o cztery pozycje — to zgadywanie o krok dalej, tak jak
    „środek 1" z bramki Fazy 1.
  - Confidence: HIGH — trzy warianty odtworzone uruchomieniem, poprawka w jednej funkcji.
  - Blind spot: Nie sprawdzono, czy istnieją nagłówki mieszane („na porcję z 4 porcji"), które nowa
    reguła odrzuci niepotrzebnie.
- **Decision**: SKIPPED

### F3 — `portions` przeżywa usunięcie przepisu i łamie własny inwariant schematu

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — realny kompromis; warto się zatrzymać i przemyśleć
- **Dimension**: Architecture
- **Location**: src/lib/validations/diary/create-entry.ts:102-133
- **Detail**: `superRefine` narzuca regułę „porcje tylko razem z `source_recipe_id`", ale baza tej
  pary nie pilnuje, a klucz obcy ma `on delete set null`
  (`supabase/migrations/20260922140906_create_diary_entries.sql:38`). Po usunięciu przepisu wiersz
  zostaje z `portions = 2`, `calorie_origin = 'recipe_nutrition'` i `source_recipe_id = NULL` — czyli
  w stanie, którego trasa tworząca nigdy by nie przyjęła. Sytuacja nie jest teoretyczna: nowy
  `afterEach` w `tests/e2e/diary-entry.spec.ts` kasuje wszystkie przepisy konta testowego, a wpisów
  dziennika nic nie sprząta (trasa `DELETE` przychodzi dopiero z S-05), więc po pierwszym przebiegu
  konto ma dokładnie takie wiersze. S-05 przepuści taki wiersz przez ten sam schemat i dostanie 400 na
  wpisie, którego użytkownik nie tknął. Sam ekran dziennika renderuje go poprawnie — „2 porcje" nadal
  jest prawdą o tym, co zjedzono.
- **Fix A ⭐ Recommended**: Dopisać pozycję do `docs/reference/known-drift.md`: inwariant „porcje tylko
  z przepisem" obowiązuje wyłącznie w chwili zapisu, `on delete set null` go rozłącza, a S-05 musi to
  przewidzieć w schemacie edycji.
  - Strength: Mieści się w zakresie tej zmiany, która wprost wyklucza migracje, i kieruje ustalenie
    tam, gdzie ma zapaść — do kawałka, który edycję wpisu buduje.
  - Tradeoff: Dług zostaje w bazie; ktoś musi go podnieść w S-05, a nie dziś.
  - Confidence: HIGH — `known-drift.md` jest w tym repo ustalonym miejscem na dokładnie takie
    ustalenia i ta zmiana już dwie tam dopisała.
  - Blind spot: Nie sprawdzono, ile wierszy w stanie rozłączonym stoi dziś na koncie testowym.
- **Fix B**: Domknąć inwariant w bazie — check `portions is null or source_recipe_id is not null`
  plus trigger zerujący `portions` przy `set null`.
  - Strength: Wiersz nie może wpaść w stan nieprzyjmowalny przez własny schemat.
  - Tradeoff: Wymaga migracji, którą plan wyklucza w sekcji „What We're NOT Doing", i zmienia
    zachowanie kolumny, na której stoi kryterium akceptacji US-02.
  - Confidence: MEDIUM — trigger na `set null` to nowa mechanika w schemacie, który dotąd jej nie ma.
  - Blind spot: Nie sprawdzono, czy S-05 nie zamierza opierać edycji właśnie na zachowanym `portions`.
- **Decision**: FIXED via Fix A — nowa sekcja „Wpisy dziennika" w `docs/reference/known-drift.md`
  z jawnym warunkiem dla S-05.

### F4 — Bramka `typecheck` daje się zatruć wygenerowanym `playwright-report/`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąska
- **Dimension**: Success Criteria
- **Location**: tsconfig.json:3
- **Detail**: `include: ["**/*"]` przy `exclude: ["dist"]` wciąga do programu wygenerowane katalogi
  `playwright-report/` i `test-results/`. Gdy raport zawiera podkatalog `trace/` z minifikowanymi
  bundle'ami przeglądarki śladów (powstaje po przebiegu z retry — a `playwright.config.ts` ustawia
  lokalnie `retries: 1`), globalne `it` z tych bundle'i przesłania `it` z `@types/jest`
  i `npm run typecheck` zwraca **250 błędów** `ts(2349) This expression is not callable. Type 'Number'
  has no call signatures.` w plikach testowych, których nikt nie tknął. Zastałem dokładnie ten stan na
  starcie przeglądu; po czystym przebiegu E2E raport ma już tylko `index.html` i bramka wraca do
  0 błędów. Potwierdzone pomiarem: ten sam tsconfig z `exclude` rozszerzonym o oba katalogi daje
  0 błędów nawet przy zastałym raporcie. Konfiguracja jest starsza niż ta zmiana, a CI (świeży
  checkout) jest nietknięte — ale to Faza 4 uruchamia E2E i to tutaj pułapka zaczyna kąsać.
- **Fix**: Dopisać `"playwright-report"` i `"test-results"` do `exclude` w `tsconfig.json`.
- **Decision**: FIXED — `exclude` w `tsconfig.json` obejmuje teraz oba wygenerowane katalogi.

### F5 — Nowe parametry dopisane do schematu Zod zadeklarowanego inline w trasie

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąska
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/recipes/index.ts:17-26
- **Detail**: `search_field` i `limit` dołożono do `listSchema` stojącego inline w handlerze.
  `AGENTS.md` mówi wprost, że schematy Zod mieszkają w `src/lib/validations/<domena>/<akcja>.ts` i nie
  wolno ich deklarować w trasach, a `docs/reference/known-drift.md` wymienia ten plik jako jedną
  z tras łamiących regułę. Zmiana powiększa dług przy okazji dotykania pliku. Ścieżka dziennika w tej
  samej zmianie robi to poprawnie (`src/lib/validations/diary/create-entry.ts`), więc rozbieżność jest
  wewnętrzna, nie tylko wobec dokumentu.
- **Fix**: Wyciągnąć `listSchema` do `src/lib/validations/recipe/list-recipes.ts` i zaimportować
  w trasie; zdjąć plik z listy w `known-drift.md`.
- **Decision**: FIXED — nowy `src/lib/validations/recipe/list-recipes.ts` (`listRecipesSchema`),
  trasa tylko importuje. Wpis w `known-drift.md` zostaje: `createRecipeSchema` dla `POST` nadal stoi
  w tym pliku inline.

### F6 — Roadmapa: pytanie zamknięte decyzją D1 stoi otwarte, status S-03 nie domknięty

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąska
- **Dimension**: Plan Adherence
- **Location**: context/foundation/roadmap.md:131
- **Detail**: Plan (Faza 1, reguła 1) i `change.md` deklarują, że decyzja D1 zamyka otwarte pytanie
  „które warianty nagłówka liczą się jako samodeklarujące porcję". W `roadmap.md` wpis **Unknowns**
  stoi nietknięty, a status S-03 to nadal `in-progress`, mimo że `change.md` mówi `implemented`
  i wszystkie pola wyboru `## Progress` są zaznaczone. Jedyna zmiana w tym pliku to `proposed` →
  `in-progress` i data.
- **Fix**: Zastąpić wpis **Unknowns** rozstrzygnięciem D1 (z odesłaniem do
  `src/lib/utils/recipe-nutrition.ts` jako miejsca, gdzie lista wariantów żyje) — status S-03
  przestawi `/10x-archive` przy zamykaniu zmiany. Jeśli F2 zmieni regułę, D1 trzeba zapisać już
  w poprawionej postaci.
- **Decision**: FIXED — wpis **Unknowns** w `roadmap.md` zamknięty rozstrzygnięciem D1, z odesłaniem
  do `recipe-nutrition.ts` i z jawnie odnotowanym ubytkiem z F2 (pominiętego w triażu). Status S-03
  zostaje `in-progress` — przestawi go `/10x-archive`.

### F7 — Prompty `ai.service.ts` zmienione bez śladu decyzji, którą plan rezerwował właścicielowi

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąska
- **Dimension**: Scope Discipline
- **Location**: src/lib/services/ai.service.ts
- **Detail**: Do obu promptów dopisano wymóg emitowania bloku `Wartości odżywcze (na porcję):` z linią
  `Kalorie: N kcal`. Treściowo to dokładnie „środek 2" z Manual Verification Fazy 1, więc formalnie
  mieści się w tym, co plan dopuszczał — ale plan pisał, że wybór środka „należy do właściciela, nie
  do wdrażającego", a w repo nie ma śladu, że taka decyzja zapadła; pozycja 1.5 w `## Progress`
  odnotowuje samo przejście bramki. Poza tym diff niesie usunięcie białych znaków na końcach ~40 linii
  obu promptów — bez wpływu na treść instrukcji.
- **Fix**: Dopisać jedno zdanie do `change.md` (albo do sekcji bramki w planie): że bramka 1.5
  zamknęła się środkiem 2 i kto to rozstrzygnął.
- **Decision**: FIXED (tylko dokumentacja — właściciel potwierdził, że prompt był poprawiany
  świadomie): akapit w `change.md` odnotowuje zamknięcie bramki 1.5 środkiem 2. Kod promptów
  nietknięty.

### F8 — Wybór przepisu nadpisuje wpisany już opis, choć usunięcie wyboru go chroni

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąska
- **Dimension**: Safety & Quality
- **Location**: src/components/diary/DiaryEntryForm.tsx:178
- **Detail**: `handleSelectRecipe` wstawia `recipe.title` do `content` bezwarunkowo.
  `handleClearRecipe` (`:186-191`) celowo opisu **nie** rusza, z komentarzem, że użytkownik mógł go
  już poprawić i kasowanie byłoby utratą pracy. Ta sama praca ginie w drugą stronę: kto napisał opis,
  a potem wybrał przepis, traci swój tekst. Zachowanie jest zgodne z planem (Faza 3 §3 mówi „wstawia
  `recipe.title` do `content`"), niespójne jest uzasadnienie.
- **Fix**: Wstawiać tytuł tylko wtedy, gdy `content` jest puste albo równe tytułowi poprzednio
  wybranego przepisu.
- **Decision**: DISMISSED — właściciel: gdy ktoś coś napisał, a potem wyszukuje i wybiera tytuł,
  to co napisał **może** zniknąć. Zachowanie zamierzone, kod bez zmian.

### F9 — „Zapisz i policz kalorie" zostaje aktywne, gdy podgląd już policzył wartość

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąska
- **Dimension**: Safety & Quality
- **Location**: src/components/diary/DiaryEntryForm.tsx:539
- **Detail**: W trybie przepisu pole kalorii nie istnieje, więc `values.calories` jest zawsze puste
  i przycisk nigdy się nie wyłącza — także gdy podgląd pokazuje `≈ 500 kcal — z przepisu`. Kliknięcie
  tworzy wpis z wartością, a potem wysyła żądanie `/estimate`, które trafia w bramkę
  `entry.calories !== null` (`src/pages/api/diary-entries/[id]/estimate.ts:61-64`) i wraca bez
  wywołania modelu; `markEstimationRequested` jest warunkowy, więc znacznik też nie powstaje. Skutków
  ubocznych brak — jedno zbędne żądanie i mylący przycisk.
- **Fix**: Wyłączyć drugi przycisk, gdy podgląd niesie wyliczoną wartość (`reason === "ok"`).
- **Decision**: FIXED — podgląd trzyma teraz cały wynik `resolveRecipeCalories`, a przycisk gaśnie
  przy `recipeAlreadyCounted`, tym samym warunkiem co przy wpisanej ręcznie liczbie.

### F10 — Dwie luki testowe wymienione wprost w planie

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąska
- **Dimension**: Success Criteria
- **Location**: tests/unit/diary-service.test.ts
- **Detail**: (1) Kryterium 2.2 wymieniało wśród gałęzi testów serwisu „wartość poza zakresem" —
  testu serwisowego dla `out_of_range` nie ma, gałąź jest pokryta tylko na poziomie parsera (i schodzi
  do tej samej ścieżki co `no_declared_block`). (2) Lista obowiązkowa Fazy 1 §2 żądała dosłownego
  dowodu, że `Kalorie: 250 kcal` bloku **nie** ucina mimo dwukropka; ten sam predykat jest udowodniony
  przypadkami `Porcja: 1 sztuka` i `Na 100 g:` (`tests/unit/recipe-nutrition.test.ts:201,207`), ale
  literalnego przypadku z etykietą kaloryczną nie ma.
- **Fix**: Dopisać dwa przypadki — jeden test serwisu na `out_of_range` i jeden test parsera
  z literalną linią `Kalorie: 250 kcal` wewnątrz bloku.
- **Decision**: FIXED — dopisane oba: `250 × 99` ⇒ oba pola puste
  (`tests/unit/diary-service.test.ts`) i „sama linia `Kalorie: 250 kcal` bloku NIE ucina"
  (`tests/unit/recipe-nutrition.test.ts`).
