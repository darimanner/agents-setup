# OpenCode

Verified on November 10, 2026 against the official OpenCode docs
([config](https://opencode.ai/docs/config), [rules](https://opencode.ai/docs/rules),
[skills](https://opencode.ai/docs/skills), [MCP servers](https://opencode.ai/docs/mcp-servers),
[plugins](https://opencode.ai/docs/plugins)) and checked live with OpenCode 1.18. The config
uses the version 1 shapes, which OpenCode 2 also reads.

## What gets installed

Everything goes into one file, `.opencode/opencode.jsonc`. OpenCode loads it after a
root `opencode.json` and lets it override that file, so a committed `opencode.json` stays
untouched.

| Layer content | Where it goes                                        | Per folder                                                 |
| ------------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| `AGENTS.md`   | nothing to do: read natively                         | yes, loaded when OpenCode reads files in that folder       |
| rules         | `instructions`: the rule files themselves, no copies | no: rules of the selected scopes are always loaded         |
| skills        | nothing to do: OpenCode reads `.agents/skills/`      | only from the folder OpenCode starts in and the ones above |
| MCP servers   | `mcp`, with `${VAR}` turned into `{env:VAR}`         | no, active for the whole project                           |
| hooks         | not supported yet                                    |                                                            |
| plugins       | `plugin`: npm packages, pinned when `version` is set | no                                                         |

Plugins for OpenCode are listed under `opencode:` in `plugins.yaml`; `name` is the npm
package.

## Limits

- A rule's `paths` is not applied: OpenCode has no per-file instructions, so every rule of
  the selected scopes is always loaded, frontmatter included.
- Skills of a nested layer, such as `frontend/.agents/skills`, load only when OpenCode
  starts in `frontend/` or below. The CLI warns about them.
- Hooks are skipped with a warning. OpenCode runs hooks through plugins, and the plugin API
  of OpenCode 1 and 2 differs; support is on the [roadmap](../roadmap.md).
- If you keep your own untracked `.opencode/opencode.jsonc`, agents-setup adds its keys to
  it, but only while it is plain JSON: a file with comments is left untouched, and so is
  a file tracked by git.
