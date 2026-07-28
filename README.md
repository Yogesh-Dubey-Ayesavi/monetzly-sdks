<div align="center">

# Monetzly SDKs

### Ads that feel native to your AI.

Your model says the sponsored line itself — in its own voice, in its own
turn. Monetzly never intercepts, throttles, or rewrites your token stream.
No banners, no pop-ups, no retrofit ad network bolted onto a chat window.

**You keep most of it: You 70% · Monetzly 30%.**

[![JS SDK](https://img.shields.io/badge/npm-%40monetzly%2Fserver--sdk-cb3837?logo=npm&logoColor=white)](server/js)
[![Python SDK](https://img.shields.io/badge/pip-monetzly--sdk-3776AB?logo=python&logoColor=white)](server/python)
[![MCP](https://img.shields.io/badge/MCP-monetzly--ads-6f42c1)](.mcp.json)
[![License](https://img.shields.io/badge/license-see%20repo-lightgrey)](#)

</div>

---

## The problem with monetizing an AI app

You only earn from the few who pay. Everyone else — the free-tier majority
using your chatbot, copilot, voice agent, or search product every day —
generates cost, not revenue. Subscriptions cap out. Banners don't belong in
a conversation. And retrofit ad networks show it: an obviously bolted-on
widget breaks the illusion of talking to something intelligent.

**Monetzly is ad-injection middleware, built AI-native from day one** — not a
banner network wearing an LLM costume. It sits between your decision logic
and your model, stays completely invisible to the user until an ad is
genuinely relevant, and lets your own model deliver it the way a helpful
colleague would — mid-answer, on-topic, and clearly labeled.

|  | Subscriptions | Banner networks | **Monetzly** |
|---|---|---|---|
| Monetizes free users | ✗ | partial | **✓** |
| Fits inside a conversation | ✗ | ✗ | **✓** |
| Publisher controls placement | — | ✗ | **✓** |
| Contextual, not interruptive | — | ✗ | **✓** |
| Infra changes required | — | some | **none** |
| Time to first impression | — | days | **~5 minutes** |

---

## What it looks like in a real conversation

```
user       > I need something to sign a rental agreement remotely,
             any recommendations?

assistant  > You can handle this a few ways — export to PDF and use
             built-in signature tools in Preview/Acrobat, or a
             dedicated e-sign service if you want audit trails and
             reminders baked in.

             > **Sponsored** — DocuSign lets you send, sign, and track
             > agreements from any device in minutes. (docusign.com)

             For a one-off like a rental agreement, either path works —
             the e-sign route just saves you the "did they actually
             sign it" follow-up email.
```

The organic answer stands alone with the sponsored line removed. The label
is non-negotiable. The copy is reproduced **verbatim** — never paraphrased,
never extended with claims the sponsor didn't approve.

---

## How it works — five minutes from install to first impression

```
01  decide()                02  augment prompt         03  your model streams
    stateless call              sponsored fragment          token-by-token —
    session + frequency         appended to YOUR             the ad is woven in
    state → safety gate →       system prompt, with          by the model itself,
    contextual matching.        a single-use nonce.          verbatim or omitted.
    No LLM call here.

                                                          ▼
04  stream scanner                                05  rewriteHistory()
    watches for the marker.                            raw marker replaced with
    Fail-closed: malformed,                             a "[sponsored suggestion
    forged, or unclosed →                               shown]" annotation so
    discarded, never shown.                             your model can recognize
    Verified → typed event +                            genuine follow-ups later.
    impression billing fires.
```

- **01 — Contextual matching, not a model call.** `decide()` runs session
  state, a deterministic sensitive-topic safety gate, then semantic
  relevance matching against advertiser copy. No round trip to an LLM to
  decide whether to serve.
- **02 — Publisher-controlled placement.** The sponsored fragment lands in
  *your* system prompt with instructions to use it verbatim, inside
  `⟦ad:ID:NONCE⟧...⟦/ad⟧` markers, only if it fits naturally — or skip it
  entirely.
- **03 — Zero user friction.** Nothing changes in your product's UI. The ad
  arrives as a normal turn of your own model's own voice.
- **04 — Fail-closed verification.** The scanner checks id, nonce, and exact
  copy against what was actually approved. Anything else is discarded before
  it reaches the user — no forged or malformed ad ever renders.
- **05 — Judgment-driven follow-ups.** Later questions about a shown ad
  ("is it free?") are the model's own call, answered strictly from
  sponsor-approved facts — never invented, never guessed.

---

## What's in this repo

| Path | What it is |
|---|---|
| [`server/js`](server/js) | TypeScript SDK — `decide`, `augmentSystemPrompt`, `stream`, `rewriteHistory` |
| [`server/python`](server/python) | Python SDK — same protocol, async/await |
| [`skills/ad-injection`](skills/ad-injection/SKILL.md) | Agent skill: when/how to serve, hard never-serve list, invisibility rule |
| [`.mcp.json`](.mcp.json) | MCP server config (`monetzly-ads`) — `fetch_ad`, `get_ad_facts`, `report_ad_shown`, `report_ad_followup` |
| [`.claude-plugin`](.claude-plugin) / [`.codex-plugin`](.codex-plugin) | Installable plugin bundling the MCP server + skill for Claude Code / Codex CLI |

Pick your integration path:

- **Calling an LLM yourself?** Use the [JS](server/js) or [Python](server/python) SDK directly — no infrastructure changes beyond one dependency.
- **Building on an MCP-capable agent host?** Install the `monetzly-ads` plugin and skip the SDK entirely.

---

## Quick start — SDK

<table>
<tr><td>

**TypeScript**

```typescript
import { v2 } from "@monetzly/server-sdk";

const mz = new v2.Monetzly({
  apiKey: "...",
  baseUrl: "https://api.monetzly.com/api/v2",
});
const session = mz.session(conversationId);

const decision = await session.decide(userMessage);
const systemPrompt = session.augmentSystemPrompt(basePrompt, decision);

for await (const event of session.stream(
  modelTokenStream(systemPrompt),
  decision
)) {
  if (event.t === "tok") process.stdout.write(event.text);
  else console.log(`\n[Sponsored] ${event.ad.brand}: ${event.ad.approvedCopy}`);
}

const storedText = session.rewriteHistory(rawModelText);
```

```bash
npm install @monetzly/server-sdk
```

</td><td>

**Python**

```python
from monetzly.v2 import Monetzly

mz = Monetzly(
    api_key="...",
    base_url="https://api.monetzly.com/api/v2",
)
session = mz.session(session_id=conversation_id)

decision = await session.decide(user_message)
system_prompt = session.augment_system_prompt(base_prompt, decision)

async for event in session.stream(
    model_token_stream(system_prompt), decision
):
    if event.t == "tok":
        print(event.text, end="")
    else:
        print(f"\n[Sponsored] {event.ad.brand}: {event.ad.approved_copy}")

stored_text = session.rewrite_history(raw_model_text)
```

```bash
pip install monetzly-sdk
```

</td></tr>
</table>

Runnable end-to-end examples against Gemini:
[`server/js/examples/v2_native_example.ts`](server/js/examples/v2_native_example.ts) ·
[`server/python/examples/v2_native_example.py`](server/python/examples/v2_native_example.py)

---

## Quick start — agent plugin (no SDK required)

```bash
# Claude Code
/plugin marketplace add monetzly/monetzly-sdks
/plugin install monetzly-ads@monetzly

# Codex CLI
codex plugin marketplace add monetzly/monetzly-sdks
codex plugin add monetzly-ads
```

This installs a hosted streamable-HTTP MCP server plus the
[`ad-injection`](skills/ad-injection/SKILL.md) skill in one step — nothing to
`npm install` or run locally.

- **Claude Code** prompts once for your Monetzly API key at install time
  (`secret: true`), stores it securely, and pre-approves the four
  `monetzly-ads` tools via a `PreToolUse` hook — no plaintext config, no
  permission interruptions during ad serving.
- **Codex CLI**: export the key yourself before adding the server —
  `export MONETZLY_API_KEY=your-key-here` — Codex reads it via
  `bearer_token_env_var` in `.mcp.json` and attaches it automatically.

---

## The rules every integration follows

1. **Verbatim or nothing.** Approved ad copy is reproduced exactly inside
   `⟦ad:ID:NONCE⟧...⟦/ad⟧` markers, or omitted entirely if it doesn't fit
   naturally. No paraphrasing, no partial copy, no invented claims.
2. **Fail-closed scanning.** Anything malformed, forged, or unclosed in the
   marker stream never reaches the user.
3. **Invisible machinery.** The ad decision process — whether one was
   checked, served, or skipped — is never narrated to the user. A
   conversation with zero ads is a perfectly good outcome.
4. **Organic answer first, always.** The reply must be fully helpful with
   the ad removed. The sponsor is an addition, never a substitution for a
   genuine recommendation.
5. **Hard never-serve list.** No ads during emotional or vulnerable moments,
   medical/mental-health/legal-crisis/financial-distress topics, or when the
   apparent user is a child. When in doubt, skip.
6. **Judgment-driven follow-ups.** The model decides whether a later message
   is really about a previously shown ad, and answers strictly from
   sponsor-approved facts — never invented pricing or guarantees.

Full agent-facing contract: [`skills/ad-injection/SKILL.md`](skills/ad-injection/SKILL.md)

---

## Who it's for

Chatbots · copilots · voice agents · AI search products — anything where an
LLM is already generating the reply and a relevant, well-timed suggestion
would feel like help, not an interruption.

## Development

```bash
# JS
cd server/js && npm install && npm run test:v2 && npm run build

# Python
cd server/python && pip install -e ".[dev]" && pytest tests/v2
```

---

<div align="center">

**monetzly.com** · monetization for AI-native apps, without breaking trust

</div>
