<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Manual Diary Entry (S-01)

- **Plan**: `context/changes/manual-diary-entry/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-23
- **Verdict**: REVISE → SOUND (after triage)
- **Findings**: 2 critical, 4 warnings, 2 observations

## Verdicts

| Dimension | Verdict | After fixes |
|-----------|---------|-------------|
| End-State Alignment | FAIL | PASS |
| Lean Execution | PASS | PASS |
| Architectural Fitness | WARNING | PASS |
| Blind Spots | FAIL | WARNING (F6 skipped) |
| Plan Completeness | WARNING | PASS |

## Grounding

13/13 paths ✓, 6/6 symbols ✓, brief↔plan ✓.
Progress↔Phase: one `## Progress` heading, 3/3 phases matched by number, 28/28 success criteria
mapped (27 original + 2.12 added by F2), no checkboxes outside Progress ✓.

## Findings

### F1 — Client-side "today" has no timezone rule

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — `useSelectedDay.ts`, `DayNavigator.tsx`
- **Detail**: The plan feeds `entry_date` from the client and cites the migration comment, but never
  says how the first `YYYY-MM-DD` is produced. No date helper exists in the repo; the obvious
  `new Date().toISOString().slice(0,10)` returns the UTC day — in Warsaw between 00:00 and 02:00 that
  is yesterday, verbatim the failure the migration comment at `:29-31` warns about. Nothing in the
  test plan catches it: E2E enters on a fixed URL date, unit tests cover `summarizeDay` and the
  schemas, and manual verification passes during the day.
- **Fix**: New pure module `src/lib/utils/diary-day.ts` with `toLocalDay` / `addDays` / `isAfter`
  built from `getFullYear()`, `getMonth() + 1` and `getDate()`; `toISOString()` banned for
  `date`-typed values; plus `tests/unit/diary-day.test.ts` pinning 23:30 and 00:30 local.
- **Decision**: FIXED

### F2 — `max` cannot be the only future-date gate when the day lives in the URL

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Desired End State / Phase 2 `DayNavigator` / "What We're NOT Doing"
- **Detail**: Desired End State promised "The form refuses a date later than today" with `max={today}`
  as the only named gate. But the panel's state is `?date=`, advertised as a feature, and the Phase 3
  page object's `goto(day)` enters straight at `/diary?date=<day>` — the URL never passes through the
  input. `/diary?date=2030-01-01` therefore renders a future day and the form posts that `entry_date`
  with no revalidation: the schema only checks the date exists, the service checks nothing, and the
  table has no constraint on `entry_date`. With no `DELETE` route until S-05 the row cannot be
  removed. `max` is also soft — a typed out-of-range value still fires `change`, and the input is not
  inside a `<form>` whose submit would run constraint validation.
- **Fix A ⭐ Recommended**: Clamp in `useSelectedDay` — a resolved day later than today falls back to
  today and `replaceState` corrects the URL.
  - Strength: one place, purely client-side, keeps the timezone decision off the server as intended;
    also covers a typed out-of-range value, since `onChange` goes through `setDay`.
  - Tradeoff: a link to a future day silently lands on today.
  - Confidence: HIGH.
  - Blind spot: inherits F1's "today", so F1 must land first.
- **Fix B**: Server-side check in `createDiaryEntrySchema` against UTC-today plus a day of slack.
  - Strength: holds for any client, including curl.
  - Tradeoff: reverses the deliberate decision not to pick a timezone server-side; the slack still
    lets "tomorrow" through for some users.
  - Confidence: MEDIUM.
- **Decision**: FIXED via Fix A (Desired End State reworded; success criterion 2.12 added)

### F3 — `setDay`'s notification mechanism left as a choice

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 — `useSelectedDay.ts`
- **Detail**: The plan spots that `pushState` fires no `popstate` and offers "dispatch a
  `PopStateEvent` or own its subscriber list", leaving the choice open. They are not equivalent:
  `useSecurityGuard.ts:28-32` answers every `popstate` with `fetch("/api/auth/me")` and `/diary`
  mounts `SecurityGuard`, so a synthetic event costs an auth round-trip on every arrow, every date
  pick and every **Dziś** — and broadcasts globally. The repo already has the other mechanism twice
  (`ThemeToggle.tsx:10-14`, `useToast.ts:31-37`); `pushState` and synthetic `PopStateEvent` appear
  nowhere in it.
- **Fix**: Extend `useSearchParam` with a module-level listener `Set` and an exported
  `notifySearchParamChange()` following `ThemeToggle.tsx:10-14`; `setDay` calls it after `pushState`.
  The real `popstate` listener stays for the Back button. Purely additive for the three existing
  consumers (`LoginForm.tsx:21`, `SimpleChangePasswordForm.tsx:33`, `VerifyMessage.tsx:4-5`).
- **Decision**: FIXED

### F4 — `getEntriesForDay` orders without a tie-break

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — `DiaryService.getEntriesForDay`
- **Detail**: `created_at` defaults to `now()`, the transaction start time, so two entries can share a
  value and Postgres adds no tie-break — the same day can come back in a different order between two
  loads. The E2E spec adds exactly two entries on one day; it passes, but is one positional assertion
  from a flake, and S-05 addresses rows from this list.
- **Fix**: Add `id` (a `serial primary key`, monotone per insert) as the secondary sort key.
- **Decision**: FIXED

### F5 — `src/components/diary/` is outside AGENTS.md's closed set

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 — component file paths
- **Detail**: AGENTS.md enumerates
  `src/components/{ai,auth,common,feedback,layout,pages,profile,recipe}/` and `ls src/components/`
  confirms exactly those plus `ui/`. The plan adds a ninth directory without proposing an update,
  while arguing the diary is the first domain needing no `known-drift.md` entry.
- **Fix**: New Phase 2 step adding `diary` to that list in AGENTS.md, in the same commit as the
  components. (`src/hooks/diary/` needs no counterpart — hook directories are not enumerated.)
- **Decision**: FIXED

### F6 — Expired session on a POST lands in the JSON-parse path

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details / Phase 2 `useDiaryEntries`, `DiaryEntryForm`
- **Detail**: The plan establishes that the middleware redirects session-less `/api/*` to
  `/auth/login` and draws only the testing conclusion. A browser `fetch` follows that redirect and
  receives the login HTML at status 200, so `response.ok` is `true` and the cited hook patterns
  (`useRecipes`, `useUserStats.ts:24-35`) go straight to `response.json()`, which throws a
  `SyntaxError` — an error toast reading like a parse failure. `SecurityGuard` covers mount,
  `popstate` and `visibilitychange`, but not a form submit on a session that expired while the tab
  sat open. Every existing hook shares this hole; it is pre-existing drift whose cause the plan
  documented without following through.
- **Fix**: Treat `response.redirected === true` as an auth failure and call `forceLogout()` from
  `useSecurityGuard.ts:51-63`.
- **Decision**: SKIPPED — pre-existing drift, out of scope for this slice

### F7 — Three different numbers named "total"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 route contract, Phase 2 `useDiaryEntries` / `summarizeDay` / testids
- **Detail**: `DiaryEntriesDto` is `ResponseDto<DiaryEntryDto>` = `{ data, total }` where `total` is
  the row count (`src/types.ts:34,46`); `useDiaryEntries` was specified to return `total` (also rows);
  `summarizeDay` returns a "total" in kilocalories with testid `diary-total-calories`. Three
  quantities, one word, in the contract four later slices copy. Separately, nothing reads the API's
  `total`, yet `{ count: "exact" }` costs a second count query per request.
- **Fix**: `summarizeDay` returns `{ calorieTotal, missingCount, entryCount }`; `useDiaryEntries`
  returns `entryCount`; the DTO's `total` documented as existing only to satisfy `ResponseDto`.
- **Decision**: FIXED

### F8 — The calorie ceiling was justified by the wrong number

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — `src/lib/validations/diary/create-entry.ts`
- **Detail**: The plan justified a 100000 ceiling as preventing "a typo above the `int4` range" from
  becoming a 500. `int4` tops out at 2 147 483 647, so anything below that stores fine — the ceiling
  is a product judgement, not a technical floor. The low end is already held by the table's
  `check (calories is null or calories >= 0)` (migration `:39`). The brief flagged the number as
  "worth challenging at review".
- **Fix**: Ceiling lowered to **5000** by user decision — a single entry above 5000 kcal is a typo,
  not a meal — and the rationale restated, naming 2 147 483 647 as the only technical limit.
  `plan-brief.md` updated to match.
- **Decision**: FIXED (with a changed value: 100000 → 5000)
