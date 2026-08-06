// Pure selection logic — no vscode/fs imports, so it's trivially unit
// testable and mirrors exactly what was designed and confirmed with the
// user: recency first, category severity as tiebreaker, per-agent and
// workspace cooldowns to stop one noisy agent (or one busy minute) from
// hogging every ad slot.

export type Category = "break" | "learning" | "tooling" | "decompress" | "want" | "general";

export interface Signal {
  agent_id: string;
  session_id: string;
  category: Category;
  mood: "frustrated" | "neutral";
  text: string | null;
  ts: number;
}

// Higher = more likely to be a real blocker worth interrupting for, not
// idle chatter. Matches the categories in pain-point-tracker/SKILL.md.
const SEVERITY: Record<Category, number> = {
  tooling: 3,
  decompress: 3,
  learning: 2,
  want: 1,
  break: 0,
  general: 0,
};

export interface SelectionConfig {
  /** Signals older than this are considered stale, never picked. */
  recencyWindowMs: number;
  /** Two signals within this of each other are "close enough" that severity, not just ts, breaks the tie. */
  tieWindowMs: number;
  /** Per-agent: skip an agent's new signals until this long after its last served ad. */
  agentCooldownMs: number;
  /** Workspace-wide: don't serve more than one ad within this window, regardless of agent. */
  workspaceCooldownMs: number;
}

export const DEFAULT_SELECTION_CONFIG: SelectionConfig = {
  recencyWindowMs: 2 * 60_000,
  tieWindowMs: 60_000,
  agentCooldownMs: 5 * 60_000,
  workspaceCooldownMs: 10 * 60_000,
};

export interface SelectionState {
  lastServedAt: number | null;
  lastServedAtByAgent: Map<string, number>;
}

export function createSelectionState(): SelectionState {
  return { lastServedAt: null, lastServedAtByAgent: new Map() };
}

/**
 * Picks at most one signal to act on out of everything queued this round.
 * Callers must clear the whole queue after calling this, win or lose —
 * signals not picked are dropped, never replayed (a 10-minute-old pain
 * point is probably already resolved).
 */
export function pickWinner(
  queue: Signal[],
  state: SelectionState,
  now: number,
  config: SelectionConfig = DEFAULT_SELECTION_CONFIG
): Signal | null {
  if (state.lastServedAt !== null && now - state.lastServedAt < config.workspaceCooldownMs) {
    return null;
  }

  const eligible = queue.filter((s) => {
    if (now - s.ts > config.recencyWindowMs) return false;
    const lastForAgent = state.lastServedAtByAgent.get(s.agent_id);
    if (lastForAgent !== undefined && now - lastForAgent < config.agentCooldownMs) return false;
    return true;
  });
  if (eligible.length === 0) return null;

  eligible.sort((a, b) => {
    const closeInTime = Math.abs(a.ts - b.ts) <= config.tieWindowMs;
    if (closeInTime) {
      const severityDiff = SEVERITY[b.category] - SEVERITY[a.category];
      if (severityDiff !== 0) return severityDiff;
    }
    return b.ts - a.ts; // freshest first
  });

  return eligible[0];
}

/** Short cooldown applied on a `skip` decide() response, to avoid re-querying the same dead-end signal immediately. */
export const SKIP_COOLDOWN_MS = 60_000;
