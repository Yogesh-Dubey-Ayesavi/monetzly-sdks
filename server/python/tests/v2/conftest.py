import pytest

from monetzly.v2.types import Ad, Decision, Fact

APPROVED_COPY = ("For multi-country signing, Inkpad Sign handles sequential "
                 "signatures with per-country compliance built in — free for "
                 "your first three documents.")


@pytest.fixture
def decision() -> Decision:
    return Decision(
        ad=Ad(
            id="2210",
            brand="Inkpad Sign",
            approved_copy=APPROVED_COPY,
            url="https://inkpad.example",
            category="productivity",
            facts=[Fact(claim="Free tier includes 3 documents")],
        ),
        nonce="k7f2q_nonce",
    )


def marker(decision: Decision, copy: str = None) -> str:
    return (f"{decision.open_marker}"
            f"{copy if copy is not None else decision.ad.approved_copy}"
            f"{Decision.close_marker()}")


async def astream(chunks):
    for chunk in chunks:
        yield chunk


async def collect(scanner, chunks):
    events = []
    async for event in scanner.scan(astream(chunks)):
        events.append(event)
    return events


def text_of(events) -> str:
    return "".join(e.text for e in events if e.t == "tok")


def ads_of(events):
    return [e for e in events if e.t == "ad"]
