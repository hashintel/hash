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

### S-005

**Date:** 2026-08-24

**Trigger/evidence:** FE-1480's authority boundary is settled, but the implementation floor remains
thin: the plugin SDK exposes identity plus one verbatim proposal, the client-tool surface exposes
only ask contracts, and FE-1482 has no build-ready contract. In contrast, FE-1407, FE-1402,
FE-1403, FE-1404, and FE-1406 each have bounded existing evidence and explicit non-HITL oracles.

**Decision:** Run a design-convergence queue before more runtime feature work: FE-1407 failure
catalogue, FE-1402 completion/stopping contract, FE-1403 CPS guidance, FE-1404 condition-3 run, and
FE-1406 reusable strategy quiver. Use those results to narrow FE-1431 to a build-ready
plugin-authoring handoff, including the absence locator. Then build the under-developed reviewer
path before returning to semantic realization.

**Consequences/cuts:** One agent can execute the design queue from existing inputs without waiting
for domain experts or the final use-case decision. No SDK, client-tool, projection, provider, or
deployment implementation belongs inside that frontier. After design convergence, the selected
order is FE-1420 → FE-1438 → FE-1439, then FE-1393 → FE-1482 → FE-1478 → FE-1480, joining at
FE-1479. These are strategic sequencing edges; Linear hard dependencies remain unchanged until a
separately approved tracker reconciliation. This replaces S-002's claim that Gherkin completion
does not gate CPS: FE-1393 now provides the smallest-honest, explicitly non-freezing SDK exercise;
FE-1482 still pressures that interface before FE-1387's generic freeze.

**Revisit when:** A design issue requires an unrecorded product preference or new domain testimony,
condition 3 fails to discriminate the claimed improvements, or FE-1431 cannot separate a build-ready
contract from later three-target ratification.

**Supersedes:** S-002

**Evidence links:** [STEERING selected frontier](STEERING.md#selected-frontier-design-convergence),
[plugin contract](../specs/plugin-contract.md), FE-1407, FE-1402, FE-1403, FE-1404, FE-1406,
FE-1431
