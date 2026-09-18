---
project: 10x-healthy-food
checked_at: 2026-09-16T00:00:00Z
remediated_at: 2026-09-17T00:00:00Z
modified_at: 2026-09-18T00:00:00Z
health_status: remediated-with-followups
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
audit_findings_at_check:
  critical: 3
  high: 25
  moderate: 6
  low: 7
test_runner_detected: true
ci_provider: GitHub Actions
recommended_fixes: 10
---

# Health Check: 10x-HealthyFood

> **Status update 2026-09-17.** The dependency remediation described under "Recommended Fixes" was
> carried out. Everything below the frontmatter is the original 2026-09-16 assessment and is kept
> for the audit trail; read this block first for what is still true.
>
> | Item | Then (2026-09-16) | Now (2026-09-17) |
> |---|---|---|
> | npm audit | 3 critical / 25 high / 6 moderate / 7 low | **0 critical / 3 high / 0 moderate / 0 low** |
> | astro | 5.5.5 | **7.3.3** |
> | @astrojs/vercel / @astrojs/react | 8.1.5 / 4.2.2 | **11.0.10 / 6.0.6** |
> | zod | 3.25.28 | **4.6.5** |
> | Node (.nvmrc) | 22.14.0 | **24.13.0** |
> | Type-check gate | absent | `npm run typecheck` (`astro check`) exists, 4 known errors |
> | node_modules installed | no | yes |
> | Unit tests / build | not runnable | **17/17 pass, build green** |
>
> **Fix status:** 1 done - 2 NOT done (.gitignore still hides `CLAUDE.md` and `context/`) -
> 3 done - 4 partly (script added, not wired into CI, 4 errors to triage first) - 5 NOT done -
> 6 done (`typescript` and `@astrojs/check` now explicit) - 7 done (`@types/jest` 30) -
> 8 NOT done - 9 done (Astro trio, `marked` removed, lucide 1.x, zod 4) - 10 done
> (`.editorconfig` was added before this run).
>
> **The 3 remaining high advisories are a single upstream issue**, not a deferred decision:
> `path-to-regexp` (`GHSA-9wv6-86v2-598j`) reached through `@vercel/routing-utils` inside
> `@astrojs/vercel`, which is already at its latest release (11.0.10). `npm audit fix --force`
> "resolves" it by proposing a downgrade to `@astrojs/vercel@8.0.4` - do not take it. Nothing to
> do locally; track the upstream fix.
>
> **Corrections to the original text below.** Three claims were wrong or have been overtaken:
> - The AVIF advisory `GHSA-26w7-cxv4-gfx2` was never backported to the 5.x line. The fix requires
>   `sharp >= 0.35.4`; both `astro@5.18.2` and `astro@6.4.8` pin `sharp ^0.34.0`. Only Astro 7
>   closes it, which is why the upgrade went to 7 rather than stopping at 5.18.2.
> - The `x-astro-path` advisory (`GHSA-mr6q-rp88-fx84`) is patched in `@astrojs/vercel` 10.0.2,
>   which peers `astro ^6`. Fixing it while staying on Astro 5 was impossible - the original text
>   implied a choice that did not exist.
> - `typescript` was indeed undeclared, but `prettier` had already been added to
>   `devDependencies` by the time of this run.
>
> **New findings this run, not present in the original assessment:**
> - `eslint-plugin-import` and `eslint-import-resolver-typescript` were declared but never wired
>   into `eslint.config.js`; same for the `marked` runtime dependency and `supertest`. All removed.
> - A hand-written `declare module "axios"` shim in `src/lib/api/axios.d.ts` shadowed the real
>   axios types and hid `.get()` and `isAxiosError` from the compiler. Removed.
> - ESLint cannot go to 10 yet: `eslint-plugin-react` and `eslint-plugin-jsx-a11y` cap at 9.
> - Playwright E2E is blocked - see "E2E is currently blocked locally" in `AGENTS.md`.

## Dependency Health

### Lockfile

```
Status: present (package-lock.json)
Package manager: npm
```

`.nvmrc` pins Node 22.14.0 and the CI composite action reads the version from it, so the toolchain
version is pinned as well as the dependency tree. No competing lockfiles (`yarn.lock`,
`pnpm-lock.yaml`, `bun.lockb`) are present.

One caveat: `node_modules/` is **not installed** in the working copy. The audit below was resolved
from `package-lock.json`, which is accurate, but no command that needs the dependency tree
(`npm run lint`, `npm run test`, `npm run build`) can execute until `npm ci` has been run. See
Category A fix 3.

### Security Audit

```
Tool: npm audit --json
Summary: 3 CRITICAL, 25 HIGH, 6 MODERATE, 7 LOW  (41 advisories over 1411 resolved packages)
Direct vs transitive: 7 direct (1 critical, 4 high, 2 low) / 34 transitive
```

The dependency tree was last pinned around March–May 2025 (Astro 5.5.5, axios 1.9.0, Tailwind
4.0.17). Roughly eighteen months of advisories have accumulated against those pins, which is why
the count is high relative to a project of this size.

#### CRITICAL findings

- **astro** 5.5.5 — `GHSA-26w7-cxv4-gfx2`: remote code execution through AVIF image optimization
  (CVSS 9.8, out-of-bounds read/write reached via `sharp`). Advisory range is `<7.2.8`. Direct
  dependency. Fix: see the note under HIGH findings — `npm audit fix` proposes 5.18.2, which is
  still inside the advisory range as published.
- **form-data** (transitive, via axios) — `GHSA-fjxv-7rqg-78g4`: unsafe random function used to
  choose the multipart boundary, allowing boundary prediction and request tampering. Also carries
  `GHSA-hmw2-7cc7-3qxx` (HIGH, CVSS 7.5) CRLF injection via unescaped field names. Fix: update
  `axios` — it pulls the patched `form-data` along.
- **tar** (transitive, via the `supabase` CLI) — `GHSA-23hp-3jrh-7fpw`: decompression/parse
  denial-of-service via unlimited input, plus eight HIGH path-traversal and symlink-poisoning
  advisories (`GHSA-34x7-hfp2-rc4v`, `GHSA-83g3-92jg-28cx`, `GHSA-r6q2-hw4h-h46w` and others).
  Reached only through the dev-time Supabase CLI, not through runtime code. Fix: update `supabase`.

#### HIGH findings

Direct dependencies:

- **axios** 1.9.0 — twelve HIGH advisories, the most severe being `GHSA-35jp-ww65-95wh` (CVSS 8.7,
  full man-in-the-middle via prototype-pollution gadget in `config.proxy`), `GHSA-4hjh-wcwx-xvwj`
  (CVSS 7.5, DoS through missing data-size check) and `GHSA-p92q-9vqr-4j8v`
  (`Proxy-Authorization` credential leak across an HTTP-to-HTTPS redirect). Fix: update to 1.17.1
  or later (`npm i axios@latest` — non-major). **This is the highest-priority runtime finding**:
  `src/lib/services/ai.service.ts` reaches OpenRouter.ai over axios, and the diary module in the
  PRD (FR-003, FR-010) routes every free-text calorie estimate through that same client.
- **supabase** 2.24.3 (dev) — inherits the `tar` advisories above. Fix: `npm i -D supabase@latest`.
- **@playwright/test** 1.52.0 (dev) — inherits an advisory from `playwright`. Fix:
  `npm i -D @playwright/test@latest` (non-major).
- **@astrojs/vercel** 8.1.5 — `GHSA-mr6q-rp88-fx84` (unauthenticated path override via
  `x-astro-path`) plus a HIGH `path-to-regexp` advisory reached through `@vercel/routing-utils`.
  Fix requires the **major** bump to 11.0.10.

Transitive (18 further HIGH advisories, all resolved by updating their parents):
`@vercel/routing-utils`, `brace-expansion`, `browserslist`, `defu`, `devalue`, `flatted`, `glob`,
`h3`, `js-yaml`, `lodash`, `minimatch`, `nanoid`, `path-to-regexp`, `picomatch`, `playwright`,
`postcss`, `rollup`, `sharp`, `smol-toml`, `vite`, `ws`.

**A note on the Astro fix.** `npm audit fix` reports `astro@5.18.2` as a non-major upgrade, and it
clears the majority of the Astro advisories (the middleware-bypass family `GHSA-ggxq-hp9w-j794` /
`GHSA-whqg-ppgf-wp8c`, the `X-Forwarded-Host` reflection, the dev-server file read). But the AVIF
RCE advisory is published with range `<7.2.8`, and 5.18.2 falls inside it. Before assuming a
two-major upgrade is required, open `GHSA-26w7-cxv4-gfx2` and check whether the fix was backported
to the 5.x line — the advisory range as published does not say so. The middleware-bypass advisories
matter here regardless of AVIF: `src/middleware/index.ts` gates every non-public route on
`url.pathname` against `PUBLIC_PATHS`, which is exactly the surface those two CVEs attack.

#### MODERATE findings (log only, 6)

`@humanfs/node` (recursive copy follows symlinks), `ajv` (ReDoS via `$data`), `follow-redirects`,
`mdast-util-to-hast`, `qs`, `yaml`. All transitive, all with a fix available through a parent
update.

#### LOW findings (log only, 7)

`@supabase/supabase-js` 2.49.4 and `@supabase/auth-js` (`GHSA-8r88-6cj9-9fh5`, insecure path
routing from malformed user input), `eslint` 9.23.0 via `@eslint/plugin-kit` (ReDoS in
`ConfigCommentParser`), `@babel/core`, `diff`, `postcss-selector-parser`.

### Outdated Dependencies

```
Packages with major version gaps: 6  (21 packages outdated in total)
```

- **astro**: 5.5.5 → 7.3.2 (2 major versions behind)
- **@astrojs/vercel**: 8.1.5 → 11.0.10 (3 major versions behind)
- **marked**: 15.0.11 → 18.0.13 (3 major versions behind)
- **@astrojs/react**: 4.2.2 → 6.0.5 (2 major versions behind)
- **zod**: 3.25.28 → 4.6.5 (1 major version behind)
- **lucide-react**: 0.487.0 → 1.46.0 (1 major version behind)

The remaining 15 are minor/patch drift and are not listed.

Astro, `@astrojs/vercel` and `@astrojs/react` move together — they are one upgrade, not three. Zod 4
is a separate decision: 18 source files import Zod, and `CLAUDE.md` documents the Zod 3 boundary
convention, so a Zod 4 migration would touch validation across the codebase and should not be
bundled with a security patch.

## Test Suite

```
Test runner: Jest 30 (ts-jest, ESM, jsdom) + Playwright 1.52 for E2E
Tests found: 2 test files
Test execution: not attempted — node_modules/ is not installed
```

```
Configuration: jest.config.js (unit/integration), playwright.config.ts (E2E)
TypeScript config for tests: tsconfig.test.json
Setup file: tests/setup/jest.setup.ts (present)
Framework: Jest 30.x with ts-jest 29.4, jest-environment-jsdom 30.x, @testing-library/react 16
```

The infrastructure is complete and coherent — both runners are configured, the setup file exists,
`moduleNameMapper` mirrors the `tsconfig.json` path aliases, and `transformIgnorePatterns` carries
the `@astrojs/*` / `astro/*` carve-out that the ESM arrangement needs. What is thin is the suite
itself:

- **2 test files** (`tests/unit/ThemeToggle.test.tsx`, `tests/e2e/recipe-management.spec.ts`)
  against 73 `.ts`/`.tsx` source files, 17 `.astro` files and 15 API routes.
- `jest.config.js` declares an **80% global coverage threshold** across branches, functions, lines
  and statements. CI runs `npm run test`, not `npm run test:coverage`, so the threshold never
  executes. An agent reading the config will assume a coverage baseline that does not exist.
- **Version mismatch**: `jest` is `^30.0.0` and `jest-environment-jsdom` is `^30.0.0`, but
  `@types/jest` is `^29.5.14`. `tsconfig.json` sets `"types": ["@types/jest"]`, so test-file type
  hints come from the v29 definitions while the runtime is v30.

Test execution could not be verified in this run. Install dependencies and run `npm run test` to
confirm the ESM-on-Jest arrangement still works before relying on it as an agent feedback loop.

## CI/CD

```
Provider: GitHub Actions
Configuration: .github/workflows/ci-cd.yml (+ .github/actions/setup-node/action.yml)
```

| Stage      | Status | Notes                                                                    |
|------------|--------|--------------------------------------------------------------------------|
| Lint       | ✓      | `npm run lint` — ESLint 9 flat config, typescript-eslint strict+stylistic |
| Test       | ✓      | `npm run test` (Jest) and `npm run test:e2e` (Playwright), parallel jobs  |
| Build      | ✓      | `npm run build` — `astro build`, artifact uploaded                       |
| Type check | ✗      | not configured — no `astro check`, no `tsc --noEmit`, no type-aware lint  |
| Security   | ✗      | not configured — `npm run test:security` exists but is not wired into CI  |

The pipeline shape is good: `code-quality` → `build` → (`unit-tests` ‖ `e2e-tests`) →
`status-comment`, with concurrency cancellation, a `.nvmrc`-driven composite setup action, cached
Playwright browsers, and E2E running against the `integration` environment with secrets. Two gates
are missing and one is broken.

**Missing — type check.** `tsconfig.json` extends `astro/tsconfigs/strict`, but nothing in the
pipeline ever runs the TypeScript compiler. `astro build` transpiles through esbuild, which strips
types without checking them. ESLint would be the second line of defence, except `eslint.config.js`
uses `tseslint.configs.strict` (syntactic) rather than `strictTypeChecked`, and declares no
`parserOptions.project` or `projectService` — so no type-aware rule runs either. `@astrojs/check`
is not installed. The net effect: **`strict: true` is enforced only in the editor.** A type error
can be committed, pass every CI job, and ship.

**Broken — the formatting gate.** `code-quality` runs `npm run format -- --check`, which expands to
`prettier --write . --check`. Verified against Prettier 3.5.3: with both flags, Prettier **writes
the fixes and exits 0**. The step reformats files inside the runner's checkout, prints
`Code style issues fixed in the above file`, and reports success. It cannot fail, so it is not a
gate. The fix is to call `prettier --check .` without `--write`.

**Missing — security.** `package.json` already defines
`"test:security": "npm audit --audit-level high && npx audit-ci --moderate"` and `audit-ci` is a
devDependency, but no job invokes it. Had it been wired in, the 3 CRITICAL and 25 HIGH advisories
above would have failed a build months ago.

## Configuration

### High severity

- **`.gitignore` excludes the entire agent-context layer** — `CLAUDE.md`, `context/`, `.claude/`,
  `.agents/` and `.ai/` are all listed under the `#skills & ai` block, and `git ls-files` confirms
  none of them are tracked. Commit `cf5aa8a` ("chore: remove AI tooling artifacts … from repo")
  made this deliberate. The consequence is specific and severe for this chain: the seven
  compensation blocks that `/10x-stack-assess` produced **are** now present in `CLAUDE.md` (198
  lines, correctly placed outside the `@przeprogramowani/10x-cli` markers) — but they exist only on
  this machine. A fresh clone, a teammate, a CI-hosted agent, or a cloud session gets a repo with
  no Tailwind 4 warning, no Jest-not-Vitest rule, and no service-layer convention. The single
  highest-leverage artifact of the brownfield chain is invisible to everyone but you.
  Fix: decide per path. `CLAUDE.md` and `context/` are project documentation and should be tracked;
  `.claude/`, `.agents/`, `.ai/` and `.10x-cli.json` are tooling state and can stay ignored.
- **No type-check gate** — see the CI/CD section. `strict: true` is declared and never verified.
- **`typescript` and `prettier` are not declared dependencies** — both are absent from
  `package.json` yet both are required by `package.json` scripts and config. They resolve today
  only as hoisted transitives (`typescript@5.8.3` via Astro, `prettier@3.5.3` via
  `eslint-plugin-prettier` / `prettier-plugin-astro`). Any parent update that changes its own
  requirement silently changes the compiler or formatter version this project builds with — or
  removes it, breaking `npm run format` and `.prettierrc.json`. `@astrojs/check` is likewise
  absent, which is why no type-check command exists to run.

### Medium severity

- **`@types/jest` ^29 against Jest 30** — type definitions one major behind the runtime, wired into
  `tsconfig.json` via `"types": ["@types/jest"]`. Agent-written tests get signatures from a version
  the runner is not.
- **Coverage threshold declared but never executed** — `jest.config.js` asserts 80%; CI runs the
  non-coverage script. Either enforce it or annotate it as aspirational (`CLAUDE.md` already does
  the latter, which is the honest position for now).

### Low severity

- **`.editorconfig` missing** — no cross-editor baseline for indentation and line endings. On a
  Windows checkout with Prettier in play this is worth five minutes.

Present and correct: `.gitignore` (scope issue aside), `.env.example` (documents `SUPABASE_URL`,
`SUPABASE_KEY`, `OPENROUTER_API_KEY`), `.env.test.example`, `.nvmrc`, `.prettierrc.json`,
`eslint.config.js`, `tsconfig.json` with `strict` and path aliases, `components.json`, husky
`pre-commit` → `lint-staged`, `.vercelignore`, `lighthouserc.js`.

## Stack Assessment Cross-Reference

```
Stack assessment: context/foundation/stack-assessment.md
Agent readiness (from stack-assess): ready-with-compensation
```

| Quality Gate Gap | Health-Check Finding | Status |
|---|---|---|
| Gap 1 — Tailwind 4 written as Tailwind 3 | `CLAUDE.md` now carries the CSS-first rule block — but `CLAUDE.md` is gitignored and untracked | **Mitigated locally, unresolved in the repo** |
| Gap 2 — Jest/ts-jest ESM undocumented | `CLAUDE.md` carries the runner-split block; compounded by `@types/jest` v29 vs Jest v30 and a 2-file suite under an unenforced 80% threshold | Reinforced |
| Gap 3 — Astro 5 / React 19 version skew | The pin that prevents skew is now 2 majors stale and carries a CRITICAL RCE plus two middleware-bypass CVEs against `PUBLIC_PATHS` | **Reinforced, and inverted** |
| Gap 4 — two data-access patterns | `CLAUDE.md` states the service-layer rule for new code — again, untracked | Mitigated locally |
| Gap 5 — `components/ui` repurposed | `CLAUDE.md` states the separation and names the five drifted files | Mitigated locally |
| `typed: pass` (TypeScript strict, zero `any`) | Nothing in CI or ESLint verifies it — no `tsc`, no `astro check`, no type-aware lint | **Reinforced — the gate passes on paper only** |

Two cross-references change the picture the stack assessment left.

The assessment closed with "the compensation is not yet in place … pasting the seven blocks above is
the single highest-leverage action available." That has been done — and it was the right move. But
because `.gitignore` excludes `CLAUDE.md`, the work did not land where it needs to be. Tracking that
file is now the highest-leverage action, and it costs one line.

The assessment also scored `typed` as the stack's standout strength: strict TypeScript, zero `any`
in `src/`, generated Supabase row types, Zod at every boundary. That holds as a description of the
source. What health-check adds is that **no automated gate enforces any of it**. For the diary
module — a new table, new API routes, and a calorie cascade spanning FR-009/FR-010 — an agent's
type errors would reach `master` with a green pipeline.

## Recommended Fixes

### Fix before agent work (Category A)

### 1. Patch the direct runtime dependencies carrying CRITICAL/HIGH advisories

**Impact**: `axios` is the client `src/lib/services/ai.service.ts` uses to reach OpenRouter, and the
diary module routes every free-text calorie estimate (FR-003, FR-010) through it. It currently
carries twelve HIGH advisories including a full MitM prototype-pollution gadget (CVSS 8.7) and a
`Proxy-Authorization` leak across redirects. Astro's middleware-bypass CVEs
(`GHSA-ggxq-hp9w-j794`, `GHSA-whqg-ppgf-wp8c`) attack `url.pathname` allowlists — precisely how
`src/middleware/index.ts` implements `PUBLIC_PATHS`, which will guard the new diary routes.
**Severity**: critical
**Effort**: significant (> 1 hour — the Astro line needs judgment, the rest does not)
**Fix**:

Start with the non-major, low-risk half:

```bash
npm ci
npm i axios@latest
npm i -D supabase@latest @playwright/test@latest
npm audit --audit-level=high
```

Then handle Astro deliberately, not with `npm audit fix`:

```bash
# Read the advisory first — check for a 5.x backport of the AVIF fix:
#   https://github.com/advisories/GHSA-26w7-cxv4-gfx2
npm i astro@5.18.2          # clears the middleware-bypass and X-Forwarded-Host CVEs
npm run build && npm run test:e2e
```

`@astrojs/vercel` needs a major bump (8 → 11) to clear its advisories, and `@astrojs/react`,
`@astrojs/vercel` and `astro` must move as one set. Treat the full Astro 5 → 7 upgrade as its own
piece of work with the E2E suite as the safety net — not as a prerequisite to starting the diary
module, but not as something to leave open indefinitely either.

### 2. Track `CLAUDE.md` and `context/` in git

**Impact**: the seven compensation blocks are written and correct, but `.gitignore` hides them.
Every agent session outside this machine — a teammate, a fresh clone, CI, a cloud session — starts
with no Tailwind 4 warning, no Jest-not-Vitest rule, no service-layer convention. This is the one
finding that silently undoes the entire brownfield chain.
**Severity**: high
**Effort**: quick (< 5 min)
**Fix**:

Edit the `#skills & ai` block in `.gitignore` to keep tooling state ignored but track the
documentation:

```gitignore
#skills & ai
skills-lock.json
.10x-cli.json
.agents/
.claude/
.ai/
```

Then add the files back:

```bash
git add -f CLAUDE.md context/
git commit -m "docs: track agent conventions and foundation context"
```

Note that `eslint.config.js` feeds `.gitignore` into ESLint via `includeIgnoreFile()`. Un-ignoring
`CLAUDE.md` and `context/` brings their `.md` files into ESLint's scope — harmless, since no rule
targets markdown, but worth knowing if lint output changes shape.

### 3. Install dependencies

**Impact**: `node_modules/` is absent, so `npm run lint`, `npm run test` and `npm run build` all
fail immediately. An agent's feedback loop is only as good as its ability to run the checks.
**Severity**: high
**Effort**: quick (< 5 min)
**Fix**:

```bash
npm ci
npm run test && npm run lint && npm run build
```

Confirm the Jest ESM arrangement actually runs before treating it as a verification loop — the
configuration is unconventional enough that it is worth proving once.

### 4. Add a type-check gate

**Impact**: `strict: true` is declared, `src/` has zero `any` annotations, and nothing verifies
either claim outside the editor. An agent generating the diary module's API routes and service
layer can introduce type errors that pass lint, pass build, pass tests and merge.
**Severity**: high
**Effort**: moderate (15–30 min)
**Fix**:

```bash
npm i -D @astrojs/check typescript
npm pkg set scripts.typecheck="astro check"
npm run typecheck   # expect existing errors — triage before wiring into CI
```

Then add the step to `code-quality` in `.github/workflows/ci-cd.yml`:

```yaml
      - name: Sprawdzenie typów
        run: npm run typecheck
```

Optionally strengthen the second line of defence by moving `eslint.config.js` from
`tseslint.configs.strict` to `tseslint.configs.strictTypeChecked` and adding
`languageOptions: { parserOptions: { projectService: true } }`. That is a larger change with its
own error backlog — do it after the compiler gate is green.

### 5. Repair the formatting gate in CI

**Impact**: `npm run format -- --check` resolves to `prettier --write . --check`, which writes fixes
and exits 0 (verified against Prettier 3.5.3). The `code-quality` job reports a passing format check
that cannot fail. Agent-generated code with inconsistent formatting merges unflagged.
**Severity**: medium
**Effort**: quick (< 5 min)
**Fix**:

```bash
npm pkg set scripts.format:check="prettier --check ."
```

Then in `.github/workflows/ci-cd.yml`, replace `run: npm run format -- --check` with:

```yaml
        run: npm run format:check
```

### 6. Declare `typescript` and `prettier` explicitly

**Impact**: both are required by `package.json` scripts and config files, and both resolve only as
hoisted transitives today. A parent-package update can change the compiler or formatter version
underneath the project, or remove it entirely — breaking `npm run format` and the build with no
change to this repo.
**Severity**: medium
**Effort**: quick (< 5 min)
**Fix**:

```bash
npm i -D typescript@5.8.3 prettier@3.5.3
```

Pin to the versions currently resolved so nothing changes behaviour; bump them deliberately later.

### 7. Align the Jest type definitions with the runtime

**Impact**: `@types/jest` ^29 against Jest ^30, wired into `tsconfig.json` through
`"types": ["@types/jest"]`. Agent-written tests get signatures from a version the runner is not.
**Severity**: medium
**Effort**: quick (< 5 min)
**Fix**:

```bash
npm i -D @types/jest@^30
npm run test
```

### 8. Wire the existing security script into CI

**Impact**: `npm run test:security` and the `audit-ci` devDependency already exist; nothing calls
them. Had this been a gate, the 3 CRITICAL and 25 HIGH advisories would have surfaced when they
appeared rather than at this health check.
**Severity**: medium
**Effort**: quick (< 5 min)
**Fix**:

Add to `code-quality` in `.github/workflows/ci-cd.yml`, after fix 1 has brought the tree to a state
that can pass:

```yaml
      - name: Audyt bezpieczeństwa
        run: npm run test:security
```

Enable Dependabot or Renovate at the same time so the next eighteen months do not repeat this.

### 9. Plan the major-version upgrades

**Impact**: six direct dependencies are at least one major behind, and the Astro trio is the same
work as fix 1's remediation. Deferring indefinitely is how a project arrives at 41 advisories.
**Severity**: medium
**Effort**: significant (> 1 hour)
**Fix**: sequence them, do not batch.

1. `astro` + `@astrojs/react` + `@astrojs/vercel` together, E2E suite as the gate. This is the
   security-driven one.
2. `marked` 15 → 18 — check the API surface where recipe markdown is rendered.
3. `lucide-react` 0.487 → 1.x — icon-name churn is the usual break.
4. `zod` 3 → 4 last, or not at all this cycle. 18 files import it and `CLAUDE.md` documents the
   Zod 3 boundary convention; migrating mid-feature would put the diary module on two Zod dialects.

Update the pinned versions in `CLAUDE.md` ("Framework versions — read before writing config") in the
same commit as any of these. A stale version block is worse than none — the agent trusts it.

### 10. Add `.editorconfig`

**Impact**: no cross-editor baseline for indentation and line endings. Minor on its own; on a
Windows checkout with Prettier in the loop it prevents line-ending churn in diffs.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**:

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
```

### Addressed in upcoming lessons (Category B)

### `AGENTS.md` is absent

**Lesson**: [Agent Onboarding: Agents.md, AI Rules i feedback loops (M1L4)](https://platforma.przeprogramowani.pl/external/10xdevs-3/m1-l4)
**What you'll do there**: build the agent instruction files properly — including how `AGENTS.md` and
`CLAUDE.md` relate, and how to turn the stack-assessment compensation blocks into feedback loops
rather than a static wall of rules. `CLAUDE.md` already carries good content; do not generate an
`AGENTS.md` stub now, the lesson covers what belongs in it. Fix 2 above is the exception worth doing
immediately — tracking the file in git is a `.gitignore` question, not an authoring question.

### CI hardening and deployment configuration

**Lesson**: [Sprint Zero z Agentem: infrastruktura, walking skeleton i pierwszy deploy (M1L5)](https://platforma.przeprogramowani.pl/external/10xdevs-3/m1-l5)
**What you'll do there**: the broader infrastructure picture — environment strategy, deploy gates,
preview environments. This project is ahead here: GitHub Actions already runs lint, build, unit
tests and E2E against an `integration` environment with cached browsers, and Vercel deployment is
configured. Fixes 4, 5 and 8 above are narrow repairs to an existing pipeline, not the lesson's
subject; the lesson is where the pipeline's shape gets revisited.

## Summary

```
Health status: critical-issues
```

The project's *structure* is genuinely strong — strict TypeScript with zero `any` in `src/`,
generated Supabase row types, Zod at every API boundary, a domain-partitioned source tree, husky +
lint-staged at commit time, and a five-job GitHub Actions pipeline with E2E against a real
integration environment. Most brownfield projects at this stage have less. The verdict is driven by
three things that all point the same direction: an eighteen-month-stale dependency tree carrying 3
CRITICAL and 25 HIGH advisories — including a MitM gadget in the `axios` client the diary module's
AI path depends on, and Astro middleware-bypass CVEs aimed at the exact `PUBLIC_PATHS` mechanism
that will guard the new routes; a set of quality claims that nothing enforces, since no `tsc` or
`astro check` runs anywhere and the CI formatting step is a no-op that cannot fail; and a
`.gitignore` that hides `CLAUDE.md` and `context/` from the repository, so the compensation layer
this chain produced travels with no one.

None of it argues against the stack or against starting the diary module. It argues for two hours of
work first. The cheapest fixes are also the highest-leverage: tracking `CLAUDE.md` is one line,
repairing the format gate is one flag, and `npm i axios@latest` clears twelve HIGH advisories on the
path the new feature depends on most.

Next step: work Category A fixes 1–5 (they are the ones the diary module actually depends on), then
proceed to agent onboarding.
