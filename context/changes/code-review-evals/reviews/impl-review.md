<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Evale promptfoo dla recenzenta kodu

- **Plan**: context/changes/code-review-evals/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-11-02
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Automated checks run during the review: `npm test` 123/123 passed, `npm run typecheck` reported 0 errors, `npm run format:check` passed, and `REVIEW_MODEL=x/paid npm run eval:openrouter` gave 3 guard errors in 1 s with no model call. The baseline has results for both providers.

## Findings

### F1 — The `:free` guard checks `env.REVIEW_MODEL`, not the model the call actually uses

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tools/code-reviewer/evals/provider.ts:137
- **Detail**: `assertFreeModel(this.env.REVIEW_MODEL)` validates the env value. `createReviewer` ignores env when it is given `overrides.reviewModel` and takes `reviewModel.modelId` (`src/agent/reviewer.ts:100`). The tests show this: env `vendor/model:free`, model `mock`, and the guard passes. The guard also trims, while `selectModel` sends the untrimmed value (`src/provider.ts:35`). Today promptfoo passes only one constructor argument, so this is not a bypass. Still, the hard cost cap checks a different value from the one that goes to OpenRouter.
- **Fix**: call `getReviewer()` before the check and run `assertFreeModel(reviewer.modelId)`, which `createReviewer` returns (`reviewer.ts:159`). Drop the `trim()`.
- **Decision**: FIXED. The guard now checks `reviewer.modelId` without `trim()`. Added tests: a paid model behind a `:free` `REVIEW_MODEL` is refused, and so is a model id with surrounding spaces. 125/125 tests pass. Side effect: when `OPENROUTER_API_KEY` is missing, the refusal reports the missing key instead of `:free`. With a key (even a dummy one), `REVIEW_MODEL=x/paid` still gives three `:free` errors without a model call.

### F2 — `cost: null` from OpenRouter does not trip the cost alarm

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tools/code-reviewer/evals/provider.ts:177
- **Detail**: With `usage: { include: true }` (`src/provider.ts:45`), OpenRouter reports a cost (0 for `:free` models, as `eval-CWy` confirms). A `null` from OpenRouter therefore means cost accounting broke, and the alarm then fails open. The `:free` guard remains the main protection. The plan deliberately treated `null` as "not reported", but it had llama.cpp in mind.
- **Fix**: for `provider === "openrouter"`, treat `cost === null` as an error on that case. Keep `null` as acceptable only for `local`.
- **Decision**: FIXED (narrowed). On `openrouter`, a completed review with `cost: null` now trips the alarm like a positive cost. A failed call (`ReviewError`) with `null` does not, because the overload errors in `eval-4Ri` arrived exactly as `ReviewError` with `cost: null`, and they should not block the rest of the run. The `EVAL_MAX_CALLS` test now uses a mock with `cost: 0`. Added two tests. Updated the "Evale" section in `docs/reference/contract-surfaces.md`. 127/127 tests pass.

### F3 — The cost alarm relies on `maxConcurrency: 1`

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tools/code-reviewer/evals/provider.ts:154, tools/code-reviewer/evals/promptfooconfig.yaml:30
- **Detail**: The call counter is reserved before the `await`, so it holds under concurrency. The alarm is set only after a call returns, so with `-j 4` the calls already in flight still go out after the first one reports a cost.
- **Fix**: add a comment next to `tripsCostAlarm` stating the dependency on `maxConcurrency: 1`.
- **Decision**: FIXED. Comments added next to `tripsCostAlarm` in `evals/provider.ts` and next to `maxConcurrency` in `evals/promptfooconfig.yaml`. Behavior is unchanged.

### F4 — `dotenv.config` runs on import, so tests load the developer's `.env`

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tools/code-reviewer/evals/provider.ts:14
- **Detail**: `src/agent/reviewer.ts:2-3` deliberately avoids side effects on import (no dotenv). `tests/evals.test.ts` imports the provider, which copies the local `.env` (including `OPENROUTER_API_KEY`) into `process.env` of the test process. No test reads it today, so nothing breaks yet.
- **Fix**: load dotenv lazily in the constructor, only when `overrides.env` is absent.
- **Decision**: FIXED. `dotenv.config` moved into the constructor, after `readProviderName`, and runs only without `overrides.env`. Checked on the real path: without `REVIEW_MODEL` in the shell, the refusal names the model from `.env` (`Qwen…`), not the default. 127/127 tests pass.

### F5 — Duplicated `readEvalMaxCalls` and test helpers

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tools/code-reviewer/evals/provider.ts:21-29, tools/code-reviewer/tests/evals.test.ts:20-45
- **Detail**: `readEvalMaxCalls` repeats the private `readPositiveInteger` from `src/agent/reviewer.ts:29-37`. `REVIEW` and `mockModel` are copied from `tests/reviewer.test.ts`, with a cost parameter added.
- **Fix**: export `readPositiveInteger` from `src/agent/reviewer.ts` and reuse it in the provider. Optionally move the test helpers to `tests/helpers.ts`.
- **Decision**: FIXED (partly). `readPositiveInteger` is now exported from `src/agent/reviewer.ts`, and `readEvalMaxCalls` delegates to it with the same message and default. The test helpers were not moved to `tests/helpers.ts`. 127/127 tests pass.

### F6 — Thresholds in `gradeReview` are not checked against the 1-10 range

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tools/code-reviewer/evals/assertions.ts:48, :58
- **Detail**: Thresholds are checked only for being finite numbers. A typo in the YAML such as `maxScores: { securitySafety: 30 }` always passes, and `minScore: 11` always fails, both silently.
- **Fix**: also require integers within the range of the schema's scores.
- **Decision**: FIXED. `maxScores` and `minScore` must now be integers from 1 to 10, and the reason says so. The range is a `SCORE_RANGE` constant in `evals/assertions.ts`, because `REVIEW_SCHEMA` records it only in field descriptions (plain `z.number()`); a comment points to the schema. Added 4 tests. The current YAML (3, 4, 4) passes validation. 131/131 tests pass.

## Triage summary

- Fixed: F1, F2 (narrowed), F3, F4, F5 (partly), F6
- Skipped: none
