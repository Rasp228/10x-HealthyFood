# AI code review w CI/CD — Plan Brief

> Full plan: `context/changes/ci-cd-code-review/plan.md`
> Research: `context/changes/ci-cd-code-review/research.md`

## What & Why

Pierwszy workflow CI, który wydaje pieniądze: przy PR-ze do `master` agent `tools/code-reviewer` (OpenRouter)
ocenia diff wraz z tytułem i opisem PR-a. Publikuje komentarz z ocenami, etykietę `ai-cr:passed`/`ai-cr:failed`
i działa jako bramka. To realizacja M5L3 i źródło zrzutów do odznaki 10xChampion.

## Starting Point

Pakiet `tools/code-reviewer` działa lokalnie: diff na stdin, JSON na stdout, metryki i limity kosztu na stderr.
Kod wyjścia nie zależy od werdyktu, tytułu i opisu PR-a nie da się przekazać, a wspólna akcja
`.github/actions/setup-node` instaluje zależności tylko w katalogu głównym i przypina akcję tagiem.

## Desired End State

PR z gałęzi repo uruchamia job „AI code review”. Job aktualizuje jeden sticky komentarz (6 ocen, werdykt,
podsumowanie, metryki), ustawia dokładnie jedną etykietę `ai-cr:*` i kończy się na czerwono przy `fail`,
błędzie, przekroczonym budżecie, braku `REVIEW_MODEL` albo po 5 runach w ciągu doby. Etykieta `ai-cr:review`
wymusza ponowne review. PR-y z forków są pomijane.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Tytuł i opis PR-a | Env `REVIEW_PR_TITLE`/`REVIEW_PR_BODY`, osobne ogrodzenia, opis ≤ 4000 B poza limitem diffa | Kontekst intencji bez psucia lokalnego użycia i limitu diffa | Research + Plan |
| Instalacja w akcji | Rozszerzyć `setup-node` o `working-directory` | Jeden wzorzec instalacji; wartości domyślne chronią wymagane joby | Research |
| Pinowanie | SHA najnowszego v4 (checkout i setup-node v4.4.0) | Zero zmiany zachowania wymaganych jobów | Plan |
| Komentarz i etykiety | `gh` CLI w krokach `run:` | Bez kolejnej akcji do pinowania | Research |
| Klucz OpenRouter | Klucz aplikacji jako sekret repo | Decyzja właściciela; rotacja w dwóch miejscach | Research |
| Brak `vars.REVIEW_MODEL` | Czerwony job przed modelem, komentarz z przyczyną | Model wybiera właściciel, złe id nic nie kosztuje | Plan |
| Zakres diffa | Bez `**/package-lock.json` i `src/db/database.types.ts` | Pliki generowane wywracały limit 100 kB i koszt | Plan |
| Dzienny limit | Prosty licznik ≤5 nie-pominiętych runów/dobę UTC, 6. → czerwony; bez testów limitu | Kilka użyć w życiu, prostota ponad szczelność | Plan |
| Renderer komentarza | W pakiecie (`src/comment/`) z `node:test` | Typy schematu i testy zamiast logiki w YAML-u | Plan |
| Etykieta | Odzwierciedla wynik bramki; pusty diff bez zmian | Jedna reguła: czerwony job = `ai-cr:failed` | Plan |

## Scope

**In scope:**
- Wejście PR-owe i prompt agenta, renderer komentarza z testami
- `setup-node` z `working-directory` i pinem SHA
- `.github/actions/ai-reviewer/` i `.github/workflows/review.yml`
- Wpisy w `docs/reference/contract-surfaces.md`, testowy PR i zrzuty

**Out of scope:**
- Zmiany schematu werdyktu, `ci-cd.yml` i rulesetu; review przy pushu na `master`
- Upgrade akcji do v7, testy pakietu w CI, evale, `pull_request_target`, osobny klucz CI

## Architecture / Approach

`review.yml` (trigger, filtr forków i etykiety, uprawnienia, checkout z `fetch-depth: 0`) → `ai-reviewer`:
setup-node w `tools/code-reviewer` → etykiety → warunki wstępne bez kosztu (model, dzienny licznik przez
`gh api`) → `git diff` z wykluczeniami → `npm run --silent review` (kod wyjścia zapamiętany) → komentarz przez
`npm run --silent comment` i `gh api` → etykiety → krok bramki. Niezaufane dane tylko przez `env:`,
concurrency per PR na poziomie joba.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Pakiet — kontekst PR-a i renderer | Ogrodzone tytuł i opis, renderer komentarza, testy | Prompt bez kontekstu musi zostać bajt w bajt taki sam |
| 2. CI — setup-node, ai-reviewer, review.yml | Działający workflow PR-owy z bramką | Zmiana wspólnej akcji dotyka 4 wymaganych jobów |
| 3. Kontrakt i testowy PR | Wpisy w rejestrze, zweryfikowany przebieg, zrzuty | Pierwszy przebieg na prawdziwym modelu; limit 5 runów/dobę |

**Prerequisites:** sekret `OPENROUTER_API_KEY` i zmienna `REVIEW_MODEL` w repo (właściciel, przed fazą 3).
**Estimated effort:** ~2-3 sesje w 3 fazach.

## Open Risks & Assumptions

- Id modelu i obecność kosztu w odpowiedzi OpenRoutera są niesprawdzone. Bez kosztu limit `REVIEW_MAX_COST_USD` nie działa.
- Zakładamy, że run z samymi pominiętymi jobami ma `conclusion: skipped`. W przeciwnym razie licznik zawyża wynik (bezpieczny kierunek).
- Równoległe runy z dwóch PR-ów mogą przekroczyć limit o 1 (zaakceptowane).
- PR zmieniający tylko pliki wykluczone przechodzi bez review (job nie jest wymagany).
- Wyciek klucza z CI unieważnia klucz aplikacji (wspólny klucz z Vercel).

## Success Criteria (Summary)

- Testowy PR pokazuje komentarz LLM z ocenami, etykietę zgodną z werdyktem i linię metryk w logach.
- Kolejny push i etykieta `ai-cr:review` aktualizują ten sam komentarz.
- Wymagane checki „Test & Build Master” pozostają zielone po zmianie `setup-node`.
