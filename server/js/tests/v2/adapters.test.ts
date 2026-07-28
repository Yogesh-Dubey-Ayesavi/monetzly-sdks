/**
 * Adapter tests: each provider's toTextStream() against a minimal fake of
 * that provider's chunk shape (no real SDK installed as a runtime
 * dependency — adapters use structural typing on purpose).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import * as anthropic from "../../src/v2/adapters/anthropic.js";
import * as googleGenai from "../../src/v2/adapters/googleGenai.js";
import * as openai from "../../src/v2/adapters/openai.js";

async function collect(stream: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const chunk of stream) out.push(chunk);
  return out;
}

async function* aiter<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item;
}

test("openai adapter: text deltas only", async () => {
  const chunks = aiter([
    { choices: [{ delta: { content: "Hel" } }] },
    { choices: [{ delta: { content: "lo" } }] },
    { choices: [{ delta: { content: null } }] },
  ]);
  assert.deepEqual(await collect(openai.toTextStream(chunks)), ["Hel", "lo"]);
});

test("anthropic adapter: text_delta only", async () => {
  const events = aiter([
    { type: "content_block_start" },
    { type: "content_block_delta", delta: { type: "text_delta", text: "Hi" } },
    { type: "content_block_delta", delta: { type: "input_json_delta" } },
  ]);
  assert.deepEqual(await collect(anthropic.toTextStream(events)), ["Hi"]);
});

test("googleGenai adapter: text parts only", async () => {
  const chunks = aiter([
    {
      candidates: [
        {
          content: {
            parts: [
              { text: "Hi" },
              { functionCall: { name: "get_ad_facts" } },
            ],
          },
        },
      ],
    },
  ]);
  assert.deepEqual(await collect(googleGenai.toTextStream(chunks)), ["Hi"]);
});

test("openai adapter: handleToolCall shapes no-facts payload", async () => {
  const session = { facts: async (_adId: string) => [] } as any;
  const payload = await openai.handleToolCall(session, {
    function: { name: "get_ad_facts", arguments: '{"ad_id":"42"}' },
  });
  assert.deepEqual(payload, { facts: [], note: "no approved facts for this ad" });
});
