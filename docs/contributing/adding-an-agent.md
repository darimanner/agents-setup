# Adding an agent

An adapter maps the neutral layers to one agent's native config. Adding one is a single
pull request.

## 1. Research and record

Read the agent's official docs for each asset type and write down where it lives in
project and local scope, and in which format:

- instructions (`AGENTS.md` support, nested files, precedence over other files)
- rules, and whether they can be limited to a folder
- skills, and whether they can be limited to a folder
- MCP servers
- hooks: events, matchers, how a command receives the file path
- plugins or extensions: how they are referenced and installed

Put the confirmed matrix and the limits in `docs/agents/<agent>.md`, with links to the
docs you used, and update the table in [docs/agents/README.md](../agents/README.md).

If something exists only in a global (user-level) config, say so: global writes need
explicit consent and an issue to agree on the approach first.

## 2. Implement

- The adapter is a planner: given the selected layers it returns the operations to
  perform (write file, link, merge keys) and warnings for assets it cannot map. It never
  touches the filesystem itself.
- Use the agent's per-folder mechanism where one exists; otherwise fall back to the whole
  project and add a warning.
- Fingerprinted items (hooks, MCP servers, plugins) go through approval like in every
  other adapter.

## 3. Test

- Plan tests against the fixtures in `test/fixtures/`: the expected operations for a root
  layer, a nested layer and a scope selection.
- An install test in a temp directory that applies the plan and then uninstalls it,
  leaving the directory as it was.

## Porting code from other projects

[rulesync](https://github.com/dyoshikawa/rulesync) and
[Ruler](https://github.com/intellectronica/ruler) are MIT licensed and cover many agents.
Reading them for paths and formats is encouraged. If you copy or closely port code, keep
their copyright and license notice in a header comment of the file and mention it in the
pull request.
