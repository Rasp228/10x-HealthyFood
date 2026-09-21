# Repository Guidelines

10x-HealthyFood is an Astro 7 SSR app (`output: "server"`) with React 19 islands, Supabase as the
only backend, and OpenRouter.ai for AI recipe generation. This file is the single source of truth
for project conventions — @CLAUDE.md imports it rather than restating it, so edit this file.

## Hard rules

- Never create `tailwind.config.js`. Tailwind 4 ignores it silently and styles just go missing.
  Theme config lives in @src/styles/global.css (`@theme`, `@custom-variant dark`).
- Never `import ... from "vitest"`. Unit tests are Jest 30 + ts-jest.
- Zod is **v4**. Use `z.email()`, not `z.string().email()`. Read validation failures from
  `err.issues` — `ZodError.errors` no longer exists, and `"errors" in err` now returns `false`,
  so a structural check against it fails silently instead of throwing.
- View transitions use `<ClientRouter />` from `astro:transitions`. `<ViewTransitions />` was
  removed in Astro 6; see @src/layouts/MainLayout.astro.
- Never hand-edit @src/db/database.types.ts — it is generated. Run `npm run supabase:gen` after any
  schema change.
- Import the Vercel adapter from `@astrojs/vercel`, never `@astrojs/vercel/serverless` (Astro 4 path).
- Never construct a Supabase client inside a route — the auth routes used to, and their client
  raced the middleware's one over the same refresh token. Read the request-scoped client from
  `context.locals.supabase`, attached in @src/middleware/index.ts.
- Session cookies leave through `flushCookies` (@src/db/supabase.client.ts), never through
  `Astro.cookies`. `@supabase/ssr` writes them from an `onAuthStateChange` listener that can
  resolve after the response was sent, and `Astro.cookies.set` then throws `ResponseSentError`
  while the rotated token never reaches the browser. Every exit from @src/middleware/index.ts —
  each `redirect()` and the `next()` result — must pass through `flushCookies`; a write that
  arrives afterwards is lost and logged. See @context/foundation/lessons.md.
- Do not re-declare types for third-party packages. A hand-written `declare module "axios"` shim
  used to shadow the real axios types here and silently hid `.get()` and `isAxiosError`; it was
  deleted. Use the types the package ships.
- Use npm. Do not add a pnpm/yarn/bun lockfile. Node version is pinned in @.nvmrc (24.13.0).

## Project structure

- `src/pages/api/<domain>/` — API routes. Business logic belongs in `src/lib/services/*.service.ts`;
  follow @src/lib/services/recipe.service.ts. The auth, preferences, recipes and users routes
  predate this rule and query `locals.supabase` directly — do not copy them.
- Zod schemas live in `src/lib/validations/<domain>/<action>.ts` — follow
  @src/lib/validations/auth/login.ts. Do not declare them inline in routes; some routes under
  `src/pages/api/recipes/` and `src/pages/api/preferences/` still do, and that pattern is being
  retired. Services receive validated input and do not re-parse it.
- `src/components/ui/` is shadcn primitives only. Application components go in
  `src/components/{ai,auth,common,feedback,layout,pages,profile,recipe}/`. Known drift:
  `ActionButtons.tsx`, `BaseModal.tsx`, `IconButton.tsx`, `LoadingSpinner.tsx` and
  `RecipeContent.tsx` sit in `ui/` despite being application components — do not add to that set.
- Every new table needs RLS and per-user policies, matching
  @supabase/migrations/20250427130913_healthymeal_schema.sql. Existing tables: `preferences`,
  `recipes`, `logs`. Start a migration with `npm run supabase:new-migration <name>`.
- A new route not listed in `PUBLIC_PATHS` (@src/middleware/index.ts) requires a session.

## Commands

@package.json holds the scripts. Two things it does not tell you: `npm run test:e2e` sets
`TEST_MODE=true`, and `npm run typecheck` (`astro check`) is the only gate that verifies
`strict: true` — neither `astro build` nor ESLint checks types here.

`npm run typecheck` must stay at **0 errors** — it is a CI gate in the `code-quality` job.

## Astro & React

Every page is SSR; opt individual pages into prerendering with `export const prerender = true`.
Middleware uses `defineMiddleware` from `astro:middleware` (@src/middleware/index.ts).
React 19: `ref` is a regular prop — no `forwardRef`, no `propTypes`.

Astro 7's dev server runs in the foreground — `--background` is opt-in. What it always does is
take a project-wide lock, so a second `astro dev` prints "Dev server already running" and exits,
including one spawned by a test harness. Use `astro dev status` / `astro dev stop`, or
`--ignore-lock` when you deliberately want a second instance on another port.

**After changing dependencies, stop the dev server and delete `node_modules/.vite`.** Vite keys its
pre-bundled deps by hash; a server that outlived the change keeps serving the old key and the
browser gets `504 (Outdated Optimize Dep)`. There is no error page — the island whose import chain
touches the stale dep silently fails to hydrate (`[astro-island] Error hydrating ...` in the
console) and the page renders its SSR initial state, which reads as an application bug. This is
exactly how `/profile` came to show "Niezalogowany" with empty stats after the 2026-09-17 upgrade,
while every API behind it answered 200.

Astro rejects non-GET requests without a matching `Origin` header (`security.checkOrigin`, on by
default). Browser code is unaffected; `curl` and Playwright's `page.request.*` are not — send
`Origin` explicitly or you get `403 Cross-site ... forbidden`.

## Styling & UI

Tailwind 4 runs through `@tailwindcss/vite`, CSS-first. @src/styles/global.css is imported with
`@import "tailwindcss";` — never the v3 `@tailwind base/components/utilities` directives. Design
tokens are oklch custom properties under `:root` in that file; add new ones there instead of
starting a parallel system. There is no `content` array — v4 discovers templates itself.
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

E2E runs against a server @playwright.config.ts starts itself. Two knobs, both env vars:
`E2E_PORT` (default 3000) picks the port the harness spawns on — set it when something else holds
3000 locally — and `E2E_BASE_URL` points the suite at a server that is already running, in which
case no `webServer` is spawned at all. The spawn command passes `--ignore-lock`, without which
Astro's project lock makes the second dev server exit immediately and Playwright reports
"Process from config.webServer exited early".

`tests/e2e/services/cleanup.service.ts` deletes the test user's recipes after each run. Its
requests must carry an `Origin` header — see the `security.checkOrigin` note under "Astro & React".

## Type debt — cleared 2026-09-18

The 4 errors that `astro check` surfaced after the dependency upgrade are fixed and
`npm run typecheck` now gates CI. Two of them hid real defects, worth knowing about:

- The mock-era `"current-user"` argument is gone. @src/lib/services/recipe.service.ts is a
  client-side fetch wrapper and auth travels in cookies, so `getUserRecipes`, `createRecipe` and
  `updateRecipe` no longer take a `userId` they never read. Do not reintroduce it.
- @src/components/recipe/RecipeDetailPage.tsx passed an `onSuccess` prop that
  `RecipeDetailContentProps` never declared, while passing neither `onEdit` nor `onAI` — so the
  edit and AI buttons on `/recipes/<id>` did nothing and delete only redirected home without
  deleting. It now wires `RecipeFormModal`, `AIModal` and `ConfirmDialog` the way
  @src/components/pages/HomePage.tsx does.

Validation errors leave every API route through `zodIssues` / `zodMessage`
(@src/lib/utils/validation-errors.ts) — do not return `error.issues` or the deprecated
`error.format()` straight from a route.

## Commits & CI

Conventional Commits with a scope, as in `fix(auth): password reset repair`. CI
(@.github/workflows/ci-cd.yml) runs code-quality → build → unit-tests and e2e-tests in parallel;
E2E runs against the `integration` environment. Do not add a job that bypasses code-quality.

The `code-quality` job runs four gates in order: `lint` → `typecheck` → `format:check` →
`test:security`. Two notes on the last two:

- Format the tree with `npm run format`, verify it with `npm run format:check` (`prettier --check .`).
  Never gate on `npm run format -- --check` — it expands to `prettier --write . --check`, writes
  fixes and exits 0.
- `npm run test:security` is `audit-ci` driven by @audit-ci.jsonc, which carries the `moderate`
  threshold and one allowlisted advisory (`GHSA-9wv6-86v2-598j`, transitive `path-to-regexp` from
  `@astrojs/vercel`). Review that entry on every adapter bump; do not add a second one without the
  same kind of comment.
- Prettier 3 reads `.gitignore` as well as @.prettierignore. Agent-written documents (`.ai/`,
  `context/`, `CLAUDE.md`) are excluded there — the formatter pads markdown tables to aligned
  columns, which fights every regeneration by a skill.

---

Dependency baseline refreshed 2026-09-17: Astro 7.3.3, @astrojs/vercel 11.0.10, @astrojs/react 6.0.6,
React 19.3.0, Tailwind 4.3.3, Zod 4.6.5, ESLint 9.39.5, Jest 30.5.1, Node 24.13.0.
Structural conventions derived from @context/foundation/stack-assessment.md (assessed 2026-09-16);
its version numbers are superseded by this block.
