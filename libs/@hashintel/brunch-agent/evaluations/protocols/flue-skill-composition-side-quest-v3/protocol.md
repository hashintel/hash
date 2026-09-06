# Flue skill-composition side-quest v3

## Purpose

V3 removes two confounds observed in v2 while preserving the topology manipulation. It does not
rewrite either candidate after seeing v3 output.

## Frozen instrument

- Core prompt for both candidates:
  `packages/core/_drafts/ampcode/core/SYSTEM.md`
- Universal substance for A instructions and B resource:
  `packages/core/_drafts/ampcode/core/universal-elicitation.md`
- Plugin job and resources:
  `packages/core/_drafts/ampcode/plugin-sdcpn/sdcpn-modelling/`
- Shared append source:
  `packages/core/_drafts/ampcode/plugin-sdcpn/APPEND_SYSTEM.md`
- Scenarios:
  `evaluations/cases/flue-skill-composition-side-quest-v3/scenarios.json`
- Oracle:
  `evaluations/oracles/flue-skill-composition-side-quest-v3.md`
- Model: `anthropic/claude-haiku-4-5`
- Boundary: the built production `ChatAgent`, selected only through side-quest environment values
- Tools: production read-only tools; no construction mutation tools
- Stop: first consequential question, finding, or construction decision

The shared v3 append differs from the Ampcode source in one routing sentence only:

> Activate the `sdcpn-modelling` skill before substantive elicitation, review, workpiece revision,
> or construction of an operational-process or SDCPN artifact.

It contains no universal procedure or scenario answer.

V3 uses the frozen v2 required-disclosure gate in the plugin job. The only A/B text difference is
its required action:

- A activates the mounted `elicitation` skill.
- B reads `universal-elicitation.md` from `sdcpn-modelling`.

Normalizing that line must make plugin instructions byte-identical. Both candidates receive
byte-identical core prompt, append, scenarios, model, tools, and stopping rules.

## Hermetic gate

Before paid execution:

1. build the app and exercise A/B × S1–S4 with the faux provider;
2. prove catalog mounting, candidate-specific disclosure, and restraint paths;
3. capture the first model-visible request and prove it contains the complete compact Ampcode core
   prompt and v3 append;
4. prove it does not contain the legacy production marker `## The role (core)`;
5. prove v3 scenario and candidate parity from hashes; and
6. run formatting, type, lint, unit, and architecture-boundary checks.

## Exact paid order

Every item is a fresh conversation. Complete or stop before starting the next pair.

| Pair | Scenario | First | Second |
| --- | --- | --- | --- |
| 1 | S1 | A | B |
| 2 | S1 | B | A |
| 3 | S1 | A | B |
| 4 | S2 | B | A |
| 5 | S2 | A | B |
| 6 | S3 | B | A |
| 7 | S3 | A | B |
| 8 | S4 | B | A |
| 9 | S4 | A | B |
| 10 | S4 | B | A |

V3 has at most 60 additional provider invocations and USD 1.00 additional cost. Count every Flue
model call. Before each pair, reserve eight calls and USD 0.15 unless observed completed pairs
establish a lower safe bound. Stop rather than leave an unpaired comparison. Stop on mechanical
failure, path asymmetry, missing raw trace, a shared non-discriminating prompt/router failure, or
either ceiling. Do not add scenarios or runs.

## Adjudication

Routing is primary. Apply the exact thresholds in the v3 amendment to `SIDE_QUEST.md`; score
question dosage, premature resource loading, integrated judgment, cost, and failure clarity
separately. Raw traces and usage are authoritative. No paid judge is used.
