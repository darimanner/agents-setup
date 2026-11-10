import { readFileSync } from "node:fs";
import { join } from "node:path";
import { error, warning } from "./formats/common.js";
import { parseHooks } from "./formats/hooks.js";
import { parseLayerYaml, parseManifest } from "./formats/manifest.js";
import { parseMcp } from "./formats/mcp.js";
import { parsePlugins } from "./formats/plugins.js";
import { parseRule } from "./formats/rules.js";
import { parseSkill } from "./formats/skills.js";
import { sha256 } from "./stable.js";
import type { Diagnostic, LayerContent, Rule } from "./types.js";

export function layerPrefix(layer: string): string {
  return layer === "." ? "" : `${layer}/`;
}

/** A rule's `paths` relative to the repo root; a nested layer's rule defaults to its folder. */
export function rootPaths(rule: Rule): string[] | undefined {
  if (rule.layer === ".") return rule.paths;
  if (!rule.paths) return [`${rule.layer}/**`];
  return rule.paths.map((p) => `${rule.layer}/${p.replace(/^\/+/, "")}`);
}

function loadLayer(
  root: string,
  files: string[],
  layer: string,
): { content: LayerContent; diagnostics: Diagnostic[] } {
  const base = `${layerPrefix(layer)}.agents/`;
  const read = (file: string) => readFileSync(join(root, file), "utf8");
  const content: LayerContent = {
    meta: { path: layer },
    rules: [],
    skills: [],
    mcp: [],
    hooks: [],
    plugins: [],
  };
  const diagnostics: Diagnostic[] = [];
  const skillDirs = new Map<string, string[]>();

  const agentsMd = `${layerPrefix(layer)}AGENTS.md`;
  if (files.includes(agentsMd)) content.agentsMd = agentsMd;

  for (const file of files) {
    if (!file.startsWith(base)) continue;
    const rel = file.slice(base.length);
    const parts = rel.split("/");

    if (rel === "manifest.yaml") {
      if (layer === ".") diagnostics.push(...parseManifest(file, read(file)));
      else diagnostics.push(error(file, "manifest.yaml belongs in the root layer only"));
    } else if (rel === "layer.yaml") {
      const result = parseLayerYaml(layer, file, read(file));
      content.meta = result.meta;
      diagnostics.push(...result.diagnostics);
    } else if (rel === "mcp.yaml") {
      const result = parseMcp(layer, file, read(file));
      content.mcp = result.servers;
      diagnostics.push(...result.diagnostics);
    } else if (rel === "hooks.yaml") {
      const result = parseHooks(layer, file, read(file));
      content.hooks = result.hooks;
      diagnostics.push(...result.diagnostics);
    } else if (rel === "plugins.yaml") {
      const result = parsePlugins(layer, file, read(file));
      content.plugins = result.plugins;
      diagnostics.push(...result.diagnostics);
    } else if (parts[0] === "rules" && rel.endsWith(".md")) {
      if (parts.length > 2) {
        diagnostics.push(
          warning(file, "Rules in subfolders are not loaded; move the file to rules/"),
        );
        continue;
      }
      const result = parseRule(layer, file, read(file));
      if (result.rule) content.rules.push(result.rule);
      diagnostics.push(...result.diagnostics);
    } else if (parts[0] === "skills" && parts.length > 2) {
      const dir = `${base}skills/${parts[1]}`;
      skillDirs.set(dir, [...(skillDirs.get(dir) ?? []), file]);
    }
  }

  for (const [dir, dirFiles] of skillDirs) {
    const skillFile = `${dir}/SKILL.md`;
    if (!dirFiles.includes(skillFile)) {
      diagnostics.push(error(skillFile, "Skill folder has no SKILL.md"));
      continue;
    }
    const result = parseSkill(layer, dir, read(skillFile));
    diagnostics.push(...result.diagnostics);
    if (!result.skill) continue;
    const digest = sha256(dirFiles.map((f) => `${f.slice(dir.length)}\0${read(f)}\0`).join(""));
    content.skills.push({ ...result.skill, digest });
  }

  return { content, diagnostics };
}

/** Loads the given layers, in order. Never throws on bad content; problems become diagnostics. */
export function loadLayers(
  root: string,
  files: string[],
  layers: string[],
): { contents: LayerContent[]; diagnostics: Diagnostic[] } {
  const contents: LayerContent[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const layer of layers) {
    const result = loadLayer(root, files, layer);
    contents.push(result.content);
    diagnostics.push(...result.diagnostics);
  }
  return { contents, diagnostics };
}
