# Opportunity Map

## Context

- **Project / context**: 10x-HealthyFood (projekt kursowy, jeden właściciel, direct push na `master`, CI w GitHub Actions)
- **Data constraint**: mock / lokalne / read-only / niewrażliwe
- **Date**: 2026-10-27

Fakty z repo, które ważą na klasyfikacji: brak Dependabota i Renovate; CI startuje tylko na `push` (bez `schedule`), więc nowe advisory wychodzą przy przypadkowym pushu (`93c420b`); wszystkie trzy wpisy allowlisty `audit-ci.jsonc` wygasają tego samego dnia, 2027-01-06; w historii są tylko 4 migracje.

## Map

| Signal | Existing / default response | Thin complement | First useful version | Data risk | Direction if valuable |
|---|---|---|---|---|---|
| 1. Po pushu ręcznie szukam w Actions, który job padł i dlaczego | Maile GitHuba, `gh run watch`, `gh run view --log-failed` | Alias na te komendy | Skrót w shellu | Read-only, niewrażliwe | Wait / no build |
| 2. Higiena zależności: wygasająca allowlista, advisory łapane dopiero przy pushu, ręczny research przed bumpem | Dependabot alerts (wyłączone), `npm outdated`, `npm audit`, `expiry` w audit-ci | Raport łączący outdated + audit + allowlistę + lokalne pinezki | Lokalny skrypt Node → Markdown, uruchamiany ręcznie | Publiczny rejestr npm + pliki repo | Internal tool → Async (cotygodniowy job CI) |
| 3. Ruleset w UI i `.github/rulesets/master.json` mogą się rozjechać | `gh api .../rulesets/24778393` + ręczny diff | Jednolinijkowy diff | Komenda w notatce | Read-only, token admina | Wait |
| 4. `contract-surfaces.md` / `known-drift.md` dezaktualizują się po zmianach w kodzie | Brak gotowca; częściowo `/10x-impl-review`, grep | Checker mechanicznych kotwic (ścieżki, identyfikatory, linie, stałe) | Lokalny skrypt → lista martwych odwołań | Lokalne, niewrażliwe | Review / CI gate |
| 5. Po migracji: `supabase:gen`, ręczne RLS checki z podmianą UUID, sync limitów Zod | `supabase test db` (pgTAP), checklista w AGENTS.md | Niepotrzebny — przejść na natywne narzędzie | Jeden check przepisany na pgTAP przy następnej migracji | Lokalna baza | Wait |

## Recommended First Candidate

```text
Candidate:
deps-review — raport zdrowia zależności

Reads:
npm outdated --json, npm audit --json, audit-ci.jsonc (expiry + notatki „przeglądać przy bumpie X”),
npm view <pakiet> version dla pakietów z allowlisty, krótki plik lokalnych ograniczeń
(cookie@2, eslint<10, zakazane downgrade'y z `npm audit fix --force`)

Returns:
Raport Markdown w czterech sekcjach:
- wpisy allowlisty wygasające w <30 dni,
- advisory z allowlisty, dla których wyszła łatka (wpis do usunięcia),
- dostępne bumpy: bezpieczne / uruchamiające przegląd allowlisty / blokowane przez ograniczenie,
- nowe advisory spoza allowlisty.

Does not do:
Nie podbija wersji, nie edytuje package.json ani audit-ci.jsonc, nie otwiera PR-ów,
nie działa w CI ani według harmonogramu.

Data risk:
Dane publiczne (rejestr npm, baza advisory) i pliki repo. Brak sekretów i danych użytkowników.

Direction if it proves valuable:
Internal tool → Async / remote work (cotygodniowy job w CI z raportem).
```

## Why This Candidate

- Ma gotowe narzędzie (Dependabot alerts) i lokalną wiedzę, której to narzędzie nie zna: `cookie` musi zostać na v2, ESLint na 9.x, a `npm audit fix --force` cofa `@astrojs/vercel`, `eslint-plugin-astro` i `ts-jest`. To jest przypadek „uzupełnij”, a nie „zbuduj”.
- Łączy cztery źródła (rejestr npm, baza advisory, allowlista, lokalne ograniczenia). Sygnał 4 łączy dwa.
- Ma twardy termin: 2027-01-06 wszystkie wpisy wygasają naraz i `test:security` padnie w całości.
- Krok „kup” idzie pierwszy: włączyć Dependabot alerts (same alerty, bez PR-ów, które kłóciłyby się z direct push). Helper ich nie zastępuje.

Sygnał 4 zostaje drugim kandydatem i pasuje do M5L3 (bramka w CI). Sygnały 1, 3 i 5 mają wystarczającą domyślną odpowiedź albo zbyt niską częstotliwość.

## Next Direction If Valuable

Jeśli ręczny raport okaże się użyteczny przy co najmniej dwóch kolejnych przeglądach (najbliższy wymusza expiry 2027-01-06), przenieść go do cotygodniowego joba w CI (`schedule`), który publikuje raport jako artefakt lub summary. Dopiero wtedy rozważyć kontrolowane propozycje bumpów. Następny krok: `/10x-mom-test` → `/10x-shape`.
