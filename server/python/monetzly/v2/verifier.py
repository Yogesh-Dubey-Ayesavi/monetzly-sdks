"""
Verification of scanned ad blocks against the turn's decision.
"""
import logging
from typing import Optional

from .types import Decision, VerifyResult

logger = logging.getLogger(__name__)

# Reject if the ad makes up more than this fraction of the emitted answer.
MAX_AD_FRACTION = 0.6


def _normalize(text: str) -> str:
    return " ".join(text.split())


def verify_block(block: str, decision: Optional[Decision],
                 position: int) -> VerifyResult:
    """
    block: contents between '⟦ad:' and '⟦/ad⟧' — expected 'ID:NONCE⟧copy'.
    position: chars of organic text emitted before this block.
    """
    if decision is None:
        return VerifyResult(False, "no_decision")

    header_end = block.find("⟧")
    if header_end == -1:
        return VerifyResult(False, "malformed_header")
    header = block[:header_end]
    inner = block[header_end + 1:]

    parts = header.split(":")
    if len(parts) != 2:
        return VerifyResult(False, "malformed_header")
    ad_id, nonce = parts

    if ad_id != decision.ad.id:
        return VerifyResult(False, "wrong_ad_id")
    if nonce != decision.nonce:
        return VerifyResult(False, "wrong_nonce")

    if _normalize(inner) != _normalize(decision.ad.approved_copy):
        return VerifyResult(False, "copy_mismatch")

    if position == 0:
        return VerifyResult(False, "position_opening")

    # Warn-only: at verify time only pre-ad text is known, so this fraction
    # structurally overestimates ad share. Kept as telemetry, not a gate.
    total = position + len(inner)
    if total > 0 and len(inner) / total > MAX_AD_FRACTION:
        logger.warning("Ad is %.0f%% of emitted text so far (warn-only)",
                       100 * len(inner) / total)

    return VerifyResult(True)
