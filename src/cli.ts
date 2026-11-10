import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { statusCommand } from "./commands/status.js";
import { validateCommand } from "./commands/validate.js";
import { NotAGitRepoError } from "./core/repo.js";

export interface Io {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
}

// Resolves from both src/ (tests) and dist/ (built bin): package.json is one level up.
export const VERSION: string = createRequire(import.meta.url)("../package.json").version;

const USAGE = `Usage: agents-setup <command> [options]

One agent-neutral config for every coding agent.

Commands:
  status         Show the layers of this repo and the installed agents
  validate       Check every layer for errors

Options:
  -h, --help     Show this help
  -v, --version  Show the version
`;

const defaultIo: Io = {
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
};

const COMMANDS: Record<string, (cwd: string, io: Io) => Promise<number>> = {
  status: statusCommand,
  validate: validateCommand,
};

export async function run(
  argv: string[],
  io: Io = defaultIo,
  cwd: string = process.cwd(),
): Promise<number> {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (error) {
    io.stderr(`${(error as Error).message}\n\n${USAGE}`);
    return 1;
  }

  const { values, positionals } = parsed;
  if (values.version) {
    io.stdout(`${VERSION}\n`);
    return 0;
  }
  const [command] = positionals;
  if (values.help || command === undefined) {
    io.stdout(USAGE);
    return 0;
  }
  const handler = COMMANDS[command];
  if (!handler) {
    io.stderr(`Unknown command: ${command}\n\n${USAGE}`);
    return 1;
  }
  try {
    return await handler(cwd, io);
  } catch (error) {
    if (error instanceof NotAGitRepoError) {
      io.stderr(`${error.message}\n`);
      return 1;
    }
    throw error;
  }
}

function parse(argv: string[]) {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
}
