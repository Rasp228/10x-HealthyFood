---
title: "10x-HealthyFood — agregat-strażnik wartości wpisu dziennika"
created: 2026-10-26
type: refactor-plan
---

# Agregat-strażnik: wartość wpisu dziennika

To jest plan refaktoru. Nie zmienia kodu produkcyjnego, a zmiana ma przejść przez `/10x-plan` → `/10x-implement`
(fazy test-first przez `/10x-tdd`). Terminy pochodzą z `context/domain/glossary.md`. Identyfikatory `N-`,
`R-` i `Q-` odsyłają do `context/domain/01-domain-distillation.md`. Każdy cytat `plik:linia` sprawdziłem w tej
sesji. Decyzje właściciela z 2026-10-26 (Q-00, Q-01, Q-02, Q-09, Q-10) są już wpisane w projekt i fazy.

## Krok 0: kontekst

| Źródło | Co z niego wynika |
| --- | --- |
| `context/foundation/prd.md:216-222` | „Rule added by this module”: dla każdego **wpisu dziennika** moduł ustala **wartość kaloryczną** z najlepszego dostępnego źródła (kaskada) i skaluje ją do **liczby porcji**. Każdy krok można nadpisać ręcznie. |
| `prd.md:138-142` (FR-004, FR-005) | Ręczna liczba zawsze wygrywa. **Przeliczenie** zachodzi tylko na jawne żądanie i nigdy nie dzieje się automatycznie. |
| `prd.md:155-160` (FR-009, FR-010) | `recipe_nutrition` wolno wziąć tylko z bloku, który deklaruje porcję. W przeciwnym razie wycena idzie z treści przepisu. |
| `prd.md:204-208` | Każda wyświetlona wartość niesie **pochodzenie**. Wartość, której nie ustalono w ciągu minuty, jest „niepoliczona”. |
| `prd.md:85` | Guardrail: moduł działa także wtedy, gdy AI zwróci „something implausible”. Ręczna liczba jest zawsze możliwa. |
| `prd.md:238` | Load-bearing non-goal: baza produktów nie istnieje. Kaskada jest **jedynym** źródłem liczb. |

**Stack i warstwy logiki:** Astro 7 SSR z wyspami React 19, Supabase (Postgres, RLS), Zod 4 i Jest 30
(`AGENTS.md`). Logika wartości wpisu leży w pięciu warstwach. Nie ma osobnej warstwy domeny: poza
wygenerowanymi `Tables<…>` (`src/types.ts:17`) nie istnieją żadne typy encji.

| Warstwa | Pliki, w których żyje reguła wartości |
| --- | --- |
| Persystencja | `supabase/migrations/20260922140906_create_diary_entries.sql` |
| Walidacja | `src/lib/validations/diary/create-entry.ts`, `update-entry.ts` |
| Serwis | `src/lib/services/diary.service.ts`, `src/lib/services/calorie-estimation.service.ts` |
| API (trasa) | `src/pages/api/diary-entries/[id]/estimate.ts`, `[id].ts`, `index.ts` |
| Czyste utils | `src/lib/utils/recipe-nutrition.ts`, `src/lib/utils/diary-estimation.ts` |
| UI | `src/components/diary/DiaryEntryForm.tsx`, `src/hooks/diary/useCalorieEstimation.ts` |

## Krok 1: niezmienniki biznesowe

| ID | Niezmiennik | Źródło |
| --- | --- | --- |
| N-01 | Wartość i jej pochodzenie występują razem albo wcale. | `prd.md:207`; CHECK w migracji `:54-55` |
| N-02 | Wyzerowanie wartości zeruje **znacznik zlecenia wyceny** w tym samym zapisie. Zmiana opisu lub ilości wpisu bez wartości unieważnia zlecenie, które trwa. | komentarz migracji `:49-53`; `diary.service.ts:298-299,384-386` |
| N-03 | Pochodzenie ustala wyłącznie serwer i odpowiada temu krokowi kaskady, który faktycznie policzył liczbę. | `prd.md:207`; `create-entry.ts:84-86`; `estimate.ts:109-110` |
| N-04 | Ręczna wartość wygrywa z AI, AI nigdy nie nadpisuje wartości, a zapisuje tylko najnowsze zlecenie. | `prd.md:138-142`; `diary.service.ts:225-233` |
| N-06 | Wartość wpisu mieści się w przedziale 0–5000 kcal, także po przemnożeniu przez porcje. | `create-entry.ts:33-34` („decyzja produktowa”). **Q-01: górna granica to próg formularza i wiarygodności źródła, nie reguła domeny.** |
| N-09 | Przeliczenie zachodzi tylko na jawne żądanie. | `prd.md:141` |
| N-05 | Wpis z przepisu ma `portions` i nie ma `amount_text`, a wpis opisowy odwrotnie. | `prd.md:132`. **Q-02: sierota (porcje bez przepisu) jest legalnym, celowym stanem.** |
| N-08 | Usunięcie przepisu nie zmienia wpisu ani sum przeszłych dni. | `prd.md:119,195` |
| N-10 | `recipe_nutrition` powstaje tylko z bloku, który deklaruje **jedną** porcję. | `prd.md:155-157` |
| N-11 | Wpis nie dotyczy przyszłego dnia. | tylko UI (`known-drift.md`, „Wpisy dziennika”) |
| N-12 | Wycena nie startuje drugi raz dla zlecenia, które już trwa. | `known-drift.md:54-78`. **Q-09: serwer nie odrzuca drugiego zlecenia.** |
| N-20 | Suma dnia z brakującymi wartościami mówi, ilu wartości brakuje. | `prd.md:164-165,208` |
| N-30/31 | Użytkownik ma najwyżej jeden cel, w przedziale 500–10000 albo `null`. | migracja `20260930074331…sql:24,27-28` |

## Krok 2: klasyfikacja i wybór

Oś (a) mówi, jak rdzeniowy jest niezmiennik (S-A „Kaskada” i S-B „Wpis + suma dnia” to Core). Oś (b) liczy
warstwy i pliki, w których żyje reguła. Oś (c) mówi, czy reguła jest **egzekwowana** (każda ścieżka, zwykle
baza), tylko **deklarowana** (część ścieżek, dyscyplina, komentarz), czy **naruszalna** (kod przeczy regule
albo da się ją złamać z API).

| Niezmiennik | (a) rdzeń | (b) rozsmarowanie | (c) egzekucja |
| --- | --- | --- | --- |
| N-01 para wartość–pochodzenie | Core | 1 warstwa (DB) | egzekwowany |
| **N-02 cykl życia znacznika** | **Core** | **1 plik, 3 ręczne gałęzie + komentarz, który przeczy kodowi** | **deklarowany** |
| **N-03 pochodzenie = krok kaskady** | **Core** | **2 pliki, 5 miejsc decyzji, 3 warstwy (Zod, serwis, trasa)** | **deklarowany** (trzyma się dyscypliną, bez jednego właściciela) |
| N-04 ręczna wygrywa, najnowsze zlecenie | Core | 1 plik (warunkowy UPDATE) | egzekwowany |
| N-06 zakres 0–5000 | Supporting (UX, Q-01) | 4 kopie stałej w 4 plikach, DB pilnuje tylko `>= 0` | deklarowany (2 komentarze kłamią). Do scalenia przy sprzątaniu, poza agregatem. |
| N-09 przeliczenie tylko jawnie | Core | 1 plik | egzekwowany |
| N-05 kształt ilości | Core | 3 warstwy (Zod, serwis, `?? 1` w trasie) | deklarowany. Po Q-02 sierota jest legalna, więc kształt wchodzi do agregatu z jawnym stanem sieroty. |
| N-10 blok na jedną porcję | Core | 1 funkcja | naruszalny, ale naprawa to jeden predykat, nie agregat. **Faza 1 tego planu (Q-00).** |
| N-11 przyszła data | Core | tylko UI | naruszalny. Czeka na Q-03 (czyje „dzisiaj”), poza tym planem. |
| N-12 bramka świeżości | Supporting (koszt) | 1 klient, serwer nie pilnuje | świadomie tylko klient (D6, Q-09) |
| N-20, N-30/31 | Core / Supporting | 1 funkcja / DB + Zod | egzekwowane |

### Wybór #1: „Wartość wpisu ma jeden cykl życia”

> Wartość kaloryczna wpisu dziennika pochodzi z **dokładnie jednego** kroku kaskady i nosi jego pochodzenie.
> Zmienia się wyłącznie przez nazwane przejścia: wartość z przepisu, ręczna wartość, wyczyszczenie,
> przeliczenie, zlecenie wyceny i wynik wyceny. Każde przejście, które unieważnia wartość albo opis posiłku,
> unieważnia też trwające zlecenie wyceny.

Ten niezmiennik zbiera N-02 i N-03, a jego obrzeża stanowią N-04, N-05 (kształt ilości razem z sierotą)
i N-09. Górna granica 5000 kcal (N-06) nie należy do niego (Q-01). Zostaje progiem formularza i progiem
wiarygodności źródła w kaskadzie. Jej cztery kopie scala jednak ten sam plan, bo przepięcie i tak dotyka
wszystkich czterech plików. Wybieram ten niezmiennik z trzech powodów:

1. **Jest najbardziej rdzeniowy.** To jedyna reguła, którą PRD dopisuje do systemu (`prd.md:216`). Bez niej
   moduł staje się zwykłym licznikiem, bo bazy produktów nie ma (`prd.md:238`).
2. **Jest najsłabiej egzekwowany spośród reguł Core, które da się naprawić bez dalszych decyzji.**
   N-02 trzyma się na tym, że trzy gałęzie `updateEntry` pamiętają o zerowaniu znacznika. Baza tego nie
   pilnuje, a komentarz w `diary-estimation.ts:5` twierdzi, że „znacznik nigdy nie jest zerowany”. N-03
   rozstrzyga się w pięciu miejscach w dwóch plikach. Każda nowa ścieżka (nowe źródło, płatny model) musi
   dziś powtórzyć tę dyscyplinę w kilku plikach naraz.
3. **Pozostali kandydaci odpadają z konkretnych powodów.** N-10 jest bardziej „płonący”, ale lokalny: jeden
   predykat, bez agregatu. Wchodzi do tego planu jako faza 1 (Q-00), przed budową agregatu. N-11 czeka na Q-03.

## Krok 3: diagnoza

### Gdzie dziś żyje reguła

| # | Miejsce | Co robi z regułą |
| --- | --- | --- |
| 1 | `diary.service.ts:97-110` (`createEntry`) | Decyzje o pochodzeniu nr 1 i 2: `"manual"` (`:98`) i `"recipe_nutrition"` (`:108`). Kaskada przy zapisie. |
| 2 | `diary.service.ts:194-220` (`markEstimationRequested`) | Stempluje znacznik warunkowo (`.is("calories", null)`, `:205`). Przy braku trafienia zwraca wiersz z wartością **bez rozróżnienia przyczyny**, więc „wpis ma już wartość” jest dla wołającego zwykłym wynikiem. |
| 3 | `diary.service.ts:247-281` (`applyEstimate`) | N-04 przez warunkowy UPDATE (`:267-268`). Odcięcie przestarzałego zlecenia **nie jest nazwane**: metoda oddaje bieżący wiersz (`:280`), a trasa musi się domyślić, że wycena przepadła. |
| 4 | `diary.service.ts:334-382` (`updateEntry`) | Cztery gałęzie wartości. Decyzje o pochodzeniu nr 3 i 4 (`"recipe_nutrition"` `:362`, `"manual"` `:381`). Zerowanie znacznika ręcznie w `:337` i `:378`. |
| 5 | `diary.service.ts:387-392` | Piąta, osobna reguła N-02: zmiana opisu lub ilości wpisu bez wartości zeruje znacznik. Opiera się na `current.calories` odczytanym w `:311`, czyli przed zapisem. |
| 6 | `diary.service.ts:311-324,396-402` | Najpierw odczyt, potem **bezwarunkowy** UPDATE (`.eq("id")`, `.eq("user_id")`). Decyzje z `:317-392` zapadają na kopii, która mogła się zestarzeć. Dopiero kolejny zapis usuwa skutki wyścigu z `applyEstimate`. |
| 7 | `estimate.ts:13-19` | Kopia nr 1 granic 0–5000 z komentarzem „te same, co… w checku migracji”. To nieprawda: migracja `:39` ma tylko `>= 0`. |
| 8 | `estimate.ts:85-87` | Bramka „wpis z wartością nie idzie do modelu”. To precondition reguły, a mieszka w trasie. |
| 9 | `estimate.ts:93-105` | Wybór gałęzi kaskady przez **wyjątek jako sterowanie**: `RecipeNotFoundError` połknięty i zamieniony na gałąź opisową. |
| 10 | `estimate.ts:111` | Decyzja o pochodzeniu nr 5 (`ai_from_description` / `ai_from_recipe`). Biznes w trasie, wbrew `AGENTS.md` („Business logic belongs in services”). |
| 11 | `estimate.ts:125` | Reguła sieroty: porcje idą do modelu jako ilość. |
| 12 | `estimate.ts:141-145` | Druga kopia mnożenia `perPortion * portions` i bramki zakresu (pierwsza to `recipe-nutrition.ts:243-246`). `?? 1` **cicho podstawia** jedną porcję zamiast zatrzymać operację na wierszu z przepisem bez porcji. |
| 13 | `estimate.ts:221-227` | Odcięta wycena rozpoznana **po skutku** (`updated.calories !== estimate`), zalogowana, a trasa i tak oddaje 200. |
| 14 | `recipe-nutrition.ts:71-72,243-246` | Kopia nr 2 granic i pierwsza kopia skalowania. |
| 15 | `create-entry.ts:36-40` | Kopia nr 3 granic (`.max(5000)`). Komentarz `:33-34`: „decyzja produktowa”. |
| 16 | `calorie-estimation.service.ts:14-16,272` | Kopia nr 4 granic, znowu z komentarzem „te same, co… w checku migracji”. |
| 17 | migracja `:49-53` | Mówi wprost: „tej połowy pilnuje route, nie baza”. Dziś jednak nie pilnuje jej trasa, tylko serwis. |
| 18 | `diary-estimation.ts:3-7` | Komentarz „Znacznik w bazie nigdy nie jest zerowany” **przeczy** pozycjom 4 i 5. |
| 19 | `DiaryEntryForm.tsx:264-269` | Podgląd liczy kaskadę (`resolveRecipeCalories`) w przeglądarce i na tej podstawie ukrywa wycenę (`recipeAlreadyCounted`). |
| 20 | `useCalorieEstimation.ts:180` | Deduplikacja wycen tylko w kolejce przeglądarki (N-12). Zostaje tak świadomie (Q-09). |

### Kto egzekwuje, a kto nie

- **Baza** pilnuje tylko N-01 (`:54-55`) i dolnej granicy `>= 0` (`:39`). Nie pilnuje N-02, więc zapis spoza
  API (SQL, przyszły skrypt) go złamie. Brak CHECK dla górnej granicy jest po Q-01 zgodny z zamierzeniem.
  Brak CHECK dla pary `portions`↔`source_recipe_id` po Q-02 także.
- **Egzekucja jest niespójna** w dwóch miejscach. Skalowanie i zakres istnieją w dwóch kopiach (poz. 12 i 14).
  Pochodzenie ustalają dwa pliki w różnych warstwach (poz. 1, 4 i 10). Tylko N-02 ma pięć osobnych miejsc
  zerowania lub niezerowania (`:337`, `:378`, `:381` celowo bez zerowania, `:391`, `createEntry` bez stempla).
- **Klient jest jedynym strażnikiem** deduplikacji wycen (poz. 20, N-12), z wyboru (Q-09). Przy wartości
  z przepisu UI nie jest jedynym strażnikiem, bo serwer liczy ją ponownie (poz. 1). Podgląd (poz. 19) to tylko
  konsument.
- **Błędy są połykane zamiast zatrzymywać operację** w czterech miejscach:
  - `?? 1` (poz. 12) daje wpisowi z przepisu bez porcji wartość „za jedną porcję” zamiast zatrzymać operację;
  - `RecipeNotFoundError` jako sterowanie (poz. 9, a w `updateEntry` także `:343-351`);
  - odcięta wycena dostaje 200 i linię logu, ale nie ma nazwanego wyniku (poz. 3 i 13);
  - zlecenie wyceny wpisu, który ma wartość, kończy się cichym 200 (poz. 2 i 8).

  Dwa ostatnie to legalne wyniki wyścigu, a nie błędy użytkownika. Mimo to powinny być **nazwanymi wynikami
  domeny**, a nie wnioskiem wyciąganym z porównania pól.

## Krok 4: projekt agregatu-strażnika

### Granica agregatu

**Root: `DiaryEntry` (Wpis dziennika).** Agregat rozpinam na wpisie, a nie na samej wartości, bo przejścia
wartości zależą od opisu, ilości, porcji i przepisu źródłowego (N-02 reaguje na zmianę opisu, N-05 na kształt
ilości). Wewnątrz:

- **`CalorieValue`** (value object, „Wartość kaloryczna” + „Pochodzenie wartości”): `{ kcal, origin }`. Nie da
  się go zbudować bez pochodzenia ani z liczby ujemnej lub niecałkowitej (to samo, co pilnuje baza, `:39`).
  **Nie zna górnej granicy 5000** (Q-01).
- **`EstimationTicket`** („Znacznik zlecenia wyceny”): `requestedAt | null`.
- **`EntryQuantity`** (kształt ilości), trzy legalne warianty:
  - `{ kind: "recipe", portions, sourceRecipeId }`: wpis z przepisu;
  - `{ kind: "orphan", portions }`: **sierota**, wpis z porcjami po usunięciu przepisu (Q-02). Powstaje
    wyłącznie przez `on delete set null` w bazie, nigdy przez `create`. Można w niej edytować porcje i opis, a
    wycena idzie gałęzią opisową z porcjami jako ilością;
  - `{ kind: "text", amountText | null }`: wpis opisowy.
- **`CalorieCascade`** (polityka, czysta): kolejność kroków, to, który krok daje które pochodzenie, i
  skalowanie `round(perPortion × portions)`. `readPerPortionCalories` z `recipe-nutrition.ts` zostaje parserem
  bloku i jest wołany przez kaskadę.
- **Próg wiarygodności** `MAX_ENTRY_CALORIES = 5000` (Q-01): jedna stała poza agregatem, w nowym
  `src/lib/validations/diary/limits.ts` (bez Zoda, żeby mogły ją importować czyste moduły). Używają jej trzy
  miejsca: `caloriesValueSchema` (formularz i API), `CalorieCascade` (wynik parsera albo AI powyżej progu
  traktujemy jak brak wyniku z tego źródła, zgodnie z guardrailem `prd.md:85`) oraz prompt
  `CalorieEstimationService`.

Proponowane miejsce: `src/lib/domain/diary/` (nowy katalog, czysty TS, bez Supabase i Zoda, na wzór
`src/lib/utils/diary-*.ts`). Ten katalog to nowa konwencja i trzeba go wpisać do `AGENTS.md` (faza 6).

### Błędy domenowe (nazwane, fail-fast)

```ts
abstract class DiaryDomainError extends Error {}
class EntryShapeError extends DiaryDomainError        // istnieje (diary.service.ts:36); przenosi się, nazwa bez zmian
  { path: "portions" | "amount_text" }
class InvalidCalorieValueError extends DiaryDomainError      // ujemna albo niecałkowita liczba (granica bazy, nie 5000)
class ImplausibleEstimateError extends DiaryDomainError      // wynik AI ponad MAX_ENTRY_CALORIES; wpis zostaje bez wartości
class EntryAlreadyValuedError extends DiaryDomainError       // zlecenie wyceny wpisu z wartością
class EstimateSupersededError extends DiaryDomainError       // wynik dla zlecenia, które ktoś unieważnił
class ConflictingValueCommandError extends DiaryDomainError  // calories + recalculate (dziś tylko Zod, update-entry.ts:56-62)
class CorruptEntryError extends DiaryDomainError             // wiersz łamie kształt przy odtworzeniu (przepis bez porcji)
class EntryChangedConcurrentlyError extends DiaryDomainError // zapis optymistyczny nie trafił dwa razy
```

### Metody domenowe (sygnatury i pseudokod)

```ts
class DiaryEntry {
  static rehydrate(row: DiaryEntryDto): DiaryEntry
  //   source_recipe_id != null && portions == null      -> throw CorruptEntryError   (zastępuje `?? 1`)
  //   portions != null && amount_text != null           -> throw CorruptEntryError
  //   portions != null && source_recipe_id == null      -> EntryQuantity "orphan"    (legalne, Q-02)
  //   (calories == null) != (calorie_origin == null)    -> throw CorruptEntryError   (N-01 także w pamięci)

  static create(cmd: NewEntry, recipe: OwnRecipe | null): DiaryEntry
  //   shape := EntryQuantity.from(cmd)                  -> EntryShapeError        (dziś Zod superRefine)
  //                                                        // "orphan" nie powstaje z komendy
  //   if cmd.calories != null: value := CalorieValue.manual(cmd.calories)        (FR-004 wygrywa)
  //   else if shape.kind == "recipe": value := CalorieCascade.fromRecipeBlock(recipe.content, portions)
  //        // -> CalorieValue("recipe_nutrition") | Unresolved("no_declared_block" | "out_of_range")
  //   ticket := null                                    // tworzenie niczego nie zleca

  edit(changes: EntryEdit): void
  //   shape' := shape.apply(changes)                    -> EntryShapeError        (dziś diary.service.ts:317-324)
  //                                                        // porcje w "recipe" i "orphan", tekst tylko w "text"
  //   if value == null && changes.describesMeal: ticket := null                  (N-02b, dziś :387-392)

  setManualValue(kcal: number): void
  //   value := CalorieValue.manual(kcal)                -> InvalidCalorieValueError
  //   ticket bez zmian                                  // świadomie, jak dziś :292-293

  clearValue(): void
  //   value := null; ticket := null                     // N-02a w JEDNYM miejscu

  recalculate(recipe: OwnRecipe | null): void
  //   clearValue()
  //   if shape.kind == "recipe" && recipe: value := CalorieCascade.fromRecipeBlock(...) ?? null
  //   // sierota: brak przepisu, wartość zostaje pusta i czeka na wycenę

  requestEstimate(now: Instant, recipe: OwnRecipe | null): EstimationRequest
  //   if value != null                                  -> throw EntryAlreadyValuedError
  //   ticket := now                                     // bez bramki świeżości (Q-09)
  //   return CalorieCascade.estimationInput(this, recipe)
  //     // { branch: "ai_from_recipe", recipeContent, note: content, portions }               ("recipe" z przepisem)
  //     // | { branch: "ai_from_description", content, amount: formatPortions(portions) }     ("orphan" albo przepis
  //     //                                                                                     //  niedostępny)
  //     // | { branch: "ai_from_description", content, amount: amountText }                 ("text")

  applyEstimate(req: EstimationRequest, aiKcal: number): void
  //   if value != null || ticket != req.ticket          -> throw EstimateSupersededError
  //   kcal := req.branch == "ai_from_recipe" ? CalorieCascade.scale(aiKcal, req.portions) : aiKcal
  //   if kcal > MAX_ENTRY_CALORIES                      -> throw ImplausibleEstimateError  (stan bez zmian)
  //   value := CalorieValue.of(kcal, req.branch)
  //   // origin wynika z gałęzi zapisanej w żądaniu, więc nie da się nadać pochodzenia źródła, którego model nie widział
}
```

Skalowanie istnieje w jednym miejscu (`CalorieCascade.scale`). Próg wiarygodności sprawdzają dwa punkty
kaskady, oba z tą samą stałą: `fromRecipeBlock` zwraca wtedy jawnie `Unresolved("out_of_range")`, co oznacza
spadek do następnego źródła, a `applyEstimate` rzuca `ImplausibleEstimateError`. Żaden z nich nie połyka
błędu. `resolveRecipeCalories` (podgląd w formularzu) staje się cienką nakładką na `fromRecipeBlock`, więc
podgląd i serwer liczą tą samą funkcją. Ręczna liczba powyżej 5000 nie dociera do agregatu, bo odrzuca ją Zod
na granicy (Q-01). Gdyby jednak dotarła, agregat ją przyjmie, bo to nie jest reguła domeny.

### Repozytorium i atomowość

```ts
class DiaryEntryRepository {
  constructor(supabase: SupabaseClient<Database>)  // z locals.supabase, jak każdy serwis
  load(userId, entryId): Promise<DiaryEntry | null>
  loadOwnRecipe(userId, recipeId | null): Promise<OwnRecipe | null>  // RecipeNotFound -> null tylko przy edycji/wycenie
  insert(userId, entry): Promise<DiaryEntryDto>
  save(userId, entry): Promise<DiaryEntryDto>      // jeden UPDATE, warunek = strażnik zapisany w agregacie
}
```

Supabase JS nie ma transakcji, więc atomowość daje **jeden warunkowy UPDATE na przejście**. Agregat sam
zapisuje, jakiego stanu oczekuje:

| Przejście | Warunek `WHERE` (poza `id`, `user_id`) | 0 trafionych wierszy znaczy |
| --- | --- | --- |
| `edit` / `setManualValue` / `clearValue` / `recalculate` | `updated_at = <wczytane>` (wersja optymistyczna, **nowość**) | ktoś zapisał w międzyczasie. Repozytorium wczytuje wiersz ponownie i **raz** powtarza komendę. Drugi brak trafienia daje `EntryChangedConcurrentlyError` (409, Q-10). |
| `requestEstimate` | `calories IS NULL` (jak dziś `:205`) | jeden ponowny odczyt: wiersz z wartością daje `EntryAlreadyValuedError`, brak wiersza daje 404 |
| `applyEstimate` | `calories IS NULL AND estimation_requested_at = <ticket>` (jak dziś `:267-268`) | `EstimateSupersededError` |

Wszystkie pola jednego przejścia (wartość, pochodzenie, znacznik, opis, porcje) trafiają do **jednego**
`UPDATE`. Agregat wylicza cały docelowy wiersz, więc wiersz pośredni (wartość pusta, stary znacznik) nie może
powstać. Wersja optymistyczna zamyka lukę z poz. 6. Dzisiejsza decyzja o N-02b na nieaktualnej kopii
`current.calories` po tej zmianie nie może trafić do bazy.

**Alternatywa (nie polecam w tym cyklu):** funkcja Postgresa `rpc("diary_entry_apply", …)` z
`SELECT … FOR UPDATE`. To prawdziwa transakcja, ale reguła żyłaby wtedy w PL/pgSQL i w TS naraz. Potrzebna
byłaby migracja i ponowny przebieg `supabase/checks/diary-entries-rls.sql`. Plan nie potrzebuje żadnej
migracji: Q-01 i Q-02 usunęły oba powody, dla których miałaby powstać.

### Cienkie trasy

```ts
// POST /api/diary-entries/:id/estimate
const id = entryIdSchema.safeParse(params.id)                       // parse
const entry = await repo.load(user.id, id) ?? return 404
const recipe = await repo.loadOwnRecipe(user.id, entry.sourceRecipeId)   // null: brak przepisu / sierota
const req = entry.requestEstimate(now, recipe)                       // EntryAlreadyValuedError -> 200 z bieżącym wierszem
await repo.save(user.id, entry)                                      //   (kontrakt S-03..S-05 bez zmian)
const kcal = await estimation.estimate(req)                          // OpenRouterError -> 502 AI_UNAVAILABLE / AI_MISCONFIGURED
if (kcal === null) return 200 z repo.load(...)                       // „brak liczby” to nie błąd (FR-003)
entry.applyEstimate(req, kcal); await repo.save(...)                 // EstimateSupersededError -> 200 z bieżącym wierszem
                                                                     //   + logWarn("estimate.discarded_stale")
                                                                     // ImplausibleEstimateError -> 200 bez wartości
                                                                     //   + logWarn("estimate.total_out_of_range")
```

Mapowanie błędów domenowych na odpowiedź trafia do jednego helpera (`diaryErrorResponse`, obok
`src/lib/utils/validation-errors.ts`) i jest wspólne dla `index.ts`, `[id].ts` i `estimate.ts`:

| Błąd | HTTP |
| --- | --- |
| `EntryShapeError`, `ConflictingValueCommandError`, `InvalidCalorieValueError` | 400 w kształcie `ValidationIssue` (przez `domainIssues`, analogicznie do `zodIssues`) |
| `RecipeNotFoundError` (tylko tworzenie) | 404 |
| `EntryChangedConcurrentlyError` | 409 `{ error: "Wpis zmienił się w międzyczasie. Odśwież i spróbuj ponownie.", code: "ENTRY_CHANGED" }` (**nowe**, Q-10) |
| `EntryAlreadyValuedError`, `EstimateSupersededError`, `ImplausibleEstimateError` | 200 z faktycznym wierszem (kontrakt zachowany, wynik nazwany) |
| `CorruptEntryError` | 500 + `logError("diary.corrupt_entry")`, fail-fast zamiast `?? 1` |

Zod zostaje na granicy: kształt pól i górna granica 5000 dla liczby wpisanej przez użytkownika (Q-01). Reguły
względem zapisanego wiersza i cykl życia wartości przechodzą do agregatu. N-12 zostaje świadomie po stronie
klienta (Q-09: serwer nie odrzuca drugiego zlecenia).

## Krok 5: before/after, fazy i testy

### Before/after

| # | Dziś | Po refaktorze |
| --- | --- | --- |
| 1 | `createEntry` wybiera pochodzenie (`:97-110`) | `DiaryEntry.create`, a w serwisie zostaje `repo.insert` |
| 2 | `markEstimationRequested` zwraca wiersz z wartością jak sukces | `requestEstimate` rzuca `EntryAlreadyValuedError` |
| 3 | `applyEstimate` oddaje bieżący wiersz, trasa zgaduje odcięcie | `applyEstimate` rzuca `EstimateSupersededError` |
| 4 | 4 gałęzie i 2 ręczne zerowania znacznika w `updateEntry` | `setManualValue` / `clearValue` / `recalculate`; zerowanie w jednym miejscu (`clearValue`) |
| 5 | N-02b na nieaktualnej kopii (`:387-392`) | wewnątrz `edit()`, zapis z warunkiem wersji |
| 6 | odczyt i bezwarunkowy UPDATE | `save()` z warunkiem `updated_at`, jedna powtórka, potem 409 „Wpis zmienił się” |
| 7, 14, 15, 16 | 4 kopie `5000`, dwie z fałszywym „jak w checku migracji” | jedna `MAX_ENTRY_CALORIES` w `validations/diary/limits.ts`, opisana jako próg formularza i wiarygodności, nie reguła domeny. Fałszywe komentarze usunięte. |
| 8 | bramka w trasie | precondition `requestEstimate` |
| 9 | wyjątek jako sterowanie | `loadOwnRecipe` zwraca `null`, kaskada wybiera gałąź jawnie |
| 10 | pochodzenie w trasie | `EstimationRequest.branch` z agregatu |
| 11 | sierota obsłużona w trasie, nazwana tylko w komentarzu | `EntryQuantity "orphan"`: jawny, legalny stan; `CalorieCascade.estimationInput` |
| 12 | druga kopia mnożenia i `?? 1` | jedno `CalorieCascade.scale`; `rehydrate` rzuca `CorruptEntryError` dla przepisu bez porcji |
| 13 | `discarded` wyliczane z pól | `catch (EstimateSupersededError)` |
| 17 | komentarz migracji „pilnuje route” | starej migracji nie edytujemy. Prawdę mówi wpis `DiaryEntry` w `contract-surfaces.md`. |
| 18 | `diary-estimation.ts:5` kłamie | komentarz poprawiony |
| 19 | podgląd woła `resolveRecipeCalories` | bez zmian w UI, funkcja deleguje do `CalorieCascade` |
| 20 | kolejka przeglądarki | bez zmian (Q-09) |

### Decyzje (rozstrzygnięte 2026-10-26)

| ID | Pytanie | Decyzja | Skutek w planie |
| --- | --- | --- | --- |
| Q-00 | Czy N-10 robimy osobno przed planem? | Nie, jako faza 1 tego planu. | Fazy przenumerowane, N-10 otwiera plan. |
| Q-01 | Czy 5000 kcal to reguła domeny? | Nie. Wystarczy formularz. | Brak CHECK w bazie. `CalorieValue` nie zna 5000. Stała jest progiem formularza i wiarygodności źródła. |
| Q-02 | Czy sierota to legalny stan? | Tak, w pełni legalny i celowy. | `EntryQuantity "orphan"`. Brak migracji. Wpis w `known-drift.md` zmienia się na zapis decyzji. |
| Q-09 | Czy serwer odrzuca drugie zlecenie wyceny w ciągu 60 s? | Nie. | Bez bramki świeżości. N-12 zostaje w kliencie (D6). |
| Q-10 | Czy 409 przy podwójnym wyścigu edycji jest OK? | Tak, z komunikatem „Wpis zmienił się”. | Nowy stan modala edycji i ramka na kitchen sinku. |

### Fazy

| Faza | Zakres | Tryb |
| --- | --- | --- |
| 1 | Naprawa N-10 (R-01): predykat nagłówka w `isSelfDeclaringHeader` (`recipe-nutrition.ts:92-99`), cztery `test.failing` z bloku „F2” w `tests/unit/recipe-nutrition.test.ts` zamienione na `it`, wpis usunięty z `known-drift.md` | **test-first** (`/10x-tdd`) |
| 2 | `src/lib/domain/diary/`: `CalorieValue`, `EntryQuantity` (z `orphan`), `CalorieCascade`, `DiaryEntry` i błędy, a także `validations/diary/limits.ts`. Czysty TS, nic jeszcze tego nie woła. | **test-first**, przypadki niżej |
| 3 | `DiaryEntryRepository` z warunkami zapisu i jedną powtórką | **test-first** (atrapa łańcucha jak `tests/unit/diary-service.test.ts:12-40`) |
| 4 | `DiaryService` i trzy trasy przechodzą na wzorzec load → metoda → save, plus `diaryErrorResponse`. Obecne `diary-service.test.ts` (68 przypadków), `diary-estimate-route.test.ts` (30) i `diary-entry-route.test.ts` muszą zostać zielone **bez zmiany oczekiwań** (testy charakteryzujące). Wyjątki to nowe 409 i `CorruptEntryError`. Do tego obsługa 409 w `DiaryEntryEditModal.tsx`. | testy charakteryzujące i test 409 trasy najpierw, potem przepięcie |
| 5 | Sprzątanie: jedna stała, poprawione komentarze (poz. 7, 16, 18), `resolveRecipeCalories` deleguje do kaskady | refaktor pod zielonymi testami |
| 6 | Dokumentacja: `contract-surfaces.md`, `AGENTS.md` (katalog `domain/`), `known-drift.md` (sierota jako decyzja Q-02, 5000 jako decyzja Q-01, wpis o deduplikacji z dopiskiem Q-09), glosariusz (`orphan` = Sierota, „Wpis zmienił się”) | — |
| E2E | Ramka 409 „Wpis zmienił się” w `src/pages/dev/diary-states.astro`. Jeden scenariusz Playwright „edycja w dwóch kartach”. | `/10x-e2e` po fazie 4 |

### Przypadki testowe niezmiennika (faza 2)

Legalne operacje i przejścia:

- `create` z ręczną liczbą 0 daje `{0, manual}`. Zero jest wartością, a nie jej brakiem.
- `create` z przepisu, blokiem na porcję 250 i porcjami 2 daje `{500, recipe_nutrition}` bez znacznika.
- `create` z przepisu bez bloku daje `value = null` i `ticket = null`.
- `create` z ręczną liczbą i przepisem z blokiem daje `manual`. FR-004 wygrywa.
- `create` z przepisu, blokiem 2600 i porcjami 2 daje `Unresolved("out_of_range")`, a wartość zostaje `null`
  (próg wiarygodności, nie błąd).
- `setManualValue(300)` na wartości `ai_from_description` daje `{300, manual}`, a znacznik zostaje.
- `setManualValue(6000)` przechodzi w agregacie. 5000 to reguła formularza (Q-01), a test schematu
  `caloriesValueSchema` w `tests/unit/diary-validations.test.ts` pilnuje odrzucenia na granicy API.
- `clearValue()` daje `value = null` i `ticket = null` (N-02a).
- `recalculate` z blokiem po zmianie porcji z 1 na 3 daje `{750, recipe_nutrition}`.
- `rehydrate` wiersza `portions = 2` i `source_recipe_id = null` daje sierotę bez błędu (Q-02).
- `edit({portions: 3})` sieroty przechodzi.
- `recalculate` sieroty daje `value = null` i `ticket = null`, bez rzucania.
- `requestEstimate` sieroty daje gałąź `ai_from_description` z kwotą „2 porcje”.
- `edit({content})` na wpisie bez wartości z biletem daje `ticket = null` (N-02b).
- `edit({content})` na wpisie z wartością zostawia wartość i bilet bez zmian (N-09).
- `requestEstimate` na wpisie opisowym daje gałąź `ai_from_description` z `amount_text`.
- `requestEstimate` na wpisie z przepisem daje gałąź `ai_from_recipe`.
- `requestEstimate` dwa razy z rzędu na wpisie bez wartości przechodzi, a drugi bilet zastępuje pierwszy (Q-09).
- `applyEstimate(req, 400)` na gałęzi przepisowej z 2 porcjami daje `{800, ai_from_recipe}`.
- Granica: `applyEstimate` z 2500 × 2 = 5000 przechodzi.

Nielegalne operacje i przejścia (każde rzuca nazwany błąd, a stan się nie zmienia):

- `create` z porcjami bez przepisu albo z przepisem i `amount_text` rzuca `EntryShapeError`. Sierota nie
  powstaje z komendy.
- `edit({portions})` na wpisie opisowym i `edit({amount_text: "x"})` na wpisie z porcjami (także sierocie)
  rzucają `EntryShapeError`.
- `setManualValue(-1)` i `setManualValue(12.5)` rzucają `InvalidCalorieValueError`.
- `recalculate` razem z `calories` rzuca `ConflictingValueCommandError`.
- `requestEstimate` na wpisie z wartością rzuca `EntryAlreadyValuedError`.
- `applyEstimate` po `clearValue` / `edit(content)` / `setManualValue` / nowszym `requestEstimate` rzuca
  `EstimateSupersededError` (N-04).
- `applyEstimate` z wynikiem 2600 × 2 = 5200 rzuca `ImplausibleEstimateError`, a wartość zostaje `null`.
- `rehydrate` wiersza z `source_recipe_id` i `portions = null` rzuca `CorruptEntryError`. Dziś ten przypadek
  kończy się cichym `?? 1`.
- `rehydrate` wiersza z `calories` i bez `calorie_origin` rzuca `CorruptEntryError`.
- Wiersz pośredni (wartość pusta, stary znacznik) nie da się osiągnąć żadną sekwencją metod: przypadek
  parametryzowany po wszystkich parach przejść.

Repozytorium (faza 3): pojedynczy brak trafienia wersji daje ponowne wczytanie i powtórkę, która się udaje.
Podwójny brak trafienia daje `EntryChangedConcurrentlyError`. Brak trafienia przy `applyEstimate` daje
`EstimateSupersededError` bez powtórki.

Trasa (faza 4): `PATCH` z podwójnym brakiem trafienia daje 409 z `code: "ENTRY_CHANGED"` i komunikatem
„Wpis zmienił się…”.

### Gotowe, gdy

- Wartości `"manual"`, `"recipe_nutrition"`, `"ai_from_recipe"` i `"ai_from_description"` występują w `src/`
  (poza `database.types.ts` i `ORIGIN_LABELS` w `DiaryEntryCalories.tsx:29-34`) w **jednym** miejscu:
  `src/lib/domain/diary/`.
- `grep -rn "5000" src/lib src/pages --include=*.ts` przy kaloriach wpisu znajduje jedną definicję
  (`validations/diary/limits.ts`). Żaden komentarz nie twierdzi, że pilnuje jej migracja.
- `estimate.ts` nie zawiera `* portions`, `?? 1` ani literału pochodzenia.
- `diary.service.ts` nie zawiera `estimation_requested_at = null` ani `estimation_requested_at: null`.
- Cztery `test.failing` N-10 są zielone jako `it`.
- `npm run typecheck` daje 0 błędów, a `npm run test` jest zielony.

### Nowe nazwy load-bearing (do `docs/reference/contract-surfaces.md`)

| Nazwa | Dlaczego jest kontraktem |
| --- | --- |
| `DiaryEntry` (`src/lib/domain/diary/`) | jedyny właściciel przejść wartości. Zapis do `diary_entries.calories`, `calorie_origin` lub `estimation_requested_at` z pominięciem agregatu łamie N-02 i N-03 po cichu. |
| `EntryQuantity "orphan"` | nazwany, legalny stan sieroty (Q-02). Dodanie CHECK, który wiąże `portions` z `source_recipe_id`, złamie każde usunięcie przepisu z wpisami. |
| `MAX_ENTRY_CALORIES` (`validations/diary/limits.ts`) | jeden próg 5000 dla formularza, parsera i promptu wyceny. Świadomie nie reguła domeny i nie CHECK w bazie (Q-01). Zmiana w jednym miejscu zmienia wszystkie trzy. |
| `DiaryEntryRepository.save` i warunek `updated_at` | wersja optymistyczna. Trigger lub default, który przestałby ustawiać `updated_at` przy każdym zapisie, wyłączy wykrywanie wyścigu. |
| `EstimateSupersededError`, `EntryAlreadyValuedError`, `ImplausibleEstimateError` | trasa `/estimate` zamienia je na 200 z faktycznym wierszem. To kontrakt S-03–S-05 i `useCalorieEstimation`. |
| `EntryChangedConcurrentlyError` → 409 `ENTRY_CHANGED` | nowy kod odpowiedzi `PATCH /api/diary-entries/:id`. Modal edycji pokazuje „Wpis zmienił się” (Q-10). |
| `diaryErrorResponse` | jedyne wyjście błędów domeny z tras dziennika, analogicznie do `zodIssues` |
| `EntryShapeError` | już istnieje (`diary.service.ts:36`). Zmienia się tylko moduł, w którym leży, a kształt `ValidationIssue` zostaje bez zmian. |

## Podsumowanie

Wybrany niezmiennik to cykl życia wartości wpisu: dokładnie jedno pochodzenie z kaskady i znacznik wyceny
unieważniany razem z wartością albo opisem. To jedyna reguła, którą PRD dopisuje do systemu (`prd.md:216`), a
dziś nie ma właściciela. Pochodzenie rozstrzyga się w pięciu miejscach w dwóch plikach, a zerowanie znacznika
trzyma się dyscypliną trzech gałęzi, którym jeden komentarz przeczy. Diagnoza wykazała cztery miejsca, w
których operacja zamiast się zatrzymać idzie dalej: cichy `?? 1`, wyjątek jako sterowanie, odcięta wycena
rozpoznawana po skutku oraz bezwarunkowy UPDATE na nieaktualnym odczycie. Projekt wprowadza agregat
`DiaryEntry` z `CalorieValue`, `EntryQuantity` (z sierotą jako legalnym stanem, Q-02) i polityką
`CalorieCascade`. Każde przejście ma precondition i nazwany błąd, a repozytorium zapisuje jedno przejście
jednym warunkowym UPDATE, z odpowiedzią 409 „Wpis zmienił się” przy podwójnym wyścigu (Q-10). Granica
5000 kcal zostaje progiem formularza i wiarygodności w jednej stałej, bez CHECK w bazie (Q-01). Serwer nie
odrzuca powtórnych wycen (Q-09). Plan zaczyna się od naprawy N-10 (faza 1, Q-00). Kolejne fazy to agregat
i repozytorium test-first, przepięcie pod testami charakteryzującymi, sprzątanie i dokumentacja. Plan nie
wymaga żadnej migracji.
