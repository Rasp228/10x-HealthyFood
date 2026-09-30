# Zrzuty — `/diary` przed i po zmianie `ui-enhancement`

## Przed (faza 1)

Stan sprzed jakiejkolwiek zmiany wizualnej, zrobiony 2026-09-30 na `master` (`4ea756e`),
zanim w repo pojawiły się nowe prymitywy shadcn. Playwright/Chromium (skrypt jednorazowy poza
repo) na serwerze dev `npm run dev:e2e -- --port 3100 --ignore-lock`, konto testowe z `.env.test`.

Pliki:

- `before-diary-{light,dark}-{375,desktop}.png` — cały `/diary?date=2000-01-05`, `fullPage`;
  375 = viewport 375×812, desktop = 1280×800;
- `before-topnav-375.png` — sam nagłówek na viewporcie 375 px, wycięty na pełną szerokość
  dokumentu (606 px), żeby było widać, jak daleko sięgają przyciski.

Motyw ustawiony przed nawigacją przez `localStorage.theme` (`light` / `dark`) — ten sam klucz,
który czytają `ThemeScript.tsx` i `ThemeToggle.tsx`. Zrzut po `data-testid="diary-page"`
(zhydratowany korzeń) i `networkidle`. Astro dev toolbar ukryty stylem na czas zrzutu.

### Stan danych

Dzień `2000-01-05` — nieużywany przez E2E (`diary-entry.spec.ts` pisze na `2000-01-01`,
`daily-goal.spec.ts` na `2000-01-02`). Przed zrzutami dzień był pusty, cel nieustawiony,
konto bez przepisów. Utworzone przez API w zalogowanym kontekście przeglądarki:

| Wpis                           | Ilość    | Wartość  | Pochodzenie                          |
| ------------------------------ | -------- | -------- | ------------------------------------ |
| Owsianka z bananem             | 1 miska  | 420 kcal | `manual`                             |
| Kanapka z serem                | 2 kromki | 380 kcal | `manual`                             |
| Jabłko                         | 1 sztuka | —        | bez wartości („Nie policzono”)       |
| Zupa pomidorowa z makaronem    | 1 talerz | 200 kcal | `ai_from_description` (wycena AI OK) |
| Makaron z warzywami (zrzut UI) | 2 porcje | 700 kcal | `recipe_nutrition` (350 kcal/porcję) |

Cel dzienny ustawiony na 2000 kcal. Suma dnia: 1700 kcal, pasek 1700 / 2000, „zostało 300 kcal”,
„Bez policzonych kalorii: 1 z 5”.

Po zrzutach:

- wpis z przepisu i sam przepis („Makaron z warzywami (zrzut UI)”) **usunięte** — suita
  `recipe-management` i tak kasuje przepisy konta, a wpis zostałby wtedy sierotą z porcjami;
- cel **przywrócony** do `null` (stan sprzed zrzutów), bo jest jeden na konto i rysuje pasek
  w każdym dniu;
- cztery wpisy opisowe na `2000-01-05` **zostawione** — pod zrzuty „po” w fazie 5. Przed nimi
  trzeba znów ustawić cel 2000 kcal i dodać przepis z blokiem `Wartości odżywcze (na porcję):
  Kalorie: 350 kcal` oraz wpis z niego na 2 porcje.

### Zaobserwowane

- **TopNav na 375 px** wychodzi poza ekran: przyciski sięgają ~606 px, dokument ma
  `scrollWidth` 606 przy viewporcie 375, więc cała strona przewija się w poziomie, a „Wyloguj”
  jest poza pierwszym ekranem (Z7). Brak wyróżnienia aktywnej sekcji.
- Formularz stoi nad sumą dnia — na 375 px suma i pasek zaczynają się dopiero ~770 px od góry,
  poniżej pierwszego ekranu (Z5).
- Paleta achromatyczna: „Dodaj wpis” i „Policz kalorie” są czarne (jasny) / prawie białe
  (ciemny); jedynym kolorem poza czerwienią „Usuń” jest pasek celu (Z1).
- Pigułka „Nie policzono” jest ręcznie złożona; karty formularza, sumy i wpisów wyglądają tak
  samo, więc liczba dnia nie ma wagi ponad wpisami (Z4).
