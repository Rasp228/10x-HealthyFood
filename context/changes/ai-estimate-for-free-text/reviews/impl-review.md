<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Wycena kalorii przez AI dla opisowego wpisu

- **Plan**: context/changes/ai-estimate-for-free-text/plan.md
- **Scope**: Full plan (Fazy 1–3)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-09-24
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 7 warnings, 3 observations

> Uwaga o pokryciu: w chwili przeglądu Faza 1 miała jeden niezaznaczony punkt ręczny (1.11 —
> `maxDuration: 60` przyjęty przez platformę na deployu podglądowym). Przejrzałem ją mimo to, bo
> kontrakt serwerowy dziedziczą S-04 i S-05, a przegląd Faz 2–3 bez niego byłby pusty. Punkt 1.11
> został domknięty po triage'u, 2026-09-24 — patrz decyzja przy F6.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Automated verification (uruchomione w tej sesji)

Każdą bramkę uruchomiono dwa razy: przed triage'em i ponownie po zastosowaniu poprawek. Wyniki są
te same.

| Komenda | Wynik |
|---|---|
| `npm run typecheck` | PASS — 0 błędów, 0 ostrzeżeń, 140 plików |
| `npm run lint` | PASS — czysto |
| `npm run test` | PASS — 8 suit, 174 testy |
| `npm run build` | PASS |
| `npm run format:check` | PASS (po `npm run format`) |
| `npm run test:security` | PASS — 1 advisory na allowliście (GHSA-9wv6-86v2-598j) |
| `npm run test:e2e` | PASS — 3/3 (wymagało `E2E_PORT=3100`; port 3000 zajęty lokalnie) |

## Findings

### F1 — Łańcuch limitów czasu nie ma zapasu: klient i platforma mają tę samą minutę

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — realny kompromis; warto się zatrzymać i przemyśleć
- **Dimension**: Safety & Quality
- **Location**: astro.config.mjs:30, src/lib/services/calorie-estimation.service.ts:51
- **Detail**: `maxDuration: 60` (platforma) równa się `timeout: 60_000` klienta OpenRoutera, a trasa
  zużywa czas **przed** wywołaniem modelu: `auth.getUser()` i `UPDATE` ze znacznikiem
  (`estimate.ts:23-51`). Platforma zawsze utnie funkcję, zanim zdąży zadziałać timeout klienta.
  Komentarz w `astro.config.mjs:26-30` mówi o „szczycie łańcucha budżetów", ale 60 = 60 nie jest
  uporządkowaniem. Scenariusz: wolny model → ~60 s → Vercel ubija funkcję → przeglądarka dostaje
  stronę błędu platformy (najpewniej nie-JSON) → `response.json().catch(() => ({}))`
  (`useCalorieEstimation.ts:106`) połyka ją, log drukuje pusty kod, a użytkownik widzi „Nie
  policzono" bez żadnej diagnozy. Zaprojektowane 502 `AI_UNAVAILABLE` w tym scenariuszu nigdy nie
  powstanie.
- **Fix**: Zejść z `timeout` klienta na ~50 s, żeby budżet wewnętrzny był ściśle mniejszy od budżetu
  platformy i wolny dostawca kończył się czystym 502, a nie ubiciem funkcji.
  - Strength: Jedna liczba w jednym pliku; przywraca zachowanie, które trasa już poprawnie obsługuje
    osobnym `catch` na `OpenRouterError` (`estimate.ts:71-88`).
  - Tradeoff: Skraca budżet modelu o ~10 s, czyli dokładnie to, przed czym broni się komentarz przy
    `timeout`. Alternatywa (`maxDuration: 70`) wymaga planu Vercela ponad Hobby.
  - Confidence: HIGH — kolejność jest do odczytania wprost z kodu trasy.
  - Blind spot: Nie zmierzono, ile realnie zajmuje `getUser()` + `UPDATE` na produkcji; 50 s to
    ostrożny strzał, nie pomiar.
- **Decision**: FIXED (Fix differently) — timeout klienta 60_000 → 55_000, plus komentarz o łańcuchu budżetów w astro.config.mjs i zaktualizowany test; plan.md dostał notę aktualizacyjną przy Fazie 1 pkt 7.

### F2 — Trasa płatnego wywołania modelu bez ograniczenia częstości i bez deduplikacji po stronie serwera

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — realny kompromis; warto się zatrzymać i przemyśleć
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/diary-entries/[id]/estimate.ts:51-70
- **Detail**: `markEstimationRequested` (`diary.service.ts:82-107`) zapisuje
  `estimation_requested_at`, ale **nic po stronie serwera tej kolumny nie czyta**. Jedyną bramką
  przed wywołaniem modelu jest `entry.calories !== null` (`estimate.ts:62`). Scenariusz: zalogowany
  użytkownik (albo dwie otwarte karty, albo pętla w `curl`) wysyła
  `POST /api/diary-entries/42/estimate` wielokrotnie — wpis ma `calories = null`, więc **każde**
  żądanie przechodzi bramkę i **każde** dociera do OpenRoutera. Współbieżne wywołania wszystkie
  stemplują znacznik, wszystkie wołają model, a wygrywa tylko pierwszy `applyEstimate`; reszta jest
  opłacona i wyrzucona. Kolejka FIFO w `useCalorieEstimation` dyscyplinuje uczciwą przeglądarkę, nie
  endpoint.
- **Fix A ⭐ Recommended**: Dołożyć w `markEstimationRequested` warunek świeżości znacznika
  (`.or("estimation_requested_at.is.null,estimation_requested_at.lt.<now-60s>")`) i zwracać wiersz
  bez zmian, gdy zapis warunkowy nie trafi, bo wycena jest już w locie.
  - Strength: Zamyka lukę tam, gdzie kolumna już istnieje i jest opisana jako własność serwera;
    nadaje jej wreszcie czytelnika, którego dziś nie ma.
  - Tradeoff: Trzeci warunkowy zapis w serwisie i nowy przypadek do przetestowania; użytkownik traci
    możliwość szybkiego „Policz ponownie" przed upływem minuty.
  - Confidence: HIGH — wzorzec warunkowego zapisu jest w tym serwisie już dwukrotnie użyty.
  - Blind spot: Nie sprawdzono, czy PostgREST przyjmie ten `.or()` w łańcuchu z istniejącym `.is()`.
- **Fix B**: Zostawić jak jest i zapisać jako świadomy dług — istniejące trasy `/api/ai/*` też nie
  mają limitera, a plan deklaruje „żadnego naprawiania istniejącego długu".
  - Strength: Zachowuje granice zakresu zmiany; przy 3–4 użytkownikach ryzyko kosztowe jest niskie,
    a model jest darmowy (`:free`).
  - Tradeoff: Luka zostaje w kontrakcie, który dziedziczą S-04 i S-05 — czyli zapłaci się ją trzy
    razy, dokładnie tak jak plan mówi o reszcie tego kontraktu.
  - Confidence: MEDIUM — zależy od tego, czy projekt kiedykolwiek wyjdzie poza darmowy model.
  - Blind spot: Nie sprawdzono, czy Vercel albo Supabase mają tu jakikolwiek limit brzegowy.
- **Decision**: ACCEPTED (Fix B) — świadomy dług, odnotowany w docs/reference/known-drift.md, sekcja „Trasy AI”. Do przemyślenia razem z S-04.

### F3 — Nadchodzące oszacowanie kasuje liczbę, którą użytkownik właśnie wpisuje w kolejkowanym wpisie

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — realny kompromis; warto się zatrzymać i przemyśleć
- **Dimension**: Safety & Quality
- **Location**: src/components/diary/DiaryEntryCalories.tsx:70-74
- **Detail**: Blok „adjusting state when props change" kluczuje na `entry.calories`. Przy wpisie
  **w kolejce** pole jest celowo aktywne (`isFieldDisabled = isInFlight || isSaving`, `:77`).
  Scenariusz: użytkownik wpisuje `350` w pole kolejkowanego wpisu, nie klika „Zapisz", wpis dochodzi
  do czoła kolejki, model zwraca `620`, `refetch` ląduje → `seededFrom !== entry.calories` →
  `setDraft(formatCalories(620))` i wpisane `350` znika bez słowa. Do bazy nic złego nie trafia
  (`applyEstimate` z `.is("calories", null)` chroni wartość **zapisaną**), ale to cicho przeczy
  powodowi, dla którego pole w kolejce w ogóle zostawiono aktywne — plan uzasadnia to tym, że
  „użytkownik nigdy nie musi czekać na kolejkę, żeby wpisać liczbę samemu".
- **Fix A ⭐ Recommended**: Śledzić „brudny" draft (flaga ustawiana w `onChange`, czyszczona po
  udanym zapisie) i nie przesiewać pola, dopóki użytkownik ma w nim niezapisaną własną liczbę.
  - Strength: Domyka obietnicę, którą składa aktywne pole w kolejce; zmiana zamknięta w jednym
    komponencie.
  - Tradeoff: Czwarty kawałek stanu w komponencie, który dziś ma trzy; trzeba zdecydować, co się
    dzieje, gdy użytkownik porzuci brudny draft.
  - Confidence: HIGH — wzorzec jest lokalny i nie rusza kontraktu serwerowego.
  - Blind spot: Nie przemyślano interakcji z `isSaving` przy równoczesnym zapisie i odświeżeniu.
- **Fix B**: Uznać za akceptowalne — wartość z modelu jest lepsza niż niezapisany draft, a pole
  zostaje aktywne, więc użytkownik może natychmiast wpisać swoją liczbę ponownie.
  - Strength: Zero kodu; zachowuje regułę „wiersz jest źródłem prawdy dla pola".
  - Tradeoff: Cicha utrata wpisywanego tekstu to klasa błędu, którą użytkownicy zgłaszają jako
    „aplikacja mi skasowała".
  - Confidence: MEDIUM — zależy, jak często ktokolwiek kolejkuje więcej niż jedną wycenę naraz.
  - Blind spot: Brak danych o realnym użyciu kolejki.
- **Decision**: SKIPPED

### F4 — Trasa wyceny oddaje wiersz sprzed wywołania modelu zamiast odczytać go ponownie

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja; poprawka jest oczywista i wąska
- **Dimension**: Plan Adherence
- **Location**: src/pages/api/diary-entries/[id]/estimate.ts:91-92
- **Detail**: Plan (Faza 1, pkt 4) mówi: „`applyEstimate` przy liczbie **albo odczyt wiersza** przy
  `null`". Kod przy `estimate === null` zwraca `entry` — wiersz z kroku stemplowania, sprzed nawet
  60 s. Jeśli w trakcie wywołania modelu użytkownik zapisał wartość ręczną przez `PATCH`, odpowiedź
  raportuje `calories: null`, choć baza ma już liczbę. Przeglądarka jest na to odporna (`onSettled`
  robi pełny re-GET), ale ciało tej odpowiedzi to kontrakt, który dziedziczą S-04 i S-05 — `curl`
  albo przyszły konsument bez odświeżania odczyta stan wiersza, który już nie istnieje. Pokrewna,
  mniejsza rozbieżność: reguła „przed wysłaniem wpis wypada z kolejki, jeśli zdążył dostać wartość"
  nie jest w haku, tylko realizowana pośrednio przez `cancel(entryId)` po udanym `PATCH`
  (`DiaryPage.tsx:126`) — przypadek „wartość z wcześniejszej wyceny" zostaje bez pokrycia, kosztem
  jednego zmarnowanego round-tripu, który serwer i tak ucina na `:62`.
- **Fix**: Wywołać istniejące prywatne `findEntry` przed zwróceniem odpowiedzi w gałęzi
  `estimate === null` i oddać świeży wiersz.
  - Strength: Metoda już istnieje (`diary.service.ts:188-204`) i jest w tej trasie używana pośrednio
    dwa razy; koszt to jedno zapytanie na ścieżce, która właśnie czekała minutę na model.
  - Tradeoff: Wymaga wystawienia `findEntry` albo dodania cienkiej metody publicznej.
  - Confidence: HIGH — rozbieżność jest wprost widoczna między tekstem planu a `:92`.
  - Blind spot: Brak.
- **Decision**: FIXED — findEntry wystawione jako publiczne DiaryService.getEntry i użyte w gałęzi estimate === null (z 404, gdy wiersz zniknął).

### F5 — Blok `finally` wykonuje się po odmontowaniu wyspy i wysyła zbędne żądanie

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja; poprawka jest oczywista i wąska
- **Dimension**: Safety & Quality
- **Location**: src/hooks/diary/useCalorieEstimation.ts:119-129
- **Detail**: Sprzątanie przy odmontowaniu (`:56-63`) ustawia `disposedRef.current = true` i wywołuje
  `abort()`. `fetch` odrzuca się z `AbortError`, sterowanie dochodzi do `finally`, a ten wywołuje
  `setInFlightId(null)`, `setSettledIds(...)` oraz — najważniejsze — `onSettledRef.current()`, czyli
  `refetch` z `useDiaryEntries`. To `setRefresh` i świeży `GET /api/diary-entries` dla drzewa, które
  już nie istnieje. Sprawdzenie `disposedRef` strzeże tylko warunku pętli `while` (`:78`), czyli
  o jedną instrukcję za późno. Scenariusz: użytkownik klika „Policz kalorie" i przechodzi dalej przez
  `<ClientRouter />`.
- **Fix**: Dodać `if (disposedRef.current) return;` w `finally` przed trzema wywołaniami `set*` i
  `onSettledRef.current()`, zostawiając `clearTimeout` i zerowanie refów powyżej strażnika.
  - Strength: Trzy słowa; zamyka jedyny wyciek w haku, który poza tym jest bardzo starannie
    zabezpieczony (`drainingRef`, obsługa StrictMode, brak przeterminowanych domknięć).
  - Tradeoff: Brak — po odmontowaniu nikt tego stanu nie czyta.
  - Confidence: HIGH — ścieżka jest do prześledzenia wprost w kodzie.
  - Blind spot: Brak.
- **Decision**: FIXED — strażnik disposedRef w finally, przed set* i onSettled; jako warunek, nie return (no-unsafe-finally).

### F6 — Kryterium 1.11 nigdy nie zweryfikowane, a zmiana jest oznaczona jako wdrożona

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja; poprawka jest oczywista i wąska
- **Dimension**: Success Criteria
- **Location**: context/changes/ai-estimate-for-free-text/plan.md — Progress, punkt 1.11
- **Detail**: Wszystkie pozostałe kryteria — sześć automatycznych bramek i komplet punktów ręcznych —
  są zaznaczone, a automatyczne potwierdziłem w tej sesji. Niezaznaczony został wyłącznie 1.11:
  „Limit `maxDuration: 60` jest przyjęty przez platformę na deployu podglądowym, a wywołanie trwające
  ~40 s nie zostaje ucięte". Plan sam nazywa tę liczbę „szczytem łańcucha budżetów" i zauważa, że bez
  niej decyduje domyślny limit konta. Dopóki punkt jest otwarty, cały budżet czasu tej funkcji —
  łącznie z F1 — jest założeniem, nie faktem, a `change.md` ma już `status: implemented`.
- **Fix**: Zrobić deploy podglądowy i przejść punkt 1.11, albo jawnie przepisać go na odłożony
  z powodem w `change.md`, zamiast zostawiać jako jedyny pusty checkbox.
  - Strength: To jedyna rzecz w tej zmianie, której nie da się sprawdzić lokalnie; zostawiona cicho
    zniknie przy archiwizacji.
  - Tradeoff: Wymaga dostępu do deployu podglądowego Vercela.
  - Confidence: HIGH — stan checkboxa jest jednoznaczny.
  - Blind spot: Nie wiadomo, jaki plan Vercela obowiązuje na tym koncie.
- **Decision**: RESOLVED — użytkownik przeszedł 1.11 na deployu podglądowym 2026-09-24; platforma przyjęła `maxDuration: 60`. Checkbox zaznaczony w planie (— 4d57a38), nota w change.md zaktualizowana. Łańcuch budżetów jest potwierdzony.

### F7 — Handler 500 zwraca surowy komunikat błędu wewnętrznego do przeglądarki

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja; poprawka jest oczywista i wąska
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/diary-entries/[id]/estimate.ts:107-114, src/pages/api/diary-entries/[id].ts:74-82
- **Detail**: Oba zewnętrzne `catch` oddają `details: errorMessage`. Awaria Postgresa/PostgREST
  wynosi w ten sposób do przeglądarki nazwy kolumn, nazwy ograniczeń i treść komunikatów RLS. To
  **nie jest regresja** — dokładnie ten wzorzec ma `src/pages/api/diary-entries/index.ts:45-56` oraz
  trasy `/api/ai/*` — ale ta zmiana podwaja powierzchnię.
- **Fix**: Logować po stronie serwera, a do klienta oddawać stałą treść; jeśli zmieniać, to we
  wszystkich trasach naraz, żeby wzorzec został jednolity.
- **Decision**: FIXED (tylko dwie nowe trasy) — console.error po stronie serwera, stały komunikat bez `details` do klienta. Stare trasy zostają jak są.

### F8 — Trasa wyceny prowadzi politykę zamiast delegować ją do serwisu

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🔎 MEDIUM — realny kompromis; warto się zatrzymać i przemyśleć
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/diary-entries/[id]/estimate.ts:46-104
- **Detail**: Trasa orkiestruje: stempluj → rozgałęź na aktualnej wartości → zawołaj model → zapisz →
  rozgałęź ponownie. `AGENTS.md` mówi, że trasa „parsuje, deleguje, odpowiada", a wzorcem dla trasy
  AI jest `src/pages/api/ai/generate-recipe.ts`, która oddaje cały przepływ do
  `AIService.generateRecipe`. Warto odnotować, że **plan sam tak tę kolejność zapisał** (Faza 1,
  pkt 4) — to więc obserwacja o planie tak samo jak o kodzie. Same trzy metody `DiaryService`
  trzymają wzorzec serwisu serwerowego czysto.
- **Fix**: Przenieść sekwencję do `DiaryService.estimateCalories(userId, entryId, estimator)` albo
  osobnego `DiaryEstimationService`, zostawiając trasie parse → jedno wywołanie → mapowanie statusów.
  Niepilne; naturalny moment to S-04, która i tak wejdzie w ten kontrakt.
- **Decision**: SKIPPED — odłożone do S-04; odnotowane w change.md.

### F9 — Nieparsowalny znacznik zatrzymałby zegar tykający dla całej listy dnia

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja; poprawka jest oczywista i wąska
- **Dimension**: Safety & Quality
- **Location**: src/components/diary/DiaryPage.tsx:86-91
- **Detail**: `Math.max(latest, Date.parse(...) + ESTIMATION_TIMEOUT_MS)` daje `NaN` dla wpisu,
  którego znacznik się nie parsuje, a `NaN` propaguje przez resztę `reduce`.
  `Number.isFinite(deadline)` (`:40`) jest wtedy fałszem, więc **żaden** interwał nie startuje
  i pozostałe wpisy tego dnia, których stan rozstrzyga granica minuty, stoją na „Liczę…"
  bezterminowo. Asymetria jest tu sednem: `resolveEstimationState` (`diary-estimation.ts:68-70`)
  przypadek `NaN` **obsługuje** i schodzi na `stale`, a `DiaryPage` nie. W praktyce kolumna to
  `timestamptz`, więc PostgREST nie ma jak oddać nieparsowalnej wartości — stąd obserwacja, nie
  ostrzeżenie. Drobiazg w tej samej funkcji: gdy `deadline` jest skończony, ale już minął, interwał
  i tak powstaje i mieli jeden zbędny tick.
- **Fix**: Pominąć nieskończone parsowania w `reduce` (`const at = Date.parse(...); if
  (!Number.isFinite(at)) return latest;`) i nie zakładać interwału dla przeszłego terminu.
- **Decision**: FIXED — nieparsowalny znacznik pomijany w reduce, brak interwału dla przeszłego terminu.

### F10 — `create-entry.ts` zmodyfikowany wbrew literze Intencji planu

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja; poprawka jest oczywista i wąska
- **Dimension**: Scope Discipline
- **Location**: src/lib/validations/diary/create-entry.ts:35-39, 63
- **Detail**: Intencja planu (Faza 1, pkt 1) brzmi „Osobny plik **zamiast rozszerzania**
  `create-entry.ts`", ale Kontrakt w tym samym akapicie mówi „granice i komunikaty identyczne […]
  **jedna reguła na obie ścieżki**". Wdrożenie wybrało drugie: łańcuch
  `.number().int().min(0).max(5000)` z czterema polskimi komunikatami wyjechał do eksportowanego
  `caloriesValueSchema`, a `createDiaryEntrySchema` dokleja do niego `.nullable().optional()`.
  Zachowanie ścieżki tworzenia nie zmienia się o bajt, a to, przed czym Intencja realnie broniła —
  wsadzenie nowego schematu `PATCH` do pliku tworzenia — nie nastąpiło: `setEntryCaloriesSchema`
  i `entryIdSchema` są w osobnym pliku zgodnie z planem. Koszt rezydualny to nowe sprzężenie: gdy
  S-05 poszerzy regułę kalorii pod edycję, ruszy symbol, który konsumuje też ścieżka tworzenia.
  Dla porządku: drugi nieplanowany plik, `src/lib/utils/diary-calories.ts`, to czyste wyniesienie
  `parseCalories` z `DiaryEntryForm.tsx` (strażnik przed `"1e3" → 1000 kcal`), wymagane przez Fazę 2
  pkt 3 i w pełni uzasadnione. Zmiana w `openrouter.service.ts` to wyłącznie podmiana domyślnego
  modelu opisana w planie (plan.md:63-70) — reszta długu tego pliku nietknięta.
- **Fix**: Nic nie cofać; odnotować sprzężenie `caloriesValueSchema` w planie S-05, żeby poszerzenie
  reguły pod edycję świadomie objęło oba miejsca wywołania.
- **Decision**: ACCEPTED — sprzężenie caloriesValueSchema odnotowane w change.md jako nota dla S-05.
