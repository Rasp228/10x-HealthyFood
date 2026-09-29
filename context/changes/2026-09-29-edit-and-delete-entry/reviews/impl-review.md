<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Edycja i usuwanie wpisu dziennika

- **Plan**: context/changes/2026-09-29-edit-and-delete-entry/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-09-29
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 6 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Bramki automatyczne (2026-09-29): `npm run test` 322/322, `npm run typecheck` 0 błędów, `npm run lint`
czysto, `npm run format:check` czysto, grep `setCaloriesManually|setEntryCaloriesSchema` w `src` pusty,
`npm run build` OK, `npm run test:e2e -- tests/e2e/diary-entry.spec.ts` 10/10 (z `E2E_PORT=3217`, bo
port 3000 zajmował inny proces i domyślne uruchomienie skończyło się timeoutem `webServer`).

Pliki spoza planu (`diary-portions.ts`, `DiaryEntryForm.tsx`, `create-entry.ts`, `Application.ts`,
`roadmap.md`) to wydzielenie wspólnych reguł, o które plan prosił („ta sama reguła co przy tworzeniu”),
i bieżące prowadzenie roadmapy — bez zastrzeżeń.

## Findings

### F1 — Nieaktualna wycena AI może nadpisać wpis właśnie edytowany

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/diary.service.ts:227-236 (`applyEstimate`), src/pages/api/diary-entries/[id]/estimate.ts:65,166, src/components/diary/DiaryEntryList.tsx:56
- **Detail**: `cancel(id)` przerywa tylko `fetch` w przeglądarce. Trasa `/estimate` nie czyta `request.signal`, więc dalej woła model i `applyEstimate`, a ten pilnuje wyłącznie `.is("calories", null)`. Po „Anuluj” `inFlightId` wraca do `null`, więc „Edytuj” jest aktywne. Scenariusz: „Policz kalorie” → „Anuluj” → „Edytuj”, zmiana treści/porcji → „Zapisz” (albo wyczyszczenie liczby, albo „Zapisz i przelicz”). Odłączone wywołanie serwera kończy się i zapisuje wartość `ai_*` policzoną dla treści **sprzed** edycji; przy „Zapisz i przelicz” wygrywa też z nowo zakolejkowaną wyceną (pierwszy `applyEstimate` wygrywa). To samo przy świeżym znaczniku po przeładowaniu strony („Liczę…” przy aktywnym „Edytuj”). Komentarze w `DiaryEntryList.tsx` i `DiaryPage.tsx` twierdzą, że wyścig jest zamknięty — jest zamknięty tylko po stronie klienta. Edycja jest nową powierzchnią, więc to nowe ryzyko tej zmiany, nie tylko F2 z known-drift.
- **Fix A ⭐ Recommended**: Zapis wyceny warunkowy na znaczniku własnego żądania — `markEstimationRequested` oddaje swój `estimation_requested_at`, trasa przekazuje go do `applyEstimate`, który dokłada `.eq("estimation_requested_at", stamp)`; `updateEntry` zeruje znacznik także przy zmianie treści/ilości/porcji na wierszu z `calories = null`.
  - Strength: Zamyka wyścig u źródła, dla każdej karty i każdego klienta; to dokładnie „czytelnik znacznika”, na który czeka F2 w `known-drift.md`, a `updateEntry` już zeruje znacznik przy `recalculate` i `calories: null`.
  - Tradeoff: Rusza kontrakt serwisu i trasy `/estimate`, której plan nie chciał przebudowywać; trzeba dopisać testy serwisu i trasy.
  - Confidence: HIGH — kolumna istnieje, warunkowe zapisy z `.maybeSingle()` to już wzorzec w `diary.service.ts`.
  - Blind spot: Precyzja porównania `timestamptz` przez PostgREST (znacznik trzeba oddać dokładnie tak, jak go zapisała baza — najlepiej z `returning`).
- **Fix B**: Blokować „Edytuj” i „Usuń” także przy świeżym znaczniku, nie tylko przy `inFlightId`.
  - Strength: Mała zmiana w UI, bez ruszania kontraktu serwera.
  - Tradeoff: Zamyka tylko uczciwą przeglądarkę; druga karta i `curl` dalej trafiają w wyścig, a użytkownik czeka na wycenę, którą sam anulował.
  - Confidence: MED — zależy od progu „świeżości” w `resolveEstimationState`.
  - Blind spot: Nie sprawdziłem, jak długo znacznik uchodzi za świeży.
- **Decision**: FIXED (Fix A) — `applyEstimate` warunkowy na `estimation_requested_at` z `markEstimationRequested`; `updateEntry` zeruje znacznik przy zmianie treści/ilości/porcji wpisu bez wartości; testy serwisu i trasy; komentarze w `DiaryEntryList`/`DiaryPage` i F2 w `known-drift.md` poprawione.

### F2 — „Zapisz” bez zmian pokazuje błąd zamiast zamknąć modal

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/diary/DiaryEntryEditModal.tsx:285-291
- **Detail**: Pusty payload z `toPayload` wpada w regułę `path: []` schematu i modal pokazuje „Nie podano żadnego pola do zmiany”. Plan tego przypadku nie określa.
- **Fix**: Gdy `toPayload` zwraca `{}` przy „Zapisz”, zamknąć modal bez żądania.
- **Decision**: FIXED — `submit` zamyka modal bez żądania, gdy „Zapisz” nie ma żadnej zmiany do wysłania.

### F3 — Po potwierdzeniu usunięcia wiersz jest klikalny do końca `refetch()`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/diary/DiaryPage.tsx:184-209
- **Detail**: Dialog zamyka się przed wysłaniem `DELETE` (co słusznie chroni przed podwójnym kliknięciem), ale przyciski wiersza zostają aktywne, więc „Edytuj” w tym oknie kończy się 404 w modalu.
- **Fix**: Trzymać id usuwanego wpisu w stanie i blokować jego przyciski do końca `refetch()`.
- **Decision**: FIXED — stan `deletingId` w `DiaryPage` (czyszczony w `finally`), `DiaryEntryList` blokuje „Edytuj”/„Usuń” także dla wpisu w trakcie `DELETE`.

### F4 — Toast o przeniesieniu pokazuje surowe RRRR-MM-DD, komentarz twierdzi inaczej

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/diary/DiaryPage.tsx:172
- **Detail**: Plan kazał użyć formatera z `DayNavigator`/`diary-day.ts`; takiego formatera nie ma, więc brak nowego jest zgodny z planem. Komentarz przy :172 („ten sam zapis RRRR-MM-DD, który pokazuje datownik”) jest jednak nieścisły — natywny `input type="date"` wyświetla datę w formacie lokalnym (np. dd.mm.rrrr).
- **Fix**: Poprawić komentarz (albo świadomie dodać formater daty w `diary-day.ts` w osobnej zmianie).
- **Decision**: FIXED — komentarz w `DiaryPage.tsx` opisuje surowy zapis daty w toaście; wspólny formater zostawiony na osobną zmianę.

### F5 — Sprzątanie wpisów E2E pomijane po nieudanym teście

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: tests/e2e/diary-entry.spec.ts:87-115
- **Detail**: `afterEach` wraca wcześnie, gdy `test.info().status !== "passed"`, więc wiersze po porażce zostają pod `2000-01-01`/`1999-12-31` do inspekcji. Plan tego nie przewidywał; nagłówek speca dokumentuje decyzję. Przy wielu porażkach wiersze się gromadzą, a kolejne przebiegi mogą liczyć cudze wiersze w sumie dnia.
- **Fix**: Dopisać decyzję do planu jako addendum (albo sprzątać zawsze i polegać na trace Playwrighta).
- **Decision**: FIXED — addendum w `plan.md` (sekcja „Addenda”) opisuje sprzątanie tylko po zdanym teście i jego koszt.

### F6 — Skrypt RLS bez kontroli pozytywnej i bez `WITH CHECK`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/checks/diary-entries-rls.sql:151-177
- **Detail**: Asercje nie przejdą po cichu przy wyłączonym RLS (row_count 1 → FAIL). Brakuje jednak dowodu, że A może zmienić/usunąć **własny** wiersz (polityka `using(false)` też dałaby PASS) i próby przepisania `user_id` własnego wiersza na B (połowa `WITH CHECK`). `.strict()` w PATCH blokuje `user_id`, więc ryzyko praktyczne jest małe.
- **Fix**: Dodać dwie asercje: UPDATE/DELETE własnego wiersza A zmienia 1 wiersz; UPDATE `user_id` na B jest odrzucany.
- **Decision**: FIXED — sekcja 3d'' w `diary-entries-rls.sql`: A zmienia i usuwa własny wiersz (1), przepisanie `user_id` na B odrzucone przez `with check` (42501). Wymaga ponownego uruchomienia w edytorze SQL Supabase — niewykonane w tym przeglądzie.

### F7 — Ręczne punkty bez śladu w diffie

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: plan.md, Progress 1.6, 2.8, 2.12
- **Detail**: 1.6 (`[PASS]` w edytorze SQL Supabase), 2.8 (przeliczenie wpisu opisowego przez kolejkę AI) i 2.12 (klawiatura i szerokość telefonu) są oznaczone `[x]`, ale nie pokrywa ich żaden test ani artefakt — E2E celowo nie woła modelu. Nie da się ich potwierdzić z repozytorium.
- **Fix**: Potwierdzić, że zostały faktycznie przeklikane; w razie wątpliwości odznaczyć i przejść ręcznie przed archiwizacją.
- **Decision**: FIXED — 1.6 odznaczone w Progress (skrypt RLS zmieniony w F6, trzeba go uruchomić ponownie); 2.8 i 2.12 zostają jako potwierdzone przez użytkownika.
