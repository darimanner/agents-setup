import { describe, expect, it } from "vitest";
import { opencode } from "../src/adapters/opencode.js";
import { planWith } from "./helpers.js";

const planFor = (files: Record<string, string>) => planWith(opencode, files);
const CONFIG = ".opencode/opencode.jsonc";
const SKILL = (name: string) => `---\nname: ${name}\ndescription: x\n---\n`;

describe("opencode adapter", () => {
  it("lists rule files as instructions, without copies", () => {
    const { operations } = planFor({
      ".agents/rules/general.md": "- Be clear.\n",
      "frontend/web/.agents/rules/react.md": '---\npaths: ["src/**"]\n---\n- Hooks.\n',
    });
    expect(operations).toEqual([
      {
        kind: "merge-json-item",
        path: CONFIG,
        key: ["instructions"],
        id: ".agents/rules/general.md",
        value: ".agents/rules/general.md",
      },
      {
        kind: "merge-json-item",
        path: CONFIG,
        key: ["instructions"],
        id: "frontend/web/.agents/rules/react.md",
        value: "frontend/web/.agents/rules/react.md",
      },
    ]);
  });

  it("writes MCP servers with OpenCode env references", () => {
    const { operations, warnings, approvals } = planFor({
      ".agents/mcp.yaml":
        "servers:\n  docs: { transport: http, url: https://x.dev/mcp, headers: { Authorization: 'Bearer ${T}' } }\n",
      "frontend/.agents/mcp.yaml":
        "servers:\n  db: { transport: stdio, command: npx, args: [db-mcp, '${DB_URL}'], env: { KEY: '${DB_KEY}' } }\n",
    });
    expect(operations).toEqual([
      {
        kind: "merge-json",
        path: CONFIG,
        key: ["mcp", "docs"],
        value: {
          type: "remote",
          url: "https://x.dev/mcp",
          headers: { Authorization: "Bearer {env:T}" },
          enabled: true,
        },
        approval: "mcp:.:docs",
      },
      {
        kind: "merge-json",
        path: CONFIG,
        key: ["mcp", "db"],
        value: {
          type: "local",
          command: ["npx", "db-mcp", "{env:DB_URL}"],
          environment: { KEY: "{env:DB_KEY}" },
          enabled: true,
        },
        approval: "mcp:frontend:db",
      },
    ]);
    expect(approvals.map((a) => a.id)).toEqual(["mcp:.:docs", "mcp:frontend:db"]);
    expect(warnings).toEqual([expect.stringContaining('"db" from frontend is active')]);
  });

  it("adds its own npm plugins, pinned when a version is given", () => {
    const { operations, approvals } = planFor({
      ".agents/plugins.yaml":
        "plugins:\n  opencode:\n    - name: opencode-wakatime\n    - name: '@acme/tools'\n      version: 1.2.0\n  claude-code:\n    - name: superpowers\n      marketplace: claude-plugins-official\n",
    });
    expect(operations.map((op) => op.kind === "merge-json-item" && [op.id, op.value])).toEqual([
      ["opencode-wakatime", "opencode-wakatime"],
      ["@acme/tools", "@acme/tools@1.2.0"],
    ]);
    expect(approvals.map((a) => a.id)).toEqual([
      "plugin:.:opencode-wakatime",
      "plugin:.:@acme/tools",
    ]);
  });

  it("skips hooks without asking to approve them", () => {
    const { operations, warnings, approvals } = planFor({
      ".agents/hooks.yaml":
        "hooks:\n  fmt:\n    event: after-edit\n    command: ruff format {file}\n",
    });
    expect(operations).toEqual([]);
    expect(approvals).toEqual([]);
    expect(warnings).toEqual(["1 hook(s) skipped: hooks for OpenCode are not supported yet"]);
  });

  it("leaves skills to OpenCode and warns about nested ones", () => {
    const { operations, warnings } = planFor({
      ".agents/skills/review/SKILL.md": SKILL("review"),
      "frontend/.agents/skills/ui/SKILL.md": SKILL("ui"),
    });
    expect(operations).toEqual([]);
    expect(warnings).toEqual([
      "Skills in frontend/.agents/skills load only when OpenCode starts in frontend or below",
    ]);
  });
});
