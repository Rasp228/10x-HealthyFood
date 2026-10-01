# Skan literałów — widok `/diary`

Skan z `/10x-ui` („Hardcoded-value scan”), uruchomiony 2026-10-01 na plikach widoku oczyszczonych
przez `ui-enhancement` (`context/archive/2026-09-30-ui-enhancement/`). To lista kandydatów, nie
werdykt: każde trafienie to możliwy zarzut „brakujący token”.

## Wzorzec

```bash
RE='#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(|-\[[0-9.]+(px|rem)\]|\b(bg|text|border|ring|outline|from|via|to|fill|stroke|shadow|divide)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\b'
```

Pliki: `src/pages/diary.astro`, `src/components/diary/**`, `src/components/feedback/Toast.tsx`,
`src/components/common/ConfirmDialog.tsx`, `src/components/layout/TopNav.astro` (plus, po zmianie,
`src/pages/dev/diary-states.astro`). Skan nie obejmuje źródła tokenów (`src/styles/global.css`).

## Wynik

| Stan | Rewizja | Plików | Trafień |
| --- | --- | --- | --- |
| Przed `ui-enhancement` | `4ea756e` | 12 | **15** |
| Po `ui-enhancement` | `2f9c944` | 16 | **0** |

Trafienia przed zmianą (linie z dopasowaniem):

| Plik | Trafień | Co | Zarzut |
| --- | --- | --- | --- |
| `src/components/diary/DiaryPage.tsx:244,247,248,251` | 4 | panel błędu listy na `red-*` z `dark:` | Z2 |
| `src/components/feedback/Toast.tsx:28-29,49-50,71-72,94-95` | 8 | cztery typy toastów na palecie z `dark:` | Z6 |
| `src/components/common/ConfirmDialog.tsx:34,38,42` | 3 | ikony dialogu (`text-red-600` itd.) | Z8 |

Odtworzenie liczby „przed”:

```bash
for f in $(git ls-tree -r --name-only 4ea756e -- src/pages/diary.astro src/components/diary \
  src/components/feedback/Toast.tsx src/components/common/ConfirmDialog.tsx \
  src/components/layout/TopNav.astro); do git show 4ea756e:$f | grep -cE "$RE"; done
```

## Strażnik

Ten sam wzorzec jest regułą ESLint (`uiTokensConfig` w `eslint.config.js`,
`no-restricted-syntax` na `Literal` i `TemplateElement`) dla tych samych plików. Bez nowej
zależności, więc działa w `npm run lint` (bramka `code-quality` w CI) i w hooku pre-commit
(`lint-staged` → `eslint --fix`).

Sprawdzenie reguły:

- stan `4ea756e` puszczony przez ESLint: 4 + 8 + 3 = **15 błędów**, ta sama liczba co grep;
- obecne drzewo: `npm run lint` → 0 błędów;
- próbka w `src/components/diary/` z `bg-red-50`, `text-white` w template stringu, `"#fff"`
  i `w-[13px]` → 4 błędy, a `bg-primary/10 text-success` przechodzi;
- próbka `.astro` (`class="text-gray-500"`) → 1 błąd;
- ten sam literał w `src/components/auth/` → 0 (poza zakresem, celowo).

Różnica wobec grepu: w selektorze ESLint `#[0-9a-fA-F]{3,8}` jest zapisane jako
`#[0-9a-fA-F]{3}[0-9a-fA-F]*` (bez przecinka w kwantyfikatorze, który mógłby się kłócić
z listą selektorów esquery). Łapie te same literały hex, także dłuższe niż 8 znaków.

Druga różnica (przegląd wdrożenia, ustalenie F2): ESLint łapie wartości arbitralne w jednostkach
`px|rem|em|%|vh|vw|ch`, a grep ze skilla tylko `px|rem`. Liczby przed/po wyżej pochodzą z grepu;
w plikach widoku nie ma dziś żadnej wartości `-[…]`, więc szerszy wzorzec ich nie zmienia.
`bg-[var(--x)]` dalej przechodzi.

## Sprawdzian w nowej sesji

2026-10-01: użytkownik zlecił agentowi w świeżej sesji drobną zmianę w `/diary`. Agent użył tokenów
i prymitywów z kontraktu i bez podpowiedzi stosował reguły z `AGENTS.md` („Design-system contract”).
Wynik potwierdzony przez użytkownika, bez zapisu samego diffu.
