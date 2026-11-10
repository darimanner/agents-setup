# Agents

> The table below is the starting research from November 2026. Each adapter PR verifies
> its agent against the official docs and adds a page here, `docs/agents/<agent>.md`, with
> the confirmed locations and limits.

|             | Claude Code                                                                                     | Codex                   | OpenCode                       | Hermes Agent                                                             |
| ----------- | ----------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------ | ------------------------------------------------------------------------ |
| `AGENTS.md` | reportedly read when there is no `CLAUDE.md`; otherwise a generated `CLAUDE.md` that imports it | native, nested          | native                         | native, nested; a `.hermes.md` would take priority, so none is generated |
| rules       | `.claude/rules/`, per-folder via `paths`                                                        | to verify               | `opencode.json` `instructions` | to verify                                                                |
| skills      | `.claude/skills/`, per-folder via `paths`                                                       | reads `.agents/skills/` | to verify                      | global skills folder; project folder to verify                           |
| MCP servers | `.mcp.json`, whole project                                                                      | `.codex/config.toml`    | `opencode.json` `mcp`          | global `config.yaml` only                                                |
| hooks       | settings `hooks`                                                                                | to verify               | through an OpenCode plugin     | global `config.yaml` only                                                |
| plugins     | `enabledPlugins` and marketplaces in settings                                                   | to verify               | `opencode.json` `plugin`       | `hermes plugins`, global                                                 |

## Hermes Agent and global config

Hermes keeps MCP servers, hooks and plugins only in `~/.hermes/config.yaml`. agents-setup
skips them by default and lists what would be needed. With your consent for the project,
it writes them there marked with the project name, and removes them on `uninstall`.

## Agents without an adapter

Antigravity, Kimi and others are planned after v1. Until then, ask the agent to set up the
project: it follows the `agents-setup` skill and maps the layers by hand where it can.
