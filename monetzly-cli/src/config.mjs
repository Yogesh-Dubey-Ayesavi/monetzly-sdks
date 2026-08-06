// Read/write for the global config file (API key, base URL). Writes are
// atomic via write-to-temp-then-rename: a concurrent reader (extension and
// a terminal CLI invocation could genuinely race) always sees either the
// old complete file or the new complete file, never a partial write.
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { getConfigPath } from "./paths.mjs";

const DEFAULT_BASE_URL = "https://api.monetzly.com/v2";

export function readConfig() {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) return { apiKey: null, baseUrl: null };
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    return { apiKey: parsed.apiKey ?? null, baseUrl: parsed.baseUrl ?? null };
  } catch {
    return { apiKey: null, baseUrl: null };
  }
}

export function writeConfig(partial) {
  const configPath = getConfigPath();
  const dir = dirname(configPath);
  mkdirSync(dir, { recursive: true });

  const current = readConfig();
  const next = { ...current, ...partial };

  const tmpPath = `${configPath}.${randomUUID()}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(next, null, 2));
  renameSync(tmpPath, configPath); // atomic on POSIX and NTFS
  return next;
}

// Precedence matches what both the terminal plugin and the VSCode
// extension already expect: an env var override wins over the stored
// file, and there's always a usable default base URL.
export function resolveConfig() {
  const stored = readConfig();
  const apiKey = process.env.MONETZLY_API_KEY || stored.apiKey || null;
  const baseUrl = (process.env.MONETZLY_BASE_URL || stored.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  return { apiKey, baseUrl, configured: Boolean(apiKey) };
}
