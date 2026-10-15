# Widoczność błędów produkcyjnych w dzienniku i wycenie kalorii AI — Plan Brief

> Full plan: `context/changes/observability-error-visibility/plan.md`
> Frame brief: `context/changes/observability-error-visibility/frame.md`
> Audyt (w roli research): `context/audits/observability/2026-10-14_diary-entries-ai-calorie-estimation.md`

## What & Why

> **The actual problem to plan around is**: błędy serwera w dzienniku i wycenie AI powstają, ale
> kod gubi je albo spłaszcza (RC2–RC6) zanim trafią do `console.*`, więc w godzinnym oknie
> Vercel logs nie ma czego czytać — a fałszywy sukces zapisu (RC1/D1) to osobny błąd kontraktu API,
> którego żaden log nie naprawia.

Plan sprawia, że każda awaria w tych obszarach zostawia w Vercel logs jedną czytelną linię
z przyczyną, kontekstem i identyfikatorem, który użytkownik może podać.

## Starting Point

Logowanie to ok. 66 surowych `console.error("<etykieta>:", error)`, bez wspólnego loggera,
`cause` i id żądania. Każda awaria OpenRoutera wygląda w logu jak `NetworkError`. „Brak wartości”
z modelu i awaria bazy w `GET /api/diary-entries` nie zostawiają żadnej linii (udowodnione
w runtime, R3/R6). Błędy przeglądarki nie opuszczają urządzenia.

## Desired End State

Każda ścieżka błędu w obszarze daje linię JSON `{level, event, requestId, userId, …, error:{name, code, status, cause}}`
z `env`/`commit`. Każde 500 ma stałe ciało z `requestId`. 401/429/404 dostawcy są w logu
odróżnialne i nie są ponawiane. Awaria GoTrue daje 503 zamiast „złe hasło”. Błąd w przeglądarce
trafia przez `/api/client-errors` do tego samego kanału, a `/diary` mówi „AI niedostępne”,
gdy model nie odpowiedział.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Zakres RC1 | Tylko log `getUser()`; 302 → 401 i fałszywy sukces (D1, D10, D3) osobną zmianą | Lepszy log nie zmienia tego, że UI kłamie, a zmiana wymaga uchylenia decyzji D2 | Frame |
| Retencja 1 h | Jawne założenie, bez trwałego zapisu | Właściciel dowiaduje się o błędzie w ciągu godziny | Frame |
| Faza przeglądarki | W zakresie, jako ostatnia | Zamyka E7/P5/P6, a fazy serwerowe wdrażają się wcześniej | Plan |
| Kształt logu | Jedna linia JSON przez `src/lib/utils/log.ts` | Jeden wpis w Vercel logs i filtrowanie po `event`/`userId` | Plan |
| Id żądania | `x-vercel-id`, a bez niego UUID; `locals.requestId`, log, ciało 500 | To samo id co wiersz żądania w panelu Vercela | Plan |
| „Brak wartości” z wyceny | Warn z powodem w serwisie, typ `number \| null` bez zmian | Kontrakt trasy i ~30 asercji zostają | Plan |
| Treść odpowiedzi modelu w logu | Tylko metadane (`reason`, `finish_reason`, `model`, długość) | Zero treści dziennika użytkownika w logach | Plan |
| Awaria GoTrue w auth | Błąd klienta jak dziś; 429 → 429; reszta → 503 + log | Użytkownik nie myśli, że ma złe hasło | Plan |
| Testowalność OpenRoutera | Mapowanie w `openrouter.errors.ts` bez `import.meta` | ts-jest nie ładuje plików z `import.meta` | Plan |

## Scope

**In scope:**
- RC2 (OpenRouter), RC3 (wycena), RC4 (błędy PostgREST), RC5 (4xx tylko dla klienta), RC6 (kontekst i `requestId`)
- log błędu `getUser()` i `try/catch` wokół `next()` w middleware
- ujście błędów przeglądarki, error boundary `/diary`, `500.astro`, stan „AI niedostępne”
- drobne: P8 health, P9 tabela `logs`, P10 zły JSON → 400, P11 bez ponawiania 504, E6, E12, D9
- przy okazji dwa wpisy known-drift w zmienianych liniach („Middleware”: niezakodowany `Location`; „`GET /api/recipes` oddaje przy 500 treść błędu w `details`”)

**Out of scope:**
- 302 → 401 dla `/api/*`, klient fałszywego sukcesu, D3
- trwały zapis błędów (tabela `logs`, log drain), error tracker
- zmiana typu zwracanego wyceny, treść odpowiedzi modelu w logach
- zachowanie `useSecurityGuard`, limity częstości, `fallbackTextParsing`

## Architecture / Approach

Jeden moduł `log.ts` serializuje dowolny błąd (także zwykły obiekt PostgREST) z łańcuchem `cause`
i dopisuje tożsamość wdrożenia. Middleware nadaje `requestId`. Serwisy rzucają opakowane błędy
(`dbError`, zmapowane `OpenRouterError` ze `status`/`model`). Trasy w `catch` logują z kontekstem
i oddają stałe ciało z `requestId`. Przeglądarka wysyła błędy beaconem do zalogowanej trasy, która
pisze je tym samym loggerem.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Moduł logowania, requestId, middleware | `log.ts`, `locals.requestId`, log `getUser()`, P7, kodowanie `Location` | `import.meta` w grafie łamie testy; `flushCookies` na nowym wyjściu |
| 2. OpenRouter | Jedno mapowanie, bez ponawiania 4xx, `status`/`model`/`cause` | Zmiana dotyka też tras przepisów AI |
| 3. Wycena kalorii | Walidacja koperty, warn z powodem, kontekst i `ms`, `AI_MISCONFIGURED` | Szum warnów przy częstych odmowach modelu |
| 4. Błędy bazy i kontekst tras | `dbError`, stałe 500 z `requestId`, błąd celu widoczny w `/diary` | Przepięcie trzech asercji kształtu logu |
| 5. 4xx tylko dla klienta + drobne | 503/429 w auth, 404 tylko `PGRST116`, `locals.user`, health, P9–P11 | Klasyfikacja błędów GoTrue |
| 6. Przeglądarka | `/api/client-errors`, handlery globalne, boundary, `500.astro`, „AI niedostępne” | Podwójna rejestracja przy `ClientRouter`; nowy endpoint z tekstem od klienta |

**Prerequisites:** harness prób z audytu (`.claude/worktrees/agent-a223709405b9fc6f4/probe/`) do weryfikacji R3/R5/R6; konto E2E na `integration`.
**Estimated effort:** ~6 sesji `/10x-implement`, po jednej na fazę; fazy 4 i 6 najdłuższe.

## Open Risks & Assumptions

- Retencja Hobby 1 h: kryterium „znajduję przyczynę w Vercel logs” działa tylko w tym oknie.
- `VERCEL_ENV`/`VERCEL_GIT_COMMIT_SHA` dostępne w runtime funkcji (niepotwierdzone, fallback `"local"`).
- D1 zostaje: po zmianie widoczny w logu, ale użytkownik nadal widzi toast sukcesu.
- `/api/client-errors` przyjmuje tekst od zalogowanego klienta, z limitem rozmiaru, bez limitu częstości.

## Success Criteria (Summary)

- Zgłoszenie „wycena nie działa” albo „nie wczytał się dzień” da się w godzinnym oknie wyjaśnić z jednej linii logu, znalezionej po `requestId` albo `userId`.
- Harness R3/R5/R6 i `/10x-observability-audit --verify` dają werdykt `good` tam, gdzie dziś jest `missed`/`poor`.
- Lint, typecheck, format, Jest i E2E zielone po każdej fazie.
