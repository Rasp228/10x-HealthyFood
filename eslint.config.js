import { includeIgnoreFile } from "@eslint/compat";
import eslint from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import eslintPluginAstro from "eslint-plugin-astro";
import jsxA11y from "eslint-plugin-jsx-a11y";
import pluginReact from "eslint-plugin-react";
import eslintPluginReactHooks from "eslint-plugin-react-hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";

// File path setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gitignorePath = path.resolve(__dirname, ".gitignore");

const baseConfig = tseslint.config({
  extends: [eslint.configs.recommended, tseslint.configs.strict, tseslint.configs.stylistic],
  rules: {
    "no-unused-vars": "off",
  },
});

// Konfiguracja dla plików CommonJS (jak lighthouserc.js, jest.config.js)
const commonjsConfig = tseslint.config({
  files: ["*.config.js", "lighthouserc.js"],
  languageOptions: {
    sourceType: "commonjs",
    globals: {
      module: "readonly",
      require: "readonly",
      exports: "readonly",
      process: "readonly",
      console: "readonly",
    },
  },
});

// Skrypty narzędziowe (np. hook `scripts/hooks/related-tests.mjs`) to moduły ES uruchamiane przez
// Node - potrzebują jego globali, których `commonjsConfig` udziela tylko plikom `*.config.js`.
const nodeScriptsConfig = tseslint.config({
  files: ["scripts/**/*.mjs"],
  languageOptions: {
    sourceType: "module",
    globals: {
      process: "readonly",
      console: "readonly",
    },
  },
});

const jsxA11yConfig = tseslint.config({
  files: ["**/*.{js,jsx,ts,tsx}"],
  extends: [jsxA11y.flatConfigs.recommended],
  languageOptions: {
    ...jsxA11y.flatConfigs.recommended.languageOptions,
  },
  rules: {
    ...jsxA11y.flatConfigs.recommended.rules,
  },
});

const reactConfig = tseslint.config({
  files: ["**/*.{js,jsx,ts,tsx}"],
  extends: [pluginReact.configs.flat.recommended, eslintPluginReactHooks.configs.flat.recommended],
  languageOptions: {
    ...pluginReact.configs.flat.recommended.languageOptions,
    globals: {
      window: true,
      document: true,
    },
  },
  settings: { react: { version: "detect" } },
  rules: {
    "react/react-in-jsx-scope": "off",
    // Reguly z eslint-plugin-react-hooks 7. Dlug naprawiony 2026-09-18 (9 znalezisk w 8 plikach),
    // wiec trzymamy je na "error" - inaczej wroci przy pierwszym nowym komponencie.
    "react-hooks/set-state-in-effect": "error",
    "react-hooks/immutability": "error",
  },
});

// Skan literałów z /10x-ui dla widoku `/diary` (zmiana `ui-contract-guard`): w tych plikach kolory
// i odstępy biorą się z tokenów `src/styles/global.css` (`bg-primary`, `text-destructive`,
// `bg-success/10`), nie z hex/oklch, palety Tailwinda ani wartości `-[13px]`. Ten sam wzorzec co grep
// w skillu. Kolejny widok przeniesiony na tokeny dopisz do `files`. Prymitywy pól (`input`, `textarea`)
// są tu od zmiany `ui-focus-ring`, żeby nie wrócił `ring-[3px]`; `button.tsx` i `badge.tsx` czekają
// na token dla `text-white` w wariancie `destructive` (docs/reference/known-drift.md, „Prymitywy UI”).
const UI_LITERAL =
  "/#[0-9a-fA-F]{3}[0-9a-fA-F]*\\b|rgba?\\(|hsla?\\(|oklch\\(|-\\[[0-9.]+(px|rem|em|%|vh|vw|ch)\\]|\\b(bg|text|border|ring|outline|from|via|to|fill|stroke|shadow|divide)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\\b/";
const UI_LITERAL_MESSAGE =
  "Literał koloru/odstępu w widoku na kontrakcie design-systemu. Użyj tokenu z src/styles/global.css " +
  "(np. bg-primary, text-destructive, bg-success/10) albo prymitywu z src/components/ui - AGENTS.md, „Styling & UI”.";

const uiTokensConfig = tseslint.config({
  files: [
    "src/pages/diary.astro",
    "src/pages/dev/diary-states.astro",
    "src/components/diary/**/*.{ts,tsx}",
    "src/components/feedback/Toast.tsx",
    "src/components/common/ConfirmDialog.tsx",
    "src/components/layout/TopNav.astro",
    "src/components/ui/input.tsx",
    "src/components/ui/textarea.tsx",
  ],
  rules: {
    "no-restricted-syntax": [
      "error",
      { selector: `Literal[value=${UI_LITERAL}]`, message: UI_LITERAL_MESSAGE },
      { selector: `TemplateElement[value.raw=${UI_LITERAL}]`, message: UI_LITERAL_MESSAGE },
    ],
  },
});

export default tseslint.config(
  includeIgnoreFile(gitignorePath),
  {
    // Generowany przez `npm run supabase:gen` - styl narzuca CLI, a kazda poprawka
    // znika przy kolejnej regeneracji. Ten sam powod co wpis w .prettierignore.
    ignores: ["src/db/database.types.ts"],
  },
  baseConfig,
  commonjsConfig,
  nodeScriptsConfig,
  jsxA11yConfig,
  reactConfig,
  eslintPluginAstro.configs["flat/recommended"],
  uiTokensConfig,
  eslintPluginPrettier
);
