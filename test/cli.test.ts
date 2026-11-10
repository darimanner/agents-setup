import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run, VERSION } from "../src/cli.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const builtBin = new URL("../dist/main.js", import.meta.url).pathname;

function capture() {
  const out = { stdout: "", stderr: "" };
  const io = {
    stdout: (s: string) => {
      out.stdout += s;
    },
    stderr: (s: string) => {
      out.stderr += s;
    },
  };
  return { out, io };
}

describe("cli", () => {
  it("prints the version", async () => {
    const { out, io } = capture();
    expect(await run(["--version"], io)).toBe(0);
    expect(VERSION).toBe(pkg.version);
    expect(out.stdout).toBe(`${VERSION}\n`);
  });

  it("prints usage with no arguments", async () => {
    const { out, io } = capture();
    expect(await run([], io)).toBe(0);
    expect(out.stdout).toContain("Usage: agents-setup <command>");
  });

  it("rejects an unknown command", async () => {
    const { out, io } = capture();
    expect(await run(["frobnicate"], io)).toBe(1);
    expect(out.stderr).toContain("Unknown command: frobnicate");
    expect(out.stdout).toBe("");
  });

  it("rejects an unknown flag", async () => {
    const { out, io } = capture();
    expect(await run(["--nope"], io)).toBe(1);
    expect(out.stderr).toContain("--nope");
  });

  // npx and global installs call the bin through a symlink.
  it.skipIf(!existsSync(builtBin))("built bin works through a symlink", () => {
    const link = join(mkdtempSync(join(tmpdir(), "agents-setup-")), "agents-setup");
    symlinkSync(builtBin, link);
    const output = execFileSync(process.execPath, [link, "--version"], { encoding: "utf8" });
    expect(output).toBe(`${VERSION}\n`);
  });
});
