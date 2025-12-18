# Recommended Rules: Cursor / Claude Code / Antigravity (Local IDE)

Paste these into your agent instructions (or keep as a checklist).

## Branching & safety
- Always work on a feature branch: `agent/<topic>` (never directly on `main`).
- Never use `git push --force`.
- Never commit `.env` or any secrets.

## Terminal approvals
- Auto-run only **read-only** commands and **project-level** commands (npm/pnpm/yarn, tests, lint).
- Ask once before destructive actions (delete files, reset, rebase, system installs).

## Commit style
- Small commits, clear messages:
  - `chore: add gitignore`
  - `docs: add setup instructions`
  - `feat: add contacts list screen`
  - `fix: correct RTL layout`

## Reporting
- After each batch: summarize changes + what to test locally.

## For this repo (CRM-lite)
- Prefer mobile-first UI, Hebrew RTL.
- Keep config minimal and documented in README.
