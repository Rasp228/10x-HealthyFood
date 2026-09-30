---
change_id: ui-enhancement
title: Audyt i poprawa UI widoku dziennika (/diary) na tokenach design-systemu
status: implementing
created: 2026-09-30
updated: 2026-09-30
archived_at: null
---

## Notes

- **Widok:** `/diary` (`src/pages/diary.astro` → `src/components/diary/DiaryPage.tsx` i reszta `src/components/diary/`). Jeden widok plus globalne tokeny — nie rebrand całego MVP.
- **Źródło tokenów / motyw:** do ustalenia w `/10x-research`. Punkt wyjścia to istniejący kontrakt: `:root` / `.dark` w `src/styles/global.css`, publikowane przez `@theme inline`, plus prymitywy shadcn w `src/components/ui/`. Rozszerzamy go, nie zakładamy drugiego systemu (bez `shadcn init`).
- **Kitchen sink:** istnieje już `src/pages/dev/diary-goal-states.astro` — kandydat na bramkę wizualną.
