"""
Adapter for the `google-genai` SDK (`google.genai`, Gemini).

    from google.genai import types
    from monetzly.v2.adapters import google_genai as mz_genai

    stream = await client.aio.models.generate_content_stream(
        model=MODEL, contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            tools=[mz_genai.facts_tool_declaration(types)],
        ),
    )
    async for event in session.stream(mz_genai.to_text_stream(stream), decision):
        ...
"""
from typing import Any, AsyncIterator, Dict

from ._common import (
    AD_FACTS_PARAMETERS,
    AD_FACTS_TOOL_DESCRIPTION,
    AD_FACTS_TOOL_NAME,
    ad_facts_payload,
)


def facts_tool_declaration(types: Any) -> Any:
    """types: the `google.genai.types` module, passed in so this module has
    no hard dependency on the package. Returns a types.Tool for
    GenerateContentConfig(tools=[...])."""
    return types.Tool(function_declarations=[types.FunctionDeclaration(
        name=AD_FACTS_TOOL_NAME,
        description=AD_FACTS_TOOL_DESCRIPTION,
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={"ad_id": types.Schema(
                type=types.Type.STRING,
                description=AD_FACTS_PARAMETERS["properties"]["ad_id"]["description"])},
            required=["ad_id"],
        ),
    )])


async def to_text_stream(chunks: Any) -> AsyncIterator[str]:
    """chunks: the async iterator from
    `client.aio.models.generate_content_stream(...)`. Function-call parts
    are skipped — read `chunk.candidates[0].content.parts` yourself for
    those (see demo/cli.py's stream_model for the pattern; a part carries
    exactly one of .text or .function_call)."""
    async for chunk in chunks:
        for candidate in getattr(chunk, "candidates", None) or []:
            content = getattr(candidate, "content", None)
            for part in (getattr(content, "parts", None) or []) if content else []:
                text = getattr(part, "text", None)
                if text:
                    yield text


async def handle_function_call(session, function_call: Any) -> Dict[str, Any]:
    """function_call: a types.FunctionCall with .name == 'get_ad_facts' and
    .args == {'ad_id': ...}."""
    ad_id = (getattr(function_call, "args", None) or {}).get("ad_id", "")
    return await ad_facts_payload(session, ad_id)
