<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Oszacowanie kalorii z treści przepisu

- **Plan**: context/changes/ai-estimate-from-recipe/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-09-28
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 1 observation

Zakres git: f8cdfc2, a7b06ea (od 06be301) + indeks (Faza 3, niezacommitowana).

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Success criteria

- `npm run lint` ✓, `npm run typecheck` ✓ (0 errors), `npm run format:check` ✓,
  `npm run test:security` ✓ (tylko allowlistowany GHSA-9wv6-86v2-598j), `npm run test` ✓ (277/277)
- `npm run test:e2e` — nieuruchomione w tym przeglądzie (wymaga `.env.test` i serwera); w Progress
  odhaczone przez implementację
- Manual 1.4–3.9 odhaczone; 3.7–3.9 potwierdzone przez użytkownika 2026-09-28

## Findings

### F1 — Wycena wiersza-sieroty ignoruje porcje, a luka nie jest zapisana w known-drift

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/diary-entries/[id]/estimate.ts:97-101
- **Detail**: Po usunięciu przepisu (`on delete set null`) wpis ma `portions = 2`, `source_recipe_id = null`, `amount_text = null`, a `content` to zwykle sam tytuł przepisu. Gałąź opisowa wysyła do modelu tylko tytuł i „nie podano", więc wynik dotyczy jednej porcji, a wiersz pokazuje „2 porcje". To dokładnie objaw z zamkniętego F1 („ignoruje liczbę porcji"), zawężony do wierszy-sierot. Decyzja D3 przyjęła to świadomie, ryzyko jest zapisane w plan-brief, ale po usunięciu wpisu F1 z `known-drift.md` nie zapisano go tam nigdzie. Wpis „Reguła porcje tylko razem z przepisem" mówi o walidacji S-05, nie o wycenie.
- **Fix A ⭐ Recommended**: Dopisać akapit do wpisu „Reguła „porcje tylko razem z przepisem"…" w known-drift.md
  - Strength: Zgodne z D3, żadnego nowego kodu; S-05 i tak musi przemyśleć ten wiersz.
  - Tradeoff: Użytkownik nadal może dostać zaniżoną wartość na sierocie.
  - Confidence: HIGH — tylko dokumentacja.
  - Blind spot: None significant.
- **Fix B**: Na gałęzi opisowej przy `portions !== null && amount_text === null` przekazać `"${portions} porcje"` jako `amountText`
  - Strength: Model dostaje ilość; wynik i wiersz przestają sobie przeczyć.
  - Tradeoff: Łamie „ścieżka opisowa bez zmian" i D3; nowy test; zmiana promptu opisowego dla części wierszy.
  - Confidence: MED — jakość odpowiedzi modelu na „2 porcje" + sam tytuł niezmierzona.
  - Blind spot: Polska odmiana („2 porcje" / „5 porcji" / „1,5 porcji").
- **Decision**: FIXED (Fix A) — akapit o wycenie sieroty w known-drift.md, sekcja „Wpisy dziennika"

### F2 — Pozostałości w teście trasy: nieaktualny komentarz `NaN` i brak przypadku `portions = 1`

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: tests/unit/diary-estimate-route.test.ts:125-126
- **Detail**: Komentarz nadal mówi „iloczyn byłby `NaN` i wywrócił się dopiero na ograniczeniu bazy" — ten sam błąd poprawiono w trasie i planie (plan-review F3). Testing Strategy wymienia porcje „1, 2, 1,5, null"; w pliku są 2, 1,5 i null, jawnego 1 brak (pokrywa go pośrednio przypadek `null → 1`).
- **Fix**: Poprawić komentarz („`null * x` to `0` — wpis dostałby 0 kcal") i dopisać przypadek `portions: 1`.
- **Decision**: FIXED — komentarz poprawiony, dodany test `portions: 1` (12/12 zielone)
