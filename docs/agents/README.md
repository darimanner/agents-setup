# Agents

> The table below is the starting research from November 2026, partly confirmed by live
> checks with Claude Code 2.1.311. Each adapter PR verifies its agent against the official
> docs and adds a page here, `docs/agents/<agent>.md`, with the confirmed locations and
> limits.

|             | Claude Code                                                                                              | Codex                                                | OpenCode                         | Hermes Agent                                       |
| ----------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------- | -------------------------------------------------- |
| `AGENTS.md` | read while no `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md` exists at or above the launch folder | native, from the repo root down to the launch folder | native                           | native, nested; a `.hermes.md` would take priority |
| rules       | copies in `.claude/rules/`, per-folder via `paths`                                                       | `developer_instructions` in `.codex/config.toml`     | `instructions` lists the files   | no rules folder; `AGENTS.md` points to them        |
| skills      | links in `.claude/skills/`                                                                               | reads `.agents/skills/`                              | reads `.agents/skills/`          | reads repo skills after `hermes skills trust`      |
| MCP servers | `.mcp.json`, enabled in `.claude/settings.local.json`                                                    | `.codex/config.toml`, trusted projects only          | `.opencode/opencode.jsonc` `mcp` | global `config.yaml` only                          |
| hooks       | settings `hooks`                                                                                         | `.codex/config.toml` `hooks`, reviewed in `/hooks`   | not yet (through a plugin)       | global `config.yaml` only                          |
| plugins     | `enabledPlugins` and marketplaces in settings                                                            | `plugins` and `marketplaces` in `.codex/config.toml` | `plugin`, npm packages           | `hermes plugins`, global                           |

agents-setup never creates `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`,
`.hermes.md` or `AGENTS.override.md`: each would hide the committed `AGENTS.md`.

## Claude Code notes

- Rules are copied, not linked: Claude Code skips a linked rule whose target lies outside
  the folder a session starts in, but loads real files in the root `.claude/rules/` from
  any subfolder.
- In a linked git worktree, Claude Code reads `.claude/settings.local.json` of the main
  checkout only, so agents-setup asks before writing there.

## Hermes Agent and global config

Hermes keeps MCP servers, hooks and plugins only in `~/.hermes/config.yaml`. agents-setup
skips them by default and lists what would be needed. With your consent for the project,
it writes them there marked with the project name, and removes them on `uninstall`.

## Agents without an adapter

Antigravity CLI, Kimi and others are planned after v1. Until then, ask the agent to set up the
project: it follows the `agents-setup` skill and maps the layers by hand where it can.
