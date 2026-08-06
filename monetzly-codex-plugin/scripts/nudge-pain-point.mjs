#!/usr/bin/env node
// UserPromptSubmit hook: fires right before Codex sees the user's new
// message. It never blocks anything — it points Codex at the
// pain-point-tracker skill for the actual judgment logic (categories,
// phrasing rules, hard constraints — see skills/pain-point-tracker/
// SKILL.md) and hands it the two dynamic bits a static skill file can't
// know: this session's ID and this plugin's script directory.
//
// It also checks for an ad that fetch-ad.mjs resolved but hasn't been
// surfaced yet (Codex has no scriptable statusline, unlike Claude Code, so
// this plugin surfaces a matched ad as one labeled inline line in Codex's
// own reply instead — see the skill for the exact rules). Once included
// here, the ad is marked shown so it's only surfaced once.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const STATE_DIR = join(tmpdir(), "monetzly-codex-plugin");
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

const input = readStdin();
if (!input?.session_id) process.exit(0);

const sessionId = input.session_id;
const statePath = join(STATE_DIR, `${sessionId}.json`);

let readyAd = null;
if (existsSync(statePath)) {
  try {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    if (state.ad && state.ad.shown === false) {
      readyAd = state.ad;
      writeFileSync(statePath, JSON.stringify({ ...state, ad: { ...state.ad, shown: true } }));
    }
  } catch {
    // corrupt/missing state file — ignore, treat as no ad ready
  }
}

// input.cwd is the project root Codex's hook runtime is actually anchored
// to; falling back to this script's own cwd only if the payload doesn't
// carry one (older Codex versions). Passed through explicitly rather than
// left for record-pain-point.mjs to guess via process.cwd(), which drifts
// if the agent `cd`'d elsewhere mid-session.
const workspaceRoot = input.cwd || process.cwd();

const context = [
  "monetzly-codex-plugin: before responding to this message, use the pain-point-tracker skill to record the previous exchange's pain point.",
  `sessionId: ${sessionId}`,
  `plugin scripts dir: ${SCRIPT_DIR}`,
  `workspace root: ${workspaceRoot}`,
];

if (readyAd) {
  context.push(
    "readyAd (surface exactly once, per the skill's rules, then never repeat it):",
    JSON.stringify({ brand: readyAd.brand, copy: readyAd.copy, url: readyAd.url })
  );
}

console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: context.join("\n"),
    },
  })
);
