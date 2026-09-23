<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Diary Entry Store

- **Plan**: context/changes/diary-entry-store/plan.md
- **Scope**: Full plan (3 of 3 phases)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-09-23
- **Verdict**: NEEDS ATTENTION (triaged 2026-09-23 — 7 fixed, 1 recorded, 1 skipped)
- **Findings**: 0 critical, 6 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Verification performed

Every automated criterion in the plan was re-run against the working tree:

| Check | Result |
|---|---|
| `eslint .` | 0 errors |
| `astro check` | 0 errors, 110 files |
| `prettier --check .` | clean |
| `jest` | 2 suites, 23 tests passed |
| `supabase migration list --linked` | `20260922140906` applied remotely; nothing pending |
| Fresh `supabase gen types typescript --linked` vs. committed `src/db/database.types.ts` | **byte-identical** |
| Migration greps (8 policies, RLS on, 4 enum values, both check constraints) | all pass |

The byte-identical regeneration is the strongest evidence in this review: it independently confirms
phase 2 actually landed on the linked project, that the committed types were not hand-edited, and
that phase 3's manual "no column lost" check holds.

RLS was audited directly and is **correct**: all eight policies pin `to anon` / `to authenticated`,
`insert` uses `with check`, and `update` carries both `using` and `with check` — so the
owner-reassignment hole is not present.

## Findings

### F1 — `npm run supabase:gen` cannot run on the project's primary platform

- **Severity**: WARNING
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: package.json:26
- **Detail**: The hardened script ends in `&& mv src/db/database.types.ts.tmp src/db/database.types.ts`.
  `mv` is not a `cmd.exe` builtin, there is no `.npmrc`, and `npm config get script-shell` returns
  `null` — so npm runs scripts through `cmd.exe` on this Windows-primary project. Verified against
  the machine's *persisted* PATH (`[Environment]::GetEnvironmentVariable('Path','Machine'/'User')`):
  only `C:\Program Files\Git\cmd` is present, which ships `git.exe` but **not** `mv.exe` (that lives
  in `C:\Program Files\Git\usr\bin`, which is not on PATH). `where mv` under that PATH exits 1, so
  the script writes the `.tmp` file and dies. The previous script (`... > src/db/database.types.ts`)
  was a pure redirect and worked in `cmd.exe`, so this change introduced the regression, and
  AGENTS.md carries a hard rule pointing at the command ("Run `npm run supabase:gen` after any
  schema change"). Two mitigating facts: the failure is loud and leaves the committed types file
  **intact** — the data-safety goal of the hardening still holds — and it works from Git Bash, which
  is almost certainly how the committed regeneration was produced. Plan criterion 3.2 ("Types
  regenerate without error") is therefore true only outside the project's default shell.
- **Fix A ⭐ Recommended**: Replace `mv` with a portable Node rename inside the same script.
  - Strength: No new dependency and no shell assumption, and it keeps the exit-0 gate the plan designed; `node` is already required to run npm at all.
  - Tradeoff: The script line grows noticeably longer and less readable.
  - Confidence: HIGH — both the failure and the fix were verified on this machine.
  - Blind spot: Does not harden against the CLI exiting 0 with truncated output; only a size or shape sanity check would.
- **Fix B**: Add `.npmrc` with `script-shell=bash` so every script runs under a POSIX shell.
  - Strength: Fixes this and any future POSIX-ism in one place; the repo already leans POSIX.
  - Tradeoff: Makes `bash` a hard prerequisite for every contributor and for CI — a global change to satisfy one script.
  - Confidence: MEDIUM — depends on bash being present on every dev machine, which is not guaranteed.
  - Blind spot: Have not checked whether any existing script relies on `cmd.exe` semantics.
- **Decision**: SKIPPED — conscious decision; the script fails loudly and leaves the committed types file intact, and Git Bash works.

### F2 — RLS check script can commit rows to the shared database on a partial run

- **Severity**: WARNING
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/checks/diary-entries-rls.sql:52-76
- **Detail**: The writes are correctly bracketed by `begin;` (:52) and `rollback;` (:76), and
  `set local` is transaction-scoped, so a *complete* run leaves nothing behind. But the file header
  (:5) instructs the reader to paste the script into the Supabase SQL editor, which executes the
  highlighted selection. Selecting only the `insert into diary_entries ... values ('<uuid-a>'...),
  ('<uuid-b>'...)` block (:56-59) commits two rows. Verified that `.env` and `.env.test` carry an
  identical `SUPABASE_URL` (sha256 of the line matches), so this is the same database that
  development *and* E2E run against.
- **Fix A ⭐ Recommended**: Wrap the whole assertion in a `do $$ ... raise exception ... end $$;` block.
  - Strength: An exception rolls back unconditionally, so the rows become unreachable even under a partial paste — which is exactly the failure mode.
  - Tradeoff: Per-statement `select` output is no longer displayed by the editor; results must be surfaced via `raise notice`.
  - Confidence: MEDIUM — correct Postgres semantics, but it changes how the operator reads the output, which is the script's whole point.
  - Blind spot: Have not run it in the Supabase editor to confirm `raise notice` output is visible there.
- **Fix B**: Tag the seed rows with a marker and end the file with an unconditional `delete from diary_entries where content like 'rls check - %';`.
  - Strength: Keeps the readable per-statement output; the cleanup is one line and is itself re-runnable.
  - Tradeoff: Still relies on the operator reaching the last statement — it narrows the window rather than closing it.
  - Confidence: HIGH — trivially correct, no behavioural change to the assertions.
  - Blind spot: A `delete` in a file pasted against a shared database is itself a new risk surface if the `like` pattern is ever loosened.
- **Decision**: FIXED via Fix B — marker rows plus an unconditional `delete from diary_entries where content like 'rls check - %';` after `rollback;`.

### F3 — Migration comment promises a database guarantee the constraint does not make

- **Severity**: WARNING
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260922140906_create_diary_entries.sql:49-53
- **Detail**: The comment directly above the constraint reads "Każda ścieżka zerująca `calories`
  musi w tej samej instrukcji wyzerować także `estimation_requested_at`". The constraint it
  annotates is `check ((calories is null) = (calorie_origin is null))` — it says nothing about
  `estimation_requested_at`. A row with `calories is null` and `estimation_requested_at` set is
  accepted by the database, which is precisely the state the comment warns about. The overclaim has
  already propagated: `docs/reference/contract-surfaces.md` now states the constraint means "a write
  that sets one without the other is rejected by the database, not by the route". `S-01` and `S-05`
  will read one of these two documents and assume the database is the backstop for the whole rule.
- **Fix A ⭐ Recommended**: Reword the comment, and the contract-surfaces sentence, to state plainly which half the database enforces and which half is a route-level convention.
  - Strength: Documentation-only — no migration and no risk to the applied schema. It fixes the actual defect, which is a false statement rather than a missing guard.
  - Tradeoff: The invariant stays unenforced, so a future write path can still get it wrong.
  - Confidence: HIGH — both files are plain markdown or SQL comments, Prettier-ignored, zero blast radius.
  - Blind spot: None significant.
- **Fix B**: Extend the constraint in a follow-up migration, e.g. `check (calories is not null or estimation_requested_at is null)`.
  - Strength: Makes the documented invariant actually true, and the table is still empty so there is nothing to backfill.
  - Tradeoff: A second migration against the shared hosted database for a foundation already closed out — and as written it forbids the legitimate "estimate requested, not yet arrived" state, which is the exact state the column exists to represent. This predicate is probably wrong.
  - Confidence: LOW — the predicate contradicts the column's stated purpose; getting it right needs the state machine from `S-02`, which does not exist yet.
  - Blind spot: The full set of legal `(calories, calorie_origin, estimation_requested_at)` triples is not enumerated anywhere.
- **Decision**: FIXED via Fix A — migration comment and contract-surfaces entry now state which half the database enforces.

### F4 — RLS isolation assertions print a bare count with no expected value

- **Severity**: WARNING
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/checks/diary-entries-rls.sql:65,69
- **Detail**: `select count(*) as widoczne_dla_a from diary_entries;` with the comment "oczekiwane:
  tylko wiersze A". No number is written down, so the operator cannot tell a passing result from a
  failing one without already knowing each user's row count in a shared database. The script's own
  preamble (:45-50) argues correctly that a check which can pass for the wrong reason proves
  nothing — this assertion has that shape. Compounding it: if `set local role authenticated` (:61)
  is ever run outside a transaction, Postgres emits only `WARNING: SET LOCAL can be used only in
  transaction blocks` and the counts then run as the RLS-bypassing superuser, printing a
  meaningless number that still looks like a result.
- **Fix**: Replace the bare counts with zero-valued assertions, e.g. `select count(*) filter (where user_id <> '<uuid-a>'::uuid) as musi_byc_zero from diary_entries;`, and precede them with `select current_user, (auth.uid())::text;` as a role guard.
- **Decision**: FIXED — self-describing assertions (`musi_byc_zero`, `musi_byc_uuid_a`, `wiersze_a_min_1`) plus a `current_user` role guard.

### F5 — Roadmap still shows F-01 as in-progress after the change closed out

- **Severity**: WARNING
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/roadmap.md:48,92,175
- **Detail**: Commit `2c88ee4` (17:36) flipped F-01 `ready` → `in-progress` one minute *after* the
  epilogue commit `9893770` (17:35) set `change.md` to `status: implemented`. The roadmap now
  contradicts the change record in three places: the At-a-glance table (:48), the Foundations detail
  (:92), and the Backlog Handoff row (:175), which still reads "Ready for `/10x-plan`: yes — Uruchom
  `/10x-plan diary-entry-store`". `S-01` is the next slice and is gated on F-01; whoever picks it up
  reads this table first.
- **Fix**: Set F-01 status to done at :48 and :92, and update the Backlog Handoff row at :175 to point at `S-01` as the next runnable item.
- **Decision**: FIXED — F-01 set to `done` at :48 and :93; Backlog Handoff now hands off to S-01.

### F6 — ESLint gate narrowed by an unplanned config change

- **Severity**: WARNING
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: eslint.config.js:72-76
- **Detail**: Commit `2fc41b4` added `{ ignores: ["src/db/database.types.ts"] }`. The plan names
  `package.json`, `.gitignore`, `src/db/database.types.ts`, `src/types.ts`,
  `docs/reference/contract-surfaces.md` and `AGENTS.md` as phase 3's files — `eslint.config.js` is
  not among them, and no Progress row records it. It was **forced, not chosen**: verified that
  `npx eslint --no-ignore src/db/database.types.ts` reports 8 errors against the genuine CLI output
  (1× `consistent-type-definitions`, 7× `consistent-indexed-object-style`), because the new
  generator emits `export type Database = {` and `[_ in never]: never`. The previously committed
  file said `export interface Database` with semicolons — i.e. it had been hand-normalized at some
  point, against AGENTS.md's "never hand-edit". So the ignore is the correct repair and it mirrors
  the pre-existing `.prettierignore` entry. What is unrecorded is that satisfying the plan's
  "linting passes" gate required *narrowing that gate's scope*; a side effect is that any future
  hand-edit of `database.types.ts` is now unlinted as well as unformatted.
- **Fix**: Record the change in the plan — an addendum or a Progress row under phase 3 — noting why the ignore is mandatory: regenerating `database.types.ts` produces output that violates two `typescript-eslint` stylistic rules.
- **Decision**: FIXED — recorded as phase 3 item 5 (addendum) in plan.md, with the 8 eslint errors as evidence.

### F7 — `source_recipe_id` foreign key can reference another user's recipe

- **Severity**: OBSERVATION
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260922140906_create_diary_entries.sql:38
- **Detail**: `source_recipe_id integer references recipes(id) on delete set null`. Foreign-key
  validation runs as a system operation and bypasses RLS, so an authenticated user can insert a
  diary entry pointing at a recipe owned by someone else: the insert succeeds for an id that exists
  and fails with an FK violation for one that does not. That is a cross-user reference stored in the
  row, plus a global existence oracle over `recipes.id`. Low exploitability — the ids are a dense
  serial sequence and the recipe *content* stays unreadable through `recipes`' own RLS — but the
  reference itself is real, and `S-03` is the slice that will start writing this column.
- **Fix A ⭐ Recommended**: Have `S-03`'s route verify the recipe belongs to `auth.uid()` before writing, and record the requirement now.
  - Strength: No migration against the shared database, and it puts the check where the validated input already lives — matching how this project handles ownership everywhere else.
  - Tradeoff: Enforced by convention rather than by the schema, so a second write path could skip it.
  - Confidence: HIGH — no write path exists yet, so the requirement can be stated before any code depends on it.
  - Blind spot: Nothing in the repo currently reminds an implementer of this; it would need to land in `S-03`'s plan or in lessons.md.
- **Fix B**: Enforce it in the schema — `unique (id, user_id)` on `recipes`, then a composite FK `(source_recipe_id, user_id) references recipes(id, user_id) on delete set null`.
  - Strength: The database becomes the backstop, so no route can get it wrong.
  - Tradeoff: Requires altering `recipes`, which this change's own "What We're NOT Doing" list forbids ("no change to `recipes` — no column, no policy, no data"), and means a second migration on the shared hosted database.
  - Confidence: MEDIUM — the pattern is standard, but it breaks a scope guardrail the plan set deliberately.
  - Blind spot: Have not checked whether a unique index on `recipes(id, user_id)` conflicts with anything in the existing schema.
- **Decision**: FIXED via Fix A — recorded in plan.md Critical Implementation Details as binding on S-03.

### F8 — Nothing ties a recipe-derived origin to a recipe or a portion count

- **Severity**: OBSERVATION
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260922140906_create_diary_entries.sql:38-40
- **Detail**: `diary_entries_value_has_origin` couples `calories` and `calorie_origin`, which is the
  coupling the plan specified. But `calorie_origin = 'recipe_nutrition'` — described in the enum
  comment (:15) as "przeskalowane przez liczbę porcji" — is not tied to `source_recipe_id is not
  null` or `portions is not null`, and `'ai_from_recipe'` (:16) is not tied to `source_recipe_id`.
  A row can therefore claim recipe-derived provenance with neither a recipe nor a portion count, and
  its number can never be re-derived or audited afterwards. The contract-surfaces entry now states
  that a row's provenance "can be read back", which this permits to be false.
- **Fix**: Consider `check (calorie_origin not in ('recipe_nutrition','ai_from_recipe') or source_recipe_id is not null)` in a follow-up migration — cheapest now, while the table is empty and no write path exists.
- **Decision**: RECORDED — noted in plan.md Critical Implementation Details as binding on S-03 and S-04; migration deferred.

### F9 — `supabase/checks/` is a new directory convention with no precedent and no registration

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/checks/diary-entries-rls.sql
- **Detail**: The plan created this directory deliberately ("new directory") and the script inside it
  is good. But AGENTS.md documents only `supabase/migrations/` and `npm run supabase:new-migration`,
  so nothing tells the next author that repeatable RLS proofs live here or that they should be re-run
  after a migration touching the table. The script is also not runnable as committed — `<uuid-a>` and
  `<uuid-b>` are placeholders needing manual substitution (documented at :14-17) — so nothing
  verifies it still passes, and it will quietly rot.
- **Fix**: Add one line to AGENTS.md under the migration rule saying where repeatable RLS proofs live and when to re-run them.
- **Decision**: FIXED — AGENTS.md now registers `supabase/checks/<table>-rls.sql` and when to re-run it.

## Consciously accepted, not raised as findings

- **CI `integration` project ref unresolved.** Phase 2 criterion 2.8 was checked and honestly
  recorded as "not verified" in `plan-brief.md` — GitHub secrets are write-only and `gh` is not
  installed. If `integration` points at a different project it has no `diary_entries`, which breaks
  the first slice that reads it, in CI only. Already documented with two ways to settle it.
- **`updated_at` has no trigger.** Recorded in the plan's Critical Implementation Details as
  inherited drift from `recipes`; every diary update path must set it by hand.
- **No `tests/integration/` RLS test.** Declined explicitly in "What We're NOT Doing" with reasoning.
- **`entry_date` is unbounded**, and `amount_text varchar(100)` omits the doubled `char_length`
  check that `preferences.value` carries. The exemplar is itself inconsistent on the latter
  (`recipes.title varchar(255)` has no doubled check) and `varchar(100)` already enforces the bound.
