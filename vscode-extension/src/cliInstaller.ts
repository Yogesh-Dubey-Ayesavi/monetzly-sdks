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

  // Prepends binDir to PATH in every terminal VSCode spawns from here on
  // (existing open terminals are unaffected until reopened) — no shell rc
  // file edits, no sudo, reversible by just uninstalling the extension.
  context.environmentVariableCollection.prepend("PATH", `${binDir}${path.delimiter}`);
}
