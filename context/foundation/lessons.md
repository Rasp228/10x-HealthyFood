# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame,
> /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Every exit from middleware must pass through flushCookies

- **Context**: `src/middleware/index.ts` and any code path that ends a request while a Supabase
  session may need rotating — every `redirect()` and the `next()` result.
- **Problem**: `@supabase/ssr` writes session cookies from an `onAuthStateChange` listener that can
  resolve after the response was sent. `Astro.cookies.set` then throws `ResponseSentError`, the
  rotated token never reaches the browser, and the failure is logged rather than surfaced — the
  user is silently signed out on the next request.
- **Rule**: Session cookies leave only through `flushCookies` from `src/db/supabase.client.ts`,
  never through `Astro.cookies`. Wrap every return from the middleware in it — each `redirect()`
  and the awaited `next()`.
- **Applies to**: plan, implement, impl-review

## Treat a direct-dependency bump from npm audit fix as its own change

- **Context**: Any change that runs `npm audit fix` (with or without `--force`) — typically when
  `test:security` turns red on an unrelated push — and any phase touching `package.json` /
  `package-lock.json`.
- **Problem**: `npm audit fix` resolves within `^` ranges and silently bumps direct dependencies
  alongside the transitive fix. On 2026-10-09 it moved `@astrojs/vercel` 11.0.10 → 11.0.13, which
  pulled `rolldown` into the bundle; every Vercel function crashed at start ("Cannot find native
  binding") while lint, typecheck, Jest and E2E stayed green, and production stayed down for up
  to ~3.5 h until noticed by hand (`93c420b` → `8617661`).
- **Rule**: `npm audit fix` may bump a direct dependency within its `^` range as a side effect.
  Treat every such bump as a separate change and verify the built artifact before pushing.
- **Applies to**: implement, impl-review
