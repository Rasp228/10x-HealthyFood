# Follow-ups z przeglądu implementacji

Źródło: `reviews/impl-review.md` (2026-10-06).

## F3 — osobne konto testowe dla `tests/e2e/session-boundaries.spec.ts`

`/api/auth/logout` woła `signOut()` z zakresem `global`, więc spec unieważnia wszystkie sesje
`E2E_USERNAME`. Grupa `concurrency` w `.github/workflows/ci-cd.yml` jest per ref, a lokalne
`npm run test:e2e` celuje w ten sam projekt `integration` — równoległy przebieg może zostać wylogowany
w połowie testu (sporadyczny czerwony z przekierowaniem na `/auth/login` w innym specu).

Trwała naprawa: drugie konto tylko dla tego speca (np. `E2E_LOGOUT_USERNAME` / `E2E_LOGOUT_PASSWORD`
w `.env.test` i sekretach CI, odczyt w `tests/e2e/config/test-data.ts`). Wymaga konta w Supabase
`integration` i zmiany sekretów, więc wychodzi poza plan (D4). Do rozważenia razem z drugim kontem
pod dowód RLS z §6.3 („Nie wdrożone”) — jedno konto może posłużyć obu.
