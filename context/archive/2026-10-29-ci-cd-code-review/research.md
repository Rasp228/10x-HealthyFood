---
date: 2026-10-29T15:45:01+01:00
researcher: Claude (Opus 5.5) for Rasp228
git_commit: 9d223275104bb2287e5a2028bed1a0ee737e01be
branch: master
repository: Rasp228/10x-HealthyFood
topic: "ci-cd-code-review: wpięcie tools/code-reviewer w workflow GHA dla PR-ów do master (wg requirements.md)"
tags: [research, ci, github-actions, code-reviewer, openrouter]
status: complete
last_updated: 2026-10-29
last_updated_by: Claude (Opus 5.5)
last_updated_note: "Decyzje właściciela do Open Questions 1-7 (2026-10-29)"
---

# Research: AI code review w CI/CD (`ci-cd-code-review`)

**Date**: 2026-10-29T15:45:01+01:00
**Researcher**: Claude (Opus 5.5) for Rasp228
**Git Commit**: 9d223275104bb2287e5a2028bed1a0ee737e01be
**Branch**: master
**Repository**: Rasp228/10x-HealthyFood

## Research Question

Co w obecnym repo determinuje implementację wymagań z `context/changes/ci-cd-code-review/requirements.md`:
workflow `.github/workflows/review.yml` (trigger `pull_request` do `master`) wołający lokalną composite
action `.github/actions/ai-reviewer/`, która uruchamia `tools/code-reviewer` z OpenRouterem, publikuje
sticky komentarz, etykiety `ai-cr:passed`/`ai-cr:failed` i działa jako bramka.

## Summary

Pakiet da się wpiąć bez przepisywania agenta, ale cztery założenia wymagań nie zgadzają się z kodem
i plan musi je rozstrzygnąć:

1. **`verdict: fail` nie zmienia kodu wyjścia.** CLI kończy się `0` przy każdym wydrukowanym review
   (`tools/code-reviewer/src/index.ts:42-55`); kod `2` oznacza wyłącznie przekroczony budżet przy
   zgłoszonym koszcie (`index.ts:49-52`), `1` każdy wyrzucony błąd (`index.ts:57-62`). Bramkę na
   werdykcie musi zrobić akcja, parsując `.verdict` ze stdout.
2. **Tytułu i opisu PR-a nie da się dziś przekazać.** Jedynym wejściem jest stdin
   (`index.ts:24-40`), a cały stdin trafia do promptu jako `<diff>…</diff>`
   (`src/prompts/index.ts:17-20`) i liczy się do `REVIEW_MAX_DIFF_BYTES`
   (`src/agent/reviewer.ts:117-122`). Kanał na tytuł/opis wymaga zmiany modułu promptu — decyzja
   produktowa wobec zdania „agenta nie przepisujemy” (`requirements.md:9-10`).
3. **`.github/actions/setup-node/` nie nadaje się do ponownego użycia wprost.** Nie ma wejścia
   `working-directory`, robi `npm ci` w korzeniu i cache'uje po korzeniowym lockfile
   (`.github/actions/setup-node/action.yml:13-21`), a pakiet ma własny `package-lock.json`.
   Do tego przypina `actions/setup-node@v4` tagiem, wbrew wymogowi pinowania po SHA
   (`requirements.md`, „Ograniczenia i bezpieczeństwo”).
4. **`npm run review` brudzi stdout.** Nagłówek `> code-reviewer@0.1.0 …` npm 11.6.2 wypisuje na stdout
   (sprawdzone lokalnie na `npm run typecheck`), więc przechwycenie JSON wymaga
   `npm run --silent review` (albo `npx tsx src/index.ts`).

Reszta wymagań ma oparcie w kodzie: limity kosztu istnieją i są czytane z env, metryki idą na stderr
jako jedna linia `[review] {...}`, diff jest ogrodzony jako dane, pusty stdin kończy się błędem
(chroni przed złym zakresem diffa). Repo jest publiczne i nie ma jeszcze etykiet `ai-cr:*`.

## Detailed Findings

### Kontrakt CLI `tools/code-reviewer`

- Skrypty: `review` = `tsx src/index.ts`, `test` = `node --import tsx --test "tests/**/*.test.ts"`,
  `typecheck` = `tsc --noEmit` (`tools/code-reviewer/package.json:10-14`). `tsx` jest w
  `devDependencies` (`package.json:22-26`), więc `npm ci` nie może iść z `--omit=dev` /
  `NODE_ENV=production`. `engines.node >=22` (`package.json:7-9`); korzeniowy `.nvmrc` = 24.13.0.
  Pakiet ma własny `package-lock.json` (lockfileVersion 3), bez `postinstall`.
- Wejście: tylko stdin; TTY → pusty string (`index.ts:24-29`). Pusty lub same białe znaki →
  `stdin is empty…`, exit 1, chyba że `REVIEW_SAMPLE=1` (`index.ts:31-40`). CI nie może ustawiać
  `REVIEW_SAMPLE`. `createReviewer()` startuje przed odczytem stdin, więc błąd konfiguracji wychodzi
  od razu (`index.ts:42-45`).
- Wyjście: stdout = tylko JSON werdyktu (`JSON.stringify(result, null, 2)`, `index.ts:54`), wypisany
  po linii metryk, w ścieżce sukcesu. stderr = linia `[review] {provider, model, steps, input_tokens,
  output_tokens, total_tokens, cost, budget, duration_ms}` (`index.ts:48`; kolejność kluczy w
  `src/agent/reviewer.ts:56-67`), ewentualnie `budget exceeded` (`index.ts:50`) i
  `[review] failed: …` (`index.ts:60`). Przy błędzie po wywołaniu modelu (`ReviewError`) linia metryk
  też trafia na stderr (`index.ts:59`); błędy konfiguracji, pustego stdin i za dużego diffa jej nie
  mają.
- Kody wyjścia (wszystkie przez `process.exitCode`, bez `process.exit`):
  - `0` — review wydrukowane, niezależnie od `verdict`;
  - `2` — review wydrukowane, koszt > `REVIEW_MAX_COST_USD`; możliwe tylko przy niepustym `cost`
    (`index.ts:49-52`), czyli w praktyce OpenRouter;
  - `1` — każdy błąd z `main()` (`index.ts:57-62`); stdout pusty, więc komentarz musi mieć treść
    zastępczą.
- dotenv ładuje tylko `tools/code-reviewer/.env` (ścieżka z `import.meta.dirname`, `quiet: true`,
  `index.ts:18-22`); plik jest w `.gitignore`, na runnerze go nie ma, a dotenv nie nadpisuje
  zmiennych już ustawionych — env/sekrety z workflow wygrywają.

### Zmienne środowiskowe i limity kosztu

| Zmienna | Domyślnie | Źródło |
| --- | --- | --- |
| `REVIEW_PROVIDER` | `local` (inne niż `local`/`openrouter` → wyjątek) | `src/provider.ts:10,24-30` |
| `REVIEW_MODEL` | openrouter: `anthropic/claude-sonnet-5.5`; pusty string → domyślny | `provider.ts:12-16,35` |
| `OPENROUTER_API_KEY` | brak → wyjątek przed requestem (tylko przy openrouter) | `provider.ts:37-43` |
| `REVIEW_MAX_COST_USD` | 0.1 | `src/cost.ts:4,9-17` |
| `REVIEW_MAX_DIFF_BYTES` | 100000, sprawdzane przed requestem | `reviewer.ts:117-122` |
| `REVIEW_MAX_OUTPUT_TOKENS` | openrouter 8192 | `reviewer.ts:16-19` |
| `REVIEW_TIMEOUT_MS` | openrouter 120000 | `reviewer.ts:24-27` |

- CI musi jawnie ustawić `REVIEW_PROVIDER=openrouter` — bez tego pakiet celuje w
  `http://localhost:8080/v1` (`provider.ts:10-11`).
- Pusty `vars.REVIEW_MODEL` (zmienna nieustawiona w repo) da w `${{ vars.REVIEW_MODEL }}` pusty
  string, a ten spada na domyślny `anthropic/claude-sonnet-5.5` (`provider.ts:35`) — run nie wywróci
  się, tylko użyje modelu, którego właściciel nie wybrał. Poprawności tego id w OpenRouterze nie
  sprawdzano.
- Koszt pochodzi wyłącznie z raportu OpenRoutera (`usage: { include: true }`, `provider.ts:44-45`);
  pakiet nie ma tabeli cen, więc limit działa dla dowolnego `REVIEW_MODEL`, o ile OpenRouter zwróci
  koszt. Brak kosztu → `cost: null`, a limit nie zadziała (`cost.ts:44-51`, `index.ts:49`).
- `REVIEW_MAX_COST_USD` jest de facto sprawdzany po wywołaniu: bez narzędzi review to jeden krok,
  więc `costExceeds` nigdy nie zatrzyma płatnego wywołania (`cost.ts:44-48`). Z góry koszt jednego
  przebiegu ogranicza `REVIEW_MAX_DIFF_BYTES` + `REVIEW_MAX_OUTPUT_TOKENS` + `MAX_RETRIES = 1`
  (`reviewer.ts:21`). Uzasadnienie 8192 tokenów „pod 0.10 USD przy cenach klasy Sonnet”
  (`reviewer.ts:13-15`) zależy od modelu, który wybierze właściciel.

### Schemat i treść komentarza

- `src/review-schema.ts:9-54`: sześć ocen jako `z.number()` (zakres 1-10 tylko w opisie,
  `review-schema.ts:7-8`), `verdict: z.enum(["pass","fail"])`, `summary: z.string()` (Markdown).
- System prompt prosi o krótkie podsumowanie w 2-3 zdaniach i oceny nie trafiają do `summary`
  (`src/prompts/system-prompt.ts:9-10`) — jeśli komentarz ma pokazać oceny (wymaganie „komentarz
  z podsumowaniem i ocenami”), tabelę ocen musi wyrenderować akcja z pól JSON.
- Ochrona przed prompt injection: diff w `<diff>`, z escapowanym `</diff>` (`prompts/index.ts:15-20`),
  system prompt deklaruje diff jako dane (`system-prompt.ts:12-14`). Impl-review zaznacza, że
  bramka nie powinna polegać wyłącznie na `verdict`
  (`context/changes/tool-loop-agent/reviews/impl-review.md:49`).

### Istniejące `.github/`

- `.github/workflows/ci-cd.yml`: `name: Test & Build Master` (`:1`), uprawnienia na poziomie
  workflow `contents: read, checks: write, pull-requests: write` (`:4-7`), trigger `push` + 
  `pull_request` do `master` + `workflow_dispatch` (`:10-22`), concurrency
  `${{ github.workflow }}-${{ github.ref }}` z `cancel-in-progress` (`:25-27`). Nowy workflow z innym
  `name` dostanie osobną grupę — nie anuluje „Test & Build Master” i nie zostanie przez niego
  anulowany. Wszystkie zewnętrzne akcje są przypięte tagami `@v4` (`:38,77,132,146`).
- `.github/actions/setup-node/action.yml`: jedyne wejście `node-version-file` (`:4-8`),
  `actions/setup-node@v4` z `cache: "npm"` (`:13-17`), `npm ci` w korzeniu (`:19-21`). To wzór
  struktury composite action (`shell: bash` przy krokach `run`), nie gotowy krok do pakietu
  recenzenta.
- `.github/rulesets/master.json:40-57`: cztery wymagane konteksty = `name:` jobów z `ci-cd.yml`.
  Wymagania odkładają dodanie checka review do rulesetu („Na później”), więc ani ruleset, ani
  `ci-cd.yml` się nie zmieniają.
- Bramki formatowania: `prettier --file-info .github/workflows/ci-cd.yml` → `ignored: false`,
  parser `yaml`; `.prettierignore` nie wyklucza `.github/` ani `tools/code-reviewer`. Nowe
  `review.yml` i `action.yml` muszą więc przejść `npm run format:check` w jobie „Kontrola jakości
  kodu” (printWidth 120 z `.prettierrc.json`). ESLint YAML-a nie lintuje. Lokalny hook
  `scripts/hooks/lint-edited-file.mjs` formatuje `.yml` Prettierem.

### Stan repo na GitHubie (anonimowe API, 2026-10-29)

- Repo `Rasp228/10x-HealthyFood` jest publiczne (`visibility: public`) — forki są możliwe, więc
  warunek „PR z forka → job pominięty” ma realny przypadek.
- Etykiety: tylko 9 domyślnych (`bug`, `documentation`, `duplicate`, `enhancement`,
  `good first issue`, `help wanted`, `invalid`, `question`, `wontfix`). `ai-cr:passed`,
  `ai-cr:failed`, `ai-cr:review` nie istnieją.
- `gh` lokalnie nie jest zalogowany (`gh auth status` → not logged in), więc sekretów
  (`OPENROUTER_API_KEY`) i zmiennych (`REVIEW_MODEL`) repo nie dało się sprawdzić — luka poniżej.

### SHA do przypięcia akcji (rozwiązane przez API GitHuba 2026-10-29)

| Akcja | Najnowszy tag | SHA commita |
| --- | --- | --- |
| `actions/checkout` | v7.0.1 (2026-07-20) | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/setup-node` | v7.1.0 (2026-10-08) | `949feb2413d6458794dcd2491c4babbbce0c15c1` |
| `actions/github-script` | v9.0.0 (2026-04-09) | `3a2844b7e9c422d3c10d287c895573f7108da1b3` (tag adnotowany `d746ffe…` → commit) |

Zmian łamiących między `@v4` używanym w `ci-cd.yml` a tymi majorami nie sprawdzano; dotyczą tylko
nowego workflow. `actions/github-script` jest potrzebny tylko, jeśli komentarz/etykiety nie idą przez
`gh` (preinstalowany na `ubuntu-latest` — wiedza o platformie, niezweryfikowana w repo).

## Code References

- `tools/code-reviewer/src/index.ts:11-12` — dokumentacja kodów wyjścia 0/1/2
- `tools/code-reviewer/src/index.ts:31-40` — pusty stdin = błąd, `REVIEW_SAMPLE`
- `tools/code-reviewer/src/index.ts:48-54` — metryki na stderr, JSON na stdout
- `tools/code-reviewer/src/agent/reviewer.ts:12-27` — `MAX_STEPS`, `MAX_OUTPUT_TOKENS`, `MAX_RETRIES`, timeouty
- `tools/code-reviewer/src/agent/reviewer.ts:117-122` — limit bajtów diffa przed requestem
- `tools/code-reviewer/src/provider.ts:10-46` — wybór providera, model domyślny, klucz
- `tools/code-reviewer/src/cost.ts:44-51` — `costExceeds`, brak limitu przy `cost: null`
- `tools/code-reviewer/src/prompts/index.ts:15-20` — ogrodzenie diffa
- `tools/code-reviewer/src/review-schema.ts:9-54` — kontrakt JSON
- `.github/actions/setup-node/action.yml:13-21` — `npm ci` w korzeniu, pin tagiem
- `.github/workflows/ci-cd.yml:4-7,25-27` — uprawnienia i concurrency istniejącego workflow
- `.github/rulesets/master.json:40-57` — wymagane checki (bez zmian w tej zmianie)

## Architecture Insights

Wnioski z kodu i z wiedzy o platformie GitHub Actions (ta druga oznaczona; nie weryfikowana w repo):

- **Bramka w akcji, nie w CLI.** Naturalny podział: krok uruchamia `npm run --silent review`,
  zapisuje stdout do pliku, zapamiętuje kod wyjścia bez przerywania joba; kolejne kroki publikują
  komentarz i etykietę (dla 0 i 2 z JSON-a, dla 1 z treścią błędu ze stderr), a ostatni krok kończy
  job na czerwono przy `verdict == "fail"` lub kodzie ≠ 0. To spełnia „komentarz i etykieta są
  publikowane mimo to”.
- **Diff.** `actions/checkout` na `pull_request` pobiera merge commit PR-a; `git diff
  origin/<base>...HEAD` wymaga `fetch-depth: 0` (lub dociągnięcia bazy), inaczej zakres jest pusty
  i CLI zwróci exit 1 — co już jest zamierzonym zachowaniem pakietu (`index.ts:8-9`). Zmiany
  w `package-lock.json` liczą się do 100 kB limitu; wykluczenie ich pathspec-iem to decyzja planu.
- **Niezaufane dane.** Tytuł, opis, nazwa gałęzi i diff do `run:` tylko przez `env:`
  (wymaganie). Istniejący `ci-cd.yml:172-177` interpoluje `${{ needs.*.result }}` w `run:` — to
  wartości kontrolowane przez GitHuba, nie wzorzec do kopiowania dla danych PR-a.
- **Forki (platforma).** Na `pull_request` z forka sekrety są puste, a `GITHUB_TOKEN` tylko do
  odczytu; warunek joba typu `github.event.pull_request.head.repo.full_name == github.repository`
  pomija job zamiast go wywracać. `pull_request_target` nie jest potrzebny i niesie ryzyko
  uruchomienia kodu z forka z sekretami — repo nie ma precedensu żadnego z nich.
- **Etykieta `ai-cr:review` (platforma).** Wymaga `types: [opened, synchronize, reopened, labeled]`
  i filtra `github.event.label.name == 'ai-cr:review'` dla zdarzenia `labeled` — inaczej nadanie
  `ai-cr:passed`/`failed` też odpaliłoby płatne review. Etykiety nadane przez `GITHUB_TOKEN` nie
  wyzwalają nowych runów workflow. Dodanie nieistniejącej etykiety przez API tworzy ją w domyślnym
  kolorze, więc kolory czerwony/zielony wymagają jawnego utworzenia (np. `gh label create --force`).
- **Sticky komentarz.** Aktualizacja zamiast dopisywania wymaga stałego znacznika (np. ukryty
  komentarz HTML) i wyszukania istniejącego komentarza po nim; nazwa znacznika staje się nową
  powierzchnią kontraktu.
- **Koszt na zdarzenie.** Każdy `synchronize` (push do PR-a) to płatny przebieg. Concurrency per PR
  (`${{ github.workflow }}-${{ github.event.pull_request.number }}`) z `cancel-in-progress` ogranicza
  równoległe runy, ale anulowany run, który już wysłał request, i tak jest rozliczany.
- **Minimalne uprawnienia.** Wymagania: `contents: read`, `pull-requests: write`, `issues: write`
  (etykiety). `checks: write` z `ci-cd.yml` nie jest tu potrzebne.

## Historical Context (from prior changes)

- `context/changes/tool-loop-agent/reviews/impl-review.md:11` — poprawki z triage'u „matter before
  using the reviewer as a CI gate in M5L3”; wprowadzone w `91e12ed` (limit bajtów diffa, exit 2,
  ogrodzenie diffa, metryki przy błędzie, timeouty, `MAX_RETRIES=1`, pusty stdin jako błąd).
  Wspierane przez obecny kod (kotwice wyżej).
- `context/changes/tool-loop-agent/reviews/impl-review.md:117` — po poprawkach nie było przebiegu na
  prawdziwym modelu. Nadal aktualne: pierwszy przebieg na OpenRouterze będzie w testowym PR-ze.
- `context/changes/tool-loop-agent/plan.md:45-46` — evale/promptfoo poza zakresem; zgodne
  z `requirements.md` („Na później”: `code-review-evals`).
- `context/archive/2026-10-07-testing-quality-gates/research.md:31-32` — pułapka `skipped`
  w wymaganych checkach; dotyczy dopiero, gdy review trafi do rulesetu (odłożone).
- `context/archive/2026-10-07-testing-quality-gates/research.md:60` — sekrety nie trafiają do runów
  z forka; tam „nie dotyczy (brak forków)”. Repo jest jednak publiczne, więc tutaj dotyczy.
- `context/archive/2026-09-23-ai-estimate-for-free-text/plan-brief.md:47,116` i
  `context/foundation/test-plan.md:86` — dotąd żaden test ani job CI nie woła OpenRoutera. To pierwszy
  job CI, który wydaje pieniądze.
- `context/foundation/infrastructure.md:98,100` — `OPENROUTER_API_KEY` aplikacji żyje w Vercel;
  rotacja tylko ręcznie przez człowieka. Brak decyzji, czy CI używa tego samego klucza.
- Commit `87affa9` wyłączył pakiet z korzeniowego ESLint (`eslint.config.js:121-123`) i tsconfig.
  Komentarz twierdzi, że pakiet jest lintowany ze swojego katalogu, ale pakiet nie ma ani ESLint,
  ani skryptu `lint` — twierdzenie nieaktualne. Testy i typecheck pakietu nie są uruchamiane w żadnym
  jobie CI; `test:security` audytuje tylko korzeniowy lockfile.

## Related Research

- `context/archive/2026-10-07-testing-quality-gates/research.md` — ruleset, wymagane checki, sekrety.
- `context/changes/tool-loop-agent/plan.md` i `reviews/impl-review.md` — kontrakt CLI recenzenta.

## Open Questions

Decyzje dla `/10x-plan` (wymagają właściciela):

1. **Tytuł i opis PR-a** (oznaczone „??” w wymaganiach): (a) pominąć w v1, (b) dodać do pakietu osobny
   kanał (np. env `REVIEW_PR_TITLE`/`REVIEW_PR_BODY` z własnym ogrodzeniem w prompcie i własnym limitem
   bajtów) — to zmiana agenta, (c) doklejać do stdin — odrzucane: trafia do `<diff>` i limitu bajtów.
2. **Instalacja zależności w akcji:** rozszerzyć `setup-node` o `working-directory` (zmienia akcję
   używaną przez wymagane joby) czy osobne kroki w `ai-reviewer` z SHA-pinem i
   `cache-dependency-path: tools/code-reviewer/package-lock.json`.
3. **Komentarz/etykiety:** `gh` CLI w `run:` czy `actions/github-script` (kolejna akcja do pinowania).
4. **Limity w CI:** wartości `REVIEW_MAX_COST_USD` / `REVIEW_MAX_DIFF_BYTES` w workflow oraz czy
   wykluczać `package-lock.json` z diffa.
5. **Klucz OpenRouter:** osobny klucz z limitem wydatków dla CI czy klucz aplikacji; sekret repo
   (jak w wymaganiach) — `infrastructure.md` nie ma tej decyzji.
6. **Brak `vars.REVIEW_MODEL`:** cicho użyć domyślnego modelu pakietu czy kończyć job błędem.
7. **Rejestracja kontraktu:** czy wpisać etykiety `ai-cr:*`, znacznik komentarza, `vars.REVIEW_MODEL`
   i sekret do `docs/reference/contract-surfaces.md` (konwencja projektu dla nazw nośnych).

Luki dowodowe: istnienie sekretu `OPENROUTER_API_KEY` i zmiennej `REVIEW_MODEL` w repo oraz
ustawienie „Workflow permissions” repo — niesprawdzone (brak zalogowanego `gh`). Ważność id
`anthropic/claude-sonnet-5.5` w OpenRouterze — niesprawdzona.

## Follow-up 2026-10-29: decyzje właściciela

Odpowiedzi na Open Questions 1-7. Pytania 1-5 i 7 są rozstrzygnięte; zastępują warianty opisane
wyżej, reszta ustaleń pozostaje bez zmian.

1. **Tytuł i opis PR-a: przekazywać.** Pakiet nie ma na nie kanału (`src/index.ts:24-40`,
   `src/prompts/index.ts:17-20`), więc zmiana obejmuje agenta. Zgodnie z twardą regułą z CLAUDE.md
   kolejność to: wejście → prompt → akcja. Schemat werdyktu (`review-schema.ts`) się nie zmienia, bo
   dochodzi tylko wejście. Tytuł i opis to niezaufane dane, tak samo jak diff: każde we własnym
   ogrodzeniu z escapowanym tagiem zamykającym (wzór: `prompts/index.ts:15-20`), oznaczone w system
   prompcie jako dane (`system-prompt.ts:12-14`), z własnym limitem bajtów albo wliczone do budżetu
   wejścia. Odpowiada to wariantowi (b); wariant (c), czyli doklejanie do stdin, jest odrzucony.
   Zdanie z wymagań „agenta nie przepisujemy” (`requirements.md:9-10`) obowiązuje więc z tym jednym
   wyjątkiem.
2. **Instalacja: rozszerzyć `.github/actions/setup-node/`** o wejście katalogu roboczego (`npm ci`
   w tym katalogu i `cache-dependency-path` na jego lockfile). Akcji używają cztery wymagane joby
   (`ci-cd.yml:40-43,68-71,94-97,126-129`). Wartości domyślne muszą zachować dzisiejsze zachowanie
   (katalog główny, `.nvmrc`), inaczej wywrócą się wymagane checki. Wymóg pinowania po SHA dotyczy też
   `actions/setup-node@v4` wewnątrz tej akcji (`action.yml:14`). Przepięcie zmienia jednak przy okazji
   środowisko wszystkich wymaganych jobów. To osobne ryzyko do świadomej decyzji w planie: przypiąć SHA
   tagu v4 czy wejść na v7.1.0 (`949feb2…`).
3. **Komentarz i etykiety: prostsza opcja, czyli `gh` CLI w krokach `run:`.** `GH_TOKEN: ${{ github.token }}`
   przez `env:`, bez `actions/github-script`. Do pinowania zostają tylko `checkout` i `setup-node`.
4. **Twardy limit: 5 przebiegów review dziennie.** To nowe wymaganie, którego nie ma
   w `requirements.md`. GitHub Actions nie ma wbudowanej dziennej kwoty runów (wiedza o platformie).
   Klucz OpenRouter jest wspólny z aplikacją (pkt 5), więc limit wydatków na kluczu też odpada: zablokowałby
   aplikację. Limit musi więc egzekwować sam workflow, przed płatnym krokiem: policzyć dzisiejsze runy
   `review.yml` przez API (np. `gh run list --workflow review.yml --created ">=<dzień UTC>"`;
   istnienia flagi `--created` w wersji `gh` na runnerze nie sprawdzano) i przy przekroczeniu nie
   wołać modelu. Konsekwencja: potrzebne jest uprawnienie `actions: read`, którego nie ma na liście
   minimalnych `permissions` w wymaganiach. Do doprecyzowania w planie: czy liczą się wszystkie runy
   czy tylko te, które doszły do wywołania modelu (pominięte z forka, z pustym diffem albo
   z odrzuconą konfiguracją nic nie kosztują); granica doby (UTC); reakcja na 6. przebieg (komentarz
   „limit wyczerpany” i czerwony albo pominięty job). Równoległe runy mogą jednocześnie zobaczyć
   licznik 4 i oba przejść. Ogranicza to concurrency (jeden run naraz w repo), a nie per PR.
   Limity pojedynczego przebiegu (`REVIEW_MAX_COST_USD`, `REVIEW_MAX_DIFF_BYTES`) zostają przy
   wartościach domyślnych pakietu, chyba że plan zdecyduje inaczej. Wykluczenie `package-lock.json`
   z diffa pozostaje otwarte.
5. **Klucz OpenRouter: ten sam co aplikacji**, jako sekret repo `OPENROUTER_API_KEY`. Konsekwencje:
   wydatki CI i aplikacji idą z jednego klucza i jednego limitu. Rotacja klucza, która jest wyłącznie
   ręczna (`context/foundation/infrastructure.md:100`), musi od teraz objąć dwa miejsca: Vercel
   i sekret GitHuba. Wyciek z CI unieważnia klucz aplikacji. Ochrona przed wyciekiem: sekret tylko
   w `env:` kroku review, bez PR-ów z forków (job pominięty) i bez `pull_request_target`.
6. **Brak `vars.REVIEW_MODEL`: do doprecyzowania.** Bez decyzji obowiązuje zachowanie pakietu:
   pusty string oznacza model domyślny `anthropic/claude-sonnet-5.5` (`provider.ts:35`). Plan musi
   to rozstrzygnąć albo zostawić jawnie jako otwarte.
7. **Rejestracja kontraktu: tak.** Do `docs/reference/contract-surfaces.md` trafiają etykiety
   `ai-cr:passed` / `ai-cr:failed` / `ai-cr:review`, znacznik sticky komentarza,
   `vars.REVIEW_MODEL`, sekret `OPENROUTER_API_KEY` w GHA (wspólny z Vercel, rotacja w dwóch
   miejscach), nowe wejście `setup-node` oraz mechanizm dziennego limitu. Dla każdego trzeba opisać,
   co się psuje, gdy nazwa się przesunie.

Nadal otwarte: pkt 6, wykluczenie lockfile z diffa i szczegóły dziennego limitu (pkt 4). Luki
dowodowe są bez zmian: istnienie sekretu i zmiennej w repo oraz id modelu w OpenRouterze.
