# Prospective runbook elicitation baseline v1

Status: **closed; three paid invocations completed, two runtime-valid**

This protocol drives the production `ChatAgent` through elicitation with a second model playing the
Vestera expert. It stops before Petri-net construction and recovers the emitted Markdown runbook IR.
It does not restore the retired SDCPN elicitor, `brunch_ask`, sweep, fold, capture payloads, or typed
completion accounting.

The frozen case, oracle, prompt bundle, model configuration, and stop rules define one baseline
campaign. The two historical Mission 3 runs are calibration anchors, not members of this campaign.

## Frozen campaign configuration

| Setting | Value |
| --- | --- |
| Case | `vestera-scheduling` |
| Opening message | `../../cases/vestera-scheduling/opening-message.md` |
| Expert pack | `../../cases/vestera-scheduling/situation-pack.md` |
| Prospective ledger | `../../oracles/vestera-scheduling/truth-ledger-v1-prospective.yaml` |
| Quality ruler | `../../oracles/ir-quality-ruler-v1.md` |
| Interviewer | production `ChatAgent`, `claude-sonnet-4-5` |
| Simulated expert | `claude-sonnet-4-5` |
| Interview turns | 8 before the final IR request |
| Per-logical-turn latency stop | 180,000 ms |
| Replications | 3 independent runs |
| Sampling | provider default; no seed |
| Omniscient grader | one fresh context per run using `claude-sonnet-4-5` |
| Cold reviewer | a separate fresh context per run using `claude-sonnet-4-5` |

Changing a frozen value creates a new protocol version; do not silently amend v1 after its first
paid call.

## Preconditions

1. Commit all instrument files. The runner refuses a paid run when its scoped instrument manifest
   is dirty.
2. Set `ANTHROPIC_API_KEY`.
3. Confirm no prospective artifacts already claim the intended replication numbers.
4. Do not set test-only provider/module overrides.

The runner records the source commit, SHA-256 hashes of the case, ledger, agent, skill resources,
grader prompts, and protocol, plus a hash of the built server artifact. These hashes—not repository
cleanliness outside the scoped instrument—freeze what actually ran.

## Command

Run this command three times from the repository root:

```sh
yarn workspace @apps/brunch-agent runbook:elicit
```

The command builds the app before every run. Each execution creates a unique immutable artifact
stem; it never overwrites a prior replication.

## Runtime variables

The v1 campaign uses the defaults above. These variables exist for a future protocol version or
hermetic testing; changing a value means the run is not part of baseline v1.

| Variable | Role |
| --- | --- |
| `ANTHROPIC_API_KEY` | Interviewer and expert API access |
| `BRUNCH_CHAT_MODEL` | Interviewer model; v1 freezes `claude-sonnet-4-5` |
| `BRUNCH_RUNBOOK_EXPERT_MODEL` | Expert model; v1 freezes `claude-sonnet-4-5` |
| `BRUNCH_RUNBOOK_HARD_STOP` | Interview turns before final IR request; v1 freezes `8` |
| `BRUNCH_RUNBOOK_LATENCY_STOP_MS` | Per-logical-turn stop; v1 freezes `180000` |
| `BRUNCH_RUNBOOK_OUTPUT_DIR` | Artifact directory; override only for tests or a new campaign |
| `BRUNCH_RUNBOOK_ANTHROPIC_MODULE` | Test-only expert stand-in |
| `BRUNCH_RUNBOOK_INTERVIEWER_PROVIDER_MODULE` | Test-only interviewer provider |
| `BRUNCH_RUNBOOK_ALLOW_DIRTY_INSTRUMENT` | Test-only dirty-manifest escape hatch; never use for a paid run |

## Stop and evidence semantics

- The opening dispatch counts as interview turn 1.
- The runner alternates interviewer and expert until eight interviewer turns have settled, unless a
  logical interviewer turn exceeds the latency stop or returns no visible text.
- It then sends an explicitly labelled evaluation stop instruction that is **not expert evidence**.
  The instruction asks only for the current `runbook-ir`; it forbids another question, construction,
  and construction-resource reads.
- A missing recoverable IR is retained as evaluation evidence and makes the command exit non-zero.
- The runner does not interpret model self-report as completion.

## Artifacts

The default campaign directory is:

```text
docs/evidence/evaluations/vestera-prospective-baseline-v1/
```

Each run writes:

- `<run-id>.json` — raw run record, transcript, usage, tools/resources, and instrument manifest;
- `<run-id>.md` — readable transcript and run metadata;
- `<run-id>.ir.md` — recovered IR, when one was emitted.

Never edit or overwrite these observed artifacts. Record an invalid run as invalid in campaign
adjudication rather than deleting it.

## Grading

For each replication:

1. Start a fresh evaluator context with `../ir-quality-ruler-v1/omniscient-grader.md` and supply
   exactly the situation pack, prospective ledger, transcript, and recovered IR.
2. Start a separate fresh context with `../ir-quality-ruler-v1/cold-ir-reviewer.md` and supply
   exactly the opening message and recovered IR.
3. Record the exact grader provider/model in each report.
4. Save both reports beside the run artifacts as `<run-id>.omniscient.md` and `<run-id>.cold.md`.
5. Human-review every hard failure, genuine grader disagreement, and `NEW-*` mistake.

After all three runs, add `campaign-adjudication.md` containing score vectors, gate rates, mistake
counts, cost/turn/token/latency observations, grader disagreements, and the human dispositions. Do
not collapse the campaign to a mean total; this campaign establishes baseline variation, not a pass
threshold.

## Hermetic verification

`apps/brunch-agent/test/runbook-elicitation.test.ts` executes the production runner with stand-in
models and a test-only output directory. It proves that the runner recovers an IR, records the
instrument manifest, and does not invoke capture or construction machinery. It never writes into
the campaign directory.
