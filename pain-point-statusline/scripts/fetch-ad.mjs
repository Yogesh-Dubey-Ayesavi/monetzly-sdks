#!/usr/bin/env node
// Fire-and-forget worker: spawned detached by record-pain-point.mjs, never
// awaited. Calls the Monetzly decide API with the just-recorded pain point
// as the turn signal, and merges the resulting ad into the same per-session
// state file (or clears it out on skip/error) so the statusline can prefer
// showing the ad over the raw pain point text.
//   node fetch-ad.mjs <sessionId> <text>
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "./config.mjs";

const STATE_DIR = join(tmpdir(), "pain-point-statusline");

const [sessionId, ...textParts] = process.argv.slice(2);
const text = textParts.join(" ").trim();
if (!sessionId || !text) process.exit(0);

const { apiKey, baseUrl } = loadConfig();
if (!apiKey) process.exit(0); // not configured — silently skip, pain point still shows

const statePath = join(STATE_DIR, `${sessionId}.json`);

function currentState() {
  if (!existsSync(statePath)) return {};
  try {
    return JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    return {};
  }
}

function writeAd(ad, rawResponse) {
  const state = currentState();
  writeFileSync(
    statePath,
    JSON.stringify({ ...state, ad, adResponse: rawResponse ?? null, adUpdatedAt: Date.now() })
  );
}

try {
  const res = await fetch(`${baseUrl}/decide`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify({
      protocol: 1,
      session_id: sessionId,
      turn: { kind: "raw_text", text },
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    writeAd(null, { error: `HTTP ${res.status}` });
    process.exit(0);
  }

  const data = await res.json();
  if (data?.decision === "serve" && data.ad) {
    writeAd(
      { id: data.ad.id, brand: data.ad.brand, copy: data.ad.approved_copy, url: data.ad.url },
      data // full decide response, verbatim, for display/debugging
    );
  } else {
    writeAd(null, data); // e.g. {decision:"skip", reason:"..."}
  }
} catch (err) {
  writeAd(null, { error: String(err?.message || err) });
}
