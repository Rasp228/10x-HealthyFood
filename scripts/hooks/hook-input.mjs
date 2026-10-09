// Wspólne dla hooków PostToolUse: odczyt zdarzenia ze stdin i ustalenie, w którym checkoucie
// leży edytowany plik. Checkout bierzemy z samego pliku, nie z `CLAUDE_PROJECT_DIR`: ta zmienna
// wskazuje katalog startu sesji i po `EnterWorktree` (albo przy edycji w sąsiednim worktree)
// opisuje inny checkout - plik wypadałby wtedy „poza projekt”, a hook kończył się na zielono.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const PLAIN_ENV = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };

export function readEvent() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

// Na Windows wielkość liter litery dysku bywa różna (`d:\` vs `D:\`), a separatory mieszane -
// porównujemy więc postać znormalizowaną, a narzędziom podajemy ścieżkę oryginalną.
export function comparable(p) {
  const normalized = path.resolve(p).replaceAll("\\", "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

export function isInside(file, dir) {
  return comparable(file).startsWith(`${comparable(dir)}/`);
}

function git(dir, args) {
  const result = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8", env: PLAIN_ENV });
  return result.status === 0 ? result.stdout.trim() : null;
}

/**
 * Edytowany plik ze zdarzenia: `{ file, root }` albo `null`, gdy nie ma czego sprawdzać
 * (brak ścieżki, plik nie istnieje, leży poza repozytorium sesji - `~/.claude`, inny projekt).
 * Ścieżkę względną rozwiązujemy względem `cwd` ze zdarzenia. Każdy worktree tego samego
 * repozytorium (ten sam `--git-common-dir`) się liczy.
 */
export function resolveEditedFile(event) {
  const rawPath = event?.tool_input?.file_path ?? event?.tool_input?.notebook_path;
  if (typeof rawPath !== "string" || rawPath === "") return null;

  const cwd = typeof event.cwd === "string" && event.cwd !== "" ? event.cwd : process.cwd();
  const file = path.resolve(cwd, rawPath);
  if (!existsSync(file)) return null;

  const root = git(path.dirname(file), ["rev-parse", "--show-toplevel"]);
  if (!root) return null;

  const repo = git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const sessionRepo = git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (!repo || !sessionRepo || comparable(repo) !== comparable(sessionRepo)) return null;

  return { file, root: path.resolve(root) };
}
