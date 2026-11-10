import { error } from "./formats/common.js";
import { stableStringify } from "./stable.js";
import type { Diagnostic, LayerContent } from "./types.js";

interface Named {
  layer: string;
  name: string;
  file: string;
  identity: string;
}

function conflicts(kind: string, items: Named[]): Diagnostic[] {
  const seen = new Map<string, Named>();
  const out: Diagnostic[] = [];
  for (const item of items) {
    const first = seen.get(item.name);
    if (!first) {
      seen.set(item.name, item);
    } else if (first.identity !== item.identity) {
      out.push(
        error(
          item.file,
          `${kind} "${item.name}" in layer ${item.layer} differs from the one in layer ${first.layer}; rename one or make them identical`,
        ),
      );
    }
  }
  return out;
}

/** Checks that span layers: names that must be unique unless defined identically. */
export function validateLayers(contents: LayerContent[]): Diagnostic[] {
  const skills = contents.flatMap((c) =>
    c.skills.map((s) => ({
      layer: s.layer,
      name: s.name,
      file: `${s.dir}/SKILL.md`,
      identity: s.digest ?? stableStringify({ ...s, layer: undefined, dir: undefined }),
    })),
  );
  const servers = contents.flatMap((c) =>
    c.mcp.map((s) => ({
      layer: s.layer,
      name: s.name,
      file: `${s.layer === "." ? "" : `${s.layer}/`}.agents/mcp.yaml`,
      identity: stableStringify({ ...s, layer: undefined }),
    })),
  );
  return [...conflicts("Skill", skills), ...conflicts("MCP server", servers)];
}
