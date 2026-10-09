// Hook PostToolUse: po edycji pliku z `src/` lub `tests/` uruchamia tylko testy Jest powiązane
// z tym plikiem (`--findRelatedTests`). Zielono → exit 0. Czerwono → końcówka wyjścia Jesta na
// stderr i exit 2, który Claude Code oddaje agentowi jako informację zwrotną.
// Skrypt niczego nie zapisuje - tylko czyta zdarzenie i uruchamia Jesta.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { PLAIN_ENV, isInside, readEvent, resolveEditedFile } from "./hook-input.mjs";

const MAX_TAIL_LINES = 60;
const TESTED_EXTENSIONS = new Set([".ts", ".tsx"]);

// Plik, dla którego Jest ma sens: `.ts`/`.tsx` w `src/` albo `tests/` checkoutu, w którym leży
// (nie `CLAUDE_PROJECT_DIR` - patrz `hook-input.mjs`), ale nie spec Playwrighta.
function resolveTarget(event) {
  const edited = resolveEditedFile(event);
  if (!edited) return null;

  const { file, root } = edited;
  const inScope = isInside(file, path.join(root, "src")) || isInside(file, path.join(root, "tests"));
  if (!inScope || isInside(file, path.join(root, "tests", "e2e"))) return null;
  if (!TESTED_EXTENSIONS.has(path.extname(file).toLowerCase())) return null;

  return edited;
}

// Z pełnego wyjścia zostawiamy nazwy czerwonych plików i testów (`FAIL`, `●`) oraz podsumowanie
// z końca - diff asercji bywa długi i zasłoniłby to, co agent ma przeczytać najpierw.
function failureTail(output) {
  // eslint-disable-next-line no-control-regex
  const lines = output.replace(/\u001b\[[0-9;]*m/g, "").split(/\r?\n/);
  const headlines = [...new Set(lines.filter((line) => /^\s*(FAIL\s|●\s)/.test(line)))];
  const summary = lines.filter((line) => line.trim() !== "").slice(-20);
  const kept = headlines.slice(0, MAX_TAIL_LINES - summary.length - 1);
  return (kept.length > 0 ? [...kept, "...", ...summary] : summary).join("\n");
}

// Awaria samego uruchomienia (brak Jesta, timeout, sygnał) to nie regresja: exit 1 nie blokuje
// agenta, a exit 2 z „czerwonymi testami” podawałby fałszywy alarm przy każdej edycji.
function launchFailure(reason) {
  process.stderr.write(`Hook related-tests nie uruchomił Jesta: ${reason}\n`);
  process.exit(1);
}

const target = resolveTarget(readEvent());
if (!target) process.exit(0);

const { file, root } = target;
const jestBin = path.join(root, "node_modules", "jest", "bin", "jest.js");
if (!existsSync(jestBin)) launchFailure(`brak ${path.relative(root, jestBin)} (npm install?)`);

// `npx` to w Windows `npx.cmd`, którego spawnSync bez powłoki nie uruchomi - wołamy więc
// bieżący node z binarką Jesta. Własny timeout poniżej 90 s z wpisu hooka: skrypt sam kończy
// Jesta, zanim Claude Code zabije hook i zostawi proces potomny bez rodzica.
const result = spawnSync(process.execPath, [jestBin, "--findRelatedTests", file, "--passWithNoTests", "--silent"], {
  cwd: root,
  encoding: "utf8",
  env: PLAIN_ENV,
  maxBuffer: 64 * 1024 * 1024,
  timeout: 80_000,
});

if (result.status === 0) process.exit(0);
if (result.error) launchFailure(result.error.message);
if (result.status === null) launchFailure(`Jest przerwany sygnałem ${result.signal}`);

const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
process.stderr.write(`Testy powiązane z ${path.relative(root, file)} są czerwone:\n${failureTail(output)}\n`);
process.exit(2);
