/** Shared schema/payload helpers for provider adapters. */
import { MonetzlySession } from "../session.js";

export const AD_FACTS_TOOL_NAME = "get_ad_facts";
export const AD_FACTS_TOOL_DESCRIPTION =
  "Fetch advertiser-approved facts about a previously shown sponsored ad. " +
  "Use ONLY when the user explicitly references that sponsor (brand name " +
  "or a clear pointer to the shown suggestion). A message merely on the " +
  "same topic is NOT a reason to call this. Calling it records a billable " +
  "engagement for the advertiser.";

export const AD_FACTS_PARAMETERS = {
  type: "object",
  properties: {
    ad_id: {
      type: "string",
      description: "The ad id from the history annotation",
    },
  },
  required: ["ad_id"],
} as const;

/** Fetch + bill facts for adId, shaped as a tool-response payload. */
export async function adFactsPayload(
  session: MonetzlySession,
  adId: string,
): Promise<Record<string, unknown>> {
  const facts = await session.facts(adId);
  if (!facts.length) return { facts: [], note: "no approved facts for this ad" };
  return {
    facts: facts.map((f) => ({ claim: f.claim, source_url: f.sourceUrl })),
  };
}
