import { readFileSync } from "node:fs";
import { join } from "node:path";
import { layerPrefix } from "./load.js";
import { sha256 } from "./stable.js";

/** sha256 over every file of the given layers' `.agents/` folders and their AGENTS.md. */
export function contentHash(root: string, files: string[], layers: string[]): string {
  const included = files.filter((file) =>
    layers.some((layer) => {
      const prefix = layerPrefix(layer);
      if (file === `${prefix}AGENTS.md`) return true;
      // .state is local; if a project forgot to ignore it, it must not make every sync stale.
      return file.startsWith(`${prefix}.agents/`) && !file.startsWith(`${prefix}.agents/.state/`);
    }),
  );
  const parts = included
    .sort()
    .map((file) => `${file}\0${readFileSync(join(root, file), "utf8")}\0`);
  return sha256(parts.join(""));
}
