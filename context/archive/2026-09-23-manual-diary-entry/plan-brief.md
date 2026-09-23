# Manual Diary Entry — Plan Brief

> Full plan: `context/changes/manual-diary-entry/plan.md`

## What & Why

Roadmap **S-01** turns the diary table shipped by F-01 into something a person can use: a `/diary`
page where they pick a day, write down what they ate, optionally type a calorie number, and see the
day's total. This is the module's floor — the PRD's guarantee is that the diary stays fully usable
when calorie estimation is unavailable, and a hand-typed number is the one source that never fails.
Everything after this slice (AI estimation, entries from recipes, editing, the daily goal) inherits
the API contract and the day panel built here.

## Starting Point

F-01 delivered the data layer and stopped there: the `diary_entries` table with `calorie_origin_enum`,
RLS with eight per-user policies, an index on `(user_id, entry_date)`, and the derived TypeScript
types. `grep -il diary src/` matches two generated type files and nothing else — no route, no
service, no hook, no component, no page. The wider codebase supplies every pattern this needs
(`recipes/index.ts` for routes, `ai.service.ts` for a server service, `useRecipes.ts` for data hooks,
`useSearchParam.ts` for external state) but has **no date input, no date library and no navigation
abstraction** at all.

## Desired End State

A **Dziennik** item appears in the top navigation and opens on today. The user types what they ate,
optionally an amount and optionally a number of calories, and the entry shows up in the day's list at
once. The summary line shows the day's total and, when some entries carry no value, says how many
values are missing instead of presenting an understated sum as complete. Arrows, a date field and a
**Dziś** button move between days, and the day lives in the address bar, so a reload or a shared link
lands on the same day.

## Key Decisions Made

| Decision                        | Choice                                                            | Why (1 sentence)                                                                                                             | Source   |
| ------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------- |
| Calorie value on save           | Optional — an entry can be stored with no number                   | Builds FR-011's honest partial total once, in the floor slice, instead of retrofitting it into a finished list during S-02.   | Plan     |
| Day selection and its home      | Native date input + arrows + **Dziś**, day kept in `?date=`        | `useSearchParam` already reads the query string, so the day survives a reload and a link, with no new dependency.             | Plan     |
| Entry form placement            | Inline above the day's list, always visible                        | A diary takes several entries per session and a modal charges an open-and-close for each one.                                 | Plan     |
| Edit and delete                 | Out — S-01 creates and lists only                                  | Keeps the roadmap's slice boundary; FR-005's "recalculate only on request" rule has nothing to recalculate before S-02.       | Roadmap  |
| Daily total                     | Computed on the client from the day's list                         | The day's list is small and never paginated, so the API stays a plain `DiaryEntriesDto` with no new response contract.        | Plan     |
| Future dates                    | Clamped to today in `useSelectedDay`, on the client                | A server-side check would have to pick a timezone, and the F-01 migration comment records what picking the wrong one costs.   | Plan     |
| Test scope                      | Unit tests plus one E2E walk on a past signature date              | Without a `DELETE` route there is nothing to clean up with, so the run's rows sit under a day nobody opens.                   | Plan     |
| Value origin                    | Set by the server, never sent by the client                        | Otherwise a hand-typed number could be stored as an AI estimate and the PRD's provenance guarantee is false from day one.     | Plan     |

## Scope

**In scope:** `GET`/`POST` under `/api/diary-entries`; Zod schemas in `src/lib/validations/diary/`; a
server-side `DiaryService`; the `/diary` page and its React island (day navigator, inline form, day
list, summary); a pure day-summary module; one navigation item; unit tests and one E2E spec.

**Out of scope:** every AI path (S-02, S-04), recipe search and portions (S-03), editing and deleting
(S-05), the daily goal and progress bar (S-06), server-side future-date rejection, cleanup of E2E
rows, any repair of existing drift, and any new dependency.

## Architecture / Approach

```
/diary (Astro page, MainLayout guard)
  └── DiaryPage island (client:load)
        ├── useSelectedDay  ──> ?date= in the URL (useSearchParam)
        ├── useDiaryEntries ──> GET /api/diary-entries?date=…
        │                          └── DiaryService.getEntriesForDay(userId, day)
        ├── DiaryEntryForm  ──> POST /api/diary-entries
        │                          └── DiaryService.createEntry(userId, command)
        └── DiaryDaySummary ──> summarizeDay(entries)   [pure, src/lib/utils]
```

The route parses and responds; the service owns both queries and the rule that a calorie value and
its origin are written together. The summary is a pure function rather than component code so it is
testable without rendering and reusable by S-06's progress indicator.

## Phases at a Glance

| Phase                          | What it delivers                                               | Key risk                                                                                              |
| ------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1. Server contract             | Schemas, `DiaryService`, `GET`/`POST` route — testable by `curl` | This contract is inherited by four later slices; a mistake here is paid for repeatedly.                |
| 2. Diary surface               | Page, island, day navigator, inline form, list, summary, nav    | Three subtle client traps: hydration of "today", `pushState` not firing `popstate`, `set-state-in-effect`. |
| 3. Tests and closing the gate  | Unit tests, page object, E2E spec, full `code-quality` green    | E2E rows cannot be cleaned up without a `DELETE` route; isolation rests on the signature date.          |

**Prerequisites:** F-01 (`diary-entry-store`) applied to the linked Supabase project — migration,
RLS and regenerated types are all in place as of 2026-09-22. A working `.env.test` with
`E2E_USERNAME_ID` / `E2E_USERNAME` / `E2E_PASSWORD` for Phase 3.

**Estimated effort:** ~3 sessions, one per phase.

## Open Risks & Assumptions

- **Future dates are only gated in the browser.** Plan review found that `max` alone could not hold
  it — the day reaches the panel from `?date=`, which never passes through the input — so the gate
  is now a clamp in `useSelectedDay`. A request made outside the browser still stores any valid
  date, and with no `DELETE` route until S-05 such a row cannot be removed through the application.
  Accepted deliberately to avoid a server-side timezone decision.
- **E2E rows accumulate in the integration database.** One entry pair per run, parked on a past
  signature date. S-05 should add the `DELETE` route and extend `CleanupService`.
- **The 5000 ceiling on `calories` is invented by this plan**, not by the PRD. Challenged at plan
  review and lowered from 100000: a single entry above 5000 kcal is a typo, not a meal, so it
  fails as a field error. The `int4` limit (2 147 483 647) is the only technical one.
- **`MainLayout` vs `AppLayout` remains an unresolved repository drift.** The plan picks `MainLayout`
  because it carries the session guard, which means `/diary` is guarded twice; harmless, but it does
  not repay the drift.
- **The day's list is assumed small enough never to need pagination.** True at 3–4 users; the
  client-side total is the first thing that would have to move if that stops holding.

## Success Criteria (Summary)

- A user with no setup at all can open the diary, record a meal with a hand-typed calorie value, and
  see it in the day's total — no goal, no configuration, no AI involved.
- A day holding an entry without a value shows a total that says how many values it is missing,
  rather than a number that quietly understates the day.
- Every existing screen — recipes, profile, login, registration — behaves exactly as before, and
  `npm run typecheck` stays at zero errors.
