import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isRecord } from "./formats/common.js";
import type { AgentId } from "./types.js";

export interface MergedFile {
  /** Whether agents-setup created the file, so uninstall may delete it once empty. */
  created: boolean;
  /** `JSON.stringify(key)` -> hash of the value agents-setup wrote. */
  keys: Record<string, string>;
  /** `JSON.stringify(key)` -> item id -> hash of the array item agents-setup owns. */
  items: Record<string, Record<string, string>>;
}

export interface AgentState {
  version: 1;
  agent: AgentId;
  scopes: string[];
  contentHash: string;
  /** Written files -> hash of the content agents-setup wrote. */
  files: Record<string, { hash: string }>;
  /** Created symlinks -> their target. */
  symlinks: Record<string, string>;
  merged: Record<string, MergedFile>;
  /** Approval item id -> approved fingerprint. */
  approved: Record<string, string>;
  /** `false` once the user installed with `--no-auto-sync`; absent means on. */
  autoSync?: boolean;
  /** `true` once the user allowed entries in the agent's global config for this project. */
  allowGlobal?: boolean;
}

export class InvalidStateError extends Error {
  constructor(readonly path: string) {
    super(`Unreadable state file ${path}; delete it and run agents-setup install again`);
    this.name = "InvalidStateError";
  }
}

export function statePath(root: string, agent: AgentId): string {
  return join(root, ".agents", ".state", `${agent}.json`);
}

export function emptyState(agent: AgentId): AgentState {
  return {
    version: 1,
    agent,
    scopes: [],
    contentHash: "",
    files: {},
    symlinks: {},
    merged: {},
    approved: {},
  };
}

export function readState(root: string, agent: AgentId): AgentState | undefined {
  const path = statePath(root, agent);
  if (!existsSync(path)) return undefined;
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new InvalidStateError(path);
  }
  const fields = ["files", "symlinks", "merged", "approved"];
  if (
    !isRecord(data) ||
    data.version !== 1 ||
    data.agent !== agent ||
    !Array.isArray(data.scopes) ||
    typeof data.contentHash !== "string" ||
    !fields.every((f) => isRecord(data[f]))
  ) {
    throw new InvalidStateError(path);
  }
  return data as unknown as AgentState;
}

/** Writes atomically so a crash never leaves a half-written state file. */
export function writeState(root: string, state: AgentState): void {
  const path = statePath(root, state.agent);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(tmp, path);
}
