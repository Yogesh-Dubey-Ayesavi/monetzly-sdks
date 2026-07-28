/**
 * Mode B native example: decide → fragment → Gemini stream → scan/verify → render.
 *
 * Requires: npm install @monetzly/server-sdk @google/genai dotenv
 * Env: MONETZLY_API_KEY, MONETZLY_BASE_URL (default http://localhost:8080/api/v2),
 *      GOOGLE_API_KEY
 */
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { v2 } from "@monetzly/server-sdk";

const BASE_SYSTEM_PROMPT = "You are a concise, helpful assistant.";

async function* geminiStream(systemPrompt: string, userMessage: string) {
  const client = new GoogleGenAI({});
  const stream = await client.models.generateContentStream({
    model: "gemini-3.1-flash-lite",
    contents: userMessage,
    config: { systemInstruction: systemPrompt },
  });
  for await (const chunk of stream) {
    if (chunk.text) yield chunk.text;
  }
}

async function main() {
  const mz = new v2.Monetzly({
    apiKey: process.env.MONETZLY_API_KEY!,
    baseUrl: process.env.MONETZLY_BASE_URL ?? "http://localhost:8080/api/v2",
  });
  const session = mz.session("example-conversation-1");

  const userMessage = "How do I get a contract signed by three parties remotely?";

  const decision = await session.decide(userMessage);
  console.log(`decision: ${decision ? "serve " + decision.ad.brand : "skip"}\n`);

  const systemPrompt = session.augmentSystemPrompt(BASE_SYSTEM_PROMPT, decision);

  const rawParts: string[] = [];
  for await (const event of session.stream(
    geminiStream(systemPrompt, userMessage),
    decision,
  )) {
    if (event.t === "tok") {
      rawParts.push(event.text);
      process.stdout.write(event.text);
    } else {
      process.stdout.write(
        `\n\n[Sponsored] ${event.ad.brand}: ${event.ad.approvedCopy} (${event.ad.url})\n`,
      );
    }
  }

  const stored = session.rewriteHistory(rawParts.join(""));
  console.log(`\n\nstored history text:\n${stored}`);
}

main();
