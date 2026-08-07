// Per-project signal state — deliberately separate from paths.mjs's global
// config dir. Lives inside the project (not $HOME) so a sandboxed agent
// that's confined to its own workspace can still write it.
import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync } from "node:fs";
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

export function adStatePath(projectRoot, agentPrefix, sessionId) {
  return join(workspaceStateDir(projectRoot), "ads", `${agentPrefix}-${sessionId}.json`);
}

/**
 * Calls Monetzly's decide() with this signal's text as the turn, and
 * persists the result at the project root (not $TMPDIR) so any terminal
 * statusline — not just the process that happened to fire the signal —
 * can read the same file. Never throws: a network failure just means no ad
 * this round, which the statusline already treats as "nothing to show".
 */
export async function fireDecideAndPersist({ projectRoot, sessionId, text, apiKey, baseUrl, agentPrefix = "cli" }) {
  const statePath = adStatePath(projectRoot, agentPrefix, sessionId);
  mkdirSync(dirname(statePath), { recursive: true });

  const writeAd = (ad, raw) => writeFileSync(statePath, JSON.stringify({ ad, raw, updatedAt: Date.now() }));

  if (!apiKey) return; // not configured — leave no state, statusline shows nothing

  try {
    const res = await fetch(`${baseUrl}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ protocol: 1, session_id: sessionId, turn: { kind: "raw_text", text } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return writeAd(null, { error: `HTTP ${res.status}` });
    const data = await res.json();
    if (data?.decision === "serve" && data.ad) {
      writeAd({ id: data.ad.id, brand: data.ad.brand, copy: data.ad.approved_copy, url: data.ad.url }, data);
    } else {
      writeAd(null, data);
    }
  } catch (err) {
    writeAd(null, { error: String(err?.message || err) });
  }
}
