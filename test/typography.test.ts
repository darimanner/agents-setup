import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const script = new URL("../scripts/check-typography.mjs", import.meta.url).pathname;
// Built from code points so this test file passes the check it tests.
const char = (code: number) => String.fromCodePoint(code);

function check(content: string) {
  const file = join(mkdtempSync(join(tmpdir(), "agents-setup-typo-")), "doc.md");
  writeFileSync(file, content);
  return spawnSync(process.execPath, [script, file], { encoding: "utf8" });
}

describe("check-typography", () => {
  it("passes plain text", () => {
    expect(check('A plain - line with "quotes" and ...\n').status).toBe(0);
  });

  it("fails on an em dash and names the line and code point", () => {
    const result = check(`ok\nbad ${char(0x2014)} line\n`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("doc.md:2: U+2014 em dash");
  });

  it.each([0x201c, 0x2019, 0x2026, 0x00a0, 0x2212])("fails on code point %d", (code) => {
    expect(check(`x${char(code)}y\n`).status).toBe(1);
  });
});
