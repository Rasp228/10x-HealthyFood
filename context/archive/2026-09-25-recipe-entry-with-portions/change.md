---
change_id: recipe-entry-with-portions
title: Wpis dziennika z własnego przepisu z liczbą porcji
status: archived
created: 2026-09-25
updated: 2026-09-25
archived_at: 2026-09-25T14:02:03Z
---

## Notes

Roadmap S-03 (`context/foundation/roadmap.md`) — domknięcie US-02 bez ścieżki FR-010, którą
przejmuje S-04, w kamieniu milowym
`calorie-diary-v1`. Buduje na `manual-diary-entry` (S-01) i `ai-estimate-for-free-text` (S-02):
panel dnia, trasa kolekcji, stan „Nie policzono", ręczne nadpisanie wartości i etykieta pochodzenia
już istnieją. Nie wymaga migracji — `portions`, `source_recipe_id` i wartość `recipe_nutrition`
czekają w bazie od F-01.

Otwarte pytanie roadmapy „które warianty nagłówka bloku odżywczego liczą się jako samodeklarujące
porcję" zostało rozstrzygnięte w tym planie (decyzja D1) i przestaje być otwarte.

Bramka ręczna 1.5 zamknęła się **środkiem 2** z Manual Verification Fazy 1: prompty
@src/lib/services/ai.service.ts wymagają teraz od modelu bloku `Wartości odżywcze (na porcję):`
z linią `Kalorie: N kcal`, więc każdy przyszły przepis z AI parsuje się z definicji, a nie
z heurystyki. Decyzja należała do właściciela zmiany i została podjęta świadomie; parser zostaje,
bo przepisy pisane ręcznie i te już zapisane nadal przez niego przechodzą.

Kontrakty, które dziedziczy S-04 (`ai-estimate-from-recipe`): moduł
`src/lib/utils/recipe-nutrition.ts` rozróżnia „brak zadeklarowanego bloku" od „wartość poza
zakresem" — to pierwsze jest wyzwalaczem oszacowania z treści przepisu. Wpis z przepisu niesie
`source_recipe_id`, więc S-04 ma z czego czytać treść bez pytania użytkownika.
