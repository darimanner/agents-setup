import type { AgentId } from "../core/types.js";
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
  supportedAgents,
} from "./pipeline.js";

export const installOptions = {
  agent: { type: "string", multiple: true },
  scope: { type: "string", multiple: true },
  yes: { type: "boolean" },
  "dry-run": { type: "boolean" },
  force: { type: "boolean" },
} as const;

export interface InstallValues {
  agent?: string[];
  scope?: string[];
  yes?: boolean;
  "dry-run"?: boolean;
  force?: boolean;
}

function splitList(answer: string): string[] {
  return answer
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function chooseAgents(io: Io, given: string[] | undefined): Promise<string[]> {
  if (given?.length) return given;
  const supported = supportedAgents();
  if (!io.prompt) {
    throw new CommandError(`Pass --agent <id>. Supported: ${supported.join(", ")}`);
  }
  const answer = await io.prompt(`Agent (${supported.join(", ")}) [${supported[0]}]: `);
  return answer.trim() ? splitList(answer) : [supported[0] as string];
}

async function chooseScopes(
  io: Io,
  given: string[] | undefined,
  layers: string[],
): Promise<string[]> {
  if (given?.length) return given;
  const nested = layers.filter((l) => l !== ".");
  if (!io.prompt || nested.length === 0) return [];
  const answer = await io.prompt(
    `Which parts do you work on? (${nested.join(", ")}, all; Enter for the root only): `,
  );
  return splitList(answer);
}

export async function installCommand(values: InstallValues, cwd: string, io: Io): Promise<number> {
  const repo = openRepo(cwd);
  const agents = await chooseAgents(io, values.agent);
  const scopes = await chooseScopes(io, values.scope, repo.layers);
  const dryRun = values["dry-run"] === true;
  let failed = false;

  for (const agent of agents) {
    const prepared = prepare(repo, agent as AgentId, scopes);
    let approved = prepared.previous?.approved ?? {};
    const pending = pendingItems(prepared.plan, approved);
    if (pending.length > 0) {
      if (values.yes) {
        approved = approveAll(approved, pending);
      } else if (io.prompt && !dryRun) {
        io.stdout(`${agent}: these items run code or receive tokens on your machine:\n`);
        for (const item of pending) io.stdout(`  ${describeItem(item)}\n`);
        if (
          await confirm(io, `Approve ${pending.length === 1 ? "it" : `all ${pending.length}`}?`)
        ) {
          approved = approveAll(approved, pending);
        }
      }
    }
    const report = execute(prepared, { approved, force: values.force === true, dryRun });
    printReport(io, prepared.plan, report, { dryRun });
    if (report.errors.length > 0) failed = true;
  }
  return failed ? 1 : 0;
}
