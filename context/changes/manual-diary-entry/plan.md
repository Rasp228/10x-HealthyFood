# Manual Diary Entry Implementation Plan

## Overview

Roadmap **S-01** — the floor of milestone `calorie-diary-v1`. Turn the storage delivered by F-01
into a capability: a `/diary` page where the user picks a day, records what they ate as free text
with a free-text amount, optionally types a calorie number, and sees the day's entries together
with a total that states how many of them carry no value yet.

This is the first slice with a user-visible surface on `diary_entries`, so it is also where the API
contract and the day-panel layout are set. S-02 (AI estimate for free text), S-03 (entry from a
recipe) and S-06 (daily goal and progress) all inherit both. The PRD names this path the module's
guarantee: the diary must stay fully usable with no calorie estimation available, and a hand-typed
number is the one source that never fails.

No AI, no recipe search, no editing, no deleting, no goal. Those are S-02 through S-06.

## Current State Analysis

**F-01 shipped the data layer and nothing else.** `grep -il diary src/` matches exactly two files —
`src/db/database.types.ts` and `src/types.ts`. There is no route, no service, no hook, no component
and no page. What exists:

- `supabase/migrations/20260922140906_create_diary_entries.sql` — the table, `calorie_origin_enum`,
  the `idx_diary_entries_user_date` index, RLS and eight per-user policies.
- `supabase/checks/diary-entries-rls.sql` — the re-runnable two-subject isolation proof.
- `src/types.ts:17` `DiaryEntryDto`, `:46` `DiaryEntriesDto`, plus `CalorieOriginEnum`.

**The database enforces one half of the value/origin rule, the route owes the other half.**
`diary_entries_value_has_origin` guarantees `calories` and `calorie_origin` are both present or both
absent. The paired convention — clearing `calories` must clear `estimation_requested_at` in the same
statement — is route-level and unenforced. S-01 never requests an estimate, so it writes `null`
there and the convention is satisfied by never touching the column.

**The route exemplar is `src/pages/api/recipes/index.ts`, not `preferences/index.ts`.** The recipes
route establishes: `export const prerender = false` at the top (`:5`), session read via
`locals.supabase.auth.getUser()` (`:26-28`), `safeParse` on every input (`:41`, `:115`), 400 with
`details: zodIssues(...)` (`:44-51`), `.eq("user_id", user.id)` on every query (`:57`), Supabase
errors rethrown into a `catch` that returns 500 (`:71-73`, `:84-92`), and a manually set
`Content-Type`. `src/pages/api/preferences/index.ts` does the opposite — throwing `.parse()` at
`:40` and `:109` turns a validation failure into a 500 with a raw Zod message. It is listed in
`docs/reference/known-drift.md` and must not be copied.

**There is no server-side CRUD service to copy.** `src/lib/services/ai.service.ts` is the only
constructor-injected service (`constructor(supabase: SupabaseClient<Database>)`, `:21`), and its
public methods take `userId` as the first argument. Its habit of swallowing errors and returning
`null` exists because an AI call failing is an expected outcome; a database failure is not, so the
diary service propagates instead. `src/lib/services/recipe.service.ts` is a browser `fetch` wrapper
despite the suffix — `docs/reference/known-drift.md` says explicitly not to model a server service
on it. `src/lib/utils/errors.ts` is unreferenced dead code; using it would be inventing a pattern.

**The island pattern is uniform and narrow.** Every `.astro` page is a wrapper that mounts one React
island with `client:load` and passes no props (`src/pages/index.astro:7-10`); there is not a single
`client:idle`/`visible`/`only` in the repository. Data arrives through a hook that owns a `refresh`
counter exposed as `refetch` (`src/hooks/recipe/useRecipes.ts:18-56`,
`src/hooks/profile/useUserStats.ts:12`). State derived from props is adjusted during render against
a key held in state (`src/components/recipe/RecipeFormModal.tsx:60-70`) — never mirrored by an
effect, because `react-hooks/set-state-in-effect` is an `error`.

**External state has exactly one established mechanism.** `src/hooks/common/useSearchParam.ts:24`
reads the query string through `useSyncExternalStore`, subscribing to `popstate` and
`astro:after-swap`, with a server snapshot of `""`. It is the only hook of its kind in the codebase.

**Three things the repository does not have at all:**

- Any date input or date library. Zero hits for `type="date"`, `DatePicker`, `Calendar`, `date-fns`,
  `dayjs`. The nearest styling analogue is the plain text input class string
  `w-full rounded-md border border-input bg-background px-3 py-2 text-sm`.
- A `tests/integration/` directory, despite `jest.config.js` matching it.
- A navigation abstraction. `src/components/layout/TopNav.astro:13-33` hardcodes each `<a>`; a new
  item is a copied block.

**`<ToastContainer />` is rendered per island, never in a layout** (`HomePage.tsx:408`,
`ProfilePage.tsx:341`, `RecipeDetailPage.tsx:87`). A component that calls `showToast` without
rendering one produces a toast nobody draws.

**`MainLayout.astro` carries a `locals.user` guard and redirect (`:14-18`); `AppLayout.astro` is the
same file without it.** Both exist; `index.astro` uses the former, `profile.astro` the latter.

## Desired End State

A logged-in user sees a **Dziennik** item in the top navigation. Opening it lands them on today.
They type what they ate, optionally an amount and optionally a calorie number, and the entry appears
in the day's list immediately. The day's header shows the calorie total and, when any entry has no
value, says how many values are missing rather than presenting the sum as complete. Moving between
days by arrows, by the date field or by the **Dziś** button changes the list and the address bar, so
a day survives a reload and can be reached by a link. A day later than today — picked in the field
or arriving in the link — lands the user on today instead, and the address bar is corrected to match.

Verified by: the E2E spec in Phase 3 walking that path end to end, the unit tests over the summary
function and the schemas, and a manual two-session check that one user's entries are invisible to
another.

### Key Discoveries:

- `diary_entries.calories` and `calorie_origin` are tied by a database check
  (`20260922140906_create_diary_entries.sql`, `constraint diary_entries_value_has_origin`) — a
  hand-typed number must be stored as `calorie_origin = 'manual'`, and an absent number as both
  columns `null`.
- `entry_date` is a `date` column deliberately fed by the client; the migration comment records why
  deriving it from a server timestamp files a 01:30 meal under the previous day.
- `/api/diary-entries` is not in `PUBLIC_PATHS` (`src/middleware/index.ts:5-19`), so it inherits the
  session gate for free — and an unauthenticated request is **redirected**, not 401'd.
- `src/hooks/common/useSearchParam.ts:24` already does everything the day selector needs to read,
  but it observes only `popstate` and `astro:after-swap`.
- `src/lib/validations/` currently holds auth schemas only; `diary/` is the first domain added under
  the rule rather than grandfathered against it.

## What We're NOT Doing

- **No AI estimation of any kind** — no call to OpenRouter, no `estimation_requested_at`, no
  `ai_from_description` / `ai_from_recipe` origin. That is S-02 and S-04.
- **No recipe search, no portions, no `source_recipe_id`** — S-03. Those columns stay `null`.
- **No editing and no deleting an entry** — S-05, per the roadmap boundary. There is deliberately no
  `PUT` and no `DELETE` route in this change.
- **No daily goal, no progress bar, no profile change** — S-06. Nothing in this slice writes to any
  pre-existing table.
- **No server-side rejection of future dates.** The gate is the clamp in `useSelectedDay`, on the
  client, by decision: a server-side comparison would have to pick a timezone, and the migration comment
  records what picking the wrong one costs. A request made outside the form can store a future date.
- **No cleanup of diary rows created by E2E.** There is no `DELETE` route until S-05, so the spec
  isolates its data under a signature date instead.
- **No repair of the `preferences/index.ts` `.parse()` drift** and no other refactor of existing
  routes, components, middleware or migrations.
- **No date library, no shadcn `Calendar`/`Popover`, no new dependency of any kind.**
- **No pagination, no cross-day statistics, no macronutrients** — the day is the unit (PRD
  Non-Goals).

## Implementation Approach

Three phases, each independently verifiable.

Phase 1 builds the server contract — schemas, service, route — and can be exercised with `curl`
before a single component exists. This is deliberate: S-02, S-03 and S-06 inherit this contract, so
a mistake here is paid for five times, and the phase ends at a point where that contract can be
reviewed on its own.

Phase 2 builds the surface. The day lives in the query string, so the day selector, the list and the
summary all read one value and the address bar is the state. The total is computed **on the client**
(decided during planning): the API returns a plain `DiaryEntriesDto`, and the reduce lives in a pure
module rather than inside a component, so it is unit-testable now and consumable by S-06's progress
indicator later without dragging a component along.

Phase 3 proves it. Unit tests cover the schemas, the service's write rule and the summary function;
one Playwright spec walks the real path through middleware, RLS and the route, writing to a fixed
past signature date so its rows never appear in any day a human looks at.

## Critical Implementation Details

**The origin of a value is decided by the server, never sent by the client.**
`CreateDiaryEntryCommand` carries no `calorie_origin`. The service sets `'manual'` when a number is
present and `null` when it is not. If the client could name the origin, a hand-typed number could be
stored as `'ai_from_recipe'`, and the PRD's guarantee that every displayed value carries its true
origin would be false from the first slice.

**A syntactically valid date can still not exist.** A `^\d{4}-\d{2}-\d{2}$` regex accepts
`2026-02-31`; Postgres rejects it, and the user gets a 500 where a 400 was correct. The date rule
must confirm the string round-trips through a real date, not only that it matches the shape.

**`pushState` does not fire `popstate`.** `useSearchParam` subscribes to `popstate` and
`astro:after-swap` only, so a programmatic day change made by pushing history state is invisible to
it and the list will not refetch — silently, this reads as "the arrows do nothing". The two
obvious remedies are not equivalent here. A synthetic `PopStateEvent` is a global broadcast, and
`src/hooks/auth/useSecurityGuard.ts:28-32` answers every `popstate` with a `fetch("/api/auth/me")`;
`/diary` mounts `SecurityGuard`, so that route costs an auth round-trip on every arrow, every date
pick and every **Dziś**. The repository already has the other mechanism twice —
`src/components/layout/ThemeToggle.tsx:10-14` and `src/hooks/common/useToast.ts:31-37` both keep a
module-level listener `Set` and call their own notifier after changing the store. That is the one
this change follows; there is no `pushState` and no synthetic `PopStateEvent` anywhere in the
repository today.

**"Today" cannot be computed during server rendering.** The island renders once on the server, where
`useSearchParam`'s snapshot is `""`; falling back to `new Date()` there produces the _server's_ day
and mismatches hydration whenever the two clocks sit on different sides of midnight. The day hook
returns `null` until the client snapshot exists, and the page renders its loading state until then.

**The browser's "today" must be its _local_ day.** `new Date().toISOString().slice(0, 10)` is the
one-liner this reaches for and it returns the **UTC** day: in Warsaw between 00:00 and 02:00 CEST it
is yesterday. That is verbatim the failure the migration comment warns about
(`20260922140906_create_diary_entries.sql:29-31` — "wpis dodany o 01:30 w Warszawie to 23:30 UTC dnia
poprzedniego"), only moved from the server to the browser. Nothing in the test plan would catch it:
the E2E spec enters on a fixed date through the URL and never exercises "today", and the manual check
passes during the day. The repository has no date helper of any kind, so this one is written here,
and `toISOString()` is off-limits for anything `date`-typed.

**An unauthenticated API request never reaches the handler.** The middleware redirects everything
outside `PUBLIC_PATHS` to `/auth/login`, so the observed response is a 302, not the route's own 401.
The 401 branch stays as a second line of defence, but no test should expect it.

**Non-GET requests need an `Origin` header when made outside a browser.** Astro's
`security.checkOrigin` rejects them otherwise — see `docs/reference/astro-react-runtime.md` and the
comment at `tests/e2e/services/cleanup.service.ts:46-50`. This affects the `curl` checks in Phase 1.

---

## Phase 1: Server contract

### Overview

Everything between the HTTP boundary and the table: validation schemas in their own domain folder, a
server service constructed from the request-scoped client, and one route exposing the day's entries
and the create operation.

### Changes Required:

#### 1. Validation schemas

**File**: `src/lib/validations/diary/create-entry.ts`

**Intent**: Give the create operation a schema that lives where `AGENTS.md` says schemas live, so the
diary is the first domain that does not need an entry in `known-drift.md`. Polish messages, Zod 4
syntax, following `src/lib/validations/auth/login.ts`.

**Contract**: Exports `createDiaryEntrySchema` and `type CreateDiaryEntrySchema = z.infer<...>`.
Fields: `entry_date` (string, `YYYY-MM-DD`, must be a date that actually exists); `content` (trimmed,
1–500 characters, matching the table's `char_length(content) <= 500`); `amount_text` (trimmed, ≤100
characters, empty string transformed to `null`, optional); `calories` (integer, ≥ 0, optional, `null`
allowed). The upper bound on `calories` is **5000**, decided at plan review. It is a product
judgement, not a technical floor: a single entry above 5000 kcal is a typo rather than a meal, so
it belongs in the 400 with a Polish field message next to the input. The technical limit is much
further out — `calories` is `int4`, so only a value above 2 147 483 647 would reach Postgres and
surface as a 500; any ceiling below that closes the 500 path equally well, and 5000 is chosen for
the user, not for the column. The low end needs no invention: the table already carries
`check (calories is null or calories >= 0)` (migration `:39`), which the schema's `≥ 0` mirrors.

**File**: `src/lib/validations/diary/list-entries.ts`

**Intent**: The day is a required query parameter, never defaulted server-side — the server has no
business deciding which day "today" is.

**Contract**: Exports `listDiaryEntriesSchema` with a single required `date` field reusing the same
date rule as above, plus its inferred type. A missing or malformed `date` is a 400, not an implicit
"today".

#### 2. Command type

**File**: `src/types.ts`

**Intent**: Name the shape the route hands the service, alongside the existing `Create*Command`
types.

**Contract**: `CreateDiaryEntryCommand` with `entry_date: string`, `content: string`,
`amount_text: string | null`, `calories: number | null`. It carries **no** `calorie_origin`, no
`portions`, no `source_recipe_id` and no `user_id` — the first is the server's decision, the next two
belong to S-03, and the last travels as a separate argument.

#### 3. Diary service

**File**: `src/lib/services/diary.service.ts`

**Intent**: Hold the two database operations and the value/origin pairing, so the route only parses
and responds. This is the first server service written to the rule rather than grandfathered against
it, so it is also the file S-02, S-03 and S-06 will extend.

**Contract**: `export class DiaryService` with
`constructor(private readonly supabase: SupabaseClient<Database>)`, mirroring `ai.service.ts:21`.
Two public methods, both taking `userId` as the first argument:

```ts
getEntriesForDay(userId: string, entryDate: string): Promise<DiaryEntriesDto>
createEntry(userId: string, command: CreateDiaryEntryCommand): Promise<DiaryEntryDto>
```

`getEntriesForDay` selects with `{ count: "exact" }` — `DiaryEntriesDto` is
`ResponseDto<DiaryEntryDto>` (`src/types.ts:34,46`), so `total` is the **row count** and exists only
to satisfy that shared shape; no part of this slice reads it, and the day's kilocalorie figure comes
from `summarizeDay` on the client. It filters
`.eq("user_id", userId).eq("entry_date", entryDate)` and orders by `created_at` ascending, then by `id`
ascending — a diary reads in the order the meals happened, unlike the recipe list's
newest-first. The second key is not decoration: `created_at` defaults to `now()`, which is the
transaction start time, so two entries can carry the same value and Postgres adds no tie-break of
its own — the same day would then come back in a different order between two loads. `id` is
`serial primary key`, so it is monotone per insert and makes the order total. S-05 addresses rows
from this list, so the order has to be stable before it gets there. `createEntry` inserts
the command together with `user_id` and a `calorie_origin` of `"manual"` when `calories` is present
and `null` when it is not, returning the created row via `.select().single()`. Both propagate
Supabase errors rather than returning `null`: unlike an AI call, a failed query is not an expected
outcome, and the route's `catch` is what turns it into a 500.

#### 4. API route

**File**: `src/pages/api/diary-entries/index.ts`

**Intent**: Expose the day's entries and the create operation, following `recipes/index.ts` exactly
and `preferences/index.ts` not at all.

**Contract**: `export const prerender = false` at the top. `GET` validates the query with
`listDiaryEntriesSchema.safeParse(Object.fromEntries(url.searchParams.entries()))` and returns 200
with `DiaryEntriesDto`. `POST` validates the parsed body with `createDiaryEntrySchema.safeParse` and
returns 201 with the created row. Both read the session from `locals.supabase.auth.getUser()`,
delegate to `new DiaryService(locals.supabase)`, and on a validation failure return 400 with
`{ error: "<polski komunikat>", details: zodIssues(result.error) }`. `Content-Type: application/json`
is set explicitly on every response, including the 401.

### Success Criteria:

#### Automated Verification:

- Type checking passes with zero errors: `npm run typecheck`
- Linting passes: `npm run lint`
- Formatting is clean: `npm run format:check`

#### Manual Verification:

- `GET /api/diary-entries?date=<dzisiaj>` on a fresh day returns `{ "data": [], "total": 0 }`
- `POST` with a calorie number creates a row whose `calorie_origin` is `manual`; `POST` without one
  creates a row with both `calories` and `calorie_origin` null, and `estimation_requested_at` null in
  both cases
- `GET` with a malformed or non-existent date (`2026-02-31`) returns 400 with `details` as an array
  of `{ path, message }`, not a 500
- A request without a session is redirected to `/auth/login` rather than reaching the handler
- Entries created under one account are absent from the other account's response for the same day

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation from the human that the manual testing was successful before proceeding
to the next phase. Remember the `Origin` header on `curl` POSTs.

---

## Phase 2: Diary surface

### Overview

The page, the island and everything it renders: the day selector backed by the query string, the
inline form, the day's list and the summary line. Plus the navigation entry that makes the page
reachable.

### Changes Required:

#### 0a. Self-notification for `useSearchParam`

**File**: `src/hooks/common/useSearchParam.ts` (modified)

**Intent**: Let a component that changes the query string itself tell the store about it.
`pushState` fires no event, and the hook currently observes only `popstate` and `astro:after-swap`
(`:11-19`).

**Contract**: Add a module-level `Set<() => void>` of listeners and an exported
`notifySearchParamChange()` that fans out to it, following `ThemeToggle.tsx:10-14` exactly.
`subscribe` adds to that set **in addition to** the two existing listeners — the real `popstate`
one must stay, or the browser's Back button stops working. Purely additive: the three existing
consumers (`LoginForm.tsx:21`, `SimpleChangePasswordForm.tsx:33`, `VerifyMessage.tsx:4-5`) never
call the notifier and are unaffected.

#### 0. Day arithmetic

**File**: `src/lib/utils/diary-day.ts`

**Intent**: Hold the two operations every day-aware piece needs — producing today and stepping by a
day — in one pure, testable place, so the UTC trap is closed once rather than at each call site.

**Contract**: `toLocalDay(now: Date): string` builds `YYYY-MM-DD` from `getFullYear()`,
`getMonth() + 1` and `getDate()`, zero-padded — **never** `toISOString()`, which would return the UTC
day. `addDays(day: string, delta: number): string` and `isAfter(a: string, b: string): boolean`
operate on the `YYYY-MM-DD` string and never route a day through a local `Date` at a boundary that
could shift it. Pure, no React, no I/O.

#### 1. Day resolution hook

**File**: `src/hooks/diary/useSelectedDay.ts`

**Intent**: Own the one piece of state the whole panel reads, and keep it in the address bar so a day
survives a reload and can be linked. Builds on `useSearchParam` rather than duplicating it.

**Contract**:
`useSelectedDay(): { day: string | null; today: string | null; setDay(next: string): void }`. `day`
is the `date` query parameter when present, otherwise the browser's today; both are `null` during
server rendering and until the client snapshot resolves, which is what keeps hydration consistent.
`today` comes from `toLocalDay(new Date())` (`src/lib/utils/diary-day.ts`) and from nowhere else.

A resolved day later than `today` is **clamped to `today`**, and the hook rewrites the URL with
`replaceState` so the address bar stops advertising a day the panel is not showing. This is the
system's real future-date gate: the `max` attribute constrains only the picker, and the day reaches
the panel from the query string, which never passes through it. Doing it here rather than in the
route keeps the timezone decision on the client, which is the whole point of feeding `entry_date`
from the browser — and it also covers a date typed out of range, because `DayNavigator`'s `onChange`
goes through `setDay` as well.

`setDay` writes the parameter into the URL with `pushState` and then calls
`notifySearchParamChange()` — `pushState` alone fires no event, so without that call the store
never re-reads and the arrows appear dead. It deserves a comment saying why, pointing at
`ThemeToggle.tsx:61-63` as the precedent.

#### 2. Entries hook

**File**: `src/hooks/diary/useDiaryEntries.ts`

**Intent**: Fetch one day's entries, following the established data-hook shape so nothing new has to
be learned to read it.

**Contract**:
`useDiaryEntries(day: string | null): { entries: DiaryEntryDto[]; entryCount: number; isLoading: boolean; error: Error | null; refetch: () => void }`.
The field is `entryCount`, not `total`: three different numbers in this feature would otherwise
share one word — the DTO's row count, the day's kilocalories, and the number of entries.
Same `refresh`-counter mechanism as `src/hooks/recipe/useRecipes.ts:19-56`; fetches with
`credentials: "include"` as in `src/hooks/profile/useUserStats.ts`; performs no request while `day`
is `null`.

#### 3. Day summary

**File**: `src/lib/utils/diary-totals.ts`

**Intent**: Keep the rule "what counts toward the day" outside any component, so it is unit-testable
without rendering and so S-06's progress indicator consumes it instead of re-deriving it.

**Contract**: A pure
`summarizeDay(entries: DiaryEntryDto[]): { calorieTotal: number; missingCount: number; entryCount: number }`.
Entries whose `calories` is `null` add nothing to `calorieTotal` and increment `missingCount` —
that count is what makes the displayed sum honest per FR-011. The names are spelled out rather
than left as "total" because S-02, S-03, S-04 and S-06 all read this function, and `calorieTotal`
(kilocalories) must never be confused with the DTO's `total` (rows).

#### 4. Diary components

**File**: `src/components/diary/DiaryPage.tsx`

**Intent**: The island. Wires the two hooks together, renders the selector, form, list and summary,
and owns the toast surface.

**Contract**: Default-exported component taking no props, matching `HomePage.tsx`. Renders its own
`<ToastContainer />` — without it `showToast` produces nothing. Shows the loading state while `day`
is `null`, an error state with a retry calling `refetch`, and an empty state when the day has no
entries.

**File**: `src/components/diary/DayNavigator.tsx`

**Intent**: Move between days three ways — a step back, a step forward, a jump by date — plus a
return to today.

**Contract**: Props `{ day: string; today: string; onChange(next: string): void }`. A native
`<input type="date">` with `max={today}`. The attribute is the picker's hint, not the gate — a typed
out-of-range value still fires `change`, and the input is not inside a `<form>` whose submit would
run constraint validation. The gate is the clamp in `useSelectedDay`; `max` exists so the calendar
greys out the days that clamp would bounce. The arrows step with `addDays` from
`src/lib/utils/diary-day.ts`; the component does no date arithmetic of its own and constructs no
`Date`.

**File**: `src/components/diary/DiaryEntryForm.tsx`

**Intent**: The inline form above the list — always visible, because a diary takes several entries
per session and a modal charges for each one.

**Contract**: Props `{ day: string; onCreated(): void }`. Three fields: content (required, ≤500),
amount (optional, ≤100), calories (optional, integer ≥ 0). Client-side validation reuses the Phase 1
schema so the two cannot drift, following the per-field validation pattern of
`RecipeFormModal.tsx:73-124`. On success it clears the fields, calls `onCreated` and raises a success
toast; a field error renders next to its field, a request failure as an error toast. Clearing happens
in the submit handler — not in an effect, which `react-hooks/set-state-in-effect` rejects.

**File**: `src/components/diary/DiaryEntryList.tsx`

**Intent**: Render the day's entries, showing for each one what was eaten, how much, and its value or
the fact that it has none.

**Contract**: Props `{ entries: DiaryEntryDto[] }`. An entry with `calories === null` is rendered as
explicitly not calculated — a visible state, not a blank. Each row carries
`data-testid="diary-entry-${entry.id}"`, matching the dynamic-id convention of `RecipeCard.tsx:65`.

**File**: `src/components/diary/DiaryDaySummary.tsx`

**Intent**: The day's headline number, and the honesty clause attached to it.

**Contract**: Props `{ entries: DiaryEntryDto[] }`; calls `summarizeDay`. When the missing count is
above zero the component states how many entries are not counted; when it is zero it shows the total
alone. It never renders a bare number that is silently incomplete.

#### 5. Page and navigation

**File**: `src/pages/diary.astro`

**Intent**: The route. A wrapper, like every other page in the project.

**Contract**: `MainLayout` — the variant that carries the `locals.user` guard at `:14-18` — wrapping
`<SecurityGuard client:load />` and `<DiaryPage client:load />`, no props, no `prerender` export. The
path is absent from `PUBLIC_PATHS`, which is what makes it require a session; that file is not
edited.

**File**: `src/components/layout/TopNav.astro`

**Intent**: Make the page reachable.

**Contract**: One `<a href="/diary">Dziennik</a>` block copied from the `Profil` block at `:21-26`,
same classes. No navigation abstraction is introduced. `TopNav.astro` is imported by both
`MainLayout.astro:3` and `AppLayout.astro:3`, so the one edit lands on every page at once.

#### 6. Convention update

**File**: `AGENTS.md`

**Intent**: Keep the conventions file true. It enumerates a closed set of component directories —
`src/components/{ai,auth,common,feedback,layout,pages,profile,recipe}/` — and `ls src/components/`
confirms exactly those plus `ui/`. This change adds a ninth. Shipping a directory the conventions
file does not know about would undercut this plan's own claim that the diary is the first domain
not needing an entry in `known-drift.md`.

**Contract**: Add `diary` to that list, in the same commit as the components. Nothing else in
`AGENTS.md` moves. (`src/hooks/diary/` needs no counterpart edit — hook directories are not
enumerated there.)

### Success Criteria:

#### Automated Verification:

- Type checking passes with zero errors: `npm run typecheck`
- Linting passes, including the react-hooks rules: `npm run lint`
- Formatting is clean: `npm run format:check`
- Production build succeeds: `npm run build`

#### Manual Verification:

- The **Dziennik** item appears in the navigation and opens the panel on today's date
- An entry with a calorie number appears in the list immediately and is included in the day's total
- An entry without a number appears marked as not calculated, and the summary states how many values
  the total is missing
- Arrows, the date field and **Dziś** all change the list and the address bar; reloading the page and
  using the browser's back button both return to the expected day
- The date field will not accept a day later than today
- Opening `/diary?date=<a day in the future>` lands on today and rewrites the address bar to it
- A too-long description shows a field error; a server failure shows an error toast
- Existing screens — recipe list, recipe form, profile, login — are unchanged

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation from the human that the manual testing was successful before proceeding
to the next phase.

---

## Phase 3: Tests and closing the gate

### Overview

Unit coverage where the logic lives, one end-to-end walk through the real stack, and the full
`code-quality` gate green.

### Changes Required:

#### 1. Unit tests

**File**: `tests/unit/diary-totals.test.ts`

**Intent**: Pin the rule that makes the displayed total honest.

**Contract**: Covers an empty day, a day where every entry has a value, a mixed day (the total skips
the valueless entries and the missing count reports them), and a day where no entry has a value.
Polish nested `describe` blocks, imports through the `@/` alias, following
`tests/unit/validation-errors.test.ts`.

**File**: `tests/unit/diary-day.test.ts`

**Intent**: Pin the local-day rule, which is the one place a plausible one-liner silently files a meal
under the wrong day.

**Contract**: Asserts `toLocalDay` against dates fixed at 23:30 and 00:30 local time — the two
instants where the local and UTC days disagree — and that the result never matches
`toISOString().slice(0, 10)` at those instants. Covers `addDays` across a month and a year boundary,
and `isAfter` on equal days.

**File**: `tests/unit/diary-validations.test.ts`

**Intent**: Pin the boundaries the API promises, especially the ones that would otherwise surface as
a 500.

**Contract**: Covers the date rule (accepts a real date, rejects a malformed one **and** rejects
`2026-02-31`), the content bounds at 0/1/500/501 characters, the empty-amount-to-`null` transform,
and the calorie bounds including the negative and above-ceiling cases.

**File**: `tests/unit/diary-service.test.ts`

**Intent**: Pin the one piece of business logic the service owns — that a value and its origin are
written together, and that the origin is never taken from the caller.

**Contract**: Uses a stubbed Supabase client in the style of `tests/mocks/supabase.mock.ts`. Asserts
that an insert with a number carries `calorie_origin: "manual"`, that an insert without one carries
`null` in both columns, that `user_id` comes from the argument, and that `getEntriesForDay` filters
on both `user_id` and `entry_date`.

#### 2. E2E coverage

**File**: `tests/e2e/page-objects/DiaryPage.ts`

**Intent**: Give the spec a page object in the established shape.

**Contract**: `readonly Locator` fields initialised in the constructor **exclusively** via
`page.getByTestId(...)`, matching `LoginPage.ts:19-29`. Actions (`goto(day)`, `addEntry(...)`) and
assertions (`expectEntryVisible`, `expectTotal`, `expectMissingCount`). `goto(day)` navigates
straight to `/diary?date=<day>`, which the query-string decision makes possible.

**File**: `tests/e2e/page-objects/index.ts`, `tests/e2e/page-objects/Application.ts`

**Intent**: Register the page object the way the others are registered.

**Contract**: Export from the barrel and expose as a field on `Application`, following the existing
entries. `CleanupService` is **not** extended — there is no `DELETE` route to call.

**File**: `tests/e2e/diary-entry.spec.ts`

**Intent**: Walk the whole path once through middleware, RLS, the route and the island.

**Contract**: Logs in explicitly in the test body as `recipe-management.spec.ts:60-63` does, then
navigates to a fixed **signature date in the past** — a day no human will ever open, which keeps the
un-cleanable rows out of every real day and satisfies the form's future-date rule at the same time.
Adds one entry with a calorie value and one without, asserts both appear, asserts the total counts
only the first and that the summary reports one missing value. Tagged `@smoke` alongside the existing
spec.

#### 3. Test identifiers

**File**: the Phase 2 components

**Intent**: Make the page objects possible; the convention is `getByTestId` only.

**Contract**: `data-testid` in the repository's kebab-case `<domena>-<element>-<typ>` form:
`diary-page`, `diary-day-input`, `diary-prev-day-button`, `diary-next-day-button`,
`diary-today-button`, `diary-content-input`, `diary-amount-input`, `diary-calories-input`,
`diary-submit-button`, `diary-entries-list`, `diary-entry-${id}`, `diary-empty-state`,
`diary-total-calories`, `diary-missing-values`, and one `*-error` per validated field.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test`
- E2E suite passes: `npm run test:e2e`
- Type checking passes with zero errors: `npm run typecheck`
- Linting passes: `npm run lint`
- Formatting is clean: `npm run format:check`
- Dependency audit passes: `npm run test:security`

#### Manual Verification:

- The rows written by the E2E run are visible only under the signature date and do not appear in
  today's panel
- Two browser sessions on two accounts confirm that neither sees the other's entries for the same day

**Implementation Note**: This phase closes the change. The residual E2E rows are a known, accepted
cost of shipping without a `DELETE` route; S-05 adds one and should extend `CleanupService` then.

---

## Testing Strategy

### Unit Tests:

- `summarizeDay` — empty day, all-valued day, mixed day, no-valued day. The mixed case is the one
  that matters: it is the difference between an honest total and a quietly understated one.
- The Zod schemas — the date rule (including a well-formed but non-existent date), the content
  bounds, the empty-amount transform, the calorie bounds.
- `DiaryService` — value and origin written together, origin never accepted from the caller,
  `user_id` from the argument, day query filtered on both columns.

### Integration Tests:

None. `tests/integration/` does not exist in this repository and this change is not the place to
establish it; the route is exercised end to end by Playwright instead.

### Manual Testing Steps:

1. Log in, open **Dziennik** from the navigation — the panel opens on today.
2. Add an entry with a description, an amount and a calorie number; confirm it appears at once and
   the total changes.
3. Add an entry with a description only; confirm it is marked as not calculated and that the summary
   now says one value is missing.
4. Step back a day with the arrow, then jump forward with the date field, then press **Dziś**;
   confirm the address bar tracks each move and the list matches.
5. Reload on a past day and press the browser's back button; confirm both land where expected.
6. Try to pick tomorrow in the date field; confirm it cannot be selected.
7. Paste a 501-character description; confirm a field error rather than a failed request.
8. Open the recipe list, the recipe form and the profile; confirm nothing changed there.

## Performance Considerations

None material. A day holds a handful of rows for three or four users, and `idx_diary_entries_user_date`
already covers the only query this change makes. The summary reduce runs over that same handful. The
NFR that matters here — an entry visible in under a second — is met by the entry being a plain insert
with no model call in the path; that budget only becomes interesting in S-02.

## Migration Notes

None. The table, enum, index and policies all shipped with F-01 and this change does not alter them.
No migration is written, and `npm run supabase:gen` is not run because the schema does not move.
Rolling this change back is deleting the new files and the one navigation line; rows already written
stay valid, since they use only columns F-01 established.

## References

- Roadmap item: `context/foundation/roadmap.md` — **S-01**, milestone `calorie-diary-v1`
- Requirements: `context/foundation/prd.md` — US-01, FR-001, FR-002, FR-004, FR-011, FR-016
- Foundation change: `context/changes/diary-entry-store/plan.md` (F-01), and its review at
  `context/changes/diary-entry-store/reviews/impl-review.md`
- Table, enum and policies: `supabase/migrations/20260922140906_create_diary_entries.sql`
- Route exemplar: `src/pages/api/recipes/index.ts:5-92`
- Server service exemplar: `src/lib/services/ai.service.ts:17-47`
- Schema file exemplar: `src/lib/validations/auth/login.ts`
- Data-hook exemplar: `src/hooks/recipe/useRecipes.ts:18-56`
- Prop-derived state pattern: `src/components/recipe/RecipeFormModal.tsx:60-70`
- External-state hook: `src/hooks/common/useSearchParam.ts:24`
- E2E page-object exemplar: `tests/e2e/page-objects/LoginPage.ts:19-29`
- Known deviations not to copy: `docs/reference/known-drift.md`
- Load-bearing names: `docs/reference/contract-surfaces.md`
- Recurring rules: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Server contract

#### Automated

- [x] 1.1 Type checking passes with zero errors: `npm run typecheck`
- [x] 1.2 Linting passes: `npm run lint`
- [x] 1.3 Formatting is clean: `npm run format:check`

#### Manual

- [x] 1.4 GET for a fresh day returns an empty list
- [x] 1.5 POST with and without a calorie number writes the correct value/origin pairing
- [x] 1.6 Malformed or non-existent date returns 400 with ValidationIssue details
- [x] 1.7 Request without a session is redirected instead of reaching the handler
- [x] 1.8 Entries of one account are absent from another account's response

### Phase 2: Diary surface

#### Automated

- [ ] 2.1 Type checking passes with zero errors: `npm run typecheck`
- [ ] 2.2 Linting passes, including the react-hooks rules: `npm run lint`
- [ ] 2.3 Formatting is clean: `npm run format:check`
- [ ] 2.4 Production build succeeds: `npm run build`

#### Manual

- [ ] 2.5 Navigation item opens the panel on today
- [ ] 2.6 Entry with a value appears at once and counts into the total
- [ ] 2.7 Entry without a value is marked not calculated and the summary reports it
- [ ] 2.8 Arrows, date field and Dziś track the address bar; reload and back button behave
- [ ] 2.9 Date field refuses a day later than today
- [ ] 2.10 Field errors and request failures surface where expected
- [ ] 2.11 Existing screens are unchanged
- [ ] 2.12 A future day in the URL lands on today and the address bar is corrected

### Phase 3: Tests and closing the gate

#### Automated

- [ ] 3.1 Unit tests pass: `npm run test`
- [ ] 3.2 E2E suite passes: `npm run test:e2e`
- [ ] 3.3 Type checking passes with zero errors: `npm run typecheck`
- [ ] 3.4 Linting passes: `npm run lint`
- [ ] 3.5 Formatting is clean: `npm run format:check`
- [ ] 3.6 Dependency audit passes: `npm run test:security`

#### Manual

- [ ] 3.7 E2E rows live only under the signature date
- [ ] 3.8 Two accounts confirm entries stay private
