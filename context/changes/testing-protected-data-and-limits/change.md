---
change_id: testing-protected-data-and-limits
title: Testy faza 3 — dane chronione (preferencje, przepisy) i twarde limity
status: impl_reviewed
created: 2026-10-06
updated: 2026-10-07
archived_at: null
---

## Notes

Open a change folder for rollout Phase 3 of context/foundation/test-plan.md: "Dane chronione i twarde limity".
Risks covered: #5 (preferencje albo przepisy użytkownika usunięte lub uszkodzone przez działanie w profilu albo w dzienniku), #6 (wartość ponad twardy limit przechodzi przez klienta lub trasę i kończy się 500 z bazy, obcięciem albo zepsutym widokiem). Test types planned: unit + integration.
Risk response intent:
- #5: zapis i zmiana celu dziennego oraz operacje na dzienniku zostawiają preferencje i przepisy bez zmian; usunięcie jednej preferencji nie rusza innych — sprawdzane stanem po operacji, nie samym statusem HTTP.
- #6: wartości na granicy limitu przechodzą, a o jeden dalej dają 400 (nie 500), w walidacji trasy i względem ograniczeń bazy; reguły pilnowane tylko w przeglądarce mają odpowiednik na serwerze albo są świadomie opisane jako luka.
After creating the folder, follow the downstream continuation rule.
