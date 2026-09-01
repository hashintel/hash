# Candidate C — Domain-Primary Account with SDCPN Readiness View

**Status: non-authoritative evaluation candidate.** Package this candidate alone when comparing it with Candidates A and B.

## Assembly

Candidate C reuses the shared system prompts, `instructions.md`, domain-primary `workpiece-template.md`, `pn-construction.md`, and `checks.md`. Its [`skill.ts.example`](skill.ts.example) substitutes this directory's [`profile.md`](profile.md) and adds [`sdcpn-readiness.md`](sdcpn-readiness.md) as a construction-only resource.

The candidate-specific profile is complete rather than a textual patch so a comparison runner can hash and package its exact model-facing instrument without mutating shared source files. Relative to the shared Candidate A profile, it removes the construction-readiness subsection and frames Coverage and Verification around the operational account needed for the stated simulation use. It retains the same Directives, Recognition, Operations, domain-primary Coverage concerns, and target-specific failure repairs.

## Separation of responsibility

- `profile.md` guides operational-process elicitation and workpiece maintenance without imposing SDCPN completeness during ordinary questions.
- The shared `workpiece-template.md` remains the sole operational account and keeps every claim, evidence item, and epistemic treatment at one domain-primary authoritative location.
- `sdcpn-readiness.md` is read only after construction is requested. It projects workpiece references through SDCPN readiness lenses and writes reference-only consequences or gaps into the existing `Construction notes`.
- The shared `pn-construction.md` owns mapping choices and patterns.
- The shared `checks.md` owns tool-schema acceptance, structural comparison, behavioral evidence, fidelity, and delivery checks.

The readiness view never becomes a second workpiece. If it exposes a missing or changed operational fact, that fact is written at its authoritative workpiece location and only referenced from `Construction notes`.

## Evaluation boundary

Evaluate this candidate according to the repository workbench's [`EVALUATION.md`](../../../../EVALUATION.md). Do not infer a win from its separation of elicitation and construction concerns; the paper walkthrough and any authorized model-facing probes must compare whether it exposes consequential target gaps at the right time without duplicating claims or inducing formalism-shaped questions.
