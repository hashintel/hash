# Flue skill-composition side-quest v1

## Claim

This bounded probe compares two progressive-disclosure topologies through the production
`ChatAgent` composition seam. It tests mounting, routing precision, and whether the first
consequential action composes universal elicitation judgment with SDCPN operational-process
judgment. It does not establish general reliability or overall elicitation superiority.

## Frozen inputs

- Scenarios: `evaluations/cases/flue-skill-composition-side-quest-v1/scenarios.json`
- Evaluator-only rubric: `evaluations/oracles/flue-skill-composition-side-quest-v1.md`
- Universal source:
  `packages/core/_drafts/ampcode/core/universal-elicitation.md`
- Plugin source:
  `packages/core/_drafts/ampcode/plugin-sdcpn/sdcpn-modelling/`
- Always-on instructions: the current production core `SYSTEM.md` and plugin `useInstruction`
  contribution.
- Model: the current production default, `anthropic/claude-haiku-4-5`.
- Construction tools: absent in every scenario.

The manifest records content hashes from the source revision actually run. Any changed hash
creates a different instrument.

## Candidates

### A — independent core capability

Mount `sdcpn-modelling` and `elicitation`. The `elicitation` skill uses the universal source as
its complete substantive instructions. Its wrapper contributes only the name and this activation
cue:

> Use when progress on the active job requires knowledge that only a person can provide. Supplies
> adaptive elicitation judgment across domains and target formalisms; do not activate when the
> available evidence already supports the requested operation.

The plugin skill replaces exactly one routing sentence:

> Activate `elicitation` and read `sdcpn-elicitation.md` before substantive questions or revision.

### B — plugin-packaged universal resource

Mount only `sdcpn-modelling`. Package the same universal bytes as
`universal-elicitation.md`. Retain the source routing sentence:

> Read `universal-elicitation.md` and `sdcpn-elicitation.md` before substantive questions or
> revision.

No other substantive plugin difference is permitted.

### A-missing — intentional misconfiguration

Mount Candidate A's plugin skill without `elicitation`. Observe Flue's native behavior; add no
dependency framework or fallback protocol.

## Hermetic phase

Use the built production app with a pi-ai faux provider. Exercise S1–S5, prescribing calls only to
prove catalog mounting, activation, resource access, trace observability, absence of hidden
universal disclosure, and missing-capability behavior. Retain the raw snapshot and observed Flue
events. Faux outputs are not evidence of model judgment.

The evaluator gate requires:

1. candidate parity checks pass;
2. every run crosses the same built `ChatAgent`;
3. S1/S4 acquire universal content and S2/S3 do not;
4. S2 is accepted as sufficient for its first construction decision;
5. S5 records the native failure shape;
6. raw tool inputs, outputs, usage, and latency are recoverable; and
7. no production resource or frozen Mission 3 artifact changed.

## Paid mechanism smoke

After the hermetic gate, run S1 and S2 once per candidate in this order: A/S1, B/S1, A/S2, B/S2.
Each scenario is one evaluation run through `ChatAgent`; Flue may make multiple provider calls
within that run to service model-selected tools, all of which must be recorded.

Stop each run after its first consequential question or construction decision. Before each run,
confirm fewer than four paid runs have been dispatched and recorded total provider cost is below
USD 1.00. Stop immediately on mechanical failure, candidate path asymmetry, missing raw trace,
shared-content defect, or when the next run cannot safely remain within the ceiling.

No paid S3/S4 replication, repeated run, or model judge is authorized.

## Evidence layout

After the hermetic gate, write immutable evidence to
`docs/evidence/evaluations/flue-skill-composition-side-quest-v1/`:

```text
manifest.json
runs/
  hermetic/<candidate>-<scenario>.json
  paid/<candidate>-<scenario>.json
comparison.md
```

Each run records the raw Flue snapshot, observed events, first consequential output, tool calls
and results, resource paths, loaded-content hashes, provider usage, latency, cost, and failure
shape. The manifest records the source commit, dirty state, source and rendered hashes, runtime
configuration, fixture hashes, and all intentional differences.
