# Git workflow: one issue, one branch, one pull request

Brunch branches are plain Git branches with GitHub pull requests, per the repository's
`managing-git-workflow` skill; a branch that depends on another unmerged branch retains explicit parent/child ordering using the owner's selected stack tooling. The submission unit is exactly one Linear issue, one branch, and one GitHub pull
request. This is an identity and visibility rule, not a ticket decomposition method: the branch is
still governed by its mission.

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

## Stack-tool boundary

Preserve the inspected parent/child ordering when aligning stacked branches. Use the owner's selected tooling and its installed help; this shared procedure does not prescribe a stack manager. Inspect synchronization side effects before invocation: commands may fetch, update ancestors, stash or push. Permission to align a branch is not permission for those additional effects or for an automatic history rewrite. A tool's lineage metadata is not proof that branch content is aligned.

The worktree is shared infrastructure. Before switching branches or rebasing a stack, inspect every
involved worktree for uncommitted or in-flight work. Never stash, reset, clean, or relocate another
tenant's changes to make a stack operation proceed.

## Lifecycle

1. State the mission in `MISSION.md`. While planning context is active, capture successor concerns
   in `MISSION.next.md` at conversational fidelity without changing execution authority. That draft
   is the self-contained canonical source for future cuts; do not substitute an external transcript.
   On acceptance, archive the closed mission, cut a focused `MISSION.md` from the next numbered
   cluster, and compare the draft before and after so uncopied material stays at the same fidelity,
   per `AGENTS.md`.
2. After explicit approval, create its Linear issue in the `brunch-agent` project and assign the
   accountable human.
3. Create the branch from the inspected `main` or parent commit, or explicitly link a pre-existing branch using the owner's chosen tooling. Verify actual ancestry and content; do not change parent relationships implicitly.
4. Commit the branch's work and proof without creating issues for incidental implementation steps.
5. Fill the GitHub PR template. The visible summary states what the mission establishes and does
   not establish; Agent notes carry the full execution record.
6. When submission is authorized, push the branch and open the pull request with `gh pr create --draft`; verify the base branch and that the Linear issue, branch and PR link to one another.
7. At close, update the PR with proof results, fog-line answers, and carried flags. Update Linear
   status or comments only with explicit approval.

Trunk is `main`. A stacked child does not inherit its parent's issue: every submitted child has its
own mission, Linear issue, and PR.
