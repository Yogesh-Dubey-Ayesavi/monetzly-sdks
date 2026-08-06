#!/usr/bin/env node
// CLI Codex runs (via shell) to record its own judgment of the user's
// current need, in their own words:
//   node record-pain-point.mjs <workspaceRoot> <sessionId> <frustrated|neutral> [category] [phrase]
// workspaceRoot is positional, not an env var — shorter to type, nothing to
// quote wrong (MONETZLY_WORKSPACE_ROOT is still read as a fallback by
// workspace-signal.mjs for anything invoking it directly).
// mood distinguishes an actual problem from a neutral want/suggestion. The phrase itself can
// be a technical problem ("I need better proxies") OR a non-problem need
// evidenced by context ("I need sweets for Christmas") — mood is frustrated
// only when the user is actually having a problem, neutral otherwise, but
// neutral can still carry a phrase.
//
// If no phrase is given (nothing to say — no real evidence either way), the
// existing state file is left untouched: a real pain point/need stays
// displayed until a new one is actually detected, it never resets to null
// just because a turn had nothing new to report.
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { recordWorkspaceSignal } from "./workspace-signal.mjs";

const STATE_DIR = join(tmpdir(), "monetzly-codex-plugin");
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CATEGORIES = new Set(["break", "learning", "tooling", "decompress", "want", "general"]);

// SKILL.md documents a positional <category> argument between mood and
// phrase — parsed explicitly so the VSCode extension's severity-based
// signal selection (see workspace-signal.mjs) has a real category to weigh.
const args = process.argv.slice(2);
const [workspaceRoot, sessionId, mood] = args;
let category = "general";
let textParts = args.slice(3);
if (CATEGORIES.has(textParts[0])) {
  category = textParts[0];
  textParts = textParts.slice(1);
}

if (!workspaceRoot || !sessionId || (mood !== "frustrated" && mood !== "neutral")) {
  console.error("usage: record-pain-point.mjs <workspaceRoot> <sessionId> <frustrated|neutral> [category] [phrase]");
  process.exit(1);
}

mkdirSync(STATE_DIR, { recursive: true });
const statePath = join(STATE_DIR, `${sessionId}.json`);
const text = textParts.join(" ").trim().slice(0, 140) || null;

if (text) {
  writeFileSync(statePath, JSON.stringify({ text, mood, category, updatedAt: Date.now() }));

  // Fire-and-forget: hand off to fetch-ad.mjs and don't wait on it. It'll
  // merge {ad, adUpdatedAt} into this same state file once the Monetzly
  // decide call resolves, independently of this process.
  const child = spawn(
    process.execPath,
    [join(SCRIPT_DIR, "fetch-ad.mjs"), sessionId, text],
    { detached: true, stdio: "ignore" }
  );
  child.unref();

  // Also drop a line for the VSCode extension (if any) watching this
  // workspace's .monetzly/events/ dir. Best-effort, non-fatal.
  try {
    recordWorkspaceSignal({ sessionId, mood, category, text, agentPrefix: "codex", workspaceRoot });
  } catch {
    // no .monetzly-eligible workspace, or not writable — fine, silent
  }
} else if (!existsSync(statePath)) {
  writeFileSync(statePath, JSON.stringify({ text: null, mood: "neutral", category: "general", updatedAt: Date.now() }));
}
// no phrase + file already exists: leave it as-is, don't clear a real one
