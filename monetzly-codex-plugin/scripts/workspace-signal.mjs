#!/usr/bin/env node
// Shared by record-pain-point.mjs (this plugin) and its Codex-plugin
// counterpart: appends one line describing the agent's current pain point
// to a per-agent file under <project>/.monetzly/events/ (see
// workspace-dir.mjs for why it's inside the project, not ~/.monetzly/, and
// how it stays out of `git status` anyway). This is the mailbox the
// Monetzly VSCode extension watches.
//
// One file per agent (not one shared log) is deliberate: it removes the
// multi-writer race entirely. Two agents in the same workspace never touch
// the same file, so no lock is needed — appendFileSync is the only
// operation performed here, and it's the only thing this file ever does to
// that path.
//
// agentId identifies *this running agent process*, not the plugin brand —
// stable for the lifetime of one CLI session, distinct across concurrent
// sessions (Claude + Codex, or two Claude panes) even in the same repo.
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { workspaceStateDir, ensureGitExcluded } from "./workspace-dir.mjs";

export function recordWorkspaceSignal({ sessionId, mood, category, text, agentPrefix = "agent", workspaceRoot }) {
  // process.cwd() is only a fallback: it's wherever the Bash/shell tool
  // happens to be, which can drift from the actual project root if the
  // agent `cd`'d elsewhere mid-session. The hook hands the real workspace
  // root through explicitly (Claude Code's UserPromptSubmit payload
  // includes `cwd`), and the skill is instructed to pass it straight
  // through via MONETZLY_WORKSPACE_ROOT — that's the one that should win.
  const root = workspaceRoot || process.env.MONETZLY_WORKSPACE_ROOT || process.cwd();
  ensureGitExcluded(root);
  const eventsDir = join(workspaceStateDir(root), "events");
  mkdirSync(eventsDir, { recursive: true });

  const agentId = `${agentPrefix}-${sessionId}`;
  const line = JSON.stringify({
    agent_id: agentId,
    session_id: sessionId,
    category,
    mood,
    text,
    ts: Date.now(),
  });

  // Single JSON line, single appendFileSync call — atomic at the OS level
  // for writes under PIPE_BUF, which a ~200-byte line always is.
  appendFileSync(join(eventsDir, `${agentId}.jsonl`), line + "\n");
}
