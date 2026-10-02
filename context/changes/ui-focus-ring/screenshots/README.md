# Zrzuty — fokus klawiatury po zmianie `ui-focus-ring`

> W repo są trzy zrzuty: `focus-light-desktop.png`, `focus-dark-desktop.png`
> i `focus-light-375.png`. Repo nie ma testów zrzutów, więc PNG to dokumentacja, nie baseline.
> Odtwarzalną bramką jest sekcja „Fokus klawiatury” na `/dev/diary-states` razem z opisaną niżej
> metodą. Pełny zestaw (48 plików) powstał lokalnie i nie trafił do repo.

## Metoda

Zrobione 2026-10-02 na `fix/ui-focus-ring` po fazie 1 (`205018e`) plus plik fazy 2, tą samą
metodą co w `context/archive/2026-09-30-ui-enhancement/screenshots/README.md`: jednorazowy skrypt
Playwright/Chromium poza repo (katalog scratchpad sesji), serwer
`npm run dev:e2e -- --port 3102 --ignore-lock`, logowanie formularzem `/auth/login` kontem
testowym z `.env.test`, motyw przez `localStorage.theme` (`addInitScript`, przed nawigacją), Astro
dev toolbar ukryty stylem, zrzut po `networkidle`. Desktop = 1280×800, 375 = 375×812.

Fokus wyłącznie klawiaturą, bo `:focus-visible` nie da się wymusić klasą: klik w nagłówek
„Fokus klawiatury” (element niefokusowalny, ustawia tylko punkt startu nawigacji sekwencyjnej),
potem `keyboard.press("Tab")` aż `document.activeElement` ma `data-testid="focus-demo-<nazwa>"`.
Przy każdym celu skrypt sprawdza `matches(":focus-visible")` (zawsze `true`) i czeka 250 ms przed
zrzutem — przycisk ma `transition-all`, więc styl odczytany zaraz po Tab jest jeszcze w trakcie
przejścia (szerokość `medium` = 3 px, offset 0). Na TopNav: `/diary?date=2000-01-05`, Tab od
początku strony aż do elementu z `aria-current="page"` („Dziennik”). Danych nie zmieniano.

## Pliki w repo

- `focus-light-desktop.png` — sekcja „Fokus klawiatury”, jasny motyw, fokus na przycisku
  `destructive` („Usuń”): obrys 2 px w turkusie marki (`--ring`), oddzielony od czerwonego
  wypełnienia białą szczeliną 2 px.
- `focus-dark-desktop.png` — ta sama sekcja, ciemny motyw, fokus na polu z błędem
  (`aria-invalid="true"`, „Kalorie”): czerwona ramka błędu zostaje, a na zewnątrz, po szczelinie
  w kolorze karty (`--card`), jasny turkusowy obrys — fokus pola z błędem jest odróżnialny od stanu
  bez fokusu.
- `focus-light-375.png` — sam `<header>` na 375 px, fokus na aktywnym linku „Dziennik” (wariant
  `default`): obrys ze szczeliną mieści się w `p-1` paska linków, nie jest przycięty.

## Sprawdzone lokalnie (bez commitowania)

- Każdy z 7 celów (`default`, `outline`, `ghost`, `destructive`, `input`, `invalid`, `textarea`)
  w czterech układach: jasny/ciemny × desktop/375. Na wszystkich obrys 2 px ze szczeliną 2 px,
  w kolorze `--ring` w obu motywach, także na `destructive` i polu z błędem; na `default` szczelina
  oddziela obrys od wypełnienia w tym samym kolorze. Pola mają przy fokusie także ramkę
  `border-ring` (poza polem z błędem, gdzie zostaje `border-destructive`).
- TopNav na 375 px w ciemnym motywie: jak w jasnym, obrys nieprzycięty.
- `scrollWidth`: 1280 na desktopie, 375 na 375 px — sekcja nie rozszerza strony.
- Nazwy dostępne (snapshot drzewa dostępności sekcji): przyciski „Dodaj wpis (wariant default)”,
  „Poprzedni dzień (wariant outline)”, „Edytuj (wariant ghost)”, „Usuń (wariant destructive)”;
  pola „Co zjadłeś?”, „Kalorie” (`[invalid]`, opis błędu przez `aria-describedby`), „Notatka”.
  Każda kontrolka ma `<Label>` albo widoczny tekst i `aria-label`.

### `forcedColors: "active"`

Emulacja Chromium, sekcja fokusu (jasny i ciemny motyw strony, wszystkie 7 celów) i TopNav 375.
**Obrys fokusu jest rysowany** na każdym wariancie: `outline: 2px solid`, offset 2 px, w kolorze
systemowym `rgb(55, 0, 110)` — w tym na przyciskach bez ramki (`default`, `ghost`,
`destructive`), które przed fazą 1 w tym trybie według `research.md` (Z4) nie miały żadnego wskaźnika (stanu
sprzed fazy 1 nie zrzucano).

Poprawka w tej fazie: pierwsza wersja z fazy 1 miała `outline-hidden` w bazie prymitywów, bez
wariantu. Zastępczy obrys, który Tailwind 4 dokłada do `outline-hidden` pod
`@media (forced-colors: active)` (2 px, przezroczysty), tryb zamieniał na kolor systemowy
(`rgb(0, 0, 0)`), więc **każda** kontrolka miała stały obrys także bez fokusu — fokus różnił się
tylko kolorem, a pola i przycisk `outline` miały podwójną linię. Prymitywy mają teraz
`focus:outline-hidden`: bez fokusu w forced-colors nie ma obrysu, przy Tab wygrywa
`focus-visible:outline-*` (stoi w CSS po `focus:`). Ponowny pomiar po poprawce: obrys
`solid 2px rgb(55, 0, 110)`, offset 2 px tylko na kontrolce z `:focus-visible`, pozostałe
`outline-style: none`; w zwykłym trybie fokus bez zmian (`solid 2px` w pełnym `--ring`, offset 2 px).
Zrzuty PNG w tym katalogu nie zmieniły się — poprawka dotyczy tylko kontrolek bez fokusu
w forced-colors.
