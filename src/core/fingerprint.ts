import type { ApprovalItem } from "./plan.js";
import { sha256, stableStringify } from "./stable.js";
import type { AgentId, LayerContent, McpServer } from "./types.js";

function item(
  kind: ApprovalItem["kind"],
  layer: string,
  name: string,
  definition: unknown,
): ApprovalItem {
  return {
    id: `${kind}:${layer}:${name}`,
    kind,
    layer,
    name,
    definition,
    fingerprint: sha256(stableStringify(definition)),
  };
}

// Env and header values are per-developer `${VAR}` references, so only their names count.
function serverDefinition(server: McpServer): unknown {
  return server.transport === "http"
    ? {
        transport: "http",
        url: server.url,
        headers: Object.keys(server.headers ?? {}).sort(),
      }
    : {
        transport: "stdio",
        command: server.command,
        args: server.args ?? [],
        env: Object.keys(server.env ?? {}).sort(),
      };
}

/** Everything in the layers that can run code or receive tokens, for one agent. */
export function approvalItems(contents: LayerContent[], agent: AgentId): ApprovalItem[] {
  const items: ApprovalItem[] = [];
  for (const content of contents) {
    for (const server of content.mcp) {
      items.push(item("mcp", server.layer, server.name, serverDefinition(server)));
    }
    for (const hook of content.hooks) {
      items.push(
        item("hook", hook.layer, hook.name, {
          event: hook.event,
          match: hook.match,
          command: hook.command,
        }),
      );
    }
    for (const plugin of content.plugins) {
      if (plugin.agent !== agent) continue;
      items.push(
        item("plugin", plugin.layer, plugin.name, {
          agent: plugin.agent,
          name: plugin.name,
          marketplace: plugin.marketplace,
          source: plugin.source,
          version: plugin.version,
        }),
      );
    }
  }
  return items;
}
