# Repository Guidelines

10x-HealthyFood is an Astro 7 SSR app (`output: "server"`) with React 19 islands, Supabase as the
only backend, and OpenRouter.ai for AI recipe generation. This file is the single source of truth
for project conventions — @CLAUDE.md imports it rather than restating it, so edit this file.

Two files carry what this one deliberately does not repeat: @docs/reference/contract-surfaces.md
explains what breaks when a load-bearing name moves, and @docs/reference/known-drift.md lists where
the code does not yet follow the conventions below.

## Hard rules

- Never create `tailwind.config.js`. Tailwind 4 ignores it silently and styles just go missing.
  Theme config lives in @src/styles/global.css (`@theme`, `@custom-variant dark`).
- Never `import ... from "vitest"`. Unit tests are Jest 30 + ts-jest.
- Zod is **v4**: use `z.email()`, not `z.string().email()`, and read validation failures from
  `err.issues`. Validation errors leave every API route through `zodIssues` / `zodMessage`
  (@src/lib/utils/validation-errors.ts) — never `error.issues` or `error.format()` straight from a
  route. Why a structural guard on `ZodError.errors` fails silently instead of throwing:
  @docs/reference/contract-surfaces.md.
- View transitions use `<ClientRouter />` from `astro:transitions`. `<ViewTransitions />` was
  removed in Astro 6; see @src/layouts/MainLayout.astro.
- Never hand-edit @src/db/database.types.ts — it is generated. Run `npm run supabase:gen` after any
  schema change.
- Import the Vercel adapter from `@astrojs/vercel`, never `@astrojs/vercel/serverless` (Astro 4 path).
- Never construct a Supabase client inside a route — a second client races the middleware's one
  over the same refresh token. Read the request-scoped client from `context.locals.supabase`,
  attached in @src/middleware/index.ts.
- Session cookies leave through `flushCookies` (@src/db/supabase.client.ts), never through
  `Astro.cookies`. Every exit from @src/middleware/index.ts — each `redirect()` and the `next()`
  result — must pass through it. Why a skipped exit loses the rotated token without raising at the
  call site: @context/foundation/lessons.md.
- Do not re-declare types for third-party packages. A `declare module "axios"` shim shadows the
  real axios types and silently hides `.get()` and `isAxiosError`. Use the types the package ships.
- `cookie` stays a direct dependency at v2 (@package.json) even though nothing in `src/` looks like
  it needs one: @src/db/supabase.client.ts imports `stringifySetCookie` from it, and Astro's SSR
  entry resolves that import only while the declaration is there. Removing it or widening the range
  breaks session cookies at runtime, not at build.
- Use npm. Do not add a pnpm/yarn/bun lockfile. Node version is pinned in @.nvmrc (24.13.0).

## Project structure

- `src/pages/api/<domain>/` — API routes. Business logic belongs in `src/lib/services/*.service.ts`.
  The server-side exemplar is @src/lib/services/ai.service.ts: it is constructed with the
  request-scoped `SupabaseClient<Database>` from `context.locals.supabase`, receives already-validated
  input, and is the only thing the three `src/pages/api/ai/` routes do beyond parsing and responding.
  Not every `.service.ts` is a server service and not every route follows this rule yet — read
  @docs/reference/known-drift.md before modelling new code on an existing file. Methods on
  @src/lib/services/recipe.service.ts take no `userId`: auth travels in cookies, so `getUserRecipes`,
  `createRecipe` and `updateRecipe` must not regain one.
- Zod schemas live in `src/lib/validations/<domain>/<action>.ts` — follow
  @src/lib/validations/auth/login.ts. Do not declare them inline in routes; the routes that still do
  are listed in @docs/reference/known-drift.md. Services receive validated input and do not re-parse
  it.
- `src/components/ui/` is shadcn primitives only. Application components go in
  `src/components/{ai,auth,common,feedback,layout,pages,profile,recipe}/`; the ones currently
  misplaced in `ui/` are listed in @docs/reference/known-drift.md — do not add to that set.
- Every new table needs RLS and per-user policies, matching
  @supabase/migrations/20250427130913_healthymeal_schema.sql. Existing tables: `preferences`,
  `recipes`, `logs`, `diary_entries`. Start a migration with
  `npm run supabase:new-migration <name>`. Re-runnable proofs that those policies actually isolate
  users live in `supabase/checks/<table>-rls.sql` — run the one for a table after any migration
  touching it. They impersonate two subjects with `set local request.jwt.claims`, because the
  Supabase SQL editor's own role bypasses RLS and a plain cross-user `select` would pass against a
  table with RLS switched off. Substitute the `<uuid-a>` / `<uuid-b>` placeholders before running.
- A new route not listed in `PUBLIC_PATHS` (@src/middleware/index.ts) requires a session.
- Recurring pitfalls that already cost a fix once are recorded in @context/foundation/lessons.md —
  read it before touching middleware, session cookies or the dev-server/test harness. Add to it with
  `/10x-lesson` when a bug turns out to be a class of bug rather than a one-off.
- Names that carry a contract rather than a local detail — `flushCookies`, `PUBLIC_PATHS`,
  `locals.supabase`, the Zod error helpers, the enum values, the E2E env vars — are registered in
  @docs/reference/contract-surfaces.md with what breaks when each one moves.

## Commands

@package.json holds the scripts. Two things it does not tell you: `npm run test:e2e` sets
`TEST_MODE=true`, and `npm run typecheck` (`astro check`) is the only gate that verifies
`strict: true` — neither `astro build` nor ESLint checks types here.

`npm run typecheck` must stay at **0 errors** — it is a CI gate in the `code-quality` job.

## Astro & React

Opt an individual page into prerendering with `export const prerender = true`.

Four runtime behaviours cause failures that look like application bugs, all in
@docs/reference/astro-react-runtime.md: the project-wide dev-server lock that makes a second
`astro dev` exit, the stale `node_modules/.vite` pre-bundle that silently breaks hydration after a
dependency change, `security.checkOrigin` rejecting non-GET requests from `curl` and Playwright,
and prerendering a page that reads `locals.user`. Read it before changing dependencies, touching
the test harness, or debugging an island that renders its SSR initial state.

## Styling & UI

Tailwind 4 runs through `@tailwindcss/vite`, CSS-first. @src/styles/global.css is imported with
`@import "tailwindcss";` — never the v3 `@tailwind base/components/utilities` directives. Design
tokens are oklch custom properties under `:root` in that file; add new ones there instead of
starting a parallel system.
Toasts come from @src/hooks/common/useToast.ts, whose state is a module-level store rather than
`useState` — Astro islands are separate React roots, so a context provider could not span them.
A component that calls `showToast` must also render `<ToastContainer />`, otherwise the toast is
created and never drawn.

Add shadcn primitives with `npx shadcn@latest add <component>` (@components.json pins `new-york`,
`cssVariables`, lucide). Import primitives from `@/components/ui` and `cn` from `@/lib/utils/utils`;
build variant APIs with `class-variance-authority`, following @src/components/ui/button.tsx.

## Code style

TypeScript strict via `astro/tsconfigs/strict`; `src/` currently has zero `: any` — keep it that way.
React Compiler rules ship inside `eslint-plugin-react-hooks` v7 and are enabled through
`configs.flat.recommended` (@eslint.config.js) — there is no separate `eslint-plugin-react-compiler`
any more, and no `react-compiler/react-compiler` rule name. ESLint stays on 9.x: `eslint-plugin-react`
and `eslint-plugin-jsx-a11y` do not support ESLint 10 yet.

`react-hooks/set-state-in-effect` and `react-hooks/immutability` (react-hooks v7) are both
`error`. Two patterns keep new code clear of them:

- State that mirrors something outside React — the URL, `localStorage`, a media query — is read
  with `useSyncExternalStore`, not copied into state by an effect. See
  @src/hooks/common/useSearchParam.ts and @src/components/layout/ThemeToggle.tsx.
- State derived from props — a modal's form seeded from the record being edited — is adjusted
  during render against a key held in state, the pattern React's docs call "adjusting state when
  props change". See @src/components/recipe/RecipeFormModal.tsx.

Aliases `@/*` → `src/*` and `@tests/*` → `tests/*` are declared in both @tsconfig.json and
@jest.config.js — update both when adding one.

## Testing

Jest tests go in `tests/unit/`, `tests/integration/`, or beside the source as `*.test.ts(x)`; their
TypeScript config is @tsconfig.test.json. Playwright specs go in `tests/e2e/`, page objects in
`tests/e2e/page-objects/`. `.astro` files have no Jest transformer and are excluded from coverage —
put testable logic in `.ts`/React modules and cover pages with Playwright. The 80% threshold in
`jest.config.js` is a target for new code, not a description of the current suite; CI runs
`npm run test`, not `test:coverage`.

E2E runs against a server @playwright.config.ts starts itself. `E2E_PORT` overrides the port it
spawns on and `E2E_BASE_URL` points the suite at a server that is already running instead — for the
defaults and the `--ignore-lock` the spawn command must keep, see
@docs/reference/contract-surfaces.md.

`tests/e2e/services/cleanup.service.ts` deletes the test user's recipes after each run. Its
requests must carry an `Origin` header — see `security.checkOrigin` in
@docs/reference/astro-react-runtime.md.

## Commits & CI

Conventional Commits with a scope, as in `fix(auth): password reset repair`. CI
(@.github/workflows/ci-cd.yml) runs code-quality → build → unit-tests and e2e-tests in parallel;
E2E runs against the `integration` environment. Do not add a job that bypasses code-quality.

The `code-quality` job runs four gates in order: `lint` → `typecheck` → `format:check` →
`test:security`. Two notes on the last two:

- Format the tree with `npm run format`, verify it with `npm run format:check`. Never gate on
  `npm run format -- --check` — @docs/reference/contract-surfaces.md explains why it passes anyway.
- `npm run test:security` is `audit-ci` driven by @audit-ci.jsonc, which carries the `moderate`
  threshold and one allowlisted advisory. Review that entry on every `@astrojs/vercel` bump; the
  advisory itself, and what `npm audit fix --force` would do to it, are in
  @docs/reference/contract-surfaces.md.
- Prettier 3 reads `.gitignore` as well as @.prettierignore. Agent-written documents (`.ai/`,
  `context/`, `CLAUDE.md`) are excluded there — the formatter pads markdown tables to aligned
  columns, which fights every regeneration by a skill.
