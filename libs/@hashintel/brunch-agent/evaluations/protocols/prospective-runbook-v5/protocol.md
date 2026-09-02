# Mission 4 repaired architecture scoring v5

Status: **draft routing-repair protocol; no paid execution authorized**

Protocol id: `prospective-runbook-v5`

Observed-output namespace: `vestera-architecture-candidate-v5`

This protocol scores the owner-selected Mission 4 prompt, skill, progressive-disclosure, and workpiece architecture against only the latest valid flat-prompt control workpieces. It does not aggregate historical side quests, draft families, or every previous runbook design. The aborted/invalid v2–v4 campaigns remain operational and routing evidence, not quality baselines.

## Comparison target

The immutable quality control is exactly these two valid members of `vestera-prospective-baseline-v1`:

- `runbook-elicitation-2026-08-31T10-50-28-709Z-20a4817f`
- `runbook-elicitation-2026-08-31T10-56-34-754Z-4b75737c`

Their frozen omniscient range is `66.3–80.0 / 100`; their cold-utility range is `3.3–3.5 / 4`; both have conditional downstream readiness and no hard-failure gate. Their workpieces, grade reports, and campaign adjudication are hashed into the v5 instrument.

Quality scoring is conditional on a recoverable, valid workpiece on both sides. Runtime validity, simulator refusal, cost, and latency are reported separately and may not be converted into workpiece-quality points or used to alter either quality population.

## Proposed campaign configuration

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
| Omniscient grader | frozen `../ir-quality-ruler-v1/omniscient-grader.md`, fresh context per valid run |
| Cold reviewer | frozen `../ir-quality-ruler-v1/cold-ir-reviewer.md`, separate fresh context per valid run |
| Observed output | `../../../docs/evidence/evaluations/vestera-architecture-candidate-v5/` |

This mirrors the flat-prompt control's three-invocation shape and seeks a two-workpiece quality population. It does not replace an invalid replication to reach that population. Changing a frozen value requires a new protocol and namespace.

## Preconditions and freeze

No paid budget is authorized. The parent must freeze the final clean instrument and obtain explicit owner authorization for a new candidate/grader ceiling. The later visible witness remains separately gated. Before creating a replication, the runner applies every free path, configuration, clean-instrument, fingerprint, and namespace guard, then makes a one-token credential/model-availability preflight outside campaign membership. A failed preflight creates no member. Successful preflight cost still counts against the owner ceiling.

The runner hashes the complete candidate source and lock scope, complete built-server `dist/*.mjs` manifest, comparison-target artifacts, case, ledger, ruler, grader prompts, and this protocol. The first member fixes the fingerprint. Later members must match it exactly.

The runner categorically rejects the immutable flat-prompt namespace and descendants after real-path canonicalization. Hermetic overrides remain restricted to the checked-in faux fixtures and cannot receive an API key.

## Paid commands

After a clean post-commit hermetic proof, run sequentially:

```sh
BRUNCH_RUNBOOK_REPLICATION=1 yarn workspace @apps/brunch-agent runbook:elicit:architecture-v5
BRUNCH_RUNBOOK_REPLICATION=2 yarn workspace @apps/brunch-agent runbook:elicit:architecture-v5
BRUNCH_RUNBOOK_REPLICATION=3 yarn workspace @apps/brunch-agent runbook:elicit:architecture-v5
```

Each command builds the application, preflights the provider, uses a fresh Flue conversation and temporary database, and writes an immutable artifact stem.

## Validity and evidence semantics

- The opening dispatch counts as interview turn 1.
- After eight interviewer turns or an earlier latency/empty-text stop, a labelled non-evidence stop instruction requests the current `runbook-ir` workpiece.
- A valid quality member must contain a recoverable workpiece and no ordinary-path violation. Universal and profile guidance must have returned successfully before the first interactive question, every interactive assistant turn must contain one interrogative sentence with at most one `?` character and no question menu or alternatives, and the workpiece template must have returned successfully before first workpiece creation.
- Construction/capture tool use, construction-resource reads, undeclared tools/resources, or a missing workpiece make the candidate member invalid.
- Provider, simulator, interviewer, application, persistence, and cleanup failures remain immutable operational evidence.
- Human adjudication attributes failures by observed boundary. A simulated-expert refusal is not silently charged to candidate workpiece quality; a candidate failure is not silently relabelled as simulator failure.
- No invalid member is deleted, replaced, or graded as a workpiece.

## Artifacts

Completed and invalid runs retain the exact raw Flue snapshot and hash, readable transcript, selected workpiece and source-message binding when available, expert exchange, requested/observed model and stop metadata, costs, resource/tool traces, violations, configuration, comparison target, and complete instrument manifest. Runtime and cleanup failures use distinct nonce-bearing records so retention cannot mask the originating failure.

The v2–v4 artifacts remain in their original evidence namespaces with abort/invalid adjudications. They are neither moved into v5 nor used as flat-prompt controls.

## Grading and adjudication

For each valid v5 workpiece:

1. Give a fresh omniscient context exactly the frozen omniscient prompt, situation pack, prospective ledger, exact source conversation, and workpiece.
2. Give a separate fresh cold context exactly the frozen cold prompt, opening message, and workpiece.
3. Retain exact requested and observed grader identity and both reports. A grader completes only with provider `stop_reason: end_turn`, all required sections, exactly six scores, and a reported headline equal to the runner's independently recomputed weighted total or arithmetic mean.
4. Human-review hard failures, genuine disagreement, every `NEW-*` mistake, arithmetic validation, and failure attribution.
5. Compare candidate score vectors, mistake classes, cold utility, and readiness only with the two named flat-prompt controls. Report ranges and individual members; do not collapse either side to a mean.
6. Report completion, simulator/provider failures, cost, token use, and latency in a separate operational section.
