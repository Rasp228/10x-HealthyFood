// Hook PostToolUse: po edycji sprawdza tylko edytowany plik - ESLint (`--quiet`, bez `--fix`)
// dla plików, które obejmuje `eslint.config.js`, `prettier --check` dla reszty formatowanej
// przez bramkę `format:check`. Czysto → exit 0. Błędy → wyjście narzędzia na stderr i exit 2,
// który Claude Code oddaje agentowi. Pliki ignorowane przez ESLint/Prettier przechodzą same.
// Bez `--fix`: przepisanie pliku pod agentem kończy jego następny `Edit` błędem „file modified”.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { PLAIN_ENV, readEvent, resolveEditedFile } from "./hook-input.mjs";

const MAX_OUTPUT_LINES = 60;
// `eslint-plugin-astro` w konfiguracji, więc `.astro` też; `prettier/prettier` jest regułą ESLinta,
// więc dla tych plików formatu pilnuje już ESLint.
const ESLINT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".astro"]);
const PRETTIER_EXTENSIONS = new Set([".json", ".css", ".md", ".yml", ".yaml"]);

// Narzędzie, którego nie da się uruchomić, to nie błąd w pliku: exit 1 widzi użytkownik
// („hook error”), a agent nie dostaje fałszywego alarmu przy każdej edycji.
function launchFailure(reason) {
  process.stderr.write(`Hook lint-edited-file nie uruchomił lintera: ${reason}\n`);
  process.exit(1);
}

const target = resolveEditedFile(readEvent());
if (!target) process.exit(0);

const { file, root } = target;
const extension = path.extname(file).toLowerCase();

let tool;
if (ESLINT_EXTENSIONS.has(extension)) {
  tool = { name: "ESLint", bin: ["eslint", "bin", "eslint.js"], args: ["--quiet", "--no-warn-ignored"] };
} else if (PRETTIER_EXTENSIONS.has(extension)) {
  tool = { name: "Prettier", bin: ["prettier", "bin", "prettier.cjs"], args: ["--check", "--ignore-unknown"] };
} else {
  process.exit(0);
}

const bin = path.join(root, "node_modules", ...tool.bin);
if (!existsSync(bin)) launchFailure(`brak ${path.relative(root, bin)} (npm install?)`);

// Bieżący node z binarką narzędzia - `npx` to w Windows `npx.cmd`, którego spawnSync bez powłoki
// nie uruchomi. Własny timeout poniżej 30 s z wpisu hooka.
const result = spawnSync(process.execPath, [bin, ...tool.args, file], {
  cwd: root,
  encoding: "utf8",
  env: PLAIN_ENV,
  maxBuffer: 16 * 1024 * 1024,
  timeout: 25_000,
});

if (result.status === 0) process.exit(0);
if (result.error) launchFailure(result.error.message);
if (result.status === null) launchFailure(`${tool.name} przerwany sygnałem ${result.signal}`);

const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
  .split(/\r?\n/)
  .filter((line) => line.trim() !== "")
  .slice(0, MAX_OUTPUT_LINES)
  .join("\n");
process.stderr.write(`${tool.name} zgłasza błędy w ${path.relative(root, file)}:\n${output}\n`);
process.exit(2);
