"""
Conversation-history handling: the ad copy never becomes assistant "speech".
"""
import re
from typing import List, Optional

from .types import Ad

_ANNOTATION_TEMPLATE = "[sponsored suggestion shown: {brand} — ad:{ad_id}]"
_MARKER_RE = re.compile(r"⟦ad:[^⟧]*⟧.*?⟦/ad⟧", re.DOTALL)
_ANNOTATION_RE = re.compile(r"\[sponsored suggestion shown: (?P<brand>[^—\]]+) — ad:(?P<ad_id>[^\]]+)\]")


def annotation_for(ad: Ad) -> str:
    return _ANNOTATION_TEMPLATE.format(brand=ad.brand, ad_id=ad.id)


def rewrite_assistant_text(raw_text: str, ad: Optional[Ad]) -> str:
    """Replace any marker block with the annotation (or strip if no ad)."""
    replacement = annotation_for(ad) if ad else ""
    return _MARKER_RE.sub(replacement, raw_text)


def _collapse(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


_REFERRING_RE = re.compile(
    r"\b(that (product|tool|brand|service|offer|suggestion|company|one)|"
    r"the sponsored|that ad|tell me more|more about (it|that|this)|"
    r"what about (it|that)|is it (free|good|worth|expensive)|"
    r"how much (is it|does it cost)|"
    r"that one you (mentioned|suggested|recommended))\b")


def detect_followup(user_text: str, recent_ads: List[Ad],
                    ad_is_recent: bool = True) -> Optional[str]:
    """
    Return the ad_id the user appears to be asking about, if any.

    Brand mentions match regardless of spacing/punctuation ("go green energy
    solar" matches brand "GreenEnergy Solar"). Vague referring phrases
    ("tell me more about it") only count when ad_is_recent — the caller knows
    whether an ad was shown in the last few turns.
    """
    if not recent_ads:
        return None
    lowered = user_text.lower()
    collapsed = _collapse(user_text)
    for ad in reversed(recent_ads):
        brand_collapsed = _collapse(ad.brand)
        if brand_collapsed and brand_collapsed in collapsed:
            return ad.id
    if ad_is_recent and _REFERRING_RE.search(lowered):
        return recent_ads[-1].id
    return None


def find_annotations(history_text: str) -> List[str]:
    """Extract ad ids from annotations in stored history."""
    return [m.group("ad_id").strip()
            for m in _ANNOTATION_RE.finditer(history_text)]
