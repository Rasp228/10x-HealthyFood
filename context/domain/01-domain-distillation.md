---
title: "10x-HealthyFood — destylacja domeny"
created: 2026-10-26
type: domain-distillation
---

# 10x-HealthyFood — destylacja domeny

Mapa domeny, nie kod. Każdy termin i każda reguła ma źródło `plik:linia`, zweryfikowane w tej sesji.
Identyfikatory (`T-`, `K-`, `N-`, `R-`, `Q-`) są stabilne — kolejne przebiegi mają się do nich odnosić.

## Krok 0 — Kontekst projektu

**Materiał źródłowy (dokumenty):**

| Dokument | Rola |
| --- | --- |
| `context/foundation/prd.md` (v1, 2026-09-16) | wymagania modułu dziennika (FR-001–FR-016, US-01/02, non-goals) + opis systemu sprzed zmiany |
| `context/foundation/roadmap.md` | historia dostarczenia M-1 (F-01, S-01–S-06, wszystkie `done`), decyzje i ryzyka per kawałek |
| `README.md` | cel produktu sprzed modułu dziennika (personalizacja przepisów przez AI) |
| `docs/reference/known-drift.md` | świadomie przyjęte rozjazdy kodu z konwencjami — traktowane jako późniejsze decyzje |
| `docs/reference/contract-surfaces.md` | rejestr nazw kontraktowych (tabele, enumy, limity) |
| migracje `supabase/migrations/*.sql` | komentarze migracji niosą decyzje modelowe (np. dlaczego cel nie jest preferencją) |

Nie istnieje osobny `tech-stack.md`; stack opisuje `prd.md:26-34` i `AGENTS.md`. PRD opisuje
szczegółowo tylko moduł dziennika — domena przepisów i preferencji ma jako źródło wyłącznie
`README.md:3-24` i `prd.md:20-41`. **Ograniczenie:** dla Przepisów/Preferencji słownik opiera się
głównie na kodzie.

**Stack i warstwy:** Astro 7 SSR + wyspy React 19, Supabase (Postgres + Auth) jako jedyny backend,
OpenRouter jako dostawca modelu (`prd.md:26-34`).

| Warstwa | Gdzie | Uwagi |
| --- | --- | --- |
| Persystencja + część reguł | `supabase/migrations/*.sql` | CHECK-i i FK to jedyne reguły egzekwowane bez względu na ścieżkę |
| API (wejście) | `src/pages/api/<domena>/` | dziennik i cel: parse → serwis → odpowiedź; przepisy/preferencje: logika w handlerze (`known-drift.md:21-23`) |
| Walidacja | `src/lib/validations/<domena>/` | Zod v4; reguły „produktowe" (5000 kcal, 99 porcji) żyją tutaj |
| Serwisy | `src/lib/services/` | `DiaryService`, `CalorieEstimationService`, `UserSettingsService`, `AIService`; `recipe.service.ts` to klient przeglądarkowy (`known-drift.md:12-17`) |
| Czyste reguły domeny | `src/lib/utils/{recipe-nutrition,diary-totals,diary-estimation,diary-day,diary-portions}.ts` | bez Supabase i Zoda — tu mieszka najwięcej wiedzy domenowej |
| UI | `src/components/{diary,profile,recipe,ai}/`, `src/hooks/` | część reguł (przyszła data, minuta „Liczę…") istnieje **tylko** tutaj |

Brak warstwy „domain" jako takiej — nie ma typów/klas encji poza wygenerowanymi `Tables<…>`
(`src/types.ts:8-20`).

## Krok 1 — Ubiquitous Language

Pojęcia z kodu zbierano niezależnie od PRD: grep po nazwach tabel/kolumn/enumów, etykietach UI
i komentarzach serwisów. Kolumna „Kod" podaje miejsce, gdzie termin naprawdę żyje.

### Kontekst: Przepisy i generowanie (stara domena)

| ID | Termin | Definicja | Źródło (dokument) | Kod |
| --- | --- | --- | --- | --- |
| T-01 | **Przepis** (`recipe`) | Własny przepis użytkownika: tytuł, treść (≤5000 zn.), dodatkowe parametry, flaga AI | `prd.md:41`, `README.md:13` | `recipes` — `20250427130913_healthymeal_schema.sql:42-50`; `RecipeDto` `src/types.ts:11` |
| T-02 | **Treść przepisu** (`content`) | Pełny tekst przepisu; jedyne miejsce, w którym mogą leżeć wartości odżywcze | `prd.md:43-53` | `recipes.content` `…schema.sql:46` |
| T-03 | **Dodatkowe parametry** (`additional_params`) | Wolny tekst przy przepisie; AI czyta go jako „preferencje z przepisu" | BRAK w dokumentach (szukano `additional_params`, „dodatkowe parametry" w `prd.md`, `README.md`) | `…schema.sql:47`; `AIService.getRecipePreferences` `src/lib/services/ai.service.ts:590` |
| T-04 | **Przepis wygenerowany przez AI** (`is_ai_generated`) | Flaga przepisu zapisanego ze ścieżki AI | `README.md:14-15` | `20250427130914_add_ai_generated_to_recipes.sql:8`; ustawiana `src/pages/api/ai/save-recipe.ts:133,174` |
| T-05 | **Przepis bazowy** (`base_recipe`) | Przepis wklejony jako inspiracja do generowania/modyfikacji | `prd.md:36` („take a recipe from the internet and modify it") | `src/types.ts:63`; prompt `ai.service.ts:121,142` |
| T-06 | **Generowanie / Modyfikacja przepisu** (`generate_new` / `generate_modification`) | Dwie akcje AI na przepisach | `prd.md:41` | `action_type_enum` `…schema.sql:20-23` |
| T-07 | **Log akcji AI** (`logs`, `is_accepted`) | Telemetria wywołania modelu: model, czas, czy propozycję zapisano | `roadmap.md:76` | `…schema.sql:53-61`; `AIService.logAIAction` `ai.service.ts:654`, `updateAIActionLog` `:689` |
| T-08 | **Akceptacja propozycji** | Zapis przepisu z AI = `is_accepted: true` | BRAK w dokumentach (szukano „accept", „akcept" w `prd.md`, `roadmap.md`) | `save-recipe.ts:158-161,193-196` |

### Kontekst: Profil żywieniowy

| ID | Termin | Definicja | Źródło | Kod |
| --- | --- | --- | --- | --- |
| T-10 | **Preferencja żywieniowa** | Para (kategoria, wartość ≤50 zn.) użytkownika; wszystkie trafiają do promptu przepisu | `prd.md:40`, `README.md:12` | `preferences` `…schema.sql:30-39`; `ai.service.ts:537-582` |
| T-11 | **Kategoria preferencji**: `lubiane` / `nielubiane` / `wykluczone` / `diety` | Zamknięty słownik po polsku, zapisywany do bazy wprost | `contract-surfaces.md` (Enums) | `preference_category_enum` `…schema.sql:12-17`; etykiety `ai.service.ts:635-641` |
| T-12 | **Ograniczenie dietetyczne** („dietary restriction", „no eggs") | Pojęcie z PRD | `prd.md:22,36` | **BRAK w kodzie** jako osobny termin (szukano `restrict`, `ograniczenie diet` w `src/`); w kodzie wyrażane kategorią `wykluczone`/`diety` |
| T-13 | **Profil** | Ekran z preferencjami i (od S-06) celem | `prd.md:40,167,194` („profile record", „one optional field") | brak encji/tabeli; tylko ekran `src/pages/profile.astro`, `src/components/profile/ProfilePage.tsx` |

### Kontekst: Dziennik kaloryczny (nowy moduł)

| ID | Termin | Definicja | Źródło | Kod |
| --- | --- | --- | --- | --- |
| T-20 | **Wpis dziennika** (`diary entry`) | Jedna rzecz zjedzona danego dnia; samowystarczalna kopia treści i wartości | `prd.md:129-145,195` | `diary_entries` `20260922140906_create_diary_entries.sql:26-56`; `DiaryEntryDto` `src/types.ts:17` |
| T-21 | **Dzień dziennika** (`entry_date`) | Data kalendarzowa klienta, nigdy wyprowadzana z timestampu serwera | `prd.md:129,242` („jednostką modułu jest dzień") | migracja `:29-32`; `src/lib/utils/diary-day.ts:1-10` |
| T-22 | **Opis posiłku** (`content` wpisu) | Wolny tekst „co zjadłem", ≤500 zn. | `prd.md:132` | migracja `:33`; `entryContentSchema` `src/lib/validations/diary/create-entry.ts:67-71` |
| T-23 | **Ilość** (`amount_text`) | Wolny tekst ilości — tylko we wpisie opisowym | `prd.md:132-133` | migracja `:35`; etykieta „Ilość" `src/components/diary/DiaryEntryForm.tsx:377` |
| T-24 | **Liczba porcji** (`portions`) | Ile porcji przepisu zjedzono, domyślnie 1 — tylko we wpisie z przepisu | `prd.md:152-153` (FR-008) | migracja `:34`; `portionsSchema` `create-entry.ts:60-64`; „Liczba porcji" `DiaryEntryForm.tsx:433` |
| T-25 | **Przepis źródłowy** (`source_recipe_id`) | Własny przepis, z którego wpis powstał; niezmienny po zapisie | `prd.md:149` (FR-007) | migracja `:38`; niezmienność `src/lib/validations/diary/update-entry.ts:32-34` |
| T-26 | **Wartość kaloryczna** (`calories`) | Liczba kcal wpisu, 0–5000 | `prd.md:216-218` | migracja `:39`; `caloriesValueSchema` `create-entry.ts:36-40` |
| T-27 | **Pochodzenie wartości** (`calorie_origin`) | Który krok kaskady dał liczbę; widoczne przy każdej wartości | `prd.md:207` | `calorie_origin_enum` migracja `:14-19`; etykiety `src/components/diary/DiaryEntryCalories.tsx:29-34` |
| T-28 | **Kaskada wartości** | Kolejność źródeł: figury przepisu → AI z przepisu → AI z opisu → ręcznie; każdy krok nadpisywalny ręcznie | `prd.md:216-222` | **tylko w komentarzach** (`diary.service.ts:149`, `estimate.ts:28`, `recipe-nutrition.ts:190`); brak typu/funkcji o tej nazwie — logika rozsiana (patrz K-01) |
| T-29 | **Blok wartości odżywczych (samodeklarujący porcję)** | Blok w treści przepisu, którego nagłówek mówi, że opisuje jedną porcję | `prd.md:43-51,155-157` (FR-009) | `NUTRITION_MARKERS`/`PORTION_MARKERS` `src/lib/utils/recipe-nutrition.ts:30,40`; `isSelfDeclaringHeader` `:92-99` |
| T-30 | **Wycena / oszacowanie** (estimate) | Zlecenie AI policzenia wartości wpisu bez wartości | `prd.md:135` (FR-003), `:159` (FR-010) | trasa `src/pages/api/diary-entries/[id]/estimate.ts:35`; `CalorieEstimationService` `src/lib/services/calorie-estimation.service.ts:155,183`; UI „Policz kalorie" `DiaryEntryCalories.tsx:202` |
| T-31 | **Znacznik zlecenia wyceny** (`estimation_requested_at`) | Czas serwera, w którym zlecono wycenę; rozróżnia „liczy się" od „nikt nie liczył"; tylko najnowsze zlecenie może zapisać wynik | `roadmap.md:84` („status wyliczenia") | migracja `:41-45`; `markEstimationRequested` `diary.service.ts:194`; `applyEstimate` `:247-281` |
| T-32 | **Stan wartości wpisu**: `valued` / `estimating` / `stale` / `unavailable` / `idle` | Stan widziany przez UI; „Nie policzono" = `stale` po minucie | `prd.md:101,205` | `EstimationState` `src/lib/utils/diary-estimation.ts:61`; `resolveEstimationState` `:83-102`; etykiety „Liczę…", „Nie policzono", „AI niedostępne" `DiaryEntryCalories.tsx:127,139,143` |
| T-33 | **Przeliczenie** (`recalculate`, „Zapisz i przelicz") | Jawne żądanie użytkownika ponownego ustalenia wartości po edycji | `prd.md:141-142` (FR-005) | `update-entry.ts:50`; `diary.service.ts:334-374`; `DiaryEntryEditModal.tsx:367` |
| T-34 | **Sierota** (wpis-sierota) | Wpis z `portions`, którego przepis usunięto (`source_recipe_id = NULL`) | BRAK w PRD (szukano „orphan", „sierot"); nazwa z `known-drift.md:102-126` | tylko komentarze: `diary.service.ts:287`, `estimate.ts:122` |
| T-35 | **Suma dnia** (`calorieTotal`) + **brakujące** (`missingCount`) | Suma wartości dnia z jawną liczbą wpisów bez wartości; nigdy nie udaje pełnej | `prd.md:164-165` (FR-011), `:208` | `summarizeDay` `src/lib/utils/diary-totals.ts:19-37`; „Bez policzonych kalorii: N z M" `src/components/diary/DiaryDaySummary.tsx:47` |
| T-36 | **Dzienny cel kaloryczny** (`daily_calorie_goal`) | Opcjonalna liczba 500–10000 wpisana przez użytkownika; `null` = brak celu | `prd.md:167` (FR-012) | `user_settings` `20260930074331_create_user_settings.sql:21-31`; `UserSettingsService` `src/lib/services/user-settings.service.ts:11` |
| T-37 | **Postęp celu**: `under` / `reached` / `over` | Relacja sumy dnia do celu; przekroczenie to nie błąd | `prd.md:170-171` (FR-013) | `goalProgress` `diary-totals.ts:55-68` |
| T-38 | **Uprzedzenie o wysyłce do modelu** | Zdanie przy każdym przycisku wyceny, inne dla przepisu i opisu | `prd.md:209` | `AI_NOTICE` / `AI_NOTICE_RECIPE` `diary-estimation.ts:28,31` |
| T-39 | **Ustawienia użytkownika** (`user_settings`) | Wąska tabela na cel, oddzielona od preferencji | BRAK w PRD (PRD mówi o „polu na profilu") | migracja `20260930074331…sql:9-14,21` |
| T-40 | **Baza produktów spożywczych** | Świadomie nieistniejąca — load-bearing non-goal | `prd.md:238` | **BRAK w kodzie** (szukano `food database`, `baza produkt`, `per 100` w `src/`) — zgodnie z zamierzeniem |
| T-41 | **Makroskładniki** | Non-goal | `prd.md:239` | **BRAK w kodzie** jako pojęcie; jedyne wystąpienie to komentarz parsera, który je pomija (`recipe-nutrition.ts:201`) |

### Słowa o dwóch znaczeniach — prawdopodobne granice kontekstów

| ID | Słowo | Znaczenie A (kontekst) | Znaczenie B (kontekst) | Dowód |
| --- | --- | --- | --- | --- |
| G-01 | **log / logowanie** | zapis posiłku — „logging" w PRD (**Dziennik**) | telemetria AI — tabela `logs` (**Generowanie przepisów**); a do tego linie obserwowalności `src/lib/utils/log.ts` (**Obserwowalność**) i „logowanie" = sign-in (**Tożsamość**) | `prd.md:64,104`; `…schema.sql:53`; `LoginForm.tsx:152` |
| G-02 | **porcja** | jednostka, którą opisuje blok odżywczy przepisu — „JEDNA porcja tego przepisu" (**Przepisy**) | ile zjadł użytkownik — `portions` (**Dziennik**); a w prompcie opisowym „CAŁA opisana porcja" = cały posiłek | `recipe-nutrition.ts:33-40`; `calorie-estimation.service.ts:20` vs `:42`; `create-entry.ts:60` |
| G-03 | **treść / content** | pełny tekst przepisu ≤5000 (**Przepisy**) | opis posiłku ≤500 (**Dziennik**); w wycenie z przepisu ten sam `content` wpisu staje się „Notatką użytkownika" korygującą przepis | `…schema.sql:46`; migracja dziennika `:33`; `calorie-estimation.service.ts:188` |
| G-04 | **preferencje** | wiersze `preferences` z kategorią (**Profil żywieniowy**) | `additional_params` przepisu nazywane „Preferencje z przepisu" (**Przepisy/Generowanie**) | `ai.service.ts:588-590,613,627` |
| G-05 | **profil** | „rekord profilu" z polem celu (**PRD**) | w kodzie nie ma rekordu profilu: preferencje (**Profil żywieniowy**) i cel (**Ustawienia/Dziennik**) to dwie tabele | `prd.md:194`; `20260930074331…sql:9-14` |
| G-06 | **total** | liczba wierszy listy (`ResponseDto.total`) | suma kcal dnia (`calorieTotal`) i wartość wpisu (`RecipeCalorieResult.total`) | `src/types.ts:37-40`; `diary-totals.ts:15-17`; `recipe-nutrition.ts:22` |
| G-07 | **AI / model** | generator przepisów (`AIService`, prompt z preferencjami) | kalkulator kalorii (`CalorieEstimationService`, bez preferencji, osobna instancja klienta) | `ai.service.ts:66`; `calorie-estimation.service.ts:59-60,140-143` (komentarz „Preferencje… NIE są wysyłane") |

Najmocniejsze granice: **G-02** i **G-03** (Przepisy ↔ Dziennik) oraz **G-01** (cztery konteksty pod
jednym słowem). G-05 to granica, którą kod już narysował, a dokument nie.

## Krok 2 — Subdomeny: Core / Supporting / Generic

Cele produktu: system purpose (`prd.md:22`), wyróżnik modułu „bliskość danych, które już tu są"
(`prd.md:61-64`, `roadmap.md:34`), reguła biznesowa (`prd.md:216-222`), load-bearing non-goal „brak
bazy produktów" (`prd.md:238`).

| ID | Subdomena | Kategoria | Uzasadnienie |
| --- | --- | --- | --- |
| S-A | **Kaskada wartości kalorycznej** (blok odżywczy przepisu → AI z przepisu → AI z opisu → ręcznie, z pochodzeniem) | **Core** | To jest „Rule added by this module" (`prd.md:216`) i jedyne źródło liczb, skoro baza produktów jest wykluczona (`prd.md:238`). Usunięcie jej robi z modułu dowolny licznik (`roadmap.md:34`). |
| S-B | **Wpis dziennika + suma dnia z jawnym brakiem** | **Core** | Primary success criterion (`prd.md:77-78`); twarde NFR: <1 s, minuta, „suma nie udaje pełnej" (`prd.md:204-208`). |
| S-C | **Personalizacja przepisu do preferencji (generowanie/modyfikacja AI)** | **Core** (dla produktu jako całości) | System purpose i README (`prd.md:22`, `README.md:3-7`); „Existing rule" (`prd.md:214`). Dla M-1 tylko „preserved" (FR-014). |
| S-D | **Przepisy własne (CRUD, wyszukiwanie po tytule)** | Supporting | Niezbędne źródło danych dla S-A (FR-007), ale bez przewagi samo w sobie; „recipes are read, never written" (`prd.md:193`). |
| S-E | **Preferencje żywieniowe** | Supporting | Wejście dla S-C; FR-015 wymaga przetrwania nietkniętych (`prd.md:176`). |
| S-F | **Dzienny cel i postęp** | Supporting | Secondary success criterion (`prd.md:80-81`); jedyny zapis do „danych sprzed zmiany" w PRD. |
| S-G | **Telemetria akcji AI (`logs`, akceptacja)** | Supporting (uśpiona) | Pisana, przez nikogo nieczytana (`roadmap.md:76`; jedyne odwołania do `from("logs")` to `ai.service.ts:662,694`). |
| S-H | **Brama do dostawcy modelu (OpenRouter)** | Generic | Retry/timeouty/koperta — `src/lib/api/openrouter.*`; kandydat na ACL (patrz R-06). |
| S-I | **Tożsamość, sesja, RLS** | Generic | „Authentication and roles are unchanged" (`prd.md:196,226`). |
| S-J | **Obserwowalność i raport błędów klienta** | Generic | `src/lib/utils/log.ts`, `/api/client-errors` — brak wymagań produktowych (`roadmap.md:201`). |

## Krok 3 — Kandydaci na agregaty i ich niezmienniki

Status: **egzekwuje** (zawsze, bez względu na ścieżkę — zwykle baza), **deklaruje** (egzekwuje
tylko część ścieżek albo tylko klient/komentarz), **ignoruje** (nikt), **przeczy** (kod robi
odwrotnie).

### Agregat A — Wpis dziennika z jego wartością (`DiaryEntry` + stan wyceny)

| ID | Niezmiennik | Źródło | Status | Dowód |
| --- | --- | --- | --- | --- |
| N-01 | Wartość i jej pochodzenie występują razem albo wcale | `prd.md:207`; migracja `:49-55` | **egzekwuje** (DB CHECK) | `diary_entries_value_has_origin` migracja `:54-55` |
| N-02 | Wyzerowanie wartości zeruje znacznik wyceny w tym samym zapisie | migracja `:50-53` | **deklaruje** — tylko `DiaryService`, trzy gałęzie ręcznie; baza nie | `diary.service.ts:335-337,376-378,390-392`; komentarz `diary-estimation.ts:5` twierdzi, że „znacznik nigdy nie jest zerowany" — **przeczy** kodowi |
| N-03 | Pochodzenie ustala wyłącznie serwer; ręczna liczba = `manual` | `prd.md:207`; `create-entry.ts:84-86` | **egzekwuje** na API (schemat bez pola, `.strict()` w edycji) | `create-entry.ts:91-109`; `update-entry.ts:52`; decyzja rozsiana: `diary.service.ts:98,108,362,381`, `estimate.ts:111` |
| N-04 | Ręczna wartość wygrywa z AI; AI nigdy nie nadpisuje wartości; zapisuje tylko najnowsze zlecenie | `prd.md:138-142` (FR-004/005) | **egzekwuje** (warunkowy UPDATE) | `applyEstimate` `diary.service.ts:258-270` (`.is("calories", null)` + `.eq("estimation_requested_at", …)`) |
| N-05 | Kształt ilości: wpis z przepisu ma `portions` i nie ma `amount_text`; wpis opisowy odwrotnie | `prd.md:132` (FR-002) | **deklaruje** — Zod przy tworzeniu, serwis przy edycji, **baza nie**; sierota łamie regułę przy każdym usunięciu przepisu | `create-entry.ts:110-141`; `diary.service.ts:317-324`; FK `on delete set null` migracja `:38`; `known-drift.md:102-126` |
| N-06 | Wartość wpisu 0–5000 kcal | `create-entry.ts:33-34` (decyzja produktowa) | **deklaruje** — 4 kopie stałej w kodzie, baza ma tylko `>= 0`; dwa komentarze twierdzą, że check migracji ma tę granicę — **nieprawda** | `create-entry.ts:40`, `recipe-nutrition.ts:72`, `estimate.ts:19`, `calorie-estimation.service.ts:16` vs migracja `:39`; fałszywe komentarze `estimate.ts:14-15`, `calorie-estimation.service.ts:14` |
| N-07 | Przepis źródłowy należy do autora wpisu i jest niezmienny | `prd.md:114` („own recipes only") | **egzekwuje** na API (serwis przy tworzeniu, `.strict()` przy edycji); FK nie sprawdza właściciela | `readOwnRecipeContent` `diary.service.ts:161-182`; `update-entry.ts:32-34` |
| N-08 | Wpis jest samowystarczalny: usunięcie przepisu nie zmienia wpisu ani sum przeszłych dni | `prd.md:119,195` | **egzekwuje** (DB) | FK `on delete set null` + kopia `content`/`calories` migracja `:36-38` |
| N-09 | Przeliczenie tylko na jawne żądanie | `prd.md:141` (FR-005) | **egzekwuje** | `updateEntry` zmienia wartość wyłącznie w gałęziach `recalculate`/`calories` `diary.service.ts:334-382` |
| N-10 | `recipe_nutrition` tylko z bloku deklarującego **jedną** porcję | `prd.md:155-157` (FR-009, „Resolved 2026-09-16") | **przeczy** — nagłówek „na 4 porcje" przechodzi jako „na porcję" | `isSelfDeclaringHeader` `recipe-nutrition.ts:92-99`; `known-drift.md:128-154`; przypięte `test.failing` w `tests/unit/recipe-nutrition.test.ts` |
| N-11 | Wpis nie może dotyczyć przyszłego dnia | implikowane przez UI (`max={today}`) | **deklaruje** — tylko klient | `DayNavigator.tsx:48`, `DiaryEntryEditModal.tsx:172,333`, `useSelectedDay.ts:66`; serwer przyjmuje `2999-01-01` (`known-drift.md:156-182`) |
| N-12 | Wycena nie jest wywoływana ponownie dla zlecenia, które już trwa | `known-drift.md:54-78` (kierunek) | **ignoruje** — znacznik czytany dopiero po modelu | `markEstimationRequested` nie ma warunku świeżości `diary.service.ts:200-207` |
| N-13 | Wartość nieustalona w minutę pokazuje się jako niepoliczona, z otwartym polem ręcznym | `prd.md:101,205` | **deklaruje** — czysta funkcja klienta (świadomie) | `ESTIMATION_TIMEOUT_MS` `diary-estimation.ts:8`; `resolveEstimationState` `:83-102`; serwer: timeout 55 s `calorie-estimation.service.ts:91` |
| N-14 | Przed wysłaniem treści do modelu użytkownik o tym wie | `prd.md:209` | **egzekwuje** w UI (każde miejsce z przyciskiem wyceny) | `DiaryEntryCalories.tsx:108`, `DiaryEntryEditModal.tsx:270`, `DiaryEntryForm.tsx:273` |

### Polityka (read model) B — Dzień dziennika

| ID | Niezmiennik | Źródło | Status | Dowód |
| --- | --- | --- | --- | --- |
| N-20 | Suma dnia z brakującymi wartościami mówi, ile brakuje; brak ≠ zero | `prd.md:164-165,208` | **egzekwuje** (jedna czysta funkcja) | `summarizeDay` `diary-totals.ts:19-37`; `DiaryDaySummary.tsx:47` |
| N-21 | Przekroczenie celu nie jest stanem błędu | `prd.md:171` | **egzekwuje** (`over` jako status, nie błąd) | `goalProgress` `diary-totals.ts:63-65` |

### Agregat C — Ustawienia użytkownika (dzienny cel)

| ID | Niezmiennik | Źródło | Status | Dowód |
| --- | --- | --- | --- | --- |
| N-30 | Najwyżej jeden cel na użytkownika; brak wiersza = brak celu | `prd.md:167` | **egzekwuje** (PK `user_id`, upsert, `maybeSingle`) | migracja `20260930074331…sql:24`; `user-settings.service.ts:23-35,48-63` |
| N-31 | Cel 500–10000 albo `null` | `contract-surfaces.md` (Tables) | **egzekwuje** (DB CHECK + Zod, zgodne) | migracja `:27-28`; `update-goal.ts:8-12` |
| N-32 | Zapis celu nie dotyka preferencji | `prd.md:194` | **egzekwuje** (osobna tabela) | migracja `:9-14` |

### Agregat D — Przepis

| ID | Niezmiennik | Źródło | Status | Dowód |
| --- | --- | --- | --- | --- |
| N-40 | Dziennik nigdy nie zapisuje przepisu | `prd.md:118,193,248` | **egzekwuje** (konwencją) — jedyny dostęp dziennika do `recipes` to SELECT | `diary.service.ts:166-171`; brak innych `from("recipes")` w `src/lib/services/diary.service.ts` i `estimate.ts` |
| N-41 | Tytuł ma jeden sufit | `contract-surfaces.md` (Tables) | **przeczy** — 255 w `/api/recipes` i DB, 100 w UI i `save-recipe` | `create-recipe.ts:15`; `save-recipe.ts:14`; `known-drift.md:186-204` |
| N-42 | Operacja na cudzym/nieistniejącym przepisie daje 404 | spójność z diary/GET/PUT (`known-drift.md:252-274`) | **przeczy** w DELETE (200 „usunięty") | `src/pages/api/recipes/[id].ts:196` |
| N-43 | Przepis z AI niesie blok `Wartości odżywcze (na porcję):` / `Kalorie: N kcal` | niejawny kontrakt z FR-009 | **deklaruje** — tylko w prompcie, model może go pominąć; to jedyna linia łącząca kontekst generowania z parserem dziennika | `ai.service.ts:176-177,288-289` |
| N-44 | Odpowiedź modelu, która nie jest przepisem, nie staje się przepisem | `prd.md:85` („AI suggests") / test-plan ryzyko #2 (`known-drift.md:80-98`) | **przeczy** — `fallbackTextParsing` zamienia odmowę w przepis z 200 | `ai.service.ts:429`; `known-drift.md:80-98` |

### Agregat E — Profil żywieniowy (preferencje)

| ID | Niezmiennik | Źródło | Status | Dowód |
| --- | --- | --- | --- | --- |
| N-50 | (użytkownik, kategoria, wartość) unikalne | `contract-surfaces.md` | **egzekwuje** (DB UNIQUE → 409) | `…schema.sql:38`; `preferences/index.ts:163-167` |
| N-51 | Najwyżej 50 preferencji na użytkownika | BRAK w dokumentach (tylko komentarz migracji `20260930074331…sql:10`) | **deklaruje** — count-then-insert w handlerze, bez transakcji; baza nie pilnuje | `src/pages/api/preferences/index.ts:132-159` |
| N-52 | Wartości kategorii są po polsku i nie są tłumaczone w kodzie | `contract-surfaces.md` (Enums) | **egzekwuje** (enum DB) | `…schema.sql:12-17` |

## Krok 4 — Rozjazdy MODEL vs KOD

„Napraw" = kod / dokument / decyzja (właściciel). Dokument oznaczany tylko z cytatem późniejszej decyzji.

| ID | Dokument mówi | Kod robi | Dowód | Co naprawić |
| --- | --- | --- | --- | --- |
| R-01 | FR-009: wartość z przepisu tylko z figur deklarujących **jedną** porcję (`prd.md:155-157`) | Nagłówek z dowolnym słowem „porcj/serving/portion" przechodzi, także „na 4 porcje" → wartość zawyżona krotnie z etykietą `recipe_nutrition` | `recipe-nutrition.ts:92-99`; `known-drift.md:128-150` | **kod** (predykat nagłówka; kierunek w `known-drift.md:142-145`) |
| R-02 | Kaskada to **jedna** reguła (`prd.md:216-222`) | Kaskada nie istnieje jako byt: decyzja o pochodzeniu w 5 miejscach w 2 plikach, mnożenie×porcje i bramka zakresu zdublowane w `recipe-nutrition.ts:243-246` i `estimate.ts:141-145`, podgląd w formularzu woła parser osobno (`DiaryEntryForm.tsx:265`); trasa trzyma logikę biznesową wbrew `AGENTS.md` („Business logic belongs in services") | `diary.service.ts:98,108,362,381`; `estimate.ts:111,141-151` | **kod** (patrz ranking #1) |
| R-03 | „Każda ścieżka zerująca `calories` zeruje `estimation_requested_at`" (migracja `:50-53`) | Spełnione tylko dyscypliną w 3 gałęziach `updateEntry`; komentarz `diary-estimation.ts:5` mówi coś przeciwnego („znacznik nigdy nie jest zerowany") | `diary.service.ts:335-337,376-378,390-392`; `diary-estimation.ts:5` | **kod** (właściciel przejść — ranking #1) + komentarz |
| R-04 | Górna granica 5000 kcal „taka sama jak w checku migracji" (komentarze) | Migracja ma tylko `calories >= 0`; zapis spoza API (SQL, przyszły skrypt) przyjmie 99 999 | migracja `:39`; `estimate.ts:14-15`; `calorie-estimation.service.ts:14` | **decyzja** (czy 5000 to reguła domeny → CHECK w DB, czy tylko UX → poprawić komentarze) |
| R-05 | Kształt ilości wpisu (`prd.md:132`) i US-02 „usunięcie przepisu zostawia wpis bez zmian" (`prd.md:119`) | Oba prawdziwe naraz tworzą sierotę, której schemat tworzenia nie przyjmie; baza nie wiąże `portions` z `source_recipe_id` | `known-drift.md:102-126`; migracja `:34,38` | **decyzja** — czy sierota to legalny stan (nazwać go w modelu, np. `portions` bez przepisu = „wpis zamrożony"), czy dodać kolumnę/CHECK; świadomie odłożone przez dwa plany |
| R-06 | PRD: profil „gains a single optional field" (`prd.md:194,198`; `roadmap.md:36,169`) | Cel jest w osobnej tabeli `user_settings`; profil nie jest rekordem | migracja `20260930074331…sql:9-14,21` | **dokument** — późniejsza decyzja (2026-09-30) w komentarzu migracji i w `contract-surfaces.md` (Tables: „The goal deliberately does not live in `preferences`") |
| R-07 | „Klient blokuje → serwer też" (ryzyko #6 test-planu, wg `known-drift.md:167`) | Przyszła data przechodzi przez POST i PATCH | `create-entry.ts:23-26`; `known-drift.md:156-182` | **decyzja** — czyje „dzisiaj" (strefa czasowa); bez niej kod nie ma czego egzekwować |
| R-08 | Model jest darmowy, wywołań mało (decyzja D6, `known-drift.md:73-78`) | Brak limitu/deduplikacji wyceny; każde „Zapisz i przelicz" + `/estimate` to nowe płatne wywołanie | `diary.service.ts:200-207`; `known-drift.md:54-78` | **decyzja** (świadomie przyjęte; rewizja przy zmianie modelu na płatny) |
| R-09 | „AI suggests; it is never the only way" (`prd.md:85`) + ryzyko #2 test-planu | Dowolna niepusta odpowiedź modelu staje się przepisem z 200 | `ai.service.ts:429`; `known-drift.md:80-98` | **kod** (po pomiarze, jak często model odpowiada tekstem — `known-drift.md:91-93`) |
| R-10 | Jeden sufit tytułu przepisu (`contract-surfaces.md`) | 100 vs 255 | `known-drift.md:186-204` | **kod** (jeden `recipeTitleSchema`) + **decyzja** 100 czy 255 |
| R-11 | Domena przepisów wg README: „HealthyMeal" (`README.md:1`) | Projekt, repo i PRD: „10x-HealthyFood" (`prd.md:2,18`) | — | **decyzja** (nazwa produktu); niski priorytet |
| R-12 | Limit 50 preferencji — reguła istnieje tylko w kodzie, dokumenty jej nie znają | Count-then-insert bez transakcji; dwa równoległe POST-y dadzą 51 | `preferences/index.ts:133-159` | **decyzja** (czy to reguła domeny) → wtedy kod |
| R-13 | Kontrakt „przepis z AI ma blok na porcję" — dokumenty go nie nazywają, a FR-009 na nim polega | Istnieje tylko w prompcie | `ai.service.ts:176-177,288-289` | **dokument** + test kontraktowy (że prompt i `PORTION_MARKERS` się zgadzają) |

## Krok 5 — Ranking refaktoru

Wartość = jak rdzeniowy niezmiennik; ryzyko = jak słabo dziś egzekwowany.

| # | Kandydat | Wartość | Ryzyko | Gotowe, gdy… |
| --- | --- | --- | --- | --- |
| **1** | **Agregat „Wartość wpisu" (kaskada + przejścia stanu wyceny)** — N-02, N-03, N-06, R-02, R-03 | Core (S-A) | średnie-wysokie: niezmiennik N-02 trzyma się na dyscyplinie trzech gałęzi; pochodzenie decydowane w 5 miejscach; granica 5000 w 4 kopiach | `grep -rn '"manual"\|"recipe_nutrition"\|"ai_from_recipe"\|"ai_from_description"' src --include=*.ts --include=*.tsx` (poza `database.types.ts` i mapą etykiet UI) znajduje **jeden** plik; `grep -rn "MAX_TOTAL_CALORIES\|MAX_CALORIES\|max(5000" src` znajduje jedną definicję; `estimate.ts` nie zawiera mnożenia `* portions` |
| 2 | **Polityka „Blok samodeklarujący jedną porcję"** — N-10, R-01 | Core (S-A, jedyne źródło `recipe_nutrition`) | wysokie: kod przeczy PRD i zawyża wartość krotnie, po cichu | cztery `test.failing` z bloku „F2" w `tests/unit/recipe-nutrition.test.ts` zamienione na `it` i zielone; wpis „Nagłówek bloku odżywczego…" usunięty z `known-drift.md` |
| 3 | **Kształt ilości wpisu / sierota** — N-05, R-05 | Core (S-B) | średnie: łamany przy każdym usunięciu przepisu, ale wartość i suma dnia zostają poprawne | po decyzji: zapytanie `select count(*) from diary_entries where portions is not null and source_recipe_id is null` albo jest legalnym, nazwanym stanem z testem, albo zwraca 0 dzięki CHECK |
| 4 | **Kontrakt przepis-z-AI ↔ parser (ACL na granicy Przepisy/Dziennik)** — N-43, R-13 | Core×Supporting | średnie: niejawny, rozjedzie się przy pierwszej edycji promptu | test, który bierze nagłówek z promptu `AIService` i przepuszcza go przez `readPerPortionCalories` — zielony |
| 5 | **Przyszła data wpisu** — N-11, R-07 | Core (S-B) | niskie-średnie: tylko spoza przeglądarki | `POST /api/diary-entries` z `entry_date: "2999-01-01"` daje 400 (test w `tests/unit/diary-entries-route.test.ts` przestawiony z 201) |
| 6 | **Bramka świeżości wyceny** — N-12, R-08 | Supporting (koszt) | niskie dziś (model darmowy), rośnie z ceną | drugi `POST /estimate` dla tego samego wpisu w ciągu 60 s nie woła `CalorieEstimationService` (test z mockiem: 1 wywołanie) |
| 7 | **Przepis: sufit tytułu i DELETE** — N-41, N-42 | Supporting | niskie (dane bezpieczne) | `grep -rn "max(100\|max(255" src` przy tytule znajduje jedno miejsce; dwa `test.failing` DELETE w `tests/unit/recipes-route.test.ts` zielone jako `it` |
| 8 | **Limit 50 preferencji** — N-51, R-12 | Supporting | niskie | po decyzji: reguła w jednym miejscu, które nie jest count-then-insert (np. trigger/CHECK albo usunięcie limitu) |

**#1 do refaktoru: agregat „Wartość wpisu".** To rdzeń produktu — jedyna reguła, którą PRD dopisuje
do systemu (`prd.md:216`) i powód, dla którego nie ma bazy produktów. Dziś nie istnieje jako byt:
słowo „kaskada" występuje wyłącznie w komentarzach, a decyzje o pochodzeniu, zakresie i znaczniku
są rozłożone między `DiaryService`, trasę `/estimate` i formularz. Nie jest najbardziej
„płonący" (to #2 — kod wprost przeczy PRD, ale naprawa to jeden predykat i nie wymaga agregatu),
ale jest jedynym, w którym każda kolejna zmiana (nowe źródło, płatny model, limit wycen) musi dziś
dotknąć kilku plików naraz. #2 warto zrobić od razu, przed #1 — jest tani i usuwa cichy błąd liczby.

### Pytania do właściciela (rozstrzygalne w minuty)

| ID | Pytanie | Kto wie |
| --- | --- | --- |
| Q-01 | Czy 5000 kcal na wpis to reguła domeny (→ CHECK w bazie), czy tylko zabezpieczenie UX? (R-04) | właściciel produktu |
| Q-02 | Sierota (porcje bez przepisu) — legalny, nazwany stan modelu czy defekt do zamknięcia migracją? (R-05) | właściciel produktu |
| Q-03 | Czyje „dzisiaj" obowiązuje na serwerze: strefa z klienta czy zapas +1 dzień UTC? (R-07) | właściciel produktu / developer |
| Q-04 | Czy limit 50 preferencji jest regułą biznesową, czy zabezpieczeniem promptu? (R-12) | właściciel produktu |
| Q-05 | Sufit tytułu: 100 czy 255? Czy w bazie są tytuły >100 znaków? (R-10) | developer (jedno zapytanie SQL) |
| Q-06 | Nazwa produktu: „HealthyMeal" czy „10x-HealthyFood"? (R-11) | właściciel produktu |
| Q-07 | Czy tabela `logs` (akceptacja propozycji AI) ma czytelnika w planach, czy to martwa telemetria? (S-G) | właściciel produktu |
| Q-08 | Czy `is_ai_generated` ma znaczyć „treść pochodzi od AI" — skoro `POST /api/recipes` pozwala klientowi ustawić flagę (`create-recipe.ts:33`), a ręczna edycja przepisu z AI jej nie zdejmuje (`update-recipe.ts:6`)? | właściciel produktu |
