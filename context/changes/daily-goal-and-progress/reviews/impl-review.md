<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Dzienny cel kaloryczny i postęp

- **Plan**: context/changes/daily-goal-and-progress/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-09-30
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 6 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Automated checks (run 2026-09-30)

- `npm run lint`: 0 errors, 0 warnings
- `npm run typecheck`: 0 errors, 0 warnings, 38 hints (163 files)
- `npm run format:check`: all files formatted
- `npm run test`: 16 suites, 363/363 tests passing
- `npm run test:security`: passes; the only allowlisted advisory is still GHSA-9wv6-86v2-598j, with no new entry
- `npm run test:e2e`:
  - Default port 3000: webServer timeout, because port 3000 is taken by another process.
  - `E2E_PORT=3100`: 12 passed, 0 failed.

## Findings

### F1 — Cel w dzienniku może być nieświeży po przejściu z profilu przez ClientRouter + prefetch

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/diary.astro:10-18, astro.config.mjs:39, tests/e2e/daily-goal.spec.ts:84-106
- **Detail**: The goal reaches the diary only as an SSR prop, so it is only as fresh as the diary HTML. The plan assumes that "przejście przez `ClientRouter` i tak pobiera świeży SSR".
  - Hovering the "Dziennik" link can prefetch `/diary`. This happens because `prefetch: true` and `<ClientRouter />` are both on, and `prefetchAll` is on by default with ClientRouter. Chromium keeps a prefetched page for about 5 minutes.
  - Failure scenario: on `/profile`, hover "Dziennik", save or clear the goal, then click "Dziennik". The diary shows the old goal, or a bar for a goal that was just removed.
  - The E2E cannot catch this, because it navigates with `page.goto` (a hard load) rather than the router.
  - Not verified in a browser.
- **Fix A ⭐ Recommended**: Reproduce the steps by hand. If they reproduce, set `Cache-Control: no-store` in the `diary.astro` frontmatter (`Astro.response.headers.set(...)`) and switch the E2E to navigating by clicking "Dziennik".
  - Strength: fixes it at the source (the page's freshness) with one line. The E2E then covers the real path.
  - Tradeoff: needs a manual check first. The effect of `no-store` on a `rel=prefetch` cache varies by browser.
  - Confidence: MED — the mechanism is plausible from the Astro prefetch code, but it has not been observed.
  - Blind spot: whether Astro 7's prefetch with ClientRouter uses `<link rel=prefetch>` or `fetch()`.
- **Fix B**: Have the island re-read `GET /api/user-settings` after hydration, keeping the SSR value as the initial state.
  - Strength: independent of any caching.
  - Tradeoff: brings back the second fetch the plan deliberately avoided, and the bar can flicker when the goal changes.
  - Confidence: HIGH — it always works.
  - Blind spot: none significant.
- **Decision**: DISMISSED — Fix A picked, but the problem did not reproduce, so the code is unchanged.
  - Test: a temporary Playwright test on the dev server (Chromium, `E2E_PORT=3100`) did hover "Dziennik" → saved goal 2000 → clicked "Dziennik". It was deleted afterwards.
  - Result: the prefetch fetched `/diary` on hover. On the click, ClientRouter fetched it again from the network (`fromPrefetchCache: false`, `fromDiskCache: false`, 200), and the island received `{"dailyGoal":[0,2000]}`.
  - Not checked: cache headers on Vercel.

### F2 — Parasol `radix-ui` zamiast jednego prymitywu; dwa style importów Radix w `ui/`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence / Pattern Consistency
- **Location**: package.json (`"radix-ui": "^1.6.7"`), package-lock.json (+~1880 lines), src/components/ui/progress.tsx:2
- **Detail**:
  - The plan expected "nowa zależność Radix (pakiet, który wskaże shadcn)", i.e. one package. `shadcn add` added the `radix-ui` umbrella instead, which brings about 79 packages into the lockfile, including about 60 `@radix-ui/react-*` primitives, `@floating-ui/*` and `react-remove-scroll*`. Only `Progress` is used.
  - `button.tsx` imports from `@radix-ui/react-slot` while `progress.tsx` imports from `radix-ui`, so `ui/` now mixes two import styles.
  - `test:security` passes, and no package version is duplicated.
- **Fix A ⭐ Recommended**: Replace the umbrella with `@radix-ui/react-progress` and change the import in `progress.tsx`.
  - Strength: matches the plan (one package) and the existing style in `button.tsx`, and shrinks the install and the Vite pre-bundle.
  - Tradeoff: every later `shadcn add` will emit `radix-ui` again, so each import will need the same edit by hand.
  - Confidence: HIGH — a one-line import change plus `npm uninstall` / `npm install`.
  - Blind spot: after a dependency change, clear the `node_modules/.vite` pre-bundle (see docs/reference/astro-react-runtime.md).
- **Fix B**: Keep the umbrella, move `button.tsx` to `import { Slot } from "radix-ui"`, drop `@radix-ui/react-slot`, and record the choice in AGENTS.md under "Styling & UI".
  - Strength: matches current shadcn output, so future `add` calls need no manual edits.
  - Tradeoff: the whole Radix tree stays in dependencies; it is tree-shaken from the build.
  - Confidence: HIGH.
  - Blind spot: none significant.
- **Decision**: FIXED (Fix A).
  - `radix-ui` replaced by `@radix-ui/react-progress@^1.1.16`, and `progress.tsx` now uses `import * as ProgressPrimitive from "@radix-ui/react-progress"`. The lockfile shrank by about 1740 lines.
  - Afterwards: typecheck 0 errors, lint clean, `test:security` passes.

### F3 — Czytnik ekranu słyszy „100%” przy przekroczeniu celu

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/diary/DailyGoalProgress.tsx:30
- **Detail**: Radix `Progress.Root` sets `aria-valuetext` to "N%" by default. `percent` is capped at 100, so at 2350/2000 the screen reader hears "100%", and the text "350 kcal ponad cel" is not tied to the bar. This is the only place where the "przekroczenie to fakt podany neutralnie" state is lost for assistive-technology users.
- **Fix**: Pass `getValueLabel={() => text}` (the same text as `diary-goal-text`), or add `aria-describedby` pointing at the id of the text element.
- **Decision**: FIXED — `getValueLabel={() => description}`, sharing one `description` string with `diary-goal-text`.

### F4 — Prymityw `Progress` na stałe w kolorach celu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/components/ui/progress.tsx:10,16
- **Detail**: The plan calls for replacing `bg-primary*` with `bg-progress-track` / `bg-progress` inside the primitive, and that is what was done. As a result, every future `<Progress>` in the app will be goal-teal. The name `--progress` suggests this, but the token comment in `global.css` only describes the daily goal bar.
- **Fix**: Add one sentence to the `--progress` comment in `global.css` saying it is the app-wide progress colour, not just the goal's.
- **Decision**: FIXED — the `:root` comment in `global.css` now calls it the app-wide progress colour, read by `ui/progress.tsx`.

### F5 — Błąd pobrania/zapisu wygląda jak błąd walidacji pola

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/profile/DailyGoalCard.tsx:53, 96-99
- **Detail**:
  - `displayedError` falls back to the hook's `error`. A failed GET therefore marks the input red with `aria-invalid` and `role="alert"`, and typing does not clear it: `onChange` clears only `validationError`.
  - After a failed load, the card also looks exactly like "no goal": an empty field and no "Usuń cel".
- **Fix**: Show load and save failures with `showToast(..., "error")`, and keep `displayedError` limited to `validationError`.
- **Decision**: FIXED.
  - `useDailyGoal` now raises the load or save error as a toast itself, because it is the part that knows the message. This keeps the `saveGoal(): Promise<boolean>` contract.
  - In `DailyGoalCard`, `displayedError` is now only `validationError`.

### F6 — `type="number"` gubi komunikaty walidacji

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/profile/DailyGoalCard.tsx:16-26, 90
- **Detail**:
  - The browser returns `""` for `1e`, `2 000` and, in some browsers, `2000,5`. The user then sees "Wpisz cel w kcal" even though they typed something.
  - `1e3` goes through as 1000.
  - Nothing wrong gets saved, because the route validates too.
- **Fix**: Accept as is, or switch to `type="text" inputMode="numeric"` with a `/^\d+$/` check before `Number()`.
- **Decision**: FIXED.
  - The input is now `type="text" inputMode="numeric"`, checked against `/^\d+(?:[.,]\d+)?$/` before `Number()`.
  - Non-numeric text gets "Cel musi być liczbą", and a fraction gets the schema's "…liczbą całkowitą".
  - Tests added for `1e3` and `2000,5`, and the seed assertion now expects a string.

### F7 — Dowód RLS nie sprawdza ścieżki upsert

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/checks/user-settings-rls.sql:141-215
- **Detail**: The script covers plain INSERT, UPDATE and DELETE, with positive controls. It does not cover `INSERT … ON CONFLICT (user_id) DO UPDATE`, which is the only path the service uses. The policies should block B upserting with `user_id = A` (42501), but the proof does not show it.
- **Fix**: Add one upsert by B on A's row (expecting `insufficient_privilege`) and one own-row upsert as a positive control.
- **Decision**: FIXED.
  - Added the assertions `b_upsert_za_a = 'odrzucone'` and `b_upsert_wlasny = 1`. B's attempt on A's row runs before 3g, so `a_nietkniety` also covers it.
  - Still to do by hand: run the script in the SQL editor with two real UUIDs and expect `[PASS]`.

### F8 — `DailyGoalCard.test.tsx` pokrywa tylko 2 ścieżki

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: tests/unit/DailyGoalCard.test.tsx
- **Detail**: The unplanned (but welcome) test covers seeding and a valid save. It does not cover:
  - the validation messages for 300, 20000, empty input and decimals, which are manual criterion 3.6;
  - "Usuń cel" and the reset to an empty field (3.5);
  - a failed save keeping the typed text.
- **Fix**: Add three cases: out of range with no PUT, clear followed by an empty field, and a failed save.
- **Decision**: FIXED.
  - Added "Usuń cel" (PUT `null`, empty field, no button).
  - Added a failed save: the typed text stays, the error toast shows, and the field is not marked invalid.
  - Validation was already covered by F6. 8/8 tests pass.

### F9 — Brak śladu zrzutów kitchen-sink (4.6)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: N/A (Progress 4.6)
- **Detail**: Item 4.6 (screenshots of `/dev/diary-goal-states` in light and dark themes at 375 px) is marked `[x]`. Nothing in the repo or the change folder records it: no files and no description. CLAUDE.md treats the screenshot gate as the visual gate for a change. The other manual items (1.5, 3.4–3.7, 4.7–4.9, 5.3) can reasonably be taken on trust.
- **Fix**: Save the screenshots, or a short note on what was checked, in `context/changes/daily-goal-and-progress/`.
- **Decision**: FIXED.
  - Four screenshots (light/dark × 375/desktop) plus a README are in `context/changes/daily-goal-and-progress/screenshots/`, taken after F2 and F3.
  - Found along the way, outside this change: at 375 px `TopNav` runs off the screen.

## Triage summary (2026-09-30)

- **Fixed**: F2 (Fix A), F3, F4, F5, F6, F7, F8, F9 (8)
- **Dismissed**: F1 — did not reproduce (1)
- **Manual step still open**: rerun `supabase/checks/user-settings-rls.sql` in the SQL editor (F7) and expect `[PASS]`.

Gates after the fixes:

- lint: clean
- typecheck: 0 errors
- format:check: clean
- `npm run test`: 367/367
- test:security: passes
- `E2E_PORT=3100 npm run test:e2e`: 12/12
