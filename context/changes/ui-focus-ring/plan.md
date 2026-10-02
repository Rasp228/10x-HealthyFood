# Widoczny fokus w prymitywach UI — plan wdrożenia

## Overview

Prymitywy `button`, `input`, `textarea` (i dla spójności `badge`) przestają rysować fokus pierścieniem
`box-shadow` `ring-ring/50` (2.19:1 w jasnym motywie) i rysują go obrysem 2 px w pełnym kolorze
`--ring`, odsuniętym o 2 px od kontrolki: 5.74:1 w jasnym motywie, ≥ 9.42:1 w ciemnym, jeden kolor
fokusu dla wszystkich wariantów. Fokus dostaje ramkę na kitchen sinku `/dev/diary-states`, dowód
w zrzutach z klawiatury i strażnika literałów na plikach pól.

## Current State Analysis

Pełny audyt: `research.md` (zarzuty Z1–Z8), liczby: `contrast-check.md`.

- Z1: `focus-visible:ring-ring/50 ring-[3px]` w `button.tsx:8`, `input.tsx:11`, `textarea.tsx:9` —
  2.19:1 na tle i karcie jasnego motywu. Przyciski (poza `outline`) nie mają innego wskaźnika.
- Z2: `destructive` nadpisuje kolor na `ring-destructive/20` / `dark:…/40` (`button.tsx:14`) —
  1.44:1 / 1.95:1; to przycisk „Usuń" w `ConfirmDialog.tsx:79`.
- Z3: `aria-invalid:ring-destructive/20` i `aria-invalid:border-destructive` stoją w wygenerowanym CSS
  po regułach fokusu przy tej samej specyficzności — pole z błędem przy fokusie nie zmienia wyglądu
  w widoczny sposób (`input.tsx:11-12`, `textarea.tsx:9`).
- Z4: `outline-none` + `box-shadow` — w trybie wymuszonych kolorów fokus znika.
- Z5: `ring-[3px]` — 4 z 6 trafień skanu literałów (`button.tsx:8`, `input.tsx:11`, `textarea.tsx:9`,
  `badge.tsx:7`).
- Żaden konsument nie przekazuje klas `ring*`/`outline*`/`focus*` (research, „Konsumenci"), więc
  zmiana w prymitywach dociera wszędzie, także do `TopNav.astro:35,44` przez `buttonVariants`.
- Kitchen sink nie ma ramki fokusu; `AGENTS.md:125-127` nie wymienia fokusu na liście stanów.

## Desired End State

- Tab na dowolnym przycisku, polu lub textarea z prymitywów pokazuje obrys 2 px w kolorze `--ring`
  z 2 px szczeliną w kolorze powierzchni pod spodem — w obu motywach, dla każdego wariantu, także
  `destructive` i pola z `aria-invalid`.
- Pole z błędem walidacji: bez fokusu czerwona ramka, z fokusem czerwona ramka + obrys marki.
- W emulacji `forced-colors: active` obrys fokusu jest widoczny.
- Skan literałów na `button/input/textarea/badge.tsx` daje 2 trafienia (`text-white`, Z6), nie 6.
- `/dev/diary-states` ma sekcję „Fokus klawiatury"; zrzuty z Tab leżą w `screenshots/` zmiany.
- `npm run lint` pilnuje literałów w `input.tsx` i `textarea.tsx`.

### Key Discoveries:

- `focus-visible:outline-2` kompiluje się do `outline-style: var(--tw-outline-style)`, a
  `outline-hidden` ustawia `--tw-outline-style: none` — bez `focus-visible:outline-solid` obrys się nie
  narysuje (kompilacja Tailwind 4.3.3, sesja planowania).
- `outline-hidden` = `outline-none` + `@media (forced-colors: active) { outline: 2px solid transparent }`
  (research, „Co generuje Tailwind").
- `TopNav.astro:28` — nawigacja na mobile ma `overflow-x-auto p-1`: 4 px zapasu, obrys 2 + szczelina 2
  mieści się na styk; grubszy obrys albo większy offset zostanie przycięty.
- Szczelina obrysu jest przezroczysta — pokazuje tło lub kartę pod kontrolką, więc nie wymaga
  `ring-offset-<kolor>` (którego domyślna wartość to `#fff`).

## What We're NOT Doing

- Z6 — `text-white` w wariantach `destructive` (`button.tsx:14`, `badge.tsx:14`) i nowy token
  `--destructive-foreground`; `button.tsx` zostaje poza strażnikiem do tej zmiany.
- Z7 — natywne elementy bez prymitywu (`DiaryEntryForm.tsx:322-325`, logo `TopNav.astro:24`) i bazowe
  `outline-ring/50` w `global.css:162`.
- Z8 — ręczny fokus w `HomePage.tsx`, `404.astro`, `recipes/[id].astro`.
- Zmiana wartości `--ring` w którymkolwiek motywie — zmieniają się tylko komentarze.
- Stały test `toHaveScreenshot` i baza zrzutów w repo.
- Sekcja „Trasy przepisów" w `known-drift.md` (należy do równoległego `fix/recipe-search-escape`).
- Wariant `secondary`, `link` i Badge jako element interaktywny — dostają te same klasy przez bazę,
  bez osobnej pracy.

## Implementation Approach

Kolejność z `/10x-ui`: mechanizm (odpowiednik fazy tokenów — wartości tokenu zostają, zmienia się
kompozycja) → stan fokusu na jednym widoku z bramką wizualną → strażnik i reguła. Każda faza to
osobny commit `fix(ui-focus-ring): …` / `chore(ui-focus-ring): …`.

## Critical Implementation Details

- **Trzy klasy stylu obrysu, nie dwie.** Fokus potrzebuje `focus-visible:outline-solid` obok
  `focus-visible:outline-2`, bo `outline-hidden` zeruje zmienną stylu, z której czyta `outline-2`.
  Brak tej klasy daje fokus niewidoczny, a lint i typecheck tego nie złapią — tylko zrzut.
- **Budżet 4 px.** Obrys + offset nie może przekroczyć 4 px przez `TopNav.astro:28`.

## Phase 1: Mechanizm fokusu w prymitywach

### Overview

Zamienia pierścień na obrys w czterech prymitywach i przepisuje komentarze przy `--ring`. Zamyka Z1–Z5.

### Changes Required:

#### 1. Przycisk

**File**: `src/components/ui/button.tsx`

**Intent**: Baza `buttonVariants` rysuje fokus obrysem w kolorze `--ring` zamiast pierścienia `/50`;
wariant `destructive` traci własny kolor fokusu, żeby wszystkie warianty miały jeden wskaźnik.
Martwe klasy pierścienia `aria-invalid` znikają razem z szerokością pierścienia.

**Contract**: Baza (`:8`): `outline-none` → `outline-hidden`; usunięte `focus-visible:ring-ring/50`,
`focus-visible:ring-[3px]`, `aria-invalid:ring-destructive/20`, `dark:aria-invalid:ring-destructive/40`;
dodane `focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2
focus-visible:outline-ring`. `focus-visible:border-ring` i `aria-invalid:border-destructive` zostają.
`destructive` (`:14`): usunięte `focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40`.
Nazwy `variant`/`size` i eksport `buttonVariants` bez zmian.

#### 2. Pole i textarea

**File**: `src/components/ui/input.tsx`, `src/components/ui/textarea.tsx`

**Intent**: Ten sam mechanizm co w przycisku; pole z błędem zachowuje czerwoną ramkę, a fokus dokłada
obrys marki, więc oba stany są rozróżnialne (Z3).

**Contract**: `outline-none` → `outline-hidden`; `focus-visible:ring-[3px] focus-visible:ring-ring/50`
→ te same cztery klasy obrysu co w przycisku; `aria-invalid:ring-destructive/20` i
`dark:aria-invalid:ring-destructive/40` usunięte; `focus-visible:border-ring` i
`aria-invalid:border-destructive` zostają.

#### 3. Badge

**File**: `src/components/ui/badge.tsx`

**Intent**: Spójność prymitywów i usunięcie literału `ring-[3px]`; Badge nie jest dziś fokusowalny,
ale `asChild` pozwala go takim zrobić.

**Contract**: Baza (`:7`) i `destructive` (`:14`) jak w przycisku (bez `outline-none` w bazie — dodać
`outline-hidden`). `text-white` zostaje (Z6).

#### 4. Komentarze tokenu

**File**: `src/styles/global.css`

**Intent**: Komentarze przy `--ring` (`:29-31` i `:87-88`) opisują nową kompozycję i jej kontrast,
zamiast przyznawać się do 2.2:1.

**Contract**: Wartości `--ring` bez zmian. Treść: fokus rysowany obrysem 2 px w pełnym `--ring`
z 2 px szczeliną; kontrast jasny 5.74:1 (tło = karta), ciemny 10.41:1 tło / 9.42:1 karta; szczelina vs
wypełnienie przycisku w kolorze marki 5.74:1 / 10.41:1; źródło: `context/changes/ui-focus-ring/contrast-check.md`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi
- `npm run typecheck` — 0 błędów
- `npm run format:check` przechodzi
- `npm run test` przechodzi
- Skan literałów na `src/components/ui/{button,input,textarea,badge}.tsx` daje dokładnie 2 trafienia (`text-white` w `button.tsx` i `badge.tsx`)
- `grep -n "ring-ring/50\|ring-destructive/20\|ring-\[3px\]" src/components/ui/{button,input,textarea,badge}.tsx` nie zwraca nic

#### Manual Verification:

- Tab po `/diary` w obu motywach: obrys widoczny na przyciskach `default`, `outline`, `ghost`, na polach i textarea; na mobile (375 px) aktywny link TopNav ma pełny obrys, nieprzycięty
- Fokus myszą (klik) nie pokazuje obrysu — zachowanie `:focus-visible` bez zmian

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na potwierdzenie ręcznych kroków przed fazą 2.

---

## Phase 2: Stan fokusu na `/diary` i bramka wizualna

### Overview

Kitchen sink dostaje sekcję fokusu; jednorazowy skrypt Playwright przechodzi po niej Tabem i robi
zrzuty w obu motywach. Spełnia wiersz focus-visible macierzy 7 stanów.

### Changes Required:

#### 1. Sekcja „Fokus klawiatury"

**File**: `src/pages/dev/diary-states.astro`

**Intent**: Jedno miejsce, gdzie wszystkie warianty fokusu stoją obok siebie: przyciski `default`,
`outline`, `ghost`, `destructive`, pole, pole z `aria-invalid="true"` i textarea — na karcie, żeby
w ciemnym motywie było widać szczelinę na `--card`. Podpis sekcji mówi, że stan pokazuje się dopiero
po Tab (`:focus-visible` nie da się wymusić klasą).

**Contract**: Nowa `<section>` po „Dialog usuwania", z `sectionTitle`/`stateTitle` jak pozostałe;
prymitywy renderowane statycznie (bez `client:*`), etykiety i `aria-label` na każdej kontrolce; każda
kontrolka z `data-testid` `focus-demo-<nazwa>` dla skryptu. Komentarz nagłówka pliku wymienia nową sekcję.
Plik jest w `uiTokensConfig` — bez literałów.

#### 2. Zrzuty i README

**File**: `context/changes/ui-focus-ring/screenshots/` (PNG + `README.md`)

**Intent**: Dowód fokusu do przeglądu; zgodnie z ustaleniem repo — 2–3 kluczowe PNG i README, nie seria.

**Contract**: Skrypt Playwright w scratchpadzie sesji (nie w repo), wzorem
`context/archive/2026-09-30-ui-enhancement/screenshots/README.md:13-14,68-82`: serwer
`npm run dev:e2e -- --port 3102 --ignore-lock`, logowanie kontem z `.env.test`, motyw przez
`localStorage.theme`, fokus przez `keyboard.press("Tab")` do `focus-demo-*`. Pliki:
`focus-light-desktop.png` (sekcja fokusu z fokusem na `destructive` albo polu z błędem),
`focus-dark-desktop.png`, `focus-light-375.png` (TopNav z fokusem na aktywnym linku). README opisuje
metodę, zawartość zrzutów i wynik sprawdzenia `forcedColors: "active"` (bez commitowania tego zrzutu).

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi (sekcja w pliku pod `uiTokensConfig`)
- `npm run typecheck` — 0 błędów
- `npm run format:check` przechodzi
- Skan literałów na `src/pages/dev/diary-states.astro` — 0 trafień

#### Manual Verification:

- Zrzuty pokazują obrys ze szczeliną na każdym wariancie w obu motywach, także na `destructive` i polu z błędem
- W emulacji `forced-colors: active` obrys fokusu jest widoczny
- Wszystkie kontrolki sekcji mają dostępną nazwę (etykieta lub `aria-label`)

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na przegląd zrzutów przed fazą 3.

---

## Phase 3: Strażnik i reguła

### Overview

Zostawia następnemu agentowi check i regułę, a w `known-drift.md` zostawia tylko to, co zostało (Z6).

### Changes Required:

#### 1. Strażnik literałów

**File**: `eslint.config.js`

**Intent**: Pliki pól są po fazie 1 wolne od literałów — check zatrzyma powrót `ring-[3px]`.

**Contract**: `uiTokensConfig.files` (`:80-87`) += `src/components/ui/input.tsx`,
`src/components/ui/textarea.tsx`; komentarz nad konfiguracją (`:70-74`) wspomina, że `button.tsx` czeka
na Z6.

#### 2. Reguły agenta

**File**: `AGENTS.md`

**Intent**: Fokus jest stanem widoku i ma opisany mechanizm, żeby kolejny prymityw lub kolejny
`shadcn add` go nie cofnął.

**Contract**: Sekcja „Design-system contract", punkt **States** (`:125-127`): lista stanów `/diary`
dostaje „keyboard focus". Nowy krótki punkt **Focus**: prymitywy rysują fokus
`focus-visible:outline-2 outline-solid outline-offset-2 outline-ring` z `outline-hidden` w bazie,
jeden kolor dla wszystkich wariantów; nie przywracać `ring-ring/50`; po `npx shadcn add` nadpisującym
prymityw odtworzyć te klasy; obrys + offset ≤ 4 px (`TopNav.astro`). Zdanie o `uiTokensConfig`
(`:122-124`, „enforces this for the `/diary` view") wymienia też `input`/`textarea`.

#### 3. Znany dług

**File**: `docs/reference/known-drift.md`

**Intent**: Wpis o pierścieniu poniżej 3:1 jest spłacony; zostaje tylko `text-white` i brak strażnika
na `button.tsx`.

**Contract**: Tylko sekcja „Prymitywy UI" (`:122-136`): podsekcja o pierścieniu zastąpiona podsekcją
o `text-white` w `destructive` (`button.tsx`, `badge.tsx`), brak tokenu `--destructive-foreground`
i wynikający z tego brak `button.tsx` w `uiTokensConfig`; odnośnik do `research.md` zmiany (Z6).
Pozostałe sekcje nietknięte (`parallel-check.md`).

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi
- Próba: tymczasowe `ring-[3px]` w `input.tsx` daje błąd `no-restricted-syntax` w `npx eslint src/components/ui/input.tsx` (cofnięte po sprawdzeniu)
- `npm run typecheck` — 0 błędów
- `npm run format:check` przechodzi
- `git diff --stat docs/reference/known-drift.md` dotyka tylko linii sekcji „Prymitywy UI"

#### Manual Verification:

- Reguła w `AGENTS.md` wystarcza agentowi bez kontekstu tej zmiany, żeby dodać prymityw z poprawnym fokusem

**Implementation Note**: Po fazie 3 — `/10x-impl-review ui-focus-ring`.

---

## Testing Strategy

### Unit Tests:

- Brak nowych — zmiana dotyczy wyłącznie klas CSS; istniejące testy (`npm run test`) nie zależą od klas fokusu (grep po `tests/` w planowaniu).

### Integration Tests:

- Istniejące E2E nie zależą od klas fokusu; nie dodajemy specu.

### Manual Testing Steps:

1. `/diary` jasny motyw, Tab od TopNav do formularza i listy — obrys na każdym przycisku i polu.
2. Wywołaj błąd walidacji formularza, Tab na pole z błędem — czerwona ramka + obrys marki.
3. Otwórz dialog usuwania, Tab na „Usuń" — obrys marki ze szczeliną od czerwonego wypełnienia.
4. Ciemny motyw — powtórz 1–3, także na kartach.
5. 375 px — aktywny link TopNav z fokusem nieprzycięty.

## Performance Considerations

Brak — zmiana klas CSS.

## Migration Notes

Brak danych. Odejście od upstream shadcn: przy `npx shadcn add` z pytaniem o nadpisanie
`button`/`input`/`textarea`/`badge` odpowiadać „nie" (jak w `ui-enhancement`, `plan.md:114-116`);
reguła w `AGENTS.md` (faza 3) to opisuje.

## References

- Research: `context/changes/ui-focus-ring/research.md`
- Kontrast: `context/changes/ui-focus-ring/contrast-check.md`
- Zasady pracy równoległej: `context/changes/ui-focus-ring/parallel-check.md`
- Poprzednie ustalenie: `context/archive/2026-09-30-ui-enhancement/reviews/impl-review.md:40-60`
- Wzorzec zrzutów: `context/archive/2026-09-30-ui-enhancement/screenshots/README.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Mechanizm fokusu w prymitywach

#### Automated

- [x] 1.1 `npm run lint` przechodzi
- [x] 1.2 `npm run typecheck` — 0 błędów
- [x] 1.3 `npm run format:check` przechodzi
- [x] 1.4 `npm run test` przechodzi
- [x] 1.5 Skan literałów na prymitywach daje dokładnie 2 trafienia (`text-white`)
- [x] 1.6 Grep starych klas fokusu w prymitywach nie zwraca nic

#### Manual

- [x] 1.7 Tab po `/diary` w obu motywach i na 375 px — obrys widoczny, TopNav nieprzycięty
- [x] 1.8 Fokus myszą nie pokazuje obrysu

### Phase 2: Stan fokusu na `/diary` i bramka wizualna

#### Automated

- [ ] 2.1 `npm run lint` przechodzi
- [ ] 2.2 `npm run typecheck` — 0 błędów
- [ ] 2.3 `npm run format:check` przechodzi
- [ ] 2.4 Skan literałów na `diary-states.astro` — 0 trafień

#### Manual

- [ ] 2.5 Zrzuty pokazują obrys ze szczeliną na każdym wariancie w obu motywach
- [ ] 2.6 W emulacji `forced-colors: active` obrys fokusu jest widoczny
- [ ] 2.7 Kontrolki sekcji mają dostępną nazwę

### Phase 3: Strażnik i reguła

#### Automated

- [ ] 3.1 `npm run lint` przechodzi
- [ ] 3.2 Tymczasowe `ring-[3px]` w `input.tsx` daje błąd lint
- [ ] 3.3 `npm run typecheck` — 0 błędów
- [ ] 3.4 `npm run format:check` przechodzi
- [ ] 3.5 Diff `known-drift.md` tylko w sekcji „Prymitywy UI"

#### Manual

- [ ] 3.6 Reguła w `AGENTS.md` wystarcza agentowi bez kontekstu zmiany
