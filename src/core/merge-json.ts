import { lstatSync, readFileSync, type Stats } from "node:fs";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { isRecord } from "./formats/common.js";
import type { Operation } from "./plan.js";
import { sha256, stableStringify } from "./stable.js";
import type { MergedFile } from "./state.js";

export type KeyOp = Extract<Operation, { kind: "merge-json" }>;
export type ItemOp = Extract<Operation, { kind: "merge-json-item" }>;
export type MergeOp = KeyOp | ItemOp;

export interface MergeContext {
  force: boolean;
  write(abs: string, content: string): void;
  remove(abs: string): void;
  backup(path: string, abs: string): void;
  skip(path: string, reason: string): void;
  error(message: string): void;
  written(path: string): void;
  removed(path: string): void;
}

const NOT_OURS = "exists and was not created by agents-setup";

const hashValue = (value: unknown) => sha256(stableStringify(value));

/** The object holding `key`'s last segment; undefined if a segment is not an object. */
function parentOf(
  doc: Record<string, unknown>,
  key: string[],
  create: boolean,
): Record<string, unknown> | undefined {
  let node: Record<string, unknown> = doc;
  for (const segment of key.slice(0, -1)) {
    const next = node[segment];
    if (next === undefined && create) {
      node[segment] = {};
      node = node[segment] as Record<string, unknown>;
    } else if (isRecord(next)) {
      node = next;
    } else {
      return undefined;
    }
  }
  return node;
}

/** Deletes `key` and then every parent object it leaves empty. */
function deleteAndPrune(doc: Record<string, unknown>, key: string[]): void {
  for (let depth = key.length; depth > 0; depth--) {
    const parent = parentOf(doc, key.slice(0, depth), false);
    const leaf = key[depth - 1] as string;
    if (!parent) return;
    const value = parent[leaf];
    if (depth === key.length || (isRecord(value) && Object.keys(value).length === 0)) {
      delete parent[leaf];
    } else {
      return;
    }
  }
}

function label(path: string, key: string[]): string {
  return `${path} ${key.join(".")}`;
}

function lstatOrUndefined(abs: string): Stats | undefined {
  try {
    return lstatSync(abs);
  } catch {
    return undefined;
  }
}

/**
 * Applies one JSON or TOML file's owned keys and array items. `approved` are applied, `pending` keep
 * whatever an earlier approval installed. Returns the new ownership record, if any is left.
 */
export function applyMergedFile(
  path: string,
  abs: string,
  approved: MergeOp[],
  pending: MergeOp[],
  prev: MergedFile | undefined,
  ctx: MergeContext,
): MergedFile | undefined {
  const stat = lstatOrUndefined(abs);
  const toml = path.endsWith(".toml");
  let doc: Record<string, unknown> = {};
  // Keep the user's formatting choices so a merge does not reformat their file.
  let indent: string | number = 2;
  let finalNewline = true;
  if (stat) {
    if (!stat.isFile()) {
      ctx.error(`${path}: not a regular file; left untouched`);
      return prev;
    }
    // Rewriting TOML drops comments and layout, so only files agents-setup created are edited.
    if (toml && !prev?.created) {
      ctx.skip(path, `${NOT_OURS}; agents-setup only edits TOML files it created`);
      return prev;
    }
    let parsed: unknown;
    try {
      const text = readFileSync(abs, "utf8");
      parsed = toml ? parseToml(text) : JSON.parse(text);
      indent = /^([ \t]+)\S/m.exec(text)?.[1] ?? 2;
      finalNewline = text.endsWith("\n");
    } catch {
      ctx.error(`${path}: invalid ${toml ? "TOML" : "JSON"}; left untouched`);
      return prev;
    }
    if (!isRecord(parsed)) {
      ctx.error(`${path}: not a JSON object; left untouched`);
      return prev;
    }
    doc = parsed;
  }

  const record: MergedFile = {
    created: stat ? (prev?.created ?? false) : true,
    keys: {},
    items: {},
  };
  let changed = false;
  let backedUp = false;
  const backupOnce = () => {
    if (stat && !backedUp) ctx.backup(path, abs);
    backedUp = true;
  };

  // Owned keys.
  const plannedKeys = new Set<string>();
  for (const op of pending) {
    if (op.kind !== "merge-json") continue;
    const kj = JSON.stringify(op.key);
    plannedKeys.add(kj);
    const kept = prev?.keys[kj];
    if (kept) record.keys[kj] = kept;
  }
  for (const op of approved) {
    if (op.kind !== "merge-json") continue;
    const kj = JSON.stringify(op.key);
    plannedKeys.add(kj);
    const prevHash = prev?.keys[kj];
    const next = hashValue(op.value);
    const leaf = op.key.at(-1) as string;
    const parent = parentOf(doc, op.key, false);
    if (parent && Object.hasOwn(parent, leaf)) {
      const current = hashValue(parent[leaf]);
      if (prevHash === undefined) {
        ctx.skip(label(path, op.key), NOT_OURS);
        continue;
      }
      if (current !== prevHash) {
        if (!ctx.force) {
          ctx.skip(label(path, op.key), "modified since last sync");
          record.keys[kj] = prevHash;
          continue;
        }
        backupOnce();
      }
      if (current === next) {
        record.keys[kj] = next;
        continue;
      }
    }
    const target = parentOf(doc, op.key, true);
    if (!target) {
      ctx.error(`${path}: ${op.key.join(".")} conflicts with an existing value; left untouched`);
      continue;
    }
    target[leaf] = op.value;
    record.keys[kj] = next;
    changed = true;
  }
  for (const [kj, hash] of Object.entries(prev?.keys ?? {})) {
    if (plannedKeys.has(kj)) continue;
    const key = JSON.parse(kj) as string[];
    const parent = parentOf(doc, key, false);
    const leaf = key.at(-1) as string;
    if (!parent || !Object.hasOwn(parent, leaf)) continue;
    if (hashValue(parent[leaf]) === hash) {
      deleteAndPrune(doc, key);
      changed = true;
    } else {
      ctx.skip(label(path, key), "modified since last sync; kept");
    }
  }

  // Owned array items, matched to earlier ones by id.
  const itemKeys = new Set<string>(Object.keys(prev?.items ?? {}));
  for (const op of [...approved, ...pending]) {
    if (op.kind === "merge-json-item") itemKeys.add(JSON.stringify(op.key));
  }
  for (const kj of itemKeys) {
    const key = JSON.parse(kj) as string[];
    const leaf = key.at(-1) as string;
    const desired = new Map<string, ItemOp>();
    for (const op of approved) {
      if (op.kind === "merge-json-item" && JSON.stringify(op.key) === kj) desired.set(op.id, op);
    }
    const pendingIds = new Set(
      pending
        .filter((op) => op.kind === "merge-json-item" && JSON.stringify(op.key) === kj)
        .map((op) => (op as ItemOp).id),
    );
    const prevOwned = prev?.items[kj] ?? {};
    const parent = parentOf(doc, key, false);
    const existing = parent?.[leaf];
    if (existing !== undefined && !Array.isArray(existing)) {
      ctx.error(`${path}: ${key.join(".")} is not a list; left untouched`);
      if (prev?.items[kj]) record.items[kj] = prev.items[kj];
      continue;
    }

    const working: unknown[] = existing ? [...existing] : [];
    const used = new Set<number>();
    const removeAt = new Set<number>();
    const owned: Record<string, string> = {};
    const find = (hash: string) =>
      working.findIndex((value, i) => !used.has(i) && hashValue(value) === hash);

    for (const [id, hash] of Object.entries(prevOwned)) {
      const index = find(hash);
      if (index !== -1) used.add(index);
      const op = desired.get(id);
      if (op) {
        const next = hashValue(op.value);
        if (index === -1) {
          working.push(op.value);
          used.add(working.length - 1);
          changed = true;
        } else if (next !== hash) {
          working[index] = op.value;
          changed = true;
        }
        owned[id] = next;
        desired.delete(id);
      } else if (pendingIds.has(id)) {
        owned[id] = hash;
      } else if (index !== -1) {
        removeAt.add(index);
        changed = true;
      }
    }
    for (const [id, op] of desired) {
      working.push(op.value);
      owned[id] = hashValue(op.value);
      changed = true;
    }

    const final = working.filter((_, i) => !removeAt.has(i));
    const onlyOursRemoved = final.length === 0 && (existing?.length ?? 0) === removeAt.size;
    if (final.length === 0 && (existing === undefined || onlyOursRemoved)) {
      if (existing !== undefined) deleteAndPrune(doc, key);
    } else {
      const target = parentOf(doc, key, true);
      if (!target) {
        ctx.error(`${path}: ${key.join(".")} conflicts with an existing value; left untouched`);
        continue;
      }
      target[leaf] = final;
    }
    if (Object.keys(owned).length > 0) record.items[kj] = owned;
  }

  if (changed) {
    if (record.created && Object.keys(doc).length === 0) {
      if (stat) {
        ctx.remove(abs);
        ctx.removed(path);
      }
    } else {
      const text = toml ? stringifyToml(doc).trimEnd() : JSON.stringify(doc, null, indent);
      ctx.write(abs, `${text}${finalNewline ? "\n" : ""}`);
      ctx.written(path);
    }
  }
  const owns = Object.keys(record.keys).length > 0 || Object.keys(record.items).length > 0;
  return owns ? record : undefined;
}
