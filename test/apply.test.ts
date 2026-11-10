import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type ApplyOptions, applyPlan, UnsafePathError } from "../src/core/apply.js";
import type { ApprovalItem, Operation, Plan } from "../src/core/plan.js";
import { makeRepo, writeFiles } from "./helpers.js";

function plan(operations: Operation[], approvals: ApprovalItem[] = []): Plan {
  return { agent: "claude-code", scopes: ["."], operations, approvals, warnings: [] };
}

function options(partial: Partial<ApplyOptions> = {}): ApplyOptions {
  return {
    approved: {},
    force: false,
    dryRun: false,
    tracked: new Set(),
    contentHash: "h",
    ...partial,
  };
}

const write = (path: string, content: string, extra: Partial<Operation> = {}): Operation =>
  ({ kind: "write", path, content, ...extra }) as Operation;

const read = (root: string, path: string) => readFileSync(join(root, path), "utf8");

function listAll(root: string): string[] {
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((p) => !p.startsWith(".git/") && p !== ".git")
    .sort();
}

describe("applyPlan files", () => {
  it("writes new files and records their hashes", () => {
    const root = makeRepo({});
    const { state, report } = applyPlan(root, plan([write("a/b.md", "x\n")]), undefined, options());
    expect(read(root, "a/b.md")).toBe("x\n");
    expect(report.written).toEqual(["a/b.md"]);
    expect(Object.keys(state.files)).toEqual(["a/b.md"]);
    expect(state.contentHash).toBe("h");
  });

  it("writes read-only files when asked and can update them later", () => {
    const root = makeRepo({});
    const first = applyPlan(
      root,
      plan([write("r.md", "1\n", { readonly: true })]),
      undefined,
      options(),
    );
    expect(statSync(join(root, "r.md")).mode & 0o222).toBe(0);
    applyPlan(root, plan([write("r.md", "2\n", { readonly: true })]), first.state, options());
    expect(read(root, "r.md")).toBe("2\n");
  });

  it.each([
    ["a parent segment", "../outside.md"],
    ["an absolute path", "/etc/agents-setup-test"],
    ["a nested parent segment", "a/../../outside.md"],
  ])("refuses %s before writing anything", (_label, path) => {
    const root = makeRepo({});
    const before = listAll(root);
    expect(() =>
      applyPlan(root, plan([write("ok.md", "x"), write(path, "x")]), undefined, options()),
    ).toThrow(UnsafePathError);
    expect(listAll(root)).toEqual(before);
  });

  it("refuses a symlink whose target escapes the root", () => {
    const root = makeRepo({});
    const op: Operation = { kind: "symlink", path: "a/link", target: "../../outside" };
    expect(() => applyPlan(root, plan([op]), undefined, options())).toThrow(UnsafePathError);
  });

  it("refuses to write through a directory symlink that leaves the root", () => {
    const root = makeRepo({});
    const outside = makeRepo({});
    symlinkSync(outside, join(root, ".claude"));
    expect(() => applyPlan(root, plan([write(".claude/x.md", "x")]), undefined, options())).toThrow(
      UnsafePathError,
    );
    expect(existsSync(join(outside, "x.md"))).toBe(false);
  });

  it.each([
    "CLAUDE.md",
    "frontend/CLAUDE.md",
    ".claude/CLAUDE.md",
    "CLAUDE.local.md",
    ".hermes.md",
    "web/AGENTS.override.md",
  ])("never creates %s", (path) => {
    const root = makeRepo({});
    expect(() => applyPlan(root, plan([write(path, "x")]), undefined, options())).toThrow(
      UnsafePathError,
    );
  });

  it("does not overwrite a file it did not create", () => {
    const root = makeRepo({ "notes.md": "mine\n" });
    const { report, state } = applyPlan(
      root,
      plan([write("notes.md", "ours\n")]),
      undefined,
      options(),
    );
    expect(read(root, "notes.md")).toBe("mine\n");
    expect(report.skipped).toEqual([
      { path: "notes.md", reason: "exists and was not created by agents-setup" },
    ]);
    expect(state.files).toEqual({});
  });

  it("keeps a generated file the user edited", () => {
    const root = makeRepo({});
    const first = applyPlan(root, plan([write("g.md", "1\n")]), undefined, options());
    writeFiles(root, { "g.md": "edited\n" });
    const { report, state } = applyPlan(root, plan([write("g.md", "2\n")]), first.state, options());
    expect(read(root, "g.md")).toBe("edited\n");
    expect(report.skipped).toEqual([{ path: "g.md", reason: "modified since last sync" }]);
    expect(state.files["g.md"]).toEqual(first.state.files["g.md"]);
  });

  it("backs up then overwrites with force", () => {
    const root = makeRepo({});
    const first = applyPlan(root, plan([write("g.md", "1\n")]), undefined, options());
    writeFiles(root, { "g.md": "edited\n" });
    applyPlan(root, plan([write("g.md", "2\n")]), first.state, options({ force: true }));
    expect(read(root, "g.md")).toBe("2\n");
    const backups = readdirSync(join(root, ".agents/.state/backup"), {
      recursive: true,
      encoding: "utf8",
    });
    const backup = backups.find((p) => p.endsWith("g.md"));
    expect(backup).toBeDefined();
    expect(read(root, join(".agents/.state/backup", backup ?? ""))).toBe("edited\n");
  });

  it("skips tracked files", () => {
    const root = makeRepo({});
    const { report } = applyPlan(
      root,
      plan([write(".mcp.json", "{}")]),
      undefined,
      options({ tracked: new Set([".mcp.json"]) }),
    );
    expect(existsSync(join(root, ".mcp.json"))).toBe(false);
    expect(report.skipped).toEqual([{ path: ".mcp.json", reason: "tracked by git" }]);
  });

  it("removes files no longer planned and prunes empty folders", () => {
    const root = makeRepo({});
    const first = applyPlan(
      root,
      plan([write("d/e/a.md", "a"), write("b.md", "b")]),
      undefined,
      options(),
    );
    const { report, state } = applyPlan(root, plan([write("b.md", "b")]), first.state, options());
    expect(existsSync(join(root, "d"))).toBe(false);
    expect(report.removed).toEqual(["d/e/a.md"]);
    expect(Object.keys(state.files)).toEqual(["b.md"]);
  });

  it("keeps removed-from-plan files the user edited", () => {
    const root = makeRepo({});
    const first = applyPlan(root, plan([write("a.md", "a")]), undefined, options());
    writeFiles(root, { "a.md": "edited" });
    const { report, state } = applyPlan(root, plan([]), first.state, options());
    expect(read(root, "a.md")).toBe("edited");
    expect(report.skipped).toEqual([{ path: "a.md", reason: "modified since last sync; kept" }]);
    expect(state.files).toEqual({});
  });
});

describe("applyPlan symlinks", () => {
  const link = (path: string, target: string): Operation => ({ kind: "symlink", path, target });

  it("creates and replaces symlinks it owns", () => {
    const root = makeRepo({ ".agents/skills/a/SKILL.md": "x", ".agents/skills/b/SKILL.md": "y" });
    const first = applyPlan(
      root,
      plan([link(".claude/skills/s", "../../.agents/skills/a")]),
      undefined,
      options(),
    );
    expect(readlinkSync(join(root, ".claude/skills/s"))).toBe("../../.agents/skills/a");
    applyPlan(
      root,
      plan([link(".claude/skills/s", "../../.agents/skills/b")]),
      first.state,
      options(),
    );
    expect(readlinkSync(join(root, ".claude/skills/s"))).toBe("../../.agents/skills/b");
  });

  it("does not replace a real directory at a symlink path", () => {
    const root = makeRepo({ ".agents/skills/a/SKILL.md": "x" });
    mkdirSync(join(root, ".claude/skills/s"), { recursive: true });
    const { report } = applyPlan(
      root,
      plan([link(".claude/skills/s", "../../.agents/skills/a")]),
      undefined,
      options(),
    );
    expect(lstatSync(join(root, ".claude/skills/s")).isDirectory()).toBe(true);
    expect(report.skipped[0]?.reason).toBe("exists and was not created by agents-setup");
  });

  it("removes its symlinks when no longer planned", () => {
    const root = makeRepo({ ".agents/skills/a/SKILL.md": "x" });
    const first = applyPlan(
      root,
      plan([link(".claude/skills/s", "../../.agents/skills/a")]),
      undefined,
      options(),
    );
    applyPlan(root, plan([]), first.state, options());
    expect(existsSync(join(root, ".claude"))).toBe(false);
    expect(existsSync(join(root, ".agents/skills/a/SKILL.md"))).toBe(true);
  });
});

describe("applyPlan approvals", () => {
  const approval: ApprovalItem = {
    id: "hook:.:fmt",
    kind: "hook",
    layer: ".",
    name: "fmt",
    fingerprint: "f2",
    definition: { command: "npm run format" },
  };
  const op = write("hooks.json", "{}", { approval: approval.id });

  it("holds operations that are not approved", () => {
    const root = makeRepo({});
    const { report, state } = applyPlan(root, plan([op], [approval]), undefined, options());
    expect(existsSync(join(root, "hooks.json"))).toBe(false);
    expect(report.pending).toEqual([approval]);
    expect(state.approved).toEqual({});
  });

  it("applies operations approved with the current fingerprint", () => {
    const root = makeRepo({});
    const { report, state } = applyPlan(
      root,
      plan([op], [approval]),
      undefined,
      options({ approved: { [approval.id]: "f2" } }),
    );
    expect(existsSync(join(root, "hooks.json"))).toBe(true);
    expect(report.pending).toEqual([]);
    expect(state.approved).toEqual({ [approval.id]: "f2" });
  });

  it("holds operations approved with an old fingerprint", () => {
    const root = makeRepo({});
    const { report } = applyPlan(
      root,
      plan([op], [approval]),
      undefined,
      options({ approved: { [approval.id]: "f1" } }),
    );
    expect(report.pending).toEqual([approval]);
  });
});

describe("applyPlan dry run", () => {
  it("writes nothing but reports the same", () => {
    const root = makeRepo({});
    const before = listAll(root);
    const dry = applyPlan(root, plan([write("a.md", "x")]), undefined, options({ dryRun: true }));
    expect(listAll(root)).toEqual(before);
    expect(dry.report.written).toEqual(["a.md"]);
  });
});

describe("applyPlan with a tampered state", () => {
  it("ignores state paths outside the repo", () => {
    const parent = makeRepo({});
    const root = join(parent, "repo");
    mkdirSync(root);
    writeFileSync(join(parent, "victim.md"), "keep me");
    const first = applyPlan(root, plan([write("a.md", "x")]), undefined, options());
    const tampered = {
      ...first.state,
      files: { "../victim.md": first.state.files["a.md"] ?? { hash: "" } },
    };
    writeFileSync(join(parent, "victim.md"), "x");
    const { report } = applyPlan(root, plan([]), tampered, options());
    expect(readFileSync(join(parent, "victim.md"), "utf8")).toBe("x");
    expect(report.errors[0]).toContain("unsafe path");
  });
});
