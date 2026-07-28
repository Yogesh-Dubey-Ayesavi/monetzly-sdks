/**
 * HTTP client for the /api/v2 platform endpoints (native fetch, Node 18+).
 * Every network failure degrades to skip/no-op — the developer's chat stream
 * must never break because of the ad platform.
 */
import { Decision, Fact } from "./types.js";

export interface AdsClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export class AdsClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(options: AdsClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "https://api.monetzly.com/v2").replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 3000;
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const init: RequestInit = {
      method,
      headers: {
        "X-API-Key": this.apiKey,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    return fetch(`${this.baseUrl}${path}`, init);
  }

  async decide(
    sessionId: string,
    text: string,
    turnIndex?: number,
  ): Promise<Decision | null> {
    try {
      const payload: Record<string, unknown> = {
        protocol: 1,
        session_id: sessionId,
        turn: { kind: "raw_text", text },
      };
      if (turnIndex !== undefined) payload["context"] = { turn_index: turnIndex };
      const response = await this.request("POST", "/decide", payload);
      if (!response.ok) return null;
      return Decision.fromResponse(await response.json());
    } catch (e) {
      console.warn(`monetzly: decide() failed, treating as skip: ${e}`);
      return null;
    }
  }

  async reportImpression(
    nonce: string,
    adId: string,
    sessionId: string,
  ): Promise<boolean> {
    try {
      const response = await this.request("POST", "/events/impression", {
        nonce,
        ad_id: adId,
        session_id: sessionId,
      });
      return response.ok;
    } catch (e) {
      console.warn(`monetzly: impression report failed: ${e}`);
      return false;
    }
  }

  async reportEngagement(
    adId: string,
    sessionId: string,
    turnIndex?: number,
  ): Promise<boolean> {
    try {
      const payload: Record<string, unknown> = {
        ad_id: adId,
        session_id: sessionId,
      };
      if (turnIndex !== undefined) payload["turn_index"] = turnIndex;
      const response = await this.request("POST", "/events/engagement", payload);
      return response.ok;
    } catch (e) {
      console.warn(`monetzly: engagement report failed: ${e}`);
      return false;
    }
  }

  async getFacts(adId: string): Promise<Fact[]> {
    try {
      const response = await this.request("GET", `/ads/${adId}/facts`);
      if (!response.ok) return [];
      const data = (await response.json()) as {
        approved_facts?: Array<{ claim: string; source_url?: string }>;
      };
      return (data.approved_facts ?? []).map((f) => {
        const fact: Fact = { claim: f.claim };
        if (f.source_url) fact.sourceUrl = f.source_url;
        return fact;
      });
    } catch (e) {
      console.warn(`monetzly: facts fetch failed: ${e}`);
      return [];
    }
  }
}
