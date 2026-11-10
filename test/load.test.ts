import { describe, expect, it } from "vitest";
import { discoverLayers } from "../src/core/layers.js";
import { loadLayers } from "../src/core/load.js";
import { listRepoFiles } from "../src/core/repo.js";
import { validateLayers } from "../src/core/validate.js";
import { makeRepo } from "./helpers.js";

const SKILL = (name: string, description = "Does things") =>
  `---\nname: ${name}\ndescription: ${description}\n---\nSteps\n`;
const STDIO = (command: string) =>
  `servers:\n  db:\n    transport: stdio\n    command: ${command}\n`;

function load(files: Record<string, string>) {
  const root = makeRepo(files);
  const all = listRepoFiles(root);
  return loadLayers(root, all, discoverLayers(all));
}

describe("loadLayers", () => {
  it("loads a root and a nested layer", () => {
    const { contents, diagnostics } = load({
      "AGENTS.md": "# Root\n",
      ".agents/manifest.yaml": "version: 1\n",
      ".agents/rules/general.md": "- Be nice.\n",
      ".agents/skills/review/SKILL.md": SKILL("review"),
      ".agents/mcp.yaml": STDIO("uvx"),
      "frontend/AGENTS.md": "# Frontend\n",
      "frontend/.agents/layer.yaml": "description: Web client\n",
      "frontend/.agents/rules/react.md": "- Hooks.\n",
      "frontend/.agents/rules/css.md": "- Tokens.\n",
      "frontend/.agents/hooks.yaml":
        "hooks:\n  lint: { event: after-edit, command: npm run lint }\n",
      "frontend/.agents/plugins.yaml": "plugins:\n  opencode:\n    - name: x\n",
    });
    expect(diagnostics).toEqual([]);
    const [root, frontend] = contents;
    expect(root?.meta).toEqual({ path: "." });
    expect(root?.agentsMd).toBe("AGENTS.md");
    expect([root?.rules.length, root?.skills.length, root?.mcp.length]).toEqual([1, 1, 1]);
    expect(frontend?.meta).toEqual({ path: "frontend", description: "Web client" });
    expect(frontend?.agentsMd).toBe("frontend/AGENTS.md");
    expect(frontend?.rules.map((r) => r.name)).toEqual(["css", "react"]);
    expect([frontend?.hooks.length, frontend?.plugins.length, frontend?.mcp.length]).toEqual([
      1, 1, 0,
    ]);
  });

  it("keeps a nested layer's files out of its parent", () => {
    const { contents } = load({
      "frontend/.agents/rules/a.md": "x\n",
      "frontend/web/.agents/rules/b.md": "x\n",
    });
    expect(contents.map((c) => c.rules.map((r) => r.name))).toEqual([[], ["a"], ["b"]]);
  });

  it("ignores files no parser knows", () => {
    expect(load({ ".agents/README.md": "notes\n" }).diagnostics).toEqual([]);
  });

  it("warns about rules in subfolders", () => {
    const { contents, diagnostics } = load({ ".agents/rules/x/y.md": "x\n" });
    expect(contents[0]?.rules).toEqual([]);
    expect(diagnostics).toEqual([expect.objectContaining({ level: "warning" })]);
  });

  it("rejects a manifest in a nested layer", () => {
    const { diagnostics } = load({ "frontend/.agents/manifest.yaml": "version: 1\n" });
    expect(diagnostics).toEqual([
      expect.objectContaining({
        level: "error",
        message: "manifest.yaml belongs in the root layer only",
      }),
    ]);
  });

  it("reports a skill directory without SKILL.md", () => {
    const { diagnostics } = load({ ".agents/skills/review/notes.md": "x\n" });
    expect(diagnostics).toEqual([
      expect.objectContaining({ level: "error", file: ".agents/skills/review/SKILL.md" }),
    ]);
  });
});

describe("validateLayers", () => {
  it("reports the same skill name with different content in two layers", () => {
    const { contents } = load({
      ".agents/skills/review/SKILL.md": SKILL("review", "Root review"),
      "frontend/.agents/skills/review/SKILL.md": SKILL("review", "Frontend review"),
    });
    const diagnostics = validateLayers(contents);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain("frontend");
  });

  it("accepts the same skill defined identically", () => {
    const { contents } = load({
      ".agents/skills/review/SKILL.md": SKILL("review"),
      "frontend/.agents/skills/review/SKILL.md": SKILL("review"),
    });
    expect(validateLayers(contents)).toEqual([]);
  });

  it("reports the same MCP server name with different definitions", () => {
    const { contents } = load({
      ".agents/mcp.yaml": STDIO("uvx"),
      "frontend/.agents/mcp.yaml": STDIO("npx"),
    });
    expect(validateLayers(contents)).toEqual([expect.objectContaining({ level: "error" })]);
  });

  it("accepts the same MCP server defined identically", () => {
    const { contents } = load({
      ".agents/mcp.yaml": STDIO("uvx"),
      "frontend/.agents/mcp.yaml": STDIO("uvx"),
    });
    expect(validateLayers(contents)).toEqual([]);
  });
});
