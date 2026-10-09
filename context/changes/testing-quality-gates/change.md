---
change_id: testing-quality-gates
title: Bramki jakości — wymagane checki PR i lokalny post-edit hook (Faza 4 test-planu)
status: impl_reviewed
created: 2026-10-07
updated: 2026-10-09
archived_at: null
---

## Notes

Open a change folder for rollout Phase 4 of context/foundation/test-plan.md: "Bramki jakości".
Risks covered: cross-cutting (utrwalenie ochrony ryzyk #1–#6 z faz 1–3). Test types planned: gates, post-edit hook.
Risk response intent:
- cross-cutting: merge na `master` jest niemożliwy przy czerwonym `unit-tests` albo `e2e-tests` (wymagane checki PR, §5 „required after §3 Phase 4”) — udowodnione czerwonym PR-em, nie samą konfiguracją; testy z faz 1–3 (w tym `test.failing` przypinające znane defekty) dalej uruchamiają się w CI.
- cross-cutting: lokalny post-edit hook uruchamia testy powiązane z edytowanym plikiem i zgłasza regresję w pętli agenta, bez zastępowania CI (§5 „recommended after §3 Phase 4”).
After creating the folder, follow the downstream continuation rule.

## Baza CI (faza 1, dla notatki §6.6 w fazie 5)

- Przebieg „Test & Build Master” 37906407186 na `93c420b` (`fix(deps)` — `npm audit fix` po nowych advisory handlebars/sharp, które czerwieniły `test:security` na pierwszym pushu): wszystkie joby `success`.
- „Testy jednostkowe”: `Test Suites: 30 passed, 30 total`, `Tests: 640 passed, 640 total` — równe lokalnemu `npx jest` na `93c420b`.
- „Testy E2E”: `13 passed (3.2m)`, 0 flaky (CI ma `retries: 2`, żaden test nie potrzebował powtórki). `session-boundaries.spec.ts` przeszedł w CI.
- Faza 1 bez `gh` — decyzja użytkownika: kroki CI i ruleset wykonywane ręcznie w UI, weryfikacja przez publiczne API (`curl`).

## Dowód czerwonym PR-em (faza 3, dla notatki §6.6 w fazie 5)

- PR #4 (`chore/gate-proof` → `master`), bypass admina zdjęty w UI na czas obu prób, potem przywrócony (ruleset 24778393, `updated_at` 2026-10-09T09:31:06Z — przed zamknięciem PR-a o 09:31:16Z).
- Wariant 1, HEAD `a8e6eae` (celowo fałszywa asercja): „Testy jednostkowe” `failure`, „Kontrola jakości kodu” i „Build produkcyjny” `success`. UI: „Merging is blocked due to failing merge requirements”.
- Wariant 2, HEAD `4b4f14b` (`number` przypisany do `string`): „Kontrola jakości kodu” `failure` na kroku „Sprawdzenie typów” (przebieg 37911513421), „Build produkcyjny”, „Testy jednostkowe”, „Testy E2E” `skipped`. UI: ten sam komunikat — `skipped` wymaganego checku nie odblokowuje merge.
- PR zamknięty bez merge (`merged_at: null`), gałąź usunięta (404), `origin/master` bez `tests/unit/gate-proof.test.ts`.
- Bez `gh` (decyzja z fazy 1): `mergeStateStatus = BLOCKED` nie odczytany — anonimowe API daje `mergeable_state: unstable`, bo nie stosuje rulesetu; dowodem odmowy jest komunikat UI. `bypass_actors` nie jest widoczne w publicznym API — powrót bypassu potwierdził użytkownik.

## Wiersze Progress zaliczone dowodem zastępczym

Tytułów wierszy w `plan.md` się nie zmienia, więc ich brzmienie jest szersze niż dowód. Przy
czytaniu archiwum obowiązuje to, co niżej (przegląd wdrożenia, ustalenie F3):

- **1.1** — niezaliczony: `gh` zainstalowany, ale nigdy niezalogowany.
- **1.6** — `gh` zainstalowany i commity wypchnięte; logowania nie było (decyzja: kroki w UI).
- **2.4**, **3.4** — `bypass_actors` z `actor_id: 5` potwierdził użytkownik w Settings → Rules;
  publiczne API tego pola nie zwraca.
- **3.1** — `mergeStateStatus = BLOCKED` nieodczytany (anonimowe API: `mergeable_state: unstable`);
  dowodem odmowy jest komunikat UI „Merging is blocked due to failing merge requirements”.
