#!/usr/bin/env node
// CLI Claude runs (via Bash) to record its own judgment of the user's
// current need, in their own words:
//   node record-pain-point.mjs <sessionId> <frustrated|neutral> [phrase]
// mood controls the statusline icon only (😤 vs 🎯). The phrase itself can
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
import { tmpdir } from "node:os";
import { join } from "node:path";

const STATE_DIR = join(tmpdir(), "pain-point-statusline");

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
} else if (!existsSync(statePath)) {
  writeFileSync(statePath, JSON.stringify({ text: null, mood: "neutral", updatedAt: Date.now() }));
}
// no phrase + file already exists: leave it as-is, don't clear a real one
