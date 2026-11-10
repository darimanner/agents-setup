import { AGENT_IDS, type AgentId, type Diagnostic, type PluginRef } from "../types.js";
import { error, isRecord, parseYamlFile, warning } from "./common.js";

const OPTIONAL_FIELDS = ["marketplace", "source", "version"] as const;

export function parsePlugins(
  layer: string,
  file: string,
  text: string,
): { plugins: PluginRef[]; diagnostics: Diagnostic[] } {
  const { data, diagnostic } = parseYamlFile(file, text);
  if (diagnostic) return { plugins: [], diagnostics: [diagnostic] };
  if (!isRecord(data)) return { plugins: [], diagnostics: [error(file, "Must be a mapping")] };
  if (data.plugins === undefined || data.plugins === null) return { plugins: [], diagnostics: [] };
  if (!isRecord(data.plugins)) {
    return { plugins: [], diagnostics: [error(file, "plugins must map agent ids to lists")] };
  }

  const plugins: PluginRef[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const [agent, list] of Object.entries(data.plugins)) {
    if (!AGENT_IDS.includes(agent as AgentId)) {
      diagnostics.push(
        warning(file, `No adapter for agent "${agent}" yet; its plugins are kept for agent mode`),
      );
    }
    if (!Array.isArray(list)) {
      diagnostics.push(error(file, `plugins.${agent} must be a list`));
      continue;
    }
    list.forEach((raw: unknown, index) => {
      const where = `plugins.${agent}[${index}]`;
      if (!isRecord(raw) || typeof raw.name !== "string" || raw.name === "") {
        diagnostics.push(error(file, `${where} needs a name`));
        return;
      }
      const plugin: PluginRef = { layer, agent, name: raw.name };
      for (const field of OPTIONAL_FIELDS) {
        const value = raw[field];
        if (value === undefined) continue;
        if (typeof value !== "string") {
          diagnostics.push(error(file, `${where}.${field} must be a string`));
          return;
        }
        plugin[field] = value;
      }
      plugins.push(plugin);
    });
  }
  return { plugins, diagnostics };
}
