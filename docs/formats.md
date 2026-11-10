# Formats

> Planned format, version 1. The CLI that reads it is in development.

## Layout

```
AGENTS.md                      root instructions, read natively by most agents
.agents/
  manifest.yaml                root only: format version, applied templates
  rules/<name>.md              always-on instructions, one topic per file
  skills/<name>/SKILL.md       Agent Skills format, passthrough
  mcp.yaml                     MCP servers
  hooks.yaml                   lifecycle hooks
  plugins.yaml                 plugin references, per agent
frontend/
  AGENTS.md
  .agents/                     same shape, minus manifest; optional `layer.yaml`
    layer.yaml                 optional: description shown in the scope picker
    rules/  skills/  mcp.yaml  hooks.yaml  plugins.yaml
  web/
    AGENTS.md
    .agents/...
```

Every part of a layer is optional. Add `.agents/.state/` to your `.gitignore`: it holds
local state for each developer.

The layout follows existing conventions on purpose. Several agents already read
`AGENTS.md` and `.agents/skills/` directly, so for them there is nothing to generate.

## AGENTS.md

Plain Markdown, committed, one per layer that needs instructions. agents-setup does not
generate or rewrite it, with one exception: for agents that have no place for extra rules,
a short block with fixed markers may be added that points to the layer's `.agents/rules/`.

## Rules

`.agents/rules/<name>.md`, Markdown, one topic per file. Optional frontmatter:

```text
---
description: Testing conventions
paths: ["src/**/*.test.ts"]
---

- Use Vitest...
```

`paths` are globs relative to the layer directory and narrow where the rule applies inside
the layer.

## Skills

`.agents/skills/<name>/SKILL.md` in the [Agent Skills](https://agentskills.io) format, with
`name` and `description` in the frontmatter. Skills are linked or copied as they are.

## MCP servers

`.agents/mcp.yaml`:

```yaml
servers:
  context7:
    transport: http # http | stdio
    url: https://mcp.context7.com/mcp
    headers: { Authorization: "Bearer ${CONTEXT7_TOKEN}" }
  postgres:
    transport: stdio
    command: uvx
    args: [postgres-mcp, --access-mode=restricted]
    env: { DATABASE_URL: "${DATABASE_URL}" }
```

Secrets are only allowed as `${VAR}` references, resolved from each developer's
environment. `validate` rejects values that look like literal credentials.

## Hooks

`.agents/hooks.yaml`:

```yaml
hooks:
  format-python:
    event: after-edit # session-start | before-tool | after-edit | stop
    match: "**/*.py" # file glob for edit events, tool name for before-tool
    command: uv run ruff format {file}
```

Each adapter maps the events to the agent's own names. An event the agent does not support
is skipped with a warning; it is never approximated silently.

## Plugins

`.agents/plugins.yaml` references plugins per agent. The plugin code is never stored in
the repo: the agent installs and updates it by its own rules, including a disabled
auto-update.

```yaml
plugins:
  claude-code:
    - name: superpowers
      marketplace: claude-plugins-official
  opencode:
    - name: opencode-wakatime # npm package
```

## Manifest

`.agents/manifest.yaml`, root layer only:

```yaml
version: 1
```

Applying a template adds a `templates:` entry recording its source, version and files.
