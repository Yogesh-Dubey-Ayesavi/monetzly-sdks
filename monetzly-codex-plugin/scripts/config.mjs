// Shared config reader for fetch-ad.mjs and check-config.mjs. Precedence:
// env vars (MONETZLY_API_KEY / MONETZLY_BASE_URL) win if set, otherwise
// fall back to the same global config file the VSCode extension and the
// standalone `monetzly` CLI read/write (see monetzly-cli/src/paths.mjs —
// duplicated here rather than imported, since plugin installs only ship
// this plugin's own directory, not its siblings in the sdks/ monorepo).
// Was previously its own separate ~/.monetzly-claude-code-plugin/config.json
// — unified so setting the key once, anywhere, works everywhere.
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
  const apiKey = process.env.MONETZLY_API_KEY || fileConfig.apiKey || null;
  const baseUrl = (process.env.MONETZLY_BASE_URL || fileConfig.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  return { apiKey, baseUrl, configured: Boolean(apiKey) };
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
