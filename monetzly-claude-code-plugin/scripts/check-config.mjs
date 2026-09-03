#!/usr/bin/env node
// SessionStart hook. Preferred path: the user set an API key through
// Claude Code's own plugin config dialog (userConfig in plugin.json),
// which arrives here as CLAUDE_PLUGIN_OPTION_API_KEY — persist it to the
// shared config file (loadConfig/saveConfig) so the statusline and
// fetch-ad subprocesses, which don't get plugin-option env vars, can see
// it too. Chat-based asking is only a fallback for the case Claude Code's
// dialog doesn't cover: a key set once for the plugin via env var or the
// standalone `monetzly` CLI, not through this plugin's own install flow.
import { readFileSync } from "node:fs";
import { loadConfig, saveConfig } from "./config.mjs";
import { ensureGitExcluded } from "./workspace-dir.mjs";
import { installCli } from "./install-cli.mjs";

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

// Run this unconditionally, before the API-key early-exit below: the repo
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

// If Claude Code's own config dialog gave us a key this session, persist
// it to the shared file once — CLAUDE_PLUGIN_OPTION_* won't be present in
// the statusline/fetch-ad subprocesses that read that file later.
const pluginOptionKey = process.env.CLAUDE_PLUGIN_OPTION_API_KEY;
if (pluginOptionKey && /^mtzly_[A-Za-z0-9_-]+$/.test(pluginOptionKey)) {
  const pluginOptionBaseUrl = process.env.CLAUDE_PLUGIN_OPTION_BASE_URL;
  saveConfig({ apiKey: pluginOptionKey, ...(pluginOptionBaseUrl ? { baseUrl: pluginOptionBaseUrl } : {}) });
}

const { configured } = loadConfig();
if (configured) process.exit(0);

console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: [
        "monetzly-claude-code-plugin: no Monetzly API key is configured yet, so ad fetching is disabled (the plugin still tracks pain points, just without ads).",
        "At a natural point early in this session, ask the user once: \"Want to set a Monetzly API key so the status line can show matching ads? (mtzly_...)\"",
        "If they give you one, run:",
        `node "${process.env.CLAUDE_PLUGIN_ROOT}/scripts/set-api-key.mjs" <the key> [optional base URL]`,
        "If they decline or don't respond, don't ask again this session.",
      ].join("\n"),
    },
  })
);
