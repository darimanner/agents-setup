export type AgentId = "claude-code" | "codex" | "opencode" | "hermes";

export const AGENT_IDS: readonly AgentId[] = ["claude-code", "codex", "opencode", "hermes"];

export interface Diagnostic {
  level: "error" | "warning";
  /** Repo-relative path of the file the diagnostic is about. */
  file: string;
  message: string;
}

/** Names that end up in generated paths: rule file stems, skill dirs, server and hook keys. */
export const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface LayerMeta {
  /** "." for the root, otherwise the repo-relative directory. */
  path: string;
  description?: string;
}

export interface Rule {
  layer: string;
  name: string;
  file: string;
  description?: string;
  paths?: string[];
  body: string;
}

export interface McpServer {
  layer: string;
  name: string;
  transport: "http" | "stdio";
  url?: string;
  headers?: Record<string, string>;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

export const HOOK_EVENTS = ["session-start", "before-tool", "after-edit", "stop"] as const;

export type HookEvent = (typeof HOOK_EVENTS)[number];

export interface Hook {
  layer: string;
  name: string;
  event: HookEvent;
  match?: string;
  command: string;
}

export interface PluginRef {
  layer: string;
  /** Agent id; may be one agents-setup has no adapter for yet. */
  agent: string;
  name: string;
  marketplace?: string;
  source?: string;
  version?: string;
}

export interface Skill {
  layer: string;
  name: string;
  dir: string;
  description: string;
}
