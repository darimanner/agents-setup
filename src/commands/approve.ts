import type { Io } from "../io.js";
import {
  approveAll,
  CommandError,
  confirm,
  describeItem,
  execute,
  openRepo,
  pendingItems,
  prepare,
  printReport,
} from "./pipeline.js";
import { recordedScopes, targetAgents } from "./sync.js";

export const approveOptions = {
  agent: { type: "string", multiple: true },
  list: { type: "boolean" },
  json: { type: "boolean" },
  yes: { type: "boolean" },
} as const;

export interface ApproveValues {
  agent?: string[];
  list?: boolean;
  json?: boolean;
  yes?: boolean;
}

export async function approveCommand(values: ApproveValues, cwd: string, io: Io): Promise<number> {
  const repo = openRepo(cwd);
  const agents = targetAgents(repo, values.agent);
  const listed: Record<string, unknown>[] = [];
  let result = 0;

  for (const agent of agents) {
    const prepared = prepare(repo, agent, recordedScopes(repo, agent, io, values.json === true));
    const approved = prepared.previous?.approved ?? {};
    const pending = pendingItems(prepared.plan, approved);

    if (values.list) {
      for (const item of pending) {
        listed.push({
          agent,
          id: item.id,
          kind: item.kind,
          layer: item.layer,
          name: item.name,
          status: approved[item.id] === undefined ? "new" : "changed",
          definition: item.definition,
        });
        if (!values.json) io.stdout(`${agent}: ${describeItem(item)}\n`);
      }
      continue;
    }
    if (pending.length === 0) {
      io.stdout(`${agent}: nothing waits for approval\n`);
      continue;
    }
    if (!values.yes) {
      if (!io.prompt) {
        throw new CommandError(
          "Approval needs a terminal. Review with --list, then run approve in your terminal or pass --yes.",
        );
      }
      for (const item of pending) io.stdout(`  ${describeItem(item)}\n`);
      if (!(await confirm(io, `Approve these ${pending.length} items for ${agent}?`))) continue;
    }
    const report = execute(prepared, {
      approved: approveAll(approved, pending),
      force: false,
      dryRun: false,
    });
    printReport(io, prepared.plan, report, { dryRun: false });
    if (report.errors.length > 0) result = 1;
  }

  if (values.list && values.json) io.stdout(`${JSON.stringify(listed, null, 2)}\n`);
  else if (values.list && listed.length === 0) io.stdout("Nothing waits for approval.\n");
  return result;
}
