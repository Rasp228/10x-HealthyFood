# Astro & React Runtime Notes

Behaviour of the Astro 7 / React 19 runtime that this project depends on, and the four failure
modes it produces that do not announce themselves. Conventions — which directory a file belongs
in, which pattern to follow — live in @AGENTS.md; this file is only the runtime behaviour.

## Rendering

Every page is SSR (`output: "server"`). Opt individual pages into prerendering with
`export const prerender = true`; API routes set it to `false` explicitly. A prerendered page that
reads `locals.user` renders once at build time with no session.

Middleware uses `defineMiddleware` from `astro:middleware` (@src/middleware/index.ts).

React 19: `ref` is a regular prop — no `forwardRef`, no `propTypes`.

## Dev server lock

Astro 7's dev server runs in the foreground — `--background` is opt-in. What it always does is take
a project-wide lock, so a second `astro dev` prints "Dev server already running" and exits,
including one spawned by a test harness. Use `astro dev status` / `astro dev stop`, or
`--ignore-lock` when you deliberately want a second instance on another port.

@playwright.config.ts carries `--ignore-lock` in its spawn command for exactly this reason; without
it Playwright reports "Process from config.webServer exited early".

## Stale Vite pre-bundle after a dependency change

**After changing dependencies, stop the dev server and delete `node_modules/.vite`.** Vite keys its
pre-bundled deps by hash; a server that outlived the change keeps serving the old key and the
browser gets `504 (Outdated Optimize Dep)`.

There is no error page. The island whose import chain touches the stale dep silently fails to
hydrate (`[astro-island] Error hydrating ...` in the console) and the page renders its SSR initial
state, which reads as an application bug — a page showing "Niezalogowany" with empty stats while
every API behind it answers 200.

## `security.checkOrigin`

Astro rejects non-GET requests without a matching `Origin` header (`security.checkOrigin`, on by
default). Browser code is unaffected; `curl` and Playwright's `page.request.*` are not — send
`Origin` explicitly or you get `403 Cross-site ... forbidden`.

`tests/e2e/services/cleanup.service.ts` sends one for this reason.
