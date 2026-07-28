/**
 * monetzly v2 types mirroring the /api/v2 wire schemas.
 */

export interface Fact {
  claim: string;
  sourceUrl?: string;
}

export interface Ad {
  id: string;
  brand: string;
  approvedCopy: string;
  url?: string;
  category?: string;
  facts: Fact[];
}

export const CLOSE_MARKER = "⟦/ad⟧";

export class Decision {
  constructor(
    public readonly ad: Ad,
    public readonly nonce: string,
    public readonly mode: string = "native",
    public readonly expiresIn: number = 600,
  ) {}

  get openMarker(): string {
    return `⟦ad:${this.ad.id}:${this.nonce}⟧`;
  }

  /** Parses a /decide response body; returns null for skip turns. */
  static fromResponse(data: Record<string, unknown> | null): Decision | null {
    if (!data || data["decision"] !== "serve") return null;
    const ad = data["ad"] as Record<string, unknown>;
    const facts = ((ad["facts"] as Array<Record<string, unknown>>) ?? []).map(
      (f) => {
        const fact: Fact = { claim: String(f["claim"]) };
        if (f["source_url"]) fact.sourceUrl = String(f["source_url"]);
        return fact;
      },
    );
    const parsed: Ad = {
      id: String(ad["id"]),
      brand: String(ad["brand"]),
      approvedCopy: String(ad["approved_copy"]),
      facts,
    };
    if (ad["url"]) parsed.url = String(ad["url"]);
    if (ad["category"]) parsed.category = String(ad["category"]);
    return new Decision(
      parsed,
      String(data["nonce"]),
      String(data["mode"] ?? "native"),
      Number(data["expires_in"] ?? 600),
    );
  }
}

export interface TokenEvent {
  t: "tok";
  text: string;
}

export interface AdEvent {
  t: "ad";
  ad: Ad;
  nonce: string;
}

export type StreamEvent = TokenEvent | AdEvent;

/**
 * Reconstructs the ⟦ad:ID:NONCE⟧copy⟦/ad⟧ wire marker an AdEvent was
 * scanned from — for callers accumulating raw text for rewriteHistory().
 */
export function rawMarker(event: AdEvent): string {
  return `⟦ad:${event.ad.id}:${event.nonce}⟧${event.ad.approvedCopy}⟦/ad⟧`;
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
}

/** Wire helpers matching the Python SDK's NDJSON/SSE event format. */
export function eventToWire(event: StreamEvent): Record<string, unknown> {
  if (event.t === "tok") return { t: "tok", v: event.text };
  return {
    t: "ad",
    ad: {
      id: event.ad.id,
      brand: event.ad.brand,
      copy: event.ad.approvedCopy,
      url: event.ad.url ?? null,
    },
    nonce: event.nonce,
  };
}
