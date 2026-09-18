---
project: "10x-healthy-food"
assessed_at: 2026-09-16
modified_at: 2026-09-18
agent_readiness: ready-with-compensation
context_type: brownfield
stack_components:
  language: TypeScript 5 (strict)
  framework: Astro 5.5.5 (SSR) + React 19
  build_tool: Vite (via Astro) + Tailwind 4 (@tailwindcss/vite)
  test_runner: Jest 30 (ts-jest, ESM, jsdom) + Playwright 1.49
  package_manager: npm
  ci_provider: GitHub Actions
  deployment_target: Vercel (@astrojs/vercel adapter)
  backend: Supabase (PostgreSQL + Auth, SDK as BaaS)
  ui_library: Shadcn/ui (new-york, lucide)
  ai_integration: OpenRouter.ai (via axios)
gates_passed: 14
gates_failed: 3
---

> **Superseded in part, 2026-09-17.** This assessment was written against the 2026-09-16 dependency
> tree (Astro 5.5.5, Tailwind 4.0.17, Zod 3, Jest types v29). Those versions have since been
> upgraded - see the status block in `health-check.md` and the baseline footer in `AGENTS.md`.
> The *structural* findings here (Gaps 4 and 5: two data-access patterns, two validation-schema
> locations, repurposed `components/ui`) are unchanged and still apply. Gap 3 (version skew) is
> resolved. Gaps 1 and 2 remain valid as risks, but the version numbers below are stale.

## Stack Components

**Language — TypeScript 5.** `tsconfig.json` extends `astro/tsconfigs/strict`, so `strict: true` is on. Path aliases `@/*` to `./src/*` and `@tests/*` to `./tests/*` are declared and mirrored in `jest.config.js` `moduleNameMapper`. The project sits one notch below `astro/tsconfigs/strictest`, so `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are not enforced.

**Framework — Astro 5.5.5 with `output: "server"`, React 19 islands.** `astro.config.mjs` registers `@astrojs/react`, `@astrojs/sitemap` and the Vercel adapter with web analytics enabled. Routing is file-based across `src/pages/` (15 API routes under `src/pages/api/`, including dynamic `[id].ts` segments). A single middleware at `src/middleware/index.ts` attaches a request-scoped Supabase client to `locals` and guards non-public paths.

**Build tool — Vite (bundled with Astro) plus Tailwind 4.0.17.** Tailwind is wired as a Vite plugin (`@tailwindcss/vite`), not a PostCSS plugin. There is no `tailwind.config.js`; `src/styles/global.css` opens with `@import "tailwindcss"` and defines design tokens as oklch CSS variables under `:root`, with `@custom-variant dark`. This is Tailwind 4's CSS-first configuration.

**Test runner — Jest 30 with ts-jest in ESM mode, plus Playwright 1.49 for E2E.** `jest.config.js` sets `useESM: true`, `extensionsToTreatAsEsm`, and a `transformIgnorePatterns` exception for `@astrojs/*` and `astro/*`. `.astro` files are excluded from coverage collection. Supertest is available for HTTP-level API tests. The repository currently contains two test files: `tests/unit/ThemeToggle.test.tsx` and `tests/e2e/recipe-management.spec.ts`.

**Package manager — npm.** `package-lock.json` is the lockfile; `.nvmrc` pins Node 22.14.0 and CI reads the version from that file.

**CI/CD — GitHub Actions.** `.github/workflows/ci-cd.yml` runs `code-quality` (lint + format check), then `build`, then `unit-tests` and `e2e-tests` in parallel, then `status-comment`, with concurrency cancellation on the same ref. E2E runs against the `integration` environment with cached Playwright browsers.

**Deployment — Vercel.** SSR through `@astrojs/vercel`; `.vercelignore` present. No Dockerfile or alternative target.

**Backend — Supabase as Backend-as-a-Service.** `@supabase/supabase-js` 2.49 and `@supabase/ssr` 0.6. Schema lives in `supabase/migrations/` (two migrations covering `preferences`, `recipes`, `logs`), with row-level security and policies declared in the schema migration. Database types are generated into `src/db/database.types.ts` via `npm run supabase:gen`.

**UI — Shadcn/ui.** `components.json` pins the `new-york` style, `cssVariables: true`, lucide icons, and an empty `tailwind.config` path (Tailwind 4 mode). Primitives are aliased to `@/components/ui`.

**AI — OpenRouter.ai** reached over axios from `src/lib/services/ai.service.ts`.

## Quality Gate Assessment

| Component                           | Typed | Convention | Training Data | Documented | Verdict |
|-------------------------------------|-------|------------|---------------|------------|---------|
| Language — TypeScript 5             | ✓     | —          | —             | —          | pass    |
| Framework — Astro 5 SSR + React 19  | —     | ✓          | ~             | ✓          | pass    |
| Build tool — Vite + Tailwind 4      | —     | ✓          | ✗             | ✓          | fail    |
| Test runner — Jest 30 (ts-jest ESM) | —     | —          | ✗             | ✗          | fail    |
| Backend — Supabase (BaaS)           | ✓     | ~          | ✓             | ✓          | pass    |
| UI — Shadcn/ui                      | ✓     | ~          | ✓             | ✓          | pass    |

Legend: ✓ = pass, ✗ = fail, ~ = partial, — = not applicable

Applicable cells: 17. Passed: 14. Failed: 3.

### Gate Details

**Typed — TypeScript 5: pass.**
Evidence: `tsconfig.json` line 2 extends `astro/tsconfigs/strict`. A grep for `: any` annotations across `src/**/*.{ts,tsx}` returns zero hits. Runtime boundaries are typed twice over — Zod 3.25 appears in 18 source files, and Supabase row types are generated rather than hand-written (`src/db/database.types.ts`, regenerated by `npm run supabase:gen`). `eslint.config.js` extends `tseslint.configs.strict` and `tseslint.configs.stylistic`, so type-aware lint rules back the compiler. The one reservation: the project uses `astro/tsconfigs/strict`, not `strictest`, so indexed access returns a non-`undefined` type and optional properties accept explicit `undefined`.

**Typed — Supabase: pass.** Evidence: `src/db/database.types.ts` is generated from the live schema, and `src/db/supabase.client.ts` types the client against it, so an agent can read column names and nullability from source.

**Typed — Shadcn/ui: pass.** Evidence: `components.json` sets `"tsx": true`; `src/components/ui/button.tsx` uses `class-variance-authority` variants, which are statically typed.

**Convention-based — Astro 5: pass.**
Evidence: file-based routing is used throughout (`src/pages/recipes/`, `src/pages/auth/`, `src/pages/api/**` including `[id].ts` dynamic segments), `src/layouts/` holds layouts, and `src/middleware/index.ts` uses `defineMiddleware` with a `PUBLIC_PATHS` allowlist. The source tree is further organised by domain under `src/components/{ai,auth,common,feedback,layout,pages,profile,recipe,ui}` and `src/hooks/{ai,auth,common,profile,recipe}` — a consistent, predictable convention an agent can extend without reading every file.

**Convention-based — Vite/Tailwind: pass.** Evidence: Astro owns the Vite configuration; `astro.config.mjs` adds only the Tailwind plugin. There is no bespoke build pipeline to learn.

**Convention-based — Supabase: partial.**
Evidence of drift: 14 of the 15 API routes under `src/pages/api/` reference Supabase, but only the three AI routes (`ai/generate-recipe.ts`, `ai/modify-recipe.ts`, `ai/save-recipe.ts`) route through the service layer in `src/lib/services/`. The auth, preferences, recipes and users routes call `locals.supabase` directly. Two data-access patterns coexist for the same job, and nothing on disk says which one new code should follow.
Second drift: Zod schemas are split. `src/lib/validations/` contains only `auth/login.ts`, `auth/register.ts` and `auth/reset-password.ts`, yet the `preferences/*` and `recipes/*` routes also use Zod — those schemas are declared inline in the route files. Again, two patterns, no stated rule.

**Convention-based — Shadcn/ui: partial.**
Evidence: `src/components/ui/` holds one shadcn primitive (`button.tsx`) alongside five bespoke application components (`ActionButtons.tsx`, `BaseModal.tsx`, `IconButton.tsx`, `LoadingSpinner.tsx`, `RecipeContent.tsx`). The shadcn convention is that `components/ui` contains generated primitives only. An agent running `npx shadcn add` will drop files into a directory that has already been repurposed, and an agent looking for "the button component" has two plausible answers.

**Popular in training data (assessed within the JS/TS family) — Astro 5 + React 19: partial.**
Astro and React are both mainstream within the JS ecosystem, so the frameworks themselves are well represented. The reservation is version skew, not obscurity: Astro 5 (December 2024) and React 19 (December 2024) are recent enough that a large share of training material describes Astro 3/4 and React 18. Concretely, this project imports the adapter from `@astrojs/vercel` — in Astro 4 that import was `@astrojs/vercel/serverless`, and an agent reproducing the older form produces a config that no longer resolves. Scored as a pass with a version-pinning note rather than a failure.

**Popular in training data — Tailwind 4: fail.**
Evidence: there is no `tailwind.config.js` in the repository, `components.json` carries `"tailwind": {"config": ""}`, and `src/styles/global.css` begins with `@import "tailwindcss"` followed by oklch tokens and `@custom-variant`. Tailwind 4 shipped in January 2025; the overwhelming majority of Tailwind material in training data is v3, which is configured through a JavaScript config file and the `@tailwind base; @tailwind components; @tailwind utilities;` directives. An agent working from priors will confidently create a `tailwind.config.js`, add a `content` array, and write v3 directives — all of which are wrong here and none of which fail loudly. This is the highest-frequency correction risk in the stack.

**Popular in training data — Jest 30 + ts-jest ESM on Astro: fail.**
Evidence: Jest and Playwright are individually top-tier, but the configuration in `jest.config.js` is not. It combines `preset: "ts-jest"`, `useESM: true`, `extensionsToTreatAsEsm: [".ts", ".tsx"]`, a `transformIgnorePatterns` carve-out for `@astrojs/.*` and `astro/.*`, and a separate `tsconfig.test.json`. This ESM-on-Jest arrangement is fragile and under-represented; the conventional test runner in the Vite/Astro ecosystem is Vitest, which is what most Astro-adjacent material shows. An agent asked to add a test is more likely to produce Vitest syntax or a CommonJS-shaped Jest config than to match this setup.

**Well-documented — Astro 5, React 19, Vite, Tailwind 4, Supabase, Shadcn/ui: pass.**
All six ship current, version-pinned, URL-addressable official documentation (docs.astro.build, react.dev, tailwindcss.com v4 docs, supabase.com/docs, ui.shadcn.com). Tailwind 4's docs are good; the failure above is about training-data priors, not documentation quality — which is exactly why an instruction-file rule can close it.

**Well-documented — Jest + Astro integration: fail.**
Evidence: the Astro testing documentation covers Vitest, Cypress and Playwright. It does not document a Jest integration, so the configuration in `jest.config.js` has no upstream reference page to consult. The `transformIgnorePatterns` carve-out and the `tsconfig.test.json` split are project-local knowledge that exists nowhere but in the config file itself.

## Gaps & Compensation

### Gap 1 — Tailwind 4 configuration will be written as Tailwind 3

**What failed:** training-data popularity for the Tailwind 4 CSS-first setup.

**Why it matters for agent workflows:** this is a silent-failure gap. An agent that creates `tailwind.config.js` gets no error — the file is simply ignored, the custom theme values never appear, and the developer debugs a styling problem whose cause is an inert config file. Because styling touches nearly every UI task, this gap fires more often than any other in the stack.

**Compensation:** a hard rule in the instruction file naming the v4 mechanism and forbidding the v3 one. See the ready-to-paste block below.

### Gap 2 — Test setup is undocumented upstream and unusual

**What failed:** training-data popularity and documentation for the Jest 30 + ts-jest ESM arrangement.

**Why it matters for agent workflows:** an agent asked to add tests will reach for Vitest idioms (`import { describe, it, expect } from "vitest"`) or write a CommonJS Jest config, and will not know that `.astro` components cannot be rendered by Jest at all — they are excluded from coverage in `jest.config.js` and have no transformer. Without a stated rule, an agent will try to unit-test an `.astro` page and fail in a confusing way.

A second, related observation that is not itself a criterion failure but shapes the compensation: `jest.config.js` declares an 80% global coverage threshold, while the repository contains two test files and CI runs `npm run test` rather than `npm run test:coverage`. The threshold is therefore aspirational and unenforced. An agent reading the config will overestimate the existing test baseline. The instruction file should state the real position so the agent does not assume coverage it can break.

**Compensation:** an instruction-file block stating the runner split, the `.astro` limitation, and the true coverage posture.

### Gap 3 — Version skew on Astro 5 and React 19

**What failed:** nothing outright; this is the partial on training-data currency.

**Why it matters for agent workflows:** the `@astrojs/vercel` import path changed between Astro 4 and 5, `output: "server"` semantics changed, and React 19 removed patterns (`forwardRef` is no longer required, `propTypes` are gone) that older material still teaches. Each produces code that looks idiomatic and is wrong for this version.

**Compensation:** pin versions and name the specific changed surfaces in the instruction file.

### Gap 4 — Two data-access patterns and two validation-schema locations

**What failed:** the convention partial on Supabase.

**Why it matters for agent workflows:** the diary module in the PRD adds a new table and a new set of API routes. With two live patterns and no stated rule, an agent will pick whichever it saw last — and the codebase ends with three patterns instead of two. This is the gap most likely to compound during the three-week delivery window.

**Compensation:** state the chosen pattern explicitly. This assessment does not decide which pattern is right — that is the developer's call — but the instruction-file block below is written for the service-layer pattern, since that is the one the PRD's new module most benefits from (the calorie cascade in FR-009/FR-010 is business logic that does not belong in a route handler).

### Gap 5 — `components/ui` has been repurposed

**What failed:** the convention partial on Shadcn/ui.

**Why it matters for agent workflows:** an agent adding a shadcn primitive writes into a directory that already holds application components; an agent looking for existing UI building blocks finds a mixed bag and cannot tell which files are safe to regenerate.

**Compensation:** either state that the mixing is intentional, or state the separation. The block below states the separation, which is the lower-surprise option for future `npx shadcn add` runs.

### Recommended Instruction File Additions

The blocks below are written to be pasted into `CLAUDE.md`. Note that the current `CLAUDE.md` consists entirely of a generated block between `<!-- BEGIN @przeprogramowani/10x-cli -->` and `<!-- END @przeprogramowani/10x-cli -->` markers, and carries no project conventions at all. Paste these **outside** those markers — content inside them is overwritten on the next toolkit sync.

```markdown
## Styling — Tailwind 4, CSS-first

This project uses Tailwind 4 via the Vite plugin (`@tailwindcss/vite` in `astro.config.mjs`).
There is no `tailwind.config.js` and one must never be created — in v4 it is ignored.

- Theme configuration lives in `src/styles/global.css` using `@theme`, not in a JS config file.
- The stylesheet is imported with `@import "tailwindcss";` — never with the v3 directives
  `@tailwind base; @tailwind components; @tailwind utilities;`.
- Design tokens are oklch CSS custom properties declared under `:root` in `src/styles/global.css`.
  Add new tokens there; do not introduce a parallel token system.
- Dark mode uses `@custom-variant dark (&:is(.dark *));` — not the v3 `darkMode: "class"` config key.
- There is no `content` array to update. v4 discovers templates automatically.
```

```markdown
## UI components — Shadcn/ui

`components.json` pins style `new-york`, `cssVariables: true`, lucide icons, Tailwind 4 mode
(empty `tailwind.config` path). Add primitives with `npx shadcn@latest add <component>`.

- `src/components/ui/` is for shadcn primitives only.
- Application-specific components belong in the domain folders:
  `src/components/{ai,auth,common,feedback,layout,pages,profile,recipe}/`.
- Import primitives via the `@/components/ui` alias; import the `cn` helper from `@/lib/utils/utils`.
- Variant APIs are built with `class-variance-authority`. Follow the pattern in
  `src/components/ui/button.tsx` rather than inventing a new one.
```

```markdown
## Testing

Two runners, split by scope. Do not mix them.

- **Unit / integration** — Jest 30 with ts-jest in ESM mode. Config: `jest.config.js`,
  TypeScript config: `tsconfig.test.json`. Tests live in `tests/unit/`, `tests/integration/`,
  or beside the source as `*.test.ts(x)` / `*.spec.ts(x)`. Run with `npm run test`.
- **End-to-end** — Playwright. Tests live in `tests/e2e/` with page objects in
  `tests/e2e/page-objects/`. Run with `npm run test:e2e` (sets `TEST_MODE=true`).

Rules:
- This project does NOT use Vitest. Do not write `import ... from "vitest"`.
  Jest globals are typed via `"types": ["@types/jest"]` in `tsconfig.json`.
- `.astro` files cannot be rendered by Jest — there is no transformer for them and they are
  excluded from coverage in `jest.config.js`. Put testable logic in `.ts` modules or React
  components; cover `.astro` pages with Playwright instead.
- Import aliases in tests: `@/*` to `src/*`, `@tests/*` to `tests/*`. They are mapped in both
  `tsconfig.json` and `jest.config.js` `moduleNameMapper` — update both if you add one.
- `jest.config.js` declares an 80% coverage threshold, but CI runs `npm run test`, not
  `npm run test:coverage`, and the current suite is two files. Treat 80% as the target for new
  code, not as a description of the existing baseline.
```

```markdown
## Framework versions — read before writing config

Pinned: Astro 5.5.5, React 19.0.0, Tailwind 4.0.17, Node 22.14.0 (`.nvmrc`), npm (package-lock.json).
Pre-Astro-5 and pre-React-19 patterns are common in training data and are wrong here.

- The Vercel adapter imports from `@astrojs/vercel` — NOT `@astrojs/vercel/serverless`
  (that path was Astro 4 and no longer resolves).
- `output: "server"` in `astro.config.mjs`. Every page is SSR by default; opt individual pages
  into prerendering with `export const prerender = true`.
- Middleware uses `defineMiddleware` from `astro:middleware` (`src/middleware/index.ts`).
- React 19: `forwardRef` is not needed — `ref` is a regular prop. Do not add `propTypes`.
- Use npm. Do not introduce pnpm/yarn/bun lockfiles.
```

```markdown
## Data access — Supabase

Supabase is the only backend; there is no custom server tier beyond Astro API routes.

- A request-scoped Supabase client is attached in `src/middleware/index.ts` and read from
  `Astro.locals.supabase` / `context.locals.supabase`. Never construct a new client inside a route.
- Business logic belongs in `src/lib/services/*.service.ts`, not in the route handler.
  Follow `src/lib/services/recipe.service.ts`. Route handlers parse input, call a service,
  and shape the response.
  (Note: the auth, preferences, recipes and users routes predate this rule and query
  `locals.supabase` directly. Follow the service pattern for new code; do not copy the older one.)
- Row types come from `src/db/database.types.ts`, which is GENERATED. Never hand-edit it.
  After any schema change, run `npm run supabase:gen`.
- Schema changes are migrations: `npm run supabase:new-migration <name>`, then edit the SQL in
  `supabase/migrations/`. Every new table must declare row-level security and per-user policies,
  matching the pattern in `supabase/migrations/20250427130913_healthymeal_schema.sql`.
  Existing tables: `preferences`, `recipes`, `logs`.
- `PUBLIC_PATHS` in `src/middleware/index.ts` is the authentication allowlist. Any new route not
  listed there requires a session.
```

```markdown
## Input validation

Zod 3 validates every API boundary.

- Schemas live in `src/lib/validations/<domain>/<action>.ts` and are imported by the route.
  Follow `src/lib/validations/auth/login.ts`.
- Do not declare schemas inline in route files. Some existing routes under `src/pages/api/recipes/`
  and `src/pages/api/preferences/` still do; that is the pattern being moved away from.
- Validate at the boundary and pass the parsed, typed value inward. Services receive validated
  input and do not re-parse.
```

## Summary

**Overall readiness: ready-with-compensation.** Fourteen of seventeen applicable criteria pass. The three failures are concentrated in two components — Tailwind 4 and the Jest test setup — and both have concrete, ready-to-paste instruction-file fixes. Nothing here argues for changing the stack.

**Key strengths.** The typing story is unusually good for a project this size: `strict` TypeScript with zero `any` annotations in `src/`, generated Supabase row types, Zod at the API boundary, and typescript-eslint's `strict` config enforcing it in CI. Astro's file-based conventions plus the domain-partitioned `src/components/` and `src/hooks/` trees mean an agent can predict where a new file belongs without reading the codebase. The CI pipeline gates lint, format, build, unit tests and E2E on every PR. For the diary module in the PRD, the existing row-level-security pattern in the schema migration gives a new `diary_entries` table a template to copy.

**Key gaps.** Tailwind 4's CSS-first configuration is the one an agent gets wrong most often and most silently — there is no `tailwind.config.js` here and creating one produces no error, just missing styles. The Jest 30 + ts-jest ESM setup is undocumented by Astro and unconventional for the ecosystem, and `.astro` files cannot be unit-tested at all. Two structural drifts round it out: Supabase is queried both directly from routes and through services, and Zod schemas live both in `src/lib/validations/` and inline in route files — with the diary module about to add a new table and new routes, those are worth settling before the work starts rather than after.

**The compensation is not yet in place.** `CLAUDE.md` currently contains only the generated toolkit block and no project conventions; there is no `AGENTS.md`. The planning documents in `.ai/` are design artefacts, not agent instructions. Pasting the seven blocks above (outside the toolkit markers) is the single highest-leverage action available before starting the diary module.

**Recommended next step:** `/10x-health-check`.
