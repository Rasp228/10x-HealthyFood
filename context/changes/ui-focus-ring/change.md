---
change_id: ui-focus-ring
title: Widoczny pierścień fokusu w prymitywach UI (WCAG 1.4.11, jasny motyw)
status: implementing
created: 2026-10-02
updated: 2026-10-02
archived_at: null
---

## Notes

po 10x-new przenieść parallel-check.md do context/changes/<change-id>/

- Wejście: `/10x-ui`, playbook „Focus/keyboard pass” na współdzielonych prymitywach
  `src/components/ui/{button,input,textarea,badge}.tsx`.
- Widok do zrzutów i bramki wizualnej: `/diary` przez kitchen sink `src/pages/dev/diary-states.astro`.
- Źródło tokenów: `--ring` w `:root` / `.dark` w `src/styles/global.css`.
- Wariant kontraktu: istniejący design system — rozszerzamy, bez nowego `shadcn init`.
- Kontekst i ograniczenia: `docs/reference/known-drift.md`, sekcja „Prymitywy UI”; zasady pracy
  równoległej: `parallel-check.md` w tym folderze.
