# Prospective runbook candidate v2

Status: **aborted after two immutable invalid members**

Protocol id: `prospective-runbook-v2`  
Observed-output namespace: `vestera-prospective-candidate-v2`

This protocol drives the built production `ChatAgent` against the same Vestera case and frozen ruler as the immutable Mission 3 control. It creates three independent candidate members for comparison with that control. It does not alter, replace, or add members to `vestera-prospective-baseline-v1`, and it does not authorize paid calls or grading.

Execution stopped after replication 1 inherited a stale credential and replication 2 encountered a simulated-expert refusal before workpiece delivery. The owner subsequently narrowed the Mission 4 question to workpiece-quality scoring against the latest valid flat-prompt controls. Preserve the v2 artifacts as operational evidence; do not run replication 3 or use v2 as the quality campaign. The replacement is [`prospective-runbook-v3`](../prospective-runbook-v3/protocol.md).

## Frozen campaign configuration

| Setting | Value |
| --- | --- |
| Case | `vestera-scheduling` |
| Opening message | `../../cases/vestera-scheduling/opening-message.md` |
| Expert pack | `../../cases/vestera-scheduling/situation-pack.md` |
| Prospective ledger | `../../oracles/vestera-scheduling/truth-ledger-v1-prospective.yaml` |
| Quality ruler | `../../oracles/ir-quality-ruler-v1.md` |
| Interviewer | built production `ChatAgent`, requested model `claude-sonnet-4-5` |
| Simulated expert | requested model `claude-sonnet-4-5` |
| Interview turns | 8 before the final workpiece request |
| Per-logical-turn latency stop | 180,000 ms |
| Replications | 3 independent conversations, numbered 1–3 |
| Sampling | provider default; no seed |
| Omniscient grader | frozen `../ir-quality-ruler-v1/omniscient-grader.md`, fresh context per run |
| Cold reviewer | frozen `../ir-quality-ruler-v1/cold-ir-reviewer.md`, separate fresh context per run |
| Observed output | `../../../docs/evidence/evaluations/vestera-prospective-candidate-v2/` |

Changing any frozen value requires a new protocol and output namespace. The 180-second stop is retained from v1 because no accepted evidence requires changing it.

## Instrument freeze and paid-run preconditions

The runner records SHA-256 hashes for the exact promoted core prompt and universal resource; the plugin append, Flue mount, assembled skill definition, and every assembled skill resource; the application and campaign runner paths; the Vestera inputs and prospective ledger; the frozen ruler and grader prompts; this protocol; and the root `yarn.lock`. It also records the source commit and a deterministically path-sorted manifest containing the path and SHA-256 hash of every built server `apps/brunch-agent/dist/*.mjs` artifact. The campaign fingerprint covers the complete source/lock hash map, complete built-artifact manifest, requested models, and stop configuration.

Before any paid invocation, the owner must separately approve the paid-call and cost ceiling and confirm:

1. Every scoped instrument file is committed and clean.
2. The app was built from that clean scope.
3. `ANTHROPIC_API_KEY` is set and no hermetic model module or dirty-instrument override is set.
4. The output directory resolves, after lexical normalization and symlink resolution, to exactly `vestera-prospective-candidate-v2`.
5. Models, turn stop, and latency stop exactly match the table above.
6. The requested replication number is 1, 2, or 3 and has no prior artifact.

Both the relocated v1 runner and this runner canonicalize output paths through the nearest existing real path. They categorically reject the immutable `vestera-prospective-baseline-v1` directory and every descendant, including `/.`, symlink, nonexistent-descendant, and hermetic-override aliases. The relocated v1 runner can no longer add a baseline member under any configuration.

The first observed candidate member fixes the campaign fingerprint. Later members must match its exact source/lock hashes, complete built artifact manifest, requested models, and stop configuration. A runtime or integrity failure still consumes its replication: retain it as an invalid member rather than replacing it.

## Paid commands

Do not run these commands until the owner authorizes the paid budget. Once authorized, run them sequentially from the repository root:

```sh
BRUNCH_RUNBOOK_REPLICATION=1 yarn workspace @apps/brunch-agent runbook:elicit:candidate-v2
BRUNCH_RUNBOOK_REPLICATION=2 yarn workspace @apps/brunch-agent runbook:elicit:candidate-v2
BRUNCH_RUNBOOK_REPLICATION=3 yarn workspace @apps/brunch-agent runbook:elicit:candidate-v2
```

The package script builds the application before each invocation. Each command uses a fresh Flue conversation identity and temporary database and writes a unique immutable artifact stem.

## Stop, validity, and evidence semantics

- The opening dispatch counts as interview turn 1.
- The runner alternates the production interviewer and simulated expert until eight interviewer turns have settled, unless a logical interviewer turn exceeds 180 seconds or yields no visible text.
- It then sends a labelled evaluation stop instruction that is not expert evidence. The instruction requests only the current `runbook-ir` workpiece and forbids another question, construction, and construction-resource reads.
- A member is `completed` only when it contains a recoverable workpiece and the ordinary path has no declared violation.
- Reading `pn-construction.md` or `checks.md`, using a construction or capture tool, using any other tool outside `activate_skill` and `read_skill_resource`, reading any resource outside the three declared elicitation/workpiece resources, or omitting the workpiece makes the member `invalid`. The artifact is retained and the runner exits nonzero.
- A simulated-expert, interviewer, application, artifact-write, or other runtime failure writes an `invalid` record with `invalidReason: runtime-failure` and exits nonzero.
- A cleanup error writes a separate `invalid` record with `invalidReason: cleanup-failure`, is printed to stderr, and forces a nonzero exit. Its presence invalidates the member even if a completed record was written first.
- The runner does not interpret model self-report as completion.

## Artifacts and immutability

The candidate namespace is:

```text
docs/evidence/evaluations/vestera-prospective-candidate-v2/
```

A completed or ordinary-path-invalid run writes:

- `<run-id>.json` — the raw run record, exact raw Flue `history()` snapshot, snapshot hash, readable transcript, expert exchange, call metadata, usage, resource/tool traces, violations, configuration, and exact instrument manifest;
- `<run-id>.md` — readable transcript and run metadata;
- `<run-id>.ir.md` — recovered workpiece, when one was emitted.

The JSON record binds the selected workpiece to its SHA-256 hash, source Flue message id, and source-message SHA-256 hash. It retains the exact raw snapshot object and the SHA-256 hash of its compact JSON serialization; the readable transcript is a projection, not the source record.

Every expert call records the requested model, provider-reported response model when present, an explicit `unavailable` source when absent, and the provider stop reason when present. Every interviewer call records requested model, provider id/name/API metadata, provider-reported response model when present, and normalized/provider stop reasons. Requested identity is never reported as observed identity without provider evidence.

A runtime failure writes `<run-id>.failure-<nonce>.json`; cleanup failures write `<run-id>.cleanup-failure-<nonce>.json`. Failure records use paths distinct from `<run-id>.json`, so a prior successful write or collision cannot mask the originating error through a second `wx` attempt. Retention failures are reported alongside the original failure. All observed-member writes use create-new semantics. Never edit, overwrite, delete, or replace an observed member.

## Hermetic verification

Hermetic execution requires both model overrides, admits only the canonical real paths of the checked-in `runbook-elicitation-faux-expert.ts` and `runbook-elicitation-faux-provider.ts` fixtures, rejects any `ANTHROPIC_API_KEY`, rejects the candidate and immutable-control namespaces, and permits the dirty-instrument escape hatch only for this free path. Arbitrary executable override modules are not accepted.

Focused tests prove exact, `/.`, descendant, and symlink immutability guards; approved-module and API-key gates; full built-server and root-lock fingerprinting; stable manifests and fingerprints across two identical hermetic runs; raw-snapshot and workpiece/source-message hashing; requested-versus-observed model metadata; adversarial construction-resource, unexpected-tool, capture/construction classification, and missing-workpiece invalidation; distinct artifact-write failure retention; and visible retained cleanup failures. No paid or network model call occurs.

## Grading after campaign execution

Do not add graders or grade anything while preparing this protocol. After all three paid members exist, grade each valid workpiece exactly as v1:

1. Give a fresh omniscient context exactly the frozen omniscient prompt, situation pack, prospective ledger, exact source conversation, and recovered workpiece.
2. Give a separate fresh cold context exactly the frozen cold-review prompt, opening message, and recovered workpiece.
3. Record exact requested and observed grader provider/model identity and retain both reports beside the run.
4. Human-review hard failures, genuine disagreement, and every `NEW-*` mistake.
5. Adjudicate score vectors, gate rates, mistake counts, cost/turn/token/latency observations, and failures against Mission 3's observed range. Do not collapse either campaign to a mean.
