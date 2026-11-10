import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AgentState } from "./state.js";
import type { AgentId } from "./types.js";

/** `.git/info/exclude` of this checkout (worktrees have their own). */
export function excludePath(root: string): string {
  const rel = execFileSync("git", ["rev-parse", "--git-path", "info/exclude"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  return resolve(root, rel);
}

/** Every path agents-setup created and git should not see. */
export function generatedPaths(state: AgentState): string[] {
  const merged = Object.entries(state.merged)
    .filter(([, record]) => record.created)
    .map(([path]) => path);
  return [...Object.keys(state.files), ...Object.keys(state.symlinks), ...merged];
}

function pattern(path: string): string {
  // Anchored to the root; gitignore wildcards and a trailing space escaped.
  return `/${path.replace(/[\\*?[\]]/g, "\\$&").replace(/ $/, "\\ ")}`;
}

/** Replaces this agent's managed block; an empty list removes the block. */
export function updateExclude(root: string, agent: AgentId, paths: string[]): void {
  const file = excludePath(root);
  const start = `# >>> agents-setup ${agent}`;
  const end = `# <<< agents-setup ${agent}`;
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";

  const lines = text.split("\n");
  const from = lines.indexOf(start);
  const to = lines.indexOf(end);
  const kept = from !== -1 && to > from ? [...lines.slice(0, from), ...lines.slice(to + 1)] : lines;
  let next = kept.join("\n");

  if (paths.length > 0) {
    if (next !== "" && !next.endsWith("\n")) next += "\n";
    next += `${[start, ...paths.map(pattern), end].join("\n")}\n`;
  }
  if (next === text) return;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, next);
}
