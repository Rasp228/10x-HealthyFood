# Baseline evali recenzenta — obecny `SYSTEM_PROMPT`

Pierwszy pomiar recenzenta `tools/code-reviewer` na evalach z Fazy 1. To punkt odniesienia dla
każdej następnej zmiany promptu, schematu albo modelu.

Wynik: `local` 2/3, `openrouter` 3/3 (oba na jednym przebiegu, bez `--repeat`).

## Przebieg `local`

| | |
| --- | --- |
| Data | 2026-11-02 14:47 UTC (eval `eval-sAK-2026-11-02T14:47:01`) |
| Commit | `a204a73`. Przebieg poszedł na drzewie roboczym tuż przed tym commitem; `tools/code-reviewer` nie zmienił się od tamtej pory (`git diff a204a73 -- tools/code-reviewer` jest pusty) |
| Provider | `local` (llama-server) |
| Model | `Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive-Q4_K_M` (z `metadata.metrics.model`) |
| Polecenie | `npm run eval:local` w `tools/code-reviewer` |
| Powtórzenia | brak (`--repeat` nie użyty), więc pass rate niepoliczony |
| Koszt | `null` (llama.cpp kosztu nie zgłasza) |

### Wyniki

Oceny: IC = implementationCorrectness, Id = idiomaticity, Cx = complexity,
TR = testRiskCoverage, Doc = documentation, Sec = securitySafety.

| Przypadek | Oczekiwany | Werdykt | IC | Id | Cx | TR | Doc | Sec | `gradeReview` | Tokeny (in / out) | Czas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sample-2: sekret, IDOR, injection, XSS | `fail`, Sec ≤ 3 | **pass** | 7 | 8 | 9 | 5 | 6 | 7 | **FAIL**: `verdict pass, expected fail; securitySafety 7, expected <= 3` | 1461 / 2396 | 177,8 s |
| sample: off-by-one, null, usunięty clamp | `fail`, IC ≤ 4 | fail | 2 | 5 | 6 | 3 | 5 | 9 | PASS | 1114 / 2861 | 199,5 s |
| sample-clean: poprawna zmiana z testem | `pass`, każda ≥ 4 | pass | 9 | 9 | 10 | 9 | 8 | 10 | PASS | 1474 / 2097 | 150,3 s |

Wynik: **2/3**. Jedno review na przypadek (`steps: 1`, bez retry), razem ok. 8,8 min.

## Przebieg `openrouter`

| | |
| --- | --- |
| Data | 2026-11-02 15:20 UTC (eval `eval-CWy-2026-11-02T15:20:13`) |
| Commit | `a204a73` (`tools/code-reviewer` bez zmian) |
| Provider | `openrouter` |
| Model | `nvidia/nemotron-3.5-super-vl:free` (wg użytkownika; podany tylko w poleceniu, `.env` zostaje z modelem lokalnym) |
| Polecenie | `REVIEW_MODEL=nvidia/nemotron-3.5-super-vl:free npm run eval:openrouter` |
| Wywołania | 3 review, każde `steps: 1` (bez retry), czyli 3 żądania; mieści się w `EVAL_MAX_CALLS=10` |
| Zgłoszony koszt | `0` we wszystkich przypadkach |
| Powtórzenia | brak |

### Wyniki

| Przypadek | Oczekiwany | Werdykt | IC | Id | Cx | TR | Doc | Sec | `gradeReview` | Tokeny (in / out) | Czas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sample-2: sekret, IDOR, injection, XSS | `fail`, Sec ≤ 3 | fail | 2 | 3 | 4 | 1 | 2 | 1 | PASS | 975 / 1868 | 12,2 s |
| sample: off-by-one, null, usunięty clamp | `fail`, IC ≤ 4 | fail | 3 | 3 | 4 | 1 | 5 | 4 | PASS | 646 / 2040 | 16,7 s |
| sample-clean: poprawna zmiana z testem | `pass`, każda ≥ 4 | pass | 9 | 8 | 10 | 8 | 7 | 10 | PASS | 997 / 1581 | 12,6 s |

Wynik: **3/3**, razem 42 s.

### Wcześniejsze nieudane próby (inny model)

Zanim użytkownik zmienił model, trzy próby na nim nie dały ani jednej recenzji, bo dostawca był
przeciążony.

| | |
| --- | --- |
| Model | `nvidia/nemotron-3-ultra-550b-a55b:free` (wg użytkownika) |
| Polecenie | `REVIEW_MODEL=nvidia/nemotron-3-ultra-550b-a55b:free npm run eval:openrouter` |

| Eval (2026-11-02, UTC) | sample-2 | sample | sample-clean | Czas |
| --- | --- | --- | --- | --- |
| `eval-4Ri-2026-11-02T15:06:46` | `[Nvidia] Service temporarily overloaded` (2 próby), 3,0 s | `TimeoutError` 120 s | overloaded (2 próby), 3,1 s | 2 min 7 s |
| `eval-yv8-2026-11-02T15:10:26` | overloaded (2 próby), 2,9 s | overloaded (2 próby), 2,7 s | overloaded (2 próby), 2,7 s | 9 s |
| `eval-RY4-2026-11-02T15:11:28` | `TimeoutError` 120 s | `TimeoutError` 120 s | `TimeoutError` 120 s | 6 min 1 s |

- Werdykty, oceny i tokeny: brak (`steps: 0`, tokeny `null` we wszystkich przypadkach).
- Wywołania: 9 review w trzech przebiegach, po 3 na przebieg, więc każdy przebieg mieści się w
  `EVAL_MAX_CALLS=10` (licznik działa w obrębie procesu). Przy `MAX_RETRIES = 1` to do 18 żądań z
  dziennego limitu darmowych modeli, który ten klucz dzieli z „Daily run cap” w CI.
- Zgłoszony koszt: `null` we wszystkich przypadkach, więc alarm kosztu się nie włączył.
- `TimeoutError` to limit czasu recenzenta dla OpenRouter (120 s). Agent nie zmieniał ani modelu,
  ani limitu czasu.

## Wnioski

- **Obserwacja potwierdzona: lokalny model nie łapie `sample-2.diff`.** Dał `pass` i
  `securitySafety: 7`. W `summary` wspomniał tylko o zaszytym kluczu service-role i jego logowaniu,
  i to jako sugestię („Rozważ też wyciągnięcie klucza…”), a nie powód odrzucenia. Nie wspomniał
  wcale o endpoincie w `PUBLIC_PATHS` z `userId` z query (IDOR), o wstrzyknięciu do filtra `.or()`,
  o odbitym XSS, o `details: error` w odpowiedzi ani o kliencie Supabase tworzonym w trasie.
  Brak walidacji `userId` nazwał „brzegowym przypadkiem” do przetestowania.
- Błędy poprawnościowe łapie dobrze. Na `sample.diff` wskazał wszystkie trzy problemy (`<=`
  poza tablicę, `null` → `NaN`, usunięty `Math.max`), z `implementationCorrectness: 2`.
- `sample-clean.diff` przeszedł z wysokimi ocenami (8-10), więc 2/3 nie wynika z modelu, który
  zawsze mówi `fail`. Słabym punktem jest bezpieczeństwo, nie ogólna surowość.
- `nvidia/nemotron-3.5-super-vl:free` łapie `sample-2.diff` w całości: `securitySafety: 1`,
  `summary` wymienia klucz service-role i jego logowanie, obejście RLS, wstrzyknięcie, XSS i IDOR.
  Nie wymienia `details: error` ani klienta Supabase tworzonego w trasie. Ten sam prompt na innym
  modelu daje poprawny werdykt, więc dziura w `sample-2` wynika z modelu lokalnego, nie tylko z
  promptu.
- Oba modele przepuszczają `sample-clean.diff` z ocenami 7-10.
- Problemy z formą `summary` u `openrouter`, których `gradeReview` celowo nie sprawdza (bez
  regexów na `summary`, zob. plan): w `sample` podsumowanie jest po niemiecku, a w `sample-2`
  zaczyna się od powtórzonego „Werdykt: **fail** / Podsumowanie:”. Te same błędy trafiłyby do
  komentarza w PR-ze.
- Pojedynczy przebieg bez `--repeat` nie mówi, czy wyniki są stabilne.
- Darmowe modele bywają niedostępne: `nemotron-3-ultra-550b-a55b:free` był przeciążony przez
  trzy przebiegi z rzędu, a każdy taki przebieg i tak zużywa dzienny limit klucza.

## Do rozważenia później

- `npm run eval:local -- --repeat 3` i `eval:openrouter -- --repeat 3`, żeby policzyć pass rate.
