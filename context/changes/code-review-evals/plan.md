# Evale promptfoo dla recenzenta kodu — Implementation Plan

## Overview

Recenzent `tools/code-reviewer` nie ma dziś żadnego pomiaru jakości. Wiemy tylko z ręcznych
przebiegów, że lokalny model nie łapie `data/sample-2.diff`, choć ten diff powinien dostać `fail`.
Ta zmiana dodaje evale promptfoo. Każdy przypadek to diff z oczekiwanym werdyktem i progami ocen.
Evale idą na dwóch providerach: lokalnym llama.cpp i darmowym modelu OpenRouter. Mają twardą blokadę
kosztu 0 USD i limit wywołań na przebieg. Zmiana kończy się zapisanym baseline obecnego promptu.
Nie poprawiamy recenzenta, tylko go mierzymy.

## Current State Analysis

- `src/agent/reviewer.ts:98` — `createReviewer({ env, maxCostUsd, maxDiffBytes, maxOutputTokens,
  timeoutMs, reviewModel })` nie ma efektów ubocznych i zwraca `{ review(diff, context?) }` →
  `{ review: Review, metrics: ReviewMetrics }`. Błąd po wywołaniu modelu to `ReviewError` z
  `metrics` (`:76-86`). Zmiana `tool-loop-agent` przygotowała go wprost pod promptfoo
  (`context/changes/tool-loop-agent/plan.md:8`).
- `src/review-schema.ts:9-54` — kontrakt: sześć ocen 1-10, `verdict` `pass`/`fail` i `summary`.
  Zgodnie z CLAUDE.md zmiana kryteriów idzie najpierw do schematu, potem do promptów, bramek i evali.
- `src/provider.ts:12-16,33-35` — `REVIEW_PROVIDER` (`local` | `openrouter`) i `REVIEW_MODEL`.
  Domyślny model OpenRouter to płatny `anthropic/claude-sonnet-5.5`.
- `src/cost.ts:33-41` — `metrics.cost` to koszt zgłoszony przez OpenRouter. `null` oznacza, że
  provider kosztu nie zgłasza (llama.cpp), a nie zero.
- `src/agent/reviewer.ts:21` — `MAX_RETRIES = 1`: jedno review może wysłać dwa żądania HTTP.
- Dane: `data/sample-2.diff` (zaszyty klucz service-role logowany w `console.log`, endpoint w
  `PUBLIC_PATHS` z `userId` z query, wstrzyknięcie do filtra `.or()`, odbite XSS, `details: error`,
  klient Supabase tworzony w trasie) oraz `data/sample.diff` (pętla `<=` wychodzi poza tablicę,
  `calories` może być `null`, usunięto `Math.max`). Oba powinny dostać `fail`. Nie ma przypadku,
  który powinien dostać `pass`.
- Testy pakietu: `node --import tsx --test "tests/**/*.test.ts"`, mock `MockLanguageModelV4` z
  `ai/test` (`tests/reviewer.test.ts`). `tsconfig.json` ma `include: ["src", "tests"]`.
- Root `npm run format:check` (`prettier --check .`) obejmuje `tools/code-reviewer/**`.
  `.prettierignore` wyklucza tylko `package-lock.json` i generowane katalogi. Root ESLint i
  `astro check` pakiet pomijają (`eslint.config.js:123`, `tsconfig.json:4`).
- promptfoo `0.125.1` (Node ≥ 22.22.0; `.nvmrc` 24.13.0) ma `tsx` w swoich zależnościach i ładuje
  providery `file://….ts` w Node.

## Desired End State

- `npm run eval:local` w `tools/code-reviewer` puszcza trzy przypadki przez lokalny model. W
  raporcie promptfoo każdy przypadek ma PASS/FAIL z powodem, a obok werdykt, oceny, tokeny i czas.
- `npm run eval:openrouter` robi to samo na darmowym modelu z `REVIEW_MODEL`. Model bez sufiksu
  `:free` albo pusty `REVIEW_MODEL` daje błąd przypadku bez żadnego wywołania modelu. Po
  `EVAL_MAX_CALLS` (domyślnie 10) wywołaniach kolejne przypadki dostają błąd. Pierwsze wywołanie
  ze zgłoszonym kosztem > 0 kończy się błędem i blokuje resztę przebiegu.
- `npm run eval:local -- --repeat 3` daje pass rate na przypadek.
- `context/changes/code-review-evals/baseline.md` zawiera wyniki obu providerów na obecnym prompcie.

### Key Discoveries:

- Fabryka przyjmuje `env` i `reviewModel`, więc provider promptfoo wybiera backend bez ruszania
  `process.env`, a testy wstrzykują mock (`src/agent/reviewer.ts:47-54,98-100`).
- `metrics.cost` jest `null` dla llama.cpp (`src/cost.ts:32-41`): blokada „koszt > 0” działa tylko
  wtedy, gdy liczba jest zgłoszona, a `null` nie jest naruszeniem.
- Pojedyncze review może kosztować dwa żądania z dziennego limitu (retry, `reviewer.ts:21`).
  CI zużywa ten sam klucz z dziennym limitem 5 przebiegów (`.github/actions/ai-reviewer/action.yml`,
  „Daily run cap”).

## What We're NOT Doing

- Poprawa `SYSTEM_PROMPT`, schematu albo modelu, żeby lokalny model łapał `sample-2.diff`. To
  osobna zmiana mierzona tymi evalami.
- Deterministyczna reguła w kodzie („ocena ≤ 3 wymusza fail”). Zmieniałaby kontrakt werdyktu.
- Dobór, podmiana i ustawianie modeli. Konfiguracja czyta `REVIEW_MODEL`, a model wybiera użytkownik.
- LLM-sędzia (`llm-rubric`) i regexy na `summary`. Asercje są w całości deterministyczne.
- Evale w CI i bramka na ich wyniku.
- Szerszy zestaw danych (celowane diffy na pojedyncze klasy błędów).
- Sumowanie kosztu w USD na przebieg. Limit to 0 USD egzekwowany blokadą `:free` i alarmem kosztu.

## Implementation Approach

CLI promptfoo z konfiguracją YAML i własnym providerem w TS na `createReviewer`. Recenzent zostaje
jedynym kodem, który rozmawia z modelem, a evale mierzą dokładnie ten sam przebieg co CLI i CI.
Provider bierze diff ze zmiennej `diff`, a nie z wyrenderowanego promptu, więc treść diffu nie
przechodzi przez szablony nunjucks. Oczekiwania przypadku są danymi w `vars`. Jedna czysta funkcja
`gradeReview` sprawdza każdy przypadek, więc jej logikę testuje `node:test` bez modelu. Blokady
kosztu są w providerze i działają przed wywołaniem: walidacja nazwy modelu i rezerwacja slotu
w liczniku. Alarm kosztu działa po wywołaniu.

## Critical Implementation Details

- **Kolejność blokad w `callApi`.** Najpierw sprawdzić flagę alarmu kosztu i nazwę modelu, potem
  zarezerwować slot w liczniku (inkrementacja przed `await`), a dopiero potem wołać model. Licznik
  rezerwowany po wywołaniu nie chroni przed równoległymi przypadkami, a nieudane wywołanie też
  zużywa dzienny limit. Reviewer tworzyć leniwie przy pierwszym `callApi`, nie w konstruktorze:
  przebieg z `--filter-providers local` nie może się wywrócić na braku `OPENROUTER_API_KEY`.
- **Ładowanie `.env`.** Provider ładuje `tools/code-reviewer/.env` tak jak `src/index.ts:26`
  (`quiet: true`), bo promptfoo czyta `.env` z bieżącego katalogu, a nie z katalogu pakietu.

## Faza 1: Evale

### Overview

Wszystko, co potrzebne do uruchomienia evali: zależność, provider z blokadami, funkcja oceniająca,
konfiguracja z trzema przypadkami, nowy diff „czysty pass”, skrypty, dokumentacja i testy jednostkowe.
Żadne wywołanie płatnego modelu nie jest potrzebne do zielonej weryfikacji automatycznej.

### Changes Required:

#### 1. Zależność i konfiguracja TS

**File**: `tools/code-reviewer/package.json`, `tools/code-reviewer/package-lock.json`,
`tools/code-reviewer/tsconfig.json`

**Intent**: Dodać `promptfoo` do devDependencies i włączyć katalog `evals` do type-checka.

**Contract**: `promptfoo` `^0.125.1` w `devDependencies` (`^` na `0.x` przypina minor).
`tsconfig.json` → `include: ["src", "tests", "evals"]`. Instalacja przez `npm install` w
`tools/code-reviewer` (bez `npm audit fix`, zgodnie z `context/foundation/lessons.md`).

#### 2. Provider promptfoo

**File**: `tools/code-reviewer/evals/provider.ts`

**Intent**: Adapter promptfoo → `createReviewer`. Uruchamia jedno review na przypadek, oddaje
recenzję i metryki w kształcie `ProviderResponse` i egzekwuje limit 0 USD oraz dzienny limit
wywołań dla OpenRouter.

**Contract**:
- Domyślny eksport: klasa providera z `id()` i `callApi(prompt, context)`. Konstruktor przyjmuje
  `options` od promptfoo (`options.config.provider`: `"local"` | `"openrouter"`, `options.label`).
  Opcjonalny drugi argument przyjmuje `reviewModel` do testów.
- Diff to `context.vars.diff`, a gdy go brak, `prompt`. Recenzent dostaje
  `env: { ...process.env, REVIEW_PROVIDER: config.provider }`.
- Sukces → `{ output: Review, tokenUsage: { prompt, completion, total }, cost?, metadata: { metrics } }`.
  `cost` tylko wtedy, gdy `metrics.cost !== null`. `ReviewError` → `{ error, metadata: { metrics } }`.
  Każdy inny wyjątek → `{ error }`. Provider nie rzuca z `callApi`.
- Blokady (tylko `openrouter`; `local` nie ma limitów):
  - `REVIEW_MODEL` pusty albo bez sufiksu `:free` → `{ error }` z nazwą modelu, bez wywołania
    (bez płatnego modelu domyślnego).
  - `EVAL_MAX_CALLS` (dodatnia liczba całkowita, domyślnie 10; zła wartość → `{ error }`) to
    licznik na moduł, wspólny dla wszystkich instancji w procesie. Po wyczerpaniu → `{ error }`
    z informacją o limicie. Licznik liczy review, nie żądania HTTP.
  - `metrics.cost > 0` → bieżący przypadek zwraca `{ error }` z kwotą (recenzja w `metadata`),
    a flaga modułu sprawia, że każde kolejne wywołanie `openrouter` w przebiegu dostaje `{ error }`.
- Czyste helpery (`assertFreeModel`, licznik z `reserve()`, odczyt `EVAL_MAX_CALLS`) są
  eksportowane i testowane osobno. Pomocnicze funkcje do resetu stanu modułu służą wyłącznie testom.
- Typy promptfoo bierzemy z paczki, jeśli je eksportuje (`ProviderResponse`, `CallApiContextParams`
  itp.). Jeśli nie, lokalne minimalne interfejsy. Nigdy `declare module "promptfoo"` (AGENTS.md).

#### 3. Funkcja oceniająca

**File**: `tools/code-reviewer/evals/assertions.ts`

**Intent**: Jedna deterministyczna asercja dla każdego przypadku. Werdykt jest warunkiem
koniecznym, progi ocen pilnują, żeby trafiony werdykt nie był przypadkowy.

**Contract**:
- Eksport nazwany `gradeReview(output, context)` → `{ pass, score, reason }` (`GradingResult`).
  Podpięty w YAML jako `file://assertions.ts:gradeReview`.
- `output` może być obiektem albo stringiem JSON. Waliduje go `REVIEW_SCHEMA.safeParse`, a gdy
  to się nie uda → `pass: false` z powodem.
- Oczekiwania z `context.vars`:
  - `expectedVerdict` (`pass` | `fail`, wymagane),
  - `maxScores` (mapa kryterium → maksimum; każda wymieniona ocena musi być ≤ progu),
  - `minScore` (każda z sześciu ocen musi być ≥ progu).
- Nazwy kryteriów to klucze `REVIEW_SCHEMA.shape` bez `verdict` i `summary`. Nieznany klucz w
  `maxScores` albo brak `expectedVerdict` → `pass: false` z powodem (wykrywa rozjazd YAML-a ze
  schematem po zmianie kontraktu).
- `reason` wymienia każdy niespełniony warunek z wartością faktyczną i oczekiwaną. `score` to
  udział spełnionych warunków (0-1).

#### 4. Diff „czysty pass”

**File**: `tools/code-reviewer/data/sample-clean.diff`

**Intent**: Przypadek, który powinien przejść, żeby model zawsze mówiący „fail” nie dostał 100%.
Poprawna wersja zmiany z `sample.diff`: ten sam obszar (`src/lib/utils/calories.ts`), ale bez
błędów, z testem Jest i krótkim komentarzem „dlaczego”, zgodnie z konwencjami z AGENTS.md.

**Contract**: Prawidłowy unified diff (`diff --git` + hunki), ~30-60 linii, bez nowej powierzchni
ataku i bez sekretów. Zawiera plik testu Jest w `tests/unit/` lub obok źródła. Bez importu z
`vitest`. Plik nie jest aplikowany do repozytorium aplikacji, to tylko dane wejściowe evali.

#### 5. Konfiguracja promptfoo

**File**: `tools/code-reviewer/evals/promptfooconfig.yaml`

**Intent**: Macierz dwóch providerów × trzech przypadków z jedną wspólną asercją.

**Contract**:
- `prompts: ["{{diff}}"]`.
- `providers`: dwa wpisy `id: file://provider.ts` z `label: local` / `label: openrouter` i
  `config.provider` o tej samej wartości.
- `defaultTest.assert`: `javascript` → `file://assertions.ts:gradeReview`.
- `evaluateOptions.maxConcurrency: 1`.
- `tests` (ścieżki względem katalogu configu):

  | description | `diff` | `expectedVerdict` | dodatkowo |
  | --- | --- | --- | --- |
  | sample-2: sekret, IDOR, injection, XSS | `file://../data/sample-2.diff` | `fail` | `maxScores: { securitySafety: 3 }` |
  | sample: off-by-one, null, usunięty clamp | `file://../data/sample.diff` | `fail` | `maxScores: { implementationCorrectness: 4 }` |
  | sample-clean: poprawna zmiana z testem | `file://../data/sample-clean.diff` | `pass` | `minScore: 4` |

#### 6. Skrypty npm i `.env.example`

**File**: `tools/code-reviewer/package.json`, `tools/code-reviewer/.env.example`

**Intent**: Jedno polecenie na przebieg per provider, powtórzenia na żądanie, udokumentowany limit.

**Contract**:
- `eval`: `promptfoo eval -c evals/promptfooconfig.yaml --no-cache`.
- `eval:local` / `eval:openrouter`: to samo z `--filter-providers local` / `openrouter`.
- Powtórzenia: `npm run eval:local -- --repeat 3` (bez osobnego skryptu).
- `.env.example`: `EVAL_MAX_CALLS=` z komentarzem (domyślnie 10; dotyczy tylko `openrouter`;
  wspólny dzienny limit klucza z CI) oraz uwaga przy `REVIEW_MODEL`, że evale OpenRouter wymagają
  modelu `:free`.

#### 7. Rejestr kontraktów

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Evale wpisują nazwy pól schematu do YAML-a i dzielą dzienny limit z CI. To nazwy
nośne, których rename nie wywraca się w miejscu zmiany.

**Contract**: Nowa podsekcja w „AI code review”, np. „Evale — `evals/promptfooconfig.yaml`,
`gradeReview`, `EVAL_MAX_CALLS`”, w formacie Defined / Contract / Breaks:
- klucze `maxScores` i `expectedVerdict` muszą odpowiadać `REVIEW_SCHEMA` (`gradeReview` daje
  wtedy czerwony wynik zamiast cichego pominięcia),
- blokada `:free`,
- licznik liczy review, a nie żądania (retry),
- wspólny dzienny limit klucza OpenRouter z „Daily run cap” w CI.

#### 8. Testy jednostkowe

**File**: `tools/code-reviewer/tests/evals.test.ts`

**Intent**: Utrwalić logikę oceny i blokad bez sieci i bez modelu.

**Contract**: `node:test`, styl jak w `tests/reviewer.test.ts`, provider na `MockLanguageModelV4`
przez drugi argument konstruktora. Przypadki wymienione w Testing Strategy.

### Success Criteria:

#### Automated Verification:

- Testy pakietu przechodzą: `npm test` w `tools/code-reviewer`
- Typy pakietu bez błędów: `npm run typecheck` w `tools/code-reviewer`
- Format repo zielony: `npm run format:check` w katalogu głównym
- Konfiguracja się ładuje i provider odmawia bez wywołania modelu: `REVIEW_MODEL=x/paid npm run eval:openrouter` daje trzy przypadki z błędem o braku `:free` i zero wywołań modelu
- Przebieg lokalny bez działającego llama-server kończy się błędami połączenia per przypadek, a nie awarią ładowania providera ani konfiguracji: `npm run eval:local`

#### Manual Verification:

- `npm run eval:local` z uruchomionym llama-server daje tabelę promptfoo z 3 przypadkami, powodami z `gradeReview` i metrykami w `metadata`
- `npx promptfoo view` pokazuje ostatni przebieg z czytelnymi powodami PASS/FAIL

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na potwierdzenie
ręcznego przebiegu lokalnego przez użytkownika, zanim przejdziesz do baseline.

---

## Faza 2: Baseline

### Overview

Pomiar obecnego promptu na modelach użytkownika i zapis wyniku, od którego będzie liczona każda
następna zmiana promptu lub modelu. Przebiegi na modelach należą do użytkownika. Agent nie zmienia
`REVIEW_MODEL`, nie dobiera modeli i nie poprawia konfiguracji modelu, żeby wynik był zielony.

### Changes Required:

#### 1. Zapis baseline

**File**: `context/changes/code-review-evals/baseline.md`

**Intent**: Wyniki pierwszego przebiegu obu providerów na obecnym `SYSTEM_PROMPT`, łącznie z
potwierdzeniem (albo zaprzeczeniem) obserwacji, że lokalny model nie łapie `sample-2.diff`.

**Contract**: Data, commit, provider i model (dla `local` model uruchomiony w llama-server, wg
użytkownika), polecenie. Tabela przypadek × provider: werdykt, sześć ocen, PASS/FAIL `gradeReview`
z powodem, tokeny, czas. Dla OpenRouter dodatkowo liczba wywołań i zgłoszony koszt (oczekiwane 0).
Jeśli użytkownik puścił `--repeat`, to także pass rate. Na końcu krótkie wnioski: co dokładnie
lokalny model przepuścił w `sample-2`.

### Success Criteria:

#### Automated Verification:

- `context/changes/code-review-evals/baseline.md` istnieje i zawiera wyniki dla `local` i `openrouter` dla wszystkich trzech przypadków

#### Manual Verification:

- Użytkownik uruchomił `npm run eval:local` na swoim modelu lokalnym i wyniki są w baseline
- Użytkownik uruchomił `npm run eval:openrouter` na swoim modelu `:free`, przebieg zmieścił się w `EVAL_MAX_CALLS` i zgłoszony koszt to 0
- Baseline potwierdza albo obala obserwację, że lokalny model nie łapie `sample-2.diff`

---

## Testing Strategy

### Unit Tests:

- `gradeReview`:
  - `fail` oczekiwany + `fail` z `securitySafety: 2` → pass,
  - `fail` z `securitySafety: 6` → fail z powodem,
  - `pass` oczekiwany, ale werdykt `fail` → fail,
  - `pass` z jedną oceną 3 przy `minScore: 4` → fail,
  - output jako string JSON → działa,
  - output spoza schematu → fail,
  - nieznany klucz w `maxScores` → fail,
  - brak `expectedVerdict` → fail.
- Provider:
  - `openrouter` z modelem bez `:free` i z pustym `REVIEW_MODEL` → `error`, mock nie wywołany,
  - `EVAL_MAX_CALLS=2` → trzecie wywołanie `error`, mock wywołany dwa razy,
  - zła wartość `EVAL_MAX_CALLS` → `error`,
  - mock zgłaszający `providerMetadata.openrouter.usage.cost > 0` → bieżące `error`, następne
    `error` bez wywołania,
  - `local` ignoruje limit i `:free`,
  - sukces mapuje `output`, `tokenUsage` i `metadata.metrics`,
  - `cost` pominięty przy `null`,
  - `ReviewError` → `error` z `metadata.metrics`,
  - diff brany z `context.vars.diff`.

### Integration Tests:

- `npm run eval:openrouter` z modelem płatnym kończy się błędami blokady bez sieci (kryterium
  automatyczne Fazy 1).

### Manual Testing Steps:

1. Uruchom llama-server ze swoim modelem, potem `npm run eval:local` i przejrzyj powody w tabeli.
2. Ustaw `REVIEW_MODEL=<model>:free` i `OPENROUTER_API_KEY`, potem `npm run eval:openrouter`.
3. Opcjonalnie `npm run eval:local -- --repeat 3` dla pass rate.

## Performance Considerations

Lokalne review trwa 155-240 s (`src/agent/reviewer.ts:22`), a `maxConcurrency: 1` jest celowe
(jeden slot llama-server), więc przebieg lokalny to ok. 10 min, a z `--repeat 3` ok. 30 min.
Timeout recenzenta (600 s lokalnie) ogranicza pojedynczy przypadek.

## References

- Recenzent: `tools/code-reviewer/src/agent/reviewer.ts:98-160`
- Kontrakt: `tools/code-reviewer/src/review-schema.ts`
- Koszt: `tools/code-reviewer/src/cost.ts:33-41`
- Styl testów: `tools/code-reviewer/tests/reviewer.test.ts`
- Wcześniejsze decyzje: `context/changes/tool-loop-agent/plan.md`, `context/changes/ci-cd-code-review/requirements.md` („Na później”)
- promptfoo custom provider: https://www.promptfoo.dev/docs/providers/custom-api/

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Evale

#### Automated

- [x] 1.1 Testy pakietu przechodzą: `npm test` w `tools/code-reviewer`
- [x] 1.2 Typy pakietu bez błędów: `npm run typecheck` w `tools/code-reviewer`
- [x] 1.3 Format repo zielony: `npm run format:check` w katalogu głównym
- [x] 1.4 Konfiguracja się ładuje i provider odmawia bez wywołania modelu: `REVIEW_MODEL=x/paid npm run eval:openrouter` daje trzy przypadki z błędem o braku `:free` i zero wywołań modelu
- [x] 1.5 Przebieg lokalny bez działającego llama-server kończy się błędami połączenia per przypadek, a nie awarią ładowania providera ani konfiguracji: `npm run eval:local`

#### Manual

- [x] 1.6 `npm run eval:local` z uruchomionym llama-server daje tabelę promptfoo z 3 przypadkami, powodami z `gradeReview` i metrykami w `metadata`
- [x] 1.7 `npx promptfoo view` pokazuje ostatni przebieg z czytelnymi powodami PASS/FAIL

### Phase 2: Baseline

#### Automated

- [ ] 2.1 `context/changes/code-review-evals/baseline.md` istnieje i zawiera wyniki dla `local` i `openrouter` dla wszystkich trzech przypadków

#### Manual

- [ ] 2.2 Użytkownik uruchomił `npm run eval:local` na swoim modelu lokalnym i wyniki są w baseline
- [ ] 2.3 Użytkownik uruchomił `npm run eval:openrouter` na swoim modelu `:free`, przebieg zmieścił się w `EVAL_MAX_CALLS` i zgłoszony koszt to 0
- [ ] 2.4 Baseline potwierdza albo obala obserwację, że lokalny model nie łapie `sample-2.diff`
