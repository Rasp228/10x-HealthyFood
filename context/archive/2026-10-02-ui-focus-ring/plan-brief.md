# Widoczny fokus w prymitywach UI — Plan Brief

> Full plan: `context/changes/ui-focus-ring/plan.md`
> Research: `context/changes/ui-focus-ring/research.md`

## What & Why

Fokus klawiatury w prymitywach shadcn (`button`, `input`, `textarea`) ma w jasnym motywie kontrast
2.19:1 — poniżej 3:1 z WCAG 1.4.11 — a przycisk „Usuń" i pole z błędem walidacji są jeszcze gorsze
(1.44:1). Osoba nawigująca klawiaturą gubi, gdzie jest; w trybie wysokiego kontrastu Windows fokus
znika całkiem. Zmiana spłaca wpis „Prymitywy UI" z `known-drift.md`.

## Starting Point

Prymitywy rysują fokus pierścieniem `box-shadow` `ring-ring/50` o grubości `ring-[3px]`, `destructive`
nadpisuje go na `/20`, a reguły `aria-invalid` wygrywają z regułami fokusu kolejnością w CSS. Żaden
z ponad 20 konsumentów nie nadpisuje klas fokusu, więc poprawka w prymitywach obejmuje całą aplikację.

## Desired End State

Tab na każdym przycisku, polu i textarea pokazuje obrys 2 px w kolorze marki ze szczeliną 2 px —
5.74:1 w jasnym, ≥ 9.42:1 w ciemnym motywie, także na „Usuń" i na polu z błędem, także w trybie
wymuszonych kolorów. Kitchen sink `/dev/diary-states` ma sekcję fokusu, a lint pilnuje plików pól.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Mechanizm | `outline-2 outline-solid outline-offset-2 outline-ring` + `outline-hidden` | Jedyna opcja, która naprawia kontrast, tryb wysokiego kontrastu i konflikt z `aria-invalid` naraz. | Plan |
| Token `--ring` | bez zmiany wartości, tylko komentarze | Ciemniejszy token kosztowałby kolor marki (3:1 przy `/50` dopiero przy L ≈ 0.29). | Research |
| Kolor fokusu `destructive` | wspólny `--ring` | Jeden wskaźnik w aplikacji; szczelina oddziela go od czerwonego wypełnienia. | Plan |
| Dowód | sekcja na kitchen sinku + 2–3 zrzuty z Tab | `:focus-visible` nie da się wymusić klasą; zrzuty jak w `ui-enhancement`. | Plan |
| Strażnik | `input.tsx`, `textarea.tsx` w `uiTokensConfig` | `button.tsx` ma jeszcze `text-white` (Z6), który wychodzi poza fokus. | Plan |
| Szerokość | obrys + offset ≤ 4 px | `TopNav.astro:28` ma na mobile `overflow-x-auto p-1`. | Research |

## Scope

**In scope:**
- Klasy fokusu w `button`, `input`, `textarea`, `badge` (Z1–Z5)
- Komentarze `--ring` w `:root` i `.dark`
- Sekcja „Fokus klawiatury" na `/dev/diary-states`, zrzuty w `screenshots/`
- `uiTokensConfig`, `AGENTS.md` (stany + mechanizm fokusu), sekcja „Prymitywy UI" w `known-drift.md`

**Out of scope:**
- Z6 `text-white` / `--destructive-foreground`
- Z7 natywne elementy bez prymitywu, Z8 ręczny fokus w `HomePage`, `404`, `recipes/[id]`
- `toHaveScreenshot`, zmiana wartości tokenów, sekcja „Trasy przepisów" w `known-drift.md`

## Architecture / Approach

Kolor zostaje w tokenie (`--ring` → `outline-ring`), kompozycja przechodzi z `box-shadow` na
`outline` w bazie wariantów prymitywów. Szczelina obrysu jest przezroczysta, więc sama pokazuje tło
albo kartę w obu motywach. Kolejność faz z `/10x-ui`: mechanizm → stan na jednym widoku → strażnik.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Mechanizm fokusu w prymitywach | Obrys zamiast pierścienia w 4 plikach, nowe komentarze tokenu | Brak `outline-solid` = fokus niewidoczny, czego lint nie złapie |
| 2. Stan fokusu na `/diary` i bramka | Sekcja kitchen sinku, zrzuty jasny/ciemny/375, sprawdzenie forced-colors | Zrzuty wymagają logowania kontem testowym i serwera na porcie 3102 |
| 3. Strażnik i reguła | Lint na `input`/`textarea`, reguła w `AGENTS.md`, wpis w `known-drift.md` | Konflikt w `known-drift.md` z równoległym slice'em |

**Prerequisites:** `.env.test` z kontem E2E (do zrzutów); port 3102 wolny.
**Estimated effort:** ~1 sesja, 3 fazy, 3 commity.

## Open Risks & Assumptions

- Obrys idzie za `border-radius` w aktualnych przeglądarkach (Chromium 94+, Firefox 88+, Safari 16.4+) — starsze narysują prostokąt.
- Odejście od upstream shadcn: `npx shadcn add` z nadpisaniem cofnąłby poprawkę — reguła w `AGENTS.md` to opisuje.
- Kto merguje drugi (`fix/recipe-search-escape` albo ta zmiana), rozwiązuje konflikt w `known-drift.md`.

## Success Criteria (Summary)

- Tab w obu motywach pokazuje wyraźny obrys na każdym przycisku i polu, także „Usuń" i polu z błędem.
- Skan literałów na prymitywach: 6 → 2 trafienia; lint zatrzymuje powrót `ring-[3px]` w polach.
- Kolejny agent znajduje mechanizm fokusu w `AGENTS.md` i stan fokusu na kitchen sinku.
