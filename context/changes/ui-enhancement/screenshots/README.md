# Zrzuty — `/diary` przed i po zmianie `ui-enhancement`

> **W repo zostały trzy zrzuty**: `before-diary-light-375.png`, `after-diary-light-375.png`
> i `after-states-light-desktop.png` (przegląd wdrożenia, ustalenie F10). Repo nie ma testów
> zrzutów, więc PNG to dokumentacja, nie baseline. Odtwarzalną bramką jest `/dev/diary-states`
> razem z opisaną niżej metodą. Pozostałe pliki z list poniżej są w historii gita:
> `git show 6bce2c8:context/changes/ui-enhancement/screenshots/<plik>`. Po poprawkach z przeglądu
> (F1, F3, F4) zrzuty „po” nie pokazują już tła karty sumy `/3` ani nowego układu TopNav.

## Przed (faza 1)

Stan sprzed jakiejkolwiek zmiany wizualnej, zrobiony 2026-09-30 na `master` (`4ea756e`),
zanim w repo pojawiły się nowe prymitywy shadcn. Playwright/Chromium (skrypt jednorazowy poza
repo) na serwerze dev `npm run dev:e2e -- --port 3100 --ignore-lock`, konto testowe z `.env.test`.

Pliki:

- `before-diary-{light,dark}-{375,desktop}.png` — cały `/diary?date=2000-01-05`, `fullPage`;
  375 = viewport 375×812, desktop = 1280×800;
- `before-topnav-375.png` — sam nagłówek na viewporcie 375 px, wycięty na pełną szerokość
  dokumentu (606 px), żeby było widać, jak daleko sięgają przyciski.

Motyw ustawiony przed nawigacją przez `localStorage.theme` (`light` / `dark`) — ten sam klucz,
który czytają `ThemeScript.tsx` i `ThemeToggle.tsx`. Zrzut po `data-testid="diary-page"`
(zhydratowany korzeń) i `networkidle`. Astro dev toolbar ukryty stylem na czas zrzutu.

### Stan danych

Dzień `2000-01-05` — nieużywany przez E2E (`diary-entry.spec.ts` pisze na `2000-01-01`,
`daily-goal.spec.ts` na `2000-01-02`). Przed zrzutami dzień był pusty, cel nieustawiony,
konto bez przepisów. Utworzone przez API w zalogowanym kontekście przeglądarki:

| Wpis                           | Ilość    | Wartość  | Pochodzenie                          |
| ------------------------------ | -------- | -------- | ------------------------------------ |
| Owsianka z bananem             | 1 miska  | 420 kcal | `manual`                             |
| Kanapka z serem                | 2 kromki | 380 kcal | `manual`                             |
| Jabłko                         | 1 sztuka | —        | bez wartości („Nie policzono”)       |
| Zupa pomidorowa z makaronem    | 1 talerz | 200 kcal | `ai_from_description` (wycena AI OK) |
| Makaron z warzywami (zrzut UI) | 2 porcje | 700 kcal | `recipe_nutrition` (350 kcal/porcję) |

Cel dzienny ustawiony na 2000 kcal. Suma dnia: 1700 kcal, pasek 1700 / 2000, „zostało 300 kcal”,
„Bez policzonych kalorii: 1 z 5”.

Po zrzutach:

- wpis z przepisu i sam przepis („Makaron z warzywami (zrzut UI)”) **usunięte** — suita
  `recipe-management` i tak kasuje przepisy konta, a wpis zostałby wtedy sierotą z porcjami;
- cel **przywrócony** do `null` (stan sprzed zrzutów), bo jest jeden na konto i rysuje pasek
  w każdym dniu;
- cztery wpisy opisowe na `2000-01-05` **zostawione** — pod zrzuty „po” w fazie 5. Przed nimi
  trzeba znów ustawić cel 2000 kcal i dodać przepis z blokiem `Wartości odżywcze (na porcję):
  Kalorie: 350 kcal` oraz wpis z niego na 2 porcje.

### Zaobserwowane

- **TopNav na 375 px** wychodzi poza ekran: przyciski sięgają ~606 px, dokument ma
  `scrollWidth` 606 przy viewporcie 375, więc cała strona przewija się w poziomie, a „Wyloguj”
  jest poza pierwszym ekranem (Z7). Brak wyróżnienia aktywnej sekcji.
- Formularz stoi nad sumą dnia — na 375 px suma i pasek zaczynają się dopiero ~770 px od góry,
  poniżej pierwszego ekranu (Z5).
- Paleta achromatyczna: „Dodaj wpis” i „Policz kalorie” są czarne (jasny) / prawie białe
  (ciemny); jedynym kolorem poza czerwienią „Usuń” jest pasek celu (Z1).
- Pigułka „Nie policzono” jest ręcznie złożona; karty formularza, sumy i wpisów wyglądają tak
  samo, więc liczba dnia nie ma wagi ponad wpisami (Z4).

## Po (faza 5)

Zrobione 2026-09-30 na `master` po fazie 4 (`2a93f42`) plus pliki fazy 5, tą samą metodą co
„przed”: jednorazowy skrypt Playwright/Chromium poza repo (katalog scratchpad sesji), serwer
`npm run dev:e2e -- --port 3100 --ignore-lock`, konto testowe z `.env.test`, motyw przez
`localStorage.theme` przed nawigacją, Astro dev toolbar ukryty stylem, zrzut po `diary-page`
i `diary-day-summary` (na kitchen sinku: po pojawieniu się odegranych błędów walidacji)
i `networkidle`. 375 = viewport 375×812, desktop = 1280×800.

Pliki:

- `after-diary-{light,dark}-{375,desktop}.png` — cały `/diary?date=2000-01-05`, `fullPage`;
- `after-states-{light,dark}-{375,desktop}.png` — cały kitchen sink `/dev/diary-states`, `fullPage`;
- `after-topnav-375.png` — sam `<header>` na viewporcie 375 px (szerokość 375, bo dokument już
  się nie rozszerza);
- `after-focus-{light,dark}.png` — formularz na desktopie z fokusem klawiatury (Tab
  z wyszukiwarki przepisu na pole „Co zjadłeś?”), żeby zadziałało `:focus-visible`.

### Stan danych

Odtworzony stan z fazy 1. Cztery wpisy opisowe na `2000-01-05` były na miejscu (sprawdzone
`GET /api/diary-entries?date=2000-01-05`: 420 `manual`, 380 `manual`, „Jabłko” bez wartości,
200 `ai_from_description`). Przed zrzutami, przez API w zalogowanym kontekście przeglądarki
(`fetch` ze strony, więc z nagłówkiem `Origin`):

- cel dzienny `PUT /api/user-settings` na 2000 kcal;
- przepis „Makaron z warzywami (zrzut UI)” z blokiem `Wartości odżywcze (na porcję):
  Kalorie: 350 kcal`;
- wpis z tego przepisu na 2 porcje; serwer policzył 700 kcal, `recipe_nutrition`.

Suma dnia jak w „przed”: 1700 kcal, 1700 / 2000, „zostało 300 kcal”, „Bez policzonych kalorii:
1 z 5”.

Po zrzutach:

- wpis z przepisu **usunięty** (`DELETE`, 204);
- cel **przywrócony** do `null`;
- przepis: przy sprzątaniu już go nie było (`GET /api/recipes/<id>` zwraca 404, konto ma
  0 przepisów), więc nie było czego kasować; stan końcowy zgadza się ze stanem sprzed zrzutów;
- cztery wpisy opisowe **zostawione** (sprawdzone po sprzątaniu).

### Poziome przewijanie (`document.documentElement.scrollWidth`)

| Strona              | 375 light | 375 dark | desktop (1280) |
| ------------------- | --------- | -------- | -------------- |
| `/diary?date=…`     | 375       | 375      | 1280           |
| `/dev/diary-states` | 375       | 375      | 1280           |

„Przed”: 606 przy 375 (TopNav). Kontrakt fazy 5 spełniony: strona nie przewija się w poziomie.

### Kitchen sink `/dev/diary-states`

Nowa strona na wzór `diary-goal-states.astro` (404 poza DEV, bez `prerender`, sesja wymagana).
Renderuje na fixture'ach `DiaryEntryDto`:

- szkielet (`DiaryPageSkeleton`), błąd listy (`DiaryErrorState`), pusty dzień (`DiaryEmptyState`);
- kartę sumy z celem 2000 (jeden wpis bez wartości) i bez celu;
- formularz: domyślny, błąd walidacji (pusty opis i kalorie „abc”), nieaktywny;
- wiersz wpisu: wartość w czterech pochodzeniach, wycena w locie, w kolejce, świeży znacznik po
  przeładowaniu, stale, bez wartości (idle), usuwanie w drodze, błąd pola kalorii (6000 kcal);
- cztery toasty i dialog usuwania `danger`, wyrenderowane statycznie w ramkach z `transform`,
  które zamykają ich `position: fixed`.

Sposób: komponenty bez własnego stanu renderują się tylko po stronie serwera, z no-opami jako
handlerami. Stany trzymane w `useState` komponentu (błąd walidacji formularza, błąd pola
kalorii) odgrywają wyspy z `src/components/diary/dev/DiaryStateDemos.tsx`: po montażu wpisują
wartość w pole i klikają przycisk, więc komponent dochodzi do błędu własną walidacją, bez
żądania do API. Formularz nieaktywny to `<fieldset disabled>` wokół formularza: ta sama
pseudoklasa `:disabled` co przy `isSubmitting`, ale bez etykiety „Dodawanie...” ze spinnerem
(tego wariantu nie da się osiągnąć bez prawdziwego `POST`). Komponenty produkcyjne bez zmian.

Znane ograniczenie strony: trzy instancje formularza mają te same `id` pól (`diary-content`
itd.), więc kliknięcie etykiety w drugim albo trzecim formularzu fokusuje pole pierwszego.
Wizualnie bez znaczenia, strona jest wyłącznie deweloperska.

### Delta według zarzutów

| #  | Przed | Po | Werdykt |
| -- | ----- | -- | ------- |
| Z1 | „Dodaj wpis”, „Policz kalorie” czarne (jasny) / prawie białe (ciemny); „Healthy” w logo tak samo czarne jak „Meal”; szary fokus | `--primary` / `--ring` z h 184.704: „Dodaj wpis”, „Policz kalorie”, aktywna pozycja TopNav, „Healthy”, akcent karty sumy i pierścień fokusu w turkusie marki, w obu motywach (`after-diary-*`, `after-focus-*`) | przeszedł (zastrzeżenie o ciemnym pasku niżej) |
| Z2 | Panel błędu listy na literałach `red-*` z `dark:` | Panel na `destructive` z przezroczystością, ta sama czerwień co walidacja pól (`after-states-*`, „Błąd ładowania wpisów”) | przeszedł |
| Z3 | 8 ręcznych pól bez `focus-visible`, pole w wierszu inne niż w formularzu | Wszystkie pola to `Input` / `Textarea` z `Label`; fokus klawiatury to 3-px pierścień marki (`after-focus-*`); błąd przez `aria-invalid`, czerwona ramka w formularzu i w wierszu (`after-states-*`); pola nieaktywne wyszarzone | przeszedł |
| Z4 | Suma, formularz i wpisy w tej samej karcie; ręczne pigułki | `Card` wszędzie; karta sumy z ramką i tłem `primary`, liczba `text-4xl`, wyraźnie cięższa od kart wpisów; „Nie policzono” / „Liczę…” / „W kolejce…” to `Badge` (stany w toku w kolorze `info`) | przeszedł |
| Z5 | Na 375 px suma zaczynała się ~770 px od góry; do hydratacji sam spinner | Suma nad formularzem: na 375 px karta z paskiem zaczyna się ~255 px od góry, cała na pierwszym ekranie (`after-diary-*-375`); szkielet z nagłówkiem zamiast spinnera (kitchen sink, „Szkielet do hydratacji”) | przeszedł, skok przy odświeżaniu odroczony (niżej) |
| Z6 | Toasty na literałach palety z `dark:` | Cztery typy z tokenów: ramka i ikona w kolorze roli, tło `rola/10` na karcie, tekst `foreground` (`after-states-*`, „Toasty”) | przeszedł |
| Z7 | TopNav do ~606 px, `scrollWidth` 606, „Wyloguj” poza ekranem, brak aktywnej sekcji | Na 375 px logo i przełącznik motywu w pierwszej linii, linki w drugiej z własnym przewijaniem; „Wyloguj” osiągalny przewinięciem paska (na zrzucie widać jego początek przy krawędzi); „Dziennik” wyróżniony wariantem `default` z `aria-current="page"`; `scrollWidth` 375 (`after-topnav-375.png`) | przeszedł |
| Z8 | Ikona dialogu `text-red-600`, inna czerwień niż „Usuń” | Ikona `text-destructive`, ta sama czerwień co „Usuń” w dialogu i w wierszu (`after-states-*`, „Dialog usuwania”) | przeszedł |

Stany pól na zrzutach: **focus** w `after-focus-{light,dark}.png`; **disabled** w formularzu
„Nieaktywny” i w wierszach „w locie” / „usuwanie w drodze” (`after-states-*`); **error**
w formularzu „Błąd walidacji” i w wierszu „Błąd pola kalorii” (`after-states-*`).

### Odroczone i zauważone przy ocenie zrzutów

- **Skok formularza przy odświeżaniu (odroczone z fazy 3).** Karta sumy stoi nad formularzem,
  a warunek jej pokazania to nadal `!error && !isLoading && entries.length > 0`. Każde
  `refetch()` (dodanie, wycena, edycja, usunięcie) chowa ją na czas ładowania, więc formularz
  podskakuje o jej wysokość. Statyczne zrzuty tego nie pokazują. Powód odroczenia: poprawka
  dotyka hooka danych `useDiaryEntries`, nie warstwy wizualnej (np. hook zwraca dzień
  załadowanych wpisów, a karta zostaje przy odświeżaniu tego samego dnia). Do `/10x-impl-review`.
- **Turkus marki a zieleń paska w ciemnym motywie.** W jasnym motywie przycisk i pasek mają ten
  sam odcień (h 184.704). W ciemnym `--progress` zostało przy `--chart-2` ciemnego motywu
  (h 162.48, zieleń), a `--primary` jest turkusowe, i obok siebie różnica jest widoczna
  (`after-diary-dark-*`). Zgodne z planem („bez zmiany `--progress`”, decyzja archiwalna), ale
  w ciemnym motywie Z1 daje dwa pokrewne kolory, nie jeden odcień. Do decyzji przy przeglądzie.
- **Pierścień fokusu w jasnym motywie jest subtelny.** `ring-ring/50` na białym daje ~2.2:1
  (komentarz przy `--ring` w `global.css`); wyróżnienie niesie grubość 3 px i ramka pola
  w kolorze `--ring`. Na `after-focus-light.png` fokus jest widoczny, ale słabszy niż w ciemnym.
- **Wiersz wpisu na 375 px.** Kolumna kalorii (`shrink-0`, pole 96 px i „Zapisz”) zabiera ponad
  połowę karty, więc „Usuń” schodzi pod „Edytuj”, a dłuższe opisy łamią się na 2–3 linie. Bez
  przewijania i bez ucinania treści; tak samo było „przed”. Poza Z1–Z8.
- **Toasty nakładają się w żywym widoku.** Każdy `Toast` ma własne `fixed right-4 top-4`, więc
  w `ToastContainer` (flex-col) kilka toastów naraz leży w jednym miejscu zamiast w kolumnie.
  Kitchen sink rysuje je osobno w ramkach, więc tego nie pokazuje. Istniało przed zmianą, poza
  zakresem (Z6 dotyczył kolorów).

### Checklista `ui-quality-checklist.md`

**Charges**

- Pisemna lista zarzutów z plikiem, linią i skutkiem: **pass** (Z1–Z8 w `research.md`).
- Brakujące tokeny zastąpione wartościami ze źródła tokenów: **pass** (0 literałów palety
  w `diary/`, `Toast.tsx`, `ConfirmDialog.tsx`; kolory z `:root` / `.dark`).
- Brak drugiego Button / karty / pola obok design-systemu: **pass** w `diary/` (`Input`,
  `Textarea`, `Label`, `Card`, `Badge`). Poza widokiem zostają ręczne pola w `auth/` i `ai/`,
  świadomie poza zakresem.
- Wejścia sprawdzone bez sesji, bez danych i prosto z linku: **pass** (bez sesji redirect
  middleware bez zmian; pusty dzień to `DiaryEmptyState`; z linku najpierw szkielet).
- Nieadresowane zarzuty zapisane jako odroczone: **pass** (sekcja wyżej).

**Contract**

- Kolory z własnego źródła tokenów repo: **pass**.
- Warstwa komponentów repo (`shadcn add`, bez `init`): **pass**.
- Stany default / hover / focus / disabled / error / empty / loading: **pass z luką**. Hover
  nie jest utrwalony na zrzutach (jest tylko w klasach prymitywów), a disabled formularza
  pokazany przez `<fieldset disabled>`, nie przez `isSubmitting`.
- Desktop i jedna szerokość mobilna: **pass** (1280 i 375).
- Widoczny fokus i nazwa kontrolki: **pass** (pierścień marki; pola z `Label`, pole kalorii
  w wierszu z etykietą `sr-only`); zastrzeżenie o `ring/50` w jasnym motywie wyżej.
- Tryb ciemny zmieniony w warstwie tokenów i sprawdzony w obu motywach: **pass**.

**Gate**

- Kitchen sink na tym widoku, baseline tylko przy zamierzonej delcie: **pass** (repo nie ma
  `toHaveScreenshot`; zrzuty „po” to nowe pliki, „przed” nietknięte).
- `/10x-impl-review` uruchomiony, znaleziska UI triażowane: **do zrobienia** po tej fazie.
- Zakres: jeden widok i tokeny globalne: **pass** (plus TopNav jako layout, zgodnie z fazą 4).
