# Integralność wartości i sumy dnia (test-plan, faza 1) — Plan Brief

> Full plan: `context/changes/testing-diary-value-integrity/plan.md`
> Research: `context/changes/testing-diary-value-integrity/research.md`

## What & Why

Faza 1 test-planu ma dowieść ryzyk #1 (suma dnia pokazuje złą liczbę i wygląda na wiarygodną)
i #2 (zła odpowiedź modelu zostaje przyjęta albo kończy się 500). Testy biorą wyrocznię z PRD,
nie z kodu. Kod zmieniamy tylko w `/api/ai/*`; pozostałe rozjazdy z PRD (F2, „N oczekuje”)
zostają świadomie przypięte albo zapisane jako dług.

## Starting Point

Dziennik jest dobrze broniony w kodzie, ale testy są nierówne: suma dnia ma ubogi fixture, komponent
podsumowania nie ma testu, F2 (nagłówek „na 4 porcje” liczony jak jedna porcja) wciąż jest w kodzie,
test PATCH jest tautologiczny. `/api/ai/*` zwraca 200 z fałszywym przepisem „Błąd generowania” albo
ogólne 500 i nie ma żadnego testu.

## Desired End State

`npm run test` zawiera testy sumy dnia, adnotacji, brzegów parsowania wyceny, mapowania błędów trasy
wyceny, ścieżki ręcznej i `/api/ai/*`. F2 jest widoczny jako `test.failing` i wpis w `known-drift.md`.
Generowanie przepisu przy złej odpowiedzi albo awarii dostawcy kończy się w ≤ ~60 s czytelnym 502
z przyciskiem ponowienia, jednym żądaniem. Cookbook §6.1/§6.2 test-planu jest wypełniony.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| „N oczekuje” | Obecny tekst „Bez policzonych kalorii: N z M” wystarcza; przypinamy testem, korygujemy `change.md` | Suma niepełna już mówi, że jest niepełna; bez zmiany UI w fazie testowej | Plan |
| F2 | `test.failing` z wyrocznią FR-009 + `known-drift.md` | Faza zostaje bez zmian w parserze; test zaczerwieni się, gdy ktoś naprawi | Plan |
| Spóźniona wycena | Zostają testy interakcji | Bez stanowej atrapy i bez bazy; ryzyko odnotowane jako niedowiedzione | Plan |
| Szew mocka dostawcy | Moduł `openrouter.service`, w `AIService` obejście `apiKey: ""` | Istniejący wzorzec z wyceny kalorii, minimum zmian | Research / Plan |
| F3 i blokada pola | Poza fazą | Do bazy nie trafia nic złego | Plan |
| `/api/ai/*` | Naprawić: 502 `AI_PARSE_ERROR` / 502 `AI_UNAVAILABLE` / 500 bez `details` | Wymóg §2 #2: czytelny błąd, nie 500 i nie śmieciowy przepis | Plan |
| Ponowienia AI | Serwer 1 próba / 55 s, `useAI` nie ponawia 502, ponawia użytkownik | Mieści się pod `maxDuration: 60`, spójne z wyceną kalorii | Plan |

## Scope

**In scope:**
- Testy: suma dnia, `DiaryDaySummary`, F2 (`test.failing`), `extractCalories`, trasa wyceny, PATCH, ścieżka ręczna
- `AIService`, trasy `generate-recipe`/`modify-recipe`, `useAI`, kod `AI_UNAVAILABLE` w `types.ts` + testy
- `known-drift.md` (F2), `change.md` (intencja), `test-plan.md` §6

**Out of scope:**
- Naprawa F2, rozróżnienie „oczekuje/niepoliczony”, dowód wyścigu na stanie, F3, blokada pola
- Mock na axios i defekt ponawiania 401/429 w interceptorze
- `fallbackTextParsing`, nie-JSON body żądania (ryzyko #6), inline Zod w trasach AI, e2e

## Architecture / Approach

Fazy 1–2 to same testy po stronie dziennika (czyste funkcje → komponent → trasa i serwis).
Faza 3 to zmiana prowadzona testami: `AIService` dostaje klienta jak `createEstimationClient`
(1 próba, 55 s, brak `import.meta`), rzuca `AIResponseParseError` zamiast przepisu-atrapy i nie
połyka błędów; trasy mapują błędy jak `estimate.ts`; `useAI` przestaje ponawiać 502. Faza 4 zapisuje
wzorce w cookbooku.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Suma dnia i parser | Testy sumy i adnotacji, F2 jako `test.failing`, wpis w known-drift | Wyrocznia liczona kodem pod testem |
| 2. Wycena i ścieżka ręczna | Luki trasy wyceny, brzegi parsowania, PATCH bez tautologii | Testy interakcji przechodzące przy złym filtrze |
| 3. Generowanie przepisu | 502 z kodem zamiast 500/fałszywego przepisu, 1 próba, bez auto-ponowień | Zmiana kontraktu dla `useAI`/`AIModal` |
| 4. Cookbook §6 | §6.1, §6.2, §6.6 w test-planie | Cookbook nie odpowiada na „jak dodać test” |

**Prerequisites:** zainstalowane zależności (`npm ci`); do weryfikacji ręcznej fazy 3 — `npm run dev` z kluczem OpenRouter.
**Estimated effort:** ~2–3 sesje w 4 fazach (faza 3 największa).

## Open Risks & Assumptions

- Spóźniona wycena pozostaje dowiedziona tylko interakcyjnie — test przeszedłby przy filtrze, który nic nie filtruje.
- F2 nadal może zawyżyć sumę dnia krotnie; jedyną ochroną jest znajomość długu.
- Zakładamy, że `AIModal` poprawnie pokazuje przycisk ponowienia przy `retryable: true` — sprawdzane ręcznie.

## Success Criteria (Summary)

- Każdy scenariusz z §2 #1 i #2 ma test albo świadomy wpis „poza fazą”/`test.failing`.
- Zła odpowiedź modelu przy generowaniu przepisu daje użytkownikowi czytelny błąd, nie fałszywy przepis.
- `npm run test`, `typecheck`, `lint`, `format:check` zielone.
