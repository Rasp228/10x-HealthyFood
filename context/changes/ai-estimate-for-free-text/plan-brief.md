# Wycena kalorii przez AI dla opisowego wpisu — streszczenie planu

> Pełny plan: `context/changes/ai-estimate-for-free-text/plan.md`

## What & Why

Roadmap **S-02** jest gwiazdą przewodnią kamienia milowego `calorie-diary-v1` i domknięciem US-01:
użytkownik opisuje, co zjadł, prosi o wyliczenie kalorii i dostaje wartość **bez czekania na
zapis**. Wpis pojawia się na liście natychmiast, wartość dochodzi później, a gdy nie ustali się w
ciągu minuty — wpis czyta się jako niepoliczony z polem na liczbę wpisaną ręcznie. To pierwszy
przepływ dowodzący głównej hipotezy produktu: że zalogowanie posiłku to jeden ruch, bez szukania w
obcej bazie produktów.

## Starting Point

F-01 zbudowało magazyn, S-01 — panel dnia. W bazie czekają nietknięte: wartość `ai_from_description`
w `calorie_origin_enum` i kolumna `estimation_requested_at`, której **żaden kod dziś nie zapisuje**,
choć migracja wprost przydziela ten zapis serwerowi. Lista dnia już renderuje badge „Nie policzono",
a `summarizeDay` już zwraca `missingCount`, więc część FR-011 jest zrobiona. Brakuje dwóch rzeczy:
**jakiejkolwiek trasy zapisu do istniejącego wiersza** (dziś tylko `GET` i `POST` na kolekcji) oraz
możliwości użycia klienta OpenRouter do czegoś innego niż przepisy — `AIService` ustawia globalny
schemat odpowiedzi w konstruktorze, a `OpenRouterService` trzyma go jeden na instancję.

## Desired End State

Na liście dnia wpis bez wartości ma przycisk **„Policz kalorie"**, a formularz — drugi przycisk
**„Zapisz i policz kalorie"**, przy obu stałe zdanie, że opis pojedzie do dostawcy modelu. W trakcie
liczenia wpis pokazuje „Liczę…" i **„Anuluj"**, a pole na ręczną liczbę jest nieaktywne; anulowanie
odblokowuje je natychmiast. Po minucie bez wartości wpis wraca do „Nie policzono" z aktywnym polem i
przyciskiem „Policz ponownie". Przeładowanie strony w trakcie liczenia nie gubi informacji, że
oszacowanie zlecono.

## Key Decisions Made

| Decyzja                         | Wybór                                                                     | Dlaczego (jedno zdanie)                                                                                                     | Źródło   |
| ------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------- |
| Gdzie działa wycena             | Drugi request z przeglądarki do `POST /api/diary-entries/[id]/estimate`     | Na Vercelu funkcja żyje tylko do wysłania odpowiedzi, więc `fire-and-forget` bywa ucinany w połowie — awaria widoczna dopiero na produkcji. | Plan     |
| Co wyzwala wycenę               | Jawny przycisk; pole ręczne zawsze obecne                                  | FR-003 mówi „użytkownik może poprosić", a jawne kliknięcie jest zarazem zgodą na wysłanie treści do dostawcy.                | Plan     |
| Granica minuty                  | Serwer stempluje `estimation_requested_at`, klient liczy minutę od znacznika | Kolumna została zaprojektowana dokładnie na tę rolę i przeżywa przeładowanie strony, którego stan wyspy React nie przeżywa.  | Plan     |
| Wyścig z wartością ręczną       | Blokada pola **tylko na czas żywego requestu**, z przyciskiem „Anuluj"      | Blokada bez wyjścia łamałaby FR-004 („w dowolnym momencie"); anulowanie zostawia ręczną liczbę o jedno kliknięcie, a bez żywego requestu pole jest aktywne od razu — także przy szybkiej odmowie dostawcy i po przeładowaniu strony. | Plan     |
| Spóźnione oszacowanie           | Zapis warunkowy `.is("calories", null)` — nigdy nie nadpisuje              | FR-004 istnieje po to, żeby liczba wpisana ręcznie była nienadpisywalna; warunek w `UPDATE` załatwia to bez blokad.          | Plan     |
| Uprzedzenie o wysyłce treści    | Stałe zdanie przy przycisku, bez dialogu i bez zapamiętywania              | Spełnia NFR przy każdym wysłaniu, nie wymaga żadnego magazynu stanu i przenosi się na S-04 bez zmian.                        | Roadmapa |
| Kilka wycen naraz               | Kolejka FIFO, jedna wycena w locie; pole na liczbę aktywne przy wpisach w kolejce | Drugie kliknięcie nie może po cichu przerwać pierwszej wyceny ani zniknąć bez śladu; kolejka jest widoczna („W kolejce…"), a czekanie w niej nigdy nie odbiera prawa do wpisania liczby ręcznie. | Plan     |
| Zaufanie do wyniku modelu       | Tylko liczba całkowita 0–5000; wszystko inne zostawia wpis niepoliczonym    | 5000 to już obowiązująca granica pola ręcznego, więc obie ścieżki trzyma jedna reguła, a halucynacja nie wchodzi do sumy dnia. | Plan   |
| Gdzie mieszka kod wyceny        | Własny `CalorieEstimationService` z własną instancją klienta               | `AIService` ustawia globalny `responseFormat` przepisu w konstruktorze — współdzielona instancja i dwa schematy nie dają się pogodzić. | Plan |
| Budżet czasu i ponowień         | `timeout: 60 s`, `retries: 1` (= jedna próba, zero powtórzeń); abort przeglądarki po 65 s | Pełna minuta zostaje, bo jej skrócenie kosztuje znacznie więcej nieudanych oszacowań; znikają tylko niewidoczne ponowienia, bo budżet ponawiania należy do widocznego przycisku. `1`, nie `0`: to pole liczy próby, a `config.retries \|\| 2` cofnęłoby zero do dwóch prób. | Plan     |
| Zakres testów                   | Unit z zamockowanym dostawcą; E2E nie dotyka OpenRoutera                    | Suita zostaje deterministyczna i nie płaci za wywołania modelu w CI, gdzie job `e2e-tests` działa na środowisku integration. | Plan     |
| Telemetria w tabeli `logs`      | Brak                                                                       | Wymagałaby zmiany istniejącego `action_type_enum`, a roadmapa parkuje obserwowalność do zamknięcia M-1.                      | Roadmapa |

## Scope

**W zakresie:** `maxDuration: 60` na adapterze Vercela w `astro.config.mjs` (jedyna zmiana poza
`src/` i `tests/` — bez niej budżet 60 s nie ma pokrycia na platformie); schemat `set-calories.ts`; `CalorieEstimationService`; trzy nowe metody
`DiaryService` (`markEstimationRequested`, `applyEstimate`, `setCaloriesManually`); trasy
`POST /api/diary-entries/[id]/estimate` i wąski `PATCH /api/diary-entries/[id]` przyjmujący wyłącznie
`calories`; hook `useCalorieEstimation`; czysty pomocnik `resolveEstimationState`; komponent
`DiaryEntryCalories` z czterema stanami, w tym możliwość zastąpienia ustalonej wartości własną
liczbą (kryterium akceptacji US-01); drugi przycisk i zdanie o wysyłce w formularzu; testy
jednostkowe i rozszerzenie suity E2E.

**Poza zakresem:** estymacja z treści przepisu (S-04), wyszukiwanie przepisów i porcje (S-03),
edycja treści/ilości/dnia i usuwanie (S-05), dzienny cel i pasek postępu (S-06), jakakolwiek
migracja, zapis do `logs`, polling, dialog zgody, nowa zależność, nowa zmienna środowiskowa, tryb
testowy w kodzie produkcyjnym oraz naprawianie istniejącego długu z `known-drift.md`.

## Architecture / Approach

```
Formularz: "Zapisz i policz kalorie"
  └── POST /api/diary-entries                → 201, lista odświeżona (< 1 s)
        └── useCalorieEstimation.estimate(id)
              └── POST /api/diary-entries/[id]/estimate
                    ├── DiaryService.markEstimationRequested()   [UPDATE warunkowy: stempel]
                    ├── CalorieEstimationService.estimateFromDescription()
                    │       └── własny OpenRouterService (60 s, 0 retry, schemat {calories})
                    └── DiaryService.applyEstimate()             [UPDATE warunkowy: wartość]
                          → 200 z pełnym DiaryEntryDto, zawsze

Lista dnia: resolveEstimationState(entry, now, hasLiveRequest)
  → valued | estimating | stale | idle   → DiaryEntryCalories
                                            └── PATCH /api/diary-entries/[id]  (wartość ręczna)
```

Trasy pozostają cienkie — parsują, delegują, odpowiadają. Cała wiedza o tym, kiedy wolno dopisać
wartość, siedzi w `DiaryService`, tak jak dziś reguła „pochodzenie ustala serwer". Bezużyteczna
odpowiedź modelu nigdy nie jest błędem HTTP: jest wierszem bez wartości i statusem 200. Awaria
dostawcy (sieć, timeout, 401, 429, 5xx) to osobna rzecz — serwis ją przepuszcza, trasa oddaje 502
`AI_UNAVAILABLE`, a przeglądarka i tak czyta oba przypadki jako „nie policzono"; rozróżnienie
istnieje dla logów i ręcznej weryfikacji, nie dla interfejsu.

## Phases at a Glance

| Faza                          | Co dostarcza                                                            | Główne ryzyko                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1. Kontrakt serwerowy         | Schematy, serwis wyceny, trzy metody magazynu, dwie trasy — sprawdzalne `curl`-em | Ten kontrakt dziedziczą S-04 i S-05; błąd w nim płaci się trzy razy.                           |
| 2. Powierzchnia dziennika     | Przyciski, zdanie o wysyłce, cztery stany wartości, blokada z „Anuluj"    | Zegar i stan liczenia w wyspie React, przy regułach `set-state-in-effect` i `immutability` na `error`. Tykającego `now` nie ma na czym wzorować — w repo nie ma ani jednego `setInterval`, a `useSelectedDay` chodzi na `focus`/`visibilitychange`. |
| 3. Testy i domknięcie bramki  | Unit z zamockowanym dostawcą, rozszerzony page object i spec, pełne `code-quality` | Wierszy testowych nadal nie da się posprzątać — brak trasy `DELETE` do S-05.                 |

**Prerequisites:** `manual-diary-entry` (S-01) w `master` — panel dnia, trasa kolekcji i
`summarizeDay` są tu założeniem. Działający `OPENROUTER_API_KEY` do ręcznej weryfikacji Fazy 1 i 2
oraz `.env.test` z `E2E_USERNAME_ID` / `E2E_USERNAME` / `E2E_PASSWORD` do Fazy 3.

**Estimated effort:** ~3 sesje, po jednej na fazę.

## Open Risks & Assumptions

- **Zamknięcie karty w trakcie liczenia gubi wycenę.** Świadoma cena wybranej architektury: request
  żyje w przeglądarce, więc jego śmierć zostawia wiersz ze znacznikiem i bez wartości. Ratuje go
  „Policz ponownie" albo liczba wpisana ręcznie.
- **Zaraz po przeładowaniu wpis przez chwilę kłamie.** Wiersz ze świeżym znacznikiem czyta się jako
  „Liczę…", choć żaden request już nie żyje. Dlatego „Policz ponownie" i aktywne pole na liczbę są
  dostępne, gdy wyspa nie ma własnego requestu w locie — nie dopiero po minucie. Pole blokuje
  wyłącznie żywy request; znacznik z bazy sam z siebie niczego nie blokuje.
- **Próg 5000 kcal odrzuca też prawdziwie obfity posiłek**, bez odróżnienia od halucynacji. Granica
  jest odziedziczona po S-01 i celowo trzyma obie ścieżki na jednej regule.
- **Żaden test automatyczny nie przechodzi przez OpenRouter.** Łańcuch end-to-end z żywym modelem
  zostaje pozycją ręcznej weryfikacji — awaria dostawcy nie zatrzyma CI, ale też go nie ostrzeże.
- **Model jest zaszyty na sztywno** (`nvidia/nemotron-3-ultra-550b-a55b:free`, wspólna wartość
  domyślna w `openrouter.service.ts:52`) i darmowy, więc jakość oszacowań jest nieznana aż do
  ręcznego przejścia. Zmiana modelu to jedna linia — ale wspólna z trasami `/api/ai/*`, więc
  dotyka też generowania przepisów. Poprzednia wartość (`tngtech/deepseek-r1t-chimera:free`)
  przestała istnieć u dostawcy w trakcie Fazy 1; szczegóły i powód podmiany: `plan.md`,
  Current State Analysis.
- **`PATCH` to pożyczka z S-05.** Wąska i uzasadniona kryterium akceptacji US-01, ale to S-05
  poszerzy ją o treść, ilość i dzień — łącznie z regułą zerowania `estimation_requested_at`, której
  ta zmiana świadomie nie dotyka.
- **Wiersze E2E nadal się kumulują** w dniu sygnaturowym `2000-01-01`, bo trasy `DELETE` wciąż nie ma.

## Success Criteria (Summary)

- Użytkownik opisuje posiłek, klika raz i widzi wpis natychmiast, a wartość kaloryczną — chwilę
  później, z adnotacją, skąd pochodzi.
- Milczący dostawca degraduje moduł, ale go nie zatrzymuje: po minucie wpis mówi „Nie policzono", a
  liczbę da się wpisać ręcznie — i żadne spóźnione oszacowanie już jej nie nadpisze.
- Suma dnia nadal uczciwie mówi, ilu wartości nie obejmuje, a wszystkie ekrany sprzed zmiany —
  przepisy, profil, logowanie, rejestracja — zachowują się dokładnie jak dotąd.
