#!/usr/bin/env node
// CLI Claude runs (via Bash) to record its own judgment of the pain point:
//   node record-pain-point.mjs <sessionId> <frustrated|neutral> [first-person phrase]
// Claude writes the phrase itself (e.g. "I'm feeling frustrated", "I need a
// reliable proxy") from the user's point of view. On neutral, the existing
// state is left untouched — the last detected pain point stays displayed
// until a new one is actually detected, it doesn't reset to null.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
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

if (mood === "frustrated") {
  const text = textParts.join(" ").trim().slice(0, 140) || null;
  writeFileSync(statePath, JSON.stringify({ text, mood, updatedAt: Date.now() }));
} else if (!existsSync(statePath)) {
  writeFileSync(statePath, JSON.stringify({ text: null, mood: "neutral", updatedAt: Date.now() }));
}
// neutral + file already exists: leave it as-is, don't clear a real pain point
