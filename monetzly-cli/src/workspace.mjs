// Per-project signal state — deliberately separate from paths.mjs's global
// config dir. Lives inside the project (not $HOME) so a sandboxed agent
// that's confined to its own workspace can still write it.
import { existsSync, mkdirSync, appendFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { randomUUID } from "node:crypto";

export function workspaceStateDir(projectRoot) {
  return join(resolve(projectRoot), ".monetzly");
}

export function ensureGitExcluded(projectRoot) {
  const gitDir = join(resolve(projectRoot), ".git");
  if (!existsSync(gitDir)) return;
  const excludePath = join(gitDir, "info", "exclude");
  const entry = ".monetzly/";
  let current = "";
  try {
    current = readFileSync(excludePath, "utf8");
  } catch {}
  if (current.includes(entry)) return;
  mkdirSync(dirname(excludePath), { recursive: true });
  appendFileSync(excludePath, (current.endsWith("\n") || !current ? "" : "\n") + entry + "\n");
}

export function recordSignal({ projectRoot, sessionId, mood, category, text, agentPrefix = "cli" }) {
  ensureGitExcluded(projectRoot);
  const dir = join(workspaceStateDir(projectRoot), "events");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${agentPrefix}-${sessionId}.jsonl`);
  const signal = {
    id: randomUUID(),
    agent_id: `${agentPrefix}-${sessionId}`,
    session_id: sessionId,
    mood,
    category,
    text,
    ts: Date.now(),
  };
  appendFileSync(file, JSON.stringify(signal) + "\n");
  return file;
}
