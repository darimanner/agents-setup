import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type ApplyOptions, applyPlan } from "../src/core/apply.js";
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

const key = (path: string, k: string[], value: unknown): Operation => ({
  kind: "merge-json",
  path,
  key: k,
  value,
});
const item = (path: string, k: string[], id: string, value: unknown): Operation => ({
  kind: "merge-json-item",
  path,
  key: k,
  id,
  value,
});
const json = (root: string, path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));
const raw = (root: string, path: string) => readFileSync(join(root, path), "utf8");

const CONTEXT7 = { type: "http", url: "https://mcp.context7.com/mcp" };

describe("merge-json keys", () => {
  it("creates the file with only owned keys", () => {
    const root = makeRepo({});
    const { state, report } = applyPlan(
      root,
      plan([key(".mcp.json", ["mcpServers", "context7"], CONTEXT7)]),
      undefined,
      options(),
    );
    expect(json(root, ".mcp.json")).toEqual({ mcpServers: { context7: CONTEXT7 } });
    expect(raw(root, ".mcp.json").endsWith("}\n")).toBe(true);
    expect(state.merged[".mcp.json"]?.created).toBe(true);
    expect(report.written).toEqual([".mcp.json"]);
  });

  it("merges into an existing file keeping the user's keys and order", () => {
    const root = makeRepo({
      ".mcp.json": '{"a": 1, "mcpServers": {"mine": {"command": "x"}}, "z": 2}',
    });
    const { state } = applyPlan(
      root,
      plan([key(".mcp.json", ["mcpServers", "context7"], CONTEXT7)]),
      undefined,
      options(),
    );
    const doc = json(root, ".mcp.json");
    expect(Object.keys(doc)).toEqual(["a", "mcpServers", "z"]);
    expect(Object.keys(doc.mcpServers)).toEqual(["mine", "context7"]);
    expect(state.merged[".mcp.json"]?.created).toBe(false);
  });

  it.each([
    ["invalid JSON", "{nope"],
    ["an array root", "[1, 2]"],
  ])("leaves %s untouched and reports it", (_label, content) => {
    const root = makeRepo({ ".mcp.json": content });
    const { report } = applyPlan(
      root,
      plan([key(".mcp.json", ["mcpServers", "context7"], CONTEXT7)]),
      undefined,
      options(),
    );
    expect(raw(root, ".mcp.json")).toBe(content);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toContain(".mcp.json");
  });

  it("does not take over a key the user already set", () => {
    const root = makeRepo({ ".mcp.json": '{"mcpServers": {"context7": {"url": "mine"}}}' });
    const { report } = applyPlan(
      root,
      plan([key(".mcp.json", ["mcpServers", "context7"], CONTEXT7)]),
      undefined,
      options(),
    );
    expect(json(root, ".mcp.json").mcpServers.context7).toEqual({ url: "mine" });
    expect(report.skipped[0]?.reason).toBe("exists and was not created by agents-setup");
  });

  it("keeps an owned key the user changed unless forced", () => {
    const root = makeRepo({});
    const op = key(".mcp.json", ["mcpServers", "context7"], CONTEXT7);
    const first = applyPlan(root, plan([op]), undefined, options());
    writeFiles(root, { ".mcp.json": '{"mcpServers": {"context7": {"url": "edited"}}}' });
    const kept = applyPlan(root, plan([op]), first.state, options());
    expect(json(root, ".mcp.json").mcpServers.context7).toEqual({ url: "edited" });
    expect(kept.report.skipped[0]?.reason).toBe("modified since last sync");
    applyPlan(root, plan([op]), kept.state, options({ force: true }));
    expect(json(root, ".mcp.json").mcpServers.context7).toEqual(CONTEXT7);
  });

  it("removes owned keys no longer planned and deletes a created file once empty", () => {
    const root = makeRepo({});
    const first = applyPlan(
      root,
      plan([key(".mcp.json", ["mcpServers", "context7"], CONTEXT7)]),
      undefined,
      options(),
    );
    const { report, state } = applyPlan(root, plan([]), first.state, options());
    expect(existsSync(join(root, ".mcp.json"))).toBe(false);
    expect(report.removed).toEqual([".mcp.json"]);
    expect(state.merged).toEqual({});
  });

  it("removes only its keys from a file the user owns", () => {
    const root = makeRepo({ ".mcp.json": '{"mcpServers": {"mine": {"command": "x"}}}' });
    const first = applyPlan(
      root,
      plan([key(".mcp.json", ["mcpServers", "context7"], CONTEXT7)]),
      undefined,
      options(),
    );
    applyPlan(root, plan([]), first.state, options());
    expect(json(root, ".mcp.json")).toEqual({ mcpServers: { mine: { command: "x" } } });
  });

  it("holds unapproved merge operations", () => {
    const root = makeRepo({});
    const approval: ApprovalItem = {
      id: "mcp:.:context7",
      kind: "mcp",
      layer: ".",
      name: "context7",
      fingerprint: "f",
      definition: {},
    };
    const op = { ...key(".mcp.json", ["mcpServers", "context7"], CONTEXT7), approval: approval.id };
    const { report } = applyPlan(root, plan([op], [approval]), undefined, options());
    expect(existsSync(join(root, ".mcp.json"))).toBe(false);
    expect(report.pending).toEqual([approval]);
  });
});

describe("merge-json array items", () => {
  const settings = ".claude/settings.local.json";
  const hooksKey = ["hooks", "PreToolUse"];
  const mine = { matcher: "Bash", hooks: [{ type: "command", command: "mine.sh" }] };
  const ours = (command: string) => ({
    matcher: "Read",
    hooks: [{ type: "command", command }],
  });

  it("appends after the user's items without duplicating on the next sync", () => {
    const root = makeRepo({ [settings]: JSON.stringify({ hooks: { PreToolUse: [mine] } }) });
    const op = item(settings, hooksKey, "guard", ours("guard.sh"));
    const first = applyPlan(root, plan([op]), undefined, options());
    applyPlan(root, plan([op]), first.state, options());
    expect(json(root, settings).hooks.PreToolUse).toEqual([mine, ours("guard.sh")]);
  });

  it("replaces a changed owned item in place", () => {
    const root = makeRepo({});
    const first = applyPlan(
      root,
      plan([
        item(settings, hooksKey, "guard", ours("v1.sh")),
        item(settings, hooksKey, "fmt", ours("fmt.sh")),
      ]),
      undefined,
      options(),
    );
    writeFiles(root, {
      [settings]: JSON.stringify({
        hooks: { PreToolUse: [...json(root, settings).hooks.PreToolUse, mine] },
      }),
    });
    applyPlan(
      root,
      plan([
        item(settings, hooksKey, "guard", ours("v2.sh")),
        item(settings, hooksKey, "fmt", ours("fmt.sh")),
      ]),
      first.state,
      options(),
    );
    expect(json(root, settings).hooks.PreToolUse).toEqual([ours("v2.sh"), ours("fmt.sh"), mine]);
  });

  it("removes only its own item", () => {
    const root = makeRepo({ [settings]: JSON.stringify({ hooks: { PreToolUse: [mine] } }) });
    const first = applyPlan(
      root,
      plan([item(settings, hooksKey, "guard", ours("g.sh"))]),
      undefined,
      options(),
    );
    applyPlan(root, plan([]), first.state, options());
    expect(json(root, settings)).toEqual({ hooks: { PreToolUse: [mine] } });
  });

  it("owns string items", () => {
    const root = makeRepo({ [settings]: '{"enabledMcpjsonServers": ["mine"]}' });
    const op = item(settings, ["enabledMcpjsonServers"], "context7", "context7");
    const first = applyPlan(root, plan([op]), undefined, options());
    expect(json(root, settings).enabledMcpjsonServers).toEqual(["mine", "context7"]);
    applyPlan(root, plan([]), first.state, options());
    expect(json(root, settings).enabledMcpjsonServers).toEqual(["mine"]);
  });

  it("reports a key that holds something other than an array", () => {
    const root = makeRepo({ [settings]: '{"enabledMcpjsonServers": "all"}' });
    const { report } = applyPlan(
      root,
      plan([item(settings, ["enabledMcpjsonServers"], "c", "c")]),
      undefined,
      options(),
    );
    expect(json(root, settings).enabledMcpjsonServers).toBe("all");
    expect(report.errors[0]).toContain("enabledMcpjsonServers");
  });
});

describe("merged TOML files", () => {
  const CONFIG = ".codex/config.toml";
  const docs = key(CONFIG, ["mcp_servers", "docs"], { url: "https://x.dev/mcp" });
  const hook = item(CONFIG, ["hooks", "Stop"], "a", { hooks: [{ type: "command", command: "x" }] });

  it("creates, updates and removes a file it owns", () => {
    const root = makeRepo({});
    const first = applyPlan(root, plan([docs, hook]), undefined, options());
    expect(raw(root, CONFIG)).toBe(
      '[mcp_servers.docs]\nurl = "https://x.dev/mcp"\n\n[[hooks.Stop]]\n[[hooks.Stop.hooks]]\ntype = "command"\ncommand = "x"\n',
    );
    const changed = key(CONFIG, ["mcp_servers", "docs"], { url: "https://y.dev/mcp" });
    const second = applyPlan(root, plan([changed]), first.state, options());
    expect(raw(root, CONFIG)).toBe('[mcp_servers.docs]\nurl = "https://y.dev/mcp"\n');
    applyPlan(root, plan([]), second.state, options());
    expect(existsSync(join(root, CONFIG))).toBe(false);
  });

  it("leaves a TOML file it did not create untouched", () => {
    const mine = '# my settings\nmodel = "x"\n';
    const root = makeRepo({ [CONFIG]: mine });
    const { state, report } = applyPlan(root, plan([docs]), undefined, options());
    expect(raw(root, CONFIG)).toBe(mine);
    expect(state.merged[CONFIG]).toBeUndefined();
    expect(report.skipped[0]?.reason).toContain("only edits TOML files it created");
  });
});
