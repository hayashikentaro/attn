# Decision-Aware Cycles

Use this workflow when a task is exploratory, iterative, or expected to continue across multiple small improvements.

## Cycle Contract

Treat each completed cycle as one decision unit and one commit unit.

1. Confirm the mission and current repository state.
2. Select exactly one next small task.
3. Ask for human judgment when the task involves product direction, UX judgment, risk, or multiple plausible paths.
4. Implement only the selected small task.
5. Verify the change.
6. Commit the cycle change when it is complete.
7. Report the commit hash and verification result.
8. Confirm the working tree state.
9. Start the next cycle only after the previous cycle is committed or explicitly abandoned.

## Scope Rules

- Keep each cycle small.
- As a rule, limit one cycle to about one or two files of change unless the user explicitly approves a larger slice.
- If the work grows larger than expected, stop before implementing the larger change and ask for direction.
- Do not finish only because one small task is complete when the stated mission clearly requires more cycles.
- Do not begin the next cycle with the previous cycle's intended changes still uncommitted.

## Commit Rules

- Verify before committing.
- Commit after every completed cycle.
- Use a short commit message that describes the cycle content.
- Include only related files.
- Leave unrelated existing untracked files alone.
- After committing, run `git status --short --branch`.

## Exit Conditions

End or pause the cycle when any of these is true:

- the mission is complete;
- there is no clear next small task that advances the mission;
- a major product or specification judgment is needed;
- the required change has grown larger than expected;
- verification fails and cannot be resolved quickly;
- repository state is unclear;
- the user explicitly asks to stop.

When exiting, report completed cycles, commit hashes, verification results, unfinished work, where to resume, and final working tree state.
