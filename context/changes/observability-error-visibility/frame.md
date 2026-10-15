# Frame Brief: Widoczność błędów produkcyjnych w dzienniku i wycenie kalorii AI

> Krok framingu przed /10x-plan. Dokument oddziela to, o co *naprawdę* chodzi,
> od tego, co założono na wejściu.

## Reported Observation

Audyt observability z 2026-10-14
(`context/audits/observability/2026-10-14_diary-entries-ai-calorie-estimation.md`) pokazał, że
w obszarach „wpisy dziennika” i „wycena kalorii AI” błędy produkcyjne nie zostawiają śladu albo
zostawiają ślad mylący. Udowodnione w runtime: wygasła sesja przy PATCH/DELETE kończy się toastem
sukcesu (R1); każda awaria OpenRoutera to w logu ten sam „NetworkError” (R3); odpowiedź modelu bez
liczby to 200/`null` bez logu (R3); awaria bazy to 500 „Nieznany błąd” bez logu (R6).
34 ustalenia, 6 przyczyn systemowych RC1–RC6.

## Initial Framing (preserved)

- **User's stated cause or approach**: 34 ustalenia to jeden problem — słaba widoczność błędów —
  rozkładalny na 6 systemowych przyczyn w kodzie (RC1–RC6).
- **User's proposed direction**: jedna zmiana, 8 faz w kolejności §6 raportu, od middleware
  (RC1: 401 JSON dla `/api/*`) przez OpenRouter, wycenę, PostgREST, kontekst logów, 4xx,
  przeglądarkę, po „resztę” (`change.md`).
- **Pre-dispatch narrowing**: główny niepokój — „ogólnie: logi nic nie mówią”; 34 ustalenia to
  „jedna klasa problemu”; problem rozwiązany, gdy „ja w Vercel logs” znajduję przyczynę.
  Po badaniu: produkcja nadal na Hobby; o błędach właściciel dowiaduje się „w ciągu godziny”;
  D1 (fałszywy sukces) — „nie rozdzielałem” od widoczności.

## Dimension Map

1. **Kanał przechwytywania** — `console.*` → Vercel Runtime Logs bez trackera i alertów; jeśli kanał
   nie przechowa linii do chwili zgłoszenia, żadna poprawka kodu nie spełni kryterium.
2. **Kod gubi/spłaszcza błąd (RC2–RC5)** ← initial framing — błąd powstaje, ale nie trafia do logu
   albo trafia bez tożsamości (status, kod, cause).
3. **Kontrakt odpowiedzi, nie log (RC1/D1, D3, D10)** — fałszywy sukces wynika z 302 dla API
   i klienta sprawdzającego tylko `response.ok`; to zachowanie, którego log nie zmienia.
4. **Treść i korelacja logów (RC6)** — linie są, ale bez kto/co/który krok.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| 1. Kanał: retencja blokuje kryterium | `context/foundation/infrastructure.md:16` (Hobby), `:90`, `:101` („retencja na Hobby to jedna godzina … nie do śledztwa po fakcie”), `:115` (ryzyko **H**, mitygacja: tabela `logs` w Supabase — niewykonana; `logs` pisane tylko przy sukcesie AI, `ai.service.ts:660`, `:686`). Audyt i `change.md` nie wspominają retencji. Użytkownik: dowiaduje się w ciągu godziny → okno wystarcza dla obecnej praktyki | **WEAK** jako blokada (STRONG jako ograniczenie do zapisania) |
| 2. Kod gubi błąd (RC2–RC4) | RC2: `openrouter.service.ts:78-81` → `:259-265` → `isRetryableError` `:205-210` → `NetworkError` `:227-228`; gałęzie `:233-253` martwe; brak testów openroutera. RC3: `calorie-estimation.service.ts:185-230` (7× `return null`, 0 logów), `processResponse` `:270-281` to gołe rzutowanie, `estimate.ts:153-162`, `applyEstimate` `diary.service.ts:240-262`. RC4: 9× `throw error` w `diary.service.ts`; `"Nieznany błąd"` bez logu w `diary-entries/index.ts:47`, `:115`, `users/stats.ts:59`; `new Error(error.message)` w `user-settings.service.ts:30`, `:58`, `ai.service.ts:539`. Nieużywany `AppError` w `src/lib/utils/errors.ts` | **STRONG** |
| 3. RC1/D1 to błąd kontraktu, nie widoczności | 302 dla `/api/*` to świadoma decyzja D2 (`context/archive/2026-10-05-testing-session-and-access-boundaries/plan.md:101`, wykluczenie `:74`); przypięte w `tests/unit/middleware.test.ts:104-121,181` i `tests/e2e/session-boundaries.spec.ts:104-108`. `DiaryPage.tsx:139`, `:213` sprawdzają tylko `ok`. R1 w audycie: serwer **już loguje** `AuthApiError: Refresh token is not valid`, a klient i tak pokazuje sukces. D3: 404-jako-sukces to decyzja `context/archive/2026-09-29-edit-and-delete-entry/plan.md:374-375` | **STRONG** |
| 4. Logi bez kontekstu (RC6) | audyt §4 RC6: `estimate.ts:133`, `:181`; `[id].ts:97`, `:151`; zero request id, zero `VERCEL_*` w `src/`; brak loggera (`roadmap.md:76`: ~48 gołych `console.error`) | **STRONG** (nie badane osobnym agentem; potwierdzone przez agenta kanału) |

## Narrowing Signals

- Produkcja nadal na Hobby, a o błędzie właściciel dowiaduje się w ciągu godziny → kanał Vercel
  logs wystarcza *dziś*; przestaje wystarczać przy pierwszym zgłoszeniu „wczoraj nie działało”.
  Wymiar 1 schodzi z blokady do udokumentowanego ograniczenia.
- R1 (audyt §3): linia błędu auth **jest** w logu, a użytkownik i tak dostaje toast sukcesu →
  dla D1 lepszy log nie zmienia obserwowalnego skutku. Wymiar 3 wypada z klasy „logi nic nie mówią”.
- Odwrócenie RC1 wymaga uchylenia zapisanej decyzji D2 i zmiany dwóch testów przypinających 302 —
  to zmiana kontraktu API, a nie zmiana logowania.

## Cross-System Convention

Repo ma ustalony wzorzec dla defektów zachowania: faza testów je przypina, naprawa idzie osobną
zmianą (D1/D5 w `testing-session-and-access-boundaries`, wpisy known-drift z `test.failing`).
Dla obserwowalności `infrastructure.md:115` zapisał już, że platforma to „podgląd na żywo, nie
archiwum”, a trwały ślad ma trafiać do tabeli `logs`. `roadmap.md:201` odłożył obserwowalność
do po M-1. Ujęcie „wszystko w jednej zmianie” łączy oba typy prac, które repo dotąd rozdzielało.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: błędy serwera w dzienniku i wycenie AI powstają, ale
> kod gubi je albo spłaszcza (RC2–RC4, RC6) zanim trafią do `console.*`, więc w godzinnym oknie
> Vercel logs nie ma czego czytać — a fałszywy sukces zapisu (RC1/D1) to osobny błąd kontraktu API,
> którego żaden log nie naprawia.

Wstępne ujęcie jest **trafne dla RC2–RC6**: dowody w kodzie są mocne, a kanał Vercel logs pasuje
do obecnej praktyki właściciela (zgłoszenie w ciągu godziny). Nie trzyma się dla RC1/D1 (+ D10,
D3): to decyzja D2 do uchylenia, z innym ryzykiem (zmiana kontraktu, testy przypinające, wszyscy
klienci `/api/*`) i innym kryterium sukcesu (użytkownik nie jest okłamywany, nie „ja w logach”).
Ograniczenie retencji 1 h nie blokuje planu, ale musi stać w nim jawnie jako założenie.

## Confidence

**HIGH** — wszystkie trzy hipotezy z dowodami file:line; rozstrzygający sygnał (R1 loguje błąd,
a UI kłamie) pochodzi z obserwacji runtime audytu; podział zgodny z konwencją repo.

## What Changes for /10x-plan

Plan zmiany `observability-error-visibility` obejmuje RC2–RC6 (fazy 2–8 z `change.md`), a w RC1
tylko połowę logową: logowanie `error` z `getUser()` w middleware (bez `AuthSessionMissingError`).
Zmiana 302 → 401 dla `/api/*` i obsługa po stronie klientów (D1, D10, D3) idzie osobną zmianą,
która jawnie uchyla D2 i przepina testy. W „Open Risks & Assumptions” plan zapisuje retencję
Hobby 1 h (`infrastructure.md:115`) i to, że kryterium „ja w Vercel logs” obowiązuje tylko w tym oknie.

## References

- Audyt: `context/audits/observability/2026-10-14_diary-entries-ai-calorie-estimation.md`
- Retencja: `context/foundation/infrastructure.md:16`, `:90`, `:101`, `:115`; `context/foundation/roadmap.md:76`, `:201`
- D2: `context/archive/2026-10-05-testing-session-and-access-boundaries/plan.md:74`, `:101`
- D3: `context/archive/2026-09-29-edit-and-delete-entry/plan.md:374-375`
- Kod: `src/lib/api/openrouter.service.ts:78-81,170-265,270-281`; `src/lib/services/calorie-estimation.service.ts:185-230`;
  `src/lib/services/diary.service.ts:240-262`; `src/pages/api/diary-entries/index.ts:47,115`;
  `src/components/diary/DiaryPage.tsx:139,213`; `src/lib/utils/errors.ts` (nieużywany `AppError`)
- Testy przypinające 302: `tests/unit/middleware.test.ts:104-121,181`; `tests/e2e/session-boundaries.spec.ts:104-108`
- Zadania: agenci „capture channel”, „RC1 is behaviour bug”, „code swallows errors”
