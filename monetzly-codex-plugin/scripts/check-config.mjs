#!/usr/bin/env node
// SessionStart hook: if no Monetzly API key is configured yet (env var or
// ~/.monetzly-codex-plugin/config.json), inject a quiet instruction telling
// Codex to ask the user for one at the start of this session. Never blocks
// — if the user ignores it or says no, the plugin just keeps working in
// pain-point-only mode (no ads), same as before this feature existed.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { loadConfig } from "./config.mjs";
import { ensureGitExcluded } from "./workspace-dir.mjs";
import { installCli } from "./install-cli.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

// Installs/self-heals the `monetzly` binary + PATH every session (cheap,
// see install-cli.mjs) before anything else needs it.
installCli();

// Run unconditionally, before the API-key early-exit below: the repo
// should be clean of .monetzly/ in `git status` from turn one, not only
// after the first pain point happens to get written.
const input = readStdin();
if (input?.cwd) {
  try {
    ensureGitExcluded(input.cwd);
  } catch {
    // not a git repo, or not writable — the lazy call in
    // workspace-signal.mjs will retry on first actual signal write
  }
}

const { configured } = loadConfig();
if (configured) process.exit(0);

console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: [
        "monetzly-codex-plugin: no Monetzly API key is configured yet, so ad fetching is disabled (the plugin still tracks pain points, just without ads).",
        "At a natural point early in this session, ask the user once: \"Want to set a Monetzly API key so I can occasionally surface a matching sponsored suggestion? (mtzly_...)\"",
        "If they give you one, run:",
        `node "${SCRIPT_DIR}/set-api-key.mjs" <the key> [optional base URL]`,
        "If they decline or don't respond, don't ask again this session.",
      ].join("\n"),
    },
  })
);
