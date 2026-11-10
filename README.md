# agents-setup

One agent-neutral config for every coding agent. Share rules, skills, MCP servers, hooks
and plugins with your team through one folder in the repo, scoped to the parts of the
codebase they belong to.

> **Status:** in development. The CLI is not published to npm yet, and the commands below
> describe the planned behavior. See [Status](#status).

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

## Quick start (planned)

With the CLI:

```bash
npx agents-setup install --agent claude-code --scope frontend
```

Run it without flags to choose interactively.

With your agent, in plain words:

> Set up this project for me. I work on the frontend.

The agent runs the CLI for you and asks you to confirm anything that would run code on your
machine. You can also ask it to check that everything is safe to install first.

Starting a new project:

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

| Agent                        | Support                       |
| ---------------------------- | ----------------------------- |
| Claude Code                  | adapter planned for v1        |
| Codex                        | adapter planned for v1        |
| OpenCode                     | adapter planned for v1        |
| Hermes Agent                 | adapter planned for v1        |
| Antigravity, Kimi and others | later; until then, agent mode |

Gemini CLI is not supported: Google retired it on June 18, 2026 in favor of Antigravity
CLI. Per-agent capabilities and limits: [docs/agents/](docs/agents/README.md).

## Status

- In development; not published to npm.
- Works today, from a clone: `agents-setup status` (layers and installed agents) and
  `agents-setup validate` (checks every layer).
- The apply engine is in place; the first agent adapter comes next.
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
