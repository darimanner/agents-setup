import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** Creates a temp git repo with the given files and returns its real absolute path. */
export function makeRepo(files: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "agents-setup-repo-")));
  execFileSync("git", ["init", "-q"], { cwd: root });
  writeFiles(root, files);
  return root;
}

export function writeFiles(root: string, files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}
