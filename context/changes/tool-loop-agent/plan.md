# Modularny recenzent kodu na ToolLoopAgent — Implementation Plan

## Overview

`tools/code-reviewer/src/index.ts` robi dziś wszystko w jednym pliku: ładuje `.env`, czyta stdin,
składa instrukcje, liczy koszt, woła `generateText` i drukuje wynik. Zmiana rozbija go na moduły
(prompty, koszt, agent) i przenosi recenzję na `ToolLoopAgent` z AI SDK 7, tak żeby moduł agenta
dało się zaimportować bez efektów ubocznych i wywołać z przyszłych evali promptfoo
(`createReviewer(...).review(diff)` → `{ review, metrics }`). CLI zachowuje kontrakt bajt w bajt.

## Current State Analysis

- `src/index.ts:69-114` — `main()` miesza bootstrap CLI (dotenv `:22`, `readStdin`/`readDiff`
  `:24-36`) z logiką recenzji (`readMaxCost` `:38-46`, `stepCost`/`totalCost`/`costExceeds`
  `:48-68`, wywołanie `generateText` z `output` i `stopWhen` `:77-86`, linia metryk `:90-104`).
- Instrukcje: `provider === "local" ? SYSTEM_PROMPT + renderSchemaFields() : SYSTEM_PROMPT`
  (`src/index.ts`, przed `generateText`). `renderSchemaFields` żyje w `src/schema-prompt.ts`.
- `src/review-schema.ts` trzyma `SYSTEM_PROMPT` obok `REVIEW_SCHEMA`, `REVIEW_JSON_SCHEMA`, `Review`.
- `src/provider.ts` (`selectModel(env)` → `{ provider, modelId, model }`) jest już czysty — zostaje.
- Pakiet nie ma runnera testów; `tsconfig.json` ma `include: ["src"]`; `tsx` jest w devDeps;
  Node 24.13.0 (`node --test` z globami działa natywnie).

## Desired End State

- `src/agent/reviewer.ts` eksportuje `createReviewer(options?)` (zwraca obiekt z `review(diff)`
  oraz `provider`, `modelId`, `agent`) i skrót `review(diff, options?)`; oba zwracają
  `{ review: Review, metrics: ReviewMetrics }`. Import modułu nie ładuje `.env`, nie czyta stdin
  i nic nie wypisuje.
- Prompty w `src/prompts/`, koszt w `src/cost.ts`, `review-schema.ts` bez `SYSTEM_PROMPT`.
- `src/index.ts` = dotenv + diff ze stdin/fallback + `review()` + stdout/stderr + exit code.
- `npm test` (node:test) i `npm run typecheck` przechodzą; ręczny przebieg na obu sample diffach
  daje taki sam kształt stdout i linii `[review]` jak przed zmianą.

### Key Discoveries:

- `ToolLoopAgent` (`node_modules/ai/src/agent/tool-loop-agent.ts`) przyjmuje w konstruktorze
  `model`, `instructions`, `tools`, `output`, `stopWhen`; `generate({ prompt })` zwraca
  `GenerateTextResult`, więc `.output`, `.steps`, `.totalUsage` działają jak dziś.
- Bez `stopWhen` agent domyślnie używa `isStepCount(20)` (`createDefaultStopCondition(20)`), więc
  `MAX_STEPS = 10` trzeba przenieść jawnie.
- `instructions` są ustalane w konstruktorze → decyzja „rubryki tylko dla local” zapada w fabryce,
  na podstawie `provider` z wybranego modelu. Jeden recenzent = jeden dostawca.
- `ai/test` eksportuje `MockLanguageModelV4` — test `review()` bez sieci i bez nowych zależności.

## What We're NOT Doing

- Konfiguracja promptfoo / evali (pliki konfiguracyjne, provider promptfoo, asercje).
- Narzędzia agenta — `tools: {}`; żadnych tools w tej zmianie.
- Zmiany kształtu `REVIEW_SCHEMA` (nazwy pól, wartości `verdict`) ani `src/provider.ts`.
- Nowe zależności, podbijanie wersji, zmiany w root `package.json` / konfiguracji repo.
- Zmiana kluczy, kolejności kluczy ani formatu linii `[review] {...}`; zmiana komunikatu
  o przekroczonym budżecie.
- Streaming (`agent.stream`).

## Implementation Approach

Jedna faza refaktoryzacji (moduły czyste + agent + cienkie CLI razem — decyzja z planowania), potem
faza testów. Moduły zależą w jednym kierunku: `index.ts` → `agent/reviewer.ts` → `prompts/`,
`cost.ts`, `provider.ts`, `review-schema.ts`. Moduł agenta czyta `process.env` tylko wewnątrz
wywołania fabryki (domyślne opcje), nigdy przy imporcie.

## Critical Implementation Details

- **Typ `costExceeds` a `tools: {}`** — dziś `costExceeds` zwraca `StopCondition<ToolSet>`, a agent
  z `tools: {}` oczekuje `StopCondition<{}>` w `stopWhen`. Jeśli typecheck to odrzuci, uczyń
  `costExceeds` generycznym po `TOOLS extends ToolSet` zamiast rzutować.
- **Kolejność kluczy metryk** — `JSON.stringify(metrics)` w CLI musi dać dokładnie dzisiejszą
  kolejność: `provider, model, steps, input_tokens, output_tokens, total_tokens, cost, budget,
  duration_ms`. Obiekt `metrics` buduj w tej kolejności.

## Faza 1: Moduły, agent ToolLoopAgent i cienkie CLI

### Overview

Wydzielenie promptów i kosztu, nowy moduł agenta na `ToolLoopAgent` z fabryką i skrótem `review`,
`index.ts` sprowadzony do warstwy CLI.

### Changes Required:

#### 1. Prompty

**File**: `tools/code-reviewer/src/prompts/system-prompt.ts` (nowy)

**Intent**: Przeniesienie `SYSTEM_PROMPT` z `review-schema.ts` bez zmiany treści.

**Contract**: `export const SYSTEM_PROMPT: string` — tekst identyczny z obecnym.

**File**: `tools/code-reviewer/src/prompts/schema-fields.ts` (przeniesiony z `src/schema-prompt.ts`)

**Intent**: `renderSchemaFields` bez zmian zachowania; tylko nowa lokalizacja i ścieżka importu
`../review-schema.js`. Stary `src/schema-prompt.ts` usunięty.

**Contract**: `export function renderSchemaFields(schema?: typeof REVIEW_JSON_SCHEMA): string` —
wynik identyczny z obecnym.

**File**: `tools/code-reviewer/src/prompts/index.ts` (nowy)

**Intent**: Jedno miejsce składania tekstu dla modelu: instrukcje zależne od dostawcy oraz prompt
użytkownika z diffem (dzisiejszy literał `Oto diff do recenzji:\n\n${diff}`).

**Contract**: `buildInstructions(provider: ProviderName): string` — dla `"local"`
`` `${SYSTEM_PROMPT}\n\n${renderSchemaFields()}` ``, dla pozostałych dokładnie `SYSTEM_PROMPT`;
`buildReviewPrompt(diff: string): string`; re-eksport `SYSTEM_PROMPT` i `renderSchemaFields`.

#### 2. Schemat

**File**: `tools/code-reviewer/src/review-schema.ts`

**Intent**: Plik zostaje kontraktem samego schematu: usunąć `SYSTEM_PROMPT` (i wzmiankę w
komentarzu nagłówkowym, jeśli opisuje prompt), reszta bez zmian.

**Contract**: eksportuje wyłącznie `REVIEW_SCHEMA`, `REVIEW_JSON_SCHEMA`, `Review`; kształt schematu
nienaruszony.

#### 3. Koszt

**File**: `tools/code-reviewer/src/cost.ts` (nowy)

**Intent**: Przeniesienie `stepCost`, `totalCost`, `costExceeds`, `readMaxCost` i
`DEFAULT_MAX_COST_USD` z `index.ts` z zachowaniem semantyki i komentarzy (null = „nieznany”, nie 0;
budżet sprawdzany między krokami; nigdy nie zatrzymuje, gdy dostawca nie raportuje kosztu).

**Contract**: `DEFAULT_MAX_COST_USD = 0.1`; `readMaxCost(env: NodeJS.ProcessEnv): number` (zamiast
czytania `process.env` wprost; ten sam komunikat błędu); `stepCost(step): number | null`;
`totalCost(steps): number | null`; `costExceeds(maxCostUsd)` — `StopCondition` (generyczny po
`TOOLS`, jeśli wymaga tego typecheck — patrz Critical Implementation Details).

#### 4. Agent

**File**: `tools/code-reviewer/src/agent/reviewer.ts` (nowy)

**Intent**: Recenzent oparty na `ToolLoopAgent`, importowalny bez efektów ubocznych, zwracający
werdykt i metryki, żeby promptfoo mogło później czytać oba.

**Contract**:
- `interface ReviewerOptions { env?: NodeJS.ProcessEnv; maxCostUsd?: number; reviewModel?: ReviewModel }`
  — domyślnie `env = process.env`, `reviewModel = selectModel(env)`, `maxCostUsd = readMaxCost(env)`.
- `interface ReviewMetrics { provider; model; steps; input_tokens; output_tokens; total_tokens;
  cost; budget; duration_ms }` — tokeny `number | null`, `cost: number | null`.
- `interface ReviewResult { review: Review; metrics: ReviewMetrics }`.
- `createReviewer(options?: ReviewerOptions)` → `{ provider, modelId, agent, review(diff): Promise<ReviewResult> }`.
  Agent: `new ToolLoopAgent({ model, instructions: buildInstructions(provider), tools: {},
  output: Output.object({ schema: REVIEW_SCHEMA }), stopWhen: [isStepCount(MAX_STEPS), costExceeds(maxCostUsd)] })`
  tworzony raz w fabryce; `review(diff)` woła `agent.generate({ prompt: buildReviewPrompt(diff) })`
  i mierzy czas wokół tego wywołania.
- `review(diff: string, options?: ReviewerOptions): Promise<ReviewResult>` — skrót:
  `createReviewer(options).review(diff)`.
- `MAX_STEPS = 10` przeniesione z `index.ts` z tym samym komentarzem.
- Brak dotenv, stdin, `console.*`, kodu na poziomie modułu poza stałymi. Błędy (konfiguracja,
  brak outputu) propagują do wywołującego.

#### 5. CLI

**File**: `tools/code-reviewer/src/index.ts`

**Intent**: Zostaje tylko warstwa CLI: dotenv (`quiet: true`), diff ze stdin z fallbackiem na
`data/sample.diff` i dotychczasowym komunikatem, `review(diff)`, linia
`` `[review] ${JSON.stringify(metrics)}` `` na stderr, dotychczasowy komunikat o przekroczonym
budżecie (gdy `cost !== null && cost > budget`), JSON recenzji na stdout, `exitCode = 1` w `catch`.

**Contract**: kontrakt CLI bez zmian — wejście, stdout, stderr (te same klucze w tej samej
kolejności), kod wyjścia. Komentarz nagłówkowy pliku zostaje.

### Success Criteria:

#### Automated Verification:

- Typecheck przechodzi: `npm run typecheck` (w `tools/code-reviewer`)
- `src/schema-prompt.ts` nie istnieje, a `SYSTEM_PROMPT` nie jest eksportowany z `src/review-schema.ts`
- Import modułu agenta nic nie wypisuje: `npx tsx -e "import('./src/agent/reviewer.ts')" < /dev/null` daje pusty stdout i stderr oraz kod 0
- Kształt `REVIEW_SCHEMA` bez zmian: `git diff <commit sprzed fazy 1> -- tools/code-reviewer/src/review-schema.ts` pokazuje tylko usunięcie `SYSTEM_PROMPT`

#### Manual Verification:

- `npm run review < /dev/null` (local): stdout to czysty JSON recenzji, na stderr komunikat o fallbacku i jedna linia `[review]` z kluczami w dotychczasowej kolejności, `input_tokens` w okolicach dzisiejszych ~921 dla `sample.diff`
- `npm run review < data/sample-2.diff` działa tak samo (JSON + jedna linia `[review]`)
- `REVIEW_PROVIDER=nope npm run review` kończy się kodem 1 i komunikatem `[review] failed: ...` na stderr

**Implementation Note**: Po zakończeniu fazy i zielonej weryfikacji automatycznej zatrzymaj się na
ręczne potwierdzenie przebiegów CLI (lokalny model jest wolny — ~3–4 min na przebieg).

---

## Faza 2: Testy node:test

### Overview

Testy czystych modułów i recenzenta bez sieci, przez wbudowany `node:test` + `tsx` (już w devDeps).

### Changes Required:

#### 1. Konfiguracja testów

**File**: `tools/code-reviewer/package.json`, `tools/code-reviewer/tsconfig.json`

**Intent**: Skrypt `npm test` uruchamiający `node:test` przez loader `tsx`; katalog `tests/`
objęty typecheckiem.

**Contract**: `"test": "node --import tsx --test \"tests/**/*.test.ts\""`;
`tsconfig.json` `include: ["src", "tests"]`. Bez nowych zależności.

#### 2. Testy kosztu

**File**: `tools/code-reviewer/tests/cost.test.ts` (nowy)

**Intent**: Utrwalenie semantyki „null = nieznany, nie 0” i progu budżetu.

**Contract**: przypadki — `stepCost` bez metadanych → `null`; z `openrouter.usage.cost = 0` → `0`;
`totalCost([])` → `null`; suma tylko kroków z kosztem; `costExceeds` → `false` gdy koszt nieznany,
`false` gdy równy limitowi, `true` gdy powyżej; `readMaxCost` → `0.1` dla braku zmiennej, wartość
liczbowa dla `"0.5"`, wyjątek dla `"0"`, `"-1"`, `"abc"`.

#### 3. Testy promptów

**File**: `tools/code-reviewer/tests/prompts.test.ts` (nowy)

**Intent**: Utrwalenie warunku „rubryki tylko dla local” i generowania ich ze schematu.

**Contract**: `buildInstructions("openrouter") === SYSTEM_PROMPT`; `buildInstructions("local")`
zaczyna się od `SYSTEM_PROMPT` i zawiera `renderSchemaFields()`; `renderSchemaFields()` zawiera
linię dla każdego klucza `REVIEW_JSON_SCHEMA.properties` oraz `"pass" | "fail"`;
`buildReviewPrompt(diff)` zawiera diff.

#### 4. Testy recenzenta

**File**: `tools/code-reviewer/tests/reviewer.test.ts` (nowy)

**Intent**: Sprawdzenie, że moduł agenta jest bez efektów ubocznych i że `review()` zwraca
`{ review, metrics }` w kontrakcie, bez sieci.

**Contract**:
- Import bez efektów ubocznych: proces potomny (`node --import tsx`) importuje
  `src/agent/reviewer.ts` z env bez `REVIEW_*` i z zamkniętym stdin; pusty stdout/stderr, kod 0,
  a po imporcie `process.env.REVIEW_MODEL` nadal `undefined` (dotenv nie załadował `.env`).
- `createReviewer({ reviewModel: { provider: "local", modelId: "mock", model: new MockLanguageModelV4(...) }, maxCostUsd: 0.1 })`
  z mockiem zwracającym poprawny JSON recenzji: `review` przechodzi `REVIEW_SCHEMA.parse`,
  `metrics` ma dokładnie klucze w kolejności z Critical Implementation Details, `steps === 1`,
  `cost === null`, `budget === 0.1`, tokeny z mocka.
- Mock dostaje instrukcje z rubrykami dla `provider: "local"` i bez nich dla `"openrouter"`
  (odczyt promptu z `doGenerateCalls` mocka).
- Skrót `review(diff, options)` zwraca ten sam kształt co metoda.

### Success Criteria:

#### Automated Verification:

- Testy przechodzą: `npm test` (w `tools/code-reviewer`)
- Typecheck obejmuje testy i przechodzi: `npm run typecheck`
- `package.json` nie ma nowych wpisów w `dependencies` / `devDependencies`: `git diff <commit sprzed fazy 2> -- tools/code-reviewer/package.json` pokazuje tylko skrypt `test`

#### Manual Verification:

- Celowe zepsucie warunku w `buildInstructions` (np. rubryki dla każdego dostawcy) czerwieni `tests/prompts.test.ts` i `tests/reviewer.test.ts`

**Implementation Note**: Po zielonej weryfikacji automatycznej potwierdź ręczny test „zepsuj i
sprawdź”, potem przywróć kod.

---

## Testing Strategy

### Unit Tests:

- `cost.ts`: null vs 0, suma, próg `>` (nie `>=`), parsowanie `REVIEW_MAX_COST_USD`.
- `prompts/`: rubryki tylko dla `local`, generowane ze schematu, prompt z diffem.

### Integration Tests:

- `agent/reviewer.ts` z `MockLanguageModelV4`: pełna ścieżka `ToolLoopAgent` → structured output →
  metryki, plus import bez efektów ubocznych w procesie potomnym.

### Manual Testing Steps:

1. `npm run review < /dev/null` na lokalnym modelu — JSON na stdout, jedna linia `[review]`.
2. `npm run review < data/sample-2.diff` — to samo.
3. `REVIEW_PROVIDER=nope npm run review` — kod 1, `[review] failed: ...`.

## Performance Considerations

Brak zmian: jedno wywołanie modelu na recenzję jak dziś; agent tworzony raz na `createReviewer`.

## Migration Notes

Nie dotyczy — pakiet wewnętrzny, jedynym konsumentem jest CLI (`npm run review`).

## References

- `ToolLoopAgent`: `tools/code-reviewer/node_modules/ai/src/agent/tool-loop-agent.ts`,
  `node_modules/ai/src/agent/tool-loop-agent-settings.ts`, `node_modules/ai/docs/03-agents/`
- Mock modelu: `tools/code-reviewer/node_modules/ai/dist/test/index.d.ts` (`MockLanguageModelV4`)
- Obecna implementacja: `tools/code-reviewer/src/index.ts`, `src/schema-prompt.ts`,
  `src/review-schema.ts`, `src/provider.ts`
- Próbki: `tools/code-reviewer/data/sample.diff`, `data/sample-2.diff`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Moduły, agent ToolLoopAgent i cienkie CLI

#### Automated

- [x] 1.1 Typecheck przechodzi: `npm run typecheck` (w `tools/code-reviewer`) — b260e99
- [x] 1.2 `src/schema-prompt.ts` nie istnieje, a `SYSTEM_PROMPT` nie jest eksportowany z `src/review-schema.ts` — b260e99
- [x] 1.3 Import modułu agenta nic nie wypisuje: `npx tsx -e "import('./src/agent/reviewer.ts')" < /dev/null` daje pusty stdout i stderr oraz kod 0 — b260e99
- [x] 1.4 Kształt `REVIEW_SCHEMA` bez zmian: `git diff <commit sprzed fazy 1> -- tools/code-reviewer/src/review-schema.ts` pokazuje tylko usunięcie `SYSTEM_PROMPT` — b260e99

#### Manual

- [x] 1.5 `npm run review < /dev/null` (local): stdout to czysty JSON recenzji, na stderr komunikat o fallbacku i jedna linia `[review]` z kluczami w dotychczasowej kolejności, `input_tokens` w okolicach dzisiejszych ~921 dla `sample.diff` — b260e99
- [x] 1.6 `npm run review < data/sample-2.diff` działa tak samo (JSON + jedna linia `[review]`) — b260e99
- [x] 1.7 `REVIEW_PROVIDER=nope npm run review` kończy się kodem 1 i komunikatem `[review] failed: ...` na stderr — b260e99

### Phase 2: Testy node:test

#### Automated

- [x] 2.1 Testy przechodzą: `npm test` (w `tools/code-reviewer`) — 13b1ceb
- [x] 2.2 Typecheck obejmuje testy i przechodzi: `npm run typecheck` — 13b1ceb
- [x] 2.3 `package.json` nie ma nowych wpisów w `dependencies` / `devDependencies`: `git diff <commit sprzed fazy 2> -- tools/code-reviewer/package.json` pokazuje tylko skrypt `test` — 13b1ceb

#### Manual

- [x] 2.4 Celowe zepsucie warunku w `buildInstructions` (np. rubryki dla każdego dostawcy) czerwieni `tests/prompts.test.ts` i `tests/reviewer.test.ts` — 13b1ceb
