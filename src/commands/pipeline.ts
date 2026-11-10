import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ADAPTERS } from "../adapters/index.js";
import type { Adapter } from "../adapters/types.js";
import { type ApplyReport, applyPlan } from "../core/apply.js";
import { generatedPaths, updateExclude } from "../core/exclude.js";
import { approvalItems } from "../core/fingerprint.js";
import { contentHash } from "../core/hash.js";
import { discoverLayers, resolveScopes, UnknownScopeError } from "../core/layers.js";
import { loadLayers } from "../core/load.js";
import type { ApprovalItem, Plan } from "../core/plan.js";
import { findRepoRoot, listRepoFiles, listTrackedFiles } from "../core/repo.js";
import {
  type AgentState,
  InvalidStateError,
  readState,
  statePath,
  writeState,
} from "../core/state.js";
import { AGENT_IDS, type AgentId } from "../core/types.js";
import { validateLayers } from "../core/validate.js";
import type { Io } from "../io.js";
import { plural } from "./format.js";

/** A failure to report as a message and exit 1, without a stack trace. */
export class CommandError extends Error {}

export interface Repo {
  root: string;
  files: string[];
  layers: string[];
}

export function openRepo(cwd: string): Repo {
  const root = findRepoRoot(cwd);
  const files = listRepoFiles(root);
  return { root, files, layers: discoverLayers(files) };
}

export function supportedAgents(): AgentId[] {
  return AGENT_IDS.filter((id) => ADAPTERS[id]);
}

export function resolveAdapter(agent: string): Adapter {
  const adapter = ADAPTERS[agent as AgentId];
  if (adapter) return adapter;
  const supported = supportedAgents().join(", ");
  if (AGENT_IDS.includes(agent as AgentId)) {
    throw new CommandError(
      `${agent} has no adapter yet. Supported: ${supported}. Until then, ask the agent to set itself up from AGENTS.md.`,
    );
  }
  throw new CommandError(`Unknown agent: ${agent}. Supported: ${supported}`);
}

export function installedAgents(root: string): AgentId[] {
  return AGENT_IDS.filter((id) => existsSync(statePath(root, id)));
}

export function loadState(root: string, agent: AgentId): AgentState | undefined {
  try {
    return readState(root, agent);
  } catch (error) {
    if (error instanceof InvalidStateError) throw new CommandError(error.message);
    throw error;
  }
}

export interface Prepared {
  repo: Repo;
  adapter: Adapter;
  plan: Plan;
  contentHash: string;
  previous: AgentState | undefined;
  autoSync: boolean;
  allowGlobal: boolean;
}

/** The entry script, which session-start hooks run to sync. */
const CLI = fileURLToPath(new URL("../main.js", import.meta.url));

/** What the user chose on install; each defaults to the choice recorded last time. */
export interface Choices {
  autoSync?: boolean;
  allowGlobal?: boolean;
}

/** Everything up to the plan: scopes, layers, validation, approvals, adapter. */
export function prepare(
  repo: Repo,
  agent: AgentId,
  requested: string[],
  choices: Choices = {},
): Prepared {
  const adapter = resolveAdapter(agent);
  const previous = loadState(repo.root, agent);
  const syncOn = choices.autoSync ?? previous?.autoSync !== false;
  const allowGlobal = choices.allowGlobal ?? previous?.allowGlobal === true;
  let scopes: string[];
  try {
    scopes = resolveScopes(repo.layers, requested);
  } catch (error) {
    if (error instanceof UnknownScopeError) throw new CommandError(error.message);
    throw error;
  }
  const { contents, diagnostics } = loadLayers(repo.root, repo.files, scopes);
  diagnostics.push(...validateLayers(contents));
  const errors = diagnostics.filter((d) => d.level === "error");
  if (errors.length > 0) {
    const lines = errors.map((d) => `  ${d.file}: ${d.message}`).join("\n");
    throw new CommandError(
      `The layers have ${plural(errors.length, "error")}; nothing was installed:\n${lines}\nRun agents-setup validate for details.`,
    );
  }
  const plan = adapter.plan({
    root: repo.root,
    contents,
    approvals: approvalItems(contents, agent),
    scopes,
    ...(syncOn && { autoSync: { cli: CLI } }),
    ...(allowGlobal && { allowGlobal }),
  });
  return {
    repo,
    adapter,
    plan,
    contentHash: contentHash(repo.root, repo.files, scopes),
    previous,
    autoSync: syncOn,
    allowGlobal,
  };
}

export function pendingItems(plan: Plan, approved: Record<string, string>): ApprovalItem[] {
  return plan.approvals.filter((a) => approved[a.id] !== a.fingerprint);
}

export function approveAll(
  approved: Record<string, string>,
  items: ApprovalItem[],
): Record<string, string> {
  return { ...approved, ...Object.fromEntries(items.map((i) => [i.id, i.fingerprint])) };
}

export function execute(
  prepared: Prepared,
  options: { approved: Record<string, string>; force: boolean; dryRun: boolean },
): ApplyReport {
  const { repo, plan, previous } = prepared;
  const { state, report } = applyPlan(repo.root, plan, previous, {
    ...options,
    tracked: listTrackedFiles(repo.root),
    contentHash: prepared.contentHash,
    external: prepared.adapter.externalFiles?.() ?? [],
  });
  if (prepared.allowGlobal) state.allowGlobal = true;
  if (!prepared.autoSync) state.autoSync = false;
  if (!options.dryRun) {
    writeState(repo.root, state);
    updateExclude(repo.root, plan.agent, generatedPaths(state));
  }
  return report;
}

/** One line per pending item, readable without the JSON. */
export function describeItem(item: ApprovalItem): string {
  const d = item.definition as Record<string, unknown>;
  const where = `${item.kind} ${item.name} (${item.layer})`;
  if (item.kind === "mcp" && d.transport === "http") return `${where}: http ${String(d.url)}`;
  if (item.kind === "mcp") {
    return `${where}: runs ${[d.command, ...((d.args as string[]) ?? [])].join(" ")}`;
  }
  if (item.kind === "hook") {
    const match = d.match ? ` ${String(d.match)}` : "";
    return `${where}: on ${String(d.event)}${match} runs ${String(d.command)}`;
  }
  const from = d.marketplace ?? d.source ?? "unknown source";
  return `${where}: from ${String(from)}`;
}

export async function confirm(io: Io, question: string): Promise<boolean> {
  if (!io.prompt) return false;
  const answer = (await io.prompt(`${question} [y/N] `)).trim().toLowerCase();
  return answer === "y" || answer === "yes";
}

export function printReport(
  io: Io,
  plan: Plan,
  report: ApplyReport,
  options: { dryRun: boolean; quiet?: boolean },
): void {
  const changed =
    report.written.length + report.removed.length + report.skipped.length + report.errors.length;
  if (options.quiet && changed === 0 && report.pending.length === 0) return;

  const verb = options.dryRun ? "would " : "";
  io.stdout(
    `${plan.agent}: scopes ${plan.scopes.join(", ")}${options.dryRun ? " (dry run)" : ""}\n`,
  );
  for (const path of report.written) io.stdout(`  ${verb}write ${path}\n`);
  for (const path of report.removed) io.stdout(`  ${verb}remove ${path}\n`);
  for (const { path, reason } of report.skipped) io.stdout(`  skip ${path}: ${reason}\n`);
  for (const warning of plan.warnings) io.stdout(`  warning: ${warning}\n`);
  for (const error of report.errors) io.stdout(`  error: ${error}\n`);
  if (report.pending.length > 0) {
    io.stdout("  waiting for approval:\n");
    for (const item of report.pending) io.stdout(`    ${describeItem(item)}\n`);
    io.stdout(
      `  Review them and run agents-setup approve${plan.agent ? ` --agent ${plan.agent}` : ""}.\n`,
    );
  }
  io.stdout(
    `  ${plural(report.written.length, "change")}, ${report.removed.length} removed, ${report.skipped.length} skipped, ${report.pending.length} waiting for approval\n`,
  );
}
