import { posix } from "node:path";
import type { Diagnostic, Skill } from "../types.js";
import { error, isRecord, nameProblem } from "./common.js";
import { splitFrontmatter } from "./frontmatter.js";

/** Parses `<dir>/SKILL.md` of the Agent Skills format. */
export function parseSkill(
  layer: string,
  dir: string,
  text: string,
): { skill?: Skill; diagnostics: Diagnostic[] } {
  const file = `${dir}/SKILL.md`;
  const dirName = posix.basename(dir);
  const problem = nameProblem("skill", dirName);
  if (problem) return { diagnostics: [error(file, problem)] };

  let data: unknown;
  try {
    data = splitFrontmatter(text).data;
  } catch (e) {
    return { diagnostics: [error(file, `Invalid frontmatter: ${(e as Error).message}`)] };
  }
  if (!isRecord(data)) return { diagnostics: [error(file, "Frontmatter must be a mapping")] };
  if (typeof data.name !== "string") {
    return { diagnostics: [error(file, "Frontmatter needs a name")] };
  }
  if (data.name !== dirName) {
    return {
      diagnostics: [error(file, `Skill name "${data.name}" must match its directory "${dirName}"`)],
    };
  }
  if (typeof data.description !== "string" || data.description.trim() === "") {
    return { diagnostics: [error(file, "Frontmatter needs a description")] };
  }
  return { skill: { layer, name: data.name, dir, description: data.description }, diagnostics: [] };
}
