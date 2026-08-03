// Shared config reader for fetch-ad.mjs and check-config.mjs. Precedence:
// env vars (MONETZLY_API_KEY / MONETZLY_BASE_URL) win if set, otherwise
// fall back to ~/.monetzly-claude-code-plugin/config.json written by set-api-key.mjs.
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_PATH = join(homedir(), ".monetzly-claude-code-plugin", "config.json");
const DEFAULT_BASE_URL = "https://api.monetzly.com/v2";

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
