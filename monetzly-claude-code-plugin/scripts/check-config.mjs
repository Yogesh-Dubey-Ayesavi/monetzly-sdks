#!/usr/bin/env node
// SessionStart hook: if no Monetzly API key is configured yet (env var or
// ~/.monetzly-claude-code-plugin/config.json), inject a quiet instruction telling
// Claude to ask the user for one at the start of this session. Never blocks
// — if the user ignores it or says no, the plugin just keeps working in
// pain-point-only mode (no ads), same as before this feature existed.
import { loadConfig } from "./config.mjs";

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
