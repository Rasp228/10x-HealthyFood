# Known Drift

Places where 10x-HealthyFood does not yet follow the conventions in @AGENTS.md. The conventions live
there and load every session; this inventory lives here because it shrinks as drift is repaid, and
editing it should not mean editing the rules.

Nothing listed here is a pattern to copy. Each entry names what is out of place, which rule it
predates, and what to do instead.

## Services

### `src/lib/services/recipe.service.ts` is not a server service

Despite the `.service.ts` suffix it is a browser-side `fetch` wrapper over `/api/recipes`, imported
only by React components and hooks. The server-side exemplar is `src/lib/services/ai.service.ts`:
constructed with the request-scoped client from `context.locals.supabase`, given already-validated
input. Do not model a server service on `recipe.service.ts`.

### Routes that query `locals.supabase` from the handler

The `auth`, `preferences`, `recipes` and `users` routes under `src/pages/api/` predate the rule that
business logic belongs in `src/lib/services/*.service.ts`, and talk to Supabase directly from the
handler. They work — do not copy them. A new route parses, delegates to a service, and responds.

## Validation

### Routes with inline Zod schemas

Schemas belong in `src/lib/validations/<domain>/<action>.ts`, following
`src/lib/validations/auth/login.ts`. Still declaring them inline:

- `src/pages/api/ai/generate-recipe.ts`, `modify-recipe.ts`, `save-recipe.ts`
- `src/pages/api/recipes/index.ts`, `[id].ts`
- `src/pages/api/preferences/index.ts`, `[id].ts`
- `src/pages/api/auth/update-password.ts`

Only `login`, `register` and `reset-password` have been extracted so far.

## Components

### Application components sitting in `src/components/ui/`

`src/components/ui/` is shadcn primitives only — `badge.tsx`, `button.tsx`, `card.tsx`, `input.tsx`,
`label.tsx`, `progress.tsx` and `textarea.tsx` belong there.
`ActionButtons.tsx`, `BaseModal.tsx`, `IconButton.tsx`, `LoadingSpinner.tsx` and `RecipeContent.tsx`
are application components. Do not add to that set; new application components go in
`src/components/{ai,auth,common,diary,feedback,layout,pages,profile,recipe}/`.

## Trasy AI

### Wywołania modelu bez limitu częstości i bez deduplikacji po stronie serwera

`src/pages/api/diary-entries/[id]/estimate.ts` oraz trzy trasy `src/pages/api/ai/` wołają dostawcę
modelu bez żadnego ograniczenia liczby żądań na użytkownika. W trasie wyceny kalorii jedyną bramką
jest `entry.calories !== null`: `markEstimationRequested` zapisuje `estimation_requested_at`, ale
czyta go tylko `applyEstimate`, i to już po wywołaniu modelu — żeby zapisać wynik wyłącznie
najnowszego zlecenia. Dwie otwarte karty albo pętla w `curl` doprowadzą więc do modelu
tyle wywołań, ile wyślą; zapisze się ostatnie zlecenie, reszta jest opłacona i wyrzucona. Kolejka FIFO w `src/hooks/diary/useCalorieEstimation.ts` dyscyplinuje uczciwą
przeglądarkę, nie endpoint.

Od S-04 ta sama trasa wycenia też wpisy z przepisu, wysyłając do modelu całą treść przepisu zamiast
jednego zdania opisu — prompt jest o rząd wielkości większy, więc niekontrolowana pętla kosztuje
teraz odpowiednio więcej. Luka jest ta sama, urosła tylko jej cena.

Od S-05 do modelu prowadzi też ścieżka „Zapisz i przelicz": `PATCH /api/diary-entries/:id`
z `recalculate: true` zeruje wartość i znacznik, a gdy parser przepisu nic nie ustali, przeglądarka
kolejkuje to samo `POST /estimate`. Wpis z wartością można więc wyzerować i wycenić ponownie
dowolną liczbę razy, bez żadnego limitu po stronie serwera.

Przyjęte świadomie (przegląd wdrożenia `ai-estimate-for-free-text`, ustalenie F2; podtrzymane
w planie `ai-estimate-from-recipe`, decyzja D6): model jest darmowy, użytkowników jest kilku,
a istniejące trasy `/api/ai/*` mają tę samą lukę. Zamknięcie jej w trasie wyceny to warunek
świeżości znacznika w `markEstimationRequested` — kolumnę czyta już `applyEstimate` (przegląd
wdrożenia `edit-and-delete-entry`, ustalenie F1), brakuje czytelnika przed wywołaniem modelu.
Do przemyślenia razem z S-05, która dziedziczy ten kontrakt.

### Niepusta odpowiedź modelu bez przepisu wraca jako przepis z 200

Od zmiany `testing-diary-value-integrity` `AIService.parseAIResponse`
(`src/lib/services/ai.service.ts`) rzuca `AIResponseParseError`, a trasy `/api/ai/generate-recipe`
i `/api/ai/modify-recipe` dają 502 `AI_PARSE_ERROR` — ale tylko wtedy, gdy treść jest pusta, złożona
z samych białych znaków albo nie jest napisem. Każdy inny tekst, który nie jest JSON-em z `title`
i `content`, trafia do `fallbackTextParsing` i wraca jako przepis z 200: odmowa modelu („Nie mogę
pomóc w tej prośbie”) albo JSON bez tych pól (`{}`) staje się przepisem zbudowanym z samej
odpowiedzi. Użytkownik może go zapisać jak prawdziwy. Ryzyko #2 test-planu („zła odpowiedź modelu zostaje
przyjęta”) jest więc zamknięte tylko dla odpowiedzi pustej.

Kierunek naprawy: uznawać za przepis wyłącznie JSON z niepustymi `title` i `content`, a resztę
kończyć `AIResponseParseError`. Zanim to się stanie, trzeba sprawdzić, jak często używany model
odpowiada czystym tekstem zamiast JSON-em, bo dziś te odpowiedzi ratuje parsowanie tekstowe.

Obecne zachowanie przypina test „tekst nie-JSON staje się przepisem z parsowania tekstowego (obecne
zachowanie)” w `tests/unit/ai-service.test.ts`; po naprawie zamień go na oczekiwanie
`AIResponseParseError`. Odłożone świadomie (plan `testing-diary-value-integrity`, „What We're NOT
Doing”: `fallbackTextParsing` bez zmian; przegląd wdrożenia, ustalenie F4).

## Wpisy dziennika

### Reguła „porcje tylko razem z przepisem" obowiązuje wyłącznie w chwili zapisu

`createDiaryEntrySchema` (`src/lib/validations/diary/create-entry.ts`) odrzuca w `superRefine` wpis
z `portions` bez `source_recipe_id`. Baza tej pary nie pilnuje niczym, a klucz obcy ma
`on delete set null` (`supabase/migrations/20260922140906_create_diary_entries.sql`), więc usunięcie
przepisu zostawia wiersz z `portions = 2`, `calorie_origin = 'recipe_nutrition'`
i `source_recipe_id = NULL` — w stanie, którego trasa tworząca nigdy by nie przyjęła. Wiersz jest
poprawny merytorycznie (użytkownik zjadł dwie porcje, a wartość i suma dnia mają zostać bez zmian —
to kryterium akceptacji US-02), tylko nieodtwarzalny przez własny schemat.

Od S-05 sierota nie jest już ślepym zaułkiem. `updateDiaryEntrySchema`
(`src/lib/validations/diary/update-entry.ts`) pilnuje tylko kształtu pól, a regułę kształtu ilości
`DiaryService.updateEntry` sprawdza względem zapisanego wiersza: wiersz z `portions` przyjmuje nowe
porcje bez względu na `source_recipe_id`, więc edycja sieroty nie kończy się 400. „Zapisz
i przelicz" nie znajduje dla niej treści przepisu i zostawia ją bez wartości, a trasa
`src/pages/api/diary-entries/[id]/estimate.ts` na gałęzi opisowej wysyła do modelu jej porcje jako
ilość (`formatPortions(entry.portions)` zamiast pustego `amount_text`). Wynik opisuje cały posiłek
i nie jest mnożony, a pochodzenie zostaje `ai_from_description`. Wiersz z „2 porcjami" nie dostaje
już wartości oszacowanej dla jednej.

Zostaje sama luka w bazie: żaden check nie wiąże `portions` z `source_recipe_id`, więc sierota
wciąż powstaje przy każdym usunięciu przepisu i wciąż nie przeszłaby przez schemat tworzenia.
Przyjęte świadomie (przegląd wdrożenia `recipe-entry-with-portions`, ustalenie F3; plan
`edit-and-delete-entry`, „What We're NOT Doing"): domknięcie wymaga migracji, którą oba plany
wprost wykluczają.

### Nagłówek bloku odżywczego deklarujący kilka porcji przechodzi jako „na porcję"

FR-009 pozwala wziąć wartość z treści przepisu tylko wtedy, gdy blok odżywczy sam mówi, że opisuje
**jedną** porcję; wtedy wartość wpisu to liczba z bloku razy zjedzone porcje. Reguła nagłówka
w `src/lib/utils/recipe-nutrition.ts` sprawdza jednak tylko, czy w linii stoi znacznik bloku
(„Wartości odżywcze”, „Nutrition”) i dowolne słowo z rodziny porcji („porcj”, „serving”,
„portion”). Przechodzą więc także nagłówki mówiące wprost o kilku porcjach albo o całym daniu:
„Wartości odżywcze na 4 porcje:”, „Wartości odżywcze dla 4 porcji:”, „Wartości odżywcze (całość,
4 porcje):”, „Nutrition per 4 servings:”. Przy `Kalorie: 2000 kcal` i jednej zjedzonej porcji wpis
dostaje 2000 kcal z pochodzeniem `recipe_nutrition` — czterokrotność, podaną jako wartość
z przepisu użytkownika, i po cichu wchodzi z nią do sumy dnia. To odwrotność zasady, pod którą PRD
zawęził FR-009: lepiej nie policzyć (wpis spada do wyceny z treści przepisu, FR-010), niż policzyć
kilka razy za dużo. Sam „Wartości odżywcze (całość)” bez słowa o porcji jest odrzucany poprawnie.

Kierunek naprawy: odrzucać nagłówek, w którym tuż przed słowem z rodziny porcji stoi liczba różna
od 1, albo w którym występuje słowo z listy „całość / łącznie / razem / total”. Zmiana mieści się
w jednym predykacie nagłówka; nie sprawdzono jeszcze nagłówków mieszanych („na porcję z 4 porcji”),
które taka reguła mogłaby odrzucić niepotrzebnie.

Wyrocznię pilnują cztery testy `test.failing` w `tests/unit/recipe-nutrition.test.ts` (blok
„F2: nagłówek deklarujący kilka porcji albo całość”), po jednym na nagłówek: każdy oczekuje braku
wartości (`no_declared_block`). Po naprawie zrobią się czerwone — wtedy zamień je na zwykłe `it`
i usuń ten wpis.

Odłożone świadomie (przegląd wdrożenia `recipe-entry-with-portions`, ustalenie F2, decyzja
SKIPPED; plan `testing-diary-value-integrity`, „What We're NOT Doing”): faza testów przypina
wyrocznię, nie zmienia zachowania parsera.

## Prymitywy UI

### `text-white` w wariancie `destructive`, bez strażnika na `button.tsx`

Warianty `destructive` w `src/components/ui/button.tsx` i `badge.tsx` piszą tekst literałem
`text-white` (`bg-destructive text-white`). `src/styles/global.css` nie ma tokenu
`--destructive-foreground` — ani w `:root`, ani w `.dark` — więc kolor tekstu na czerwonym
wypełnieniu nie pochodzi z kontraktu i nie zmieni go żaden motyw. Z tego samego powodu `button.tsx`
i `badge.tsx` nie są w `uiTokensConfig` (`eslint.config.js`): skan literałów zatrzymałby się na tym
`text-white`, więc ich fokus (od zmiany `ui-focus-ring` obrys `outline-ring` w pełnym kolorze)
pilnuje tylko reguła **Focus** w `AGENTS.md`, nie check. Pola (`input.tsx`, `textarea.tsx`) są
w `uiTokensConfig` od tej samej zmiany.

Odłożone świadomie (zmiana `ui-focus-ring`, research, ustalenie Z6): nie dotyczy fokusu, a naprawa
wymaga nowego tokenu w obu motywach z policzonym kontrastem na `--destructive` (w ciemnym motywie na
`destructive/60`). Po jego dodaniu `text-white` → `text-destructive-foreground`, a oba pliki trafiają
do `files` w `uiTokensConfig`.

## Middleware

### Wyjątek przy wymianie kodu weryfikacji kończy się 500 zamiast przekierowania

Gałąź `catch` w `src/middleware/index.ts` (wymiana `code` na `/auth/verify`) przekierowuje na
`/auth/verify?error=Wystąpił błąd podczas weryfikacji` bez `encodeURIComponent`, w przeciwieństwie
do dwóch pozostałych gałęzi błędu. `redirect` w Astro wkłada ścieżkę do nagłówka `Location` bez
kodowania, a `Headers` odrzuca znak spoza Latin-1 („ą”, kod 261) wyjątkiem
`TypeError: Cannot convert argument to a ByteString`. Użytkownik, któremu wymiana kodu z linku
w mailu rzuci (np. błąd sieci do Supabase), dostaje więc 500 zamiast ekranu z komunikatem, a
`flushCookies` na tym wyjściu nigdy się nie wykonuje — kasowanie sesji po `signOut()` nie dociera
do przeglądarki.

Kierunek naprawy: `encodeURIComponent` na komunikacie, tak jak w gałęzi `if (error)` i w gałęzi
`?error=`.

Zachowanie przypinają dwa testy w `tests/unit/middleware.test.ts` (blok „każde wyjście niesie
ciasteczka sesji”): zwykły `it` „…dziś wywraca przekierowanie na niezakodowanym Location (obecne
zachowanie)” oczekuje wyjątku `ByteString`, a `it.failing` „wyjątek przy wymianie kodu przekierowuje
z błędem, z ciasteczkami” opisuje docelowe 302 z ciasteczkami. Po naprawie usuń pierwszy, drugi
zamień na zwykłe `it` i usuń ten wpis.

Odłożone świadomie (plan `testing-session-and-access-boundaries`, faza 1: faza testów przypina
defekty, nie zmienia zachowania produkcyjnego).

## Własność rekordów

### Usunięcie cudzego albo nieistniejącego przepisu zgłasza sukces

`DELETE /api/recipes/:id` (`src/pages/api/recipes/[id].ts`) usuwa przez
`.delete().eq("id", recipeId).eq("user_id", user.id)` bez `.select()`, więc nie wie, czy trafił
w jakikolwiek wiersz. Przepis innego użytkownika i przepis, którego nie ma, kończą się tak samo:
200 `{ success: true, message: "Przepis został usunięty" }`, a dane zostają nietknięte. Izolacja
działa (filtr i RLS nie pozwolą skasować cudzego wiersza), ale kontrakt nie: trasa kłamie o
skutku, w przeciwieństwie do GET i PUT tego samego zasobu oraz `DELETE /api/diary-entries/:id`,
które w tej sytuacji dają 404.

Kierunek naprawy: `.select("id")` po filtrach i 404 „Przepis nie został znaleziony”, gdy lista
usuniętych wierszy jest pusta — tak jak `DiaryService.deleteEntry`. Przed zmianą sprawdzić
wywołujących: `RecipeService.deleteRecipe` (`src/lib/services/recipe.service.ts`) już traktuje 404
jako `false`, a `CleanupService.deleteAllTestUserRecipes` (`tests/e2e/services/cleanup.service.ts`)
usuwa wyłącznie przepisy z listy zalogowanego użytkownika, więc 404 dostałby tylko przy wyścigu.

Zachowanie przypinają testy w `tests/unit/recipes-route.test.ts` (blok „DELETE /api/recipes/:id”):
zwykły `it` „DELETE B na przepisie A zostawia wiersz A nietknięty” pilnuje stanu danych, a dwa
`test.failing` — „DELETE B na przepisie A daje 404” i „DELETE nieistniejącego przepisu daje 404” —
zapisują wyrocznię. Po naprawie zrobią się czerwone: zamień je na zwykłe `it` i usuń ten wpis.

Przyjęte świadomie (plan `testing-session-and-access-boundaries`, D5: faza testów przypina
defekty, nie zmienia zachowania produkcyjnego).

## Wylogowanie

### Klient wylogowania przekierowuje na ekran logowania mimo nieudanego wylogowania

Przycisk „Wyloguj” w `src/components/layout/TopNav.astro` obsługuje niewidoczna wyspa
`src/components/common/LogoutButton.tsx`. Po `POST /api/auth/logout` woła
`window.location.replace("/auth/login")` bez względu na wynik: przy odpowiedzi `!ok` (trasa daje 400,
gdy `signOut()` w Supabase zwróci błąd) tylko loguje błąd w konsoli, a w gałęzi `catch` (błąd sieci)
czyści `localStorage` i też przekierowuje. Użytkownik widzi ekran logowania i uznaje, że się
wylogował, a sesja może trwać dalej. Przy błędzie sieci żądanie nie dotarło do serwera, więc
ciasteczko sesji zostaje nietknięte i wejście na `/` pokaże go zalogowanego — to groźne zwłaszcza na
współdzielonym komputerze. Przy 400 ciasteczka zwykle są już skasowane, ale refresh token mógł nie
zostać unieważniony.

Kierunek naprawy: przy `!ok` i w `catch` zostać na stronie i pokazać toast błędu z `useToast`
(`src/hooks/common/useToast.ts`); wyspa musi wtedy renderować `<ToastContainer />`, bo dziś zwraca
`null`, a toast bez kontenera powstaje i nigdy się nie rysuje. Przekierowanie zostaje tylko na
gałęzi sukcesu.

Zachowanie przypinają testy w `tests/unit/LogoutButton.test.tsx`: zwykły `it` „ok: true wysyła POST
/api/auth/logout i dopiero potem przekierowuje na /auth/login” pilnuje gałęzi sukcesu, a dwa
`test.failing` — „ok: false (400 z trasy przy błędzie GoTrue) nie przekierowuje na /auth/login”
i „błąd sieci (fetch rzuca) nie przekierowuje na /auth/login” — zapisują wyrocznię. Po naprawie
zrobią się czerwone: zamień je na zwykłe `it` i usuń ten wpis. `src/components/auth/LogoutButton.tsx`
to martwy bliźniak z tym samym defektem — nic go nie importuje; naprawiać trzeba wyspę
z `src/components/common/`, a bliźniaka raczej usunąć niż poprawiać.

Przyjęte świadomie (plan `testing-session-and-access-boundaries`, D1: faza testów przypina
defekty, nie zmienia zachowania produkcyjnego).
