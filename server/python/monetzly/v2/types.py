"""
monetzly.v2 data types mirroring the /api/v2 wire schemas.
"""
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class Fact:
    claim: str
    source_url: Optional[str] = None


@dataclass
class Ad:
    id: str
    brand: str
    approved_copy: str
    url: Optional[str] = None
    category: Optional[str] = None
    facts: List[Fact] = field(default_factory=list)


@dataclass
class Decision:
    """A serve directive from /decide. Skip turns are represented as None."""
    ad: Ad
    nonce: str
    mode: str = "native"
    expires_in: int = 600

    @property
    def open_marker(self) -> str:
        return f"⟦ad:{self.ad.id}:{self.nonce}⟧"

    @staticmethod
    def close_marker() -> str:
        return "⟦/ad⟧"

    @classmethod
    def from_response(cls, data: dict) -> Optional["Decision"]:
        if not data or data.get("decision") != "serve":
            return None
        ad = data["ad"]
        return cls(
            ad=Ad(
                id=str(ad["id"]),
                brand=ad["brand"],
                approved_copy=ad["approved_copy"],
                url=ad.get("url"),
                category=ad.get("category"),
                facts=[Fact(claim=f["claim"], source_url=f.get("source_url"))
                       for f in ad.get("facts", [])],
            ),
            nonce=data["nonce"],
            mode=data.get("mode", "native"),
            expires_in=data.get("expires_in", 600),
        )


@dataclass
class TokenEvent:
    text: str
    t: str = "tok"

    def to_dict(self) -> dict:
        return {"t": "tok", "v": self.text}


@dataclass
class AdEvent:
    ad: Ad
    nonce: str
    t: str = "ad"

    def to_dict(self) -> dict:
        return {
            "t": "ad",
            "ad": {"id": self.ad.id, "brand": self.ad.brand,
                   "copy": self.ad.approved_copy, "url": self.ad.url},
            "nonce": self.nonce,
        }

    @property
    def raw_marker(self) -> str:
        """Reconstructs the ⟦ad:ID:NONCE⟧copy⟦/ad⟧ wire marker this event
        was scanned from — for callers accumulating raw text for
        rewrite_history()."""
        return f"⟦ad:{self.ad.id}:{self.nonce}⟧{self.ad.approved_copy}⟦/ad⟧"


@dataclass
class VerifyResult:
    ok: bool
    reason: str = ""
