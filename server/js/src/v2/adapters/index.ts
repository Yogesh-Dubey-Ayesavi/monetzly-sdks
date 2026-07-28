/**
 * Provider adapters: turn a chat SDK's raw stream into the plain
 * AsyncIterable<string> that MonetzlySession.stream() expects, plus a
 * get_ad_facts tool definition in that provider's native tool format.
 *
 * Each submodule imports its provider SDK lazily where one is needed
 * (langchain.ts, vercelAi.ts) — installing @monetzly/server-sdk does not
 * pull in openai/@anthropic-ai/sdk/langchain/ai/@google/genai.
 */
export * as anthropic from "./anthropic.js";
export * as cloudflareWorkersAi from "./cloudflareWorkersAi.js";
export * as googleGenai from "./googleGenai.js";
export * as langchain from "./langchain.js";
export * as openai from "./openai.js";
export * as vercelAi from "./vercelAi.js";
