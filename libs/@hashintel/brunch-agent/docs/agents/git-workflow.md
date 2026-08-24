# Git workflow: Graphite stacks

Branches are managed with **Graphite** (`gt`), matching HASH's repository-wide use of Graphite
(its CI runs the Graphite optimizer). The standalone repository's late `gh stack` convention does
not carry over. The unit of branching is the **Linear issue**: one stacked branch per issue tackled,
created when work on that issue starts. Work discovered while
resolving the issue (slices, refinements, side-fixes it requires) stays on its branch; only a
different issue gets a new branch. Branches predating this convention (and the trunk) may mix
multiple issues.

## git vs gt boundary

Use **git** for local operations that don't touch the stack: `status` / `diff` / `log`,
`add` / `commit`, `stash`. Use **`gt`** for stack-aware operations: `gt create`, `gt submit`,
`gt restack`, `gt sync`, and `gt checkout`. Raw branch creation or rebasing bypasses Graphite's
stack parentage metadata; commits and reads are safe as plain git (run `gt restack` afterwards
if upstack branches exist). Do not use `gh stack` in `hashintel/hash`.

## Shared-worktree safety

A branch switch changes the checkout under every process using that worktree. Before `gt create`
or `gt checkout`, record the current branch and inspect the worktree for unexpected changes or
in-flight agents. If another agent may be active, use a separate worktree instead of switching the
shared one; never stash, reset, clean, or otherwise claim work you did not create. Restore the
branch you found after the stack operation unless the user asks to leave the worktree elsewhere.

## Naming

- **Branch**: `{prefix}/{issue-id}-{keywords}` (e.g. `ln/fe-1362-demo-vehicle`).
- **PR title**: `{ISSUE-ID}: {Linear issue title in sentence case}`
  (e.g. `FE-1362: Decide the September demo vehicle`).
- PR descriptions are written when tying off a branch, not during active development. They fill
  the repository template (`.github/pull_request_template.md`) with the visible-summary /
  `🏗️ Agent notes` split applied inside its sections, per `issue-writing.md`.

## Deposit rule

Work deposits its own description at authoring time, whatever tool authored it: a commit
carries a body that explains outcome and mechanism (the FE-1400 sweep's messages are the
register), and a branch is not tied off until its PR body says what it establishes. A
semantically heavy branch with an empty message is a defect, not a style choice — prose
backfill is remediation, not workflow (see `legibility.md`).

## Lifecycle

```text
gt create {prefix}/fe-XXXX-keywords    # new branch stacked on the current one
# ... work ...
git add <files> && git commit          # plain git for commits
gt submit                              # push + create/update the PR when ready
gt sync                                # after merges: pull trunk, restack, prune
```

Trunk is `main`. Link the PR from the Linear issue (or let Linear's GitHub integration attach
it) so the issue records where its work landed.
