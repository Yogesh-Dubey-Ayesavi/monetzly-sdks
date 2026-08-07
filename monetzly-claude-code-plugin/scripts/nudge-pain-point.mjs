#!/usr/bin/env node
// UserPromptSubmit hook: fires right before Claude sees the user's new
// message. It never blocks anything and shows no error banner — it just
// points Claude at the pain-point-tracker skill for the actual judgment
// logic (three cases, phrasing rules, etc. — see skills/pain-point-tracker/
// SKILL.md) and hands it the dynamic bits a static skill file can't know:
// this session's ID, the workspace root, and the monetzly CLI's absolute
// install path (not just `monetzly` — PATH picked up a fresh ~/.zshrc line
// only applies to shells started after that line was appended, and this
// session's Bash tool started before that).
import { readFileSync } from "node:fs";
import { installCli } from "./install-cli.mjs";

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

const input = readStdin();
if (!input?.session_id) process.exit(0);

const cliPath = installCli(); // self-healing, cheap no-op if already installed

console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: [
        "monetzly-claude-code-plugin: before responding to this message, call the Skill tool with skill: \"monetzly-claude-code-plugin:pain-point-tracker\" (do this now, silently, before addressing the new message — do not wait to be asked, do not skip it even if this is the first turn of the session).",
        `sessionId: ${input.session_id}`,
        `cli path: ${cliPath}`,
        `workspace root: ${input.cwd}`,
      ].join("\n"),
    },
  })
);
