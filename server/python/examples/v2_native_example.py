#!/usr/bin/env python3
"""
Mode B native example: decide → fragment → Gemini stream → scan/verify → render.

Requires: pip install monetzly-sdk[v2] google-genai python-dotenv
Env: MONETZLY_API_KEY, MONETZLY_BASE_URL (default http://localhost:8080/api/v2),
     GOOGLE_API_KEY
"""
import asyncio
import os

from dotenv import load_dotenv

from monetzly.v2 import Monetzly

load_dotenv()

BASE_SYSTEM_PROMPT = "You are a concise, helpful assistant."


async def gemini_stream(system_prompt: str, user_message: str):
    from google import genai
    from google.genai import types
    client = genai.Client()
    stream = client.models.generate_content_stream(
        model=os.getenv("MONETZLY_EXAMPLE_MODEL", "gemini-3.1-flash-lite"),
        contents=user_message,
        config=types.GenerateContentConfig(system_instruction=system_prompt),
    )
    for chunk in stream:
        if chunk.text:
            yield chunk.text
        await asyncio.sleep(0)


async def main():
    mz = Monetzly(
        api_key=os.environ["MONETZLY_API_KEY"],
        base_url=os.getenv("MONETZLY_BASE_URL", "http://localhost:8080/api/v2"),
    )
    session = mz.session(session_id="example-conversation-1")

    user_message = "How do I get a contract signed by three parties remotely?"

    decision = await session.decide(user_message)
    print(f"decision: {'serve ' + decision.ad.brand if decision else 'skip'}\n")

    system_prompt = session.augment_system_prompt(BASE_SYSTEM_PROMPT, decision)

    raw_parts = []
    async for event in session.stream(gemini_stream(system_prompt, user_message),
                                      decision):
        if event.t == "tok":
            raw_parts.append(event.text)
            print(event.text, end="", flush=True)
        else:
            print(f"\n\n[Sponsored] {event.ad.brand}: {event.ad.approved_copy} "
                  f"({event.ad.url})\n")

    stored = session.rewrite_history("".join(raw_parts))
    print(f"\n\nstored history text:\n{stored}")

    await mz.aclose()


if __name__ == "__main__":
    asyncio.run(main())
