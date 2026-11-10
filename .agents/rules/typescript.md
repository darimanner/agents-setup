# TypeScript

- Strict types everywhere. No `any`; use `unknown` and narrow it.
- ESM only. Relative imports end in `.js`.
- Node stdlib first. Add a dependency only when it saves real work, and say why in the PR.
- Keep Node 22 compatibility: no APIs that newer Node versions added.
- Tests live in `test/` and use Vitest. Filesystem tests run in a temp directory, never in
  the repo or the home directory.
- Formatting and lint come from Biome; do not hand-format against it.
