/**
 * Adapter for the `@anthropic-ai/sdk` npm package.
 *
 *   const stream = await client.messages.create({
 *     model: "claude-sonnet-5-...", messages, max_tokens: 1024,
 *     stream: true, tools: [mzAnthropic.AD_FACTS_TOOL],
 *   });
 *   for await (const event of session.stream(mzAnthropic.toTextStream(stream), decision)) { ... }
 *
 * If you're using `client.messages.stream(...)` (the helper, not raw
 * `create({stream: true})`), it already exposes a `.textStream` async
 * iterable — use that directly and skip toTextStream here (handleToolUse
 * below still applies either way).
 */
import { MonetzlySession } from "../session.js";
import {
  AD_FACTS_PARAMETERS,
  AD_FACTS_TOOL_DESCRIPTION,
  AD_FACTS_TOOL_NAME,
  adFactsPayload,
} from "./common.js";

export const AD_FACTS_TOOL = {
  name: AD_FACTS_TOOL_NAME,
  description: AD_FACTS_TOOL_DESCRIPTION,
  input_schema: AD_FACTS_PARAMETERS,
} as const;

interface AnthropicStreamEvent {
  type: string;
  delta?: { type?: string; text?: string };
}

/** stream: the raw async iterable from `client.messages.create({..., stream: true})`. */
export async function* toTextStream(
  stream: AsyncIterable<AnthropicStreamEvent>,
): AsyncGenerator<string> {
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
      if (event.delta.text) yield event.delta.text;
    }
  }
}

interface AnthropicToolUseBlock {
  input?: { ad_id?: string };
}

/**
 * block: a ToolUseBlock with name === 'get_ad_facts'. Returns the payload
 * to wrap in a {type: "tool_result", tool_use_id, content: JSON.stringify(...)} block.
 */
export async function handleToolUse(
  session: MonetzlySession,
  block: AnthropicToolUseBlock,
): Promise<Record<string, unknown>> {
  return adFactsPayload(session, block.input?.ad_id ?? "");
}
