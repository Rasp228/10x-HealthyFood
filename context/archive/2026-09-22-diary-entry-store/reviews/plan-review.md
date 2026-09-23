<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Diary Entry Store Implementation Plan

- **Plan**: `context/changes/diary-entry-store/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-22
- **Verdict**: REVISE → SOUND (all 7 findings fixed in the plan)
- **Findings**: 2 critical, 4 warnings, 1 observation

## Verdicts

| Dimension             | Verdict (at review) | After fixes |
| --------------------- | ------------------- | ----------- |
| End-State Alignment   | FAIL                | PASS        |
| Lean Execution        | PASS                | PASS        |
| Architectural Fitness | WARNING             | PASS        |
| Blind Spots           | FAIL                | PASS        |
| Plan Completeness     | WARNING             | PASS        |

## Grounding

9/9 paths verified (including `supabase/checks/` and `tests/integration/`, both correctly reported
absent), 6/6 symbols verified, brief↔plan consistent, Progress contract clean (1 heading, 3/3 phases
matched, 21/21 steps mapped — 27/27 after fixes, no stray checkboxes). Every line-number citation in
the plan checked out exactly: schema `:30-61`/`:68-74`/`:81-83`/`:90-193`, `types.ts`
`:8-14`/`:31-40`/`:89,92`, `recipes/[id].ts:116`. The four enum values map 1:1 onto the PRD's four
named value origins, closing the roadmap's stated top risk for F-01.

## Findings

### F1 — Cross-user isolation cannot be proven by the planned check

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment
- **Location**: Desired End State; Phase 2 criteria 2.3/2.4; Manual Testing 1–2
- **Detail**: The headline guarantee was "proven by a cross-user query returning zero rows", but only
  one Supabase user exists (`.env.test` carries a single `E2E_USERNAME_ID`;
  `tests/e2e/config/test-data.ts:7` requires exactly that triple) and "What We're NOT Doing"
  explicitly declined a second. Worse, the Supabase SQL editor runs as a superuser role that bypasses
  RLS entirely, so the planned query returns zero rows whether or not the policies work — it would
  pass identically against a table with RLS switched off.
- **Fix A ⭐ Recommended**: Create one throwaway auth user, insert a row for each of the two ids, then
  impersonate each with `set local role authenticated` plus `set local request.jwt.claims` and assert
  each sees only its own row.
  - Strength: Exercises the real predicate — `auth.uid()` resolves to the JWT claim `sub`. One
    dashboard click; strictly narrower than the credentialled E2E user the plan declined.
  - Tradeoff: One extra row in `auth.users` on a shared project; the script must clean up.
  - Confidence: HIGH — `references auth.users(id)` forbids synthetic uuids, so a real second user is
    the only construction that works at all.
  - Blind spot: Dashboard access at phase-2 time not verified.
- **Fix B**: Assert policy shape only (diff `pg_policies.qual` and `with_check` against `recipes`) and
  narrow the stated end state to match.
  - Strength: No second account; still catches a typo'd predicate.
  - Tradeoff: Proves declaration, never enforcement — the original gap.
  - Confidence: MEDIUM.
  - Blind spot: RLS enabled-but-not-forced would still pass.
- **Decision**: FIXED via Fix A

### F2 — Generation script destroys the committed types file on failure

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3, step 3.1
- **Detail**: `package.json:26` redirects stdout over `src/db/database.types.ts`. The shell truncates
  the target before the CLI runs, and the CLI writes errors to **stdout**. Verified live: an
  unauthenticated `supabase gen types typescript` exits 1 after emitting a JSON error object, which
  would land in the file. All four importers break at once (`src/db/supabase.client.ts:3`,
  `src/env.d.ts:4`, `src/lib/services/ai.service.ts:12`, `src/types.ts:1`) and `astro check` — the CI
  gate this change promises to hold at zero — fails across the project. No target flag either, while
  every documented CLI example carries one.
- **Fix**: Generate to a temp file and promote only on exit 0; add `--linked` to both Supabase
  scripts; gitignore the temp file. This adds `package.json` to phase 3, which no phase previously
  covered.
- **Decision**: FIXED

### F3 — Phase 3's diff-review criterion describes a diff that cannot occur

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Critical Implementation Details; Phase 3 criterion 3.7
- **Detail**: The committed `database.types.ts` is not CLI output but a hand-written approximation: no
  `export type Json` anywhere in the repo, no `__InternalSupabase` block, `Views: Record<never,
never>` where the CLI emits a mapped type, `export interface Database` where the CLI emits a type
  alias, and `Relationships: []` on all three tables despite each carrying `references
auth.users(id)`. Regeneration is a full-file replacement, so "expect at most field reordering,
  confirm nothing is lost" is not a check a human can perform — and it was the only gate between a
  bad generation and the commit.
- **Fix**: Reword 3.7 to a consumer check (`Tables<>`, `TablesInsert<>`, `TablesUpdate<>`, `Enums<>`
  and `Constants` still exported; the three existing tables keep every column) and record in Critical
  Implementation Details that the diff is a whole-file rewrite, with the consumer surface enumerated.
  - Strength: Turns an unreadable rewrite into four performable checks; `src/types.ts` is the only
    helper consumer, so the surface is small.
  - Tradeoff: More prose in the plan now.
  - Confidence: HIGH — all four importers and every helper use were enumerated.
  - Blind spot: Whether this CLI version re-emits `Constants` is unverified;
    `docs/reference/contract-surfaces.md` registers it, so its loss would break that doc without
    breaking a compile.
- **Decision**: FIXED

### F4 — `estimation_requested_at` is load-bearing but its lifecycle is undefined

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 table definition; Implementation Approach
- **Detail**: The "no value yet needs no writer" design rests entirely on this column, yet three
  things were left to whatever `S-01`/`S-02` happen to do: (1) it is the only timestamp with no
  default, so client vs route vs database clock was undecided; (2) the PRD measures the minute from
  the entry being saved (`created_at`) while the plan measured from the estimate being requested —
  they diverge on `S-05` recalculation and the plan never said which the derivation reads; (3)
  nothing ever clears it, so a user who clears a value after a successful estimate leaves a stale
  timestamp and the row reads as not-calculated. All three are column-shape decisions on the item the
  roadmap names as costliest to correct late.
- **Fix**: Keep **no default** — a default would stamp every insert including `S-01`'s manual entries,
  making every row read as "estimate requested" and destroying the derivation. Instead document that
  it is server-stamped at request time and never client-supplied; pin the boundary to
  `coalesce(estimation_requested_at, created_at)`; require any path that nulls `calories` to null
  this column in the same statement.
  - Strength: Tightens the chosen design rather than replacing it with the status column the plan
    rightly rejected. Free now, a migration later.
  - Tradeoff: Writes some `S-01`/`S-05` policy into a foundation phase that defers behaviour.
  - Confidence: HIGH — the PRD's minute-from-save wording and FR-005's edit-any-part were both read
    directly.
  - Blind spot: Whether the stale-timestamp case is user-visibly wrong depends on UX not yet
    designed; the fix makes it a decision rather than an accident.
- **Decision**: FIXED — the originally proposed `default now()` was wrong and was corrected before
  application.

### F5 — New table and enum are never registered as contract surfaces

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 3; What We're NOT Doing
- **Detail**: The plan calls both names "load-bearing for every downstream slice", which is exactly
  AGENTS.md's criterion for registering a name in `docs/reference/contract-surfaces.md`. No phase
  updated it. Its `## Database` section enumerates the three existing tables and two existing enums;
  AGENTS.md repeats the same three-table list. Both go stale the moment phase 2 lands, and `S-01`
  through `S-06` are the readers.
- **Fix**: New phase 3 item registering both names with what breaks when each moves, plus a grep
  success criterion.
- **Decision**: FIXED

### F6 — Phase 1's automated criteria never read the SQL

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1, steps 1.1–1.4
- **Detail**: Phase 1 produces two `.sql` files and verified them with two `ls` existence checks plus
  `lint` and `format:check` — neither of which reads `.sql`. Verified: `eslint.config.js` has no
  `.sql` in any `files` pattern (its only ignore source is `includeIgnoreFile` over `.gitignore`), and
  Prettier infers no parser for SQL here, so `prettier --check .` skips the migrations directory and
  passes today. Both gates pass on a syntax error, six policies, or the wrong enum values. The first
  thing that ever parsed the SQL was the irreversible push in phase 2 — the step the three-phase split
  exists to isolate.
- **Fix**: Two grep content assertions (eight policies; RLS enabled, four enum values, both check
  constraints), plus a note that the two gates do not verify the artifact and that a `.sql` glob must
  never be added to Prettier, which fails with "No parser could be inferred".
- **Decision**: FIXED

### F7 — Shared-project claim is unverified for CI

- **Severity**: 💭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details; brief Open Risks
- **Detail**: The claim rests on `.env` and `.env.test` carrying a byte-identical `SUPABASE_URL` —
  confirmed, same project. But the CI e2e job runs the `integration` environment with a
  `SUPABASE_URL` secret (`.github/workflows/ci-cd.yml:108-114`) whose value is not observable from the
  repo. If it points elsewhere, phase 2 leaves that project without `diary_entries` — harmless while
  nothing reads the table, breaking for the first slice that does, in CI and nowhere else.
- **Fix**: Phase 2 checks the secret's project ref and records the answer in the risk register either
  way.
- **Decision**: FIXED

## Changes applied

- `plan.md` — Desired End State, Key Discoveries, What We're NOT Doing, Critical Implementation
  Details (regeneration and `estimation_requested_at`), Phase 1 check-script contract and automated
  criteria, Phase 2 manual criteria, Phase 3 items 1 and 4 (new) with 2–3 renumbered, criteria 3.1 /
  3.7 / registration, Testing Strategy, Manual Testing Steps, and the `## Progress` section
  (renumbered: phase 1 → 1.1–1.9, phase 2 → 2.1–2.8, phase 3 → 3.1–3.10; nothing had been executed, so
  no step titles or SHAs were invalidated).
- `plan-brief.md` — Desired End State, RLS verification decision row, Out of scope, Phases at a
  Glance, Open Risks (RLS proof, CI project ref, types file, `estimation_requested_at`), Success
  Criteria.
- `change.md` — `status: plan_reviewed`.
