# Partition worktrees

When `docs/control/STEERING.md` records a **partition**, materialize one durable worktree per
**effort** that can run now. Moves (proof) and streams (strategy) do not map one-to-one onto
efforts (checkouts). Terms are in `CONTEXT.md`. This layout is Brunch-local, not Dogsled
vocabulary. Branch and PR rules stay in `git-workflow.md`.

Do not create worktrees unprompted during `/ds-steer`. Cut them when the user asks, after the
partition table is current. Deferred work is not an effort; neither is someone else's branch
(name it on a join point instead).

## Names and location

Give each effort a **1–2 word** directory name (the effort, not the ticket). Record that name on
the partition. Live path and branch come from `git worktree list` and `gt ls` — do not copy them
into `STEERING.md`. The driver keeps the existing clone (`hash`). Path: a sibling of the HASH
clone, `~/Code/hashintel/hash-<name>`.

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

## Re-braid

Cutting siblings from a common HEAD is the start, not a license to stack further on each line.
**Re-braid** when the partition's re-braid table names it: restack onto the declared shared line,
resolve conflicts, then diverge again. Ticket count is not the measure — a fine-grained chain on
one effort can stay on that line; a coarse ticket that already moved a join point may need a
braid before the next. Do not stop work to wait for a braid that is not due.

Three relationships stay distinct: the proof join (moves demonstrated together), the join point
(shared file, landing order), and the re-braid (git-line meeting).

## Local services

Several worktrees must not each spawn the Brunch server and the Petrinaut panel. The candidate
for a one-shot, idempotent bring-up is [Pitchfork](https://pitchfork.jdx.dev/) (`pitchfork.toml`,
`pitchfork start`; start only if not already running). HASH already uses mise, which is how
Pitchfork is installed. It is not adopted yet: G0.1 still needs a documented command; investigate
Pitchfork there rather than adding a compose entry for local daemons. Agents still do not leave a
foreground `yarn dev` running; `pitchfork start` is a one-shot to try, not a substitute for the
user's already-running services.

## Reuse

The directory lasts for the effort. Later tickets on the same effort `gt create` inside that
worktree. Braid first when the partition says to, not because another ticket is starting. Joined
moves may land from separate worktrees; none is done until the joint proof runs from one branch
that contains them all.

Do not install dependencies until work is about to start in that checkout. Two worktrees cannot
hold the same branch.

## Refresh

If the partition adds an effort, cut it the same way from current driver HEAD. If it drops one,
leave the worktree until the user asks to remove it (`git worktree remove`). Revise the partition
and re-braid tables in the same driver edit; do not refresh copied paths or branch names.
