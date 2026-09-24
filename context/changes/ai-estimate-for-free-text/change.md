---
change_id: ai-estimate-for-free-text
title: Wycena kalorii przez AI dla opisowego wpisu dziennika
status: impl_reviewed
created: 2026-09-23
updated: 2026-09-24
---

## Notes

Roadmap S-02 (`context/foundation/roadmap.md`) — gwiazda przewodnia kamienia milowego
`calorie-diary-v1` i domknięcie US-01. Buduje na `manual-diary-entry` (S-01): panel dnia, trasa
`/api/diary-entries` i podsumowanie dnia już istnieją. Mechanikę „zapisz teraz, wartość później"
oraz sposób pokazywania pochodzenia wartości dziedziczy po tej zmianie S-04
(`ai-estimate-from-recipe`), a wąską trasę `PATCH` poszerza później S-05 (`edit-and-delete-entry`).

## Po przeglądzie wdrożenia (2026-09-24)

Raport: `reviews/impl-review.md`. Trzy rzeczy zostają otwarte i przechodzą dalej:

- **Punkt 1.11 planu jest niedomknięty.** `maxDuration: 60` czeka na weryfikację na deployu
  podglądowym. Dopóki nie przejdzie, cały łańcuch budżetów czasu (60 s platformy > 55 s klienta
  < 65 s abortu przeglądarki) jest założeniem, nie faktem.
- **Dla S-05**: reguła wartości kalorycznej mieszka teraz w jednym eksportowanym symbolu —
  `caloriesValueSchema` w `src/lib/validations/diary/create-entry.ts`. Konsumują ją obie ścieżki:
  tworzenie wpisu i `setEntryCaloriesSchema`. Poszerzenie jej pod edycję dotknie więc również
  ścieżki tworzenia i musi to objąć świadomie.
- **Dla S-04**: trasa `estimate.ts` prowadzi politykę w handlerze (stempluj → rozgałęź → zawołaj
  model → zapisz), zamiast delegować ją do serwisu jak `generate-recipe.ts`. Naturalny moment na
  przeniesienie sekwencji do `DiaryService`/`DiaryEstimationService` to S-04, która i tak wejdzie
  w ten kontrakt. Tam też wraca kwestia deduplikacji wywołań modelu
  (`docs/reference/known-drift.md`, „Trasy AI").
