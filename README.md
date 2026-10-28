# agents-setup

One agent-agnostic config for every coding agent you work with.

Skills, rules, MCP servers and hooks live in a single `.agents/` folder. You ask your agent (Claude Code, Codex, OpenCode, Gemini CLI, Antigravity, Kimi, Hermes and others) to set the project up, and it builds its own native config from that folder. No parallel `.claude/`, `.codex/` and `.opencode/` trees to keep in sync by hand.

## Why

Every agent wants its own files: `CLAUDE.md`, `GEMINI.md`, `.claude/skills/`, `opencode.json`, `.mcp.json` and so on. Teams that use more than one agent copy the same rules into several places, and the copies drift apart. Here the copies are never committed: each agent generates them locally from `.agents/`, and git ignores them.

## How it works

1. `.agents/` is the single source of truth: rules, skills, MCP servers, hooks and the scopes that group them.
2. You tell your agent what you are going to work on, for example "set up this repo for the backend".
3. The agent follows [AGENTS.md](AGENTS.md): it resolves the scope, writes its native config from `.agents/`, adds the generated paths to `.gitignore` and records what it synced.
4. When `.agents/` changes in the repository, the agent notices at the start of the next session and syncs again, so agent instructions stay in step with the code.

## Quick start

Copy `AGENTS.md` and `.agents/` into your project, then ask your agent:

> Read AGENTS.md and set up this project for me. I will work on the backend.

Most agents read `AGENTS.md` on their own. For the ones that do not, point the first prompt at it.

## Layout

```
AGENTS.md            setup protocol every agent follows
.agents/
  manifest.yaml      scopes and the assets each one uses
  rules/             always-on instructions, one topic per file
  skills/            on-demand skills in the SKILL.md format
  mcp.yaml           MCP servers in a neutral format
  hooks.yaml         lifecycle hooks in a neutral format
  .state/            local sync state, ignored by git
```

## Scopes

A repository often holds more than one area of work, for example a backend and a frontend. Scopes in `.agents/manifest.yaml` say which rules, skills, MCP servers and hooks belong to each area. The `shared` scope is always applied. You pick the rest when you ask for a setup and can switch at any time.

## Staying in sync

The agent stores the git tree hash of the `.agents/` folder it synced from in `.agents/.state/<agent>.json`. When the hash in the repository differs, the setup is stale and the agent runs the sync again. Agents with hook support can run this check automatically at session start.

Changes to rules, skills, MCP servers and hooks go into `.agents/`, never into the generated files: the next sync overwrites them.

## Status

Early foundation. Next up:

- per-agent adapter notes in `.agents/adapters/`
- a session-start hook that checks the sync state
- a validator for `manifest.yaml`
