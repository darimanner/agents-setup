import {
  type Document,
  isMap,
  isScalar,
  isSeq,
  type Node,
  type Pair,
  parseDocument,
  stringify,
  type YAMLMap,
} from "yaml";

/**
 * Edits to a YAML file, applied to its text so that everything else stays byte for byte:
 * a re-serialized document would re-indent comments and respace a user's whole config.
 */
export type YamlEdit =
  | { kind: "set"; key: string[]; value: unknown }
  | { kind: "delete"; key: string[] }
  /** Items of the list at `key`, by their index in the current text; `final` is the result. */
  | {
      kind: "items";
      key: string[];
      remove: number[];
      replace: [number, unknown][];
      append: unknown[];
      final: unknown[];
    };

/** A layout this module does not edit in place, such as flow style (`{a: 1}`). */
class Unsupported extends Error {}

const lineStart = (text: string, pos: number) => text.lastIndexOf("\n", pos - 1) + 1;
const lineEnd = (text: string, pos: number) => {
  const i = text.indexOf("\n", pos);
  return i === -1 ? text.length : i + 1;
};
const nest = (path: string[], value: unknown) =>
  path.reduceRight<unknown>((acc, key) => ({ [key]: acc }), value);

function block(value: unknown, indent: number): string {
  const pad = " ".repeat(indent);
  const lines = stringify(value, { lineWidth: 0 }).trimEnd().split("\n");
  return `${lines.map((line) => pad + line).join("\n")}\n`;
}

function parse(text: string): Document {
  const doc = parseDocument(text);
  if (doc.errors.length > 0) throw new Unsupported();
  return doc;
}

const findPair = (map: YAMLMap, key: string) =>
  map.items.find((p) => isScalar(p.key) && String(p.key.value) === key) as
    | Pair<Node, Node | null>
    | undefined;

const isEmpty = (node: Node | null) =>
  node == null ||
  (isScalar(node) && node.value == null) ||
  (isMap(node) && node.items.length === 0);

function rootMap(doc: Document): YAMLMap | undefined {
  if (doc.contents == null) return undefined;
  if (!isMap(doc.contents) || doc.contents.flow) throw new Unsupported();
  return doc.contents;
}

function findPairAt(doc: Document, key: string[]): Pair<Node, Node | null> | undefined {
  let map = rootMap(doc);
  for (const [i, segment] of key.entries()) {
    const pair = map && findPair(map, segment);
    if (!pair || i === key.length - 1) return pair;
    if (!isMap(pair.value)) return undefined;
    map = pair.value;
  }
  return undefined;
}

class Editor {
  constructor(
    private text: string,
    private readonly marker: string,
  ) {}

  result(): string {
    return this.text;
  }

  private markerLine(indent: number): string {
    return `${" ".repeat(indent)}# ${this.marker}\n`;
  }

  /** From the line before `pos` when it is our marker, to the end of `end`'s line. */
  private span(pos: number, end: number): [number, number, number] {
    let start = lineStart(this.text, pos);
    const indent = pos - start;
    const before = start > 0 ? lineStart(this.text, start - 1) : start;
    if (this.text.slice(before, start).trim() === `# ${this.marker}`) start = before;
    return [start, lineEnd(this.text, end - 1), indent];
  }

  private pairSpan(pair: Pair<Node, Node | null>): [number, number, number] {
    const keyRange = pair.key.range as [number, number, number];
    return this.span(keyRange[0], pair.value?.range?.[1] ?? keyRange[1]);
  }

  private splice(start: number, end: number, insert: string): void {
    let head = this.text.slice(0, start);
    if (insert && head && !head.endsWith("\n")) head += "\n";
    this.text = head + insert + this.text.slice(end);
  }

  set(key: string[], value: unknown): void {
    const root = rootMap(parse(this.text));
    let map = root;
    for (let i = 0; i < key.length; i++) {
      const pair = map && findPair(map, key[i] as string);
      const rest = nest(key.slice(i), value);
      if (!map || !pair) {
        this.insert(map === root ? undefined : map, rest);
        return;
      }
      // Replace the leaf, or an empty parent such as `hooks:` or `mcp_servers: {}`, whole.
      if (i === key.length - 1 || isEmpty(pair.value)) {
        const [start, end, indent] = this.pairSpan(pair);
        this.splice(start, end, this.markerLine(indent) + block(rest, indent));
        return;
      }
      if (!isMap(pair.value) || pair.value.flow) throw new Unsupported();
      map = pair.value;
    }
  }

  /** Adds `value` (one key) at the end of a nested `map`, or of the file for the top level. */
  private insert(map: YAMLMap | undefined, value: unknown): void {
    if (!map) {
      this.splice(this.text.length, this.text.length, this.markerLine(0) + block(value, 0));
      return;
    }
    const first = map.items[0]?.key as Node | undefined;
    const range = map.range;
    if (!first?.range || !range) throw new Unsupported();
    const indent = first.range[0] - lineStart(this.text, first.range[0]);
    const pos = lineEnd(this.text, range[1] - 1);
    this.splice(pos, pos, this.markerLine(indent) + block(value, indent));
  }

  delete(key: string[]): void {
    const pair = findPairAt(parse(this.text), key);
    if (!pair) return;
    const [start, end] = this.pairSpan(pair);
    this.splice(start, end, "");
    // Prune parents the deletion left empty, as the JSON merge does.
    for (let depth = key.length - 1; depth > 0; depth--) {
      const parent = findPairAt(parse(this.text), key.slice(0, depth));
      if (!parent || !isEmpty(parent.value)) break;
      const [s, e] = this.pairSpan(parent);
      this.splice(s, e, "");
    }
  }

  items(edit: Extract<YamlEdit, { kind: "items" }>): void {
    let list = parse(this.text).getIn(edit.key, true);
    if (!isSeq(list) || list.flow) throw new Unsupported();
    const changes = new Map<number, { value: unknown } | undefined>();
    for (const index of edit.remove) changes.set(index, undefined);
    for (const [index, value] of edit.replace) changes.set(index, { value });
    // From the end, so earlier offsets stay valid.
    for (const index of [...changes.keys()].sort((a, b) => b - a)) {
      const item = list.items[index] as Node | undefined;
      if (!item?.range) throw new Unsupported();
      const dash = this.text.lastIndexOf("-", item.range[0] - 1);
      const [start, end, indent] = this.span(dash, item.range[1]);
      const change = changes.get(index);
      this.splice(
        start,
        end,
        change ? this.markerLine(indent) + block([change.value], indent) : "",
      );
    }
    if (edit.append.length === 0) return;
    list = parse(this.text).getIn(edit.key, true);
    const first = isSeq(list) ? (list.items[0] as Node | undefined) : undefined;
    const last = isSeq(list) ? (list.items.at(-1) as Node | undefined) : undefined;
    if (!first?.range || !last?.range) {
      this.set(edit.key, edit.final);
      return;
    }
    const dash = this.text.lastIndexOf("-", first.range[0] - 1);
    const indent = dash - lineStart(this.text, dash);
    const pos = lineEnd(this.text, last.range[1] - 1);
    const added = edit.append.map((value) => this.markerLine(indent) + block([value], indent));
    this.splice(pos, pos, added.join(""));
  }
}

/**
 * Applies `edits` to `text`, marking each entry it writes with a `# <marker>` comment.
 * Returns undefined when the file uses a layout this cannot edit in place.
 */
export function editYaml(text: string, edits: YamlEdit[], marker: string): string | undefined {
  const editor = new Editor(text, marker);
  try {
    for (const edit of edits) {
      if (edit.kind === "set") editor.set(edit.key, edit.value);
      else if (edit.kind === "delete") editor.delete(edit.key);
      else editor.items(edit);
    }
  } catch (error) {
    if (error instanceof Unsupported) return undefined;
    throw error;
  }
  return editor.result();
}
