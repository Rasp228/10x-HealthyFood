# Audyt i poprawa UI widoku dziennika (/diary) — Plan Brief

> Full plan: `context/changes/ui-enhancement/plan.md`
> Research: `context/changes/ui-enhancement/research.md`

## What & Why

Dziennik działa, ale wygląda jak złożony slice po slice'ie. Aplikacja „HealthyMeal” nie ma koloru:
główne akcje są czarne, a jedyny odcień na ekranie to pasek celu. Pola nie mają widocznego fokusu.
Na telefonie suma dnia jest pod pierwszym ekranem, a TopNav wychodzi poza ekran. Zmiana domyka
kontrakt design-systemu, który repo już ma, zamiast zakładać drugi.

## Starting Point

Tokeny oklch w `:root` / `.dark` publikowane przez `@theme inline` (`src/styles/global.css`)
i shadcn `new-york` z dwoma prymitywami (`button`, `progress`). Research spisał 8 zarzutów Z1–Z8
z plikiem, linią i skutkiem. Diary czyta tokeny, tylko kontraktowi brakuje ról (marka, stany)
i komponentów (pola, karty, pigułki).

## Desired End State

Przyciski, logo, spinner i fokus mają kolor marki z odcienia paska celu, w obu motywach. Każde
pole to prymityw z widocznym fokusem. Toasty i dialog czytają tokeny stanów. Na 375 px suma dnia
jest nad formularzem, TopNav się mieści, a wejście z linku pokazuje szkielet. `/dev/diary-states`
pokazuje każdy stan widoku, a zrzuty „przed”/„po” z opisem delty leżą w folderze zmiany.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Źródło koloru marki (Z1) | Odcień repo h 184.704 → `--primary` / `--primary-foreground` / `--ring` | Zero zewnętrznych wartości; pasek, akcje i fokus mówią jednym kolorem | Research + Plan |
| Tokeny stanów (Z6) | `--success` / `--warning` / `--info`, jeden token na rolę + przezroczystość | Ten sam wzorzec co istniejące `destructive` / `destructive/10` | Plan |
| Zakres poza widokiem | Z6 toasty, Z8 ikony ConfirmDialog, Z7 TopNav — wszystkie w zakresie | Toast i nawigacja są częścią tego, co użytkownik widzi na `/diary` | Plan |
| Prymitywy | `npx shadcn add input textarea label card badge`, bez `init` | Rozszerza istniejący system, zgodnie z CLAUDE.md | Research |
| Układ (Z5) | Suma nad formularzem + szkielet zamiast spinnera hydratacji | Na 375 px „ile zostało” widać bez przewijania | Plan |
| Pusty dzień | Bez karty sumy i paska, jak dziś | Decyzja archiwalna `daily-goal-and-progress`, podtrzymana | Research |
| TopNav mobilny (Z7) | Druga linia z `overflow-x-auto`, `buttonVariants`, `aria-current` | Bez JS, bez nowego wzorca interakcji, `#logout-button` bez zmian | Plan |
| Bramka wizualna | Stany wydzielone do komponentów + nowa `/dev/diary-states` | Każdy stan widać bez sesji z danymi; repo nie ma `toHaveScreenshot` | Plan |

## Scope

**In scope:**
- Tokeny marki i stanów w `global.css`, z komentarzem o źródle i kontraście
- Toast, ConfirmDialog i panel błędu listy na tokenach
- 8 pól, 3 karty i pigułki diary na prymitywach shadcn
- Kolejność widoku, szkielet, wydzielone stany błędu/pusty/ładowanie
- TopNav na 375 px z aktywną sekcją
- Kitchen sink, zrzuty „przed”/„po” i README delty

**Out of scope:**
- Migracja innych widoków na nowe prymitywy (zmieniają się tylko przez tokeny globalne)
- Zmiana `--progress` i kształtu paska celu
- Menu hamburger, zmiany w ThemeToggle / LogoutButton
- Instalacja narzędzia do testów zrzutów
- Przenoszenie `BaseModal` / `LoadingSpinner` z `ui/`

## Architecture / Approach

Kolejność z `/10x-ui`: zrzuty „przed” i prymitywy → wartości w źródle tokenów → jeden widok →
stany i bramka. Tokeny idą przed migracją komponentów, żeby migracja od razu czytała docelowe
wartości. Stany z `DiaryPage` wydzielam do komponentów z propsami, więc kitchen sink renderuje je
na fixture'ach, a `DiaryPage` zostaje orkiestratorem. Kontraktem nienaruszalnym są selektory E2E:
testid, `<ul>/<li>`, pola znikające z DOM i dokładne teksty.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Stan „przed” i prymitywy | Zrzuty referencyjne + 5 prymitywów shadcn | `shadcn add` nadpisuje `global.css` / `button.tsx` |
| 2. Tokeny globalne | Kolor marki, `success`/`warning`/`info`, toasty i dialog na tokenach | Kontrast `--primary-foreground` i widoczność fokusu w obu motywach; zmiana globalna widoczna na innych widokach |
| 3. Widok `/diary` | Pola/karty/pigułki na prymitywach, suma nad formularzem, szkielet | Złamanie selektorów E2E; szkielet z testid `diary-page` wpuściłby testy przed hydratacją |
| 4. TopNav | Nawigacja mieszcząca się na 375 px, `aria-current` | Layout wszystkich widoków; regresja wylogowania |
| 5. Kitchen sink i bramka | `/dev/diary-states`, zrzuty „po”, README delty | Stanów estymacji nie da się wyrenderować bez fixture'ów wiersza |

**Prerequisites:** konto testowe z `.env.test`, `astro dev` z działającym Supabase, przeglądarka do zrzutów (Playwright/Chromium).
**Estimated effort:** ~3–4 sesje `/10x-implement` przez 5 faz. Najcięższa jest faza 3.

## Open Risks & Assumptions

- Zakładamy, że kolor marki z h 184.704 da się dobrać tak, żeby utrzymać ≥ 4.5:1 dla tekstu
  przycisku w obu motywach. Jeśli nie, faza 2 wraca z wyliczeniami do decyzji.
- `--primary` / `--ring` zmieniają kolor akcji i fokusu na wszystkich widokach. To zamierzona
  cena tokenów globalnych, sprawdzana na `/profile`.
- `label` może dociągnąć `@radix-ui/react-label`, więc `test:security` musi przejść.

## Success Criteria (Summary)

- Na 375 px użytkownik widzi sumę dnia i pasek bez przewijania, a TopNav z „Wyloguj” mieści się na ekranie
- Fokus klawiatury jest widoczny na każdym polu i przycisku dziennika, w kolorze marki, w obu motywach
- Kitchen sink pokazuje wszystkie stany, zrzuty „po” opisują deltę Z1–Z8, a E2E przechodzi bez zmian w specach
