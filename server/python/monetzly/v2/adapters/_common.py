"""Shared schema/payload helpers for provider adapters."""
from typing import Any, Dict, List

AD_FACTS_TOOL_NAME = "get_ad_facts"
AD_FACTS_TOOL_DESCRIPTION = (
    "Fetch advertiser-approved facts about a previously shown sponsored ad. "
    "Use ONLY when the user explicitly references that sponsor (brand name "
    "or a clear pointer to the shown suggestion). A message merely on the "
    "same topic is NOT a reason to call this. Calling it records a billable "
    "engagement for the advertiser."
)
AD_FACTS_PARAMETERS: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "ad_id": {
            "type": "string",
            "description": "The ad id from the history annotation",
        }
    },
    "required": ["ad_id"],
}


async def ad_facts_payload(session, ad_id: str) -> Dict[str, List[Any]]:
    """Fetch + bill facts for ad_id, shaped as a tool-response payload."""
    facts = await session.facts(ad_id)
    if not facts:
        return {"facts": [], "note": "no approved facts for this ad"}
    return {"facts": [{"claim": f.claim, "source_url": f.source_url} for f in facts]}
