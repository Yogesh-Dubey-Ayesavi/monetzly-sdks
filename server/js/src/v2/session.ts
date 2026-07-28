/**
 * High-level Mode B session API. Mirrors monetzly/v2/session.py.
 *
 *   const mz = new Monetzly({ apiKey, baseUrl: "http://localhost:8080/v2" });
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
import { Ad, Decision, Fact, StreamEvent } from "./types.js";

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

  /**
   * Alias for decide(). Use case: the query-level step — call this once
   * per user turn, before building the prompt or calling the model, to
   * find out which ad (if any) is eligible this turn.
   */
  async prepareAd(userMessage: string): Promise<Decision | null> {
    return this.decide(userMessage);
  }

  /**
   * Alias for augmentSystemPrompt(). Use case: the prompt-level step —
   * merges your static system prompt (guidelines: how/when to include a
   * sponsored suggestion) with the turn-specific ad fragment from
   * prepareAd()'s Decision. Your basePrompt itself can be defined once and
   * reused across turns; only this merge happens per turn.
   */
  preparePrompt(basePrompt: string, decision: Decision | null): string {
    return this.augmentSystemPrompt(basePrompt, decision);
  }

  /**
   * Alias for stream(). Use case: wrap the model's raw output stream to
   * scan for the ad marker, verify it against the Decision, bill the
   * impression, and yield clean TokenEvent/AdEvent chunks. Only the node
   * producing the user-facing reply should call this — internal/agent hops
   * in a multi-step workflow never see raw model output through here.
   */
  watch(
    modelStream: AsyncIterable<string>,
    decision: Decision | null,
  ): AsyncGenerator<StreamEvent> {
    return this.stream(modelStream, decision);
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

  /**
   * Fetch approved facts for a shown ad and bill an engagement event.
   * Intended as the backing call for a provider tool-call handler (the
   * model recognizes the follow-up itself and requests facts).
   */
  async facts(adId: string): Promise<Fact[]> {
    const facts = await this.client.getFacts(adId);
    if (facts.length) {
      void this.client.reportEngagement(adId, this.sessionId, this.turnIndex);
    }
    return facts;
  }

  /** Prompt-fragment variant of facts() for hosts without tool calling. */
  async factsFragment(adId: string): Promise<string> {
    const facts = await this.facts(adId);
    if (!facts.length) return "";
    const brand =
      this.shownAds.find((a) => a.id === adId)?.brand ?? "the sponsor";
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
