/**
 * Conversation-history handling: ad copy never becomes assistant "speech".
 * Mirrors monetzly/v2/history.py.
 */
import { Ad } from "./types.js";

const MARKER_RE = /⟦ad:[^⟧]*⟧[\s\S]*?⟦\/ad⟧/g;
const ANNOTATION_RE = /\[sponsored suggestion shown: ([^—\]]+) — ad:([^\]]+)\]/g;

export function annotationFor(ad: Ad): string {
  return `[sponsored suggestion shown: ${ad.brand} — ad:${ad.id}]`;
}

/** Replace any marker block with the annotation (or strip if no ad). */
export function rewriteAssistantText(rawText: string, ad: Ad | null): string {
  return rawText.replace(MARKER_RE, ad ? annotationFor(ad) : "");
}

function collapse(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const REFERRING_RE =
  /\b(that (product|tool|brand|service|offer|suggestion|company|one)|the sponsored|that ad|tell me more|more about (it|that|this)|what about (it|that)|is it (free|good|worth|expensive)|how much (is it|does it cost)|that one you (mentioned|suggested|recommended))\b/;

/**
 * Return the ad id the user appears to be asking about, if any.
 * Brand mentions match regardless of spacing/punctuation; vague referring
 * phrases only count when adIsRecent (ad shown within the last few turns).
 */
export function detectFollowup(
  userText: string,
  recentAds: Ad[],
  adIsRecent = true,
): string | null {
  if (!recentAds.length) return null;
  const collapsed = collapse(userText);
  for (const ad of [...recentAds].reverse()) {
    const brand = collapse(ad.brand);
    if (brand && collapsed.includes(brand)) return ad.id;
  }
  if (adIsRecent && REFERRING_RE.test(userText.toLowerCase())) {
    return recentAds[recentAds.length - 1]!.id;
  }
  return null;
}

/** Extract ad ids from annotations in stored history. */
export function findAnnotations(historyText: string): string[] {
  return [...historyText.matchAll(ANNOTATION_RE)].map((m) => m[2]!.trim());
}
