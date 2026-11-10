import { posix } from "node:path";
import type { Diagnostic, Rule } from "../types.js";
import { error, isRecord, isStringList, nameProblem } from "./common.js";
import { splitFrontmatter } from "./frontmatter.js";

export function parseRule(
  layer: string,
  file: string,
  text: string,
): { rule?: Rule; diagnostics: Diagnostic[] } {
  const name = posix.basename(file, ".md");
  const problem = nameProblem("rule", name);
  if (problem) return { diagnostics: [error(file, problem)] };

  let parsed: { data: unknown; body: string };
  try {
    parsed = splitFrontmatter(text);
  } catch (e) {
    return { diagnostics: [error(file, `Invalid frontmatter: ${(e as Error).message}`)] };
  }
  const { data, body } = parsed;
  if (!isRecord(data)) return { diagnostics: [error(file, "Frontmatter must be a mapping")] };

  const rule: Rule = { layer, name, file, body };
  if (data.description !== undefined) {
    if (typeof data.description !== "string") {
      return { diagnostics: [error(file, "description must be a string")] };
    }
    rule.description = data.description;
  }
  if (data.paths !== undefined) {
    if (!isStringList(data.paths)) {
      return { diagnostics: [error(file, "paths must be a list of glob strings")] };
    }
    rule.paths = data.paths;
  }
  return { rule, diagnostics: [] };
}
