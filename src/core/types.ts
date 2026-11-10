export type AgentId = "claude-code" | "codex" | "opencode" | "hermes";

export const AGENT_IDS: readonly AgentId[] = ["claude-code", "codex", "opencode", "hermes"];

export interface Diagnostic {
  level: "error" | "warning";
  /** Repo-relative path of the file the diagnostic is about. */
  file: string;
  message: string;
}
