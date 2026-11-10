import type { AgentId } from "./types.js";

/** What an adapter asks the apply step to do. Paths are repo-relative POSIX paths. */
export type Operation =
  | { kind: "write"; path: string; content: string; readonly?: boolean; approval?: string }
  | { kind: "symlink"; path: string; target: string; approval?: string }
  /** Sets one owned key of a JSON object file. */
  | { kind: "merge-json"; path: string; key: string[]; value: unknown; approval?: string }
  /**
   * Owns one item of the array at `key`: appended after the user's items, replaced in place
   * when its value changes. `id` is stable across syncs (for example the hook's name).
   */
  | {
      kind: "merge-json-item";
      path: string;
      key: string[];
      id: string;
      value: unknown;
      approval?: string;
    };

export interface ApprovalItem {
  /** `<kind>:<layer>:<name>` */
  id: string;
  kind: "hook" | "mcp" | "plugin";
  layer: string;
  name: string;
  fingerprint: string;
  /** What the fingerprint covers, shown to the user for review. */
  definition: unknown;
}

/** Items some operation installs; any other would wait for approval forever. */
export function usedApprovals(approvals: ApprovalItem[], operations: Operation[]): ApprovalItem[] {
  const used = new Set(operations.map((op) => op.approval));
  return approvals.filter((a) => used.has(a.id));
}

export interface Plan {
  agent: AgentId;
  scopes: string[];
  operations: Operation[];
  approvals: ApprovalItem[];
  warnings: string[];
  /** Items left out because they only exist in the agent's global config, which needs consent. */
  globalSkipped?: { file: string; items: string[] };
}
