# Bramki jakości — plan wdrożenia (faza 4 test-planu)

## Overview

Faza 4 z `context/foundation/test-plan.md` §3 zabezpiecza to, co osiągnęły fazy 1–3. Bez niej
czerwony test z tamtych faz niczego nie zatrzymuje. Faza ma dwa cele:

- **Wymagane checki na `master`.** Merge PR-a jest niemożliwy, gdy którykolwiek z czterech jobów CI
  jest czerwony. Dowodem jest odrzucona próba merge prawdziwego czerwonego PR-a, nie sam plik
  konfiguracji.
- **Lokalny post-edit hook.** Po edycji pliku `.ts`/`.tsx` w `src/` albo `tests/` agent dostaje
  wynik testów powiązanych z tym plikiem. Czerwony wynik wraca do pętli agenta. Hook nie zastępuje
  CI.

## Current State Analysis

Pełne ugruntowanie: `context/changes/testing-quality-gates/research.md`.

- **Brak ochrony `master`.** Publiczne API pokazuje `protected: false`, `required_status_checks.contexts: []`
  i `rulesets: []`. Repo jest publiczne, więc rulesets są dostępne bez płatnego planu.
- **Nazwy checków to `name:` jobów.** `.github/workflows/ci-cd.yml:32,59,85,104` definiuje
  „Kontrola jakości kodu”, „Build produkcyjny”, „Testy jednostkowe” i „Testy E2E”. Check-runy na
  PR #3 mają dokładnie te nazwy. Id jobów (`unit-tests`) nie pojawiają się jako konteksty.
- **Pominięty check liczy się jako zaliczony.** `needs` (`ci-cd.yml:62,88,107`) zamienia porażkę
  wcześniejszego etapu w `skipped` dla kolejnych, co widać w przebiegach 37008563397 i 37433702043.
  `Status comment` (`ci-cd.yml:164-165`) przy jakiejkolwiek porażce też jest `skipped`.
- **Workflow nie filtruje ścieżek** (`ci-cd.yml:12-21`). Każdy PR do `master` uruchamia wszystkie
  cztery joby, więc wymagany check zawsze powstanie.
- **Praca idzie push-em prosto na `master`.** W ostatnich 30 przebiegach było 27 pushy i 3 PR-y.
  Lokalnie leży 12 commitów, których nie ma na `origin`, w tym cała faza 3. Jej testy nie przeszły
  jeszcze przez CI.
- **`gh` nie jest zainstalowany** (`gh: command not found`).
- **Testy:**
  - Jest zbiera 30/30 plików z `tests/unit/`, czyli 640 testów w 26 s, w tym 9 × `test.failing`.
  - Playwright ma 13 testów w 4 specach.
  - CI ustawia `retries: 2` (`playwright.config.ts:37`), co może ukrywać niestabilne testy.
- **Hooka nie ma.** `.claude/settings.json` zawiera tylko `permissions`.
  - Cały katalog `.claude/` jest w `.gitignore:44`, więc nic w nim nie jest śledzone.
  - `npx jest --findRelatedTests <ścieżka>` trwa 2–7 s. Dla `.astro` i `.css` kończy się
    „No tests found” z kodem 0.

## Desired End State

- Ruleset „master — wymagane checki” jest zapisany w `.github/rulesets/master.json` i aktywny na
  `refs/heads/master`. Wymaga:
  - PR-a (0 zatwierdzeń);
  - czterech checków o polskich nazwach jobów, przypiętych do aplikacji GitHub Actions;
  - zakazu force-push i usunięcia gałęzi.

  Rola admin ma bypass `always`.
- Zapisany dowód: PR z czerwonym testem jednostkowym i PR z czerwonym `typecheck` (testy
  `skipped`) zostały odrzucone przy próbie merge bez bypassu. Oba PR-y są zamknięte bez merge.
- Przebieg CI na wypchniętym `master` potwierdza 30 suit / 640 testów w Jest i 13 testów
  w Playwright. Liczba testów flaky jest zapisana.
- Skrypt `scripts/hooks/related-tests.mjs` jest śledzony w repo, a lokalny wpis `PostToolUse`
  w `.claude/settings.json` go uruchamia. Po zepsutej edycji agent dostaje wynik testów przez
  stderr z kodem 2.
- Dokumentacja jest zaktualizowana:
  - `AGENTS.md`: praca przez PR, bypass i hook;
  - `docs/reference/contract-surfaces.md`: nazwy jobów jako konteksty i plik rulesetu;
  - `docs/reference/known-drift.md`: wspólne konto E2E;
  - `test-plan.md`: nowa sekcja §6.7 i notatka fazy 4 w §6.6.

### Key Discoveries:

- Konteksty checków: `ci-cd.yml:32,59,85,104`. To kontrakt, który zrywa zmiana `name:` joba.
- Pułapka `skipped`: `ci-cd.yml:62,88,107,164-165`.
- `.claude/` jest ignorowane (`.gitignore:44`). Logika hooka musi więc leżeć poza nim, żeby dało
  się ją przejrzeć i wersjonować.
- `PostToolUse` dostaje JSON na stdin z polem `tool_input.file_path`. Dokumentacja nie mówi
  wprost, czy ścieżka jest absolutna, więc skrypt rozwiązuje ją względem `cwd`.
  - Kod 2 przekazuje stderr agentowi. Edycja jest już wtedy wykonana i hook jej nie cofa.
  - Forma exec (`command: "node"` + `args`) pomija Git Bash/PowerShell.
  - Domyślny timeout to 600 s.

## What We're NOT Doing

- **Bez wymogu PR dla właściciela.** Decyzja „PR + bypass admina”: admin, a więc także agent
  działający na jego poświadczeniach, może dalej pushować na `master` i mergować czerwony PR.
  Bramka twardo chroni PR-y, a bezpośredni push jest świadomie przyjętą luką. Opisuje ją
  `AGENTS.md` i notatka fazy w §6.6.
- **Bez zmian w `.github/workflows/ci-cd.yml`.** Nie powstaje job zbiorczy, nie zmieniają się nazwy
  jobów i nie ma nowego pipeline'u. Wymagamy czterech istniejących checków.
- **Bez obowiązkowej akceptacji recenzenta** (`required_approving_review_count: 0`) i bez
  `strict_required_status_checks_policy`. Jeden autor, więc wymóg aktualności gałęzi wymuszałby
  tylko dodatkowe przebiegi.
- **Bez naprawy niestabilności E2E i bez drugiego konta testowego.** Mierzymy flaky i opisujemy
  kolizję wspólnego konta, ale nie naprawiamy jej.
- **Bez naprawy defektów przypiętych `test.failing`.** Faza sprawdza tylko, że biegną w CI.
- **Bez uruchamiania całej suity w hooku**, bez testów dla `.astro` i bez Playwrighta w hooku.
  Hook nie jest bramką CI.
- **Bez wersjonowania `.claude/settings.json`.** Wpis hooka jest lokalny, a `AGENTS.md` mówi, jak
  go dodać.
- **Bez korekty §3–§5 i §4 test-planu.** Status wiersza i nieaktualne liczniki w §4 („18 plików”,
  `gh`) przenosi `/10x-test-plan`. Ten plan zmienia tylko §6.

## Implementation Approach

1. Najpierw baza. Bez wypchniętej fazy 3 i bez `gh` nie da się ani zmierzyć CI, ani nałożyć
   rulesetu.
2. Ruleset jako plik JSON w repo, nakładany przez `gh api`. Konfiguracja jest wtedy
   przeglądalna i powtarzalna.
3. Dowód: czerwony PR, przy którym bypass jest **na chwilę zdjęty**. Z aktywnym bypassem admin
   mógłby zmergować PR mimo czerwieni, więc odmowa merge niczego by wtedy nie dowodziła. Po
   dowodzie bypass wraca.
4. Hook jako mały skrypt Node w śledzonym katalogu `scripts/hooks/`, uruchamiany z lokalnego wpisu
   w `.claude/settings.json`.
5. Dokumentacja i cookbook.

## Critical Implementation Details

- **Kolejność w fazie 3.** Próba merge czerwonego PR-a ma sens tylko przy rulesecie **bez**
  `bypass_actors`. Najpierw nałóż wariant bez bypassu, potem spróbuj merge, a na końcu przywróć
  plik z repo i sprawdź, że bypass wrócił. Jeśli merge mimo to przejdzie, natychmiast zrób revert
  na `master`. Dlatego celowo czerwony test żyje w osobnym, nowym pliku: revert jest wtedy
  trywialny.
- **Lint skryptu hooka.** `eslint .` obejmuje `scripts/**/*.mjs`. Globale Node (`process`,
  `console`) w module ES mogą wpaść na `no-undef`, bo `commonjsConfig` dotyczy tylko
  `*.config.js` (`eslint.config.js:24-37`). Jeśli lint zgłosi błąd, dodaj blok `files: ["scripts/**/*.mjs"]`
  z globalami Node. Nie wyłączaj reguły dla całego repo.
- **Uruchamianie Jesta z hooka na Windows.** `npx` to w Windows `npx.cmd`, którego `spawnSync` bez
  powłoki nie uruchomi. Wołaj `process.execPath` z `node_modules/jest/bin/jest.js`, z `cwd` ustawionym
  na katalog projektu.

## Faza 1: Baza CI i narzędzie

### Overview

Wypchnąć fazę 3 i ustalić, co faktycznie biegnie w CI. To jest punkt odniesienia dla bramki.
Kroki z `gh auth login` i `git push` wykonuje użytkownik: logowanie jest interaktywne, a `git push`
wymaga potwierdzenia w ustawieniach.

### Changes Required:

#### 1. Narzędzie `gh`

**File**: brak (środowisko lokalne)

**Intent**: Zainstalować GitHub CLI i uwierzytelnić je kontem z uprawnieniem admin do repo. Bez
tego nie da się nałożyć rulesetu ani odczytać logów jobów.

**Contract**: `gh auth status` pokazuje zalogowane konto `Rasp228` ze scope `repo`.
`gh api repos/Rasp228/10x-HealthyFood --jq .permissions.admin` zwraca `true`. Instalacja:
`winget install --id GitHub.cli`, potem `! gh auth login` w tej sesji.

#### 2. Wypchnięcie 12 commitów

**File**: brak (`git push origin master`, wykonuje użytkownik)

**Intent**: Wypchnąć fazę 3 i poprawki z przeglądu fazy 2, zanim powstanie ruleset. Ruleset
zablokowałby później ten push tylko dla nie-adminów, ale dowód w fazie 3 musi stać na bazie
z testami fazy 3.

**Contract**: `git log origin/master..master` jest puste. Przebieg „Test & Build Master” na nowym
HEAD kończy się `success` we wszystkich czterech jobach.

#### 3. Liczby z logów CI i pomiar flaky

**File**: brak (odczyt). Wynik trafia do notatki fazy w `test-plan.md` §6.6 (faza 5).

**Intent**: Potwierdzić, że zielone CI uruchamia tyle testów, ile lokalnie. Zmierzyć, czy
E2E przechodzi dopiero za powtórką.

**Contract**:
- `gh run view <run-id> --log --job <id joba Testy jednostkowe>` zawiera `Test Suites: 30 passed, 30 total`
  i `Tests: 640 passed, 640 total`. Jeśli przybyły testy, liczba ma być równa lokalnemu `npx jest`
  na tym samym commicie.
- Log joba „Testy E2E” zawiera podsumowanie Playwright z 13 testami. Zapisz, czy pojawia się
  `flaky`, a jeśli tak, ile i których testów to dotyczy.

### Success Criteria:

#### Automated Verification:

- `gh auth status` kończy się kodem 0, a `gh api repos/Rasp228/10x-HealthyFood --jq .permissions.admin` zwraca `true`
- `git log origin/master..master --oneline` jest puste
- Ostatni przebieg „Test & Build Master” na HEAD `master` ma `conclusion: success` (`gh run list --branch master --limit 1`)
- Log „Testy jednostkowe” zawiera `Tests:       640 passed, 640 total` (albo liczbę równą lokalnemu `npx jest` na tym commicie)
- Log „Testy E2E” zawiera 13 testów; liczba flaky jest odczytana i zanotowana

#### Manual Verification:

- Użytkownik zainstalował `gh`, zalogował się i wypchnął commity

**Implementation Note**: Po fazie zatrzymaj się. Użytkownik potwierdza instalację i push, zanim
ruszy faza 2.

---

## Faza 2: Ruleset w repo

### Overview

Zapisać ochronę `master` jako plik w repo i nałożyć ją przez API.

### Changes Required:

#### 1. Plik rulesetu

**File**: `.github/rulesets/master.json`

**Intent**: Zapisać jako kod, jaka ochrona obowiązuje na `master`, w kształcie, który przyjmuje
REST API rulesets.

**Contract**:
- `name: "master — wymagane checki"`, `target: "branch"`, `enforcement: "active"`,
  `conditions.ref_name.include: ["refs/heads/master"]`.
- `bypass_actors: [{ actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "always" }]`
  (5 = rola admin).
- `rules`:
  - `deletion`;
  - `non_fast_forward`;
  - `pull_request`, z `required_approving_review_count: 0` i pozostałymi przełącznikami `false`;
  - `required_status_checks`, z `strict_required_status_checks_policy: false` i czterema
    wpisami `{ context, integration_id: 15368 }`.
- Konteksty muszą być bajt w bajt równe `name:` jobów: „Kontrola jakości kodu”, „Build produkcyjny”,
  „Testy jednostkowe”, „Testy E2E”. 15368 to id aplikacji GitHub Actions. Przed zapisem sprawdź je
  przez `gh api repos/Rasp228/10x-HealthyFood/commits/<sha>/check-runs --jq '.check_runs[].app.id'`.
- Plik trafia pod `prettier --check .`, więc formatuj go przez `npm run format`.

#### 2. Nałożenie rulesetu

**File**: brak (`gh api`)

**Intent**: Utworzyć ruleset z pliku, a przy ponownym nałożeniu go zaktualizować.

**Contract**: Gdy rulesetu o tej nazwie nie ma, `gh api -X POST repos/Rasp228/10x-HealthyFood/rulesets --input .github/rulesets/master.json`.
Gdy już jest, `-X PUT …/rulesets/<id>`. Polecenie (z rozróżnieniem POST/PUT) trafia do
`AGENTS.md` w fazie 5.

### Success Criteria:

#### Automated Verification:

- `npm run format:check` i `npm run lint` przechodzą
- `gh api repos/Rasp228/10x-HealthyFood/rulesets --jq '.[].name'` zawiera „master — wymagane checki”
- `gh api repos/Rasp228/10x-HealthyFood/rules/branches/master` zwraca reguły `pull_request`, `required_status_checks` (4 konteksty o nazwach z `ci-cd.yml:32,59,85,104`), `non_fast_forward` i `deletion`
- Ruleset ma `bypass_actors` z `actor_id: 5`, `bypass_mode: "always"` (`gh api …/rulesets/<id>`)

#### Manual Verification:

- W Settings → Rules repo widać aktywny ruleset z czterema checkami

**Implementation Note**: Po fazie zatrzymaj się na potwierdzenie przed dowodem czerwonym PR-em.

---

## Faza 3: Dowód czerwonym PR-em

### Overview

Pokazać, że merge jest niemożliwy przy czerwonym teście i przy czerwonym etapie wcześniejszym,
po którym testy są `skipped`. Bez bypassu, żeby odmowa była prawdziwa.

### Changes Required:

#### 1. Gałąź dowodowa z czerwonym testem

**File**: `tests/unit/gate-proof.test.ts` (tylko na gałęzi `chore/gate-proof`, nigdy na `master`)

**Intent**: Jeden test z celowo fałszywą asercją, który czerwieni „Testy jednostkowe” przy
zielonych pozostałych etapach.

**Contract**: Gałąź `chore/gate-proof` od `master`, PR do `master`. Po zakończeniu CI „Testy
jednostkowe” ma `failure`, a „Kontrola jakości kodu” i „Build produkcyjny” mają `success`.

#### 2. Drugi wariant: czerwony etap wcześniejszy

**File**: ta sama gałąź, kolejny commit z błędem typu w `tests/unit/gate-proof.test.ts`
(np. przypisanie `number` do `string`)

**Intent**: Sprawdzić pułapkę `skipped`. „Kontrola jakości kodu” pada na `typecheck`, testy są
`skipped`, a merge dalej ma być zablokowany.

**Contract**: Na nowym HEAD gałęzi „Kontrola jakości kodu” ma `failure`, a „Testy jednostkowe”
i „Testy E2E” mają `skipped`.

#### 3. Próba merge bez bypassu

**File**: `.github/rulesets/master.json` (tymczasowy wariant nałożony przez API; plik w repo bez zmian)

**Intent**: Usunąć bypass na czas próby, żeby odmowa merge dowodziła reguły, a nie braku
uprawnień. Potem przywrócić stan z pliku.

**Contract**:
- Nałóż kopię pliku z `bypass_actors: []`, przez `PUT …/rulesets/<id>` z plikiem w scratchpadzie.
- `gh pr merge <nr> --merge` (bez `--admin`) kończy się błędem o polityce gałęzi bazowej. Zrób to
  dla obu wariantów: czerwony test i czerwony `typecheck`.
- `gh pr view <nr> --json mergeStateStatus` zwraca `BLOCKED`.
- Na końcu ponownie nałóż `.github/rulesets/master.json` i potwierdź, że `bypass_actors` wróciło.
- Zamknij PR bez merge (`gh pr close <nr> --delete-branch`).
- Zapisz numer PR-a i komunikaty odmowy do notatki fazy (faza 5).

### Success Criteria:

#### Automated Verification:

- PR z czerwonym „Testy jednostkowe”: `gh pr merge <nr> --merge` bez `--admin` kończy się błędem, a `mergeStateStatus` = `BLOCKED`
- PR z czerwonym „Kontrola jakości kodu” i `skipped` testami: `gh pr merge <nr> --merge` bez `--admin` kończy się błędem
- `master` nie zawiera `tests/unit/gate-proof.test.ts` (`git ls-tree origin/master tests/unit/gate-proof.test.ts` puste)
- Ruleset po fazie znów ma `bypass_actors` z `actor_id: 5` (stan równy plikowi w repo)
- PR jest zamknięty bez merge, a gałąź `chore/gate-proof` usunięta

#### Manual Verification:

- W UI PR-a przy wyłączonym bypassie widać „Merging is blocked” z listą wymaganych checków

**Implementation Note**: Po fazie zatrzymaj się na potwierdzenie przed hookiem.

---

## Faza 4: Lokalny post-edit hook

### Overview

Hook `PostToolUse` uruchamia testy powiązane z edytowanym plikiem i zwraca regresję agentowi.

### Changes Required:

#### 1. Skrypt hooka

**File**: `scripts/hooks/related-tests.mjs`

**Intent**: Czytać zdarzenie hooka ze stdin, wybrać pliki, które mają testy Jest, uruchomić
tylko testy powiązane, a porażkę przekazać agentowi.

**Contract**:
- Wejście: JSON na stdin z polami `tool_input.file_path` i `cwd`.
- Ścieżkę rozwiąż do absolutnej względem `cwd`, jeśli nie jest absolutna. Normalizuj separatory.
- **Przepuszczenie** (exit 0, bez uruchamiania Jesta) dla:
  - pliku spoza `<projekt>/src/` i `<projekt>/tests/`;
  - pliku w `tests/e2e/`;
  - rozszerzenia innego niż `.ts`/`.tsx`;
  - pliku, który nie istnieje;
  - stdin, którego nie da się sparsować.
- **Uruchomienie:** `process.execPath node_modules/jest/bin/jest.js --findRelatedTests <ścieżka> --passWithNoTests --silent`,
  z `cwd` ustawionym na katalog projektu (`CLAUDE_PROJECT_DIR`, w razie braku katalog skryptu `../..`).
- **Wynik:** kod 0 z Jesta → exit 0. Kod różny od 0 → wypisz na stderr nazwę pliku i końcówkę
  wyjścia Jesta (podsumowanie i nazwy czerwonych testów, maksymalnie ~60 linii), potem exit 2.
- Skrypt nie zmienia plików ani ustawień.

#### 2. Lokalna rejestracja hooka

**File**: `.claude/settings.json` (ignorowany przez git, zmiana tylko lokalna)

**Intent**: Uruchamiać skrypt po każdym `Edit`/`Write`/`MultiEdit`. Istniejące `permissions` mają
zostać nietknięte.

**Contract**: Klucz `hooks.PostToolUse` z wpisem `{ matcher: "Edit|Write|MultiEdit", hooks: [{ type: "command", command: "node", args: ["${CLAUDE_PROJECT_DIR}/scripts/hooks/related-tests.mjs"], timeout: 90 }] }`.
To forma exec, bez powłoki. 90 s mieści pełną suitę (~26 s) z zapasem na zimny cache.

### Success Criteria:

#### Automated Verification:

- `npm run lint` i `npm run format:check` przechodzą (ze skryptem w `scripts/hooks/`)
- Zielony przypadek: JSON z `file_path` = absolutna ścieżka `src/lib/utils/recipe-nutrition.ts` na stdin skryptu → exit 0
- Czerwony przypadek: tymczasowo zepsuta asercja w `tests/unit/diary-totals.test.ts`, JSON z tą ścieżką → exit 2 i stderr z nazwą czerwonego testu (asercja przywrócona po sprawdzeniu)
- `.astro`: JSON z `src/pages/diary.astro` → exit 0 bez uruchamiania Jesta (czas < 1 s)
- Plik spoza projektu / `docs/reference/known-drift.md` → exit 0 bez uruchamiania Jesta
- Ścieżka względna (`src/middleware/index.ts`) z `cwd` projektu → exit 0 i uruchomione testy middleware
- `.claude/settings.json` jest poprawnym JSON-em, ma `hooks.PostToolUse` i niezmienione `permissions`

#### Manual Verification:

- W nowej sesji Claude Code edycja psująca `src/lib/utils/diary-totals.ts` (albo inny plik z testami) daje agentowi komunikat hooka z czerwonym testem; po cofnięciu edycji hook milczy

**Implementation Note**: Po fazie zatrzymaj się na ręczne sprawdzenie w sesji Claude Code.

---

## Faza 5: Dokumentacja i cookbook

### Overview

Zapisać nowe kontrakty i sposób pracy tam, gdzie agent je przeczyta.

### Changes Required:

#### 1. Rejestr kontraktów

**File**: `docs/reference/contract-surfaces.md` (sekcja „CI gates”)

**Intent**: Zarejestrować nazwy jobów jako konteksty wymaganych checków, razem z plikiem rulesetu.

**Contract**: Nowy wpis „Nazwy jobów — konteksty wymaganych checków”:
- **Defined:** `ci-cd.yml:32,59,85,104` i `.github/rulesets/master.json`.
- **Breaks:** zmiana `name:` joba bez zmiany rulesetu blokuje każdy PR na zawsze, bo wymagany
  kontekst przestaje powstawać. Usunięcie jednego z czterech checków z rulesetu przywraca
  pułapkę `skipped`.
- **Uwaga:** ponowne nałożenie rulesetu przez `gh api` (POST/PUT).

#### 2. Konwencje

**File**: `AGENTS.md` (sekcja „Commits & CI”)

**Intent**: Opisać, że zmiany wchodzą przez PR z czterema wymaganymi checkami, że właściciel ma
świadomy bypass, i jak włączyć lokalny hook.

**Contract**: 3–5 zdań, bez powtarzania treści `contract-surfaces.md`:
- ruleset w `.github/rulesets/master.json` i polecenie nałożenia;
- bypass admina jako znana luka;
- hook `scripts/hooks/related-tests.mjs` z wpisem do lokalnego `.claude/settings.json`, bo
  `.claude/` jest ignorowane;
- hook nie zastępuje CI (`.astro`, typy, E2E).

#### 3. Znany dryf

**File**: `docs/reference/known-drift.md`

**Intent**: Opisać kolizję wspólnego konta E2E. Teraz, gdy „Testy E2E” jest wymagany, równoległy
przebieg PR-a i pusha może się wzajemnie wylogować przez `session-boundaries.spec.ts`. Dopisać
wynik pomiaru flaky z fazy 1.

**Contract**: Nowa sekcja w stylu pliku (po polsku):
- co się dzieje;
- kiedy (dwa przebiegi na tym samym koncie, różne `ref`, więc `concurrency` ich nie anuluje);
- kierunek naprawy (osobne konto dla speca);
- „Przyjęte świadomie” z odwołaniem do tego planu.

#### 4. Cookbook test-planu

**File**: `context/foundation/test-plan.md` (§6)

**Intent**: Dopisać wzorzec bramek i hooka, plus notatkę fazy 4.

**Contract**:
- Nowa §6.7 „Quality gates and the post-edit hook”:
  - wymagane konteksty;
  - jak dodać nowy job do wymaganych (dopisz kontekst w pliku i nałóż ruleset);
  - jak sprawdzić liczbę testów w logu CI;
  - jak działa hook i czego nie łapie.
- §6.6 dostaje notatkę „§3 Phase 4” (2–3 punkty):
  - dowód czerwonym PR-em (numer PR, oba warianty);
  - liczby z CI i flaky;
  - bypass jako luka;
  - korekta: spec `session-boundaries` przeszedł już w CI.
- Bez zmian w §1–§5 i §7.

### Success Criteria:

#### Automated Verification:

- `npm run format:check` i `npm run lint` przechodzą
- `grep -n "Testy jednostkowe" docs/reference/contract-surfaces.md` znajduje nowy wpis
- `grep -n "### 6.7" context/foundation/test-plan.md` znajduje nową sekcję, a §6.6 ma nagłówek „§3 Phase 4”
- `grep -n "related-tests.mjs" AGENTS.md` znajduje opis hooka

#### Manual Verification:

- Notatka fazy w §6.6 zawiera numer PR-a dowodowego i liczby z logów CI z fazy 1

---

## Testing Strategy

### Unit Tests:

- Brak nowych testów aplikacji. Testowy plik `gate-proof.test.ts` żyje tylko na gałęzi dowodowej
  i nie trafia na `master`.

### Integration Tests:

- Bramka: czerwony PR w dwóch wariantach (czerwony test, czerwony etap wcześniejszy) przy
  rulesecie bez bypassu.
- Hook: stdin z JSON-em w pięciu przypadkach (zielony, czerwony, `.astro`, plik spoza testów,
  ścieżka względna).

### Manual Testing Steps:

1. Settings → Rules: ruleset aktywny, cztery checki, bypass admina.
2. UI PR-a dowodowego przy zdjętym bypassie: „Merging is blocked”.
3. Sesja Claude Code: zepsuta edycja pliku z testami → komunikat hooka; cofnięcie → cisza.

## Performance Considerations

- Hook: 2–7 s na edycję pliku z testami (pomiar z researchu, ciepły cache). Pliki bez testów
  i nie-`.ts` kończą się bez uruchamiania Jesta. Timeout 90 s.
- CI: pełny potok trwa ~10–15 min na PR. To koszt pracy przez PR, przyjęty razem z bypassem.

## Migration Notes

- Przywrócenie stanu sprzed zmiany: `gh api -X DELETE repos/Rasp228/10x-HealthyFood/rulesets/<id>`
  i usunięcie `hooks` z lokalnego `.claude/settings.json`.

## References

- Research: `context/changes/testing-quality-gates/research.md`
- Test-plan: `context/foundation/test-plan.md` §3 (wiersz 4), §5 (dwa ostatnie wiersze), §6.4 (wspólne konto E2E)
- Workflow: `.github/workflows/ci-cd.yml:12-21,32,59,62,85,88,104,107,164-165`
- Poprzednia faza: `context/archive/2026-10-06-testing-protected-data-and-limits/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Baza CI i narzędzie

#### Automated

- [ ] 1.1 `gh auth status` kończy się kodem 0, a `gh api repos/Rasp228/10x-HealthyFood --jq .permissions.admin` zwraca `true`
- [x] 1.2 `git log origin/master..master --oneline` jest puste
- [x] 1.3 Ostatni przebieg „Test & Build Master” na HEAD `master` ma `conclusion: success`
- [x] 1.4 Log „Testy jednostkowe” zawiera `Tests: 640 passed, 640 total` (albo liczbę równą lokalnemu `npx jest`)
- [x] 1.5 Log „Testy E2E” zawiera 13 testów; liczba flaky odczytana i zanotowana

#### Manual

- [x] 1.6 Użytkownik zainstalował `gh`, zalogował się i wypchnął commity

### Phase 2: Ruleset w repo

#### Automated

- [x] 2.1 `npm run format:check` i `npm run lint` przechodzą
- [x] 2.2 Lista rulesetów zawiera „master — wymagane checki”
- [x] 2.3 `rules/branches/master` zwraca `pull_request`, `required_status_checks` (4 konteksty), `non_fast_forward`, `deletion`
- [x] 2.4 Ruleset ma `bypass_actors` z `actor_id: 5`, `bypass_mode: "always"`

#### Manual

- [x] 2.5 W Settings → Rules widać aktywny ruleset z czterema checkami

### Phase 3: Dowód czerwonym PR-em

#### Automated

- [ ] 3.1 PR z czerwonym „Testy jednostkowe”: merge bez `--admin` odrzucony, `mergeStateStatus` = `BLOCKED`
- [ ] 3.2 PR z czerwonym „Kontrola jakości kodu” i `skipped` testami: merge bez `--admin` odrzucony
- [ ] 3.3 `master` nie zawiera `tests/unit/gate-proof.test.ts`
- [ ] 3.4 Ruleset po fazie znów ma `bypass_actors` z `actor_id: 5`
- [ ] 3.5 PR zamknięty bez merge, gałąź `chore/gate-proof` usunięta

#### Manual

- [ ] 3.6 W UI PR-a przy wyłączonym bypassie widać „Merging is blocked”

### Phase 4: Lokalny post-edit hook

#### Automated

- [ ] 4.1 `npm run lint` i `npm run format:check` przechodzą ze skryptem w `scripts/hooks/`
- [ ] 4.2 Zielony przypadek (`recipe-nutrition.ts`) → exit 0
- [ ] 4.3 Czerwony przypadek (zepsuta asercja w `diary-totals.test.ts`) → exit 2 i stderr z nazwą testu
- [ ] 4.4 `.astro` → exit 0 bez uruchamiania Jesta
- [ ] 4.5 Plik spoza testów (`docs/reference/known-drift.md`) → exit 0 bez uruchamiania Jesta
- [ ] 4.6 Ścieżka względna (`src/middleware/index.ts`) → exit 0 i uruchomione testy middleware
- [ ] 4.7 `.claude/settings.json` ma `hooks.PostToolUse` i niezmienione `permissions`

#### Manual

- [ ] 4.8 W sesji Claude Code zepsuta edycja daje komunikat hooka, cofnięcie — ciszę

### Phase 5: Dokumentacja i cookbook

#### Automated

- [ ] 5.1 `npm run format:check` i `npm run lint` przechodzą
- [ ] 5.2 `contract-surfaces.md` ma wpis o kontekstach wymaganych checków
- [ ] 5.3 `test-plan.md` ma §6.7 i notatkę „§3 Phase 4” w §6.6
- [ ] 5.4 `AGENTS.md` opisuje hook `related-tests.mjs`

#### Manual

- [ ] 5.5 Notatka fazy w §6.6 zawiera numer PR-a dowodowego i liczby z CI
