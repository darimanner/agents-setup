import { lstatSync, readFileSync, type Stats, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { parseDocument } from "yaml";
import { isRecord } from "./formats/common.js";
import type { Operation } from "./plan.js";
import { sha256, stableStringify } from "./stable.js";
import type { MergedFile } from "./state.js";
import { editYaml, type YamlEdit } from "./yaml-edit.js";

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
  /** Comment that marks owned YAML entries, so a user can tell where they came from. */
  marker?: string;
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

function statOrUndefined(abs: string): Stats | undefined {
  try {
    return statSync(abs);
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
  // A file outside the repo is the user's own config, which may be a link into their dotfiles.
  const external = isAbsolute(path);
  const stat = external ? statOrUndefined(abs) : lstatOrUndefined(abs);
  const format = path.endsWith(".toml") ? "TOML" : /\.ya?ml$/.test(path) ? "YAML" : "JSON";
  let doc: Record<string, unknown> = {};
  // YAML is edited as text, so the original stays as it was outside the owned entries.
  let source = "";
  // Keep the user's formatting choices so a merge does not reformat their file.
  let indent: string | number = 2;
  let finalNewline = true;
  if (stat) {
    if (!stat.isFile()) {
      ctx.error(`${path}: not a regular file; left untouched`);
      return prev;
    }
    // Rewriting TOML drops comments and layout, so only files agents-setup created are edited.
    if (format === "TOML" && !prev?.created) {
      ctx.skip(path, `${NOT_OURS}; agents-setup only edits TOML files it created`);
      return prev;
    }
    let parsed: unknown;
    try {
      const text = readFileSync(abs, "utf8");
      if (format === "YAML") {
        const yaml = parseDocument(text);
        if (yaml.errors.length > 0) throw yaml.errors[0];
        parsed = yaml.toJS() ?? {};
        source = text;
      } else {
        parsed = format === "TOML" ? parseToml(text) : JSON.parse(text);
      }
      indent = /^([ \t]+)\S/m.exec(text)?.[1] ?? 2;
      finalNewline = text.endsWith("\n");
    } catch {
      ctx.error(`${path}: invalid ${format}; left untouched`);
      return prev;
    }
    if (!isRecord(parsed)) {
      ctx.error(`${path}: not a ${format} object; left untouched`);
      return prev;
    }
    doc = parsed;
  }

  const record: MergedFile = {
    created: stat ? (prev?.created ?? false) : true,
    keys: {},
    items: {},
  };
  const edits: YamlEdit[] = [];
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
    edits.push({ kind: "set", key: op.key, value: op.value });
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
      edits.push({ kind: "delete", key });
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
    const replaced: [number, unknown][] = [];
    const appended: unknown[] = [];
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
          appended.push(op.value);
          used.add(working.length - 1);
          changed = true;
        } else if (next !== hash) {
          working[index] = op.value;
          replaced.push([index, op.value]);
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
      appended.push(op.value);
      owned[id] = hashValue(op.value);
      changed = true;
    }

    const final = working.filter((_, i) => !removeAt.has(i));
    const onlyOursRemoved = final.length === 0 && (existing?.length ?? 0) === removeAt.size;
    if (final.length === 0 && (existing === undefined || onlyOursRemoved)) {
      if (existing !== undefined) {
        deleteAndPrune(doc, key);
        edits.push({ kind: "delete", key });
      }
    } else {
      const target = parentOf(doc, key, true);
      if (!target) {
        ctx.error(`${path}: ${key.join(".")} conflicts with an existing value; left untouched`);
        continue;
      }
      target[leaf] = final;
      if (existing === undefined) edits.push({ kind: "set", key, value: final });
      else if (removeAt.size + replaced.length + appended.length > 0) {
        edits.push({
          kind: "items",
          key,
          remove: [...removeAt],
          replace: replaced,
          append: appended,
          final,
        });
      }
    }
    if (Object.keys(owned).length > 0) record.items[kj] = owned;
  }

  if (changed) {
    if (record.created && Object.keys(doc).length === 0) {
      if (stat) {
        ctx.remove(abs);
        ctx.removed(path);
      }
    } else if (format === "YAML") {
      const text = editYaml(source, edits, ctx.marker ?? "managed by agents-setup");
      if (text === undefined) {
        ctx.error(`${path}: uses a layout agents-setup cannot edit in place; left untouched`);
        return prev;
      }
      // The user's own config outside the repo is copied aside before every change.
      if (external) backupOnce();
      ctx.write(abs, text);
      ctx.written(path);
    } else {
      if (external) backupOnce();
      const text =
        format === "TOML" ? stringifyToml(doc).trimEnd() : JSON.stringify(doc, null, indent);
      ctx.write(abs, `${text}${finalNewline ? "\n" : ""}`);
      ctx.written(path);
    }
  }
  const owns = Object.keys(record.keys).length > 0 || Object.keys(record.items).length > 0;
  return owns ? record : undefined;
}
