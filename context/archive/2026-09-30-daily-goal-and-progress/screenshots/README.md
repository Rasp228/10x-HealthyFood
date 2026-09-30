# Zrzuty kitchen-sink — `/dev/diary-goal-states`

Bramka wizualna z planu (Progress 4.6), zrobiona ponownie 2026-09-30 w ramach triage impl-review (F9),
po poprawkach F2 (`@radix-ui/react-progress`) i F3 (`aria-valuetext`). Playwright/Chromium na
serwerze dev, konto testowe z `.env.test`.

Pliki: `diary-goal-states-{light,dark}-{375,desktop}.png`. Sześć stanów: bez celu, 0/2000,
1500/2000, 2000/2000, 2300/2000, 1500/2000 z dwoma wpisami bez wartości.

Sprawdzone:

- przekroczenie (2300/2000) — pełny pasek w tym samym kolorze, opis `300 kcal ponad cel`
  w `text-muted-foreground`, bez czerwieni i ikon; w obu motywach;
- tor i wypełnienie rozróżnialne w obu motywach; karty mieszczą się w 375 px;
- `aria-valuetext` paska = tekst opisu (np. `2300 / 2000 kcal · 300 kcal ponad cel`), nie `100%`.

Poza zakresem tej zmiany: na 375 px `TopNav` wychodzi poza ekran (przyciski do ~606 px) — stan
sprzed zmiany, nie dotyczy karty sumy. Pływający pasek na zrzutach to Astro dev toolbar.
