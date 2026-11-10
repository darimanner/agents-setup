import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect } from "vitest";
import type { Adapter, AdapterContext } from "../src/adapters/types.js";
import { approvalItems } from "../src/core/fingerprint.js";
import { discoverLayers } from "../src/core/layers.js";
import { loadLayers } from "../src/core/load.js";
import type { Plan } from "../src/core/plan.js";
import { listRepoFiles } from "../src/core/repo.js";

/** Creates a temp git repo with the given files and returns its real absolute path. */
export function makeRepo(files: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "agents-setup-repo-")));
  execFileSync("git", ["init", "-q"], { cwd: root });
  writeFiles(root, files);
  return root;
}

/** Plans `files` (all layers selected) with one adapter; fails on validation errors. */
export function planWith(
  adapter: Adapter,
  files: Record<string, string>,
  root = makeRepo({}),
  extra: Partial<AdapterContext> = {},
): Plan {
  writeFiles(root, files);
  const all = listRepoFiles(root);
  const layers = discoverLayers(all);
  const { contents, diagnostics } = loadLayers(root, all, layers);
  expect(diagnostics.filter((d) => d.level === "error")).toEqual([]);
  return adapter.plan({
    root,
    contents,
    approvals: approvalItems(contents, adapter.id),
    scopes: layers,
    ...extra,
  });
}

export function writeFiles(root: string, files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}
