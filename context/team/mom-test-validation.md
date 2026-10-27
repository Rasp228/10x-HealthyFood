# Mom Test Validation Plan

## Input Idea

`deps-review` — lokalny skrypt Node, uruchamiany ręcznie, który łączy `npm outdated`, `npm audit`,
allowlistę `audit-ci.jsonc` (expiry + wyzwalacze przeglądu), `npm view` dla pakietów z allowlisty
i plik lokalnych ograniczeń (cookie@2, eslint<10, zakazane downgrade'y z `npm audit fix --force`)
w raport Markdown: wygasające wpisy, wpisy do usunięcia, bumpy bezpieczne / wyzwalające przegląd /
blokowane, nowe advisory. Źródło: `context/team/opportunity-map.md` (kandydat nr 2).

**Zakres walidacji**: jeden użytkownik — właściciel projektu. Bez wywiadów z innymi i bez ankiety;
„wywiad” to retrospektywa na własnych artefaktach, „ankieta” to dziennik zdarzeń prowadzony do
najbliższego wymuszonego przeglądu.

## Hypotheses

- **User/role**: właściciel 10x-HealthyFood, jedyny deweloper, pracuje z agentem, push prosto na `master`.
- **Friction**: przegląd zależności jest nieplanowany (bramka `test:security` pada przy pushu
  niezwiązanym z zależnościami) i kosztowny w researchu (który advisory, czy jest łatka, co cofnie
  `--force`, które lokalne ograniczenie blokuje bump).
- **Current workaround**: czerwony job „Kontrola jakości kodu” → `npm audit` / `npm outdated` /
  `npm view` ręcznie lub przez agenta → bump w `package-lock.json` albo wpis w allowliście →
  uzasadnienie w komentarzu `audit-ci.jsonc` i w `contract-surfaces.md`.
- **Proposed solution**: raport `deps-review` (patrz wyżej), później cotygodniowy job w CI.
- **Risky assumptions**:
  1. Czas w epizodach zależnościowych idzie na *zbieranie i zestawianie informacji*, a nie na
     naprawę (bump, testy, regresje runtime). Raport skraca tylko to pierwsze.
  2. Epizody będą się powtarzać — projekt będzie utrzymywany po kursie.
  3. Lokalne ograniczenia trzeba „przypominać” przy każdym przeglądzie. Dziś są spisane w
     komentarzach `audit-ci.jsonc` i w `AGENTS.md`, które agent czyta w każdej sesji.
  4. Gotowe narzędzia (Dependabot alerts + uruchomienie `test:security` według harmonogramu) nie
     wystarczą.
  5. Raport wyłapałby ten rodzaj problemu, który faktycznie bolał. Złamanie z `cookie` (7f9f8d1)
     wyszło w runtime, nie w audycie — raport by go nie zobaczył, chyba że ograniczenie było znane wcześniej.
- **Evidence already present** (fakty z git):
  - 3 epizody w ~6 tygodniach aktywnej pracy: 2026-09-18 (upgrade Astro/Zod/Node 15:31 → pin
    `cookie` 15:54, ~23 min), 2026-10-06 (nowe advisory, 10:10 → expiry 10:18; czas researchu przed
    commitem nieznany), 2026-10-09 (handlebars/sharp 10:40 → `@astrojs/vercel` 14:22).
  - Epizod 2026-10-09 wyszedł przy przypadkowym pushu (opportunity map, `93c420b`).
  - Między 2025-06-12 a 2026-09-17 brak jakiejkolwiek pracy przy zależnościach — projekt leżał.
  - Jedno zdarzenie jest pewne i zaplanowane: 2027-01-06 wygasają naraz wszystkie trzy wpisy allowlisty.
  - **Brak** pomiaru, ile z tego czasu to research, a ile naprawa. To główna luka.

## Critique

1. **Rozwiązanie zamiast problemu.** „Raport łączący cztery źródła” to rozwiązanie. Problem z
   historii ma dwie odrębne części: (a) *kiedy* się dowiaduję — przypadkiem, przy pushu; (b) *ile
   kosztuje* przegląd. Część (a) w całości rozwiązuje gotowiec: Dependabot alerts (bez PR-ów) plus
   osobny mały workflow z `schedule`, który uruchamia tylko `npm run test:security`. To ~15 linii
   YAML i jeden przełącznik w ustawieniach, nie helper. Dla (b) trzeba dopiero udowodnić, że koszt to research.
2. **Przyszła intencja zamiast przeszłego zachowania.** „Przyda mi się przy kolejnych przeglądach”
   to deklaracja. Dowodem jest to, co robiłeś 06.10 i 09.10 — ile kroków, ile powtórzonych zapytań,
   ile razy agent od nowa ustalał to, co już jest w komentarzu `audit-ci.jsonc`.
3. **Samoocena budowniczego.** Jesteś jednocześnie jedynym użytkownikiem i autorem pomysłu, a
   kurs nagradza budowanie. Każde „tak, to bolało” warto podeprzeć hashem commita, ID runu albo
   znacznikiem czasu. Odpowiedź bez artefaktu traktuj jako hipotezę.
4. **Wiedza lokalna już ma swoje miejsce.** Komentarze w `audit-ci.jsonc` zawierają gotową
   procedurę przeglądu („sprawdź `npm view`, podbij i usuń wpis albo przesuń expiry”). Jeśli przegląd
   w styczniu sprowadzi się do wykonania tej procedury przez agenta w <30 min, helper dubluje dokumentację.
5. **Niska częstotliwość, krótki horyzont.** Pewne jest jedno zdarzenie (2027-01-06). Kolejne
   zależą od tego, czy projekt będzie żył po kursie. Na jeden przegląd kwartalnie przypomnienie w
   kalendarzu + procedura z komentarza mogą być wystarczające.
6. **Co by dowiodło, że nie warto**: przegląd 2027-01-06 trwa <30 min z istniejącymi komendami;
   od włączenia Dependabot alerts i joba z `schedule` żadne advisory nie wychodzi już przy
   przypadkowym pushu; w zrekonstruowanych epizodach większość czasu poszła na naprawę, nie na research.
7. **Co byłoby mocnym dowodem, żeby iść dalej**: w co najmniej dwóch epizodach (przeszłych lub z
   dziennika) research i zestawianie źródeł zajęło więcej niż naprawa i powtarzało te same kroki;
   do tego Dependabot alerts nie podpowiedział, który bump jest blokowany lokalnym ograniczeniem.

## Interview Guide

Retrospektywa ~25 min, odpowiadana **na piśmie, z artefaktem przy każdej odpowiedzi** (hash, run,
godzina, fragment sesji agenta). Odpowiedz, zanim otworzysz opis `deps-review`.

**1. Kontekst (3 min)**

1. Ile razy od 2026-09-17 dotykałeś zależności i co było wyzwalaczem każdego razu (planowy upgrade,
   czerwony CI, alert, coś innego)?
   - *Follow-up*: który z nich był zaplanowany, a który Cię zaskoczył?

**2. Ostatnia historia (8 min)**

2. Odtwórz epizod z 2026-10-09 od momentu, w którym zauważyłeś czerwony job, do pushu `8617661`.
   Jakie komendy, jakie strony, jakie pytania do agenta — w kolejności?
   - *Follow-up*: dlaczego między `93c420b` (10:40) a `8617661` (14:22) minęły prawie 4 h — praca
     nad zależnościami czy przerwa?
3. Który krok w tym epizodzie zajął najwięcej czasu? Czy to było znalezienie informacji, decyzja,
   czy sama zmiana i sprawdzenie, że nic się nie zepsuło?

**3. Obecne obejście (5 min)**

4. Skąd wiedziałeś 06.10, że `npm audit fix --force` cofnie `eslint-plugin-astro` i `ts-jest`?
   Sprawdzałeś to wtedy od zera czy już wiedziałeś?
5. Czy w którymś epizodzie agent musiał ponownie ustalać coś, co było już zapisane w
   `audit-ci.jsonc`, `AGENTS.md` lub `contract-surfaces.md`? Pokaż fragment sesji.
   - *Follow-up*: jeśli tak — czy problemem był brak informacji, czy to, że agent jej nie przeczytał?

**4. Koszt (4 min)**

6. Co faktycznie zostało zablokowane lub opóźnione przez czerwony `test:security` przy pushu
   niezwiązanym z zależnościami? Jaka zmiana czekała i jak długo?
7. Złamanie z `cookie` 2026-09-18 — czy jakikolwiek audyt lub `npm outdated` mógłby je przewidzieć?
   Co by je wcześniej pokazało?

**5. Istniejące alternatywy (3 min)**

8. Czy kiedykolwiek miałeś włączone Dependabot alerts lub jakiś harmonogram dla CI w tym albo innym
   repo? Co się z tym stało — dlaczego wyłączone/niewłączone?
9. Jak dziś zamierzasz pamiętać o 2027-01-06? Co już zrobiłeś w tej sprawie (wpis w kalendarzu,
   notatka, nic)?

**6. Sygnał decyzji (2 min)**

10. Gdyby styczniowy przegląd zajął Ci tyle samo czasu co 06.10 — ile to by było i czy to jest
    koszt, który w ogóle chcesz zmniejszać?

**7. Zamknięcie**

11. Które artefakty zachowasz jako materiał porównawczy (logi sesji agenta, ID runów, czas startu
    i końca) dla epizodów, które przyjdą do 2027-01-06?

## Survey

Zamiast ankiety: **dziennik zdarzeń zależnościowych**, wypełniany przy każdym epizodzie do i
włącznie z przeglądem 2027-01-06. Jedna sekcja na zdarzenie, ≤ 3 min.

1. **Screener**: czy to zdarzenie wymagało zmiany w `package.json`, `package-lock.json` lub
   `audit-ci.jsonc`? (tak / nie — jeśli nie, nie wpisuj)
2. Wyzwalacz: planowy upgrade / czerwony `test:security` przy niezwiązanym pushu / alert
   Dependabota / job z harmonogramu / expiry / inne
3. Jak dowiedziałeś się o problemie, ile czasu po publikacji advisory (jeśli wiadomo)?
   (< 1 dzień / 1–7 dni / > 7 dni / nie wiem)
4. Czas na **zbieranie informacji** (advisory, łatki, outdated, skutki `--force`, ograniczenia):
   < 10 min / 10–30 min / 30–60 min / > 60 min
5. Czas na **naprawę i weryfikację** (bump, testy, CI): < 10 min / 10–30 min / 30–60 min / > 60 min
6. Czy któraś informacja była już zapisana w repo, a mimo to ustalałeś ją od nowa? (tak — która / nie)
7. Czy przyczyna leżała poza tym, co widzi `npm audit` / `npm outdated` (regresja runtime,
   breaking change, rozjazd konfiguracji)? (tak / nie)
8. **Otwarte**: jaki był najbardziej żmudny krok i jak go dziś wykonałeś?

## Decision Criteria

Najpierw krok „kup” (niezależnie od wyniku): włączyć Dependabot alerts (bez PR-ów) i dodać osobny
workflow z `schedule` uruchamiający tylko `npm run test:security`. Kryteria oceniaj po przeglądzie
2027-01-06, na podstawie retrospektywy + dziennika.

- **Proceed**: w ≥ 2 epizodach (retrospektywa lub dziennik) zbieranie informacji (pyt. 4) trwało
  ≥ 30 min i dłużej niż naprawa (pyt. 5), **oraz** w ≥ 1 z nich ustalałeś od nowa coś, co było już
  zapisane (pyt. 6), **oraz** alerty Dependabota nie wskazały, który bump blokuje lokalne ograniczenie.
  → `/10x-shape` dla `deps-review` w wersji lokalnego skryptu.
- **Narrow scope**: research boli, ale tylko w jednym miejscu — np. wyłącznie przy wygasających
  wpisach allowlisty (czy wyszła łatka). → zamiast raportu jedna komenda / sekcja procedury, która
  dla wpisów allowlisty uruchamia `npm view` i porównuje z zakresem advisory.
- **Do not build yet**: < 2 epizody do 2027-01-06, albo styczniowy przegląd trwa < 30 min z
  istniejącymi komendami i procedurą z komentarza `audit-ci.jsonc`, albo główny koszt to naprawa
  i regresje runtime (pyt. 7 = tak), których raport nie widzi.
- **Try existing tool/process first**: jeśli po włączeniu Dependabot alerts i joba z `schedule`
  żadne advisory nie wychodzi już przy przypadkowym pushu, a pozostały koszt to pojedynczy
  kwartalny przegląd — zostań przy gotowcu + przypomnieniu w kalendarzu na dzień przed `expiry`.

## Retrospektywa — odpowiedzi

Data wypełnienia: 2026-10-27

| # | Odpowiedź | Artefakt (hash / run / godzina / sesja) |
|---|---|---|
| 1 | 18.09 — planowana aktualizacja. 06.10 i 09.10 — czerwony CI, aktualizacja wymuszona (nieplanowana). | 18.09: `0a1fb4c` → `7f9f8d1`. 06.10: fix `56bbeba` 10:10 w środku pracy nad `testing-session-and-access-boundaries` (poprzedni commit `179870b` 10:02). 09.10: `93c420b` 10:40, `8617661` 14:22. |
| 2 | Właściciel nie pamięta — odtworzone z logów sesji agenta. **Zdarzenie A**: 10:33 wklejony log czerwonego `test:security` (handlebars, sharp) → agent: `npm ls`, `npm view`, `npm audit fix --dry-run` (~35 s), jedno pytanie o strategię, `npm audit fix` bez `--force`, sprawdzenie wpisów allowlisty wg procedury z komentarza (`npm view`, ~15 s), aktualizacja „Stan na”, jest/typecheck/lint → stage 10:39 (~6 min). `npm audit fix` przy okazji podbił `@astrojs/vercel` 11.0.10 → 11.0.13 (zakres `^`). **Zdarzenie B**: 13:34 log z Vercela „Cannot find native binding” — produkcja padała przy starcie każdej funkcji, bo 11.0.13 wciągnął `rolldown` do bundla. Diagnoza agenta ~1,5 min, pin 11.0.12 + bramki + E2E ~7 min. | Sesje `fb3d93b6` (08:33–08:59Z) i `60034ac4` (11:34–11:43Z); `93c420b`, `d989499` (push ~10:58), `8617661`. |
| 3 | Najdroższy krok 09.10 to nie research ani naprawa, tylko **niezauważona awaria produkcji** po skutku ubocznym `npm audit fix`. Właściciel zauważył ją sam, „najpewniej z dużym opóźnieniem”; czasu trwania nie da się ustalić (górna granica ~10:58–14:22, ~3,5 h). Brak alertu z Vercela/monitoringu. | Log Vercela 11:33:44Z wklejony w sesji `60034ac4`; push ~10:58 lokalnie. |
| 4 | Nie wiedział wcześniej — agent ustalił to od zera w trakcie epizodu: `npm audit --json` + `npm audit fix --dry-run` (10:06:13–10:06:49, ~35 s), potem jedno pytanie o strategię (decyzja właściciela ~2 min), bump 3 pakietów + 2 wpisy allowlisty + aktualizacja `AGENTS.md`/`contract-surfaces.md` → commit 10:10. Cały epizod od wklejenia logu do commita ~4,5 min. Mechanizm `expiry` dodany po pytaniu właściciela „czy allowlista stanie się nieaktualna” (10:15–10:18). | Sesja `2851e2fe` (08:05–08:18Z); `56bbeba`, `0936f73`. |
| 5 | Brak takiego przypadku w logach. 06.10 informacje były nowe; 09.10 agent wykonał procedurę z komentarza `audit-ci.jsonc` (sprawdzenie wpisów `npm view`, aktualizacja „Stan na”) bez ponownego researchu. | Sesje `2851e2fe`, `fb3d93b6`. |
| 6 | Oba razy czerwony `test:security` w jobie „Kontrola jakości kodu” zablokował dalsze joby w CI, a więc weryfikację zmiany, nad którą akurat pracował: 06.10 — wiersz 4.5 (E2E w CI) `testing-session-and-access-boundaries`; 09.10 — baza CI dla `testing-quality-gates`. Opóźnienie: minuty (naprawa 4,5 i 6 min). Realny koszt 09.10 przyszedł później — awaria produkcji (pyt. 3). | Jak wyżej. |
| 7 | Złamanie wykrył padający test, przed pushem — istniejące bramki zadziałały. Ani `npm audit`, ani `npm outdated` nie mogły go przewidzieć (problem z rozwiązywaniem importu w SSR entry, nie advisory ani dostępna wersja). Naprawa ~23 min. Raport `deps-review` by go nie pokazał; dziś to ograniczenie jest już zapisane w `AGENTS.md`. | `0a1fb4c` 15:31 → `7f9f8d1` 15:54, 18.09. |
| 8 | Nigdy nie włączone ani tu, ani gdzie indziej — „do tej pory nie było potrzeby”. Repo jest używane często, więc push (i bramka `test:security`) i tak następuje szybko po publikacji advisory; harmonogram dałby niewielki zysk czasu wykrycia przy obecnym rytmie pracy. | Odpowiedź właściciela; częstotliwość commitów w październiku (kilka–kilkanaście dziennie). |
| 9 | Brak przypomnienia — data „pamiętana bez zapisywania”; właściciel sam uznaje to za nieoptymalne. Projekt będzie żył po kursie, ale zostanie przebudowany i będzie istniał w innej formie → horyzont obecnego zestawu zależności, allowlisty i lokalnych ograniczeń (cookie@2, eslint<10) jest niepewny. Doprecyzowanie: nieoptymalny jest **sam mechanizm allowlisty z `expiry`** i pamiętanie daty z głowy. | Odpowiedź właściciela. |
| 10 | Chce zmniejszyć wszystkie trzy koszty (czas przeglądu, ryzyko zepsucia przez bump, późne wykrycie awarii), ale **najbardziej ryzyko, że bump coś zepsuje**. | Odpowiedź właściciela. |
| 11 | Nie — zbieranie czasów deployu/wykrycia z Vercela jest zbyt kosztowne przy krótkim horyzoncie: po kursie znaczna część produkcyjna zostanie przebudowana, Vercel zostanie porzucony, a produkcja i logi będą działać zupełnie inaczej. Dziennik zdarzeń nie będzie prowadzony; przyszłe epizody można odtworzyć z logów sesji agenta. | Odpowiedź właściciela. |

## Wynik walidacji (2026-10-27)

**Werdykt: Do not build** `deps-review`. Kryterium „Proceed” nie jest spełnione w żadnym punkcie:

- **Zbieranie informacji kosztuje sekundy, nie minuty.** W obu wymuszonych epizodach agent zebrał
  wszystko (`npm ls`, `npm view`, `npm audit fix --dry-run`, skutki `--force`) w ~35 s; całe
  epizody trwały 4,5 i 6 min (pyt. 2, 4). Raport skracałby krok, który już jest tani.
- **Nic nie było ustalane od nowa** — procedura z komentarza `audit-ci.jsonc` wystarczyła (pyt. 5).
- **Realne koszty leżą poza zasięgiem raportu**: złamanie `cookie` (pyt. 7, wyłapane przez test) i
  awaria produkcji po skutku ubocznym `npm audit fix` (pyt. 2–3, niewyłapana) — żadnego z nich
  `npm audit` / `npm outdated` nie pokazuje.
- **Krótki horyzont**: przebudowa po kursie, odejście od Vercela, lokalne ograniczenia i allowlista
  prawdopodobnie znikną (pyt. 9, 11).
- **Właściwy problem jest inny**: właściciel najbardziej chce zmniejszyć ryzyko, że bump po cichu
  zepsuje produkcję (pyt. 10). To problem bramki przed deployem, nie raportu o zależnościach.

**Co zamiast tego (cienkie, w ramach istniejących narzędzi, do końca kursu):**

1. Do joba „Build produkcyjny” dodać krok, który ładuje zbudowaną funkcję Vercela w Node (agent
   zrobił dokładnie to w sesji `60034ac4` i to potwierdziło naprawę). Ten krok wyłapałby awarię z
   09.10 przed pushem na produkcję.
2. Przy `npm audit fix` traktować podbicie bezpośredniej zależności (np. `@astrojs/vercel` w zakresie
   `^`) jako osobną zmianę do sprawdzenia, a nie „przy okazji”. Kandydat na wpis w
   `context/foundation/lessons.md`.
3. Allowlista z `expiry`: zostawić do końca kursu; nie inwestować w zamiennik, bo przebudowa i tak
   zmieni zestaw zależności. Przy przebudowie wybrać mechanizm od zera (np. Dependabot/Renovate w
   nowym stosie).

**Wniosek dla mapy szans**: sygnał 2 przeklasyfikować z „Internal tool” na „Wait / no build”;
pierwotny problem przeformułować na „bump psuje produkcję bez sygnału przed deployem”.

## Dziennik zdarzeń

<!-- Kopiuj blok poniżej na każde zdarzenie, najnowsze na dole. -->

### YYYY-MM-DD — krótki opis

1. Screener (tak/nie):
2. Wyzwalacz:
3. Opóźnienie od publikacji advisory:
4. Czas na zbieranie informacji:
5. Czas na naprawę i weryfikację:
6. Ustalane od nowa, choć zapisane w repo:
7. Przyczyna poza `npm audit` / `npm outdated`:
8. Najbardziej żmudny krok:
