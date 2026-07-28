"""
Fragment builder + history rewriter tests.
"""
from monetzly.v2.fragment import build_facts_fragment, build_fragment
from monetzly.v2.history import (annotation_for, detect_followup,
                                 find_annotations, rewrite_assistant_text)
from monetzly.v2.types import Fact

from .conftest import marker


def test_fragment_contains_marker_and_copy(decision):
    frag = build_fragment(decision)
    assert decision.open_marker in frag
    assert decision.ad.approved_copy in frag
    assert "omit it entirely" in frag


def test_fragment_empty_on_skip():
    assert build_fragment(None) == ""


def test_facts_fragment():
    frag = build_facts_fragment("Inkpad Sign", [
        Fact(claim="Free tier includes 3 documents"),
        Fact(claim="eIDAS compliant", source_url="https://x.example"),
    ])
    assert "Inkpad Sign" in frag
    assert "Free tier includes 3 documents" in frag
    assert "https://x.example" in frag
    assert build_facts_fragment("X", []) == ""


def test_history_rewrite_replaces_marker(decision):
    raw = "Before. " + marker(decision) + " After."
    stored = rewrite_assistant_text(raw, decision.ad)
    assert marker(decision) not in stored
    assert annotation_for(decision.ad) in stored
    assert stored.startswith("Before. ")


def test_history_rewrite_strips_when_no_ad(decision):
    raw = "Before. " + marker(decision) + " After."
    stored = rewrite_assistant_text(raw, None)
    assert "⟦" not in stored


def test_find_annotations(decision):
    stored = "Hi. " + annotation_for(decision.ad) + " Bye."
    assert find_annotations(stored) == [decision.ad.id]


def test_detect_followup_by_brand(decision):
    assert detect_followup("is Inkpad Sign eIDAS compliant?",
                           [decision.ad]) == decision.ad.id


def test_detect_followup_by_reference(decision):
    assert detect_followup("tell me more about that tool you suggested",
                           [decision.ad]) == decision.ad.id


def test_detect_followup_none(decision):
    assert detect_followup("what's the weather like?", [decision.ad]) is None
    assert detect_followup("Inkpad Sign?", []) is None
