# Git workflow: one issue, one branch, one pull request

Brunch branches are managed with Graphite. The submission unit is exactly one Linear issue, one
stacked branch, and one GitHub pull request. This is an identity and visibility rule, not a ticket
decomposition method: the branch is still governed by its mission.

Work discovered while executing the mission stays on the branch when it serves the same imperative
and proof. Create another issue and branch only when the work has an independently meaningful
mission and should be reviewed or landed independently. Do not split work merely to preserve an
inherited issue graph.

## Naming and linking

For new work:

- **Branch:** `{prefix}/{issue-id}-{keywords}`, for example
  `ln/fe-1510-prove-petrinaut-flue-chat`.
- **PR title:** `{ISSUE-ID}: {Linear issue title in sentence case}`.
- **PR body:** link the Linear issue and follow [`issue-writing.md`](issue-writing.md), including
  the repository PR template and the visible-summary / `🏗️ Agent notes` split.

If an active branch predates its issue, create and link the issue before submission. Do not rename a
checked-out or stacked branch solely for cosmetic compliance when doing so would endanger in-flight
work; make the relationship explicit in the PR and follow the naming rule on subsequent branches.

## Git and Graphite boundary

Use plain `git` for local reads, staging, and commits: `status`, `diff`, `log`, `add`, and `commit`.
Use `gt` for stack-aware operations: `create`, `checkout`, `restack`, `continue`, `abort`, `submit`,
and `sync`. Raw branch creation or rebasing bypasses Graphite's parent metadata. Do not use
`gh stack` in `hashintel/hash`.

The worktree is shared infrastructure. Before switching or restacking, inspect every involved
worktree for uncommitted or in-flight work. Never stash, reset, clean, or relocate another tenant's
changes to make a stack operation proceed.

## Lifecycle

1. State the mission in `MISSION.md`. Record successor concerns in `MISSION.next.md` at
   conversational fidelity, without declaring the next mission's focus or changing execution
   authority. On acceptance, archive the closed mission under `docs/mission-archive/` and cut a
   focused `MISSION.md` from one cluster, per `AGENTS.md`.
2. After explicit approval, create its Linear issue in the `brunch-agent` project and assign the
   accountable human.
3. Create the Graphite branch from the intended parent, or explicitly link a pre-existing branch.
4. Commit the branch's work and proof without creating issues for incidental implementation steps.
5. Fill the GitHub PR template. The visible summary states what the mission establishes and does
   not establish; Agent notes carry the full execution record.
6. Submit with `gt submit` and verify that the Linear issue, branch, and PR link to one another.
7. At close, update the PR with proof results, fog-line answers, and carried flags. Update Linear
   status or comments only with explicit approval.

Trunk is `main`. A stacked child does not inherit its parent's issue: every submitted child has its
own mission, Linear issue, and PR.
