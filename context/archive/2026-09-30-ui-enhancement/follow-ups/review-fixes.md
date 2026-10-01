# Follow-ups z przeglądu wdrożenia `ui-enhancement`

Źródło: `context/changes/ui-enhancement/reviews/impl-review.md`.

- **F9 — toasty nakładają się na siebie.** `src/components/feedback/Toast.tsx` ma `fixed right-4 top-4`
  na każdym `Toast`, więc kolumna flex w `ToastContainer` nic nie układa i kilka toastów leży
  w jednym miejscu. Poprawka w osobnej zmianie: `fixed` znika z `Toast`, pozycjonowanie zostaje
  w `ToastContainer`. Wtedy kitchen sink `/dev/diary-states` może rysować toasty bez ramek
  z `transform`. Problem istniał przed tą zmianą.
- **F2 — pierścień fokusu w jasnym motywie poniżej 3:1.** Zapisane w
  `docs/reference/known-drift.md` („Prymitywy UI”). Naprawa dotyczy krycia albo grubości
  pierścienia w prymitywach shadcn, dla wszystkich widoków.
- **F5 — mieszane importy radix.** `button.tsx` i `progress.tsx` importują pojedyncze pakiety
  `@radix-ui/*`, a `label.tsx` i `badge.tsx` zbiorczy `radix-ui`. Do ujednolicenia.
