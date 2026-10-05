# Integralność wartości i sumy dnia (test-plan, faza 1) — plan implementacji

## Overview

Faza 1 z `context/foundation/test-plan.md` §3 dowodzi testami ryzyk §2 #1 (suma dnia pokazuje złą
liczbę) i #2 (zła odpowiedź modelu zostaje przyjęta albo kończy się 500). Po stronie dziennika faza
przypina obecne zachowanie i domyka luki pokrycia, a znany defekt F2 zapisuje jako test oczekiwanej
porażki. Jedyna zmiana zachowania produkcyjnego dotyczy `/api/ai/*`: zła odpowiedź modelu
i awaria dostawcy kończą się czytelnym 502 zamiast fałszywego przepisu z 200 albo ogólnego 500.

## Current State Analysis

Pełny obraz w `context/changes/testing-diary-value-integrity/research.md`. Najważniejsze:

- Suma dnia: `summarizeDay` (`src/lib/utils/diary-totals.ts:19-37`) liczy jeden `missingCount`
  dla każdego wpisu z `calories === null`; widok (`src/components/diary/DiaryDaySummary.tsx:34-41`)
  mówi „Bez policzonych kalorii: N z M. Suma ich nie obejmuje.”. Testy
  (`tests/unit/diary-totals.test.ts`) mają tylko pochodzenie `manual`/`null` i zawsze
  `estimation_requested_at: null`. Komponent nie ma testu.
- Parser bloku odżywczego: F2 (CRITICAL, SKIPPED w
  `context/archive/2026-09-25-recipe-entry-with-portions/reviews/impl-review.md:81-108`) wciąż
  obecny — `isSelfDeclaringHeader` (`src/lib/utils/recipe-nutrition.ts:92-99`) przyjmuje każdy
  nagłówek ze słowem porcji, także „na 4 porcje”. Łamie FR-009 (`context/foundation/prd.md:155-157`).
- Wycena kalorii: `extractCalories` i trasa `estimate.ts` są dobrze bronione; brakuje testów 502 na
  gałęzi opisowej, 500 bez wycieku treści i błędu stemplowania. Test PATCH
  `tests/unit/diary-entry-route.test.ts:61-66,91-97` jest tautologiczny (atrapa sama wpisuje `manual`).
- Spóźniona wycena: ochrona istnieje (`src/lib/services/diary.service.ts:241-251`), testy są
  testami interakcji (`tests/unit/diary-service.test.ts:488-610`).
- Generowanie przepisu: `AIService.parseAIResponse` zwraca przepis „Błąd generowania” jako sukces
  (`src/lib/services/ai.service.ts:306-311,359-366`); `generateRecipe`/`modifyRecipe` połykają każdy
  błąd i zwracają `null` (`:159-162,291-294`), trasy dają 500 (`src/pages/api/ai/generate-recipe.ts:58-67,77-89`,
  `modify-recipe.ts:86-92,~98-106`), a zewnętrzny catch wypuszcza `details` = komunikat błędu.
  Klient `OpenRouterService` w `AIService` ma domyślne 60 s × 2 próby wobec `maxDuration: 60`
  (`astro.config.mjs:36`). `useAI` ponawia każde 5xx dwukrotnie (`src/hooks/ai/useAI.ts:88-96`).
  `/api/ai/*` nie ma żadnego testu, a `AIService` nie da się zaimportować w Jest przez
  `import.meta.env` (`ai.service.ts:27`).

## Desired End State

- `npm run test` zawiera testy, których wyrocznie pochodzą z PRD/kontraktu, dla: sumy dnia na
  mieszanym zestawie wpisów, tekstu adnotacji, F2 (jako `test.failing`), brzegów `extractCalories`,
  mapowania błędów trasy wyceny, ścieżki ręcznej po nieudanej wycenie, `AIService`, obu tras
  `/api/ai/*` i polityki ponowień `useAI`.
- `/api/ai/generate-recipe` i `/api/ai/modify-recipe`: zła/pusta odpowiedź modelu → 502
  `AI_PARSE_ERROR`; awaria/timeout/brak klucza dostawcy → 502 `AI_UNAVAILABLE`; inny błąd → 500
  ze stałym ciałem bez `details`. Jedna próba po stronie serwera (timeout 55 s). `useAI` nie ponawia
  automatycznie 502 i pokazuje błąd z możliwością ponowienia przez użytkownika.
- F2 opisany w `docs/reference/known-drift.md`; `test-plan.md` §6.1, §6.2, §6.6 wypełnione.
- Weryfikacja: `npm run test`, `npm run typecheck` (0 błędów), `npm run lint`, `npm run format:check`.

### Key Discoveries:

- Wzorzec mocka dostawcy: `jest.mock("@/lib/api/openrouter.service", () => ({ OpenRouterService: jest.fn() }))`
  (`tests/unit/calorie-estimation.service.test.ts:15-17`); `OpenRouterError` żyje w
  `@/lib/api/openrouter.types`, który nie jest mockowany — `instanceof` w trasie działa.
- Wzorzec klienta z jedną próbą i obejściem `import.meta`: `createEstimationClient`
  (`src/lib/services/calorie-estimation.service.ts:57-97`) — `apiKey: ""`, `timeout: 55_000`,
  `retries: 1`, rzut konstruktora zamieniany na `OpenRouterError`.
- Mapowanie 502/500 do naśladowania: `src/pages/api/diary-entries/[id]/estimate.ts:128-144,178-186`.
- Testy tras: `@jest-environment node`, prawdziwa klasa serwisu z `jest.spyOn` na metodach
  (`tests/unit/diary-estimate-route.test.ts:1-41`).
- `AIErrorResponse.code` (`src/types.ts:173-184`) ma już `AI_PARSE_ERROR`, nie ma `AI_UNAVAILABLE`.
- `RecipeCalorieReason = "ok" | "no_declared_block" | "out_of_range"` (`recipe-nutrition.ts:16`).
- `tests/integration/` nie istnieje; wszystkie testy tras leżą w `tests/unit/` — zostajemy przy tym.

## What We're NOT Doing

- **Rozróżnienie „oczekuje” / „niepoliczony” w sumie dnia** — decyzja planu: obecny tekst „Bez
  policzonych kalorii: N z M” uznajemy za spełnienie FR-011; przypinamy go testem i korygujemy
  intencję w `change.md`.
- **Naprawa F2** — tylko `test.failing` z wyrocznią FR-009 i wpis w `known-drift.md`.
- **Dowód zachowania wyścigu wyceny** (stanowa atrapa egzekwująca `.eq/.is` albo prawdziwa baza) —
  zostają obecne testy interakcji; ryzyko odnotowane w §6.6 test-planu jako niedowiedzione.
- **Mock na axios / testy interceptora `OpenRouterService`** — mock zostaje na module
  `openrouter.service`; defekt ponawiania 401/429 (research, Summary pkt 5) poza fazą.
- **F3 (szkic liczby znika po wycenie) i blokada pola kalorii w trakcie wyceny** — poza fazą.
- **`fallbackTextParsing` i domyślne „Wygenerowany przepis”/„Brak treści przepisu”** — bez zmian;
  przepis z odpowiedzi nie-JSON jest przypięty testem jako obecne zachowanie.
- **Nie-JSON body żądania w `/api/ai/*` (dziś 500)** — należy do ryzyka #6, faza 3 test-planu.
- **Wydzielenie inline schematów Zod z tras `/api/ai/*`** ani przeniesienie zapytania o przepis
  z `modify-recipe.ts` do serwisu (known-drift) — poza fazą.
- **e2e** — faza to unit + integration.

## Implementation Approach

Fazy 1–2 dotykają wyłącznie testów (plus dokumentacji): najpierw czyste funkcje i komponent, potem
trasa wyceny i ścieżka ręczna. Faza 3 jest jedyną zmianą produkcyjną — test prowadzi zmianę
(najpierw asercje z kontraktu 502, potem kod). Faza 4 zamienia wnioski w cookbook test-planu.
Wyrocznia każdego testu to literał z PRD, kontraktu trasy albo decyzji planu — nigdy wynik kodu
pod testem.

## Critical Implementation Details

- **`test.failing` dla F2:** każdy nagłówek wielo-porcjowy to osobny `test.failing`, bo jeden test
  z kilkoma asercjami „nie zawodzi” już przy pierwszej. Gdy ktoś naprawi F2, te testy zrobią się
  czerwone — to zamierzony sygnał, by zamienić je na zwykłe `it`; napisz to w komentarzu nad blokiem.
- **Kolejność w `AIService`:** błąd parsowania musi polecieć przed `logAIAction`, żeby nieudana
  odpowiedź nie zostawiała logu akcji udającego sukces.

## Phase 1: Suma dnia i parser — przypięcie zachowania

### Overview

Testy unit z wyrocznią z PRD dla sumy dnia i adnotacji o brakach; F2 jako oczekiwana porażka;
korekta intencji fazy w `change.md`.

### Changes Required:

#### 1. Suma dnia na mieszanym zestawie wpisów

**File**: `tests/unit/diary-totals.test.ts`

**Intent**: Dodać dzień mieszany ze wszystkimi źródłami wartości i stanami wpisu bez wartości, żeby
dowieść, że suma zależy wyłącznie od istnienia wartości, nie od pochodzenia ani od znacznika wyceny.

**Contract**: fixture rozszerzony o `calorie_origin` `recipe_nutrition`, `ai_from_recipe`,
`ai_from_description`, `manual` oraz wpisy z `calories: null` ze świeżym, starym i pustym
`estimation_requested_at`. Wyrocznia: literały (np. 500 + 320 + 410 + 0 = 1230, braki 3 z 7).

#### 2. Test komponentu podsumowania dnia

**File**: `tests/unit/DiaryDaySummary.test.tsx` (nowy)

**Intent**: RTL przypina tekst, który widzi użytkownik: liczba `N kcal` w `diary-day-total`,
adnotacja „Bez policzonych kalorii: N z M. Suma ich nie obejmuje.” w `diary-day-missing`, gdy są
braki, i „Wszystkie wpisy dnia: M.” w `diary-day-count`, gdy ich nie ma (PRD „Quality properties”:
niepełna suma mówi, że jest niepełna).

**Contract**: render `DiaryDaySummary` z `entries` i bez `dailyGoal`; asercje po `data-testid`
i pełnym tekście. Wzorzec: `tests/unit/DailyGoalCard.test.tsx`.

#### 3. F2 jako oczekiwana porażka

**File**: `tests/unit/recipe-nutrition.test.ts`

**Intent**: Zapisać wyrocznię FR-009 dla nagłówków deklarujących kilka porcji albo całość: blok nie
jest samodeklarujący, więc wartość nie powstaje (`total: null`, `reason: "no_declared_block"`).
Dziś parser je przyjmuje, więc testy są `test.failing`.

**Contract**: osobny `test.failing` na każdy nagłówek: „Wartości odżywcze na 4 porcje:”, „Wartości
odżywcze dla 4 porcji:”, „Wartości odżywcze (całość, 4 porcje):”, „Nutrition per 4 servings:”,
każdy z linią `Kalorie: 2000 kcal` i `portions = 1` (reprodukcja z impl-review F2). Komentarz nad
blokiem: odwołanie do `known-drift.md` i instrukcja zamiany na `it` po naprawie.

#### 4. Wpis F2 w known-drift

**File**: `docs/reference/known-drift.md`

**Intent**: Opisać F2 jako znany dług w sekcji „Wpisy dziennika”: co się dzieje, czemu łamie FR-009,
kierunek naprawy z researchu, i że testy `test.failing` w `recipe-nutrition.test.ts` pilnują wyroczni.

**Contract**: nowa podsekcja `###` w `## Wpisy dziennika`, po polsku, w stylu istniejących wpisów
(źródło: przegląd `recipe-entry-with-portions`, ustalenie F2; plan `testing-diary-value-integrity`).

#### 5. Korekta intencji fazy

**File**: `context/changes/testing-diary-value-integrity/change.md`

**Intent**: Intencja #1 mówi „adnotacja «N oczekuje»”; zastąpić ją decyzją planu (obecna adnotacja
o wpisach bez wartości spełnia FR-011) i dopisać, że F2 jest przypięty jako `test.failing`, a wyścig
wyceny zostaje przy testach interakcji.

**Contract**: tylko sekcja `## Notes`; frontmatter bez zmian.

### Success Criteria:

#### Automated Verification:

- Testy fazy przechodzą: `npx jest tests/unit/diary-totals.test.ts tests/unit/DiaryDaySummary.test.tsx tests/unit/recipe-nutrition.test.ts`
- Cztery testy F2 raportowane jako `failing` (oczekiwana porażka), reszta zielona
- Cała suita przechodzi: `npm run test`
- Lint i format: `npm run lint` i `npm run format:check`

#### Manual Verification:

- Wyrocznie w nowych testach to literały z PRD/decyzji, żadna nie jest liczona funkcją pod testem
- Wpis F2 w `known-drift.md` czyta się zrozumiale bez znajomości przeglądu

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Wycena kalorii i ścieżka ręczna

### Overview

Domknąć luki na trasie wyceny, brzegi parsowania odpowiedzi modelu, usunąć tautologię w teście
PATCH i dowieść, że ręczna wartość zapisuje się na wierszu po nieudanej wycenie (PRD FR-004,
Guardrails „AI nigdy nie jest jedynym źródłem liczby”).

### Changes Required:

#### 1. Mapowanie błędów trasy wyceny

**File**: `tests/unit/diary-estimate-route.test.ts`

**Intent**: Dodać trzy przypadki kontraktu trasy: `OpenRouterError` na gałęzi opisowej → 502
`{error:"Usługa AI jest chwilowo niedostępna", code:"AI_UNAVAILABLE"}` bez `applyEstimate`; błąd
spoza `OpenRouterError` z serwisu wyceny → 500 `{error:"Błąd wewnętrzny serwera"}`, a ciało nie
zawiera komunikatu błędu; błąd `markEstimationRequested` → 500 i serwis wyceny niewołany.

**Contract**: istniejące atrapy pliku (`jest.mock` serwisu wyceny, `spyOn` na `DiaryService`).

#### 2. Brzegi parsowania odpowiedzi wyceny

**File**: `tests/unit/calorie-estimation.service.test.ts`

**Intent**: Przypiąć brzegi zakresu i formatu: `5000.4` → 5000, `5000.6` → `null`,
`{"calories":1e3}` → 1000 (liczba JSON), `{"calories":500,"note":"{x}"}` → `null`, `"420"` jako
napis → `null` (pomiń przypadek, jeśli już istnieje). Wyrocznia: zakres całkowity 0–5000
z `context/archive/2026-09-23-manual-diary-entry/plan.md:217-224` i semantyka JSON.

**Contract**: helper `estimateFor` z pliku.

#### 3. Usunięcie tautologii w teście PATCH

**File**: `tests/unit/diary-entry-route.test.ts`

**Intent**: Atrapa `updateEntry` nie może sama wyliczać `calorie_origin` z polecenia. Test trasy
sprawdza tylko to, za co trasa odpowiada: przekazanie polecenia serwisowi i zwrot jego wiersza
bez zmian. Dowód pochodzenia `manual` przechodzi do testu serwisu.

**Contract**: atrapa zwraca stały wiersz; test „{calories: N}…” przemianowany i z asercją na
równość ciała odpowiedzi z wierszem atrapy.

#### 4. Ręczna wartość po nieudanej wycenie

**File**: `tests/unit/diary-service.test.ts`

**Intent**: `updateEntry` na wierszu `calories: null` z ustawionym `estimation_requested_at` (wycena
padła) i poleceniem `{calories: 450}` zapisuje `calories: 450`, `calorie_origin: "manual"`
i zwraca wiersz — ścieżka ręczna nie zależy od stanu wyceny.

**Contract**: istniejący `createSupabaseStub`; asercja na payloadzie `update` (literały).

### Success Criteria:

#### Automated Verification:

- Testy fazy przechodzą: `npx jest tests/unit/diary-estimate-route.test.ts tests/unit/calorie-estimation.service.test.ts tests/unit/diary-entry-route.test.ts tests/unit/diary-service.test.ts`
- Cała suita przechodzi: `npm run test`
- Lint i format: `npm run lint` i `npm run format:check`

#### Manual Verification:

- W `diary-entry-route.test.ts` żadna asercja nie sprawdza wartości wyliczonej przez atrapę

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Generowanie przepisu — czytelny błąd zamiast 500 i fałszywego przepisu

### Overview

Zmiana produkcyjna prowadzona testami: `AIService` przestaje produkować przepis „Błąd generowania”
i połykać błędy, trasy mapują błędy na 502/500 jak trasa wyceny, serwer robi jedną próbę, a `useAI`
nie ponawia 502 automatycznie.

### Changes Required:

#### 1. Kod błędu w kontrakcie

**File**: `src/types.ts`

**Intent**: Dodać `AI_UNAVAILABLE` do `AIErrorResponse.code`, tak jak używa go trasa wyceny.

**Contract**: unia `code` rozszerzona o `"AI_UNAVAILABLE"`; `AI_PARSE_ERROR` już jest.

#### 2. `AIService`: klient, parsowanie, propagacja błędów

**File**: `src/lib/services/ai.service.ts`

**Intent**: Klient budowany jak `createEstimationClient` — `apiKey: ""` (usuwa `import.meta`
z pliku, więc da się go importować w Jest), `timeout: 55_000`, `retries: 1`, rzut konstruktora
zamieniony na `OpenRouterError`. Pusta (także same białe znaki) treść i wyjątek parsowania kończą
się nowym błędem `AIResponseParseError` zamiast przepisu „Błąd generowania”. `generateRecipe`
i `modifyRecipe` nie połykają już błędów — zwracają wynik albo rzucają.

**Contract**: `export class AIResponseParseError extends Error` w `ai.service.ts`;
`generateRecipe(...)`/`modifyRecipe(...)` zwracają `Promise<GeneratedRecipeDto>`/`Promise<ModifiedRecipeDto>`
(bez `| null`); `OpenRouterError` i `AIResponseParseError` propagują do trasy; `fallbackTextParsing`
bez zmian. Komentarz przy `apiKey: ""` odsyła do uzasadnienia w `calorie-estimation.service.ts`.

#### 3. Mapowanie błędów w trasach

**File**: `src/pages/api/ai/generate-recipe.ts`, `src/pages/api/ai/modify-recipe.ts`

**Intent**: Zastąpić gałąź `!result` → 500 i zewnętrzny catch z `details` mapowaniem jak
w `estimate.ts`: `OpenRouterError` → 502 `{error:"Usługa AI jest chwilowo niedostępna", code:"AI_UNAVAILABLE"}`;
`AIResponseParseError` → 502 `{error:"AI zwróciło odpowiedź, której nie da się odczytać", code:"AI_PARSE_ERROR"}`;
inny błąd → `console.error` + 500 `{error:"Błąd wewnętrzny serwera", code:"SERVER_ERROR"}` bez `details`.
Konstrukcja `AIService` wewnątrz `try`, żeby brak klucza dawał 502.

**Contract**: ciała zgodne z `AIErrorResponse`; ścieżki 400/401/404 bez zmian.

#### 4. Polityka ponowień w przeglądarce

**File**: `src/hooks/ai/useAI.ts`

**Intent**: `requestWithRetry` nie ponawia odpowiedzi 502 (ponowienie należy do użytkownika,
przycisk „Spróbuj ponownie” w `AIModal`); pozostałe 5xx i błędy sieci bez zmian. `handleAIError`
daje komunikaty dla `AI_UNAVAILABLE` i `AI_PARSE_ERROR` z `retryable: true`.

**Contract**: warunek ponowienia wyklucza `response.status === 502`; nowe gałęzie w `handleAIError`.

#### 5. Testy serwisu

**File**: `tests/unit/ai-service.test.ts` (nowy)

**Intent**: Z mockiem modułu `@/lib/api/openrouter.service` (wzorzec z `calorie-estimation.service.test.ts`)
i atrapą Supabase dla preferencji i logu: poprawny JSON → przepis z treści modelu; pusta treść
i same białe znaki → `AIResponseParseError` i brak `logAIAction`; `sendMessage` rzuca
`OpenRouterError` → propaguje; tekst nie-JSON → przepis z `fallbackTextParsing` (przypięte obecne
zachowanie); konfiguracja klienta `retries: 1`, `timeout: 55_000`; brak klucza → `OpenRouterError`.

**Contract**: `@jest-environment node`; asercje na literałach.

#### 6. Testy tras

**File**: `tests/unit/ai-generate-recipe-route.test.ts`, `tests/unit/ai-modify-recipe-route.test.ts` (nowe)

**Intent**: Prawdziwa klasa `AIService` z `jest.spyOn` na `generateRecipe`/`modifyRecipe`
(wzorzec `diary-estimate-route.test.ts`): `OpenRouterError` → 502 `AI_UNAVAILABLE`;
`AIResponseParseError` → 502 `AI_PARSE_ERROR`; inny błąd → 500, ciało bez komunikatu błędu
i bez `details`; sukces → 200 z wynikiem serwisu; 401 bez sesji.

**Contract**: `@jest-environment node`; `modify-recipe` z atrapą `from("recipes")…single()`.

#### 7. Test hooka

**File**: `tests/unit/use-ai.test.tsx` (nowy)

**Intent**: Mock `fetch` na krawędzi przeglądarki: odpowiedź 502 `AI_UNAVAILABLE` → dokładnie jedno
wywołanie `fetch`, `error` ustawiony, `retryable: true`; odpowiedź 500 → ponowienia jak dotąd
(timery fałszywe dla backoffu).

**Contract**: `renderHook` z `@testing-library/react`; `global.fetch = jest.fn()`.

### Success Criteria:

#### Automated Verification:

- Testy fazy przechodzą: `npx jest tests/unit/ai-service.test.ts tests/unit/ai-generate-recipe-route.test.ts tests/unit/ai-modify-recipe-route.test.ts tests/unit/use-ai.test.tsx`
- Cała suita przechodzi: `npm run test`
- Typecheck bez błędów: `npm run typecheck`
- Lint i format: `npm run lint` i `npm run format:check`
- `tests/unit/ai-service.test.ts` importuje prawdziwy `@/lib/services/ai.service` (mockowany jest tylko moduł `openrouter.service`)

#### Manual Verification:

- Z nieprawidłowym `OPENROUTER_API_KEY` w `npm run dev` generowanie w `AIModal` kończy się w ≤ ~60 s komunikatem o niedostępności AI z przyciskiem ponowienia, a w zakładce Network jest jedno żądanie
- Z poprawnym kluczem generowanie i modyfikacja przepisu działają jak wcześniej

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Cookbook §6 i notatki fazy

### Overview

Zamienić wzorce z faz 1–3 w odpowiedź na „jak dodać test X w tym projekcie”.

### Changes Required:

#### 1. Cookbook test-planu

**File**: `context/foundation/test-plan.md`

**Intent**: Wypełnić §6.1 (unit: lokalizacja `tests/unit/`, nazewnictwo, testy referencyjne
`diary-totals.test.ts` i `DiaryDaySummary.test.tsx`, wyrocznia z PRD, `test.failing` dla znanego
długu, komenda `npx jest <plik>`) i §6.2 (trasa API: `@jest-environment node`, prawdziwa klasa
serwisu + `spyOn`, mock dostawcy na module `openrouter.service`, kontrakt 502/500, testy referencyjne
`ai-generate-recipe-route.test.ts` i `diary-estimate-route.test.ts`). W §6.6 dopisać 2–3 linie:
F2 przypięty jako `test.failing`, wyścig wyceny dowiedziony tylko interakcyjnie, „N oczekuje”
rozstrzygnięte na korzyść obecnego tekstu.

**Contract**: tylko §6; §1–§5 bez zmian (strategia zamrożona).

### Success Criteria:

#### Automated Verification:

- §6.1 i §6.2 nie zawierają już „TBD”: `grep -n "TBD — see §3 Phase 1" context/foundation/test-plan.md` nic nie zwraca

#### Manual Verification:

- Osoba spoza fazy potrafi z §6.1/§6.2 dodać nowy test trasy bez czytania tego planu

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Suma dnia na wszystkich pochodzeniach i stanach wpisu bez wartości; tekst adnotacji komponentu
- F2: cztery nagłówki wielo-porcjowe jako `test.failing`
- Brzegi `extractCalories` (zaokrąglenie przy 5000, `1e3`, zagnieżdżone klamry, napis zamiast liczby)
- `AIService`: pusta odpowiedź, błąd dostawcy, fallback tekstowy, konfiguracja klienta
- `useAI`: brak automatycznego ponowienia 502

### Integration Tests:

- Trasa wyceny: 502 na gałęzi opisowej, 500 bez wycieku, błąd stemplowania
- Trasy `/api/ai/*`: 502 `AI_UNAVAILABLE`, 502 `AI_PARSE_ERROR`, 500 bez `details`, 200, 401
- Ścieżka ręczna: `updateEntry` z wartością na wierszu po nieudanej wycenie

### Manual Testing Steps:

1. `npm run dev` z nieprawidłowym kluczem → generowanie przepisu → komunikat o niedostępności AI, jedno żądanie w Network, przycisk ponowienia działa
2. Z poprawnym kluczem → wygeneruj i zmodyfikuj przepis → wynik jak wcześniej
3. `/diary` → podsumowanie dnia bez zmian wizualnych

## Performance Considerations

Jedna próba z timeoutem 55 s w `AIService` skraca najgorszy przypadek z ~120 s po stronie serwera
(i do 3 żądań z przeglądarki) do jednego żądania mieszczącego się pod `maxDuration: 60`.

## Migration Notes

Brak zmian w bazie. Zmiana kontraktu `/api/ai/*` (500 → 502 z kodem) dotyczy wyłącznie `useAI`,
jedynego klienta tych tras.

## References

- Research: `context/changes/testing-diary-value-integrity/research.md`
- Test plan: `context/foundation/test-plan.md` §2 #1, #2, §3 Phase 1, §6
- Wzorzec klienta z jedną próbą: `src/lib/services/calorie-estimation.service.ts:57-97`
- Wzorzec mapowania błędów: `src/pages/api/diary-entries/[id]/estimate.ts:128-144,178-186`
- Wzorzec mocka dostawcy: `tests/unit/calorie-estimation.service.test.ts:15-17`
- F2: `context/archive/2026-09-25-recipe-entry-with-portions/reviews/impl-review.md:81-108`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Suma dnia i parser — przypięcie zachowania

#### Automated

- [x] 1.1 Testy fazy przechodzą: `npx jest tests/unit/diary-totals.test.ts tests/unit/DiaryDaySummary.test.tsx tests/unit/recipe-nutrition.test.ts` — 922cbc1
- [x] 1.2 Cztery testy F2 raportowane jako `failing` (oczekiwana porażka), reszta zielona — 922cbc1
- [x] 1.3 Cała suita przechodzi: `npm run test` — 922cbc1
- [x] 1.4 Lint i format: `npm run lint` i `npm run format:check` — 922cbc1

#### Manual

- [x] 1.5 Wyrocznie w nowych testach to literały z PRD/decyzji, żadna nie jest liczona funkcją pod testem — 922cbc1
- [x] 1.6 Wpis F2 w `known-drift.md` czyta się zrozumiale bez znajomości przeglądu — 922cbc1

### Phase 2: Wycena kalorii i ścieżka ręczna

#### Automated

- [x] 2.1 Testy fazy przechodzą: `npx jest tests/unit/diary-estimate-route.test.ts tests/unit/calorie-estimation.service.test.ts tests/unit/diary-entry-route.test.ts tests/unit/diary-service.test.ts` — 0818f1b
- [x] 2.2 Cała suita przechodzi: `npm run test` — 0818f1b
- [x] 2.3 Lint i format: `npm run lint` i `npm run format:check` — 0818f1b

#### Manual

- [x] 2.4 W `diary-entry-route.test.ts` żadna asercja nie sprawdza wartości wyliczonej przez atrapę — 0818f1b

### Phase 3: Generowanie przepisu — czytelny błąd zamiast 500 i fałszywego przepisu

#### Automated

- [x] 3.1 Testy fazy przechodzą: `npx jest tests/unit/ai-service.test.ts tests/unit/ai-generate-recipe-route.test.ts tests/unit/ai-modify-recipe-route.test.ts tests/unit/use-ai.test.tsx` — 3eb6a80
- [x] 3.2 Cała suita przechodzi: `npm run test` — 3eb6a80
- [x] 3.3 Typecheck bez błędów: `npm run typecheck` — 3eb6a80
- [x] 3.4 Lint i format: `npm run lint` i `npm run format:check` — 3eb6a80
- [x] 3.5 `tests/unit/ai-service.test.ts` importuje prawdziwy `@/lib/services/ai.service` (mockowany jest tylko moduł `openrouter.service`) — 3eb6a80

#### Manual

- [x] 3.6 Z nieprawidłowym `OPENROUTER_API_KEY` w `npm run dev` generowanie w `AIModal` kończy się w ≤ ~60 s komunikatem o niedostępności AI z przyciskiem ponowienia, a w zakładce Network jest jedno żądanie — 3eb6a80
- [x] 3.7 Z poprawnym kluczem generowanie i modyfikacja przepisu działają jak wcześniej — 3eb6a80

### Phase 4: Cookbook §6 i notatki fazy

#### Automated

- [x] 4.1 §6.1 i §6.2 nie zawierają już „TBD”: `grep -n "TBD — see §3 Phase 1" context/foundation/test-plan.md` nic nie zwraca

#### Manual

- [x] 4.2 Osoba spoza fazy potrafi z §6.1/§6.2 dodać nowy test trasy bez czytania tego planu
