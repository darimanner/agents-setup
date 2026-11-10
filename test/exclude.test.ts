import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type ApplyOptions, applyPlan } from "../src/core/apply.js";
import { excludePath, generatedPaths, updateExclude } from "../src/core/exclude.js";
import type { Operation, Plan } from "../src/core/plan.js";
import { readState, writeState } from "../src/core/state.js";
import { uninstall } from "../src/core/uninstall.js";
import { makeRepo, writeFiles } from "./helpers.js";

const options: ApplyOptions = {
  approved: {},
  force: false,
  dryRun: false,
  tracked: new Set(),
  contentHash: "h",
};

function plan(operations: Operation[]): Plan {
  return { agent: "claude-code", scopes: ["."], operations, approvals: [], warnings: [] };
}

const OPS: Operation[] = [
  { kind: "write", path: ".claude/rules/agents-setup/general.md", content: "x\n", readonly: true },
  { kind: "symlink", path: ".claude/skills/review", target: "../../.agents/skills/review" },
  {
    kind: "merge-json",
    path: ".mcp.json",
    key: ["mcpServers", "context7"],
    value: { type: "http", url: "https://mcp.context7.com/mcp" },
  },
];

function snapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const path of readdirSync(root, { recursive: true, encoding: "utf8" })) {
    if (path === ".git" || (path.startsWith(".git/") && path !== ".git/info/exclude")) continue;
    try {
      out[path] = readFileSync(join(root, path), "utf8");
    } catch {
      out[path] = "<dir>";
    }
  }
  return out;
}

describe("updateExclude", () => {
  it("adds and replaces a managed block, leaving other lines alone", () => {
    const root = makeRepo({});
    const file = excludePath(root);
    writeFileSync(file, "# mine\n*.log\n");
    updateExclude(root, "claude-code", [".mcp.json"]);
    updateExclude(root, "claude-code", [".mcp.json", ".claude/skills/review"]);
    expect(readFileSync(file, "utf8")).toBe(
      "# mine\n*.log\n# >>> agents-setup claude-code\n/.agents/.state/\n/.mcp.json\n/.claude/skills/review\n# <<< agents-setup claude-code\n",
    );
  });

  it("keeps a block per agent and removes one when empty", () => {
    const root = makeRepo({});
    const file = excludePath(root);
    writeFileSync(file, "");
    updateExclude(root, "claude-code", [".mcp.json"]);
    updateExclude(root, "opencode", ["opencode.json"]);
    updateExclude(root, "claude-code", []);
    expect(readFileSync(file, "utf8")).toBe(
      "# >>> agents-setup opencode\n/.agents/.state/\n/opencode.json\n# <<< agents-setup opencode\n",
    );
  });

  it("hides generated files from git status", () => {
    const root = makeRepo({
      ".agents/skills/review/SKILL.md": "---\nname: review\ndescription: x\n---\n",
    });
    execFileSync("git", ["add", "."], { cwd: root });
    const { state } = applyPlan(root, plan(OPS), undefined, options);
    updateExclude(root, "claude-code", generatedPaths(state));
    const status = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(status.split("\n").filter((l) => l.startsWith("??"))).toEqual([]);
  });
});

describe("uninstall", () => {
  const USER_MCP = `${JSON.stringify({ mcpServers: { mine: { command: "x" } } }, null, 4)}\n`;

  it("restores the repo", () => {
    const root = makeRepo({
      ".agents/skills/review/SKILL.md": "---\nname: review\ndescription: x\n---\n",
      ".mcp.json": USER_MCP,
      "notes.md": "mine\n",
    });
    const before = snapshot(root);
    const { state } = applyPlan(root, plan(OPS), undefined, options);
    writeState(root, state);
    updateExclude(root, "claude-code", generatedPaths(state));
    expect(snapshot(root)).not.toEqual(before);

    const report = uninstall(root, state, { force: false, dryRun: false });
    expect(report.errors).toEqual([]);
    const after = snapshot(root);
    delete after[".agents/.state"];
    expect(after).toEqual(before);
    expect(readState(root, "claude-code")).toBeUndefined();
  });

  it("keeps files the user edited and reports them", () => {
    const root = makeRepo({
      ".agents/skills/review/SKILL.md": "---\nname: review\ndescription: x\n---\n",
    });
    const { state } = applyPlan(root, plan(OPS), undefined, options);
    writeState(root, state);
    execFileSync("chmod", ["u+w", join(root, ".claude/rules/agents-setup/general.md")]);
    writeFiles(root, { ".claude/rules/agents-setup/general.md": "edited\n" });
    const report = uninstall(root, state, { force: false, dryRun: false });
    expect(readFileSync(join(root, ".claude/rules/agents-setup/general.md"), "utf8")).toBe(
      "edited\n",
    );
    expect(report.skipped).toEqual([
      { path: ".claude/rules/agents-setup/general.md", reason: "modified since last sync; kept" },
    ]);
  });
});
