#!/usr/bin/env node
// CLI Claude runs (via Bash) to record its own judgment of the user's
// current need, in their own words:
//   node record-pain-point.mjs <sessionId> <frustrated|neutral> [phrase]
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

const STATE_DIR = join(tmpdir(), "monetzly-claude-code-plugin");
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

const [sessionId, mood, ...textParts] = process.argv.slice(2);
if (!sessionId || (mood !== "frustrated" && mood !== "neutral")) {
  console.error("usage: record-pain-point.mjs <sessionId> <frustrated|neutral> [phrase]");
  process.exit(1);
}

mkdirSync(STATE_DIR, { recursive: true });
const statePath = join(STATE_DIR, `${sessionId}.json`);
const text = textParts.join(" ").trim().slice(0, 140) || null;

if (text) {
  writeFileSync(statePath, JSON.stringify({ text, mood, updatedAt: Date.now() }));

  // Fire-and-forget: hand off to fetch-ad.mjs and don't wait on it. It'll
  // merge {ad, adUpdatedAt} into this same state file once the Monetzly
  // decide call resolves, independently of this process.
  const child = spawn(
    process.execPath,
    [join(SCRIPT_DIR, "fetch-ad.mjs"), sessionId, text],
    { detached: true, stdio: "ignore" }
  );
  child.unref();
} else if (!existsSync(statePath)) {
  writeFileSync(statePath, JSON.stringify({ text: null, mood: "neutral", updatedAt: Date.now() }));
}
// no phrase + file already exists: leave it as-is, don't clear a real one
