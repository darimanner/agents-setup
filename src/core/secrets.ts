const KNOWN_PREFIX = /(sk-|ghp_|gho_|ghs_|github_pat_|xox[abpr]-|AKIA|glpat-)[A-Za-z0-9_-]{8,}/;
const LONG_TOKEN = /[A-Za-z0-9]{20,}/g;

/**
 * "known": a credential format we recognize, always an error.
 * "suspect": a long letters-and-digits token, only a warning because hashes and ids look alike.
 */
export function secretKind(value: string): "known" | "suspect" | undefined {
  const literal = value.replace(/\$\{[^}]*\}/g, "");
  if (KNOWN_PREFIX.test(literal)) return "known";
  for (const token of literal.match(LONG_TOKEN) ?? []) {
    if (/[A-Za-z]/.test(token) && /[0-9]/.test(token)) return "suspect";
  }
  return undefined;
}

export function looksLikeSecret(value: string): boolean {
  return secretKind(value) !== undefined;
}
