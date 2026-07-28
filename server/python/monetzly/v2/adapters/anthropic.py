"""
Adapter for the `anthropic` Python SDK.

    stream = await client.messages.create(
        model="claude-sonnet-5-...", messages=messages, max_tokens=1024,
        stream=True, tools=[mz_anthropic.AD_FACTS_TOOL],
    )
    async for event in session.stream(mz_anthropic.to_text_stream(stream), decision):
        ...

If you're using the `async with client.messages.stream(...) as stream:`
context-manager form instead, it already exposes `stream.text_stream` as an
async iterator of text — use that directly and skip this adapter's
to_text_stream (handle_tool_use below still applies to either form).
"""
from typing import Any, AsyncIterator, Dict

from ._common import (
    AD_FACTS_PARAMETERS,
    AD_FACTS_TOOL_DESCRIPTION,
    AD_FACTS_TOOL_NAME,
    ad_facts_payload,
)

AD_FACTS_TOOL = {
    "name": AD_FACTS_TOOL_NAME,
    "description": AD_FACTS_TOOL_DESCRIPTION,
    "input_schema": AD_FACTS_PARAMETERS,
}


async def to_text_stream(stream: Any) -> AsyncIterator[str]:
    """stream: the raw async event stream from `client.messages.create(...,
    stream=True)`. Yields text_delta content only."""
    async for event in stream:
        if getattr(event, "type", None) == "content_block_delta":
            delta = getattr(event, "delta", None)
            if getattr(delta, "type", None) == "text_delta":
                yield delta.text


async def handle_tool_use(session, tool_use_block: Any) -> Dict[str, Any]:
    """tool_use_block: a ToolUseBlock with .name == 'get_ad_facts' and
    .input == {'ad_id': ...}. Returns the payload to wrap in a
    {"type": "tool_result", "tool_use_id": ..., "content": json.dumps(...)}
    content block."""
    ad_id = (getattr(tool_use_block, "input", None) or {}).get("ad_id", "")
    return await ad_facts_payload(session, ad_id)
