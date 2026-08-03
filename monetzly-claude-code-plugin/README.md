# monetzly-claude-code-plugin

**A status line that knows what you actually need, right now.**

A Claude Code plugin that has Claude itself judge the pain point or need
behind your current turn — in its own words, no regex, no keyword guessing —
and quietly matches it against a live Monetzly ad. No blocking hook, no
"error" banner, no subprocess model call. If nothing matches, the status
line shows nothing at all.

## Install

```bash
claude plugin marketplace add Yogesh-Dubey-Ayesavi/monetzly-sdks
claude plugin install monetzly-claude-code-plugin@monetzly
```

Plugins cannot register a status line directly, so point Claude Code's
`statusLine` setting at the bundled script (see [Status line setup](#status-line-setup)
below) — that's the one manual step.

<details>
<summary>Uninstall / configure</summary>

| | |
|---|---|
| No API key given at setup | Plugin keeps running in pain-point-only mode — it just never fetches ads |
| `claude plugin uninstall monetzly-claude-code-plugin` | Remove entirely |
| Delete `~/.monetzly-claude-code-plugin/config.json` | Forget the saved API key; you'll be asked again next session |

</details>

Once installed and wired to your `statusLine`, a turn where you hit a wall
looks like this — Claude never narrates any of it, this is just what shows
up at the bottom of your terminal a moment later:

```
✦ Brightproxy · This proxy pool won't rate-limit your scraper · brightproxy.io
```

Nothing renders until there's something worth showing. Ask a question, get
an explanation, read some code — the status line stays exactly as it was.

---

## Contents

- [How it works](#how-it-works) — the four-stage pipeline
- [Status line setup](#status-line-setup)
- [Configuration](#configuration)
- [Design choices](#design-choices) — why it's built this way
- [Layout](#layout)

## How it works

**1. `UserPromptSubmit` hook — a pointer, not a judgment.**
`scripts/nudge-pain-point.mjs` fires right before Claude sees your new
message. It never blocks and injects no visible text to you — it just hands
Claude a thin `additionalContext` pointer (this session's ID and the
plugin's root path) telling it to consult the `pain-point-tracker` skill.

**2. The skill — Claude's own judgment, in its own words.**
`skills/pain-point-tracker/SKILL.md` holds the actual reasoning: judge the
*previous* exchange (not the message that just arrived) for a real problem,
an evidenced want, or nothing concrete — and write a first-person,
search-bar-style phrase ("I need a reliable proxy service") no longer than
eight words. Six categories (`break`, `learning`, `tooling`, `decompress`,
`want`, `general`) map to a `frustrated`/`neutral` mood. Hard constraints
rule out anything sexual/romantic, any secret or credential, and naming a
real brand — Claude describes the *category* of thing that would help, never
a promoted vendor. Keeping this in a skill file rather than baked into the
hook means it can be read, edited, and reasoned about on its own; the hook
stays a dumb pointer carrying only the two things a static file can't know
(session ID, plugin root).

**3. Recording — a fire-and-forget, non-destructive write.**
Following the skill, Claude runs:

```
node "<plugin>/scripts/record-pain-point.mjs" <sessionId> <frustrated|neutral> "<phrase>"
```

which writes `{text, mood, updatedAt}` to
`$TMPDIR/monetzly-claude-code-plugin/<session_id>.json`. On a neutral turn
with nothing new to report, the existing file is left untouched — a real
pain point stays displayed until Claude actually detects a new one; it never
resets to blank just because a turn happened to be quiet.

**4. The ad match — detached, never awaited.**
`record-pain-point.mjs` spawns `scripts/fetch-ad.mjs <sessionId> <text>` as
a detached, unref'd child process. That script calls Monetzly's
`POST /v2/decide` with the recorded phrase as the turn signal and, on a
`serve` decision, merges `{ad: {id, brand, copy, url}, adUpdatedAt}` into
the same state file. On `skip`, a network error, an unreachable worker, or a
missing API key, it writes `ad: null` and moves on silently — nothing here
ever crashes or blocks the conversation.

**5. Rendering — ad if you've got one, nothing if you don't.**
`scripts/statusline.mjs` reads that state file: if an ad resolved, it
renders a single-tone accent pill — bold brand name, a divider, then a
continuously scrolling stream of the ad copy and an underlined, OSC‑8
clickable URL — bookended by a small pixel-glyph mark. It never falls back
to showing the raw pain-point text. If no ad has resolved yet, **the status
line renders nothing at all**, not even a placeholder. The scroll offset is
a step counter persisted per-session (`<session_id>.frame` in the same
state dir) that advances on every invocation — see `refreshInterval` below
for what makes that actually look like motion.

---

## Status line setup

Add to `~/.claude/settings.json` (global) or `.claude/settings.json`
(project):

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"<path-to-plugin>/scripts/statusline.mjs\"",
    "refreshInterval": 1
  }
}
```

By default, Claude Code only re-runs a `statusLine` command on activity (a
message sent, a tool call). `refreshInterval` (seconds, 1–60, requires
Claude Code 2.1.97+) makes it re-run on a timer too, so the marquee actually
scrolls while you're idle. Without it, the ad text still shifts — just once
per turn instead of continuously.

## Configuration

`scripts/check-config.mjs` runs on `SessionStart`. If no API key is
configured yet, it quietly tells Claude to ask you once, early in the
session: *"Want to set a Monetzly API key so the status line can show
matching ads? (mtzly_...)"* Decline and it won't ask again that session —
the plugin keeps tracking pain points, it just never calls the ad API. If
you provide one, Claude runs:

```
node "<plugin>/scripts/set-api-key.mjs" <mtzly_...> [baseUrl]
```

which persists it to `~/.monetzly-claude-code-plugin/config.json` — outside
`$TMPDIR`, so it survives reboots unlike the per-session state files.

`scripts/config.mjs` is the shared reader both `fetch-ad.mjs` and
`check-config.mjs` use. Env vars win if set, otherwise it falls back to the
config file:

| Setting | Env var | Config file key | Default |
|---|---|---|---|
| API key | `MONETZLY_API_KEY` | `apiKey` | — required to fetch ads at all |
| Base URL | `MONETZLY_BASE_URL` | `baseUrl` | `https://api.monetzly.com/v2` (set to `http://localhost:8788/v2` for a local `wrangler dev` worker) |

## Design choices

**Claude writes the phrase, not a script.** Earlier versions of this plugin
tried a subprocess `claude -p --model haiku` call, a hard `Stop`-hook block
forcing a write every single turn (surfaced as an alarming "Stop hook
error" banner and interrupted every reply), and a pure local keyword regex
— cheap, but dumb, and not actually Claude's judgment. This version keeps
Claude as the author of the phrasing while staying quiet and non-blocking.

**Nothing is ever narrated to you.** The hooks inject `additionalContext`,
never text Claude is told to relay. You should never see the plugin
"explain itself" mid-conversation — only the status line changes.

**No ad, no noise.** A pain point with no matching ad still gets recorded
(so a later turn can find a match), but it never leaks into the status line
as placeholder text. Nothing shows until something's actually worth
showing.

**Fire-and-forget, always.** Both the ad fetch and the status line render
are structured so a slow or failing Monetzly API degrades to *nothing
rendered*, never a stuck hook or a blocked reply.

## Layout

```
.claude-plugin/plugin.json     — plugin manifest (name, hooks entry, skills entry)
hooks/hooks.json                — SessionStart + UserPromptSubmit hook wiring
skills/pain-point-tracker/      — the judgment logic Claude follows
scripts/
  nudge-pain-point.mjs           UserPromptSubmit hook — points Claude at the skill
  record-pain-point.mjs          writes pain-point state, kicks off the ad fetch
  fetch-ad.mjs                   detached worker — calls Monetzly /v2/decide
  statusline.mjs                 renders the state file as the status line
  check-config.mjs               SessionStart hook — nudges for an API key if unset
  set-api-key.mjs                persists the API key to ~/.monetzly-claude-code-plugin/
  config.mjs                     shared config reader (env vars > config file)
```
