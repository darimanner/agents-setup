import type { Diagnostic, LayerMeta } from "../types.js";
import { error, isRecord, parseYamlFile } from "./common.js";

export const FORMAT_VERSION = 1;

export function parseManifest(file: string, text: string): Diagnostic[] {
  const { data, diagnostic } = parseYamlFile(file, text);
  if (diagnostic) return [diagnostic];
  if (!isRecord(data)) return [error(file, "manifest.yaml must be a mapping")];
  if (data.version !== FORMAT_VERSION) {
    return [error(file, `Unsupported format version ${String(data.version)}`)];
  }
  if (data.templates !== undefined && !Array.isArray(data.templates)) {
    return [error(file, "templates must be a list")];
  }
  return [];
}

export function parseLayerYaml(
  layer: string,
  file: string,
  text: string,
): { meta: LayerMeta; diagnostics: Diagnostic[] } {
  const meta: LayerMeta = { path: layer };
  const { data, diagnostic } = parseYamlFile(file, text);
  if (diagnostic) return { meta, diagnostics: [diagnostic] };
  if (!isRecord(data)) return { meta, diagnostics: [error(file, "layer.yaml must be a mapping")] };
  if (data.description === undefined) return { meta, diagnostics: [] };
  if (typeof data.description !== "string") {
    return { meta, diagnostics: [error(file, "description must be a string")] };
  }
  return { meta: { ...meta, description: data.description }, diagnostics: [] };
}
