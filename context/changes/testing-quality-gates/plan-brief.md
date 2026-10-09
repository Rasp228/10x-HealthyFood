# Bramki jakości — Plan Brief

> Full plan: `context/changes/testing-quality-gates/plan.md`
> Research: `context/changes/testing-quality-gates/research.md`

## What & Why

Faza 4 test-planu zabezpiecza poziom osiągnięty w fazach 1–3. Merge PR-a na `master` ma być
niemożliwy przy czerwonym CI. Agent ma dostawać wynik testów powiązanych z plikiem zaraz po
edycji. Bez tego czerwony test z faz 1–3 niczego nie zatrzymuje.

## Starting Point

`master` nie ma żadnej ochrony, a praca idzie push-em prosto na gałąź. Faza 3 (12 commitów) nie
przeszła jeszcze przez CI. `gh` nie jest zainstalowany. Hooka nie ma, a `.claude/` jest
ignorowane przez git.

## Desired End State

- Ruleset w repo wymaga PR-a i czterech zielonych checków. Czerwony PR został odrzucony przy
  próbie merge, i to w dwóch wariantach: czerwony test oraz czerwony etap wcześniejszy, po którym
  testy są pominięte.
- CI na wypchniętym `master` uruchamia 640 testów Jest i 13 Playwright. Niestabilność E2E jest
  zmierzona.
- Po edycji `.ts`/`.tsx` agent dostaje czerwone testy powiązane z plikiem w 2–7 s.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Push vs PR | PR wymagany, admin ma bypass `always` | Zachowuje dotychczasową pracę właściciela; bramka twardo chroni PR-y, a bezpośredni push jest świadomą luką | Plan |
| Wymagane checki | Wszystkie cztery: jakość, build, unit, E2E | Pominięty check liczy się jako zaliczony, więc same testy przepuszczają czerwony build | Research + Plan |
| Nazwy kontekstów | Polskie `name:` jobów, przypięte do GitHub Actions (15368) | Id jobów nie powstają jako konteksty, więc wymaganie `unit-tests` blokowałoby PR-y na zawsze | Research |
| Narzędzie | `gh` + `.github/rulesets/master.json` | Konfiguracja wersjonowana i sprawdzalna komendą | Plan |
| Dowód | Czerwony PR przy chwilowo zdjętym bypassie | Z bypassem admin mógłby zmergować, więc odmowa niczego by nie dowodziła | Plan |
| E2E | Wymagany, z pomiarem flaky w logach | 0 porażek E2E w 71 przebiegach, ale `retries: 2` może ukrywać niestabilność | Research + Plan |
| Hook | Minimalny `PostToolUse` → `jest --findRelatedTests`, porażka = exit 2 | Domyka §5 tanim sprzężeniem zwrotnym, mimo że hooki szerzej omawia Lekcja 3 | Plan |
| Miejsce hooka | Skrypt w `scripts/hooks/`, wpis lokalny w `.claude/settings.json` | `.claude/` jest ignorowane, a logika ma być przeglądalna w repo | Plan |

## Scope

**In scope:**
- Ruleset (plik + nałożenie)
- Dowód czerwonym PR-em
- Liczby testów i pomiar flaky z logów CI
- Skrypt hooka i jego lokalna rejestracja
- Dokumentacja: `AGENTS.md`, `contract-surfaces.md`, `known-drift.md`, test-plan §6.6–§6.7

**Out of scope:**
- Zmiany w `ci-cd.yml` (job zbiorczy, nazwy jobów)
- Obowiązkowa recenzja i wymóg aktualności gałęzi
- Naprawa flaky i drugie konto E2E
- Naprawa defektów `test.failing`
- Pełna suita w hooku, `.astro` w hooku
- Korekta §3–§5 test-planu (zrobi to `/10x-test-plan`)

## Architecture / Approach

GitHub ruleset na `refs/heads/master` składa się z czterech reguł: wymagany PR, wymagane cztery
checki, zakaz force-push i zakaz usunięcia gałęzi. Bypass ma rola admin. CI pozostaje bez zmian.

Lokalnie Claude Code po każdym `Edit`/`Write` uruchamia `node scripts/hooks/related-tests.mjs`
w formie exec. Skrypt filtruje pliki i uruchamia Jesta tylko dla testów powiązanych. Wynik
różny od 0 zamienia na exit 2 ze stderr dla agenta.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Baza CI i narzędzie | `gh`, wypchnięta faza 3, liczby testów i flaky z logów | Faza 3 czerwona w CI na Linuksie |
| 2. Ruleset w repo | `.github/rulesets/master.json` nałożony i sprawdzony | Literówka w kontekście = PR-y zablokowane na zawsze |
| 3. Dowód czerwonym PR-em | Odrzucony merge w dwóch wariantach, bypass przywrócony | Merge przechodzi mimo reguły → natychmiastowy revert |
| 4. Lokalny post-edit hook | Skrypt + wpis `PostToolUse`, 5 przypadków stdin | Spawn Jesta na Windows, lint `.mjs` |
| 5. Dokumentacja i cookbook | Kontrakty, konwencje, dryf, §6.7 i notatka fazy | — |

**Prerequisites:** konto z uprawnieniem admin do `Rasp228/10x-HealthyFood`; użytkownik instaluje
`gh`, robi `gh auth login` i `git push`.
**Estimated effort:** ~2 sesje w 5 fazach. Fazy 1–3 to głównie czekanie na CI (~10–15 min na
przebieg).

## Open Risks & Assumptions

- Bypass admina oznacza, że właściciel i agenci na jego poświadczeniach mogą dalej wprowadzić
  czerwony kod pushem albo `--admin`. Zostaje to opisane jako świadoma luka.
- Wspólne konto E2E: równoległe przebiegi mogą się wzajemnie wylogować. Ryzyko jest
  wywnioskowane, nie zaobserwowane, i zostaje opisane w `known-drift.md`.
- Id aplikacji GitHub Actions (15368) i rola admin (`actor_id: 5`) to wartości z dokumentacji
  GitHub. Faza 2 sprawdza pierwszą na check-runach.
- To, czy `file_path` w hooku jest absolutne, nie wynika jednoznacznie z dokumentacji, więc skrypt
  obsługuje oba warianty.

## Success Criteria (Summary)

- Próba merge czerwonego PR-a (test albo wcześniejszy etap) bez bypassu kończy się odmową GitHub.
- Zielony `master` w CI uruchamia tyle testów, ile lokalnie (640 / 13).
- Zepsuta edycja pliku z testami wraca do agenta jako komunikat hooka w kilka sekund.
