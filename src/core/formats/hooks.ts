import { type Diagnostic, HOOK_EVENTS, type Hook, type HookEvent } from "../types.js";
import { error, isRecord, nameProblem, parseYamlFile } from "./common.js";

function isHookEvent(value: unknown): value is HookEvent {
  return HOOK_EVENTS.includes(value as HookEvent);
}

export function parseHooks(
  layer: string,
  file: string,
  text: string,
): { hooks: Hook[]; diagnostics: Diagnostic[] } {
  const { data, diagnostic } = parseYamlFile(file, text);
  if (diagnostic) return { hooks: [], diagnostics: [diagnostic] };
  if (!isRecord(data)) return { hooks: [], diagnostics: [error(file, "Must be a mapping")] };
  if (data.hooks === undefined || data.hooks === null) return { hooks: [], diagnostics: [] };
  if (!isRecord(data.hooks)) {
    return { hooks: [], diagnostics: [error(file, "hooks must be a mapping")] };
  }

  const hooks: Hook[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const [name, raw] of Object.entries(data.hooks)) {
    const fail = (message: string) => diagnostics.push(error(file, `Hook "${name}": ${message}`));
    const problem = nameProblem("hook", name);
    if (problem) {
      diagnostics.push(error(file, problem));
      continue;
    }
    if (!isRecord(raw)) {
      fail("must be a mapping");
      continue;
    }
    if (!isHookEvent(raw.event)) {
      fail(`event must be one of ${HOOK_EVENTS.join(", ")}`);
      continue;
    }
    if (typeof raw.command !== "string" || raw.command.trim() === "") {
      fail("needs a command");
      continue;
    }
    if (raw.match !== undefined && typeof raw.match !== "string") {
      fail("match must be a string");
      continue;
    }
    const hook: Hook = { layer, name, event: raw.event, command: raw.command };
    if (raw.match !== undefined) hook.match = raw.match;
    hooks.push(hook);
  }
  return { hooks, diagnostics };
}
