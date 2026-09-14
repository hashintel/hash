# Evidence retention

Git stores reusable instruments and durable conclusions. Run output and
implementation archaeology are ephemeral by default.

| Material | Home |
| --- | --- |
| Reusable cases, oracles, supported protocols | [`evaluations/`](../../evaluations/) |
| Supported launchers | `apps/brunch-agent/src/evaluations/` |
| Local run output | `apps/brunch-agent/.data-wipe-me/evaluations/` |
| Inputs a test actually loads | Beside that test under `test/fixtures/` |
| Current authority and proof dispositions | [`MISSION.md`](../../MISSION.md) |
| Lasting architectural decisions | An [ADR](../adr/) |
| Evaluation conclusion unavailable from tests or code | One final campaign adjudication here |
| Per-implementation proof | Nowhere: the code, test, commit and PR are the record |

A tracked file under this directory must have a named consumer:

1. A test loads its exact bytes.
2. A supported, repeatable benchmark compares against it.
3. It records a still-binding decision not represented in `MISSION.md`, an ADR, or code.
4. It is a uniquely irreproducible external observation with an identified future use.
5. It is unresolved accounting whose disposition is still open.

These are not sufficient reasons: a run or review passed or failed; a subagent produced it;
it belongs to an `alpha`, `final`, `freeze`, `checkpoint` or `correction`; another historical
document links to it; it might become useful; a manifest or hash already exists.

Promotion is a deliberate review action that selects one fixture or one final adjudication.
There is no promotion framework and no archive generator. Do not add
`docs/evidence/implementations/` packets. `MISSION.md`, `SIDE_QUEST.md` and run directories are
not evidence sinks either: run narrative goes to native records, commits and the PR, under the
[run-directory rule](#run-directories). The mission retains only current dispositions and evidence pointers, not copied execution reports.

A normal evaluation can run repeatedly without changing `git status`.

## Run directories

Ignored run output, including `apps/brunch-agent/.data-wipe-me/persona-runs/<run>/`, retains native evidence rather than accumulating review packets.

- Keep **native records**: canonical history, workpiece records, snapshots, stop state, product/launcher observations and logs. They are the oracle for what the run did.
- Keep **one current handoff** (`handoff.md` or `gate-packet.md`), overwritten in place. Do not retain `review-*`, `final`, `wrap` or `linked` generations or a second handoff copy.
- Write an **observation summary** only for a concrete decision. Promote the decision to `MISSION.md`'s Owner decisions list and the resulting contract; do not keep the summary as a sibling packet. Other delegated results return in chat or the PR.
- The operator deletes superseded handoff generations when wrapping the run; they are not archived beside native records.

Evidence held only in a local ignored store is **local-only / not portable**. Name the native record and the observation it establishes. An inspected local record can verify that observation without export; missing portability is not an `ORACLE GAP`. An uninspected record or merely available test does not establish a pass.

## Retired but recoverable

The Mission 7 implementation packets were retired at `532fddb20d`, `f1f6bfe5bc` and `a4556f71ca`.
Git history holds them; nothing is restored. The few observations a later trajectory might reopen
are listed here with their re-entry trigger, each readable as
`git show b4030f1ead:libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/<path>`.

| Path | Why a later proof might open it | Re-entry trigger |
| --- | --- | --- |
| `a1-paid-2026-09-08T08-44-14-222Z/` | Only successful real-model tool-use corpus on this instrument (raw requests, responses, history) | A later paid construction run wants a comparison with what the model actually emitted |
| `a5-real-provider-20260909-r2-outcome/result.md` | The 401 stop behind the released US$7 hold in `accounting/usage-ledger.json` | A later paid run must explain itself against that stop |
| `typed-state-checkpoint/class-table.md` | The class table `MISSION.md` calls "historical class tables" | An explanation proof needs the tested-limit rows |
| `landing-20260909/{mission-health,integration,shared-aggregate-decision,lane-dispositions}.md` | The landing assessments and aggregate-refusal rationale the recut cites | A dispute about the recut or the conservative aggregate refusal |
| `attempt-ledger.md` | The metered campaign's attempt journal | Disposition of the open r2 unknown row |
