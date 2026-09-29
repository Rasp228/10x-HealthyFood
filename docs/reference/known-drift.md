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

`src/components/ui/` is shadcn primitives only — `button.tsx` is the only file there that belongs.
`ActionButtons.tsx`, `BaseModal.tsx`, `IconButton.tsx`, `LoadingSpinner.tsx` and `RecipeContent.tsx`
are application components. Do not add to that set; new application components go in
`src/components/{ai,auth,common,feedback,layout,pages,profile,recipe}/`.

## Trasy przepisów

### Termin wyszukiwania wklejany surowo w łańcuch PostgREST `or()`

`src/pages/api/recipes/index.ts:73-75` skleja `search` w napis
`title.ilike.%…%,content.ilike.%…%,additional_params.ilike.%…%` bez żadnego uciekania. Ten napis ma
własną gramatykę, więc znaki `,`, `(`, `)` i `%` wpisane przez użytkownika nie są traktowane jak
tekst szukanej frazy: przecinek rozbija warunek na kolejne ogniwo `or`, nawiasy otwierają
i zamykają grupę, a `%` jest wieloznacznikiem `ilike`. Skutkiem jest błąd 500 z PostgREST albo cicho
poszerzony wynik — nie wyciek cudzych wierszy, bo `.eq("user_id", …)` i RLS zostają poza tym
napisem.

Ścieżka dziennika omija to z założenia: `search_field=title` używa `query.ilike("title", …)`, gdzie
klient Supabase przekazuje wartość jako osobny parametr. Naprawa ogólnej gałęzi (uciekanie albo trzy
osobne `.ilike()` złożone przez `.or()` z parametrami) czeka na własną zmianę — ekran przepisów
dzisiaj na niej stoi.

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
