import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/cli.js";
import { makeRepo } from "./helpers.js";

async function exec(cwd: string, ...argv: string[]) {
  const out = { stdout: "", stderr: "" };
  const io = {
    stdout: (s: string) => {
      out.stdout += s;
    },
    stderr: (s: string) => {
      out.stderr += s;
    },
  };
  const code = await run(argv, io, cwd);
  return { code, ...out };
}

const CLEAN = {
  "AGENTS.md": "# Root\n",
  ".agents/manifest.yaml": "version: 1\n",
  ".agents/rules/general.md": "x\n",
  ".agents/rules/style.md": "x\n",
  ".agents/skills/review/SKILL.md": "---\nname: review\ndescription: Review\n---\n",
  ".agents/mcp.yaml":
    "servers:\n  context7: { transport: http, url: https://mcp.context7.com/mcp }\n",
  "frontend/.agents/layer.yaml": "description: Web client\n",
  "frontend/.agents/rules/react.md": "x\n",
};

describe("validate", () => {
  it("reports a clean repo", async () => {
    const result = await exec(makeRepo(CLEAN), "validate");
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("2 layers, no problems found\n");
  });

  it("fails on an error", async () => {
    const root = makeRepo({
      ...CLEAN,
      ".agents/hooks.yaml": "hooks:\n  a: { event: save, command: x }\n",
    });
    const result = await exec(root, "validate");
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('.agents/hooks.yaml: error: Hook "a"');
    expect(result.stdout.trimEnd().split("\n").at(-1)).toBe("1 error, 0 warnings");
  });

  it("passes with only warnings", async () => {
    const root = makeRepo({ ...CLEAN, ".agents/rules/x/y.md": "x\n" });
    const result = await exec(root, "validate");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("warning:");
    expect(result.stdout.trimEnd().split("\n").at(-1)).toBe("0 errors, 1 warning");
  });

  it("works from a subdirectory", async () => {
    const root = makeRepo(CLEAN);
    const result = await exec(join(root, "frontend"), "validate");
    expect(result.code).toBe(0);
  });
});

describe("status", () => {
  it("lists layers with their contents", async () => {
    const result = await exec(makeRepo(CLEAN), "status");
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/^ {2}\. +2 rules, 1 skill, 1 MCP server$/m);
    expect(result.stdout).toMatch(/^ {2}frontend +Web client: 1 rule$/m);
    expect(result.stdout).toContain("No agents installed. Run agents-setup install.");
  });

  it("flags layers with errors", async () => {
    const root = makeRepo({ ...CLEAN, "backend/.agents/hooks.yaml": "hooks: [\n" });
    const result = await exec(root, "status");
    expect(result.stdout).toMatch(/^ {2}backend +empty \(1 error, run agents-setup validate\)$/m);
  });
});

describe("outside a git repo", () => {
  it.each(["validate", "status"])("%s exits 1", async (command) => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "agents-setup-nogit-")));
    const result = await exec(dir, command);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(`Not a git repository: ${dir}\n`);
  });
});
