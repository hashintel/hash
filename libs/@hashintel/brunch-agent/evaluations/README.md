# Evaluation assets

`evaluations/` contains only reusable inputs and supported procedures. Observed outputs live in
[`docs/evidence/evaluations/`](../docs/evidence/evaluations/).

| Directory | Owns |
| --- | --- |
| `cases/` | Interviewee-visible case inputs. |
| `oracles/` | Hidden truth ledgers and reusable grading rulers. |
| `protocols/` | Runnable or review procedures and their prompts. |

Current process-model-elicitation assets:

- `cases/vestera-scheduling/` — the Vestera case.
- `oracles/vestera-scheduling/` — case-specific retrospective and prospective ledgers.
- `oracles/ir-quality-ruler-v1.md` — frozen general IR-quality ruler.
- `protocols/prospective-runbook-v1/` — frozen executed Mission 3 control; its runner was retired after evidence capture.
- `protocols/prospective-runbook-v2/` and `protocols/prospective-runbook-v3/` — frozen failed/invalid Mission 4 attempts retained only because their hashes are part of observed evidence; do not rerun. On 2026-09-02 the owner discarded every campaign design and output after v3 (v4 protocol and evidence, v5 protocol, product-witness-v2); a new evaluation approach replaces them.
- `protocols/ir-quality-ruler-v1/` — the independent omniscient and cold-review procedures.
- `protocols/legacy-baseline/` — retained historical instrument; do not use it for new runs.

The prospective ruler was calibrated and the baseline campaign closed after three paid
invocations: one runtime-invalid member and two complete, independently graded members. Its
adjudication lives with the observed evidence.

When an instrument ceases to be supported, archive a short record under
`docs/archive/evaluations/`, retain its observed output, and remove its executable source rather
than leaving a live-looking compatibility copy.
