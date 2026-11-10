import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Io } from "../cli.js";
import { contentHash } from "../core/hash.js";
import { discoverLayers } from "../core/layers.js";
import { layerPrefix, loadLayers } from "../core/load.js";
import { findRepoRoot, listRepoFiles } from "../core/repo.js";
import { AGENT_IDS, type AgentId, type LayerContent } from "../core/types.js";
import { plural } from "./format.js";

/** Raw state JSON; the typed state belongs to the apply engine. */
export function readStateFile(root: string, agent: AgentId): unknown {
  const file = join(root, ".agents", ".state", `${agent}.json`);
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function summary(content: LayerContent): string {
  const counts = [
    [content.rules.length, "rule"],
    [content.skills.length, "skill"],
    [content.mcp.length, "MCP server"],
    [content.hooks.length, "hook"],
    [content.plugins.length, "plugin"],
  ] as const;
  const parts = counts.filter(([n]) => n > 0).map(([n, noun]) => plural(n, noun));
  const text = parts.length ? parts.join(", ") : "empty";
  return content.meta.description ? `${content.meta.description}: ${text}` : text;
}

export async function statusCommand(cwd: string, io: Io): Promise<number> {
  const root = findRepoRoot(cwd);
  const files = listRepoFiles(root);
  const layers = discoverLayers(files);
  const { contents, diagnostics } = loadLayers(root, files, layers);

  const width = Math.max(...layers.map((l) => l.length)) + 2;
  io.stdout("Layers:\n");
  for (const content of contents) {
    const base = `${layerPrefix(content.meta.path)}.agents/`;
    const errors = diagnostics.filter((d) => d.level === "error" && d.file.startsWith(base));
    const flag = errors.length
      ? ` (${plural(errors.length, "error")}, run agents-setup validate)`
      : "";
    io.stdout(`  ${content.meta.path.padEnd(width)}${summary(content)}${flag}\n`);
  }

  io.stdout("\n");
  let installed = 0;
  for (const agent of AGENT_IDS) {
    const state = readStateFile(root, agent);
    if (state === undefined) continue;
    installed++;
    const scopes = (state as { scopes?: unknown } | null)?.scopes;
    const recorded = (state as { contentHash?: unknown } | null)?.contentHash;
    if (!Array.isArray(scopes) || typeof recorded !== "string") {
      io.stdout(`${agent}: state file is unreadable, run agents-setup install again\n`);
      continue;
    }
    const selected = layers.filter((l) => scopes.includes(l));
    const fresh = contentHash(root, files, selected) === recorded;
    io.stdout(
      `${agent}: scopes ${scopes.join(", ")}, ${fresh ? "up to date" : "out of date, run agents-setup sync"}\n`,
    );
  }
  if (installed === 0) io.stdout("No agents installed. Run agents-setup install.\n");
  return 0;
}
