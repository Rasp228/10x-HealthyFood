/**
 * @jest-environment node
 */
// Dowód hooków agenta z `scripts/hooks/` (wpisy w `scripts/hooks/settings.hooks.json`): każdy
// przypadek podaje prawdziwemu skryptowi zdarzenie PostToolUse na stdin i sprawdza kod wyjścia
// oraz kanał. Claude Code pokazuje agentowi wyłącznie stderr przy exit 2; exit 1 widzi tylko
// użytkownik („hook error”), exit 0 nikt. Wszystko dzieje się w tymczasowym repo git - ESLint,
// Prettier i Jest są tam stubami, które reagują na znacznik w treści pliku; git i skrypty są
// prawdziwe.
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const HOOKS_DIR = path.resolve(__dirname, "../../scripts/hooks");
const HOOK_SCRIPTS = ["hook-input.mjs", "lint-edited-file.mjs", "related-tests.mjs"];

// Stuby narzędzi: zgłaszają błąd, gdy sprawdzany plik zawiera znacznik, i drukują go na stdout,
// jak prawdziwe narzędzia - to skrypt hooka ma go przenieść na stderr.
const markerStub = (marker: string, report: string) => `
const fs = require("fs");
const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
let failed = false;
for (const f of files) {
  if (fs.existsSync(f) && fs.readFileSync(f, "utf8").includes("${marker}")) {
    console.log(${report});
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
`;
const STUBS: Record<string, string> = {
  "node_modules/eslint/bin/eslint.js": markerStub(
    "LINT_ERROR",
    "`${f}\\n  1:7  error  marker LINT_ERROR  no-unused-vars`"
  ),
  "node_modules/prettier/bin/prettier.cjs": markerStub(
    "FORMAT_ERROR",
    "`[warn] ${f}\\n[warn] Code style issues found`"
  ),
  "node_modules/jest/bin/jest.js": markerStub(
    "TEST_FAIL",
    "`FAIL ${f}\\n  ● marker TEST_FAIL\\nTests: 1 failed, 1 total`"
  ),
};

let tmp: string;
let repo: string;
let worktree: string;
let other: string;

function git(cwd: string, ...args: string[]) {
  const result = spawnSync(
    "git",
    ["-c", "user.name=hook-test", "-c", "user.email=hook@test", "-c", "commit.gpgsign=false", ...args],
    {
      cwd,
      encoding: "utf8",
    }
  );
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
}

function write(root: string, rel: string, content: string) {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}

function makeRepo(root: string) {
  mkdirSync(root, { recursive: true });
  git(root, "init", "-q");
  for (const [rel, content] of Object.entries(STUBS)) write(root, rel, content);
  for (const script of HOOK_SCRIPTS) {
    mkdirSync(path.join(root, "scripts/hooks"), { recursive: true });
    copyFileSync(path.join(HOOKS_DIR, script), path.join(root, "scripts/hooks", script));
  }
  write(root, "src/clean.ts", "export const ok = 1;\n");
  write(root, "README.md", "# repo\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "init");
}

type Payload = string | Record<string, unknown>;

function runHook(
  script: string,
  payload: Payload,
  { cwd = repo, env = {}, root = repo }: { cwd?: string; env?: Record<string, string>; root?: string } = {}
): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [path.join(root, "scripts/hooks", script)], {
    cwd,
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: repo, ...env },
  });
}

const editPayload = (file: string, cwd = repo) => ({
  session_id: "test-session",
  hook_event_name: "PostToolUse",
  tool_name: "Edit",
  cwd,
  tool_input: { file_path: file },
});

// Git Bash, którym Claude Code uruchamia hooki na Windows (`bash` z PATH bywa tam WSL-em).
function findBash(): string {
  if (process.platform !== "win32") return "bash";
  if (process.env.CLAUDE_CODE_GIT_BASH_PATH) return process.env.CLAUDE_CODE_GIT_BASH_PATH;
  const execPath = spawnSync("git", ["--exec-path"], { encoding: "utf8" }).stdout.trim();
  const candidate = path.resolve(execPath, "../../../bin/bash.exe");
  if (!existsSync(candidate)) throw new Error(`Nie znaleziono Git Bash (szukano ${candidate})`);
  return candidate;
}

beforeAll(() => {
  // realpath: na Windows os.tmpdir() bywa krótką nazwą 8.3, a git zwraca pełną.
  tmp = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), "agent-hooks-")));
  repo = path.join(tmp, "repo");
  worktree = path.join(tmp, "wt");
  other = path.join(tmp, "other");
  makeRepo(repo);
  git(repo, "worktree", "add", "-q", "-b", "wt", worktree);
  makeRepo(other);
  write(other, "src/broken.ts", "const LINT_ERROR = 1; // TEST_FAIL\n");
}, 60_000);

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("lint-edited-file.mjs (PostToolUse, ESLint/Prettier na edytowanym pliku)", () => {
  it("zepsuty .ts → exit 2, stderr nazywa plik i błąd", () => {
    const file = write(repo, "src/broken.ts", "const LINT_ERROR = 1;\n");
    const result = runHook("lint-edited-file.mjs", editPayload(file));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("ESLint zgłasza błędy w src");
    expect(result.stderr).toContain("broken.ts");
    expect(result.stderr).toContain("marker LINT_ERROR");
    expect(result.stdout).toBe("");
  });

  it("zepsuty .astro też idzie do ESLinta → exit 2", () => {
    const file = write(repo, "src/pages/broken.astro", "---\nconst LINT_ERROR = 1;\n---\n");
    expect(runHook("lint-edited-file.mjs", editPayload(file)).status).toBe(2);
  });

  it("czysty .ts → exit 0 bez wyjścia", () => {
    const result = runHook("lint-edited-file.mjs", editPayload(path.join(repo, "src/clean.ts")));
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("źle sformatowany .md → Prettier, exit 2; czysty .md → exit 0", () => {
    const broken = write(repo, "docs/broken.md", "FORMAT_ERROR\n");
    const failed = runHook("lint-edited-file.mjs", editPayload(broken));
    expect(failed.status).toBe(2);
    expect(failed.stderr).toContain("Prettier zgłasza błędy");
    expect(runHook("lint-edited-file.mjs", editPayload(path.join(repo, "README.md"))).status).toBe(0);
  });

  it("typ spoza lintu (.txt ze znacznikiem) → exit 0", () => {
    const file = write(repo, "notes.txt", "LINT_ERROR FORMAT_ERROR\n");
    expect(runHook("lint-edited-file.mjs", editPayload(file)).status).toBe(0);
  });

  it("nieistniejący plik → exit 0", () => {
    expect(runHook("lint-edited-file.mjs", editPayload(path.join(repo, "src/missing.ts"))).status).toBe(0);
  });

  it.each<[string, Payload]>([
    ["{}", {}],
    ["nie-JSON", "not json"],
    ["pusty stdin", ""],
    ["Bash bez ścieżki", { tool_name: "Bash", cwd: "", tool_input: { command: "ls" } }],
  ])("zdarzenie bez ścieżki (%s) → exit 0", (_label, payload) => {
    expect(runHook("lint-edited-file.mjs", payload).status).toBe(0);
  });

  it("ścieżka względna rozwiązuje się względem cwd ze zdarzenia", () => {
    write(repo, "src/rel-broken.ts", "const LINT_ERROR = 1;\n");
    const result = runHook("lint-edited-file.mjs", editPayload("src/rel-broken.ts"), { cwd: tmp });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("rel-broken.ts");
  });

  it("CLAUDE_PROJECT_DIR wskazuje inny checkout z błędem → sprawdzany jest checkout pliku", () => {
    const result = runHook("lint-edited-file.mjs", editPayload(path.join(repo, "src/clean.ts")), {
      env: { CLAUDE_PROJECT_DIR: other },
    });
    expect(result.status).toBe(0);
  });

  it("zepsuty plik innego repozytorium → pominięty, exit 0", () => {
    expect(runHook("lint-edited-file.mjs", editPayload(path.join(other, "src/broken.ts"))).status).toBe(0);
  });

  it("edycja w sąsiednim worktree (cwd = główny checkout) → sprawdzona, exit 2", () => {
    const file = write(worktree, "src/wt-broken.ts", "const LINT_ERROR = 1;\n");
    const result = runHook("lint-edited-file.mjs", editPayload(file), { env: { CLAUDE_PROJECT_DIR: repo } });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("wt-broken.ts");
  });

  it("brak ESLinta → exit 1 z komunikatem (widoczny błąd hooka, nie cichy sukces)", () => {
    const eslint = path.join(repo, "node_modules/eslint/bin/eslint.js");
    const saved = readFileSync(eslint, "utf8");
    rmSync(eslint);
    try {
      const result = runHook("lint-edited-file.mjs", editPayload(path.join(repo, "src/clean.ts")));
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("nie uruchomił lintera");
    } finally {
      writeFileSync(eslint, saved);
    }
  });
});

describe("related-tests.mjs (PostToolUse, Jest --findRelatedTests)", () => {
  it("czerwony test powiązany z .ts w src/ → exit 2, stderr nazywa plik", () => {
    const file = write(repo, "src/red.ts", "export const x = 1; // TEST_FAIL\n");
    const result = runHook("related-tests.mjs", editPayload(file));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("red.ts są czerwone");
    expect(result.stderr).toContain("marker TEST_FAIL");
  });

  it("zielony → exit 0; .md i specy e2e → exit 0 bez Jesta", () => {
    expect(runHook("related-tests.mjs", editPayload(path.join(repo, "src/clean.ts"))).status).toBe(0);
    const md = write(repo, "src/notes.md", "TEST_FAIL\n");
    expect(runHook("related-tests.mjs", editPayload(md)).status).toBe(0);
    const spec = write(repo, "tests/e2e/x.spec.ts", "// TEST_FAIL\n");
    expect(runHook("related-tests.mjs", editPayload(spec)).status).toBe(0);
  });

  it.each<[string, Payload]>([
    ["{}", {}],
    ["nie-JSON", "not json"],
  ])("zdarzenie bez ścieżki (%s) → exit 0", (_label, payload) => {
    expect(runHook("related-tests.mjs", payload).status).toBe(0);
  });

  it("edycja w sąsiednim worktree, CLAUDE_PROJECT_DIR na główny checkout → testy worktree, exit 2", () => {
    const file = write(worktree, "src/wt-red.ts", "export const y = 1; // TEST_FAIL\n");
    const result = runHook("related-tests.mjs", editPayload(file), { env: { CLAUDE_PROJECT_DIR: repo } });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("wt-red.ts");
  });

  it("czerwony plik innego repozytorium → pominięty, exit 0", () => {
    expect(runHook("related-tests.mjs", editPayload(path.join(other, "src/broken.ts"))).status).toBe(0);
  });
});

describe("settings.hooks.json - komendy wpisów", () => {
  const settings = JSON.parse(readFileSync(path.join(HOOKS_DIR, "settings.hooks.json"), "utf8")) as {
    hooks: { PostToolUse: { matcher: string; hooks: { command: string; timeout: number; shell?: string }[] }[] };
  };
  const entries = settings.hooks.PostToolUse.flatMap((group) =>
    group.hooks.map((hook) => ({ ...hook, matcher: group.matcher }))
  );

  it("matcher łapie Write i Edit; timeouty w sekundach", () => {
    for (const entry of entries) {
      expect(new RegExp(`^(${entry.matcher})$`).test("Write")).toBe(true);
      expect(new RegExp(`^(${entry.matcher})$`).test("Edit")).toBe(true);
      expect(entry.timeout).toBeLessThanOrEqual(120);
    }
  });

  it.each(entries.map((entry) => [entry.command.match(/scripts\/hooks\/[\w-]+\.mjs/)?.[0] ?? entry.command, entry]))(
    "%s: uruchomiona z worktree przy nieistniejącym CLAUDE_PROJECT_DIR dociera do skryptu",
    (_label, entry) => {
      const file = write(worktree, "src/cmd-broken.ts", "const LINT_ERROR = 1; // TEST_FAIL\n");
      const result = spawnSync(findBash(), ["-c", entry.command], {
        cwd: worktree,
        input: JSON.stringify(editPayload(file, worktree)),
        encoding: "utf8",
        env: { ...process.env, CLAUDE_PROJECT_DIR: path.join(tmp, "does-not-exist") },
      });
      expect(result.stderr).not.toMatch(/Cannot find module|No such file/);
      expect(result.status).toBe(2);
    }
  );
});
