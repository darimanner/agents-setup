# agents-setup

One agent-neutral config for every coding agent. Share rules, skills, MCP servers, hooks
and plugins with your team through one folder in the repo, scoped to the parts of the
codebase they belong to.

> **Status:** in development and not published to npm yet. Claude Code, Codex and OpenCode
> work today from a clone; Hermes Agent, agent mode and templates are planned. See
> [Status](#status).

## Why

Every coding agent wants its own files: `.claude/`, `.codex/`, `opencode.json`, `.hermes/`
and so on. A team that uses more than one agent either commits several copies of the same
setup, which drift apart, or shares nothing at all.

agents-setup keeps one source in the repo and turns it into each agent's native config on
each developer's machine. The generated files are never committed.

## How it works

1. The repo holds `AGENTS.md` files and `.agents/` folders: at the root and, if needed,
   inside any directory such as `frontend/` or `frontend/admin/`.
2. A teammate picks the agent they use and the part of the repo they work on, either with
   the CLI or by asking their agent.
3. agents-setup writes the agent's native config into its project or local scope, keeps it
   out of git, and records what it wrote.
4. After `git pull`, changed items are synced again. New commands, MCP servers and plugins
   wait for the user's approval first.

## Quick start

With the CLI (from a clone until the first npm release: `node /path/to/agents-setup/dist/main.js`):

```bash
npx agents-setup install --agent claude-code --scope frontend
```

Run it without flags to choose interactively. Then, as the repo changes:

```bash
npx agents-setup sync              # apply what changed after git pull
npx agents-setup sync --check      # exit 1 if out of date or waiting for approval
npx agents-setup approve --list    # what waits for approval, and why
npx agents-setup approve           # approve it in your terminal
npx agents-setup uninstall         # remove exactly what was written
```

`--dry-run` shows what would change; `--yes` approves everything in the plan.

Planned, with your agent, in plain words:

> Set up this project for me. I work on the frontend.

The agent runs the CLI for you and asks you to confirm anything that would run code on your
machine. You can also ask it to check that everything is safe to install first.

Planned, starting a new project:

```bash
npx agents-setup init --template gh:you/your-template
```

Then ask your agent to write the `AGENTS.md` files and fill in the layers.

## Concepts

- **Layer:** a directory that contains `.agents/`, with an `AGENTS.md` beside it. The repo
  root is always a layer. Details: [docs/formats.md](docs/formats.md).
- **Scope:** the part of the repo you work on, named by a layer's path, for example
  `frontend`. Selecting it also brings the layers above and below it. Details:
  [docs/scopes.md](docs/scopes.md).
- **Approval:** hook commands, MCP servers and plugins can run code, so they are installed
  only after you approve them. Details: [docs/security.md](docs/security.md).
- **Template:** a reusable bundle of layers you can create, share and apply. Details:
  [docs/templates.md](docs/templates.md).

## How it differs

Tools such as [rulesync](https://github.com/dyoshikawa/rulesync) and
[Ruler](https://github.com/intellectronica/ruler) already generate per-agent files from one
source. agents-setup makes different choices:

- **Two ways in.** Run the CLI, or ask your agent: it follows the bundled skill, runs the
  setup for you and asks before approving anything.
- **Scopes by folder.** Any directory can carry its own layer. You say which part of the
  repo you work on, and its settings load where the agent supports per-folder loading.
- **Approval before code runs.** Hook commands, MCP servers and plugins are installed only
  after you approve them, and a changed one waits for approval again, also after
  `git pull`.
- **Your config is never overwritten.** Files agents-setup did not create are left alone,
  generated files you edited are kept, and shared config files get only the keys and list
  items agents-setup owns.
- **Nothing to commit.** Generated files stay out of git through `.git/info/exclude`, so an
  install changes nothing your teammates see.
- **Updates and a clean exit.** Installed items follow the repo after `git pull`, and
  `uninstall` removes exactly what was written.
- **Templates of your own.** Bundle the tools you use into a template, share it, and apply
  it to new or existing projects.

## Supported agents

| Agent           | Support                                 |
| --------------- | --------------------------------------- |
| Claude Code     | [supported](docs/agents/claude-code.md) |
| Codex           | [supported](docs/agents/codex.md)       |
| OpenCode        | [supported](docs/agents/opencode.md)    |
| Hermes Agent    | adapter planned for v1                  |
| Antigravity CLI | planned                                 |
| Kimi and others | later; until then, agent mode           |

## Status

- In development; not published to npm.
- Works today, from a clone: `install`, `sync`, `approve`, `uninstall`, `status` and
  `validate`, for Claude Code, Codex and OpenCode.
- macOS and Linux. Windows is not supported yet.
- What comes next: [docs/roadmap.md](docs/roadmap.md).

## Contributing

Issues and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md).

## Credits

**Prior art.** [rulesync](https://github.com/dyoshikawa/rulesync) and
[Ruler](https://github.com/intellectronica/ruler) solve a similar problem with a different
approach; facts about where each agent keeps its config are cross-checked against them.
agents-setup's code is its own. If code is ever ported from either (both MIT), that file
keeps their license notice.

## License

[MIT](LICENSE)
