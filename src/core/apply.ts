import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmdirSync,
  rmSync,
  type Stats,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, posix, resolve, sep } from "node:path";
import { applyMergedFile, type MergeContext, type MergeOp } from "./merge-json.js";
import type { ApprovalItem, Operation, Plan } from "./plan.js";
import { sha256 } from "./stable.js";
import type { AgentState } from "./state.js";

export interface ApplyOptions {
  /** Approval item id -> fingerprint the user approved. */
  approved: Record<string, string>;
  force: boolean;
  dryRun: boolean;
  /** Paths tracked by git; never written. */
  tracked: Set<string>;
  /** Content hash of the selected layers, recorded for staleness checks. */
  contentHash: string;
  /** Absolute files outside the repo the adapter may merge into (Hermes' global config). */
  external?: string[];
}

export interface ApplyReport {
  written: string[];
  removed: string[];
  skipped: { path: string; reason: string }[];
  pending: ApprovalItem[];
  errors: string[];
}

export class UnsafePathError extends Error {
  constructor(
    readonly path: string,
    reason: string,
  ) {
    super(`Refusing to write ${path}: ${reason}`);
    this.name = "UnsafePathError";
  }
}

// Each would hide the committed AGENTS.md from an agent.
const SHADOWING = new Set(["CLAUDE.md", "CLAUDE.local.md", ".hermes.md", "AGENTS.override.md"]);

const NOT_OURS = "exists and was not created by agents-setup";

function within(root: string, abs: string): boolean {
  return abs === root || abs.startsWith(root + sep);
}

function lstatOrUndefined(abs: string): Stats | undefined {
  try {
    return lstatSync(abs);
  } catch {
    return undefined;
  }
}

/**
 * Lexical checks plus the real location of the nearest existing ancestor. An absolute path is
 * allowed only when it is one of the adapter's `external` files.
 */
function checkPath(root: string, path: string, external: string[]): string {
  if (isAbsolute(path) && external.includes(path)) return path;
  if (isAbsolute(path) || path.split("/").includes("..")) {
    throw new UnsafePathError(path, "paths must be relative and stay inside the repo");
  }
  const abs = resolve(root, path);
  if (!within(root, abs) || abs === root) {
    throw new UnsafePathError(path, "outside the repo");
  }
  let ancestor = dirname(abs);
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  if (!within(root, realpathSync(ancestor))) {
    throw new UnsafePathError(path, "a parent folder links outside the repo");
  }
  return abs;
}

function checkOperation(root: string, op: Operation, external: string[]): string {
  const abs = checkPath(root, op.path, op.kind.startsWith("merge-json") ? external : []);
  if (SHADOWING.has(posix.basename(op.path))) {
    throw new UnsafePathError(op.path, "it would hide the committed AGENTS.md");
  }
  if (op.kind === "symlink" && !within(root, resolve(dirname(abs), op.target))) {
    throw new UnsafePathError(op.path, `link target ${op.target} is outside the repo`);
  }
  return abs;
}

function hashFile(abs: string): string {
  return sha256(readFileSync(abs));
}

/** Filesystem writes, all skipped in a dry run. */
class Writer {
  constructor(
    private readonly root: string,
    private readonly dryRun: boolean,
    private readonly backupDir: string,
  ) {}

  write(abs: string, content: string, readonly: boolean): void {
    if (this.dryRun) return;
    mkdirSync(dirname(abs), { recursive: true });
    rmSync(abs, { force: true });
    writeFileSync(abs, content, readonly ? { mode: 0o444 } : {});
  }

  /** Rewrites a shared config file in place, following a link and keeping its mode. */
  update(abs: string, content: string): void {
    if (this.dryRun) return;
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }

  link(abs: string, target: string): void {
    if (this.dryRun) return;
    mkdirSync(dirname(abs), { recursive: true });
    rmSync(abs, { force: true });
    symlinkSync(target, abs);
  }

  remove(abs: string): void {
    if (this.dryRun) return;
    rmSync(abs, { force: true });
    let dir = dirname(abs);
    while (dir !== this.root && within(this.root, dir) && readdirSync(dir).length === 0) {
      rmdirSync(dir);
      dir = dirname(dir);
    }
  }

  backup(path: string, abs: string): void {
    if (this.dryRun) return;
    const target = join(this.backupDir, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(abs, target);
  }
}

export function applyPlan(
  root: string,
  plan: Plan,
  previous: AgentState | undefined,
  options: ApplyOptions,
): { state: AgentState; report: ApplyReport } {
  const external = options.external ?? [];
  const absPaths = plan.operations.map((op) => checkOperation(root, op, external));

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const writer = new Writer(root, options.dryRun, join(root, ".agents", ".state", "backup", stamp));
  const report: ApplyReport = { written: [], removed: [], skipped: [], pending: [], errors: [] };
  const skip = (path: string, reason: string) => report.skipped.push({ path, reason });

  const items = new Map(plan.approvals.map((a) => [a.id, a]));
  const pending = new Map<string, ApprovalItem>();
  const isApproved = (op: Operation): boolean => {
    if (op.approval === undefined) return true;
    const item = items.get(op.approval);
    if (!item) throw new Error(`Operation for ${op.path} names unknown approval ${op.approval}`);
    if (options.approved[item.id] === item.fingerprint) return true;
    pending.set(item.id, item);
    return false;
  };

  const state: AgentState = {
    version: 1,
    agent: plan.agent,
    scopes: plan.scopes,
    contentHash: options.contentHash,
    files: {},
    symlinks: {},
    merged: {},
    approved: Object.fromEntries(
      plan.approvals
        .filter((a) => options.approved[a.id] === a.fingerprint)
        .map((a) => [a.id, a.fingerprint]),
    ),
  };

  const merges = new Map<string, { abs: string; approved: MergeOp[]; pending: MergeOp[] }>();
  const mergeGroup = (path: string, abs: string) => {
    let group = merges.get(path);
    if (!group) {
      group = { abs, approved: [], pending: [] };
      merges.set(path, group);
    }
    return group;
  };

  plan.operations.forEach((op, index) => {
    const abs = absPaths[index] as string;
    const { path } = op;
    const isMerge = op.kind === "merge-json" || op.kind === "merge-json-item";
    if (options.tracked.has(path)) {
      skip(path, "tracked by git");
      return;
    }
    if (!isApproved(op)) {
      // Keep what an earlier approval installed until the new version is approved.
      if (isMerge) {
        mergeGroup(path, abs).pending.push(op);
        return;
      }
      const kept = previous?.files[path];
      if (kept) state.files[path] = kept;
      const keptLink = previous?.symlinks[path];
      if (keptLink !== undefined) state.symlinks[path] = keptLink;
      return;
    }
    if (op.kind === "write") applyWrite(op, abs);
    else if (op.kind === "symlink") applySymlink(op, abs);
    else mergeGroup(path, abs).approved.push(op);
  });

  function applyWrite(op: Extract<Operation, { kind: "write" }>, abs: string): void {
    const { path } = op;
    const prev = previous?.files[path]?.hash;
    const next = sha256(op.content);
    const stat = lstatOrUndefined(abs);
    if (stat && !stat.isFile()) {
      skip(path, NOT_OURS);
      return;
    }
    if (stat) {
      if (prev === undefined) {
        skip(path, NOT_OURS);
        return;
      }
      const current = hashFile(abs);
      if (current !== prev) {
        if (!options.force) {
          skip(path, "modified since last sync");
          state.files[path] = { hash: prev };
          return;
        }
        writer.backup(path, abs);
      }
      if (current === next) {
        state.files[path] = { hash: next };
        return;
      }
    }
    writer.write(abs, op.content, op.readonly === true);
    report.written.push(path);
    state.files[path] = { hash: next };
  }

  function applySymlink(op: Extract<Operation, { kind: "symlink" }>, abs: string): void {
    const { path, target } = op;
    const prev = previous?.symlinks[path];
    const stat = lstatOrUndefined(abs);
    if (stat) {
      const current = stat.isSymbolicLink() ? readlinkSync(abs) : undefined;
      if (current === undefined || prev === undefined || current !== prev) {
        skip(path, NOT_OURS);
        return;
      }
      if (current === target) {
        state.symlinks[path] = target;
        return;
      }
    }
    writer.link(abs, target);
    report.written.push(path);
    state.symlinks[path] = target;
  }

  // State comes from disk; a tampered or committed state file must not reach outside the repo.
  const safe = (path: string, allowed: string[] = []): string | undefined => {
    try {
      return checkPath(root, path, allowed);
    } catch (error) {
      report.errors.push(`State lists an unsafe path, ignored: ${(error as Error).message}`);
      return undefined;
    }
  };

  const mergeContext: MergeContext = {
    force: options.force,
    write: (abs, content) => writer.update(abs, content),
    remove: (abs) => writer.remove(abs),
    backup: (path, abs) => writer.backup(path, abs),
    skip,
    error: (message) => report.errors.push(message),
    written: (path) => report.written.push(path),
    removed: (path) => report.removed.push(path),
    marker: `managed by agents-setup for ${root}`,
  };
  for (const path of Object.keys(previous?.merged ?? {})) {
    if (merges.has(path) || options.tracked.has(path)) continue;
    const abs = safe(path, external);
    if (abs) mergeGroup(path, abs);
  }
  for (const [path, group] of merges) {
    const record = applyMergedFile(
      path,
      group.abs,
      group.approved,
      group.pending,
      previous?.merged[path],
      mergeContext,
    );
    if (record) state.merged[path] = record;
  }

  const planned = new Set(plan.operations.map((op) => op.path));
  for (const [path, { hash }] of Object.entries(previous?.files ?? {})) {
    if (planned.has(path)) continue;
    const abs = safe(path);
    if (!abs) continue;
    const stat = lstatOrUndefined(abs);
    if (!stat) continue;
    if (stat.isFile() && hashFile(abs) === hash) {
      writer.remove(abs);
      report.removed.push(path);
    } else {
      skip(path, "modified since last sync; kept");
    }
  }
  for (const [path, target] of Object.entries(previous?.symlinks ?? {})) {
    if (planned.has(path)) continue;
    const abs = safe(path);
    if (!abs) continue;
    const stat = lstatOrUndefined(abs);
    if (!stat) continue;
    if (stat.isSymbolicLink() && readlinkSync(abs) === target) {
      writer.remove(abs);
      report.removed.push(path);
    } else {
      skip(path, "changed since last sync; kept");
    }
  }

  report.pending = [...pending.values()];
  return { state, report };
}
