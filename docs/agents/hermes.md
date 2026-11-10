# Hermes Agent

Verified on November 10, 2026 against the Hermes Agent docs
([context files](https://hermes-agent.nousresearch.com/docs/user-guide/features/context-files),
[skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills),
[hooks](https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks),
[MCP](https://hermes-agent.nousresearch.com/docs/reference/mcp-config-reference)) and its
source, release v0.23.1. Not yet checked with a live Hermes session.

## What gets installed

Hermes has no project config: MCP servers and hooks exist only in its global config,
`~/.hermes/config.yaml` (or `$HERMES_HOME/config.yaml`), where they apply to every Hermes
session. agents-setup writes there only with your consent: answer yes when `install` asks,
or pass `--allow-global`. Without it, `install` lists what it skipped.

| Layer content | Where it goes                                                         | Per folder                                             |
| ------------- | --------------------------------------------------------------------- | ------------------------------------------------------ |
| `AGENTS.md`   | nothing to do: read natively                                          | from the repo root down to the folder Hermes starts in |
| rules         | nowhere: Hermes has no project rules                                  |                                                        |
| skills        | nothing to do: Hermes reads `.agents/skills/` at the repo root        | root layer only                                        |
| MCP servers   | `mcp_servers` in the global config, with consent                      | no, active in every Hermes session                     |
| hooks         | `hooks` in the global config, with consent, through `hook-hermes.mjs` | yes: they act only for sessions inside this repo       |
| plugins       | nowhere: install them with `hermes plugins install`                   |                                                        |

How agents-setup edits the global config:

- Only its own entries change, each marked with a `# managed by agents-setup for <repo>`
  comment; the rest of the file stays byte for byte, comments included. A file that uses a
  layout it cannot edit that way (flow style, `{ ... }`) is left untouched with an error.
- The file is copied to `.agents/.state/backup/` before each change, and a linked file stays
  a link.
- `uninstall` removes exactly those entries.

Hook events map to `on_session_start`, `pre_tool_call` (the hook's `match` is a regular
expression on the tool name), `post_tool_call` for `write_file` and `patch`, and
`on_session_end`, which Hermes fires after every turn.

## Limits

- `.hermes.md` or `HERMES.md` replaces the whole `AGENTS.md` chain for Hermes. agents-setup
  never creates them and warns when it finds one.
- Rules are skipped with a warning: Hermes has no place for project rules. Point
  `AGENTS.md` at `.agents/rules/` instead.
- Hermes loads repo skills only after you run `hermes skills trust` in the repo, once per
  repo. The CLI reminds you until you do. Skills of nested layers are not loaded.
- Hermes asks you to approve each new or changed hook the first time it runs in
  `hermes chat`.
- A hook runs only when Hermes runs inside this repo. Sessions started through the Hermes
  gateway may run from another folder, and then the hook stays silent.
- No auto-sync yet: run `agents-setup sync` after `git pull`.
