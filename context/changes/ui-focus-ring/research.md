---
date: 2026-10-02T13:48:02+0200
researcher: Claude (Opus 5.5) dla Rasp228
git_commit: f3f35373912e83b2cf7ded348e6f1cbe508294f9
branch: fix/ui-focus-ring
repository: Rasp228/10x-HealthyFood
topic: "Pierścień fokusu prymitywów UI poniżej 3:1 w jasnym motywie — zarzuty i opcje naprawy"
tags: [research, ui, focus-visible, wcag-1.4.11, shadcn, tailwind4, button, input, textarea]
status: complete
last_updated: 2026-10-02
last_updated_by: Claude (Opus 5.5)
---

# Research: pierścień fokusu prymitywów UI

**Date**: 2026-10-02T13:48:02+0200
**Researcher**: Claude (Opus 5.5) dla Rasp228
**Git Commit**: `f3f3537` (drzewo robocze bez zmian w `src/`)
**Branch**: fix/ui-focus-ring
**Repository**: Rasp228/10x-HealthyFood

## Research Question

Audyt `/10x-ui` dla zmiany `ui-focus-ring`: dlaczego fokus klawiatury w prymitywach
`src/components/ui/{button,input,textarea,badge}.tsx` jest w jasnym motywie poniżej 3:1
(WCAG 1.4.11), kogo to dotyczy, co jeszcze psuje stan focus-visible tych prymitywów i jakimi
klasami da się to naprawić w obu motywach bez utraty koloru marki. Widok do bramki: `/diary`
przez kitchen sink `src/pages/dev/diary-states.astro`.

## Summary

- **Luka potwierdzona liczbą.** `ring-ring/50` daje na tle i karcie jasnego motywu **2.19:1**,
  w ciemnym 3.27 (tło) / 3.25 (karta) (`contrast-check.md`). Sam token nie wystarczy: `/50` osiąga
  3:1 na białym dopiero przy L ≈ 0.29 (zgodne z `docs/reference/known-drift.md:132-133`).
- **Poza znaną luką są trzy kolejne, niezapisane w `known-drift.md`:**
  1. wariant `destructive` przycisku ma fokus `ring-destructive/20` (jasny, **1.44:1**) i `/40`
     (ciemny, ~1.95:1) — `button.tsx:14`; na `/diary` to przycisk „Usuń" w `ConfirmDialog`
     (`ConfirmDialog.tsx:39,79`);
  2. na polu z `aria-invalid` reguła koloru pierścienia błędu stoi w wygenerowanym CSS **po**
     regule fokusu przy tej samej specyficzności, więc pole z błędem walidacji dostaje przy
     fokusie `ring-destructive/20` (1.44:1), a `border-destructive` wygrywa z `border-ring` — fokus
     takiego pola prawie nie różni się od stanu bez fokusu (`input.tsx:11-12`, `textarea.tsx:9`);
  3. `outline-none` + pierścień z `box-shadow` (`button.tsx:8`, `input.tsx:10`, `textarea.tsx:9`)
     znika w trybie wymuszonych kolorów (Windows High Contrast): przeglądarka nie rysuje wtedy
     `box-shadow`, a `outline-none` w Tailwind 4 nie zostawia zastępczego obrysu.
- **Zasięg:** 20+ plików konsumuje prymitywy, żaden wywołujący nie przekazuje klas `ring`/
  `outline`/`focus*` (raport agenta, grep po całym `src/`). Zmiana w prymitywach zmienia więc fokus
  wszędzie naraz i nie trafi na lokalne nadpisania. `Badge` nigdy nie jest fokusowalny.
- **Opcje naprawy** (liczby w Detailed Findings): krycie `/75` (3.48:1 jasny) — najmniejsza zmiana,
  ale pierścień zlewa się z wypełnieniem przycisku `default` (1.65:1); pełny `ring` — 5.74:1, ale
  zlewa się całkowicie (1.00:1); szczelina (`ring-offset` albo `outline-offset`) — oddziela pierścień
  od przycisku (5.74:1 / 10.41:1). Tylko wariant z `outline` rozwiązuje przy okazji tryb wymuszonych
  kolorów i konflikt z `aria-invalid`. Wybór należy do planu.
- **Kitchen sink nie ma dziś ramki fokusu**, a lista stanów w `AGENTS.md:125-127` go nie wymienia.
  Poprzedni fokus był pokazany na zrzutach zrobionych realnym Tab w Playwright, nie na stronie.

## Charges

Każdy zarzut: plik:linia, skutek dla użytkownika, kategoria. Liczby z `contrast-check.md`.

| # | Kategoria | Gdzie | Skutek dla użytkownika | Status |
|---|---|---|---|---|
| Z1 | Brakujący token / kontrast | `src/components/ui/button.tsx:8`, `input.tsx:11`, `textarea.tsx:9` (`focus-visible:ring-ring/50`) | W jasnym motywie osoba z klawiaturą słabo widzi, który przycisk ma fokus: pierścień 2.19:1 na tle. Przyciski `default`, `outline` i `ghost` nie mają nic poza nim (na `/diary`: „Dodaj", nawigacja dni, aktywna pozycja TopNav, „Spróbuj ponownie"). Pola ratuje pełna ramka `border-ring` (5.74:1). | do planu |
| Z2 | Brakujący token / kontrast | `src/components/ui/button.tsx:14` (`focus-visible:ring-destructive/20 dark:…/40`) | Fokus na przycisku potwierdzającym usunięcie wpisu (`ConfirmDialog.tsx:79`, `danger` → `destructive` :39) jest praktycznie niewidoczny: 1.44:1 jasny, 1.95:1 ciemny. Ten sam wariant w `AIModal.tsx:435`. | do planu |
| Z3 | Stan zepsuty kolejnością reguł | `src/components/ui/input.tsx:11-12`, `textarea.tsx:9`, `button.tsx:8` (`aria-invalid:ring-destructive/20`, `aria-invalid:border-destructive`) | Po błędzie walidacji w formularzu dziennika pole z błędem przy Tab nie zmienia wyglądu w sposób widoczny: ramka zostaje `destructive` jak bez fokusu, pierścień ma 1.44:1. Użytkownik poprawiający błąd nie widzi, w którym polu jest. | do planu |
| Z4 | Architektura przypadkowa (mechanizm) | `src/components/ui/button.tsx:8`, `input.tsx:10`, `textarea.tsx:9` (`outline-none` + `box-shadow`) | W trybie wysokiego kontrastu Windows fokus znika całkowicie — dla tej grupy użytkowników to brak wskaźnika, nie słaby wskaźnik. | do planu |
| Z5 | Brakujący token (literał) | `ring-[3px]` w `button.tsx:8`, `input.tsx:11`, `textarea.tsx:9`, `badge.tsx:7` | Bez skutku wizualnego — wartość spoza skali, 4 z 6 trafień skanu. Tailwind 4 `ring-3` generuje identyczny CSS. | do planu (przy okazji Z1) |
| Z6 | Brakujący token (literał) | `text-white` w `button.tsx:14`, `badge.tsx:14` | Brak skutku dla fokusu; tekst przycisku `destructive` nie ma tokenu `-foreground`. | **odłożone** — nie dotyczy fokusu, wymaga nowego tokenu w obu motywach; osobna zmiana |
| Z7 | Brakujący komponent | `src/components/diary/DiaryEntryForm.tsx:322-325` (natywny `<button>` wyniku wyszukiwania przepisu), `src/components/layout/TopNav.astro:24` (logo `<a>`) | Fokus tych elementów zależy wyłącznie od globalnego `outline-ring/50` (`global.css:162`) i domyślnego obrysu przeglądarki — wygląd nieustalony (zob. Open Questions). | **odłożone** — nie są prymitywami (`parallel-check.md`, „Poza zakresem"); kandydat na kolejną zmianę |
| Z8 | Brakujący komponent | `HomePage.tsx:202,242`, `404.astro:15,21`, `recipes/[id].astro:17` — ręczny fokus `ring-2 ring-ring` (pełne krycie) | Inny wygląd fokusu niż w prymitywach; kontrast pełnego `ring` jest wystarczający (5.74:1). | **odłożone** — `parallel-check.md`, „Poza zakresem" |

`Badge` (`badge.tsx:7,14`) ma te same klasy, ale jedyny konsument (`DiaryEntryCalories.tsx:126,130`)
renderuje go jako `<span>` bez `asChild`/`tabIndex`/`onClick` — fokus nie występuje. Ujednolicenie
klas w nim jest kosmetyczne.

## Detailed Findings

### Klasy fokusu w prymitywach (stan dzisiejszy)

- `button.tsx:8` — baza: `outline-none focus-visible:border-ring focus-visible:ring-ring/50
  focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40
  aria-invalid:border-destructive`. Warianty `default`, `destructive`, `secondary`, `ghost`, `link`
  nie mają klasy `border` (`button.tsx:12-19`), więc `focus-visible:border-ring` działa tylko
  w `outline` (:15-16). Dla pozostałych pięciu wariantów jedynym wskaźnikiem jest pierścień.
- `button.tsx:14` — `destructive` nadpisuje kolor pierścienia: `focus-visible:ring-destructive/20
  dark:focus-visible:ring-destructive/40`.
- `input.tsx:10-12`, `textarea.tsx:9` — `outline-none`, `focus-visible:border-ring
  focus-visible:ring-[3px] focus-visible:ring-ring/50`, `aria-invalid:border-destructive
  aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40`.
- `badge.tsx:7,14` — te same wzorce, bez `outline-none`.

### Co generuje Tailwind 4.3.3 (sprawdzone kompilacją `tailwindcss` z `node_modules`)

- `focus-visible:ring-[3px]` i `ring-3` dają identyczną regułę
  `--tw-ring-shadow: … 0 0 0 calc(3px + var(--tw-ring-offset-width)) var(--tw-ring-color, currentcolor)`
  w `box-shadow` — zamiana Z5 nie zmienia pikseli.
- `ring-ring/50` → `--tw-ring-color: color-mix(in oklab, var(--ring) 50%, transparent)`; kolor
  idzie z tokenu, więc ciemny motyw działa przez `.dark` bez klas `dark:`.
- **Kolejność (Z3):** w wyjściu dla klas z prymitywów `.focus-visible\:ring-ring\/50:focus-visible`
  stoi przed `.aria-invalid\:ring-destructive\/20[aria-invalid="true"]`; obie mają specyficzność
  (0,2,0), więc przy `aria-invalid="true"` + fokus wygrywa kolor błędu. Ta sama kolejność wyszła
  w osobnej kompilacji pary `focus-visible:border-ring` / `aria-invalid:border-destructive`:
  reguła ramki błędu stoi po regule ramki fokusu.
- `--tw-ring-offset-color` ma wartość początkową `#fff` (`@property`), a `ring-offset-*` bez
  `ring-offset-<kolor>` rysuje szczelinę białą także w ciemnym motywie. `ring-offset-background`
  ustawia `--tw-ring-offset-color: var(--background)`.
- `outline-none` → tylko `outline-style: none`. `outline-hidden` → to samo plus
  `@media (forced-colors: active) { outline: 2px solid transparent; outline-offset: 2px }`, czyli
  obrys, który tryb wymuszonych kolorów zamienia na kolor systemowy (Z4).

### Kontrast — opcje (wszystkie liczby: `contrast-check.md`)

| Opcja | Pierścień vs powierzchnia (jasny / ciemny tło / ciemny karta) | Pierścień vs wypełnienie przycisku `default` | Uwagi |
|---|---|---|---|
| dziś `ring-ring/50` | 2.19 / 3.27 / 3.25 | 2.62 / 3.19 | jasny poniżej 3:1 |
| `ring-ring/70` | 3.16 / 5.45 / 5.19 | — | margines w jasnym 0.16 |
| `ring-ring/75` | 3.48 / 6.13 / 5.78 | 1.65 / 1.70 | zlewa się z wypełnieniem `default` |
| `ring-ring` (100%) | 5.74 / 10.41 / 9.42 | 1.00 / 1.00 | przycisk `default` wygląda na „grubszy o 3 px" |
| szczelina 2 px w kolorze powierzchni + `ring` | 5.74 / 10.41 / 9.42 | szczelina vs wypełnienie 5.74 / 10.41 (karta 9.42) | wyraźnie oddzielony obrys |

Dla `destructive` (Z2): `/70` 3.61 / 3.80 / 3.62, `/75` 3.87 / 4.22 / 3.98, pełny 4.76 / 6.84 / 6.19.
Alternatywą jest rezygnacja z osobnego koloru fokusu dla `destructive` i użycie `ring` jak
w pozostałych wariantach.

Interpretacja WCAG 1.4.11 dla pierścienia przylegającego do wypełnienia przycisku w tym samym kolorze
(1.00:1) nie jest jednoznaczna: zewnętrzna krawędź pierścienia ma 5.74:1 do tła, ale wskaźnik
nie odcina się od samego przycisku. To argument za szczeliną, nie twarde wymaganie — do decyzji.

### Ograniczenia przestrzeni dla szczeliny

- `TopNav.astro:28` — `<nav>` ma poniżej `sm` `overflow-x-auto p-1`: 4 px zapasu. `ring-3`
  (3 px) mieści się; szczelina 2 px + obrys 2 px = 4 px mieści się na styk; szczelina 2 px +
  3 px nie mieści się (1 px przycięty). Że `p-1` dodano właśnie pod pierścień — inferencja, komentarz
  :20-22 mówi tylko o przewijaniu.
- `BaseModal.tsx:134` — kontener `overflow-hidden`, ale treść ma `p-4 sm:p-6` (:155), więc
  4-5 px obrysu się mieści.
- W widokach `/diary` grep `overflow-hidden|overflow-auto|overflow-y-auto` po `src/components/diary`,
  `src/components/common`, `card.tsx`, `diary.astro` nie dał innych trafień.

### Konsumenci (raport agenta, grep po `src/**/*.{ts,tsx,astro}`)

- Button: m.in. `DayNavigator.tsx:35,55,66`, `DiaryEntryForm.tsx:287,492,502`,
  `DiaryEntryEditModal.tsx:357,360,369`, `DiaryEntryList.tsx:77,89`, `DiaryErrorState.tsx:21`,
  `ConfirmDialog.tsx:75,79`, `ThemeToggle.tsx:67`, `AIModal.tsx` (w tym `destructive` :435), auth,
  profil, przepisy; pośrednio `IconButton.tsx:141` i `ActionButtons.tsx` (Toast, BaseModal, karty
  przepisów). `TopNav.astro:35,44` używa `buttonVariants` na natywnych `<a>`/`<button>` —
  zmiana bazy w `buttonVariants` dociera i tam.
- Wariant `secondary` przycisku nie jest nigdzie przekazywany; Badge `default`/`destructive` też nie.
- Nadpisania mogące wpłynąć na wygląd fokusu (nie na klasy fokusu): `DiaryErrorState.tsx:23`
  (`border border-destructive/30` na `ghost` — przycisk ma ramkę, którą `focus-visible:border-ring`
  może zmienić zależnie od kolejności w CSS), `ThemeToggle.tsx:72` i `ActionButtons.tsx:207`
  (`rounded-full`), `ProfilePage.tsx:199` (`link` z `h-auto p-0` — obrys przylega do tekstu).
- Żadne wywołanie nie przekazuje `ring*`, `outline*`, `focus*`, `ring-offset*` (zakres jak wyżej).

### Kitchen sink i bramka wizualna

- `src/pages/dev/diary-states.astro` (278 linii) nie ma ramki fokusu ani wymuszania stanu;
  sekcje: szkielet/błąd/pusty :174-190, podsumowanie :192-204, formularz domyślny/błąd/disabled
  :206-222, wiersze :224-249, toasty :251-260, dialog :262-276 (raport agenta).
- `:focus-visible` nie da się wymusić klasą na statycznej stronie; poprzednia zmiana pokazała fokus
  na zrzutach robionych przez Playwright z realnym Tab (`context/archive/2026-09-30-ui-enhancement/screenshots/README.md:81-82`).
- Repo nie ma `toHaveScreenshot` (`README.md:4-5` tamże) — zrzuty są dokumentacją, nie bazą.

## Code References

- `src/components/ui/button.tsx:8` — baza wariantów: `outline-none`, fokus `ring-ring/50 ring-[3px]`, `aria-invalid` ring/border
- `src/components/ui/button.tsx:14` — `destructive`: fokus `ring-destructive/20`, `dark:…/40`, `text-white`
- `src/components/ui/input.tsx:10-12` — `outline-none`, fokus, `aria-invalid`
- `src/components/ui/textarea.tsx:9` — to samo w jednej linii
- `src/components/ui/badge.tsx:7,14` — te same klasy, element nieinteraktywny
- `src/styles/global.css:29-32` — `--ring` jasny z komentarzem o 2.2:1; `:87-89` — ciemny; `:160-163` — `outline-ring/50` w `@layer base`
- `src/components/common/ConfirmDialog.tsx:37-40,79` — `danger` → `destructive` na przycisku potwierdzenia
- `src/components/layout/TopNav.astro:28` — `overflow-x-auto p-1` (limit 4 px na obrys na mobile)
- `src/components/ui/BaseModal.tsx:134,155` — `overflow-hidden` kontenera, `p-4 sm:p-6` treści
- `src/components/diary/DiaryEntryForm.tsx:322-325` — natywny `<button>` bez klas fokusu (Z7)
- `eslint.config.js:80-96` — `uiTokensConfig.files` bez `src/components/ui/`

## Architecture Insights

- Fokus jest **jednym mechanizmem w czterech plikach** — żaden konsument go nie nadpisuje, więc
  naprawa w prymitywach jest kompletna dla wszystkich widoków korzystających z nich, a nie obejmuje
  elementów budowanych ręcznie (Z7, Z8).
- Kolor fokusu idzie z tokenu `--ring` (`global.css:32,89`), a krycie z klasy w prymitywie. Token
  ma dziś wartość `= --primary`; zmiana tokenu na ciemniejszy kosztuje kolor marki
  (`known-drift.md:132-133`), więc naprawa leży w klasach prymitywów, a komentarz przy `--ring`
  trzeba przepisać pod nową kompozycję.
- Prymitywy są poza strażnikiem literałów (`eslint.config.js:80-96`); po usunięciu `ring-[3px]`
  `button/input/textarea` byłyby wolne od arbitralnych wartości — dołączenie ich do `files`
  blokuje tylko `text-white` (Z6).
- Odejście od upstream shadcn: dziś prymitywy mają klasy fokusu jak upstream. Każda opcja naprawy
  rozjeżdża je z `npx shadcn add`; proces z `ui-enhancement` (`plan.md:114-116`: odpowiadać „nie" na
  nadpisanie, sprawdzać `git diff`) już to obsługuje.

## Historical Context (from prior changes)

- `context/archive/2026-09-30-ui-enhancement/reviews/impl-review.md:40-60` — ustalenie F2
  (WARNING/MEDIUM): `ring-ring/50` ~2.2:1 jasny, ~3.3:1 ciemny; Fix A (ciemniejszy `--ring`,
  L ≈ 0.38) odrzucony po przeliczeniu (2.64:1; potrzeba L ≤ 0.28); przyjęto Fix B (zapis w
  `known-drift.md`). **Ocena dziś:** liczby potwierdzone (2.19 / 3.27 / 3.25; próg L ≈ 0.29 przy
  chroma skalowanej z L — różnica 0.01 od zapisu wynika ze sposobu skalowania chroma).
- `context/archive/2026-09-30-ui-enhancement/plan.md:108-113` — cel 3:1 liczony dla pełnego
  `--ring`, nie złożonego; F2 nazywa to luką planu. **Wniosek dla tej zmiany:** kontrast liczyć
  dla koloru po złożeniu, na `--background` i `--card`, w obu motywach.
- `docs/reference/known-drift.md:122-136` — „Prymitywy UI"; opcje: krycie, grubość, `ring-offset`.
  **Ocena:** grubość sama nie poprawia kontrastu (WCAG 1.4.11 mierzy kolor); krycie i szczelina tak.
  Wpis nie wspomina Z2-Z4.
- `context/archive/2026-09-30-ui-enhancement/screenshots/README.md:81-82,154` — fokus pokazany na
  `after-focus-{light,dark}.png` (Tab w Playwright); pliki usunięte z drzewa (F10), w historii
  `6bce2c8`.
- `context/archive/2026-10-01-ui-contract-guard/plan.md:36-51` — strażnik literałów obejmuje widok
  `/diary` i kilka współdzielonych komponentów, prymitywów nie (zamknięta lista `files`).

## Related Research

- `context/archive/2026-09-30-ui-enhancement/research.md` — zarzuty Z1 (szary `--ring`) i Z3 (pola
  bez fokusu), źródło obecnego koloru marki.
- `context/archive/2026-10-01-ui-contract-guard/literal-scan.md` — wzorzec skanu literałów.

## Open Questions

1. **Mechanizm (decyzja do planu):** krycie `ring-ring/75` (najmniejsza zmiana) vs szczelina
   `ring-offset-2 ring-offset-background` vs `outline-2 outline-offset-2 outline-ring` z
   `outline-hidden`. Tylko trzeci rozwiązuje Z3 i Z4 bez dodatkowych klas; drugi wymaga ustawienia
   koloru szczeliny (`#fff` domyślnie) i na karcie w ciemnym motywie rysuje szczelinę w kolorze tła,
   nie karty. Przy szczelinie grubość obrysu ≤ 2 px przez `TopNav.astro:28`.
2. **Kolor fokusu `destructive`:** osobny `ring-destructive/≥70` czy wspólny `ring` (marka) dla
   wszystkich wariantów.
3. **Fokus pola z błędem:** jeśli zostaje mechanizm `ring`, trzeba odwrócić pierwszeństwo
   (np. `aria-invalid:focus-visible:ring-…`) albo zgodzić się, że fokus pola z błędem ma kolor błędu
   z krycia ≥ 70%.
4. **Ramka fokusu na kitchen sinku:** strona nie wymusi `:focus-visible`. Do wyboru: zrzuty
   z Playwright (Tab) jako dowód, albo demo, które ustawia fokus programowo po interakcji z
   klawiatury. `AGENTS.md:125-127` nie wymienia fokusu na liście stanów `/diary` — czy dopisać.
5. **Nieweryfikowane:** jak Chromium rysuje domyślny obrys `outline-style: auto` przy ustawionym
   `outline-color` z `global.css:162` (dotyczy Z7, odłożone) — wymaga zrzutu, nie kodu.
6. **Nieweryfikowane w przeglądarce:** zachowanie w `forced-colors: active` (Z4) wynika ze
   specyfikacji i wygenerowanego CSS; potwierdzić emulacją w Playwright (`forcedColors: "active"`).
