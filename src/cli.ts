import { createRequire } from "node:module";
import { parseArgs } from "node:util";

export interface Io {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
}

// Resolves from both src/ (tests) and dist/ (built bin): package.json is one level up.
export const VERSION: string = createRequire(import.meta.url)("../package.json").version;

const USAGE = `Usage: agents-setup <command> [options]

One agent-neutral config for every coding agent.

Options:
  -h, --help     Show this help
  -v, --version  Show the version
`;

const defaultIo: Io = {
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
};

export async function run(argv: string[], io: Io = defaultIo): Promise<number> {
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
  io.stderr(`Unknown command: ${command}\n\n${USAGE}`);
  return 1;
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
