import { ADAPTERS } from "../adapters/index.js";
import type { Plan } from "../core/plan.js";
import { uninstall } from "../core/uninstall.js";
import type { Io } from "../io.js";
import { loadState, openRepo, printReport } from "./pipeline.js";
import { targetAgents } from "./sync.js";

export const uninstallOptions = {
  agent: { type: "string", multiple: true },
  "dry-run": { type: "boolean" },
  force: { type: "boolean" },
} as const;

export interface UninstallValues {
  agent?: string[];
  "dry-run"?: boolean;
  force?: boolean;
}

export async function uninstallCommand(
  values: UninstallValues,
  cwd: string,
  io: Io,
): Promise<number> {
  const repo = openRepo(cwd);
  const agents = targetAgents(repo, values.agent);
  if (agents.length === 0) {
    io.stdout("No agents installed.\n");
    return 0;
  }
  const dryRun = values["dry-run"] === true;
  let result = 0;
  for (const agent of agents) {
    const state = loadState(repo.root, agent);
    if (!state) {
      io.stdout(`${agent} is not installed\n`);
      continue;
    }
    const report = uninstall(repo.root, state, {
      force: values.force === true,
      dryRun,
      external: ADAPTERS[agent]?.externalFiles?.() ?? [],
    });
    const plan: Plan = { agent, scopes: state.scopes, operations: [], approvals: [], warnings: [] };
    printReport(io, plan, report, { dryRun });
    if (report.errors.length > 0) result = 1;
  }
  return result;
}
