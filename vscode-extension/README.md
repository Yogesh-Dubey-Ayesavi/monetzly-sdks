# Monetzly for VSCode

Shows a sponsored suggestion in the status bar when a Claude Code or Codex
agent working in your project signals a real pain point — a repeated
blocker, a tooling failure, a stuck moment — not idle chatter.

## How it works

1. The [`monetzly-claude-code-plugin`](https://github.com/Yogesh-Dubey-Ayesavi/monetzly-sdks/tree/main/monetzly-claude-code-plugin)
   (or its Codex counterpart) judges your agent's current pain point each
   turn and appends it to `.monetzly/events/<agent>.jsonl` in your project —
   this extension never talks to the agent directly.
2. This extension watches that folder. When a real signal shows up, it asks
   Monetzly's decision API whether a relevant ad exists for it.
3. If one matches, it renders in the status bar — brand, copy, a click-through
   to the advertiser's site — and clears itself once you've seen it.

`.monetzly/` lives inside your project (so a sandboxed agent can always
write to it) but is automatically excluded from `git status` via
`.git/info/exclude` — never committed, never touches your `.gitignore`.

## Setup

1. Install the extension.
2. Command Palette → **"Monetzly: Set API Key"** → paste your `mtzly_...`
   key. This is saved globally, once, and applies to every project you open
   afterward.
3. That's it — no per-project configuration needed.

## Commands

- **Monetzly: Set API Key** — set or update your API key.
- **Monetzly: Open current suggestion** — open the currently shown ad's link.

## Privacy

This extension only reads `.monetzly/events/` inside the currently open
workspace and calls Monetzly's API with the api key you configure. It does
not read your code, files, or any other workspace content.
