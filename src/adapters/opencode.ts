import { approvalId } from "../core/fingerprint.js";
import { type Operation, usedApprovals } from "../core/plan.js";
import type { McpServer, PluginRef } from "../core/types.js";
import type { Adapter, AdapterContext } from "./types.js";

/** Loads after a committed `opencode.json` and overrides it, so that file stays untouched. */
const CONFIG = ".opencode/opencode.jsonc";

/** OpenCode substitutes `{env:VAR}` in its config files; `${VAR}` would stay literal. */
const envRefs = (value: string) => value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, "{env:$1}");

const mapValues = (record: Record<string, string>) =>
  Object.fromEntries(Object.entries(record).map(([k, v]) => [k, envRefs(v)]));

/** Version 1 shapes, which OpenCode 2 also reads. */
function serverConfig(server: McpServer): Record<string, unknown> {
  if (server.transport === "http") {
    return {
      type: "remote",
      url: envRefs(server.url ?? ""),
      ...(server.headers && { headers: mapValues(server.headers) }),
      enabled: true,
    };
  }
  return {
    type: "local",
    command: [server.command ?? "", ...(server.args ?? [])].map(envRefs),
    ...(server.env && { environment: mapValues(server.env) }),
    enabled: true,
  };
}

const pluginSpec = (plugin: PluginRef) =>
  plugin.version ? `${plugin.name}@${plugin.version}` : plugin.name;

function plan(ctx: AdapterContext) {
  const operations: Operation[] = [];
  const warnings: string[] = [];
  const servers = new Set<string>();
  let hooks = 0;

  for (const content of ctx.contents) {
    const layer = content.meta.path;
    // OpenCode looks up relative instructions from the launch folder to the project root.
    for (const rule of content.rules) {
      operations.push({
        kind: "merge-json-item",
        path: CONFIG,
        key: ["instructions"],
        id: rule.file,
        value: rule.file,
      });
    }
    if (layer !== "." && content.skills.length > 0) {
      warnings.push(
        `Skills in ${layer}/.agents/skills load only when OpenCode starts in ${layer} or below`,
      );
    }
    for (const server of content.mcp) {
      // validate allows the same server in two layers only when identical: plan it once.
      if (servers.has(server.name)) continue;
      servers.add(server.name);
      operations.push({
        kind: "merge-json",
        path: CONFIG,
        key: ["mcp", server.name],
        value: serverConfig(server),
        approval: approvalId("mcp", server.layer, server.name),
      });
      if (server.layer !== ".") {
        warnings.push(
          `MCP server "${server.name}" from ${server.layer} is active for the whole project`,
        );
      }
    }
    hooks += content.hooks.length;
    for (const plugin of content.plugins) {
      if (plugin.agent !== "opencode") continue;
      operations.push({
        kind: "merge-json-item",
        path: CONFIG,
        key: ["plugin"],
        id: plugin.name,
        value: pluginSpec(plugin),
        approval: approvalId("plugin", plugin.layer, plugin.name),
      });
    }
  }
  if (hooks > 0) {
    warnings.push(`${hooks} hook(s) skipped: hooks for OpenCode are not supported yet`);
  }

  return {
    agent: "opencode" as const,
    scopes: ctx.scopes,
    operations,
    approvals: usedApprovals(ctx.approvals, operations),
    warnings,
  };
}

export const opencode: Adapter = { id: "opencode", name: "OpenCode", plan };
