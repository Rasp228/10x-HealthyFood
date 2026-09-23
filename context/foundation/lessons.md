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
