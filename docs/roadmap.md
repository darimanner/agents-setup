# Roadmap

What is planned, in order. Each step is one or more pull requests with tests and docs.
Ideas and requests are welcome as [issues](https://github.com/darimanner/agents-setup/issues).

## Done

- **Layers and formats**: layer discovery, scopes, parsers for rules, skills, MCP servers,
  hooks, plugins and manifests, secret checks, `agents-setup validate` and `status`.
- **Apply engine**: plans, per-agent state, path safety, ownership (never overwrite what
  agents-setup did not create), owned keys and array items in shared JSON, approvals by
  fingerprint, `.git/info/exclude`, exact uninstall.
- **Claude Code adapter** with the `install`, `sync`, `approve` and `uninstall` commands
  and `--dry-run`: rules copied with per-folder `paths`, skills linked per folder, MCP
  servers, hooks (through a shared runner) and plugins in local settings.
- **OpenCode adapter**: one overlay file, `.opencode/opencode.jsonc`, with rules as
  `instructions`, MCP servers and npm plugins.
- **Codex adapter**: rules as `developer_instructions`, MCP servers, hooks and plugins in
  `.codex/config.toml`; each agent gets its own hook runner.

## v1

1. **Hermes Agent adapter**, including the opt-in for its global config (MCP servers, hooks
   and plugins exist only there).
2. **Auto-sync after `git pull`**: a session-start hook with a fast staleness check that
   needs neither Node nor the network when nothing changed.
3. **Agent mode**: the `agents-setup` skill and protocol, so an agent can run the setup for
   you, ask before approving, or review the plan for safety first
   (`approve --list --json`).
4. **Templates**: `init`, `add` and `template create`, plus a default template for new
   projects.
5. **First npm release**, so `npx agents-setup` works without a clone.

## After v1

- Adapters for Antigravity (IDE and CLI), Kimi, Cursor and GitHub Copilot. Until then,
  these agents can use agent mode.
- Hooks for OpenCode, through a generated plugin (its plugin API differs between OpenCode
  1 and 2).
- A neutral `permissions` asset, for example denying agents read access to `.env` files.
- Commands and subagents as neutral asset types.
- `template update`: pull a newer version of an applied template into a project.
- Windows support (a PowerShell staleness check and Windows CI).
- Claude Code linked worktrees, whose local settings live in the main checkout.
- A Claude Code plugin that ships the `agents-setup` skill.
- A better name and a README that shows the tool in action.

## Open questions

- Does a Claude Code session started at the repo root load a sub-folder `.mcp.json`? If
  so, MCP servers could be scoped per folder there too.
