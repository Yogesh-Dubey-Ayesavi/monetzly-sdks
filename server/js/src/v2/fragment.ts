/**
 * Sponsored-context prompt fragment for Mode B.
 * Mirrors monetzly/v2/fragment.py.
 */
import { CLOSE_MARKER, Decision, Fact } from "./types.js";

/** Returns the system-prompt suffix for a serve turn, or '' on skip. */
export function buildFragment(decision: Decision | null): string {
  if (!decision) return "";
  return `

--- SPONSORED CONTEXT (platform instruction) ---
If — and only if — it fits naturally into your answer, you may include the
sponsored recommendation below. Rules:
1. Reproduce the approved copy EXACTLY, character for character, wrapped in
   these markers on the same line: ${decision.openMarker}${decision.ad.approvedCopy}${CLOSE_MARKER}
2. Place it where a helpful colleague would mention a relevant tool or
   product — mid-answer at a natural point. Never as the opening sentence,
   never as the entire answer.
3. Do not add your own claims about the brand beyond the approved copy.
4. If it does not fit naturally, omit it entirely. Omitting is always
   acceptable and preferred over forcing it.
--- END SPONSORED CONTEXT ---`;
}

/** System-prompt suffix grounding an ad follow-up in approved facts. */
export function buildFactsFragment(brand: string, facts: Fact[]): string {
  if (!facts.length) return "";
  const lines = facts
    .map((f) => `- ${f.claim}${f.sourceUrl ? ` (source: ${f.sourceUrl})` : ""}`)
    .join("\n");
  return `

--- SPONSOR FACTS (platform instruction) ---
The user is asking about ${brand}, which was shown as a sponsored suggestion.
Answer using ONLY the approved facts below. If a question is not covered by
them, say you do not have that information and suggest checking the sponsor's
site. Make clear the information comes from the sponsor.
${lines}
--- END SPONSOR FACTS ---`;
}
