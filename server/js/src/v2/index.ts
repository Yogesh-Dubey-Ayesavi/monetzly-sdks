/**
 * monetzly v2 — Mode B native ad integration.
 * Decision API client, prompt fragment builder, stream scanner/verifier,
 * and history rewriter. No gRPC; uses native fetch (Node 18+).
 */
export * as adapters from "./adapters/index.js";
export { AdsClient } from "./client.js";
export type { AdsClientOptions } from "./client.js";
export { buildFactsFragment, buildFragment } from "./fragment.js";
export {
  annotationFor,
  detectFollowup,
  findAnnotations,
  rewriteAssistantText,
} from "./history.js";
export { GENERIC_OPEN, MAX_HOLDBACK, StreamScanner } from "./scanner.js";
export { Monetzly, MonetzlySession } from "./session.js";
export {
  CLOSE_MARKER,
  Decision,
  eventToWire,
  rawMarker,
} from "./types.js";
export type {
  Ad,
  AdEvent,
  Fact,
  StreamEvent,
  TokenEvent,
  VerifyResult,
} from "./types.js";
export { MAX_AD_FRACTION, verifyBlock } from "./verifier.js";
