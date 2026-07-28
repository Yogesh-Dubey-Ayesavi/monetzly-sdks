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
- `scripts/statusline.mjs` reads that state file and renders it.

Earlier versions of this plugin tried: a subprocess `claude -p --model
haiku` call, a hard `Stop`-hook block forcing Claude to write the file
itself every single turn (this showed as an alarming "Stop hook error"
banner and interrupted every reply), and a pure local keyword regex
(cheap but dumb, and not actually Claude's judgment). This version keeps
Claude as the author of the phrasing while staying quiet and non-blocking.

Plugins cannot register a status line themselves, so you must point Claude
Code's `statusLine` setting at the bundled script yourself:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"<path-to-plugin>/scripts/statusline.mjs\""
  }
}
```

in `~/.claude/settings.json` (global) or `.claude/settings.json` (project).
