import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HOOK_RUNNER,
  HOOK_RUNNER_PATH,
  type HookSpec,
  runnerCommand,
} from "../src/core/hook-runner.js";
import { makeRepo, writeFiles } from "./helpers.js";

function setup(files: Record<string, string> = {}) {
  const root = makeRepo({ ...files, [HOOK_RUNNER_PATH]: HOOK_RUNNER });
  chmodSync(join(root, HOOK_RUNNER_PATH), 0o755);
  return root;
}

function runHook(root: string, spec: HookSpec, stdin: string, cwd = root) {
  return spawnSync("/bin/sh", ["-c", runnerCommand("$CLAUDE_PROJECT_DIR", spec)], {
    cwd,
    input: stdin,
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: cwd },
  });
}

const edit = (root: string, rel: string) =>
  JSON.stringify({ tool_name: "Edit", tool_input: { file_path: join(root, rel) } });

describe("hook runner", () => {
  it("runs an after-edit hook for a matching file in its layer, with {file}", () => {
    const root = setup({ "backend/app/x.py": "" });
    const spec: HookSpec = {
      event: "after-edit",
      layer: "backend",
      match: "**/*.py",
      command: "echo {file} > out.txt",
    };
    const result = runHook(root, spec, edit(root, "backend/app/x.py"), join(root, "backend"));
    expect(result.status).toBe(0);
    expect(readFileSync(join(root, "out.txt"), "utf8")).toBe("backend/app/x.py\n");
  });

  it("skips files outside the layer or not matching", () => {
    const root = setup();
    const spec: HookSpec = {
      event: "after-edit",
      layer: "backend",
      match: "**/*.py",
      command: "touch ran",
    };
    runHook(root, spec, edit(root, "frontend/a.py"));
    runHook(root, spec, edit(root, "backend/a.ts"));
    expect(existsSync(join(root, "ran"))).toBe(false);
  });

  it("quotes paths with spaces and quotes", () => {
    const root = setup({ "it's a file.py": "" });
    const spec: HookSpec = {
      event: "after-edit",
      layer: ".",
      match: "*.py",
      command: "cat {file} && echo ok > out.txt",
    };
    expect(runHook(root, spec, edit(root, "it's a file.py")).status).toBe(0);
    expect(readFileSync(join(root, "out.txt"), "utf8")).toBe("ok\n");
  });

  it("matches brace patterns", () => {
    const root = setup();
    const spec: HookSpec = {
      event: "after-edit",
      layer: ".",
      match: "src/**/*.{ts,tsx}",
      command: "touch ran",
    };
    runHook(root, spec, edit(root, "src/a/b.tsx"));
    expect(existsSync(join(root, "ran"))).toBe(true);
  });

  it("forwards stdin and the exit code for other events", () => {
    const root = setup();
    const spec: HookSpec = { event: "before-tool", layer: ".", command: "cat > in.json; exit 2" };
    const result = runHook(root, spec, '{"tool_name":"Bash"}');
    expect(result.status).toBe(2);
    expect(readFileSync(join(root, "in.json"), "utf8")).toBe('{"tool_name":"Bash"}');
  });

  it("exits 0 when the runner is missing", () => {
    const root = makeRepo({});
    const spec: HookSpec = { event: "stop", layer: ".", command: "exit 3" };
    expect(runHook(root, spec, "").status).toBe(0);
  });

  it("runs from a subfolder of the repo", () => {
    const root = setup();
    writeFiles(root, { "frontend/web/x.ts": "" });
    const spec: HookSpec = { event: "session-start", layer: ".", command: "pwd > where.txt" };
    runHook(root, spec, "", join(root, "frontend/web"));
    expect(readFileSync(join(root, "where.txt"), "utf8").trim()).toBe(root);
  });
});
