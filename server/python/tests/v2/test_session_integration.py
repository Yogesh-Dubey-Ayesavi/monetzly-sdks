"""
Integration over a fake model stream: full event sequence, exactly one
impression report, correct history rewrite, zero reports when the model omits.
"""
import asyncio

import pytest

from monetzly.v2.session import MonetzlySession

from .conftest import marker

pytestmark = pytest.mark.asyncio


class FakeClient:
    def __init__(self):
        self.impressions = []
        self.engagements = []

    async def report_impression(self, nonce, ad_id, session_id):
        self.impressions.append((nonce, ad_id, session_id))
        return True

    async def report_engagement(self, ad_id, session_id, turn_index=None):
        self.engagements.append((ad_id, session_id))
        return True

    async def get_facts(self, ad_id):
        from monetzly.v2.types import Fact
        return [Fact(claim="Free tier includes 3 documents")]


async def astream(chunks):
    for chunk in chunks:
        yield chunk
        await asyncio.sleep(0)


async def test_full_flow_with_ad(decision):
    client = FakeClient()
    session = MonetzlySession(client, "conv-1")

    chunks = ["Use a signing workflow. ", marker(decision), " Keep originals."]
    events = [e async for e in session.stream(astream(chunks), decision)]
    await asyncio.sleep(0.01)  # let the fire-and-forget billing task run

    kinds = [e.t for e in events]
    assert kinds.count("ad") == 1
    assert client.impressions == [(decision.nonce, decision.ad.id, "conv-1")]

    raw = "Use a signing workflow. " + marker(decision) + " Keep originals."
    stored = session.rewrite_history(raw)
    assert "⟦" not in stored
    assert "ad:2210" in stored


async def test_model_omits_ad_no_billing(decision):
    client = FakeClient()
    session = MonetzlySession(client, "conv-2")

    events = [e async for e in session.stream(
        astream(["Plain answer, no sponsored fit here."]), decision)]
    await asyncio.sleep(0.01)

    assert all(e.t == "tok" for e in events)
    assert client.impressions == []


async def test_followup_bills_engagement(decision):
    client = FakeClient()
    session = MonetzlySession(client, "conv-3")
    session.shown_ads.append(decision.ad)

    frag = await session.facts_fragment(decision.ad.id)
    await asyncio.sleep(0.01)

    assert "Free tier includes 3 documents" in frag
    assert client.engagements == [(decision.ad.id, "conv-3")]
