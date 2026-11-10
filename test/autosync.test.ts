import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { claudeCode } from "../src/adapters/claude-code.js";
import { codex } from "../src/adapters/codex.js";
import {
  AUTOSYNC_ID,
  autosyncCommand,
  autosyncPath,
  autosyncScript,
  computeStamp,
  stampPath,
} from "../src/core/autosync.js";
import { makeRepo, planWith, writeFiles } from "./helpers.js";

const LAYERS = { "AGENTS.md": "# Root\n", ".agents/rules/a.md": "- A.\n", "src/x.ts": "" };

/** A stand-in for the CLI that records its arguments. */
const FAKE_CLI =
  'import { writeFileSync } from "node:fs";\nwriteFileSync("synced.txt", process.argv.slice(2).join(" "));\n';

function installScript(root: string, cli: string) {
  const script = autosyncPath("claude-code");
  writeFiles(root, {
    [script]: autosyncScript("claude-code", cli),
    [stampPath("claude-code")]: `${computeStamp(root)}\n`,
  });
  chmodSync(join(root, script), 0o755);
}

const runHook = (root: string, cwd = root) =>
  spawnSync("/bin/sh", ["-c", autosyncCommand("claude-code", "$CLAUDE_PROJECT_DIR")], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: cwd },
  });

describe("auto-sync stamp", () => {
  it("changes with uncommitted edits and new layers, not with other files", () => {
    const root = makeRepo(LAYERS);
    const first = computeStamp(root);
    writeFiles(root, { "src/x.ts": "changed", ".agents/.state/claude-code.json": "{}" });
    expect(computeStamp(root)).toBe(first);
    writeFiles(root, { ".agents/rules/a.md": "- A, edited.\n" });
    const edited = computeStamp(root);
    expect(edited).not.toBe(first);
    writeFiles(root, { "frontend/web/.agents/rules/b.md": "- B.\n" });
    expect(computeStamp(root)).not.toBe(edited);
  });
});

describe("auto-sync script", () => {
  it("does nothing while the layers are unchanged", () => {
    const root = makeRepo({ ...LAYERS, "cli.mjs": FAKE_CLI });
    installScript(root, join(root, "cli.mjs"));
    expect(runHook(root).status).toBe(0);
    expect(existsSync(join(root, "synced.txt"))).toBe(false);
  });

  it("syncs its agent after a change, also from a subfolder", () => {
    const root = makeRepo({ ...LAYERS, "cli.mjs": FAKE_CLI });
    installScript(root, join(root, "cli.mjs"));
    writeFiles(root, { ".agents/rules/a.md": "- A, pulled.\n" });
    expect(runHook(root, join(root, "src")).status).toBe(0);
    expect(readFileSync(join(root, "synced.txt"), "utf8")).toBe("sync --agent claude-code --quiet");
  });

  it("asks for a manual sync when the CLI is gone", () => {
    const root = makeRepo(LAYERS);
    installScript(root, join(root, "missing.mjs"));
    writeFiles(root, { ".agents/rules/a.md": "- A, pulled.\n" });
    const result = runHook(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("run agents-setup sync");
  });

  it("exits 0 when the script is missing", () => {
    expect(runHook(makeRepo(LAYERS)).status).toBe(0);
  });
});

describe("auto-sync in adapters", () => {
  const cli = { cli: "/opt/agents-setup/dist/main.js" };

  it.each([
    ["claude code", claudeCode, ".claude/settings.local.json"],
    ["codex", codex, ".codex/config.toml"],
  ] as const)("%s registers a session-start hook without approval", (_name, adapter, config) => {
    const { operations, approvals } = planWith(adapter, LAYERS, makeRepo({}), { autoSync: cli });
    const hook = operations.find((op) => op.kind === "merge-json-item" && op.id === AUTOSYNC_ID);
    expect(hook).toMatchObject({ path: config, key: ["hooks", "SessionStart"] });
    expect(hook?.approval).toBeUndefined();
    const paths = operations.map((op) => op.path);
    expect(paths).toContain(autosyncPath(adapter.id));
    expect(paths).toContain(stampPath(adapter.id));
    expect(approvals).toEqual([]);
  });
});
