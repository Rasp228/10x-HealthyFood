# Wycena kalorii przez AI dla opisowego wpisu — plan wdrożenia

## Overview

Roadmap **S-02** domyka US-01: użytkownik opisuje, co zjadł, prosi o wyliczenie kalorii i dostaje
wartość **bez czekania na zapis**. Wpis zapisuje się i pojawia na liście dnia natychmiast, wartość
dopisuje się później, a gdy nie ustali się w ciągu minuty — wpis czyta się jako niepoliczony z
polem na liczbę wpisaną ręcznie. To gwiazda przewodnia kamienia milowego `calorie-diary-v1`:
pierwszy przepływ, który dowodzi głównej hipotezy produktu — że zalogowanie posiłku to jeden ruch,
bez szukania w obcej bazie produktów.

Mechanikę „zapisz teraz, wartość później", sposób pokazywania pochodzenia wartości i uprzedzenie o
wysyłce treści dziedziczy po tej zmianie **S-04** (`ai-estimate-from-recipe`), a wąską trasę zapisu
ręcznej wartości poszerza **S-05** (`edit-and-delete-entry`). Kontrakt serwerowy z Fazy 1 jest więc
płacony raz, a używany trzy razy.

## Current State Analysis

**Warstwa danych jest gotowa i czeka dokładnie na tę zmianę.** F-01 dostarczyło tabelę
`diary_entries` z wartością `ai_from_description` w `calorie_origin_enum` oraz kolumną
`estimation_requested_at`, której **nic w kodzie dziś nie zapisuje**. Komentarz migracji
(`supabase/migrations/20260922140906_create_diary_entries.sql:44-47`) wprost przydziela ten zapis
serwerowi: „Kolumnę zapisuje serwer przez now() w momencie zlecenia oszacowania; klient jej nie
podaje, bo jego zegar przesuwałby granicę jednej minuty o własny błąd." **Żadna migracja nie jest
w tej zmianie potrzebna.**

**Baza pilnuje tylko połowy reguły.** Constraint `diary_entries_value_has_origin` wymusza, że
`calories` i `calorie_origin` są albo oba puste, albo oba wypełnione. Druga połowa — „każda ścieżka
zerująca `calories` musi w tej samej instrukcji wyzerować `estimation_requested_at`" — jest
nieegzekwowana i należy do route'u (komentarz migracji, linie 49-53).

**Panel dziennika (S-01) pokrywa już część FR-011.** `DiaryEntryList.tsx` renderuje badge „Nie
policzono" dla `calories === null`, a `summarizeDay` (`src/lib/utils/diary-totals.ts:19`) zwraca
`missingCount` i nigdy nie traktuje braku wartości jako zera. `useDiaryEntries` po zapisie robi
pełny re-GET, bez optymistycznych aktualizacji.

**Trasa dla wpisu jest tylko jedna.** `src/pages/api/diary-entries/index.ts` ma `GET` i `POST` —
nie ma `[id].ts`, nie ma `PATCH`, `PUT` ani `DELETE`. Dopisanie wartości do **istniejącego** wiersza
nie ma dziś żadnej powierzchni API.

**Klient OpenRouter istnieje — to konsumpcja, nie budowa — ale z jedną pułapką.**
`OpenRouterService` trzyma **jeden** `responseFormat` na instancję
(`src/lib/api/openrouter.service.ts:88-103`), a `AIService` ustawia w konstruktorze schemat przepisu
(`src/lib/services/ai.service.ts:46`). Dopisanie metody wyceny do `AIService` albo zepsułoby
generowanie przepisów, albo wymagałoby przestawiania schematu przed każdym wywołaniem —
współdzielona instancja i dwa schematy nie dają się pogodzić.

**Domyślne ponowienia klienta nie mieszczą się w minucie.** `retries: 2` z backoffem
(`openrouter.service.ts:62, 166-199`) w najgorszym razie wychodzi daleko poza granicę jednej minuty;
domyślny `timeout: 60000` (tamże, 61) jest natomiast wartością, którą ta zmiana zachowuje.

**`retries` w tym kliencie liczy próby, nie powtórzenia — a `0` jest pułapką w dwie strony.**
Konstruktor robi `this.retries = config.retries || 2` (`openrouter.service.ts:62`), więc zero jest
falsy i cicho staje się dwójką. Gdyby nawet poprawić to na `??`, pętla `while (attempt < this.retries)`
(tamże, 170) nie wykonałaby ani jednego żądania i od razu rzuciła „Maksymalna liczba prób została
wyczerpana". Jedna próba bez żadnego powtórzenia to w tym API **`retries: 1`**. Warto też wiedzieć,
że interceptor mapuje błąd (`:258`) zanim zobaczy go `isRetryableError` (`:205`), więc przy
wartościach większych od 1 ponawiany jest **każdy** błąd, także 401 za nieprawidłowy klucz.

Model jest zaszyty na sztywno (`openrouter.service.ts:52`); zmiennej środowiskowej na model nie
ma, jest tylko `OPENROUTER_API_KEY` (`src/env.d.ts:18-22`).

> **Aktualizacja 2026-09-24 (po Fazie 1, decyzja użytkownika).** Wartość, którą ta analiza
> zastała — `tngtech/deepseek-r1t-chimera:free` — przestała istnieć po stronie dostawcy:
> OpenRouter odpowiadał na nią `404 No endpoints found`, więc 502 wracało zarówno z nowej wyceny
> kalorii, jak i z istniejących tras `/api/ai/*`. Domyślna wartość w `openrouter.service.ts:52`
> została podmieniona na `nvidia/nemotron-3-ultra-550b-a55b:free` (darmowy, kontekst 1 mln,
> rozumujący). Świadome wyjście poza „żadnego naprawiania istniejącego długu": martwy model
> blokował krok 1.5, a poprawka we własnej konfiguracji serwisu wyceny zostawiłaby przepisy
> zepsute i rozszczepiła wiedzę o modelu na dwa miejsca.

**Wzorzec „request z timeoutem i abortem" jest w repo dokładnie raz** — `src/hooks/ai/useAI.ts:51-119`
(AbortController + `setTimeout` + retry z `RETRY_DELAYS`), z anulowaniem na `useAI.ts:166-180`.

**Tabela `logs` nie przyjmie tej akcji.** `action_type_enum` ma wyłącznie `generate_new` i
`generate_modification` (`src/db/database.types.ts:196`).

## Desired End State

Na liście dnia wpis opisowy bez wpisanej liczby ma przycisk **„Policz kalorie"**, a formularz —
drugi przycisk **„Zapisz i policz kalorie"** wraz ze stałym zdaniem informującym, że opis posiłku
zostanie wysłany do dostawcy modelu. Po zleceniu wpis pokazuje **„Liczę…"** i przycisk **„Anuluj"**;
pole na ręczną liczbę jest nieaktywne wyłącznie przy wpisie faktycznie będącym w locie — wpis
czekający w kolejce pokazuje **„W kolejce…"** z polem aktywnym. Gdy wartość dojdzie, wpis pokazuje
liczbę z adnotacją o pochodzeniu, a suma dnia rośnie i przestaje raportować ten wpis jako brakujący;
tę liczbę da się **zastąpić własną** — adnotacja zmienia się wtedy na „wpisane ręcznie". Gdy minie
minuta od znacznika, wycena wróci bez wartości albo użytkownik anuluje, wpis wraca do stanu **„Nie
policzono"** z aktywnym polem na liczbę i przyciskiem **„Policz ponownie"**. Przeładowanie strony w
trakcie liczenia nie gubi informacji, że oszacowanie zlecono.

Weryfikacja: `npm run typecheck` na zero błędów, komplet `code-quality` na zielono, deterministyczna
suita jednostkowa i E2E **nietykająca** OpenRoutera, plus ręczne przejście scenariusza w przeglądarce.

### Key Discoveries:

- `estimation_requested_at` istnieje, jest opisana jako własność serwera i **nie jest przez nic
  zapisywana** — `supabase/migrations/20260922140906_create_diary_entries.sql:44-47`.
- Nieegzekwowana połowa reguły: zerowanie `calories` musi zerować znacznik — tamże, linie 49-53.
  Ta zmiana nigdy nie ustawia `calories` na `null`, więc reguły nie narusza.
- `OpenRouterService` ma jeden `responseFormat` na instancję — `src/lib/api/openrouter.service.ts:88-103`
  wobec `src/lib/services/ai.service.ts:46`.
- `DiaryService.createEntry` już egzekwuje, że pochodzenie ustala serwer, nie klient —
  `src/lib/services/diary.service.ts:61`.
- `summarizeDay` nie wlicza braków do sumy i zwraca `missingCount` — `src/lib/utils/diary-totals.ts:19-37`.
- Wzorzec trasy `[id]` z odczytem `params.id` i filtrem `.eq("user_id", user.id)` —
  `src/pages/api/recipes/[id].ts:30-45`.
- Wzorzec abortu i anulowania po stronie przeglądarki — `src/hooks/ai/useAI.ts:51-119, 166-180`.
- Wyjścia walidacji z trasy idą przez `zodIssues` / `zodMessage` — `src/lib/utils/validation-errors.ts`.

## What We're NOT Doing

- **Żadnej migracji ani zmiany schematu.** Kolumny i wartość enuma już są.
- **Żadnego zapisu do tabeli `logs`.** Wymagałby zmiany istniejącego `action_type_enum`, a roadmapa
  parkuje obserwowalność nowej ścieżki AI do zamknięcia M-1.
- **Żadnej estymacji z treści przepisu** (FR-010) — to S-04.
- **Żadnego wyszukiwania przepisów ani liczby porcji** (FR-007–FR-009) — to S-03.
- **Żadnej edycji treści, ilości ani dnia wpisu i żadnego usuwania** — to S-05. `PATCH` dodany tutaj
  przyjmuje **wyłącznie `calories`** i nigdy nie ustawia jej na `null`.
- **Żadnego dziennego celu ani paska postępu** (FR-012, FR-013) — to S-06.
- **Żadnego dialogu zgody i żadnego zapamiętywania jej** — uprzedzenie jest stałym zdaniem przy
  przycisku.
- **Żadnego pollingu ani odpytywania w tle.** Wartość dochodzi odpowiedzią na request, który
  przeglądarka sama wysłała.
- **Żadnej nowej zależności i żadnej nowej zmiennej środowiskowej.** Model zostaje domyślny.
- **Żadnego trybu testowego w kodzie produkcyjnym.** `TEST_MODE` nadal tylko ładuje `.env.test`.
- **Żadnego naprawiania istniejącego długu** — niespójne `code` w odpowiedziach `/api/ai/*` i
  schematy Zod deklarowane w miejscu (`docs/reference/known-drift.md`) zostają jak są.

## Implementation Approach

Wpis powstaje jak dotąd — `POST /api/diary-entries` zwraca 201 i lista się odświeża, więc wymaganie
„poniżej sekundy" jest spełnione tym samym kodem, co w S-01. Wycena to **drugi, osobny request z
przeglądarki**: `POST /api/diary-entries/[id]/estimate`. Trasa najpierw stempluje
`estimation_requested_at` (zapis warunkowy, tylko gdy `calories` jest puste), potem woła model, a na
końcu dopisuje wartość — znowu warunkowo. Wybór drugiego requestu zamiast roboty w tle wynika z
adaptera: na Vercelu funkcja żyje tylko do wysłania odpowiedzi, więc `fire-and-forget` bywa ucinany
w połowie, a awaria jest widoczna dopiero na produkcji.

Warunkowość jest tu regułą poprawności, nie optymalizacją. `applyEstimate` dopisuje wartość
klauzulą `.is("calories", null)`, więc **spóźnione oszacowanie nigdy nie nadpisze liczby wpisanej
ręcznie** — to dokładnie ten zabieg, dla którego istnieje FR-004. Przeglądarka dodatkowo blokuje
pole na czas liczenia, ale blokada ma wyjście: „Anuluj" przerywa request przez AbortController i
natychmiast odblokowuje pole, więc gwarancja „wartość ręczna w dowolnym momencie" stoi mimo
milczącego dostawcy.

Minuta z kryterium akceptacji US-01 (`prd.md:101`) liczona jest u klienta **od znacznika z bazy**, nie od momentu kliknięcia. Dzięki
temu przeładowanie strony w trakcie nie gubi stanu: wiersz z `calories = null` i ustawionym
`estimation_requested_at` sam mówi, że oszacowanie zlecono.

Wycena dostaje **własny serwis** z własną instancją `OpenRouterService`, skonfigurowaną na jedną
próbę i pełną minutę czasu. Budżet ponowień należy do przycisku „Policz ponownie", nie do klienta
HTTP — użytkownik widzi, że ponawia, zamiast czekać przez trzy niewidoczne próby. Przeglądarka
przerywa dopiero po 65 s, świadomie wychodząc odrobinę poza granicę minuty z US-01: skrócenie tego
budżetu kosztuje znacznie więcej nieudanych oszacowań, niż oszczędza czasu.

## Critical Implementation Details

**Kolejność zapisów w trasie estymacji jest wiążąca.** Znacznik `estimation_requested_at` musi
wylądować w bazie **przed** wywołaniem modelu, inaczej przeładowanie strony w trakcie liczenia
zostawia wiersz nieodróżnialny od zwykłego niepoliczonego wpisu. To dwa osobne `UPDATE` na jedno
oszacowanie i tak ma być.

**Znacznik czasu pochodzi z zegara serwera Astro, nie z `now()` w SQL.** `supabase-js` nie wstawia
wyrażeń SQL, więc trasa zapisuje `new Date().toISOString()`. Intencja komentarza w migracji jest
zachowana — decyduje zegar serwera, nie przeglądarki.

**Oba warunkowe zapisy muszą umieć „nie zrobić nic".** `.is("calories", null)` sprawia, że
`UPDATE` trafia w zero wierszy, gdy wartość ręczna zdążyła wcześniej. To nie jest błąd i nie może
kończyć się 409 ani wyjątkiem — trasa odczytuje aktualny wiersz i zwraca go takim, jaki jest.
Warunek techniczny tej reguły: `.maybeSingle()` zamiast `.single()`, inaczej supabase-js zgłasza
zero wierszy jako `PGRST116` i „nie zrobić nic" zamienia się w wyjątek (Faza 1, punkt 3).

**Pole `estimation_requested_at` nigdy nie jest w tej zmianie zerowane.** Przy porażce i timeoucie
wiersz zostaje nietknięty; stan „przepadło" jest funkcją czasu po stronie klienta. Konsekwencja:
zaraz po przeładowaniu strony wpis sprzed kilkunastu sekund pokaże „Liczę…", choć żaden request już
nie żyje. Dlatego przycisk „Policz ponownie" **i aktywne pole na liczbę** muszą być dostępne
**zawsze, gdy ta wyspa nie ma własnego requestu w locie** — nie dopiero po upływie minuty. Blokuje
wyłącznie żywy request, nigdy sam znacznik w bazie.

**Wycena, która odpadnie szybko, musi zwolnić wpis od razu.** Dostawca potrafi odmówić w kilka
sekund (nieprawidłowy klucz, brak sieci), a wtedy znacznik jest jeszcze długo świeży. Wpis nie może
z tego powodu stać na „Liczę…" przez resztę minuty z zablokowanym polem — dlatego wyspa pamięta, że
jej własny request już wrócił, i ta pamięć bije znacznik z bazy (`EstimationRequestPhase`, Faza 2
punkt 1).

## Phase 1: Kontrakt serwerowy

### Overview

Wszystko, co da się sprawdzić `curl`-em: schematy, serwis wyceny, trzy nowe metody `DiaryService`
i dwie trasy. Ten kontrakt dziedziczą S-04 i S-05, więc błąd w nim płaci się trzy razy.

**Każde żądanie `curl`-em w tej fazie musi nieść nagłówek `Origin`.** Astro odrzuca żądania
niebędące GET bez pasującego `Origin` (`security.checkOrigin`, domyślnie włączone — w
`astro.config.mjs` nie ma klucza `security`), i robi to **zanim handler ruszy**. Bez nagłówka
wszystkie kroki 1.5–1.10 zwrócą to samo `403 Cross-site … forbidden` i będzie to wyglądać na błąd
nowych tras. Wzorzec:

```bash
curl -X POST http://localhost:3000/api/diary-entries/<id>/estimate \
  -H "Origin: http://localhost:3000" \
  -H "Cookie: <ciasteczka sesji z przeglądarki>"
```

Szczegóły: `docs/reference/astro-react-runtime.md:38-43`; ten sam zabieg robi
`tests/e2e/services/cleanup.service.ts:46-50`.

### Changes Required:

#### 1. Schemat ręcznego ustawienia wartości

**File**: `src/lib/validations/diary/set-calories.ts`

**Intent**: Wąska walidacja dla `PATCH` — jedyne pole, które ta zmiana pozwala zmienić w istniejącym
wpisie, to liczba kalorii. Osobny plik zamiast rozszerzania `create-entry.ts`, bo S-05 poszerzy go o
treść, ilość i dzień, i wtedy ten plik stanie się `update-entry.ts` bez dotykania ścieżki tworzenia.

**Contract**: `setEntryCaloriesSchema` z jednym polem `calories` — liczba całkowita 0–5000,
**wymagana i niedopuszczająca `null`** (zerowanie wartości należy do S-05 i pociągnęłoby za sobą
zerowanie `estimation_requested_at`). Granice i komunikaty identyczne jak w
`createDiaryEntrySchema` (`src/lib/validations/diary/create-entry.ts:50-56`) — jedna reguła na obie
ścieżki. Dodatkowo `entryIdSchema`: dodatnia liczba całkowita parsowana z `params.id`.

#### 2. Serwis wyceny kalorii

**File**: `src/lib/services/calorie-estimation.service.ts`

**Intent**: Jedyne miejsce, które rozmawia z modelem w sprawie kalorii. Własna instancja
`OpenRouterService` rozwiązuje kolizję globalnego `responseFormat` z `AIService`, a własna
konfiguracja daje wywołaniu pełną minutę i odbiera mu niewidoczne ponowienia.

**Contract**: klasa `CalorieEstimationService` bez zależności od Supabase (zapis należy do
`DiaryService`), konstruowana bezargumentowo. Konfiguracja klienta odbiega od domyślnej i to jest
sedno tego pliku:

```ts
new OpenRouterService({
  apiKey: import.meta.env.OPENROUTER_API_KEY,
  timeout: 60_000, // pełna minuta, tyle co domyślnie; zejście niżej zbiera znacznie więcej nieudanych oszacowań
  // Dokładnie jedna próba i ani jednego powtórzenia. `retries` w tym kliencie liczy PRÓBY
  // (`while (attempt < this.retries)`, openrouter.service.ts:170), a `0` nie przechodzi przez
  // `config.retries || 2` w konstruktorze (:62) - cicho wróciłoby do dwóch prób i ~120 s.
  // Budżet ponawiania należy wyłącznie do przycisku "Policz ponownie", czyli do użytkownika.
  retries: 1,
});
```

~~Schemat odpowiedzi ustawiany raz w konstruktorze: `{ type: "object", properties: { calories: { type: "number" } }, required: ["calories"] }`.~~

> **Aktualizacja 2026-09-24 (po Fazie 1, decyzja użytkownika): schemat odpowiedzi NIE jest
> ustawiany.** `setResponseFormat` nie jest w tym serwisie wołane, a stała ze schematem nie
> istnieje. Powód jest empiryczny: model, na który przeszła domyślna konfiguracja
> (`nvidia/nemotron-3-ultra-550b-a55b:free`), nie deklaruje obsługi `response_format` — w jego
> `supported_parameters` nie ma ani tej wartości, ani `structured_outputs`. Parametr nie jest
> odrzucany, tylko ignorowany, a w pomiarach z 2026-09-24 jego obecność psuła treść: na trzy
> wywołania jedno wróciło z uszkodzonym kluczem (`{"calories{": 600}`), którego `JSON.parse` nie
> przyjmuje; bez niego trzy na trzy dały czysty obiekt. Ponieważ OpenRouter tego schematu i tak
> nigdy nie egzekwował (patrz akapit niżej), jego ustawianie nic nie kupowało, a szkodzić mogło.
> Kształtu odpowiedzi pilnują wiadomość systemowa i `extractCalories`. Kolizja globalnego
> `responseFormat` z `AIService` — powód, dla którego ten serwis ma własną instancję klienta —
> pozostaje aktualna i niezależna od tej decyzji.

**Schemat sam z siebie nie dałby liczby — wydobycie jej to osobna, jawna praca w tym pliku.**
`sendMessage()` zwraca surową kopertę OpenAI, bo `processResponse` (`openrouter.service.ts:269`) to
goły rzut typu bez walidacji, a `response_format` szedłby na wyjściu jako
`{ type: "json_object", schema }` (tamże, :136) — kształt, którego OpenRouter nie egzekwuje. Model
jest przy tym rozumujący, więc treść bywa poprzedzona
preambułą i owinięta w ogrodzenia markdown. `AIService` rozwiązuje to trzema warstwami
(`ai.service.ts:296, 368, 316`), ale wszystkie są `private` i zaszyte pod kształt przepisu — nie ma
czego zaimportować.

Dlatego serwis dostaje **własną, prywatną metodę `extractCalories(response: ChatResponse): number | null`**,
świadomie duplikującą ~25 linii zamiast refaktorować `ai.service.ts` — ten plik obsługuje trzy
działające trasy `/api/ai/*`, a plan deklaruje „żadnego naprawiania istniejącego długu". Kolejność:
sięgnąć po `response?.choices?.[0]?.message?.content` z gardą, zdjąć ogrodzenia
` ```json `, wyciąć ostatni obiekt `{…}` z treści (preambuła modelu rozumującego), `JSON.parse`
w `try`/`catch`, dopiero potem sprawdzić, czy `calories` jest liczbą w zakresie 0–5000. Każdy krok,
który się nie uda, kończy się `null` — czyli „odpowiedź bezużyteczna", nie awarią dostawcy.

Metoda publiczna:

```ts
async estimateFromDescription(content: string, amountText: string | null): Promise<number | null>
```

Zwraca liczbę całkowitą z przedziału 0–5000 albo `null`. **Te dwa wyniki to nie to samo co awaria
dostawcy i metoda ich nie zlewa:**

- `null` — dostawca odpowiedział, ale odpowiedź jest bezużyteczna: brak pola `calories`, wartość
  spoza zakresu 0–5000, ułamek nie do zaokrąglenia, treść nie do sparsowania. **To normalna
  odpowiedź, nie wyjątek** — wpis zostaje niepoliczony, a trasa oddaje 200.
- **rzut `OpenRouterError`** — dostawca jest nieosiągalny albo odmówił: sieć, timeout, 401 za
  nieprawidłowy klucz, 429, 5xx. Metoda **nie połyka** tych błędów, bo inaczej trasa nie miałaby
  z czego zbudować 502 i awaria dostawcy byłaby w logach nieodróżnialna od halucynacji modelu.
  Klasy błędów są gotowe w `src/lib/api/openrouter.types.ts` i wszystkie dziedziczą po
  `OpenRouterError`, więc trasie wystarczy jeden `instanceof`.

Osobny przypadek: **brakujący** `OPENROUTER_API_KEY` rzuca zwykłym `Error` już z konstruktora
`OpenRouterService` (`openrouter.service.ts:44-48`). Konstruktor `CalorieEstimationService`
zamienia go na `OpenRouterError`, żeby konfiguracja bez klucza kończyła się tym samym 502 co
klucz nieprawidłowy, a nie 500 z zewnętrznego catcha trasy.

Prompt po polsku, opis i ilość
podane osobno; preferencje żywieniowe użytkownika **nie są wysyłane** — do policzenia kalorii nic
nie wnoszą, a powiększałyby to, co opuszcza produkt.

#### 3. Trzy nowe metody magazynu wpisów

**File**: `src/lib/services/diary.service.ts`

**Intent**: Cała wiedza o tym, kiedy wolno dopisać wartość, mieszka w serwisie — tak jak dziś reguła
„pochodzenie ustala serwer" (`diary.service.ts:61`). Trasy pozostają cienkie.

**Contract**: trzy metody, wszystkie filtrujące po `user_id` niezależnie od RLS:

```ts
async markEstimationRequested(userId: string, entryId: number): Promise<DiaryEntryDto | null>
async applyEstimate(userId: string, entryId: number, calories: number): Promise<DiaryEntryDto | null>
async setCaloriesManually(userId: string, entryId: number, calories: number): Promise<DiaryEntryDto | null>
```

`markEstimationRequested` i `applyEstimate` zapisują warunkowo — `.is("calories", null)` — i **nie
traktują braku trafienia jako błędu**; po nieudanym `UPDATE` odczytują wiersz i zwracają jego stan
faktyczny.

**Warunkowy `UPDATE` kończy się `.maybeSingle()`, nigdy `.single()`.** To nie jest kosmetyka: przy
`.single()` zero trafionych wierszy nie daje `data: null`, tylko `{ data: null, error: { code:
"PGRST116" } }`, a `createEntry` tuż obok (`diary.service.ts:66`) robi `if (error) throw error` —
skopiowanie tego wzorca wywaliłoby dokładnie tę ścieżkę, dla której warunkowy zapis powstał.
`.maybeSingle()` oddaje `data: null, error: null`, czyli dokładnie model, który ten kontrakt
opisuje. Drugi powód jest logiczny: z `.is("calories", null)` w łańcuchu **trzy różne sytuacje
zlewają się w jeden brak trafienia** — wpis nie istnieje, należy do kogoś innego, albo ma już
wartość. Rozstrzyga je dopiero następujący po tym `SELECT`: brak wiersza → `null` z metody → 404
w trasie; wiersz jest → zwracamy go i trasa oddaje 200. `setCaloriesManually` zapisuje
bezwarunkowo, więc tam zostaje zwykłe `.single()` z gałęzią na `PGRST116` jak w
`src/pages/api/recipes/[id].ts:126-129`. `applyEstimate` ustawia `calories` razem z `calorie_origin: "ai_from_description"`, bo
constraint bazy wymaga ich razem. `setCaloriesManually` ustawia `calories` z
`calorie_origin: "manual"` bezwarunkowo (człowiek nadpisuje oszacowanie) i **nie dotyka**
`estimation_requested_at`. `null` z metody oznacza „nie ma takiego wpisu u tego użytkownika" i
zamienia się w trasie na 404.

#### 4. Trasa zlecenia wyceny

**File**: `src/pages/api/diary-entries/[id]/estimate.ts`

**Intent**: Jedyne wejście dla ścieżki AI. Parsuje, deleguje, odpowiada — zgodnie z regułą z
`AGENTS.md`, że logika biznesowa mieszka w serwisach.

**Uwaga o routingu**: ten plik mieszka w katalogu `[id]/`, obok pliku `[id].ts` z punktu 5.
Pary „plik `[param].ts` obok katalogu `[param]/`" nie ma dziś **nigdzie** pod `src/pages` — każdy
`[id]` w tym repo (`recipes/[id].ts`, `preferences/[id].ts`, `recipes/[id].astro`) jest liściem,
a `recipes/edit/` to segment statyczny. Dlatego pierwszy krok tej fazy sprawdza, że obie trasy
w ogóle odpowiadają pod `astro dev`, zanim ktokolwiek zacznie testować ich logikę.

**Contract**: `export const prerender = false`, jeden handler `POST`, bez ciała żądania (opis
pobierany z wiersza, nie od klienta — inaczej można by wysłać do modelu cokolwiek i zapisać wynik
jako pochodzący z opisu). Kolejność: autoryzacja przez `locals.supabase.auth.getUser()` (401) →
`entryIdSchema` na `params.id` (400) → `markEstimationRequested` (404, gdy brak wpisu; 200 z
aktualnym wierszem, gdy wartość już jest) → `estimateFromDescription` → `applyEstimate` przy liczbie
albo odczyt wiersza przy `null`. 200 z pełnym `DiaryEntryDto` w każdym przypadku poza awarią
dostawcy; brak oszacowania **nie jest błędem HTTP** — jest wierszem bez wartości. Błąd walidacji
przez `zodIssues` (`src/lib/utils/validation-errors.ts`).

Jedyne wyjście inne niż 200 po przejściu walidacji: `estimateFromDescription` rzucający
`OpenRouterError` łapany jest osobnym `catch` **przed** zewnętrznym catchem trasy i zamieniany na
502 z `{ error, code: "AI_UNAVAILABLE" }`. Wiersz zostaje wtedy ze znacznikiem i bez wartości —
znacznik został już zapisany, a ta zmiana go nigdy nie zeruje. Przeglądarka traktuje 502 tak samo
jak 200 bez wartości: wpis jest niepoliczony i czeka na „Policz ponownie" albo na liczbę wpisaną
ręcznie. Rozróżnienie jest tu po to, żeby awaria dostawcy była widoczna w logach i w ręcznej
weryfikacji — nie po to, żeby zmienić zachowanie interfejsu.

#### 5. Trasa ręcznego ustawienia wartości

**File**: `src/pages/api/diary-entries/[id].ts`

**Intent**: Powierzchnia, bez której kryterium akceptacji US-01 („po minucie użytkownik może podać
liczbę ręcznie") nie da się spełnić — dziś nie ma żadnej trasy zapisu do istniejącego wiersza.
Świadomie wąska: S-05 poszerzy ten sam plik i ten sam schemat.

**Contract**: `export const prerender = false`, jeden handler `PATCH` przyjmujący
`setEntryCaloriesSchema`. Te same kody co wyżej: 401, 400 z `zodIssues`, 404 przy cudzym lub
nieistniejącym wpisie, 200 z `DiaryEntryDto`. Brak `GET`, `PUT` i `DELETE` w tym pliku.

#### 6. Typ polecenia

**File**: `src/types.ts`

**Intent**: Nazwanie kontraktu, który przechodzi przez granicę trasa–serwis, tak samo jak
`CreateDiaryEntryCommand`.

**Contract**: `SetEntryCaloriesCommand` z jednym polem `calories: number`. Bez `calorie_origin` —
pochodzenie ustala serwer — i bez `user_id`, który podróżuje osobnym argumentem serwisu.

#### 7. Limit czasu funkcji na Vercelu

**File**: `astro.config.mjs`

**Intent**: Budżet 60 s po stronie serwera jest dziś zapisany tylko w planie, a nie w repozytorium.
`vercel({ webAnalytics: { enabled: true } })` nie podaje `maxDuration`, nie ma `vercel.json`, a grep
po `maxDuration` w całym repo nie zwraca nic — obowiązuje więc domyślny limit konta, którego nikt
tu nie deklaruje. Jeśli jest niższy niż minuta, platforma utnie funkcję w połowie wywołania modelu
i zobaczymy to **dopiero na produkcji** — czyli dokładnie w tym trybie awarii, przed którym
Implementation Approach broni się, odrzucając `fire-and-forget`.

**Contract**: `vercel({ webAnalytics: { enabled: true }, maxDuration: 60 })`. To jedyna zmiana poza
`src/` i `tests/` w całej tej zmianie; nie dokłada zależności ani zmiennej środowiskowej, więc nie
narusza granic z „What We're NOT Doing". Ta liczba jest **szczytem łańcucha budżetów**: pod nią
stoją `timeout: 60_000` klienta i `ESTIMATION_ABORT_MS = 65_000` w przeglądarce. Gdyby plan konta
nie pozwalał na 60 s, cały łańcuch schodzi razem z nią, łącznie z granicą minuty czytaną
z kryterium akceptacji US-01 — i wtedy jest to decyzja produktowa, nie techniczna.

### Success Criteria:

#### Automated Verification:

- Kontrola typów przechodzi: `npm run typecheck`
- Linter czysty: `npm run lint`
- Istniejąca suita jednostkowa przechodzi bez regresji: `npm run test`
- Aplikacja się buduje: `npm run build`

#### Manual Verification:

- `POST /api/diary-entries/<id>/estimate` na wpisie bez wartości zwraca 200, a wiersz ma liczbę i `calorie_origin` równe `ai_from_description`
- Ten sam `POST` na wpisie, który ma już wartość ręczną, zwraca 200 i nie zmienia ani liczby, ani pochodzenia
- `estimation_requested_at` jest ustawione w bazie w trakcie liczenia, zanim odpowiedź wróci
- `PATCH /api/diary-entries/<id>` z `calories` poza zakresem 0–5000 zwraca 400 z listą `details`
- `POST` i `PATCH` na wpis należący do innego użytkownika zwracają 404
- Wywołanie z nieprawidłowym `OPENROUTER_API_KEY` kończy się 502, a wiersz zostaje bez wartości
- Limit `maxDuration: 60` jest przyjęty przez platformę na deployu podglądowym, a wywołanie trwające ~40 s nie zostaje ucięte
- Pod `astro dev` obie nowe trasy odpowiadają — `[id].ts` i katalog `[id]/estimate.ts` nie kolidują ze sobą w routingu

**Implementation Note**: Po zakończeniu tej fazy i przejściu weryfikacji automatycznej zatrzymaj się
i poczekaj na potwierdzenie ręcznych kroków, zanim ruszysz do Fazy 2.

---

## Phase 2: Powierzchnia dziennika

### Overview

Wszystko, co użytkownik widzi: przycisk zlecający wycenę, stałe uprzedzenie o wysyłce treści, cztery
stany wartości przy wpisie i blokada pola z wyjściem awaryjnym.

### Changes Required:

#### 1. Czysty pomocnik stanu wyceny

**File**: `src/lib/utils/diary-estimation.ts`

**Intent**: Reguła „minuta od znacznika" ma być testowalna bez renderowania i bez zegara
systemowego, tak jak `summarizeDay` i `toLocalDay` w S-01.

**Contract**: `ESTIMATION_TIMEOUT_MS = 60_000` (granica z kryterium akceptacji US-01, po której wpis czyta się jako
niepoliczony) oraz `ESTIMATION_ABORT_MS = 65_000` — zapas ponad minutę, żeby własny abort
przeglądarki nie ucinał wywołania, na które serwer ma jeszcze budżet. Do tego funkcja czysta:

```ts
export type EstimationRequestPhase = "live" | "settled" | "none";

export function resolveEstimationState(
  entry: DiaryEntryDto,
  now: number,
  phase: EstimationRequestPhase
): "valued" | "estimating" | "stale" | "idle";
```

Trzeci argument jest **trójstanowy, nie boolowski**, i to jest sedno tej funkcji. `live` — ta wyspa
ma dla tego wpisu request w locie. `settled` — ta wyspa zleciła wycenę i **request już wrócił bez
wartości** (200 bez liczby albo 502). `none` — wyspa nic o tym wpisie nie wie, czyli albo nigdy nie
zlecała, albo strona została w międzyczasie przeładowana.

```
calories !== null                          -> "valued"
phase === "live"                           -> "estimating"
estimation_requested_at === null           -> "idle"
phase === "settled"                        -> "stale"
now - Date.parse(znacznik) < 60_000        -> "estimating"   // tylko przy phase === "none"
w przeciwnym razie                         -> "stale"
```

Znacznik z bazy jest tu **źródłem rezerwowym, nie nadrzędnym**: rozstrzyga wyłącznie przy `none`,
gdzie odtwarza wiedzę utraconą przy przeładowaniu. Gdyby rozstrzygał zawsze, wycena odpadająca po
kilku sekundach (nieprawidłowy klucz, brak sieci) trzymałaby wpis na „Liczę…" przez resztę minuty,
choć żaden request już nie żyje — a razem z blokadą pola zamykałaby jedyne wyjście, które FR-004
każe trzymać otwarte („the field stays always available", `prd.md:139`).

`now` przychodzi argumentem, nie z `Date.now()` w środku.

#### 2. Hook zlecający wycenę

**File**: `src/hooks/diary/useCalorieEstimation.ts`

**Intent**: Pojedyncze miejsce trzymające request w locie, jego timeout i anulowanie — z tych samych
powodów, dla których `useAI` trzyma je dla ścieżki przepisów.

**Contract**: `useCalorieEstimation(onSettled: () => void)` zwracające
`{ estimate(entryId), cancel(entryId), inFlightId: number | null, queuedIds: readonly number[], settledIds: ReadonlySet<number> }`.
Jeden `AbortController` w `useRef` dla wpisu będącego w locie, timeout `ESTIMATION_ABORT_MS`,
`credentials: "include"`. Po każdym zakończeniu — sukces, anulowanie, timeout, błąd, 502 —
wywołanie `onSettled`, żeby lista pobrała wiersz w stanie faktycznym.

**Wyceny idą kolejką FIFO, jedna na raz.** Bez tej decyzji drugie kliknięcie w trakcie pierwszej
wyceny robi jedną z dwóch złych rzeczy: po cichu przerywa pierwszą albo znika bez śladu. Zasady:

- `estimate(entryId)` dokłada wpis na koniec kolejki i startuje go natychmiast, jeśli nic nie
  jest w locie. Wpis już w locie albo już w kolejce to **no-op** — podwójne kliknięcie nie mnoży
  wywołań modelu.
- `cancel(entryId)` przerywa request, jeśli to ten w locie, albo po prostu wyjmuje wpis z kolejki.
  Po przerwaniu rusza następny z kolejki.
- Przed wysłaniem wpis wypada z kolejki, jeśli zdążył dostać wartość (ręczną albo z wcześniejszej
  wyceny) — nie ma po co pytać modelu o liczbę, która już jest.
- `ESTIMATION_ABORT_MS` mierzy czas **jednego requestu**, nie czekania w kolejce.

Cena tej decyzji jest jawna: przy pięciu wpisach zleconych naraz ostatni czeka kilka minut.
Rekompensuje to reguła z punktu 3 — pole na liczbę przy wpisie **w kolejce pozostaje aktywne**,
więc użytkownik nigdy nie musi czekać na kolejkę, żeby wpisać liczbę samemu. Blokuje wyłącznie
wpis faktycznie będący w locie.

`settledIds` to pamięć wyspy o tym, że dla danego wpisu request **już wrócił**; z niej, z
`inFlightId` i z `queuedIds` powstaje `EstimationRequestPhase` przekazywany do
`resolveEstimationState`: `live` przy `inFlightId === entryId` **lub trafieniu w `queuedIds`**
(z punktu widzenia użytkownika wpis w kolejce jest w toku), `settled` przy trafieniu
w `settledIds`, inaczej `none`.
Wpis wchodzi do zbioru przy każdym zakończeniu i **wypada z niego przy ponownym zleceniu** —
„Policz ponownie" musi wracać do `live`, nie zostawać na `settled`. Zbiór żyje tyle co wyspa:
po przeładowaniu jest pusty i rozstrzyga znacznik z bazy, dokładnie tak, jak przewiduje
`resolveEstimationState`.
**Bez retry**: ponowienie jest kliknięciem użytkownika. Wzorzec abortu do naśladowania:
`src/hooks/ai/useAI.ts:51-119`; anulowanie: tamże, 166-180. Stan wyprowadzany bez ustawiania go w
efekcie — `react-hooks/set-state-in-effect` jest w tym repo błędem.

#### 3. Wartość wpisu jako osobny komponent

**File**: `src/components/diary/DiaryEntryCalories.tsx`

**Intent**: Cztery stany wartości w jednym miejscu, zamiast rozsypane po liście. S-04 pokaże tutaj
piąte i szóste pochodzenie bez ruszania listy.

**Contract**: propsy `{ entry, state, isInFlight, isQueued, onEstimate, onCancel, onSetCalories }`. Render per stan:
`valued` — liczba, adnotacja o pochodzeniu (`ai_from_description` → „oszacowane z opisu",
`manual` → „wpisane ręcznie") **oraz to samo aktywne pole na liczbę, wstępnie wypełnione bieżącą
wartością**; `estimating` — „Liczę…"; `stale` — „Nie policzono", aktywne pole na
liczbę z zapisem i przycisk „Policz ponownie"; `idle` — „Nie policzono", aktywne pole i przycisk
„Policz kalorie".

**Pole na liczbę jest nieaktywne wyłącznie przy `isInFlight`, nie w całym stanie `estimating`.**
Stan `estimating` obejmuje trzy różne sytuacje i tylko jedna z nich uzasadnia blokadę:

| Sytuacja | Etykieta | Pole na liczbę | Przycisk |
| --- | --- | --- | --- |
| `isInFlight` — request w locie | „Liczę…" | **nieaktywne** | „Anuluj" (przerywa request) |
| `isQueued` — czeka w kolejce | „W kolejce…" | aktywne | „Anuluj" (wyjmuje z kolejki) |
| ani jedno, ani drugie — świeży znacznik po przeładowaniu strony | „Liczę…" | aktywne | „Policz ponownie" |

Trzeci wiersz tej tabeli to reguła z Critical Implementation Details: po przeładowaniu wyspa nie ma
żadnego requestu i nie ma czego anulować, więc „Anuluj" nie pojawia się wcale — zamiast stać
i nie działać, ustępuje miejsca „Policz ponownie". Drugi wiersz to cena kolejki FIFO z punktu 2:
wpis czekający na swoją turę nie może z tego powodu tracić dostępu do pola na liczbę, bo przy
pięciu zleceniach naraz czekałby kilka minut.

**Pole w stanie `valued` nie jest ozdobą — bez niego US-01 nie jest domknięte.** Kryterium akceptacji
brzmi „the user can accept the established value **or replace it** with one they type themselves"
(`prd.md:99`), a `setCaloriesManually` z Fazy 1 ustawia `manual` **bezwarunkowo** dokładnie po to,
żeby człowiek nadpisał oszacowanie. Serwer jest więc już gotowy; brakowałoby wyłącznie tej gałęzi
w komponencie. Zapis idzie tą samą trasą `PATCH` i tym samym `setEntryCaloriesSchema` co w
`idle`/`stale` — po nim wpis nadal jest `valued`, tylko adnotacja zmienia się na „wpisane ręcznie".
To **nie** jest edycja wpisu parkowana do S-05: S-05 dokłada treść, ilość i dzień, a wartość
kaloryczna należy do US-01 i jest w zakresie tej zmiany od początku (wąski `PATCH` z Fazy 1 pkt 5). Przy obu przyciskach
zlecających stałe zdanie: opis posiłku zostanie wysłany do dostawcy modelu. Pole liczby waliduje się
przez `setEntryCaloriesSchema` przed wysłaniem, tak jak formularz S-01 używa
`createDiaryEntrySchema`. Wartości `data-testid`: `diary-entry-estimate-button`,
`diary-entry-cancel-button`, `diary-entry-retry-button`, `diary-entry-calories-input`,
`diary-entry-calories-save`, `diary-entry-estimating`, `diary-entry-origin`, `diary-ai-notice` —
konwencja `<domena>-<element>-<typ>`, której S-01 miejscami nie dotrzymał (przegląd wdrożenia S-01,
finding F3).

#### 4. Lista wpisów oddaje wartość komponentowi

**File**: `src/components/diary/DiaryEntryList.tsx`

**Intent**: Lista przestaje sama renderować liczbę i badge „Nie policzono", a zaczyna przekazywać tę
rolę dalej.

**Contract**: propsy rosną o funkcję liczącą `state` per wpis oraz o trzy handlery przekazywane w
dół. Istniejące `data-testid` wpisu (`diary-entry-${id}`, `diary-entry-content`,
`diary-entry-amount`) zostają nietknięte, żeby nie przepisywać page objectu S-01.

#### 5. Formularz zleca wycenę przy zapisie

**File**: `src/components/diary/DiaryEntryForm.tsx`

**Intent**: Najczęstsza ścieżka — opisz i policz — ma być jednym kliknięciem, a nie zapisem i
polowaniem na przycisk na liście.

**Contract**: drugi przycisk „Zapisz i policz kalorie" obok istniejącego „Zapisz"
(`data-testid="diary-submit-estimate-button"`), aktywny tylko przy pustym polu kalorii. Po udanym
`POST` przekazuje `id` nowego wpisu do `onCreated`, którego sygnatura rośnie o opcjonalny argument.
Pod przyciskami stałe zdanie o wysyłce treści (`data-testid="diary-ai-notice"`).

#### 6. Spięcie wyspy

**File**: `src/components/diary/DiaryPage.tsx`

**Intent**: Wyspa jest właścicielem requestu w locie i zegara, bo to ona trzyma listę.

**Contract**: `useCalorieEstimation(refetch)` obok istniejącego `useDiaryEntries`; `now` odczytywane
przez `useSyncExternalStore` — **nie** przez `Date.now()` w renderze i **nie** przez `setState`
w efekcie. Wpis utworzony przyciskiem „Zapisz i policz kalorie" dostaje wycenę zleconą natychmiast
po odświeżeniu listy.

**Ten store trzeba napisać od zera — w repo nie ma wzorca tykającej wartości.**
`useSelectedDay.ts:25-33` subskrybuje `focus` i `visibilitychange`, a komentarz nad nim (`:19-23`)
wprost uzasadnia, dlaczego akurat te zdarzenia: dzień zmienia się wtedy, gdy użytkownik wraca do
karty. Dla minuty to za mało — w karcie, której nikt nie dotyka, granica nigdy by nie zapadła
i wpis stałby na „Liczę…" bezterminowo. `setInterval` nie występuje dziś nigdzie w `src/hooks`
ani `src/components`, więc jest to nowy wzorzec i taki go trzeba opisać:

- `subscribe` zakłada `setInterval` co 5 s i zdejmuje go w funkcji czyszczącej. Interwał żyje
  tylko dopóki jakikolwiek wpis jest w stanie `estimating` — wyspa bez liczonego wpisu nie ma
  powodu budzić Reacta co pięć sekund.
- Snapshot jest **kwantyzowany**: `Math.floor(Date.now() / 5000) * 5000`. Bez tego każdy odczyt
  zwracałby inną liczbę, `Object.is` nigdy nie trafiłby i `useSyncExternalStore` wpadłby w pętlę
  renderów. `useSelectedDay` rozwiązuje ten sam problem tym, że jego snapshot to string dnia —
  identyczny między tickami (komentarz tamże, `:35-36`); przy liczbie trzeba to zrobić ręcznie.
- Snapshot serwerowy to `0` — tak jak `useSelectedDay` oddaje `null`, żeby SSR i hydratacja nie
  rozjechały się na wartości, której serwer nie zna.
- Pięć sekund to rozdzielczość świadomie zgrubna: granica minuty przesuwa się o maksymalnie
  jeden tick, a wpis i tak ma wtedy aktywne pole i przycisk „Policz ponownie".

### Success Criteria:

#### Automated Verification:

- Kontrola typów przechodzi: `npm run typecheck`
- Linter czysty, w tym reguły React Compiler: `npm run lint`
- Aplikacja się buduje: `npm run build`
- Formatowanie zgodne: `npm run format:check`

#### Manual Verification:

- Wpis zapisany przyciskiem „Zapisz i policz kalorie" pojawia się na liście natychmiast, bez czekania na wartość
- W trakcie liczenia wpis pokazuje „Liczę…", a pole na ręczną liczbę przy tym wpisie jest nieaktywne
- „Anuluj" przerywa liczenie i natychmiast odblokowuje pole na liczbę
- Po dojściu wartości wpis pokazuje liczbę z adnotacją „oszacowane z opisu", a suma dnia rośnie i przestaje liczyć ten wpis jako brakujący
- Po upływie minuty bez wartości wpis czyta się jako „Nie policzono" z aktywnym polem i przyciskiem „Policz ponownie"
- Przeładowanie strony w trakcie liczenia nie gubi informacji, że oszacowanie zlecono, a „Policz ponownie" jest dostępne od razu
- Wartość wpisana ręcznie w trakcie liczenia zostaje i nie jest nadpisana przez spóźnione oszacowanie
- Zdanie o wysyłce treści do dostawcy modelu jest widoczne przy obu przyciskach zlecających
- Ekrany przepisów, profilu, logowania i rejestracji zachowują się jak dotąd
- Wycena odpadająca w kilka sekund (nieprawidłowy `OPENROUTER_API_KEY`) natychmiast zwalnia pole na liczbę — wpis nie stoi na „Liczę…" do końca minuty
- Liczbę ustaloną przez model da się zastąpić własną: pole przy wpisie z wartością przyjmuje nową liczbę, a adnotacja zmienia się na „wpisane ręcznie"
- Zlecenie wyceny przy drugim wpisie w trakcie pierwszej nie przerywa pierwszej: drugi czeka w kolejce z aktywnym polem na liczbę i rusza dopiero po zakończeniu pierwszego

**Implementation Note**: Po zakończeniu tej fazy i przejściu weryfikacji automatycznej zatrzymaj się
i poczekaj na potwierdzenie ręcznych kroków, zanim ruszysz do Fazy 3.

---

## Phase 3: Testy i domknięcie bramki

### Overview

Deterministyczna suita: dostawca modelu zamockowany w testach jednostkowych, E2E sprawdza stany
interfejsu i ścieżkę ręczną, nie dotykając OpenRoutera.

### Changes Required:

#### 1. Testy serwisu wyceny

**File**: `tests/unit/calorie-estimation.service.test.ts`

**Intent**: Zamknąć decyzję o progu 0–5000 i o tym, że `null` jest normalną odpowiedzią, zanim
którykolwiek z tych przypadków trafi do użytkownika.

**Contract**: `OpenRouterService` zamockowany przez `jest.mock`. Przypadki: poprawna liczba wchodzi;
**serwis wywołuje dostawcę dokładnie raz, także gdy wywołanie skończy się błędem** — to test
przypinający decyzję „jedna próba, zero powtórzeń", bo sama wartość `retries` jest w tym kliencie
łatwa do cichego cofnięcia (patrz Current State Analysis);
0 i 5000 przechodzą jako wartości brzegowe; 5001 i liczba ujemna dają `null`; ułamek zachowuje się
zgodnie z zaimplementowaną regułą zaokrąglania; brak pola `calories` w odpowiedzi daje `null`;
treść nie do sparsowania daje `null`; **`extractCalories` radzi sobie z odpowiedzią owiniętą
w ogrodzenia ` ```json ` i z preambułą modelu rozumującego przed właściwym obiektem** — dwa
przypadki, na które ten konkretny model jest podatny; **rzucony `OpenRouterError` przechodzi na zewnątrz i nie
zamienia się w `null`** — to granica między „odpowiedź bezużyteczna" a „dostawca nieosiągalny",
na której stoi 502 z trasy; ilość jest doklejana do promptu, a preferencje użytkownika **nie są**
pobierane.

#### 2. Testy warunkowych zapisów

**File**: `tests/unit/diary-service.test.ts`

**Intent**: Rozszerzyć istniejący plik o trzy nowe metody. Warunkowy zapis to reguła poprawności —
bez testu jego zniknięcie przy refaktorze nie rzuci się w oczy.

**Najpierw stub.** `QueryBuilderStub` w tym pliku (`tests/unit/diary-service.test.ts:12-18`) zna
dziś tylko `select`, `insert`, `eq`, `order` i `single` — nowe metody wywołałyby na nim
`TypeError: …update is not a function` przy pierwszym teście. Do interfejsu i do literału budującego
buildera trzeba dołożyć `update`, `is` i `maybeSingle`, wszystkie zwracające tego samego buildera.

**Contract**: `applyEstimate` nie nadpisuje wartości, gdy `calories` jest już ustawione, i zwraca
wtedy stan faktyczny wiersza; ustawia `calorie_origin: "ai_from_description"` razem z liczbą;
`markEstimationRequested` stempluje znacznik wyłącznie przy pustym `calories`;
`setCaloriesManually` ustawia `manual` bezwarunkowo i nie dotyka `estimation_requested_at`;
wszystkie trzy filtrują po `user_id` i zwracają `null` dla cudzego wpisu. Osobny przypadek na
`.maybeSingle()`: zero trafionych wierszy przychodzi jako `data: null, error: null` i **nie może
kończyć się rzutem** — to ten sam warunek, co „wartość ręczna zdążyła wcześniej".

#### 3. Testy pomocnika stanu

**File**: `tests/unit/diary-estimation.test.ts`

**Intent**: Granica minuty to jedyne miejsce, gdzie „liczy się" zamienia się w „przepadło" —
brzegi liczy się raz i zapisuje.

**Contract**: `resolveEstimationState` dla: wartości obecnej (zawsze `valued`, nawet ze znacznikiem);
znacznika dokładnie sprzed 60 000 ms i sprzed 59 999 ms przy `phase: "none"`; braku znacznika;
`phase: "live"`, które wygrywa ze starym znacznikiem; **`phase: "settled"` przy świeżym znaczniku,
które daje `stale`, nie `estimating`** — to test pilnujący, że szybka odmowa dostawcy natychmiast
zwalnia pole na liczbę.

#### 4. Testy schematu

**File**: `tests/unit/diary-validations.test.ts`

**Intent**: Dopisać `setEntryCaloriesSchema` do istniejącego pliku, tą samą metodą co
`createDiaryEntrySchema`.

**Contract**: 0 i 5000 przechodzą; −1 i 5001 odpadają; ułamek, tekst, brak pola i jawny `null`
odpadają z komunikatami po polsku.

#### 5. Page object i scenariusz E2E

**Files**: `tests/e2e/page-objects/DiaryPage.ts`, `tests/e2e/diary-entry.spec.ts`

**Intent**: Pokryć stany interfejsu bez dotykania dostawcy modelu — suita ma zostać deterministyczna
i nie płacić za wywołania w CI.

**Contract**: page object rośnie o lokatory nowych `data-testid` i o pomocnicze metody
(`expectNotCalculated`, `setCaloriesInline`, `expectAiNotice`). Scenariusz na tej samej dacie
sygnaturowej `2000-01-01`, co spec S-01 — nadal nie ma trasy `DELETE`, więc wiersze testowe parkują
w dniu, którego nikt nie otwiera. Scenariusz sprawdza: zdanie o wysyłce jest widoczne; wpis bez
wartości pokazuje „Policz kalorie"; wpisanie liczby w polu inline zmienia sumę dnia i zbija licznik
braków o jeden. **Żadnego kroku czekającego na odpowiedź modelu.**

### Success Criteria:

#### Automated Verification:

- Suita jednostkowa przechodzi: `npm run test`
- Suita E2E przechodzi: `npm run test:e2e`
- Linter czysty: `npm run lint`
- Kontrola typów na zero błędów: `npm run typecheck`
- Formatowanie zgodne: `npm run format:check`
- Audyt zależności przechodzi: `npm run test:security`

#### Manual Verification:

- Suita E2E przechodzi również wtedy, gdy `OPENROUTER_API_KEY` jest nieprawidłowy — żaden test automatyczny nie zależy od dostawcy
- Pełne przejście ścieżki z żywym modelem wykonane ręcznie w przeglądarce i potwierdzone
- Żaden test nie zostawia wierszy poza dniem sygnaturowym `2000-01-01`

---

## Testing Strategy

### Unit Tests:

- Próg 0–5000 i zamiana każdej awarii dostawcy na `null` zamiast wyjątku
- Warunkowe zapisy: spóźnione oszacowanie nie nadpisuje wartości ręcznej
- Granica minuty w `resolveEstimationState`, liczona na argumencie `now`, nie na zegarze systemowym
- `setEntryCaloriesSchema` na wartościach brzegowych i odrzuconych

### Integration Tests:

Repo nie ma katalogu `tests/integration` i ta zmiana go nie zakłada. Rolę testu przez całą trasę
pełni ręczna weryfikacja `curl`-em z Fazy 1.

### Manual Testing Steps:

1. Otwórz `/diary`, wpisz „zjadłem frytki" i „około 200 g", kliknij „Zapisz i policz kalorie" — wpis ma być na liście natychmiast.
2. Sprawdź, że pokazuje „Liczę…", pole liczby jest nieaktywne, a zdanie o wysyłce treści jest widoczne.
3. Poczekaj na wartość — ma pojawić się liczba z adnotacją „oszacowane z opisu", a suma dnia ma wzrosnąć.
4. Dodaj drugi wpis, zleć wycenę i kliknij „Anuluj" — pole ma się odblokować od razu.
5. W polu odblokowanym wpisz liczbę ręcznie i zapisz; sprawdź w bazie, że `calorie_origin` to `manual`.
6. Zleć wycenę i przeładuj stronę w trakcie — wpis ma nadal czytać się jako liczony, a „Policz ponownie" ma być dostępne.
7. Odłącz sieć albo podmień klucz na nieprawidłowy, zleć wycenę — po minucie wpis ma czytać się jako „Nie policzono" z aktywnym polem.
8. Sprawdź, że suma dnia mówi, ilu wartości nie obejmuje.
9. Przejdź przepisy, profil, wylogowanie i logowanie — bez zmian względem stanu sprzed zmiany.

## Performance Considerations

Wymaganie „wpis widoczny poniżej sekundy" spełnia niezmieniona ścieżka `POST /api/diary-entries` —
wycena nie leży na niej. Oszacowanie kosztuje dwa dodatkowe `UPDATE` na wpis; przy 3–4
użytkownikach i indeksie `(user_id, entry_date)` to bez znaczenia. Serwer dostaje pełną minutę i
zero ponowień, a przeglądarka przerywa własnym abortem po 65 s — świadome, lekkie wyjście poza
granicę minuty z US-01 jako koszt niezbędny: skrócenie tego budżetu wywraca znacznie więcej oszacowań,
niż zyskuje się na czasie. Interfejs i tak pokazuje wpis jako niepoliczony po minucie od znacznika,
więc z punktu widzenia użytkownika granica pozostaje minutą, a spóźniona wartość może już tylko
dopisać się do wpisu, którego nikt nie zdążył wypełnić ręcznie.

Cały ten łańcuch stoi na jednej liczbie spoza aplikacji: limicie czasu funkcji na Vercelu, który
Faza 1 punkt 7 zapisuje jawnie jako `maxDuration: 60`. Bez niego obowiązuje domyślna wartość konta
i to platforma, nie ten plan, decyduje, ile naprawdę trwa „pełna minuta".

## Migration Notes

Brak. Tabela, wartość enuma `ai_from_description` i kolumna `estimation_requested_at` przyszły z
F-01. Wiersze utworzone przez S-01 mają ten znacznik pusty i czytają się jako `idle` — czyli
dokładnie jako wpisy, dla których nigdy nie zlecono oszacowania.

## References

- Roadmapa, pozycja S-02: `context/foundation/roadmap.md`
- Wymagania: `context/foundation/prd.md` — FR-003, FR-004, FR-011 oraz „Quality properties this change must hold"
- Kryteria akceptacji US-01: `context/foundation/prd.md:96-103`. To stamtąd, a **nie** z FR-003,
  pochodzą granica jednej minuty i wymóg „accept the established value **or replace it** with one
  they type themselves"
- Poprzedni kawałek: `context/archive/2026-09-23-manual-diary-entry/plan.md`
- Kontrakt kolumn i nieegzekwowana reguła: `supabase/migrations/20260922140906_create_diary_entries.sql:44-53`
- Wzorzec trasy `[id]`: `src/pages/api/recipes/[id].ts:30-45`
- Wzorzec abortu i anulowania: `src/hooks/ai/useAI.ts:51-119, 166-180`
- Kolizja schematu odpowiedzi: `src/lib/api/openrouter.service.ts:88-103`, `src/lib/services/ai.service.ts:46`
- Reguła „pochodzenie ustala serwer": `src/lib/services/diary.service.ts:61`

## Progress

> Konwencja: `- [ ]` w toku, `- [x]` zrobione. Dopisz ` — <commit sha>`, gdy krok wyląduje. Nie zmieniaj tytułów kroków.

### Phase 1: Kontrakt serwerowy

#### Automated

- [x] 1.1 Kontrola typów przechodzi: `npm run typecheck` — 9b06dce
- [x] 1.2 Linter czysty: `npm run lint` — 9b06dce
- [x] 1.3 Istniejąca suita jednostkowa przechodzi bez regresji: `npm run test` — 9b06dce
- [x] 1.4 Aplikacja się buduje: `npm run build` — 9b06dce

#### Manual

- [ ] 1.5 `POST /api/diary-entries/<id>/estimate` na wpisie bez wartości zwraca 200, a wiersz ma liczbę i `calorie_origin` równe `ai_from_description`
- [x] 1.6 Ten sam `POST` na wpisie, który ma już wartość ręczną, zwraca 200 i nie zmienia ani liczby, ani pochodzenia — 9b06dce
- [x] 1.7 `estimation_requested_at` jest ustawione w bazie w trakcie liczenia, zanim odpowiedź wróci — 9b06dce
- [x] 1.8 `PATCH /api/diary-entries/<id>` z `calories` poza zakresem 0–5000 zwraca 400 z listą `details` — 9b06dce
- [x] 1.9 `POST` i `PATCH` na wpis należący do innego użytkownika zwracają 404 — 9b06dce
- [x] 1.10 Wywołanie z nieprawidłowym `OPENROUTER_API_KEY` kończy się 502, a wiersz zostaje bez wartości — 9b06dce
- [ ] 1.11 Limit `maxDuration: 60` jest przyjęty przez platformę na deployu podglądowym, a wywołanie trwające ~40 s nie zostaje ucięte
- [x] 1.12 Pod `astro dev` obie nowe trasy odpowiadają — `[id].ts` i katalog `[id]/estimate.ts` nie kolidują ze sobą w routingu — 9b06dce

### Phase 2: Powierzchnia dziennika

#### Automated

- [x] 2.1 Kontrola typów przechodzi: `npm run typecheck`
- [x] 2.2 Linter czysty, w tym reguły React Compiler: `npm run lint`
- [x] 2.3 Aplikacja się buduje: `npm run build`
- [x] 2.4 Formatowanie zgodne: `npm run format:check`

#### Manual

- [x] 2.5 Wpis zapisany przyciskiem „Zapisz i policz kalorie" pojawia się na liście natychmiast, bez czekania na wartość
- [x] 2.6 W trakcie liczenia wpis pokazuje „Liczę…", a pole na ręczną liczbę przy tym wpisie jest nieaktywne
- [x] 2.7 „Anuluj" przerywa liczenie i natychmiast odblokowuje pole na liczbę
- [x] 2.8 Po dojściu wartości wpis pokazuje liczbę z adnotacją „oszacowane z opisu", a suma dnia rośnie i przestaje liczyć ten wpis jako brakujący
- [x] 2.9 Po upływie minuty bez wartości wpis czyta się jako „Nie policzono" z aktywnym polem i przyciskiem „Policz ponownie"
- [x] 2.10 Przeładowanie strony w trakcie liczenia nie gubi informacji, że oszacowanie zlecono, a „Policz ponownie" jest dostępne od razu
- [x] 2.11 Wartość wpisana ręcznie w trakcie liczenia zostaje i nie jest nadpisana przez spóźnione oszacowanie
- [x] 2.12 Zdanie o wysyłce treści do dostawcy modelu jest widoczne przy obu przyciskach zlecających
- [x] 2.13 Ekrany przepisów, profilu, logowania i rejestracji zachowują się jak dotąd
- [x] 2.14 Wycena odpadająca w kilka sekund (nieprawidłowy `OPENROUTER_API_KEY`) natychmiast zwalnia pole na liczbę — wpis nie stoi na „Liczę…" do końca minuty
- [x] 2.15 Liczbę ustaloną przez model da się zastąpić własną: pole przy wpisie z wartością przyjmuje nową liczbę, a adnotacja zmienia się na „wpisane ręcznie"
- [x] 2.16 Zlecenie wyceny przy drugim wpisie w trakcie pierwszej nie przerywa pierwszej: drugi czeka w kolejce z aktywnym polem na liczbę i rusza dopiero po zakończeniu pierwszego

### Phase 3: Testy i domknięcie bramki

#### Automated

- [ ] 3.1 Suita jednostkowa przechodzi: `npm run test`
- [ ] 3.2 Suita E2E przechodzi: `npm run test:e2e`
- [ ] 3.3 Linter czysty: `npm run lint`
- [ ] 3.4 Kontrola typów na zero błędów: `npm run typecheck`
- [ ] 3.5 Formatowanie zgodne: `npm run format:check`
- [ ] 3.6 Audyt zależności przechodzi: `npm run test:security`

#### Manual

- [ ] 3.7 Suita E2E przechodzi również wtedy, gdy `OPENROUTER_API_KEY` jest nieprawidłowy — żaden test automatyczny nie zależy od dostawcy
- [ ] 3.8 Pełne przejście ścieżki z żywym modelem wykonane ręcznie w przeglądarce i potwierdzone
- [ ] 3.9 Żaden test nie zostawia wierszy poza dniem sygnaturowym `2000-01-01`
