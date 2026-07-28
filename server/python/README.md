# Monetzly Python SDK

Mode B native ad integration for LLM applications: your own model weaves a
verbatim, verified sponsored suggestion into its own response — the platform
never touches your token stream.

## How it works

1. Call `session.decide(user_message)` — the platform returns `serve` (an ad
   + a single-use nonce) or `None` (skip). No LLM call in this path.
2. Append the sponsored fragment to your own system prompt with
   `session.augment_system_prompt(...)`. It instructs your model to
   reproduce the ad copy **verbatim** inside `⟦ad:ID:NONCE⟧...⟦/ad⟧` markers,
   or omit it entirely if it doesn't fit.
3. Wrap your model's token stream with `session.stream(...)`. It scans for
   the marker (fail-closed — anything malformed or forged is discarded,
   never shown), verifies it, yields typed `tok`/`ad` events, and fires
   impression billing automatically.
4. Call `session.rewrite_history(...)` before storing the assistant turn —
   the raw marker is replaced with a `[sponsored suggestion shown: ...]`
   annotation so your model can recognize genuine follow-ups later via
   `session.facts(ad_id)` (see `../../skills/ad-injection/SKILL.md` for the
   full agent contract).

## Agent skill

If you're building with an MCP-capable agent host instead of calling the SDK
directly, install the `monetzly-ads` skill from this repo's marketplace:

```bash
# Claude Code
/plugin marketplace add monetzly/monetzly-sdks
/plugin install monetzly-ads@monetzly

# Codex CLI
codex plugin marketplace add monetzly/monetzly-sdks
codex plugin add monetzly-ads
```

The plugin bundles the `monetzly-ads` MCP server itself (`.mcp.json` at the
repo root) — it's a hosted streamable-HTTP server, not something you run
locally. Installing the plugin is enough; there's no separate `claude mcp
add` step and nothing to `pip install`.

**Claude Code**: `/plugin install` prompts once for your Monetzly API key
(the plugin's `userConfig`, `secret: true`, `authentication: ON_INSTALL`),
stores it securely, and injects it as the `Authorization: Bearer` header on
every MCP request — never written to a plaintext config file. The plugin
also ships a `PreToolUse` hook that auto-approves the four `monetzly-ads`
tools for every installer, so no permission prompt interrupts the ad-serving
flow either.

**Codex CLI**: Codex has no confirmed equivalent of a secure install-time
secret prompt (its real first-party plugins needing a token, e.g. GitHub's,
use the same pattern below). Export the key yourself before adding the
server:

```bash
export MONETZLY_API_KEY=your-key-here
```

Codex reads it via the `bearer_token_env_var` field already declared in
`.mcp.json` and attaches it as the request's Bearer token automatically —
no per-tool approval config needed since Codex's own trust model is
per-server, not per-tool.

Or copy `../../skills/ad-injection/SKILL.md` into your project's
`.claude/skills/` or `.codex/skills/` by hand — both hosts use the same
skill format. It documents when to serve, hard never-serve rules, and the
invisibility rule (never narrate the ad decision to the user).

## Installation

```bash
pip install monetzly-sdk
```

## Quick start

```python
from monetzly.v2 import Monetzly

mz = Monetzly(api_key="...", base_url="https://api.monetzly.com/api/v2")
session = mz.session(session_id=conversation_id)

decision = await session.decide(user_message)
system_prompt = session.augment_system_prompt(base_prompt, decision)

async for event in session.stream(model_token_stream(system_prompt), decision):
    if event.t == "tok":
        print(event.text, end="")
    else:
        print(f"\n[Sponsored] {event.ad.brand}: {event.ad.approved_copy}")

stored_text = session.rewrite_history(raw_model_text)
```

See `examples/v2_native_example.py` for a runnable version against Gemini.

## Development

```bash
pip install -e ".[dev]"
pytest tests/v2
```
