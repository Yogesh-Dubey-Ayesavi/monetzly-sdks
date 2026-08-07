#!/usr/bin/env node
// CLI Codex runs (via shell) to record its own judgment of the user's
// current need, in their own words:
//   node record-pain-point.mjs <workspaceRoot> <sessionId> <frustrated|neutral> [category] [phrase]
// mood distinguishes an actual problem from a neutral want/suggestion. The phrase itself can
// be a technical problem ("I need better proxies") OR a non-problem need
// evidenced by context ("I need sweets for Christmas") — mood is frustrated
// only when the user is actually having a problem, neutral otherwise, but
// neutral can still carry a phrase.
//
// This is now a thin wrapper around the `monetzly` CLI (see install-cli.mjs)
// instead of writing the event file and firing decide() itself — the CLI
// does both in one call (`monetzly signal ...`), the same one a human types
// manually and the VSCode extension's activation installs, so there's one
// implementation of "record a signal" instead of three. Calls the CLI by
// its known absolute install path (not by relying on `monetzly` being on
// PATH) because this session's shell tool started before any freshly-
// appended ~/.zshrc line would take effect.
//
// If no phrase is given (nothing to say — no real evidence either way), do
// nothing: a real pain point/need stays displayed until a new one is
// actually detected, it never resets to null just because a turn had
// nothing new to report.
import { spawnSync } from "node:child_process";
import { installCli } from "./install-cli.mjs";

const CATEGORIES = new Set(["break", "learning", "tooling", "decompress", "want", "general"]);

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

const text = textParts.join(" ").trim().slice(0, 140);
if (!text) process.exit(0); // nothing new to report — leave existing state alone

const cliPath = installCli(); // self-healing: installs if missing, no-op if already present
if (!cliPath) process.exit(0); // couldn't install (e.g. no vendored binary shipped) — fail silent, same policy as before

spawnSync(
  process.execPath,
  [cliPath, "signal", mood, category, text, "--root", workspaceRoot, "--session", sessionId, "--agent", "codex"],
  { stdio: "ignore" }
);
