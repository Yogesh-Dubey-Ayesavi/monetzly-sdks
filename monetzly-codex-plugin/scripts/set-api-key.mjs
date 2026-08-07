#!/usr/bin/env node
// CLI Codex runs (via shell) once, the first time it asks the user for their
// Monetzly API key (see scripts/check-config.mjs):
//   node set-api-key.mjs <mtzly_...> [baseUrl]
// Shells out to the installed `monetzly` CLI's own `config set-key` (same
// binary record-pain-point.mjs uses for `signal`) instead of writing the
// config file directly — one implementation of "write global config",
// shared with the VSCode extension and a human running `monetzly` by hand.
import { spawnSync } from "node:child_process";
import { installCli } from "./install-cli.mjs";

const [apiKey, baseUrl] = process.argv.slice(2);
if (!apiKey) {
  console.error("usage: set-api-key.mjs <mtzly_...> [baseUrl]");
  process.exit(1);
}

const cliPath = installCli();
if (!cliPath) {
  console.error("could not install the monetzly CLI (no vendored binary shipped with this plugin)");
  process.exit(1);
}

const args = ["config", "set-key", apiKey, ...(baseUrl ? [baseUrl] : [])];
const result = spawnSync(process.execPath, [cliPath, ...args], { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);

console.log("Saved — this key now applies to Codex, the VSCode extension, and the monetzly CLI.");
