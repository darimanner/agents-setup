import type { AgentId } from "../core/types.js";
import { claudeCode } from "./claude-code.js";
import type { Adapter } from "./types.js";

export const ADAPTERS: Partial<Record<AgentId, Adapter>> = {
  "claude-code": claudeCode,
};
