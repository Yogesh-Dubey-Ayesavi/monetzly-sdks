#!/usr/bin/env node
// UserPromptSubmit hook: fires right before Codex sees the user's new
// message. It never blocks anything — it points Codex at the
// pain-point-tracker skill for the actual judgment logic (categories,
// phrasing rules, hard constraints — see skills/pain-point-tracker/
// SKILL.md) and hands it the dynamic bits a static skill file can't know:
// this session's ID, the workspace root, and the monetzly CLI's absolute
// install path (not just `monetzly` — a PATH update from a freshly-written
// ~/.zshrc line only applies to shells started after that line was
// appended, and this session's shell tool started before that).
//
// It also checks for an ad the CLI resolved but hasn't been surfaced yet
// (Codex has no scriptable statusline, unlike Claude Code, so this plugin
// surfaces a matched ad as one labeled inline line in Codex's own reply
// instead — see the skill for the exact rules). The ad lives at the
// project root (.monetzly/ads/codex-<sessionId>.json, written by `monetzly
// signal`), not $TMPDIR — a small $TMPDIR marker just tracks which ad id
// was already shown, since the root file itself has no "shown" flag.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installCli } from "./install-cli.mjs";

const SHOWN_DIR = join(tmpdir(), "monetzly-codex-plugin");

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
// input.cwd is the project root Codex's hook runtime is actually anchored
// to; falling back to this script's own cwd only if the payload doesn't
// carry one (older Codex versions).
const workspaceRoot = input.cwd || process.cwd();

let readyAd = null;
try {
  const adPath = join(workspaceRoot, ".monetzly", "ads", `codex-${sessionId}.json`);
  const state = JSON.parse(readFileSync(adPath, "utf8"));
  if (state.ad) {
    const shownPath = join(SHOWN_DIR, `${sessionId}.shown`);
    const lastShownId = existsSync(shownPath) ? readFileSync(shownPath, "utf8").trim() : null;
    if (state.ad.id !== lastShownId) {
      readyAd = state.ad;
      mkdirSync(SHOWN_DIR, { recursive: true });
      writeFileSync(shownPath, state.ad.id);
    }
  }
} catch {
  // no ad state yet, or not readable — fine, no ad ready
}

const cliPath = installCli(); // self-healing, cheap no-op if already installed

const context = [
  "monetzly-codex-plugin: before responding to this message, use the pain-point-tracker skill to record the previous exchange's pain point.",
  `sessionId: ${sessionId}`,
  `cli path: ${cliPath}`,
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
