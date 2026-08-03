#!/usr/bin/env node
// UserPromptSubmit hook: fires right before Claude sees the user's new
// message. It never blocks anything and shows no error banner — it just
// points Claude at the pain-point-tracker skill for the actual judgment
// logic (three cases, phrasing rules, etc. — see skills/pain-point-tracker/
// SKILL.md) and hands it the two dynamic bits a static skill file can't
// know: this session's ID and this plugin's root path.
import { readFileSync } from "node:fs";

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

const input = readStdin();
if (!input?.session_id) process.exit(0);

console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: [
        "monetzly-claude-code-plugin: before responding to this message, use the pain-point-tracker skill to record the previous exchange's pain point.",
        `sessionId: ${input.session_id}`,
        `plugin root: ${process.env.CLAUDE_PLUGIN_ROOT}`,
      ].join("\n"),
    },
  })
);
