#!/usr/bin/env node
// statusLine command: reads the ad state the `monetzly` CLI wrote (via
// record-pain-point.mjs -> `monetzly signal`) and renders it. Reads from
// the project root's .monetzly/ads/, not $TMPDIR — the same file the CLI
// and, in principle, any other consumer of that project's state would
// read, instead of a plugin-private scratch file.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FRAME_STATE_DIR = join(tmpdir(), "monetzly-claude-code-plugin"); // only the scroll/color frame counter lives here — cosmetic, fine to lose on reboot
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
const workspaceRoot = input?.cwd || input?.workspace?.project_dir || input?.workspace?.current_dir;

let ad = null;
if (sessionId && workspaceRoot) {
  try {
    const statePath = join(workspaceRoot, ".monetzly", "ads", `claude-${sessionId}.json`);
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    ad = state.ad ?? null;
  } catch {
    // No state yet (first prompt, or decide() hasn't resolved) — fine, render without it.
  }
}

// Fixed 4-color accent palette, cycled per redraw rather than hashed per
// brand — same rotation the marquee step drives, so color and scroll move
// together.
const ACCENTS = [208, 220, 121, 111]; // orange, gold, mint, periwinkle

// Tock, the mascot, stands at the ends of the line as bookends. The design
// doc's Tock is the logo given limbs: two floating eyes over a stacked-bar
// body, no head. A statusline is a single text row with no vertical space
// to draw that, so Tock is a Braille sprite — one Braille cell is a 2x4
// pixel grid, and three cells give a 6x4 canvas: an eyes row, a gap row,
// then two bar rows (the doc's three bars compress to two at this
// resolution). It reads as a tiny pixel figure rather than as punctuation.
//
// Motion is frame-by-frame (no CSS keyframes in a statusline): the
// per-redraw `step` counter picks a pose, each one hard-cutting to the next
// — the steps() / mechanical read Tock is built on. Only the eyes move:
// look forward, left, right, blink. Body stays locked, like the logo.
//
// Braille (U+2800+) dot bits, per cell:
//   col0row0 0x01  col1row0 0x08
//   col0row1 0x02  col1row1 0x10
//   col0row2 0x04  col1row2 0x20
//   col0row3 0x40  col1row3 0x80
const BRAILLE_BITS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
];

// Render a 6-wide x 4-tall pixel grid as three Braille chars.
function braille6x4(grid) {
  let out = "";
  for (let cell = 0; cell < 3; cell++) {
    let v = 0;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 2; c++) {
        if (grid[r][cell * 2 + c]) v |= BRAILLE_BITS[r][c];
      }
    }
    out += String.fromCodePoint(0x2800 + v);
  }
  return out;
}

// Body is fixed: row 2 the top bar (full 6px), row 3 the lower bar (inset).
// Each pose only changes which two pixels on row 0 are the eyes.
const TOCK_EYE_COLS = [
  [1, 4], // forward
  [0, 3], // glance left
  [2, 5], // glance right
  [1, 4], // forward
  [],     // blink
];

function tockSprite(color, step) {
  const eyes = TOCK_EYE_COLS[Math.floor(step / 3) % TOCK_EYE_COLS.length];
  const grid = [
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1],
    [0, 1, 1, 1, 1, 0],
  ];
  for (const c of eyes) grid[0][c] = 1;
  return `\x1b[38;5;${color}m${braille6x4(grid)}\x1b[0m`;
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
  const framePath = join(FRAME_STATE_DIR, `${sessionId}.frame`);
  let step = 0;
  try {
    step = parseInt(readFileSync(framePath, "utf8"), 10) || 0;
  } catch {
    step = 0;
  }
  try {
    mkdirSync(FRAME_STATE_DIR, { recursive: true });
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

  const brandChip = `${bg}${black}${bold} ${brand}${reset}`;
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
  const bar = `${tockSprite(color, step)} ${fullBar(ad.brand, scrolling, color)} ${tockSprite(color, step)}`;
  line = ad.url ? hyperlink(ad.url, bar) : bar;
}

process.stdout.write(line);
