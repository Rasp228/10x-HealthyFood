# Utrwalenie kontraktu design-systemu dla widoku dziennika (/diary) — plan implementacji

> Plan powykonawczy: spisany 2026-10-01 po wykonaniu fazy 1, żeby `/10x-impl-review` miał względem
> czego porównać diff. Zakres i decyzje ustalone w rozmowie z użytkownikiem (treść reguły
> zatwierdzona przez użytkownika).

## Overview

Zmiana `ui-enhancement` (`context/archive/2026-09-30-ui-enhancement/`) przeniosła `/diary` na
tokeny i prymitywy shadcn, ale nie zostawiła strażnika: `AGENTS.md` nie mówi agentowi, czego nie
wpisywać w widokach, a nic w lincie nie łapie literałów. Ta zmiana domyka krok „Make it stick”
z `/10x-ui`: reguła w pliku instrukcji, sprawdzenie w istniejącym ESLint, zapis skanu przed/po.

## Current State Analysis

- Skan literałów `/10x-ui` na plikach widoku: 15 trafień w `4ea756e`, 0 w `2f9c944`
  (`literal-scan.md`).
- `AGENTS.md` „Styling & UI” wskazuje źródło tokenów i ścieżkę `shadcn add`, ale nie zakazuje
  literałów, nie wymienia ról `success` / `warning` / `info` ani prymitywów dodanych
  w `ui-enhancement`, nie wskazuje kitchen sinka.
- `docs/reference/known-drift.md` twierdzi, że w `src/components/ui/` prymitywem jest tylko
  `button.tsx` — nieaktualne od `ui-enhancement`.
- Repo ma ESLint 9 (flat config, `eslint.config.js`) i hook pre-commit `npx lint-staged` →
  `eslint --fix` dla `*.{ts,tsx,astro}`. CI uruchamia `npm run lint` w `code-quality`.

## Desired End State

- Agent w nowej sesji dostaje z `AGENTS.md` regułę: gdzie tokeny, gdzie komponenty, zakaz
  literałów w widokach, gdzie kitchen sink.
- Literał koloru/odstępu w pliku widoku `/diary` kończy się błędem `npm run lint` (CI) i hooka
  pre-commit.
- Liczba trafień skanu przed/po leży w folderze zmiany.

## What We're NOT Doing

- Żadnej zmiany wizualnej, tokenu ani komponentu.
- Reguły ESLint dla widoków spoza `/diary` (`auth/`, `ai/`, `recipe/` mają jeszcze literały —
  dołączą do `files`, gdy przejdą na tokeny).
- Nowej zależności lintującej (np. `eslint-plugin-tailwindcss`): wystarcza `no-restricted-syntax`.
- Zmian w bloku `@przeprogramowani/10x-cli` w `CLAUDE.md`.

## Faza 1: Reguła, sprawdzenie i zapis skanu

### Changes Required:

#### 1. `eslint.config.js`

`uiTokensConfig`: `no-restricted-syntax` na `Literal` i `TemplateElement` z wzorcem skanu `/10x-ui`,
`files` ograniczone do `src/pages/diary.astro`, `src/pages/dev/diary-states.astro`,
`src/components/diary/**/*.{ts,tsx}`, `Toast.tsx`, `ConfirmDialog.tsx`, `TopNav.astro`. Komunikat
wskazuje tokeny, prymitywy i sekcję `AGENTS.md`. Wpięte przed `eslintPluginPrettier`.

#### 2. `AGENTS.md`

Podsekcja `### Design-system contract` na końcu „Styling & UI”: Tokens, Components, No literals in
views, States — treść zatwierdzona przez użytkownika.

#### 3. `docs/reference/known-drift.md`

Lista prymitywów w „Components” zgodna ze stanem `src/components/ui/`.

#### 4. `literal-scan.md`

Wzorzec, wynik przed/po z rozbiciem na pliki i zarzuty, sposób odtworzenia, weryfikacja reguły.

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi (0 błędów na obecnym drzewie)
- Stan `4ea756e` plików widoku puszczony przez ESLint daje 15 błędów `no-restricted-syntax`
- `npx prettier --check` na zmienionych plikach przechodzi

#### Manual Verification:

- Sprawdzian w nowej sesji: drobna zmiana w `/diary` zrobiona na tokenach i prymitywach
  (wynik dopisany do `literal-scan.md`)

## Addendum (impl-review F1)

- `CLAUDE.md`: blok `@przeprogramowani/10x-cli` przepisany w `2b0a25b` to synchronizacja toolkitu
  (10x-cli), nie część tej zmiany — wyjątek od „What We're NOT Doing”, wniesiony tym samym commitem.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reguła, sprawdzenie i zapis skanu

#### Automated

- [x] 1.1 `npm run lint` przechodzi (0 błędów na obecnym drzewie) — 2b0a25b
- [x] 1.2 Stan `4ea756e` plików widoku puszczony przez ESLint daje 15 błędów `no-restricted-syntax` — 2b0a25b
- [x] 1.3 `npx prettier --check` na zmienionych plikach przechodzi — 2b0a25b

#### Manual

- [x] 1.4 Sprawdzian w nowej sesji: drobna zmiana w `/diary` zrobiona na tokenach i prymitywach
