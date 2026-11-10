import type { AgentId } from "../core/types.js";
import type { Io } from "../io.js";
import {
  approveAll,
  type Choices,
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
  "no-auto-sync": { type: "boolean" },
  "allow-global": { type: "boolean" },
} as const;

export interface InstallValues {
  agent?: string[];
  scope?: string[];
  yes?: boolean;
  "dry-run"?: boolean;
  force?: boolean;
  "no-auto-sync"?: boolean;
  "allow-global"?: boolean;
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
    const choices: Choices = {
      autoSync: values["no-auto-sync"] !== true,
      ...(values["allow-global"] && { allowGlobal: true }),
    };
    let prepared = prepare(repo, agent as AgentId, scopes, choices);
    const global = prepared.plan.globalSkipped;
    if (global && io.prompt && !dryRun) {
      io.stdout(
        `${agent}: these exist only in its global config, ${global.file}, and apply to every session there:\n`,
      );
      for (const item of global.items) io.stdout(`  ${item}\n`);
      if (await confirm(io, "Write them there for this project?")) {
        prepared = prepare(repo, agent as AgentId, scopes, { ...choices, allowGlobal: true });
      }
    }
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
