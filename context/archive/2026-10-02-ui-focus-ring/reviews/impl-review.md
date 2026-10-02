<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Widoczny fokus w prymitywach UI — plan wdrożenia

- **Plan**: context/changes/ui-focus-ring/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-02
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING (1 observation) |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING (1 observation) |

Automatyczne kryteria uruchomione ponownie 2026-10-02: `lint` 0 błędów, `typecheck` 0/0/0,
`format:check` OK, `test` 16/16 suit, 367/367 testów; skan literałów na prymitywach — dokładnie 2
trafienia (`text-white` w `button.tsx:13`, `badge.tsx:13`); skan `diary-states.astro` — 0; grep starych
klas fokusu — pusty; próba `ring-[3px]` w `input.tsx` → `no-restricted-syntax` (cofnięta);
diff `known-drift.md` — jeden hunk w sekcji „Prymitywy UI”. Pozostałe `focus-visible:ring` w `src/`
to wyłącznie Z8 (`HomePage.tsx`, `404.astro`, `recipes/[id].astro`), wyłączone planem.

## Findings

### F1 — Kontrakt planu nadal mówi `outline-hidden`, kod i reguła mają `focus:outline-hidden`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/ui-focus-ring/plan.md (Faza 1 „Contract”, Faza 3 „Reguły agenta”)
- **Detail**: Odejście z fazy 2 (`f831ceb`) jest uzasadnione (zastępczy obrys `outline-hidden` w forced-colors rysował się na każdej kontrolce) i udokumentowane w `change.md`, `screenshots/README.md` i regule **Focus** w `AGENTS.md`. Sam `plan.md` w sekcjach Contract wciąż każe `outline-none` → `outline-hidden` w bazie, więc ktoś czytający tylko plan (np. przy kolejnym `shadcn add`) dostanie wersję sprzed poprawki.
- **Fix**: Dopisać w `plan.md` krótki addendum przy Fazie 1 i 3: „baza ma `focus:outline-hidden` (poprawka `f831ceb`, powód: `screenshots/README.md`)”.
- **Decision**: FIXED — addendum przy fazach 1 i 3 w `plan.md`

### F2 — Krok 1.8 (fokus myszą bez obrysu) odhaczony bez zapisanego dowodu

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/ui-focus-ring/plan.md (Progress 1.8)
- **Detail**: `screenshots/README.md` dokumentuje 1.7, 2.5–2.7 (zrzuty, forced-colors, nazwy dostępne), ale nie wspomina sprawdzenia kliknięciem. Mechanizm jest poprawny (`:focus-visible` + `focus:outline-hidden`; przyciski po kliknięciu nie dostają obrysu, pola tekstowe w Chromium dostają — tak jak przed zmianą), więc ryzyko jest małe; brakuje tylko śladu.
- **Fix**: Dopisać w `screenshots/README.md` jedno zdanie z wynikiem sprawdzenia kliknięciem (przycisk: brak obrysu; pole tekstowe: obrys, zgodnie z heurystyką `:focus-visible`).
- **Decision**: FIXED — wpis o fokusie myszą w `screenshots/README.md` (opisuje działanie `:focus-visible`, bez nowego pomiaru)
