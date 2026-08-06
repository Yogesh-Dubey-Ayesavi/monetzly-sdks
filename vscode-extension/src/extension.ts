import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { pickWinner, createSelectionState, SKIP_COOLDOWN_MS, Signal, SelectionState } from "./signals";
import { decide, fireImpression, MonetzlyConfig } from "./client";
import { marqueeFrame, accentForStep } from "./marquee";
import { workspaceStateDir, ensureGitExcluded } from "./workspaceDir";
// @ts-ignore -- monetzly-cli is a plain .mjs package, no published types
import { resolveConfig, writeConfig } from "monetzly-cli";

// How long to wait after a signal arrives before deciding, so near-
// simultaneous signals from multiple agents get batched into one
// selection round instead of racing each other.
const DEBOUNCE_MS = 2_000;
const MARQUEE_TICK_MS = 400;
// Extensions run in the extension host, not the renderer — there's no API
// to measure the status bar's actual available width. 80 chars covers most
// of a normal-width window's status bar without the extension host
// guessing screen size; monetzly.marqueeWidth lets you tune it to yours.
const DEFAULT_MARQUEE_WIDTH = 80;

function getMarqueeWidth(): number {
  return vscode.workspace.getConfiguration("monetzly").get<number>("marqueeWidth") || DEFAULT_MARQUEE_WIDTH;
}

let statusBarItem: vscode.StatusBarItem;
let currentAdUrl: string | undefined;
let marqueeTimer: NodeJS.Timeout | undefined;

function getConfig(): MonetzlyConfig | null {
  // Reads the same global config file the terminal plugin and standalone
  // `monetzly` CLI use (~/Library/Application Support/monetzly/ on macOS,
  // OS-equivalent elsewhere) — not a VSCode setting. VSCode's "Global"
  // scope is actually per-profile, which is exactly what caused the
  // API-key-set-but-nothing-happens bug earlier; this file is genuinely
  // machine-wide regardless of which VSCode profile is active.
  const { apiKey, baseUrl, configured } = resolveConfig();
  if (!configured || !apiKey) return null;
  return { apiKey, baseUrl };
}

function eventsDir(root: string): string {
  return path.join(workspaceStateDir(root), "events");
}

function readOrCreateSessionId(root: string): string {
  const p = path.join(workspaceStateDir(root), "session_id");
  try {
    return fs.readFileSync(p, "utf8").trim();
  } catch {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const id = randomUUID();
    fs.writeFileSync(p, id);
    return id;
  }
}

/** Tracks how many lines of each per-agent file we've already consumed, so re-firing fs events on the same file doesn't replay old signals. */
class FileTailer {
  private linesRead = new Map<string, number>();

  readNewLines(filePath: string): Signal[] {
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch {
      return [];
    }
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    const already = this.linesRead.get(filePath) ?? 0;
    const fresh = lines.slice(already);
    this.linesRead.set(filePath, lines.length);

    const signals: Signal[] = [];
    for (const line of fresh) {
      try {
        signals.push(JSON.parse(line) as Signal);
      } catch {
        // malformed line — a partial write mid-append, most likely; skip it
      }
    }
    return signals;
  }
}

export function activate(context: vscode.ExtensionContext) {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return; // nothing to watch without a workspace root

  const root = folder.uri.fsPath;
  ensureGitExcluded(root);
  const dir = eventsDir(root);
  fs.mkdirSync(dir, { recursive: true });
  const sessionId = readOrCreateSessionId(root);

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = "monetzly.openAd";
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand("monetzly.openAd", () => {
      if (currentAdUrl) vscode.env.openExternal(vscode.Uri.parse(currentAdUrl));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("monetzly.setApiKey", async () => {
      const existing = resolveConfig().apiKey ?? "";
      const value = await vscode.window.showInputBox({
        prompt: "Monetzly API key (mtzly_...)",
        password: true,
        ignoreFocusOut: true,
        value: existing,
        placeHolder: "mtzly_...",
      });
      if (value === undefined) return; // cancelled
      // Writes to the shared global config file (see getConfig above), not
      // a VSCode setting — genuinely machine-wide, not per-profile, and
      // it's the exact same file `monetzly config set-key` and the
      // terminal plugin write to, so all three stay in sync automatically.
      writeConfig({ apiKey: value });
      vscode.window.showInformationMessage("Monetzly API key saved — it'll apply to every workspace and profile.");
    })
  );

  function startMarquee(text: string) {
    if (marqueeTimer) clearInterval(marqueeTimer);
    const width = getMarqueeWidth();
    // Shrink to fit: if the ad copy is already shorter than the configured
    // width, scrolling it would just pad empty space with "· · ·" filler
    // for no reason — show it static at its natural length instead.
    if (text.length <= width) {
      statusBarItem.text = `$(megaphone) ${text}`;
      statusBarItem.color = new vscode.ThemeColor(accentForStep(0));
      return;
    }
    let step = 0;
    const render = () => {
      const scrolling = marqueeFrame(text, width, step);
      statusBarItem.text = `$(megaphone) ${scrolling}`;
      statusBarItem.color = new vscode.ThemeColor(accentForStep(step));
      step += 2;
    };
    render();
    marqueeTimer = setInterval(render, MARQUEE_TICK_MS);
  }
  context.subscriptions.push({ dispose: () => marqueeTimer && clearInterval(marqueeTimer) });

  const tailer = new FileTailer();
  const queue: Signal[] = [];
  const selectionState: SelectionState = createSelectionState();
  const skipCooldownUntil = new Map<string, number>();
  let debounceTimer: NodeJS.Timeout | undefined;

  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(vscode.Uri.file(dir), "*.jsonl")
  );
  context.subscriptions.push(watcher);

  const onFileTouched = (uri: vscode.Uri) => {
    queue.push(...tailer.readNewLines(uri.fsPath));
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runSelectionRound, DEBOUNCE_MS);
  };
  watcher.onDidCreate(onFileTouched);
  watcher.onDidChange(onFileTouched);

  async function runSelectionRound() {
    const now = Date.now();
    const round = queue
      .splice(0, queue.length) // consume everyone, win or lose
      .filter((s) => (skipCooldownUntil.get(s.agent_id) ?? 0) <= now);
    const winner = pickWinner(round, selectionState, now);
    if (!winner) return;

    const config = getConfig();
    if (!config) return; // not configured — silently skip, same policy as the terminal plugin

    const result = await decide(config, sessionId, winner.text ?? winner.category);
    if (result.decision !== "serve" || !result.ad || !result.nonce) {
      // Short cooldown only — a skip isn't a served ad, so it shouldn't
      // block this agent for the full agentCooldownMs, just stop it from
      // being re-queried on every debounce tick while nothing's changed.
      skipCooldownUntil.set(winner.agent_id, Date.now() + SKIP_COOLDOWN_MS);
      return;
    }

    selectionState.lastServedAt = Date.now();
    selectionState.lastServedAtByAgent.set(winner.agent_id, selectionState.lastServedAt);

    currentAdUrl = result.ad.url;
    statusBarItem.tooltip = result.ad.url ?? result.ad.approved_copy;
    statusBarItem.show();
    startMarquee(`${result.ad.brand}: ${result.ad.approved_copy}`);

    await fireImpression(config, sessionId, result.ad.id, result.nonce);
  }
}

export function deactivate() {
  // nothing to tear down — fs.watch handles are disposed via context.subscriptions
}
