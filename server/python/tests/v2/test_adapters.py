"""
Adapter tests: each provider's to_text_stream() against a minimal fake of
that provider's chunk shape (no real SDK installed as a test dependency —
adapters use structural attribute access on purpose).
"""
from types import SimpleNamespace

import pytest

from monetzly.v2.adapters import anthropic, google_genai, langchain, openai

pytestmark = pytest.mark.asyncio


async def _alist(chunks):
    return [c async for c in chunks]


async def _aiter(items):
    for item in items:
        yield item


async def test_openai_to_text_stream():
    chunks = _aiter([
        SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content="Hel"))]),
        SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content="lo"))]),
        SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=None))]),
    ])
    assert await _alist(openai.to_text_stream(chunks)) == ["Hel", "lo"]


def test_openai_sync_to_text_stream():
    chunks = [
        SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content="Hi"))]),
        SimpleNamespace(choices=[]),
    ]
    assert list(openai.sync_to_text_stream(chunks)) == ["Hi"]


async def test_anthropic_to_text_stream():
    events = _aiter([
        SimpleNamespace(type="content_block_start"),
        SimpleNamespace(type="content_block_delta",
                        delta=SimpleNamespace(type="text_delta", text="Hi")),
        SimpleNamespace(type="content_block_delta",
                        delta=SimpleNamespace(type="input_json_delta")),
    ])
    assert await _alist(anthropic.to_text_stream(events)) == ["Hi"]


async def test_google_genai_to_text_stream():
    part_text = SimpleNamespace(text="Hi", function_call=None)
    part_call = SimpleNamespace(text=None, function_call=SimpleNamespace(name="get_ad_facts"))
    chunks = _aiter([
        SimpleNamespace(candidates=[SimpleNamespace(
            content=SimpleNamespace(parts=[part_text, part_call]))]),
    ])
    assert await _alist(google_genai.to_text_stream(chunks)) == ["Hi"]


async def test_langchain_to_text_stream():
    chunks = _aiter([
        SimpleNamespace(content="Hel"),
        SimpleNamespace(content=""),
        SimpleNamespace(content="lo"),
    ])
    assert await _alist(langchain.to_text_stream(chunks)) == ["Hel", "lo"]


async def test_openai_handle_tool_call_no_facts():
    session = SimpleNamespace(facts=lambda ad_id: _empty())
    payload = await openai.handle_tool_call(
        session,
        SimpleNamespace(function=SimpleNamespace(arguments='{"ad_id": "42"}')),
    )
    assert payload == {"facts": [], "note": "no approved facts for this ad"}


async def _empty():
    return []
