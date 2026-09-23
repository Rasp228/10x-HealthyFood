<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Diary Entry Store

- **Plan**: context/changes/diary-entry-store/plan.md
- **Scope**: Full plan (3 of 3 phases)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-09-23
- **Verdict**: NEEDS ATTENTION (triaged 2026-09-23 — 5 fixed, 1 recorded as a rule)
- **Findings**: 0 critical, 3 warnings, 3 observations
- **Post-triage gates**: `eslint` 0 errors · `astro check` 0 errors · `prettier --check` clean · `jest` 23/23
- **Outstanding action**: re-run `supabase/checks/diary-entries-rls.sql` against the linked project and re-stamp Progress 2.4/2.5 (see F2's residual)

> Second review of this change. The first (same date, verdict NEEDS ATTENTION, 9 findings) was
> triaged and its fixes landed in `dee2aa6`; that report is superseded by this file and remains
> retrievable at `git show dee2aa6:context/changes/diary-entry-store/reviews/impl-review.md`.
> Every one of its nine decisions was re-verified here — see "Prior review: fixes re-verified".

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Verification performed

Every automated criterion in the plan was re-run against the working tree at `dee2aa6`:

| Check | Result |
|---|---|
| `eslint .` | 0 errors, 0 warnings |
| `astro check` | 110 files, 0 errors, 0 warnings, 29 hints |
| `prettier --check .` | clean |
| `jest` | 2 suites, 23 tests passed |
| `supabase migration list --linked` | `20260922140906` applied remotely; nothing pending |
| Fresh `supabase gen types typescript --linked` vs. committed `src/db/database.types.ts` | **byte-identical** |
| Migration greps (8 policies, RLS on, 4 enum values, `diary_entries_value_has_origin`) | all pass |
| `grep diary_entries` in contract-surfaces.md / AGENTS.md | present in both |

The byte-identical regeneration is again the strongest single piece of evidence: it independently
confirms phase 2 landed on the linked project, that the committed types are genuine CLI output and
were not hand-edited, and that phase 3's manual "no column lost" check holds.

**Plan adherence is clean.** Every pinned DDL line, every type export, both npm scripts, the
`.gitignore` entry, the ESLint ignore and both registry entries match the plan's stated contract
column-for-column. **Scope discipline against "What We're NOT Doing" is clean** in code: no service,
no Zod schema, no route, no page, no component, no `tests/integration/`, no macronutrient column, no
change to `recipes` / `preferences` / `logs`.

**RLS was audited independently of the prior review and is correct.** All eight policies pin a role
(`to anon` x4, `to authenticated` x4); `insert` uses `with check` only; both `update` policies carry
**both** `using` and `with check`, so the `user_id`-reassignment hole is not present; `auth.uid()` is
on the correct side throughout.

## Findings

### F1 — Cleanup `delete` bypasses RLS and is not scoped to the two seeded users

- **Severity**: WARNING
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/checks/diary-entries-rls.sql:98 (and the header at :19-20)
- **Detail**: The prior review's F2 fix added `delete from diary_entries where content like 'rls
  check - %';` after `rollback;`. The migration uses `enable row level security`, **not** `force row
  level security` (`20260922140906_create_diary_entries.sql:69`), so the table-owning role the
  Supabase SQL editor runs as is exempt from every policy. The statement therefore reaches **every
  user's rows**, not only the two it seeded. The pattern is prefix-anchored (no leading `%`), which
  limits it, but `content` is free user text and nothing narrows by `user_id` or `entry_date`. The
  prior review named this exact risk as Fix B's blind spot and then shipped it unmitigated.
  Compounding it, the file header at :19-20 still asserts "Skrypt nie wstawia, nie zmienia ani nie
  **usuwa** niczego poza tabelą diary_entries, a **wszystkie zapisy dzieją się w transakcji
  zakończonej rollbackiem**" — now false, since :98 is an unconditional committed `delete` outside
  any transaction. That is the same overclaiming-comment defect class F3 was raised for, reintroduced
  by its sibling fix in the same commit.
- **Fix**: Scope the delete to the seeded subjects and make its blast radius visible —
  `delete from diary_entries where user_id in ('<uuid-a>'::uuid, '<uuid-b>'::uuid) and content like 'rls check - %' returning id, user_id, content;`
  — and amend the header at :19-20 to say the file ends with a committed cleanup delete.
  - Strength: Removes the cross-user reach entirely and the `returning` gives the operator proof that a full run deleted 0 rows; one statement plus two comment lines, no behavioural change to the assertions.
  - Tradeoff: None material — the placeholders are already substituted by hand at run time, so the uuids are in scope.
  - Confidence: HIGH — `enable` vs `force` RLS verified in the migration; the delete's text verified in place.
  - Blind spot: None significant.
- **Decision**: FIXED — delete scoped to `user_id in ('<uuid-a>','<uuid-b>')` with `returning id, user_id, content` and an inline note on `enable` vs `force` RLS; header rewritten to state that section 3 is a committed delete outside the transaction.

### F2 — The committed check script has never been run; phase 2's RLS evidence predates it

- **Severity**: WARNING
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: supabase/checks/diary-entries-rls.sql
- **Detail**: Progress items 2.4 and 2.5 ("Verification script lists exactly eight policies" / "Each
  impersonated subject sees only its own row, and the assertion is confirmed capable of failing") are
  stamped `9627ff3`, committed 2026-09-22. The script was then rewritten by `dee2aa6` on 2026-09-23
  10:28 — the F2 and F4 fixes changed the seed rows, the assertion shape and added the cleanup
  statement. So the artifact that satisfied the criteria is not the artifact in the tree, and the
  committed one has never been executed against a database.
  There is a concrete reason to think it will not behave as written: the Supabase SQL editor renders
  the result of the **last** statement in a multi-statement run, and the script's value lives in six
  separate result-producing statements (`:31` policy listing, `:37` rowsecurity, `:65` role guard,
  `:69-73` and `:77-81` isolation counters). On a whole-file run the last statement is the `delete` at
  `:98`, so the self-describing assertions F4 was written to add are likely invisible — which pushes
  the operator toward running selected fragments, the exact behaviour F2's cleanup exists to guard
  against. The two applied fixes work against each other. (This last part is inferred from the
  multi-statement contract, not observed against the hosted editor.)
- **Fix A ⭐ Recommended**: Re-run the committed script once against the linked project, substituting the two uuids, and re-stamp 2.4/2.5 with what was actually observed — including whether the assertions display.
  - Strength: Settles the output-visibility question by observation rather than inference, and restores the criteria to describing the artifact that ships. It is the cheapest way to learn whether F4's fix actually delivers anything.
  - Tradeoff: Runs a script containing an unscoped `delete` against the shared dev/E2E database — so F1 should be applied first.
  - Confidence: HIGH — the staleness is established from git history; the run is the only thing that can confirm the rest.
  - Blind spot: Requires a live session against the hosted project, which this review cannot perform.
- **Fix B**: Restructure the output so one run shows everything — fold the assertions into a single `union all` result set, or wrap them in `do $$ … raise notice … end $$;` (the Fix A the prior review declined).
  - Strength: Makes a whole-file run the natural way to use the script, which closes F2's original partial-paste hazard at the source instead of mitigating it.
  - Tradeoff: A second rewrite of a script that has now been rewritten once without being re-run; `raise notice` visibility in the Supabase editor is itself unverified.
  - Confidence: MEDIUM — the restructuring is straightforward, but it would again ship an unexecuted script unless Fix A follows it.
  - Blind spot: Have not confirmed how the Supabase editor surfaces `raise notice` output.
- **Decision**: FIXED via Fix B — the whole isolation assertion is now a single atomic `do` block ending in `raise exception using message = format(...)`, which prints a `[PASS]`/`[FAIL]` line plus every measured value beside its required value. An exception is always rendered by the editor (unlike `raise notice`, the unverified blind spot above) and forces an unconditional rollback of the seeded rows; a `do` block also cannot be half-pasted, which closes the original partial-run hazard at its source rather than mitigating it. The policy-name and `relrowsecurity` checks were folded into the same block so one run reports everything. The scoped cleanup `delete` from F1 moved ahead of the block, so it sweeps leftovers from any earlier aborted run while the assertion output stays last. Section 1's raw `pg_policies` listing remains as read-only detail — the only fragment now worth running alone, and it writes nothing.
  **Residual, deliberately left open**: Fix A was not taken, so the script still has not been executed. Its syntax and `format()` arity were checked by reading, not by running — there is no local Postgres in this project. Progress items 2.4/2.5 therefore still describe an artifact older than the one in the tree. Re-running it against the linked project is the outstanding action.

### F3 — `supabase:gen` promotes an empty file if the CLI exits 0 with no output

- **Severity**: WARNING
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: package.json:26
- **Detail**: `supabase gen types typescript --linked > src/db/database.types.ts.tmp && mv
  src/db/database.types.ts.tmp src/db/database.types.ts`. The `&&` guard covers a non-zero exit only.
  If the CLI exits 0 having written nothing or a truncated stream, the empty `.tmp` is promoted over
  the committed types and the file is destroyed with no error — the failure then surfaces as `astro
  check` reporting hundreds of errors far from the cause, against a file the project forbids
  hand-editing. The plan's stated purpose for hardening this script was "stop a failed generation
  from destroying the committed types file" (plan.md:365), so this is that hardening being half-done
  rather than a new idea. The prior review named it as F1 Fix A's blind spot, but F1 was skipped in
  full, so it was never addressed. The `.gitignore` entry for the `.tmp` file is correct and does its
  job.
- **Fix**: Gate the promotion on a shape check — insert `grep -q "export type Database" src/db/database.types.ts.tmp &&` between the two halves of the script.
  - Strength: Closes the only failure mode the `&&` misses, using a check the regenerated file provably satisfies (the byte-identical output verified in this review contains `export type Database = {`).
  - Tradeoff: Adds a third POSIX-ism to a script that already carries `mv`, so it compounds the skipped F1 rather than fixing it.
  - Confidence: HIGH — both the gap and the sentinel string were verified against the actual generated output.
  - Blind spot: Does not detect output that is well-formed but describes the wrong project.
- **Decision**: FIXED — `supabase:gen` now reads `… > …tmp && grep -q 'export type Database' …tmp && mv …tmp …ts`. Verified both halves of the gate: the sentinel is present in the committed types, and empty input fails the grep. Note this adds a third POSIX-ism to the script, so it compounds the consciously skipped F1 (`mv` is unavailable under `cmd.exe` on this machine) — the script remains Git-Bash-only.

### F4 — No index on `source_recipe_id`; deleting a recipe scans all of `diary_entries`

- **Severity**: OBSERVATION
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: supabase/migrations/20260922140906_create_diary_entries.sql:38,63
- **Detail**: `source_recipe_id integer references recipes(id) on delete set null`, with
  `idx_diary_entries_user_date on diary_entries(user_id, entry_date)` as the table's only index.
  Postgres does not auto-index the referencing side of a foreign key, so every `delete from recipes`
  — an existing, user-reachable operation via `RecipeService.deleteRecipe` — must scan all of
  `diary_entries` to null the column out, holding a row lock while it does. Harmless at 3–4 users,
  real as the diary grows, and cheapest to add while the table is still empty. The exemplar schema
  has no cross-table foreign key, so it offers no precedent either way; the plan's Performance
  Considerations section reasoned only about the module's own read shape and did not consider the
  inbound delete path.
- **Fix A ⭐ Recommended**: Record it as binding on the first slice that needs it, the way F7 and F8 were recorded, and leave the schema alone.
  - Strength: Respects this change's deliberate "one migration, applied once" shape and its closed-out status; the cost is provably zero at current volume, and an index is additive whenever it is added.
  - Tradeoff: The cheapest moment to add it (empty table, migration not yet followed by others) passes unused.
  - Confidence: HIGH — the volume argument is solid and the plan already uses "record as binding on a later slice" as its idiom for exactly this.
  - Blind spot: Nothing forces a later slice to act on a Critical Implementation Details note.
- **Fix B**: Add `create index idx_diary_entries_source_recipe on diary_entries(source_recipe_id);` in a follow-up migration now.
  - Strength: Settles it while the table is empty, so the index builds instantly and no future delete path can be surprised.
  - Tradeoff: A second migration against the shared hosted database for a change already closed out — and the plan's Migration Notes treat a second migration as the recovery path, not routine.
  - Confidence: HIGH — standard, additive, and safe on an empty table.
  - Blind spot: Not checked whether S-03 will want a different index shape once it queries this column.
- **Decision**: FIXED via Fix A — recorded in plan.md Critical Implementation Details as binding on S-03, with the suggested `create index idx_diary_entries_source_recipe` and explicit licence for S-03 to choose a partial index instead. Schema left untouched; no second migration.

### F5 — AGENTS.md promises per-table RLS proofs that exist for one table out of four

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: AGENTS.md:61-65
- **Detail**: The F9 fix added "Re-runnable proofs that those policies actually isolate users live in
  `supabase/checks/<table>-rls.sql` — **run the one for a table after any migration touching it**."
  `supabase/checks/` contains exactly one file, `diary-entries-rls.sql`; there is no
  `preferences-rls.sql`, `recipes-rls.sql` or `logs-rls.sql`. The instruction is therefore
  unfollowable for three of the four tables AGENTS.md lists two lines earlier, and an agent told to
  run "the one for a table" will go looking for a file that was never written.
- **Fix**: Reword to name the gap and the obligation — "…live in `supabase/checks/<table>-rls.sql` (so far only `diary-entries-rls.sql`); write one alongside any new table and re-run it after a migration touching that table."
- **Decision**: FIXED — AGENTS.md now names the gap ("so far only `diary-entries-rls.sql`") and the obligation to write one alongside any new table. The same bullet was also brought into line with F2's rewrite: it now tells the reader to run the whole file and read the verdict from the deliberate `[PASS]`/`[FAIL]` exception.

### F6 — Toolkit marker-block syncs keep riding along inside change commits

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: CLAUDE.md (commit dee2aa6); also commit 2c88ee4
- **Detail**: `dee2aa6`, titled `fix(diary-entry-store): apply implementation review findings`, also
  carries 60 lines of `CLAUDE.md` change, entirely inside the `<!-- BEGIN @przeprogramowani/10x-cli -->`
  marker block — a toolkit sync from "Module 2, Lesson 2" to "Module 2, Lesson 3". The content is
  benign and the project-owned section below the markers is untouched, but it has no relationship to
  the diary store. This is the second occurrence: `2c88ee4`, message `"doc"`, did the Lesson 1 →
  Lesson 2 sync **and** flipped the roadmap's F-01 status in one commit, with a message that also
  violates AGENTS.md's Conventional-Commits-with-a-scope rule. Two in a row makes it a pattern rather
  than an accident, and it means a reviewer reading `git log` for this change sees toolkit churn
  mixed into the change's own history.
- **Fix**: Give toolkit marker-block syncs their own commit (e.g. `chore(toolkit): sync 10x-cli block`) and keep change commits to the change — recorded as a recurring rule via `/10x-lesson` rather than as a one-off note.
- **Decision**: ACCEPTED-AS-RULE: "Toolkit marker-block syncs belong in their own commit" — appended to `context/foundation/lessons.md`. The finding itself stays unfixed by choice: splitting `dee2aa6` would mean rewriting published history on master, and the rule governs future commits either way.

## Prior review: fixes re-verified

All nine decisions from the first review were checked against the tree, not taken on trust.

| # | Decision | Holds? |
|---|---|---|
| F1 `supabase:gen` / `mv` under `cmd.exe` | SKIPPED | Script unchanged, consistent with the decision. The separate zero-exit gap is raised fresh as F3 above. |
| F2 check script could commit rows | FIXED via Fix B | Marker rows and cleanup present — but introduces F1 and F2 above. |
| F3 comment overclaimed a DB guarantee | FIXED via Fix A | **Correct.** Migration :49-53 and contract-surfaces :71-75 both now state exactly what the constraint does and which half is route-level. |
| F4 bare counts with no expected value | FIXED | **Correct**, and slightly better than prescribed — `current_user` guard split out, `auth.uid()` folded into each assertion row. Visibility caveat is F2 above. |
| F5 roadmap contradicted change.md | FIXED | **Correct.** F-01 `done` at :48 and :93; Backlog Handoff hands off to S-01. All three contradictions closed. |
| F6 unrecorded ESLint gate narrowing | FIXED | Recorded as plan.md phase 3 item 5 with the 8-error evidence. Entry is a standalone `{ ignores: [...] }` placed after `includeIgnoreFile` — the correct flat-config shape. |
| F7 `source_recipe_id` cross-user reference | FIXED via Fix A | **Correct.** plan.md Critical Implementation Details records it as binding on S-03. |
| F8 recipe-derived origin untied | RECORDED | **Correct.** plan.md records it as binding on S-03 and S-04. |
| F9 `supabase/checks/` unregistered | FIXED | Registered in AGENTS.md — but the wording now overclaims; see F5 above. |

## Consciously accepted, not raised as findings

- **`docs/reference/contract-surfaces.md:85-86`, "a row's provenance can no longer be read back."**
  Re-read in context, this clause is scoped to the consequence of *renaming or reordering an enum
  value*, not an unconditional guarantee about every row — a weaker overclaim than it looks, and F8
  was consciously deferred with the substance recorded in plan.md. Not worth re-litigating.
- **No Progress row for the phase 3 ESLint addendum.** F6's accepted fix text offered "an addendum
  **or** a Progress row"; the addendum landed. Settled.
- **CI `integration` project ref unresolved.** Criterion 2.8 was checked and honestly recorded as
  "not verified" in plan-brief.md, with two ways to settle it later. Not rubber-stamping.
- **`updated_at` has no trigger**; **no `tests/integration/` RLS test**; **`entry_date` unbounded**;
  **`amount_text` without a doubled `char_length` check**. All accepted in the prior review with
  reasoning that still holds.
- **`context/foundation/roadmap.md` frontmatter still reads `updated: 2026-09-22`** although the F5
  fix landed 2026-09-23. Cosmetic.
