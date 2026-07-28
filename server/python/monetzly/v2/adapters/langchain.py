"""
Adapter for LangChain chat models (ChatOpenAI, ChatAnthropic,
ChatGoogleGenerativeAI, ...) — anything exposing `.astream()` and yielding
AIMessageChunk. Provider-agnostic: swap the underlying chat model without
touching this adapter.

    from monetzly.v2.adapters import langchain as mz_lc

    llm = ChatOpenAI(model="gpt-4o", streaming=True).bind_tools(
        [mz_lc.make_ad_facts_tool(session)])
    chunks = llm.astream(messages)
    async for event in session.stream(mz_lc.to_text_stream(chunks), decision):
        ...
"""
from typing import Any, AsyncIterator

from ._common import AD_FACTS_TOOL_DESCRIPTION, AD_FACTS_TOOL_NAME, ad_facts_payload


async def to_text_stream(chunks: Any) -> AsyncIterator[str]:
    """chunks: the async iterator from `llm.astream(messages)`. Yields
    `.content` off each AIMessageChunk; chunks carrying only
    tool_call_chunks are skipped (LangChain surfaces the accumulated tool
    call once bind_tools is set — read it off the final chunk, or use
    `llm.bind_tools(...).ainvoke(...)` instead of streaming if you need the
    call before any text)."""
    async for chunk in chunks:
        content = getattr(chunk, "content", None)
        if content:
            yield content


def make_ad_facts_tool(session):
    """Returns a LangChain StructuredTool, bindable via
    `llm.bind_tools([make_ad_facts_tool(session)])`. Imports langchain-core
    lazily so this module has no hard dependency on it otherwise."""
    from langchain_core.tools import StructuredTool
    from pydantic import BaseModel, Field

    class AdFactsInput(BaseModel):
        ad_id: str = Field(description="The ad id from the history annotation")

    async def _run(ad_id: str) -> dict:
        return await ad_facts_payload(session, ad_id)

    return StructuredTool.from_function(
        coroutine=_run,
        name=AD_FACTS_TOOL_NAME,
        description=AD_FACTS_TOOL_DESCRIPTION,
        args_schema=AdFactsInput,
    )
