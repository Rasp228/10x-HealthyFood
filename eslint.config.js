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

export default tseslint.config(
  includeIgnoreFile(gitignorePath),
  {
    // Generowany przez `npm run supabase:gen` - styl narzuca CLI, a kazda poprawka
    // znika przy kolejnej regeneracji. Ten sam powod co wpis w .prettierignore.
    ignores: ["src/db/database.types.ts"],
  },
  baseConfig,
  commonjsConfig,
  jsxA11yConfig,
  reactConfig,
  eslintPluginAstro.configs["flat/recommended"],
  eslintPluginPrettier
);
