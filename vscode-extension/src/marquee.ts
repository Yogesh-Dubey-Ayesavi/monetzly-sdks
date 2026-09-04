// Scrolling-text renderer for the status bar, same trick as the terminal
// plugin's statusline.mjs marquee(): a fixed-width window sliding over
// `text + separator` on a loop. Pure function, no vscode/timer imports, so
// it's testable on its own.
export function marqueeFrame(text: string, width: number, step: number): string {
  const loop = `${text}   ·   `;
  const tick = step % loop.length;
  let repeated = loop;
  while (repeated.length < tick + width) repeated += loop;
  return repeated.slice(tick, tick + width);
}

// VSCode restricts statusBarItem.backgroundColor to warningBackground /
// errorBackground only (so extensions can't turn the status bar into a
// billboard) — foreground `color` isn't restricted the same way, so this is
// the one place a rotating accent is actually available without misusing
// the warning/error colors or getting flagged in marketplace review.
export const ACCENT_THEME_COLORS = [
  "charts.orange",
  "charts.yellow",
  "charts.green",
  "charts.blue",
  "charts.purple",
];

export function accentForStep(step: number, everyNFrames = 20): string {
  return ACCENT_THEME_COLORS[Math.floor(step / everyNFrames) % ACCENT_THEME_COLORS.length];
}

// Tock, the mascot, as a Braille sprite — the same figure the terminal
// statusline draws. One Braille cell is a 2x4 pixel grid; three cells give a
// 6x4 canvas: an eyes row on top, a gap, then two bar rows (the design
// doc's three bars compress to two at this resolution). It reads as a tiny
// pixel figure. The status bar strips ANSI and only tints the whole item
// one color, so unlike the terminal there's no separate accent nub — the
// item's rotating `color` carries the accent instead.
//
// Motion is frame-by-frame: `step` picks a pose, each hard-cutting to the
// next (the mechanical steps() read). Only the eyes move.
const BRAILLE_BITS: readonly (readonly number[])[] = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
];

const TOCK_EYE_COLS: readonly (readonly number[])[] = [
  [1, 4], // forward
  [0, 3], // glance left
  [2, 5], // glance right
  [1, 4], // forward
  [],     // blink
];

export function tockSprite(step: number): string {
  const eyes = TOCK_EYE_COLS[Math.floor(step / 6) % TOCK_EYE_COLS.length];
  const grid: number[][] = [
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1],
    [0, 1, 1, 1, 1, 0],
  ];
  for (const c of eyes) grid[0][c] = 1;

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
