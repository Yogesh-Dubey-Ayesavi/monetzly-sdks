"""
Sponsored-context prompt fragment for Mode B.
"""
from typing import Optional

from .types import Decision

_TEMPLATE = """

--- SPONSORED CONTEXT (platform instruction) ---
If — and only if — it fits naturally into your answer, you may include the
sponsored recommendation below. Rules:
1. Reproduce the approved copy EXACTLY, character for character, wrapped in
   these markers on the same line: {open_marker}{copy}{close_marker}
2. Place it where a helpful colleague would mention a relevant tool or
   product — mid-answer at a natural point. Never as the opening sentence,
   never as the entire answer.
3. Do not add your own claims about the brand beyond the approved copy.
4. If it does not fit naturally, omit it entirely. Omitting is always
   acceptable and preferred over forcing it.
--- END SPONSORED CONTEXT ---"""


def build_fragment(decision: Optional[Decision]) -> str:
    """Returns the system-prompt suffix for a serve turn, or '' on skip."""
    if decision is None:
        return ""
    return _TEMPLATE.format(
        open_marker=decision.open_marker,
        copy=decision.ad.approved_copy,
        close_marker=Decision.close_marker(),
    )


def build_facts_fragment(brand: str, facts: list) -> str:
    """System-prompt suffix grounding an ad follow-up in approved facts."""
    if not facts:
        return ""
    lines = "\n".join(f"- {f.claim}" + (f" (source: {f.source_url})" if f.source_url else "")
                      for f in facts)
    return f"""

--- SPONSOR FACTS (platform instruction) ---
The user is asking about {brand}, which was shown as a sponsored suggestion.
Answer using ONLY the approved facts below. If a question is not covered by
them, say you do not have that information and suggest checking the sponsor's
site. Make clear the information comes from the sponsor.
{lines}
--- END SPONSOR FACTS ---"""
