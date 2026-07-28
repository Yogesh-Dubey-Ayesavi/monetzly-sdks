"""
HTTP client for the /api/v2 platform endpoints.

Every network failure degrades to skip/no-op — the developer's chat stream
must never break because of the ad platform.
"""
import logging
from typing import List, Optional

import httpx

from .types import Decision, Fact

logger = logging.getLogger(__name__)


class AdsClient:
    def __init__(self, api_key: str, base_url: str, timeout: float = 3.0):
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            headers={"X-API-Key": api_key},
            timeout=timeout,
        )
        # Reason for the most recent skip decision (None after a serve).
        self.last_skip_reason: Optional[str] = None

    async def aclose(self):
        await self._client.aclose()

    async def decide(self, session_id: str, text: str,
                     turn_index: Optional[int] = None) -> Optional[Decision]:
        payload = {
            "protocol": 1,
            "session_id": session_id,
            "turn": {"kind": "raw_text", "text": text},
        }
        if turn_index is not None:
            payload["context"] = {"turn_index": turn_index}
        try:
            response = await self._client.post("/decide", json=payload)
            response.raise_for_status()
            data = response.json()
            decision = Decision.from_response(data)
            self.last_skip_reason = None if decision else data.get("reason")
            return decision
        except Exception as e:
            logger.warning("decide() failed, treating as skip: %s", e)
            self.last_skip_reason = "client_error"
            return None

    async def report_impression(self, nonce: str, ad_id: str,
                                session_id: str) -> bool:
        try:
            response = await self._client.post("/events/impression", json={
                "nonce": nonce, "ad_id": ad_id, "session_id": session_id})
            return response.status_code == 200
        except Exception as e:
            logger.warning("Impression report failed: %s", e)
            return False

    async def report_engagement(self, ad_id: str, session_id: str,
                                turn_index: Optional[int] = None) -> bool:
        try:
            payload = {"ad_id": ad_id, "session_id": session_id}
            if turn_index is not None:
                payload["turn_index"] = turn_index
            response = await self._client.post("/events/engagement", json=payload)
            return response.status_code == 200
        except Exception as e:
            logger.warning("Engagement report failed: %s", e)
            return False

    async def get_facts(self, ad_id: str) -> List[Fact]:
        try:
            response = await self._client.get(f"/ads/{ad_id}/facts")
            response.raise_for_status()
            data = response.json()
            return [Fact(claim=f["claim"], source_url=f.get("source_url"))
                    for f in data.get("approved_facts", [])]
        except Exception as e:
            logger.warning("Facts fetch failed: %s", e)
            return []
