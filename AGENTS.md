# AGENTS.md

Guidance for Codex and other AI agents working in this repository.

This repository is for an iOS app that displays notifications from Novu. Treat this file as the top-level router for AI development rules. Durable details live under `docs/ai-development/`.

## Repository Boundary

Before editing, confirm that you are in this repository:

```sh
pwd
git remote -v
git status --short --branch
git branch --show-current
```

The expected remote is:

```text
origin  git@github.com:hayashikentaro/attn.git (fetch)
origin  git@github.com:hayashikentaro/attn.git (push)
```

Do not edit files outside this repository unless the user explicitly asks.

## Required Context

Read the relevant docs before changing the matching area:

- AI development workflow: `docs/ai-development/README.md`
- Small-cycle and commit rules: `docs/ai-development/decision-aware-cycles.md`
- Branch and worktree workflow: `docs/ai-development/branch-worktree-lifecycle.md`

Issue trackers and user instructions are the source of truth for actionable work, open/closed state, detailed acceptance criteria, and backlog. Repository docs are durable context and workflow guidance, not a parallel issue tracker.

## Change Authorization

- Only edit files directly required by the user's requested task.
- Preserve user changes already present in the working tree.
- If unexpected changes or untracked files exist, report them before modifying related files.
- Do not turn analysis, diagnosis, recommendations, or proposals into repository changes unless the user explicitly asks for edits.
- Optional cleanup, formatting sweeps, docs updates, dependency changes, and adjacent refactors require explicit user approval unless they are required to complete the task safely.

## Working Guidelines

- Keep changes scoped and reviewable.
- Prefer existing project conventions over introducing a new structure.
- Avoid broad refactors unless they are required for the task.
- Add or update tests when changing behavior once a test setup exists.
- Document important setup, API, configuration, persistence, notification semantics, or user-facing workflow changes in the repository.
- Do not silently change API names, persisted data shapes, notification routing behavior, or build setup.
- When changing public setup, API contracts, persisted data, or notification behavior, update relevant docs and types together.
- Treat secrets, local tokens, `.env` files, device logs, and generated runtime state as local-only data.

## Standard Task Workflow

For implementation work, follow this workflow unless the user says otherwise.

Before editing:

- Confirm repository, remote, branch, and working tree state.
- Preserve existing user changes.
- Identify the smallest useful change.

While editing:

- Keep changes focused on the requested task.
- Prefer small, coherent commits.
- Follow the repo's current language, framework, naming, and formatting conventions.
- If the work grows larger than expected, pause and ask for direction.

After editing:

- Run `git diff --check`.
- Run the narrowest relevant verification commands for the files changed.
- For iOS app code, prefer the repository's documented Xcode build/test command once it exists.
- If a check cannot be run, report why.

When finished:

- Report what changed, verification results, skipped checks, and remaining risks.
- If the task includes committing or a cycle rule applies, commit the relevant changes and report the commit hash.
- Push only when the user asked for push/release/PR work, or when a branch/worktree task explicitly requires a remote handoff.

## Commit Rules

- Commit only related files.
- Use short, descriptive commit messages.
- Verify before committing.
- Do not include unrelated untracked files.
- Do not continue a multi-cycle task with the previous cycle's intended changes still uncommitted.
- After committing, check `git status --short --branch`.

## Generated And Local Files

Do not hand-edit or commit generated and local runtime files. Common examples include:

```text
.taskdeck/
DerivedData/
.build/
build/
Pods/
*.xcuserstate
*.xcuserdata/
.env
.env.*
```

If generated output needs to change, update the source that generates it and verify the output locally.

## Prompt Handoff

Agents should read and follow this `AGENTS.md` before making changes.

Task-specific prompts should focus on the goal, allowed files, current context, required behavior, non-goals, acceptance/manual QA, and task-specific verification.

If a user instruction conflicts with this file, follow the user's latest explicit instruction when it is safe. If the conflict could risk data loss, security, or a broad unintended change, stop and ask.
