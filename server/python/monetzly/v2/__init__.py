"""
monetzly.v2 — Mode B native ad integration.

Decision API client, prompt fragment builder, stream scanner/verifier,
and history rewriter. No gRPC; requires httpx (install extra: monetzly[v2]).
"""
from .client import AdsClient
from .session import Monetzly, MonetzlySession
from .types import Ad, AdEvent, Decision, Fact, TokenEvent, VerifyResult

__all__ = [
    "Monetzly",
    "MonetzlySession",
    "AdsClient",
    "Decision",
    "Ad",
    "Fact",
    "AdEvent",
    "TokenEvent",
    "VerifyResult",
]
