# Scopes

> Planned behavior. The CLI is in development.

A repo often has parts that need different settings: a backend and a frontend, or several
frontend apps. Scopes let each part carry its own rules, skills, MCP servers, hooks and
plugins.

## Layers and scopes

- A **layer** is a directory that contains `.agents/`. The repo root is always a layer.
- A **scope** is a layer's path relative to the root, for example `frontend` or
  `frontend/web`.

## What a scope selects

Selecting a scope installs:

- the root layer,
- every layer above the scope,
- the scope's own layer,
- every layer nested under it.

So selecting `frontend` also brings `frontend/web` and `frontend/admin`. Use
`--scope all` for everything. With no scope, only the root layer is installed.

## Where the settings apply

The assets of a layer apply to work inside that layer's directory:

- Rules from layers higher up come before rules from nested layers.
- Each adapter uses the agent's own per-folder mechanism where one exists, for example
  path-scoped rules and skills in Claude Code.
- Where the agent has no such mechanism (for example MCP servers in Claude Code), the
  asset is installed for the whole project, and the CLI tells you.
- `AGENTS.md` files stay where you put them; agents that read nested `AGENTS.md` files pick
  them up as they work in those directories.

Example: you open Claude Code at the repo root and ask for a change in `frontend/web/`.
Root and frontend rules and skills load through path scoping, frontend's MCP servers are
already active for the project, and `frontend/web/AGENTS.md` is read when the agent works
there.

## Names

Skill and MCP server names must be unique across the selected layers, unless two layers
define exactly the same thing. `agents-setup validate` reports conflicts.

## Switching scopes

Run `install` again with other scopes. Items from layers you no longer use are removed.
