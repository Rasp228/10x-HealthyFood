# Modularny recenzent kodu na ToolLoopAgent — Plan Brief

> Full plan: `context/changes/tool-loop-agent/plan.md`

## What & Why

`tools/code-reviewer/src/index.ts` w jednym pliku łączy bootstrap CLI i logikę recenzji, więc nie da
się go wywołać z innego kodu. Rozbijamy go na moduły i przenosimy recenzję na `ToolLoopAgent` z AI
SDK 7, żeby przyszłe evale promptfoo mogły importować recenzenta i czytać zarówno werdykt, jak i koszt.

## Starting Point

Działające CLI (`git diff | npm run review`) na `generateText` z `Output.object(REVIEW_SCHEMA)`,
budżetem (`costExceeds`) i linią metryk `[review] {...}` na stderr. `provider.ts` (wybór modelu) i
`schema-prompt.ts` (rubryki dla local) już istnieją jako osobne moduły.

## Desired End State

`src/agent/reviewer.ts` eksportuje `createReviewer(options?)` i `review(diff, options?)`, zwracające
`{ review, metrics }`; import modułu nie ma efektów ubocznych. Prompty żyją w `src/prompts/`, koszt w
`src/cost.ts`, a `index.ts` jest cienkim CLI o niezmienionym kontrakcie. `npm test` chroni semantykę
kosztu, warunek „rubryki tylko dla local” i kształt metryk.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego |
| --- | --- | --- |
| Wejścia fabryki | `createReviewer({ env?, maxCostUsd?, reviewModel? })`, domyślnie z `process.env` | CLI woła bez argumentów, eval nadpisuje model/budżet per test bez ruszania `process.env` |
| Eksport `review` | Metoda obiektu z fabryki + skrót `review(diff, options?)` | Wielokrotne użycie agenta w evalach i jednolinijkowe wywołanie |
| Testy | `node:test` + `tsx` (bez nowych zależności), mock `MockLanguageModelV4` z `ai/test` | Utrwala kontrakt przed evalami, bez sieci i modelu |
| Fazy | 2: refaktoryzacja razem z agentem, potem testy | Prośba o mniejszą granulację |
| Rubryki | Wybór instrukcji w fabryce wg `provider` | `instructions` ToolLoopAgent są ustalane w konstruktorze |
| `output` / `stopWhen` | W konstruktorze agenta, `tools: {}`, `MAX_STEPS = 10` jawnie | Wymóg z polecenia; domyślny limit agenta to 20 kroków |
| Metryki | Te same klucze snake_case i kolejność co dziś linia `[review]` | Jeden kształt dla CLI i evali |

## Scope

**In scope:**
- `src/prompts/` (system prompt, rubryki, `buildInstructions`, `buildReviewPrompt`)
- `src/cost.ts`, `src/agent/reviewer.ts`, odchudzony `src/index.ts`
- `review-schema.ts` bez `SYSTEM_PROMPT`; usunięcie `src/schema-prompt.ts`
- `tests/` + skrypt `npm test` + `tests` w `tsconfig.include`

**Out of scope:**
- Konfiguracja promptfoo/evali, narzędzia agenta, streaming
- Zmiany `REVIEW_SCHEMA`, `provider.ts`, zależności, formatu linii `[review]`

## Architecture / Approach

`index.ts` (dotenv, stdin, druk) → `agent/reviewer.ts` (`ToolLoopAgent` tworzony raz w fabryce) →
`prompts/`, `cost.ts`, `provider.ts`, `review-schema.ts`. Moduł agenta czyta env tylko wewnątrz
wywołania fabryki, nigdy przy imporcie.

## Phases at a Glance

| Faza | Co dostarcza | Główne ryzyko |
| --- | --- | --- |
| 1. Moduły, agent ToolLoopAgent i cienkie CLI | Recenzent importowalny + CLI o tym samym kontrakcie | Typ `StopCondition` przy `tools: {}`; kolejność kluczy metryk |
| 2. Testy node:test | `npm test`: koszt, prompty, recenzent na mocku, import bez efektów | API `MockLanguageModelV4` w `ai@7` może wymagać dopasowania kształtu odpowiedzi |

**Prerequisites:** Node 24 (`.nvmrc`), zainstalowane `node_modules` w `tools/code-reviewer`, dostępny lokalny llama-server do przebiegów ręcznych.
**Estimated effort:** ~1 sesja (2 fazy); przebiegi ręczne na lokalnym modelu to ~3–4 min każdy.

## Open Risks & Assumptions

- `costExceeds` może wymagać uogólnienia typu po `TOOLS`, żeby pasować do `ToolLoopAgent<…, {}>`.
- Zakładamy, że `agent.generate` przy `output` rzuca, gdy brak poprawnego obiektu — CLI zachowuje
  wtedy kod 1 jak dziś.

## Success Criteria (Summary)

- `createReviewer().review(diff)` zwraca `{ review, metrics }` i da się go zaimportować bez efektów ubocznych.
- `npm run review` zachowuje się jak dziś: JSON na stdout, jedna linia `[review]` z tymi samymi kluczami, kod 1 przy błędzie.
- `npm run typecheck` i `npm test` są zielone bez nowych zależności.
