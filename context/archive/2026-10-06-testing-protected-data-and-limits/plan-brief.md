# Dane chronione i twarde limity — Plan Brief

> Full plan: `context/changes/testing-protected-data-and-limits/plan.md`
> Research: `context/changes/testing-protected-data-and-limits/research.md`

## What & Why

Faza 3 test-planu ma dowieść dwóch rzeczy.

- **#5:** preferencje i przepisy przetrwają nietknięte każdą operację celu dziennego i dziennika.
  To jedyna nieodwracalna awaria, jaką nazwał użytkownik.
- **#6:** każdy twardy limit kończy się 400, nie 500.

Tam, gdzie dziś wychodzi 500, faza naprawia trasę zamiast tylko przypiąć defekt.

## Starting Point

Ścieżki celu i dziennika nie piszą dziś do `preferences` ani `recipes`, ale nic tego nie pilnuje,
a preferencje nie mają żadnego testu. Dziennik, cel i wyszukiwanie zwracają 400 na złe wejście.
500 wychodzi w trzech miejscach:

- preferencje: `.parse()`, duplikat, `limit=51`, ciało nie-JSON;
- `/api/recipes` POST/PUT: brak sufitów, ciało nie-JSON;
- identyfikatory ponad int4.

## Desired End State

Stanowa atrapa czterech tabel dowodzi na prawdziwych trasach, że preferencje i przepisy są po
operacji co do pola takie same. Każdy limit ma test trasy (granica → 2xx, o krok dalej → 400, zapis
nie nastąpił), z wyrocznią z literałów migracji. Preferencje i przepisy zwracają 400 albo 409 zamiast
500, a ich schematy leżą w `src/lib/validations/`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| 500 w preferencjach i `/api/recipes` | Naprawić w tej fazie | Cel fazy to „każdy limit kończy się 400”, a poprawka jest mała | Plan |
| Sufit tytułu przepisu na serwerze | 255 (literał bazy) | Usuwa 500 bez zmiany tego, co dziś przechodzi przez API (FR-014) | Plan |
| Przyszła data wpisu | Przypiąć 201 + opis w `known-drift.md` | Szanuje decyzję z archiwum o strefie czasowej, a lukę widać | Research + Plan |
| Identyfikator ponad int4 | Sufit 2147483647 w schematach | Domyka niezależnie od zachowania PostgREST, bez weryfikacji na bazie | Plan |
| Wartość preferencji | trim + 1–50, jeden schemat POST/PUT | Spójne z UI i edycją; pusta wartość nie trafia do promptu | Plan |
| Duplikat preferencji | 409 „Taka preferencja już istnieje” | Konflikt z istniejącym wierszem, nie błąd kształtu; czytelny toast | Plan |
| `1e3` | Unit testy parserów UI, nie trasy | Na granicy API JSON `1e3` to zwykła liczba 1000 | Research |
| Usunięcie przepisu → wpisy | Jest dowodzi tylko kodu; FK `set null` poza fazą | SQL wykluczony (§7), Playwright poza tą fazą | Research |

## Scope

**In scope:**
- wspólna atrapa wielu tabel i testy zachowania danych dla celu, dziennika, wyceny i DELETE
  preferencji i przepisu;
- testy granic tras dziennika i celu;
- sufit int4 identyfikatorów;
- testy `parseCalories` i `parsePortions`;
- naprawa tras preferencji i `/api/recipes` POST/PUT wraz z przeniesieniem schematów;
- dokumentacja: `known-drift.md`, `contract-surfaces.md`, test-plan §6.5 i §6.6.

**Out of scope:**
- reguła przyszłej daty na serwerze;
- dowód FK na bazie;
- sufity UI;
- atomowy limit 50 preferencji;
- trasy `/api/ai/*`;
- 500 z `details` w GET/POST dziennika;
- naprawa D5;
- alias `@tests` w Jest.

## Architecture / Approach

Prawdziwe trasy i serwisy działają na stanowej atrapie klienta Supabase z czterema tabelami
(`tests/helpers/supabase-tables.ts`). Test porównuje głęboką kopię tabel przed i po operacji i ma
kontrolę pozytywną. Naprawy idą wzorcem `user-settings`: `safeParse` + `zodIssues`,
`.catch(() => null)` na ciele i stałe 500. Każda poprawka ma test, który bez niej czerwienieje.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Atrapa i zachowanie danych (#5) | Dowód stanem, że cel i dziennik nie ruszają preferencji i przepisów; DELETE jednej preferencji zostawia resztę | Atrapa „za mądra” (emulowanie bazy) dawałaby tautologię |
| 2. Granice dziennika, celu, id (#6) | Testy granic na poziomie tras, sufit int4, parsery UI, przypięta przyszła data | Zmiana `entryIdSchema` dotyka trzech tras |
| 3. Preferencje | 400/409 zamiast 500, schemat w `validations/`, pierwsze testy tras | Zmiana kontraktu odpowiedzi widoczna w toaście `/profile` |
| 4. Przepisy POST/PUT | Sufity 255/5000/5000, 400 dla nie-JSON i id, 500 bez `details` | Nie przełączyć `test.failing` D5 |
| 5. Dokumentacja | `known-drift`, `contract-surfaces`, test-plan §6.5–§6.6 | — |

**Prerequisites:** fazy 1–2 test-planu zamknięte (są); lokalnie Node 24.13.0 i `npm ci`.
**Estimated effort:** ~3–4 sesje `/10x-implement` w 5 fazach.

## Open Risks & Assumptions

- Sufit int4 zakłada, że wszystkie identyfikatory to `serial` lub `integer`, co potwierdzają migracje.
  Hipotezy „PostgREST daje 500” nie zweryfikowano. Sufit domyka sprawę niezależnie od jej prawdziwości.
- Trim wartości preferencji zmienia unikalność: „wega” i „wega ” stają się duplikatem (409).
  Istniejące wiersze ze spacjami zostają, jak są.
- Zachowanie wpisów po usunięciu przepisu nadal nie ma automatycznego dowodu na bazie.

## Success Criteria (Summary)

- Każda operacja celu i dziennika ma test, który pada, gdy preferencje albo przepisy zmienią się
  choćby o jedno pole.
- Żaden twardy limit z inwentarza research nie kończy się 500. Granica przechodzi, a krok dalej daje 400.
- `/profile` i ekran przepisów działają jak przed zmianą, a duplikat preferencji daje czytelny komunikat.
