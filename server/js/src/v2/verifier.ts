/**
 * Verification of scanned ad blocks against the turn's decision.
 * Mirrors monetzly/v2/verifier.py.
 */
import { Decision, VerifyResult } from "./types.js";

/** Warn-only threshold: ad share of emitted text (telemetry, not a gate). */
export const MAX_AD_FRACTION = 0.6;

function normalize(text: string): string {
  return text.split(/\s+/).filter(Boolean).join(" ");
}

/**
 * @param block contents between '⟦ad:' and '⟦/ad⟧' — expected 'ID:NONCE⟧copy'
 * @param position chars of organic text emitted before this block
 */
export function verifyBlock(
  block: string,
  decision: Decision | null,
  position: number,
): VerifyResult {
  if (!decision) return { ok: false, reason: "no_decision" };

  const headerEnd = block.indexOf("⟧");
  if (headerEnd === -1) return { ok: false, reason: "malformed_header" };
  const header = block.slice(0, headerEnd);
  const inner = block.slice(headerEnd + 1);

  const parts = header.split(":");
  if (parts.length !== 2) return { ok: false, reason: "malformed_header" };
  const [adId, nonce] = parts;

  if (adId !== decision.ad.id) return { ok: false, reason: "wrong_ad_id" };
  if (nonce !== decision.nonce) return { ok: false, reason: "wrong_nonce" };

  if (normalize(inner) !== normalize(decision.ad.approvedCopy)) {
    return { ok: false, reason: "copy_mismatch" };
  }

  if (position === 0) return { ok: false, reason: "position_opening" };

  const total = position + inner.length;
  if (total > 0 && inner.length / total > MAX_AD_FRACTION) {
    // Only pre-ad text is known at verify time — overestimates ad share.
    console.warn(
      `monetzly: ad is ${Math.round((100 * inner.length) / total)}% of emitted text so far (warn-only)`,
    );
  }

  return { ok: true };
}
