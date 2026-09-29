---
change_id: edit-and-delete-entry
title: Edycja i usuwanie wpisu dziennika
status: archived
archived_at: 2026-09-29T15:09:36Z
created: 2026-09-29
updated: 2026-09-29
---

## Notes

Roadmap S-05 (`context/foundation/roadmap.md`) — FR-005 (edycja każdej części wpisu, przeliczenie
wyłącznie na jawne żądanie) i FR-006 (usunięcie po potwierdzeniu) w kamieniu milowym
`calorie-diary-v1`. Buduje na S-01 (`diary-entry-store`, `manual-diary-entry`) i S-02
(`ai-estimate-for-free-text`): wąska trasa `PATCH` z S-02 zostaje tu poszerzona, a trasa `/estimate`
i kolejka FIFO obsługują przeliczenie bez zmiany kontraktu.

Bez migracji — polityki RLS dla UPDATE i DELETE istnieją od F-01. Zamyka oba znaleziska o wierszu-
sierocie z `docs/reference/known-drift.md`; luka F2 (brak limitu wywołań modelu) zostaje otwarta.
