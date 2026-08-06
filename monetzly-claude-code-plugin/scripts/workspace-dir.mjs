#!/usr/bin/env node
// Where a project's Monetzly state (signals, session_id) lives, and
// keeping it out of `git status` without touching anything outside the
// project.
//
// This went through two designs before landing here:
//   1. <project>/.monetzly/ — litters that folder into every repo opened
//      in a dev-host window, including ones unrelated to this work.
//   2. ~/.monetzly/workspaces/<hash>/ — solves the litter, but breaks
//      under sandboxed agents that are permitted to write inside their
//      workspace but denied writing outside it (home dir is outside).
//      Silent write failures there are worse than cosmetic litter.
// Landing back on <project>/.monetzly/, but self-excluded via
// .git/info/exclude — a per-clone, local-only ignore list that's never
// committed and never touches the team's shared .gitignore — so it still
// never shows up in `git status`, without requiring any write outside the
// project tree an agent is already permitted to touch.
import { mkdirSync, appendFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

export function workspaceStateDir(projectRoot) {
  return join(resolve(projectRoot), ".monetzly");
}

export function ensureGitExcluded(projectRoot) {
  const gitDir = join(resolve(projectRoot), ".git");
  if (!existsSync(gitDir)) return; // not a git repo — nothing to exclude from

  const excludePath = join(gitDir, "info", "exclude");
  const entry = ".monetzly/";
  let current = "";
  try {
    current = readFileSync(excludePath, "utf8");
  } catch {
    // .git/info/exclude doesn't exist yet in this repo — appendFileSync below creates it
  }
  if (current.includes(entry)) return;

  mkdirSync(join(gitDir, "info"), { recursive: true });
  appendFileSync(excludePath, (current.endsWith("\n") || !current ? "" : "\n") + entry + "\n");
}
