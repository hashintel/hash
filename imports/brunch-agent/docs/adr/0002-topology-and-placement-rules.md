# ADR-0002: The three-lane topology and placement rules N1–N6

Date: 2026-08-17
Status: accepted
Refines: spec [§12.2](../planning/elicitation-kernel/spec.md) (package topology) with placement
rules the spec did not state
Decided on: FE-1401 (remediation sweep); ratified by Lu, 2026-08-17

## Context

The Flue architecture cheatsheet's full read of the framework's affordance surface
([flue-architecture-cheatsheet](../planning/_shared/flue-architecture-cheatsheet.md)) sorted this
system into three lanes: shell-facing affordances to consume directly, agent-loop capabilities
to translate in the binding, and elicitation semantics plus the capture store to own outright.
The topology verification ([topology.md](../planning/_shared/topology.md)) then walked the actual tree
against that model and spec §12.2 and found one violation — the ask/suspension protocol's
portable mechanism living in the Flue binding (the §14.2 second-binding test failing in
spirit) — and no rule governing where upcoming work lands, which is how the violation happened.

## Decision

The three-lane model and placement rules N1–N6, as specified in
[topology.md](../planning/_shared/topology.md), are ratified. In brief:

- **N1**: the ask protocol extracts to `core/src/ask-protocol.ts` (FE-1422, before FE-1392);
  sweep mechanism starts in `core/src/sweep-protocol.ts` from day one. Bindings contain hook
  wiring only.
- **N2**: plugin-owned content (packs, cards) ships as plugin-package exports registered by
  hosts — never per-agent `skills/` directories holding plugin content inside an app. Quiver
  content is harness-shipped under the same rule.
- **N3**: the demo shell is `apps/demo`, canonical layout, consuming lane-1 affordances
  directly and `@brunch/*` public surfaces only.
- **N4**: experiment runners live beside their planning docs, JS-API pattern, `observe()`
  accounting — never in `packages/`.
- **N5**: storage-port implementations live one per (binding × deploy target), always in the
  binding package, implementing core's `CaptureStore` with parse-on-read.
- **N6**: `plugin-assurance`, when chartered, mirrors `plugin-gherkin`'s shape.

`topology.md` remains the living reference (tree, per-node rules, tolerated-untils); this ADR
records that its rules are decided, not proposed.

## Consequences

- FE-1422 is the one code change the ratification demands; it blocks FE-1392 by design.
- The enforceable rules become boundary gates: N2 (no plugin content in app skills
  directories) and N5 (port implementations only in bindings) get mechanical checks in
  `test/boundaries.test.ts` — designed with red-proofs, not filename heuristics, per the
  FE-1419 queue's discipline.
- The two tolerated-untils stand: `chat.tsx` until FE-1385 adopts `@flue/react`; the flat
  agent file until a second agent forces per-agent folders.
