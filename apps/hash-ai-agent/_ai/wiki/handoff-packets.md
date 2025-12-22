# Handoff Packets: Stop Conditions via Output Contracts

> Insight derived from Anthropic's harness patterns + HN commentary on multi-agent delegation.
> Captured 2024-12-19.

## Core Insight

If you define what a delegate agent must hand off at the end of their task, you implicitly define when they're done. The handoff packet inverts the stop condition problem:

- **Before**: "How do I know when I'm done pursuing X?" (open-ended, prone to premature exit or infinite loops)
- **After**: "Have I produced a complete contribution artifact?" (verifiable, bounded)

The goal becomes not to pursue something to its ultimate possible end, but to fulfill the conditions of a good research step contribution.

## Handoff Packet Structure

Every delegate produces a standard structured object:

| Field | Purpose |
|-------|---------|
| `attempted` | What the delegate tried to accomplish |
| `observed` | Findings with provenance (source) and confidence (0-1) |
| `changed` | Artifacts produced with references (commit hash, file path, URL) |
| `notDone` | What was skipped and why — forces acknowledgment of limits |
| `highestImpactUncertainty` | The most important open question after this step |
| `nextAgentShouldFirst` | Recommended first action for successor — forces continuity reasoning |
| `payload` | (optional) Step-type-specific data outputs |

### Key Properties

1. **Completeness as stop condition**: Step is "done" when handoff is well-formed, not when some external condition is satisfied or resources exhausted.

2. **Forced reflection on gaps**: The `notDone` array prevents silent scope creep or premature termination — delegates must explicitly acknowledge what they didn't do.

3. **Epistemic humility**: `highestImpactUncertainty` maintains honest uncertainty tracking across delegation boundaries.

4. **Continuity**: `nextAgentShouldFirst` forces the delegate to reason about the broader plan context, not just their local task.

5. **Provenance**: `observed` entries carry source and confidence, enabling evidence ledger updates and audit trails.

## Relationship to Anthropic Patterns

| Anthropic Pattern | Handoff Packet Analog |
|-------------------|----------------------|
| `progress.txt` | Accumulated handoffs form the progress log |
| "Read git log" orientation | `changed` provides artifact refs for successors |
| Self-verification before status change | Can't produce valid handoff without completing work |
| Incremental progress with clean-state | Each handoff is a clean contribution unit |

## Schema Sketch (Zod)

```typescript
export const zObservation = z.object({
  finding: z.string(),
  source: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const zArtifactChange = z.object({
  artifact: z.string(),
  ref: z.string(), // commit, path, URL
});

export const zNotDone = z.object({
  item: z.string(),
  reason: z.string(),
});

export const zStepHandoff = z.object({
  attempted: z.string(),
  observed: z.array(zObservation),
  changed: z.array(zArtifactChange),
  notDone: z.array(zNotDone),
  highestImpactUncertainty: z.string(),
  nextAgentShouldFirst: z.string(),
  payload: z.record(z.string(), z.unknown()).optional(),
});
```

## Integration Points

### Plan-time vs Runtime

| Schema | Role |
|--------|------|
| `outputs: DataContract[]` | Plan-time: what artifacts are *expected* |
| `evalCriteria` | Plan-time: success/failure conditions (may deprecate) |
| **`StepHandoff`** | Runtime: what was *actually produced* + epistemic metadata |

The `outputs` field describes *intent*; the handoff describes *actuality*. Orchestrator can validate that `handoff.payload` contains expected `outputs` keys.

### Execution State Accumulation

Handoffs accumulate into execution state, enabling:

- Evidence ledger updates (from `observed` entries)
- Uncertainty inventory updates (from `highestImpactUncertainty`)
- Artifact tracking (from `changed` entries)
- Decision audit trail (from sequence of `attempted` + `notDone`)

See: [Execution State Design](#) (TODO: create separate doc)

## Specialized Roles and Handoffs

Different agent roles may emphasize different handoff fields:

| Role | Primary Contribution |
|------|---------------------|
| Literature scout | `observed` rich with sources, confidence scores |
| Methodologist | `payload` contains experimental design; `notDone` lists considered alternatives |
| Execution agent | `changed` rich with artifact refs; `observed` contains raw results |
| Skeptic/replicator | `notDone` emphasizes attempted-but-failed attacks; `highestImpactUncertainty` flags unresolved threats |
| Synthesizer | `observed` aggregates across prior handoffs; `payload` contains integrated conclusions |

## Open Questions

1. **Handoff validation**: Who validates that a handoff is "complete enough"? Orchestrator? Successor? Dedicated validator agent?

2. **Handoff-to-handoff references**: Should handoffs reference prior handoffs by ID? Would enable explicit evidence chains.

3. **Confidence aggregation**: How do `confidence` scores from `observed` entries propagate when synthesized?

4. **Failure handoffs**: What does a handoff look like when the step *failed* to complete its intended task? Still valuable for `notDone` and `highestImpactUncertainty`.
