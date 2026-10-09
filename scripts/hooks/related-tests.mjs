// Hook PostToolUse: po edycji pliku z `src/` lub `tests/` uruchamia tylko testy Jest powiązane
// z tym plikiem (`--findRelatedTests`). Zielono → exit 0. Czerwono → końcówka wyjścia Jesta na
// stderr i exit 2, który Claude Code oddaje agentowi jako informację zwrotną.
// Skrypt niczego nie zapisuje - tylko czyta zdarzenie i uruchamia Jesta.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAX_TAIL_LINES = 60;
const TESTED_EXTENSIONS = new Set([".ts", ".tsx"]);

const projectDir = path.resolve(
  process.env.CLAUDE_PROJECT_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
);

// Na Windows wielkość liter litery dysku bywa różna (`d:\` vs `D:\`), a separatory mieszane -
// porównujemy więc postać znormalizowaną, a Jestowi podajemy ścieżkę oryginalną.
function comparable(p) {
  const normalized = path.resolve(p).replaceAll("\\", "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isInside(file, dir) {
  return file.startsWith(`${comparable(dir)}/`);
}

function readEvent() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

// Plik, dla którego Jest ma sens: `.ts`/`.tsx` w `src/` albo `tests/`, ale nie spec Playwrighta.
function resolveTarget(event) {
  const rawPath = event?.tool_input?.file_path;
  if (typeof rawPath !== "string" || rawPath === "") return null;

  const cwd = typeof event.cwd === "string" && event.cwd !== "" ? event.cwd : projectDir;
  const absolute = path.resolve(cwd, rawPath);
  const file = comparable(absolute);

  const inScope = isInside(file, path.join(projectDir, "src")) || isInside(file, path.join(projectDir, "tests"));
  if (!inScope || isInside(file, path.join(projectDir, "tests", "e2e"))) return null;
  if (!TESTED_EXTENSIONS.has(path.extname(absolute).toLowerCase())) return null;
  if (!existsSync(absolute)) return null;

  return absolute;
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

const jestBin = path.join(projectDir, "node_modules", "jest", "bin", "jest.js");
if (!existsSync(jestBin)) launchFailure(`brak ${path.relative(projectDir, jestBin)} (npm install?)`);

// `npx` to w Windows `npx.cmd`, którego spawnSync bez powłoki nie uruchomi - wołamy więc
// bieżący node z binarką Jesta. Własny timeout poniżej 90 s z wpisu hooka: skrypt sam kończy
// Jesta, zanim Claude Code zabije hook i zostawi proces potomny bez rodzica.
const result = spawnSync(process.execPath, [jestBin, "--findRelatedTests", target, "--passWithNoTests", "--silent"], {
  cwd: projectDir,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  timeout: 80_000,
});

if (result.status === 0) process.exit(0);
if (result.error) launchFailure(result.error.message);
if (result.status === null) launchFailure(`Jest przerwany sygnałem ${result.signal}`);

const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
process.stderr.write(`Testy powiązane z ${path.relative(projectDir, target)} są czerwone:\n${failureTail(output)}\n`);
process.exit(2);
