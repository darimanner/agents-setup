# Security

> Planned behavior. The CLI is in development.

A repo you clone can contain commands that would run on your machine: hooks, MCP servers
started as local processes, plugins with their own code. agents-setup never installs those
without your approval, including when it syncs automatically after `git pull`.

## What needs approval

Each of these is fingerprinted. A new or changed fingerprint waits for approval:

- hook commands;
- stdio MCP servers: command, arguments and environment variable names;
- http MCP servers: the URL and header names, because the URL receives your tokens;
- plugin references: agent, name and marketplace or package source.

Everything else (rules, skills, `AGENTS.md`) is installed without asking.

## How to approve

- In your terminal: `install` asks interactively, and `npx agents-setup approve` reviews
  pending items.
- `--yes` approves everything in the plan. Use it when you trust the repo.
- In agent mode, the agent runs without `--yes` by default, installs the rest and shows you
  what is waiting. It uses `--yes` only when you tell it to in the conversation.
- Safety review: ask your agent to check that the plan is safe before approving. It reads
  every pending item, the scripts they call, the MCP URLs and packages and the plugin
  sources, and reports anything suspicious instead of approving.
  `npx agents-setup approve --list --json` gives it the full list, with what changed since
  your last approval.

Auto-sync at session start runs the same `sync` without `--yes`: rules, skills and items
you approved before follow the repo, and anything new or changed waits for you. The
session-start hook it adds runs agents-setup itself, not code from the repo. Turn it off
with `install --no-auto-sync`.

Only your own messages can make an agent use `--yes`. Instructions inside repo files
(`AGENTS.md`, rules, skills, templates) never count. A model can still be manipulated, so
for repos you do not trust, approve in your own terminal.

## What agents-setup writes

- Only into each agent's project or local scope. Generated files are excluded through
  `.git/info/exclude`, so your install never changes files your teammates see.
- It never overwrites a file it did not create. In shared config files it merges only the
  keys it owns and leaves the rest as it was. `uninstall` removes exactly what it wrote.
- If a target file is tracked by git, it is left alone.
- Hermes Agent keeps MCP servers and hooks only in its global config. agents-setup skips
  them unless you allow global writes for the project (`--allow-global`, or yes when
  `install` asks). It then changes only its own entries, marks each with the project path,
  keeps the rest of the file byte for byte, backs the file up first, and removes the entries
  on `uninstall`. Approval still applies to each of them.
