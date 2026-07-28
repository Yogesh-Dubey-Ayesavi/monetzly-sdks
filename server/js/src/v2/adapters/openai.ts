/**
 * Adapter for the `openai` npm SDK — and any OpenAI-compatible endpoint
 * using that same client (Azure OpenAI, Groq, Together, vLLM/Ollama's
 * OpenAI-compatible server, Cloudflare Workers AI's /v1/chat/completions).
 * Chunk shape is identical across all of them, so one adapter covers all.
 *
 *   import OpenAI from "openai";
 *   import * as mzOpenai from "@monetzly/server-sdk/v2/adapters/openai";
 *
 *   const stream = await client.chat.completions.create({
 *     model: "gpt-4o", messages, stream: true,
 *     tools: [mzOpenai.AD_FACTS_TOOL],
 *   });
 *   for await (const event of session.stream(mzOpenai.toTextStream(stream), decision)) { ... }
 */
import { MonetzlySession } from "../session.js";
import {
  AD_FACTS_PARAMETERS,
  AD_FACTS_TOOL_DESCRIPTION,
  AD_FACTS_TOOL_NAME,
  adFactsPayload,
} from "./common.js";

export const AD_FACTS_TOOL = {
  type: "function",
  function: {
    name: AD_FACTS_TOOL_NAME,
    description: AD_FACTS_TOOL_DESCRIPTION,
    parameters: AD_FACTS_PARAMETERS,
  },
} as const;

/** Structural type: matches openai's ChatCompletionChunk shape without a hard dependency. */
interface OpenAIChunk {
  choices?: Array<{ delta?: { content?: string | null } }>;
}

/**
 * chunks: the async iterable from `client.chat.completions.create({...,
 * stream: true})`. Yields text deltas only — tool-call deltas are left for
 * you to read off the raw stream if you need them mid-stream.
 */
export async function* toTextStream(
  chunks: AsyncIterable<OpenAIChunk>,
): AsyncGenerator<string> {
  for await (const chunk of chunks) {
    for (const choice of chunk.choices ?? []) {
      const text = choice.delta?.content;
      if (text) yield text;
    }
  }
}

interface OpenAIToolCall {
  function: { name: string; arguments: string };
}

/**
 * toolCall: an accumulated tool call whose function.name is
 * 'get_ad_facts'. Returns the payload to JSON.stringify() into a
 * role: "tool" message.
 */
export async function handleToolCall(
  session: MonetzlySession,
  toolCall: OpenAIToolCall,
): Promise<Record<string, unknown>> {
  const args = JSON.parse(toolCall.function.arguments) as { ad_id?: string };
  return adFactsPayload(session, args.ad_id ?? "");
}
