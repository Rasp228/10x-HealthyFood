---
project: 10x-HealthyFood
researched_at: 2026-09-17
recommended_platform: Vercel
runner_up: Render
context_type: mvp
tech_stack:
  language: TypeScript 5
  framework: Astro 7.3.3 (output "server", React 19 islands)
  runtime: Node 24.13.0
  database: Supabase (PostgreSQL, external)
---

## Recommendation

**Deploy on Vercel (plan Hobby, region `fra1`).**

Vercel jest jedyną z sześciu zbadanych platform o **zerowym koszcie migracji** — projekt już używa `@astrojs/vercel` w `astro.config.mjs`, a `.github/workflows/ci-cd.yml` już jest wpięty w ten cykl. Przy oknie dostawy 3 tygodni po godzinach (PRD `timeline_budget`) czas, którego nie wydajemy na wymianę adaptera, przeczy każdej innej przewadze. Wywiad wskazał minimalizację kosztu jako priorytet i Vercel/Netlify jako znane platformy — Hobby kosztuje $0 przy 3–4 użytkownikach i `target_scale: low`, a znajomość platformy rozstrzyga remis z Renderem. Limit `maxDuration` 300 s przy Fluid compute daje pięciokrotny zapas na wywołania OpenRouter trwające 20–60 s, a plan Hobby pozwala przypiąć pojedynczy region EU (`fra1`) do ko-lokacji z bazą Supabase — czego Netlify na darmowym planie nie pozwala.

Decyzja podjęta świadomie po cross-checku antybiasowym: użytkownik wybrał lidera i przyjął ryzyka do rejestru poniżej.

## Platform Comparison

Wszystkie dane zweryfikowane researchem webowym 2026-09-17 przeciwko oficjalnej dokumentacji i cennikom. Ocena Pass / Partial / Fail według pięciu kryteriów z `references/agent-friendly-criteria.md`.

| Platforma | CLI-first | Managed / serverless | Dokumentacja dla agenta | Stabilne API deployu | MCP / integracja | Koszt/mies. | Limit requestu |
|---|---|---|---|---|---|---|---|
| **Vercel** | Pass | Pass | Pass | Pass | Partial | **$0** (Hobby) | **300 s** (Fluid) |
| **Render** | Pass | Pass | Pass | Partial | Pass | $0 / $7 | **100 min** |
| **Railway** | Pass | Pass | Pass | Partial | Pass | ~$5–7 (+$20?) | 15 min |
| **Cloudflare** | Pass | Pass | Pass | Pass | Pass | $5 | 30 s CPU |
| **Fly.io** | Pass | Partial | Pass | Partial | Partial | ~$2–4 | 60 s idle |
| **Netlify** | Pass | Pass | Pass | Partial | Partial | $0 (EU: $20) | 60 s |

**Filtr twardy — nie zastosowany.** Na pytanie o trwałe połączenia padła odpowiedź „nie wiem", więc żadna platforma nie została odfiltrowana. Z PRD wynika, że aplikacja jest czysto request/response (brak WebSocketów, brak workerów w tle). Realnym ograniczeniem okazał się **limit czasu trwania pojedynczego requestu HTTP**, bo generowanie i modyfikacja przepisu przez OpenRouter trwa 20–60 s. Ta oś zastąpiła filtr w ocenie i to ona wyeliminowała Fly.io.

**Wagi z wywiadu.** Minimalny koszt (waga wysoka) → kara dla Railway i Rendera za brak realnie użytecznego darmowego planu. Doświadczenie z Vercel/Netlify (rozstrzyganie remisów) → przewaga Vercela nad Renderem przy zbliżonym wyniku kryterialnym. Jeden region EU → premia za możliwość przypięcia regionu bez podnoszenia planu; kara dla Netlify (region tylko od Pro $20) i Cloudflare (egzekucja w EU tylko Enterprise). Zewnętrzni dostawcy OK → brak premii za ko-lokowaną bazę, co neutralizuje główny atut Railway.

### Noty per platforma

**Vercel — 4 Pass, 1 Partial.** CLI pełne i deterministyczne (`vercel deploy --prod`, `vercel promote`, `vercel rollback` + `rollback status`, `vercel logs --follow`, `vercel env add`). Dokumentacja najlepsza w stawce: `llms.txt`, `llms-full.txt`, każda strona dostępna jako Markdown przez sufiks `.md` lub nagłówek `Accept: text/markdown`. Partial na MCP z dwóch powodów: serwer `mcp.vercel.com` jest w **public beta** (stan 2026-09) i — ważniejsze — **nadaje agentowi te same uprawnienia co twojemu użytkownikowi Vercela, bez możliwości zawężenia poniżej poziomu konta**. To stoi w sprzeczności z postawą minimalnych uprawnień, więc dla MVP rekomendacją jest CLI ze scoped tokenem, nie MCP.

**Render — 4 Pass, 1 Partial.** Najmocniejszy technicznie: dokumentacja podaje **100 minut** limitu odpowiedzi HTTP, wprost wymieniając *„longer-running calls to third-party APIs, including LLMs"* — to największy zapas w całej stawce. Frankfurt GA, MCP GA (od sierpnia 2025, v0.3.0 ze stycznia 2026), plus 25+ oficjalnych agent skills i `agents.md` pisane pod agentów. Partial na API deployu: **w CLI nie ma komendy `rollback`** — rollback idzie przez REST (`POST /v1/services/{serviceId}/rollback`) albo panel. Darmowy plan istnieje, ale usypia po 15 min bezczynności i budzi się ~60 s; przy 3–4 użytkownikach logujących posiłek raz dziennie **każde wejście trafia w zimny start**, a doklejone do 60 s wywołania AI daje ~2 minuty do pierwszego bajtu. Realny koszt to $7/mies. za Starter.

**Railway — 4 Pass, 1 Partial.** Najlepsza integracja agentowa z całej szóstki: hostowany MCP na `mcp.railway.com`, jednokomendowa konfiguracja `railway setup agent`, oficjalny skill `use-railway`, CLI jawnie zaprojektowane pod CI (`--ci`, `RAILWAY_TOKEN`, błąd `NOT_AUTHENTICATED` zamiast interaktywnego promptu). 15 min na request. Partial na API deployu: **rollback wyłącznie z panelu**, a retencja obrazów na Hobby to **72 godziny** — okno cofnięcia trzech dni jest realnym ograniczeniem. Odpada na koszcie: ~$5–7/mies. za always-on bez sufitu (subskrypcja to kredyt, nie limit), a do tego **nierozstrzygnięta sprzeczność w źródłach co do bramkowania regionu EU planem Pro** — aktualna dokumentacja nie wspomina o bramce, ale odpowiedź pracownika Railway z 2024-03-09 mówi „a pro plan is going to be needed". Jeśli bramka nadal działa, EU kosztuje $20, nie $5.

**Cloudflare — 5 Pass na kryteriach, odrzucony na koszcie migracji.** Formalnie najwyższy wynik kryterialny: `wrangler` pokrywa pełną pętlę operacyjną, dokumentacja publikuje `llms.txt` i serwuje Markdown przez `/index.md`, MCP obejmuje 16 serwerów domenowych. Nie trafia na podium z powodu stosu ryzyk specyficznych dla tego projektu: `@astrojs/cloudflare` w linii dla Astro 5 to 12.x, a najwyższa wersja 12.6.13 wymaga `astro@^5.7.0` — projekt stoi na 5.5.5, więc trzeba albo podbić Astro, albo przypiąć 12.5.5; **adapter w wersji 13.0.0 całkowicie porzucił Cloudflare Pages** na rzecz Workers; **axios nie działa poprawnie na workerd** (axios 1.20.0 ustawia `cache:'default'`, co workerd odrzuca — issue #11192), więc `src/lib/services/ai.service.ts` wymaga migracji na `fetch`; **otwarty, niezałatany bug astro#14511** psuje trasy SSR z middleware przy `nodejs_compat` — a ten projekt ma `src/middleware/index.ts` na każdym żądaniu; darmowy plan daje 10 ms CPU na request, co nie wystarcza na render SSR, więc realnie i tak $5/mies.; egzekucja ograniczona do EU wymaga Regional Services z pakietu Enterprise.

> **Sprostowanie 2026-09-18.** Jedna z przesłanek powyżej się zdezaktualizowała: projekt nie stoi już na Astro 5.5.5, tylko na 7.3.3, więc ograniczenie wersji adaptera `@astrojs/cloudflare` przestało obowiązywać. Pozostałe powody odrzucenia trzymają się bez zmian (axios na workerd, otwarty bug astro#14511 przy middleware, EU tylko na Enterprise, 10 ms CPU na darmowym planie), więc **decyzja się nie zmienia** — ale gdyby ktoś wracał do wyboru platformy, nie może się oprzeć na argumencie o wersji Astro w jego pierwotnym brzmieniu.

**Fly.io — wyeliminowany przez limit czasu.** Fly Proxy zamyka połączenie po **60 s bez przepływu bajtów w którąkolwiek stronę**. Synchroniczne `await axios.post(...)` do OpenRouter, które nie zwraca nic przez 60 s, zostaje zabite — a to jest dokładny kształt wywołania w tym projekcie. Da się to obejść streamingiem albo heartbeatem, ale to praca, której inne platformy nie wymagają. Dodatkowo: **darmowy plan już nie istnieje** (trial to 2 godziny VM lub 7 dni), **region Warszawa `waw` został usunięty** w ramach Region Consolidation Project z 2025-09-09 (najbliżej jest `fra`), brak natywnego `fly rollback`, MCP oznaczony jako eksperymentalny, i zerowe doświadczenie zespołu. Managed oceniony Partial, bo Docker, health checki i sizing maszyn to realna powierzchnia operacyjna.

**Netlify — 3 Pass, 2 Partial.** Dokumentacja wzorowa (`llms.txt` plus Markdown pod sufiksem `.md`), `netlify deploy` jest **draft by default** z wymaganym `--prod` — bezpieczny domyślny stan, który dobrze współgra z pracą agenta. Partial na API deployu: brak komendy `rollback` w CLI, cofanie przez panel („Publish Deploy") albo REST. Partial na MCP: **żadnej opublikowanej etykiety stabilności**, a lokalny pakiet `@netlify/mcp` ostatnio publikowany 2025-11-11 — dziesięć miesięcy zastoju przy agresywnym marketingu agentowym. Odpada głównie na dwóch twardych faktach: **wybór regionu jest funkcją planu Pro ($20/mies.)**, więc na darmowym planie funkcje SSR stoją w Ohio (`cmh`) i każde zapytanie do Supabase w EU przechodzi Atlantyk dwa razy; oraz nowy model kredytowy (od 2025-09-04) daje 300 kredytów miesięcznie przy koszcie **15 kredytów za deploy produkcyjny** — to ok. 20 wdrożeń na miesiąc, po czym projekt jest **pauzowany**. Przy aktywnym CI to realne ograniczenie. Limit 60 s na funkcję pokrywa wywołanie AI, ale z zerowym zapasem, a streaming go nie wydłuża.

### Shortlisted Platforms

#### 1. Vercel (rekomendacja)

Wygrywa sumą trzech rzeczy, z których żadna osobno by nie wystarczyła: **zerowa migracja** (adapter, CI i konfiguracja już na miejscu), **$0** przy tej skali, i **znajomość platformy** przez zespół. Do tego 300 s `maxDuration` na Fluid compute — pięciokrotny zapas nad najdłuższym wywołaniem AI — oraz przypięcie `fra1` dostępne na Hobby, czego Netlify nie daje bez $20. Deployment Protection na preview jest dostępny na Hobby. Dokumentacja platformy jest najlepiej przygotowana pod agenta ze wszystkich sześciu (`llms-full.txt`, `sitemap.md`, `graph.json`, Markdown na każdej stronie) — z jednym poważnym wyjątkiem opisanym w rejestrze ryzyk.

#### 2. Render

Przegrywa o włos i wyłącznie na kosztach oraz koszcie zmiany. Technicznie jest **lepszy** od Vercela w jednym wymiarze, który dla tego projektu jest krytyczny: 100 minut na request zamiast 300 sekund, co zdejmuje limit czasu z listy rzeczy, o których trzeba myśleć. Ma też MCP w GA (Vercel ma beta) i CLI z `-o json`. Luka: wymaga wymiany `@astrojs/vercel` na `@astrojs/node` w trybie standalone, ustawienia `HOST=0.0.0.0` i `NODE_VERSION=22.14.0`, jawnego `region: frankfurt` w `render.yaml` (domyślny jest Oregon i **regionu nie da się zmienić po utworzeniu serwisu**), a darmowy plan z 60-sekundowym zimnym startem jest w praktyce nieużywalny dla aplikacji, do której wchodzi się raz dziennie. To ~$7/mies. i dzień pracy przy trzytygodniowym oknie. **To jest właściwy plan awaryjny, jeśli Vercel zapauzuje projekt lub klauzula komercyjna przestanie pasować.**

#### 3. Railway

Najmocniejsza historia agentowa w stawce — gdyby wagą wiodącą była operowalność platformy przez agenta, a nie koszt, Railway byłby na pierwszym miejscu. `railway setup agent` konfiguruje MCP, skille i autoryzację jedną komendą, PR environments klonują całe środowisko per pull request, a CLI jest zaprojektowane tak, by nie prosić o TTY. Luka wobec rekomendacji: koszt always-on bez sufitu, okno rollbacku 72 h na Hobby, brak rollbacku w CLI i nierozstrzygnięte bramkowanie regionu EU — pierwszy krok wdrożenia musiałby polegać na sprawdzeniu w panelu, czy Amsterdam jest dostępny na Hobby, zanim cokolwiek innego się wydarzy.

## Anti-Bias Cross-Check: Vercel

### Devil's Advocate — Weaknesses

1. **Rollback na Hobby cofa dokładnie o jeden deploy.** Dokumentacja Instant Rollback: *„To roll back further than the previous production deployment, upgrade to Pro"*. Przy pracy po godzinach, gdzie między wdrożeniem a zauważeniem regresji mija dzień lub dwa i zdążyły wejść kolejne deploye, ścieżka cofnięcia nie istnieje — zostaje odtworzenie stanu z gita i pełny rebuild.
2. **Przekroczenie limitów Hobby pauzuje projekt, nie wystawia rachunku.** Limit to 4 godziny Active CPU miesięcznie. Kaskada kaloryczna z FR-009/FR-010 z założenia woła model wielokrotnie — PRD świadomie odrzuca cache'owanie wyniku na przepisie, bo „przy 3–4 użytkownikach wielokrotne wywołania modelu nic nie kosztują". To prawda dla rachunku OpenRoutera, ale nie dla budżetu CPU Vercela. Pętla ponowień bez limitu prób potrafi zapauzować konto na **30 dni**, bez możliwości odkupienia inaczej niż przejściem na Pro.
3. **Klauzula komercyjna Hobby jest szersza, niż się wydaje.** Fair Use (aktualizacja 2026-07-29): *„Commercial usage is defined as any Deployment that is used for the purpose of financial gain of anyone involved in any part of the production of the project, including a paid employee or consultant writing the code."* Osobne ograniczenie: **konto Hobby nie podłączy repozytorium należącego do organizacji GitHub** — repo musi być osobiste.
4. **Własna dokumentacja Vercela o Astro jest nieaktualna i będzie aktywnie wprowadzać agenta w błąd.** Strona `vercel.com/docs/frameworks/frontend/astro` (data aktualizacji 2026-08-26) wciąż pokazuje `import vercel from '@astrojs/vercel/serverless'`, `output: 'hybrid'` i `functionPerRoute` — wszystkie usunięte w Astro 5 / adapterze v8. Ten sam błędny import występuje na stronie o `maxDuration`. To jest dokładnie ta pułapka, przed którą ostrzega twarda reguła w `AGENTS.md`; agent, który podczas wdrożenia pobierze stronę Vercela, wyprodukuje konfigurację sprzeczną z regułą własnego repozytorium.
5. **Fluid compute współdzieli instancje funkcji między requestami.** Repozytorium jest dziś bezpieczne, bo klient Supabase jest tworzony per-request w `src/middleware/index.ts` i czytany z `context.locals.supabase`. Ale przy Fluid compute przyszły refaktor typu „wynieśmy klienta do module scope, żeby nie tworzyć go za każdym razem" przestaje być optymalizacją wydajności, a staje się wyciekiem sesji jednego użytkownika do requestu drugiego. Nic w CI tego nie wykrywa, a reguła w `AGENTS.md` mówi „nigdy nie twórz klienta w trasie" — co jest poprawne, ale nie adresuje wprost module scope.

### Pre-Mortem — How This Could Fail

Sześć miesięcy później decyzja okazuje się katastrofą. Zaczyna się niewinnie: przy pierwszym wdrożeniu nikt nie zmienia regionu, więc funkcje SSR startują w `iad1` w Waszyngtonie, podczas gdy baza Supabase stoi w EU — każde zapytanie o wpis dziennika przechodzi Atlantyk dwa razy. Dziennik kaloryczny jest z natury używany codziennie i po kilka razy dziennie, więc opóźnienie jest odczuwalne od pierwszego tygodnia, ale nikt nie wie, skąd pochodzi: logi runtime na planie Hobby żyją godzinę, więc po nocy debugowania nie ma już czego czytać.

Moduł dziennika wchodzi na produkcję z kaskadą kaloryczną, która dla przepisów bez bloku wartości odżywczych woła model od nowa przy każdym odczycie — świadoma decyzja z PRD, tania przy czterech użytkownikach. Ktoś dodaje ponowienie przy błędzie modelu, bo OpenRouter czasem zwraca 429. Ponowienie nie ma limitu prób. W weekend budżet Active CPU się wyczerpuje i Vercel pauzuje projekt. Aplikacja znika dla wszystkich użytkowników, a jedyne wyjścia to czekać trzydzieści dni albo zapłacić za Pro. Rollback nie ratuje: błąd wszedł trzy deploye wcześniej, a Hobby cofa o jeden.

### Unknown Unknowns

- **Domyślnym regionem nowego projektu jest `iad1` (Waszyngton), a nie region twojego konta ani region twojej bazy.** Bez jawnego ustawienia dostajesz w pełni działającą aplikację z cichym podatkiem latencyjnym na każdym zapytaniu do Supabase. Nic się nie psuje — po prostu jest wolno, a przyczyna nie jest widoczna w żadnym logu. W tym projekcie region europejski jest ustawiony w panelu; druga część pułapki jest taka, że **zmiana regionu nie działa wstecz — obowiązuje dopiero od kolejnego deployu**, więc ustawienie w panelu i faktyczny region wykonania mogą się przez jakiś czas rozjeżdżać.
- **`@astrojs/vercel` jest wersjonowany per major Astro, nie semantycznie względem funkcji.** Linie: **9.x = Astro 5, 10.x = Astro 6, 11.x = Astro 7**. `npm update` albo agent sięgający po „najnowszą wersję" zainstaluje 11.0.10, która wymaga `astro@^7` i zepsuje build w sposób, który wygląda na problem z konfiguracją, a nie z wersją. Obecny zapis `^8.1.5` rozwiązuje się do 8.2.11; sufit dla Astro 5 to 9.0.5.
- **Vercel nie czyta `.nvmrc`** — jego domyślna wersja Node to 24.x, niezależnie od tego, co pinuje repozytorium. W tym projekcie wersja jest ustawiona ręcznie w panelu, więc rozjazd nie występuje. Konsekwencja na przyszłość: podbicie `.nvmrc` nie propaguje się na produkcję, a CI (które `.nvmrc` czyta) i Vercel zaczną się różnić w ciszy.
- **Logi runtime na Hobby są retencjonowane przez godzinę.** Nieudana generacja przepisu zgłoszona rano jest niediagnozowalna — dowody już nie istnieją. To zmienia sposób pracy: obserwowalność musi trafiać do własnej tabeli w Supabase (tabela `logs` już istnieje i ma kolumny `actual_ai_model`, `generate_response_time`, `is_accepted`), a nie do platformy.
- **`rewrites` w `vercel.json` są oficjalnie niewspierane dla Astro** — dokumentacja mówi wprost o *„inconsistent behavior, and is not officially supported"*. Każde przekierowanie i routing muszą zostać w Astro albo w middleware.
- **Instant Rollback nie cofa zmiennych środowiskowych ani schematu bazy.** Migracja Supabase dodająca tabelę dziennika nie wycofa się razem z deployem kodu. Rollback kodu na bazie z nowym schematem to osobna klasa awarii, której platforma nie widzi.
- **`vercel dev` nie jest potrzebny w tym projekcie.** `astro dev` (z adapterem Vercela w konfiguracji) daje wystarczającą wierność środowiska lokalnego dla Astro 5; `vercel dev` to ścieżka pochodząca z projektów bez frameworkowego dev servera i wprowadza własne rozjazdy. Lokalny cykl zostaje na `npm run dev`.

## Operational Story

- **Preview deploys**: każdy push na branch i każdy PR dostaje własny URL preview budowany automatycznie z integracji Git. Ochrona: **Vercel Authentication jest dostępna na Hobby** w wariancie Standard Protection (chroni wszystko poza domeną produkcyjną) — włączyć ją przed pierwszym pushem, bo preview z aktywną sesją Supabase to publicznie dostępna instancja aplikacji. Password Protection jest tylko na Pro. Dla E2E w CI obejście idzie przez `VERCEL_AUTOMATION_BYPASS_SECRET`. Ograniczenie: Hobby dopuszcza **jednego zewnętrznego użytkownika** do przeglądania chronionych preview.
- **Secrets**: zmienne środowiskowe siedzą w Vercelu (`vercel env add <NAZWA> production`), szyfrowane w spoczynku, z kontekstem per środowisko (production / preview / development). Klucze `SUPABASE_SERVICE_ROLE_KEY` i `OPENROUTER_API_KEY` oznaczyć jako **sensitive env vars** — stają się write-only i są automatycznie redagowane w logach buildu. Token do CLI dla agenta i dla GitHub Actions to osobny, scoped `VERCEL_TOKEN` trzymany w zmiennej środowiskowej i w GitHub Secrets — **nigdy w `.mcp.json` ani w treści rozmowy**. Rotacja: unieważnienie tokenu w panelu Vercela plus podmiana w GitHub Secrets; rotacja klucza Supabase to operacja ręczna po stronie Supabase.
- **Rollback**: `vercel rollback` (bez argumentu cofa do poprzedniego deploymentu produkcyjnego), stan sprawdzany przez `vercel rollback status`. Czas cofnięcia: sekundy — Vercel przełącza alias, nie przebudowuje. **Na Hobby można cofnąć wyłącznie o jeden krok.** Rollback wyłącza automatyczne przypisywanie produkcji do nowych deployów do czasu jawnego `vercel promote`. **Zastrzeżenie na dane: rollback nie cofa zmiennych środowiskowych ani migracji Supabase** — migracja dodająca tabelę dziennika zostaje, więc kod sprzed migracji musi tolerować schemat po migracji.
- **Approval**: agent może bez pytania wykonywać `vercel deploy` (preview), `vercel logs`, `vercel env ls`, `vercel inspect`, `vercel rollback status` oraz odczyty przez `vercel api`. **Wyłącznie człowiek**: `vercel deploy --prod` i `vercel promote` (publikacja na produkcję), `vercel env rm` i rotacja `OPENROUTER_API_KEY` / kluczy Supabase, `supabase db push` na produkcyjną bazę, usunięcie projektu, zmiana planu na Pro. Podniesienie limitu `maxDuration` i zmiana regionu to zmiany w plikach repo przechodzące przez normalny przegląd PR, nie operacje na żywej platformie.
- **Logs**: `vercel logs <deployment-url> --follow` dla runtime, `vercel inspect <url> --logs` dla logów buildu, `--json` do parsowania. **Retencja na Hobby to jedna godzina**, więc to narzędzie do obserwacji na żywo, nie do śledztwa po fakcie. Trwała obserwowalność należy do tabeli `logs` w Supabase, która już zapisuje model, czas odpowiedzi generacji i akceptację wyniku. MCP Vercela świadomie **nie** jest częścią domyślnej ścieżki operacyjnej dla MVP: jest w public beta i nadaje uprawnienia na poziomie całego konta, bez zawężenia.

## Risk Register

| Ryzyko | Źródło | Prawdop. | Wpływ | Mitygacja |
|---|---|---|---|---|
| Funkcje SSR startują w `iad1`, baza Supabase w EU — podwójne przejście Atlantyku na każdym zapytaniu | Unknown unknowns | L | M | **Zaadresowane**: region europejski ustawiony ręcznie w panelu Vercela. Pozostaje jeden krok — zmiana wchodzi w życie dopiero przy kolejnym deployu, więc po pierwszym wdrożeniu zweryfikować faktyczny region wykonania. |
| Konfiguracja regionu i wersji Node żyje wyłącznie w panelu — nie ma jej w gicie, więc jest niewidoczna dla agenta i przeglądu PR | Research finding | M | M | Odtworzenie projektu na Vercelu (nowy projekt, przeniesienie konta) nie przywróci tych ustawień — sprawdzić je ręcznie w panelu po każdej takiej operacji. Agent planujący wdrożenie nie powinien wnioskować o regionie ani o wersji Node z zawartości repozytorium. |
| Wyczerpanie Active CPU pauzuje projekt na 30 dni; kaskada kaloryczna woła model wielokrotnie bez cache | Devil's advocate + Pre-mortem | M | **H** | Twardy limit prób w ponowieniach wywołań OpenRoutera (max 2, z backoffem) w `src/lib/services/ai.service.ts`. Alert budżetowy w panelu Vercela. Render jako gotowy plan awaryjny — patrz sekcja „2. Render". |
| Rollback na Hobby cofa tylko o jeden deploy | Devil's advocate | M | M | Wdrażać na produkcję małymi krokami i weryfikować od razu po `vercel promote`, nie następnego dnia. Tagować każdy deploy produkcyjny w gicie, żeby odtworzenie stanu nie wymagało archeologii. |
| Agent pobiera stronę Vercela o Astro i pisze `@astrojs/vercel/serverless`, `output: 'hybrid'`, `functionPerRoute` | Devil's advocate | **H** | M | Reguła w `AGENTS.md` już zakazuje ścieżki `/serverless` — rozszerzyć ją o zdanie „dokumentacja Astro na vercel.com jest nieaktualna; źródłem prawdy jest docs.astro.build". Rozważyć wpis w `context/foundation/lessons.md` przez `/10x-lesson`. |
| Wyciek sesji między użytkownikami po przeniesieniu klienta Supabase do module scope (Fluid współdzieli instancje) | Devil's advocate | L | **H** | Doprecyzować regułę w `AGENTS.md`: klient Supabase **wyłącznie** z `context.locals.supabase`, nigdy w zasięgu modułu — nie tylko „nie w trasie". |
| `npm update` podbija `@astrojs/vercel` do linii 10.x/11.x wymagającej Astro 6/7 i psuje build | Unknown unknowns | M | M | Przypiąć adapter dokładną wersją zamiast `^8.1.5`. Sufit dla Astro 5 to 9.0.5. |
| Build produkcyjny leci na innej wersji Node niż lokalnie i w CI | Unknown unknowns | L | L | **Zaadresowane**: wersja Node ustawiona ręcznie w panelu Vercela zgodnie z `.nvmrc`. Przy podbiciu `.nvmrc` pamiętać o równoległej zmianie w panelu — nic tego nie synchronizuje automatycznie. |
| Logi runtime znikają po godzinie; awarię zgłoszoną rano nie da się zdiagnozować | Unknown unknowns | **H** | M | Rozszerzyć zapis do istniejącej tabeli `logs` w Supabase o błędy i kody statusu, nie tylko o udane generacje. Platforma to podgląd na żywo, nie archiwum. |
| Klauzula non-commercial Hobby; repo musi być osobiste, nie organizacyjne | Devil's advocate | L | M | Trzymać repozytorium na koncie osobistym. Jeśli projekt kiedykolwiek zarobi lub stanie się pracą płatną — przejście na Pro ($20/mies.) albo migracja na Render. |
| Rollback kodu na bazie po migracji dziennika — kod sprzed migracji spotyka nowy schemat | Unknown unknowns | M | M | Migracje Supabase pisać addytywnie (nowa tabela, nowe kolumny nullable), nigdy destrukcyjnie w tym samym kroku co zmiana kodu. Wdrażać migrację przed kodem, który z niej korzysta. |
| MCP Vercela nadaje agentowi uprawnienia całego konta, bez zawężenia; public beta | Research finding | M | **H** | Dla MVP nie podłączać MCP Vercela. Operacje przez CLI ze scoped `VERCEL_TOKEN` w zmiennej środowiskowej. Wrócić do tematu, gdy pojawi się realny wzorzec wielokrotnych zapytań o stan live. |
| `rewrites` w `vercel.json` niewspierane dla Astro | Research finding | L | M | Routing i przekierowania wyłącznie w Astro / `src/middleware/index.ts`. `vercel.json` ograniczyć do `regions`. |
| Preview deploy bez ochrony to publicznie dostępna instancja aplikacji z sesjami Supabase | Research finding | M | **H** | Włączyć Vercel Authentication (Standard Protection) na Hobby przed pierwszym pushem na branch. Dla E2E w CI użyć `VERCEL_AUTOMATION_BYPASS_SECRET`. |

## Getting Started

Komendy zweryfikowane przeciwko wersjom z tego repozytorium (Astro 5.5.5, `@astrojs/vercel` ^8.1.5, Node 22.14.0), nie przeciwko ogólnej dokumentacji platformy.

> **Ustawienia zarządzane z panelu Vercela — nie duplikować w repo.** Wersja Node i region funkcji są ustawione ręcznie w ustawieniach projektu na Vercelu: Node zgodnie z `.nvmrc`, region europejski zamiast domyślnego `iad1`. Świadoma decyzja — `vercel.json` z kluczem `regions` ani pole `engines` w `package.json` nie są potrzebne i tworzyłyby drugie źródło prawdy. Zastrzeżenie operacyjne: **zmiana regionu w panelu wchodzi w życie dopiero przy kolejnym deployu**, więc po jej wprowadzeniu trzeba wykonać wdrożenie, żeby zaczęła obowiązywać.

1. **Podnieść limit czasu funkcji pod wywołania AI.** W `astro.config.mjs` rozszerzyć istniejącą konfigurację adaptera — **bez zmiany ścieżki importu**, która jest już poprawna (`@astrojs/vercel`, nigdy `@astrojs/vercel/serverless`):
   ```js
   adapter: vercel({
     webAnalytics: { enabled: true },
     maxDuration: 120,
   }),
   ```
   Fluid compute jest domyślny dla nowych projektów i dopuszcza do 300 s na Hobby; 120 s daje dwukrotny zapas nad najdłuższą generacją i zostawia margines na diagnozę.

2. **Zainstalować CLI i połączyć projekt.** `npm i -g vercel`, następnie `vercel login` i `vercel link` w katalogu repozytorium. Do CI i do pracy agenta wygenerować osobny, scoped token i trzymać go w `VERCEL_TOKEN` (zmienna środowiskowa lokalnie, GitHub Secret w Actions) — nie w plikach repozytorium.

3. **Wprowadzić sekrety i oznaczyć wrażliwe.** `vercel env add SUPABASE_URL production`, analogicznie dla `SUPABASE_KEY` i `OPENROUTER_API_KEY`. Klucze service-role i klucz OpenRoutera oznaczyć jako *sensitive* — stają się write-only i są redagowane w logach buildu. Powtórzyć dla kontekstu `preview`, jeśli preview mają działać przeciwko osobnemu projektowi Supabase.

4. **Włączyć ochronę preview, potem wdrożyć.** W ustawieniach projektu: Deployment Protection → Vercel Authentication → Standard Protection. Następnie `vercel deploy` (preview, agent może to robić sam), sprawdzić `vercel logs <url> --follow`, i dopiero po weryfikacji `vercel deploy --prod` **wykonane przez człowieka**.

Lokalny cykl developerski zostaje na `npm run dev` (`astro dev`). `vercel dev` nie jest w tym projekcie potrzebny — Astro 5 z adapterem w konfiguracji daje wystarczającą wierność, a `vercel dev` wprowadza własne rozjazdy.

## Out of Scope

Poniższe nie były przedmiotem tego researchu:

- Konfiguracja obrazów Docker i Dockerfile'i
- Konfiguracja pipeline'u CI/CD (`.github/workflows/ci-cd.yml` istnieje i pozostaje bez zmian w zakresie tej decyzji)
- Architektura produkcyjna: multi-region, wysoka dostępność, disaster recovery
- Wybór regionu i planu dla samego Supabase (zewnętrzny dostawca — decyzja poza tą analizą, ale jej wynik determinuje punkt 1 w „Getting Started")
