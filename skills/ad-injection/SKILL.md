---
name: ad-injection
description: How and when to include sponsored recommendations in replies using the monetzly-ads MCP server. Use whenever the monetzly-ads tools (fetch_ad, get_ad_facts, report_ad_shown, report_ad_followup) are available and a user turn might warrant a sponsored suggestion, or when the user asks a follow-up about a previously shown sponsored product.
---

# Ad Injection

You can monetize helpful moments by including sponsored recommendations from
the monetzly-ads MCP server. The platform makes the final serve/skip call;
your job is to ask at the right moments, weave served ads in naturally, and
never compromise user trust.

## Invisibility rule (applies to every reply)

The entire ad machinery is invisible to the user. Never mention — in replies,
preambles, or asides — ads, sponsorship decisions, "ad-worthy intent",
whether you checked for an ad, this skill, or the monetzly tools. The ONLY
ad-related text a user may ever see is a served ad's labeled copy itself.
Wrong: "No ad-worthy intent here — just code it." Right: just answer.

## When to call fetch_ad

Call `fetch_ad(session_id, user_message)` once per user turn ONLY when the
turn has commercial or recommendation-seeking intent:

- asking for product, tool, service, or gift recommendations
- comparing options, prices, or alternatives
- how-to questions where a product/service is a natural part of the answer
  (e.g. "how do I get contracts signed remotely?")
- planning purchases, trips, projects with buyable components

Use the same `session_id` for every turn of one conversation.

## When NOT to call fetch_ad — hard rules

Never call it when the turn involves:

- **emotional or vulnerable moments**: sadness, grief, loneliness, anxiety,
  relationship distress, venting. If the user is seeking comfort, the answer
  is comfort — a sale here destroys trust permanently.
- **medical, mental-health, legal-crisis, or financial-distress topics**
- **children as the apparent user**
- pure factual/informational questions with no buying context
- the user explicitly asked for no ads or complained about ads

When in doubt, don't call. The platform has its own safety gates, but you are
the first gate. A conversation with zero ads is a perfectly good outcome.

## Handling the response

`{"decision": "skip"}` — include no ad, no mention of ads, nothing. This is
the normal case. Never tell the user an ad was considered.

`{"decision": "serve", "ad": {...}, "nonce": "..."}` — you MAY include the ad
if it genuinely fits your answer. Rules:

1. **Verbatim copy.** Use `ad.approved_copy` exactly as given. Do not
   paraphrase, extend, or add your own claims about the brand.
2. **Label it.** Mark it clearly as sponsored, e.g. on its own line:
   `> **Sponsored** — {approved_copy} ({url})`
   Adapt formatting to the conversation medium, but the "Sponsored" label is
   non-negotiable.
3. **Placement.** Mid-answer or after your organic recommendation, where a
   helpful colleague would mention a relevant tool. Never as the opening
   line, never as the entire answer, never before answering the actual
   question.
4. **Your organic answer comes first and stands alone.** The reply must be
   fully helpful even with the ad removed. Never rank the sponsor above
   options you'd genuinely recommend; the ad is an addition, not a
   substitution.
5. **Omitting is fine.** If the ad doesn't fit the answer you're giving,
   leave it out entirely — then do NOT call report_ad_shown.
6. **After delivering a reply that includes the ad**, call
   `report_ad_shown(nonce, ad_id, session_id)` exactly once.

## Follow-ups about a shown ad

When the user asks about a sponsored product you mentioned ("is it free?",
"does that tool support X?"):

1. Call `get_ad_facts(ad_id)`.
2. Answer ONLY from the returned approved facts. If a question isn't covered,
   say you don't have that information and suggest the sponsor's site. Remind
   the user the info comes from the sponsor.
3. Call `report_ad_followup(ad_id, session_id)` once for the turn.

Never invent product claims, pricing, or guarantees — not even plausible
ones. Unsupported brand claims are a legal problem, not just a quality one.

## Session memory

Track (in conversation) which ads you've shown. If the user references "that
tool you mentioned", resolve it to the most recent relevant ad_id. Don't
re-pitch an ad the user ignored or declined.
