---
title: "Raport architektoniczny — moduł 4 (10xArchitect)"
created: 2026-10-26
type: architect-report
---

# Raport architektoniczny — moduł 4

Synteza artefaktów L2–L5. Każda liczba pochodzi z artefaktu, który podaję w nawiasie, a nie z mojej
pamięci o kodzie. Skróty źródeł: **MAP** = `llama.cpp/context/map/repo-map.md`, **CCF** =
`llama.cpp/context/changes/chat-completion-flow/research.md`, **RO** / **PLAN** =
`llama.cpp/context/changes/refactor-opportunities/{research,plan}.md`, **D01–D03** =
`context/domain/0{1,2,3}-*.md`, **GL** = `context/domain/glossary.md`.

## 1. Opisane projekty

| Repo | Stack | Skala (z artefaktów) | Artefakty |
| --- | --- | --- | --- |
| **llama.cpp** (open source, tryb read-only, HEAD `a01ce9ffc`) | C/C++: silnik tensorowy ggml z 17 backendami → libllama → `common/` → aplikacje (serwer HTTP zgodny z OpenAI, web UI w Svelte); Python do konwersji GGUF | 4875 commitów w 12 miesiącach, 165 plików modeli, `server-context.cpp` ma 6320 linii (MAP) | L2, L3, L4 |
| **10x-HealthyFood** (mój projekt z kursu) | Astro 7 SSR + wyspy React 19, Supabase (Postgres, RLS) jako jedyny backend, OpenRouter jako dostawca modelu, Zod 4, Jest 30 | 5 tabel, 10 subdomen (S-A…S-J), ok. 40 pojęć słownika (D01). Liczby linii i commitów: **BRAK artefaktu** | L5 |

## 2. Mapa projektu (L2, llama.cpp)

- **Warstwy są czyste, ale mają tylne wejście.** Kierunek include'ów ggml → libllama → `common` →
  aplikacje nie ma żadnego złamania. Jednocześnie 6 modułów spoza biblioteki sięga po nieoficjalne
  `src/llama-ext.h` z pominięciem `llama.h` (MAP).
- **Lokalne centra to `common/` i `server-context.cpp`.** `common/` ma Ca 35 i 625 commitów, a
  `server-context.cpp` ma 6320 linii i całą ścieżkę żądania. Tam duży zasięg spotyka częste zmiany (MAP).
- **Strefy ryzyka:** serwowanie API OpenAI, router modeli (28% commitów to poprawki), parsery czatu
  (30–34% poprawek) i multimodalność z bus factor 1 (MAP).
- **Entry pointy:** `tools/server/server.cpp` (51 tras, wybór trybu router albo jeden model) oraz
  `include/llama.h` (256 funkcji `LLAMA_API`) (MAP).
- **Najważniejsze niewiadome:** zachowanie w runtime (`#ifdef`, ładowanie backendów, CMake), shadery
  i Python poza grafem, PR-y i review niewidoczne bez `gh auth` (MAP). L3 skorygowało część liczb:
  27 handlerów zamiast 28 i 114 wywołań `llama_*` zamiast 118 (CCF).

## 3. Analiza ficzera (L3, llama.cpp)

**Przepływ:** `POST /v1/chat/completions` w trybie jednego modelu. Wybrałem go, bo leży w strefie ryzyka
nr 1 z mapy, „Serwowanie API zgodnego z OpenAI”: ma najwięcej ruchu i 6320 linii w jednym pliku, a wiedza
jest skupiona u dwóch osób.

**Feature overview.** Wejście to JSON z `messages`, który wątek HTTP parsuje i renderuje szablonem czatu
(`common_chat_session`), a potem tokenizuje i zamienia na `server_task`. Stan zmienia się w jednym wątku
głównym: wybór slotu (id → LCP → LRU), KV cache, prompt cache, `llama_process(DECODE)` i sampling. Wątki
łączą tylko `server_queue` i `server_response`. Klient dostaje `chat.completion` (JSON) albo strumień SSE
`chat.completion.chunk` zakończony `data: [DONE]`. Funkcja `handle_completions_impl` obsługuje wspólnie
7 endpointów (CCF).

**Technical debt (3 najważniejsze):**

1. **Granica „tekst użytkownika vs szablon” ginie przed tokenizacją.** Flaga `is_input` znika w `.str()`,
   a prompt jest tokenizowany z `parse_special=true`. ast-grep: **0 odczytów** `is_input`/`parts` w
   `tools/server` (te same reguły dają 27 trafień w `common/`). To cichy dług bezpieczeństwa: prawdopodobny
   prompt injection tokenami specjalnymi, choć niezweryfikowany w runtime (CCF #1).
2. **Status HTTP zakodowany typem wyjątku.** ast-grep: 16 `throw` w `oaicompat_chat_params_parse`, z czego
   3 `runtime_error` dla błędów klienta kończą się kodem **500**, a test akceptuje 400 albo 500 (CCF #2).
3. **Kontrakt JSON/SSE poza procesem bez strażnika.** ast-grep: wszystkie **4** `switch (res_type)` mają
   `default:`, więc `-Wswitch` milczy. Formatterów `to_json_*` jest 15, harness pytest nie asertuje
   `[DONE]`, a UI i `llama-cli` to konsumenci bez testu kontraktu (CCF #10, #12b).

## 4. Plan refaktoryzacji (L4, llama.cpp)

**Wybrana opcja:** K6, warstwa formatowania odpowiedzi (#1 w rankingu RO), w zawężonym zakresie. Najpierw
strażnik, czyli testy charakteryzujące 15 formatterów i framingu `[DONE]`, a potem usunięcie `default:`
z 4 `switch`ów. Kształt docelowy: nowa wartość `task_response_type` daje błąd kompilacji (`-Wswitch` pod
`LLAMA_FATAL_WARNINGS`) w dokładnie 4 miejscach. Zachowanie obserwowalne się nie zmienia (PLAN).

**Czego świadomie nie robimy:** formatterów per format API, wspólnej koperty chunku i Stranglera (dalsze
kroki K6), łańcuchów `if (res_type …)` (9 miejsc), K1/K2/K3/K4/K9, poprawki N2 (`finish_reason` w
`delta`) ani zmian w CI, `.devops/` i zachowaniu (statusy, bajty, `[DONE]`) (PLAN). K3, czyli podział
monolitu, odrzuciliśmy z powodu kolizji z upstreamem: 53 commity w 90 dniach (RO).

| Faza | Jedna linijka | Weryfikacja |
| --- | --- | --- |
| 1 | Kontener Docker z toolchainem jak w CI i zapis baseline | auto: build, `ctest`, pytest; ręcznie: przegląd `baseline.md` |
| 2 | 16 snapshotów C++ `to_json()` w `test-server-component` (bez modelu) | auto: `ctest -L main`; ręcznie: mutacja w `to_json_anthropic()` psuje 1 przypadek |
| 3 | Strażnik pytest: `[DONE]` per endpoint i `/v1/responses/input_tokens` | auto: pytest; ręcznie: mutacja gałęzi `:5072` psuje test |
| 4 | Dyspozytory `to_json()` bez `default:` + `GGML_ABORT` | auto: build `-Werror` i snapshoty; ręcznie: sztuczna wartość enuma psuje build |
| 5 | `switch`e w `server-context.cpp` bez `default:` | auto: build, ctest, pytest, grep; ręcznie: `-Wswitch` w dokładnie 4 miejscach i review gałęzi ASR/EMBD |

Status: wszystkie pozycje w Progress planu są niezaznaczone, więc plan nie jest jeszcze wdrożony (PLAN).

## 5. Domena wg DDD (L5, 10x-HealthyFood)

**Ubiquitous language (kluczowe pojęcia, GL):** **Wpis dziennika** (samowystarczalna kopia, nie „log”),
**Kaskada wartości** (blok przepisu → AI z przepisu → AI z opisu → ręcznie), **Pochodzenie wartości**
(`calorie_origin`), **Znacznik zlecenia wyceny** (`estimation_requested_at`) i **Sierota** (wpis z
porcjami po usunięciu przepisu).

**Najważniejsze rozjazdy model-vs-kod (D01):**

- **R-02:** PRD opisuje kaskadę jako jedną regułę, a w kodzie słowo „kaskada” występuje tylko w
  komentarzach. Pochodzenie rozstrzyga się w 5 miejscach w 2 plikach.
- **R-01:** nagłówek „na 4 porcje” przechodzi jako „na porcję”, więc wartość jest po cichu zawyżona
  krotnie, wbrew FR-009.
- **R-03:** zerowania znacznika pilnują ręcznie 3 gałęzie, a komentarz twierdzi, że znacznik nigdy nie
  jest zerowany.
- **G-01:** słowo „log” ma cztery znaczenia w czterech kontekstach.

**Niezmiennik #1:** „Wartość wpisu ma jeden cykl życia”. Wartość pochodzi z dokładnie jednego kroku
kaskady, zmienia się tylko przez nazwane przejścia, a każde unieważnienie wartości albo opisu unieważnia
trwające zlecenie wyceny (scala N-02 i N-03). Należy do agregatu **`DiaryEntry`** z `CalorieValue`,
`EntryQuantity` (z jawnym stanem `orphan`) i polityką `CalorieCascade`. Atomowość daje jeden warunkowy
UPDATE na przejście, a przy podwójnym wyścigu trasa zwraca 409 (D02).

**Anti-Corruption Layer:** przecieka **OpenRouter + axios**. Typy `OpenRouterError` i `ChatResponse`
przechodzą przez **5 warstw** (klient, serwis, API, kontrakt wire `ai_model`, persystencja `logs`) w
**11 plikach produkcyjnych i 7 testach**. Wiedza o konkretnym modelu siedzi w serwisie wyceny i przeczy
wiedzy w `AIService`. Projekt: wąski port `ModelGateway.complete()`, value objecty `ModelReply` i
`ModelFailure`, adapter w `src/lib/ai/openrouter/`. Kryterium: grep `openrouter|axios` trafia tylko w
adapter (D03).

## 6. Decyzje, które należą do mnie

AI zaproponowało K6 w pełnym kształcie (formatter per format API, wspólna koperta, Strangler), a ja
zawęziłem je do strażnika testów i `switch`y bez `default:`, bo te dwa kroki dają ochronę kontraktu bez
zmiany bajtów wyjścia i bez kolizji z upstreamem.
W L5 AI sugerowało naprawić N-10 osobno przed agregatem, a ja włączyłem tę naprawę do planu jako fazę 1, nie jako osobną fazę 0 (Q-00).
Rozstrzygnąłem pytania, które AI zostawiło otwarte: 5000 kcal to próg formularza, nie reguła domeny (Q-01), sierota jest legalnym
stanem (Q-02), serwer nie blokuje powtórnej wyceny (Q-09), a 409 „Wpis zmienił się” jest akceptowalne (Q-10).
W ACL `ai_model` zostaje w kontrakcie jako nieprzezroczysta etykieta (Q-ACL-1), a schematu
odpowiedzi nie wysyłamy wcale (Q-ACL-2).
ACL dla Supabase świadomie odrzuciłem: PRD wybiera go jako jedyny backend,
wymiany nie planujemy, więc izolacja kosztowałaby i nic nie dawała.
