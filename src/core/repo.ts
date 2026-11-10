import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";

export class NotAGitRepoError extends Error {
  constructor(readonly cwd: string) {
    super(`Not a git repository: ${cwd}`);
    this.name = "NotAGitRepoError";
  }
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

export function findRepoRoot(cwd: string): string {
  try {
    return realpathSync(git(cwd, ["rev-parse", "--show-toplevel"]).trim());
  } catch {
    throw new NotAGitRepoError(cwd);
  }
}

export function listTrackedFiles(root: string): Set<string> {
  return new Set(git(root, ["ls-files", "--cached", "-z"]).split("\0").filter(Boolean));
}

/** Tracked files plus untracked ones that are not ignored, repo-relative POSIX paths. */
export function listRepoFiles(root: string): string[] {
  const out = git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]);
  return [...new Set(out.split("\0").filter(Boolean))].sort();
}
