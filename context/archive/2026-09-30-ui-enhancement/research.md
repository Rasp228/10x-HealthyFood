---
date: 2026-09-30T13:44:18+02:00
researcher: Claude (Opus 5.5)
git_commit: 4ea756e
branch: master
repository: Szkolenie
topic: "Audyt widoku /diary pod kontrakt design-systemu: źródło tokenów, komponenty współdzielone, lista zarzutów, motyw"
tags: [research, ui, design-system, diary, tokens, shadcn]
status: complete
last_updated: 2026-09-30
last_updated_by: Claude (Opus 5.5)
---

# Research: audyt widoku `/diary` pod kontrakt design-systemu

**Date**: 2026-09-30T13:44:18+02:00
**Researcher**: Claude (Opus 5.5)
**Git Commit**: 4ea756e
**Branch**: master
**Repository**: Szkolenie

## Research Question

Dla zmiany `ui-enhancement` (jeden widok: `/diary`, plus tokeny globalne): gdzie w tym repo leży
źródło wartości i komponenty współdzielone, które z nich widok faktycznie czyta, jakie są
konkretne zarzuty (plik, linia, skutek dla użytkownika) w trzech kategoriach — brakujący token,
brakujący komponent współdzielony, przypadkowa architektura — i jaki nazwany motyw wziąć jako
źródło nowych wartości.

## Summary

- **Kontrakt istnieje i widok w większości go czyta.** Wartości: `:root` / `.dark` w
  `src/styles/global.css:6-83`, publikowane przez `@theme inline` (`global.css:85-123`).
  Komponenty: shadcn `new-york` / `neutral` / `cssVariables` (`components.json`), w repo są
  wyłącznie dwa prymitywy — `button.tsx` i `progress.tsx`. W `src/components/diary/` grep znalazł
  literały palety tylko w 4 liniach, wszystkie w `DiaryPage.tsx:244-251` (panel błędu).
  To nie jest przypadek „starter, którego ekrany ignorują tokeny” — tu problemem są **braki
  w kontrakcie**, nie jego ignorowanie.
- **Paleta nie ma koloru marki.** `--primary` to `oklch(0.205 0 0)` (chroma 0, `global.css:13`),
  więc „Healthy” w `TopNav.astro:10` (`text-primary`) jest tak samo czarne jak „Meal” — widać to na
  zrzucie `context/archive/2026-09-30-daily-goal-and-progress/screenshots/diary-goal-states-light-375.png`.
  Jedyny kolor z odcieniem na widoku to `--progress` (h 184.704, pochodna repo-owego `--chart-2`,
  `global.css:31-36`).
- **Brakuje prymitywów Input / Textarea / Label / Card / Badge.** Diary ma 8 ręcznie złożonych pól
  (4 pliki) i 3 kopie tej samej karty. Żadne z tych pól nie ma własnego stanu `focus-visible`.
- **Kolejność widoku odtwarza kolejność slice'ów**: nagłówek → formularz (S-01) → suma z paskiem
  celu (S-06) → lista (`DiaryPage.tsx:234-283`).
- **Bramka wizualna**: kitchen sink `src/pages/dev/diary-goal-states.astro` pokrywa tylko kartę
  sumy (6 stanów paska). Repo nie ma testów zrzutów (`toHaveScreenshot` — 0 trafień w `tests/`
  i `src/`), więc zgodnie z CLAUDE.md bramką zostaje kitchen sink, bez instalowania narzędzia.

## Lista zarzutów (wejście do `/10x-plan`)

| # | Kategoria | Dowód | Skutek dla użytkownika |
|---|---|---|---|
| Z1 | Brakujący token (rola marki) | `global.css:13,61` (`--primary` chroma 0), `global.css:24,64` (`--ring` szary), `TopNav.astro:10` | Aplikacja „HealthyMeal” nie ma koloru: główne akcje („Dodaj wpis”, „Policz kalorie”) są czarne, akcent w logo niewidoczny, a jedyny kolor na ekranie (turkus paska) nie jest z niczym powiązany. |
| Z2 | Brakujący token (stan błędu) | `DiaryPage.tsx:244,247,248,251` — `red-50/200/600`, `dark:red-400/800/900/950` pisane ręcznie, choć `--destructive` istnieje (`global.css:22,62`) i reszta widoku go używa (`DiaryEntryForm.tsx:493`, `DiaryEntryCalories.tsx:170`) | Na jednym ekranie są dwa różne czerwienie: panel błędu listy i komunikaty walidacji; tryb ciemny panelu działa tylko dlatego, że ktoś dopisał klasy `dark:`, a nie z tokenu. |
| Z3 | Brakujący komponent współdzielony (Input / Textarea / Label) + stan focus | 8 pól składanych ręcznie: `DayNavigator.tsx:60`, `DiaryEntryForm.tsx:309,356-358,391,424,457`, `DiaryEntryEditModal.tsx:269-272` (`inputClass`), `DiaryEntryCalories.tsx:149-151`. Żadne nie ma klas `focus-visible:*` (grep `focus` w `src/components/diary/` — 0 trafień w klasach). Jedynym stylem jest globalne `outline-ring/50` (`global.css:127`) na szarym `--ring` | Użytkownik klawiatury widzi na polach ledwo widoczny (albo przeglądarkowy) obrys, a na przyciskach obok 3-pikselowy pierścień `Button` — fokus „znika” przy przejściu z przycisku do pola. Pole kalorii w wierszu (`px-2 py-1`) wygląda inaczej niż to samo pole w formularzu (`px-3 py-2`), a każdą poprawkę trzeba wpisać w 8 miejscach. |
| Z4 | Brakujący komponent współdzielony (Card / Badge) | Ta sama karta `rounded-lg border bg-card p-4 shadow-sm` w `DiaryDaySummary.tsx:22`, `DiaryEntryForm.tsx:274`, `DiaryEntryList.tsx:66`; pigułki stanu `rounded-full bg-muted px-2 py-1 text-xs` w `DiaryEntryCalories.tsx:124,131` | Suma dnia, formularz i każdy z wpisów mają identyczną wagę wizualną — liczba, dla której użytkownik otwiera dziennik, nie wyróżnia się spośród kart wpisów. |
| Z5 | Przypadkowa architektura (kolejność i wejście) | `DiaryPage.tsx:234-283`: formularz nad sumą; `DiaryPage.tsx:228-230`: do hydratacji cały widok to spinner (bez nagłówka i nawigatora dnia) | Na 375 px formularz (textarea, 2–3 pola, dwa przyciski, notka AI) spycha sumę dnia i pasek celu pod pierwszy ekran — kto wchodzi „sprawdzić, ile zostało”, musi przewinąć. Przy wejściu z linku widać najpierw sam spinner zamiast szkieletu strony. |

### Kandydaci poza widokiem (do decyzji w planie, nie usuwać z listy)

| # | Kategoria | Dowód | Skutek | Uwagi |
|---|---|---|---|---|
| Z6 | Brakujący token (success / warning / info) | `src/components/feedback/Toast.tsx:28-29,49-50,71-72,94-95` — same literały z `dark:`, 0 klas semantycznych; diary renderuje go przez `ToastContainer` (`DiaryPage.tsx:10,307`) | Toast „Wpis został zapisany” ma zieleń niezwiązaną z paletą i nie zmieni się razem z motywem. | Plan `daily-goal-and-progress` odnotował brak tokenów success/warning i go nie naprawił (`context/archive/2026-09-30-daily-goal-and-progress/plan.md:28-30`). Tokeny są globalne, więc mieszczą się w „globalnych tokenach” tej zmiany. |
| Z7 | Przypadkowa architektura (layout) | `TopNav.astro:17,23,29,35` — ta sama klasa przycisku skopiowana 4×, bez `buttonVariants`; brak stanu aktywnego linku | Na 375 px nawigacja wychodzi poza ekran (przyciski do ~606 px) — „Wyloguj” jest niewidoczny na telefonie; użytkownik nie widzi, w której sekcji jest. | Odroczone przez `daily-goal-and-progress` (`screenshots/README.md:17-18`). TopNav to layout wszystkich widoków — decyzja zakresu. |
| Z8 | Brakujący token (ikony dialogu) | `src/components/common/ConfirmDialog.tsx:38` — `text-red-600 dark:text-red-400` dla `severity="danger"`, używane przez usuwanie wpisu (`DiaryPage.tsx:295-305`) | Ikona w dialogu usuwania ma inną czerwień niż przycisk „Usuń” w wierszu (`text-destructive`, `DiaryEntryList.tsx:99`). | Komponent współdzielony; zmiana na `text-destructive` jest jednolinijkowa. |

## Detailed Findings

### Źródło wartości

- `:root` (`global.css:6-45`) i `.dark` (`global.css:47-83`) trzymają wartości oklch; `@theme inline`
  (`global.css:85-123`) publikuje je jako `--color-*`. Podział wartości od publikacji jest poprawny
  — w `@theme inline` nie ma surowych kolorów.
- Cała paleta poza `--destructive`, `--chart-*`, `--progress*` i `--sidebar-primary` (dark) ma
  chroma 0 — to baza `neutral` z `components.json`.
- `--progress` / `--progress-track` są jedynymi tokenami dodanymi ponad starter; komentarz przy nich
  (`global.css:31-34,71-72`) podaje źródło i kontrast WCAG 1.4.11. To wzorzec dla każdego nowego
  tokenu tej zmiany.
- Brak tokenów `success` / `warning` / `info` (`global.css:6-83`, sprawdzone w całości).
- Tryb ciemny: klasa `.dark` na `<html>` (`ThemeScript.tsx:5-10`, `ThemeToggle.tsx:44-64`),
  wariant `@custom-variant dark (&:is(.dark *))` (`global.css:4`).

### Komponenty współdzielone czytane przez `/diary`

- `ui/button` — 6 plików diary; `ui/progress` — `DailyGoalProgress.tsx:2`; `ui/LoadingSpinner` —
  4 pliki (tokeny: `border-primary`, `text-muted-foreground`); `ui/BaseModal` — modal edycji
  (tokeny, jeden literał `bg-black/50` tła, `BaseModal.tsx:127`); `common/ConfirmDialog` — dialog
  usuwania (literały ikon, Z8); `feedback/ToastContainer` → `Toast.tsx` (same literały, Z6).
- `BaseModal`, `LoadingSpinner` leżą w `ui/` wbrew regule „ui/ to tylko prymitywy shadcn”
  (`docs/reference/known-drift.md`, sekcja Components). Nowe prymitywy z `npx shadcn add` trafią
  tam zgodnie z regułą; niczego nowego aplikacyjnego do `ui/` nie dokładamy.
- Tych samych ręcznych wzorców używają widoki poza zakresem (`auth/LoginForm.tsx:76,104-110`,
  `ai/AIModal.tsx:312-318`). Prymityw `Input` dodany w tej zmianie nie zobowiązuje do ich migracji.

### Stany widoku (default, hover, focus, disabled, error, empty, loading)

- **default / hover**: tokeny z `Button`; hover wyników wyszukiwania przepisu `hover:bg-muted`
  (`DiaryEntryForm.tsx:328`).
- **focus**: zob. Z3 — przyciski mają pierścień z `button.tsx:8`, pola nie mają nic własnego.
- **disabled**: `Button` ma `disabled:opacity-50`; pole kalorii w wierszu ma własne
  `disabled:opacity-50` (`DiaryEntryCalories.tsx:151`); pozostałe pola formularza i modala
  (`disabled={isSubmitting}`) nie mają żadnego stylu stanu nieaktywnego w klasach.
- **error**: walidacja pól — `border-destructive bg-destructive/10` + `role="alert"`; błąd listy —
  literały (Z2).
- **empty**: `DiaryPage.tsx:260-267` — dashed `border-muted`. Pusty dzień nie pokazuje karty sumy
  ani paska celu — to **decyzja**, nie zarzut (`daily-goal-and-progress/plan.md:56`: „Pusty dzień
  pokazuje pusty stan jak dziś”).
- **loading**: `LoadingSpinner` w dwóch miejscach (`DiaryPage.tsx:229,259`).
- Stany empty / error / loading są inline w `DiaryPage` i zależą od `useDiaryEntries`, więc kitchen
  sink nie może ich wyrenderować bez sesji i danych — chyba że plan wydzieli je do komponentów
  z propsami.

### Ograniczenia z testów (co restyle może zepsuć)

- E2E: `tests/e2e/diary-entry.spec.ts` (11 testów) i `tests/e2e/daily-goal.spec.ts`, wszystko
  przez `tests/e2e/page-objects/DiaryPage.ts`, który używa `getByTestId` (`:82-122`) i `getByText`
  tylko dla toastów (`:535`).
- Kruche punkty: `entryRow` szuka elementów `li` w liście (`DiaryPage.ts:327`) — lista musi zostać
  `<ul>/<li>`; `expectRecipeMode` oczekuje, że pola ilości i kalorii **znikają z DOM**, a nie są
  ukryte (`:201-206`); dokładne teksty: `N kcal`, „Bez policzonych kalorii: N z ”, „Policz kalorie”,
  opisy celu, etykiety pochodzenia, teksty toastów (`diary-entry.spec.ts`, `daily-goal.spec.ts:94,99`).
- Wszystkie `data-testid` z `DiaryPage.ts:82-122` i `:366-498` muszą przetrwać przejście na
  prymitywy — shadcn `Input`/`Card` przekazują `...props`, więc `data-testid` przechodzi dalej.
- Jest: diary nie ma testów komponentowych; `tests/unit/ThemeToggle.test.tsx:126,135,404-415`
  asertuje klasy `rounded-full`, `dark:hidden`, `dark:block` — nie ruszać ThemeToggle przy okazji.

### Motyw — źródło nowych wartości

Settled: zmiana ma rozszerzyć istniejący system (CLAUDE.md, „Do not initialize a second design
system”), zmapować wartości na istniejące nazwy i trzymać małą liczbę ról.

Dwie realne opcje dla Z1 (wybór należy do planu / użytkownika):

1. **Odcień własny repo** — podnieść h 184.704 (już `--chart-2` → `--progress`) do roli `--primary`
   i `--ring` w obu motywach. Źródło: sama paleta repo, zero nowych zewnętrznych wartości; pasek,
   przyciski i fokus mówią jednym kolorem. Wymaga własnego wyliczenia jasności pod kontrast
   `--primary-foreground` (≥ 4.5:1 dla tekstu przycisku) — wzorem komentarza przy `--progress`.
2. **Oficjalny preset kolorów shadcn** (np. „Green” z ui.shadcn.com/themes) zmapowany na
   `--primary` / `--primary-foreground` / `--ring` (+ ewentualnie `--sidebar-primary`). Źródło
   zewnętrzne — wartości trzeba skopiować do pliku w folderze zmiany z linią o źródle
   i zweryfikować w dokumentacji w chwili planowania; nie są cytowane tutaj z pamięci.

Rekomendacja: opcja 1 — repo ma już jeden odcień z uzasadnieniem kontrastu i jest on jedynym
kolorem, który użytkownik dziś widzi na dzienniku; preset shadcn wprowadziłby drugi zielony obok
turkusu paska albo wymusiłby zmianę `--progress`, którą archiwalny plan zamknął.

## Code References

- `src/styles/global.css:6-45,47-83,85-123,127` — wartości, publikacja, globalny outline
- `components.json` — `new-york`, `neutral`, `cssVariables`, alias `ui`
- `src/pages/diary.astro:22-25` — `MainLayout` + `SecurityGuard` + wyspa `DiaryPage`
- `src/components/diary/DiaryPage.tsx:228-230,234-283,244-251,260-267` — spinner hydratacji, kolejność sekcji, panel błędu, pusty stan
- `src/components/diary/DiaryEntryForm.tsx:274,309,356-358,391,424,457,483,493` — karta, pola, podgląd, błąd formularza
- `src/components/diary/DiaryEntryEditModal.tsx:269-272` — `inputClass`
- `src/components/diary/DiaryEntryCalories.tsx:124,131,149-151` — pigułki stanu, pole w wierszu
- `src/components/diary/DiaryEntryList.tsx:54,66,99` — `<ul>`, karta wpisu, `text-destructive`
- `src/components/diary/DiaryDaySummary.tsx:22` — karta sumy
- `src/components/diary/DayNavigator.tsx:40-52,60,73-85` — inline SVG zamiast lucide, datownik
- `src/components/ui/button.tsx:8` — pierścień fokusu przycisku
- `src/components/feedback/Toast.tsx:28-29,49-50,71-72,94-95` — literały toastów
- `src/components/common/ConfirmDialog.tsx:34,38,42` — literały ikon
- `src/components/layout/TopNav.astro:10,17,23,29,35` — logo, 4 kopie klasy przycisku
- `src/pages/dev/diary-goal-states.astro:13-15,34-45` — kitchen sink (DEV-only, 6 stanów sumy)
- `tests/e2e/page-objects/DiaryPage.ts:82-122,201-206,327,366-498,535` — selektory

## Architecture Insights

- Kontrakt w repo jest kompletny w połowie „wartości” (poprawny podział `:root`/`.dark` →
  `@theme inline`) i ubogi w połowie „komponentów” (2 prymitywy). Najtańsza droga to
  `npx shadcn add input textarea label card badge` — CLI dopisze pliki do `src/components/ui/`
  bez `init`, wg `components.json`.
- Przejście na prymityw `Input` samo załatwia fokus (shadcn `new-york` ma w klasach
  `focus-visible:ring-[3px] focus-visible:ring-ring/50` i `aria-invalid:border-destructive`) —
  Z3 i fokus to jedna poprawka, a `aria-invalid`, które pola już ustawiają, zacznie sterować
  wyglądem błędu zamiast ręcznego ternary.
- Zmiana `--ring` z Z1 dotknie fokusu wszystkich widoków — to cena „globalnych tokenów”, do
  sprawdzenia w obu motywach.
- Kitchen sink musi urosnąć z karty sumy do widoku: wiersz wpisu we wszystkich stanach wartości
  (valued / estimating / queued / idle / stale / błąd pola / zablokowany), formularz, pusty stan,
  błąd, ładowanie. Przy obecnym kodzie wymaga to wydzielenia stanów z `DiaryPage` albo renderowania
  podkomponentów z propsami.

## Historical Context (from prior changes)

- `context/archive/2026-09-30-daily-goal-and-progress/plan.md:28-30` — brak tokenów success/warning
  odnotowany, nienaprawiony (supported: nadal brak, `global.css:6-83`).
- `…/plan.md:46-57` — kształt paska: ten sam kolor po obu stronach celu, bez czerwieni; pusty dzień
  bez karty sumy. Restyle nie może tego zmienić bez nowej decyzji.
- `…/plan.md:85` — bez `shadcn init`, tylko `add` (supported: zgodne z CLAUDE.md).
- `…/reviews/impl-review.md:95-103` (F4) — `--progress` to kolor wszystkich `<Progress>` w aplikacji.
- `…/screenshots/README.md:17-18` — TopNav na 375 px wychodzi poza ekran, odroczone (supported:
  `TopNav.astro:13-40` bez zawijania ani menu mobilnego).
- `…/screenshots/` — zrzuty „przed” dla karty sumy (light/dark × 375/desktop).
- `context/archive/2026-09-23-manual-diary-entry/reviews/impl-review.md:137-168` (F4/F5) —
  `aria-invalid` / `aria-describedby` / `role="alert"` w polach; zachować przy migracji na prymitywy.

## Related Research

Nie dotyczy — w `context/archive/**` nie ma innych `research.md`.

## Open Questions

1. Motyw dla Z1: odcień własny repo (rekomendacja) czy preset shadcn?
2. Zakres Z6–Z8: tokeny success/warning/info i `ConfirmDialog` mieszczą się w „globalnych
   tokenach”; TopNav (Z7) to layout wszystkich widoków — włączyć czy zostawić odroczone?
3. Z5: zamiana kolejności (suma nad formularzem) to zmiana układu, nie koloru — potwierdzić, że
   mieści się w tej zmianie. Czy pusty dzień z ustawionym celem ma dalej ukrywać pasek (decyzja
   z `daily-goal-and-progress`)?
4. Brak zrzutu „przed” całego `/diary` (są tylko karty sumy). Pierwsza faza planu powinna go zrobić
   (desktop + 375 px, oba motywy) przed jakąkolwiek zmianą.
