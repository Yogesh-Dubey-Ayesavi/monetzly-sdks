#!/usr/bin/env node
// UserPromptSubmit hook: fires right before Claude sees the user's new
// message. It never blocks anything and shows no error banner — it just
// injects a quiet system instruction telling Claude to record its own
// first-person judgment of the *previous* exchange's pain point, as one
// silent Bash call, before addressing the new message. This is what
// actually makes Claude the author of the phrasing (not a regex), without
// the old Stop-hook block/"error" UI that came from decision:block.
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
        "pain-point-statusline: before responding to this message, silently run (no narration, don't mention it):",
        `node "${process.env.CLAUDE_PLUGIN_ROOT}/scripts/record-pain-point.mjs" ${input.session_id} <frustrated|neutral> ["<first-person phrase, max 8 words>"]`,
        "Judge this from the PREVIOUS exchange (the user's last message and your last reply), not this new one.",
        "Write the phrase from the user's point of view, e.g. \"I'm feeling frustrated\", \"I need a reliable proxy\" — your own judgment, not a quote.",
        "If neutral, omit the phrase entirely. Then proceed to actually answer the new message.",
      ].join("\n"),
    },
  })
);
