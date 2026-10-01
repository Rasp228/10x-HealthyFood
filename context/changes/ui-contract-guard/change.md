---
change_id: ui-contract-guard
title: Utrwalenie kontraktu design-systemu dla widoku dziennika (/diary)
status: implemented
created: 2026-10-01
updated: 2026-10-01
archived_at: null
---

## Notes

- **Kontynuacja:** krok „Make it stick” z `/10x-ui` (zadanie 4 lekcji m2l5), którego zabrakło
  w zarchiwizowanej zmianie `context/archive/2026-09-30-ui-enhancement/`.
- **Widok:** `/diary` — te same pliki, które oczyściła `ui-enhancement`: `src/pages/diary.astro`,
  `src/components/diary/**`, `src/components/feedback/Toast.tsx`,
  `src/components/common/ConfirmDialog.tsx`, `src/components/layout/TopNav.astro`.
- **Wariant kontraktu:** istniejący design system (`:root` / `.dark` + `@theme inline`
  w `src/styles/global.css`, prymitywy shadcn w `src/components/ui/`). Nic nowego nie dochodzi.
- **Zakres:** (1) blok UI w `AGENTS.md`, (2) skan literałów przed/po zapisany w tym folderze,
  (3) sprawdzenie w istniejącym ESLint (bez nowej zależności) dla plików widoku,
  (4) sprawdzian w nowej sesji, (5) `/10x-impl-review`.
