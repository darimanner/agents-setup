# Codex

Verified on November 10, 2026 against the official Codex docs
([AGENTS.md](https://developers.openai.com/codex/guides/agents-md),
[config](https://developers.openai.com/codex/config-basic),
[skills](https://developers.openai.com/codex/skills), [MCP](https://developers.openai.com/codex/mcp),
[hooks](https://developers.openai.com/codex/hooks)) and the Codex source, release 0.167.0.
Needs Codex 0.129 or newer for hooks.

## What gets installed

Everything goes into the project config, `.codex/config.toml`. Codex reads it only in
trusted projects: trust the folder when Codex asks on first launch. Until then the CLI
warns.

| Layer content | Where it goes                                                 | Per folder                                                 |
| ------------- | ------------------------------------------------------------- | ---------------------------------------------------------- |
| `AGENTS.md`   | nothing to do: read natively                                  | from the repo root down to the folder Codex starts in      |
| rules         | `developer_instructions`: every rule of the selected scopes   | no: each rule names the files it applies to                |
| skills        | nothing to do: Codex reads `.agents/skills/`                  | only from the folder Codex starts in and the ones above    |
| MCP servers   | `mcp_servers`                                                 | no, active for the whole project                           |
| hooks         | `hooks`, through `.agents/.state/bin/hook-codex.mjs`          | yes, `after-edit` only fires for files in the hook's layer |
| plugins       | `plugins`, plus `marketplaces` when a plugin gives a `source` | no                                                         |

Codex does not expand `${VAR}`, so references become the names of variables Codex forwards:

| In `mcp.yaml`                    | In `.codex/config.toml`                |
| -------------------------------- | -------------------------------------- |
| `env: { DB_URL: "${DB_URL}" }`   | `env_vars = ["DB_URL"]`                |
| `Authorization: "Bearer ${TOK}"` | `bearer_token_env_var = "TOK"`         |
| `X-Key: "${KEY}"`                | `env_http_headers = { X-Key = "KEY" }` |
| plain text                       | `env`, `http_headers`                  |

A server that uses a variable anywhere else (in `command`, `args` or `url`, inside other
text, or under another name) is skipped for Codex with a warning.

Hook events map to `SessionStart`, `PreToolUse` (the hook's `match` is the tool matcher),
`PostToolUse` for `apply_patch` (the hook's `match` is a file glob, relative to its layer;
a patch that touches several files runs the hook once per matching file), and `Stop`.

Auto-sync is a `SessionStart` hook that runs `.agents/.state/bin/autosync-codex.sh`. Like
every project hook, Codex runs it only after you review it with `/hooks`, once.

Plugins need a `marketplace`. Give it a `source` (`owner/repo` for GitHub or a git URL) to
have the marketplace added too, or add it yourself with `codex plugin marketplace add`.

## Limits

- Codex reads `AGENTS.override.md` instead of `AGENTS.md` in a folder that has one.
  agents-setup never creates it and warns when it finds one.
- Rules go into `developer_instructions`, which replaces yours from `~/.codex/config.toml`
  in this project. If you set it there, rules are skipped with a warning.
- Codex runs a new or changed hook only after you review it with `/hooks` in Codex.
- Skills of a nested layer, such as `frontend/.agents/skills`, load only when Codex starts
  in `frontend/` or below. The CLI warns about them.
- agents-setup edits `.codex/config.toml` only if it created the file: rewriting TOML
  would drop your comments. If you keep your own, nothing is installed for Codex and the
  CLI says so. A file tracked by git is never changed either.
- In a linked git worktree, Codex reads project hooks from the main checkout. agents-setup
  warns.
