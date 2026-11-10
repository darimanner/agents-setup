import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverLayers, resolveScopes, UnknownScopeError } from "../src/core/layers.js";
import { findRepoRoot, listRepoFiles, NotAGitRepoError } from "../src/core/repo.js";
import { makeRepo } from "./helpers.js";

describe("repo", () => {
  it("finds the repo root from a subdirectory", () => {
    const root = makeRepo({ "frontend/x.ts": "" });
    expect(findRepoRoot(join(root, "frontend"))).toBe(root);
  });

  it("throws outside a git repo", () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "agents-setup-nogit-")));
    expect(() => findRepoRoot(dir)).toThrow(NotAGitRepoError);
  });

  it("lists untracked files but not ignored ones", () => {
    const root = makeRepo({ ".gitignore": "ignored/\n", "a.md": "", "ignored/b.md": "" });
    const files = listRepoFiles(root);
    expect(files).toContain("a.md");
    expect(files).not.toContain("ignored/b.md");
  });
});

describe("layers", () => {
  it("discovers nested layers", () => {
    const files = [
      ".agents/rules/a.md",
      "backend/src/x.ts",
      "frontend/.agents/mcp.yaml",
      "frontend/web/.agents/rules/b.md",
    ];
    expect(discoverLayers(files)).toEqual([".", "frontend", "frontend/web"]);
  });

  it("is a layer at the root even without .agents", () => {
    expect(discoverLayers(["README.md"])).toEqual(["."]);
  });

  const layers = [".", "backend", "frontend", "frontend/admin", "frontend/web"];

  it("resolves a scope with ancestors and descendants", () => {
    expect(resolveScopes(layers, ["frontend"])).toEqual([
      ".",
      "frontend",
      "frontend/admin",
      "frontend/web",
    ]);
  });

  it("resolves a nested scope", () => {
    expect(resolveScopes(layers, ["frontend/web"])).toEqual([".", "frontend", "frontend/web"]);
  });

  it("selects every layer with all", () => {
    expect(resolveScopes(layers, ["all"])).toEqual(layers);
  });

  it("selects only the root without a scope", () => {
    expect(resolveScopes(layers, [])).toEqual(["."]);
  });

  it("rejects an unknown scope", () => {
    try {
      resolveScopes(layers, ["mobile"]);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(UnknownScopeError);
      expect((error as UnknownScopeError).available).toEqual(layers.slice(1));
    }
  });
});
