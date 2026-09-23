<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Manual Diary Entry (S-01)

- **Plan**: `context/changes/manual-diary-entry/plan.md`
- **Scope**: Full plan (Phases 1–3 of 3)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-09-23
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 5 warnings, 5 observations
- **Commits**: `053dd72` (p1), `9ab80b8` (p2), `f1c78f7` (p3); base `afb24bd`

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Automated verification (re-run at review time)

| Gate | Result |
|---|---|
| `npm run typecheck` | 0 errors, 0 warnings (130 files) |
| `npm run lint` | clean |
| `npm run format:check` | clean |
| `npm run build` | succeeded (16.2s) |
| `npm run test` | 6 suites, 97 tests passed |
| `npm run test:e2e` | 2 passed (`E2E_PORT=3100`; the default 3000 was held by a foreign process — harness, not the change) |
| `npm run test:security` | passed (one allowlisted advisory, `GHSA-9wv6-86v2-598j`) |

## Checked and deliberately not filed

- **No server-side upper bound on `entry_date`.** Plan, *What We're NOT Doing*: "No server-side
  rejection of future dates… a server-side comparison would have to pick a timezone." The clamp in
  `useSelectedDay` is the stated gate. Decision honoured, not a defect.
- **500 responses echo `Error.message`** (`src/pages/api/diary-entries/index.ts:47-55, 102-110`) and
  `getEntriesForDay` selects without `.limit()` — both copied verbatim from the route exemplar
  `src/pages/api/recipes/index.ts`. Repo-wide, not a regression introduced here.
- All eight *What We're NOT Doing* boundaries verified clear: no AI, no recipe columns, no
  PUT/DELETE, no goal, no `CleanupService` extension, no new dependency, no migration, no
  `preferences/index.ts` repair.

## Findings

### F1 — Malformed `?date=` reaches the API and loops the error state

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/hooks/diary/useSelectedDay.ts:42-47
- **Detail**: `resolveDay` checks only "not in the future" — never the shape of the query parameter.
  `isAfter` is a lexicographic string compare, so any malformed value sorting before today passes
  through untouched. `/diary?date=2026-02-31` — the exact "syntactically valid, does not exist" case
  the plan's *Critical Implementation Details* raises — reaches `useDiaryEntries`, which fetches
  `/api/diary-entries?date=2026-02-31`, gets the correct 400, and renders the error banner whose
  "Spróbuj ponownie" button re-issues the same doomed request. `<input type="date">` renders blank
  next to it. The plan states a day "can be reached by a link", so this path is a supported entry
  point, and the hook's own comment at `:61` claims it is "the real gate on dates" — it should own
  the shape as well as the bound.
- **Fix**: Run `entryDateSchema` (from `src/lib/validations/diary/create-entry.ts`) inside
  `resolveDay` and fall back to `today` when it fails, reusing the clamp's existing `replaceState`
  rewrite so the address bar is corrected the same way a future date is.
  - Strength: Closes the shape hole at the single place the plan already nominated as the gate, with
    no new rule — the schema is already exported and already shared by both schemas.
  - Tradeoff: `useSelectedDay` gains a dependency on the validations module; the clamp branch has to
    widen from "is after today" to "is not a usable day".
  - Confidence: HIGH — reproduced by reading the lexicographic compare; `entryDateSchema` is
    exported and already unit-tested for `2026-02-31`.
  - Blind spot: None significant.
- **Decision**: FIXED — walidacja entryDateSchema w resolveDay + korekta adresu (isUsableDay)

### F2 — `today` is computed once during render and never refreshed

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/hooks/diary/useSelectedDay.ts:57
- **Detail**: `const today = isClient ? toLocalDay(new Date()) : null;` reads the clock during render
  with no timer, no `visibilitychange`/`focus` listener and no store notification tied to it. A tab
  left open across midnight keeps yesterday as `today`: the entry typed at 00:10 is written with
  yesterday's `entry_date`, "Dziś" reads as already-selected and the forward arrow stays disabled.
  This is the same failure the plan spent a paragraph closing (`20260922140906_...sql:29-31`, a meal
  at 01:30 filed under the previous day) — closed against the UTC offset, left open against wall
  time. It is also an impure read during render, which the React Compiler may cache, making the
  staleness permanent for the island's lifetime rather than self-healing on the next re-render.
- **Fix A ⭐ Recommended**: Derive `today` through `useSyncExternalStore` with a `subscribe` that
  fires on `visibilitychange` and `focus`.
  - Strength: The file already uses `useSyncExternalStore` for `isClient`, so the shape is local
    precedent, not a new mechanism; it also removes the impure render read the compiler rules dislike.
  - Tradeoff: A day only rolls over when the tab is re-focused — a visible-but-idle tab still shows
    the stale day until something wakes it.
  - Confidence: HIGH — same pattern as `useSearchParam.ts` and `ThemeToggle.tsx`.
  - Blind spot: Whether a day flipping under the user mid-session needs a visible cue rather than a
    silent swap.
- **Fix B**: Leave the code and record the limit — a diary session is short, and S-06 will revisit
  the day boundary when the daily goal lands.
  - Strength: No change to a hook three later slices inherit, days before S-02 starts.
  - Tradeoff: The entry written at 00:10 stays silently misfiled, and S-05 (edit/delete) has no way
    to surface it — the row looks correct everywhere except the day it belongs to.
  - Confidence: MEDIUM — depends on whether anyone actually logs meals past midnight, which is
    exactly the user the migration comment was written about.
  - Blind spot: Not verified whether React Compiler currently caches this read in the built output.
- **Decision**: FIXED via Fix A — today przez useSyncExternalStore (subscribe: focus + visibilitychange), isClient usunięty

### F3 — Seven of the fourteen planned `data-testid` names were renamed

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/diary/DayNavigator.tsx:32,38,62,71,93; DiaryEntryList.tsx:146; DiaryDaySummary.tsx:118,122
- **Detail**: Phase 3 item 3 enumerates the vocabulary in `<domena>-<element>-<typ>` form. Shipped
  instead: `diary-day-input`→`day-date-input`, `diary-prev-day-button`→`day-previous-button`,
  `diary-next-day-button`→`day-next-button`, `diary-today-button`→`day-today-button`,
  `diary-entries-list`→`diary-entry-list`, `diary-total-calories`→`diary-day-total`,
  `diary-missing-values`→`diary-day-missing`. It is self-consistent — the page object and the spec
  use the new names, which is why the suite passes — but the four navigator ids drop the `diary-`
  domain prefix entirely, so `day-next-button` no longer says which feature owns it, and S-06 adds a
  second day-stepping surface. Today neither the code nor the plan describes the other.
- **Fix A ⭐ Recommended**: Rename the seven ids in the components, `DiaryPage.ts` page object and
  `diary-entry.spec.ts` back to the planned vocabulary, then re-run `npm run test:e2e`.
  - Strength: Restores the domain prefix before S-02/S-03/S-06 copy the naming, and leaves the plan
    true without editing it.
  - Tradeoff: Touches three files plus the spec for zero behaviour change.
  - Confidence: HIGH — the ids are referenced only from `DiaryPage.ts` and the one spec.
  - Blind spot: None significant.
- **Fix B**: Amend Phase 3 item 3 in the plan to record the names actually shipped.
  - Strength: Cheapest, and the shipped names are internally coherent.
  - Tradeoff: Keeps `day-*` ids with no domain prefix as the precedent the next three slices inherit.
  - Confidence: MEDIUM — depends whether S-06's day surface will collide.
  - Blind spot: No check of what naming S-02/S-03 assume.
- **Decision**: FIXED via Fix B — plan Faza 3 pkt 3 zaktualizowana o słownik, który faktycznie wszedł, z notatką dla S-06

### F4 — Field errors are not programmatically associated with their inputs

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/diary/DiaryEntryForm.tsx:168, 194, 219
- **Detail**: Each error renders as a bare `<p className="text-xs text-destructive">` with no `id`,
  no `aria-describedby` on the input, no `aria-invalid` and no `role="alert"`. The only other signal
  is the `border-destructive` class — colour alone. A screen-reader user submitting an empty
  description hears nothing change. The repository already does this correctly:
  `src/components/profile/ProfilePage.tsx:273-286` pairs `aria-invalid={!!formError}` +
  `aria-describedby` with `<p id="preference-error" role="alert">`, and `PreferenceChip.tsx:163-188`
  repeats it. `htmlFor`/`id` on the labels is correct, so only the error wiring is missing.
- **Fix**: Copy the `ProfilePage.tsx:273-286` pattern onto all three fields — `aria-invalid`,
  `aria-describedby` pointing at an `id`'d error paragraph carrying `role="alert"`.
- **Decision**: FIXED — aria-invalid + aria-describedby + role="alert" na trzech polach, wg ProfilePage.tsx:273-286

### F5 — An `entry_date` validation failure is stored but never rendered

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/diary/DiaryEntryForm.tsx:95-104
- **Detail**: The submit handler validates the whole `createDiaryEntrySchema`, `entry_date` included,
  and copies every issue into `errors` keyed by field. Only `content`, `amount_text` and `calories`
  have a rendering block. An `entry_date` issue therefore sets state, returns early and draws
  nothing: the button does nothing at all, with no message, indefinitely. Reachable today through
  F1's malformed-day path; independent of it once F1 is fixed, but a silent dead submit is the worst
  available failure mode and costs three lines to close.
- **Fix**: Render any error key without its own field block in a form-level `role="alert"` box above
  the submit button.
- **Decision**: FIXED — blok role="alert" na poziomie formularza (data-testid diary-form-error) dla błędów bez własnego pola; słownik w planie uzupełniony

### F6 — `roadmap.md` edited outside the plan and now contradicts `change.md`

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/foundation/roadmap.md
- **Detail**: Two lines moved `planning` → `in-progress` (the S-01 table row and the S-01
  `**Status:**` line). No *Changes Required* section mentions the file, so it is undescribed scope —
  benign bookkeeping on the slice's own source document, except that it is now stale: `change.md`
  reads `status: implemented`, every Phase-3 gate is ticked, and the roadmap still says
  `in-progress`.
- **Fix**: Move both S-01 lines to the roadmap's completed status value.
- **Decision**: FIXED — S-01 przestawione na done w wierszu tabeli i w linii Status (roadmap.md:49,107)

### F7 — Phase 3 Progress rows carry no commit SHA

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/manual-diary-entry/plan.md (`## Progress`, rows 3.1–3.8)
- **Detail**: Phases 1 and 2 follow the convention (`— 053dd72`, `— 9ab80b8`). All eight Phase 3 rows
  are ticked with no suffix, although `f1c78f7` is the commit that closed them. Per
  `references/progress-format.md` the SHA is appended at phase end; mid-phase SHA-less rows are
  valid, but the phase is closed.
- **Fix**: Append ` — f1c78f7` to rows 3.1 through 3.8.
- **Decision**: FIXED — sufiks — f1c78f7 dopisany do wierszy 3.1–3.8

### F8 — `Number()` accepts exponent and hex literals in the calories field

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/diary/DiaryEntryForm.tsx:34
- **Detail**: `values.calories.trim() === "" ? null : Number(values.calories)` handles the cases that
  matter — empty → `null`, `"abc"` → `NaN` → rejected by Zod v4, `"1.5"` → rejected by `.int()`,
  `"007"` → 7. But `"1e3"` silently becomes 1000 kcal and `"0x1f"` becomes 31; both clear every
  schema check and are stored. The field is `type="text"` by deliberate decision (documented in the
  component), so `inputMode="numeric"` is only a keyboard hint.
- **Fix**: Gate on `/^\d{1,5}$/` before converting so anything else raises the existing "Kalorie
  muszą być liczbą" message.
- **Decision**: FIXED — parseCalories z bramką /^[0-9]{1,5}$/ przed Number(); wszystko inne wraca jako NaN i dostaje istniejący komunikat

### F9 — `addDays` has no DST-crossing test, though DST is why it uses `Date.UTC`

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: tests/unit/diary-day.test.ts:78-110
- **Detail**: The suite covers month, year and leap-day boundaries, and the UTC-vs-local trap is
  pinned hard for `toLocalDay` at 23:30 and 00:30. `addDays` is not: `diary-day.ts:8-9` documents
  `Date.UTC` as chosen precisely to survive DST, yet rewriting it as
  `new Date(y, m, d + delta)` would still pass all 74 tests and would then shift a day across the
  last Sunday in March or October.
- **Fix**: Add `expect(addDays("2026-03-28", 1)).toBe("2026-03-29")` and
  `expect(addDays("2026-10-24", 1)).toBe("2026-10-25")` with a comment naming the DST boundary.
- **Decision**: FIXED — describe "na granicy zmiany czasu" z dwoma przypadkami (2026-03-28, 2026-10-24); zakres celowo wąski

### F10 — A malformed POST body returns 500 where 400 is correct

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/diary-entries/index.ts:77
- **Detail**: `const rawData = await request.json();` is unguarded, so a body that is not JSON throws
  into the outer `catch` and is answered with a 500. The plan's own Phase 1 criterion — malformed
  input answers 400, not 500 — is met for the date but not for the envelope. Inherited verbatim from
  `src/pages/api/recipes/index.ts:114`, so it is pattern-consistent; noted because this route is the
  first written to the rule rather than grandfathered against it.
- **Fix**: `await request.json().catch(() => null)` and treat `null` as a validation failure through
  the existing 400 branch.
- **Decision**: FIXED — request.json().catch(() => null); null nie przechodzi schematu i wraca istniejącą 400

## Triage outcome (2026-09-23)

All ten findings decided; nine fixed in code or tests, one (F3) resolved by amending the plan.

| Finding | Decision | Landed in |
|---|---|---|
| F1 | FIXED | `src/hooks/diary/useSelectedDay.ts` — `isUsableDay` runs `entryDateSchema` before the clamp |
| F2 | FIXED via Fix A | `src/hooks/diary/useSelectedDay.ts` — `today` via `useSyncExternalStore` (`focus`, `visibilitychange`) |
| F3 | FIXED via Fix B | `plan.md` Phase 3 item 3 — vocabulary amended to what shipped, with a note for S-06 |
| F4 | FIXED | `src/components/diary/DiaryEntryForm.tsx` — `aria-invalid` / `aria-describedby` / `role="alert"` on all three fields |
| F5 | FIXED | `src/components/diary/DiaryEntryForm.tsx` — form-level `role="alert"` block (`diary-form-error`) |
| F6 | FIXED | `context/foundation/roadmap.md:49,107` — S-01 set to `done` |
| F7 | FIXED | `plan.md` Progress rows 3.1–3.8 — ` — f1c78f7` appended |
| F8 | FIXED | `src/components/diary/DiaryEntryForm.tsx` — `parseCalories` gates on `/^[0-9]{1,5}$/` |
| F9 | FIXED | `tests/unit/diary-day.test.ts` — DST-boundary describe, deliberately two cases only |
| F10 | FIXED | `src/pages/api/diary-entries/index.ts` — `request.json().catch(() => null)` |

Gates re-run after the fixes: `typecheck` 0 errors · `lint` clean · `format:check` clean ·
`build` succeeded · `test` 6 suites / 99 tests passed (was 97) · `test:e2e` 2 passed
(`E2E_PORT=3100`).

Note on F6: `roadmap.md:208` names `/10x-archive` as the writer of the `done` flip. Setting it here
is idempotent for that skill but runs one step ahead of archiving.
