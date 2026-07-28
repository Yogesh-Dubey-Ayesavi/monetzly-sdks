"""
Provider adapters: turn a chat SDK's raw stream into the plain
AsyncIterator[str] that MonetzlySession.stream() expects, plus a
get_ad_facts tool definition in that provider's native tool format.

Each submodule imports its provider SDK lazily (if at all) — installing
monetzly does not pull in openai/anthropic/langchain/google-genai. Pick the
one matching your stack:

    from monetzly.v2.adapters import openai       # openai / AsyncOpenAI,
                                                    # and any OpenAI-compatible
                                                    # server (Azure OpenAI,
                                                    # Groq, Together, vLLM,
                                                    # Cloudflare Workers AI's
                                                    # /v1/chat/completions)
    from monetzly.v2.adapters import anthropic
    from monetzly.v2.adapters import google_genai
    from monetzly.v2.adapters import langchain

All expose `to_text_stream(provider_stream)`; most expose an
`AD_FACTS_TOOL`-shaped constant (or a builder function, where the schema
needs provider types) for the get_ad_facts follow-up tool.
"""
