# Partition worktrees

When `docs/control/STEERING.md` records a **partition**, materialize one durable worktree per
**effort** that can run now. The partition is the plan; this protocol cuts the checkouts. Terms
are in `CONTEXT.md` (Partition, Effort, Join point, Driver). Branch and PR rules stay in
`git-workflow.md`; this file only says how an effort gets a reusable checkout.

Do not create worktrees unprompted during `/ds-steer`. Cut them when the user asks, after the
partition table is current.

## Names and location

Give each effort a **1–2 word** directory name (the effort, not the ticket). The driver keeps the
existing clone (`hash`). Path: a sibling of the HASH clone, `~/Code/hashintel/hash-<name>`.

Skip deferred efforts and efforts that already live on someone else's branch. Record the short
name, path, and branch on the partition in `STEERING.md` (driver-only write).

## Cut

From the **driver** worktree, at its current HEAD. Do not switch the driver's branch.

When the effort has a Linear issue, the holding branch *is* that issue's first branch:

```text
git worktree add -b {prefix}/{issue-id}-{name} ~/Code/hashintel/hash-<name> HEAD
```

When the partition says cut now and no issue exists yet, a holding branch is allowed so the
worktree can exist. It is not a PR. The first issue retargets it (`gt rename` or `gt create`
inside the worktree) when work starts:

```text
git worktree add -b {prefix}/wN-{name} ~/Code/hashintel/hash-<name> HEAD
```

`git worktree add -b` is the right tool here: `gt create` stacks on the current branch and would
make a linear stack. After the add, track each new branch as a Graphite **sibling** of the driver,
not as a child of the previously added effort:

```text
gt track {branch} -p {driver-branch} --no-interactive
```

`gt ls` should fan out from the driver (`◉─┴─┴─┘`), not a chain. Until the pending stack merges,
the driver branch is the base; after it merges, rebase each effort onto `main`.

## Reuse

The directory lasts for the effort. Later tickets on the same effort `gt create` inside that
worktree. Joined moves may land from separate worktrees; none is done until the joint proof runs
from one branch that contains them all.

Do not install dependencies until work is about to start in that checkout. Two worktrees cannot
hold the same branch.

## Refresh

If the partition adds an effort, cut it the same way from current driver HEAD. If it drops one,
leave the worktree until the user asks to remove it (`git worktree remove`). Revise the partition's
worktree table in the same driver edit.
