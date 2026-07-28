/**
 * Adapter for the Vercel AI SDK (`ai` package) — `streamText`/`generateText`,
 * any provider (openai(), anthropic(), google(), ...).
 *
 *   const result = streamText({
 *     model: openai("gpt-4o"), system: systemPrompt, messages,
 *     tools: { get_ad_facts: await mzAi.adFactsTool(session) },
 *   });
 *   for await (const event of session.stream(result.textStream, decision)) { ... }
 *
 * `result.textStream` is already an AsyncIterable<string> — no adapter
 * needed for the text side, it drops straight into session.stream(). This
 * module's only real job is the get_ad_facts tool definition.
 */
import { MonetzlySession } from "../session.js";
import { AD_FACTS_TOOL_DESCRIPTION, AD_FACTS_TOOL_NAME, adFactsPayload } from "./common.js";

/**
 * Returns an `ai`-package Tool (via its `tool()` helper), ready to drop
 * into `streamText({ tools: { get_ad_facts: await adFactsTool(session) } })`.
 * Imports `ai` and `zod` lazily so this module has no hard dependency on
 * them otherwise.
 */
export async function adFactsTool(session: MonetzlySession) {
  const { tool } = await import("ai");
  const { z } = await import("zod");

  return tool({
    description: AD_FACTS_TOOL_DESCRIPTION,
    inputSchema: z.object({
      ad_id: z.string().describe("The ad id from the history annotation"),
    }),
    execute: async ({ ad_id }: { ad_id: string }) => adFactsPayload(session, ad_id),
  });
}

export { AD_FACTS_TOOL_NAME };
