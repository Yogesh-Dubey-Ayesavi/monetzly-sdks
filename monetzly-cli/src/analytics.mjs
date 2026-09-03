// Anonymous product analytics for the monetzly CLI (shared by the Claude
// Code plugin and the VSCode extension). Forwarded through the Monetzly
// worker's unauthenticated /v2/telemetry route (which holds the real
// PostHog key server-side) so the CLI never ships any analytics secret —
// separate from the ad-billing events the worker writes to Supabase.
import { createHash } from "node:crypto";
import { hostname, homedir } from "node:os";
import { resolveConfig } from "./config.mjs";

function distinctId() {
  return createHash("sha256").update(`${hostname()}:${homedir()}`).digest("hex").slice(0, 32);
}

// Fire-and-forget with a short timeout so a slow/offline network never
// delays or fails the CLI command it's attached to.
export async function capture(event, properties = {}) {
  if (process.env.MONETZLY_ANALYTICS === "0") return;
  const { baseUrl } = resolveConfig();
  try {
    await fetch(`${baseUrl}/telemetry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, distinct_id: distinctId(), properties }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // best-effort only
  }
}
