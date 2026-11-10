import { describe, expect, it } from "vitest";
import { splitFrontmatter } from "../src/core/formats/frontmatter.js";
import { parseLayerYaml, parseManifest } from "../src/core/formats/manifest.js";
import { parseRule } from "../src/core/formats/rules.js";
import { parseSkill } from "../src/core/formats/skills.js";

describe("frontmatter", () => {
  it("returns empty data without frontmatter", () => {
    expect(splitFrontmatter("# Title\n")).toEqual({ data: {}, body: "# Title\n" });
  });

  it("splits frontmatter from the body", () => {
    expect(splitFrontmatter("---\na: 1\n---\nbody\n")).toEqual({ data: { a: 1 }, body: "body\n" });
  });
});

describe("rules", () => {
  const file = ".agents/rules/testing.md";

  it("reads a rule without frontmatter", () => {
    const { rule, diagnostics } = parseRule(".", file, "- Use Vitest.\n");
    expect(diagnostics).toEqual([]);
    expect(rule).toEqual({ layer: ".", name: "testing", file, body: "- Use Vitest.\n" });
  });

  it("reads description and paths", () => {
    const text = '---\ndescription: Testing\npaths: ["src/**/*.test.ts"]\n---\n- Use Vitest.\n';
    const { rule } = parseRule(".", file, text);
    expect(rule?.description).toBe("Testing");
    expect(rule?.paths).toEqual(["src/**/*.test.ts"]);
    expect(rule?.body).toBe("- Use Vitest.\n");
  });

  it("rejects paths that are not a list of strings", () => {
    const { rule, diagnostics } = parseRule(".", file, "---\npaths: src\n---\nx\n");
    expect(rule).toBeUndefined();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ level: "error", file });
    expect(diagnostics[0]?.message).toContain("paths");
  });

  it("rejects invalid YAML frontmatter", () => {
    const { rule, diagnostics } = parseRule(".", file, "---\na: [1\n---\nx\n");
    expect(rule).toBeUndefined();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.level).toBe("error");
  });

  it("rejects a file name outside the name pattern", () => {
    const { rule, diagnostics } = parseRule(".", ".agents/rules/-bad.md", "x\n");
    expect(rule).toBeUndefined();
    expect(diagnostics[0]?.message).toContain("name");
  });
});

describe("skills", () => {
  const dir = ".agents/skills/review";

  it("reads name and description", () => {
    const { skill, diagnostics } = parseSkill(
      ".",
      dir,
      "---\nname: review\ndescription: Review a PR\n---\nSteps\n",
    );
    expect(diagnostics).toEqual([]);
    expect(skill).toEqual({ layer: ".", name: "review", dir, description: "Review a PR" });
  });

  it("requires a description", () => {
    const { skill, diagnostics } = parseSkill(".", dir, "---\nname: review\n---\n");
    expect(skill).toBeUndefined();
    expect(diagnostics[0]?.message).toContain("description");
  });

  it("requires the name to match the directory", () => {
    const { skill, diagnostics } = parseSkill(
      ".",
      dir,
      "---\nname: reviewer\ndescription: x\n---\n",
    );
    expect(skill).toBeUndefined();
    expect(diagnostics[0]?.message).toContain("reviewer");
    expect(diagnostics[0]?.message).toContain("review");
  });
});

describe("manifest and layer.yaml", () => {
  it("accepts version 1", () => {
    expect(parseManifest(".agents/manifest.yaml", "version: 1\n")).toEqual([]);
  });

  it("rejects other versions", () => {
    const diagnostics = parseManifest(".agents/manifest.yaml", "version: 2\n");
    expect(diagnostics[0]?.message).toBe("Unsupported format version 2");
  });

  it("reads a layer description", () => {
    const { meta, diagnostics } = parseLayerYaml(
      "frontend",
      "frontend/.agents/layer.yaml",
      "description: Web client\n",
    );
    expect(diagnostics).toEqual([]);
    expect(meta).toEqual({ path: "frontend", description: "Web client" });
  });

  it("rejects a description that is not a string", () => {
    const { meta, diagnostics } = parseLayerYaml(
      "frontend",
      "frontend/.agents/layer.yaml",
      "description: [a]\n",
    );
    expect(meta).toEqual({ path: "frontend" });
    expect(diagnostics[0]?.message).toContain("description");
  });
});
