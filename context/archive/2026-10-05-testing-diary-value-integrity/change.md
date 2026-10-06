---
change_id: testing-diary-value-integrity
title: Testy integralności wartości i sumy dnia (test-plan, faza 1)
status: archived
created: 2026-10-05
updated: 2026-10-06
archived_at: 2026-10-06T08:54:10Z
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Integralność wartości i sumy dnia".
  Risks covered: #1 (suma dnia pokazuje złą liczbę i wygląda na wiarygodną), #2 (zła odpowiedź modelu zostaje przyjęta albo kończy się 500, ręczna ścieżka przestaje działać). Test types planned: unit + integration.
  Risk response intent:
  - #1: dla znanego zestawu wpisów (ręczne, z przepisu, oczekujące, niepoliczone) suma i adnotacja o wpisach bez wartości („Bez policzonych kalorii: N z M. Suma ich nie obejmuje.”) zgadzają się z regułą z PRD; nagłówek z kilkoma porcjami nie mnoży wartości; spóźniona wycena nie nadpisuje wartości zmienionej po zleceniu. Wyrocznia z PRD, nie z kodu.
  Korekta intencji #1 (decyzja planu): rozróżnienia „N oczekuje” / „niepoliczony” w sumie dnia nie dodajemy — obecna adnotacja o wpisach bez wartości spełnia FR-011 i jest przypięta testem (`tests/unit/DiaryDaySummary.test.tsx`). Nagłówek z kilkoma porcjami (F2 z przeglądu `recipe-entry-with-portions`) dziś mnoży wartość: wyrocznia FR-009 jest przypięta jako cztery `test.failing` w `tests/unit/recipe-nutrition.test.ts`, a dług opisany w `docs/reference/known-drift.md`; naprawa parsera poza tą zmianą. Spóźniona wycena zostaje przy obecnych testach interakcji (`tests/unit/diary-service.test.ts`) — zachowania nie dowodzi stanowa atrapa ani prawdziwa baza.
  - #2: odpowiedź modelu bez liczby, poza zakresem albo timeout nie zapisuje wartości; wpis zostaje „niepoliczony”, ręczna wartość dalej się zapisuje; generowanie przepisu przy złej odpowiedzi zwraca czytelny błąd, nie 500. Mock tylko na krawędzi HTTP.
  After creating the folder, follow the downstream continuation rule.
