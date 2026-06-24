# AI Development Rules

This directory contains reusable AI development rules adapted from the TaskDeck workflow for this repository.

The goal is to keep AI-assisted work small, auditable, and easy to resume while the iOS app and Novu notification integration are still being shaped.

## Core Principles

- Keep work scoped to the user's request.
- Prefer repository conventions over new patterns.
- Preserve unrelated local changes.
- Verify before reporting completion.
- Commit only coherent, related changes.
- Treat issue trackers and user instructions as the source of truth for actionable work.
- Treat repository docs as durable context, not a backlog.

## Human Judgment

Use human judgment checkpoints for meaningful choices, such as:

- product or UX behavior that has multiple plausible answers;
- notification permission, privacy, or persistence decisions;
- API contract changes;
- dependency or architecture choices;
- broad refactors;
- risky migrations or irreversible changes.

Do not ask for human judgment for routine progress updates or facts that can be answered by reading code, docs, build output, or tests.

## Repository Safety

Before changing files, run or otherwise confirm:

```sh
pwd
git remote -v
git status --short --branch
git branch --show-current
```

If unrelated local changes exist, leave them alone. If they overlap with the requested work, inspect them and work with them rather than reverting them.

## Verification

Always run:

```sh
git diff --check
```

Then run the narrowest meaningful checks for the change. Once the app skeleton exists, document the standard Xcode build/test commands here or in a dedicated setup guide.

## Reporting

Final reports should include:

- what changed;
- verification commands and results;
- commit hash when a commit was made;
- skipped checks and why;
- unrelated local changes that remain.
