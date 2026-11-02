# Evale promptfoo dla recenzenta kodu — Plan Brief

> Full plan: `context/changes/code-review-evals/plan.md`

## What & Why

Recenzent `tools/code-reviewer` nie ma dziś żadnego pomiaru jakości. Naturalny przypadek testowy to
`data/sample-2.diff` (sekret, IDOR, injection, XSS): powinien dostać `fail`, a lokalny model go nie
złapał. Budujemy evale promptfoo, które powiedzą to liczbowo dla każdego modelu i każdej przyszłej
zmiany promptu.

## Starting Point

`createReviewer()` (`src/agent/reviewer.ts`) jest już importowalny bez efektów ubocznych i zwraca
`{ review, metrics }`. Został przygotowany pod promptfoo w zmianie `tool-loop-agent`. Są dwa diffy
z oczekiwanym `fail` i nie ma żadnego z oczekiwanym `pass`. OpenRouter działa na darmowym planie
z dziennym limitem użyć, który dzieli z CI.

## Desired End State

`npm run eval:local` i `npm run eval:openrouter` puszczają trzy przypadki i pokazują PASS/FAIL
z powodem, werdyktem, ocenami i metrykami. Przebieg OpenRouter nie wyda ani centa i nie przekroczy
`EVAL_MAX_CALLS`. Wynik obecnego promptu na obu providerach jest zapisany w `baseline.md`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Narzędzie | promptfoo CLI + provider TS na `createReviewer` | Evale mierzą dokładnie ten przebieg co CLI i CI. |
| Zestaw danych | sample-2 (fail), sample (fail), nowy sample-clean (pass) | Bez przypadku pass model „zawsze fail” dostałby 100%. |
| Co znaczy „złapał” | `verdict === expected` + próg kluczowej oceny | sample-2: `securitySafety ≤ 3`, sample: `implementationCorrectness ≤ 4`, clean: każda ocena ≥ 4; deterministycznie, bez LLM-sędziego. |
| Macierz modeli | `local` + OpenRouter z `REVIEW_MODEL` | Porównuje to, co działa lokalnie i w CI. Modele wybiera użytkownik. |
| Powtórzenia | 1 domyślnie, `-- --repeat 3` na żądanie | Tani przebieg na co dzień, pass rate wtedy, gdy jest potrzebny. |
| Limit kosztu | 0 USD: OpenRouter tylko `:free`, alarm przy koszcie > 0 | Darmowy plan; blokada działa przed wywołaniem, a nie po rachunku. |
| Limit użyć | `EVAL_MAX_CALLS` = 10 na przebieg, tylko OpenRouter | Chroni dzienny limit klucza, także przed `--repeat`. |
| Zakres | Tylko evale + baseline | Najpierw mierzymy, poprawa promptu to osobna zmiana. |
| Fazy | Dwie (evale, baseline) | Na życzenie: kod i konfiguracja w jednej fazie. |

## Scope

**In scope:**
- `evals/provider.ts` z blokadami, `evals/assertions.ts` (`gradeReview`), `evals/promptfooconfig.yaml`
- `data/sample-clean.diff`, skrypty `eval` / `eval:local` / `eval:openrouter`, `.env.example`
- wpis w `docs/reference/contract-surfaces.md`, testy `tests/evals.test.ts`
- `baseline.md` z przebiegów użytkownika

**Out of scope:**
- poprawa promptu, schematu lub modelu,
- reguła „ocena ≤ 3 → fail” w kodzie,
- LLM-sędzia, regexy na `summary`,
- evale w CI,
- szerszy zestaw danych,
- sumowanie kosztu w USD.

## Architecture / Approach

`promptfoo eval` → `evals/provider.ts` (blokady: `:free`, licznik, alarm kosztu) →
`createReviewer({ env })` → model. Wynik `Review` trafia do `gradeReview`, która porównuje go z
oczekiwaniami przypadku z `vars` (`expectedVerdict`, `maxScores`, `minScore`) i waliduje klucze
względem `REVIEW_SCHEMA`. Diff jest brany z `vars.diff`, bez szablonów. `maxConcurrency: 1`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Evale | Provider, asercja, config, przypadek pass, skrypty, docs, testy | Ładowanie `.ts` z importami `.js` przez promptfoo; plan B to `node --import tsx …/entrypoint.js` |
| 2. Baseline | `baseline.md` z wynikami `local` i `openrouter` | Przebiegi zależą od modeli i limitu użytkownika |

**Prerequisites:** llama-server z modelem użytkownika, `OPENROUTER_API_KEY`, `REVIEW_MODEL=<model>:free`.
**Estimated effort:** ~1-2 sesje. Przebieg lokalny trwa ok. 10 min.

## Open Risks & Assumptions

- Darmowy model OpenRouter może nie mieć sufiksu `:free`. Blokada go wtedy odrzuci, świadomie.
- Licznik liczy review, a retry (`MAX_RETRIES = 1`) może zużyć dwa żądania z dziennego limitu.
- Evale i CI dzielą dzienny limit klucza, a licznik evali nie wie o przebiegach CI.
- Clean diff może dostać niską ocenę za coś, co model uzna za brak. Wtedy baseline to pokaże i
  przypadek trzeba będzie przejrzeć, a nie poluzować próg.

## Success Criteria (Summary)

- Jednym poleceniem widać, który model łapie `sample-2.diff`, a który nie, i dlaczego.
- Żaden przebieg evali nie wywołuje płatnego modelu ani nie przekracza limitu wywołań.
- Każda następna zmiana promptu ma baseline, z którym można ją porównać.
