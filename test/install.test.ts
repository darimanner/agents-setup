import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/cli.js";
import type { Io } from "../src/io.js";
import { makeRepo, writeFiles } from "./helpers.js";

async function exec(cwd: string, argv: string[], answers?: string[]) {
  const out = { stdout: "", stderr: "" };
  const io: Io = {
    stdout: (s) => {
      out.stdout += s;
    },
    stderr: (s) => {
      out.stderr += s;
    },
  };
  if (answers) {
    const queue = [...answers];
    io.prompt = async (question) => {
      out.stdout += question;
      return queue.shift() ?? "";
    };
  }
  const code = await run(argv, io, cwd);
  return { code, ...out };
}

const REPO = {
  "AGENTS.md": "# Root\n",
  ".agents/rules/general.md": "- Be clear.\n",
  ".agents/skills/review/SKILL.md": "---\nname: review\ndescription: Review\n---\n",
  ".agents/mcp.yaml": "servers:\n  docs: { transport: http, url: https://mcp.context7.com/mcp }\n",
  "frontend/.agents/layer.yaml": "description: Web client\n",
  "frontend/.agents/rules/react.md": "- Hooks.\n",
};

const json = (root: string, path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));

function snapshot(root: string): string[] {
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((p) => p !== ".git" && !p.startsWith(".git/"))
    .sort();
}

describe("install", () => {
  it("installs rules and skills, holding the MCP server for approval", async () => {
    const root = makeRepo(REPO);
    const result = await exec(root, ["install", "--agent", "claude-code"]);
    expect(result.code).toBe(0);
    expect(existsSync(join(root, ".claude/rules/agents-setup/general.md"))).toBe(true);
    expect(existsSync(join(root, ".claude/rules/agents-setup/frontend__react.md"))).toBe(false);
    expect(lstatSync(join(root, ".claude/skills/review")).isSymbolicLink()).toBe(true);
    expect(existsSync(join(root, ".mcp.json"))).toBe(false);
    expect(result.stdout).toContain("waiting for approval:");
    expect(result.stdout).toContain("mcp docs (.): http https://mcp.context7.com/mcp");
    const status = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(status).not.toContain(".claude");
    expect(status).not.toContain(".agents/.state");
  });

  it("applies everything with --yes and the chosen scope", async () => {
    const root = makeRepo(REPO);
    const result = await exec(root, [
      "install",
      "--agent",
      "claude-code",
      "--scope",
      "frontend",
      "--yes",
    ]);
    expect(result.code).toBe(0);
    expect(existsSync(join(root, ".claude/rules/agents-setup/frontend__react.md"))).toBe(true);
    expect(json(root, ".mcp.json").mcpServers.docs.type).toBe("http");
    expect(json(root, ".claude/settings.local.json").enabledMcpjsonServers).toEqual(["docs"]);
  });

  it("asks for the agent, scopes and approval in a terminal", async () => {
    const root = makeRepo(REPO);
    const result = await exec(root, ["install"], ["", "frontend", "y"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Agent (claude-code, codex, opencode) [claude-code]");
    expect(result.stdout).toContain("Which parts do you work on? (frontend, all");
    expect(existsSync(join(root, ".claude/rules/agents-setup/frontend__react.md"))).toBe(true);
    expect(existsSync(join(root, ".mcp.json"))).toBe(true);
  });

  it("writes nothing with --dry-run", async () => {
    const root = makeRepo(REPO);
    const before = snapshot(root);
    const result = await exec(root, ["install", "--agent", "claude-code", "--yes", "--dry-run"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("would write .claude/rules/agents-setup/general.md");
    expect(snapshot(root)).toEqual(before);
  });

  it("refuses layers with errors", async () => {
    const root = makeRepo({
      ...REPO,
      ".agents/hooks.yaml": "hooks:\n  a: { event: save, command: x }\n",
    });
    const result = await exec(root, ["install", "--agent", "claude-code"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("nothing was installed");
    expect(existsSync(join(root, ".claude"))).toBe(false);
  });

  it.each([
    [
      "an unknown agent",
      ["install", "--agent", "vim"],
      "Unknown agent: vim. Supported: claude-code",
    ],
    ["an agent without adapter", ["install", "--agent", "hermes"], "hermes has no adapter yet"],
    ["no agent outside a terminal", ["install"], "Pass --agent <id>. Supported: claude-code"],
    [
      "an unknown scope",
      ["install", "--agent", "claude-code", "--scope", "mobile"],
      "Unknown scope: mobile",
    ],
  ])("exits 1 for %s", async (_label, argv, message) => {
    const result = await exec(makeRepo(REPO), argv);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(message);
  });
});

describe("sync", () => {
  it("reports staleness with --check and catches up with sync", async () => {
    const root = makeRepo(REPO);
    await exec(root, ["install", "--agent", "claude-code", "--yes"]);
    expect((await exec(root, ["sync", "--check"])).code).toBe(0);

    writeFiles(root, { ".agents/rules/general.md": "- Be very clear.\n" });
    const stale = await exec(root, ["sync", "--check"]);
    expect(stale.code).toBe(1);
    expect(stale.stdout).toContain("claude-code: out of date");

    expect((await exec(root, ["sync"])).code).toBe(0);
    expect(readFileSync(join(root, ".claude/rules/agents-setup/general.md"), "utf8")).toContain(
      "Be very clear",
    );
    expect((await exec(root, ["sync", "--check"])).code).toBe(0);
  });

  it("holds a changed MCP server until it is approved again", async () => {
    const root = makeRepo(REPO);
    await exec(root, ["install", "--agent", "claude-code", "--yes"]);
    writeFiles(root, {
      ".agents/mcp.yaml": "servers:\n  docs: { transport: http, url: https://evil.example/mcp }\n",
    });
    const result = await exec(root, ["sync"]);
    expect(result.stdout).toContain("mcp docs (.): http https://evil.example/mcp");
    expect(json(root, ".mcp.json").mcpServers.docs.url).toBe("https://mcp.context7.com/mcp");
    expect((await exec(root, ["sync", "--check", "--quiet"])).code).toBe(1);
  });

  it("is silent with --quiet when nothing changed", async () => {
    const root = makeRepo(REPO);
    await exec(root, ["install", "--agent", "claude-code", "--yes"]);
    expect((await exec(root, ["sync", "--quiet"])).stdout).toBe("");
  });
});

describe("approve", () => {
  it("lists pending items as JSON", async () => {
    const root = makeRepo(REPO);
    await exec(root, ["install", "--agent", "claude-code"]);
    const result = await exec(root, ["approve", "--list", "--json"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      {
        agent: "claude-code",
        id: "mcp:.:docs",
        kind: "mcp",
        layer: ".",
        name: "docs",
        status: "new",
        definition: { transport: "http", url: "https://mcp.context7.com/mcp", headers: [] },
      },
    ]);
  });

  it("approves with --yes and refuses without a terminal", async () => {
    const root = makeRepo(REPO);
    await exec(root, ["install", "--agent", "claude-code"]);
    const refused = await exec(root, ["approve"]);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain("Approval needs a terminal");
    expect((await exec(root, ["approve", "--yes"])).code).toBe(0);
    expect(existsSync(join(root, ".mcp.json"))).toBe(true);
    expect((await exec(root, ["approve", "--list"])).stdout).toBe("Nothing waits for approval.\n");
  });
});

describe("uninstall", () => {
  it("restores the repo", async () => {
    const root = makeRepo(REPO);
    const before = snapshot(root);
    await exec(root, ["install", "--agent", "claude-code", "--scope", "all", "--yes"]);
    expect(snapshot(root)).not.toEqual(before);
    const result = await exec(root, ["uninstall"]);
    expect(result.code).toBe(0);
    expect(snapshot(root)).toEqual(before.filter((p) => p !== ".agents/.state"));
  });
});

describe("install for opencode", () => {
  it("writes one overlay config, keeps it out of git and removes it on uninstall", async () => {
    const root = makeRepo({ ...REPO, "opencode.json": '{ "model": "mine" }\n' });
    execFileSync("git", ["add", "-A"], { cwd: root });
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init"], {
      cwd: root,
    });
    const install = await exec(root, ["install", "--agent", "opencode", "--scope", "all", "--yes"]);
    expect(install.code).toBe(0);
    expect(json(root, ".opencode/opencode.jsonc")).toEqual({
      instructions: [".agents/rules/general.md", "frontend/.agents/rules/react.md"],
      mcp: { docs: { type: "remote", url: "https://mcp.context7.com/mcp", enabled: true } },
    });
    expect(readFileSync(join(root, "opencode.json"), "utf8")).toBe('{ "model": "mine" }\n');
    const status = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
    expect(status).toBe("");

    expect((await exec(root, ["uninstall", "--agent", "opencode"])).code).toBe(0);
    expect(existsSync(join(root, ".opencode"))).toBe(false);
  });
});

describe("install for codex", () => {
  it("writes the project config, and keeps its runner when another agent leaves", async () => {
    const root = makeRepo({
      ...REPO,
      ".agents/hooks.yaml": "hooks:\n  done:\n    event: stop\n    command: echo done\n",
    });
    for (const agent of ["claude-code", "codex"]) {
      const result = await exec(root, ["install", "--agent", agent, "--yes"]);
      expect(result.code).toBe(0);
    }
    const config = readFileSync(join(root, ".codex/config.toml"), "utf8");
    expect(config).toContain('developer_instructions = "Project rules');
    expect(config).toContain('[mcp_servers.docs]\nurl = "https://mcp.context7.com/mcp"');
    expect(config).toContain("[[hooks.Stop]]");

    expect((await exec(root, ["uninstall", "--agent", "claude-code"])).code).toBe(0);
    expect(existsSync(join(root, ".agents/.state/bin/hook-codex.mjs"))).toBe(true);
    expect(existsSync(join(root, ".agents/.state/bin/hook-claude-code.mjs"))).toBe(false);
  });
});
