import { parse } from "yaml";

/** Splits a leading `---` YAML block from Markdown. Throws on invalid YAML. */
export function splitFrontmatter(text: string): { data: unknown; body: string } {
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return { data: {}, body: text };
  const end = normalized.indexOf("\n---", 3);
  const lineEnd = end === -1 ? -1 : normalized.indexOf("\n", end + 1);
  const closing = end === -1 ? "" : normalized.slice(end + 1, lineEnd === -1 ? undefined : lineEnd);
  if (end === -1 || closing !== "---") return { data: {}, body: text };
  const data = parse(normalized.slice(4, end + 1)) ?? {};
  const body = lineEnd === -1 ? "" : normalized.slice(lineEnd + 1);
  return { data, body };
}
