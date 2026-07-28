/**
 * Stream scanner for Mode B native ad markers.
 * Mirrors monetzly/v2/scanner.py — fail-closed: marker-shaped content that
 * does not verify is discarded and never reaches the caller as text.
 */
import { AdEvent, CLOSE_MARKER, Decision, StreamEvent, TokenEvent } from "./types.js";
import { verifyBlock } from "./verifier.js";

export const GENERIC_OPEN = "⟦ad:";
export const MAX_HOLDBACK = 64;

/** Length of the longest suffix of `text` that is a prefix of `pattern`. */
function longestSuffixPrefix(text: string, pattern: string): number {
  const maxLen = Math.min(text.length, pattern.length - 1);
  for (let len = maxLen; len > 0; len--) {
    if (text.slice(-len) === pattern.slice(0, len)) return len;
  }
  return 0;
}

/**
 * Scans one model response stream. Single-use.
 * decision=null (skip turn) still strips marker-shaped blocks defensively.
 */
export class StreamScanner {
  private emittedChars = 0;
  private adEmitted = false;
  private verified: Decision["ad"] | null = null;

  constructor(private readonly decision: Decision | null) {}

  get adWasEmitted(): boolean {
    return this.adEmitted;
  }

  get verifiedAd(): Decision["ad"] | null {
    return this.verified;
  }

  async *scan(stream: AsyncIterable<string>): AsyncGenerator<StreamEvent> {
    let buffer = "";
    let adBuffer = "";
    let inAd = false;
    const openLen = GENERIC_OPEN.length;
    const maxAdBuffer = this.decision
      ? Math.max(2 * this.decision.ad.approvedCopy.length + openLen + 64, 512)
      : 4096;

    for await (const chunk of stream) {
      if (!chunk) continue;

      if (inAd) {
        adBuffer += chunk;
        const closeIdx = adBuffer.indexOf(CLOSE_MARKER);
        if (closeIdx !== -1) {
          const block = adBuffer.slice(0, closeIdx);
          const remainder = adBuffer.slice(closeIdx + CLOSE_MARKER.length);
          adBuffer = "";
          inAd = false;
          const event = this.finishBlock(block);
          if (event) yield event;
          buffer = remainder;
        } else if (adBuffer.length > maxAdBuffer) {
          console.warn(
            `monetzly: ad block overflow (${adBuffer.length} chars) — discarding`,
          );
          adBuffer = "";
          inAd = false;
          continue;
        } else {
          continue;
        }
      } else {
        buffer += chunk;
      }

      // PASS state: emit everything except a possible marker-prefix tail.
      for (;;) {
        const openIdx = buffer.indexOf(GENERIC_OPEN);
        if (openIdx !== -1) {
          if (openIdx > 0) yield this.tok(buffer.slice(0, openIdx));
          adBuffer = buffer.slice(openIdx + openLen);
          buffer = "";
          inAd = true;
          const closeIdx = adBuffer.indexOf(CLOSE_MARKER);
          if (closeIdx !== -1) {
            const block = adBuffer.slice(0, closeIdx);
            const remainder = adBuffer.slice(closeIdx + CLOSE_MARKER.length);
            adBuffer = "";
            inAd = false;
            const event = this.finishBlock(block);
            if (event) yield event;
            buffer = remainder;
            continue; // remainder may contain another marker
          }
          break;
        }

        let hold = longestSuffixPrefix(buffer, GENERIC_OPEN);
        hold = Math.min(hold, MAX_HOLDBACK);
        if (buffer.length > hold) {
          yield this.tok(buffer.slice(0, buffer.length - hold));
          buffer = buffer.slice(buffer.length - hold);
        }
        break;
      }
    }

    // EOF
    if (inAd && adBuffer) {
      console.warn(
        `monetzly: stream ended inside ad block — discarding ${adBuffer.length} chars`,
      );
    } else if (buffer) {
      // A held-back prefix that never became a marker is real text.
      yield this.tok(buffer);
    }
  }

  private tok(text: string): TokenEvent {
    this.emittedChars += text.length;
    return { t: "tok", text };
  }

  private finishBlock(block: string): AdEvent | null {
    if (this.adEmitted) {
      console.warn("monetzly: second ad block in one response — discarding");
      return null;
    }
    const result = verifyBlock(block, this.decision, this.emittedChars);
    if (!result.ok) {
      console.warn(
        `monetzly: ad block failed verification (${result.reason}) — discarding`,
      );
      return null;
    }
    this.adEmitted = true;
    this.verified = this.decision!.ad;
    return { t: "ad", ad: this.decision!.ad, nonce: this.decision!.nonce };
  }
}
