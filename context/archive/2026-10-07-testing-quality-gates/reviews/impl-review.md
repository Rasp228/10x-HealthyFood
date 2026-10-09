<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Bramki jakości — plan wdrożenia (faza 4 test-planu)

- **Plan**: context/changes/testing-quality-gates/plan.md
- **Scope**: Full plan (fazy z kompletnym Progress)
- **Reviewed phases**: 2, 3, 4, 5
- **Date**: 2026-10-09
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 3 observations

Faza 1 poza zakresem: wiersz 1.1 (`gh auth status`) świadomie zostawiony `[ ]` — fazy 1–3 szły bez
uwierzytelnionego `gh` (decyzja użytkownika, `change.md`).

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

Bramki automatyczne (uruchomione 2026-10-09): `npm run format:check` i `npm run lint` czysto;
publiczne `rules/branches/master` zwraca `deletion`, `non_fast_forward`, `pull_request`,
`required_status_checks` z czterema kontekstami równymi `name:` jobów; `origin/master` bez
`tests/unit/gate-proof.test.ts`; PR #4 `closed`, `merged: false`. Przypadki hooka 4.2–4.6
sprawdzone w tej samej sesji (fazy 4). Hook: brak wstrzyknięcia poleceń (`spawnSync` bez powłoki,
ścieżka absolutna), `src-evil/`, `src/../package.json`, pusty i zepsuty stdin → exit 0.

## Findings

### F1 — Ręczne polecenie hooka w §6.7 daje fałszywą zieleń w Git Bash

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/foundation/test-plan.md:416
- **Detail**: Punkt „Uruchomienie ręczne” (spoza planu) wstawia `"cwd":"'"$PWD"'"`. W Git Bash `$PWD` to `/d/Users/...`; `path.resolve` na win32 robi z tego `D:\d\Users\...`, plik wypada poza projekt i skrypt kończy się exit 0 w 0,15 s bez uruchomienia Jesta (odtworzone). Udokumentowany sposób sprawdzenia hooka jest zielony bez względu na testy. Prawdziwe zdarzenia hooka niosą windowsowe `cwd`, więc sam hook działa.
- **Fix**: Usunąć pole `"cwd"` z polecenia (skrypt wraca wtedy do katalogu projektu i rozwiązuje względną ścieżkę poprawnie) albo podać `"cwd":"'"$(pwd -W)"'"`.
- **Decision**: FIXED — usunięte pole `cwd` z polecenia w §6.7, dopisane ostrzeżenie o `$PWD` w Git Bash; polecenie trwa 4,4 s (Jest biegnie)

### F2 — Hook zgłasza awarię uruchomienia jako „czerwone testy” i nie ma własnego timeoutu

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/hooks/related-tests.mjs:69-85
- **Detail**: Każdy niezerowy wynik — brak `node_modules/jest` (odtworzone: `MODULE_NOT_FOUND` podany jako czerwone testy), `result.error`, `status === null` po sygnale, błąd konfiguracji Jesta — kończy się komunikatem „Testy powiązane z … są czerwone” i exit 2, czyli fałszywą regresją w pętli agenta przy każdej edycji. `spawnSync` nie ma `timeout`; gdy Claude Code zabije hook po 90 s, na Windows potomny Jest nie ginie razem z rodzicem i może zostać sierotą.
- **Fix**: Sprawdzić `existsSync(jestBin)` przed startem; dodać `timeout: 80_000` do `spawnSync`; gdy `result.error`, `status === null` albo brak binarki — komunikat „hook nie uruchomił Jesta: …” na stderr i exit 1 (nieblokujący), exit 2 tylko dla prawdziwego wyniku Jesta.
  - Strength: Agent rozróżnia regresję od zepsutego środowiska; timeout poniżej 90 s pozwala skryptowi samemu ubić Jesta.
  - Tradeoff: Kilkanaście linii więcej w skrypcie; exit 1 nie przerywa agenta, więc zepsute środowisko widać tylko w transkrypcie.
  - Confidence: HIGH — przypadek bez `node_modules/jest` odtworzony przez recenzenta.
  - Blind spot: Nie sprawdzono, jak Claude Code na Windows zabija hook po timeoucie (czy drzewo procesów ginie).
- **Decision**: FIXED — `existsSync(jestBin)`, `timeout: 80_000`, `result.error` / `status === null` → „nie uruchomił Jesta” i exit 1; exit 2 tylko dla wyniku Jesta. Sprawdzone: zielony 0, czerwony 2, brak Jesta 1. §6.7 uzupełnione

### F3 — Wiersze Progress twierdzą więcej, niż mówią dowody

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/testing-quality-gates/plan.md:507,520,528,531
- **Detail**: 1.6 „zainstalował `gh`, zalogował się” — `gh` zainstalowany, ale niezalogowany. 3.1 „`mergeStateStatus` = `BLOCKED`” — nie odczytany (anonimowe API: `unstable`); dowodem jest komunikat UI. 2.4 i 3.4 „`bypass_actors` z `actor_id: 5`” — niewidoczne w publicznym API, potwierdzone przez użytkownika. `change.md` i dokumentacja opisują to uczciwie; przesadzają tylko checkboxy (tytułów wierszy nie wolno zmieniać).
- **Fix**: Dopisać w `change.md` krótką listę „wiersze zaliczone dowodem zastępczym” (1.6, 2.4, 3.1, 3.4 — co je zastąpiło), żeby archiwum nie czytało ich dosłownie.
- **Decision**: FIXED — sekcja „Wiersze Progress zaliczone dowodem zastępczym” w `change.md` (1.1, 1.6, 2.4, 3.1, 3.4)

### F4 — AGENTS.md powtarza wpis hooka, i to niepełny (bez `timeout: 90`)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: AGENTS.md:184-194
- **Detail**: Akapit podaje matcher, `command` i `args`, ale gubi `timeout: 90` z kontraktu planu — kopiujący z AGENTS.md dostaje domyślne 600 s. Pełny wpis jest w test-plan §6.7; AGENTS.md w innych miejscach odsyła do dokumentów referencyjnych zamiast powtarzać szczegóły.
- **Fix**: Zastąpić inline'owy wpis odesłaniem do §6.7 `context/foundation/test-plan.md` (albo dopisać `timeout: 90`).
- **Decision**: FIXED — AGENTS.md odsyła do wpisu w test-plan §6.7 (z `timeout: 90`) zamiast go powtarzać

### F5 — `bypass_mode: "pull_request"` zamknąłby lukę bezpośredniego pusha

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: .github/rulesets/master.json:11-17
- **Detail**: Bypass `always` dla roli admin to świadoma decyzja planu („PR + bypass admina”), opisana jako luka. GitHub ma węższy tryb `pull_request`: admin może zmergować czerwony PR awaryjnie, ale bezpośredni push na `master` — także agenta na poświadczeniach właściciela — przechodzi przez regułę PR.
- **Fix A ⭐ Recommended**: Zostawić `always`, jak zdecydowano
  - Strength: Zgodne z planem i obecnym trybem pracy (27/30 przebiegów to pushe na `master`); bez zmian w dokumentacji.
  - Tradeoff: Luka zostaje: agent może wypchnąć czerwony kod na `master`.
  - Confidence: HIGH — decyzja jest zapisana w planie i dokumentach.
  - Blind spot: None significant.
- **Fix B**: Przełączyć na `bypass_mode: "pull_request"` w pliku i w UI
  - Strength: Zamyka opisaną lukę bez utraty awaryjnego merge.
  - Tradeoff: Każda zmiana, także kontekstowa (`context/`, archiwizacja), musi iść przez PR i ~10–15 min CI; trzeba zaktualizować AGENTS.md, contract-surfaces i §6.6/§6.7.
  - Confidence: MED — tryb istnieje w API rulesetów; jego zachowanie w tym repo nie było sprawdzone.
  - Blind spot: Czy przepływ `/10x-*` (commity na `master`) da się prowadzić przez PR bez tarcia.
- **Decision**: ACCEPTED (Fix A) — bypass `always` zostaje zgodnie z decyzją planu; luka bezpośredniego pusha opisana w AGENTS.md i §6.6

### F6 — Nagłówek test-planu i wiersz §3 nie odzwierciedlają zamknięcia fazy

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/foundation/test-plan.md:9 i §3 wiersz 4
- **Detail**: „Last updated: 2026-10-07” przy wpisie §6.6 z 2026-10-09; wiersz 4 nadal `change opened`. Plan świadomie zostawia §3 orkiestratorowi.
- **Fix**: Bez zmian tutaj — uruchomić `/10x-test-plan`, które przestawi wiersz 4 i datę.
- **Decision**: ACCEPTED — bez zmian; wiersz 4 §3 i datę przestawi `/10x-test-plan`
