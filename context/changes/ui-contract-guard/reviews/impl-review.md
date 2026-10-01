<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Utrwalenie kontraktu design-systemu dla widoku dziennika (/diary)

- **Plan**: context/changes/ui-contract-guard/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1
- **Date**: 2026-10-01
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Bramki uruchomione ponownie podczas przeglądu: `npm run lint` → 0 błędów; `npx prettier --check`
na `AGENTS.md`, `eslint.config.js`, `docs/reference/known-drift.md` → OK; pliki widoku ze stanu
`4ea756e` puszczone przez ESLint (`--stdin-filename`) → 15 błędów `no-restricted-syntax`
(ConfirmDialog 3, DiaryPage 4, Toast 8), zgodnie z `literal-scan.md`.

## Findings

### F1 — Blok 10x-cli w CLAUDE.md przepisany wbrew „What We're NOT Doing”

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: CLAUDE.md:3-14
- **Detail**: Plan wprost wyklucza „zmian w bloku `@przeprogramowani/10x-cli` w `CLAUDE.md`”, a commit `2b0a25b` zastępuje w nim ~30 linii (router zadań, kontrakt, granice lekcji) skróconym odesłaniem do `/10x-ui`. Treść wygląda na synchronizację toolkitu, ale plan i `literal-scan.md` tego nie odnotowują, więc diff zmiany wychodzi poza jej deklarowany zakres.
- **Fix**: Dopisać w `plan.md` (sekcja addendum) jedną linię, skąd pochodzi zmiana bloku (sync 10x-cli), albo przenieść ją do osobnego commitu `chore`.
- **Decision**: FIXED — addendum w `plan.md` (pochodzenie zmiany: sync 10x-cli)

### F2 — Strażnik łapie wartości arbitralne tylko w px/rem

- **Severity**: 💬 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: eslint.config.js:71
- **Detail**: `AGENTS.md` zakazuje „arbitrary values (`p-[13px]`)” ogólnie, a wzorzec `-\[[0-9.]+(px|rem)\]` przepuszcza `w-[50%]`, `h-[10vh]`, `mt-[1.5em]`, `bg-[var(--x)]`. Obecne pliki widoku nie mają żadnej wartości `-[…]`, więc rozszerzenie nie zepsuje lintu.
- **Fix A ⭐ Recommended**: Rozszerzyć jednostki do `(px|rem|em|%|vh|vw|ch)` w `UI_LITERAL` (i tym samym wzorcu w `literal-scan.md`).
  - Strength: Domyka najczęstsze odstępy bez ryzyka składni esquery; dziś 0 trafień w widoku.
  - Tradeoff: Wzorzec odchodzi od grepu w skillu `/10x-ui` — trzeba to odnotować w `literal-scan.md`.
  - Confidence: MED — esquery z alternatywą w grupie już działa w tym wzorcu.
  - Blind spot: `bg-[var(--x)]` dalej przechodzi.
- **Fix B**: Zostawić regułę, a w `AGENTS.md` dopisać, że lint sprawdza tylko px/rem.
  - Strength: Zero zmian w strażniku, zgodność z grepem skilla.
  - Tradeoff: Agent dostaje regułę szerszą niż jej egzekucja.
  - Confidence: HIGH — tylko tekst.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — jednostki `px|rem|em|%|vh|vw|ch` w `UI_LITERAL`, różnica wobec grepu odnotowana w `literal-scan.md`

### F3 — known-drift.md: lista katalogów komponentów bez `diary`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: docs/reference/known-drift.md:47
- **Detail**: Poprawiony akapit kończy się `src/components/{ai,auth,common,feedback,layout,pages,profile,recipe}/`, a `AGENTS.md` i drzewo mają też `diary`. Dryf sprzed zmiany, ale w akapicie, który zmiana edytowała.
- **Fix**: Dopisać `diary` do listy w nawiasach klamrowych.
- **Decision**: FIXED — `diary` dopisane do listy katalogów

### F4 — Sprawdzian 1.4 bez śladu w repo

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/ui-contract-guard/literal-scan.md (sekcja „Sprawdzian w nowej sesji”)
- **Detail**: Krok 1.4 odhaczony na podstawie deklaracji użytkownika; plan prosił o „wynik dopisany do `literal-scan.md`” — jest wpis, ale bez zleconej zmiany ani wyniku lintu. Nie da się go odtworzyć.
- **Fix**: Opcjonalnie dopisać, jaką zmianę zlecono i że `npm run lint` przeszedł; inaczej przyjąć jak jest.
- **Decision**: ACCEPTED — wystarcza potwierdzenie użytkownika
