---
change_id: ui-enhancement
title: Audyt i poprawa UI widoku dziennika (/diary) na tokenach design-systemu
status: implemented
created: 2026-09-30
updated: 2026-10-01
archived_at: null
---

## Notes

- **Widok:** `/diary` (`src/pages/diary.astro` → `src/components/diary/DiaryPage.tsx` i reszta `src/components/diary/`). Jeden widok plus globalne tokeny — nie rebrand całego MVP.
- **Źródło tokenów / motyw:** do ustalenia w `/10x-research`. Punkt wyjścia to istniejący kontrakt: `:root` / `.dark` w `src/styles/global.css`, publikowane przez `@theme inline`, plus prymitywy shadcn w `src/components/ui/`. Rozszerzamy go, nie zakładamy drugiego systemu (bez `shadcn init`).
- **Kitchen sink:** istnieje już `src/pages/dev/diary-goal-states.astro` — kandydat na bramkę wizualną.
- **Znalezisko z fazy 3 (świadomie odłożone):** karta sumy stoi teraz nad formularzem, a warunek jej pokazania (`!error && !isLoading && entries.length > 0`) jest ten sam co wcześniej. Każde `refetch()` (dodanie, wycena, edycja, usunięcie) chowa ją na czas ładowania, więc formularz skacze o jej wysokość. Możliwa poprawka: `useDiaryEntries` zwraca dzień załadowanych wpisów, a karta zostaje przy odświeżaniu tego samego dnia. Do opisania w README zrzutów (faza 5) i do `/10x-impl-review`.
