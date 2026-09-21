---
project: 10x-healthy-food
assessed_at: 2026-09-21T00:00:00Z
agent_readiness: ready-with-compensation
context_type: brownfield
stack_components:
  language: TypeScript 5.9.3
  framework: Astro 7.3.3 (output "server") + React 19.3.0
  build_tool: Vite (via Astro) + Tailwind 4.3.3
  test_runner: Jest 30.5.1 (ts-jest ESM) + Playwright 1.63.0
  validation: Zod 4.6.5
  backend: Supabase (supabase-js 2.116.0, @supabase/ssr 0.12.7)
  package_manager: npm (package-lock.json), Node 24.13.0
  ci_provider: GitHub Actions
  deployment_target: Vercel (@astrojs/vercel 11.0.10)
gates_passed: 16
gates_failed: 5
compensation_in_place: true
---

# Stack Assessment: 10x-HealthyFood

## Stack Components

**Language — TypeScript 5.9.3.** `tsconfig.json` extends `astro/tsconfigs/strict`, so `strict: true`
is on. Aliases `@/*` to `./src/*` and `@tests/*` to `./tests/*` are declared there and mirrored in
`jest.config.js` `moduleNameMapper`. A grep for `: any` across `src/**/*.{ts,tsx}` returns **zero**
hits. The project sits one notch below `astro/tsconfigs/strictest`, so `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes` are not enforced.

**Framework — Astro 7.3.3, `output: "server"`, React 19.3.0 islands.** `astro.config.mjs` registers
`@astrojs/react`, `@astrojs/sitemap`, the Vercel adapter (imported from `@astrojs/vercel`, web
analytics on) and `prefetch: true`; `site` is derived from `VERCEL_PROJECT_PRODUCTION_URL` rather
than hard-coded. Routing is file-based across `src/pages/`, with **15 API routes** under
`src/pages/api/` including dynamic `[id].ts` segments. One middleware (`src/middleware/index.ts`)
creates a request-scoped Supabase client, attaches it to `locals`, and guards everything outside
`PUBLIC_PATHS`. All three layouts use `<ClientRouter />` from `astro:transitions`; `<ViewTransitions />`
does not exist in this version.

**Build tool — Vite (bundled with Astro) plus Tailwind 4.3.3.** Tailwind is a Vite plugin
(`@tailwindcss/vite`), not a PostCSS plugin. There is no `tailwind.config.js`; `src/styles/global.css`
opens with `@import "tailwindcss";` and declares oklch design tokens under `:root` / `.dark`, with
`@custom-variant dark` and an `@theme inline` block. CSS-first configuration.

**Test runner — Jest 30.5.1 with ts-jest in ESM mode, plus Playwright 1.63.0.** `jest.config.js` sets
`useESM: true`, `extensionsToTreatAsEsm`, a `transformIgnorePatterns` carve-out for `@astrojs/*` and
`astro/*`, and a separate `tsconfig.test.json`. `.astro` files have no transformer and are excluded
from coverage. Three test files exist: `tests/unit/ThemeToggle.test.tsx`,
`tests/unit/validation-errors.test.ts`, `tests/e2e/recipe-management.spec.ts`. Playwright spawns its
own server with `--ignore-lock` and honours `E2E_PORT` / `E2E_BASE_URL`.

**Validation — Zod 4.6.5**, imported in 17 source files. The v4 API is load-bearing here: `z.email()`
replaces `z.string().email()`, failures are read from `err.issues`, and `ZodError.errors` does not
exist — `"errors" in err` returns `false`, so a structural check against it fails silently instead of
throwing. `src/lib/utils/validation-errors.ts` (`zodIssues` / `zodMessage`) is the one place raw issues
are shaped for API responses.

**Package manager — npm.** `package-lock.json` is the only lockfile. `.nvmrc` pins **Node 24.13.0**
and CI reads the version from that file (`node-version-file: .nvmrc`).

**CI/CD — GitHub Actions.** `.github/workflows/ci-cd.yml` runs `code-quality`, then `build`, then
`unit-tests` and `e2e-tests` in parallel, then `status-comment`, with concurrency cancellation on the
same ref. `code-quality` runs four gates in order: `lint`, `typecheck`, `format:check`,
`test:security`. E2E runs against the `integration` environment.

**Deployment — Vercel.** SSR through `@astrojs/vercel` 11.0.10; `.vercelignore` present. No Dockerfile.

**Backend — Supabase as Backend-as-a-Service.** `@supabase/supabase-js` 2.116.0 and `@supabase/ssr`
0.12.7. Schema lives in `supabase/migrations/` (`preferences`, `recipes`, `logs`) with row-level
security and per-user policies. Row types are generated into `src/db/database.types.ts` by
`npm run supabase:gen`. `src/db/supabase.client.ts` exports `createSupabaseServerInstance`, returning
`{ supabase, flushCookies }` — the cookie-flush contract every exit from the middleware must pass
through.

**UI — Shadcn/ui.** `components.json` pins `new-york`, `cssVariables: true`, lucide, `baseColor: neutral`
and an empty `tailwind.config` path (Tailwind 4 mode). Primitives alias to `@/components/ui`, `cn` to
`@/lib/utils/utils`.

**AI — OpenRouter.ai** reached from `src/lib/services/ai.service.ts` through `src/lib/api/openrouter.service.ts`.

## Quality Gate Assessment

| Component                              | Typed | Convention | Training Data | Documented | Verdict |
|----------------------------------------|-------|------------|---------------|------------|---------|
| Language — TypeScript 5.9.3            | ✓     | —          | —             | —          | pass    |
| Framework — Astro 7 SSR + React 19     | —     | ✓          | ✗             | ✓          | fail    |
| Build tool — Vite + Tailwind 4.3       | —     | ✓          | ✗             | ✓          | fail    |
| Test runner — Jest 30 (ts-jest ESM)    | —     | —          | ✗             | ✗          | fail    |
| Validation — Zod 4.6.5                 | ✓     | ~          | ✗             | ✓          | fail    |
| Backend — Supabase (BaaS)              | ✓     | ~          | ✓             | ✓          | pass    |
| UI — Shadcn/ui                         | ✓     | ~          | ✓             | ✓          | pass    |

Legend: ✓ = pass, ✗ = fail, ~ = partial, — = not applicable

Applicable cells: 21. Passed: 16. Failed: 5.

### Gate Details

**Typed — TypeScript 5.9.3: pass.** `tsconfig.json` line 2 extends `astro/tsconfigs/strict`. Zero
`: any` annotations in `src/`. Runtime boundaries are typed twice: Zod at the API edge (17 files) and
generated Supabase row types. `eslint.config.js` extends `tseslint.configs.strict` and `stylistic`.
`npm run typecheck` (`astro check`) is a CI gate in `code-quality` and passes at **0 errors over 110
files**, verified by running it. It is the only gate that checks types — neither `astro build` nor
ESLint does.

**Typed — Supabase: pass.** `src/db/database.types.ts` is generated and `src/db/supabase.client.ts`
types the client against it, so column names and nullability are readable from source.

**Typed — Zod 4: pass.** Parsed output is inferred, and `src/lib/utils/validation-errors.ts` types the
error shape that leaves the API (`ValidationIssue[]`) instead of leaking `ZodError` internals.

**Typed — Shadcn/ui: pass.** `components.json` sets `"tsx": true`; `src/components/ui/button.tsx` uses
`class-variance-authority`, statically typed.

**Convention-based — Astro 7: pass.** File-based routing throughout, `src/layouts/` for layouts, a
single `defineMiddleware` middleware with a `PUBLIC_PATHS` allowlist, and a domain-partitioned
`src/components/{ai,auth,common,feedback,layout,pages,profile,recipe,ui}` and
`src/hooks/{ai,auth,common,profile,recipe}` tree. An agent can place a new file without reading every
other file.

**Convention-based — Vite/Tailwind: pass.** Astro owns the Vite config; `astro.config.mjs` adds only
the Tailwind plugin. No bespoke pipeline to learn.

**Convention-based — Supabase: partial.** Of the 15 API routes, only the **three AI routes**
(`ai/generate-recipe.ts`, `ai/modify-recipe.ts`, `ai/save-recipe.ts`) go through a server-side service —
`AIService`, constructed with the request-scoped `SupabaseClient`. The auth, preferences, recipes and
users routes query `locals.supabase` directly. AGENTS.md states which pattern new code follows, but
both remain readable in the tree. See Gap 1.

**Convention-based — Zod 4: partial.** `src/lib/validations/` contains only `auth/login.ts`,
`auth/register.ts`, `auth/reset-password.ts`. Seven route files declare `z.object` inline:
`api/ai/{generate-recipe,modify-recipe,save-recipe}.ts`, `api/preferences/{index,[id]}.ts`,
`api/recipes/{index,[id]}.ts`.

**Convention-based — Shadcn/ui: partial.** `src/components/ui/` holds one shadcn primitive
(`button.tsx`) beside five application components (`ActionButtons.tsx`, `BaseModal.tsx`,
`IconButton.tsx`, `LoadingSpinner.tsx`, `RecipeContent.tsx`). AGENTS.md names that set and forbids
adding to it, which contains the drift without undoing it.

**Popular in training data — Astro 7 + React 19: fail.** Astro and React are mainstream; Astro 7 is
not. Material describing Astro 4/5 dominates, and four of the differences bite silently here.
`<ViewTransitions />` does not exist — layouts use `<ClientRouter />`. The dev server takes a
project-wide lock, so a second `astro dev` — including one spawned by a test harness — exits with "Dev
server already running" unless given `--ignore-lock`; `playwright.config.ts` carries that flag.
`security.checkOrigin` is on by default, so non-GET requests from `curl` or `page.request.*` get `403`
without an explicit `Origin` header, which is why `tests/e2e/services/cleanup.service.ts` sends one.
And Vite keys pre-bundled deps by hash, so a dev server that outlives a dependency change serves a
stale key: the island whose import chain touches it fails to hydrate with no error page, and the page
renders its SSR initial state, which reads as an application bug while every API behind it answers 200.

**Popular in training data — Tailwind 4: fail.** There is no `tailwind.config.js`, `components.json`
carries `"tailwind": {"config": ""}`, and `global.css` starts with `@import "tailwindcss"`. The
overwhelming majority of Tailwind material is v3, which configures through a JS file and the
`@tailwind base; @tailwind components; @tailwind utilities;` directives. An agent working from priors
creates an inert config file and then debugs missing styles. The highest-frequency correction risk in
the stack.

**Popular in training data — Zod 4: fail.** Most Zod material describes v3. Three divergences:
`z.string().email()` is replaced by `z.email()`; failures are read from `err.issues`; and
`ZodError.errors` does not exist, so the idiomatic-looking guard `"errors" in err` evaluates to `false`
and a branch silently does not run instead of throwing. The last is the dangerous shape — a wrong code
path, not an error.

**Popular in training data — Jest 30 + ts-jest ESM on Astro: fail.** The combination of
`preset: "ts-jest"`, `useESM: true`, `extensionsToTreatAsEsm`, the `@astrojs/*` carve-out and a separate
`tsconfig.test.json` is under-represented; the conventional runner in the Vite/Astro ecosystem is
Vitest. An agent asked to add a test is more likely to produce `import { describe } from "vitest"` than
to match this setup.

**Well-documented — Astro 7, React 19, Vite, Tailwind 4, Zod 4, Supabase, Shadcn/ui: pass.** All ship
current, version-pinned, URL-addressable official documentation. The training-data failures above are
about priors, not documentation quality — which is exactly why instruction-file rules close them.

**Well-documented — Jest + Astro integration: fail.** Astro's testing documentation covers Vitest,
Cypress and Playwright, not Jest. The `transformIgnorePatterns` carve-out and the `tsconfig.test.json`
split exist nowhere but in this repository's own config files.

## Gaps & Compensation

Five of the seven gaps below are closed as instruction gaps: the rule exists in AGENTS.md, which
CLAUDE.md imports, and both sit outside the toolkit sync markers. Two are open and carry ready-to-paste
fixes.

### Gap 1 — Two data-access patterns, and a misleading exemplar — **open**

**What fails:** the convention partial on Supabase.

AGENTS.md states the rule — business logic in `src/lib/services/*.service.ts`, with the auth,
preferences, recipes and users routes named as the pattern not to copy — but it points a new service at
`src/lib/services/recipe.service.ts`, while the same file, under "Type debt", correctly describes
`recipe.service.ts` as a client-side fetch wrapper. Both statements are in the same document.

Verified on disk: `recipe.service.ts` is imported only by `HomePage.tsx`, `RecipeDetailPage.tsx`,
`useRecipe.ts`, `useRecipeMutations.ts` and `useRecipes.ts` — all browser code — and its methods call
`fetch("/api/recipes/...")`. `ai.service.ts` is imported only by the three API routes and takes
`SupabaseClient<Database>` in its constructor. They are two different kinds of object sharing a suffix.

**Why it matters:** the diary module adds a new table and a new set of API routes with real business
logic (the FR-009/FR-010 calorie cascade). An agent told to write `diary.service.ts` "following
recipe.service.ts" will write a browser fetch wrapper and leave the cascade in the route handler — the
exact outcome the rule exists to prevent.

**Compensation:** correct the exemplar in AGENTS.md. Block 1 below.

### Gap 2 — The instruction files point at two documents that do not exist — **open**

**What fails:** the integrity of the compensation itself.

`AGENTS.md` references `@context/foundation/lessons.md` in the session-cookie hard rule, and
`CLAUDE.md` lists both `context/foundation/lessons.md` and `docs/reference/contract-surfaces.md` under
"Foundation paths used by this lesson". Neither file exists. `context/foundation/` holds `README.md`,
`health-check.md`, `infrastructure.md`, `prd.md`, `roadmap.md`, `shape-notes.md`,
`stack-assessment.md`.

**Why it matters:** a dangling `@`-reference is worse than no reference. The agent follows the pointer,
finds nothing, and either stalls or — more often — assumes the rule it was sent to read does not apply.
The rule this happens to is the session-cookie ordering rule, which guards a failure that has already
cost fixes.

**Compensation:** create `context/foundation/lessons.md` with the session-cookie lesson as its first
entry (`/10x-lesson` writes exactly this file), then add Block 2 below. Alternatively delete both
references — what must not stay is a rule that sends the agent to a file that is not there.

### Gap 3 — Tailwind 4 configuration will be written as Tailwind 3 — **compensated**

AGENTS.md opens its "Hard rules" with "Never create `tailwind.config.js`. Tailwind 4 ignores it
silently and styles just go missing." and points at `src/styles/global.css` (`@theme`,
`@custom-variant dark`). The Styling section repeats the `@import "tailwindcss";` rule and the absence
of a `content` array. Nothing further to add.

### Gap 4 — Test setup is undocumented upstream and unusual — **compensated, with a live caveat**

The rules are in place: "Never `import ... from \"vitest\"`", the `.astro`/Jest limitation, the
alias-in-two-places rule, and an honest statement that the 80% threshold in `jest.config.js` is a target
for new code rather than a description of the suite. The caveat is factual: the suite is **3 files**,
and CI runs `npm run test`, not `test:coverage`. The diary module will be the first meaningful body of
new code written against that target.

### Gap 5 — Version skew on Astro 7, React 19 and the Vercel adapter — **compensated**

Six surfaces where a pre-Astro-7 prior produces wrong code, all documented in AGENTS.md:
`<ClientRouter />` rather than `<ViewTransitions />`; the project-wide dev-server lock and
`--ignore-lock`; `security.checkOrigin` and non-browser clients; `node_modules/.vite` staleness after a
dependency change; the `@astrojs/vercel` import path (not `/serverless`); and React 19's `ref`-as-prop.
These are the failures that do not announce themselves, which is why the compensation carries the
mechanism, not just the rule.

### Gap 6 — Zod 4 breaking changes are invisible to an agent working from priors — **compensated**

`"errors" in err` returning `false` is a silent wrong branch, not an exception. The rule is in
AGENTS.md's hard rules, and `src/lib/utils/validation-errors.ts` gives every route one exit for
validation failures (`zodIssues` / `zodMessage`) instead of returning `error.issues` or the deprecated
`error.format()` directly; `tests/unit/validation-errors.test.ts` covers it.

**Residual:** the seven routes that still declare schemas inline are the ones the diary work will sit
next to. Moving them to `src/lib/validations/<domain>/<action>.ts` is cheap and closes the validation
half of Gap 1.

### Gap 7 — `components/ui` has been repurposed — **contained**

AGENTS.md names the five drifted files explicitly and forbids adding to the set. That is the right
compensation for drift that will not be undone mid-project: an agent running `npx shadcn@latest add`
knows what it is walking into, and an agent looking for "the button component" has a stated answer.

### Recommended Instruction File Additions

AGENTS.md already carries the compensation for Gaps 3 through 7; do not re-paste those. These two
blocks close Gaps 1 and 2.

**Block 1 — replace the "Project structure" first bullet in AGENTS.md** (it currently points
server-side business logic at a browser fetch wrapper):

```markdown
- `src/pages/api/<domain>/` — API routes. Business logic belongs in `src/lib/services/*.service.ts`.
  The server-side exemplar is @src/lib/services/ai.service.ts: it is constructed with the
  request-scoped `SupabaseClient<Database>` from `context.locals.supabase`, receives already-validated
  input, and is the only thing the three `src/pages/api/ai/` routes do beyond parsing and responding.
  @src/lib/services/recipe.service.ts is NOT that pattern — despite the `.service.ts` suffix it is a
  browser-side `fetch` wrapper over `/api/recipes`, imported only by React components and hooks. Do not
  model a server service on it. The auth, preferences, recipes and users routes predate the rule and
  query `locals.supabase` directly — do not copy them either.
```

**Block 2 — add to AGENTS.md under "Project structure"**, once `context/foundation/lessons.md` exists:

```markdown
- Recurring pitfalls that already cost a fix once are recorded in @context/foundation/lessons.md —
  read it before touching middleware, session cookies or the dev-server/test harness. Add to it with
  `/10x-lesson` when a bug turns out to be a class of bug rather than a one-off.
```

## Summary

**Overall readiness: ready-with-compensation.** Sixteen of twenty-one applicable criteria pass, and the
compensation for the failures is written and loaded — AGENTS.md carries it, CLAUDE.md imports it. The
five failures are all of one kind: training-data currency on Astro 7, Tailwind 4, Zod 4 and the Jest
ESM setup, plus the absent upstream documentation for Jest-on-Astro. Nothing here argues for changing
the stack.

**Key strengths.** The typing story is unusually good for a project this size: `strict` TypeScript with
zero `any` in `src/`, generated Supabase row types, Zod at every boundary with a single error-shaping
exit, and `astro check` as a CI gate sitting at 0 errors across 110 files. `code-quality` runs four
gates — lint, typecheck, format check and `audit-ci` with one commented, reviewable allowlist entry.
Astro's file-based conventions plus the domain-partitioned `src/components/` and `src/hooks/` trees mean
an agent can predict where a new file belongs. AGENTS.md names each silent failure mode together with
the mechanism that produces it, which is the format an agent can act on.

**Key gaps.** Two, both small and both in the instruction layer rather than the code. AGENTS.md points
new server-side services at `recipe.service.ts`, which is a browser fetch wrapper — with the diary
module about to add services and routes carrying the FR-009/FR-010 calorie cascade, that pointer gets
followed at the worst possible moment. And the instruction files reference two documents that do not
exist, one of them guarding the session-cookie rule. Behind them sit two structural drifts, contained by
stated rules but not resolved: 3 of 15 routes use a service, and 7 routes declare Zod schemas inline.

**Recommended next step:** apply the two blocks above, then `/10x-health-check` — its audit numbers
predate this dependency tree.
