import type { AgentId } from "../core/types.js";
import type { Io } from "../io.js";
import {
  approveAll,
  CommandError,
  execute,
  installedAgents,
  loadState,
  openRepo,
  pendingItems,
  prepare,
  printReport,
  type Repo,
} from "./pipeline.js";

export const syncOptions = {
  agent: { type: "string", multiple: true },
  check: { type: "boolean" },
  quiet: { type: "boolean" },
  yes: { type: "boolean" },
  "dry-run": { type: "boolean" },
  force: { type: "boolean" },
} as const;

export interface SyncValues {
  agent?: string[];
  check?: boolean;
  quiet?: boolean;
  yes?: boolean;
  "dry-run"?: boolean;
  force?: boolean;
}

/** Agents to act on: the ones named, or every installed one. */
export function targetAgents(repo: Repo, named: string[] | undefined): AgentId[] {
  return (named?.length ? named : installedAgents(repo.root)) as AgentId[];
}

/** Recorded scopes that still exist; a deleted layer is dropped with a note. */
export function recordedScopes(repo: Repo, agent: AgentId, io: Io, quiet: boolean): string[] {
  const state = loadState(repo.root, agent);
  if (!state) throw new CommandError(`${agent} is not installed. Run agents-setup install.`);
  return state.scopes.filter((scope) => {
    const exists = repo.layers.includes(scope);
    if (!exists && !quiet) io.stdout(`${agent}: layer ${scope} no longer exists, dropped\n`);
    return exists;
  });
}

export async function syncCommand(values: SyncValues, cwd: string, io: Io): Promise<number> {
  const repo = openRepo(cwd);
  const agents = targetAgents(repo, values.agent);
  const quiet = values.quiet === true;
  if (agents.length === 0) {
    if (!quiet) io.stdout("No agents installed. Run agents-setup install.\n");
    return 0;
  }

  let result = 0;
  for (const agent of agents) {
    const prepared = prepare(repo, agent, recordedScopes(repo, agent, io, quiet));
    const approved = prepared.previous?.approved ?? {};
    const pending = pendingItems(prepared.plan, approved);

    if (values.check) {
      const fresh = prepared.previous?.contentHash === prepared.contentHash;
      if (!fresh || pending.length > 0) result = 1;
      if (!quiet || !fresh || pending.length > 0) {
        const parts = [fresh ? "up to date" : "out of date, run agents-setup sync"];
        if (pending.length > 0) parts.push(`${pending.length} waiting for approval`);
        io.stdout(`${agent}: ${parts.join(", ")}\n`);
      }
      continue;
    }

    const report = execute(prepared, {
      approved: values.yes ? approveAll(approved, pending) : approved,
      force: values.force === true,
      dryRun: values["dry-run"] === true,
    });
    printReport(io, prepared.plan, report, { dryRun: values["dry-run"] === true, quiet });
    if (report.errors.length > 0) result = 1;
  }
  return result;
}
