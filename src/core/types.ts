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

export interface Skill {
  layer: string;
  name: string;
  dir: string;
  description: string;
}
