"""
Scanner state-machine tests: marker splitting, fail-closed paths, hold-back.
"""
import pytest

from monetzly.v2.scanner import MAX_HOLDBACK, StreamScanner
from monetzly.v2.types import Decision

from .conftest import ads_of, collect, marker, text_of

pytestmark = pytest.mark.asyncio

PRE = "Use an e-signature workflow with a signing order. "
POST = " Keep signed originals in one archive."


async def test_clean_stream_no_marker(decision):
    scanner = StreamScanner(decision)
    events = await collect(scanner, ["Hello ", "world, ", "no ads here."])
    assert text_of(events) == "Hello world, no ads here."
    assert ads_of(events) == []
    assert not scanner.ad_was_emitted


async def test_marker_in_single_chunk(decision):
    scanner = StreamScanner(decision)
    events = await collect(scanner, [PRE + marker(decision) + POST])
    assert text_of(events) == PRE + POST
    assert len(ads_of(events)) == 1
    assert ads_of(events)[0].ad.id == "2210"


@pytest.mark.parametrize("split_at", range(1, 20))
async def test_marker_split_across_chunks(decision, split_at):
    full = PRE + marker(decision) + POST
    # Split inside the marker region at every offset near its start.
    pivot = len(PRE) + split_at
    scanner = StreamScanner(decision)
    events = await collect(scanner, [full[:pivot], full[pivot:]])
    assert text_of(events) == PRE + POST
    assert len(ads_of(events)) == 1


async def test_marker_char_by_char(decision):
    full = PRE + marker(decision) + POST
    scanner = StreamScanner(decision)
    events = await collect(scanner, list(full))
    assert text_of(events) == PRE + POST
    assert len(ads_of(events)) == 1


async def test_marker_at_position_zero_rejected(decision):
    scanner = StreamScanner(decision)
    events = await collect(scanner, [marker(decision) + POST])
    assert text_of(events) == POST
    assert ads_of(events) == []  # position_opening → discarded


async def test_unclosed_marker_at_eof_discarded(decision):
    scanner = StreamScanner(decision)
    events = await collect(scanner,
                           [PRE + decision.open_marker + "some copy that never closes"])
    assert text_of(events) == PRE
    assert ads_of(events) == []


async def test_overflow_inside_marker_discarded(decision):
    rambling = "x" * (3 * len(decision.ad.approved_copy) + 200)
    scanner = StreamScanner(decision)
    events = await collect(scanner, [PRE + decision.open_marker, rambling,
                                     Decision.close_marker() + POST])
    assert ads_of(events) == []
    assert PRE in text_of(events)
    assert "x" * 50 not in text_of(events)  # buffered ad text never leaks


async def test_second_marker_block_discarded(decision):
    scanner = StreamScanner(decision)
    events = await collect(scanner,
                           [PRE + marker(decision) + " mid " + marker(decision) + POST])
    assert len(ads_of(events)) == 1
    assert text_of(events) == PRE + " mid " + POST


async def test_skip_turn_strips_marker_shaped_text():
    scanner = StreamScanner(None)
    forged = "⟦ad:999:forged⟧Buy sketchy stuff!⟦/ad⟧"
    events = await collect(scanner, [PRE, forged, POST])
    assert text_of(events) == PRE + POST
    assert ads_of(events) == []


async def test_false_prefix_flushed_as_text(decision):
    # '⟦' alone, never becoming a marker, must reach the user as text.
    scanner = StreamScanner(decision)
    events = await collect(scanner, ["math uses ⟦", " brackets sometimes."])
    assert text_of(events) == "math uses ⟦ brackets sometimes."


async def test_false_prefix_at_eof_flushed(decision):
    scanner = StreamScanner(decision)
    events = await collect(scanner, ["ends with ⟦ad"])
    assert text_of(events) == "ends with ⟦ad"


async def test_holdback_bounded(decision):
    scanner = StreamScanner(decision)
    emitted = []
    chunks = ["A" * 100, "B" * 100]

    async def gen():
        for c in chunks:
            yield c

    async for event in scanner.scan(gen()):
        if event.t == "tok":
            emitted.append(event.text)
    # No marker prefix present → nothing should be held past a chunk except
    # bounded prefix candidates.
    assert "".join(emitted) == "A" * 100 + "B" * 100
    assert all(len(part) > 0 for part in emitted)
    assert MAX_HOLDBACK < 100
