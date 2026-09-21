---
project: "10x-HealthyFood"
version: 1
status: draft
created: 2026-09-16
context_type: brownfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  delivery_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

# PRD: 10x-HealthyFood — Calorie Diary Module

## Current System Overview

**System purpose (one sentence):** 10x-HealthyFood helps home cooks decide what to cook and keep their own recipe collection, including recipes adapted to their dietary restrictions.

**Key architecture:** a server-rendered web application with a thin server tier of its own. Supabase remains the only backend product, but the browser does not talk to it directly. Every request passes through a single middleware that creates one request-scoped Supabase client and attaches it to the request context; fifteen API routes belonging to the application read that client rather than constructing their own. Session cookies are written only on the way out of that middleware, never by an individual route. The model-routing service for AI features is reached from the same server tier. The diary module plugs into this tier — it is not a browser-to-BaaS addition.

**Tech stack:**
- Frontend: Astro 7, React 19, TypeScript 5, Tailwind 4, Shadcn/ui
- Backend: Supabase — PostgreSQL, built-in user authentication, SDK used as Backend-as-a-Service
- AI integration: OpenRouter.ai (access to OpenAI / Anthropic / Google models)
- Validation: Zod 4 at every API boundary (v4 API — `z.email()`, failures read from `err.issues`)
- Runtime & package manager: Node 24.13.0, pinned in `.nvmrc`; npm
- Testing: Jest, React Testing Library, Playwright
- CI/CD & hosting: GitHub Actions, Vercel
- Type gate: `npm run typecheck` (`astro check`, strict mode) runs in CI and must stay at zero errors

**Current user base:** home cooks who (a) don't know what to eat today, (b) want to cook from what they found in the kitchen, (c) want to save and remember a recipe, (d) want to take a recipe from the internet and modify it to fit a restriction (e.g. no eggs). Roughly 3–4 users — very small scale, but real multi-user with registration and login.

**Core functionality today:**
- Registration and login (Supabase auth).
- Profile with the user's dietary preferences.
- Recipe management on the main page: create a recipe manually, generate a new recipe with AI, edit an existing recipe with AI, edit manually, delete, browse.

**Recipe calorie data (as it exists today):** there is NO structured calorie column on the recipe. When a recipe carries nutrition information at all, it sits as free text inside the description, typically as a trailing block:

```
Wartości odżywcze (porcja):
- Kalorie: 250 kcal
- Białko: 25g
- Tłuszcze: 10g
- Węglowodany: 15g
```

Not every recipe has this block. Any calorie number sourced from an existing recipe must therefore be either extracted from prose or produced from the recipe content — it cannot simply be read from a field. This was the single largest cost driver discovered during shaping.

**Change category:** new module. The diary is its own area of the application alongside recipe management.

## Problem Statement & Motivation

Calorie counting today happens by hand or in a separate application. The recipes live in 10x-HealthyFood; the diary lives somewhere else. A user who cooks from their own recipe and then wants to know whether they are still within their daily target has to re-enter the same dish into a second tool that has never heard of that recipe. That re-entry is the cost of the current workaround, and it is paid at every meal.

The insight is proximity of data that already exists here. Three things the user named:
- The user's own and AI-modified recipes are already in this application — an external tracker cannot know them, so logging them there is double work.
- Dietary preferences are already stored in the profile — the diary can build on them instead of asking a second time.
- The path from cooking to logging should be one action: cooked it → ate it. Not a search through a foreign food database.

**Why now:** the existing users reach a point — a diet, a weight goal — where they shift from occasional use to daily use. At that moment the gap between "what I cook" and "what I ate" becomes a daily tax paid in a second product.

## User & Persona

**Primary persona:** the same person who already uses the application — a home cook managing their own recipes — but in a new mode of use. At a certain point (a diet, a weight goal) they shift from occasional use to daily use: they don't only look for what to cook, they track what they actually ate against a target.

No new user group is introduced by this change. The existing 3–4 users are the population.

## Success Criteria

### Primary
- A user can record something they ate today and see the calorie total for that day, through both entry paths: free-text entry with an AI-produced estimate, and selection of one of their own saved recipes with a stated portion.
- The first session produces a saved, calorie-valued diary entry without the user having configured anything beforehand (no goal, no setup).

### Secondary
- The user can set an optional daily calorie goal in their profile, next to existing dietary preferences, and see the day's total against it.

### Guardrails
- Saved recipes and dietary preferences are never deleted or permanently damaged by this change. This is the only irreversible failure the user named; everything else is recoverable.
- The module remains usable when the AI estimate is unavailable, times out, or returns something implausible — a calorie value can always be entered by hand. The AI suggests; it is never the only way to produce a number.
- Every existing screen and action — recipe creation, AI generation, AI editing, manual editing, deletion, browsing, registration, login, profile preferences — behaves exactly as before.

## User Stories

### US-01: First session — logging something that is not a recipe

- **Given** a logged-in user who has set nothing up, has no calorie goal, and has never opened the diary
- **When** they open the diary panel, create an entry describing what they ate as free text ("zjadłem frytki") with an amount as free text ("około 200 g"), and ask for the calorie value to be worked out
- **Then** the entry is saved and visible immediately, and its calorie value appears against it once established

#### Acceptance Criteria

- The entry appears in the day's list in under one second, without waiting for any calorie value.
- The user can accept the established value or replace it with one they type themselves.
- The day's total reflects the entry once its value exists, and says so while the value is still pending.
- If no value is established within one minute, the entry is shown as not calculated and the user can supply the number by hand.
- Nothing about this path requires a calorie goal to have been set.

**What was different before:** this path did not exist. The user counted calories by hand or in a separate application that had no knowledge of this product.

### US-02: Logging one of the user's own recipes

- **Given** a logged-in user with saved recipes of their own
- **When** they create a diary entry, search their recipes by name, select one, and state how many portions they ate (the field starting at one)
- **Then** the entry is saved with a calorie value derived from that recipe, scaled to the stated number of portions

#### Acceptance Criteria

- Search covers the user's own recipes only, matched by name.
- When the recipe's description carries nutrition figures that say they are per portion, the value is taken from them and multiplied by the number of portions eaten.
- When the recipe carries no nutrition figures, or figures that do not say whether they cover one portion or the whole dish, the user can have a value estimated from the recipe's own content instead.
- The value shown states which of these it came from, and can be replaced by a number the user types.
- No value produced on this path is written back to the recipe.
- Deleting that recipe later leaves this entry, and the totals of past days, unchanged.

**What was different before:** the recipe and the calorie count lived in two different products, so logging a home-cooked meal meant re-entering it somewhere that had never seen it.

## Scope of Change

Each item carries its delta category. FR identifiers are retained from shaping for traceability. Socratic blockquotes record the counter-position that was put to the user and what they decided.

### Diary entry

- [new] FR-001: User can open a calorie diary panel and see the entries recorded for a chosen day. Priority: must-have
  > Socrates: Considered adding an "I ate this" shortcut on the recipe screen, which would serve the stated "cooked it → ate it" insight in one click. Resolution: entries are created from the diary panel only. The shortcut would touch the existing recipe screen and widen the blast radius; the panel stays the single entry point.

- [new] FR-002: User can create a diary entry for a chosen day. The content eaten is free text. The amount is given as a number of portions when the entry comes from a recipe, and as free text when the user describes the food themselves. Priority: must-have
  > Socrates: Considered a single representation for the amount. Free text everywhere makes even the recipe path depend on the model; a structured field everywhere forces the user to convert "a big plate of fries" into grams. Resolution: both, chosen per path — the recipe path multiplies a number and needs no model, the free-text path was going to the model anyway. This resolves the seed's open question about how to represent a portion.

- [new] FR-003: User can request an AI calorie estimate for a free-text entry. The entry is saved immediately and the calorie value is produced afterwards, without the user waiting. Priority: must-have
  > Socrates: Considered keeping the user on a waiting screen for up to ~30 s per entry. Resolution: rejected — a diary lives on daily habit, and half a minute per meal is what kills the habit. The entry saves first and the value arrives later, which makes FR-011 responsible for showing an incomplete total honestly.

- [new] FR-004: User can enter a calorie value by hand instead of using the AI estimate, at any time. Priority: must-have
  > Socrates: Considered hiding the manual field, or unlocking it only after the AI path fails, so the primary path stays clean. Resolution: rejected — the field stays always available. This is the module's fallback with no model, and gating it behind a failure would leave the diary unusable whenever calorie estimation is unavailable.

- [new] FR-005: User can edit any part of a saved entry — content, amount, calorie value and day. Recalculating the calorie value after such an edit is the user's explicit action, never automatic. Priority: must-have
  > Socrates: Considered automatic recalculation on every edit, for internal consistency. Resolution: rejected — it would silently discard a value the user corrected by hand, which is exactly the fallback FR-004 exists to protect. The user is offered a recalculation; the stored value stands until they take it.

- [new] FR-006: User can delete a saved entry, after confirming. Priority: must-have
  > Socrates: Considered deleting without confirmation, since a diary entry is small and easy to recreate — unlike a recipe. Resolution: confirmation kept; the cost is one dialog and it covers mis-taps on a phone.

### Entry from an existing recipe

- [new] FR-007: User can search their own recipes by name and select one as the content of a diary entry. Priority: must-have
  > Socrates: Considered also surfacing recently-eaten recipes without typing, since daily logging is largely repetition, and considered searching ingredients as well. Resolution: search by name only for v1. Both extensions were judged unnecessary for a single person's own recipe collection.

- [new] FR-008: User can state how many portions of the selected recipe they ate. The field defaults to one portion. Priority: must-have
  > Socrates: Considered treating an empty field as "the whole portion" (the original Phase 3 formulation), and considered making the value mandatory. Resolution: a default of 1 instead — it removes the empty state entirely, so nothing has to be inferred and the common case needs no input.

- [new] FR-009: User sees a calorie value taken from the nutrition figures already present in the selected recipe's description, but only where those figures themselves state that they describe one portion. In that case the value is the stated figure multiplied by the number of portions eaten. Priority: must-have
  > Socrates: Asked whether the block is always per portion, which would make the calculation a plain multiplication. Resolution: it is not — recipes pasted from the internet and edited by hand may state values for the whole dish. Reading the block is therefore an interpretation problem, not a parsing problem, and this weakens the Phase 3 argument that the parse path avoids the model. Recorded as a risk.
  > Resolved 2026-09-16: this path is taken only where the figures are self-declaring (`Wartości odżywcze (porcja)` and equivalents). Figures that do not say what they cover are not interpreted and not guessed at — they fall through to FR-010. The interpretation problem is removed rather than solved, at the cost of sending some recipes that do carry figures to estimation anyway.

- [new] FR-010: User can request an AI estimate derived from the recipe's own content when that recipe carries no nutrition figures, or carries figures that do not state whether they cover one portion or the whole dish. The resulting value is not written back to the recipe. Priority: must-have
  > Socrates: Considered persisting the computed value onto the recipe so it is calculated once. Resolution: rejected — it would mean writing to the data the user declared untouchable, and would require changing how recipe data is stored. At 3–4 users the repeated model calls cost nothing worth optimising.

### Daily total and goal

- [new] FR-011: User can see the calorie total for a chosen day, together with an indication of any entries whose value is still being calculated. Priority: must-have
  > Socrates: Considered withholding the total until every entry is calculated, and considered showing the partial sum unannotated. Resolution: show the total and say what is still pending — withholding removes the module's main number, and an unannotated partial sum understates the day and invites a decision based on a wrong figure.

- [modified] FR-012: User can set an optional daily calorie goal in their profile, as a number they enter themselves, alongside existing dietary preferences. Priority: must-have
  > Socrates: Considered computing the goal from body data (weight, height, age, activity) or offering a calculator alongside the field. Resolution: a plain number only — it is the smallest possible change to the profile, which holds preferences that must survive this work intact, and it leaves control with a user who may have been given a figure by a dietitian.

- [new] FR-013: User can see the day's total against their goal as a progress indicator whenever a goal is set. Priority: must-have
  > Socrates: Considered plain numbers with a remaining-calories figure, as the neutral option that never reads as a judgement. Resolution: a progress bar — more readable on a phone. Exceeding the goal must be designed so it does not read as an error state.

### Preserved

- [preserved] FR-014: User can create, generate with AI, edit, delete and browse recipes exactly as before. Priority: must-have
- [preserved] FR-015: User's saved recipes and dietary preferences survive this change intact. Priority: must-have
- [preserved] FR-016: User can register and log in exactly as before. Priority: must-have

  > Socrates (asked once for FR-014 through FR-016 jointly, rather than one challenge each, because the three state a single guarantee): asked where this change actually touches what must survive. Resolution: the profile is the only place the module writes to existing user data, because FR-012 adds the goal field there. Recipes are read and never written. The risk to preserved behaviour is therefore concentrated in one field on one existing record.

### Removed

- Nothing is removed by this change.

### Scope drift recorded during shaping

Three Phase 4 answers widened the change beyond what the 3-week estimate in Phase 3 covered: editing entries (not only deleting), entries for any day (not only today), and an AI estimation path for recipes with no nutrition figures. A fourth arrived in the Socratic round: FR-009 turned out to require deciding whether a nutrition block is per-portion or per-dish, which is harder than the parsing assumed in Phase 3.

Resolved 2026-09-16. The fourth item was closed by narrowing FR-009 to self-declaring figures, which removes the interpretation work entirely. The first three stand as scope: the user re-confirmed the three-week window with the full scope in place and accepted the risk of overrun rather than dropping entry editing or any-day entries.

## Constraints & Compatibility

- **Recipes are read, never written.** The module reads recipe descriptions to obtain calorie figures and does not modify, annotate or restructure recipe records. The nutrition block stays where it is, as free text inside the description.
- **One write to pre-existing user data.** The profile gains a single optional field for the daily calorie goal. Existing dietary preferences on that record are not touched. This is the only point at which the module writes to data that existed before it.
- **Diary entries are self-contained.** An entry stores its own copy of what was eaten and the calorie value at the time of saving. Deleting a recipe later leaves past days exactly as they were, and recipe deletion continues to behave as it does today.
- **Authentication and roles are unchanged.** No new roles, no new sign-in paths, no change to how a session is established.
- **Backward compatibility.** Every existing screen and action — recipe creation, AI generation, AI editing, manual editing, deletion, browsing, registration, login, profile preferences — behaves as before. The module is additive.
- **Blast radius as assessed by the user.** New storage for diary data only; existing recipe data is read, not restructured. The profile gains one optional field.
- **Delivery window: three weeks, after-hours, one developer, full scope.** The scope that grew after the original estimate — entry editing, entries for any day, and the estimation path in FR-010 — stays in v1. The user re-confirmed the estimate on 2026-09-16 with that scope in view and accepted the risk of overrun rather than cutting back.
- **No hard deadline is pinned.** The work is timed against the user's course submission date, with the intent to finish one week ahead and hold that week as an emergency buffer. The date itself is deliberately not recorded here; the buffer rule is the constraint that binds.

### Quality properties this change must hold

- A saved diary entry appears in the day's list in under one second, and its appearance never waits on a calorie value being established.
- A calorie value that has not been established within one minute of the entry being saved is presented to the user as not calculated, with the number available to be supplied by hand instead.
- The diary is fully usable with no calorie estimation available: an entry can be created, valued, saved, corrected and counted into the day's total without it.
- Every displayed calorie value carries its origin — taken from the user's own recipe, estimated from a recipe, estimated from a description, or entered by the user.
- A displayed daily total that is missing the value of one or more entries says so; it is never presented as if it were complete.
- Before any description of food or any recipe content leaves the product in order to have calories estimated, the user knows that it will.
- The module holds on the browsers and devices the product already supports; this change introduces no narrower support floor.

## Business Logic Changes

**Existing rule (unchanged by this work):** the product composes and adapts recipes to the dietary restrictions the user has declared.

**Rule added by this module, in one sentence:** for anything the user records as eaten, the module establishes a calorie value from the best source available to it — the nutrition figures already written into the user's own recipe, an estimate derived from that recipe's content, an estimate derived from the user's own free-text description, or a number the user supplies directly — and scales that value to the portion they say they ate.

The inputs the rule consumes are: what was eaten (either a recipe the user already owns, or a free-text description), how much of it was eaten (a number of portions when a recipe was named, free text otherwise), and whatever calorie information already exists for that food. The rule's output is a single calorie value attached to one diary entry, together with the origin of that value. Entries for a day are summed into a daily total, which is placed against the user's goal when one is set. The first source in the cascade is used only where the recipe's own figures say what they cover: figures that declare themselves per-portion are scaled by the number of portions eaten, while figures that leave that unstated are treated as if they were absent and the next source is used instead.

The user encounters the rule twice. First at the moment of logging: they say what they ate, the entry is stored immediately, and a calorie figure appears against it — instantly when the value could be taken from their own recipe, shortly afterwards when it had to be estimated, or as soon as they type it when they choose to supply it themselves. Second at the level of the day: the total tells them where they stand, and the origin of each value tells them how much to trust that total.

The cascade is ordered by confidence, not by convenience, and every step of it can be overridden by the user entering a number by hand. That override is the reason the rule holds even with no estimation available at all.

## Access Control Changes

**No access control changes — current model preserved.**

**Current model (preserved):** registration and login through the application's existing authentication. Flat role model — every logged-in user is equal; there is no admin or privileged role. Data is private per user: each user sees only their own recipes.

**What this module inherits unchanged:** a diary entry belongs to exactly one user and is visible only to that user. No new roles, no new sign-in paths, no sharing relationship, no unauthenticated access.

> Socrates (smallest access change that still makes the feature useful): sharing a diary with a partner or a dietitian was considered and rejected for this change — it would add a new permission relationship to a system that has none today, for a population of 3–4 users who each track for themselves.

## Non-Goals

**Functional**

- **No food-product database.** No catalogue of foods with calories per 100 g, no import from an external nutrition database. Calorie values come only from the cascade named in the business rule. This is the load-bearing non-goal: most calorie trackers are built around exactly such a database, and this one deliberately is not.
- **No macronutrients.** Protein, fat and carbohydrates sit in the same nutrition block and would be nearly free to read, yet v1 does not count, total or set goals against them. Calories only.
- **No diary sharing.** No view for a partner, a dietitian or anyone else. Considered during shaping and rejected; the diary stays strictly private to its owner.
- **No recognition from photos or barcodes.** No photographing a plate, no scanning packaging. Input is text, or a selection from the user's own recipes.
- **No statistics beyond a single day.** No weekly charts, averages, trends or streaks. Earlier days can be viewed, but nothing is summarised across them. The unit of the module is the day.
- **No reminders to log meals.** No notifications, no emails, no nudges. The habit belongs to the user, not to the product.
- **No change to recipe management.** Creating, generating, editing, deleting and browsing recipes are untouched by this change.

**Non-functional**

- **No writing calories onto recipes.** No calorie value persisted against a recipe, and no change to how recipe data is stored. Follows directly from FR-010 and protects the data the user declared untouchable.
- **No offline guarantee.** The module works without calorie estimation, but not without a connection to the application itself.
- **No claim about what the model provider retains.** The user is told what leaves the product before it leaves, and that commitment stands. Beyond it, v1 states nothing and guarantees nothing about retention, training use or deletion on the provider's side. Making such a claim would mean reading and then tracking someone else's terms, which this change does not take on.

## Open Questions

None open. The four questions carried out of shaping were resolved on 2026-09-16; each resolution now lives in the section it affects, and is restated here so the trail is readable.

1. **What is the hard deadline date?** — Resolved: not pinned. `hard_deadline` stays null. The binding constraint is the rule, not a date: finish one week before the course submission date and hold that week as an emergency buffer. See `## Constraints & Compatibility`.
2. **Does a recipe's nutrition block describe one portion or the whole dish?** — Resolved: the question is no longer asked. The recipe's figures are used only where they declare themselves per-portion; figures that leave it unstated are treated as absent and the entry falls through to estimation from the recipe's content. This closes the FR-009 correctness risk by removing the interpretation step rather than by getting it right. See FR-009 and FR-010.
3. **Does the 3-week estimate still hold after the scope grew?** — Resolved by decision: three weeks and the full scope both stand. The user re-confirmed with the four widening decisions in view and accepted the risk of overrun rather than dropping FR-005 or any-day entries. This is an accepted risk, not a settled fact. See `## Constraints & Compatibility`.
4. **What does the model provider retain?** — Resolved: nothing is claimed. The informational commitment ("the user knows what leaves the product before it leaves") stands, and the absence of any retention guarantee is now an explicit non-goal rather than an unanswered question. See `## Non-Goals`.
