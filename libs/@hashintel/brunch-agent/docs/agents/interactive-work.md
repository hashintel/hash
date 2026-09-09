# Interactive subagent and Herdr procedure

Use this procedure when preparing, placing, reusing or closing interactive subagents for Brunch. [AGENTS.md](../../AGENTS.md#development-and-evaluation-execution) owns standing execution defaults; `MISSION.md` owns the current question, scope, exceptions and concrete paid authority. This procedure coordinates execution; it creates no lane, budget or new planning surface.

## Choose work, then placement

Delegate a concrete dependency of the next product observation, not a subsystem completion campaign. Use the parent-owned subagent tools for ordinary delegated tasks. Use Herdr agent control when PTY/TUI behaviour itself matters or the user requests direct agent control; raw pane control is for shells, servers and tests. Inspect the installed tools/help rather than guessing commands or IDs.

Reuse an available session-owned pane and checkout when they still serve the same throughline. A new worktree earns its cost through concurrent write isolation or a genuinely distinct frozen review target; it is not required for every task or correction. Creating a branch/worktree still requires the applicable owner authorization. A tab is display space, not a reason for another branch or mission.

Before a launch, keep one compact working inventory: child name/task, exact base and branch, checkout, workspace/tab/pane IDs, shared-file owner, environment status and return condition. Use tool-returned opaque IDs and preserve focus.

## Readable layout

Inspect the actual target tab/pane layout before splitting, including existing occupants and rendered dimensions. Lu's current display comfortably supports **two side-by-side panes per tab**; **three is a temporary exception**, not the default. Count the parent, shells and servers as occupants too. Never add a fourth or evade the limit with rows of tiny panes.

- Preserve the parent's readable working area. Smaller windows may support only one pane.
- Reclaim a resolved session-owned pane after capturing its status/result; reuse an available shell when suitable.
- If a split would exceed the limit or make either pane uncomfortable, create a new tab in the appropriate existing workspace with focus unchanged. Place the subagent explicitly in that tab/pane; do not rely on a default split.
- Keep a third pane only for a short, simultaneous comparison or control that needs visibility. Close it when that need ends. Workers creating helpers follow the same rule; they do not recursively subdivide without inspecting layout.

## Align the checkout

Inspect Git status, branch history, all affected worktrees and any active tool operation before switching or synchronizing. For new work after integration, record and verify the exact latest accepted parent commit—not simply its branch name. A frozen review deliberately stays at its named older instrument.

If all lane changes are integrated, a fresh branch at the parent commit in the existing checkout can avoid replaying cherry-picked history. If work remains, inspect the actual delta and choose an explicit alignment preserving it. Parent metadata alone does not prove aligned content. Use the owner's stack tooling under [Git workflow](git-workflow.md); synchronization may update ancestors or push. No implicit reset, stash, rebase, branch deletion or disposal of another tenant's files.

The readiness result is a known base and accounted-for local delta, not merely a clean status. Preserve old refs unless deletion is separately authorized.

## Provision local configuration

A fresh worktree receives tracked source, **not ignored `.env.local`, installed dependencies or durable application state**. Coding-agent credentials and the Brunch application's provider credentials are separate. A running builder does not establish product authentication.

For each checkout that needs local application configuration:

1. Identify the owner-approved primary checkout and exact required local file. Use that source, not an arbitrary neighbouring worker or a search for alternate keys.
2. With that provisioning authorized, regular-copy the required `.env.local` if absent, preserving restrictive permissions. Verify equality without printing contents. Keep it ignored and out of commits, evidence packets and captured shell output. Do not overwrite an existing different file silently. A symlink requires an explicit decision because it shares mutable configuration and can break when its source checkout is removed.
3. Inspect the **actual entrypoint's loader and environment precedence**. Root `.env.local` presence is insufficient if a script does not load it, runs from a different cwd or receives an overriding process variable. Reject a resolved empty or known placeholder value such as `dummy` before any provider dispatch.
4. Prepare dependencies with repository tooling under the selected development/proof policy. Do not change the lockfile or install alternative versions merely to make setup pass.

Record paths and safe status labels, never credentials, authorization headers or whole environment dumps. Never put a secret in a command argument visible in transcripts. Required configuration absent or ambiguous blocks that provider-dependent task, not independent authorized work.

### Preflight result and optional authentication check

A configuration checker must use the same resolver/loading path as the intended application and report: configured source, local override present/absent, actual selection matching that source, non-placeholder credential, expected model, and whether authentication was tested. Safe default result: **configuration verified; credential validity untested**. Synthetic tests should cover missing local configuration, tracked dummy, overriding process dummy and valid local selection without real secrets or requests.

**No reusable checker command is introduced by this document.** Until implemented against the real loader, perform the scoped inspection and do not invent a passing preflight command or claim mere file presence meets this check.

For an optional authenticated check, follow [evaluation authentication rules](../../evaluations/README.md#authentication-is-not-inference-or-accounting). Local configuration inspection alone must continue to report validity untested.

## Dispatch and network scope

Read the current trusted builder profile rather than hard-coding a provider/thinking level into every brief. Explicitly requested overrides must be allowed by that profile. Tool availability and model credentials are launch checks, distinct from product configuration.

The brief names the current question, owned change/probe and shared seams, required actual boundary/discriminator, permitted network mode, paid prohibition or exact allocation, and return/stop condition. Include only relevant current source/evidence pointers; do not make every historical packet a cold-start requirement.

Apply [standing evaluation execution safety](../../evaluations/README.md#execution-safety) when dispatching a proof or provider-dependent task. Include the mission's concrete exceptions/allocation in its brief; do not copy an old lane's blanket network prohibition or paid permission into the next one.

## Supervise and resume

- **Subagent status owns task state.** Herdr idle/done describes terminal readiness, not accepted work. Unknown is uncertain; blocked requires inspection. Registry records can outlive panes, and answered question records can remain present.
- Answer the current correlated parent question using the exact child/question ID. Resume a settled child through the subagent message tool; do not steer active work by typing into its raw pane.
- Reconcile delayed notifications against current parent-owned state before acting. A timeout does not prove non-delivery, so inspect before resubmitting.
- A settled coding-provider overload can often be resumed with “try again” after checking for partial work and side effects. This resumes the coding task; it does not authorize replaying a product/provider request. Uncertain invocation or accounting remains a stop.
- Inspect completed output and exact commits, request discriminating corrections where needed, integrate, then re-decide the next product observation. Completion is not a successor-lane trigger or owner acceptance.

## Close and preserve

Before closing an agent pane, save canonical status, outstanding-question disposition, final result, exact refs/commits and transcript/session path outside the worktree being removed. Capture nested helpers too. Verify there is no active task or unresolved question; if interruption is intended, record it as interruption rather than completion.

Close resolved session-owned panes promptly; leave unrelated/user-owned occupants alone unless explicitly authorized. Pane/workspace closure and worktree removal are different operations. Stop owned servers and account for their cleanup as well.

Before authorized worktree removal, check tracked edits, untracked **and ignored** files, integration disposition and retained branch heads. Preserve needed raw runs, SQLite sidecars and local configuration outside the checkout with verified bytes/permissions; a clean Git status does not prove these are absent. Remove only the named worktree without force, preserve branches by default, and verify both checkout removal and ref preservation. Record where outstanding material went. Relocated stores are retained evidence, not proof of supported state restoration.

This cleanup is not evidence retirement; apply [evidence economy](../../evaluations/README.md#evidence-economy) separately. Do not archive another whole build merely to close a pane.
