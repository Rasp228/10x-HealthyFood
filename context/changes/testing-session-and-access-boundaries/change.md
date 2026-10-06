---
change_id: testing-session-and-access-boundaries
title: Testy granic sesji i dostępu (faza 2 test-planu, ryzyka #3 i #4)
status: implementing
created: 2026-10-05
updated: 2026-10-06
archived_at: null
---

## Notes

Open a change folder for rollout Phase 2 of context/foundation/test-plan.md: "Granice sesji i dostępu". Risks covered: #3 (po „Wyloguj” sesja trwa dalej; logowanie/rejestracja przekierowuje w złe miejsce; pomyłka w liście ścieżek publicznych otwiera chronioną stronę albo blokuje publiczną), #4 (nadużycie: użytkownik czyta, edytuje albo usuwa cudze wpisy dziennika, cel albo preferencje — IDOR / ominięcie izolacji per-użytkownik). Test types planned: integration + narrow e2e. Risk response intent: - #3: po wylogowaniu żądanie do chronionej strony i trasy API przekierowuje na login; każda chroniona ścieżka bez sesji przekierowuje, każda publiczna działa bez sesji; logowanie i rejestracja lądują tam, gdzie mówi przepływ. Challenge: „ciasteczko zniknęło w przeglądarce, więc sesja się skończyła”. Avoid: asercja na zawartości listy ścieżek zamiast na zachowaniu żądania. - #4: użytkownik B dostaje 404 albo pustą listę dla zasobu użytkownika A przy GET, PATCH, DELETE i POST z obcym identyfikatorem. Challenge: „zalogowany oznacza uprawniony do tego rekordu”. Avoid: test z jednym użytkownikiem, który nigdy nie sprawdza izolacji. After creating the folder, follow the downstream continuation rule.
