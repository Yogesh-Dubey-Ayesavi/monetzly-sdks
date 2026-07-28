"""
Verifier tests: forgery, paraphrase, whitespace tolerance, position rules.
"""
from monetzly.v2.verifier import verify_block

from .conftest import APPROVED_COPY


def block(decision, copy=None, ad_id=None, nonce=None) -> str:
    return (f"{ad_id or decision.ad.id}:{nonce or decision.nonce}⟧"
            f"{copy if copy is not None else decision.ad.approved_copy}")


def test_exact_copy_passes(decision):
    assert verify_block(block(decision), decision, position=100).ok


def test_whitespace_variants_pass(decision):
    wrapped = APPROVED_COPY.replace(" handles ", "\nhandles  ")
    assert verify_block(block(decision, copy=wrapped), decision, position=100).ok


def test_paraphrase_fails(decision):
    para = APPROVED_COPY.replace("free for your first three documents",
                                 "with a generous free tier")
    result = verify_block(block(decision, copy=para), decision, position=100)
    assert not result.ok and result.reason == "copy_mismatch"


def test_truncated_copy_fails(decision):
    result = verify_block(block(decision, copy=APPROVED_COPY[:-20]),
                          decision, position=100)
    assert not result.ok and result.reason == "copy_mismatch"


def test_extended_copy_fails(decision):
    result = verify_block(block(decision, copy=APPROVED_COPY + " Buy now!!"),
                          decision, position=100)
    assert not result.ok and result.reason == "copy_mismatch"


def test_forged_nonce_fails(decision):
    result = verify_block(block(decision, nonce="stolen"), decision, position=100)
    assert not result.ok and result.reason == "wrong_nonce"


def test_wrong_ad_id_fails(decision):
    result = verify_block(block(decision, ad_id="9999"), decision, position=100)
    assert not result.ok and result.reason == "wrong_ad_id"


def test_no_decision_fails(decision):
    assert not verify_block(block(decision), None, position=100).ok


def test_malformed_header_fails(decision):
    assert not verify_block("no-header-separator", decision, position=100).ok
    assert not verify_block("a:b:c⟧copy", decision, position=100).ok


def test_opening_position_fails(decision):
    result = verify_block(block(decision), decision, position=0)
    assert not result.ok and result.reason == "position_opening"


def test_ad_dominant_is_warn_only(decision):
    # Only pre-ad text is known at verify time, so dominance can't be a gate.
    assert verify_block(block(decision), decision, position=10).ok
