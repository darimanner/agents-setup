import { secretKind } from "../secrets.js";
import type { Diagnostic, McpServer } from "../types.js";
import {
  error,
  isRecord,
  isStringList,
  isStringMap,
  nameProblem,
  parseYamlFile,
  warning,
} from "./common.js";

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.replace(/\$\{[^}]*\}/g, "x"));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Returns an error for a known credential format, warnings for suspects. */
function secretDiagnostics(file: string, name: string, values: [string, string][]): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const [field, value] of values) {
    const kind = secretKind(value);
    const message = `Server "${name}": ${field} looks like a literal secret; reference it as \${VAR} instead`;
    if (kind === "known") return [error(file, message)];
    if (kind === "suspect") out.push(warning(file, `${message} (ignore if it is not a secret)`));
  }
  return out;
}

function parseServer(
  layer: string,
  file: string,
  name: string,
  raw: unknown,
): { server?: McpServer; diagnostics: Diagnostic[] } {
  const fail = (message: string) => ({
    diagnostics: [error(file, `Server "${name}": ${message}`)],
  });
  const problem = nameProblem("server", name);
  if (problem) return { diagnostics: [error(file, problem)] };
  if (!isRecord(raw)) return fail("must be a mapping");

  const server: McpServer = { layer, name, transport: "stdio" };
  const checked: [string, string][] = [];
  if (raw.transport === "http") {
    if (typeof raw.url !== "string") return fail("http servers need a url");
    if (!isHttpUrl(raw.url)) return fail(`url must be http(s): ${raw.url}`);
    server.transport = "http";
    server.url = raw.url;
    checked.push(["url", raw.url]);
    if (raw.headers !== undefined) {
      if (!isStringMap(raw.headers)) return fail("headers must map names to strings");
      server.headers = raw.headers;
      checked.push(
        ...Object.entries(raw.headers).map(([k, v]): [string, string] => [`header ${k}`, v]),
      );
    }
  } else if (raw.transport === "stdio") {
    if (typeof raw.command !== "string" || raw.command === "") {
      return fail("stdio servers need a command");
    }
    server.command = raw.command;
    checked.push(["command", raw.command]);
    if (raw.args !== undefined) {
      if (!isStringList(raw.args)) return fail("args must be a list of strings");
      server.args = raw.args;
      checked.push(...raw.args.map((a): [string, string] => ["args", a]));
    }
    if (raw.env !== undefined) {
      if (!isStringMap(raw.env)) return fail("env must map names to strings");
      server.env = raw.env;
      checked.push(...Object.entries(raw.env).map(([k, v]): [string, string] => [`env ${k}`, v]));
    }
  } else {
    return fail(`transport must be "http" or "stdio", got ${JSON.stringify(raw.transport)}`);
  }

  const diagnostics = secretDiagnostics(file, name, checked);
  if (diagnostics.some((d) => d.level === "error")) return { diagnostics };
  return { server, diagnostics };
}

export function parseMcp(
  layer: string,
  file: string,
  text: string,
): { servers: McpServer[]; diagnostics: Diagnostic[] } {
  const { data, diagnostic } = parseYamlFile(file, text);
  if (diagnostic) return { servers: [], diagnostics: [diagnostic] };
  if (!isRecord(data)) return { servers: [], diagnostics: [error(file, "Must be a mapping")] };
  if (data.servers === undefined || data.servers === null) return { servers: [], diagnostics: [] };
  if (!isRecord(data.servers)) {
    return { servers: [], diagnostics: [error(file, "servers must be a mapping")] };
  }

  const servers: McpServer[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const [name, raw] of Object.entries(data.servers)) {
    const result = parseServer(layer, file, name, raw);
    diagnostics.push(...result.diagnostics);
    if (result.server) servers.push(result.server);
  }
  return { servers, diagnostics };
}
