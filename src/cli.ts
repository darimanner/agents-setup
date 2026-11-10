import { createRequire } from "node:module";
import { type ParseArgsConfig, parseArgs } from "node:util";
import { approveCommand, approveOptions } from "./commands/approve.js";
import { installCommand, installOptions } from "./commands/install.js";
import { CommandError } from "./commands/pipeline.js";
import { statusCommand } from "./commands/status.js";
import { syncCommand, syncOptions } from "./commands/sync.js";
import { uninstallCommand, uninstallOptions } from "./commands/uninstall.js";
import { validateCommand } from "./commands/validate.js";
import { NotAGitRepoError } from "./core/repo.js";
import { type Io, processIo } from "./io.js";

export type { Io } from "./io.js";

// Resolves from both src/ (tests) and dist/ (built bin): package.json is one level up.
export const VERSION: string = createRequire(import.meta.url)("../package.json").version;

const USAGE = `Usage: agents-setup <command> [options]

One agent-neutral config for every coding agent.

Commands:
  install        Set up an agent from this repo's layers
                 --agent <id>  --scope <path|all>  --yes  --dry-run  --force
  sync           Apply changes from the repo to installed agents
                 --check  --quiet  --yes  --dry-run  --force  --agent <id>
  approve        Approve hooks, MCP servers and plugins waiting for approval
                 --list  --json  --yes  --agent <id>
  uninstall      Remove everything agents-setup wrote
                 --dry-run  --force  --agent <id>
  status         Show the layers of this repo and the installed agents
  validate       Check every layer for errors

Options:
  -h, --help     Show this help
  -v, --version  Show the version
`;

type Options = NonNullable<ParseArgsConfig["options"]>;

interface Command {
  options: Options;
  // Each command reads the flags its own options declare.
  handler: (values: never, cwd: string, io: Io) => Promise<number>;
}

const COMMANDS: Record<string, Command> = {
  install: { options: installOptions, handler: installCommand },
  sync: { options: syncOptions, handler: syncCommand },
  approve: { options: approveOptions, handler: approveCommand },
  uninstall: { options: uninstallOptions, handler: uninstallCommand },
  status: { options: {}, handler: (_v, cwd, io) => statusCommand(cwd, io) },
  validate: { options: {}, handler: (_v, cwd, io) => validateCommand(cwd, io) },
};

const GLOBAL: Options = {
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
};

export async function run(
  argv: string[],
  io: Io = processIo(),
  cwd: string = process.cwd(),
): Promise<number> {
  const [first, ...rest] = argv;
  const command = first !== undefined && !first.startsWith("-") ? COMMANDS[first] : undefined;

  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: command ? rest : argv,
      allowPositionals: !command,
      strict: true,
      options: { ...GLOBAL, ...command?.options },
    });
  } catch (error) {
    io.stderr(`${(error as Error).message}\n\n${USAGE}`);
    return 1;
  }

  const { values, positionals } = parsed;
  if (values.version) {
    io.stdout(`${VERSION}\n`);
    return 0;
  }
  if (values.help || (!command && positionals.length === 0)) {
    io.stdout(USAGE);
    return 0;
  }
  if (!command) {
    io.stderr(`Unknown command: ${positionals[0]}\n\n${USAGE}`);
    return 1;
  }
  try {
    return await command.handler(values as never, cwd, io);
  } catch (error) {
    if (error instanceof NotAGitRepoError || error instanceof CommandError) {
      io.stderr(`${error.message}\n`);
      return 1;
    }
    throw error;
  }
}
