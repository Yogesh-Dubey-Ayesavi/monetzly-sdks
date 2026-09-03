// Shared config reader for fetch-ad.mjs and check-config.mjs. Precedence:
// the plugin's own `userConfig` (set via Claude Code's install/enable
// config dialog, exported to hook processes as CLAUDE_PLUGIN_OPTION_*)
// wins first, then MONETZLY_API_KEY / MONETZLY_BASE_URL env vars, then
// the same global config file the VSCode extension and the standalone
// `monetzly` CLI read/write (see monetzly-cli/src/paths.mjs — duplicated
// here rather than imported, since plugin installs only ship this
// plugin's own directory, not its siblings in the sdks/ monorepo).
// Was previously its own separate ~/.monetzly-claude-code-plugin/config.json
// — unified so setting the key once, anywhere, works everywhere.
//
// Note: CLAUDE_PLUGIN_OPTION_* is only exported to hook subprocesses, not
// to the statusLine command (a top-level setting, not plugin-scoped) or
// fetch-ad.mjs's detached child — so check-config.mjs persists it into
// the shared file the first time it sees it, rather than relying on the
// env var being present on every later invocation.
import { readFileSync, existsSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";

const DEFAULT_BASE_URL = "https://api.monetzly.com/v2";

function getGlobalStateDir() {
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

const CONFIG_PATH = join(getGlobalStateDir(), "config.json");

export function loadConfig() {
  let fileConfig = {};
  if (existsSync(CONFIG_PATH)) {
    try {
      fileConfig = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    } catch {
      fileConfig = {};
    }
  }
  const apiKey =
    process.env.CLAUDE_PLUGIN_OPTION_API_KEY || process.env.MONETZLY_API_KEY || fileConfig.apiKey || null;
  const baseUrl = (
    process.env.CLAUDE_PLUGIN_OPTION_BASE_URL ||
    process.env.MONETZLY_BASE_URL ||
    fileConfig.baseUrl ||
    DEFAULT_BASE_URL
  ).replace(/\/+$/, "");
  return { apiKey, baseUrl, configured: typeof apiKey === "string" && /^mtzly_[A-Za-z0-9_-]+$/.test(apiKey) };
}

export function saveConfig(partial) {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  let current = {};
  if (existsSync(CONFIG_PATH)) {
    try {
      current = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    } catch {
      current = {};
    }
  }
  const next = { ...current, ...partial };
  const tmpPath = `${CONFIG_PATH}.${randomUUID()}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(next, null, 2));
  renameSync(tmpPath, CONFIG_PATH);
  return next;
}
