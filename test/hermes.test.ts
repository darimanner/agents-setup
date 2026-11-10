import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hermes } from "../src/adapters/hermes.js";
import { hookRunnerPath } from "../src/core/hook-runner.js";
import { makeRepo, planWith } from "./helpers.js";

let home: string;
beforeEach(() => {
  home = realpathSync(mkdtempSync(join(tmpdir(), "agents-setup-hermes-")));
  vi.stubEnv("HERMES_HOME", home);
  return () => vi.unstubAllEnvs();
});

const GLOBAL = {
  ".agents/mcp.yaml":
    "servers:\n  docs: { transport: http, url: https://x.dev/mcp, headers: { A: '${T}' } }\n",
  "backend/.agents/hooks.yaml":
    'hooks:\n  fmt:\n    event: after-edit\n    match: "**/*.py"\n    command: ruff format {file}\n',
};

describe("hermes adapter", () => {
  it("leaves the global config alone without consent and says what it skipped", () => {
    const { operations, approvals, warnings, globalSkipped } = planWith(hermes, GLOBAL);
    expect(operations).toEqual([]);
    expect(approvals).toEqual([]);
    expect(globalSkipped).toEqual({
      file: join(home, "config.yaml"),
      items: ["mcp docs (.)", "hook fmt (backend): on after-edit runs ruff format {file}"],
    });
    expect(warnings[0]).toContain("2 item(s) skipped");
  });

  it("merges MCP servers and hooks into the global config with consent", () => {
    const root = makeRepo({});
    const { operations, approvals } = planWith(hermes, GLOBAL, root, { allowGlobal: true });
    const file = join(home, "config.yaml");
    expect(operations[0]).toEqual({
      kind: "merge-json",
      path: file,
      key: ["mcp_servers", "docs"],
      value: { url: "https://x.dev/mcp", headers: { A: "${T}" } },
      approval: "mcp:.:docs",
    });
    const hook = operations[1];
    expect(hook).toMatchObject({ path: file, key: ["hooks", "post_tool_call"], id: "backend:fmt" });
    const entry = hook?.kind === "merge-json-item" ? (hook.value as Record<string, string>) : {};
    expect(entry.matcher).toBe("write_file|patch");
    expect(entry.command).toMatch(/^sh -c '.*' '.*hook-hermes\.mjs' '\{"event":"after-edit"/);
    expect(entry.command).toContain(join(root, hookRunnerPath("hermes")));
    expect(operations[2]).toMatchObject({ kind: "write", path: hookRunnerPath("hermes") });
    expect(approvals.map((a) => a.id)).toEqual(["mcp:.:docs", "hook:backend:fmt"]);
  });

  it("skips global items when Hermes is not set up", () => {
    rmSync(home, { recursive: true });
    const { operations, warnings } = planWith(hermes, GLOBAL, makeRepo({}), { allowGlobal: true });
    expect(operations).toEqual([]);
    expect(warnings).toEqual([expect.stringContaining("Hermes is not set up here")]);
  });

  it("explains what Hermes needs for rules, skills, plugins and .hermes.md", () => {
    const root = makeRepo({});
    const files = {
      ".hermes.md": "x\n",
      ".agents/rules/a.md": "- A.\n",
      ".agents/skills/review/SKILL.md": "---\nname: review\ndescription: x\n---\n",
      "web/.agents/skills/ui/SKILL.md": "---\nname: ui\ndescription: x\n---\n",
      ".agents/plugins.yaml":
        "plugins:\n  hermes:\n    - name: tool\n      source: acme/hermes-tool\n",
    };
    expect(planWith(hermes, files, root).warnings).toEqual([
      ".hermes.md exists, so Hermes reads it instead of AGENTS.md",
      expect.stringContaining("Rules skipped"),
      'Run "hermes skills trust" in this repo once, so Hermes loads .agents/skills',
      'Plugin "tool": install it with hermes plugins install acme/hermes-tool',
      "Skills in web/.agents/skills are skipped: Hermes reads only the root",
    ]);
    writeFileSync(join(home, "config.yaml"), `skills:\n  trusted_project_dirs: ["${root}"]\n`);
    expect(planWith(hermes, {}, root).warnings).not.toContain(
      'Run "hermes skills trust" in this repo once, so Hermes loads .agents/skills',
    );
  });
});
