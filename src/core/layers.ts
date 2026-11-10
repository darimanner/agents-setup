export class UnknownScopeError extends Error {
  constructor(
    readonly scope: string,
    readonly available: string[],
  ) {
    super(
      `Unknown scope: ${scope}. Available: ${available.length ? available.join(", ") : "none (only the root layer exists)"}`,
    );
    this.name = "UnknownScopeError";
  }
}

function depth(layer: string): number {
  return layer === "." ? 0 : layer.split("/").length;
}

function compareLayers(a: string, b: string): number {
  return depth(a) - depth(b) || (a < b ? -1 : a > b ? 1 : 0);
}

/** Layer paths from a repo file list: "." first, then by depth, then by path. */
export function discoverLayers(files: string[]): string[] {
  const layers = new Set(["."]);
  for (const file of files) {
    if (file.startsWith(".agents/")) continue;
    const index = file.indexOf("/.agents/");
    if (index !== -1) layers.add(file.slice(0, index));
  }
  return [...layers].sort(compareLayers);
}

function isWithin(layer: string, scope: string): boolean {
  return layer === scope || layer.startsWith(`${scope}/`);
}

/** The root, every ancestor of each scope, the scope itself and every layer nested under it. */
export function resolveScopes(layers: string[], requested: string[]): string[] {
  if (requested.includes("all")) return [...layers];
  const selected = new Set(["."]);
  for (const scope of requested.map((s) => s.replace(/^\.\/|\/+$/g, ""))) {
    if (scope === "." || scope === "") continue;
    if (!layers.includes(scope)) {
      throw new UnknownScopeError(
        scope,
        layers.filter((l) => l !== "."),
      );
    }
    for (const layer of layers) {
      if (isWithin(layer, scope) || isWithin(scope, layer)) selected.add(layer);
    }
  }
  return layers.filter((l) => selected.has(l));
}
