import { discoverLayers } from "../core/layers.js";
import { loadLayers } from "../core/load.js";
import { findRepoRoot, listRepoFiles } from "../core/repo.js";
import { validateLayers } from "../core/validate.js";
import type { Io } from "../io.js";
import { plural } from "./format.js";

export async function validateCommand(cwd: string, io: Io): Promise<number> {
  const root = findRepoRoot(cwd);
  const files = listRepoFiles(root);
  const layers = discoverLayers(files);
  const { contents, diagnostics } = loadLayers(root, files, layers);
  diagnostics.push(...validateLayers(contents));

  for (const d of diagnostics) io.stdout(`${d.file}: ${d.level}: ${d.message}\n`);
  const errors = diagnostics.filter((d) => d.level === "error").length;
  const warnings = diagnostics.length - errors;
  io.stdout(
    diagnostics.length === 0
      ? `${plural(layers.length, "layer")}, no problems found\n`
      : `${plural(errors, "error")}, ${plural(warnings, "warning")}\n`,
  );
  return errors > 0 ? 1 : 0;
}
