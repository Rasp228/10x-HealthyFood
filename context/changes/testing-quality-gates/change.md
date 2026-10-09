---
change_id: testing-quality-gates
title: Bramki jakości — wymagane checki PR i lokalny post-edit hook (Faza 4 test-planu)
status: implementing
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
