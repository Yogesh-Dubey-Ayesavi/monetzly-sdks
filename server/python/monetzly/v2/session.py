"""
High-level Mode B session API.

    mz = Monetzly(api_key="...", base_url="http://localhost:8080/api/v2")
    session = mz.session(session_id=conversation_id)

    decision = await session.decide(user_message)
    sys_prompt = session.augment_system_prompt(base_prompt, decision)
    async for event in session.stream(model_stream, decision):
        ...  # TokenEvent / AdEvent
    stored_text = session.rewrite_history(raw_model_text)
"""
import asyncio
import logging
from typing import AsyncIterator, List, Optional, Union

from .client import AdsClient
from .fragment import build_facts_fragment, build_fragment
from .history import detect_followup, rewrite_assistant_text
from .scanner import StreamScanner
from .types import Ad, AdEvent, Decision, TokenEvent

logger = logging.getLogger(__name__)


class MonetzlySession:
    # Vague references ("tell me more about it") only count as ad follow-ups
    # this many turns after an ad was shown.
    REFERRING_WINDOW_TURNS = 3

    def __init__(self, client: AdsClient, session_id: str):
        self._client = client
        self.session_id = session_id
        self.turn_index = 0
        self.shown_ads: List[Ad] = []
        self._last_verified_ad: Optional[Ad] = None
        self._last_ad_turn: Optional[int] = None

    async def decide(self, user_message: str) -> Optional[Decision]:
        self.turn_index += 1
        return await self._client.decide(self.session_id, user_message,
                                         turn_index=self.turn_index)

    @property
    def last_skip_reason(self) -> Optional[str]:
        return self._client.last_skip_reason

    def augment_system_prompt(self, base_prompt: str,
                              decision: Optional[Decision]) -> str:
        return base_prompt + build_fragment(decision)

    async def stream(self, model_stream: AsyncIterator[str],
                     decision: Optional[Decision]
                     ) -> AsyncIterator[Union[TokenEvent, AdEvent]]:
        scanner = StreamScanner(decision)
        self._last_verified_ad = None
        async for event in scanner.scan(model_stream):
            if isinstance(event, AdEvent):
                self._last_verified_ad = event.ad
                self.shown_ads.append(event.ad)
                self._last_ad_turn = self.turn_index
                # Bill exactly once, off the hot path.
                asyncio.create_task(self._client.report_impression(
                    event.nonce, event.ad.id, self.session_id))
            yield event

    def rewrite_history(self, raw_assistant_text: str) -> str:
        return rewrite_assistant_text(raw_assistant_text,
                                      self._last_verified_ad)

    def detect_followup(self, user_message: str) -> Optional[str]:
        ad_is_recent = (self._last_ad_turn is not None and
                        self.turn_index - self._last_ad_turn
                        <= self.REFERRING_WINDOW_TURNS)
        return detect_followup(user_message, self.shown_ads,
                               ad_is_recent=ad_is_recent)

    async def facts(self, ad_id: str):
        """Fetch approved facts for a shown ad and bill an engagement event.

        Intended as the backing call for an agent-registered tool (the model
        recognizes the follow-up itself and requests facts)."""
        facts = await self._client.get_facts(ad_id)
        if facts:
            asyncio.create_task(self._client.report_engagement(
                ad_id, self.session_id, turn_index=self.turn_index))
        return facts

    async def facts_fragment(self, ad_id: str) -> str:
        """Prompt-fragment variant of facts() for hosts without tool calling."""
        facts = await self.facts(ad_id)
        if not facts:
            return ""
        brand = next((a.brand for a in self.shown_ads if a.id == ad_id), "the sponsor")
        return build_facts_fragment(brand, facts)


class Monetzly:
    def __init__(self, api_key: str,
                 base_url: str = "https://api.monetzly.com/api/v2",
                 timeout: float = 3.0):
        self._client = AdsClient(api_key=api_key, base_url=base_url,
                                 timeout=timeout)

    def session(self, session_id: str) -> MonetzlySession:
        return MonetzlySession(self._client, session_id)

    async def aclose(self):
        await self._client.aclose()
