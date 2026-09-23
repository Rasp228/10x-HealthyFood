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

## Toolkit marker-block syncs belong in their own commit

- **Context**: `CLAUDE.md` (and any file carrying a `<!-- BEGIN @przeprogramowani/10x-cli -->` …
  `<!-- END … -->` marker block), whenever a 10x-CLI sync updates the managed section while a
  change is in flight.
- **Problem**: The sync is generated, unrelated to whatever change is being worked on, and large —
  60 lines in `dee2aa6`. Twice in a row it rode along inside an unrelated commit: `dee2aa6`
  (`fix(diary-entry-store): apply implementation review findings`) carried a Lesson 2 → Lesson 3
  sync, and `2c88ee4` (message: `"doc"`) carried a Lesson 1 → Lesson 2 sync *and* a roadmap status
  flip, with a message that also breaks the Conventional-Commits-with-a-scope rule. The result is
  that `git log` and `git diff` for a change show toolkit churn mixed into the change's own
  history, so a reviewer scoping "what did this change touch" gets a false answer — which is
  exactly what an implementation review reads first.
- **Rule**: Commit a toolkit marker-block sync on its own, as `chore(toolkit): sync 10x-cli block`,
  before or after the change work but never inside it. A change commit contains only files the
  change's plan names. If a sync has already been staged alongside change work, unstage it and
  commit it separately rather than amending the message.
- **Applies to**: implement, impl-review
