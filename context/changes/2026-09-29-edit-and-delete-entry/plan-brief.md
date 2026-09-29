# Edycja i usuwanie wpisu dziennika — brief planu

> Pełny plan: `context/changes/2026-09-29-edit-and-delete-entry/plan.md`

## What & Why

Użytkownik poprawia dowolną część zapisanego wpisu — treść, ilość albo porcje, wartość kaloryczną
i dzień — oraz usuwa wpis po potwierdzeniu (FR-005, FR-006, roadmapa S-05). Przeliczenie wartości
po edycji dzieje się wyłącznie na jawne żądanie. Automatyczne przeliczanie skasowałoby po cichu
liczbę poprawioną ręcznie, a przed tym chroni FR-004.

## Starting Point

- `PATCH /api/diary-entries/[id]` zmienia dziś tylko kalorie i nigdy nie przyjmuje `null`. Trasy
  `DELETE` nie ma.
- Trasa `/estimate` i zapis wyniku działają tylko dla wpisu bez wartości, więc wpisu z wartością
  nie da się dziś przeliczyć.
- Polityki RLS dla UPDATE i DELETE istnieją od F-01. `BaseModal`, `ConfirmDialog` i kolejka
  wyceny FIFO są gotowe do użycia.

## Desired End State

Każdy wiersz ma „Edytuj” i „Usuń”. Modal edycji ma dwa przyciski:
- **„Zapisz”** — wartość i pochodzenie stoją, chyba że użytkownik sam zmienił albo wyczyścił liczbę;
- **„Zapisz i przelicz”** — zeruje wartość i uruchamia kaskadę: parser przepisu, a gdy ten nic
  nie znajdzie, AI z kolejki.

Usunięcie wymaga potwierdzenia. Wpis przeniesiony na inny dzień znika z listy z toastem, a
wiersz-sierota daje się edytować i przeliczyć z uwzględnieniem porcji.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Mechanizm przeliczenia | „Wyczyść i policz”: jeden UPDATE zeruje `calories`, `calorie_origin` i `estimation_requested_at`, potem niezmienione `/estimate` | Kaskada, warunkowe zapisy i wygrana liczby ręcznej w wyścigu zostają bez zmian | Plan |
| Forma edycji | Modal (`BaseModal`) z „Zapisz” i „Zapisz i przelicz”; bez „Przelicz” w wierszu | Przeliczenie jest zawsze świadomym wyborem przy zapisie | Plan |
| Pusta liczba | Dozwolona: wpis wraca do „Nie policzono”, a znacznik zeruje się w tym samym zapisie | FR-005 mówi o edycji „każdej części”, a reguła z F-01 zostaje domknięta | Plan |
| Wpis z przepisu | `source_recipe_id` niezmienny; porcje edytowalne (także w sierocie); przeliczenie: najpierw parser, potem AI | Reguły kształtu z tworzenia zostają spójne, a sierota przechodzi walidację | Plan / known-drift |
| Sierota w wycenie | Gałąź opisowa wysyła `formatPortions(portions)` jako ilość | Zamyka objaw „2 porcje obok wartości dla jednej” bez migracji | Plan / known-drift |
| Zmiana dnia | Data najwyżej dzisiejsza (klient); widok zostaje, toast „Wpis przeniesiono na …” | Spójne z tworzeniem wpisu, użytkownik nie traci kontekstu dnia | Plan |
| Luka F2 (limit wywołań) | Zostaje otwarta; wpis w known-drift poszerzony o „Zapisz i przelicz” | Spójne z D6 z S-04: model darmowy, kilku użytkowników | Plan / S-04 D6 |
| Kontrakt `PATCH` | Częściowe ciało, `.strict()`; `recalculate` razem z `calories` daje 400; `{calories: N}` działa jak dziś | Pole w wierszu działa bez zmian, a pochodzenie rusza się tylko jawnie | Plan |
| Reguły kształtu ilości | Sprawdza serwis względem zapisanego wiersza (`EntryShapeError` → 400 z `path`) | Schemat nie widzi, czy wiersz ma porcje | Plan |

## Scope

**In scope:**
- schemat `update-entry.ts`, `DiaryService.updateEntry` i `deleteEntry`;
- poszerzony `PATCH` i nowy `DELETE`;
- porcje sieroty w `/estimate`;
- modal edycji, akcje w wierszu, `ConfirmDialog` z `data-testid`;
- testy jednostkowe i E2E, asercje RLS dla UPDATE/DELETE;
- sprzątanie wpisów w E2E, aktualizacja known-drift.

**Out of scope:**
- migracja;
- zmiana albo odpięcie przepisu, konwersja porcje ↔ tekst;
- „Przelicz” w wierszu, automatyczne przeliczanie;
- trzymanie starej wartości do przyjścia nowej;
- limit wywołań modelu (F2), serwerowa blokada przyszłych dat;
- undo i miękkie usuwanie.

## Architecture / Approach

`PATCH` zmienia tylko pola, które przyszły w ciele. Serwis czyta wiersz, sprawdza kształt
ilości i ustala kolumny wartości:

| Ciało żądania | Kolumny wartości |
| --- | --- |
| bez `calories` i `recalculate` | nietknięte |
| `calories: N` | `N` / `manual` |
| `calories: null` | wszystkie trzy `null` |
| `recalculate: true` | wszystkie trzy `null`, albo wynik parsera / `recipe_nutrition` dla wpisu z istniejącym przepisem |

Wszystko idzie jednym UPDATE. Gdy po „Zapisz i przelicz” wartość wciąż jest `null`, a dzień się
nie zmienił, przeglądarka woła istniejące `estimate(id)` z kolejki. Przed każdą mutacją wpis jest
wycofywany z kolejki (`cancel(id)`).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Kontrakt serwera | Schemat, serwis, `PATCH`/`DELETE`, porcje sieroty w `/estimate`, testy jednostkowe, asercje RLS | Zerowanie wartości bez zerowania znacznika — baza tego nie pilnuje |
| 2. Powierzchnia dziennika | Modal edycji, „Edytuj”/„Usuń” w wierszu, dialog potwierdzenia, obsługa kolejki i toastów | Wpis przeniesiony na inny dzień albo usunięty, gdy wycena jest w kolejce |
| 3. E2E i porządki | Scenariusze edycji, przeliczenia, zmiany dnia i usunięcia; sprzątanie wpisów; known-drift | Kolejność sprzątania (wpisy przed przepisami), żeby nie tworzyć sierot |

**Prerequisites:** S-01, S-02, S-03 i S-04 zamknięte (są w `context/archive/`); dostęp do edytora
SQL Supabase dla skryptu RLS.
**Estimated effort:** ~3 sesje, po jednej na fazę.

## Open Risks & Assumptions

- „Zapisz i przelicz” kasuje starą wartość od razu. Przy awarii modelu wiersz zostaje
  „Nie policzono” do ponownej próby albo liczby wpisanej ręcznie. Zaakceptowane.
- Każde „Zapisz i przelicz” na wpisie bez bloku wartości to wywołanie modelu bez limitu (F2).
- Serwer dalej przyjmuje przyszłe daty. Ogranicza je tylko klient, tak samo jak przy `POST`.
- Scenariusz przeliczenia w E2E zakłada przepis z blokiem wartości, więc nie weryfikuje ścieżki
  AI w przeglądarce. Tę ścieżkę pokrywają testy jednostkowe i test ręczny.

## Success Criteria (Summary)

- Edycja treści, ilości albo dnia nie zmienia wartości ani jej pochodzenia bez jawnego
  „Zapisz i przelicz”.
- Przeliczenie wpisu z przepisu daje wartość z parsera dla nowych porcji, a wpisu opisowego —
  nowe oszacowanie AI przez istniejącą kolejkę.
- Usunięcie wymaga potwierdzenia, a suma dnia przelicza się po każdej mutacji.

## References

- Roadmapa: `context/foundation/roadmap.md` (S-05); PRD: `context/foundation/prd.md:141-145`
- Znaleziska: `docs/reference/known-drift.md` (sierota, F2)
- Poprzednie zmiany: `context/archive/2026-09-23-ai-estimate-for-free-text/`,
  `context/archive/2026-09-25-recipe-entry-with-portions/`, `context/archive/2026-09-25-ai-estimate-from-recipe/`
