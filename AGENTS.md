# AGENTS.md

Guidance for coding agents working on agents-setup itself. What the project is and how
people use it: [README.md](README.md). Extra rules live in [.agents/rules/](.agents/rules/);
follow them too.

## Commands

```bash
npm ci              # install
npm run build       # compile src/ to dist/
npm test            # vitest
npm run typecheck   # tsc --noEmit
npm run lint        # biome check
npm run format      # biome format --write
```

Run lint, typecheck, build and test before calling a change done. CI runs the same steps
on Linux and macOS with Node 22 and 26.

## Layout

- `src/`: the CLI. `src/main.ts` is the bin entry, `src/cli.ts` dispatches commands.
- `test/`: Vitest tests, fixtures under `test/fixtures/`.
- `docs/`: user docs (formats, scopes, templates, security, per-agent notes) and
  `docs/contributing/`.
- `.agents/`: this repo's own agent config, in the format agents-setup reads.

## House rules

- Adapters turn layers into a plan of operations. They never write files themselves; the
  apply step does, and records what it wrote.
- Never overwrite or delete config the user wrote. Merge only keys agents-setup owns.
- Install only into an agent's project or local scope. The one exception is Hermes, whose
  MCP servers, hooks and plugins are global: only with explicit consent.
- Hook commands, MCP servers and plugin references are fingerprinted and need approval.
  Nothing may install them silently, including auto-sync after `git pull`.
- Verify an agent's paths and formats against its official docs before changing its
  adapter, and keep `docs/agents/<agent>.md` in step.

## Workflow

- Small foundation changes went straight to `main`. Everything else is one PR per change,
  with tests and docs, merged after CI is green.
- Use the issue and PR templates in `.github/`.
- Commit subjects use the imperative mood and stay under 72 characters.
- Everything is written in American English.
