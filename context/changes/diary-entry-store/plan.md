# Diary Entry Store Implementation Plan

## Overview

Create the private, per-user storage for calorie diary entries — roadmap item **F-01**, the single
foundation of milestone `calorie-diary-v1`. One new table, one new enum, RLS with per-user policies,
and the TypeScript types derived from them. Every slice from `S-01` to `S-06` reads or writes this
record, so the shape has to be complete now: the set of allowed value origins is dictated by FR-009
and FR-010, which `S-01` never exercises, and a late correction would cost a migration in the
emergency buffer week.

This phase ships no user-visible behaviour. `S-01` (`manual-diary-entry`) is what turns it into a
capability.

## Current State Analysis

**The diary exists in no form.** No table, no column, no route, no component. The only occurrence of
"calories" in the repository is `tests/fixtures/recipes.ts:25-31`, an untyped fixture describing a
recipe model that has never existed in this schema (`id: "recipe-1"` as a string against a `serial`
column, plus `ingredients[]`, `servings`, `difficulty` — none of which are real columns). It is
imported by nothing. It is not a convention and must not be treated as one.

**The schema conventions are exact and copyable.** `supabase/migrations/20250427130913_healthymeal_schema.sql`
establishes every pattern this change needs:

- `id serial primary key` on all three tables — not bigserial, not identity, not uuid.
- `user_id uuid not null references auth.users(id) on delete cascade`, inline column-level FK.
- `created_at timestamptz not null default now()`; length limits doubled up as
  `varchar(n) ... check (char_length(col) <= n)`.
- Indexes named `idx_<table>_<abbreviated_cols>`, e.g. `idx_recipes_user_created`.
- RLS enabled per table, then **eight policies per table**: four `anon_cannot_<op>_<table>` with
  `using (false)`, and four `users_can_<op>_own_<table>` with `user_id = auth.uid()`.
- All-lowercase SQL, Polish header block, numbered banner sections.

**Constraints discovered during research:**

- There is **no server-side CRUD service to copy**. `src/lib/services/ai.service.ts` is the only
  constructor-injected service, and its only writes go to `logs`. All `recipes` and `preferences`
  CRUD sits inline in route handlers. `src/lib/utils/errors.ts` (`AppError` and friends) is fully
  unreferenced dead code — using it would be establishing a pattern, not following one.
- `src/types.ts` derives DTOs with `Tables<"x">` and builds commands with `Pick<>`.
  `TablesInsert` / `TablesUpdate` are generated and exported but used nowhere.
- Enums are surfaced as `Database["public"]["Enums"]["<name>"]` (`src/types.ts:89,92`), not through
  the generated `Enums<>` helper.
- **No local Supabase stack.** No docker-compose, no `supabase start` script, and
  `supabase/seed.sql` (referenced by `config.toml`) does not exist. `npm run supabase:push` and
  `npm run supabase:gen` both carry no `--local` flag, so both target the linked hosted project.
- **`.env` and `.env.test` carry a byte-identical `SUPABASE_URL`** — local development and the E2E
  suite share one remote database.
- **CI never runs migrations.** `npm run typecheck` (`astro check`) validates code against the
  _committed_ `src/db/database.types.ts`, not against a live database.
- `tests/integration/` does not exist, though `jest.config.js:14` already declares a matcher for it.
  `tests/mocks/supabase.mock.ts` is dead code and structurally cannot model two tables in one test
  or resolve to `{ data, error }`.
- `.ai/db-plan.md:89-106` prescribes a _different_ RLS shape — a single `create policy user_is_owner
... for all` per table. The shipped migration does the opposite, and `AGENTS.md` points at the
  migration. Follow the migration.

## Desired End State

A `diary_entries` table exists in the linked Supabase project, carrying the day, what was eaten, the
amount in whichever form the entry path produced, the calorie value, the origin of that value, and
enough information to tell whether a value is still being established. It is readable and writable
only by its owner, proven by impersonating two subjects in the SQL editor and seeing each read only
its own row. `src/db/database.types.ts` describes it, `src/types.ts` exposes `DiaryEntryDto`,
`DiaryEntriesDto` and `CalorieOriginEnum`, and `npm run typecheck` reports zero errors.

Verify by: running `supabase/checks/diary-entries-rls.sql` against the project (eight policies
present; each impersonated subject sees only its own row) and `npm run typecheck` (clean).

### Key Discoveries:

- Migration pattern to copy verbatim: `supabase/migrations/20250427130913_healthymeal_schema.sql:30-61`
  (tables), `:68-74` (indexes), `:81-83` (RLS), `:90-193` (the eight-policy block per table).
- DTO derivation pattern: `src/types.ts:8-14`, list envelope at `src/types.ts:31-40`, enum surfacing
  at `src/types.ts:89,92`.
- `updated_at` has a database default but **no trigger** — `src/pages/api/recipes/[id].ts:116` sets
  it by hand on every update. A new table inherits this problem.
- `src/db/database.types.ts` is not CLI output at all — it is a hand-written approximation, of which
  the misplaced `is_ai_generated` (`:67,77,87`, appended last instead of alphabetically) is only the
  most visible symptom. Regeneration replaces the file rather than amending it; see Critical
  Implementation Details for the full list of differences and for what to check instead of the diff.
- The AI prompt asks the model for "wartości odżywcze" inside free-text `content`
  (`src/lib/services/ai.service.ts:120`) but pins no format — so nutrition-block header variants are
  genuinely unconstrained. That is `S-03`'s problem, not this one.

## What We're NOT Doing

- **No service layer and no Zod schemas.** `src/lib/services/diary.service.ts` and
  `src/lib/validations/diary/` are `S-01`'s work, built against a real consumer rather than guessed
  at here.
- **No API routes, no pages, no components.** The foundation shows nothing by itself.
- **No change to `recipes`, `preferences` or `logs`** — no column, no policy, no data. The only
  reference to `recipes` is an outbound nullable foreign key.
- **No daily-goal field on the profile.** That is `S-06`, and it is the module's only write to
  pre-existing user data (FR-012, FR-015).
- **No nutrition-block parsing.** Reading calorie figures out of a recipe description is `S-03`.
- **No `tests/integration/` harness and no second Supabase *test* user.** Considered and declined
  for this phase; see Open Risks in the brief. This is not the same as the one throwaway auth user
  phase 2 creates purely to prove RLS: that account gets no credentials in `.env.test`, no page
  object and no spec, and nothing in the suite ever authenticates as it.
- **No macronutrient columns.** Protein, fat and carbohydrates sit in the same nutrition block and
  would be nearly free to add, and v1 deliberately stores calories only (PRD Non-Goals).
- **No CI enforcement of RLS.** CI runs no migrations today, and this change does not add that.

## Implementation Approach

One migration, applied once, then the types that follow from it. The three phases exist to isolate
the irreversible step: phase 1 writes SQL and touches nothing, phase 2 pushes to the shared remote
database behind a manual gate, phase 3 brings TypeScript back into agreement with the database.

The table is designed so that "no value yet" needs no writer. Rather than a status column that
something must transition to `failed`, the absence of a value plus the timestamp of when an estimate
was requested is enough to derive every state the PRD names — and it stays correct when a serverless
request dies or a browser tab closes mid-estimate, which is exactly when a `pending` row would
otherwise stick forever.

## Critical Implementation Details

**`updated_at` will not maintain itself.** The column gets `default now()` to match `recipes`, but no
trigger exists anywhere in this schema. `S-01`'s update path must set it explicitly, the way
`src/pages/api/recipes/[id].ts:116` does. Recorded here so the next slice does not assume otherwise.

**Regenerating types replaces the whole file — expect a rewrite, not a diff.** The committed
`src/db/database.types.ts` is not CLI output at all; it is a hand-written approximation. It carries
no `export type Json` (the identifier appears nowhere in the repository), no `__InternalSupabase`
block, `Views: Record<never, never>` where the CLI emits `{ [_ in never]: never }`,
`export interface Database` where the CLI emits `export type Database = {`, and `Relationships: []`
on all three tables even though every one of them carries
`references auth.users(id) on delete cascade`. The regenerated file will therefore differ on nearly
every line, and "read the diff and confirm nothing is lost" is not a check a human can perform on it.

Verify by consumer instead. The whole surface is four importers plus a handful of uses, all
enumerated: `Database` in `src/db/supabase.client.ts:3`, `src/env.d.ts:4`,
`src/lib/services/ai.service.ts:12` and `src/types.ts:1`; `Tables<>` at `src/types.ts:8,11,14`;
`Database["public"]["Enums"][...]` at `src/types.ts:89,92`; and `Constants`, which nothing imports
but `docs/reference/contract-surfaces.md` registers. The `interface` to `type` flip is harmless to
all of them — nothing merges the declaration. The two outcomes that matter are the `Tables<>` helper
not being re-emitted (caught by step 3.4) and a column silently vanishing from `recipes`,
`preferences` or `logs` (caught by the reworded step 3.9).

**Phase 2 writes to the database that E2E runs against.** `.env` and `.env.test` point at the same
project, so the push affects the E2E environment too. The change is purely additive — a new enum and
a new table — so existing specs cannot see it, but the push is not reversible by `git revert`.

## Phase 1: Author the migration

### Overview

Write the SQL and the RLS verification script. Nothing is applied to any database in this phase.

### Changes Required:

#### 1. Diary entries migration

**File**: `supabase/migrations/<timestamp>_create_diary_entries.sql` (created with
`npm run supabase:new-migration create_diary_entries`)

**Intent**: Create the enum, the table, the index and the RLS policies that make a diary entry
private to its owner. Follows `20250427130913_healthymeal_schema.sql` in structure, naming and
lowercase style — not `20250427130914`'s uppercase, and not `.ai/db-plan.md`'s single-`for all`
policy shape.

**Contract**: One new enum `calorie_origin_enum` and one new table `diary_entries`. Both names are
load-bearing for every downstream slice; the enum values are the exact vocabulary FR-009, FR-010,
FR-003 and FR-004 map onto, so they are pinned here:

```sql
create type calorie_origin_enum as enum (
  'recipe_nutrition',      -- FR-009: figures self-declaring as per-portion, scaled by portions
  'ai_from_recipe',        -- FR-010: estimated from the recipe's own content
  'ai_from_description',   -- FR-003: estimated from the user's free-text description
  'manual'                 -- FR-004: typed by the user
);

create table diary_entries (
  id serial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  content text not null check (char_length(content) <= 500),
  portions numeric(6,2) check (portions is null or portions > 0),
  amount_text varchar(100),
  source_recipe_id integer references recipes(id) on delete set null,
  calories integer check (calories is null or calories >= 0),
  calorie_origin calorie_origin_enum,
  estimation_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint diary_entries_value_has_origin
    check ((calories is null) = (calorie_origin is null))
);
```

`entry_date` is a plain `date` supplied by the client and never derived from a timestamp
server-side: an entry logged at 01:30 in Warsaw is 23:30 UTC on the previous day, and deriving the
day would file the meal under the wrong date.

`source_recipe_id` uses `on delete set null`, not `cascade` — the entry keeps its own `content` copy
and its stored `calories`, so deleting a recipe leaves past days numerically identical, as
`## Constraints & Compatibility` in the PRD requires.

`estimation_requested_at` deliberately carries **no default**, unlike the two timestamps beside it. A
default would stamp every insert, including `S-01`'s manual entries, and every row would then read as
"an estimate was requested" — destroying the state derivation this column exists for. It is written
server-side with `now()` at the moment an estimate is requested, never supplied by the client, whose
clock would otherwise move the one-minute boundary by its own skew. Two rules follow from it and bind
the later slices:

- **Which instant the minute runs from.** The PRD measures it from the entry being saved ("not
  established within one minute of the entry being saved"), which is `created_at`; this column
  records a *re-request*. The state derivation reads `coalesce(estimation_requested_at, created_at)`,
  so a first estimate runs from the save and `S-05`'s explicit recalculation restarts the clock.
- **It must be cleared, not left behind.** `diary_entries_value_has_origin` forces `calorie_origin`
  to null whenever `calories` goes null, and FR-005 lets a user clear a value they had already been
  given. Any path that nulls `calories` must null `estimation_requested_at` in the same statement, or
  the row reads as an estimate that never arrived.

Also required in the same file: `create index idx_diary_entries_user_date on diary_entries(user_id, entry_date);`,
`alter table diary_entries enable row level security;`, and eight policies named
`anon_cannot_<op>_diary_entries` (`using (false)`) and `users_can_<op>_own_diary_entries`
(`user_id = auth.uid()`), one per operation per role, matching `:90-193` of the schema migration.

#### 2. RLS verification script

**File**: `supabase/checks/diary-entries-rls.sql` (new directory)

**Intent**: Give phase 2 a re-runnable proof rather than a one-off click-through, and leave an
artifact that can be re-run after any future migration touching this table.

**Contract**: A script with two assertions. The first is read-only: a `select` over `pg_policies`
filtered to `tablename = 'diary_entries'`, expected to return eight rows with the names above.

The second must prove the policies *bite*, which a plain cross-user `select` cannot do here — the
Supabase SQL editor runs as a superuser role that bypasses RLS entirely, so such a query returns
zero rows whether or not the policies work, and would pass against a table with RLS switched off.
The script therefore impersonates each subject explicitly, inside a transaction it rolls back:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<uuid-a>","role":"authenticated"}';
select count(*) from diary_entries;   -- expect: only A's row
set local request.jwt.claims = '{"sub":"<uuid-b>","role":"authenticated"}';
select count(*) from diary_entries;   -- expect: only B's row
rollback;
```

`auth.uid()` resolves to `request.jwt.claims ->> 'sub'`, so this exercises the real predicate rather
than the absence of data. It needs two rows owned by two different users, and
`user_id uuid not null references auth.users(id)` forbids a synthetic uuid — so one throwaway auth
user is a prerequisite, created in phase 2. The script must not insert, update or delete anything
outside `diary_entries`, and must leave no rows behind.

### Success Criteria:

#### Automated Verification:

- Migration file exists and matches the CLI naming convention: `ls supabase/migrations/*_create_diary_entries.sql`
- Verification script exists: `ls supabase/checks/diary-entries-rls.sql`
- The migration declares all eight policies: `grep -c "create policy" supabase/migrations/*_create_diary_entries.sql` returns 8
- The migration enables RLS, pins the four enum values and carries both check constraints: `grep -q "enable row level security"`, all of `'recipe_nutrition'`, `'ai_from_recipe'`, `'ai_from_description'`, `'manual'` present, and `diary_entries_value_has_origin` present
- Linting passes: `npm run lint`
- Formatting check passes: `npm run format:check`

> The last two gates do **not** read `.sql`: ESLint has no `.sql` in any `files` pattern, and
> Prettier infers no parser for SQL in this project, so `prettier --check .` skips the migrations
> directory entirely and passes on a file containing a syntax error, six policies, or the wrong enum
> values. They are listed because the phase must leave the tree green, not because they verify the
> artifact — the `grep` assertions above are what actually inspect the SQL before phase 2's
> irreversible push parses it for the first time. Do not add a `.sql` glob to any Prettier
> invocation: an explicit one fails with "No parser could be inferred".

#### Manual Verification:

- SQL reviewed side by side against `supabase/migrations/20250427130913_healthymeal_schema.sql`: lowercase keywords, Polish header block, eight policies, `auth.uid()` on the right-hand side
- Enum values confirmed to cover all four cascade steps (FR-009, FR-010, FR-003, FR-004) with no fifth state needed
- Confirmed the migration touches no existing table, column, policy or enum

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation from the human that the manual review was successful before proceeding
to the next phase.

---

## Phase 2: Apply to the linked project and prove RLS

### Overview

Push the migration to the hosted Supabase project and demonstrate that the policies actually isolate
users. This is the irreversible step in the change.

### Changes Required:

#### 1. Migration application

**File**: none — this phase runs commands rather than editing files.

**Intent**: Apply the phase 1 migration to the linked project, then execute the verification script
against it.

**Contract**: `npm run supabase:push` applies the pending migration. The database afterwards carries
`calorie_origin_enum` and `diary_entries` with RLS enabled and eight policies, and `preferences`,
`recipes` and `logs` are untouched — same columns, same policies, same row counts.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npm run supabase:push` exits 0
- No pending migrations remain: `npx supabase migration list` shows the new migration as applied

#### Manual Verification:

- One throwaway auth user created in the Supabase dashboard, and one `diary_entries` row inserted for it and one for the E2E user — the two rows the isolation assertion needs
- `supabase/checks/diary-entries-rls.sql` run in the Supabase SQL editor: exactly eight policies listed for `diary_entries`
- Under `set local role authenticated`, each impersonated subject sees only its own row — and the assertion is confirmed capable of failing, by observing that the plain superuser session sees both
- `preferences`, `recipes` and `logs` confirmed unchanged: same row counts and same policies as before the push (guardrail FR-015)
- The existing application still loads and recipe browsing works, confirming the additive migration broke nothing
- The `integration` GitHub environment's `SUPABASE_URL` secret checked against this project's ref (`.github/workflows/ci-cd.yml:108-114`), and the answer recorded in the brief's Open Risks either way

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation from the human that the manual testing was successful before proceeding
to the next phase.

---

## Phase 3: Regenerate types and add domain types

### Overview

Bring TypeScript back into agreement with the database and expose the diary types the way every
other domain in this project exposes its own.

### Changes Required:

#### 1. Generation script hardening

**File**: `package.json` (and `.gitignore`)

**Intent**: Stop a failed generation from destroying the committed types file, and name the target
explicitly instead of depending on ambient CLI state. This runs **before** the regeneration below.

**Contract**: `supabase:gen` writes to a temporary file and promotes it only on exit 0, and both
Supabase scripts carry `--linked`:

```json
"supabase:gen": "supabase gen types typescript --linked > src/db/database.types.ts.tmp && mv src/db/database.types.ts.tmp src/db/database.types.ts",
"supabase:push": "supabase db push --linked",
```

The current script redirects straight onto `src/db/database.types.ts`, which the shell truncates
*before* the CLI runs — and the CLI writes its errors to **stdout**, not stderr. Verified: an
unauthenticated `supabase gen types typescript` exits 1 after emitting
`{"_tag":"Error","error":{"code":"LegacyPlatformAuthRequiredError",...}}`, which would land in the
file. All four importers break at once (`src/db/supabase.client.ts:3`, `src/env.d.ts:4`,
`src/lib/services/ai.service.ts:12`, `src/types.ts:1`), `astro check` — the CI gate this change
promises to hold at zero — fails across the project, and a file the project forbids hand-editing has
to be restored by hand. Add `src/db/database.types.ts.tmp` to `.gitignore` so a failed run leaves
nothing to commit.

#### 2. Generated database types

**File**: `src/db/database.types.ts`

**Intent**: Regenerate from the linked project so the committed types describe the database that now
exists. Never hand-edited — produced only by `npm run supabase:gen`.

**Contract**: The file gains a `diary_entries` entry under `Tables` with `Row`, `Insert`, `Update`
and `Relationships` (populated, because `source_recipe_id` is a same-schema foreign key), and
`calorie_origin_enum` under `Enums` and in the `Constants` export. Expect the rest of the file to be
replaced wholesale rather than amended — see Critical Implementation Details for why, and for what to
verify in place of reading the diff.

#### 3. Diary domain types

**File**: `src/types.ts`

**Intent**: Expose the diary row the way `RecipeDto` and `PreferenceDto` are exposed, so `S-01`
imports a type rather than reaching into the generated file.

**Contract**: Three new exports following the conventions at `src/types.ts:8-14`, `:31-40` and
`:89,92` — `DiaryEntryDto` derived with `Tables<"diary_entries">`, `DiaryEntriesDto` as
`ResponseDto<DiaryEntryDto>`, and `CalorieOriginEnum` as
`Database["public"]["Enums"]["calorie_origin_enum"]`. No `Command` types here: those describe request
payloads, and no route exists yet to receive one.

#### 4. Contract surface registration

**Files**: `docs/reference/contract-surfaces.md`, `AGENTS.md`

**Intent**: This plan calls `diary_entries` and `calorie_origin_enum` load-bearing for every
downstream slice, which is precisely AGENTS.md's criterion for registering a name. Without this step
the registry `S-01` through `S-06` will read goes stale the moment phase 2 lands.

**Contract**: Under `## Database`, the `### Tables` entry gains `diary_entries` and the `### Enums`
entry gains `calorie_origin_enum`, each stating what breaks when the name moves — for the enum, that
its four values are the vocabulary FR-009, FR-010, FR-003 and FR-004 map onto, so adding or renaming
one desynchronizes the cascade from rows already stored. `AGENTS.md`'s "Existing tables:
`preferences`, `recipes`, `logs`" line gains `diary_entries`. Both files are Prettier-ignored
(`context/`, `CLAUDE.md`) or plain markdown, so neither affects `format:check`.

### Success Criteria:

#### Automated Verification:

- `supabase:gen` is failure-safe before it is first run: the script writes via a temp file and carries `--linked`, and a deliberate unauthenticated invocation leaves `src/db/database.types.ts` byte-identical
- Types regenerate without error: `npm run supabase:gen`
- Generated file describes the new objects: `grep -q "diary_entries" src/db/database.types.ts && grep -q "calorie_origin_enum" src/db/database.types.ts`
- Type checking passes with zero errors: `npm run typecheck`
- Linting passes: `npm run lint`
- Formatting check passes: `npm run format:check`
- Unit tests pass: `npm run test`
- Both names registered: `grep -q "diary_entries" docs/reference/contract-surfaces.md && grep -q "calorie_origin_enum" docs/reference/contract-surfaces.md && grep -q "diary_entries" AGENTS.md`

#### Manual Verification:

- Regenerated file checked by consumer rather than by diff: `Tables<>`, `TablesInsert<>`, `TablesUpdate<>`, `Enums<>` and `Constants` all still exported, and `recipes`, `preferences` and `logs` each still carry every column they carry today — `is_ai_generated` in particular still present in `recipes` Row, Insert and Update
- `DiaryEntryDto` resolves to the expected shape in an editor, with `calories`, `calorie_origin`, `portions`, `amount_text` and `source_recipe_id` all nullable and `entry_date` a string

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation from the human that the manual review was successful.

---

## Testing Strategy

### Unit Tests:

None added. This change introduces no functions, no branching and no parsing — a unit test here
would assert that a type alias equals itself. The suite's two existing files stay green as a
regression signal (`npm run test`).

### Integration Tests:

None added, deliberately. `tests/integration/` does not exist, `tests/mocks/supabase.mock.ts` is dead
code that cannot resolve to `{ data, error }`, and only one E2E user is provisioned — so an
*automated* cross-user RLS test would need a new harness plus a second credentialled test user plus
new environment variables. That build is out of scope for a foundation shipping no behaviour. The
guarantee is proven instead by the phase 2 script, which reaches the same predicate by impersonating
two subjects inside one session rather than by holding two authenticated ones.

### Manual Testing Steps:

1. Run `supabase/checks/diary-entries-rls.sql` in the Supabase SQL editor and confirm eight policies on `diary_entries`.
2. In the same editor, insert one row for the E2E user and one for the throwaway user, then run the `set local role authenticated` / `request.jwt.claims` blocks and confirm each subject sees only its own row. Confirm the assertion can fail, by observing that the plain superuser session sees both rows.
3. Insert one row by hand for the E2E user, re-read it, and confirm the `diary_entries_value_has_origin` constraint rejects a row with `calories` set but `calorie_origin` null.
4. Confirm `preferences`, `recipes` and `logs` row counts and policies are unchanged from before the push.
5. Load the running application and browse recipes to confirm nothing regressed.

## Performance Considerations

Negligible at this scale — 3–4 users, one day's entries per read. The single index
`idx_diary_entries_user_date` covers the module's only query shape ("entries for a chosen day"),
matching how `idx_recipes_user_created` covers the recipe list. No further indexing is justified
until a query exists to justify it.

## Migration Notes

There is no existing diary data, so no backfill and no data migration. The change is purely
additive: one new enum, one new table, no alteration to any existing object.

Rolling back means writing a second migration that drops the table and the enum — `git revert` alone
restores the TypeScript but leaves the database ahead of it, which would make `astro check` pass
against a schema that no longer matches the committed types. Since nothing reads the table until
`S-01`, leaving it in place is the cheaper recovery if the shape turns out wrong before any slice
lands.

## References

- Roadmap item F-01: `context/foundation/roadmap.md` (`## Foundations`)
- Requirements: `context/foundation/prd.md` — FR-001, FR-002, FR-003, FR-004, FR-009, FR-010, FR-015, `## Access Control Changes`, `## Constraints & Compatibility`
- Schema pattern to copy: `supabase/migrations/20250427130913_healthymeal_schema.sql:30-193`
- DTO conventions: `src/types.ts:8-40`, `src/types.ts:89-92`
- Contract surfaces: `docs/reference/contract-surfaces.md` (`## Database`)
- Known drift to avoid copying: `docs/reference/known-drift.md`
- Recurring rules: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Author the migration

#### Automated

- [x] 1.1 Migration file exists and matches the CLI naming convention — ca3623f
- [x] 1.2 Verification script exists at supabase/checks/diary-entries-rls.sql — ca3623f
- [x] 1.3 Migration declares all eight policies — ca3623f
- [x] 1.4 Migration enables RLS, pins the four enum values and carries both check constraints — ca3623f
- [x] 1.5 Linting passes — ca3623f
- [x] 1.6 Formatting check passes — ca3623f

#### Manual

- [x] 1.7 SQL reviewed against the existing schema migration for style, policy count and auth.uid() placement — ca3623f
- [x] 1.8 Enum values confirmed to cover all four cascade steps with no fifth state needed — ca3623f
- [x] 1.9 Confirmed the migration touches no existing table, column, policy or enum — ca3623f

### Phase 2: Apply to the linked project and prove RLS

#### Automated

- [x] 2.1 Migration applies cleanly via npm run supabase:push — 9627ff3
- [x] 2.2 No pending migrations remain in the migration list — 9627ff3

#### Manual

- [x] 2.3 Throwaway auth user created and one diary_entries row inserted for each of the two users — 9627ff3
- [x] 2.4 Verification script lists exactly eight policies for diary_entries — 9627ff3
- [x] 2.5 Each impersonated subject sees only its own row, and the assertion is confirmed capable of failing — 9627ff3
- [x] 2.6 preferences, recipes and logs confirmed unchanged after the push — 9627ff3
- [x] 2.7 Existing application still loads and recipe browsing works — 9627ff3
- [x] 2.8 Integration environment SUPABASE_URL secret checked against this project ref and the answer recorded — 9627ff3

### Phase 3: Regenerate types and add domain types

#### Automated

- [x] 3.1 supabase:gen hardened to write via a temp file and target --linked, verified failure-safe — 2fc41b4
- [x] 3.2 Types regenerate without error — 2fc41b4
- [x] 3.3 Generated file describes diary_entries and calorie_origin_enum — 2fc41b4
- [x] 3.4 Type checking passes with zero errors — 2fc41b4
- [x] 3.5 Linting passes — 2fc41b4
- [x] 3.6 Formatting check passes — 2fc41b4
- [x] 3.7 Unit tests pass — 2fc41b4
- [x] 3.8 diary_entries and calorie_origin_enum registered in contract-surfaces.md and AGENTS.md — 2fc41b4

#### Manual

- [x] 3.9 Regenerated types checked by consumer, with no existing column lost — 2fc41b4
- [x] 3.10 DiaryEntryDto resolves to the expected shape with the correct nullability — 2fc41b4
