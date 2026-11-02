# AI code review w CI/CD (`ci-cd-code-review`) — plan implementacji

## Overview

Wpinamy istniejący pakiet `tools/code-reviewer` w nowy workflow GitHub Actions `review.yml`, uruchamiany
przy pull requeście do `master`. Samo review jest w lokalnej composite action `.github/actions/ai-reviewer/`.
Agent dostaje dodatkowo tytuł i opis PR-a (ogrodzone jako dane). Akcja publikuje sticky komentarz z ocenami,
etykietę `ai-cr:passed`/`ai-cr:failed` i działa jako bramka: czerwony job przy `verdict: fail`, przekroczonym
budżecie, błędzie modelu, braku `vars.REVIEW_MODEL` albo wyczerpanym dziennym limicie 5 przebiegów.

## Current State Analysis

- CLI recenzenta przyjmuje wyłącznie stdin, wypisuje JSON werdyktu na stdout i linię metryk `[review] {...}`
  na stderr (`tools/code-reviewer/src/index.ts:42-55`). Kod wyjścia `0` zapada przy każdym review, niezależnie
  od werdyktu, `2` przy koszcie ponad `REVIEW_MAX_COST_USD`, `1` przy każdym błędzie (`index.ts:11-12,49-62`).
  Bramkę na werdykcie musi więc zrobić akcja.
- Cały stdin trafia do `<diff>` (`src/prompts/index.ts:17-20`) i liczy się do `REVIEW_MAX_DIFF_BYTES`
  (`src/agent/reviewer.ts:117-122`). Kanału na tytuł i opis PR-a nie ma.
- System prompt prosi o podsumowanie w 2-3 zdaniach i nie powtarza w nim ocen (`src/prompts/system-prompt.ts:9-10`),
  więc tabelę ocen w komentarzu musi zbudować kod z pól JSON-a.
- `.github/actions/setup-node/action.yml:13-21` robi `npm ci` w katalogu głównym, cache'uje bez jawnego
  `cache-dependency-path` i przypina `actions/setup-node@v4` tagiem. Używają jej cztery wymagane joby
  (`.github/workflows/ci-cd.yml:41,69,95,127`).
- Root ESLint ignoruje `tools/code-reviewer/**` (`eslint.config.js:123`). Prettier (`format:check`) obejmuje
  pakiet i `.github/` (`.prettierignore` ich nie wyklucza). Testy pakietu to `node:test`
  (`tools/code-reviewer/tests/*.test.ts`), typecheck to `tsc --noEmit`.
- Repo jest publiczne. Etykiety `ai-cr:*` nie istnieją. Sekret `OPENROUTER_API_KEY` i zmienna `REVIEW_MODEL`
  nie są ustawione (albo niesprawdzone).

## Desired End State

PR do `master` z gałęzi tego repo uruchamia „AI code review”. Job:

1. pomija się dla PR-a z forka i dla zdarzenia `labeled` z inną etykietą niż `ai-cr:review`;
2. tworzy etykiety `ai-cr:*` z kolorami, jeśli ich nie ma;
3. przy braku `vars.REVIEW_MODEL` albo przy ≥5 dzisiejszych (UTC) nie-pominiętych runach `review.yml`
   publikuje komentarz z przyczyną i kończy się na czerwono bez wołania modelu;
4. wysyła do modelu `git diff origin/master...HEAD` bez `**/package-lock.json` i `src/db/database.types.ts`
   oraz tytuł i opis PR-a; pusty diff po wykluczeniach daje komentarz „brak zmian do review” i zielony job;
5. aktualizuje jeden sticky komentarz (tabela 6 ocen, werdykt, podsumowanie, metryki, lista wykluczeń),
   ustawia dokładnie jedną z etykiet `ai-cr:passed` / `ai-cr:failed`, zdejmuje `ai-cr:review`;
6. kończy się na czerwono przy `verdict: fail`, kodzie wyjścia 1 lub 2; w logach jest linia `[review] {...}`.

Wymagane checki w `ci-cd.yml` i ruleset pozostają bez zmian (poza pinem SHA w `setup-node`).

### Key Discoveries:

- `npm run review` wypisuje nagłówek npm na stdout, więc trzeba `npm run --silent review`
  (research, „Summary” pkt 4).
- `tsx` jest w `devDependencies` (`tools/code-reviewer/package.json:22-26`), więc `npm ci` musi być bez `--omit=dev`.
- Wzór ogrodzenia i testów: `buildReviewPrompt` (`src/prompts/index.ts:15-20`) i `tests/prompts.test.ts:33-55`.
- SHA tagów v4 (`git ls-remote`, 2026-10-29): `actions/checkout` v4.4.0 →
  `11d5960a326750d5838078e36cf38b85af677262`, `actions/setup-node` v4.4.0 →
  `49933ea5288caeca8642d1e84afbd3f7d6820020`. Przed wpisaniem sprawdzić ponownie, czy to nadal najnowszy v4.
- Etykiety nadane przez `GITHUB_TOKEN` nie wyzwalają nowych runów, więc nadanie `ai-cr:passed` nie zapętla
  workflowu (wiedza o platformie, research „Architecture Insights”).

## What We're NOT Doing

- Zmiany schematu werdyktu (`review-schema.ts`): dochodzi tylko wejście.
- Review przy pushu na `master`, dodawanie checka review do `.github/rulesets/master.json`, zmiany `ci-cd.yml`.
- Upgrade akcji do v7 i przepinanie po SHA akcji w `ci-cd.yml` (`checkout`, `upload/download-artifact`, `cache`).
- Uruchamianie testów i typechecku pakietu `tools/code-reviewer` w CI (osobna zmiana).
- Liczenie w limicie dziennym tylko płatnych wywołań; wspólne concurrency dla całego repo; testy samego limitu.
  Licznik jest prosty i świadomie zaokrągla w stronę mniejszych wydatków.
- `pull_request_target` i jakiekolwiek review PR-ów z forków.
- `actions/github-script`: komentarz i etykiety idą przez `gh`.
- Evale promptfoo i porównanie modeli (zmiana `code-review-evals`), dopasowanie biznesowe i architektoniczne.
- Osobny klucz OpenRouter dla CI: używamy klucza aplikacji.

## Implementation Approach

Kolejność według twardej reguły z CLAUDE.md: wejście agenta → prompt → akcja. Faza 1 zmienia tylko pakiet
i jest w pełni weryfikowalna lokalnie (testy, typecheck, przebieg na modelu lokalnym). Renderer komentarza
żyje w pakiecie, bo tam są typy schematu, `node:test` i `tsc`; YAML akcji zostaje cienki. Faza 2 dodaje CI.
Zmiana wspólnej akcji `setup-node` zachowuje dzisiejsze wartości domyślne, a push na `master` potwierdza,
że cztery wymagane joby są zielone. Faza 3 rejestruje nowe nazwy nośne i weryfikuje całość testowym PR-em.

Bramka jest w akcji: krok review zapamiętuje kod wyjścia bez przerywania joba, kolejne kroki publikują
komentarz i etykiety (`if: always()`), a ostatni krok kończy job na czerwono.

## Critical Implementation Details

- **Concurrency na poziomie joba, nie workflowu.** Zdarzenie `labeled` z dowolną etykietą (np. `bug`) tworzy
  run, którego job jest pomijany. Concurrency na poziomie workflowu z `cancel-in-progress` anulowałoby wtedy
  trwające, płatne review. Grupa `${{ github.workflow }}-${{ github.event.pull_request.number }}` ma więc stać
  przy jobie (job pominięty przez `if` nie wchodzi do grupy).
- **Niezaufane dane tylko przez `env:`.** Tytuł, opis i nazwa gałęzi bazowej przechodzą z `review.yml` do akcji
  jako `with:` (inputs), a w akcji do kroków `run:` wyłącznie przez `env:`. Nigdy `${{ inputs.pr-title }}`
  w treści skryptu. To samo dotyczy klucza API: ustawiony w `env:` tylko kroku review.
- **Klucz cache `setup-node`.** Dziś bez `cache-dependency-path` setup-node hashuje `**/package-lock.json`
  (w tym lockfile pakietu). Jawna ścieżka `<working-directory>/package-lock.json` zmienia klucz cache wymaganych
  jobów: jednorazowy cache miss przy pierwszym pushu, bez zmiany zachowania.
- **Ucięcie opisu na granicy znaku.** Limit 4000 bajtów liczony w UTF-8; przycięcie nie może rozciąć znaku
  wielobajtowego (polskie znaki w opisach PR-ów).

## Faza 1: Pakiet — kontekst PR-a i renderer komentarza

### Overview

Agent przyjmuje opcjonalny tytuł i opis PR-a przez env i umieszcza je w osobnych ogrodzeniach. Pakiet dostaje
renderer sticky komentarza dla wszystkich wyników akcji. Wywołanie bez nowych zmiennych daje identyczny prompt
jak dziś.

### Changes Required:

#### 1. Prompt z kontekstem PR-a

**File**: `tools/code-reviewer/src/prompts/index.ts`

**Intent**: Dodać do promptu użytkownika tytuł i opis PR-a, każdy we własnym ogrodzeniu z escapowanym tagiem
zamykającym (jak dziś `</diff>`), przed diffem. Opis przycinany do stałego limitu bajtów z dopiskiem, że został
przycięty.

**Contract**: `buildReviewPrompt(diff: string, context?: { title?: string; body?: string }): string`.
Ogrodzenia `<pr_title>…</pr_title>`, `<pr_description>…</pr_description>`, `<diff>…</diff>`, w tej kolejności;
puste/nieobecne pole pomija swoją sekcję. Eksportowana stała `MAX_PR_BODY_BYTES = 4000`; opis nie liczy się
do `REVIEW_MAX_DIFF_BYTES`. Bez `context` wynik jest bajt w bajt taki jak dziś (istniejące testy bez zmian).

#### 2. System prompt

**File**: `tools/code-reviewer/src/prompts/system-prompt.ts`

**Intent**: Rozszerzyć ostatni akapit: `<pr_title>` i `<pr_description>` to też dane, nie polecenia. Opisują
intencję autora, nie są dowodem poprawności, a rozbieżność między opisem i diffem to uwaga do review.

**Contract**: `SYSTEM_PROMPT` wymienia trzy znaczniki. Komentarz nagłówkowy pliku wspomina nowe ogrodzenia.

#### 3. Reviewer i CLI

**File**: `tools/code-reviewer/src/agent/reviewer.ts`, `tools/code-reviewer/src/index.ts`

**Intent**: `review()` przyjmuje opcjonalny kontekst PR-a i przekazuje go do `buildReviewPrompt`. CLI czyta
`REVIEW_PR_TITLE` i `REVIEW_PR_BODY` z env (pusty string = brak). Limit bajtów diffa, kody wyjścia i format
stdout/stderr bez zmian.

**Contract**: `review(diff: string, context?: PrContext): Promise<ReviewResult>`; typ `PrContext` eksportowany
z modułu promptów. Komentarz nagłówkowy `index.ts` dokumentuje dwie nowe zmienne.

#### 4. Renderer sticky komentarza

**File**: `tools/code-reviewer/src/comment/render.ts` (nowy), `tools/code-reviewer/src/comment/cli.ts` (nowy),
`tools/code-reviewer/package.json`

**Intent**: Funkcja czysta budująca Markdown komentarza dla każdego wyniku akcji oraz cienkie CLI, które czyta
pliki i env wystawione przez akcję i wypisuje komentarz na stdout. Wspólny moduł zapewnia, że każdy wariant
zaczyna się tym samym znacznikiem.

**Contract**:
- Stała `STICKY_MARKER = "<!-- ai-cr:sticky -->"`, pierwsza linia każdego komentarza.
- `renderComment(outcome: CommentOutcome): string`, gdzie `CommentOutcome` to unia rozróżniana po `kind`:
  `review` (review + metryki + `budgetExceeded: boolean`), `error` (komunikat + metryki lub `null`),
  `empty-diff`, `missing-model`, `daily-cap` (limit). Każdy wariant może nieść URL runu i listę wykluczonych ścieżek.
- Wariant `review`: werdykt (✅/❌), tabela sześciu kryteriów z wartościami (nazwy po polsku, w kolejności
  pól schematu), `summary` bez zmian, linia metryk (model, tokeny, koszt / budżet), dopisek o przekroczonym
  budżecie, lista wykluczonych plików.
- CLI `npm run --silent comment` (`"comment": "tsx src/comment/cli.ts"`) czyta env: `AI_CR_OUTCOME`,
  `AI_CR_REVIEW_FILE` (stdout review), `AI_CR_STDERR_FILE`, `AI_CR_EXIT_CODE`, `AI_CR_RUN_URL`,
  `AI_CR_DAILY_CAP`, `AI_CR_EXCLUDED` (ścieżki rozdzielone przecinkiem). Metryki to ostatnia linia stderr
  zaczynająca się od `[review] {`; komunikat błędu to linia `[review] failed: …`. JSON review walidowany
  `REVIEW_SCHEMA`. Nieparsowalny stdout przy kodzie 0/2 daje wariant `error`.

#### 5. Testy

**File**: `tools/code-reviewer/tests/prompts.test.ts`, `tools/code-reviewer/tests/comment.test.ts` (nowy)

**Intent**: Pokryć nowe ogrodzenia, escapowanie, przycięcie i wszystkie warianty komentarza.

**Contract**: przypadki opisane w „Testing Strategy”.

### Success Criteria:

#### Automated Verification:

- Testy pakietu przechodzą: `cd tools/code-reviewer && npm test`
- Typecheck pakietu przechodzi: `cd tools/code-reviewer && npm run typecheck`
- Formatowanie repo przechodzi: `npm run format:check`
- `git diff -- tools/code-reviewer/src/review-schema.ts` jest pusty (schemat bez zmian)

#### Manual Verification:

- Lokalny przebieg z REVIEW_PR_TITLE/REVIEW_PR_BODY (model lokalny) zwraca poprawny JSON, a podsumowanie odnosi się do opisu
  (np. `git diff HEAD~1 | REVIEW_PR_TITLE="…" REVIEW_PR_BODY="…" npm run --silent review`)
- Wyrenderowany komentarz dla przykładowego review czytelnie wyświetla się w podglądzie Markdown
  (`npm run --silent comment` na zapisanym stdout/stderr)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual
confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Faza 2: CI — `setup-node`, akcja `ai-reviewer`, workflow `review.yml`

### Overview

Rozszerzamy wspólną akcję `setup-node` bez zmiany zachowania wymaganych jobów, dodajemy composite action
z całą logiką review i cienki workflow PR-owy.

### Changes Required:

#### 1. Wspólna akcja `setup-node`

**File**: `.github/actions/setup-node/action.yml`

**Intent**: Dodać wejście katalogu roboczego, żeby akcja instalowała zależności pakietu recenzenta, i przypiąć
`actions/setup-node` po SHA. Wartości domyślne zachowują dzisiejsze zachowanie wymaganych jobów.

**Contract**: nowe wejście `working-directory` (domyślnie `"."`); `node-version-file` bez zmian (domyślnie
`.nvmrc` w katalogu głównym); `uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0`
z `cache-dependency-path: <working-directory>/package-lock.json`; `npm ci` w `working-directory`.

#### 2. Composite action `ai-reviewer`

**File**: `.github/actions/ai-reviewer/action.yml` (nowy)

**Intent**: Cała logika review w jednym miejscu: przygotowanie, warunki wstępne bez kosztu, diff, wywołanie
modelu, publikacja i bramka. `review.yml` zostaje czytelny w kilka sekund.

**Contract**:
- Wejścia: `github-token`, `openrouter-api-key`, `review-model`, `pr-number`, `pr-title`, `pr-body`,
  `base-ref`, `daily-cap` (domyślnie `"5"`). Wszystkie trafiają do skryptów przez `env:`.
- Kroki, w tej kolejności:
  1. `./.github/actions/setup-node` z `working-directory: tools/code-reviewer`;
  2. `gh label create --force` dla `ai-cr:passed` (zielona), `ai-cr:failed` (czerwona), `ai-cr:review`;
  3. warunki wstępne: pusty `review-model` → wynik `missing-model`; w przeciwnym razie licznik
     `gh api "repos/$REPO/actions/workflows/review.yml/runs?created=>=<YYYY-MM-DD UTC>&per_page=100"`,
     liczy runy bez bieżącego (`GITHUB_RUN_ID`) i bez `conclusion == "skipped"`, ≥ `daily-cap` → wynik `daily-cap`;
  4. diff (tylko gdy brak wyniku z kroku 3): `git diff "origin/$BASE_REF...HEAD" -- . ':(exclude,glob)**/package-lock.json' ':(exclude)src/db/database.types.ts'`
     do pliku w `$RUNNER_TEMP`; pusty → wynik `empty-diff`;
  5. review (tylko gdy diff niepusty): w `tools/code-reviewer`, `set +e`,
     `npm run --silent review < diff > review.json 2> review.stderr`, zapis kodu wyjścia, wypisanie
     `review.stderr` do logu joba (linia metryk). Env tylko tego kroku: `REVIEW_PROVIDER=openrouter`,
     `REVIEW_MODEL`, `OPENROUTER_API_KEY`, `REVIEW_PR_TITLE`, `REVIEW_PR_BODY`. Wynik: kod 0 → `review`
     (werdykt przez `jq -r .verdict`), 2 → `review` z przekroczonym budżetem, 1 → `error`;
  6. komentarz (`if: always()`): `npm run --silent comment` → plik; wyszukanie komentarza
     `github-actions[bot]` zaczynającego się od `<!-- ai-cr:sticky -->` (`gh api …/issues/<pr>/comments --paginate`),
     PATCH istniejącego albo POST nowego;
  7. etykiety (`if: always()`): `empty-diff` → bez zmian; `review` z `pass` i kodem 0 → `ai-cr:passed`
     i zdjęcie `ai-cr:failed`; każdy inny wynik → `ai-cr:failed` i zdjęcie `ai-cr:passed`; zawsze zdjęcie
     `ai-cr:review`. Zdjęcie nieobecnej etykiety nie może wywrócić kroku;
  8. bramka: wynik inny niż `review`+`pass`+kod 0 oraz `empty-diff` → `::error::<przyczyna>` i `exit 1`.

#### 3. Workflow `review.yml`

**File**: `.github/workflows/review.yml` (nowy)

**Intent**: Cienki workflow: trigger, filtr forków i etykiety, uprawnienia, checkout, wywołanie akcji.

**Contract**:
- `name: AI Code Review`; `on: pull_request` do `master`, `types: [opened, synchronize, reopened, labeled]`.
- `permissions`: `contents: read`, `pull-requests: write`, `issues: write`, `actions: read`.
- Job `review` (`name: AI code review`, `ubuntu-latest`, `timeout-minutes: 10`):
  `if: github.event.pull_request.head.repo.full_name == github.repository && (github.event.action != 'labeled' || github.event.label.name == 'ai-cr:review')`;
  concurrency na poziomie joba `${{ github.workflow }}-${{ github.event.pull_request.number }}` z `cancel-in-progress: true`.
- Kroki: `actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0` z `fetch-depth: 0`;
  `./.github/actions/ai-reviewer` z `github-token: ${{ github.token }}`,
  `openrouter-api-key: ${{ secrets.OPENROUTER_API_KEY }}`, `review-model: ${{ vars.REVIEW_MODEL }}`,
  numerem, tytułem, opisem i `base.ref` PR-a.

### Success Criteria:

#### Automated Verification:

- Formatowanie przechodzi (YAML akcji i workflowu): `npm run format:check`
- Lint, typecheck i testy repo bez zmian: `npm run lint`, `npm run typecheck`, `npm run test`
- Żaden krok `run:` w ai-reviewer/action.yml i review.yml nie zawiera `${{`
- Każde `uses:` zewnętrznej akcji w nowych/zmienionych plikach jest przypięte 40-znakowym SHA

#### Manual Verification:

- Po pushu na `master` cztery wymagane joby „Test & Build Master” są zielone

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual
confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Faza 3: Kontrakt i testowy PR

### Overview

Rejestrujemy nowe nazwy nośne, konfigurujemy repo i sprawdzamy całość na prawdziwym PR-ze, z którego pochodzą
zrzuty do odznaki 10xChampion.

### Changes Required:

#### 1. Rejestr kontraktu

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Nowa sekcja „AI code review” z wpisami w konwencji pliku (Defined / Contract / Breaks).

**Contract**: wpisy dla:
- etykiet `ai-cr:passed` / `ai-cr:failed` / `ai-cr:review` (nazwy w `if:` workflowu i w akcji; zmiana nazwy
  `ai-cr:review` w jednym miejscu wyłącza ponowne review albo odpala płatne runy na każdą etykietę);
- znacznika `<!-- ai-cr:sticky -->` (zmiana bez migracji tworzy drugi komentarz zamiast aktualizacji);
- `vars.REVIEW_MODEL` (brak = czerwony job bez wywołania modelu);
- sekretu `OPENROUTER_API_KEY` w GHA (wspólny z Vercel; rotacja w dwóch miejscach; tylko `env:` kroku review;
  brak sekretu przy PR z forka, stąd pominięcie joba);
- `REVIEW_PR_TITLE` / `REVIEW_PR_BODY` i ogrodzeń `<pr_title>` / `<pr_description>` oraz `MAX_PR_BODY_BYTES`;
- wejścia `working-directory` akcji `setup-node` (domyślne `.`, od którego zależą cztery wymagane joby);
- dziennego limitu (nazwa pliku `review.yml` w zapytaniu API, granica doby UTC, liczenie nie-pominiętych runów,
  możliwe przekroczenie o 1 przy równoległych runach z różnych PR-ów);
- job `AI code review` celowo nie jest wymaganym kontekstem w rulesecie.

#### 2. Konfiguracja repo (ręcznie, właściciel)

**File**: brak (GitHub Settings)

**Intent**: Sekret `OPENROUTER_API_KEY` (klucz aplikacji) i zmienna repo `REVIEW_MODEL` z wybranym id modelu
OpenRoutera. Etykiety tworzy pierwszy run.

**Contract**: Settings → Secrets and variables → Actions; „Workflow permissions” repo nie ogranicza uprawnień
zadeklarowanych w workflow.

#### 3. Testowy PR

**File**: dowolna niewielka zmiana na gałęzi testowej

**Intent**: Sprawdzić ścieżki przy maksymalnie 5 runach w ciągu doby. Kolejność: pierwszy run przed ustawieniem
`REVIEW_MODEL` (bez kosztu), potem właściwe review, push kolejnego commita, ponowne review przez etykietę.

**Contract**: scenariusze w „Manual Testing Steps”.

### Success Criteria:

#### Automated Verification:

- Formatowanie przechodzi po edycji dokumentacji: `npm run format:check`

#### Manual Verification:

- Run bez `vars.REVIEW_MODEL`: czerwony job, komentarz z przyczyną, `ai-cr:failed`, brak wywołania modelu
- Run z modelem: komentarz z ocenami, werdyktem i metrykami; etykieta zgodna z werdyktem; linia metryk w logach; kolor joba zgodny z werdyktem
- Push kolejnego commita aktualizuje ten sam komentarz
- Etykieta `ai-cr:review` uruchamia ponowne review i zostaje zdjęta po runie
- Zrzuty: pipeline, logi joba, komentarz LLM
- Wpisy w `contract-surfaces.md` opisują wszystkie nowe nazwy nośne

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual
confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `buildReviewPrompt`: bez kontekstu identyczny wynik jak dziś; z tytułem i opisem kolejność
  `<pr_title>`, `<pr_description>`, `<diff>`; pusty tytuł lub opis pomija sekcję; `</pr_title>` /
  `</PR_DESCRIPTION>` wewnątrz pól są escapowane (każde ogrodzenie zamyka się dokładnie raz).
- Przycięcie opisu: opis ≤ 4000 B bez zmian; dłuższy przycięty z dopiskiem; opis z polskimi znakami na granicy
  limitu nie zawiera znaku zastępczego `�`.
- `SYSTEM_PROMPT` wymienia `<pr_title>` i `<pr_description>` jako dane.
- `renderComment`: każdy wariant zaczyna się `STICKY_MARKER`; `review` zawiera sześć wierszy ocen, werdykt,
  `summary` i metryki; `budgetExceeded` dodaje dopisek; `error` z metrykami i bez; `empty-diff`,
  `missing-model`, `daily-cap` zawierają przyczynę; lista wykluczeń jest renderowana.
- CLI komentarza: parsowanie ostatniej linii `[review] {…}` ze stderr i linii `failed:`; nieparsowalny stdout przy
  kodzie 0 daje wariant `error`.

### Integration Tests:

- Brak automatycznych (workflow GHA). Pokrywa je testowy PR z fazy 3.

### Manual Testing Steps:

1. Otwórz testowy PR przed ustawieniem `REVIEW_MODEL`: czerwony job, komentarz z przyczyną, etykiety utworzone.
2. Ustaw `REVIEW_MODEL`, dodaj etykietę `ai-cr:review`: pełne review, komentarz zaktualizowany (nie nowy).
3. Wypchnij kolejny commit: ten sam komentarz zaktualizowany, etykieta zgodna z nowym werdyktem.
4. Zrób zrzuty widoku pipeline'u, logów joba i komentarza.

## Performance Considerations

Koszt jednego przebiegu ogranicza diff ≤ 100 kB, opis ≤ 4000 B, `REVIEW_MAX_OUTPUT_TOKENS` 8192 i `MAX_RETRIES = 1`
(wartości domyślne pakietu). Liczbę przebiegów ogranicza dzienny limit 5. Job ma `timeout-minutes: 10`,
a pakiet przerywa wywołanie po 120 s.

## Migration Notes

Brak danych do migracji. Wycofanie: usunięcie `review.yml` i `ai-reviewer`; zmiana `setup-node` jest wstecznie
zgodna i może zostać.

## References

- Wymagania: `context/changes/ci-cd-code-review/requirements.md`
- Research z decyzjami właściciela: `context/changes/ci-cd-code-review/research.md`
- Kontrakt CLI: `tools/code-reviewer/src/index.ts:11-12,42-62`
- Ogrodzenie diffa: `tools/code-reviewer/src/prompts/index.ts:15-20`, `tests/prompts.test.ts:33-55`
- Wspólna akcja: `.github/actions/setup-node/action.yml:13-21`, użycia `.github/workflows/ci-cd.yml:41,69,95,127`
- Wcześniejsza zmiana agenta: `context/changes/tool-loop-agent/plan.md`, `reviews/impl-review.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Pakiet — kontekst PR-a i renderer komentarza

#### Automated

- [x] 1.1 Testy pakietu przechodzą: `cd tools/code-reviewer && npm test` — 6c1abbe
- [x] 1.2 Typecheck pakietu przechodzi: `cd tools/code-reviewer && npm run typecheck` — 6c1abbe
- [x] 1.3 Formatowanie repo przechodzi: `npm run format:check` — 6c1abbe
- [x] 1.4 `git diff -- tools/code-reviewer/src/review-schema.ts` jest pusty (schemat bez zmian) — 6c1abbe

#### Manual

- [x] 1.5 Lokalny przebieg z REVIEW_PR_TITLE/REVIEW_PR_BODY (model lokalny) zwraca poprawny JSON, a podsumowanie odnosi się do opisu — 6c1abbe
- [x] 1.6 Wyrenderowany komentarz dla przykładowego review czytelnie wyświetla się w podglądzie Markdown — 6c1abbe

### Phase 2: CI — `setup-node`, akcja `ai-reviewer`, workflow `review.yml`

#### Automated

- [x] 2.1 Formatowanie przechodzi (YAML akcji i workflowu): `npm run format:check` — da1a4fa
- [x] 2.2 Lint, typecheck i testy repo bez zmian: `npm run lint`, `npm run typecheck`, `npm run test` — da1a4fa
- [x] 2.3 Żaden krok `run:` w ai-reviewer/action.yml i review.yml nie zawiera `${{` — da1a4fa
- [x] 2.4 Każde `uses:` zewnętrznej akcji w nowych/zmienionych plikach jest przypięte 40-znakowym SHA — da1a4fa

#### Manual

- [x] 2.5 Po pushu na `master` cztery wymagane joby „Test & Build Master” są zielone — da1a4fa

### Phase 3: Kontrakt i testowy PR

#### Automated

- [x] 3.1 Formatowanie przechodzi po edycji dokumentacji: `npm run format:check` — 5013bfd

#### Manual

- [x] 3.2 Run bez `vars.REVIEW_MODEL`: czerwony job, komentarz z przyczyną, `ai-cr:failed`, brak wywołania modelu — 5013bfd
- [x] 3.3 Run z modelem: komentarz z ocenami, werdyktem i metrykami; etykieta zgodna z werdyktem; linia metryk w logach; kolor joba zgodny z werdyktem — 5013bfd
- [x] 3.4 Push kolejnego commita aktualizuje ten sam komentarz — 5013bfd
- [x] 3.5 Etykieta `ai-cr:review` uruchamia ponowne review i zostaje zdjęta po runie — 5013bfd
- [x] 3.6 Zrzuty: pipeline, logi joba, komentarz LLM — 5013bfd
- [x] 3.7 Wpisy w `contract-surfaces.md` opisują wszystkie nowe nazwy nośne — 5013bfd
