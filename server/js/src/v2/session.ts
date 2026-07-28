/**
 * High-level Mode B session API. Mirrors monetzly/v2/session.py.
 *
 *   const mz = new Monetzly({ apiKey, baseUrl: "http://localhost:8080/api/v2" });
 *   const session = mz.session(conversationId);
 *
 *   const decision = await session.decide(userMessage);
 *   const sysPrompt = session.augmentSystemPrompt(basePrompt, decision);
 *   for await (const event of session.stream(modelStream, decision)) { ... }
 *   const stored = session.rewriteHistory(rawModelText);
 */
import { AdsClient, AdsClientOptions } from "./client.js";
import { buildFactsFragment, buildFragment } from "./fragment.js";
import { detectFollowup, rewriteAssistantText } from "./history.js";
import { StreamScanner } from "./scanner.js";
import { Ad, Decision, StreamEvent } from "./types.js";

export class MonetzlySession {
  /** Vague references only count as follow-ups this many turns after an ad. */
  static readonly REFERRING_WINDOW_TURNS = 3;

  readonly sessionId: string;
  turnIndex = 0;
  readonly shownAds: Ad[] = [];
  private lastVerifiedAd: Ad | null = null;
  private lastAdTurn: number | null = null;

  constructor(
    private readonly client: AdsClient,
    sessionId: string,
  ) {
    this.sessionId = sessionId;
  }

  async decide(userMessage: string): Promise<Decision | null> {
    this.turnIndex += 1;
    return this.client.decide(this.sessionId, userMessage, this.turnIndex);
  }

  augmentSystemPrompt(basePrompt: string, decision: Decision | null): string {
    return basePrompt + buildFragment(decision);
  }

  async *stream(
    modelStream: AsyncIterable<string>,
    decision: Decision | null,
  ): AsyncGenerator<StreamEvent> {
    const scanner = new StreamScanner(decision);
    this.lastVerifiedAd = null;
    for await (const event of scanner.scan(modelStream)) {
      if (event.t === "ad") {
        this.lastVerifiedAd = event.ad;
        this.shownAds.push(event.ad);
        this.lastAdTurn = this.turnIndex;
        // Bill exactly once, off the hot path.
        void this.client.reportImpression(event.nonce, event.ad.id, this.sessionId);
      }
      yield event;
    }
  }

  rewriteHistory(rawAssistantText: string): string {
    return rewriteAssistantText(rawAssistantText, this.lastVerifiedAd);
  }

  detectFollowup(userMessage: string): string | null {
    const adIsRecent =
      this.lastAdTurn !== null &&
      this.turnIndex - this.lastAdTurn <= MonetzlySession.REFERRING_WINDOW_TURNS;
    return detectFollowup(userMessage, this.shownAds, adIsRecent);
  }

  /** Fetch approved facts and bill an engagement event. */
  async factsFragment(adId: string): Promise<string> {
    const facts = await this.client.getFacts(adId);
    if (!facts.length) return "";
    const brand =
      this.shownAds.find((a) => a.id === adId)?.brand ?? "the sponsor";
    void this.client.reportEngagement(adId, this.sessionId, this.turnIndex);
    return buildFactsFragment(brand, facts);
  }
}

export class Monetzly {
  private readonly client: AdsClient;

  constructor(options: AdsClientOptions) {
    this.client = new AdsClient(options);
  }

  session(sessionId: string): MonetzlySession {
    return new MonetzlySession(this.client, sessionId);
  }
}
