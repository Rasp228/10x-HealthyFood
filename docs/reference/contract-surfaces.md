# Contract Surfaces

Load-bearing names in 10x-HealthyFood: identifiers whose spelling is part of a contract rather than
a local implementation detail. Renaming one of these does not fail at the rename site — it fails
somewhere else, often silently. Each entry states where the name lives, who depends on it, and what
breaks when it moves.

Conventions themselves (which directory a file belongs in, which pattern to follow) live in
@AGENTS.md. This file is only the name registry.

## Request pipeline

### `createSupabaseServerInstance`

- **Defined**: `src/db/supabase.client.ts`
- **Returns**: `{ supabase, flushCookies }` — a destructuring contract, not a bare client.
- **Called by**: `src/middleware/index.ts` only. Exactly one call per request.
- **Breaks**: constructing a second client anywhere in a route races the middleware's instance over
  the same refresh token. The auth routes used to do this. Read `context.locals.supabase` instead.

### `flushCookies`

- **Defined**: `src/db/supabase.client.ts` (returned from `createSupabaseServerInstance`)
- **Used by**: every return path in `src/middleware/index.ts` — five `redirect()` calls, the
  awaited `next()` and the 500 JSON returned when `next()` throws on an `/api/` path.
- **Breaks**: a return that skips it loses the rotated session cookie. No exception at the call
  site; the write lands after the response was sent and is logged, and the user appears signed out
  on the next request. See @context/foundation/lessons.md.
- **Exception**: when `next()` throws on a page (not `/api/`), the middleware rethrows without
  `flushCookies`, so Astro can render its error page. Cookies rotated in that pass are dropped;
  Astro renders the 500 page through the middleware again, and that second `getUser()` re-rotates
  and flushes onto the error response. It costs a second GoTrue round trip and relies on GoTrue
  accepting the already-rotated refresh token within its reuse interval. Do not copy this rethrow
  to any other exit.

### `locals.supabase` / `locals.user`

- **Typed**: `App.Locals` in `src/env.d.ts` — `supabase: SupabaseClient<Database>` and optional
  `user?: { email: string; id: string }`.
- **Populated**: `src/middleware/index.ts`. `user` is set only when `getUser()` resolves with an
  email.
- **Breaks**: renaming either field breaks every API route at once. `user` being optional is
  deliberate — public paths reach a handler without it.

### `locals.requestId`

- **Typed**: `App.Locals.requestId: string` in `src/env.d.ts`.
- **Set**: first thing in `src/middleware/index.ts`, before the Supabase client —
  `request.headers.get("x-vercel-id") ?? crypto.randomUUID()`.
- **Read by**: the middleware's own log lines (`auth.session_invalid`, `auth.get_user_failed`,
  `request.unhandled`) and the body of its 500 JSON (`{ error, requestId }`); routes and services
  that log pass it into the `LogContext` of `src/lib/utils/log.ts`.
- **Breaks**: renaming the field or the `requestId` key in log lines breaks the join between a log
  line and the request row in the Vercel dashboard, and the id a user quotes from an error
  response no longer matches anything in the logs. Dropping the `x-vercel-id` read keeps every
  line unique but uncorrelated with Vercel's request log.

### `PUBLIC_PATHS`

- **Defined**: `src/middleware/index.ts`
- **Contract**: exact-match allowlist (`.includes(url.pathname)`), not a prefix match. A route
  absent from it requires a session.
- **Breaks**: a new public page or auth endpoint not listed here redirects to `/auth/login`. A
  trailing-slash or casing mismatch fails the same way, because the check is exact.

### `POST /api/client-errors`

- **Defined**: `src/pages/api/client-errors.ts`; schema and limits in
  `src/lib/validations/client-errors/report.ts` (`MAX_CLIENT_ERROR_EVENTS = 5`,
  `MAX_CLIENT_ERROR_BODY_BYTES = 16 KB`, `message` ≤ 500, `stack` ≤ 4000 characters).
- **Called by**: `src/lib/utils/client-error-reporter.ts` only — `navigator.sendBeacon` with a
  `text/plain` string body, falling back to `fetch(..., { keepalive: true })`. Callers of the
  reporter: the global `error` / `unhandledrejection` handlers installed by
  `src/lib/utils/install-client-error-reporter.ts` (a `<script src>` in `MainLayout` and
  `AppLayout`, not `AuthLayout`), `IslandErrorBoundary` (`kind: "boundary"`) and
  `useCalorieEstimation` (`kind: "fetch"`).
- **Contract**: not in `PUBLIC_PATHS` — a guest is redirected by the middleware, and the route
  answers 401 without `locals.user`. Body over 16 KB → 413 (checked on `content-length` and on
  the read text, before `JSON.parse`); schema failure, more than 5 events or a non-JSON body →
  400 via `zodIssues`; otherwise 204 and one `logWarn("client.<kind>", { requestId, userId, path,
source, message, stack, at })` line per event. `kind` is a closed enum
  (`error` / `unhandledrejection` / `boundary` / `fetch`), so a client cannot mint new event names.
  No rate limit beyond those per-request caps; the reporter itself sends at most 5 events per
  document load, deduplicated on `message + source`.
- **Breaks**: renaming the path or adding it to `PUBLIC_PATHS` without the reporter silently drops
  every browser error (`sendBeacon` never reports failure to the page). Lowering a limit on the
  route without the reporter's trimming (which shares the constants) turns whole batches into
  400s. Adding a `kind` changes the log event vocabulary — update the enum, not the route.

## Validation

### `zodIssues` / `zodMessage` / `ValidationIssue`

- **Defined**: `src/lib/utils/validation-errors.ts`
- **Contract**: the single exit for validation failures leaving any API route. `ValidationIssue[]`
  is the shape clients parse.
- **Breaks**: returning `error.issues` or `error.format()` straight from a route leaks Zod
  internals into the response body and diverges from what the frontend expects. Covered by
  `tests/unit/validation-errors.test.ts`.
- **Note**: Zod is v4 — read failures from `err.issues`. `ZodError.errors` does not exist, so
  `"errors" in err` returns `false` and a guard against it silently skips its branch.

### `MAX_INT4_ID` / `positiveIdParamSchema`

- **Defined**: `src/lib/validations/common/id.ts` — `MAX_INT4_ID = 2147483647`, the top of
  Postgres `integer` / `serial` (int4).
- **Used by**: `positiveIdParamSchema` (path ids: `entryIdSchema` in
  `src/lib/validations/diary/update-entry.ts`, the id schemas of `src/pages/api/preferences/[id].ts`
  and `src/pages/api/recipes/[id].ts`) and `source_recipe_id` in
  `src/lib/validations/diary/create-entry.ts`.
- **Contract**: a path id is a string of digits in `1..MAX_INT4_ID`; anything else is a 400 before
  the query runs. Every `id` column it guards is `serial`, and `diary_entries.source_recipe_id` is
  `integer` (migrations under Tables below).
- **Breaks**: the constant mirrors a column type, not a business rule. Widening a guarded column
  to `bigint` / `bigserial` without raising it rejects real ids with 400. Dropping the ceiling, or
  routing a new id through `parseInt`, lets a value above int4 reach PostgREST, which rejects it
  with a range error, and the route answers 500 instead of 400; `parseInt` also reads `"12abc"`
  as 12. Covered by the `2147483647` / `2147483648` cases in
  `tests/unit/diary-validations.test.ts` and the diary, preferences and recipes route tests.

## Database

### Tables — `preferences`, `recipes`, `logs`, `diary_entries`, `user_settings`

- **Defined**: `supabase/migrations/20250427130913_healthymeal_schema.sql`; `diary_entries` in
  `supabase/migrations/20260922140906_create_diary_entries.sql`; `user_settings` in
  `supabase/migrations/20260930074331_create_user_settings.sql`.
- **Typed**: `src/db/database.types.ts`, generated by `npm run supabase:gen`. Never hand-edited.
  `diary_entries` is exposed to application code as `DiaryEntryDto` / `DiaryEntriesDto`, and
  `user_settings` as `UserSettingsDto` / `DailyGoalDto` (`src/types.ts`) — import those rather
  than reaching into the generated file.
- **Breaks**: a schema change without regenerating leaves the types describing the old shape, and
  `astro check` passes against a database that no longer matches. Every table needs RLS and
  per-user policies. `diary_entries` is the store every diary slice reads and writes; its
  `diary_entries_value_has_origin` constraint ties `calories` and `calorie_origin` together, so a
  write that sets one without the other is rejected by the database, not by the route. It ties
  nothing else: clearing `calories` must also clear `estimation_requested_at`, and that half is a
  route-level convention the database does not enforce. `user_settings` holds at most one row per
  user (`user_id` is the primary key) and is written by upsert. `daily_calorie_goal = null` and a
  missing row both mean "no goal" — a read must return `null`, not 404. Its CHECK range 500–10000
  is duplicated in `src/lib/validations/user-settings/update-goal.ts`; changing one without the
  other lets the route accept a value the database rejects (a 500 instead of a 400), or the
  reverse. The goal deliberately does not live in `preferences`: every preference row is sent to
  the recipe prompt. The same duplication holds for `preferences` and `recipes`: the column
  `value varchar(50)` with `char_length <= 50` is repeated in
  `src/lib/validations/preferences/upsert-preference.ts` (after `trim()`), and `title varchar(255)`,
  `content` and `additional_params` `char_length <= 5000` in
  `src/lib/validations/recipe/create-recipe.ts` (shared by `update-recipe.ts`). Changing a migration
  literal without its schema, or the reverse, turns a 400 into a 500 or rejects what the database
  would store. The UI and `/api/ai/save-recipe` cap the title at 100, not 255 — a known divergence
  (`docs/reference/known-drift.md`, "Przepisy"). The `preferences_unique_user_category_value`
  constraint on `(user_id, category, value)` surfaces from the preferences routes as 409 via
  Postgres code `23505`; dropping the constraint silently turns a 409 back into a second, identical
  row. Boundary and "+1" cases for all of these are in `tests/unit/preferences-route.test.ts` and
  `tests/unit/recipes-route.test.ts`.

### Enums — `action_type_enum`, `preference_category_enum`, `calorie_origin_enum`

- **Values**: `generate_new` / `generate_modification`; `lubiane` / `nielubiane` / `wykluczone` /
  `diety`; `recipe_nutrition` / `ai_from_recipe` / `ai_from_description` / `manual`
- **Defined**: the migrations above; mirrored in `database.types.ts` and in the `Constants` export.
- **Breaks**: the preference category values are Polish and are written to the database as-is.
  Translating them in code desynchronizes the app from existing rows. The four
  `calorie_origin_enum` values are the exact vocabulary FR-009, FR-010, FR-003 and FR-004 map onto —
  one per step of the calorie cascade — so adding, renaming or reordering one desynchronizes the
  cascade from rows already stored, and a row's provenance can no longer be read back.

## Build & test harness

### Path aliases — `@/*` and `@tests/*`

- **Declared twice**: `tsconfig.json` (`paths`) and `jest.config.js` (`moduleNameMapper`) — `@/*`
  only. `@tests/*` is in `tsconfig.json` alone, so tests import from `tests/` by relative path.
- **Breaks**: adding an alias to one and not the other type-checks but fails at test runtime, or
  the reverse. Update both. An `@tests/...` import in a Jest test is exactly that failure today.

### `export const prerender`

- **Contract**: every page is SSR (`output: "server"`). Individual pages opt into prerendering with
  `export const prerender = true`; API routes set it to `false` explicitly.
- **Breaks**: prerendering a page that reads `locals.user` renders it once at build time with no
  session.

### `TEST_MODE`, `E2E_PORT`, `E2E_BASE_URL`

- **Read by**: `playwright.config.ts`, and `tests/e2e/config/test-data.ts` for the env guard.
- **Contract**: `npm run test:e2e` sets `TEST_MODE=true`, which is what loads `.env.test`. `E2E_PORT`
  (default 3000) picks the spawn port; `E2E_BASE_URL` points at an already-running server and
  suppresses the `webServer` block entirely.
- **Breaks**: running Playwright without `TEST_MODE` throws in the env guard before any test is
  collected. The spawn command must keep `--ignore-lock`, or Astro's project-wide lock makes the
  second dev server exit and Playwright reports "webServer exited early".

### `E2E_USERNAME_B`, `E2E_PASSWORD_B`

- **Read by**: `tests/e2e/helpers/second-account.ts` (`signInSecondAccount`), for the two-account
  isolation specs `tests/e2e/data-isolation-*.spec.ts`; set in `.env.test` locally and passed to the
  „Testy E2E” job in `.github/workflows/ci-cd.yml` from secrets of the `integration` environment.
- **Contract**: a second real account on the same Supabase project as `E2E_USERNAME`. It is never
  signed out (`signOut()` is global), so it must not be reused by a spec that clicks „Wyloguj”.
- **Breaks**: renaming either in one place only makes every isolation spec throw before its first
  request; a missing secret in CI fails the required „Testy E2E” check, not a skip.

## CI gates

### Script names — `lint`, `typecheck`, `format:check`, `test:security`

- **Defined**: `package.json`; consumed by the `code-quality` job in
  `.github/workflows/ci-cd.yml`, in that order.
- **Breaks**: renaming a script without updating the workflow fails the job on a missing script.
  `typecheck` (`astro check`) is the only gate that verifies `strict: true` — neither `astro build`
  nor ESLint checks types. It must stay at 0 errors.
- **Note**: `format:check` is `prettier --check .`. Never gate on `npm run format -- --check`, which
  expands to `prettier --write . --check`, writes fixes and exits 0.

### Job names — required-check contexts

- **Defined**: the `name:` of each job in `.github/workflows/ci-cd.yml:32,59,85,104` — „Kontrola
  jakości kodu”, „Build produkcyjny”, „Testy jednostkowe”, „Testy E2E” — and, byte for byte, the
  `context` entries of `required_status_checks` in `.github/rulesets/master.json` (ruleset
  „master — wymagane checki”, pinned to the GitHub Actions app, `integration_id: 15368`). The job
  ids (`unit-tests`, `e2e-tests`) never appear as contexts.
- **Contract**: a PR into `master` merges only when all four check-runs exist and succeed. All four
  are required because `needs` turns every later job into `skipped` when an earlier one fails, and
  GitHub counts a skipped required check as passed — requiring only the test jobs would let a PR
  with a red build through. `Status comment` is deliberately not a context: it is `skipped` on any
  failure.
- **Breaks**: renaming a job's `name:` without the same edit in the ruleset blocks every PR for
  good — the required context is never produced again. Dropping one of the four contexts from the
  ruleset brings back the `skipped` trap: on PR #4 a red „Kontrola jakości kodu” left the three
  later checks `skipped`, and the merge stayed blocked because that first check is required too.
- **Note**: the file is the source of truth; GitHub does not read it. After editing it, re-apply
  with `gh api -X POST repos/Rasp228/10x-HealthyFood/rulesets --input .github/rulesets/master.json`
  when no ruleset of that name exists, or with
  `gh api -X PUT repos/Rasp228/10x-HealthyFood/rulesets/<id> --input .github/rulesets/master.json`
  when it does (today id 24778393). So far it has been applied by hand in Settings → Rules, an
  equivalent path — keep the UI and the file identical.
  The anonymous REST API shows the rules (`rules/branches/master`) but not `bypass_actors` or a
  PR's `mergeStateStatus`; checking those needs an authenticated `gh` or the UI.

### `GHSA-9wv6-86v2-598j`, `GHSA-mrhx-c7xc-m3w5` (path-scoped)

- **Declared**: the `allowlist` in `audit-ci.jsonc`, with the reasoning inline; the same file
  carries the `moderate` failure threshold.
  - `GHSA-9wv6-86v2-598j`: transitive `path-to-regexp` pulled in by `@astrojs/vercel`.
  - `GHSA-mrhx-c7xc-m3w5`, allowlisted only for the path
    `@astrojs/vercel>@vercel/functions>@vercel/oidc>@vercel/cli-config>zod`: `@vercel/cli-config`
    pins `zod@4.1.11` exactly and has no patched release. The direct `zod` is patched and not
    covered by the entry, so a vulnerable direct `zod` still fails the gate. No `overrides` —
    forcing a `zod` into the adapter changes the Vercel function, see
    @context/foundation/lessons.md.
  - Removed 2026-10-27 as no longer in the tree: `GHSA-vfj7-8cjw-p6xm` (`braces`) and
    `GHSA-hp3w-g68c-fv3c` (`sprintf-js`).
- **Contract**: every entry has an inline comment naming its source and its review trigger — an
  `@astrojs/vercel` bump for both, plus an `@vercel/cli-config` release for the `zod` path. A new
  entry needs the same kind of comment, or the allowlist stops being reviewable. Every entry is an NSP record with an `expiry` date (3 months out): once it
  passes, the entry stops applying and `test:security` fails again on that advisory alone — a
  scheduled review even when no dependency was bumped. At review, bump and drop the entry if a
  patched release exists; otherwise move `expiry` forward and update the comment's date.
- **Stale entries**: an allowlisted advisory that is no longer in the tree does not fail the
  gate; `audit-ci` only logs "Consider not allowlisting advisory". Remove such entries.
- **Breaks**: `npm audit fix --force` proposes `@astrojs/vercel@8.0.4` for both, and it should
  not be taken: a major downgrade that drops the `x-astro-path` patch and forces a return to
  Astro 5.

## AI code review

The `AI code review` job (`.github/workflows/review.yml`) runs the composite action
`.github/actions/ai-reviewer` on every pull request into `master`; the action drives the package in
`tools/code-reviewer`. Its names are spread over YAML, Bash and TypeScript, so no type check or test
catches a rename that reaches only one of them.

### Labels — `ai-cr:passed`, `ai-cr:failed`, `ai-cr:review`

- **Defined**: created (`gh label create --force`) in `.github/actions/ai-reviewer/action.yml:61-63`
  and set or removed in its "Etykiety PR-a" step (`action.yml:199-227`); `ai-cr:review` is also
  spelled in the job's `if:` in `.github/workflows/review.yml:23`.
- **Contract**: after a non-skipped run a PR carries exactly one of `ai-cr:passed` / `ai-cr:failed`
  — `passed` only for verdict `pass` with exit code 0, `failed` for everything else (verdict
  `fail`, over budget, missing model, daily cap, error). An empty diff leaves both unchanged.
  `ai-cr:review` is the re-run trigger: a person adds it, the `labeled` event passes the `if:`
  filter, and the action removes it again after every non-skipped run. Any other label skips the
  job. Labels the action sets through `GITHUB_TOKEN` trigger no new run, so setting
  `ai-cr:passed` does not loop the workflow.
- **Breaks**: renaming `ai-cr:review` in the action and not in the `if:` (or the reverse) makes
  adding the label skip the job, so a re-review can only be forced by a push, and the label is
  never removed. Dropping the label filter from the `if:` turns every label a person adds into a
  paid run. Renaming `ai-cr:passed` / `ai-cr:failed` leaves the old label on existing PRs next to
  the new one — the action removes only the names it knows.

### `<!-- ai-cr:sticky -->`

- **Defined**: `STICKY_MARKER` in `tools/code-reviewer/src/comment/render.ts:9`; every comment
  variant starts with it. Searched for as a literal string in the "Komentarz w PR-ze" step,
  `.github/actions/ai-reviewer/action.yml:185`.
- **Contract**: one comment per PR, updated in place: the action takes the first issue comment
  whose author is `github-actions[bot]` and whose body starts with the marker, PATCHes it, and
  POSTs a new one only when none matches.
- **Breaks**: changing the marker in one of the two places, or in both without migrating existing
  comments, makes the next run post a second comment instead of updating the first. The author
  filter is part of the contract too — a comment a person pastes with the marker is never updated.

### `vars.REVIEW_MODEL`

- **Defined**: a repository variable (Settings → Secrets and variables → Actions → Variables),
  passed in `.github/workflows/review.yml:40` as `review-model`, read as `REVIEW_MODEL` in
  `tools/code-reviewer/src/provider.ts:35`.
- **Contract**: in CI an empty or whitespace-only value ends the run in "Warunki wstępne"
  (`.github/actions/ai-reviewer/action.yml:75-79`) before any model call: outcome `missing-model`,
  a comment naming the missing variable, `ai-cr:failed` and a red job. Locally an empty
  `REVIEW_MODEL` still means the package's default model — the CI check deliberately does not.
- **Breaks**: renaming the variable on one side only reads as "not set": every PR gets a red job
  without a model call.

### `OPENROUTER_API_KEY` (GitHub Actions secret)

- **Defined**: a repository secret, passed in `.github/workflows/review.yml:39` as
  `openrouter-api-key` and exposed only in the `env:` of the "Review modelu" step
  (`.github/actions/ai-reviewer/action.yml:130`); read in `tools/code-reviewer/src/provider.ts:38`.
- **Contract**: the same key as the application's `OPENROUTER_API_KEY` in Vercel
  (`src/env.d.ts`), so CI and the app spend from one key and one limit. A pull request from a fork
  gets no secrets, so the job's `if:` skips it (`review.yml:23`) instead of failing it. The key
  never goes into `run:` text, into another step's `env:`, or behind `pull_request_target`.
- **Breaks**: rotation is manual and now covers two places — Vercel and this secret. Rotating only
  in Vercel turns every review into `error` (red job, `ai-cr:failed`); a key leaked from CI
  invalidates the app's key as well.

### `REVIEW_PR_TITLE` / `REVIEW_PR_BODY`, `<pr_title>` / `<pr_description>`, `MAX_PR_BODY_BYTES`

- **Defined**: env names set in `.github/actions/ai-reviewer/action.yml:131-132` (from
  `review.yml:42-43`) and read in `tools/code-reviewer/src/index.ts:51-52`. Fence tags in
  `FENCE_TAGS` and `buildReviewPrompt` (`tools/code-reviewer/src/prompts/index.ts:19,57-63`),
  named in `SYSTEM_PROMPT` (`src/prompts/system-prompt.ts:16-17`). `MAX_PR_BODY_BYTES = 4000` in
  `src/prompts/index.ts:17`.
- **Contract**: the PR title and description are untrusted data that reach a script only through
  `env:`. Each is fenced in its own tag before the `<diff>`, every fence tag's closing form is
  escaped inside both, and the system prompt declares the fenced text data, not instructions. An
  empty field is treated as absent. The description is cut, not rejected, at `MAX_PR_BODY_BYTES`
  UTF-8 bytes on a character boundary and does not count toward `REVIEW_MAX_DIFF_BYTES`. The title
  has no cap.
- **Breaks**: renaming an env var on one side silently drops the PR context — the review still
  runs, on the diff alone. Renaming a tag in `buildReviewPrompt` without `SYSTEM_PROMPT` leaves the
  model told about fences that are not there; adding a fence without listing it in `FENCE_TAGS`
  lets the author close it early from the title or description. Interpolating `${{ ... }}` of the
  title or body into `run:` text is a script injection.

### `working-directory` input of `.github/actions/setup-node`

- **Defined**: `.github/actions/setup-node/action.yml:10-13`, default `"."`; it sets both the npm
  cache dependency path and the directory `npm ci` runs in.
- **Contract**: the four required jobs in `.github/workflows/ci-cd.yml` (`:41`, `:69`, `:95`,
  `:127`) call the action without it and rely on the default — the repo root. Only the reviewer
  passes `tools/code-reviewer` (`.github/actions/ai-reviewer/action.yml:51-53`).
- **Breaks**: changing the default, or renaming the input, installs the wrong package (or none) in
  all four required jobs at once and turns every one of them red.

### Daily run cap

- **Defined**: the "Warunki wstępne" step of `.github/actions/ai-reviewer/action.yml:86-98`, with
  the `daily-cap` input (`:42-45`, default `5`).
- **Contract**: the action counts runs of the workflow file `review.yml` created since 00:00 UTC
  (`created=>=<UTC date>`), excluding the current run and runs with `conclusion == "skipped"`
  (fork PRs, other labels). At or above the cap the run ends before the model call: outcome
  `daily-cap`, a comment, `ai-cr:failed` and a red job. Runs that ended without a model call
  (empty diff, missing model, an earlier cap hit) are still counted. Concurrency is per PR, so two
  runs from different PRs that start together can both see `cap - 1` and pass — the cap can be
  exceeded by one.
- **Breaks**: renaming `.github/workflows/review.yml` without the file name in the API path makes
  the query return 404 and the step fail, so every run is red. Raising the cap is a cost decision,
  not a fix for a red job.

### `AI code review` is not a required check

- **Defined**: the job `name:` in `.github/workflows/review.yml:19`; deliberately absent from
  `required_status_checks` in `.github/rulesets/master.json` (see "Job names — required-check
  contexts" under CI gates).
- **Contract**: the review is advisory. A missing model, an exhausted daily cap or a provider
  error must not block a merge into `master`.
- **Breaks**: adding it as a required context blocks every merge on a day the cap is reached or
  `REVIEW_MODEL` is unset — and a skipped job (fork PR) counts as passed, so it would not gate
  those PRs anyway.
