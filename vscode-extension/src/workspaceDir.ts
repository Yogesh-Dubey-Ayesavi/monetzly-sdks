// Mirrors sdks/monetzly-claude-code-plugin/scripts/workspace-dir.mjs
// exactly (same path shape, same git-exclude mechanism) so the extension
// and the skill scripts agree on where a project's signals/session_id
// live: <project>/.monetzly/, not ~/.monetzly/.
//
// A hashed folder under the home directory was tried and reverted — it
// solved cross-repo litter but breaks under sandboxed agents that can
// write inside their workspace but are denied writing outside it. Staying
// inside the project and self-excluding via .git/info/exclude (a
// per-clone, never-committed ignore list) gets the same "never shows up
// in git status" result without any write outside the project tree.
import { mkdirSync, appendFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

export function workspaceStateDir(projectRoot: string): string {
  return join(resolve(projectRoot), ".monetzly");
}

export function ensureGitExcluded(projectRoot: string): void {
  const gitDir = join(resolve(projectRoot), ".git");
  if (!existsSync(gitDir)) return;

  const excludePath = join(gitDir, "info", "exclude");
  const entry = ".monetzly/";
  let current = "";
  try {
    current = readFileSync(excludePath, "utf8");
  } catch {
    // .git/info/exclude doesn't exist yet — appendFileSync below creates it
  }
  if (current.includes(entry)) return;

  mkdirSync(join(gitDir, "info"), { recursive: true });
  appendFileSync(excludePath, (current.endsWith("\n") || !current ? "" : "\n") + entry + "\n");
}
