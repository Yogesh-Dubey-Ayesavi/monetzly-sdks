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
