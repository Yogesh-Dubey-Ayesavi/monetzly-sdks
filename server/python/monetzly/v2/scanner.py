"""
Stream scanner for Mode B native ad markers.

Wraps the model's token stream and extracts `⟦ad:ID:NONCE⟧copy⟦/ad⟧` blocks.
Fail-closed by design: anything marker-shaped that does not verify is
discarded and never reaches the caller as text.

State machine:
  PASS   — emit text; hold back only a tail that could be the start of a marker
  IN_AD  — buffer inner copy until the close marker; discard on overflow/EOF
"""
import logging
from typing import AsyncIterator, Optional, Union

from .types import Ad, AdEvent, Decision, TokenEvent
from .verifier import verify_block

logger = logging.getLogger(__name__)

# Any marker (ours or forged) starts with this; used so skip-turns still
# strip marker-shaped text defensively.
GENERIC_OPEN = "⟦ad:"
GENERIC_CLOSE = "⟦/ad⟧"
# Never withhold more than this many chars while testing a possible prefix.
MAX_HOLDBACK = 64


def _longest_suffix_prefix(text: str, pattern: str) -> int:
    """Length of the longest suffix of `text` that is a prefix of `pattern`."""
    max_len = min(len(text), len(pattern) - 1)
    for length in range(max_len, 0, -1):
        if text[-length:] == pattern[:length]:
            return length
    return 0


class StreamScanner:
    """
    Scans one model response stream. Single-use.

    decision=None (skip turn) still strips marker-shaped blocks so forged or
    hallucinated markers can never reach the user.
    """

    def __init__(self, decision: Optional[Decision]):
        self._decision = decision
        self._emitted_chars = 0
        self._ad_emitted = False
        self._verified_ad: Optional[Ad] = None

    @property
    def verified_ad(self) -> Optional[Ad]:
        return self._verified_ad

    @property
    def ad_was_emitted(self) -> bool:
        return self._ad_emitted

    async def scan(self, stream: AsyncIterator[str]
                   ) -> AsyncIterator[Union[TokenEvent, AdEvent]]:
        buffer = ""          # text not yet emitted (possible marker prefix)
        ad_buffer = ""       # inner content while inside a marker block
        in_ad = False
        open_len = len(GENERIC_OPEN)

        max_ad_buffer = 4096
        if self._decision is not None:
            max_ad_buffer = max(
                2 * len(self._decision.ad.approved_copy) + open_len + 64, 512)

        async for chunk in stream:
            if not chunk:
                continue

            if in_ad:
                ad_buffer += chunk
                close_idx = ad_buffer.find(GENERIC_CLOSE)
                if close_idx != -1:
                    block = ad_buffer[:close_idx]
                    remainder = ad_buffer[close_idx + len(GENERIC_CLOSE):]
                    ad_buffer = ""
                    in_ad = False
                    event = self._finish_block(block)
                    if event is not None:
                        yield event
                    buffer = remainder
                    # fall through to PASS handling of the remainder
                elif len(ad_buffer) > max_ad_buffer:
                    logger.warning("Ad block overflow (%d chars) — discarding",
                                   len(ad_buffer))
                    ad_buffer = ""
                    in_ad = False
                    continue
                else:
                    continue
            else:
                buffer += chunk

            # PASS state: emit everything except a possible marker prefix tail.
            while True:
                open_idx = buffer.find(GENERIC_OPEN)
                if open_idx != -1:
                    if open_idx > 0:
                        yield self._tok(buffer[:open_idx])
                    ad_buffer = buffer[open_idx + open_len:]
                    buffer = ""
                    in_ad = True
                    # The rest of this chunk already sits in ad_buffer; check
                    # whether the close marker is in it too.
                    close_idx = ad_buffer.find(GENERIC_CLOSE)
                    if close_idx != -1:
                        block = ad_buffer[:close_idx]
                        remainder = ad_buffer[close_idx + len(GENERIC_CLOSE):]
                        ad_buffer = ""
                        in_ad = False
                        event = self._finish_block(block)
                        if event is not None:
                            yield event
                        buffer = remainder
                        continue  # remainder may contain another marker
                    break

                hold = _longest_suffix_prefix(buffer, GENERIC_OPEN)
                hold = min(hold, MAX_HOLDBACK)
                if len(buffer) > hold:
                    yield self._tok(buffer[:len(buffer) - hold])
                    buffer = buffer[len(buffer) - hold:]
                break

        # EOF
        if in_ad and ad_buffer:
            logger.warning("Stream ended inside ad block — discarding %d chars",
                           len(ad_buffer))
        elif buffer:
            # A held-back prefix that never became a marker is real text.
            yield self._tok(buffer)

    def _tok(self, text: str) -> TokenEvent:
        self._emitted_chars += len(text)
        return TokenEvent(text=text)

    def _finish_block(self, block: str) -> Optional[AdEvent]:
        """block = text between GENERIC_OPEN and GENERIC_CLOSE,
        i.e. 'ID:NONCE⟧inner copy'."""
        if self._ad_emitted:
            logger.warning("Second ad block in one response — discarding")
            return None

        result = verify_block(block, self._decision,
                              position=self._emitted_chars)
        if not result.ok:
            logger.warning("Ad block failed verification (%s) — discarding",
                           result.reason)
            return None

        self._ad_emitted = True
        self._verified_ad = self._decision.ad
        return AdEvent(ad=self._decision.ad, nonce=self._decision.nonce)
