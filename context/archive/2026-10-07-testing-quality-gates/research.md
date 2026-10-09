---
date: 2026-10-07T15:52:44+02:00
researcher: Claude (Opus 5.5) dla Rasp228
git_commit: 32abdd0
branch: master
repository: Rasp228/10x-HealthyFood
topic: "Faza 4 test-planu — Bramki jakości: wymagane checki PR, testy faz 1–3 w CI, post-edit hook"
tags: [research, ci, github-actions, branch-protection, jest, playwright, claude-code-hooks]
status: complete
last_updated: 2026-10-07
last_updated_by: Claude (Opus 5.5)
---

# Research: Faza 4 — Bramki jakości (`testing-quality-gates`)

**Date**: 2026-10-07T15:52:44+02:00
**Git Commit**: 32abdd0 (lokalny `master`; `origin/master` = 0936f73, 12 commitów za lokalnym)
**Branch**: master
**Repository**: Rasp228/10x-HealthyFood (publiczne)

## Research Question

Ugruntować trzy wytyczne fazy 4 (`context/foundation/test-plan.md` §3 wiersz 4, §5):
(1) wymagane checki PR blokują merge na `master` przy czerwonym `unit-tests`/`e2e-tests`;
(2) wszystkie testy z faz 1–3 (w tym `test.failing`) naprawdę uruchamiają się w CI;
(3) lokalny post-edit hook uruchamia testy powiązane z edytowanym plikiem.

## Summary

1. **Checki PR — dziś nie ma żadnej ochrony** `master` (API: `protected: false`, `required_status_checks.contexts: []`, `rulesets: []`). Repo jest publiczne, więc branch protection i rulesets są dostępne bez płatnego planu. Wytyczna wymaga trzech korekt:
   - **Nazwa checku to `name:` joba, nie jego id.** Check-runy na commicie PR #3 (`f76b1f6`) nazywają się `Kontrola jakości kodu`, `Build produkcyjny`, `Testy jednostkowe`, `Testy E2E`, `Status comment` (+ `Vercel Preview Comments`). Wymaganie kontekstu `unit-tests` albo `e2e-tests` zablokowałoby merge na zawsze (check o tej nazwie nigdy nie powstaje).
   - **Wymagać tylko testów to za mało — „skipped” przechodzi.** Gdy `code-quality` pada, `build`, `unit-tests` i `e2e-tests` dostają `skipped` (zaobserwowane w 2 z 71 ostatnich przebiegów: 37008563397 na PR #1 i 37433702043 na push). GitHub liczy pominięty wymagany check jako spełniony, więc PR z czerwonym `build` miałby „zielone” wymagane testy. `Status comment` nie nadaje się na bramkę zbiorczą: jego `if:` (`ci-cd.yml:165`) sprawia, że przy jakiejkolwiek porażce jest `skipped`, czyli też „zielony”.
   - **Projekt pracuje push-em prosto na `master`.** W 30 ostatnich przebiegach 27 to `push` na `master`, 3 to PR (#1–#3, wszystkie z 2026-10-02). Wymagane checki na chronionej gałęzi odrzucą bezpośredni push (commit nie ma jeszcze statusów) — o ile admin nie omija reguł. To decyzja produktowa dla planu: albo przejście na PR-y, albo świadomy bypass admina (wtedy bramka nie chroni pracy właściciela).
2. **Testy faz 1–3 w CI — lokalnie wszystko się zbiera, ale faza 3 jeszcze nigdy nie biegła w CI.** `npx jest --listTests` zwraca 30 plików = wszystkie 30 plików `tests/unit/*`; w `src/` nie ma `*.test.*` ani `__tests__`. Pełne `npx jest`: 30 suit, 640 testów, wszystkie `passed`, 26 s. 9 wywołań `test.failing`/`it.failing` w 4 plikach jest liczonych jako *passed* — podsumowanie ich nie wyróżnia. Brak `.skip`/`.only`/`.todo`/`xit`/`fit` w `tests/`. Playwright `--list`: 13 testów w 4 specach, w tym `session-boundaries.spec.ts`. Ale 12 lokalnych commitów nie jest na `origin` — całość fazy 3 (`protected-data.test.ts`, zmiany w `preferences-route`/`recipes-route`) i poprawki z przeglądu fazy 2 nie przeszły jeszcze przez CI.
3. **Post-edit hook — tani i wykonalny, ale nie istnieje.** `.claude/settings.json` nie ma sekcji `hooks`, nie ma `settings.local.json`; jedyny hook to `.husky/pre-commit` → `npx lint-staged` (eslint/prettier, bez testów). `npx jest --findRelatedTests <abs-path>` na Windows (ciepły cache): 2–7 s, przyjmuje ścieżkę w formacie `D:\…`, a dla `.astro`/`.css` kończy się „No tests found” z kodem 0 w ~1,9 s. Uwaga na granicę lekcji: `CLAUDE.md` mówi „Do not configure hooks… That is Lesson 3” — plan musi zdecydować, czy hook wchodzi w tę zmianę.

## Detailed Findings

### 1. Wymagane checki PR

**Workflow** (`.github/workflows/ci-cd.yml`):
- Wyzwalacze: `push` i `pull_request` na `master`, `workflow_dispatch` (`:12-21`). Brak `paths`/`paths-ignore` — każdy PR do `master` uruchamia pełny potok, więc wymagany check zawsze powstanie (nie ma ryzyka „merge zablokowany na zawsze” z powodu filtrów ścieżek).
- Łańcuch: `code-quality` → `build` (`needs: code-quality`, `:62`) → `unit-tests` (`needs: build`, `:88`) i `e2e-tests` (`needs: build`, `:107`). Nazwy wyświetlane: `:32` „Kontrola jakości kodu”, `:59` „Build produkcyjny”, `:85` „Testy jednostkowe”, `:104` „Testy E2E”, `:161` „Status comment”.
- `status-comment` (`:164-165`): `needs: [code-quality, build, unit-tests, e2e-tests]`, `if: always() && …result == 'success'` dla wszystkich czterech — przy porażce dowolnego jest `skipped`.
- `concurrency: group: ${{ github.workflow }}-${{ github.ref }}`, `cancel-in-progress: true` (`:26-27`). 12 z 71 przebiegów to `cancelled`; wśród 30 najnowszych wszystkie 7 anulowanych to `push` do `master` (kolejne pushe anulują poprzednie). PR ma własny `ref` (`refs/pull/N/merge`), więc nie anuluje się z pushami na `master`.
- `permissions` (`:4-7`): `contents: read`, `checks: write`, `pull-requests: write` — nie wpływa na ochronę gałęzi.

**Stan GitHub** (publiczne API, bez uwierzytelnienia, 2026-10-07):
- `GET /repos/Rasp228/10x-HealthyFood` → `private: false`.
- `GET …/branches/master` → `protected: false`, `protection.required_status_checks.enforcement_level: "off"`, `contexts: []`.
- `GET …/rulesets` → `[]`.
- `GET …/branches/master/protection` → 401 (wymaga tokenu admina — do odczytu i zapisu potrzebny `gh` z uwierzytelnieniem).
- Środowiska: `integration`, `Preview`, `Production` — wszystkie `protection_rules: []`, `deployment_branch_policy: null`. Job `e2e-tests` z `environment: integration` (`:108`) nie czeka więc na zatwierdzenie i działa z gałęzi PR (potwierdzone: PR #3 `fix/ui-focus-ring`, przebieg 37009974716, `Testy E2E = success`).
- `gh` **nie jest zainstalowany** w tej sesji (`gh: command not found` w Git Bash; `where.exe gh` — brak). Test-plan §4 zakłada `gh` jako narzędzie fazy 4 — to założenie jest dziś fałszywe; włączenie ochrony wymaga instalacji `gh` + `gh auth login` albo ręcznej konfiguracji w UI repo.

**Stabilność `e2e-tests`** (czy nadaje się na wymagany):
- 71 przebiegów od 2026-09-16: 57 `success`, 2 `failure`, 12 `cancelled`. Obie porażki to krok „Audyt bezpieczeństwa zależności” w `code-quality`; żadna nie pochodzi z E2E.
- Zastrzeżenie: `retries: process.env.CI ? 2 : 1` (`playwright.config.ts:37`) — zielony job może ukrywać niestabilność (test zielony za drugim podejściem). Liczby powtórzeń z API przebiegów nie widać; to wymaga raportu Playwright (artefakt `playwright-report-*`, `ci-cd.yml:151-156`).
- Ryzyko współbieżności (z cookbooka §6.4): `session-boundaries.spec.ts` wylogowuje konto testowe globalnie; dwa równoległe przebiegi na tym samym koncie (np. PR i push na `master`, które nie anulują się nawzajem) mogą się wylogować w połowie. Wymaganie `Testy E2E` przy pracy na PR-ach zwiększa szansę takiej kolizji. Nie zaobserwowane w historii (PR-y były 3), więc to ryzyko wywnioskowane, nie zmierzone.
- E2E z forka nie dostanie sekretów (`secrets.*`, `:112-117`) i padnie; dziś nie dotyczy (brak forków/współpracowników), ale wymagany check zablokuje każdy PR z forka.

**Dowód „czerwony PR”**: wytyczna jest słuszna — konfiguracja sama niczego nie dowodzi, bo błędna nazwa kontekstu daje albo blokadę na zawsze, albo brak blokady. Najtańszy dowód: gałąź z celowo czerwonym testem jednostkowym → PR → przycisk merge zablokowany („Required statuses must pass”), potem to samo z czerwonym `build` (sprawdza pułapkę `skipped`). Alternatywa dla drugiego przypadku: wymagać wszystkich czterech checków.

### 2. Testy z faz 1–3 w CI

**Jest** (`jest.config.js`):
- `roots: ["<rootDir>/src", "<rootDir>/tests"]` (`:7`), `testMatch` (`:10-15`) obejmuje `src/**/__tests__`, `src/**/*.(test|spec)`, `tests/unit/**/*.(test|spec)`, `tests/integration/**/*.(test|spec)`; `testPathIgnorePatterns` (`:75`) wyklucza `.next`, `node_modules`, `dist`, `tests/e2e`. Nic nie wycina katalogów z testami faz 1–3.
- `npx jest --listTests`: dokładnie 30 plików, równe zbiorowi `ls tests/unit` (30 plików). `find src -name "*.test.*" -o -name "__tests__"` — pusto.
- Pełny przebieg lokalny (`npx jest --silent`): `Test Suites: 30 passed, 30 total`, `Tests: 640 passed, 640 total`, 26,3 s.
- `test.failing`/`it.failing` — 9 wywołań: `LogoutButton.test.tsx:85,94`, `middleware.test.ts:294`, `recipe-nutrition.test.ts:71,75,79,85`, `recipes-route.test.ts:199,205`. Jest 30 raportuje je jako *passed*; `verbose: true` (`:84`) wypisuje ich nazwy w logu CI, ale licznik ich nie odróżnia. Zielony job nie mówi więc, ile defektów jest przypiętych — kontrola wymaga albo liczby testów (640), albo grep po logu.
- Brak `.skip`/`.only`/`.todo`/`xit`/`xdescribe`/`fit`/`fdescribe`/`test.fixme` w `tests/` (grep). Jest nie ma odpowiednika `forbidOnly`; `.only` w przyszłym pliku zawęziłby suitę w tym pliku po cichu.
- CI uruchamia `npm run test` (`ci-cd.yml:100`) = `jest` (`package.json`) — ta sama komenda co lokalnie, bez filtrów.

**Playwright** (`playwright.config.ts`):
- `testDir: "./tests/e2e"` (`:20`), `forbidOnly: !!process.env.CI` (`:34`) — `.only` wywraca CI. `TEST_MODE=true npx playwright test --list`: 13 testów w 4 plikach (`daily-goal`, `diary-entry` ×10, `recipe-management`, `session-boundaries`).
- CI: `npm run test:e2e` (`ci-cd.yml:149`), `TEST_MODE`/`NODE_ENV` ustawione w `env` joba (`:110-111`).

**Co faktycznie biegło w CI**:
- `origin/master` = 0936f73; lokalnie 12 commitów więcej (`git log origin/master..master`), m.in. całe `testing-protected-data-and-limits` (p1–p5 + poprawki z przeglądu) oraz `b6162bf` (poprawki z przeglądu fazy 2).
- `session-boundaries.spec.ts` i `middleware.test.ts` są na `origin/master` (commity `218dac9`, `d0062c8`), a ostatni przebieg na 0936f73 (37435294625) ma `Testy E2E = success` i `Testy jednostkowe = success` — faza 2 przeszła przez CI w wersji sprzed poprawek z przeglądu.
- Faza 3 nie przeszła przez CI ani razu. Notatka cookbooka §6.6 („Przebieg nowego speca w jobie `e2e-tests` w CI czeka na push”) dla fazy 2 jest **nieaktualna** (push nastąpił, przebieg zielony); dla fazy 3 analogiczne zdanie byłoby prawdziwe.

**Najtańsza warstwa dowodu**: liczba testów z logu `Testy jednostkowe` (oczekiwane 640 / 30 suit dla 32abdd0) i `Total: 13 tests` z Playwright, porównane z lokalnym `--listTests`/`--list`. Nie trzeba nowego narzędzia.

### 3. Post-edit hook

**Stan**:
- `.claude/settings.json` — tylko `permissions` (allow/ask/deny), bez `hooks`. Brak `.claude/settings.local.json`. `~/.claude/settings.json` — `model`, `autoUpdatesChannel`, `theme`; bez hooków.
- `.husky/pre-commit`: `npx lint-staged` → `eslint --fix` dla `*.{ts,tsx,astro}`, `prettier --write` dla `*.{json,css,md}` (`package.json`, `lint-staged`). Testy nie są uruchamiane przed commitem.

**Pomiary `npx jest --findRelatedTests <ścieżka absolutna> --silent`** (Windows 10, ciepły cache Jest, pojedynczy pomiar — orientacyjne):

| Edytowany plik | Suity / testy | Czas |
|---|---|---|
| `src/lib/utils/recipe-nutrition.ts` | 6 / 186 | 5,5 s |
| `src/middleware/index.ts` | 1 / 74 | 2,9 s |
| `src/lib/utils/utils.ts` | 3 / 29 | 7,2 s |
| `tests/unit/diary-totals.test.ts` (sam test) | 1 / 16 | 4,3 s |
| `src/pages/diary.astro` | „No tests found”, exit 0 | 1,9 s |
| `src/styles/global.css` | „No tests found”, exit 0 (z `--passWithNoTests`) | 1,9 s |
| `src/types.ts` | brak wyniku testów (moduł z importami wyłącznie typów) | 2,2 s |

- Ścieżka w formacie Windows (`D:\Users\…\recipe-nutrition.ts`) jest rozpoznawana (`--listTests` zwraca 3 pliki).
- Pełna suita to ~26 s — `findRelatedTests` jest 4–13× tańszy dla tych plików.
- `.astro` nie ma transformera Jest (AGENTS.md, „Testing”), więc edycja strony nie odpali żadnego testu — luka znana, pokrywa ją Playwright w CI, nie hook.
- `src/types.ts`: zmiana typu nie uruchamia testów; regresję typu łapie `npm run typecheck`, nie hook testowy.

**Mechanika Claude Code (z dokumentacji narzędzia, nie z repo — do potwierdzenia w planie)**: hook `PostToolUse` z `matcher: "Edit|Write"` w `.claude/settings.json` dostaje JSON na stdin z `tool_input.file_path`; kod wyjścia 2 przekazuje stderr modelowi jako informację zwrotną, więc czerwony test wraca do agenta w pętli. Hook musi: przepuszczać pliki spoza `src/`/`tests/` i rozszerzenia bez testów (`.md`, `.astro`, `.css`) bez uruchamiania Jesta, użyć `--passWithNoTests`, i zamienić kod wyjścia Jesta 1 na 2. Na Windows trzeba sprawdzić, jaką powłoką Claude Code wykonuje komendę hooka (Git Bash vs cmd) — wpływa na składnię i parsowanie JSON (Node jest dostępny: `.nvmrc` 24.13.0, więc skrypt `node` jest przenośny).

## Code References

- `.github/workflows/ci-cd.yml:12-21` — wyzwalacze push/PR na `master`, bez filtrów ścieżek
- `.github/workflows/ci-cd.yml:26-27` — concurrency per ref, cancel-in-progress
- `.github/workflows/ci-cd.yml:32,59,85,104,161` — nazwy jobów = nazwy check-runów
- `.github/workflows/ci-cd.yml:62,88,107` — `needs` (źródło `skipped`)
- `.github/workflows/ci-cd.yml:100,149` — `npm run test`, `npm run test:e2e`
- `.github/workflows/ci-cd.yml:164-165` — `status-comment` skipped przy dowolnej porażce
- `jest.config.js:7,10-15,75,84` — roots, testMatch, ignore, verbose
- `playwright.config.ts:20,34,37,40` — testDir, forbidOnly, retries 2 w CI, workers 1
- `tests/unit/{LogoutButton.test.tsx:85,94; middleware.test.ts:294; recipe-nutrition.test.ts:71-85; recipes-route.test.ts:199,205}` — 9 × `test.failing`
- `.claude/settings.json` — brak `hooks`
- `.husky/pre-commit` — `npx lint-staged`

## Architecture Insights

- Bramka „required” w GitHub działa na poziomie nazwy check-runu, a ta pochodzi z polskiego `name:` joba. Zmiana nazwy joba w YAML po cichu zrywa ochronę (wymagany kontekst przestaje się pojawiać → merge zablokowany) — kandydat na wpis w `docs/reference/contract-surfaces.md` („CI gates”) obok nazw skryptów.
- Topologia `needs` sprawia, że porażka wcześniejszego etapu zamienia późniejsze w `skipped`. Bezpieczne opcje: wymagać wszystkich czterech checków albo zrobić z `status-comment` job zbiorczy, który przy `if: always()` sam kończy się porażką, gdy którykolwiek `needs.*.result != 'success'` (dziś jest odwrotnie). Wybór należy do planu; workflow YAML jest w kompetencji Module 1 L5/Module 2 L5 wg granic lekcji, ale minimalna zmiana joba zbiorczego jest bramką, nie nowym pipeline'em.
- Hook post-edit i CI pokrywają różne rzeczy: hook — szybka pętla na `.ts/.tsx` w `src/`/`tests/`; CI — `.astro`, typy, e2e, pełna suita.

## Historical Context (from prior changes)

- `context/foundation/test-plan.md` §5 — „wymagane checki PR na `master` … required after §3 Phase 4”, „post-edit hook … recommended after §3 Phase 4”: zgodne z obecnym stanem (żadna z bramek nie istnieje).
- `context/foundation/test-plan.md` §4 — „GitHub przez `gh` CLI — możliwe sprawdzenie wymaganych checków PR w fazie 4”: **sprzeczne** z sesją — `gh` nie jest zainstalowany.
- `context/foundation/test-plan.md` §4 — „Baza testów: sparse — 18 plików unit i 3 specy e2e”: **nieaktualne** licznikowo (dziś 30 plików / 640 testów, 4 specy / 13 testów); opis stanu z 2026-10-05 sprzed faz 1–3, w tym sensie poprawny historycznie.
- `context/foundation/test-plan.md` §6.6 Phase 2 — „pełne `npm run test:e2e` lokalnie 13/13”: **potwierdzone** (13 testów w `--list`). „Przebieg nowego speca w jobie `e2e-tests` w CI czeka na push”: **nieaktualne** (przebieg 37435294625 zielony).
- `context/foundation/test-plan.md` §6.4 — ryzyko wylogowania równoległych przebiegów na wspólnym koncie: nadal otwarte, istotne przy wymaganiu `Testy E2E` na PR-ach.

## Related Research

- `context/archive/2026-10-05-testing-session-and-access-boundaries/` — spec `session-boundaries`, decyzja D4 (brak drugiego konta e2e).
- `context/archive/2026-10-06-testing-protected-data-and-limits/` — testy fazy 3, jeszcze bez przebiegu w CI.

## Open Questions

1. **Push vs PR** (decyzja produktowa): włączenie wymaganych checków blokuje bezpośredni push na `master`. Czy właściciel przechodzi na PR-y, czy zostawia sobie bypass admina (ochrona wtedy obejmuje tylko PR-y)?
2. **Które checki wymagać**: wszystkie cztery (`Kontrola jakości kodu`, `Build produkcyjny`, `Testy jednostkowe`, `Testy E2E`) czy jeden job zbiorczy przerobiony ze `Status comment`?
3. **Narzędzie**: instalacja `gh` + `gh auth login` (powtarzalne, skryptowalne) czy ręczna konfiguracja w UI GitHub (bez nowego narzędzia, ale bez zapisu w repo)? Branch protection classic vs ruleset.
4. **Granica lekcji dla hooka**: `CLAUDE.md` przesuwa konfigurację hooków do Lekcji 3, a test-plan §5 umieszcza hook w fazie 4 jako „recommended”. Czy hook wchodzi w tę zmianę, czy faza 4 kończy się na checkach PR i specyfikacji hooka?
5. **Niestabilność E2E maskowana `retries: 2`**: czy plan ma odczytać raport Playwright z kilku przebiegów (flaky count), zanim uzna `Testy E2E` za wymagany?
6. **Push 12 lokalnych commitów** przed wymaganiem checków — inaczej pierwszy dowód „czerwonego PR” powstanie na bazie bez testów fazy 3.
