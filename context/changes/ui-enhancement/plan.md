# Audyt i poprawa UI widoku dziennika (/diary) — plan implementacji

## Overview

Widok `/diary` przechodzi na pełny kontrakt design-systemu, który repo już ma (`:root` / `.dark` →
`@theme inline` w `src/styles/global.css` plus shadcn `new-york`). Aplikacja dostaje kolor marki
wyprowadzony z własnego odcienia repo (h 184.704) i tokeny stanów `success` / `warning` / `info`.
Ręcznie składane pola i karty zastępują prymitywy shadcn dodane przez `npx shadcn add`. Suma dnia
trafia nad formularz, a przy wejściu z linku zamiast samego spinnera widać szkielet strony. TopNav
mieści się na 375 px. Bramką jest kitchen sink wszystkich nazwanych stanów widoku, zrzucony
w obu motywach, na desktopie i na 375 px.

Wejście: lista zarzutów Z1–Z8 z `context/changes/ui-enhancement/research.md`. Plan adresuje
wszystkie osiem.

## Current State Analysis

- **Wartości**: podział `:root` / `.dark` → `@theme inline` jest poprawny
  (`global.css:6-83`, `:85-123`), a w `@theme inline` nie ma surowych kolorów. Cała paleta poza
  `--destructive`, `--chart-*`, `--progress*` i ciemnym `--sidebar-primary` ma chroma 0.
  `--primary` to `oklch(0.205 0 0)` (`global.css:13`), a `--ring` jest szary (`:24`, `:64`).
  Brak `success` / `warning` / `info`.
- **Komponenty**: w `src/components/ui/` są tylko dwa prymitywy shadcn (`button.tsx`,
  `progress.tsx`). Diary ma 8 ręcznie złożonych pól bez `focus-visible` (Z3), 3 kopie tej samej
  karty i ręczne pigułki (Z4).
- **Literały**: panel błędu listy `DiaryPage.tsx:244-251` (Z2), toasty `Toast.tsx:28-29,49-50,71-72,94-95`
  (Z6), ikony `ConfirmDialog.tsx:34-44` (Z8).
- **Układ**: formularz stoi nad sumą (`DiaryPage.tsx:234-283`), a do hydratacji cały widok to
  spinner (`:228-230`) (Z5). TopNav: 4 kopie tej samej klasy przycisku, brak stanu aktywnego,
  na 375 px przyciski sięgają ~606 px (`TopNav.astro:13-40`) (Z7).
- **Bramka**: `src/pages/dev/diary-goal-states.astro` pokrywa tylko kartę sumy. Repo nie ma testów
  zrzutów (`toHaveScreenshot` — 0 trafień), więc bramką jest kitchen sink zrzucany z przeglądarki.

### Key Discoveries:

- `buttonVariants` jest eksportowane (`src/components/ui/button.tsx:50`), więc TopNav w `.astro`
  może z niego korzystać bez wyspy React.
- `EstimationState = "valued" | "estimating" | "stale" | "idle"` (`src/lib/utils/diary-estimation.ts:44`).
  Razem z flagami `isInFlight` / `isQueued` z `DiaryEntryCalories.tsx:9-19` daje to stany wiersza
  do kitchen sinka: wartość, w locie, w kolejce, świeży znacznik (estimating bez in-flight), stale,
  bez wartości (idle), błąd pola.
- Repo już stosuje wzorzec „token + przezroczystość” dla stanów: `border-destructive bg-destructive/10`
  w walidacji pól (`DiaryEntryForm.tsx:493`, `DiaryEntryCalories.tsx:170`). Nowe tokeny stanów
  idą tym samym wzorcem: jeden token koloru na rolę, a tło i ramka jako `/10`, `/30`.
- Komentarz przy `--progress` (`global.css:31-36,71-72`) jest wzorem dla każdego nowego tokenu:
  źródło wartości i kontrast WCAG w jednej linii.
- Kontrakt z E2E (`tests/e2e/page-objects/DiaryPage.ts`): `getByTestId` dla wszystkich
  elementów (`:82-122`, `:366-498`), lista `<ul>/<li>` (`:327`), pola ilości/kalorii w trybie
  przepisu **znikają z DOM** (`:201-206`), dokładne teksty (`N kcal`, „Bez policzonych kalorii: N z ”,
  „Policz kalorie”, opisy celu, etykiety pochodzenia, teksty toastów). `diary-page` to testid
  zhydratowanego korzenia (`:82`).
- `tests/unit/ThemeToggle.test.tsx:126,135,404-415` asertuje klasy ThemeToggle, a
  `tests/unit/DailyGoalCard.test.tsx:5,107` renderuje `ToastContainer`, ale klas toastu nie
  sprawdza.
- Archiwalne decyzje (`context/archive/2026-09-30-daily-goal-and-progress/plan.md:46-57`): pasek
  ma ten sam kolor po obu stronach celu, bez czerwieni. Pusty dzień pokazuje pusty stan bez karty
  sumy i bez paska. `--progress` to kolor każdego `<Progress>` (F4 impl-review).

## Desired End State

- `/diary` i TopNav mają kolor marki: główne akcje, „Healthy” w logo, spinner i pierścień fokusu
  mówią tym samym odcieniem co pasek celu, w obu motywach.
- W `src/components/diary/`, `Toast.tsx` i `ConfirmDialog.tsx` nie ma literałów palety
  (`red-`, `green-`, `amber-`, `blue-`). Każdy kolor pochodzi z tokenu.
- Każde pole dziennika to prymityw `Input` / `Textarea` z `Label`, z widocznym fokusem
  i wyglądem błędu sterowanym przez `aria-invalid`. Karty to `Card`, pigułki stanu to `Badge`.
- Na 375 px suma dnia i pasek celu są na pierwszym ekranie, nad formularzem. Przy wejściu
  z linku widać nagłówek i szkielet sekcji zamiast samego spinnera.
- Na 375 px TopNav mieści się na ekranie, a „Wyloguj” jest osiągalny. Aktywna sekcja ma
  `aria-current="page"` i widoczne wyróżnienie.
- `/dev/diary-states` renderuje wszystkie nazwane stany widoku. Zrzuty „przed” i „po” (light/dark ×
  375/desktop) leżą w `context/changes/ui-enhancement/screenshots/` z README opisującym deltę.
- Wszystkie gate'y CI przechodzą bez zmian w selektorach i asercjach E2E.

## What We're NOT Doing

- Bez `shadcn init` i bez drugiego systemu tokenów. Tylko `npx shadcn add` do istniejącego kontraktu.
- Bez migracji innych widoków na nowe prymitywy (`auth/LoginForm.tsx`, `ai/AIModal.tsx`, profil,
  przepisy). Zmienią się tylko przez tokeny globalne (`--primary`, `--ring`, toasty, ikony dialogu).
- Bez zmiany `--progress` / `--progress-track` ani kształtu paska celu (decyzja archiwalna).
- Bez pokazywania karty sumy i paska dla pustego dnia (decyzja archiwalna, podtrzymana).
- Bez menu hamburger i bez wyspy React w TopNav. Bez zmian w `ThemeToggle` i w `LogoutButton` /
  `#logout-button`.
- Bez `--sidebar-*`, `--chart-*` i `--secondary` / `--accent` z odcieniem. Rola marki to tylko
  `--primary`, `--primary-foreground` i `--ring`.
- Bez narzędzia do testów zrzutów (`toHaveScreenshot`) — repo go nie ma, więc go nie instalujemy.
- Bez przenoszenia `BaseModal` / `LoadingSpinner` z `ui/` (known-drift) i bez dokładania tam
  komponentów aplikacyjnych.

## Implementation Approach

Kolejność z `/10x-ui`: środowisko i biblioteka → wartości w źródle → jeden widok → stany. Najpierw
zrzuty „przed”, bo każda późniejsza faza zmienia wygląd. Tokeny idą przed widokiem, żeby migracja
komponentów od razu czytała docelowe wartości i nie wymagała drugiego przejścia. Stany błędu,
pustego dnia i szkieletu wydzielam z `DiaryPage` do komponentów z propsami. Dzięki temu kitchen
sink renderuje je bez sesji z danymi, a `DiaryPage` zostaje orkiestratorem.

Routing modeli (CLAUDE.md): fazy 2 i 5 (kontrast, ocena zrzutów) wymagają osądu i modelu
z vision. Migracja pól w fazie 3 to praca mechaniczna dla tańszego poziomu. Eskalacja dopiero
wtedy, gdy ten sam zarzut przetrwa dwie rundy.

## Critical Implementation Details

- **Szkielet nie może nosić `data-testid="diary-page"`.** E2E czeka na ten testid jako sygnał
  zhydratowanego widoku (`DiaryPage.ts:82`). Szkielet z tym samym testid wpuściłby testy przed
  hydratacją. Szkielet dostaje własny testid i `aria-busy="true"` z tekstem „Ładowanie dziennika…”
  dla czytników ekranu.
- **Kontrast liczony, nie szacowany.** Jasność `--primary` w obu motywach dobierz tak, żeby
  `--primary-foreground` na `--primary` miał ≥ 4.5:1 (tekst przycisku). Wyróżnienie fokusu
  (`ring-ring/50` przy 3 px) ma być widoczne na `--background` i `--card`, cel ≥ 3:1 dla pełnego
  `--ring` (WCAG 1.4.11). Tokeny stanów liczone są jako tekst/ikona na `--card` (≥ 4.5:1 dla
  tekstu toastu, ≥ 3:1 dla ikony). Licz skryptem w katalogu scratchpad (konwersja oklch →
  sRGB → luminancja), bez nowej zależności w `package.json`. Wynik wpisz w komentarzu przy tokenie.
- **`shadcn add` może dopisać do `global.css`.** Po `add` sprawdź `git diff src/styles/global.css
  src/components/ui/button.tsx src/components/ui/progress.tsx`. Każda zmiana poza nowymi plikami
  jest do cofnięcia, a na pytanie CLI o nadpisanie istniejącego pliku odpowiadaj „nie”.

## Faza 1: Stan „przed” i prymitywy shadcn

### Overview

Utrwala wygląd sprzed zmiany i dodaje brakujące prymitywy do istniejącego kontraktu shadcn.

### Changes Required:

#### 1. Zrzuty „przed”

**File**: `context/changes/ui-enhancement/screenshots/before-diary-{light,dark}-{375,desktop}.png`, `context/changes/ui-enhancement/screenshots/README.md`

**Intent**: Zrzut całego `/diary` (konto testowe z `.env.test`, dzień z kilkoma wpisami
w różnych stanach wartości i z ustawionym celem) w 4 wariantach, zanim cokolwiek się zmieni.
Do tego zrzut TopNav na 375 px. README opisuje stan danych i sposób zrobienia zrzutów, tak jak
`context/archive/2026-09-30-daily-goal-and-progress/screenshots/README.md`.

**Contract**: Nazwy plików `before-*`. Faza 5 dopisze `after-*` i sekcję delty do tego samego README.

#### 2. Prymitywy shadcn

**File**: `src/components/ui/{input,textarea,label,card,badge}.tsx` (nowe)

**Intent**: `npx shadcn@latest add input textarea label card badge` według `components.json`
(`new-york`, `cssVariables`, lucide), bez `init`. Pliki zostają w wersji z CLI, bez ręcznych
poprawek.

**Contract**: Import z `@/components/ui/<name>`. Prymitywy przekazują `...props`, więc
`data-testid`, `aria-*` i `id` przechodzą dalej. `label` może dociągnąć `@radix-ui/react-label`
do `package.json` / `package-lock.json` (npm, bez innego lockfile'a).

### Success Criteria:

#### Automated Verification:

- Pięć plików prymitywów istnieje w `src/components/ui/`
- `git diff` nie pokazuje zmian w `src/styles/global.css`, `button.tsx` ani `progress.tsx`
- `npm run lint` przechodzi
- `npm run typecheck` — 0 błędów
- `npm run test:security` przechodzi (nowa zależność radix nie łamie progu `moderate`)

#### Manual Verification:

- Cztery zrzuty „przed” `/diary` i zrzut TopNav 375 px leżą w `screenshots/` z README

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na potwierdzenie
ręcznej części przed kolejną fazą.

---

## Faza 2: Tokeny globalne — marka i stany

### Overview

Źródło wartości dostaje rolę marki z odcienia repo i trzy role stanów. Komponenty, które dziś
omijają tokeny (toasty, ikony dialogu, panel błędu listy), zaczynają je czytać.

### Changes Required:

#### 1. Rola marki

**File**: `src/styles/global.css`

**Intent**: `--primary`, `--primary-foreground` i `--ring` w `:root` i `.dark` wyprowadzone
z h 184.704 (odcień `--chart-2` → `--progress`), z komentarzem o źródle i zmierzonym kontraście
wzorem `global.css:31-36`. Z1: przyciski, logo, spinner i fokus mówią jednym kolorem z paskiem.

**Contract**: Nazwy tokenów bez zmian, więc `@theme inline` nie wymaga edycji dla tych trzech.
Hue 184.704 w obu motywach; jasność i chroma są wyliczone pod kontrast z Critical Implementation
Details. `--progress*` bez zmian.

#### 2. Role stanów

**File**: `src/styles/global.css`

**Intent**: Nowe `--success`, `--warning`, `--info` w `:root` i `.dark`, opublikowane w
`@theme inline` jako `--color-success` / `--color-warning` / `--color-info`. Każdy ma komentarz
o źródle: `--success` z odcienia marki albo repo-owego `--chart-2` z ciemnego motywu (h 162.48),
`--warning` z `--chart-4` / `--chart-5` (h 84.4 / 70.1), `--info` z `--chart-3` (h 227.4).
Kontrast liczony tak jak dla marki.

**Contract**: Jeden token na rolę, bez `-foreground`. Tło i ramka powstają z przezroczystości
(`bg-success/10 border-success/30 text-success`), tak jak istniejący wzorzec `destructive`.

#### 3. Toast na tokenach

**File**: `src/components/feedback/Toast.tsx`

**Intent**: Cztery warianty (`success`, `error`, `warning`, `info`) czytają `success` /
`destructive` / `warning` / `info` zamiast literałów z `dark:`. Tryb ciemny wynika z tokenu (Z6).
Tekst toastu zostaje w `text-foreground`, bo kolor roli niesie ikona i ramka.

**Contract**: Props, czas życia, teksty i `ToastContainer` bez zmian. Zero klas `green-` /
`red-` / `amber-` / `blue-` / `dark:` w pliku.

#### 4. Ikony ConfirmDialog

**File**: `src/components/common/ConfirmDialog.tsx`

**Intent**: `severityConfig` używa `text-destructive` (danger), `text-warning` (warning)
i `text-info` (info) (Z8).

**Contract**: API komponentu i `confirmButtonVariant` bez zmian.

#### 5. Panel błędu listy

**File**: `src/components/diary/DiaryPage.tsx:243-256`

**Intent**: Panel błędu i przycisk „Spróbuj ponownie” na `destructive` z przezroczystością,
bez literałów `red-*` i bez `dark:` (Z2). W fazie 3 panel przechodzi do osobnego komponentu, a
tokeny wybrane tu idą razem z nim.

**Contract**: `data-testid="diary-error-state"`, `diary-retry-button` i teksty bez zmian.

### Success Criteria:

#### Automated Verification:

- `grep -rnE "(red|green|amber|blue)-[0-9]" src/components/diary src/components/feedback/Toast.tsx src/components/common/ConfirmDialog.tsx` — 0 trafień
- Każdy nowy lub zmieniony token w `global.css` ma komentarz ze źródłem i kontrastem
- `npm run lint` przechodzi
- `npm run typecheck` — 0 błędów
- `npm run format:check` przechodzi
- `npm run test` przechodzi

#### Manual Verification:

- Na `/diary` i `/profile` w obu motywach przyciski główne, logo „Healthy” i pierścień fokusu mają kolor marki, a tekst przycisku jest czytelny
- Toast sukcesu i błędu oraz dialog usuwania mają kolory z tokenów w obu motywach

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na potwierdzenie
ręcznej części przed kolejną fazą.

---

## Faza 3: Widok `/diary` na prymitywach, nowy układ i stany wydzielone

### Overview

Wszystkie pola, karty i pigułki dziennika przechodzą na prymitywy. Suma idzie nad formularz,
a stany błędu, pustego dnia i ładowania dostają własne komponenty.

### Changes Required:

#### 1. Pola → Input / Textarea / Label

**File**: `src/components/diary/DayNavigator.tsx:60`, `DiaryEntryForm.tsx:309,356-358,391,424,457`, `DiaryEntryEditModal.tsx:269-272`, `DiaryEntryCalories.tsx:149-151`

**Intent**: Każde z 8 pól to `Input` albo `Textarea`, a widoczne etykiety to `Label`. Ręczny
ternary błędu (`border-destructive bg-destructive/10`) zastępuje `aria-invalid`, które pola już
ustawiają. Znika `inputClass` z modala. Pole kalorii w wierszu dostaje kompaktowy rozmiar
przez `className`, a nie przez własny zestaw klas od zera (Z3).

**Contract**: Zostają `id`, `data-testid`, `aria-invalid`, `aria-describedby`, `role="alert"`
komunikatów, `disabled` i teksty. Pola ilości/kalorii w trybie przepisu dalej są renderowane
warunkowo (znikają z DOM), a nie ukrywane.

#### 2. Karty → Card, pigułki → Badge

**File**: `src/components/diary/DiaryDaySummary.tsx:22`, `DiaryEntryForm.tsx:274`, `DiaryEntryList.tsx:66`, `DiaryEntryCalories.tsx:124,131`

**Intent**: Trzy karty przechodzą na `Card`. Karta sumy dostaje większą wagę niż karty wpisów,
żeby liczba dnia była pierwszym, co widać: większa liczba i akcent z tokenu marki (np. ramka
albo tło `primary/…`). Tekst `N kcal` w `diary-day-total` zostaje nietknięty. Pigułki stanu to
`Badge` (Z4).

**Contract**: Testid `diary-day-summary`, `diary-day-total`, `diary-day-missing`,
`diary-day-count` i wszystkie testid wierszy bez zmian. Lista zostaje `<ul>/<li>`.

#### 3. Ikony DayNavigator

**File**: `src/components/diary/DayNavigator.tsx:40-52,73-85`

**Intent**: Inline SVG strzałek zastępują ikony `lucide-react` (`iconLibrary: lucide`
w `components.json`).

**Contract**: Przyciski zachowują `aria-label` i testid.

#### 4. Komponenty stanów

**File**: `src/components/diary/DiaryErrorState.tsx`, `DiaryEmptyState.tsx`, `DiaryPageSkeleton.tsx` (nowe)

**Intent**: Panel błędu (z fazy 2), pusty stan i szkielet jako komponenty z propsami, żeby
kitchen sink mógł je wyrenderować bez hooków danych. Szkielet: nagłówek „Dziennik posiłków” oraz
bloki `animate-pulse bg-muted` w miejscu nawigatora dnia, sumy i formularza.

**Contract**: `DiaryErrorState({ message, onRetry })` z `diary-error-state` / `diary-retry-button`.
`DiaryEmptyState()` z `diary-empty-state` i obecnymi tekstami. `DiaryPageSkeleton()` z własnym
testid (np. `diary-page-skeleton`), `aria-busy="true"` i tekstem „Ładowanie dziennika…”, **bez**
`diary-page`.

#### 5. Układ DiaryPage

**File**: `src/components/diary/DiaryPage.tsx:228-283`

**Intent**: Do hydratacji renderuj `DiaryPageSkeleton` zamiast spinnera. Po hydratacji kolejność
to: nagłówek z nawigatorem → `DiaryDaySummary` (tylko gdy `!error && !isLoading && entries.length > 0`)
→ `DiaryEntryForm` → błąd / ładowanie / pusty stan / lista (Z5).

**Contract**: Warunek pokazania sumy jest ten sam co dziś, więc pusty dzień dalej nie pokazuje
karty sumy ani paska. `data-testid="diary-page"` zostaje na zhydratowanym korzeniu. Modal edycji,
`ConfirmDialog` i `ToastContainer` bez zmian.

### Success Criteria:

#### Automated Verification:

- `grep -rn "inputClass\|<input\|<textarea" src/components/diary` — tylko wewnątrz prymitywów, czyli 0 trafień w `diary/`
- `npm run lint` przechodzi
- `npm run typecheck` — 0 błędów
- `npm run format:check` przechodzi
- `npm run test` przechodzi
- `npm run test:e2e` przechodzi (`diary-entry.spec.ts`, `daily-goal.spec.ts`) bez zmian w specach i page objects

#### Manual Verification:

- Tab przez nawigator dnia, formularz i wiersz wpisu: każde pole i przycisk ma widoczny pierścień fokusu w kolorze marki, w obu motywach
- Na 375 px suma dnia z paskiem jest na pierwszym ekranie nad formularzem
- Twarde przeładowanie `/diary` pokazuje szkielet z nagłówkiem, bez samotnego spinnera

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na potwierdzenie
ręcznej części przed kolejną fazą.

---

## Faza 4: TopNav na 375 px

### Overview

Nawigacja mieści się na telefonie i pokazuje aktywną sekcję (Z7).

### Changes Required:

#### 1. Linki na buttonVariants z aktywną sekcją

**File**: `src/components/layout/TopNav.astro:13-40`

**Intent**: Cztery skopiowane klasy zastępuje `buttonVariants` (import z `@/components/ui/button`
we frontmatterze). Link odpowiadający `Astro.url.pathname` dostaje `aria-current="page"`
i wariant wyróżniony (np. `default` z kolorem marki), reszta `outline`.

**Contract**: `id="logout-button"` na `<button>` wylogowania, `<LogoutButton client:load />`
i `<ThemeToggle client:load />` bez zmian. `href` bez zmian.

#### 2. Układ mobilny

**File**: `src/components/layout/TopNav.astro`

**Intent**: Poniżej `sm` logo i ThemeToggle zostają w pierwszej linii, a linki z „Wyloguj”
schodzą do drugiej linii z `overflow-x-auto`, bez przewijania całej strony w poziomie. Od `sm`
w górę układ jednoliniowy jak dziś. Bez JS.

**Contract**: Nagłówek nie ma stałego `h-16` na mobile. Strona na 375 px nie ma poziomego
przewijania dokumentu.

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi
- `npm run typecheck` — 0 błędów
- `npm run format:check` przechodzi
- `npm run test` przechodzi (w tym `ThemeToggle.test.tsx`)
- `npm run test:e2e` przechodzi

#### Manual Verification:

- Na 375 px wszystkie cztery pozycje nawigacji są osiągalne (widoczne lub po przewinięciu paska), a dokument nie przewija się w poziomie
- Na `/diary`, `/` i `/profile` aktywna pozycja jest wyróżniona i ma `aria-current="page"`
- „Wyloguj” wylogowuje jak dotąd

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na potwierdzenie
ręcznej części przed kolejną fazą.

---

## Faza 5: Kitchen sink i bramka wizualna

### Overview

Strona dev renderuje każdy nazwany stan widoku naraz. Zrzuty „po” z opisem delty zamykają zmianę.

### Changes Required:

#### 1. Strona `/dev/diary-states`

**File**: `src/pages/dev/diary-states.astro` (nowy)

**Intent**: Na wzór `src/pages/dev/diary-goal-states.astro` (404 poza DEV, bez `prerender`, sesja
wymagana): na fixture'ach `DiaryEntryDto` renderuje szkielet, błąd, pusty stan, kartę sumy
(z celem i bez), formularz (default, błąd walidacji, disabled) oraz wiersze wpisu we wszystkich
stanach: wartość (każde pochodzenie), w locie, w kolejce, świeży znacznik, stale, bez wartości,
błąd pola. Do tego toasty czterech typów i dialog `danger`, jeśli da się je wyrenderować
statycznie; w przeciwnym razie zrzut z żywego widoku.

**Contract**: Handlery to no-opy. Komponenty z `client:load` tam, gdzie stan wymaga Reacta (np.
formularz). Istniejąca `diary-goal-states.astro` zostaje bez zmian.

#### 2. Zrzuty „po” i README delty

**File**: `context/changes/ui-enhancement/screenshots/after-*.png`, `screenshots/README.md`

**Intent**: Zrzuty `/dev/diary-states` i `/diary` w light/dark × 375/desktop oraz TopNav na
375 px. README zestawia „przed” i „po” według zarzutów Z1–Z8 i nazywa każdą zamierzoną deltę.
Zarzut, który nie przeszedł, trafia do README jako odroczony z powodem.

**Contract**: Na 375 px nie ma poziomego przewijania strony.

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi
- `npm run typecheck` — 0 błędów
- `npm run format:check` przechodzi
- `npm run test` przechodzi
- `npm run test:security` przechodzi
- `npm run test:e2e` przechodzi

#### Manual Verification:

- `/dev/diary-states` pokazuje wszystkie wymienione stany w obu motywach, na desktopie i na 375 px
- README zrzutów opisuje deltę dla każdego z Z1–Z8, a stany pola (focus, disabled, error) są widoczne na zrzutach
- Checklista `.claude/skills/10x-ui/references/ui-quality-checklist.md` przejrzana punkt po punkcie

**Implementation Note**: Po tej fazie uruchom `/10x-impl-review ui-enhancement`. Znalezisk
wizualnych nie odrzucaj jako kosmetycznych.

---

## Testing Strategy

### Unit Tests:

- Nie dodajemy nowych testów jednostkowych. Zmiana jest wizualna, a bramką są zrzuty. Istniejące
  `ThemeToggle.test.tsx` i `DailyGoalCard.test.tsx` muszą przejść bez zmian.

### Integration Tests:

- E2E `diary-entry.spec.ts` i `daily-goal.spec.ts` bez żadnych zmian w specach i page objects.
  To dowód, że testid, kolejność DOM wpisów, warunkowe renderowanie pól i teksty przetrwały.

### Manual Testing Steps:

1. Dwa motywy × dwie szerokości: `/diary` z wpisami, pusty dzień, błąd sieci (DevTools offline → „Spróbuj ponownie”).
2. Klawiatura: Tab od logo przez TopNav, nawigator dnia, formularz i wiersz wpisu. Fokus musi być widoczny wszędzie.
3. Twarde przeładowanie `/diary?day=…` z linku: najpierw szkielet, potem widok.
4. Toast po zapisie wpisu i dialog usuwania w obu motywach.

## Performance Considerations

Brak istotnych skutków: kilka prymitywów bez stanu i jedna zależność radix (`label`).

## Migration Notes

Nie dotyczy — bez zmian w danych i w API. Zmiana `--primary` / `--ring` jest globalna, więc
widoki spoza zakresu zmieniają kolor akcji i fokusu. Sprawdź to na `/profile` w fazie 2.

## References

- Research: `context/changes/ui-enhancement/research.md`
- Skill: `.claude/skills/10x-ui/SKILL.md`, `.claude/skills/10x-ui/references/ui-quality-checklist.md`
- Wzorzec tokenu z komentarzem: `src/styles/global.css:31-36,71-72`
- Wzorzec kitchen sinka: `src/pages/dev/diary-goal-states.astro`
- Decyzje archiwalne: `context/archive/2026-09-30-daily-goal-and-progress/plan.md:46-57`, `…/screenshots/README.md`
- Kontrakt E2E: `tests/e2e/page-objects/DiaryPage.ts:82-122,201-206,327,366-498,535`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Stan „przed” i prymitywy shadcn

#### Automated

- [x] 1.1 Pięć plików prymitywów istnieje w `src/components/ui/` — ad233ba
- [x] 1.2 `git diff` nie pokazuje zmian w `src/styles/global.css`, `button.tsx` ani `progress.tsx` — ad233ba
- [x] 1.3 `npm run lint` przechodzi — ad233ba
- [x] 1.4 `npm run typecheck` — 0 błędów — ad233ba
- [x] 1.5 `npm run test:security` przechodzi (nowa zależność radix nie łamie progu `moderate`) — ad233ba

#### Manual

- [x] 1.6 Cztery zrzuty „przed” `/diary` i zrzut TopNav 375 px leżą w `screenshots/` z README — ad233ba

### Phase 2: Tokeny globalne — marka i stany

#### Automated

- [x] 2.1 `grep -rnE "(red|green|amber|blue)-[0-9]" src/components/diary src/components/feedback/Toast.tsx src/components/common/ConfirmDialog.tsx` — 0 trafień — 8205f00
- [x] 2.2 Każdy nowy lub zmieniony token w `global.css` ma komentarz ze źródłem i kontrastem — 8205f00
- [x] 2.3 `npm run lint` przechodzi — 8205f00
- [x] 2.4 `npm run typecheck` — 0 błędów — 8205f00
- [x] 2.5 `npm run format:check` przechodzi — 8205f00
- [x] 2.6 `npm run test` przechodzi — 8205f00

#### Manual

- [x] 2.7 Na `/diary` i `/profile` w obu motywach przyciski główne, logo „Healthy” i pierścień fokusu mają kolor marki, a tekst przycisku jest czytelny — 8205f00
- [x] 2.8 Toast sukcesu i błędu oraz dialog usuwania mają kolory z tokenów w obu motywach — 8205f00

### Phase 3: Widok `/diary` na prymitywach, nowy układ i stany wydzielone

#### Automated

- [x] 3.1 `grep -rn "inputClass\|<input\|<textarea" src/components/diary` — tylko wewnątrz prymitywów, czyli 0 trafień w `diary/` — b5c7b81
- [x] 3.2 `npm run lint` przechodzi — b5c7b81
- [x] 3.3 `npm run typecheck` — 0 błędów — b5c7b81
- [x] 3.4 `npm run format:check` przechodzi — b5c7b81
- [x] 3.5 `npm run test` przechodzi — b5c7b81
- [x] 3.6 `npm run test:e2e` przechodzi (`diary-entry.spec.ts`, `daily-goal.spec.ts`) bez zmian w specach i page objects — b5c7b81

#### Manual

- [x] 3.7 Tab przez nawigator dnia, formularz i wiersz wpisu: każde pole i przycisk ma widoczny pierścień fokusu w kolorze marki, w obu motywach — b5c7b81
- [x] 3.8 Na 375 px suma dnia z paskiem jest na pierwszym ekranie nad formularzem — b5c7b81
- [x] 3.9 Twarde przeładowanie `/diary` pokazuje szkielet z nagłówkiem, bez samotnego spinnera — b5c7b81

### Phase 4: TopNav na 375 px

#### Automated

- [ ] 4.1 `npm run lint` przechodzi
- [ ] 4.2 `npm run typecheck` — 0 błędów
- [ ] 4.3 `npm run format:check` przechodzi
- [ ] 4.4 `npm run test` przechodzi (w tym `ThemeToggle.test.tsx`)
- [ ] 4.5 `npm run test:e2e` przechodzi

#### Manual

- [ ] 4.6 Na 375 px wszystkie cztery pozycje nawigacji są osiągalne (widoczne lub po przewinięciu paska), a dokument nie przewija się w poziomie
- [ ] 4.7 Na `/diary`, `/` i `/profile` aktywna pozycja jest wyróżniona i ma `aria-current="page"`
- [ ] 4.8 „Wyloguj” wylogowuje jak dotąd

### Phase 5: Kitchen sink i bramka wizualna

#### Automated

- [ ] 5.1 `npm run lint` przechodzi
- [ ] 5.2 `npm run typecheck` — 0 błędów
- [ ] 5.3 `npm run format:check` przechodzi
- [ ] 5.4 `npm run test` przechodzi
- [ ] 5.5 `npm run test:security` przechodzi
- [ ] 5.6 `npm run test:e2e` przechodzi

#### Manual

- [ ] 5.7 `/dev/diary-states` pokazuje wszystkie wymienione stany w obu motywach, na desktopie i na 375 px
- [ ] 5.8 README zrzutów opisuje deltę dla każdego z Z1–Z8, a stany pola (focus, disabled, error) są widoczne na zrzutach
- [ ] 5.9 Checklista `.claude/skills/10x-ui/references/ui-quality-checklist.md` przejrzana punkt po punkcie
