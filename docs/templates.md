# Templates

> Planned behavior. The CLI is in development.

A template is a reusable bundle of layers: the rules, skills, MCP servers, hooks and plugin
references you want in every project of a kind. You can build your own, share them as git
repos, and apply them to new or existing projects.

## What a template is

A directory with the same layout as a project (layers, optionally `AGENTS.md` skeletons)
plus a `template.yaml`:

```yaml
name: python-backend
description: Ruff and pytest hooks, Postgres MCP, review skills
version: 0.1.0
```

Sources can be a local path, `gh:owner/repo[/subdir][@ref]`, or any git URL. Fetching uses
your system `git`.

## Commands

```bash
# new project from a template
npx agents-setup init --template gh:you/python-backend

# add a template's items to one layer of an existing project
npx agents-setup add gh:you/python-backend --into backend

# turn layers of the current project into a template
npx agents-setup template create ../python-backend --layer backend
```

- `init` copies the template. Writing the `AGENTS.md` content is left to your agent.
- `add` reports name conflicts instead of overwriting anything.
- Applied templates are recorded in `.agents/manifest.yaml`.

## Later

`template update`, to pull a newer version of an applied template into a project, is
planned after v1. The manifest already records what it will need.
