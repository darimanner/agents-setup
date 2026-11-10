# Contributing

Thanks for helping. This guide covers setup, the workflow and what a good pull request
looks like.

## Setup

You need Node.js 22 or newer and git. macOS and Linux are supported; Windows is not yet.

```bash
git clone https://github.com/darimanner/agents-setup.git
cd agents-setup
npm ci
npm run build
npm test
```

Scripts:

| Script              | What it does                |
| ------------------- | --------------------------- |
| `npm run build`     | compile `src/` to `dist/`   |
| `npm test`          | run the Vitest suite        |
| `npm run typecheck` | type-check without emitting |
| `npm run lint`      | Biome lint and format check |
| `npm run format`    | apply Biome formatting      |

Try your build on a real project with `node /path/to/agents-setup/dist/main.js` from that
project's directory.

### Pre-commit hooks

Install them once (needs [uv](https://docs.astral.sh/uv/) or pipx):

```bash
uvx pre-commit install
```

On every commit they check YAML and JSON, merge conflict markers, large files and private
keys, fix trailing whitespace and final newlines, reject banned typography (long dashes,
curly quotes, the ellipsis character, special spaces), and run Biome and the type check.
Run them on everything with `uvx pre-commit run --all-files`. CI runs the typography check
too.

## Workflow

1. **Open an issue first** for anything bigger than a small fix, using one of the issue
   forms. Design questions are settled there before code is written.
2. **Branch** from `main`: `feat/<topic>`, `fix/<topic>`, `docs/<topic>` or
   `chore/<topic>`.
3. **One pull request per change.** Include tests for new behavior and update the docs in
   `docs/` and the README when behavior visible to users changes.
4. **CI must pass**: lint, typecheck, build and tests on Linux and macOS with Node 22 and
   26.
5. Fill in the pull request template.

## Commits

- Imperative mood, subject under 72 characters: `Add Codex MCP mapping`, or with a type
  prefix, `feat: add Codex MCP mapping`.
- Explain the why in the body when it is not obvious from the diff.
- Everything is written in American English.

## Ground rules for code

These protect users' machines and config; pull requests that break them are not merged.

- Adapters produce a plan of operations; only the apply step writes files.
- Never overwrite or delete config the user wrote. Merge only keys agents-setup owns.
- Install into an agent's project or local scope only. Global writes exist only for
  Hermes Agent, behind explicit consent.
- Hook commands, MCP servers and plugin references always go through approval.

More detail in [AGENTS.md](AGENTS.md) and [docs/security.md](docs/security.md).

## Adding support for an agent

See [docs/contributing/adding-an-agent.md](docs/contributing/adding-an-agent.md).

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
