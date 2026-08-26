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

### S-006

**Date:** 2026-08-24

**Trigger/evidence:** The design-convergence queue in S-005 was selected, but Linear did not encode
three genuine prerequisites, and FE-1431 still conflated a build-ready design handoff with later
three-target ratification.

**Decision:** Encode FE-1407 blocking FE-1404, FE-1404 blocking FE-1406, and FE-1406 blocking
FE-1431 in Linear. Define FE-1431 as complete when its plugin-authoring contract is build-ready,
while retaining three-target ratification as a later condition for removing the contract's
provisional marker. Keep every other sequencing edge in S-005 soft.

**Consequences/cuts:** Mechanical issue availability now protects the three actual joins without
pretending that the whole strategic order is a dependency graph. FE-1402 and FE-1403 can still run
independently, and SDK implementation or empirical ratification cannot hold FE-1431's design
closure open.

**Revisit when:** A recorded prerequisite proves unnecessary, or implementation exposes a product
decision that the FE-1431 handoff failed to settle.

**Supersedes:** none

**Evidence links:** [STEERING selected frontier](STEERING.md#selected-frontier-design-convergence),
FE-1407, FE-1404, FE-1406, FE-1431

### S-007

**Date:** 2026-08-25

**Trigger/evidence:** The S-005 design-convergence queue ran to its end without changing a line of
production-path code. FE-1402's rehearsal needed an oracle and authored a DemandTable keyed to the
baseline coatings-plant domain (`where(kind, role=…)` scopes, `ROW-BREAKDOWN`-style objective rows), below
the level at which the IR spec's Layer B had already defined the plugin; the contract's "September
ships kind-only" was correct and the oracle was wrong. FE-1403's five `domain` cards each lift to a
kind-level pattern. FE-1404 produced a 5,400-line preregistered instrument through nine rejected
review renderings, never ran, and committed the rejected draft lock (stale hashes, missing paths;
its own `--verify-seal` refuses it); structurally it is a shadow harness — operator, projection
schema, diagnostic priority, novelty streak, and sealed segments each mirror a harness component
that the S-005 cut forbade building. The whole queue worked the cold-start lane while the
objective is review-and-revise (S-001: cold-start does not gate it; fixtures supply the prebuilt
model). Factual correction: STEERING's proof bundle named "truck-fleet baseline transcripts"; the
baseline situation pack is a coatings plant (Vestera Coatings, Production Process
Scheduling), and truck-fleet is Layer B's validation case, whose dossier is still missing (see the
FE-1382 gate). "Tracer as definition of done" recurred as "desk rehearsal / preregistered
instrument as definition of done".

**Decision:** Invert S-005 and S-006: implement the vertical slice and design only what the slice
forces. Adopt [ADR-0006](../adr/0006-plugins-per-target-formalism.md): plugins are per target
formalism, authored as one sectioned Markdown file; `docs/specs/sdcpn-plugin.md` is the exemplar.
Close the design-convergence queue: FE-1407, FE-1402, and FE-1403 are reclassified as test-bed
material; FE-1404 is redefined as the skeleton run — condition 3 as the protocol originally
defined it (kernel harness + real plugin), not the shadow-harness instrument; FE-1406 shrinks to
lifting harness-generic patterns out of plugin files; FE-1431 mostly dissolves (a file format and
a parser, not seven authoring seams); FE-1393 is demoted to a post-skeleton generality check (a
second formalism adds zero headings). Promote the reviewer lane (FE-1420 → FE-1438 → FE-1439) and
the semantic lane (FE-1478 → FE-1480 → FE-1479) to primary. The skeleton epicentre is FE-1482 plus
a harness controller read path (captures → model → next move), which has no issue yet. Rejected:
finishing the design queue as planned, because its outputs are desk artefacts that cannot be
wrong in a way the product would notice, and running condition 3 with the shadow harness, because
it would measure an instrument the product will never ship and displace the kernel a second time.

**Consequences/cuts:** The hard-blocker chain FE-1407 → FE-1404 → FE-1406 → FE-1431 recorded by
S-006 is removed; Linear mutation remains a separately approved step. The plugin-contract,
completion, and interview-guidance drafts are archived; the specs shrink to the heading contract,
table grammar, `project`/`validate` seam, and `evaluateCompletion` invariants. The FE-1404
instrument is archived as test-bed; its Valibot projection schema and validators are salvage.
Beliefs updated: "the design queue can run without HITL" is retired as answered-but-irrelevant —
it ran, and proved nothing the product needed; "CPS establishes the minimum plugin contract"
rises to high, evidenced by the one-file plugin. New heuristic recorded in the steering protocol:
an evaluation instrument larger than the thing it evaluates is itself the finding; a frontier whose
durable outputs are all desk, simulated, or evaluation-side, with no production-path code changed
by the end of one arc, triggers replan.

**Revisit when:** The skeleton's parser, fold, or `evaluateCompletion` cannot be built from the
sectioned file without a typed declaration the file cannot carry, or a second formalism needs a
heading the contract does not have (ADR-0006's condition).

**Supersedes:** S-005, S-006

**Evidence links:** [ADR-0006](../adr/0006-plugins-per-target-formalism.md),
[sdcpn plugin file](../specs/sdcpn-plugin.md),
[IR spec Layer B](../specs/intermediate-representation.md#layer-b--the-cps-plugins-ir),
[archived drafts](../archive/specs/),
[baseline situation pack](../../evaluations/cases/process-model-elicitation/baseline/situation-pack.md),
[condition-3 instrument](../../evaluations/protocols/process-model-elicitation/baseline/),
FE-1402, FE-1403, FE-1404, FE-1406, FE-1431, FE-1482
