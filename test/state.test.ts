import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyState, InvalidStateError, readState, writeState } from "../src/core/state.js";
import { makeRepo } from "./helpers.js";

describe("state", () => {
  it("round-trips", () => {
    const root = makeRepo({});
    const state = {
      ...emptyState("claude-code"),
      scopes: [".", "frontend"],
      contentHash: "abc",
      files: { ".claude/rules/agents-setup/a.md": { hash: "h1" } },
      approved: { "mcp:.:db": "f1" },
    };
    writeState(root, state);
    expect(readState(root, "claude-code")).toEqual(state);
  });

  it("is undefined when missing", () => {
    expect(readState(makeRepo({}), "codex")).toBeUndefined();
  });

  it("throws on a corrupt file", () => {
    const root = makeRepo({});
    mkdirSync(join(root, ".agents", ".state"), { recursive: true });
    writeFileSync(join(root, ".agents", ".state", "opencode.json"), "{not json");
    expect(() => readState(root, "opencode")).toThrow(InvalidStateError);
  });

  it("throws on a file of another shape", () => {
    const root = makeRepo({});
    mkdirSync(join(root, ".agents", ".state"), { recursive: true });
    writeFileSync(join(root, ".agents", ".state", "opencode.json"), '{"version": 9}');
    expect(() => readState(root, "opencode")).toThrow(InvalidStateError);
  });
});
