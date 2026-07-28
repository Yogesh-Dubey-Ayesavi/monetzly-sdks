"""
Adapter for the `openai` Python SDK — and any OpenAI-compatible endpoint
using that same client (Azure OpenAI, Groq, Together, vLLM/Ollama's
OpenAI-compatible server, Cloudflare Workers AI's /v1/chat/completions).
Chunk shape is identical across all of them, so one adapter covers all.

    from openai import AsyncOpenAI
    from monetzly.v2.adapters import openai as mz_openai

    stream = await client.chat.completions.create(
        model="gpt-4o", messages=messages, stream=True,
        tools=[mz_openai.AD_FACTS_TOOL],
    )
    async for event in session.stream(mz_openai.to_text_stream(stream), decision):
        ...
"""
import json
from typing import Any, AsyncIterator, Iterable, Iterator

from ._common import (
    AD_FACTS_PARAMETERS,
    AD_FACTS_TOOL_DESCRIPTION,
    AD_FACTS_TOOL_NAME,
    ad_facts_payload,
)

AD_FACTS_TOOL = {
    "type": "function",
    "function": {
        "name": AD_FACTS_TOOL_NAME,
        "description": AD_FACTS_TOOL_DESCRIPTION,
        "parameters": AD_FACTS_PARAMETERS,
    },
}


async def to_text_stream(chunks: Any) -> AsyncIterator[str]:
    """chunks: the async iterator from `AsyncOpenAI().chat.completions.create(
    ..., stream=True)`. Yields text deltas only — tool-call deltas are left
    for you to read off the raw stream (accumulate `choice.delta.tool_calls`
    yourself if you need them mid-stream)."""
    async for chunk in chunks:
        for choice in getattr(chunk, "choices", None) or []:
            delta = getattr(choice, "delta", None)
            text = getattr(delta, "content", None) if delta else None
            if text:
                yield text


def sync_to_text_stream(chunks: Iterable[Any]) -> Iterator[str]:
    """Sync-client variant, for `OpenAI().chat.completions.create(...,
    stream=True)`."""
    for chunk in chunks:
        for choice in getattr(chunk, "choices", None) or []:
            delta = getattr(choice, "delta", None)
            text = getattr(delta, "content", None) if delta else None
            if text:
                yield text


async def handle_tool_call(session, tool_call: Any) -> dict:
    """tool_call: an accumulated ChatCompletionMessageToolCall (or dict with
    .function.name / .function.arguments) whose name is 'get_ad_facts'.
    Returns the payload to json.dumps() into a role="tool" message."""
    args = tool_call.function.arguments
    args = json.loads(args) if isinstance(args, str) else args
    return await ad_facts_payload(session, args.get("ad_id", ""))
