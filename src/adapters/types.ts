import type { ApprovalItem, Plan } from "../core/plan.js";
import type { AgentId, LayerContent } from "../core/types.js";

export interface AdapterContext {
  root: string;
  /** Loaded layers of the selected scopes, root first. */
  contents: LayerContent[];
  /** Approval items for this agent, from `approvalItems`. */
  approvals: ApprovalItem[];
  scopes: string[];
}

/** Turns layers into a plan for one agent. Never touches the filesystem except to read. */
export interface Adapter {
  id: AgentId;
  name: string;
  plan(ctx: AdapterContext): Plan;
}
