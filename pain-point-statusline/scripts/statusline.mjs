#!/usr/bin/env node
// statusLine command: reads the state file written by the Stop hook and renders it.
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STATE_DIR = join(tmpdir(), "pain-point-statusline");

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

const input = readStdin();
const sessionId = input?.session_id;
const modelName = input?.model?.display_name;

let painPoint = null;
if (sessionId) {
  try {
    const state = JSON.parse(readFileSync(join(STATE_DIR, `${sessionId}.json`), "utf8"));
    painPoint = state.text;
  } catch {
    // No state yet (first prompt) — fine, render without it.
  }
}

const parts = [];
if (modelName) parts.push(modelName);
parts.push(painPoint || "no pain point detected yet");

process.stdout.write(parts.join(" | "));
