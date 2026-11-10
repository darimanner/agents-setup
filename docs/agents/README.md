# Agents

What each adapter installs, verified against each agent's docs and source in November 2026.
Details and limits: [Claude Code](claude-code.md), [Codex](codex.md),
[OpenCode](opencode.md), [Hermes Agent](hermes.md).

|             | Claude Code                                                                                              | Codex                                                | OpenCode                         | Hermes Agent                                                 |
| ----------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------- | ------------------------------------------------------------ |
| `AGENTS.md` | read while no `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md` exists at or above the launch folder | native, from the repo root down to the launch folder | native                           | native, unless a `.hermes.md` exists                         |
| rules       | copies in `.claude/rules/`, per-folder via `paths`                                                       | `developer_instructions` in `.codex/config.toml`     | `instructions` lists the files   | none: point `AGENTS.md` at them                              |
| skills      | links in `.claude/skills/`                                                                               | reads `.agents/skills/`                              | reads `.agents/skills/`          | reads the root `.agents/skills/` after `hermes skills trust` |
| MCP servers | `.mcp.json`, enabled in `.claude/settings.local.json`                                                    | `.codex/config.toml`, trusted projects only          | `.opencode/opencode.jsonc` `mcp` | global `config.yaml`, with consent                           |
| hooks       | settings `hooks`                                                                                         | `.codex/config.toml` `hooks`, reviewed in `/hooks`   | not yet (through a plugin)       | global `config.yaml`, with consent                           |
| plugins     | `enabledPlugins` and marketplaces in settings                                                            | `plugins` and `marketplaces` in `.codex/config.toml` | `plugin`, npm packages           | `hermes plugins install`, by hand                            |
| auto-sync   | session-start hook                                                                                       | session-start hook                                   | not yet                          | not yet                                                      |

agents-setup never creates `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`,
`.hermes.md` or `AGENTS.override.md`: each would hide the committed `AGENTS.md`.

## Agents without an adapter

Antigravity CLI, Kimi and others are planned after v1. Until then, ask the agent to set up the
project: it follows the `agents-setup` skill and maps the layers by hand where it can.
