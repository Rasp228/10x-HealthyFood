<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: AI code review w CI/CD (`ci-cd-code-review`)

- **Plan**: context/changes/ci-cd-code-review/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-11-02
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Reviewed commits: `6c1abbe` (p1), `da1a4fa` (p2), `5013bfd` (p3), against the plan as landed at `a7862dc`. Later commits of `code-review-evals` (`a204a73`, `34f9ab4`) touch the same package but break no contract of this plan.

Automated checks run during the review (at HEAD `2a9b88e`):

- `tools/code-reviewer`: `npm test` 131/131 passed, `npm run typecheck` 0 errors.
- Repo: `npm run format:check` passed, `npm run lint` exit 0, `npm run typecheck` 0 errors, `npm run test` 825/825 passed (38 suites).
- `git diff 6c1abbe^ HEAD -- tools/code-reviewer/src/review-schema.ts` is empty.
- `${{` appears only in `env:` / `with:` / `concurrency:`, never in `run:` text.
- External `uses:` are pinned by 40-character SHA (`actions/setup-node@49933ea…` v4.4.0, `actions/checkout@11d5960…` v4.4.0).

Manual items 1.5–1.6, 2.5 and 3.2–3.7 are all `[x]`. Evidence for 3.6 is in `screenshots/` (pipeline, job log, LLM comment), and for 3.7 in the "AI code review" section of `docs/reference/contract-surfaces.md`. Plan drift: every Contract bullet of phases 1–3 matches. "What We're NOT Doing" was respected: `ci-cd.yml`, `.github/rulesets/` and `review-schema.ts` are untouched.

## Findings

### F1 — A cancelled run overwrites the sticky comment and the labels

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/actions/ai-reviewer/action.yml:166,200,230
- **Detail**: The steps "Komentarz w PR-ze", "Etykiety PR-a" and "Bramka AI code review" use `if: always()`, which also runs on cancellation. `review.yml:27` sets `cancel-in-progress: true`, so a push made while a review is running cancels the old run. That run then posts the `error` comment ("code unknown"), sets `ai-cr:failed` and removes `ai-cr:review` until the new run overwrites them. The cancelled run also counts toward the daily cap (see F6).
- **Fix**: Change the three steps to `if: ${{ !cancelled() }}`.
- **Decision**: FIXED. `action.yml:166,200,230` now use `if: ${{ !cancelled() }}`; prettier passes. The plan (`plan.md:80,235,238`) still says `if: always()`; phase blocks are read-only, so this report is the record of the change.

### F2 — The model's `summary` reaches the PR comment as raw Markdown, with no length limit

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: tools/code-reviewer/src/comment/render.ts:83
- **Detail**: `review.summary` goes straight into the comment posted by `github-actions[bot]`. The PR author steers the model through the diff, title and description, so the summary can contain `@user` / `@org/team` mentions (pings sent from the bot), images that call external URLs, `<details>`, or a fake "✅ pass" heading. `REVIEW_SCHEMA` sets no maximum length for `summary`, and a comment over 65,536 characters makes the POST/PATCH (`action.yml:192/195`) end in 422, so no comment appears at all. The gate itself is unaffected. Error messages are already capped (`MAX_ERROR_MESSAGE_CHARS`) and fenced in a code block; the summary is not.
- **Fix A ⭐ Recommended**: Neutralise the summary in `render.ts`: break `@` mentions (e.g. `@` → `@​`), escape `<` and `![`, cap the length (e.g. 4000 characters with a "(przycięte)" note), and add a test to `comment.test.ts`.
  - Strength: The fix lives in one pure function that is already tested, with no change to the schema contract.
  - Tradeoff: The summary loses intentional formatting (inline HTML).
  - Confidence: HIGH — `render.ts` already does the same for error messages.
  - Blind spot: How GitHub renders `@​` was not checked.
- **Fix B**: Add `.max(…)` for `summary` in `REVIEW_SCHEMA`, and do the mention/HTML escaping in the renderer.
  - Strength: The model learns the limit from the schema.
  - Tradeoff: A schema change is a contract change (CLAUDE.md: schema first, then prompts, gates and evals). Evals and the rubric for the local model would need updating.
  - Confidence: MED — a too-long summary turns into an `error` run instead of a trimmed comment.
  - Blind spot: How free models behave with a length limit in structured output.
- **Decision**: FIXED (Fix A).
  - `render.ts` has a new `sanitizeSummary`. It inserts a zero-width space after `@` before a name, after `<` before a letter, `/`, `!` or `?`, and between `!` and `[`, then caps the summary at `MAX_SUMMARY_CHARS = 4000` with a note.
  - Two tests were added to `comment.test.ts`. Tests: 34/34; tsc and prettier pass. Break-check: without the sanitization both new tests go red.
  - Not verified: how GitHub renders `@​`.

### F3 — The fence escape does not catch whitespace variants of closing tags

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tools/code-reviewer/src/prompts/index.ts:28
- **Detail**: `new RegExp(\`</${tag}>\`, "gi")` catches only the exact form. `</diff >`, `</ diff>`, `</pr_description\n>` pass through unchanged, and the model may read them as closing the fence. This applies to the diff, the title and the description. Upstream note: the `</diff>` escape predates this change, but this change extended it to two new fences from untrusted input.
- **Fix**: Change the pattern to `<\s*/\s*${tag}\s*>` (flags `gi`), keep the `<\/tag>` replacement, and add whitespace-variant cases to `tests/prompts.test.ts`.
- **Decision**: FIXED.
  - `escapeClosingTag` now matches `<\s*/\s*tag\s*>`.
  - The test "escapes closing tags with whitespace inside them as well" was added to `prompts.test.ts`. Tests: 20/20, tsc and prettier pass.
  - Break-check: with the old regex the new test goes red.

### F4 — The API key and GH_TOKEN are available to code from the PR under review

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/actions/ai-reviewer/action.yml:123-139,165-181; docs/reference/contract-surfaces.md (`OPENROUTER_API_KEY`)
- **Detail**: `npm run review` (with `OPENROUTER_API_KEY`) and `npm run comment` (with `GH_TOKEN` that can write issues/PRs) run `tools/code-reviewer` from the PR checkout, and the action itself comes from `./.github/actions/ai-reviewer` of the same checkout. A same-repo PR can change this code and read the key. Fork PRs are skipped, so the trust boundary is "write access to the repo". contract-surfaces.md says only "the key never goes into `run:` text, into another step's `env:`", which suggests more protection than there is.
- **Fix**: Add a sentence to contract-surfaces.md under `OPENROUTER_API_KEY` saying that write access to the repo means access to the key. Optionally render the comment in a step without `GH_TOKEN` and post it in a separate one.
- **Decision**: FIXED. Under `OPENROUTER_API_KEY` in `contract-surfaces.md` (Contract) there is now a statement that write access to the repository means access to the key and to `GH_TOKEN`. The optional split of the comment step was not done.

### F5 — Misleading error messages for setup failures and invalid model output

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/actions/ai-reviewer/action.yml:146-150,177,244-252
- **Detail**: (a) When "Warunki wstępne" or "Diff PR-a" fails, `AI_CR_OUTCOME` is empty and the comment step falls back to `error` ("review exited with code unknown without a message"). That message points at the model step, which never ran. The gate (`*` branch) names the cause correctly. (b) With exit 0/2 and stdout that does not parse, the action records `review` + `fail`. The comment correctly shows `error`, but the gate's `::error::` says "verdict fail" or "budget exceeded". The job is red in both cases; only the description is wrong.
- **Fix**: For (a) pass a separate outcome (e.g. `setup-failed`) when it is empty, with its own comment variant. For (b) set `outcome=error` when `jq` does not return `pass|fail`.
- **Decision**: FIXED.
  - (a) The comment step falls back to `AI_CR_OUTCOME=setup-failed`, which has a new `setup-failed` variant in `render.ts`, `outcome.ts` and `cli.ts`: "❌ błąd przygotowania", model not called.
  - (b) The review step sets `outcome=review` only for verdict `pass|fail`; otherwise it sets `error`, so the gate gives "Review zakończone błędem (kod wyjścia N)".
  - Tests: 135/135, tsc and prettier pass, and there is no `${{` in `run:`. Break-check: without the `setup-failed` case in `outcome.ts`, the test goes red.
  - The bash in `action.yml` was not run locally (no shellcheck or runner); a test PR will check it.

### F6 — The daily cap counts cancelled runs and runs still in progress

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/actions/ai-reviewer/action.yml:89-92
- **Detail**: The filter drops only `conclusion == "skipped"`. Runs with `conclusion: null` (queued or in progress, including ones the `if:` will later skip) and cancelled runs (F1) are counted. Frequent pushes during a review plus adding other labels can exhaust the cap of 5 without 5 model calls. This errs toward less spending, which the plan accepts ("świadomie zaokrągla w stronę mniejszych wydatków"), but contract-surfaces.md mentions only skipped runs.
- **Fix**: Add the counting of in-progress and cancelled runs to contract-surfaces.md under "Daily run cap" (or additionally drop `cancelled`).
- **Decision**: FIXED (documentation). The "Daily run cap" Contract in `contract-surfaces.md` now covers the counting of cancelled runs (`cancel-in-progress`) and of queued or in-progress runs (`conclusion: null`), deliberately erring toward less spending. The query is unchanged.

### F7 — Benign additions outside the plan

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: tools/code-reviewer/src/comment/outcome.ts; src/prompts/index.ts:31-35; src/comment/render.ts:12,22; action.yml:75,81-84,174,206
- **Detail**: Things the plan did not name:
  - The parsing logic was moved from `cli.ts` into `outcome.ts` (behaviour as planned, easier to test).
  - The title and description escape all three closing tags, not only their own.
  - Error messages are capped at 2000 characters, with a code-block fence that adapts to backticks.
  - `metrics: null` in the `review` variant.
  - `review-model` made only of whitespace is treated as missing.
  - `daily-cap` and `pr-number` are validated.
  - There is an extra `AI_CR_VERDICT` variable.

  Everything is stricter than the plan, and the fences are documented in contract-surfaces.md.
- **Fix**: None needed. Optionally add one line to the plan as an addendum about `outcome.ts`.
- **Decision**: ACCEPTED. The additions stay; this report is the record (plan phase blocks are read-only).
