import type { AgentId } from "./types.js";

/** What an adapter asks the apply step to do. Paths are repo-relative POSIX paths. */
export type Operation =
  | { kind: "write"; path: string; content: string; readonly?: boolean; approval?: string }
  | { kind: "symlink"; path: string; target: string; approval?: string }
  /** Sets one owned key of a JSON object file. */
  | { kind: "merge-json"; path: string; key: string[]; value: unknown; approval?: string }
  /** Appends one owned item to the array at `key`, after the user's items. */
  | { kind: "merge-json-item"; path: string; key: string[]; value: unknown; approval?: string };

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

export interface Plan {
  agent: AgentId;
  scopes: string[];
  operations: Operation[];
  approvals: ApprovalItem[];
  warnings: string[];
}
