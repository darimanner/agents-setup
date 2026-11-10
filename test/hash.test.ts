import { describe, expect, it } from "vitest";
import { contentHash } from "../src/core/hash.js";
import { discoverLayers } from "../src/core/layers.js";
import { listRepoFiles } from "../src/core/repo.js";
import { makeRepo, writeFiles } from "./helpers.js";

function hashOf(root: string): string {
  const files = listRepoFiles(root);
  return contentHash(root, files, discoverLayers(files));
}

describe("contentHash", () => {
  const base = {
    "AGENTS.md": "# Root\n",
    ".agents/rules/a.md": "one\n",
    "src/app.ts": "x\n",
  };

  it("changes when a rule changes", () => {
    const root = makeRepo(base);
    const before = hashOf(root);
    writeFiles(root, { ".agents/rules/a.md": "two\n" });
    expect(hashOf(root)).not.toBe(before);
  });

  it("changes when a nested layer is added", () => {
    const root = makeRepo(base);
    const before = hashOf(root);
    writeFiles(root, { "frontend/.agents/rules/b.md": "x\n" });
    expect(hashOf(root)).not.toBe(before);
  });

  it("changes when an AGENTS.md changes", () => {
    const root = makeRepo(base);
    const before = hashOf(root);
    writeFiles(root, { "AGENTS.md": "# Changed\n" });
    expect(hashOf(root)).not.toBe(before);
  });

  it("does not change for files outside layers", () => {
    const root = makeRepo(base);
    const before = hashOf(root);
    writeFiles(root, { "src/app.ts": "y\n", "README.md": "z\n" });
    expect(hashOf(root)).toBe(before);
  });
});
