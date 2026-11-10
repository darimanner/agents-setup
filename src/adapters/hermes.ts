import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { approvalId } from "../core/fingerprint.js";
import { isRecord } from "../core/formats/common.js";
import { HOOK_RUNNER, hookRunnerPath, shellQuote } from "../core/hook-runner.js";
import { layerPrefix } from "../core/load.js";
import { type Operation, usedApprovals } from "../core/plan.js";
import type { Hook, HookEvent, McpServer } from "../core/types.js";
import type { Adapter, AdapterContext } from "./types.js";

const home = () => process.env.HERMES_HOME ?? join(homedir(), ".hermes");
const configFile = () => join(home(), "config.yaml");

const EVENTS: Record<HookEvent, string> = {
  "session-start": "on_session_start",
  "before-tool": "pre_tool_call",
  "after-edit": "post_tool_call",
  // Hermes ends a "session" after every turn, which is when Claude Code and Codex fire Stop.
  stop: "on_session_end",
};
const EDIT_TOOLS = "write_file|patch";
// Hermes reads one of them instead of the whole AGENTS.md chain.
const SHADOWING = [".hermes.md", "HERMES.md"];

/** Hermes expands `${VAR}` itself, in every string of a server entry. */
function serverConfig(server: McpServer): Record<string, unknown> {
  if (server.transport === "http") {
    return { url: server.url, ...(server.headers && { headers: server.headers }) };
  }
  return {
    command: server.command,
    ...(server.args && { args: server.args }),
    ...(server.env && { env: server.env }),
  };
}

/**
 * Hermes splits a hook command without a shell, and runs global hooks in every project. The
 * runner path is absolute, and the runner exits at once for sessions outside this repo.
 */
function hookEntry(root: string, hook: Hook): Record<string, unknown> {
  const spec = JSON.stringify({
    event: hook.event,
    layer: hook.layer,
    ...(hook.match !== undefined && { match: hook.match }),
    command: hook.command,
  });
  const runner = join(root, hookRunnerPath("hermes"));
  const command = `sh -c ${shellQuote('[ -f "$0" ] && exec node "$0" "$1"; exit 0')} ${shellQuote(runner)} ${shellQuote(spec)}`;
  const matcher =
    hook.event === "after-edit"
      ? EDIT_TOOLS
      : hook.event === "before-tool"
        ? hook.match
        : undefined;
  return { ...(matcher !== undefined && { matcher }), command, timeout: 60 };
}

/** The user's own Hermes config; read here only to give better warnings. */
function userConfig(): Record<string, unknown> {
  try {
    const doc = parseYaml(readFileSync(configFile(), "utf8"));
    return isRecord(doc) ? doc : {};
  } catch {
    return {};
  }
}

function skillsTrusted(config: Record<string, unknown>, root: string): boolean {
  const dirs = isRecord(config.skills) ? config.skills.trusted_project_dirs : undefined;
  return Array.isArray(dirs) && dirs.includes(root);
}

function plan(ctx: AdapterContext) {
  const operations: Operation[] = [];
  const warnings: string[] = [];
  const file = configFile();

  for (const layer of ctx.contents.map((c) => c.meta.path)) {
    for (const name of SHADOWING) {
      const path = `${layerPrefix(layer)}${name}`;
      if (existsSync(join(ctx.root, path))) {
        warnings.push(`${path} exists, so Hermes reads it instead of AGENTS.md`);
      }
    }
  }
  if (ctx.contents.some((c) => c.rules.length > 0)) {
    warnings.push(
      "Rules skipped: Hermes has no place for project rules; point AGENTS.md at .agents/rules/ instead",
    );
  }
  const root = ctx.contents.find((c) => c.meta.path === ".");
  if (root && root.skills.length > 0 && !skillsTrusted(userConfig(), ctx.root)) {
    warnings.push('Run "hermes skills trust" in this repo once, so Hermes loads .agents/skills');
  }
  for (const content of ctx.contents) {
    const layer = content.meta.path;
    if (layer !== "." && content.skills.length > 0) {
      warnings.push(`Skills in ${layer}/.agents/skills are skipped: Hermes reads only the root`);
    }
    for (const plugin of content.plugins) {
      if (plugin.agent !== "hermes") continue;
      warnings.push(
        `Plugin "${plugin.name}": install it with hermes plugins install ${plugin.source ?? plugin.name}`,
      );
    }
  }

  const servers = new Map<string, McpServer>();
  for (const server of ctx.contents.flatMap((c) => c.mcp)) {
    // validate allows the same server in two layers only when identical: plan it once.
    if (!servers.has(server.name)) servers.set(server.name, server);
  }
  const hooks = ctx.contents.flatMap((c) => c.hooks);
  const items = [
    ...[...servers.values()].map((s) => `mcp ${s.name} (${s.layer})`),
    ...hooks.map((h) => `hook ${h.name} (${h.layer}): on ${h.event} runs ${h.command}`),
  ];
  let globalSkipped: { file: string; items: string[] } | undefined;
  if (items.length > 0 && !ctx.allowGlobal) {
    globalSkipped = { file, items };
    warnings.push(
      `${items.length} item(s) skipped: Hermes keeps MCP servers and hooks only in ${file}; install with --allow-global to write them there`,
    );
  } else if (items.length > 0 && !existsSync(home())) {
    warnings.push(
      `MCP servers and hooks skipped: Hermes is not set up here (${home()} is missing)`,
    );
  } else if (items.length > 0) {
    for (const server of servers.values()) {
      operations.push({
        kind: "merge-json",
        path: file,
        key: ["mcp_servers", server.name],
        value: serverConfig(server),
        approval: approvalId("mcp", server.layer, server.name),
      });
    }
    for (const hook of hooks) {
      operations.push({
        kind: "merge-json-item",
        path: file,
        key: ["hooks", EVENTS[hook.event]],
        id: `${hook.layer}:${hook.name}`,
        value: hookEntry(ctx.root, hook),
        approval: approvalId("hook", hook.layer, hook.name),
      });
    }
    if (servers.size > 0) {
      warnings.push(`MCP servers in ${file} are active in every Hermes session, not only here`);
    }
    if (hooks.length > 0) {
      operations.push({
        kind: "write",
        path: hookRunnerPath("hermes"),
        content: HOOK_RUNNER,
        readonly: true,
      });
      warnings.push("Hermes asks you to approve each new or changed hook in hermes chat");
    }
  }

  return {
    agent: "hermes" as const,
    scopes: ctx.scopes,
    operations,
    approvals: usedApprovals(ctx.approvals, operations),
    warnings,
    ...(globalSkipped && { globalSkipped }),
  };
}

export const hermes: Adapter = {
  id: "hermes",
  name: "Hermes Agent",
  plan,
  externalFiles: () => [configFile()],
};
