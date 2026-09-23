---
project: 10x-HealthyFood
version: 1
status: draft
created: 2026-09-21
updated: 2026-09-23
prd_version: 1
main_goal: speed
top_blocker: time
milestone_id: calorie-diary-v1
milestone_seq: 1
milestone_status: open
---

# Roadmap: 10x-HealthyFood — moduł dziennika kalorycznego

> Wyprowadzone z `context/foundation/prd.md` (v1) oraz z auto-researchu istniejącego kodu (2026-09-21).
> Dokument edytowany w miejscu; archiwizowany, gdy zostanie zastąpiony.
> Kawałki poniżej są ułożone w kolejności zależności. Tabela „At a glance" jest indeksem.

## Milestone

**M-1: Dziennik kaloryczny v1** — Status: open

- **Intent:** doprowadzić moduł dziennika do stanu, w którym użytkownik zapisuje co zjadł — opisem albo wybierając własny przepis — dostaje wartość kaloryczną z kaskady źródeł i widzi sumę dnia względem opcjonalnego celu, bez naruszenia czegokolwiek, co działa dzisiaj.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** każdy `F-NN` i `S-NN` poniżej ma status `done`.
- **Scope anchors:** FR-001 – FR-016, US-01, US-02 (całość zakresu PRD; wszystkie 16 wymagań ma priorytet konieczny).

## Vision recap

Przepisy użytkownika żyją w tej aplikacji, a liczenie kalorii — w jakiejś innej. Kto ugotował z własnego przepisu i chce wiedzieć, czy mieści się w dziennym celu, musi wpisać to samo danie drugi raz, do narzędzia, które tego przepisu nigdy nie widziało. Ten podwójny wpis jest kosztem dzisiejszej obejściówki i płaci się go przy każdym posiłku.

Wyróżnik tego produktu — czyli ta jedna cecha, po usunięciu której moduł staje się nieodróżnialny od dowolnego innego licznika kalorii — to bliskość danych, które już tu są: własne i zmodyfikowane przez AI przepisy oraz preferencje żywieniowe z profilu. Stąd świadome wykluczenie bazy produktów spożywczych: wartość kaloryczna pochodzi wyłącznie z kaskady źródeł opisanej w PRD, nigdy z zewnętrznego katalogu.

Moduł jest dobudową w działającej aplikacji. Przepisy są czytane i nigdy zapisywane; jedynym miejscem, gdzie moduł pisze do danych sprzed zmiany, jest jedno opcjonalne pole na rekordzie profilu.

## North star

**S-02: użytkownik prosi o wyliczenie kalorii dla opisowego wpisu i dostaje wartość bez czekania** — to domknięcie US-01, czyli „pierwszej sesji" z Kryteriów sukcesu: pierwsze użycie ma dać zapisany wpis z wartością kaloryczną, bez konfigurowania czegokolwiek wcześniej.

> Gwiazda przewodnia to najmniejszy kompletny przepływ — od ekranu przez logikę po bazę — którego udane wdrożenie dowodzi, że główna hipoteza produktu (czyli założenie, na którym stoi cały moduł: że logowanie posiłku da się zrobić jednym ruchem, bez szukania w obcej bazie) jest prawdziwa. Stawia się ją tak wcześnie, jak pozwalają zależności, bo wszystko inne ma znaczenie dopiero wtedy, gdy ona zadziała. Przy celu `speed` poprzedza ją `S-01` — ta sama ścieżka bez AI, która jest zarazem podłogą modułu wymaganą przez gwarancję „dziennik jest w pełni używalny bez działającej estymacji".

## At a glance

| ID | Change ID | Outcome (użytkownik może …) | Prerequisites | PRD refs | Status |
| --- | --- | --- | --- | --- | --- |
| F-01 | `diary-entry-store` | (fundament) istnieje prywatny magazyn wpisów dziennika z polem na wartość, jej pochodzenie i status wyliczenia | — | FR-001, FR-002, FR-015, Access Control Changes | done |
| S-01 | `manual-diary-entry` | otworzyć panel dziennika, zapisać wpis na wybrany dzień z ręcznie wpisaną liczbą kalorii i zobaczyć sumę dnia | F-01 | US-01, FR-001, FR-002, FR-004, FR-011, FR-016 | done |
| S-02 | `ai-estimate-for-free-text` | poprosić o wyliczenie kalorii dla opisowego wpisu i dostać wartość bez czekania na zapis | S-01 | US-01, FR-003, FR-004, FR-011 | proposed |
| S-03 | `recipe-entry-with-portions` | wyszukać własny przepis po nazwie, podać liczbę zjedzonych porcji i dostać wartość z bloku odżywczego przepisu | S-01 | US-02, FR-002, FR-007, FR-008, FR-009, FR-014, FR-015 | proposed |
| S-04 | `ai-estimate-from-recipe` | poprosić o oszacowanie kalorii z samej treści przepisu, gdy przepis nie ma użytecznych figur odżywczych | S-02, S-03 | US-02, FR-010, FR-011, FR-014 | proposed |
| S-05 | `edit-and-delete-entry` | poprawić dowolną część zapisanego wpisu i usunąć wpis po potwierdzeniu | S-01, S-02 | US-01, FR-005, FR-006 | proposed |
| S-06 | `daily-goal-and-progress` | ustawić w profilu opcjonalny dzienny cel kaloryczny i widzieć sumę dnia względem niego | S-01 | FR-012, FR-013, FR-015 | proposed |

## Streams

Pomoc nawigacyjna — grupuje pozycje dzielące ten sam łańcuch zależności. Kolejność wiążąca żyje w grafie zależności poniżej; ta tabela to proponowana kolejność czytania w poprzek równoległych torów.

| Stream | Theme | Chain | Note |
| --- | --- | --- | --- |
| A | Podłoga dziennika i ścieżka opisowa | `F-01` → `S-01` → `S-02` | Tor krytyczny: kończy się gwiazdą przewodnią. Przy celu `speed` nic nie powinno go wyprzedzić. |
| B | Ścieżka z własnego przepisu | `S-03` → `S-04` | Wchodzi do toru A przy `S-01`; `S-04` czeka dodatkowo na `S-02`, bo dzieli z nim mechanikę „zapisz teraz, wartość później". |
| C | Utrzymanie wpisu | `S-05` | Wchodzi do toru A przy `S-02` — przeliczenie na żądanie ma sens dopiero wtedy, gdy jest czym przeliczać. |
| D | Cel i postęp | `S-06` | Wchodzi do toru A przy `S-01`; poza tym niezależny — jedyna pozycja dotykająca profilu i jedyna, która nie dotyka kaskady kalorii. |

## Baseline

Co jest w kodzie na dzień `2026-09-21` (auto-research + potwierdzenie użytkownika). Fundamenty poniżej zakładają, że to istnieje, i **nie budują tego ponownie**.

- **Frontend:** present — Astro 7 SSR + wyspy React 19, dziewięć domen w `src/components`, prymitywy shadcn/ui (`new-york`). Strony `index`, `profile`, `recipes/*`, `auth/*` (`astro.config.mjs`). Żadnej powierzchni dziennika.
- **Backend / API:** present — 15 tras pod `src/pages/api` (ai, auth, recipes, preferences, users, health); warstwa serwisów `src/lib/services/{ai,recipe}.service.ts` plus klient `src/lib/api/openrouter.service.ts` z retry i typowanymi klasami błędów. Walidacja Zod **partial** — pliki tylko dla domeny auth (`src/lib/validations/auth/*`); recipes, preferences i ai walidują w miejscu.
- **Data:** present — dwie migracje; tabele `preferences`, `recipes`, `logs`; RLS i polityki per-użytkownik na wszystkich trzech (`supabase/migrations/20250427130913_healthymeal_schema.sql` — gotowy wzorzec do skopiowania). **Dziennika nie ma w żadnej postaci**: ani tabeli, ani kolumny, ani kodu. Jedyne trafienie na „kalorie" w repozytorium to fixture testowy `tests/fixtures/recipes.ts` z obiektem `nutrition.calories`, niepodparty żadną kolumną.
- **Auth:** present — Supabase Auth, klient per-żądanie z buforowanym zapisem ciasteczek (`src/db/supabase.client.ts`), middleware z listą ścieżek publicznych (`src/middleware/index.ts`). Profil istnieje (`src/pages/profile.astro`, `ProfilePage.tsx`, `usePreferences`), ale bez pola „cel".
- **Deploy / infra:** partial — adapter Vercel z Web Analytics, CI `code-quality → build → (unit | e2e) → status-comment`. Brak osobnego joba deployu (deploy idzie integracją Git), brak kontenerów i infrastruktury jako kodu.
- **Observability:** partial — brak biblioteki logowania, brak Sentry/OTel, brak metryk; około 48 gołych `console.error` w 23 plikach. Tabela `logs` to telemetria wywołań AI (model, czas odpowiedzi, `is_accepted`) pisana wyłącznie przez `ai.service.ts` i przez nic nieczytana.

Testy w repo: dwa unit (`ThemeToggle`, `validation-errors`) i jeden zestaw E2E (`recipe-management`) z page objectami. Katalog `tests/integration` nie istnieje.

## Foundations

### F-01: Magazyn wpisów dziennika

- **Outcome:** (fundament) istnieje prywatny per-użytkownik magazyn wpisów dziennika, przechowujący dzień, opis zjedzonego, ilość, wartość kaloryczną, **pochodzenie tej wartości** i **status jej wyliczenia**, z RLS i politykami per-użytkownik wzorowanymi na istniejącej migracji schematu.
- **Change ID:** `diary-entry-store`
- **PRD refs:** FR-001, FR-002, FR-015, `## Access Control Changes`, `## Constraints & Compatibility` (wpisy samowystarczalne), NFR (każda wartość niesie pochodzenie; niepełna suma mówi, że jest niepełna)
- **Unlocks:** `S-01`, `S-02`, `S-03`, `S-04`, `S-05`, `S-06` — wszystkie zapisują lub czytają ten sam rekord. Domyka też wymaganie „wpisy są samowystarczalne": usunięcie przepisu nie może ruszyć przeszłych dni.
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** to jedyna pozycja, której późna zmiana wymusza migrację w tygodniu buforowym — a zbiór dopuszczalnych wartości „pochodzenie" dyktują FR-009 i FR-010, których `S-01` w ogóle nie dotyka, więc musi być kompletny od razu, nie po fakcie. Zakres ograniczony do jednej nowej tabeli: zero zapisu do `recipes` i `preferences` (FR-015), zero zmian w istniejących migracjach. Po wdrożeniu `S-01` nadal integruje tę warstwę przez realną zdolność użytkownika — fundament sam z siebie niczego nie pokazuje.
- **Status:** done

## Slices

### S-01: Ręczny wpis i suma dnia

- **Outcome:** użytkownik otwiera panel dziennika, wybiera dzień, tworzy wpis z opisem zjedzonego i ilością jako tekstem, wpisuje liczbę kalorii ręcznie i natychmiast widzi wpis na liście dnia oraz sumę dnia.
- **Change ID:** `manual-diary-entry`
- **PRD refs:** US-01, FR-001, FR-002, FR-004, FR-011, FR-016
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** to jest podłoga całego modułu — gwarancja z PRD mówi wprost, że dziennik ma być w pełni używalny bez działającej estymacji, a ręcznie wpisana liczba jest jedynym źródłem, które nigdy nie zawodzi. Postawiony przed ścieżką AI, żeby moduł miał wartość nawet wtedy, gdy okno trzech tygodni się skurczy. Nowa trasa dziedziczy istniejącą bramkę sesji; lista ścieżek publicznych w middleware nie jest ruszana, więc rejestracja i logowanie działają jak dotąd (FR-016).
- **Status:** done

### S-02: Wycena opisowego wpisu przez AI

- **Outcome:** użytkownik prosi o wyliczenie kalorii dla opisowego wpisu; wpis zapisuje się i pojawia na liście natychmiast, wartość dopisuje się później, a gdy nie ustali się w ciągu minuty, wpis pokazuje się jako niepoliczony z możliwością wpisania liczby ręcznie. Suma dnia mówi, ilu wartości jeszcze w niej nie ma.
- **Change ID:** `ai-estimate-for-free-text`
- **PRD refs:** US-01, FR-003, FR-004, FR-011, NFR (wpis widoczny poniżej sekundy; minuta na ustalenie wartości; każda wartość niesie pochodzenie; niepełna suma mówi, że jest niepełna; użytkownik wie, zanim treść opuści produkt)
- **Prerequisites:** S-01
- **Parallel with:** S-03, S-06
- **Blockers:** —
- **Unknowns:**
  - Czy uprzedzenie „ten opis pojedzie do dostawcy modelu" ma być jednorazowe (przy pierwszym użyciu), czy pokazywane przy każdej wycenie? PRD wymaga tylko, żeby użytkownik wiedział, zanim treść wyjdzie — Owner: user. Block: no.
- **Risk:** jedyny kawałek, w którym wymagania jakościowe są twarde i liczbowe (poniżej sekundy na pojawienie się wpisu, minuta na wartość, uczciwie oznaczona niepełna suma), i zarazem jedyny, w którym moduł zależy od zewnętrznego dostawcy. Ustawiony zaraz po ręcznej podłodze, więc awaria albo przekroczenie czasu przez estymację degraduje moduł, ale go nie zatrzymuje. Klient OpenRouter z retry i typowanymi błędami już istnieje — to konsumpcja, nie budowa.
- **Status:** proposed

### S-03: Wpis z własnego przepisu z liczbą porcji

- **Outcome:** użytkownik wyszukuje swoje przepisy po nazwie, wybiera jeden jako treść wpisu i podaje liczbę zjedzonych porcji (pole startuje od jedynki); wartość kaloryczna bierze się z figur odżywczych przepisu tam, gdzie te figury same deklarują, że opisują jedną porcję, przemnożona przez liczbę porcji. Wyświetlona wartość mówi, skąd pochodzi, i można ją zastąpić liczbą wpisaną ręcznie.
- **Change ID:** `recipe-entry-with-portions`
- **PRD refs:** US-02, FR-002, FR-007, FR-008, FR-009, FR-014, FR-015
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-06
- **Blockers:** —
- **Unknowns:**
  - Które warianty nagłówka bloku odżywczego liczą się jako samodeklarujące porcję? PRD podaje jeden przykład i dopisuje „i równoważne", ale listy równoważników nie ma — Owner: user. Block: no. Nierozpoznany nagłówek jest bezpieczny: figury nieoznaczone traktuje się jak nieobecne, więc wpis spada do wyceny ręcznej, a po `S-04` — do oszacowania z treści.
- **Risk:** PRD zamknął problem interpretacji, zawężając FR-009 do figur samodeklarujących, więc ryzyko przesunęło się z „policzymy kilkakrotnie za dużo" na „nie rozpoznamy bloku i policzymy inaczej" — to drugie jest wielokrotnie tańsze. Przepisy są wyłącznie czytane: nic nie zapisuje się z powrotem do rekordu przepisu ani do jego opisu (FR-014, FR-015).
- **Status:** proposed

### S-04: Oszacowanie kalorii z treści przepisu

- **Outcome:** użytkownik prosi o oszacowanie kalorii z samej treści przepisu, gdy ten nie ma figur odżywczych albo ma takie, które nie mówią, co opisują; wynik trafia do wpisu dziennika, oznaczony jako oszacowany z przepisu, i nigdy nie jest zapisywany do samego przepisu.
- **Change ID:** `ai-estimate-from-recipe`
- **PRD refs:** US-02, FR-010, FR-011, FR-014, NFR (każda wartość niesie pochodzenie; użytkownik wie, zanim treść opuści produkt)
- **Prerequisites:** S-02, S-03
- **Parallel with:** S-05, S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** domyka kaskadę FR-009 → FR-010, czyli ostatnie źródło przed wpisaniem liczby ręcznie. Zależy od `S-02`, bo dzieli z nim całą mechanikę „zapisz teraz, wartość później" i sposób pokazywania pochodzenia — zbudowanie tego dwa razy jest głównym kosztem, którego okno trzech tygodni nie uniesie. Przy 3–4 użytkownikach powtarzane wywołania modelu dla tego samego przepisu nie są warte optymalizowania, a zapisanie wyniku do przepisu jest wprost wykluczone.
- **Status:** proposed

### S-05: Edycja i usuwanie wpisu

- **Outcome:** użytkownik poprawia dowolną część zapisanego wpisu — treść, ilość, wartość kaloryczną i dzień — oraz usuwa wpis po potwierdzeniu. Przeliczenie wartości po edycji dzieje się wyłącznie na jego jawne żądanie; dopóki go nie zażąda, stoi wartość zapisana.
- **Change ID:** `edit-and-delete-entry`
- **PRD refs:** US-01, FR-005, FR-006
- **Prerequisites:** S-01, S-02
- **Parallel with:** S-04, S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** automatyczne przeliczanie po każdej edycji skasowałoby po cichu wartość, którą użytkownik poprawił ręcznie — czyli dokładnie to zabezpieczenie, po które istnieje FR-004. Jawne żądanie jest tu wymaganiem poprawności, nie wygody. Zależy od `S-02`, bo „zaproponuj przeliczenie" zakłada, że jest czym przeliczyć. Potwierdzenie przy usuwaniu kosztuje jeden dialog i pokrywa przypadkowe dotknięcia na telefonie.
- **Status:** proposed

### S-06: Dzienny cel kaloryczny i postęp

- **Outcome:** użytkownik ustawia w profilu, obok istniejących preferencji żywieniowych, opcjonalny dzienny cel kaloryczny jako liczbę wpisaną przez siebie, i widzi sumę dnia względem tego celu jako wskaźnik postępu.
- **Change ID:** `daily-goal-and-progress`
- **PRD refs:** FR-012, FR-013, FR-015
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-04, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** to jedyne miejsce, w którym moduł pisze do danych istniejących przed zmianą — jedno opcjonalne pole na rekordzie profilu. Preferencje żywieniowe leżą na tym samym rekordzie i muszą przetrwać nietknięte; PRD nazywa ich uszkodzenie jedyną nieodwracalną awarią w całej zmianie, więc cała waga ryzyka tego kawałka siedzi w jednym zapisie. Cel jest liczbą wpisywaną wprost, bez wyliczania z wagi czy aktywności — najmniejsza możliwa zmiana profilu. Przekroczenie celu musi być zaprojektowane tak, żeby nie czytało się jako stan błędu.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID | Suggested issue title | Ready for `/10x-plan` | Notes |
| --- | --- | --- | --- | --- |
| F-01 | `diary-entry-store` | Magazyn wpisów dziennika z RLS i polem pochodzenia wartości | — | Zrobione (2026-09-22): migracja zaaplikowana, RLS zweryfikowane, typy zregenerowane |
| S-01 | `manual-diary-entry` | Panel dziennika: ręczny wpis i suma dnia | yes | Uruchom `/10x-plan manual-diary-entry` |
| S-02 | `ai-estimate-for-free-text` | Wycena opisowego wpisu przez AI, bez czekania na zapis | no | Gwiazda przewodnia. Czeka na S-01 |
| S-03 | `recipe-entry-with-portions` | Wpis z własnego przepisu z liczbą porcji | no | Czeka na S-01. Równolegle z S-02 |
| S-04 | `ai-estimate-from-recipe` | Oszacowanie kalorii z treści przepisu | no | Czeka na S-02 i S-03 |
| S-05 | `edit-and-delete-entry` | Edycja i usuwanie wpisu dziennika | no | Czeka na S-01 i S-02 |
| S-06 | `daily-goal-and-progress` | Dzienny cel kaloryczny w profilu i wskaźnik postępu | no | Czeka na S-01. Równolegle z resztą |

## Open Roadmap Questions

1. **Jeśli okno trzech tygodni się skurczy, który kawałek spada pierwszy?** PRD notuje, że zakres urósł już po oszacowaniu (edycja wpisów, wpisy na dowolny dzień, oszacowanie z treści przepisu) i że przyjąłeś ryzyko przekroczenia zamiast cięcia. Roadmapa nie rozstrzygnie tego za Ciebie, ale przy celu `speed` lepiej mieć odpowiedź przed trzecim tygodniem niż w jego trakcie. Najtańsze kandydatury do zdjęcia to `S-05` (edycja; usuwanie zostaje) oraz `S-04` (druga ścieżka estymacji; przepis bez rozpoznanych figur wraca wtedy do wyceny ręcznej) — obie zostawiają moduł kompletnym w sensie US-01. — Owner: user. Block: roadmap-wide; nie blokuje dziś żadnego kawałka.
2. **Jednorazowe czy powtarzane uprzedzenie o wysyłce treści do dostawcy modelu?** Dotyczy obu ścieżek estymacji, więc lepiej rozstrzygnąć raz niż dwa razy różnie. — Owner: user. Block: `S-02`, `S-04` — nie blokuje, ale rozstrzygnięcie przed `S-02` oszczędza przeróbkę w `S-04`.

## Parked

- **Baza produktów spożywczych** — Why parked: PRD `## Non-Goals`, pozycja nośna. Większość liczników kalorii stoi na takim katalogu; ten świadomie nie.
- **Makroskładniki (białko, tłuszcze, węglowodany)** — Why parked: PRD `## Non-Goals`. Leżą w tym samym bloku odżywczym i byłyby prawie darmowe do odczytania, a mimo to v1 liczy wyłącznie kalorie.
- **Dzielenie dziennika z partnerem lub dietetykiem** — Why parked: PRD `## Non-Goals` i `## Access Control Changes`. Dodałoby relację uprawnień do systemu, który dziś nie ma żadnej, dla 3–4 osób liczących każda dla siebie.
- **Rozpoznawanie ze zdjęć i kodów kreskowych** — Why parked: PRD `## Non-Goals`. Wejściem jest tekst albo wybór z własnych przepisów.
- **Statystyki poza jednym dniem** — Why parked: PRD `## Non-Goals`. Wcześniejsze dni można oglądać, ale nic nie jest sumowane w poprzek nich; jednostką modułu jest dzień.
- **Przypomnienia o logowaniu posiłków** — Why parked: PRD `## Non-Goals`. Nawyk należy do użytkownika, nie do produktu.
- **Jakakolwiek zmiana w zarządzaniu przepisami** — Why parked: PRD `## Non-Goals` oraz FR-014. Tworzenie, generowanie, edycja, usuwanie i przeglądanie przepisów są nietknięte.
- **Zapisywanie kalorii na przepisie** — Why parked: PRD `## Non-Goals` i FR-010. Żadnej kolumny, żadnej migracji, żadnej wartości utrwalonej przy przepisie.
- **Gwarancja pracy offline** — Why parked: PRD `## Non-Goals`. Moduł działa bez estymacji, ale nie bez połączenia z aplikacją.
- **Deklaracja, co dostawca modelu przechowuje** — Why parked: PRD `## Non-Goals` i rozstrzygnięcie otwartego pytania nr 4. Zobowiązanie informacyjne stoi; obietnicy o retencji świadomie nie ma.
- **Obserwowalność dla nowej ścieżki AI** — Why parked: wyszło z baseline'u (brak biblioteki logowania, tabela `logs` przez nikogo nieczytana), ale PRD nie stawia w tej sprawie żadnego wymagania, a cel `speed` nie uzasadnia budowania jej przed dostarczeniem zakresu. Wróć do tego po zamknięciu M-1.

## Milestone History

(Pusta — `M-1` jest pierwszym kamieniem milowym.)

## Done

(Pusta przy pierwszym wygenerowaniu. `/10x-archive` dopisuje tu pozycję i przestawia jej `Status` na `done`, gdy archiwizowana zmiana ma pasujący `Change ID`.)
