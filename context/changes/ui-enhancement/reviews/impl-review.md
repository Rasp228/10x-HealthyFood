<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Audyt i poprawa UI widoku dziennika (/diary)

- **Plan**: context/changes/ui-enhancement/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-10-01
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 5 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Bramki uruchomione podczas przeglądu: `lint` (0 błędów), `typecheck` (0 błędów, 173 pliki), `format:check`, `test` (16 zestawów, 367 testów) i `test:security` przeszły. `test:e2e` nie został uruchomiony ponownie, bo wymaga serwera i `.env.test`. Opieram się na `[x]` z commitów faz 3–5.

## Findings

### F1 — Każde `refetch()` chowa kartę sumy i odmontowuje listę

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/diary/DiaryPage.tsx:236, src/hooks/diary/useDiaryEntries.ts:32
- **Detail**: `fetchEntries` ustawia `isLoading=true` przy każdym `refetch()`, czyli po dodaniu, edycji, usunięciu, ręcznym zapisie kalorii i po każdej zakończonej wycenie AI. Karta sumy ma ok. 112 px plus odstęp i od fazy 3 stoi nad formularzem. Znika więc i wraca, a formularz razem z kursorem skacze o ok. 136 px. Dzieje się to także wtedy, gdy wycena kończy się w tle, a użytkownik akurat pisze. W tym samym momencie lista przechodzi w spinner, więc wiersze tracą lokalny `draft` i błąd pola kalorii. Ta część jest starsza, ale wcześniej była schowana pod formularzem. Plan i README odłożyły ten problem do tego przeglądu.
- **Fix**: stale-while-revalidate według dnia. Hook zapisuje `loadedDay` razem z `entries`, a `DiaryPage` wylicza `isInitialLoad = isLoading && loadedDay !== day` i używa go zamiast `isLoading` w `showSummary` i w gałęzi spinnera. Samo usunięcie `!isLoading` nie wystarczy, bo przy zmianie dnia karta pokazałaby przez chwilę sumę poprzedniego dnia.
  - Strength: usuwa skok i utratę stanu wierszy jedną zmianą w hooku i dwoma warunkami. Kontrakt pustego dnia zostaje.
  - Tradeoff: dotyka hooka danych, nie tylko warstwy wizualnej. Trzeba sprawdzić E2E, który może czekać na zniknięcie spinnera.
  - Confidence: MED — wzorzec jest standardowy, ale nie sprawdzałem, czy E2E nie opiera się na chwilowym zniknięciu listy.
  - Blind spot: `tests/e2e/page-objects/DiaryPage.ts` i sposób, w jaki czeka na odświeżenie po zapisie.
- **Decision**: FIXED — `loadedDay` w `useDiaryEntries`, `isInitialLoad` w `DiaryPage` (showSummary i gałąź spinnera). lint/typecheck/format/test zielone; E2E do uruchomienia przez użytkownika.

### F2 — Pierścień fokusu w jasnym motywie poniżej 3:1

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/styles/global.css:29-32
- **Detail**: Prymitywy rysują fokus jako `ring-ring/50`. W jasnym motywie daje to ok. 2.2:1 na białym, co komentarz przy tokenie sam przyznaje, a WCAG 1.4.11 wymaga 3:1. Pola są częściowo chronione, bo przy fokusie dostają też pełną ramkę `border-ring`. Przyciski `default` i `ghost` (główne akcje, „Spróbuj ponownie”, aktywna pozycja TopNav) mają tylko pierścień. Grubość 3 px nie spełnia kryterium kontrastu. W ciemnym motywie jest ok. 3.3:1. Plan liczył pełny `--ring`, a nie złożony, więc luka jest też w planie.
- **Fix A ⭐ Recommended**: w `:root` przyciemnić `--ring` (h 184.704, ok. L 0.38) tak, żeby złożenie `/50` na białym dało co najmniej 3:1. Komentarz trzeba poprawić z „= `--primary`” na „ciemniejszy wariant marki”.
  - Strength: jedna wartość w źródle tokenów, prymitywy shadcn zostają nietknięte.
  - Tradeoff: `--ring` przestaje być równy `--primary` w jasnym motywie. Ramka pola przy fokusie też ściemnieje.
  - Confidence: MED — L ok. 0.38 to szacunek agenta. Przed wpisaniem trzeba to przeliczyć skryptem.
  - Blind spot: wygląd ciemniejszej ramki pól. Wymaga nowego zrzutu `after-focus-light`.
- **Fix B**: zaakceptować i zostawić tylko komentarz.
  - Strength: zero zmian, decyzja już opisana w README.
  - Tradeoff: zostaje świadoma niezgodność z WCAG 1.4.11 na przyciskach.
  - Confidence: HIGH — stan opisany.
  - Blind spot: None significant.
- **Decision**: ACCEPTED (Fix B) — wpis w `docs/reference/known-drift.md` („Prymitywy UI”). Korekta: szacunek L ≈ 0.38 był błędny (2.64:1); 3:1 wymaga L ≤ 0.28.

### F3 — `text-muted-foreground` na tle karty sumy spada do ok. 4.4:1

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/diary/DiaryDaySummary.tsx:24 (także teksty z DailyGoalProgress.tsx:34,37 w tej karcie)
- **Detail**: Nowe tło `bg-primary/5` obniża kontrast „Suma dnia”, „Bez policzonych kalorii…” i tekstu celu z ok. 4.74:1 (na `bg-card`) do ok. 4.41:1, czyli poniżej 4.5:1 dla zwykłego tekstu. Komentarze w `global.css` tej pary nie liczą.
- **Fix**: `bg-primary/5` zamienić na `bg-card`. Akcent niesie wtedy sama `border-primary/40` i `text-4xl`. Alternatywą jest lżejszy odcień, np. `bg-primary/[0.03]`, przeliczony skryptem.
- **Decision**: FIXED — `bg-primary/5` → `bg-primary/3` (≈ `/[0.03]`, przeliczone 4.54:1), komentarz w JSDoc.

### F4 — „Wyloguj” ucięte na 375 px bez sygnału, że pasek się przewija

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/layout/TopNav.astro:28
- **Detail**: Cztery przyciski mają ok. 390 px, a wiersz 343 px. Na `after-topnav-375.png` widać „Wy…”. Kontrakt planu („widoczne lub po przewinięciu paska”) jest spełniony, ale mobilne przeglądarki chowają pasek przewijania, więc użytkownik nie wie, że wylogowanie istnieje. To znalezisko wizualne, nie kosmetyczne.
- **Fix**: poniżej `sm` użyć `buttonVariants({ size: "sm" })` (i/lub mniejszych odstępów), tak żeby cztery pozycje zmieściły się w 343 px. Weryfikacja: nowy `after-topnav-375`.
- **Decision**: FIXED (inaczej niż w raporcie: samo `size: "sm"` się nie mieści) — „Wyloguj” obok ThemeToggle w pierwszej linii, linki `order-last` w drugiej; kolejność DOM = desktop. Do potwierdzenia wizualnie na 375 px.

### F5 — Zbiorczy pakiet `radix-ui` zamiast `@radix-ui/react-label`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: package.json:52
- **Detail**: Plan przewidywał `@radix-ui/react-label`. CLI shadcn dodało zbiorczy `radix-ui` (ok. 60 pakietów `@radix-ui/*`, `@floating-ui/*` i inne, +1.8k linii lockfile'a). Importy są teraz mieszane: `button.tsx` i `progress.tsx` używają pakietów pojedynczych, a `label.tsx` i `badge.tsx` zbiorczego. `test:security` przechodzi i w runtime nie ma duplikatów.
- **Fix**: dopisać addendum w `plan.md` / `change.md`. Ujednolicenie importów (wszystko na `radix-ui` i usunięcie dwóch pojedynczych zależności) zostawić na osobną zmianę.
- **Decision**: FIXED — addendum w `plan.md`; ujednolicenie importów radix jako osobna zmiana.

### F6 — Panel błędu bez tła `destructive/10`, przycisk ponowienia złożony ręcznie

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/diary/DiaryErrorState.tsx:18-24
- **Detail**: Plan zakładał „destructive z przezroczystością”. Panel ma `border-destructive/30 bg-card`, bez tła `bg-destructive/10`, które zastępowałoby dawne `bg-red-50`. „Spróbuj ponownie” to `ghost` z ręcznie dodaną ramką. Komentarz w pliku tłumaczy, że chodzi o obejście nadpisań `dark:` w wariancie `outline`.
- **Fix**: przyjąć jako świadome odejście i dopisać je do addendum (razem z F5 i F7).
- **Decision**: FIXED — przyjęte jako świadome odejście, addendum w `plan.md`.

### F7 — `DiaryStateDemos.tsx` poza planem

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/diary/dev/DiaryStateDemos.tsx
- **Detail**: Plan wymieniał tylko `diary-states.astro`. Wyspy demo są bezpieczne:
  - importuje je wyłącznie strona dev, która poza DEV zwraca 404 i wymaga sesji;
  - nie wysyłają żadnych zapytań API;
  - nie łamią reguł `react-hooks`.
  Są kruche z założenia: przy zmianie testid albo walidacji po cichu pokażą stan domyślny.
- **Fix**: dopisać plik do addendum planu.
- **Decision**: FIXED — addendum w `plan.md`.

### F8 — Szkielet: `aria-live` z treścią od pierwszego renderu nie zostanie odczytany

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/diary/DiaryPageSkeleton.tsx:14
- **Detail**: Region live ogłasza zmiany, a nie treść obecną od początku, więc „Ładowanie dziennika…” raczej nie zostanie odczytane. `aria-busy` i brak testid `diary-page` są poprawne.
- **Fix**: na spanie użyć `role="status"`, albo przyjąć stan, bo trwa tylko do hydratacji.
- **Decision**: FIXED — `aria-live="polite"` → `role="status"`.

### F9 — Toasty nakładają się na siebie (`fixed` na każdym toaście)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/feedback/Toast.tsx:126
- **Detail**: Problem istniał przed tą zmianą i README go odnotowuje. Każdy `Toast` ma `fixed right-4 top-4`, więc kolumna w `ToastContainer` nic nie układa. Kitchen sink obchodzi to ramkami z `transform`.
- **Fix**: osobna zmiana. Pozycjonowanie trzyma `ToastContainer`, a z `Toast` znika `fixed`.
- **Decision**: SKIPPED (follow-up) — `follow-ups/review-fixes.md`.

### F10 — 16 plików PNG (2.1 MB) zacommitowanych w `context/changes/ui-enhancement/screenshots/`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: context/changes/ui-enhancement/screenshots/*.png
- **Detail**: Repo nie ma testów zrzutów (`toHaveScreenshot`), więc te PNG nie są baseline'em, tylko dokumentacją bramki. Kontrakt z CLAUDE.md wymaga kitchen sinka i zrzutu, ale nie każe trzymać zrzutów w gicie. Binaria zostają w historii na zawsze, nawet po usunięciu. Każda zmiana UI dokłada kolejne megabajty, a w diffie PR nikt ich nie przejrzy. Odtwarzalną bramką jest strona `/dev/diary-states` razem z opisem metody i delty w README. Poprzednia zmiana (`daily-goal-and-progress`) też commitowała zrzuty, więc to jest przyjęty, ale niezapisany zwyczaj.
- **Fix A ⭐ Recommended**: README z deltą zostaje w repo, a PNG wychodzą z gita. W `.gitignore` dopisać `context/changes/*/screenshots/*.png`, uruchomić `git rm --cached` na tych 16 plikach i trzymać je lokalnie albo jako załącznik do PR. README dostaje zdanie, gdzie są zrzuty i jak je odtworzyć.
  - Strength: repo nie rośnie o binaria, a bramka zostaje odtwarzalna dzięki kitchen sinkowi i opisowi metody.
  - Tradeoff: zrzuty „przed” znikają z repo. Stanu sprzed zmiany nie da się już wyrenderować (można tylko cofnąć się do `4ea756e` i zrobić zrzut ponownie). Pliki już zacommitowane i tak zostaną w historii.
  - Confidence: HIGH — nic w repo nie czyta tych PNG.
  - Blind spot: czy prowadzący kurs oczekuje zrzutów w repo jako dowodu wykonania lekcji.
- **Fix B**: zostawić tylko 2–3 kluczowe zrzuty (np. `before/after-diary-light-375`, `after-states-light-desktop`) i usunąć resztę.
  - Strength: kompromis. Najważniejszy dowód delty zostaje przy zmianie.
  - Tradeoff: zwyczaj trzymania binariów w repo zostaje, tylko w mniejszej skali.
  - Confidence: MED — wybór plików jest arbitralny.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix B — zostały `before-diary-light-375`, `after-diary-light-375`, `after-states-light-desktop`; 13 plików `git rm` (w historii, `6bce2c8`); dopisek w README zrzutów.
