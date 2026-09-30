# Dzienny cel kaloryczny i postęp — Plan Brief

> Full plan: `context/changes/daily-goal-and-progress/plan.md`

## What & Why

Użytkownik ustawia w profilu opcjonalny dzienny cel kaloryczny jako liczbę wpisaną przez siebie
(FR-012) i widzi w dzienniku sumę dnia względem tego celu jako pasek postępu (FR-013). Cel ma
pokazać, gdzie użytkownik stoi w danym dniu. Przekroczenie celu nie może wyglądać jak błąd,
a preferencje żywieniowe muszą przetrwać zmianę nietknięte (FR-015). Roadmapa: S-06.

## Starting Point

Suma dnia istnieje (`DiaryDaySummary` + `summarizeDay`), razem z uczciwą adnotacją o wpisach bez
wartości. Założony w PRD i roadmapie „rekord profilu” nie istnieje: profil to strona, a preferencje
to osobne wiersze `preferences`, które w całości trafiają do promptu AI. W repo nie ma prymitywu
Progress ani tokenów dla paska.

## Desired End State

Profil ma kartę „Dzienny cel kaloryczny” z przyciskami „Zapisz” i „Usuń cel”. W dzienniku z celem
i co najmniej jednym wpisem pod sumą widać pasek i opis, na przykład:
- `450 / 2000 kcal · zostało 1550 kcal`;
- `· cel osiągnięty`;
- `· 300 kcal ponad cel`.

Przy przekroczeniu pasek jest pełny, w tym samym kolorze, bez czerwieni. Bez celu dziennik wygląda
jak dziś.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Gdzie żyje cel | Nowa tabela `user_settings` (PK `user_id`), RLS z 8 politykami, skrypt `supabase/checks` | `preferences` zostaje w 100% nietknięte, a cel nie wycieka do promptu AI ani do limitu 50 preferencji | Plan |
| Korekta PRD/roadmapy | „Pole na rekordzie profilu” = wiersz w `user_settings`; PRD nie jest przepisywany | Rekord profilu nie istnieje; korekta zapisana w `change.md` i planie | Plan (research) |
| Zakres celu | Liczba całkowita 500–10000, ta sama reguła w Zod i CHECK; `null` = brak celu | Odcina literówki bez oceniania diety | Plan |
| Przekroczenie | Pełny pasek w tym samym kolorze + neutralny opis „N kcal ponad cel” | Najprostsze spełnienie FR-013: podany fakt, bez oceny | Plan |
| Pusty dzień | Pusty stan jak dziś; pasek pojawia się z pierwszym wpisem | Zero zmian w gałęzi pustego stanu i w istniejących E2E | Plan |
| Niepełna suma | Pasek z sumy policzonej + dopisek; adnotacja „Bez policzonych…” zostaje | Spójne z FR-011: suma nigdy nie udaje pełnej | Plan |
| Komponent | `npx shadcn@latest add progress` (nowa zależność Radix) + tokeny `--progress` / `--progress-track` | Rozbudowuje istniejący system shadcn i daje dostępność Radix bez własnej implementacji | Plan |
| Dostarczenie celu do dziennika | Prop SSR z `diary.astro` przez `UserSettingsService`; błąd daje `null` | Pasek nie mruga przy ładowaniu, a dziennik działa bez celu | Plan |
| Bramka wizualna | Strona dev-only `/dev/diary-goal-states` + ręczne zrzuty (jasny, ciemny, 375 px) | Repo nie ma testów zrzutów; nie dokładamy ich | Plan (CLAUDE.md) |

## Scope

**In scope:**
- migracja `user_settings` + dowód RLS + typy;
- serwis, schemat i trasa `GET/PUT /api/user-settings`;
- karta celu w profilu;
- tokeny, prymityw Progress, `goalProgress`, `DailyGoalProgress` w karcie sumy;
- strona kitchen-sink;
- E2E profil → dziennik;
- wpisy w `AGENTS.md` i `contract-surfaces.md`.

**Out of scope:**
- jakakolwiek zmiana w `preferences` i `ai.service.ts` (także błąd kolorów `PreferenceChip`);
- kalkulator celu;
- `user_metadata`;
- pasek na pustym dniu;
- makroskładniki;
- statystyki wielu dni;
- `shadcn init`;
- testy `toHaveScreenshot`.

## Architecture / Approach

Przepływ celu:
- **zapis:** `DailyGoalCard` → `useDailyGoal` → `PUT /api/user-settings` → `UserSettingsService.setDailyGoal`
  (upsert po `user_id`) → `user_settings`;
- **odczyt:** `diary.astro` (frontmatter, `locals.supabase`) → `getDailyGoal` → prop `dailyGoal` →
  `DiaryPage` → `DiaryDaySummary` → `goalProgress` (czysta funkcja) → `DailyGoalProgress` (shadcn
  `Progress` na tokenach z `global.css`).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Magazyn celu | Tabela `user_settings`, RLS, skrypt checks, typy, rejestry | Upsert wymaga polityk INSERT i UPDATE naraz |
| 2. Serwis i trasa | `UserSettingsService`, schemat 500–10000, `GET/PUT` + testy | Rozjazd zakresu Zod i CHECK |
| 3. Cel w profilu | Karta z zapisem, usuwaniem i walidacją | Regułę `set-state-in-effect` łamie zasianie pola w efekcie |
| 4. Pasek w dzienniku | Tokeny, Progress, `goalProgress`, prop SSR, kitchen-sink | Nowa zależność w `audit-ci`; tekst celu w `diary-day-total` złamałby E2E |
| 5. E2E | Scenariusz profil → dziennik → przekroczenie → usunięcie | Cel konta testowego zostaje, jeśli sprzątanie zawiedzie |

**Prerequisites:** S-01 (done); dostęp do `supabase:push` / `supabase:gen` na zlinkowanym projekcie.
**Estimated effort:** ~2–3 sesje wieczorne w 5 fazach.

## Open Risks & Assumptions

- `npx shadcn@latest add progress` może dodać pakiet `radix-ui` zamiast `@radix-ui/react-progress`.
  Przyjmujemy to, co wskaże shadcn, pod warunkiem że przechodzi `test:security`.
- Cel jest jeden na wszystkie dni. Zmiana celu przepisuje pasek także dla dni minionych, bo cel
  nie jest historyzowany. Przyjęte, bo PRD nie wymaga historii celu.

## Success Criteria (Summary)

- Użytkownik ustawia, zmienia i usuwa cel w profilu, a preferencje działają dokładnie jak wcześniej.
- W dzienniku z celem widać pasek i opis względem celu; przekroczenie czyta się jako fakt, nie błąd.
- Bramki CI są zielone (lint, typecheck, format, audit, unit, E2E), a skrypt RLS kończy się `[PASS]`.
