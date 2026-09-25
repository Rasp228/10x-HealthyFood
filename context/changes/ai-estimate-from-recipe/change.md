---
change_id: ai-estimate-from-recipe
title: Oszacowanie kalorii z treści przepisu
status: implementing
created: 2026-09-25
updated: 2026-09-25
---

## Notes

Roadmap S-04 (`context/foundation/roadmap.md`) — domknięcie US-02 i ostatniego stopnia kaskady
FR-009 → FR-010 w kamieniu milowym `calorie-diary-v1`. Buduje na `ai-estimate-for-free-text` (S-02)
i `recipe-entry-with-portions` (S-03): trasa `/estimate`, mechanika „zapisz teraz, wartość później",
znacznik `estimation_requested_at`, kolejka FIFO i etykieta pochodzenia już istnieją.

Nie wymaga migracji — wartość `ai_from_recipe` czeka w `calorie_origin_enum` od F-01, a kolumny
`portions` i `source_recipe_id` wypełnia S-03.

Zamyka znalezisko F1 z `docs/reference/known-drift.md` („Wycena AI na wpisie z przepisu ignoruje
liczbę porcji"). Znalezisko F2 (brak limitu częstości i deduplikacji wywołań modelu) **zostaje
otwarte** świadomą decyzją D6 tego planu i zostaje rozszerzone o nową ścieżkę.
