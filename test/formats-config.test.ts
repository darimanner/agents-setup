import { describe, expect, it } from "vitest";
import { parseHooks } from "../src/core/formats/hooks.js";
import { parseMcp } from "../src/core/formats/mcp.js";
import { parsePlugins } from "../src/core/formats/plugins.js";

const MCP_FILE = ".agents/mcp.yaml";
const HOOKS_FILE = ".agents/hooks.yaml";
const PLUGINS_FILE = ".agents/plugins.yaml";

const DOCS_MCP = `servers:
  context7:
    transport: http # http | stdio
    url: https://mcp.context7.com/mcp
    headers: { Authorization: "Bearer \${CONTEXT7_TOKEN}" }
  postgres:
    transport: stdio
    command: uvx
    args: [postgres-mcp, --access-mode=restricted]
    env: { DATABASE_URL: "\${DATABASE_URL}" }
`;

const DOCS_HOOKS = `hooks:
  format-python:
    event: after-edit # session-start | before-tool | after-edit | stop
    match: "**/*.py" # file glob for edit events, tool name for before-tool
    command: uv run ruff format {file}
`;

function mcpErrors(text: string): string[] {
  return parseMcp(".", MCP_FILE, text).diagnostics.map((d) => d.message);
}

describe("mcp.yaml", () => {
  it("parses the docs example", () => {
    const { servers, diagnostics } = parseMcp(".", MCP_FILE, DOCS_MCP);
    expect(diagnostics).toEqual([]);
    expect(servers).toEqual([
      {
        layer: ".",
        name: "context7",
        transport: "http",
        url: "https://mcp.context7.com/mcp",
        headers: { Authorization: "Bearer ${CONTEXT7_TOKEN}" },
      },
      {
        layer: ".",
        name: "postgres",
        transport: "stdio",
        command: "uvx",
        args: ["postgres-mcp", "--access-mode=restricted"],
        env: { DATABASE_URL: "${DATABASE_URL}" },
      },
    ]);
  });

  it("accepts an empty file and an empty servers map", () => {
    expect(parseMcp(".", MCP_FILE, "")).toEqual({ servers: [], diagnostics: [] });
    expect(parseMcp(".", MCP_FILE, "servers: {}\n")).toEqual({ servers: [], diagnostics: [] });
  });

  it.each([
    ["http server without url", "servers:\n  a: { transport: http }\n", "url"],
    ["url that is not http(s)", "servers:\n  a: { transport: http, url: ftp://x }\n", "url"],
    ["stdio server without command", "servers:\n  a: { transport: stdio }\n", "command"],
    ["unknown transport", "servers:\n  a: { transport: sse, url: https://x }\n", "transport"],
    [
      "args that are not strings",
      "servers:\n  a: { transport: stdio, command: x, args: [1] }\n",
      "args",
    ],
    ["a name with a slash", 'servers:\n  "a/b": { transport: stdio, command: x }\n', "name"],
  ])("rejects %s", (_label, text, word) => {
    const errors = mcpErrors(text);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(word);
  });

  it.each([
    [
      "env",
      "servers:\n  a: { transport: stdio, command: x, env: { API_KEY: sk-live-0123456789abcdefghij } }\n",
    ],
    [
      "headers",
      "servers:\n  a: { transport: http, url: https://x.dev, headers: { X-Key: ghp_0123456789abcdefghijABCD } }\n",
    ],
    [
      "args",
      "servers:\n  a: { transport: stdio, command: x, args: [--token=ghp_0123456789abcdefghijABCD] }\n",
    ],
    [
      "url query",
      "servers:\n  a: { transport: http, url: 'https://x.dev/mcp?key=AKIA0123456789ABCDEF' }\n",
    ],
  ])("rejects a literal secret in %s", (_label, text) => {
    const errors = mcpErrors(text);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"a"');
    expect(errors[0]).toContain("${VAR}");
  });
});

describe("mcp.yaml suspects", () => {
  it("warns about a long token that is not a known format", () => {
    const { servers, diagnostics } = parseMcp(
      ".",
      MCP_FILE,
      "servers:\n  a: { transport: stdio, command: x, args: [--id=a1B2c3D4e5F6g7H8i9J0k1L2] }\n",
    );
    expect(servers).toHaveLength(1);
    expect(diagnostics).toEqual([expect.objectContaining({ level: "warning" })]);
  });
});

describe("hooks.yaml", () => {
  it("parses the docs example", () => {
    const { hooks, diagnostics } = parseHooks(".", HOOKS_FILE, DOCS_HOOKS);
    expect(diagnostics).toEqual([]);
    expect(hooks).toEqual([
      {
        layer: ".",
        name: "format-python",
        event: "after-edit",
        match: "**/*.py",
        command: "uv run ruff format {file}",
      },
    ]);
  });

  it("rejects an unknown event and lists the valid ones", () => {
    const { diagnostics } = parseHooks(
      ".",
      HOOKS_FILE,
      "hooks:\n  a: { event: save, command: x }\n",
    );
    expect(diagnostics).toHaveLength(1);
    for (const event of ["session-start", "before-tool", "after-edit", "stop"]) {
      expect(diagnostics[0]?.message).toContain(event);
    }
  });

  it("rejects a hook without command", () => {
    const { diagnostics } = parseHooks(".", HOOKS_FILE, "hooks:\n  a: { event: stop }\n");
    expect(diagnostics[0]?.message).toContain("command");
  });

  it("rejects a hook key outside the name pattern", () => {
    const { diagnostics } = parseHooks(
      ".",
      HOOKS_FILE,
      'hooks:\n  "../x": { event: stop, command: x }\n',
    );
    expect(diagnostics[0]?.message).toContain("name");
  });
});

describe("plugins.yaml", () => {
  it("parses plugins per agent", () => {
    const text =
      "plugins:\n  claude-code:\n    - name: superpowers\n      marketplace: claude-plugins-official\n  opencode:\n    - name: opencode-wakatime\n";
    const { plugins, diagnostics } = parsePlugins(".", PLUGINS_FILE, text);
    expect(diagnostics).toEqual([]);
    expect(plugins).toEqual([
      {
        layer: ".",
        agent: "claude-code",
        name: "superpowers",
        marketplace: "claude-plugins-official",
      },
      { layer: ".", agent: "opencode", name: "opencode-wakatime" },
    ]);
  });

  it("warns about an unknown agent and keeps the entry", () => {
    const { plugins, diagnostics } = parsePlugins(
      ".",
      PLUGINS_FILE,
      "plugins:\n  cursor:\n    - name: x\n",
    );
    expect(plugins).toHaveLength(1);
    expect(diagnostics).toEqual([
      expect.objectContaining({ level: "warning", message: expect.stringContaining("cursor") }),
    ]);
  });

  it("rejects a plugin without name", () => {
    const { diagnostics } = parsePlugins(
      ".",
      PLUGINS_FILE,
      "plugins:\n  opencode:\n    - version: 1.0.0\n",
    );
    expect(diagnostics[0]).toMatchObject({ level: "error" });
    expect(diagnostics[0]?.message).toContain("name");
  });
});
