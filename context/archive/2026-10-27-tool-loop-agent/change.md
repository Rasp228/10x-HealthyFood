---
change_id: tool-loop-agent
title: Modularny recenzent kodu na ToolLoopAgent (AI SDK 7)
status: archived
created: 2026-10-27
updated: 2026-11-02
archived_at: 2026-11-02T15:45:07Z
---

## Notes

Rozbicie `tools/code-reviewer/src/index.ts` na moduły: prompty, koszt, agent `ToolLoopAgent`
importowalny bez efektów ubocznych (`createReviewer` + `review` → `{ review, metrics }`) i cienkie
CLI. Przygotowanie pod przyszłe evale promptfoo — bez konfiguracji evali w tej zmianie.
