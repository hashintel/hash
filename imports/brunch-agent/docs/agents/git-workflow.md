# Git workflow: Graphite stacks

Branches are managed with **Graphite** (`gt`), adapted from the brunch repo's
`docs/praxis/graphite-workflow.md`. The unit of branching is the **Linear issue**: one stacked
branch per issue tackled, created when work on that issue starts. Work discovered while
resolving the issue (slices, refinements, side-fixes it requires) stays on its branch; only a
different issue gets a new branch. Branches predating this convention (and the trunk) may mix
multiple issues.

## git vs gt boundary

Use **git** for local operations that don't touch the stack: `status` / `diff` / `log`,
`add` / `commit`, `stash`. Use **gt** for stack-aware operations: `gt create`, `gt submit`,
`gt restack`, `gt checkout` / `gt top` / `gt bottom`, `gt track --parent <branch>` (adopt a raw
git branch into the stack). Raw `git checkout -b` or `git rebase` bypasses Graphite's parentage
metadata and can corrupt the stack; commits and reads are safe as plain git.

## Naming

- **Branch**: `{prefix}/{issue-id}-{keywords}` — `{prefix}` from `gt user branch-prefix`
  (e.g. `ln/fe-1362-demo-vehicle`).
- **PR title**: `{ISSUE-ID}: {Linear issue title in sentence case}`
  (e.g. `FE-1362: Decide the September demo vehicle`).
- PR descriptions are written when tying off a branch, not during active development.

## Lifecycle

```
gt create {prefix}/fe-XXXX-keywords   # new stacked branch when starting a Linear issue
# ... work ...
git add <files> && git commit         # plain git for commits
gt submit                             # push + create/update the PR when ready
```

Trunk is `main`. Link the PR from the Linear issue (or let Linear's GitHub integration attach
it) so the issue records where its work landed.
