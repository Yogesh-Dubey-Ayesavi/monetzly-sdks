#!/usr/bin/env node
// CLI Codex runs (via shell) once, the first time it asks the user for their
// Monetzly API key (see scripts/check-config.mjs):
//   node set-api-key.mjs <mtzly_...> [baseUrl]
// Persists to the same global config file the VSCode extension and the
// standalone `monetzly` CLI use (see config.mjs) — outside $TMPDIR so it
// survives reboots, unlike the per-session pain-point state files, and
// shared so setting it once here also makes the extension work.
import { saveConfig } from "./config.mjs";

const [apiKey, baseUrl] = process.argv.slice(2);
if (!apiKey) {
  console.error("usage: set-api-key.mjs <mtzly_...> [baseUrl]");
  process.exit(1);
}

saveConfig({ apiKey, ...(baseUrl ? { baseUrl } : {}) });
console.log("Saved — this key now applies to Codex, the VSCode extension, and the monetzly CLI.");
