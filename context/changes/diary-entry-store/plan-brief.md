# Diary Entry Store — Plan Brief

> Full plan: `context/changes/diary-entry-store/plan.md`

## What & Why

Create the private, per-user storage for calorie diary entries — roadmap **F-01**, the only
foundation of milestone `calorie-diary-v1`. All six slices (`S-01` through `S-06`) read or write this
same record, so it has to be right before any of them start. The roadmap flags it as the one item
whose late change forces a migration during the emergency buffer week: the vocabulary of value
origins is dictated by FR-009 and FR-010, which `S-01` never touches, so it cannot be backfilled
once slices are in flight.

## Starting Point

The diary exists in no form — no table, no column, no route, no component. The only "calories" hit in
the repository is `tests/fixtures/recipes.ts`, a fictional recipe shape backed by no column and
imported by nothing. What does exist is a clean pattern to copy:
`supabase/migrations/20250427130913_healthymeal_schema.sql` creates three tables with `serial` keys,
cascading `auth.users` foreign keys, RLS, and eight policies each (four denying `anon`, four scoping
`authenticated` to `auth.uid()`). `src/types.ts` derives every DTO from the generated
`database.types.ts` with `Tables<"x">`.

## Desired End State

A `diary_entries` table lives in the linked Supabase project, holding the day, what was eaten, the
amount, the calorie value, where that value came from, and enough to tell whether one is still being
worked out. Only its owner can read or write it, proven by impersonating two subjects and seeing
each read only its own row.
TypeScript agrees with the database: `DiaryEntryDto`, `DiaryEntriesDto` and `CalorieOriginEnum` are
exported, and `npm run typecheck` is clean. Nothing is visible to a user yet — `S-01` is what makes
it a feature.

## Key Decisions Made

| Decision                 | Choice                                                                                          | Why (1 sentence)                                                                                                        | Source   |
| ------------------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------- |
| Foundation scope         | Migration + regenerated types + domain types; no service, no Zod, no routes                     | The roadmap says the foundation shows nothing by itself, and there is no CRUD-service precedent to copy nor a consumer to validate an interface against. | Plan     |
| Value-origin enum        | Four values: `recipe_nutrition`, `ai_from_recipe`, `ai_from_description`, `manual`              | One per step of the PRD cascade, so `S-03` and `S-04` add no enum value and no migration.                               | Plan     |
| Enum naming language     | English snake_case                                                                              | Matches `action_type_enum`; the Polish `preference_category_enum` values are Polish because they are user-facing data.   | Plan     |
| "Not calculated" state   | Derived from nullable `calories` plus `estimation_requested_at`, not a status column            | Self-healing — a dead serverless request or a closed tab still reads correctly, where a `pending` row would stick forever. | Plan     |
| Amount representation    | `portions numeric(6,2)` and `amount_text varchar(100)`, both nullable, no CHECK between them    | `S-03` multiplies a real number instead of re-parsing text; FR-005 lets users edit any part, which a CHECK would fight.  | Plan     |
| Recipe linkage           | Nullable `source_recipe_id` with `on delete set null`                                           | Keeps a usable pointer for `S-05` recalculation while the entry's own content and value keep past days intact.           | Plan     |
| Day representation       | Plain `date` supplied by the client, never derived server-side                                  | An entry logged at 01:30 in Warsaw is 23:30 UTC the previous day, so deriving the date would file the meal a day early.  | Plan     |
| Verification of RLS      | Push, regenerate, typecheck, plus a checked-in SQL script that impersonates two subjects via `set local role authenticated` + `request.jwt.claims` | A plain cross-user select in the SQL editor runs as superuser and bypasses RLS, so it would pass against a table with RLS off; impersonation exercises the real `auth.uid()` predicate. | Review   |
| Problem framing & scope  | Taken as given from PRD v1 and the roadmap                                                      | Access control, non-goals, priorities and success criteria were already settled upstream and were not re-opened.         | Roadmap  |

## Scope

**In scope:**

- One migration: `calorie_origin_enum`, the `diary_entries` table, one index, RLS, eight policies
- A checked-in RLS verification script under `supabase/checks/`
- Applying the migration to the linked Supabase project
- Regenerating `src/db/database.types.ts` and adding three exports to `src/types.ts`

**Out of scope:**

- Any service, validation schema, API route, page or component — all `S-01` and later
- The profile's daily calorie goal (`S-06`) and nutrition-block parsing (`S-03`)
- Macronutrient columns; v1 stores calories only
- A `tests/integration/` harness, a second *credentialled* Supabase test user, or CI enforcement of RLS (phase 2 does create one throwaway auth user, purely to give the RLS assertion a second subject — it gets no entry in `.env.test` and no spec)
- Any change to `recipes`, `preferences` or `logs`

## Architecture / Approach

One additive migration and the types that follow from it. The three phases exist to isolate the one
irreversible step — phase 1 writes SQL and touches no database, phase 2 pushes to the hosted project
behind a manual gate, phase 3 brings TypeScript back into agreement. The table is shaped so "no value
yet" requires no writer: absence of a value plus the time an estimate was requested derives every
state the PRD names, without a background job this application does not have.

## Phases at a Glance

| Phase                      | What it delivers                                              | Key risk                                                                                               |
| -------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1. Author the migration    | The SQL file plus the RLS verification script; nothing applied | Enum values must be complete now; a fifth origin discovered later costs a migration                     |
| 2. Apply and prove RLS     | Migration live on the linked project, isolation demonstrated   | Irreversible, and it writes to the database E2E also runs against                                      |
| 3. Regenerate types        | Hardened `supabase:gen`, `database.types.ts`, three exports in `src/types.ts`, contract-surface entries | The committed types file is not CLI output, so regeneration replaces it wholesale — verify by consumer, not by diff |

**Prerequisites:** Supabase CLI authenticated and still linked to the project (`supabase/.temp/` is
git-ignored, so a fresh clone needs `npm run supabase:link` first); write access to the hosted
project; `.env` present.

**Estimated effort:** ~1 session across 3 phases. The SQL is a structural copy of an existing
migration; most of the time is verification, not authoring.

## Open Risks & Assumptions

- **RLS is proven by hand, not by CI.** CI runs no migrations, so nothing stops a future migration
  from regressing these policies. Accepted for a foundation with no behaviour; revisit if a diary
  slice ever ships a second table. The hand check itself must impersonate two subjects — the SQL
  editor's default role bypasses RLS, so a plain cross-user select proves nothing.
- **The CI E2E project ref is unconfirmed — and stays unconfirmed.** `.env` and `.env.test` share one
  project (ref `cvuhlsblibxyippkqurn`), but the CI e2e job runs `environment: integration` with
  `secrets.SUPABASE_URL` (`.github/workflows/ci-cd.yml:108-114`), whose value is not visible from the
  repo. Phase 2 checked and could not resolve it: GitHub secrets are write-only — no one, including
  the repo owner, can read a stored value back in the UI — and `gh` is not installed on the dev
  machine. **Recorded verdict (2026-09-22): not verified.** Phase 2 applied the migration to
  `cvuhlsblibxyippkqurn` only; if `integration` points elsewhere, that project has no
  `diary_entries` — harmless while nothing reads the table, breaking for the first slice that does,
  in CI and nowhere else. Two ways to settle it later: a temporary workflow step running
  `printf '%s' "$SUPABASE_URL" | sha256sum` and comparing against
  `979e08ad44936dace2bbbd153cabd0c476008527e8333be5d89541f62e4e478c` (sha256 of the local value), or
  overwriting the secret with the known value. A hash mismatch would not by itself prove a different
  project — a trailing slash or stray quote changes it too.
- **The push is not revertible by git.** Undoing it means a second migration dropping the table and
  the enum. Since nothing reads the table until `S-01`, leaving a wrong shape in place is usually
  cheaper than dropping it.
- **Dev and E2E share one Supabase project** (`.env` and `.env.test` carry the same `SUPABASE_URL`),
  so phase 2 changes the E2E environment too. The migration is additive, so existing specs cannot
  observe it.
- **`database.types.ts` is not CLI output at all** — no `export type Json`, no `__InternalSupabase`,
  `Record<never, never>` where the CLI emits mapped types, `interface` where it emits `type`, empty
  `Relationships` despite real foreign keys, and `is_ai_generated` out of alphabetical order.
  Regeneration replaces the file, so it is verified by consumer rather than by diff. Separately, the
  `supabase:gen` redirect truncates the target before the CLI runs and the CLI writes errors to
  stdout — phase 3 hardens the script before running it.
- **`updated_at` has no trigger.** It inherits `recipes`' behaviour, where the route sets it by hand.
  `S-01` must do the same or the column silently keeps its insert value.
- **`estimation_requested_at` carries no default by design** and is server-stamped at request time,
  never client-supplied. The one-minute boundary reads `coalesce(estimation_requested_at,
  created_at)`, matching the PRD's "one minute of the entry being saved", and any path that nulls
  `calories` must null this column too — otherwise a value the user cleared by hand reads as an
  estimate that never arrived.
- **Assumption: one entry belongs to exactly one day**, with no cross-day or time-of-day meal slot.
  The PRD's unit of the module is the day, and no requirement names meals.

## Success Criteria (Summary)

- A diary entry can be stored for a chosen day with its calorie value, the origin of that value, and
  an amount in either form — and a row with a value but no origin is rejected by the database.
- A user cannot read another user's entries, demonstrated by each of two impersonated subjects reading only its own row — with the assertion shown to be capable of failing.
- `npm run typecheck` stays at zero errors, and recipes, preferences and logs are provably unchanged.
