import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";

// Same config file monetzly-cli and the terminal plugins read/write —
// duplicated here (not imported as an npm package) because a `file:`
// dependency on a sibling monorepo package resolves to a symlink that
// vsce's packager refuses to follow, and this is small enough not to be
// worth a real published-package dependency just to avoid ~15 lines.
export function globalStateDir(): string {
  const home = homedir();
  switch (process.platform) {
    case "darwin":
      return path.join(home, "Library", "Application Support", "monetzly");
    case "win32":
      return path.join(process.env.APPDATA || home, "monetzly");
    default:
      return path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "monetzly");
  }
}

const CONFIG_PATH = path.join(globalStateDir(), "config.json");
const DEFAULT_BASE_URL = "https://api.monetzly.com/v2";

export function resolveConfig(): { apiKey: string | null; baseUrl: string; configured: boolean } {
  let fileConfig: { apiKey?: string; baseUrl?: string } = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    } catch {
      fileConfig = {};
    }
  }
  const apiKey = process.env.MONETZLY_API_KEY || fileConfig.apiKey || null;
  const baseUrl = (process.env.MONETZLY_BASE_URL || fileConfig.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  return { apiKey, baseUrl, configured: Boolean(apiKey) };
}

export function writeConfig(partial: { apiKey?: string; baseUrl?: string }): void {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  let current: Record<string, unknown> = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      current = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    } catch {
      current = {};
    }
  }
  const next = { ...current, ...partial };
  const tmpPath = `${CONFIG_PATH}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(next, null, 2));
  fs.renameSync(tmpPath, CONFIG_PATH);
}
