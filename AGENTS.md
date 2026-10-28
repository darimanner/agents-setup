# AGENTS.md

Agent configuration for this repository lives in `.agents/`. Every agent builds its own native config from it instead of committing a copy. Follow the setup protocol when the user asks you to set up the project, and run the sync check at the start of every session.

## Setup protocol

1. Identify yourself: which agent you are (Claude Code, Codex, OpenCode, Gemini CLI, Antigravity, Kimi CLI, Hermes or another one).
2. Resolve the scopes. Read `.agents/manifest.yaml` and use the scopes the user named. If they named none and the manifest defines more than `shared`, ask. `shared` is always included.
3. Collect the assets the selected scopes list:
   - rules: `.agents/rules/<name>.md`
   - skills: `.agents/skills/<name>/`
   - MCP servers: entries of `.agents/mcp.yaml`
   - hooks: entries of `.agents/hooks.yaml`
4. Write them to your native locations:
   - rules go to your project instructions file or rules directory
   - skills go to your skills directory; prefer symlinks to `.agents/skills/<name>/` so updates arrive with `git pull`
   - MCP servers and hooks are translated into your config format

   Use the locations your own documentation defines. If you are not sure where something belongs, ask the user instead of guessing. If your only instructions file is `AGENTS.md` itself, do not edit it: read the rules of the recorded scopes from `.agents/rules/` at session start instead.
5. Add every file and directory you generated to `.gitignore`.
6. Record the sync in `.agents/.state/<agent>.json`:

   ```json
   {
     "agent": "claude-code",
     "scopes": ["shared", "backend"],
     "source": "<output of git rev-parse HEAD:.agents>",
     "files": ["CLAUDE.md", ".claude/skills/", ".mcp.json"]
   }
   ```

7. Tell the user what you generated and how to switch scopes.

## Sync check

At session start, compare `git rev-parse HEAD:.agents` with `source` in your state file. If they differ, or `git status --porcelain .agents` reports local changes, run the setup again with the recorded scopes and delete the generated files the new setup no longer produces.

## Editing agent config

- Change rules, skills, MCP servers and hooks in `.agents/` only. Generated files are overwritten by the next sync.
- One topic per rule file.
- A skill is a folder with a `SKILL.md` whose frontmatter has `name` and `description`.
- When you add an asset, list it under every scope that needs it in `manifest.yaml`.
- Keep this file agent-neutral: no instructions that only one agent understands.

## Conventions

- Everything in the repository is written in English.
- Commit messages use the imperative mood, with a subject line under 72 characters.
