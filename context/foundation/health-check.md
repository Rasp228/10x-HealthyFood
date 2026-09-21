---
project: 10x-healthy-food
checked_at: 2026-09-21T00:00:00Z
health_status: needs-attention
context_type: brownfield
language_family: js
stack_assessment_available: true
checks_run:
  - lockfile
  - dependency_audit
  - outdated_deps
  - test_runner
  - ci_cd
  - configuration
audit_findings:
  critical: 0
  high: 3
  moderate: 0
  low: 0
test_runner_detected: true
ci_provider: GitHub Actions
recommended_fixes: 5
---

# Health Check: 10x-HealthyFood

## Dependency Health

### Lockfile

```
Status: present (package-lock.json)
Package manager: npm
```

`package-lock.json` is the only lockfile — no `yarn.lock`, `pnpm-lock.yaml` or `bun.lockb` competes
with it. `node_modules/` is installed, so every script in `package.json` runs from a clean checkout
after `npm ci`. The toolchain is pinned as well as the tree: `.nvmrc` carries Node 24.13.0 and the
composite action at `.github/actions/setup-node` reads the version from that file
(`node-version-file: .nvmrc`), so local and CI Node versions cannot drift apart.

### Security Audit

```
Tool: npm audit --json
Summary: 0 CRITICAL, 3 HIGH, 0 MODERATE, 0 LOW  (3 advisories over 1203 resolved packages)
Direct vs transitive: 1 direct (@astrojs/vercel) / 2 transitive
```

#### HIGH findings

The three advisories are one root cause reported at three points in a single dependency chain:
`@astrojs/vercel` (direct) → `@vercel/routing-utils` → `path-to-regexp`.

- **path-to-regexp** (transitive) — `GHSA-9wv6-86v2-598j`: the generated matcher backtracks, so a
  crafted path can drive quadratic matching time (CVSS 7.5, denial of service). Patched range is
  `>= 6.3.0`; the resolved copy sits in `4.0.0 - 6.2.2`.
- **@vercel/routing-utils** (transitive) — inherits the advisory through its `path-to-regexp` pin.
- **@astrojs/vercel** 11.0.10 (direct) — inherits it through `@vercel/routing-utils`.

**There is no safe local fix.** `@astrojs/vercel` is already at its latest release, and
`npm audit fix --force` "resolves" the chain by proposing `@astrojs/vercel@8.0.4` — a major
downgrade that drops the `x-astro-path` patch and forces a return to Astro 5. The advisory is
allowlisted in `audit-ci.jsonc` with a comment stating exactly that reasoning, which is why
`npm run test:security` passes while `npm audit` still reports three highs. The correct action is
review on the next adapter bump, not a version change today.

This chain is the only thing keeping the verdict below `healthy`. It is an accepted, documented risk
rather than an outstanding task.

### Outdated Dependencies

```
Packages with major version gaps: 4
```

- **typescript**: 5.9.3 → 7.0.2 (2 major versions behind). Not a casual bump — `astro check`,
  `ts-jest` and `typescript-eslint` all resolve the compiler, so the whole type pipeline moves
  together.
- **@types/node**: 24.13.5 → 26.6.2 (2 major versions behind). Runtime Node is pinned at 24.13.0,
  so the types should track the runtime, not the registry `latest`. The in-range patch is 24.13.6.
- **eslint**: 9.39.5 → 10.11.0 (1 major behind). Blocked upstream: `eslint-plugin-react` and
  `eslint-plugin-jsx-a11y` do not declare ESLint 10 support.
- **@eslint/js**: 9.39.5 → 10.0.1 (1 major behind). Moves with `eslint`; same block.

Four further packages are behind by a patch only: `jest` and `jest-environment-jsdom`
(30.5.1 → 30.5.2), `dotenv` (18.0.0 → 18.0.1), `@types/node` (24.13.5 → 24.13.6).

## Test Suite

```
Test runner: Jest 30.5.1 (ts-jest, ESM) + Playwright 1.63.0
Tests found: 23 unit tests across 2 suites; 1 E2E test in 1 spec
Test execution: passing
```

```
Configuration: jest.config.js (unit) / playwright.config.ts (E2E), types from tsconfig.test.json
Framework: ts-jest 29.4.12 with useESM, jsdom environment, @testing-library/react 16.3.3
```

`npm run test` completes at **23/23 passing** over `tests/unit/ThemeToggle.test.tsx` and
`tests/unit/validation-errors.test.ts`. `.astro` files have no Jest transformer and are excluded
from coverage, so page-level behaviour is Playwright's responsibility.

The Playwright harness enumerates cleanly — `TEST_MODE=true npx playwright test --list` injects five
variables from `.env.test` and lists `recipe-management.spec.ts` with page objects under
`tests/e2e/page-objects/`. Without `TEST_MODE` the guard in `tests/e2e/config/test-data.ts` throws
before collection, which is the intended behaviour: `npm run test:e2e` sets the flag.

Two limits worth naming rather than hiding. The suite is **3 files** against 110 type-checked source
files, and `jest.config.js` declares an 80% coverage threshold that CI never evaluates — the
`unit-tests` job runs `npm run test`, not `npm run test:coverage`. The threshold is a target for new
code, not a measurement of the current suite.

## CI/CD

```
Provider: GitHub Actions
Configuration: .github/workflows/ci-cd.yml
```

| Stage      | Status | Notes                                                        |
|------------|--------|--------------------------------------------------------------|
| Lint       | ✓      | `npm run lint` (`eslint .`), flat config in eslint.config.js  |
| Test       | ✓      | `npm run test` (Jest) and `npm run test:e2e` (Playwright)     |
| Build      | ✓      | `npm run build` (`astro build`), artifact uploaded 7 days     |
| Type check | ✓      | `npm run typecheck` (`astro check`)                           |
| Security   | ✓      | `npm run test:security` (`audit-ci --config audit-ci.jsonc`)  |

Five jobs run as `code-quality` → `build` → (`unit-tests` ‖ `e2e-tests`) → `status-comment`, with
concurrency cancellation on the same ref and per-job timeouts. `code-quality` runs its four gates in
one job, in order — lint, typecheck, format check, security audit — so nothing reaches `build`
without passing all four. `e2e-tests` runs against the `integration` environment with Supabase and
test-user credentials from secrets, and caches Playwright browsers keyed on `package-lock.json`.

All five stages were executed locally against the current tree and all five pass:

```
npm run lint          exit 0
npm run typecheck     0 errors, 0 warnings, 29 hints over 110 files
npm run format:check  All matched files use Prettier code style
npm run test:security Passed npm security audit (allowlisted: GHSA-9wv6-86v2-598j)
npm run build         Server built in 8.43s, Complete!
npm run test          23/23 passing
```

One forward-looking warning surfaces during lint: `lighthouserc.js:1` carries an `/* eslint-env */`
comment, which flat config no longer recognizes and which becomes an error in ESLint 10.

## Configuration

### High severity

None.

### Medium severity

None.

### Low severity

- **`lighthouserc.js`** — `/* eslint-env */` comment on line 1, deprecated under flat config and an
  error as of ESLint 10. Fix: replace with `/* global */` or declare the globals in
  `eslint.config.js`.

Everything expected is present and wired: `.editorconfig` (utf-8, lf, 2-space, final newline),
`.prettierrc.json` with a `.prettierignore` that excludes agent-written documents from the format
gate, `eslint.config.js` (flat, with `tseslint.configs.strict` and `eslint-plugin-react-hooks` v7),
`.gitignore`, `.env.example` and `.env.test.example`, `tsconfig.json` extending
`astro/tsconfigs/strict`, `tsconfig.test.json`, `components.json`, `audit-ci.jsonc`, and a Husky
`pre-commit` hook running `lint-staged`.

The instruction layer resolves end to end. Every `@`-reference in `AGENTS.md` and `CLAUDE.md` — 31
distinct paths — points at a file that exists, including the two that guard the riskiest rules:
`@context/foundation/lessons.md`, cited by the session-cookie hard rule at `AGENTS.md:28` and again
at `AGENTS.md:56`, and `@docs/reference/contract-surfaces.md` at `AGENTS.md:61`. `CLAUDE.md` lists
both under "Foundation paths", at lines 42 and 43. `git check-ignore` confirms `CLAUDE.md`,
`AGENTS.md`, `context/` and `docs/` are all tracked rather than excluded.

Two paths listed in `CLAUDE.md` are absent — `context/foundation/tech-stack.md` and
`context/deployment/deploy-plan.md`. Both are labelled optional inputs in that list rather than
rules to read, and both belong to skills this brownfield project never ran: `tech-stack.md` is
written by `/10x-tech-stack-selector`, which applies to greenfield work. They are unused slots, not
dangling pointers.

## Stack Assessment Cross-Reference

```
Stack assessment: context/foundation/stack-assessment.md
Agent readiness (from stack-assess): ready-with-compensation
```

| Quality Gate Gap                    | Health-Check Finding                                                   | Status     |
|-------------------------------------|------------------------------------------------------------------------|------------|
| Training data: Astro 7 — fail       | Build green on 7.3.3; `--ignore-lock` present in playwright.config.ts  | Mitigated  |
| Training data: Tailwind 4 — fail    | No `tailwind.config.js` on disk; CSS-first config intact in global.css | Mitigated  |
| Training data: Zod 4 — fail         | `validation-errors.ts` covered by a passing unit suite; 0 type errors  | Mitigated  |
| Training data: Jest 30 ESM — fail   | Runner executes cleanly, 23/23; but only 3 test files exist            | Reinforced |
| Documented: Jest-on-Astro — fail    | Setup works and is described in AGENTS.md; nothing upstream to cite    | Mitigated  |
| Typed — pass                        | `astro check` 0 errors / 110 files, gated in CI, zero `: any` in `src/` | Mitigated  |
| Gap 1: misleading service exemplar  | `AGENTS.md:37` now names `ai.service.ts` and flags the wrapper          | Closed     |
| Gap 2: dangling document references | Both files exist; all 31 `@`-references resolve                        | Closed     |
| Convention: Supabase — partial      | 3 of 15 API routes go through a server-side service                     | Reinforced |
| Convention: Zod — partial           | 7 of 15 API routes declare `z.object` inline                            | Reinforced |

Both gaps `stack-assessment.md` left open are closed. `AGENTS.md:37` now points server-side business
logic at `src/lib/services/ai.service.ts` — constructed with the request-scoped
`SupabaseClient<Database>` — and states explicitly that `recipe.service.ts` is a browser-side `fetch`
wrapper not to be modelled on, which removes the contradiction with the type-debt note at
`AGENTS.md:154`. `context/foundation/lessons.md` and `docs/reference/contract-surfaces.md` both exist
and are reachable from the "Project structure" bullets at `AGENTS.md:56` and `AGENTS.md:61`.

Of the five quality-gate failures recorded by the stack assessment, the operational evidence
mitigates four: the versions an agent's priors get wrong are exactly the versions that build,
type-check and test green, with `AGENTS.md` carrying the mechanism behind each rule. The one
reinforced is the Jest setup — the runner works, but a 3-file suite gives an agent very little to
verify a change against. The two remaining reinforcements are structural drifts the instruction
files contain but do not undo.

## Recommended Fixes

### Fix before agent work (Category A)

### 1. `path-to-regexp` advisory has no local fix — put it on the adapter bump

**Impact**: three HIGH advisories stay visible in `npm audit` with no action available today. The
risk is not the advisory but the temptation: `npm audit fix --force` proposes
`@astrojs/vercel@8.0.4`, which drops the `x-astro-path` patch and drags the project back to Astro 5.
An agent running audit remediation unattended will take that suggestion.
**Severity**: medium
**Effort**: quick (< 5 min)
**Fix**: nothing to change now. The allowlist entry in `audit-ci.jsonc` already carries the
reasoning. On every `@astrojs/vercel` bump, re-run:

```
npm audit --json
```

and remove `GHSA-9wv6-86v2-598j` from the allowlist once `@vercel/routing-utils` resolves
`path-to-regexp >= 6.3.0`. Never add a second allowlist entry without the same kind of comment.

### 2. Coverage threshold is declared but never evaluated

**Impact**: `jest.config.js` sets an 80% global threshold across branches, functions, lines and
statements, and nothing enforces it — the `unit-tests` job runs `npm run test`. With 3 test files
against 110 source files, an agent reading the config reasonably assumes a covered codebase and
writes fewer tests than the project actually needs.
**Severity**: medium
**Effort**: moderate (15–30 min)
**Fix**: decide which of the two is true and make the config say it. Either switch the CI step to
`npm run test:coverage` and accept a red build until coverage rises, or scope the threshold to the
directories new code lands in, so the gate measures new work rather than the whole tree.

### 3. Seven of fifteen API routes declare Zod schemas inline

**Impact**: `AGENTS.md` states schemas belong in `src/lib/validations/<domain>/<action>.ts`, but only
the three auth schemas live there. An agent reading the tree finds the inline pattern seven times
and the documented pattern three times, and pattern-matches on frequency. The routes carrying inline
schemas — under `api/ai/`, `api/preferences/` and `api/recipes/` — are exactly the ones new work
will sit beside.
**Severity**: medium
**Effort**: significant (> 1 hour)
**Fix**: move each inline `z.object` into `src/lib/validations/<domain>/<action>.ts`, following
`src/lib/validations/auth/login.ts`. Keep services receiving validated input without re-parsing, and
keep every failure exiting through `zodIssues` / `zodMessage`.

### 4. `/* eslint-env */` in lighthouserc.js will break the ESLint 10 upgrade

**Impact**: lint currently exits 0 but prints a deprecation warning on every run, local and CI. When
`eslint-plugin-react` and `eslint-plugin-jsx-a11y` gain ESLint 10 support and the upgrade becomes
available, this line turns the `code-quality` job red for a reason unrelated to the upgrade.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**: replace the `/* eslint-env */` comment on `lighthouserc.js:1` with a `/* global */` comment,
or declare the file's globals in `eslint.config.js`.

### 5. Patch-level updates available on four packages

**Impact**: minor, but the gap widens quietly and each skipped patch makes the eventual bump a
bigger diff to review. `@types/node` in particular should track the pinned runtime (24.13.x) rather
than the registry `latest` (26.x).
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**:

```
npm update jest jest-environment-jsdom dotenv @types/node
npm run typecheck && npm run test
```

Leave `typescript`, `eslint` and `@eslint/js` where they are — the first is a pipeline-wide move,
the other two are blocked by plugin peer ranges.

### Addressed in upcoming lessons (Category B)

None. The gaps that are normally deferred at this stage are already closed here: GitHub Actions runs
a five-stage pipeline with all five gates wired, `CLAUDE.md` and `AGENTS.md` are both present and
substantive, and deployment configuration exists through the Vercel adapter with
`context/foundation/infrastructure.md` alongside it. Every finding above is actionable now.

## Summary

```
Health status: needs-attention
```

The project is in good operational shape. All five CI gates pass against the current tree — lint
clean, `astro check` at 0 errors over 110 files, Prettier clean, security audit passing, production
build green in 8.43s — and the unit suite runs 23/23 while the Playwright harness enumerates without
complaint. Dependencies are pinned by lockfile and `.nvmrc`. The instruction layer is intact: all 31
`@`-references in `AGENTS.md` and `CLAUDE.md` resolve, the session-cookie rule reaches a real
`lessons.md`, and the server-side service exemplar points at `ai.service.ts` rather than at a
browser fetch wrapper.

The verdict stays at `needs-attention` for one reason only, and it is not a task on anyone's list:
three HIGH advisories remain live in `npm audit`, all three being one `path-to-regexp` backtracking
issue reached through `@vercel/routing-utils` inside an adapter already at its newest release. There
is no version to move to. The risk is accepted deliberately, recorded in `audit-ci.jsonc` with its
reasoning, and the security gate passes because of that allowlist rather than in spite of it. The
verdict flips to `healthy` the day upstream ships `path-to-regexp >= 6.3.0` — no local work required.

Everything else is a judgement call rather than a defect: an 80% coverage threshold that CI never
evaluates against a 3-file suite, seven routes declaring Zod schemas inline where the documented
pattern says otherwise, and two low-severity housekeeping items. None blocks agent-assisted
development.

Next step: proceed to agent onboarding. Fixes 1 through 5 can be picked up at any point, and fix 1
is a calendar reminder rather than a change.
