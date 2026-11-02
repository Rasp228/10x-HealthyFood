# Wymagania: AI code review w CI/CD (M5L3)

## Koncepcja

- Osobny workflow GHA (`.github/workflows/review.yml`), uruchamiany przy pull requeście do `master`.
- Samo review wydzielone do lokalnej composite action (`.github/actions/ai-reviewer/`), żeby
  główny workflow dało się łatwo zrozumieć. Wzór lokalnej akcji jest już w repo:
  `.github/actions/setup-node/`.
- Akcja uruchamia istniejący pakiet `tools/code-reviewer` (`npm ci` + `npm run review`, diff na
  stdin). Agenta nie przepisujemy, tylko go wpinamy.

## Decyzje (2026-10-29)

- **Model: OpenRouter.** `REVIEW_PROVIDER=openrouter`, klucz w sekrecie repo `OPENROUTER_API_KEY`.
  Runner GitHuba nie widzi lokalnego llama-servera. Model (`REVIEW_MODEL`) wybiera właściciel repo
  i ustawia jako zmienną repo (`vars.REVIEW_MODEL`), nie w kodzie.
- **Trigger: tylko `pull_request` do `master`.** Pushe na `master` zostają bez zmian: review ich nie
  dotyczy, a `ci-cd.yml` i `.github/rulesets/master.json` się nie zmieniają. Działanie sprawdzamy
  testowym PR-em (lub kilkoma), z którego pochodzą zrzuty do odznaki 10xChampion: widok
  pipeline'u z jobem, logi joba, komentarz LLM na PR.

## Dane wejściowe

- tytuł PR-a,
- opis PR-a (?? kompromis kosztowy: więcej tokenów, ale też kontekst intencji),
- `git diff origin/<base>...HEAD` (checkout z `fetch-depth: 0`, inaczej diff jest pusty).

## Kryteria code review

Kontraktem jest `tools/code-reviewer/src/review-schema.ts`. Sześć ocen w skali 1–10 (1 to najgorszy
wynik, 10 najlepszy): `implementationCorrectness`, `idiomaticity`, `complexity`,
`testRiskCoverage`, `documentation`, `securitySafety`, do tego `verdict` (`pass`/`fail`) i
`summary` (Markdown, gotowy jako komentarz do PR-a). Zmiana kryteriów zaczyna się od schematu
(twarda reguła z CLAUDE.md).

## Na później

- dopasowanie biznesowe (wymaga szerszego kontekstu),
- dopasowanie architektoniczne (wymaga szerszego kontekstu),
- evale promptfoo i porównanie modeli: osobna zmiana `code-review-evals`,
- review uruchamiane przy pushu na `master`,
- dodanie checka review do wymaganych w rulesecie.

## Oczekiwane efekty uboczne

- komentarz w PR z podsumowaniem i ocenami; przy kolejnym przebiegu ten sam komentarz jest
  aktualizowany, a nie dopisywany nowy,
- etykiety `ai-cr:failed` (czerwona) ALBO `ai-cr:passed` (zielona), wzajemnie wykluczające się,
- linia metryk `[review] {...}` (tokeny, koszt, budżet) w logach joba.

## Oczekiwane zachowanie

- ponowne review na żądanie po dodaniu etykiety `ai-cr:review`,
- `verdict: fail` kończy job na czerwono (bramka); komentarz i etykieta są publikowane mimo to,
- przekroczony budżet (kod wyjścia 2) albo błąd modelu (kod 1) też kończy job na czerwono, z
  czytelnym komunikatem.

## Ograniczenia i bezpieczeństwo

- Twardy limit kosztu przed uruchomieniem bez nadzoru (CLAUDE.md): `REVIEW_MAX_COST_USD`,
  `REVIEW_MAX_DIFF_BYTES`, `REVIEW_MAX_OUTPUT_TOKENS`, `REVIEW_TIMEOUT_MS` już istnieją w pakiecie.
- Tytuł, opis i diff to niezaufane dane: do kroków `run:` trafiają przez `env:`, nigdy przez
  interpolację `${{ }}` w treści skryptu (script injection).
- Akcje zewnętrzne przypięte do SHA commita, nie do tagu.
- Minimalne `permissions` tokenu (`contents: read`, `pull-requests: write`, `issues: write` dla
  etykiet).
- PR z forka nie dostaje sekretów: job ma się wtedy pominąć, a nie wywrócić.
