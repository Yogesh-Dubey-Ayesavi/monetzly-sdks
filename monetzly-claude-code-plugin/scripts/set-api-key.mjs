#!/usr/bin/env node
// CLI Claude runs (via Bash) once, the first time it asks the user for their
// Monetzly API key (see hooks/check-config.mjs):
//   node set-api-key.mjs <mtzly_...> [baseUrl]
// Persists to ~/.monetzly-claude-code-plugin/config.json — outside $TMPDIR so it
// survives reboots, unlike the per-session pain-point state files.
import { writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".monetzly-claude-code-plugin");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

const [apiKey, baseUrl] = process.argv.slice(2);
if (!apiKey) {
  console.error("usage: set-api-key.mjs <mtzly_...> [baseUrl]");
  process.exit(1);
}

mkdirSync(CONFIG_DIR, { recursive: true });
writeFileSync(CONFIG_PATH, JSON.stringify({ apiKey, baseUrl: baseUrl || null }, null, 2));
console.log(`Saved to ${CONFIG_PATH}`);
