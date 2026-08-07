import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import { globalStateDir } from "./globalConfig";

/**
 * Installs the bundled, dependency-free monetzly-cli.cjs as a real `monetzly`
 * binary and puts it on PATH for every terminal VSCode opens from now on —
 * so agents/humans can run `monetzly signal ...` without knowing this
 * extension's install path, without npm, without npx.
 */
export function installCli(context: vscode.ExtensionContext): void {
  const bundled = path.join(context.extensionUri.fsPath, "dist", "monetzly-cli.cjs");
  if (!fs.existsSync(bundled)) return; // built without the CLI asset (dev host edge case)

  const binDir = path.join(globalStateDir(), "bin");
  fs.mkdirSync(binDir, { recursive: true });

  const source = fs.readFileSync(bundled, "utf8");
  const isWindows = process.platform === "win32";
  const shimPath = path.join(binDir, isWindows ? "monetzly.cjs" : "monetzly");

  // Only rewrite when content actually changed, so we don't touch mtimes
  // (and thus shell hash caches) on every single activation.
  const existing = fs.existsSync(shimPath) ? fs.readFileSync(shimPath, "utf8") : null;
  if (existing !== source) {
    fs.writeFileSync(shimPath, source, { mode: 0o755 });
    if (!isWindows) fs.chmodSync(shimPath, 0o755);
  }

  if (isWindows) {
    const cmdPath = path.join(binDir, "monetzly.cmd");
    const cmdContent = `@echo off\r\nnode "%~dp0monetzly.cjs" %*\r\n`;
    if (!fs.existsSync(cmdPath) || fs.readFileSync(cmdPath, "utf8") !== cmdContent) {
      fs.writeFileSync(cmdPath, cmdContent);
    }
  }

  // Covers VSCode's own integrated terminals immediately, including ones
  // already open (unlike the rc-file edit below, which only new shells pick
  // up) — but does NOT reach a system Terminal.app/iTerm window, since that
  // mechanism only injects into terminals VSCode itself spawns.
  context.environmentVariableCollection.prepend("PATH", `${binDir}${path.delimiter}`);

  if (!isWindows) addToShellRcFiles(binDir);
}

const MARKER_START = "# >>> monetzly >>>";
const MARKER_END = "# <<< monetzly <<<";

/**
 * For `monetzly` to work in a plain system terminal (not just VSCode's own),
 * PATH has to come from the user's actual shell startup file — the same
 * approach nvm/homebrew/pyenv installers use. Idempotent: skips files that
 * already have the marker block, and only touches files that exist so we
 * don't invent a shell config the user never asked for.
 */
function addToShellRcFiles(binDir: string): void {
  const home = process.env.HOME;
  if (!home) return;
  const block = `\n${MARKER_START}\nexport PATH="${binDir}:$PATH"\n${MARKER_END}\n`;
  const candidates = [".zshrc", ".bash_profile", ".bashrc", ".profile"];
  for (const name of candidates) {
    const rcPath = path.join(home, name);
    if (!fs.existsSync(rcPath)) continue;
    const content = fs.readFileSync(rcPath, "utf8");
    if (content.includes(MARKER_START)) continue;
    fs.appendFileSync(rcPath, block);
  }
}
