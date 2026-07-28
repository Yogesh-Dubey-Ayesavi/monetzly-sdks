/**
 * Adapter for the `@google/genai` npm package (Gemini).
 *
 *   const stream = await client.models.generateContentStream({
 *     model: MODEL, contents,
 *     config: { systemInstruction: systemPrompt, tools: [mzGenai.AD_FACTS_TOOL] },
 *   });
 *   for await (const event of session.stream(mzGenai.toTextStream(stream), decision)) { ... }
 */
import { MonetzlySession } from "../session.js";
import {
  AD_FACTS_PARAMETERS,
  AD_FACTS_TOOL_DESCRIPTION,
  AD_FACTS_TOOL_NAME,
  adFactsPayload,
} from "./common.js";

/** google/genai's Tool shape — plain object, no SDK types required. */
export const AD_FACTS_TOOL = {
  functionDeclarations: [
    {
      name: AD_FACTS_TOOL_NAME,
      description: AD_FACTS_TOOL_DESCRIPTION,
      parameters: AD_FACTS_PARAMETERS,
    },
  ],
};

interface GenaiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
}
interface GenaiChunk {
  candidates?: Array<{ content?: { parts?: GenaiPart[] } }>;
}

/**
 * chunks: the async iterable from `client.models.generateContentStream(...)`.
 * functionCall parts are skipped — read `chunk.candidates[0].content.parts`
 * yourself for those (a part carries exactly one of .text or .functionCall).
 */
export async function* toTextStream(
  chunks: AsyncIterable<GenaiChunk>,
): AsyncGenerator<string> {
  for await (const chunk of chunks) {
    for (const candidate of chunk.candidates ?? []) {
      for (const part of candidate.content?.parts ?? []) {
        if (part.text) yield part.text;
      }
    }
  }
}

/** functionCall: a genai FunctionCall with name === 'get_ad_facts'. */
export async function handleFunctionCall(
  session: MonetzlySession,
  functionCall: { args?: Record<string, unknown> },
): Promise<Record<string, unknown>> {
  const adId = (functionCall.args?.ad_id as string | undefined) ?? "";
  return adFactsPayload(session, adId);
}
