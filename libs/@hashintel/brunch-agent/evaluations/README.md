# Evaluation assets

`evaluations/` contains only reusable inputs and supported procedures. Observed outputs live in
[`docs/evidence/evaluations/`](../docs/evidence/evaluations/).

| Directory | Owns |
| --- | --- |
| `cases/` | Interviewee-visible case inputs. |
| `oracles/` | Hidden truth ledgers and reusable grading rulers. |
| `protocols/` | Runnable or review procedures and their prompts. |

Current process-model-elicitation assets:

- `cases/vestera-scheduling/` and `oracles/vestera-scheduling/` — the executed Vestera exemplar
  and its case-specific retrospective and prospective ledgers.
- `cases/industrial-gas-vmi/` and `oracles/industrial-gas-vmi/` — a greenfield synthetic
  composite based on model-design reference material for telemetry-driven bulk-gas replenishment.
- `cases/truck-fleet-maintenance/` and `oracles/truck-fleet-maintenance/` — a greenfield
  synthetic composite based on the fleet-maintenance use case and model-design references.
- `cases/semiconductor-fab-operations/` and `oracles/semiconductor-fab-operations/` — a
  greenfield synthetic composite based on the semiconductor model-design references.
- `cases/data-centre-thermal-operations/` and `oracles/data-centre-thermal-operations/` — a
  greenfield synthetic composite based on the data-centre model-design use case.
- `cases/pharma-cold-chain/` and `oracles/pharma-cold-chain/` — a greenfield, explicitly
  synthetic benchmark whose domain spine comes from the logistics/pharma use-case sketch.
- `oracles/ir-quality-ruler-v1.md` — frozen general IR-quality ruler.
- `oracles/mission-4-activation-and-restraint-ruler-v1.md` — owner-accepted proof-of-life oracle for Mission 4 capability activation, controlled routing restraint, conditional resource reads, opening dosage, and template timing; accepted on 2026-09-03 but not campaign-frozen.
- `protocols/prospective-runbook-v1/` — frozen executed Mission 3 control; its runner was retired after evidence capture.
- `protocols/prospective-runbook-v2/` and `protocols/prospective-runbook-v3/` — frozen failed/invalid Mission 4 attempts retained only because their hashes are part of observed evidence; do not rerun. On 2026-09-02 the owner discarded every campaign design and output after v3 (v4 protocol and evidence, v5 protocol, product-witness-v2); a new evaluation approach replaces them.
- `protocols/ir-quality-ruler-v1/` — the independent omniscient and cold-review procedures.
- `protocols/legacy-baseline/` — retained historical instrument; do not use it for new runs.

Vestera v1 has three paid invocations: one invalid runtime member and two complete, independently
graded members. The five additional cases have prospective ledgers frozen before their first run,
but they have not yet been validated under a frozen versioned protocol.

For a 6–10-turn persona run, select one bounded incident objective rather than attempting
whole-pack acquisition: Alder outage response for industrial gas, the Monday pilot schedule for
truck fleet, the current technician/quarantine decision for semiconductor, the live
CH-2/CH-4/Aurora decision for data centre, or customs-delay recovery for pharma. A suitable
eight-turn instruction is:

> Establish enough to represent the named incident and compare its immediate options while
> preserving unresolved parameters; do not attempt exhaustive domain capture.

When an instrument ceases to be supported, archive a short record under
`docs/archive/evaluations/`, retain its observed output, and remove its executable source rather
than leaving a live-looking compatibility copy.
