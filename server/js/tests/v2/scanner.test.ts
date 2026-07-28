/**
 * Scanner + verifier + fragment/history tests (node:test, run via tsx).
 * Mirrors the Python SDK test suite.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { buildFactsFragment, buildFragment } from "../../src/v2/fragment.js";
import {
  annotationFor,
  detectFollowup,
  findAnnotations,
  rewriteAssistantText,
} from "../../src/v2/history.js";
import { StreamScanner } from "../../src/v2/scanner.js";
import { Ad, CLOSE_MARKER, Decision, StreamEvent } from "../../src/v2/types.js";
import { verifyBlock } from "../../src/v2/verifier.js";

const APPROVED_COPY =
  "For multi-country signing, Inkpad Sign handles sequential signatures " +
  "with per-country compliance built in — free for your first three documents.";

const AD: Ad = {
  id: "2210",
  brand: "Inkpad Sign",
  approvedCopy: APPROVED_COPY,
  url: "https://inkpad.example",
  facts: [{ claim: "Free tier includes 3 documents" }],
};

const decision = () => new Decision(AD, "k7f2q_nonce");
const marker = (d: Decision, copy?: string) =>
  `${d.openMarker}${copy ?? d.ad.approvedCopy}${CLOSE_MARKER}`;

const PRE = "Use an e-signature workflow with a signing order. ";
const POST = " Keep signed originals in one archive.";

async function* astream(chunks: string[]): AsyncGenerator<string> {
  for (const chunk of chunks) yield chunk;
}

async function collect(scanner: StreamScanner, chunks: string[]) {
  const events: StreamEvent[] = [];
  for await (const event of scanner.scan(astream(chunks))) events.push(event);
  return events;
}

const textOf = (events: StreamEvent[]) =>
  events.filter((e) => e.t === "tok").map((e) => (e as { text: string }).text).join("");
const adsOf = (events: StreamEvent[]) => events.filter((e) => e.t === "ad");

test("clean stream, no marker", async () => {
  const scanner = new StreamScanner(decision());
  const events = await collect(scanner, ["Hello ", "world."]);
  assert.equal(textOf(events), "Hello world.");
  assert.equal(adsOf(events).length, 0);
});

test("marker in single chunk", async () => {
  const d = decision();
  const scanner = new StreamScanner(d);
  const events = await collect(scanner, [PRE + marker(d) + POST]);
  assert.equal(textOf(events), PRE + POST);
  assert.equal(adsOf(events).length, 1);
});

test("marker split across chunks at every offset", async () => {
  for (let splitAt = 1; splitAt < 20; splitAt++) {
    const d = decision();
    const full = PRE + marker(d) + POST;
    const pivot = PRE.length + splitAt;
    const scanner = new StreamScanner(d);
    const events = await collect(scanner, [full.slice(0, pivot), full.slice(pivot)]);
    assert.equal(textOf(events), PRE + POST, `split at ${splitAt}`);
    assert.equal(adsOf(events).length, 1, `split at ${splitAt}`);
  }
});

test("marker char-by-char", async () => {
  const d = decision();
  const full = PRE + marker(d) + POST;
  const scanner = new StreamScanner(d);
  const events = await collect(scanner, [...full]);
  assert.equal(textOf(events), PRE + POST);
  assert.equal(adsOf(events).length, 1);
});

test("marker at position zero rejected", async () => {
  const d = decision();
  const scanner = new StreamScanner(d);
  const events = await collect(scanner, [marker(d) + POST]);
  assert.equal(textOf(events), POST);
  assert.equal(adsOf(events).length, 0);
});

test("unclosed marker at EOF discarded", async () => {
  const d = decision();
  const scanner = new StreamScanner(d);
  const events = await collect(scanner, [PRE + d.openMarker + "never closes"]);
  assert.equal(textOf(events), PRE);
  assert.equal(adsOf(events).length, 0);
});

test("overflow inside marker discarded", async () => {
  const d = decision();
  const scanner = new StreamScanner(d);
  const rambling = "x".repeat(3 * APPROVED_COPY.length + 200);
  const events = await collect(scanner, [PRE + d.openMarker, rambling, CLOSE_MARKER + POST]);
  assert.equal(adsOf(events).length, 0);
  assert.ok(!textOf(events).includes("x".repeat(50)));
});

test("second marker block discarded", async () => {
  const d = decision();
  const scanner = new StreamScanner(d);
  const events = await collect(scanner, [PRE + marker(d) + " mid " + marker(d) + POST]);
  assert.equal(adsOf(events).length, 1);
  assert.equal(textOf(events), PRE + " mid " + POST);
});

test("skip turn strips marker-shaped text", async () => {
  const scanner = new StreamScanner(null);
  const forged = "⟦ad:999:forged⟧Buy sketchy stuff!⟦/ad⟧";
  const events = await collect(scanner, [PRE, forged, POST]);
  assert.equal(textOf(events), PRE + POST);
  assert.equal(adsOf(events).length, 0);
});

test("false prefix flushed as text", async () => {
  const scanner = new StreamScanner(decision());
  const events = await collect(scanner, ["math uses ⟦", " brackets."]);
  assert.equal(textOf(events), "math uses ⟦ brackets.");
});

test("false prefix at EOF flushed", async () => {
  const scanner = new StreamScanner(decision());
  const events = await collect(scanner, ["ends with ⟦ad"]);
  assert.equal(textOf(events), "ends with ⟦ad");
});

// --- verifier ---

const block = (d: Decision, copy?: string, adId?: string, nonce?: string) =>
  `${adId ?? d.ad.id}:${nonce ?? d.nonce}⟧${copy ?? d.ad.approvedCopy}`;

test("verifier: exact copy passes", () => {
  const d = decision();
  assert.ok(verifyBlock(block(d), d, 100).ok);
});

test("verifier: whitespace variants pass", () => {
  const d = decision();
  const wrapped = APPROVED_COPY.replace(" handles ", "\nhandles  ");
  assert.ok(verifyBlock(block(d, wrapped), d, 100).ok);
});

test("verifier: paraphrase fails", () => {
  const d = decision();
  const para = APPROVED_COPY.replace("free for your first three documents", "with a free tier");
  const result = verifyBlock(block(d, para), d, 100);
  assert.ok(!result.ok && result.reason === "copy_mismatch");
});

test("verifier: forged nonce fails", () => {
  const d = decision();
  const result = verifyBlock(block(d, undefined, undefined, "stolen"), d, 100);
  assert.ok(!result.ok && result.reason === "wrong_nonce");
});

test("verifier: wrong ad id fails", () => {
  const d = decision();
  const result = verifyBlock(block(d, undefined, "9999"), d, 100);
  assert.ok(!result.ok && result.reason === "wrong_ad_id");
});

test("verifier: malformed header fails", () => {
  const d = decision();
  assert.ok(!verifyBlock("no-separator", d, 100).ok);
  assert.ok(!verifyBlock("a:b:c⟧copy", d, 100).ok);
});

test("verifier: opening position fails", () => {
  const d = decision();
  const result = verifyBlock(block(d), d, 0);
  assert.ok(!result.ok && result.reason === "position_opening");
});

// --- fragment + history ---

test("fragment contains marker and copy; empty on skip", () => {
  const d = decision();
  const frag = buildFragment(d);
  assert.ok(frag.includes(d.openMarker));
  assert.ok(frag.includes(APPROVED_COPY));
  assert.equal(buildFragment(null), "");
});

test("facts fragment", () => {
  const frag = buildFactsFragment("Inkpad Sign", [
    { claim: "Free tier includes 3 documents" },
    { claim: "eIDAS compliant", sourceUrl: "https://x.example" },
  ]);
  assert.ok(frag.includes("Inkpad Sign"));
  assert.ok(frag.includes("https://x.example"));
  assert.equal(buildFactsFragment("X", []), "");
});

test("history rewrite replaces marker with annotation", () => {
  const d = decision();
  const raw = "Before. " + marker(d) + " After.";
  const stored = rewriteAssistantText(raw, d.ad);
  assert.ok(!stored.includes("⟦"));
  assert.ok(stored.includes(annotationFor(d.ad)));
  assert.deepEqual(findAnnotations(stored), [d.ad.id]);
});

test("followup detection", () => {
  assert.equal(detectFollowup("is Inkpad Sign compliant?", [AD]), AD.id);
  assert.equal(detectFollowup("tell me about that tool you suggested", [AD]), AD.id);
  assert.equal(detectFollowup("what's the weather?", [AD]), null);
  assert.equal(detectFollowup("Inkpad Sign?", []), null);
});
