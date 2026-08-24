# Brunch strategy log

This append-only log records material strategic choices: objective, proof frontier, authority
boundary, material cut, gate consequence, or confidence changes. It is neither an ADR (which owns
accepted architecture) nor a diary. IDs increase monotonically. Conflicting decisions append an
entry naming the superseded governing ID; complementary decisions use `none`. Existing entries are
immutable except for typo/link repair, and only unsuperseded governing IDs appear in `STEERING`.

## Entries

### S-001

**Date:** 2026-08-24

**Trigger/evidence:** FE-1476 defines a bounded reviewer correction scenario; the final use-case
decision remains outstanding.

**Decision:** Review-and-revise is the September proof. Full cold-start remains an important
quality benchmark and contingency lane, not a gate on this proof.

**Consequences/cuts:** Build against an existing source-grounded target now; activate cold-start if
the use-case decision changes. This does not define permanent product scope.

**Revisit when:** Dora confirms or changes the use case, or the prepared target cannot support the
optimisation handoff.

**Supersedes:** none

**Evidence links:** [STEERING objective](STEERING.md#objective-and-acceptance-proof), FE-1476,
[ADR-0004](../adr/0004-in-petrinaut-staging-and-the-monorepo-import.md)

### S-002

**Date:** 2026-08-24

**Trigger/evidence:** The Gherkin floor deliberately under-stresses the provisional plugin contract;
FE-1480 remains unresolved and CPS is its first material consumer.

**Decision:** The worked CPS slice establishes the minimum exercised plugin contract before a
generic contract freeze.

**Consequences/cuts:** FE-1482 pressures the interface first; FE-1387 and broad generic/Gherkin
completion follow the proof rather than gate it.

**Revisit when:** The worked CPS transformation requires a reusable harness primitive that must
precede the slice.

**Supersedes:** none

**Evidence links:** [plugin contract](../specs/plugin-contract.md),
[ADR-0003](../adr/0003-three-register-ir.md), FE-1480, FE-1482

### S-003

**Date:** 2026-08-24

**Trigger/evidence:** CPS semantics and reviewer transport/session work have independent early
risks, but neither proves value until a real correction crosses both.

**Decision:** Run semantic and reviewer lanes in parallel and join them at targeted correction
before provider routing and deployment.

**Consequences/cuts:** FE-1482/FE-1480/FE-1478 and FE-1438/FE-1439 may proceed concurrently;
FE-1479 is the mandatory join, followed by FE-1477/FE-1440 and FE-1441.

**Revisit when:** Either lane fails its first production-path probe or FE-1479 exposes a missing
shared prerequisite.

**Supersedes:** none

**Evidence links:** [STEERING execution tree](STEERING.md#execution-tree), FE-1479

### S-004

**Date:** 2026-08-24

**Trigger/evidence:** All seven incoming SDCPNs contain TypeScript code surfaces, and the richer
examples require substantial stochastic lambdas, transition kernels, dynamics, scenario code, and
metrics. FE-1480 therefore fired the replan trigger: an executable net cannot be projected
deterministically from the elicited model.

**Decision:** Produce a deterministic SDCPN scaffold, typed code obligations, and loss report from
the elicited model; realize the obligations with model inference through Petrinaut client tools;
then gate the result with deterministic compilation and simulation.

**Consequences/cuts:** Scaffold work remains independent, but FE-1438 blocks FE-1480's executable
production proof. The semantic and elicitor lanes first join at FE-1480 realization, then join the
review-and-revise path at FE-1479. This authority decision does not select FE-1480 implementation as
the next investment.

**Revisit when:** Field-local obligations cannot support localized repair without whole-net
resynthesis, or Petrinaut diagnostics cannot provide the deterministic gate.

**Supersedes:** S-003

**Evidence links:** [ADR-0005](../adr/0005-model-assisted-sdcpn-realization.md),
[incoming SDCPNs](../inbox/SDCPNs/), FE-1480, FE-1438
