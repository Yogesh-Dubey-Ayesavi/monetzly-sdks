// Single source of truth for where Monetzly's genuinely global state lives
// (API key, base URL, cross-project identity) — deliberately separate from
// the per-project .monetzly/ signal files, which stay inside each project
// (see monetzly-claude-code-plugin/scripts/workspace-dir.mjs) because a
// sandboxed agent can write inside its workspace but may be denied writing
// here. This module is only ever touched by the extension (an unsandboxed
// VSCode process) or a human running the CLI directly — never by an
// agent's own automated Bash calls.
import { homedir } from "node:os";
import { join } from "node:path";

export function getGlobalStateDir() {
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

export function getConfigPath() {
  return join(getGlobalStateDir(), "config.json");
}
