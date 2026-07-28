"""
Monetzly Python SDK

Mode B native ad integration for LLM applications: a decision-service client,
prompt fragment builder, stream scanner/verifier, and history rewriter.
See `monetzly.v2` for the public API.
"""
from . import v2  # noqa: F401

__version__ = "3.0.0"
__all__ = ["v2"]
