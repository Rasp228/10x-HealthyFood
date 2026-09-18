---
project: "10x-HealthyFood"
context_type: brownfield
created: 2026-09-16
updated: 2026-09-16
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "context type"
      decision: "brownfield — module inside existing 10x-HealthyFood app; cwd has no project markers (training dir), user confirmed override"
    - topic: "recipe calorie data today"
      decision: "CORRECTED in Phase 3 — no calorie column exists; nutrition lives as free text inside the recipe description, and not in every recipe"
    - topic: "change category"
      decision: "new module alongside recipe management"
    - topic: "primary persona"
      decision: "same existing home-cook user, in a new daily-tracking mode; no new user group"
    - topic: "recipe visibility"
      decision: "private per user; each user sees only their own recipes"
    - topic: "role model"
      decision: "flat — all logged-in users equal, no admin role"
    - topic: "access control change"
      decision: "none — diary strictly private per user, same rule as existing data; no sharing in scope"
    - topic: "v1 entry paths"
      decision: "both — free-text manual with AI estimate, and selection of own recipe"
    - topic: "calorie source for recipes"
      decision: "parse the nutrition block from the recipe description; no column added, no migration"
    - topic: "no-model fallback"
      decision: "manual kcal entry always available; AI assists but is never required"
    - topic: "delivery timeline"
      decision: "3 weeks after-hours; risk accepted after the kcal-in-prose discovery"
    - topic: "main domain rule"
      decision: "cascade of calorie sources, scaled to the portion eaten; user override always available"
    - topic: "portion representation"
      decision: "number of portions on the recipe path, free text on the manual path"
    - topic: "calorie value provenance"
      decision: "every value shows which of the four sources it came from"
    - topic: "deleted recipe vs past entries"
      decision: "entries keep their own copy of name and value; recipe deletion unchanged"
    - topic: "privacy commitment"
      decision: "informational — user knows what leaves the product; no retention claim made about the model provider"
  frs_drafted: 16
  quality_check_status: accepted
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

# Shape Notes

## Seed idea (verbatim)

> Moduł dziennika żywieniowego w istniejącej aplikacji 10x-HealthyFood: użytkownik wybiera dania już obecne w aplikacji jako zjedzone dziś, podaje zjedzoną porcję, widzi sumę kalorii dnia względem celu
> lub samemu wypełnia co zjadł i ile wraz z kaloriami lub z kaloriami do wyliczenia przez llm. Kalorie dania pochodzą z
> danych w aplikacji lub z oszacowania na podstawie przepisu. Do rozstrzygnięcia: która reguła jest główną logiką modułu, jak reprezentować porcję, oraz wariant zapasowy dla szacowania kcal bez integracji z modelem.

---

## Current System

**System purpose (one sentence):** 10x-HealthyFood helps home cooks decide what to cook and keep their own recipe collection, including recipes adapted to their dietary restrictions.

**Core functionality today:**
- Registration and login (Supabase auth).
- Profile with the user's dietary preferences.
- Recipe management on the main page: create a recipe manually, generate a new recipe with AI, edit an existing recipe with AI, edit manually, delete, browse.

**Recipe calorie data (corrected in Phase 3):** there is NO structured calorie column on the recipe. When a recipe carries nutrition information at all, it sits as free text inside the description, typically as a trailing block:

```
Wartości odżywcze (porcja):
- Kalorie: 250 kcal
- Białko: 25g
- Tłuszcze: 10g
- Węglowodany: 15g
```

Not every recipe has this block. Any calorie number sourced from an existing recipe must therefore be either extracted from prose or produced from the recipe content — it cannot simply be read from a field. This is the single largest cost driver discovered during shaping.

**Tech stack:**
- Frontend: Astro 7, React 19, TypeScript 5, Tailwind 4, Shadcn/ui
- Backend: Supabase — PostgreSQL, built-in user authentication, SDK used as Backend-as-a-Service
- AI integration: OpenRouter.ai (access to OpenAI / Anthropic / Google models)
- Testing: Jest, React Testing Library, Playwright
- CI/CD & hosting: GitHub Actions, Vercel

**Current user base:** home cooks who (a) don't know what to eat today, (b) want to cook from what they found in the kitchen, (c) want to save and remember a recipe, (d) want to take a recipe from the internet and modify it to fit a restriction (e.g. no eggs). Roughly 3–4 users — very small scale, but real multi-user with registration and login.

**Change category:** new module. The diary is its own area of the application alongside recipe management.

## Vision & Problem Statement

Calorie counting today happens by hand or in a separate application. The recipes live in 10x-HealthyFood; the diary lives somewhere else. A user who cooks from their own recipe and then wants to know whether they are still within their daily target has to re-enter the same dish into a second tool that has never heard of that recipe.

The insight is proximity of data that already exists here. Three things the user named:
- The user's own and AI-modified recipes are already in this application — an external tracker cannot know them, so logging them there is double work.
- Dietary preferences are already stored in the profile — the diary can build on them instead of asking a second time.
- The path from cooking to logging should be one action: cooked it → ate it. Not a search through a foreign food database.

## User & Persona

**Primary persona:** the same person who already uses the application — a home cook managing their own recipes — but in a new mode of use. At a certain point (a diet, a weight goal) they shift from occasional use to daily use: they don't only look for what to cook, they track what they actually ate against a target.

No new user group is introduced by this change. The existing 3–4 users are the population.

## Access Control

**Current model (preserved):** registration and login via Supabase built-in authentication. Flat role model — every logged-in user is equal; there is no admin or privileged role. Data is private per user: each user sees only their own recipes.

**Changes planned by this module:** none. The diary inherits the existing rule unchanged — a diary entry belongs to exactly one user and is visible only to that user. No new roles, no new sign-in paths, no sharing relationship, no unauthenticated access.

> Socrates (smallest access change that still makes the feature useful): sharing a diary with a partner or a dietitian was considered and rejected for this change — it would add a new permission relationship to a system that has none today, for a population of 3–4 users who each track for themselves.

## Success Criteria

### Primary
- A user can record something they ate today and see the calorie total for that day, through both entry paths: free-text entry with an AI-produced estimate, and selection of one of their own saved recipes with a stated portion.
- The first session produces a saved, calorie-valued diary entry without the user having configured anything beforehand (no goal, no setup).

### Secondary
- The user can set an optional daily calorie goal in their profile, next to existing dietary preferences, and see the day's total against it.

### Guardrails
- Saved recipes and dietary preferences are never deleted or permanently damaged by this change. This is the only irreversible failure the user named; everything else is recoverable.
- The module remains usable when the AI estimate is unavailable, times out, or returns something implausible — a calorie value can always be entered by hand. The AI suggests; it is never the only way to produce a number.

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
- When the recipe's description carries nutrition figures, the value is derived from them, including establishing whether those figures describe one portion or the whole dish.
- When the recipe carries no nutrition figures, the user can have a value estimated from the recipe's own content instead.
- The value shown states which of these it came from, and can be replaced by a number the user types.
- No value produced on this path is written back to the recipe.
- Deleting that recipe later leaves this entry, and the totals of past days, unchanged.

**What was different before:** the recipe and the calorie count lived in two different products, so logging a home-cooked meal meant re-entering it somewhere that had never seen it.

## Scope of change — v1 decisions (Phase 3)

- **Both entry paths are in v1**: free-text manual entry with AI estimation, and entry by selecting one of the user's own recipes.
- **Calorie source for a recipe**: parse the nutrition block already present in the recipe description (`Kalorie: NNN kcal`). No migration of the `recipes` table, no model call for recipes that carry the block.
- **Fallback with no model**: a calorie value can always be typed by hand. The AI path is an assist, not a dependency.
- **Delivery estimate**: 3 weeks of after-hours work; user accepted the risk after learning that recipe calories live in prose rather than in a column.

### Blast radius (as assessed by the user)

New tables only. The `recipes` table is read, not modified — the chosen parse-the-description approach was picked partly to avoid migrating data the user declared untouchable. The profile gains one optional field (calorie goal) alongside existing preferences.

### Open at end of Phase 3

- A recipe with no nutrition block in its description has no parseable calorie value. What happens then is not yet decided — this is the gap between "parse the block" and the seed's original "estimate from the recipe".
- Portion is free text ("około 200 g", "połowa porcji"), while a parsed calorie value is per-portion. Something must reconcile the two. Deferred to Phase 5.


## Functional Requirements

Each FR carries a `Change:` tag — `new`, `modified` or `preserved`. Socratic blockquotes record the counter-position that was put to the user and what they decided.

### Diary entry

- FR-001: User can open a calorie diary panel and see the entries recorded for a chosen day. Priority: must-have. Change: new
  > Socrates: Considered adding an "I ate this" shortcut on the recipe screen, which would serve the stated "cooked it → ate it" insight in one click. Resolution: entries are created from the diary panel only. The shortcut would touch the existing recipe screen and widen the blast radius; the panel stays the single entry point.

- FR-002: User can create a diary entry for a chosen day. The content eaten is free text. The amount is given as a number of portions when the entry comes from a recipe, and as free text when the user describes the food themselves. Priority: must-have. Change: new
  > Socrates: Considered a single representation for the amount. Free text everywhere makes even the recipe path depend on the model; a structured field everywhere forces the user to convert "a big plate of fries" into grams. Resolution: both, chosen per path — the recipe path multiplies a number and needs no model, the free-text path was going to the model anyway. This resolves the seed's open question about how to represent a portion.

- FR-003: User can request an AI calorie estimate for a free-text entry. The entry is saved immediately and the calorie value is produced afterwards, without the user waiting. Priority: must-have. Change: new
  > Socrates: Considered keeping the user on a waiting screen for up to ~30 s per entry. Resolution: rejected — a diary lives on daily habit, and half a minute per meal is what kills the habit. The entry saves first and the value arrives later, which makes FR-011 responsible for showing an incomplete total honestly.

- FR-004: User can enter a calorie value by hand instead of using the AI estimate, at any time. Priority: must-have. Change: new
  > Socrates: Considered hiding the manual field, or unlocking it only after the AI path fails, so the primary path stays clean. Resolution: rejected — the field stays always available. This is the module's fallback with no model, and gating it behind a failure would leave the diary unusable whenever OpenRouter is down.

- FR-005: User can edit any part of a saved entry — content, amount, calorie value and day. Recalculating the calorie value after such an edit is the user's explicit action, never automatic. Priority: must-have. Change: new
  > Socrates: Considered automatic recalculation on every edit, for internal consistency. Resolution: rejected — it would silently discard a value the user corrected by hand, which is exactly the fallback FR-004 exists to protect. The user is offered a recalculation; the stored value stands until they take it.

- FR-006: User can delete a saved entry, after confirming. Priority: must-have. Change: new
  > Socrates: Considered deleting without confirmation, since a diary entry is small and easy to recreate — unlike a recipe. Resolution: confirmation kept; the cost is one dialog and it covers mis-taps on a phone.

### Entry from an existing recipe

- FR-007: User can search their own recipes by name and select one as the content of a diary entry. Priority: must-have. Change: new
  > Socrates: Considered also surfacing recently-eaten recipes without typing, since daily logging is largely repetition, and considered searching ingredients as well. Resolution: search by name only for v1. Both extensions were judged unnecessary for a single person's own recipe collection.

- FR-008: User can state how many portions of the selected recipe they ate. The field defaults to one portion. Priority: must-have. Change: new
  > Socrates: Considered treating an empty field as "the whole portion" (the original Phase 3 formulation), and considered making the value mandatory. Resolution: a default of 1 instead — it removes the empty state entirely, so nothing has to be inferred and the common case needs no input.

- FR-009: User sees a calorie value derived from the nutrition block already present in the selected recipe's description. Deriving it includes establishing whether that block describes one portion or the whole dish. Priority: must-have. Change: new
  > Socrates: Asked whether the block is always per portion, which would make the calculation a plain multiplication. Resolution: it is not — recipes pasted from the internet and edited by hand may state values for the whole dish. Reading the block is therefore an interpretation problem, not a parsing problem, and this weakens the Phase 3 argument that the parse path avoids the model. Recorded as a risk.

- FR-010: User can request an AI estimate derived from the recipe's own content when that recipe carries no nutrition block. The resulting value is not written back to the recipe. Priority: must-have. Change: new
  > Socrates: Considered persisting the computed value onto the recipe so it is calculated once. Resolution: rejected — it would mean writing to the data the user declared untouchable, and would require a migration. At 3–4 users the repeated model calls cost nothing worth optimising.

### Daily total and goal

- FR-011: User can see the calorie total for a chosen day, together with an indication of any entries whose value is still being calculated. Priority: must-have. Change: new
  > Socrates: Considered withholding the total until every entry is calculated, and considered showing the partial sum unannotated. Resolution: show the total and say what is still pending — withholding removes the module's main number, and an unannotated partial sum understates the day and invites a decision based on a wrong figure.

- FR-012: User can set an optional daily calorie goal in their profile, as a number they enter themselves, alongside existing dietary preferences. Priority: must-have. Change: modified
  > Socrates: Considered computing the goal from body data (weight, height, age, activity) or offering a calculator alongside the field. Resolution: a plain number only — it is the smallest possible change to the profile, which holds preferences that must survive this work intact, and it leaves control with a user who may have been given a figure by a dietitian.

- FR-013: User can see the day's total against their goal as a progress indicator whenever a goal is set. Priority: must-have. Change: new
  > Socrates: Considered plain numbers with a remaining-calories figure, as the neutral option that never reads as a judgement. Resolution: a progress bar — more readable on a phone. Exceeding the goal must be designed so it does not read as an error state.

### Preserved

- FR-014: User can create, generate with AI, edit, delete and browse recipes exactly as before. Priority: must-have. Change: preserved
- FR-015: User's saved recipes and dietary preferences survive this change intact. Priority: must-have. Change: preserved
- FR-016: User can register and log in exactly as before. Priority: must-have. Change: preserved

  > Socrates (asked once for FR-014 through FR-016 jointly, rather than one challenge each, because the three state a single guarantee): asked where this change actually touches what must survive. Resolution: the profile is the only place the module writes to existing user data, because FR-012 adds the goal field there. Recipes are read and never written. The risk to preserved behaviour is therefore concentrated in one field on one existing record.

### Scope drift noted in Phase 4

Three Phase 4 answers widened the change beyond what the 3-week estimate in Phase 3 covered: editing entries (not only deleting), entries for any day (not only today), and an AI estimation path for recipes with no nutrition block. A fourth arrived in the Socratic round: FR-009 turned out to require deciding whether a nutrition block is per-portion or per-dish, which is harder than the parsing assumed in Phase 3. Recorded here for the cross-check; the user was not asked to re-estimate.

## Business Logic

**Existing rule (unchanged by this work):** the product composes and adapts recipes to the dietary restrictions the user has declared.

**Rule added by this module, in one sentence:** for anything the user records as eaten, the module establishes a calorie value from the best source available to it — the nutrition figures already written into the user's own recipe, an estimate derived from that recipe's content, an estimate derived from the user's own free-text description, or a number the user supplies directly — and scales that value to the portion they say they ate.

The inputs the rule consumes are: what was eaten (either a recipe the user already owns, or a free-text description), how much of it was eaten (a number of portions when a recipe was named, free text otherwise), and whatever calorie information already exists for that food. The rule's output is a single calorie value attached to one diary entry, together with the origin of that value. Entries for a day are summed into a daily total, which is placed against the user's goal when one is set.

The user encounters the rule twice. First at the moment of logging: they say what they ate, the entry is stored immediately, and a calorie figure appears against it — instantly when the value could be taken from their own recipe, shortly afterwards when it had to be estimated, or as soon as they type it when they choose to supply it themselves. Second at the level of the day: the total tells them where they stand, and the origin of each value tells them how much to trust that total.

The cascade is ordered by confidence, not by convenience, and every step of it can be overridden by the user entering a number by hand. That override is the reason the rule holds even with no estimation available at all.

## Non-Functional Requirements

- A saved diary entry appears in the day's list in under one second, and its appearance never waits on a calorie value being established.
- A calorie value that has not been established within one minute of the entry being saved is presented to the user as not calculated, with the number available to be supplied by hand instead.
- The diary is fully usable with no calorie estimation available: an entry can be created, valued, saved, corrected and counted into the day's total without it.
- Every displayed calorie value carries its origin — taken from the user's own recipe, estimated from a recipe, estimated from a description, or entered by the user.
- A displayed daily total that is missing the value of one or more entries says so; it is never presented as if it were complete.
- Before any description of food or any recipe content leaves the product in order to have calories estimated, the user knows that it will.
- The module holds on the browsers and devices the product already supports; this change introduces no narrower support floor.

## Constraints & Preserved Behavior

- **Recipes are read, never written.** The module reads recipe descriptions to obtain calorie figures and does not modify, annotate or migrate the `recipes` table. The nutrition block stays where it is, as free text inside the description.
- **One write to pre-existing user data.** The profile gains a single optional field for the daily calorie goal. Existing dietary preferences on that record are not touched. This is the only point at which the module writes to data that existed before it.
- **Diary entries are self-contained.** An entry stores its own copy of what was eaten and the calorie value at the time of saving. Deleting a recipe later leaves past days exactly as they were, and recipe deletion continues to behave as it does today.
- **Authentication and roles are unchanged.** No new roles, no new sign-in paths, no change to how a session is established.
- **Backward compatibility.** Every existing screen and action — recipe creation, AI generation, AI editing, manual editing, deletion, browsing, registration, login, profile preferences — behaves as before. The module is additive.

## Risks carried out of Phase 5

- Establishing whether a recipe's nutrition block describes one portion or the whole dish is an interpretation problem, not a parsing one (see FR-009). The Phase 3 assumption that the recipe path avoids estimation entirely does not fully hold.
- The "user knows what leaves the product" commitment is an informational one. It says nothing about what the model provider retains, which was considered and deliberately not committed to without checking the provider's terms.

## Product framing

- **Product type:** web application. No change — the module is a new area inside the existing web app and introduces no new product surface.
- **User base:** no change. The same 3–4 registered users; the module opens the product to no new audience and changes no scale assumption.
- **Delivery:** 3 weeks, after-hours only.
- **Hard deadline:** tied to the submission deadline of the user's course. The user's intent is to finish one week ahead of that date and keep the remaining week as an emergency buffer. The date itself was not supplied, so `hard_deadline` is recorded as null and the gap is routed to Open Questions.

## Non-Goals

**Functional**

- **No food-product database.** No catalogue of foods with calories per 100 g, no import from an external nutrition database. Calorie values come only from the cascade named in the business rule. This is the load-bearing non-goal: most calorie trackers are built around exactly such a database, and this one deliberately is not.
- **No macronutrients.** Protein, fat and carbohydrates sit in the same nutrition block and would be nearly free to read, yet v1 does not count, total or set goals against them. Calories only.
- **No diary sharing.** No view for a partner, a dietitian or anyone else. Considered in Phase 2 and rejected; the diary stays strictly private to its owner.
- **No recognition from photos or barcodes.** No photographing a plate, no scanning packaging. Input is text, or a selection from the user's own recipes.
- **No statistics beyond a single day.** No weekly charts, averages, trends or streaks. Earlier days can be viewed, but nothing is summarised across them. The unit of the module is the day.
- **No reminders to log meals.** No push notifications, no emails, no nudges. The habit belongs to the user, not to the product.

**Non-functional**

- **No writing calories onto recipes.** No calorie column on the `recipes` table, no migration, no persisting a computed value against a recipe. Follows directly from FR-010 and protects the data the user declared untouchable.
- **No offline guarantee.** The module works without calorie estimation, but not without a connection to the application itself.

## Quality cross-check

All six brownfield gate elements are present. Run on 2026-09-16; status: `accepted`.

| Element | Result |
| --- | --- |
| Access Control | present — unchanged model, diary private per user, flat roles, sharing considered and rejected |
| Business Logic | present — stated as one declarative sentence (cascade of calorie sources, scaled to the portion eaten) |
| Project artifacts | present — shape-notes.md with a valid checkpoint block |
| Timeline-cost acknowledged | present — delivery_weeks: 3, after-hours |
| Non-Goals | present — 8 entries, each with a rationale |
| Preserved behaviour | present — Constraints & Preserved Behavior names recipes-read-only, the single profile write, and self-contained entries |

No element is missing. The items below are unresolved content, not gate failures, and are carried into Open Questions.

## Open Questions

1. **What is the hard deadline date?** The user targets finishing one week before their course submission deadline, keeping the remaining week as an emergency buffer, but did not supply the date. `hard_deadline` is recorded as null. Owner: user. Blocks: no.
2. **Does a recipe's nutrition block describe one portion or the whole dish, and how is that established?** The user confirmed it varies — recipes pasted from the internet and edited by hand may state whole-dish values. Reading the block is therefore interpretation, not parsing, which weakens the Phase 3 argument that the recipe path avoids estimation. Owner: user. Blocks: yes for FR-009 correctness — multiplying a whole-dish value by a portion count produces a figure several times too high.
3. **Does the 3-week estimate still hold after the scope grew?** Four decisions widened the change after the estimate was accepted: editing entries (not only deleting), entries for any day (not only today), an estimation path for recipes with no nutrition block (FR-010), and the interpretation problem in item 2. The user was not asked to re-estimate and chose to finish shaping. Owner: user. Blocks: no.
4. **What does the model provider retain?** The privacy commitment captured in the NFRs is informational — the user is told what leaves the product. No claim is made about retention by the provider reached through OpenRouter, deliberately, because the provider's terms were not checked during shaping. Owner: user. Blocks: no.
