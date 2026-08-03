#!/usr/bin/env node
// statusLine command: reads the state file written by the Stop hook and renders it.
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STATE_DIR = join(tmpdir(), "monetzly-claude-code-plugin");
const TARGET_WIDTH = 200; // approx full-width target; statusLine input doesn't expose real terminal cols

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

const input = readStdin();
const sessionId = input?.session_id;

let ad = null;
if (sessionId) {
  try {
    const state = JSON.parse(readFileSync(join(STATE_DIR, `${sessionId}.json`), "utf8"));
    ad = state.ad ?? null;
  } catch {
    // No state yet (first prompt) — fine, render without it.
  }
}

// Fixed 4-color accent palette, cycled per redraw rather than hashed per
// brand — same rotation the marquee step drives, so color and scroll move
// together.
const ACCENTS = [208, 220, 121, 111]; // orange, gold, mint, periwinkle

// ▚ is a literal 2x2 pixel-quadrant glyph — an actual tiny sprite, not a
// menu icon standing in for one. Bookends only, never used in the middle of
// the line, flush against the pill — no gap.
function pixelEdge(color) {
  return `\x1b[38;5;${color}m▚▞\x1b[0m`;
}

// Marquee: a wall-clock-bucketed offset only visibly moves if Claude Code
// re-invokes this script faster than the bucket size — if it polls slower,
// or two calls land in the same bucket, nothing appears to shift. Instead,
// persist a step counter per session and advance it by a fixed amount every
// single time this script runs, so the text moves on every redraw no matter
// the actual polling interval. Same counter also drives which accent color
// is showing, so the whole thing feels alive together.
const STEP = 2;
function nextStep(sessionId) {
  const framePath = join(STATE_DIR, `${sessionId}.frame`);
  let step = 0;
  try {
    step = parseInt(readFileSync(framePath, "utf8"), 10) || 0;
  } catch {
    step = 0;
  }
  try {
    writeFileSync(framePath, String(step + STEP));
  } catch {
    // non-fatal — worst case the marquee/color just doesn't advance this frame
  }
  return step;
}

function marquee(text, width, step) {
  const loop = `${text}   ·   `;
  const tick = step % loop.length;
  let repeated = loop;
  while (repeated.length < tick + width) repeated += loop;
  return repeated.slice(tick, tick + width);
}

// The host that renders this (VS Code's Claude Code panel) collapses every
// background-color segment in a line into one flat highlight -- a two-tone
// powerline chip is wasted effort there, only weight/italic survive. So:
// one flat accent pill, all hierarchy done with bold vs. dim/italic text,
// no separate "ad" label cluttering it.
function fullBar(brand, scrollingText, color) {
  const bg = `\x1b[48;5;${color}m`;
  const black = `\x1b[38;5;16m`;
  const dim = `\x1b[38;5;238m`;
  const bold = `\x1b[1m`;
  const italic = `\x1b[3m`;
  const reset = `\x1b[0m`;

  const brandChip = `${bg}${black}${bold} \u2726 ${brand}${reset}`;
  // Box-drawing bars (\u2502/\u2503) render as a hairline with no real weight in this
  // host's font, bold or not. The interpunct already proven to render fine
  // elsewhere in this bar (marquee separators) is the safer bet.
  const divider = `${bg}${dim}${bold} \u00b7 ${reset}`;
  const copy = `${bg}${black}${italic} ${scrollingText} ${reset}`;

  return `${brandChip}${divider}${copy}`;
}

// OSC 8 hyperlink — wraps the *whole rendered segment* (not the raw scrolling
// text) so marquee slicing never cuts the escape sequence itself. Terminal
// support varies (iTerm2/Kitty/WezTerm/VS Code yes, tmux/some native
// emulators no) — falls back to plain unclickable text there, harmless.
function hyperlink(url, text) {
  if (!url) return text;
  return `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`;
}

let line = ""; // nothing to show unless there's an actual ad — no pain point, no placeholder text
if (ad) {
  const step = nextStep(sessionId);
  const color = ACCENTS[Math.floor(step / 40) % ACCENTS.length]; // rotate slower than scroll
  const text = ad.url ? `${ad.copy} · ${ad.url}` : ad.copy; // copy + url scroll as one continuous stream
  const scrollWidth = Math.max(TARGET_WIDTH - 20, text.length + 10);
  // Slice on plain text first — inserting the underline escape before
  // marquee() would let it get cut mid-sequence at the wrap boundary.
  let scrolling = marquee(text, scrollWidth, step);
  if (ad.url) {
    scrolling = scrolling.split(ad.url).join(`\x1b[4m${ad.url}\x1b[24m`);
  }
  const bar = `${pixelEdge(color)} ${fullBar(ad.brand, scrolling, color)} ${pixelEdge(color)}`;
  line = ad.url ? hyperlink(ad.url, bar) : bar;
}

process.stdout.write(line);
