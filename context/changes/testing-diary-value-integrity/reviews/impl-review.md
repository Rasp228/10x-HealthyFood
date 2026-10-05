<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Integralność wartości i sumy dnia (test-plan, faza 1)

- **Plan**: context/changes/testing-diary-value-integrity/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-05
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Bramki automatyczne (2026-10-05): `npm run test` 23 suity / 434 testy zielone (4 `test.failing` F2 padają z właściwego powodu, dziś parser zwraca `{perPortion:2000,total:2000,reason:"ok"}`), `npm run typecheck` 0 błędów, `npm run lint` czysto, `npm run format:check` czysto, `grep "TBD — see §3 Phase 1"` pusto. `CLAUDE.md` i `test-plan.md` w commicie p1 to rzeczy spoza planu, ale dołączone na życzenie użytkownika (komunikat commita), więc nie są dryfem.

## Findings

### F1 — 502 bez ciała JSON nadal ponawiane automatycznie

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/hooks/ai/useAI.ts:82-85, 102, 117
- **Detail**: Gdy 502 ma ciało, które nie jest JSON (np. HTML strony bramy Vercel), fallback w `.catch` ustawia `code: "NETWORK_ERROR"`. `throw errorData` (:102) leci wewnątrz `try`, a zewnętrzny `catch` (:117) ponawia każdy błąd z `code === "NETWORK_ERROR"`. W efekcie wykluczenie `response.status !== 502` nie działa i żądanie idzie do 3 razy, przy czym każde może kosztować kolejne wywołanie modelu do 55 s. Własne 502 trasy są w JSON, więc główna ścieżka działa zgodnie z planem. `use-ai.test.tsx` pokrywa tylko 502 z ciałem JSON.
- **Fix**: Odróżnić w `catch` błąd HTTP od błędu sieci, np. ponawiać tam tylko wtedy, gdy nie przyszła żadna odpowiedź (flaga albo `status` dołączony do rzucanego obiektu), i dodać test 502, którego `json()` odrzuca.
  - Strength: Domyka jedyną drogę obejścia polityki z planu (pkt 3.4: „nie ponawia 502”), a zmiana jest lokalna w jednym hooku.
  - Tradeoff: Zmienia strukturę obsługi błędów w `requestWithRetry`. Trzeba sprawdzić, czy błąd sieci z `fetch` (TypeError) dalej jest ponawiany.
  - Confidence: HIGH — ścieżka potwierdzona odczytem kodu przez dwóch recenzentów.
  - Blind spot: Nie zweryfikowano, jaki kształt ciała zwraca Vercel przy przekroczeniu `maxDuration`.
- **Decision**: FIXED — flaga `responseReceived` w `requestWithRetry`: ponowienie w `catch` tylko, gdy odpowiedź HTTP nie przyszła; test „502 z ciałem nie-JSON” w `tests/unit/use-ai.test.tsx` (czerwony bez poprawki, zielony z nią).

### F2 — `save-recipe.ts` nadal zwraca `details` z komunikatem błędu bazy

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/ai/save-recipe.ts:132, 167, 186-192
- **Detail**: To trzecia trasa `/api/ai/*`. W odpowiedziach 500 wciąż oddaje `details: error.message` / `updateError.message`, czyli ten sam wyciek szczegółów PostgREST/RLS, który faza 3 usunęła z `generate-recipe` i `modify-recipe`. Plan jej nie obejmował, więc to nie jest dryf. Jest to jednak niespójność w tej samej rodzinie tras i nie figuruje w `known-drift.md`. Trasa konstruuje też `AIService` (tylko do logu), więc po zmianie klienta brak klucza daje w niej `OpenRouterError`, który kończy się 500.
- **Fix A ⭐ Recommended**: Dopisać wpis w `docs/reference/known-drift.md` („Trasy AI”) i zostawić naprawę na osobną zmianę
  - Strength: Szanuje granice planu („What We're NOT Doing”) i dług przestaje być niewidoczny.
  - Tradeoff: Wyciek zostaje w kodzie do czasu osobnej zmiany.
  - Confidence: HIGH — known-drift już służy do odnotowywania takich luk.
  - Blind spot: None significant.
- **Fix B**: Zastąpić `details` stałym ciałem 500 `{error:"Błąd wewnętrzny serwera", code:"SERVER_ERROR"}` jak w dwóch pozostałych trasach
  - Strength: Domyka wyciek w całej rodzinie `/api/ai/*`, a ta sama zmiana była już raz przetestowana.
  - Tradeoff: Wykracza poza zakres fazy. Potrzebny test trasy, którego dziś nie ma.
  - Confidence: MED — trzeba sprawdzić, czy `useAI.saveRecipe` albo UI nie czyta `details`.
  - Blind spot: Konsumenci `details` w kliencie nie zostali sprawdzeni dla tej trasy.
- **Decision**: FIXED via Fix B — trzy odpowiedzi 500 w `save-recipe.ts` bez `details` (komunikat tylko w `console.error`); `useAI` czyta `details` wyłącznie dla `INVALID_INPUT`, 400/404 bez zmian. Nowy `tests/unit/ai-save-recipe-route.test.ts` (3 przypadki, czerwone bez poprawki).

### F3 — Limit przeglądarki 60 s nie jest wyższy od budżetu serwera

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/hooks/ai/useAI.ts:34
- **Detail**: `AI_TIMEOUT = 60000` to tyle samo co `maxDuration: 60`. Przed 55 s wywołania modelu trasa zużywa jeszcze czas na `getUser` w middleware i w trasie, na preferencje oraz (przy modyfikacji) na odczyt przepisu. Gdy dostawca nie odpowie, przeglądarka może się poddać pierwsza i pokazać „AI potrzebuje więcej czasu” zamiast „Usługa AI jest chwilowo niedostępna”. Ścieżka dziennika używa 65 s (`ESTIMATION_ABORT_MS`). Oba komunikaty pozwalają ponowić, więc źle wychodzi tylko treść komunikatu.
- **Fix**: Podnieść `AI_TIMEOUT` do 65 000, tak jak w ścieżce wyceny.
- **Decision**: FIXED — `AI_TIMEOUT = 65_000` z komentarzem odsyłającym do `ESTIMATION_ABORT_MS`.

### F4 — Odmowa modelu albo `{}` nadal przechodzi jako przepis z 200

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/ai.service.ts:353-397
- **Detail**: `AIResponseParseError` powstaje tylko dla treści pustej, złożonej z samych białych znaków albo nie będącej napisem. Każdy niepusty tekst, np. odmowa modelu, trafia do `fallbackTextParsing` i wraca jako przepis, który da się zapisać. Plan świadomie przypiął to jako obecne zachowanie (`ai-service.test.ts:182`, „What We're NOT Doing”), ale luka nie jest opisana w `known-drift.md`, a ryzyko #2 („fałszywy przepis”) jest przez to domknięte tylko częściowo.
- **Fix**: Dopisać tę lukę w `docs/reference/known-drift.md` („Trasy AI”), z odwołaniem do przypiętego testu.
- **Decision**: FIXED — nowy wpis „Niepusta odpowiedź modelu bez przepisu wraca jako przepis z 200” w `docs/reference/known-drift.md` („Trasy AI”): kierunek naprawy i test do odwrócenia.
