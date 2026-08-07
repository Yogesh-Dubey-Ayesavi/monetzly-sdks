// Installs the vendored, dependency-free monetzly-cli.cjs (see vendor/ —
// a straight copy of monetzly-cli/dist/monetzly-cli.cjs, rebuilt and
// re-copied whenever that package changes) as a real `monetzly` binary,
// exactly the same way the VSCode extension does on activation (see
// vscode-extension/src/cliInstaller.ts) — same global bin dir, same
// idempotent shell-rc PATH block, so the two installers never fight and a
// user who has both only sees one binary either way.
//
// Called from check-config.mjs's SessionStart hook, every session — cheap
// (a content-equality check, no-op after the first run) and means the CLI
// self-heals if it's ever deleted without the extension around.
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const MARKER_START = "# >>> monetzly >>>";
const MARKER_END = "# <<< monetzly <<<";

function globalStateDir() {
  const home = homedir();
  switch (process.platform) {
    case "darwin":
      return join(home, "Library", "Application Support", "monetzly");
    case "win32":
      return join(process.env.APPDATA || home, "monetzly");
    default:
      return join(process.env.XDG_CONFIG_HOME || join(home, ".config"), "monetzly");
  }
}

function addToShellRcFiles(binDir) {
  const home = process.env.HOME;
  if (!home) return;
  const block = `\n${MARKER_START}\nexport PATH="${binDir}:$PATH"\n${MARKER_END}\n`;
  for (const name of [".zshrc", ".bash_profile", ".bashrc", ".profile"]) {
    const rcPath = join(home, name);
    if (!existsSync(rcPath)) continue;
    const content = readFileSync(rcPath, "utf8");
    if (content.includes(MARKER_START)) continue;
    appendFileSync(rcPath, block);
  }
}

export function installCli() {
  const bundled = join(SCRIPT_DIR, "..", "vendor", "monetzly-cli.cjs");
  if (!existsSync(bundled)) return null;

  const binDir = join(globalStateDir(), "bin");
  mkdirSync(binDir, { recursive: true });

  const isWindows = process.platform === "win32";
  const shimPath = join(binDir, isWindows ? "monetzly.cjs" : "monetzly");
  const source = readFileSync(bundled, "utf8");
  const existing = existsSync(shimPath) ? readFileSync(shimPath, "utf8") : null;
  if (existing !== source) {
    writeFileSync(shimPath, source, { mode: 0o755 });
    if (!isWindows) chmodSync(shimPath, 0o755);
  }

  if (isWindows) {
    const cmdPath = join(binDir, "monetzly.cmd");
    const cmdContent = `@echo off\r\nnode "%~dp0monetzly.cjs" %*\r\n`;
    if (!existsSync(cmdPath) || readFileSync(cmdPath, "utf8") !== cmdContent) {
      writeFileSync(cmdPath, cmdContent);
    }
  } else {
    addToShellRcFiles(binDir);
  }

  return isWindows ? join(binDir, "monetzly.cmd") : shimPath;
}
