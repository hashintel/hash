# ADR-0005: Realize executable SDCPNs from deterministic projection scaffolds

Date: 2026-08-24
Status: accepted
Amends: [ADR-0003](0003-three-register-ir.md), register 3
Extends: [ADR-0004](0004-in-petrinaut-staging-and-the-monorepo-import.md), artifact contract only;
the application/library topology is unchanged
Decided on: FE-1480

## Context

The seven incoming Petrinaut nets all contain TypeScript code surfaces. The richer nets require
substantial stochastic lambdas, transition kernels, differential equations, scenario setup, and
metrics. Petrinaut can parse those fields as strings, but its compiler requires valid code in an
analyzable TypeScript subset before the affected behavior can simulate. A semantic CPS model can
determine what the code must express, but cannot determine the implementation mechanically.

Generating a complete net on the Brunch server would either bypass Petrinaut's compiler or couple
the server to Petrinaut internals. Storing generated code as captures would instead persist derived,
topology-dependent text as if it were elicited evidence. Both alternatives make corrections harder
to localize and audit.

## Decision

The plugin's pure projection produces three outputs from the elicited model:

1. a versioned SDCPN scaffold containing deterministic structure and field-local comments for code
   still to be written;
2. a sidecar of typed code obligations keyed by net element and field, carrying semantic intent,
   available places, token fields and parameters, supporting capture ids, and acceptance checks;
3. the typed loss report.

The sidecar is the machine contract; comments are a readable projection of it. Comment-only code is
an intentionally incomplete draft, not a runnable artifact.

Artifact realization is downstream agent work at the application meeting point established by
[ADR-0004](0004-in-petrinaut-staging-and-the-monorepo-import.md). The Brunch agent fulfills each
obligation through Petrinaut's client-executed tools, receives field-addressed compiler diagnostics,
and repairs the code until compilation succeeds. Completion additionally requires one scenario to
simulate without a runtime error. Realized TypeScript is derived artifact state, not a capture, IR
slot, fourth register, or plugin operation.

## Consequences

- A deterministic scaffold can be built and golden-tested without a model call.
- FE-1438 blocks FE-1480's executable production proof, but not scaffold or obligation design.
- Stable obligation identities make localized correction possible without whole-net resynthesis;
  failure of that property reopens this decision.
- Reusable Brunch and Petrinaut libraries remain mutually unaware; no ADR-0004 topology change is
  required.
