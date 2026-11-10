import { readdirSync, rmdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { type ApplyReport, applyPlan } from "./apply.js";
import { generatedPaths, updateExclude } from "./exclude.js";
import { listTrackedFiles } from "./repo.js";
import { type AgentState, statePath, writeState } from "./state.js";

/** Removes exactly what `state` says agents-setup wrote, keeping anything the user changed. */
export function uninstall(
  root: string,
  state: AgentState,
  options: { force: boolean; dryRun: boolean },
): ApplyReport {
  const empty = { agent: state.agent, scopes: [], operations: [], approvals: [], warnings: [] };
  const result = applyPlan(root, empty, state, {
    approved: {},
    force: options.force,
    dryRun: options.dryRun,
    tracked: listTrackedFiles(root),
    contentHash: "",
  });
  if (options.dryRun) return result.report;

  const remaining = generatedPaths(result.state);
  updateExclude(root, state.agent, remaining);
  if (remaining.length > 0 || Object.keys(result.state.merged).length > 0) {
    // Something could not be removed (an unreadable JSON file): keep tracking it.
    writeState(root, result.state);
  } else {
    const file = statePath(root, state.agent);
    rmSync(file, { force: true });
    const dir = dirname(file);
    if (readdirSync(dir).length === 0) rmdirSync(dir);
  }
  return result.report;
}
