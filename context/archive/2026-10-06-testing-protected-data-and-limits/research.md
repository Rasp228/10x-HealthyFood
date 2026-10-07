---
date: 2026-10-06T15:29:59+02:00
researcher: Rasp228 (z Claude Code)
git_commit: ad285aa96a5b5fbc84821e0ecc322f5c467cb9cc
branch: master
repository: 10x-HealthyFood
topic: "Ugruntowanie fazy 3 test-planu: ryzyka #5 (dane chronione) i #6 (twarde limity)"
tags: [research, test-plan, preferences, recipes, user-settings, diary, validation, limits, zod]
status: complete
last_updated: 2026-10-06
last_updated_by: Rasp228 (z Claude Code)
---

# Research: dane chronione i twarde limity (ryzyka #5 i #6)

**Date**: 2026-10-06T15:29:59+02:00
**Researcher**: Rasp228 (z Claude Code)
**Git Commit**: ad285aa (drzewo robocze: zmodyfikowany `context/foundation/test-plan.md`, nowy folder tej zmiany; kod `src/` bez zmian względem commita)
**Branch**: master
**Repository**: 10x-HealthyFood

## Research Question

Ugruntować w kodzie fazę 3 z `context/foundation/test-plan.md` §3 (zmiana
`testing-protected-data-and-limits`): ryzyka #5 i #6 z §2. Dla każdego ryzyka: realna ścieżka
awarii z cytatami, weryfikacja albo korekta „Risk Response Guidance”, istniejące testy, najtańsza
użyteczna warstwa, ocena dowodów z hot-spotów.

## Summary

**#5 — dane chronione.** Na sprawdzonych ścieżkach żadna operacja celu dziennego ani dziennika nie
pisze do `preferences` ani `recipes`. Cel to jeden upsert do `user_settings`
(`src/lib/services/user-settings.service.ts:48-55`). `DiaryService` sięga do `recipes` tylko odczytem
`select("content")` (`src/lib/services/diary.service.ts:149-154`), a do `preferences` wcale. Migracje
nie mają ani jednego triggera (grep `trigger` w `supabase/migrations/`: 0 trafień). Teza „inna
tabela, więc nic się nie stanie” jest więc dziś prawdziwa — ale tylko dlatego, że tak jest napisany
kod. Nic tego nie pilnuje: preferencje mają **zero testów**, a jedyne realne miejsce, w którym
preferencje mogą przepaść, to filtr `DELETE /api/preferences/:id`
(`src/pages/api/preferences/[id].ts:135`). Usunięcie przepisu nie dotyka wpisów w kodzie aplikacji.
Robi to baza przez `on delete set null` (`supabase/migrations/20260922140906_create_diary_entries.sql:36-38`),
a tego atrapa Jest nie zobaczy.

**#6 — twarde limity.** Dziennik, cel i wyszukiwanie mają limity zdublowane w Zod i zwracają 400
przez `safeParse` + `zodIssues`. Granice schematów są już w dużej części przetestowane. **Trzy trasy
zamieniają przekroczenie limitu albo złe wejście w 500**:

1. **Preferencje.** POST, PUT i GET używają `.parse()`. Rzucony `ZodError` łapie zewnętrzny `catch`,
   który oddaje 500 z `error.message`. W Zod 4 jest to surowy JSON listy issues, sprawdzone lokalnie
   (`src/pages/api/preferences/index.ts:109,154-166`, `[id].ts:38,80-92`). Wartość 51-znakowa daje 500.
   Duplikat `(user_id, category, value)` też daje 500, z treścią błędu Postgresa.
2. **Przepisy.** POST i PUT `/api/recipes` nie mają żadnego `max`. Tytuł ponad `varchar(255)` albo
   treść ponad `char_length <= 5000` dochodzą do bazy i wracają jako 500 z `details: error.message`
   (`src/pages/api/recipes/index.ts:10-15,154-164`, `[id].ts:8-12,144-155`). Ciało, które nie jest
   JSON-em, też daje 500.
3. **Identyfikatory.** `entryIdSchema` przepuszcza każdą bezpieczną liczbę całkowitą JS, a kolumna
   `id` to `serial` (int4). Przypuszczalnie więc `PATCH /api/diary-entries/3000000000` daje 500, nie
   404 albo 400 — nie zweryfikowane na prawdziwej bazie, patrz Open Questions.

Data z przyszłości i notacja `1e3` wymagają korekty guidance:

- **Przyszła data** jest blokowana wyłącznie w przeglądarce, i to świadomie (decyzja z
  `2026-09-23-manual-diary-entry`, potwierdzona w `edit-and-delete-entry`). To opisana luka, nie
  regresja. Wyrocznią „400” byłaby nowa decyzja produktowa.
- **`1e3`** nie istnieje na granicy API: JSON `1e3` to liczba 1000, poprawna wartość. Ochrona leży
  w parserach przeglądarki. `parseCalories` i `parsePortions` nie mają dziś żadnego testu.

## Detailed Findings

### #5 — ścieżki zapisu dotykające preferencji i przepisów

Wszystkie wywołania `.from("preferences" | "recipes")` w `src/` (grep, 17 trafień):

| Wywołujący | Tabela | Operacja | Anchor |
|---|---|---|---|
| `AIService.getUserPreferences` | preferences | select | `src/lib/services/ai.service.ts:536` |
| `AIService.getRecipePreferences` | recipes | select | `src/lib/services/ai.service.ts:590-595` |
| `DiaryService.readOwnRecipeContent` (create, recalculate, estimate) | recipes | select `content` | `src/lib/services/diary.service.ts:149-154` |
| `POST /api/ai/modify-recipe` | recipes | select | `src/pages/api/ai/modify-recipe.ts:62-67` |
| `POST /api/ai/save-recipe` | recipes | select, **update** (`replace_existing`), **insert** | `src/pages/api/ai/save-recipe.ts:91-96,119-125,159` |
| `GET /api/users/stats` | recipes | select | `src/pages/api/users/stats.ts:24-27` |
| `/api/preferences` GET/POST | preferences | select, count, **insert** | `src/pages/api/preferences/index.ts:44-49,116,133-142` |
| `/api/preferences/:id` PUT/DELETE | preferences | select, **update**, **delete** | `src/pages/api/preferences/[id].ts:45-68,121-135` |
| `/api/recipes` GET/POST | recipes | select, **insert** | `src/pages/api/recipes/index.ts:51,146` |
| `/api/recipes/:id` GET/PUT/DELETE | recipes | select, **update**, **delete** | `src/pages/api/recipes/[id].ts:39-44,120-126,183` |

Wnioski:

- **Cel dzienny.** `PUT /api/user-settings` → `UserSettingsService.setDailyGoal` → jeden `upsert`
  na `user_settings` (`user-settings.service.ts:48-55`). Hook `useDailyGoal` woła tylko
  `/api/user-settings` (`src/hooks/profile/useDailyGoal.ts:49,91`). PRD zakładał zapis celu
  w rekordzie profilu obok preferencji (`prd.md:194`). Plan `daily-goal-and-progress` odszedł od tego
  na rzecz osobnej tabeli, żeby „preferences zostaje w 100% nietknięte”
  (`context/archive/2026-09-30-daily-goal-and-progress/plan-brief.md:34-35`; uzasadnienie także
  w `supabase/migrations/20260930074331_create_user_settings.sql:9-14`). Ryzyko nadpisania
  preferencji przy zapisie celu, przewidziane w PRD, nie ma więc dziś ścieżki w kodzie.
- **Dziennik.** Każda metoda zapisująca `DiaryService` (`createEntry`, `markEstimationRequested`,
  `applyEstimate`, `updateEntry`, `deleteEntry`) pisze wyłącznie do `diary_entries`
  (`diary.service.ts:107-120,183-190,241-253,367-373,393-398`). Przepis jest tylko czytany. To samo
  dotyczy „Zapisz i przelicz” (`recalculate`, `diary.service.ts:317-345`) i trasy wyceny
  (`src/pages/api/diary-entries/[id]/estimate.ts:86-92`). Spełnia to PRD „Recipes are read, never
  written” (`prd.md:193`) i US-02 AC (`prd.md:118`).
- **Klucz obcy działa w jedną stronę.** `diary_entries.source_recipe_id references recipes(id)
  on delete set null` (`create_diary_entries.sql:38`). Usunięcie albo edycja wpisu (dziecko) nie
  może zmienić przepisu (rodzica). Usunięcie przepisu ustawia `source_recipe_id = NULL` we wpisach,
  a `content` i `calories` zostają. To decyzja z planu `2026-09-22-diary-entry-store`
  (plan.md:220,236-238) i wymaganie PRD (`prd.md:119`, `:195`). Innych kaskad między tabelami
  aplikacji nie ma. Pozostałe `on delete cascade` prowadzą wyłącznie od `auth.users`
  (`healthymeal_schema.sql:32,44,55`, `create_diary_entries.sql:28`, `create_user_settings.sql:24`).
- **Realne ścieżki utraty preferencji** (podważenie tezy „inna tabela”):
  - `DELETE /api/preferences/:id` usuwa przez `.delete().eq("id", preferenceId).eq("user_id", user.id)`
    (`[id].ts:135`). Zgubienie filtra `id` skasowałoby wszystkie preferencje użytkownika, a trasa
    i tak oddałaby 204. Ten sam kształt ma PUT (`[id].ts:59-68`, z `.single()`, które przy więcej niż
    jednym trafionym wierszu zwróciłoby błąd, ale dopiero po zapisie).
  - `parseInt(params.id)` (`[id].ts:112`) przyjmuje `"12abc"` jako 12. Adres, którego nikt nie
    zamierzał obsłużyć, usuwa więc preferencję 12. Dotyczy to wyłącznie własnych danych.
  - Klient po DELETE zdejmuje z listy tylko element o tym `id` (`src/hooks/profile/usePreferences.ts:161-166`).
    Widok nie pokaże więc, że serwer usunął więcej — o stratę widać dopiero po przeładowaniu.
- **Przepisy** zmieniają się wyłącznie w trasach zarządzania przepisami (FR-014) i w `save-recipe`
  z `replace_existing` (`save-recipe.ts:89-125`). To zamierzone nadpisanie, z filtrem `user_id`,
  poza zakresem „uszkodzenia przez profil albo dziennik”.

**Istniejące testy dla #5.** Grep `preferences` w `tests/` trafia tylko w
`tests/unit/middleware.test.ts` (ścieżki) i `tests/unit/ai-service.test.ts`. Tras preferencji nie
testuje nic. `tests/unit/user-settings-route.test.ts:11-13` szpieguje metody serwisu, więc nie widzi
żadnej tabeli. `tests/unit/user-settings-service.test.ts:46-55` sprawdza tylko argumenty `upsert`.
Testy dziennika (`diary-service.test.ts`, `diary-entries-route.test.ts`) mają atrapy jednej tabeli.
Stan `recipes` po operacji sprawdza jedynie blok DELETE w `tests/unit/recipes-route.test.ts:176-190`.

**Najtańsza warstwa dla #5.** Integracja trasy ze **stanową atrapą wielu tabel**, czyli rozszerzenie
wzorca §6.3. Atrapa trzyma wiersze `preferences`, `recipes`, `diary_entries` i `user_settings`.
Obsługuje tylko łańcuchy, których używają trasy, a nieznaną tabelę albo metodę kończy wyjątkiem.
Asercje sprawdzają głęboką równość tablic `preferences` i `recipes` przed i po operacji, a nie samo
„nie wywołano”. Przypadki:

- PUT celu (wartość i `null`);
- POST, PATCH (`calories`, `recalculate`, zmiana porcji) i DELETE wpisu;
- POST estimate z przepisem;
- DELETE jednej preferencji, gdy kilka ma ten sam `user_id` i tę samą kategorię — pozostałe zostają
  co do pola;
- kontrola pozytywna: usunięty wiersz faktycznie znika.

Granica dowodu: atrapa nie odtworzy triggerów ani kaskad bazy. Dziś triggerów nie ma, a jedyną
kaskadą między tabelami aplikacji jest `set null` opisany wyżej.

**Usunięcie przepisu wobec wpisów.** Kod trasy (`recipes/[id].ts:183`) wysyła jedno DELETE na
`recipes`. Zachowanie wpisów zapewnia wyłącznie FK w bazie. Jest go nie widzi. Dowód na prawdziwej
bazie to SQL (wykluczony w §7) albo e2e (Playwright poza zakresem tej fazy). W Jest da się dowieść
tylko konsekwencji po stronie aplikacji: że wpis-sierota (`source_recipe_id = null`, `portions` i
`calories` ustawione) czyta się i sumuje bez zmian. `getEntriesForDay` nie łączy się z `recipes`
(`diary.service.ts:63-69`). Gałąź sieroty w trasie wyceny ma już testy w
`tests/unit/diary-estimate-route.test.ts`.

### #6 — inwentarz twardych limitów (walidacja ↔ baza ↔ UI)

| Pole | Trasa (serwer) | Baza | UI | Wynik ponad limit dziś |
|---|---|---|---|---|
| Wpis `content` | trim, 1–500 (`create-entry.ts:66-70`), także PATCH (`update-entry.ts:47`) | `char_length(content) <= 500` (`create_diary_entries.sql:33`) | `maxLength={500}` + licznik (`DiaryEntryForm.tsx:348-354`, `DiaryEntryEditModal.tsx:303`) | 400 |
| Wpis `amount_text` | trim, ≤100, `""`→null (`create-entry.ts:73-78`) | `varchar(100)` (`:35`) | `maxLength={100}` (`DiaryEntryForm.tsx:384`, `DiaryEntryEditModal.tsx:320`) | 400 |
| `calories` (POST/PATCH) | int 0–5000 (`create-entry.ts:35-39`) | `calories >= 0`, int4 (`:39`) — sufitu 5000 baza nie zna | `parseCalories` `/^[0-9]{1,5}$/` (`src/lib/utils/diary-calories.ts:17`) + ten sam schemat | 400 |
| `calories` z wyceny | iloczyn obcinany do 0–5000, poza zakresem → brak wartości (`estimate.ts:16-17,124-126`) | jw. | — | 200 bez wartości |
| `portions` | >0, ≤99, ≤2 miejsca po przecinku (`create-entry.ts:59-63`) | `numeric(6,2)`, `> 0` (`:34`) — sufitu 99 baza nie zna | `parsePortions` `/^[0-9]+([.,][0-9]+)?$/` (`diary-portions.ts:49`) | 400 |
| `entry_date` | `RRRR-MM-DD` + dzień istnieje (`create-entry.ts:11-25`); **brak reguły przyszłości** | `date` | `useSelectedDay` (`src/hooks/diary/useSelectedDay.ts:65-67`), `max={today}` + JS (`DiaryEntryEditModal.tsx:172-174,333`) | przyszła data: **201/200** (luka zaakceptowana) |
| Identyfikator wpisu | `^\d+$`, `Number.isSafeInteger` (`update-entry.ts:18-22`) | `serial` = int4 | — | >2147483647: przypuszczalnie **500** (niezweryfikowane) |
| `source_recipe_id` | int > 0, bez sufitu (`create-entry.ts:98-103`) | int4 FK | — | jw., przypuszczalnie 500 |
| Cel `daily_calorie_goal` | int 500–10000 lub null (`update-goal.ts:8-12,20-22`) | `between 500 and 10000` (`create_user_settings.sql:27-28`) | regex `/^\d+(?:[.,]\d+)?$/` + ten sam schemat (`DailyGoalCard.tsx:29-33`) | 400 |
| `search` (przepisy) | ≤200, bez NUL (`list-recipes.ts:15-19`); `limit` 1–50 | — (PostgREST 414 / PG 22021 przed poprawką) | brak `maxLength` (`HomePage.tsx:199-206`); w dzienniku min 2 znaki (`useRecipeSearch.ts:11`) | 400 |
| Preferencja `value` | POST: `min(0).max(50)` (**pusty napis przechodzi**), PUT: `min(1).max(50)` — inline, `.parse()` (`preferences/index.ts:6-9`, `[id].ts:6-9`) | `varchar(50)`, `char_length <= 50`, unikat `(user_id, category, value)` (`healthymeal_schema.sql:34,38`) | `z.string().min(1).max(50)` bez trim, `maxLength={50}` (`ProfilePage.tsx:20-23,271`); edycja trimuje (`PreferenceChip.tsx:93-105`) | **500** z JSON-em `ZodError` w `error` |
| Preferencja — duplikat | brak sprawdzenia | `unique` (`:38`) | brak | **500** z treścią błędu Postgresa |
| Preferencje — liczba | `count >= 50` → 400 (`index.ts:116-130`), sprawdzane przed insertem, nieatomowo | brak | `total >= 50` (`ProfilePage.tsx:93-95`) | 400 (wyścig może dać 51 — spekulatywne) |
| Preferencje GET `limit` | `max(50)` przez `.parse()` (`index.ts:14,40`) | — | hook nie wysyła `limit` (`usePreferences.ts:37-39`) | `limit=51` → **500** |
| Przepis `title` | POST/PUT `/api/recipes`: tylko `min(1)` (`recipes/index.ts:11`, `[id].ts:9`); `save-recipe`: ≤100 (`save-recipe.ts:11`) | `varchar(255)` (`healthymeal_schema.sql:45`) | ≤100 + licznik (`RecipeFormModal.tsx:10-23,204`) | 101–255: 201 przez `/api/recipes`; >255: **500** z `details` |
| Przepis `content` | POST/PUT: tylko `min(1)`; `save-recipe`: ≤5000 | `char_length(content) <= 5000` (`:46`) | ≤5000 (`RecipeFormModal.tsx:231`) | >5000 przez `/api/recipes`: **500** z `details` |
| Przepis `additional_params` | POST/PUT: bez limitu; `save-recipe`: ≤5000 | `char_length <= 5000` (`:47`) | ≤5000 (`RecipeFormModal.tsx:258`) | jw., **500** |
| Ciało nie-JSON | dziennik, cel, `save-recipe`: `.catch(() => null)` → 400 | — | — | `/api/recipes` POST/PUT (`index.ts:123`, `[id].ts:98`), `/api/preferences` POST/PUT, `/api/ai/modify-recipe` (`modify-recipe.ts:33`): **500** |
| AI `additional_params` / `base_recipe` | `modify-recipe`: bez sufitu (`modify-recipe.ts:11-14`); `generate-recipe`: grep `max(`/`min(` bez trafień | brak (trafia do promptu, nie do tabeli) | `AIModal.tsx:73-96` (5000/100/5000) | bez limitu na serwerze (koszt promptu — `known-drift.md`, „Trasy AI”) |

Uwagi do inwentarza:

- **Unicode.** Zod 4 `.max(n)` liczy znaki jak `char_length` w Postgresie. Sprawdzone lokalnie:
  26 emoji przechodzi `z.string().max(50)`. Przeglądarkowy `maxLength` liczy jednostki UTF-16, więc
  jest surowszy. Rozjazdu, który dawałby 500, tu nie ma.
- **`Infinity`.** `z.number()` w Zod 4 odrzuca `Infinity` (sprawdzone lokalnie). `1e400` w JSON-ie
  daje więc 400.
- **`1e3`.** `JSON.parse('{"c":1e3}').c === 1000`. Na granicy API `1e3` to zwykła liczba 1000:
  dla kalorii poprawna, dla celu też, a dla porcji odrzucona przez sufit 99. Guidance „`1e3` → 400”
  nie ma na serwerze sensu. Ochronę dają parsery UI: `parseCalories` (`diary-calories.ts:12-18`),
  `parsePortions` (`diary-portions.ts:44-50`) i regex w `DailyGoalCard.tsx:29`. Przypięty jest tylko
  ostatni (`tests/unit/DailyGoalCard.test.tsx:42`). `parseCalories` i `parsePortions` nie mają
  w `tests/unit/` żadnego testu: grep `parseCalories|parsePortions` nie trafia, a
  `diary-portions.test.ts` testuje tylko `formatPortions`.
- **„Klient blokuje, więc serwer też”.** Ta teza jest fałszywa dla czterech reguł UI:
  - przyszła data — luka zaakceptowana;
  - tytuł ≤100 — serwer `/api/recipes` przyjmuje do 255, a powyżej daje 500;
  - treść przepisu i `additional_params` ≤5000 — serwer `/api/recipes` daje 500;
  - minimalna długość frazy w dzienniku (2 znaki) — nieszkodliwe, serwer przyjmuje każdą.

  Reguła odwrotna: UI preferencji ma `min(1)`, serwer POST `min(0)`. Pusta preferencja zapisuje się
  więc przez API i trafia do promptu (`ai.service.ts:536`).
- **Zepsuty widok.** `usePreferences` pokazuje `error.error` z odpowiedzi (`usePreferences.ts:80-81`).
  Przy 500 z `ZodError` użytkownik dostałby w toaście surowy JSON. Przez UI tak się nie stanie
  (klient ma `max(50)`), ale tak, gdy POST ominie klienta albo przy duplikacie: UI duplikatów nie
  sprawdza, więc komunikat Postgresa o unikacie dojdzie do toastu.
- **Reguła z `AGENTS.md`.** Trasy preferencji łamią twardą regułę „Validation errors leave every API
  route through `zodIssues` / `zodMessage`”. Są wymienione w `docs/reference/known-drift.md`
  (inline schematy), ale wpis nie wspomina, że to 500, nie 400.

**Istniejące testy dla #6.** Granice schematów są pokryte:

- `tests/unit/diary-validations.test.ts`: content 500/501 (:98-106), amount_text 101 (:140),
  calories 0/5000/ujemne/ponad sufit (:148-162), portions 0/99/99,01/trzy miejsca (:208-233),
  daty (:52-81);
- `tests/unit/user-settings-validations.test.ts:15-29` — 499/500/10000/10001;
- `tests/unit/recipes-route.test.ts:91-104` — fraza 201 i NUL → 400, 200 → 200, **na poziomie trasy**.

Brakuje:

- granic na poziomie tras dziennika i celu — jest po jednym ogólnym przypadku 400
  (`diary-entry-route.test.ts:103`, `user-settings-route.test.ts:113`);
- jakiegokolwiek testu tras preferencji i POST/PUT `/api/recipes`;
- testów parserów UI;
- testu „limit+1 nie dociera do bazy” (insert nie wywołany).

**Najtańsza warstwa dla #6.** Potwierdzona: unit (schematy i parsery) + integracja trasy.
Wyrocznię granic bazy bierze się z literałów migracji (500, 100, `numeric(6,2)`, 500–10000, 50, 255,
5000), nie ze schematu Zod. Asercja: na granicy 201/200, o krok dalej 400 + `zodIssues`, a insert
lub update w atrapie nie wywołany. Tam, gdzie dziś wychodzi 500 (preferencje, `/api/recipes`, ciało
nie-JSON), przypadek jest defektem. Konwencja poprzednich faz to `test.failing` z wyrocznią 400 plus
wpis w `known-drift.md` (§6.1). Decyzję „przypiąć czy naprawić” podejmuje plan.

### Ocena dowodów z hot-spotów

- `src/lib/validations` (14 zmian/30d) — **trafny sygnał, ale w złym miejscu**. Churn dotyczy
  schematów dziennika, celu i wyszukiwania, które mają granice i testy. Defekty 500 leżą w trasach,
  które do `src/lib/validations` nigdy nie trafiły (preferencje, `/api/recipes` POST/PUT).
- `docs/reference/known-drift.md` (trasy preferencji sprzed konwencji) — **potwierdzony**. To
  najmocniejszy sygnał dla obu ryzyk.
- Archiwum `2026-09-23-manual-diary-entry` — potwierdzone, ale „data z przyszłości” to świadoma
  decyzja, a `1e3` było problemem klienta (naprawionym w kliencie).
- Archiwum `2026-10-02-recipe-search-escape` — zamknięte i przetestowane na poziomie trasy. Dla
  tej fazy to głównie wzorzec do skopiowania.
- Ryzyko #5 „High impact / Low likelihood” — ocena **utrzymana**. Brak ścieżki zapisu z dziennika
  lub celu do preferencji i przepisów. Prawdopodobieństwo opiera się na regresji, nie na dzisiejszym
  defekcie. Jedyny punkt z realnym promieniem rażenia to filtr DELETE preferencji.

## Code References

- `src/pages/api/preferences/index.ts:6-9,40,106-109,116-130,154-166` — inline schemat, `.parse()`, limit 50, 500 z `error.message`
- `src/pages/api/preferences/[id].ts:6-9,29,38,112,121-135` — PUT/DELETE, `parseInt`, filtr DELETE
- `src/pages/api/recipes/index.ts:10-15,123,146,154-164` — POST bez `max`, `request.json()` bez catch, 500 z `details`
- `src/pages/api/recipes/[id].ts:8-12,98,183` — PUT bez `max`; DELETE jednym zapytaniem
- `src/pages/api/ai/save-recipe.ts:9-30` — jedyna trasa przepisów z limitami 100/5000/5000
- `src/lib/services/user-settings.service.ts:47-62` — upsert celu, jedna tabela
- `src/lib/services/diary.service.ts:88-127,144-165,293-380,392-405` — zapisy dziennika; odczyt przepisu
- `src/lib/validations/diary/create-entry.ts:22-78` — data, kalorie, porcje, treść, ilość
- `src/lib/validations/diary/update-entry.ts:18-22` — `entryIdSchema` (safe integer, nie int4)
- `src/lib/validations/user-settings/update-goal.ts:8-22` — cel 500–10000
- `src/lib/validations/recipe/list-recipes.ts:10-26` — `search` ≤200 bez NUL, `limit` 1–50
- `supabase/migrations/20250427130913_healthymeal_schema.sql:30-50` — limity preferencji i przepisów
- `supabase/migrations/20260922140906_create_diary_entries.sql:32-39` — limity wpisu, FK `set null`
- `supabase/migrations/20260930074331_create_user_settings.sql:27-28` — CHECK celu
- `src/lib/utils/diary-calories.ts:12-18`, `src/lib/utils/diary-portions.ts:44-50`, `src/components/profile/DailyGoalCard.tsx:25-38` — parsery UI (`1e3`)
- `src/hooks/diary/useSelectedDay.ts:65-67`, `src/components/diary/DiaryEntryEditModal.tsx:172-174` — blokada przyszłej daty tylko w kliencie
- `src/hooks/profile/usePreferences.ts:79-81,152-166` — wyświetlanie `error.error`, lokalne zdjęcie usuniętej preferencji

## Architecture Insights

- Konwencja „parse → serwis → odpowiedź z `zodIssues`” obejmuje dziennik i cel. Trasy sprzed
  konwencji (preferencje, `/api/recipes` POST/PUT) obsługują walidację po staremu. Granica ryzyka #6
  pokrywa się dokładnie z granicą `known-drift.md` „Validation”.
- Górne sufity kalorii (5000) i porcji (99) to decyzje produktowe tylko w Zod. Baza pilnuje dolnych
  granic i precyzji. Ominięcie Zod (np. nowa trasa bez schematu) nie skończy się 500, tylko zapisze
  wartość spoza produktu. Test schematu jest tu jedyną bramką.
- Atrapa Supabase w Jest widzi kod, nie bazę. Każda gwarancja oparta na FK, CHECK albo RLS wymaga
  innej warstwy niż ta faza.

## Historical Context (from prior changes)

| Twierdzenie historyczne | Werdykt |
|---|---|
| Przyszła data blokowana tylko w przeglądarce, świadomie, żeby nie rozstrzygać strefy czasowej na serwerze (`context/archive/2026-09-23-manual-diary-entry/plan-brief.md:89-93`, `reviews/impl-review.md:37-40`; dla PATCH `2026-09-29-edit-and-delete-entry/plan-brief.md:60,96`) | wspiera: `entryDateSchema` nie ma reguły przyszłości (`create-entry.ts:22-25`) |
| Sufit kalorii obniżony ze 100000 do 5000 (`2026-09-23-manual-diary-entry/reviews/plan-review.md:152-166`) | wspiera (`create-entry.ts:39`) |
| `1e3` naprawione w kliencie (`2026-09-23-manual-diary-entry/reviews/impl-review.md:199-213`; `2026-09-30-daily-goal-and-progress/reviews/impl-review.md:120-133`) | wspiera, ale test ma tylko `DailyGoalCard` |
| Fraza wyszukiwania ≤200, bez NUL, przetestowana (`2026-10-02-recipe-search-escape/reviews/impl-review.md:26-34`) | wspiera (`list-recipes.ts:15-19`; `recipes-route.test.ts:91-104`) |
| Cel w osobnej tabeli, preferencje nietknięte (`2026-09-30-daily-goal-and-progress/plan-brief.md:34-35`) | wspiera (`user-settings.service.ts:48-55`) |
| FK `on delete set null` zostawia minione dni bez zmian (`2026-09-22-diary-entry-store/plan.md:220,236-238`) | wspiera na poziomie migracji; zachowanie bazy niesprawdzone w tej fazie |
| PUT preferencji z błędnym ciałem → 500 z treścią `ZodError` (`2026-10-05-testing-session-and-access-boundaries/research.md:260-263`) | wspiera i rozszerza: to samo dla POST, GET (`limit`) i duplikatu |
| 500 odbija `Error.message` w trasach sprzed konwencji (`2026-09-23-manual-diary-entry/reviews/impl-review.md:41-43`) | częściowo: `/api/recipes` i preferencje tak, PATCH/DELETE wpisu już nie (`src/pages/api/diary-entries/[id].ts:94-102`), choć GET/POST wpisów nadal tak (`src/pages/api/diary-entries/index.ts:115-122`) |

## Related Research

- `context/archive/2026-10-05-testing-session-and-access-boundaries/research.md` — wzorzec stanowej atrapy (§6.3), PUT preferencji
- `context/archive/2026-10-05-testing-diary-value-integrity/research.md` — kontrakt błędów tras, `1e3` w odpowiedzi modelu

## Open Questions

1. **Przypiąć czy naprawić?** Chodzi o 500 zamiast 400 dla preferencji (`.parse()`, duplikat, GET
   `limit`) i dla `/api/recipes` POST/PUT (brak `max`, ciało nie-JSON). Poprzednie fazy przypinały
   defekty `test.failing`. Tu naprawa jest mała (`safeParse` + `zodIssues`, `.max()` z literałów
   migracji), a PRD (FR-014 „exactly as before”) nie wymaga zachowania 500. Decyzja należy do planu
   albo do użytkownika.
2. **Przyszła data.** Utrzymać zaakceptowaną lukę — test przypina 201 dla jutra i opisuje lukę
   w `known-drift.md` — czy zmienić decyzję? Wyrocznia 400 wymagałaby reguły strefy czasowej na
   serwerze, którą archiwum świadomie odrzuciło.
3. **Identyfikator > int4.** Do weryfikacji, czy PostgREST faktycznie zwraca błąd (22003) dla
   `eq("id", 3000000000)` na kolumnie `serial`. Wniosek „500” jest dziś wnioskowaniem, nie obserwacją.
   Jeśli to prawda, `entryIdSchema` potrzebuje sufitu 2147483647. Dotyczy też `source_recipe_id`
   i `parseInt` w trasach przepisów i preferencji.
4. **Tytuł przepisu: 100 czy 255?** UI i `save-recipe` mówią 100, baza 255, a `/api/recipes` nic.
   Która liczba jest wyrocznią dla serwera, zdecyduje plan. Literał bazy (255) chroni przed 500,
   literał UI (100) zrównuje ścieżki.
5. **Pusta preferencja** (`min(0)` w POST). Czy to defekt do przypięcia? PRD milczy. UI wymaga
   `min(1)`, a PUT też `min(1)`.
