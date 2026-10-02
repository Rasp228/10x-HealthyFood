# Ucieczka terminu wyszukiwania przepisów — plan wdrożenia

## Overview

`GET /api/recipes` wkleja termin `search` surowo w łańcuch PostgREST `or()`, więc `,`, `(`, `)`
psują gramatykę filtra (błąd 500), a `%`, `_` i `*` działają jak wieloznaczniki (cicho poszerzony
wynik). Wprowadzamy jeden pomocnik, który ucieka termin na obu poziomach — wzorca LIKE i gramatyki
`or()` — i przepinamy na niego obie gałęzie trasy: ogólną (ekran przepisów) i `search_field=title`
(wyszukiwarka przepisów w dzienniku). Wpisany tekst ma być szukany dosłownie.

## Current State Analysis

- `src/pages/api/recipes/index.ts:61-63` składa
  `title.ilike.%${searchTerm}%,content.ilike.%${searchTerm}%,additional_params.ilike.%${searchTerm}%`
  bez żadnej ucieczki. `known-drift.md` wskazuje tu linie 73-75 — ten numer jest nieaktualny.
- `postgrest-js` przy `.or(filters)` tylko owija napis w nawiasy i dopisuje go do adresu
  (`node_modules/@supabase/postgrest-js/dist/index.mjs:2000-2003`) — niczego nie cytuje.
- Ta sama biblioteka przy `.in()` cytuje wartości zawierające `,()` podwójnym cudzysłowem
  (`index.mjs:1488`, `1712-1719`) — to jest gramatyka PostgREST, którą wykorzystamy w `or()`.
  Wewnątrz cudzysłowu znaczenie specjalne mają tylko `\` i `"`.
- Gałąź `search_field=title` (`index.ts:56-59`) używa `.ilike("title", `%${term}%`)` — wartość idzie
  osobnym parametrem adresu, więc gramatyka `or()` jej nie dotyczy, ale `%` i `_` z terminu nadal są
  wieloznacznikami LIKE. Komentarz przy niej („omija problem") obiecuje więcej, niż daje.
- PostgREST w operatorach `like`/`ilike` zamienia `*` na `%` (alias, żeby nie kodować `%` w adresie),
  więc dosłownej gwiazdki nie da się wyrazić wzorcem.
- Konsumenci: `src/hooks/recipe/useRecipes.ts` → `RecipeService.getUserRecipes` (ekran przepisów,
  gałąź ogólna) i `src/hooks/diary/useRecipeSearch.ts:62-66` (dziennik, `search_field: "title"`).
  Kształt odpowiedzi `RecipesDto` i schemat `src/lib/validations/recipe/list-recipes.ts` zostają.
- Trasa `/api/recipes` nie ma dziś testu. Wzorzec testu trasy: `tests/unit/diary-entry-route.test.ts`
  (`@jest-environment node`, `locals.supabase` z mockowanymi metodami, kontekst rzutowany na
  `Parameters<typeof GET>[0]`).

## Desired End State

- Termin z `,`, `(`, `)`, `"`, `\` nie kończy się 500 — wraca 200 i trafienia zawierające ten tekst.
- `%` i `_` są szukane dosłownie („100%" nie znajduje „1000 g"), w obu gałęziach.
- `*` dopasowuje dokładnie jeden dowolny znak (także `*`) — najwęższe zachowanie dostępne
  przy aliasie PostgREST.
- Obie gałęzie budują wzorzec tym samym pomocnikiem; testy jednostkowe przypinają dokładne napisy
  przekazywane do `.ilike()` i `.or()`.
- Sekcja „Trasy przepisów" znika z `docs/reference/known-drift.md`.

### Key Discoveries:

- `postgrest-js` cytuje wartości z `,()` tylko w `.in()`/`.not.in()` — `index.mjs:1488,1712-1731`.
- `.or()` nie robi nic poza `(${filters})` — `index.mjs:2000-2003`.
- `.ilike(column, pattern)` dopisuje `ilike.${pattern}` jako osobny parametr — `index.mjs:1626-1629`.
- `parallel-check.md` (katalog główny worktree): w `known-drift.md` ruszamy **tylko** sekcję
  „Trasy przepisów" — równolegle `fix/ui-focus-ring` usuwa sekcję „Prymitywy UI".

## What We're NOT Doing

- Nie przenosimy logiki trasy do serwisu ani inline'owego `createRecipeSchema` do `validations/` —
  to osobny dryf (known-drift, „Routes that query `locals.supabase`", „Routes with inline Zod schemas").
- Nie zmieniamy `listRecipesSchema`, `RecipesDto`, `RecipeService` ani hooków.
- Nie dodajemy wyszukiwania pełnotekstowego, RPC ani migracji.
- Nie dokładamy scenariusza E2E — zachowanie PostgREST potwierdza krok ręczny fazy 2.
- Nie dotykamy sekcji „Prymitywy UI" ani innych sekcji `known-drift.md`.

## Implementation Approach

Dwa poziomy ucieczki, w stałej kolejności:

1. **Wzorzec LIKE** — `\` → `\\`, `%` → `\%`, `_` → `\_`, `*` → `_`, potem owinięcie w `%…%`.
   Domyślny znak ucieczki LIKE w PostgreSQL to `\`, a PostgREST nie podaje własnego `ESCAPE`.
2. **Gramatyka `or()`** (tylko gałąź ogólna) — każdą wartość owijamy w `"…"`, uciekając w niej
   `\` → `\\` i `"` → `\"`. Gałąź tytułu tego poziomu nie potrzebuje, bo `.ilike()` przekazuje
   wartość osobnym parametrem.

`*` mapujemy na `_`, nie na `\*`: PostgREST zamieniłby `\*` w `\%` (dosłowny procent), co
dopasowywałoby zły znak. `_` dopasowuje `*` niezależnie od tego, czy alias działa wewnątrz
cytowanej wartości.

## Critical Implementation Details

**Kolejność ucieczki.** Poziom LIKE musi zadziałać przed cytowaniem `or()`, a w poziomie LIKE `*` → `_`
nie może przejść przez ucieczkę `_` (inaczej powstanie `\_`, czyli dosłowne podkreślenie). Jedno
`replace` z wyrażeniem `[\\%_*]` i funkcją zwrotną rozwiązuje to bez zależności od kolejności.
Przykład końcowy dla terminu `100%`: wzorzec `%100\%%`, w `or()` → `title.ilike."%100\\%%"`.

## Faza 1: Pomocnik, trasa i testy

### Overview

Czysty moduł z ucieczką, obie gałęzie trasy na nim, testy pomocnika i nowej trasy.

### Changes Required:

#### 1. Pomocnik wyszukiwania

**File**: `src/lib/utils/recipe-search.ts` (nowy)

**Intent**: Jedno miejsce, które zamienia wpisany termin na wzorzec LIKE „zawiera dosłownie" oraz
składa z niego warunek `or()` dla wielu kolumn. Moduł nie zna Supabase — przyjmuje i zwraca napisy,
więc testuje się go bez mocków.

**Contract**:
- `toContainsPattern(term: string): string` — wynik ucieczki poziomu LIKE owinięty w `%…%`.
  Nie przycina terminu (to robi trasa).
- `buildIlikeOrFilter(columns: readonly string[], pattern: string): string` — `col.ilike."<pattern
  z uciekniętymi \ i ">"` dla każdej kolumny, połączone przecinkiem.
- Komentarz modułu wyjaśnia oba poziomy i powód mapowania `*` → `_`.

```ts
// Jedno przejście, żeby `*` -> `_` nie zostało potem ucieknięte jako `\_`.
term.replace(/[\\%_*]/g, (ch) => (ch === "*" ? "_" : `\\${ch}`));
// Cytowanie wartości w `or()`:
`"${pattern.replace(/[\\"]/g, (ch) => `\\${ch}`)}"`;
```

#### 2. Trasa listowania przepisów

**File**: `src/pages/api/recipes/index.ts`

**Intent**: Gałąź `search_field=title` przekazuje do `.ilike("title", …)` wynik `toContainsPattern`;
gałąź ogólna przekazuje do `.or()` wynik `buildIlikeOrFilter(["title", "content",
"additional_params"], toContainsPattern(term))`. Komentarz przy gałęzi tytułu przestaje twierdzić,
że ścieżka „omija problem", i odsyła do pomocnika.

**Contract**: Kształt odpowiedzi, kody statusu, przycinanie terminu i pominięcie filtra dla pustego
terminu — bez zmian. Zmienia się wyłącznie napis wzorca/filtra.

#### 3. Testy pomocnika

**File**: `tests/unit/recipe-search.test.ts` (nowy)

**Intent**: Przypina dokładne wyjścia dla: zwykłego tekstu (`owsianka` → `%owsianka%`), `%`, `_`,
`\`, `*`, mieszanki (`a_b*c%`), oraz dla `buildIlikeOrFilter`: przecinka, nawiasów, cudzysłowu
i ukośnika wstecznego w terminie — wynik ma zawsze dokładnie trzy człony rozdzielone przecinkami
poza cudzysłowami.

**Contract**: Jest 30 + ts-jest, import z `@/lib/utils/recipe-search`.

#### 4. Test trasy

**File**: `tests/unit/recipes-route.test.ts` (nowy)

**Intent**: Wywołuje `GET` z `locals.supabase`, którego `from()` zwraca łańcuchowy budowniczy
zapamiętujący wywołania `eq`/`ilike`/`or`/`order`/`limit` i rozwiązujący się do
`{ data: [], error: null, count: 0 }`. Sprawdza: `?search=a,b(c)%` → `or` dostaje dokładny,
ucieknięty napis i odpowiedź to 200; `?search=50%&search_field=title` → `ilike("title", "%50\\%%")`
i brak `or`; pusty/biały termin → ani `ilike`, ani `or`; brak użytkownika → 401.

**Contract**: `@jest-environment node`, kontekst w kształcie z `diary-entry-route.test.ts`
(`{ url, locals } as unknown as Parameters<typeof GET>[0]`).

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą: `npm run test`
- Typecheck bez błędów: `npm run typecheck`
- Lint przechodzi: `npm run lint`
- Formatowanie zgodne: `npm run format:check`

**Implementation Note**: Po przejściu weryfikacji automatycznej przejdź do fazy 2 — krok ręczny
z prawdziwym PostgREST jest w niej.

---

## Faza 2: Dokumentacja i weryfikacja na bazie

### Overview

Usunięcie spłaconego dryfu, uporządkowanie notatki równoległej pracy i potwierdzenie zachowania
na prawdziwym PostgREST.

### Changes Required:

#### 1. Rejestr dryfu

**File**: `docs/reference/known-drift.md`

**Intent**: Usunąć całą sekcję `## Trasy przepisów` (z podsekcją o łańcuchu `or()`) — luka jest
spłacona w obu gałęziach. Żadnej innej sekcji nie ruszać (parallel-check).

**Contract**: Sekcja `## Trasy przepisów` znika; `## Trasy AI` następuje bezpośrednio po
`## Components`.

#### 2. Notatka równoległej pracy

**File**: `parallel-check.md` → `context/changes/recipe-search-escape/parallel-check.md`

**Intent**: Przenieść plik do folderu zmiany, jak każe jego nagłówek, bez zmiany treści.

**Contract**: Katalog główny worktree nie zawiera już `parallel-check.md`.

### Success Criteria:

#### Automated Verification:

- W `known-drift.md` nie ma nagłówka „Trasy przepisów"
- `parallel-check.md` leży w `context/changes/recipe-search-escape/`
- Formatowanie zgodne: `npm run format:check`

Sprawdzenie 2.1: `grep -c "Trasy przepisów" docs/reference/known-drift.md` zwraca 0.

#### Manual Verification:

- Ekran przepisów: `(pomidorowy),` i `100%` znajdują przepis, bez 500
- Ekran przepisów: `100%` nie zwraca `1000 g`; `a_b` nie zwraca `axb`
- Ekran przepisów: termin z `"` i `\` nie kończy się błędem
- Dziennik: wyszukiwarka znajduje tytuł z `%`, a `*` nie wywołuje błędu

Przepis testowy dla 2.4–2.7: `Sos (pomidorowy), 100% domowy` (patrz „Manual Testing Steps").

---

## Testing Strategy

### Unit Tests:

- `recipe-search.test.ts`: dokładne wyjścia obu funkcji dla każdego znaku specjalnego i ich mieszanki.
- `recipes-route.test.ts`: napisy przekazane do `.ilike()`/`.or()` w obu gałęziach, pusty termin, 401.

### Integration Tests:

- Brak automatycznych — semantykę PostgREST (cytowanie w `or()`, alias `*`) potwierdza krok ręczny.

### Manual Testing Steps:

1. `npm run dev`, zalogować się, utworzyć przepis `Sos (pomidorowy), 100% domowy`.
2. Na ekranie przepisów wyszukać `(pomidorowy),`, `100%`, `a_b`, `x"y`, `x\y` — sprawdzić wyniki i brak 500 w konsoli.
3. W `/diary` otworzyć formularz wpisu z przepisu i wyszukać `100%` oraz `*`.

## Performance Considerations

Brak — zmienia się tylko treść wzorca; liczba zapytań i indeksy bez zmian.

## Migration Notes

Brak migracji. Zmiana zachowania jest celowa: terminy z `%`/`_`/`*` zwracają odtąd węższy,
dosłowny wynik.

## References

- Opis luki: `docs/reference/known-drift.md`, sekcja „Trasy przepisów"
- Notatka równoległej pracy: `parallel-check.md`
- Wzorzec testu trasy: `tests/unit/diary-entry-route.test.ts:1-40`
- Cytowanie wartości w `postgrest-js`: `node_modules/@supabase/postgrest-js/dist/index.mjs:1488,1712-1719`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Pomocnik, trasa i testy

#### Automated

- [x] 1.1 Testy jednostkowe przechodzą: `npm run test` — 5bc974b
- [x] 1.2 Typecheck bez błędów: `npm run typecheck` — 5bc974b
- [x] 1.3 Lint przechodzi: `npm run lint` — 5bc974b
- [x] 1.4 Formatowanie zgodne: `npm run format:check` — 5bc974b

### Phase 2: Dokumentacja i weryfikacja na bazie

#### Automated

- [x] 2.1 W `known-drift.md` nie ma nagłówka „Trasy przepisów" — a02a30d
- [x] 2.2 `parallel-check.md` leży w `context/changes/recipe-search-escape/` — a02a30d
- [x] 2.3 Formatowanie zgodne: `npm run format:check` — a02a30d

#### Manual

- [x] 2.4 Ekran przepisów: `(pomidorowy),` i `100%` znajdują przepis, bez 500 — a02a30d
- [x] 2.5 Ekran przepisów: `100%` nie zwraca `1000 g`; `a_b` nie zwraca `axb` — a02a30d
- [x] 2.6 Ekran przepisów: termin z `"` i `\` nie kończy się błędem — a02a30d
- [x] 2.7 Dziennik: wyszukiwarka znajduje tytuł z `%`, a `*` nie wywołuje błędu — a02a30d
