---
change_id: observability-error-visibility
title: Widoczność błędów produkcyjnych w dzienniku i wycenie kalorii AI
status: implemented
created: 2026-10-14
updated: 2026-10-15
archived_at: null
---

## Notes

Naprawa całego audytu observability z 2026-10-14:
`context/audits/observability/2026-10-14_diary-entries-ai-calorie-estimation.md`
(34 ustalenia: 4 critical, 7 high, 14 medium, 9 low; 6 systemowych przyczyn RC1–RC6).

Kolejność faz wg §6 raportu (najwięcej odzyskanej widoczności na jednostkę pracy):

1. RC1 — middleware: 401 JSON dla `/api/*` zamiast 302, log błędu `getUser()` (bez
   `AuthSessionMissingError`), klient dziennika przestaje pokazywać fałszywy sukces (D1, D6, D10).
2. RC2 — OpenRouter: jedno mapowanie błędu, bez ponawiania 4xx, `status`/`model`/`cause` (E1, E11, E13).
3. RC3 — wycena: powód zamiast gołego `null`, walidacja koperty, warn przy stale/odcięciu (E2, E3, E5, E9, E10).
4. RC4 — helper błędów PostgREST z `cause` i `code` w serwisach i `catch`-ach tras (D2, D5, P3, P4).
5. RC6 — strukturalny kontekst logów + id żądania w ciele 500 (D7, D11, E4, E8).
6. RC5 — 4xx tylko dla błędów klienta w auth i lookupach (P1, P2, D3, D4).
7. Ujście błędów przeglądarki i error boundary wysp (E7, P5, P6).
8. Reszta: P7–P11, E6, E12, D9.

Dowód przed/po: harness prób w `.claude/worktrees/agent-a223709405b9fc6f4/probe/suite.mjs`
(R1–R6), potem `/10x-observability-audit --verify`.
