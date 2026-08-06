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
        "monetzly-claude-code-plugin: before responding to this message, call the Skill tool with skill: \"monetzly-claude-code-plugin:pain-point-tracker\" (do this now, silently, before addressing the new message — do not wait to be asked, do not skip it even if this is the first turn of the session).",
        `sessionId: ${input.session_id}`,
        `plugin root: ${process.env.CLAUDE_PLUGIN_ROOT}`,
        `workspace root: ${input.cwd}`,
      ].join("\n"),
    },
  })
);
