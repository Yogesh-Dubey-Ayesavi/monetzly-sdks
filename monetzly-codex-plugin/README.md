# monetzly-codex-plugin

**Codex judges what you actually need, right now — and says so once, inline.**

A Codex CLI plugin, ported from [`monetzly-claude-code-plugin`](../monetzly-claude-code-plugin),
that has Codex itself judge the pain point or need behind your current turn
— in its own words, no regex, no keyword guessing — and quietly matches it
against a live Monetzly ad. No blocking hook, no "error" banner, no
subprocess model call.

## Why this isn't a 1:1 port

Claude Code exposes a scriptable `statusLine` setting the plugin can render
into every turn (see the original plugin's `scripts/statusline.mjs`). Codex
CLI has no equivalent — no user-configurable custom status line command.
What it does have, confirmed against the installed `codex` binary, is the
same `hooks.json` wire format as Claude Code (`SessionStart`,
`UserPromptSubmit`, `additionalContext`), so the pain-point judgment and
recording pipeline ports directly. Only the *render* step changes: instead
of a persistent side-panel ad, the matched ad is surfaced as **one labeled
line inside Codex's own reply**, exactly once, the next turn after it
resolves — see [`skills/pain-point-tracker/SKILL.md`](skills/pain-point-tracker/SKILL.md).

## Install

```bash
cd sdks
codex plugin marketplace add ./
codex plugin add monetzly-codex-plugin
```

<details>
<summary>Uninstall / configure</summary>

| | |
|---|---|
| No API key given at setup | Plugin keeps running in pain-point-only mode — it just never fetches ads |
| `codex plugin remove monetzly-codex-plugin` | Remove entirely |
| Delete `~/.monetzly-codex-plugin/config.json` | Forget the saved API key; you'll be asked again next session |

</details>

## How it works

**1. `UserPromptSubmit` hook — a pointer, not a judgment.**
`scripts/nudge-pain-point.mjs` fires right before Codex sees your new
message. It never blocks and injects no visible text to you — it hands
Codex a thin `additionalContext` pointer (this session's ID and this
plugin's scripts directory) telling it to consult the `pain-point-tracker`
skill. If an ad resolved since the last turn, it also hands over that
`readyAd` (once — marking it shown in the state file immediately, so it's
never handed over twice even if Codex's reply is slow).

**2. The skill — Codex's own judgment, in its own words.**
`skills/pain-point-tracker/SKILL.md` holds the actual reasoning: judge the
*previous* exchange for a real problem, an evidenced want, or nothing
concrete — and write a first-person, search-bar-style phrase no longer than
eight words. Six categories (`break`, `learning`, `tooling`, `decompress`,
`want`, `general`) map to a `frustrated`/`neutral` mood, with the same hard
constraints as the Claude version: nothing sexual/romantic, no secrets, no
naming a real brand.

**3. Recording — a fire-and-forget, non-destructive write.**
Following the skill, Codex runs:

```
node "<scripts dir>/record-pain-point.mjs" <sessionId> <frustrated|neutral> "<phrase>"
```

which writes `{text, mood, updatedAt}` to
`$TMPDIR/monetzly-codex-plugin/<session_id>.json`. A neutral turn with
nothing new leaves the existing file untouched.

**4. The ad match — detached, never awaited.**
`record-pain-point.mjs` spawns `scripts/fetch-ad.mjs <sessionId> <text>` as
a detached, unref'd child process. It calls Monetzly's `POST /v2/decide`
with the recorded phrase as the turn signal and, on a `serve` decision,
merges `{ad: {id, brand, copy, url, shown: false}, adUpdatedAt}` into the
same state file. On `skip`, a network error, or a missing API key, it
writes `ad: null` and moves on silently.

**5. Surfacing — one inline line, once, then silence.**
The *next* `UserPromptSubmit` after an ad resolves finds `ad.shown ===
false`, hands it to the skill as `readyAd`, and flips `shown` to `true`
before Codex even starts replying. The skill weaves in one line —
`(Sponsored: <brand>) <copy> — <url>` — after the organic answer, verbatim,
then never mentions it again. Most turns carry no `readyAd` and render no
ad content at all.

## Configuration

`scripts/check-config.mjs` runs on `SessionStart`. If no API key is
configured yet, it quietly tells Codex to ask you once, early in the
session. Decline and it won't ask again that session — pain-point tracking
still runs, it just never calls the ad API. If you provide one, Codex runs:

```
node "<scripts dir>/set-api-key.mjs" <mtzly_...> [baseUrl]
```

which persists it to `~/.monetzly-codex-plugin/config.json`.

`scripts/config.mjs` is the shared reader `fetch-ad.mjs` and
`check-config.mjs` both use. Env vars win if set, otherwise it falls back
to the config file:

| Setting | Env var | Config file key | Default |
|---|---|---|---|
| API key | `MONETZLY_API_KEY` | `apiKey` | — required to fetch ads at all |
| Base URL | `MONETZLY_BASE_URL` | `baseUrl` | `https://api.monetzly.com/v2` (set to `http://localhost:8788/v2` for a local `wrangler dev` worker) |

## A known assumption worth flagging

`hooks/hooks.json` invokes scripts with relative paths (`node
scripts/check-config.mjs`), assuming Codex runs plugin hook commands with
the plugin's own root as the working directory — mirroring how
`.codex-plugin/plugin.json`'s own `"hooks"`/`"skills"` paths are root-relative.
There's no public Codex plugin-hooks spec to confirm this against yet
(this whole port was built by inspecting the installed `codex` binary's
embedded schema, not documentation). If hook invocation fails in practice,
this is the first place to check.

## Layout

```
.codex-plugin/plugin.json      — plugin manifest (name, hooks path, skills path)
hooks/hooks.json                — SessionStart + UserPromptSubmit hook wiring
skills/pain-point-tracker/      — the judgment + ad-surfacing logic Codex follows
scripts/
  nudge-pain-point.mjs           UserPromptSubmit hook — points Codex at the skill, hands over a ready ad
  record-pain-point.mjs          writes pain-point state, kicks off the ad fetch
  fetch-ad.mjs                   detached worker — calls Monetzly /v2/decide
  check-config.mjs               SessionStart hook — nudges for an API key if unset
  set-api-key.mjs                persists the API key to ~/.monetzly-codex-plugin/
  config.mjs                     shared config reader (env vars > config file)
```
