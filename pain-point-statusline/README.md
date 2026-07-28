# pain-point-statusline

Claude Code plugin. Claude itself judges and writes the pain point — no
regex/heuristic guessing, no subprocess model call, and no blocking Stop
hook / "error" banner.

- `hooks/nudge-pain-point.mjs` runs on `UserPromptSubmit`, right before
  Claude sees your new message. It never blocks — it just injects a quiet
  `additionalContext` instruction telling Claude to record its own
  first-person judgment of the *previous* exchange (e.g. "I'm feeling
  frustrated", "I need a reliable proxy") via one silent Bash call, before
  answering the new message. Nothing about this is narrated to you.
- That Bash call runs `scripts/record-pain-point.mjs <sessionId>
  <frustrated|neutral> [phrase]`, which writes `{text, mood, updatedAt}` to
  `$TMPDIR/pain-point-statusline/<session_id>.json`. On a neutral turn, if a
  pain point is already recorded, the file is left untouched — the last
  real pain point stays displayed until Claude actually detects a new one,
  it never resets to null just because a turn was neutral.
- `record-pain-point.mjs` then fires off `scripts/fetch-ad.mjs <sessionId>
  <text>` as a detached, unreffed child process — fire-and-forget, nothing
  waits on it. That script calls Monetzly's `POST /v2/decide` with the pain
  point as the turn signal and, on a `serve` decision, merges
  `{ad: {id, brand, copy, url}, adUpdatedAt}` into the same state file. On
  `skip`, an unreachable worker, a network error, or a missing API key, it
  writes `ad: null` (or does nothing at all if `MONETZLY_API_KEY` isn't set)
  — the pain point text is always there as a fallback, nothing ever crashes
  or blocks on this.
- `scripts/statusline.mjs` reads that state file and renders it: if an ad was
  fetched, the pain point is hidden and only the brand chip + a scrolling
  "pixel box" (dithered border, brand-colored) of the ad copy is shown;
  otherwise it falls back to the plain pain point text. The scroll position
  is a step counter persisted per-session (`<session_id>.frame` in the same
  state dir) that advances every time the script runs — this only actually
  looks like motion if Claude Code re-invokes the script fast enough (see
  `refreshInterval` below); on activity-only redraws it'll visibly jump once
  per message/tool call rather than scroll smoothly.

**Config**: `hooks/check-config.mjs` runs on `SessionStart`. If no API key is
configured yet, it quietly tells Claude to ask you once, early in the
session, for a Monetzly API key (`mtzly_...`) — decline and it won't ask
again that session; the plugin just keeps working in pain-point-only mode
(no ads). If you provide one, Claude runs `scripts/set-api-key.mjs <key>
[baseUrl]`, which persists it to `~/.pain-point-statusline/config.json`
(outside `$TMPDIR` so it survives reboots, unlike the per-session state
files).

`scripts/config.mjs` is the shared reader both `fetch-ad.mjs` and
`check-config.mjs` use — env vars win if set, otherwise it falls back to
that config file:
- `MONETZLY_API_KEY` / `apiKey` in the config file — required to fetch ads
  at all.
- `MONETZLY_BASE_URL` / `baseUrl` in the config file — defaults to
  `https://api.monetzly.com/v2`; set it to `http://localhost:8788/v2` for a
  local `wrangler dev` worker.

Earlier versions of this plugin tried: a subprocess `claude -p --model
haiku` call, a hard `Stop`-hook block forcing Claude to write the file
itself every single turn (this showed as an alarming "Stop hook error"
banner and interrupted every reply), and a pure local keyword regex
(cheap but dumb, and not actually Claude's judgment). This version keeps
Claude as the author of the phrasing while staying quiet and non-blocking.

Plugins cannot register a status line themselves, so you must point Claude
Code's `statusLine` setting at the bundled script yourself. By default,
Claude Code only re-runs a `statusLine` command on activity (a message sent,
a tool call) — for the marquee to actually scroll while you're idle, add
`refreshInterval` (seconds, 1–60; requires Claude Code 2.1.97+):

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"<path-to-plugin>/scripts/statusline.mjs\"",
    "refreshInterval": 1
  }
}
```

in `~/.claude/settings.json` (global) or `.claude/settings.json` (project).
Without `refreshInterval`, the ad text will still visibly shift, just only
once per turn instead of continuously.
