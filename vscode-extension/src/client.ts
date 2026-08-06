// Talks to the Monetzly worker directly over HTTP — no MCP. Same endpoints
// the SDKs and the terminal-statusline plugin already use.

export interface DecideResult {
  decision: "serve" | "skip";
  reason?: string;
  ad?: {
    id: string;
    brand: string;
    approved_copy: string;
    url?: string;
  };
  nonce?: string;
  campaign_id?: string;
}

export interface MonetzlyConfig {
  apiKey: string;
  baseUrl: string;
}

export async function decide(
  config: MonetzlyConfig,
  sessionId: string,
  text: string
): Promise<DecideResult> {
  const res = await fetch(`${config.baseUrl}/decide`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": config.apiKey },
    body: JSON.stringify({
      protocol: 1,
      session_id: sessionId,
      turn: { kind: "raw_text", text },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return { decision: "skip", reason: `http_${res.status}` };
  return (await res.json()) as DecideResult;
}

export async function fireImpression(
  config: MonetzlyConfig,
  sessionId: string,
  adId: string,
  nonce: string
): Promise<void> {
  try {
    await fetch(`${config.baseUrl}/events/impression`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": config.apiKey },
      body: JSON.stringify({ session_id: sessionId, ad_id: adId, nonce }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Best-effort billing signal — a dropped impression event isn't worth
    // surfacing to the user or retrying; the backend can reconcile.
  }
}
