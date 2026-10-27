---
title: "10x-HealthyFood — Anti-Corruption Layer wokół dostawcy modelu (OpenRouter)"
created: 2026-10-26
type: refactor-plan
---

# ACL: brama do dostawcy modelu

To jest plan refaktoru. Nie zmienia kodu produkcyjnego. Zmiana przechodzi przez `/10x-new` → `/10x-research` →
`/10x-plan` → `/10x-implement`, a fazy czyste idą test-first przez `/10x-tdd`. Terminy pochodzą z
`context/domain/glossary.md`: „generator przepisów” (`AIService`), „wycena” (`CalorieEstimationService`), „log akcji
AI” (`logs`). Identyfikatory `S-`, `N-`, `R-` odsyłają do `context/domain/01-domain-distillation.md`. Każdy cytat
`plik:linia` sprawdziłem w tej sesji. Kontrakt dostawcy sprawdziłem w dokumentacji OpenRouter
(Structured Outputs, API Reference → Errors) 2026-10-26.

## Krok 0: kontekst

| Źródło | Co z niego wynika |
| --- | --- |
| `.ai/tech-stack.md:16-18` | „Komunikacja z modelami przez usługę Openrouter.ai: dostęp do szerokiej gamy modeli (…), które pozwolą nam **znaleźć rozwiązanie zapewniające wysoką efektywność i niskie koszta**”. To deklaracja wymienialności: model ma się dać zmieniać. |
| `context/foundation/prd.md:24,29` | Supabase to celowo „the only backend product”. Do modelu prowadzi „model-routing service” z tego samego serwera (OpenRouter). |
| `context/foundation/infrastructure.md:109` | Mitygacja ryzyka H (pauza Vercela): twardy limit prób w wywołaniach OpenRoutera, osadzony w `ai.service.ts`. Polityka ponowień jest więc decyzją projektu, a nie detalem biblioteki. |
| `01-domain-distillation.md:129` | S-H „Brama do dostawcy modelu (OpenRouter)” to subdomena **Generic** i „kandydat na ACL”. |
| `glossary.md` (słowa wieloznaczne) | „AI / model” to dwa konteksty: generator przepisów i wycena kalorii. Oba korzystają z tej samej bramy. |

**Stack:** Astro 7 SSR, React 19, Supabase, Zod 4, OpenRouter przez `axios` (`package.json`). **Zależności
zewnętrzne w `src/`:** `@supabase/supabase-js` i `@supabase/ssr`, `zod`, `axios`, `cookie`, a do tego OpenRouter jako
usługa HTTP. **Warstwy:** trasy `src/pages/api/`, serwisy `src/lib/services/`, klienci `src/lib/api/`, utils,
walidacje oraz UI (`src/components`, `src/hooks`).

## Krok 1: zależności, które przeciekają

### A. OpenRouter i axios (brama modelu)

| Warstwa | Plik:linia | Co wie o dostawcy |
| --- | --- | --- |
| Klient | `src/lib/api/openrouter.service.ts:2-3,26,57-68,160` | axios, URL, nagłówki atrybucji `HTTP-Referer`/`X-Title`, `/chat/completions` |
| Klient | `openrouter.service.ts:34-44,54` | `import.meta.env.OPENROUTER_API_KEY`, domyślny model `nvidia/nemotron-3-ultra-550b-a55b:free`, `retries` liczy **próby**, a `0` cicho zamienia się w `2` |
| Klient | `openrouter.service.ts:128` | `response_format: { type: "json_object", schema }` |
| Typy | `src/lib/api/openrouter.types.ts:80-97` | `ChatResponse`: koperta OpenAI (`choices[0].message.content`, `finish_reason`, `usage`) |
| Typy | `openrouter.types.ts:121-189` | hierarchia `OpenRouterError` (9 klas) |
| Typy | `openrouter.types.ts:193-219` | własna deklaracja `AxiosResponse`/`AxiosRequestConfig`/`AxiosInstance`. Nikt jej nie importuje; to martwy shim wbrew regule „Do not re-declare types” z `AGENTS.md` |
| Błędy | `src/lib/api/openrouter.errors.ts:27-44,51-86,126-148` | czytanie błędu axios, mapowanie statusów, bramka koperty 200 |
| Utils | `src/lib/utils/models-manager.ts:1,20,29,62` | drugi klient axios do `/models`. **Nikt go nie importuje** (grep w `src` i `tests`) |
| Serwis | `src/lib/services/ai.service.ts:9-11,39-61,67,78-93,114,184,188,228,296,300,345-350,409-425` | budowa klienta, `JSONSchema`, stanowe `setModel`/`setResponseFormat`, `ChatResponse`, `response.model` |
| Serwis | `src/lib/services/calorie-estimation.service.ts:1-3,66-111,120,125-134,162,192,212-240` | budowa klienta, wiedza o konkretnym modelu (nemotron ignoruje `response_format`), `ChatResponse` |
| API | `src/pages/api/ai/generate-recipe.ts:4,70` | `instanceof OpenRouterError` → 502 |
| API | `src/pages/api/ai/modify-recipe.ts:4,107` | to samo |
| API | `src/pages/api/diary-entries/[id]/estimate.ts:7,157,162,168` | to samo, a do tego `error.model`, `error.status`, `error.code === "AI_MISCONFIGURED"` |
| API | `src/pages/api/ai/save-recipe.ts:159,194` | `new AIService(...)` tylko po to, żeby zaktualizować log akcji AI. Konstruktor buduje przy tym klienta OpenRoutera (`ai.service.ts:75`) |
| Kontrakt wire | `src/types.ts:72,81` | `ai_model: string` w `GeneratedRecipeDto`/`ModifiedRecipeDto`, czyli slug modelu dostawcy wysyłany do przeglądarki. UI go nie czyta (grep `ai_model` w `src/components`, `src/hooks`: 0 trafień) |
| Persystencja | `ai.service.ts:666-667` | `logs.actual_ai_model` = `response.model` |
| Env | `src/env.d.ts:23` | `OPENROUTER_API_KEY` |
| Testy | `tests/unit/{ai-generate-recipe-route,ai-modify-recipe-route,ai-save-recipe-route,ai-service,calorie-estimation.service}.test.ts` (`jest.mock("@/lib/api/openrouter.service")`), `diary-estimate-route.test.ts:11`, `openrouter-errors.test.ts` | 7 plików testów mockuje ścieżkę modułu dostawcy albo importuje jego klasy błędów |

Łącznie: **11 plików produkcyjnych** (bez martwego `models-manager.ts`) w **pięciu warstwach** (klient, serwis, API,
kontrakt wire i persystencja), plus 7 plików testów.

### B. Supabase (`@supabase/supabase-js`)

`SupabaseClient` siedzi w sygnaturach serwisów (`ai.service.ts:12`, `diary.service.ts:8`,
`user-settings.service.ts:1`) i w `src/env.d.ts:3`. Predykaty błędów są w `src/lib/utils/auth-errors.ts:1` i
`src/middleware/index.ts:1`. Wszystko zostaje po stronie serwera, a jedyny klient powstaje w jednym miejscu
(`supabase.client.ts`, `contract-surfaces.md` „Request pipeline”).

### C. Zod

Zod jest w 5 komponentach UI (`ResetPasswordForm.tsx:2`, `SimpleChangePasswordForm.tsx:2`, `AuthDialog.tsx:2`,
`ProfilePage.tsx:11`, `RecipeFormModal.tsx:2`), w 4 trasach (`generate-recipe.ts:1`, `modify-recipe.ts:1`,
`save-recipe.ts:1`, `update-password.ts:2`) i w `src/lib/validations/**`. Wyjście błędów do klienta ma już swoją
jedną bramę: `validation-errors.ts`.

### D. `cookie`

Jeden plik (`supabase.client.ts:1`), a jego obecność wymusza kontrakt opisany w `AGENTS.md`.

## Krok 2: klasyfikacja i wybór

| Zależność | (a) warstwy / pliki | (b) ryzyko i koszt wymiany dziś | (c) dokumenty o wymienialności | Werdykt |
| --- | --- | --- | --- | --- |
| **A. OpenRouter + axios** | 5 warstw, 11 plików + 7 testów | **wysokie**: zmiana modelu albo dostawcy rusza oba serwisy domenowe, 3 trasy i testy. Wiedza o jednym konkretnym modelu siedzi w serwisie wyceny (`calorie-estimation.service.ts:125-134`) | **tak**: `.ai/tech-stack.md:16-18` („znaleźć rozwiązanie… niskie koszta”), S-H „kandydat na ACL” | **#1** |
| B. Supabase | 3 serwisy + env + middleware | wymiana jest bardzo droga, ale **celowo nieplanowana** | **przeciwnie**: „the only backend product” (`prd.md:24`) | konformista z wyboru; bez ACL |
| C. Zod | UI + walidacje + 4 trasy | niskie: biblioteka izomorficzna, wyjście ma już ACL (`zodIssues`) | brak | drift konwencji (schematy inline, `known-drift.md`), nie ACL |
| D. cookie | 1 plik | niskie | brak | już odizolowane |

**Wybór: A, brama do dostawcy modelu.** Tylko tu dokument zapowiada wymienialność, a kod jej nie dotrzymuje. To
jedyna zależność, której typy (`OpenRouterError`, `ChatResponse`) przechodzą przez **trzy** granice naraz: z
klienta do serwisu domenowego, z serwisu do trasy i z trasy do kontraktu wire (`ai_model`). Dziś „zmiana modelu na
tańszy”, czyli zamiar z `tech-stack.md`, wymaga edycji wiedzy o modelu w serwisie wyceny, a nie w jednym miejscu
konfiguracji.

## Krok 3: diagnoza

### 3.1 Deklaracja wymienialności vs. kod

`.ai/tech-stack.md:18` obiecuje swobodny wybór modelu. Kod tymczasem:

- zaszywa model w domyślnej wartości klienta (`openrouter.service.ts:44`), a zachowanie wyceny opiera na jego
  właściwościach. Komentarz `calorie-estimation.service.ts:125-130` mówi wprost, że `setResponseFormat` nie jest
  wołane, bo **ten** model nie deklaruje `response_format` i psuł odpowiedź (`{"calories{": 600}`). Po zmianie
  modelu ta decyzja jest nieważna, a leży w serwisie domenowym.
- `AIService` woła `setResponseFormat` dla każdego modelu (`ai.service.ts:93`), także dla tego samego nemotrona,
  dla którego serwis wyceny ustalił, że parametr szkodzi. Dwa serwisy mają dwie sprzeczne wiedze o jednym modelu.

### 3.2 Duplikacja

| Co | Kopia 1 | Kopia 2 |
| --- | --- | --- |
| Budowa klienta (`apiKey: ""`, `timeout: 55_000`, `retries: 1`, mapowanie braku klucza na `OpenRouterError`) | `ai.service.ts:39-61` (komentarz: „Ten sam kształt co `createEstimationClient`”) | `calorie-estimation.service.ts:66-111` |
| Wyłuskanie JSON z odpowiedzi modelu rozumującego (najpierw ogrodzenie ```` ```json ````, potem ostatni `{…}`) | `ai.service.ts:409-425` | `calorie-estimation.service.ts:232-240`. Komentarz `:205-206`: „te kilkanaście linii jest tu świadomie zdublowane” |
| Sięganie do koperty `choices[0].message.content` | `ai.service.ts:350` | `calorie-estimation.service.ts:213-214` |
| Mapowanie awarii dostawcy na 502 + linia logu z `error.model`/`error.status` | `generate-recipe.ts:70-81` | `modify-recipe.ts:107-127`, `estimate.ts:157-177` (tylko tu jest gałąź `AI_MISCONFIGURED`) |
| Klient axios do OpenRoutera | `openrouter.service.ts:57` | `models-manager.ts:29` (martwy) |

Do tego dochodzi obejście na poziomie testowalności: `apiKey: ""` istnieje tylko dlatego, że serwis domenowy nie
może zawierać `import.meta` (`calorie-estimation.service.ts:69-84`). Serwis wie, jak klient dostawcy czyta
konfigurację, bo sam go konstruuje.

### 3.3 Przecieki przez granice

1. **Typ błędu dostawcy w warstwie API.** Trzy trasy importują `OpenRouterError` z `lib/api` i czytają jego pola
   (`estimate.ts:162,168`). Gdyby dostawca się zmienił, `instanceof` przestałby łapać, każda awaria stałaby się
   500, a test tras by tego nie wykrył, bo mockuje moduł po ścieżce.
2. **Koperta OpenAI w serwisie domenowym.** `extractCalories(response: ChatResponse, …)`
   (`calorie-estimation.service.ts:212`) i `parseAIResponse(response: ChatResponse)` (`ai.service.ts:345`).
3. **Slug modelu w kontrakcie wire.** `ai_model` (`src/types.ts:72,81`) wysyła do przeglądarki identyfikator w
   rodzaju `nvidia/…:free`. Nic go nie wyświetla. Bez ACL to pole jest de facto kontraktem z OpenRouterem.
4. **Telemetria wymaga klienta modelu.** `save-recipe.ts:159,194` konstruuje `AIService`, którego konstruktor
   buduje klienta OpenRoutera (`ai.service.ts:75`) i ustawia schemat (`:93`), tylko po to, żeby wykonać UPDATE na
   `logs`. Przy braku klucza konstruktor rzuca **po** zapisaniu przepisu (`save-recipe.ts:178`, insert), a trasa
   odpowiada 500 dla przepisu, który już istnieje.
5. **Bundle klienta: czysto.** Żaden plik w `src/components` ani `src/hooks` nie importuje `lib/api/openrouter*`
   ani `axios` (grep). Przeglądarka zna tylko kody `AI_UNAVAILABLE`/`AI_PARSE_ERROR` (`useAI.ts:216-219`). Ta
   granica już działa, a ACL ma ją utrzymać.

### 3.4 Gdzie kod rozjeżdża się z kontraktem dostawcy (dokumentacja OpenRouter)

| Kontrakt OpenRouter | Kod dziś | Skutek |
| --- | --- | --- |
| Structured outputs: `response_format: { type: "json_schema", json_schema: { name, strict, schema } }`. Model bez wsparcia zwraca **błąd**. Wsparcie jest per endpoint, a `provider.require_parameters: true` je wymusza | `{ type: "json_object", schema }` (`openrouter.service.ts:128`): kształt spoza dokumentacji | parametr jest ignorowany albo szkodzi (`calorie-estimation.service.ts:125-130`). Poprawienie samego kształtu bez bramki „czy model to wspiera” zamieniłoby generowanie przepisu na nemotronie w błąd |
| 200 z błędem: (a) samo `error` bez `choices`, (b) `choices[0]` z częściową treścią + `error` i `finish_reason: "error"` | `validateChatEnvelope` sprawdza tylko (a) (`openrouter.errors.ts:133,143`) | przypadek (b) przechodzi jako sukces, a częściowa treść może stać się przepisem albo liczbą |
| Pusta treść z `finish_reason: "length"`: model rozumujący zużył `max_tokens` na rozumowanie i ponowienie nie pomoże | domyślne `max_tokens: 1024` (`openrouter.service.ts:50`) przy modelu rozumującym; wycena loguje to jako `empty` (`calorie-estimation.service.ts:228-229`) | awaria konfiguracji budżetu tokenów wygląda w logach jak kaprys modelu |
| 403 = uprawnienia **lub guardrail/moderacja**; 408 = timeout; 502 = model padł; 503 = brak dostawcy spełniającego wymagania | 401 i 403 → `AuthenticationError` (`openrouter.errors.ts:66-68`); 408 i 503 → ogólny `OpenRouterError` | moderacja w logu wygląda jak zły klucz |
| Kształt błędu: `{ error: { code, message, metadata? } }` | 400 klasyfikowane po podciągu `"token"`/`"content"` w `message` (`openrouter.errors.ts:73-79`) | klasyfikacja zależy od angielskich treści komunikatów dostawcy |

## Krok 4: projekt ACL

Docelowy układ (nazwy do potwierdzenia w `/10x-plan`):

```
src/lib/ai/
  model-gateway.ts          # PORT + value objecty + ModelFailure; zero zależności zewnętrznych
  create-model-gateway.ts   # jedyny composition root: wybiera adapter, czyta env
  openrouter/               # ADAPTER: jedyne miejsce ze słowem „openrouter” i z axios/fetch
    openrouter.gateway.ts
    openrouter.errors.ts    # dzisiejsze mapowanie + poprawki z 3.4
    openrouter.wire.ts      # ChatPayload/ChatResponse: typy przewodu, nieeksportowane poza katalog
    model-capabilities.ts   # tabela: model → { reasoning, maxTokens }
```

### 4.1 Value objecty domenowe (jedyna wiedza o kształcie odpowiedzi)

```ts
// Co serwis domenowy wysyła: bez ról OpenAI, bez parametrów samplingu.
type ModelPrompt = {
  instructions: string;          // dziś SYSTEM_MESSAGE / RECIPE_SYSTEM_MESSAGE / prompt przepisu
  input: string;                 // dziś userMessage
  // Bez schematu odpowiedzi (Q-ACL-2): kształt pilnuje instrukcja + ModelReply.lastJsonObject().
};

// Co serwis domenowy dostaje. Niezmienny; konstruuje go wyłącznie adapter.
class ModelReply {
  readonly text: string;                        // treść ostatecznej odpowiedzi, '' gdy brak
  readonly ending: "complete" | "truncated";    // truncated = finish_reason "length"
  readonly modelLabel: string;                  // faktycznie użyty model → logs.actual_ai_model, DTO ai_model
  readonly elapsedMs: number;                   // → logs.generate_response_time

  isEmpty(): boolean                            // text.trim() === ''
  // Jedna implementacja dzisiejszych dwóch kopii (3.2): ogrodzenie ```json → ostatni {…}.
  lastJsonObject(): { ok: true; value: Record<string, unknown> }
                  | { ok: false; reason: "empty" | "no_json" | "invalid_json" }
}

// Awaria bramy. Jedyny typ błędu, który widzą serwisy i trasy.
class ModelFailure extends Error {
  readonly kind:
    | "misconfigured"     // brak klucza/konfiguracji: AI_MISCONFIGURED, „Policz ponownie” nie pomoże
    | "unavailable"       // sieć, timeout, 408, 5xx, 503, 200 z error (oba warianty z 3.4)
    | "rate_limited"      // 429
    | "rejected"          // 401 (klucz), 402 (kredyty)
    | "blocked"           // 403 moderacja/guardrail
    | "unsupported";      // 400/404: model albo parametr nieobsługiwany
  readonly retryAfterSec?: number;   // nagłówek Retry-After (429/503)
  readonly diagnostics: { model?: string; status?: number };   // tylko do linii logu
}
```

Mapowanie z persystencji i do niej należy do **`ModelReply`**, nie do serwisu: `modelLabel` → `logs.actual_ai_model`
(`ai.service.ts:666`), `elapsedMs` → `logs.generate_response_time` (`:667`, dziś liczone ręcznie w `:186-188`).

### 4.2 Port (wąski)

```ts
interface ModelGateway {
  /** Rzuca wyłącznie ModelFailure. Treść bezużyteczna to NIE awaria: wraca ModelReply. */
  complete(prompt: ModelPrompt): Promise<ModelReply>;
}

type ModelPurpose = "recipe" | "calorie_estimate";
function createModelGateway(purpose: ModelPurpose): ModelGateway;   // create-model-gateway.ts
```

Jedna metoda, nic więcej. Port nie zna modelu, ról, `temperature`, `retries` ani URL. `purpose` wybiera profil w
adapterze, a profil jest jedynym miejscem polityki z `infrastructure.md:109` (jedna próba, 55 s pod `maxDuration`).

### 4.3 Adapter OpenRouter (pseudokod)

```
class OpenRouterGateway implements ModelGateway
  constructor(profile, apiKey, http)            # http: axios albo fetch; widzi go tylko ten plik
    if !apiKey → throw ModelFailure("misconfigured")       # zastępuje oba try/catch z 3.2

  complete(prompt):
    caps = MODEL_CAPABILITIES[profile.model]
    payload = { model, messages: [system: prompt.instructions, user: prompt.input],
                max_tokens: caps.maxTokens, ...profile.sampling }
    # nigdy response_format (D-1 / Q-ACL-2)
    started = now()
    body = send with exactly profile.maxAttempts attempts     # semantyka nazwana wprost, bez „0 → 2”
           on error → throw mapFailure(error)                 # tabela z 3.4
    if body.error OR body.choices[0]?.error → throw ModelFailure("unavailable")
    if !body.choices?.length → throw ModelFailure("unavailable")
    c = body.choices[0]
    return new ModelReply(text = c.message.content ?? "",
                          ending = c.finish_reason == "length" ? "truncated" : "complete",
                          modelLabel = body.model ?? profile.model,
                          elapsedMs = now() - started)
```

### 4.4 Serwisy po zmianie (sygnatury)

```ts
class CalorieEstimationService {
  constructor(gateway: ModelGateway);
  estimateFromDescription(content, amountText, logContext): Promise<number | null>;   // bez zmian
  estimateFromRecipe(recipeContent, entryNote, logContext): Promise<number | null>;   // bez zmian
  // extractCalories(reply: ModelReply) = reply.lastJsonObject() + reguła domeny: pole calories, 0–5000
}

class AIService {
  constructor(supabase: SupabaseClient<Database>, gateway: ModelGateway);
  // parseAIResponse(reply: ModelReply) = reply.lastJsonObject() + reguła przepisu (title/content)
}

class AiActionLog {          // wydzielone z AIService: logAIAction / updateAIActionLog
  constructor(supabase: SupabaseClient<Database>);
}
```

Reguły domenowe zostają w serwisach: zakres 0–5000, `{"calories": null}` jako `model_declined`, kształt przepisu i
`AIResponseParseError`. Do ACL przechodzi tylko wiedza o dostawcy i o kopercie.

## Krok 5: dowód izolacji i before/after

### 5.1 Co rusza wymiana dostawcy albo modelu

| Scenariusz | Pliki dotknięte po refaktorze |
| --- | --- |
| Inny model w OpenRouterze (zamiar z `tech-stack.md:18`) | `openrouter/model-capabilities.ts` (wiersz modelu) + profil. **Serwisy, trasy, tabele, UI: 0** |
| axios → `fetch` | `openrouter/openrouter.gateway.ts`, `openrouter.errors.ts` |
| Inny dostawca (np. bezpośrednio API Anthropic) | nowy katalog adaptera + `create-model-gateway.ts`. `ModelReply`/`ModelFailure` bez zmian |
| Tabela `logs` | 0: `actual_ai_model` dostaje `modelLabel`, czyli dowolny napis |
| API (`AIErrorResponse.code`, 502) | 0: trasy mapują `ModelFailure.kind`, a nie typ biblioteki |
| UI (`useAI.ts`, `useCalorieEstimation.ts`) | 0: dostaje te same kody i te same DTO |

### 5.2 Before/after

| Miejsce | Before | After |
| --- | --- | --- |
| Budowa klienta | `createRecipeClient` (`ai.service.ts:39-61`) + `createEstimationClient` (`calorie-estimation.service.ts:66-111`), obie z hackiem `apiKey: ""` | `createModelGateway("recipe" \| "calorie_estimate")` w trasie. Serwis dostaje port, nie czyta env i nie potrzebuje hacka dla ts-jest |
| Wyłuskanie JSON | dwie kopie (`ai.service.ts:409-425`, `calorie-estimation.service.ts:232-240`) | `ModelReply.lastJsonObject()`, jedna implementacja z jednym zestawem testów |
| Koperta | `response?.choices?.[0]?.message?.content` w dwóch serwisach | `reply.text`. `ChatResponse` nie wychodzi z `openrouter/` |
| Format odpowiedzi | stan klienta: `setResponseFormat` w konstruktorze `AIService` (`:93`), a w wycenie celowo pominięte (`:123-134`) | żaden z serwisów nie wysyła schematu (Q-ACL-2). `setResponseFormat`, `JSONSchema` i `recipeSchema` (`ai.service.ts:78-93`) znikają |
| Trasy | `if (error instanceof OpenRouterError)` ×3 (`generate-recipe.ts:70`, `modify-recipe.ts:107`, `estimate.ts:157`) | `if (error instanceof ModelFailure)` → wspólna funkcja `modelFailureResponse(failure)` (kod `AI_MISCONFIGURED` dla `misconfigured`, inaczej `AI_UNAVAILABLE`). Do logu idzie `failure.kind` + `diagnostics` |
| `save-recipe` | `new AIService(...)` (`:159,194`) buduje klienta modelu, żeby zrobić UPDATE na `logs` | `new AiActionLog(locals.supabase).markAccepted(logId)`, bez klucza i bez bramy |
| Testy | `jest.mock("@/lib/api/openrouter.service")` w 5 plikach | fałszywa `ModelGateway` (obiekt z `complete`) przekazana w konstruktorze. Mock modułu dostawcy zostaje tylko w testach adaptera |
| UI | dziś dostaje `ai_model` = slug dostawcy | dostaje `ai_model` = `modelLabel`, nieprzezroczysty napis. Pole nie jest wyświetlane (Q-ACL-1) |

### 5.3 Otwarte pytania kontraktu dostawcy i gdzie zakodować decyzję

| ID | Pytanie | Rozstrzygnięcie (dokumentacja OpenRouter) | Gdzie |
| --- | --- | --- | --- |
| D-1 | Wysyłać schemat odpowiedzi? | **Nie, dla żadnego modelu** (decyzja Q-ACL-2). Nieudokumentowany kształt `json_object + schema` (`openrouter.service.ts:128`) znika razem z `setResponseFormat`, więc generowanie przepisu przestaje wysyłać parametr, który obecny model ignoruje albo psuje. Dokumentowany `json_schema` wymagałby bramki „czy model to wspiera”, a tej nikt nie potrzebuje | `openrouter.gateway.ts`: payload nie ma pola `response_format`. **Nie** w serwisie, **nie** w trasie |
| D-2 | 200 z `error` | Oba warianty (samo `error`, `choices[0].error` + `finish_reason: "error"`) → `ModelFailure("unavailable")` | `openrouter.gateway.ts` (rozszerzenie dzisiejszego `validateChatEnvelope`) |
| D-3 | Pusta treść z `finish_reason: "length"` | `ModelReply.ending = "truncated"`. Ponowienie nie pomoże. Serwis loguje osobny powód `truncated` zamiast `empty`. Budżet `max_tokens` dla modelu rozumującego ustala tabela możliwości | VO + `model-capabilities.ts` |
| D-4 | Mapowanie statusów | 401/402 → `rejected`, 403 → `blocked`, 408/5xx/503/brak odpowiedzi → `unavailable`, 429 → `rate_limited` (+`Retry-After`), 400/404 → `unsupported`. Klasyfikacja po `error.code` i statusie, nie po podciągu komunikatu | `openrouter.errors.ts` |
| D-5 | Liczba prób | `maxAttempts` nazwany wprost, domyślnie 1 dla obu profili (`infrastructure.md:109`, ponowienie należy do użytkownika) | profil w `create-model-gateway.ts` |

Zmiana **modelu** nie należy do tego refaktoru. Tabela możliwości opisuje dzisiejszy model, a pomiar i wybór innego
należą do właściciela. Usunięcie `response_format` z generowania przepisu to jedyna zmiana zachowania wobec
dostawcy. Faza 3 sprawdza ją testem: payload bez tego pola.

## Krok 6: weryfikacja i plan

### 6.1 Kryterium sukcesu

```
grep -rniE "openrouter|axios" src --include=*.ts --include=*.tsx --include=*.astro
```

Ma zwrócić **wyłącznie** pliki z `src/lib/ai/openrouter/`, jedną linię importu w `src/lib/ai/create-model-gateway.ts`
oraz `src/env.d.ts:23` (deklaracja zmiennej `OPENROUTER_API_KEY`: nazwa zmiennej środowiskowej to konfiguracja
wdrożenia, nie kod). Uzupełnienie: `grep -rn "ChatResponse\|OpenRouterError" src tests` poza `src/lib/ai/openrouter/`
i `tests/unit/openrouter-*.test.ts` zwraca 0.

| Plik | Zna dostawcę dziś | Po refaktorze |
| --- | --- | --- |
| `src/lib/api/openrouter.service.ts` | tak | przeniesiony → `src/lib/ai/openrouter/openrouter.gateway.ts` |
| `src/lib/api/openrouter.types.ts` | tak | rozbity: typy przewodu → `openrouter/openrouter.wire.ts`. Shim axios `:193-219` usunięty. Klasy błędów zastępuje `ModelFailure` |
| `src/lib/api/openrouter.errors.ts` | tak | przeniesiony → `openrouter/openrouter.errors.ts` (+ D-2, D-4) |
| `src/lib/utils/models-manager.ts` | tak (martwy) | **usunięty** |
| `src/lib/services/ai.service.ts` | tak | **nie**: port + `ModelReply` |
| `src/lib/services/calorie-estimation.service.ts` | tak | **nie** |
| `src/pages/api/ai/generate-recipe.ts` | tak | **nie**: `ModelFailure` |
| `src/pages/api/ai/modify-recipe.ts` | tak | **nie** |
| `src/pages/api/diary-entries/[id]/estimate.ts` | tak | **nie** |
| `src/pages/api/ai/save-recipe.ts` | pośrednio (konstruktor) | **nie**: `AiActionLog` |
| `src/types.ts` (`ai_model`) | wartość od dostawcy | nieprzezroczysty `modelLabel` |
| `src/env.d.ts:23` | nazwa zmiennej | bez zmian (wyjątek jawny) |

### 6.2 Fazy (konwencja projektu: jedna zmiana, `/10x-new acl-model-gateway`)

| Faza | Zakres | Tryb | Gotowe, gdy |
| --- | --- | --- | --- |
| 1 | `src/lib/ai/model-gateway.ts`: `ModelPrompt`, `ModelReply` (z `lastJsonObject`), `ModelFailure`, `ModelGateway`. Przypadki wyłuskania przeniesione z `calorie-estimation.service.test.ts` i `ai-service.test.ts` | `/10x-tdd` | testy VO zielone, plik bez importów zewnętrznych |
| 2 | Adapter `src/lib/ai/openrouter/` + `create-model-gateway.ts`, przeniesienie `openrouter.errors.ts` z poprawkami D-2 i D-4, `model-capabilities.ts` z dzisiejszym modelem (D-1, D-3), `maxAttempts` (D-5). Stary `src/lib/api/openrouter.*` jeszcze żyje | `/10x-tdd` dla mapowania (`openrouter-errors.test.ts`), `/10x-implement` dla klienta | testy adaptera zielone, w tym 200 z `choices[0].error` i `finish_reason: "length"` |
| 3 | Serwisy na porcie: `CalorieEstimationService(gateway)`, `AIService(supabase, gateway)`, wydzielenie `AiActionLog`. Testy serwisów na fałszywej bramie zamiast `jest.mock` ścieżki | `/10x-implement` | `ai-service.test.ts`, `calorie-estimation.service.test.ts` zielone bez `jest.mock("…openrouter…")` |
| 4 | Trasy: `ModelFailure` + wspólne `modelFailureResponse`. `save-recipe` na `AiActionLog`. Testy tras na fałszywej bramie | `/10x-implement` | testy tras zielone. Brak klucza w `save-recipe` nie daje 500 po zapisanym przepisie (nowy test) |
| 5 | Sprzątanie: usunięcie `src/lib/api/openrouter.*`, `models-manager.ts` i shimu axios. Wpis „`ModelGateway` / `ModelFailure`” w `docs/reference/contract-surfaces.md` (co pęka: `kind` → kody HTTP 502). Termin „brama modelu” w `glossary.md`. Aktualizacja `known-drift.md`, jeśli coś zostaje | `/10x-implement` | grep z 6.1 spełniony; `npm run typecheck` = 0 błędów; `npm run lint`, `npm run test` zielone; E2E w CI zielone |

Bramki CI bez zmian: code-quality → build → unit + E2E. Każda faza kończy się zielonym `npm run typecheck`.

### 6.3 Decyzje właściciela (2026-10-26)

- **Q-ACL-1 — rozstrzygnięte: `ai_model` zostaje** w `GeneratedRecipeDto`/`ModifiedRecipeDto`. Wartością jest
  `ModelReply.modelLabel`, nieprzezroczysty napis. Kontrakt wire się nie zmienia.
- **Q-ACL-2 — rozstrzygnięte: schemat odpowiedzi nie jest wymagany**, także po zmianie modelu. Kształt odpowiedzi
  pilnują instrukcja i `ModelReply.lastJsonObject()` z regułą domenową serwisu. Skutki: D-1 brzmi „nie wysyłać
  `response_format` wcale”, a w `ModelPrompt` nie ma pola `expects`.
