/**
 * Adapter for LangChain.js chat models (ChatOpenAI, ChatAnthropic,
 * ChatGoogleGenerativeAI, ...) — anything exposing `.stream()` and yielding
 * AIMessageChunk. Provider-agnostic: swap the underlying chat model
 * without touching this adapter.
 *
 *   const llm = new ChatOpenAI({ model: "gpt-4o" }).bindTools([
 *     mzLangchain.makeAdFactsTool(session),
 *   ]);
 *   const chunks = await llm.stream(messages);
 *   for await (const event of session.stream(mzLangchain.toTextStream(chunks), decision)) { ... }
 */
import { MonetzlySession } from "../session.js";
import { AD_FACTS_TOOL_DESCRIPTION, AD_FACTS_TOOL_NAME, adFactsPayload } from "./common.js";

interface AIMessageChunkLike {
  content: string | Array<{ type?: string; text?: string }>;
}

/**
 * chunks: the async iterable from `llm.stream(messages)`. Yields text
 * content off each AIMessageChunk (string content, or the "text" parts of
 * multimodal content arrays); chunks carrying only tool_call_chunks are
 * skipped.
 */
export async function* toTextStream(
  chunks: AsyncIterable<AIMessageChunkLike>,
): AsyncGenerator<string> {
  for await (const chunk of chunks) {
    const { content } = chunk;
    if (typeof content === "string") {
      if (content) yield content;
    } else if (Array.isArray(content)) {
      for (const part of content) {
        if (part.type === "text" && part.text) yield part.text;
      }
    }
  }
}

/**
 * Returns a LangChain DynamicStructuredTool, bindable via
 * `llm.bindTools([makeAdFactsTool(session)])`. Imports @langchain/core and
 * zod lazily so this module has no hard dependency on them otherwise.
 */
export async function makeAdFactsTool(session: MonetzlySession) {
  const { tool } = await import("@langchain/core/tools");
  const { z } = await import("zod");

  return tool(
    async ({ ad_id }: { ad_id: string }) => JSON.stringify(await adFactsPayload(session, ad_id)),
    {
      name: AD_FACTS_TOOL_NAME,
      description: AD_FACTS_TOOL_DESCRIPTION,
      schema: z.object({
        ad_id: z.string().describe("The ad id from the history annotation"),
      }),
    },
  );
}
