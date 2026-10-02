---
change_id: ui-focus-ring
title: Widoczny pierścień fokusu w prymitywach UI (WCAG 1.4.11, jasny motyw)
status: archived
created: 2026-10-02
updated: 2026-10-02
archived_at: 2026-10-02T12:41:44Z
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
- Odejście od planu w fazie 2 (`f831ceb`): prymitywy mają `focus:outline-hidden`, nie gołe
  `outline-hidden` — w forced-colors zastępczy obrys Tailwinda rysował się na każdej kontrolce.
  Faza 3: reguła **Focus** w `AGENTS.md` ma mówić `focus:outline-hidden` (kontrakt planu mówi
  „`outline-hidden` w bazie” — sprzed poprawki). Szczegóły: `screenshots/README.md`.
