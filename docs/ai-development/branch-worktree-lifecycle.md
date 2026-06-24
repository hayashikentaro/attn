# Branch Worktree Lifecycle

Use `git worktree` for parallel branch work when multiple branches or agents need to operate at the same time.

Do not create disposable full clones for routine branch work. Use one worktree per branch and purpose.

## Source Of Truth

- Remote GitHub branches are the durable source of truth for branch handoffs.
- A branch task that will be handed to another session is not complete until intended changes are committed and pushed to `origin`.
- Completion reports should include branch name, latest commit SHA, pushed remote branch, verification results, changed files, and unrelated local changes.

## Start From An Existing Remote Branch

```sh
BRANCH=feature/example
NAME=example

cd <main-repository>
git fetch origin
git worktree add ../attn-worktrees/"$NAME" "origin/$BRANCH"
cd ../attn-worktrees/"$NAME"
git switch "$BRANCH"
```

## Start A New Branch

```sh
BRANCH=feature/example
NAME=example

cd <main-repository>
git fetch origin
git switch main
git pull --ff-only origin main
git worktree add -b "$BRANCH" ../attn-worktrees/"$NAME" main
cd ../attn-worktrees/"$NAME"
git push -u origin "$BRANCH"
```

## Work Rules

- Keep one worktree, one branch, and one purpose.
- Continue on the current branch or worktree unless explicitly instructed otherwise.
- Before editing, confirm repository, remote, branch, and working tree state.
- Preserve unrelated local changes.
- Push intended changes before asking another session to continue the branch.

## Handoff Check

```sh
pwd
git remote -v
git status --short --branch
git branch --show-current
git log --oneline -5
git rev-parse --abbrev-ref --symbolic-full-name @{u}
git rev-list --left-right --count @{u}...HEAD
```

Expected handoff report:

```text
branch: feature/example
remote: origin/feature/example
latest commit: <sha> <message>
verification: <commands and results>
changed files: <files changed>
unrelated local changes: <none or list>
```

## Cleanup After Merge

Before removing a branch worktree:

```sh
cd <branch-worktree>

git status --short --branch
git fetch origin
git log --oneline --decorate -5
git rev-list --left-right --count @{u}...HEAD
```

Remove the worktree only when intended changes are committed and pushed, merge status is known, and working tree state has been reviewed.
