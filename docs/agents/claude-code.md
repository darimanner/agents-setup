# Claude Code

Verified against the official Claude Code docs on November 10, 2026
([memory](https://code.claude.com/docs/en/memory), [skills](https://code.claude.com/docs/en/skills),
[MCP](https://code.claude.com/docs/en/mcp), [hooks](https://code.claude.com/docs/en/hooks),
[settings](https://code.claude.com/docs/en/settings)). Needs Claude Code 2.1.277 or newer
for native `AGENTS.md` support.

## What gets installed

| Layer content | Where it goes                                                                    | Per folder                                                    |
| ------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `AGENTS.md`   | nothing to do: read natively                                                     | yes, loaded when Claude works in that folder                  |
| rules         | read-only copies in `.claude/rules/agents-setup/`                                | yes, through `paths`; nested layers get their folder prefixed |
| skills        | links in `<layer>/.claude/skills/<name>`                                         | yes, nested skills load when Claude works in that folder      |
| MCP servers   | `.mcp.json`, enabled in `.claude/settings.local.json`                            | no, active for the whole project                              |
| hooks         | `.claude/settings.local.json`, through `.agents/.state/bin/hook-claude-code.mjs` | yes, `after-edit` only fires for files in the hook's layer    |
| plugins       | `enabledPlugins` (and `extraKnownMarketplaces`) in `.claude/settings.local.json` | no                                                            |

Hook events map to `SessionStart`, `PreToolUse` (the hook's `match` is the tool matcher),
`PostToolUse` for `Write`, `Edit` and `MultiEdit` (the hook's `match` is a file glob,
relative to its layer), and `Stop`. `{file}` becomes the edited file's path, relative to
the repo root and shell-quoted.

Plugins need a `marketplace`. For a marketplace other than `claude-plugins-official`, give
it a `source`: `owner/repo` for GitHub or a git URL.

## Limits

- Claude Code reads `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md` instead of
  `AGENTS.md` when one exists in the folder or above it. agents-setup never creates them
  and warns when it finds one.
- Rules are copies, not links: Claude Code does not load linked rules that use `paths`.
  Edit the source in `.agents/rules/`; `sync` updates the copy.
- Settings in `.claude/settings.local.json` (hooks, enabled MCP servers, plugins) apply
  after you trust the folder in Claude Code.
- In a linked git worktree, Claude Code may use the local settings file of the main
  checkout. agents-setup warns; worktree support is on the [roadmap](../roadmap.md).
