---
change_id: daily-goal-and-progress
title: Dzienny cel kaloryczny i postęp
status: archived
created: 2026-09-30
updated: 2026-09-30
archived_at: 2026-09-30T09:50:14Z
---

## Notes

Roadmap S-06 (`context/foundation/roadmap.md`) — FR-012 (opcjonalny dzienny cel w profilu, liczba
wpisana przez użytkownika), FR-013 (suma dnia względem celu jako pasek postępu; przekroczenie nie
czyta się jak błąd) i FR-015 (preferencje przetrwają nietknięte) w kamieniu milowym
`calorie-diary-v1`. Buduje na S-01 (`DiaryDaySummary`, `summarizeDay`).

Korekta założenia z PRD i roadmapy: „rekordu profilu” nie ma — profil to strona, a preferencje to
osobne wiersze tabeli `preferences`. „Jedno opcjonalne pole na profilu” realizuje nowa tabela
`user_settings` (jeden wiersz na użytkownika); `preferences` nie jest dotykana w ogóle.
