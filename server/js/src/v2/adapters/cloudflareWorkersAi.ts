/**
 * Adapter for Cloudflare Workers AI (`env.AI.run(...)`), for Workers apps
 * calling models directly through the binding instead of an OpenAI-compat
 * HTTP endpoint (which would just use the openai.ts adapter).
 *
 *   const stream = await env.AI.run(
 *     "@cf/meta/llama-3.1-8b-instruct",
 *     { messages, stream: true },
 *   );
 *   for await (const event of session.stream(mzCfAi.toTextStream(stream), decision)) { ... }
 *
 * `env.AI.run(..., {stream: true})` returns a ReadableStream of
 * text/event-stream bytes, each event an OpenAI-shaped chunk
 * (`{"response": "..."}` for most Workers AI text models, sometimes the
 * fuller `choices[0].delta.content` shape for OpenAI-compat models) — this
 * adapter handles both.
 */

interface WorkersAiChunkPayload {
  response?: string;
  choices?: Array<{ delta?: { content?: string } }>;
}

function extractText(payload: WorkersAiChunkPayload): string | undefined {
  if (payload.response) return payload.response;
  return payload.choices?.[0]?.delta?.content ?? undefined;
}

/** stream: the ReadableStream<Uint8Array> returned by `env.AI.run(..., {stream: true})`. */
export async function* toTextStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        try {
          const text = extractText(JSON.parse(data) as WorkersAiChunkPayload);
          if (text) yield text;
        } catch {
          // partial/malformed SSE frame — skip it, never surface to the user
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
