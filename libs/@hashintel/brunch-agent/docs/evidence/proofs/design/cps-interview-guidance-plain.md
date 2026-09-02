# CPS interview guidance in plain language

This is the second-register rendering of the provisional
[CPS interview-guidance contract](../../../archive/specs/cps-interview-guidance-2026-08-25.md) (archived 2026-08-25 under ADR-0006; its cards are now patterns in [`plugin-sdcpn/plugin.yaml`](../../../../packages/plugin-sdcpn/plugin.yaml)). A separate renderer
received the spec and desk replay without the producing trajectory. The rendering is
reviewer-facing; the specification remains the required-behavior authority.

## What the guidance is for

FE-1403 proposes interview guidance for a cyber-physical process-model plugin. The guidance was
manually compared with two existing interviews. No card, plugin, diagnostic, model, or runtime was
executed.

The completion machinery remains authoritative. It compares the evidence-derived model with the
plugin's declared requirements, identifies a missing or weak coordinate, and decides whether the
model is complete. Interview guidance accepts one of those diagnostics and asks for evidence that
could improve the named coordinate. It does not discover the gap, decide completion, change a
grade, turn silence into evidence of absence, or treat interviewer-authored material as user
evidence.

Each card states the diagnostic it accepts, the evidence it seeks, the questions it asks, and the
proposal it requests. Cards are either CPS-domain guidance or generic interview guidance. An
attention card points native model ability at a diagnosed gap. A technique card supplies a method
the baseline did not reliably use. A license card permits a useful conversational move the model
might otherwise avoid.

## The six retained cards

**Separate failure occurrence from repair.** Ask how often each named failure happens separately
from how long its repair takes. Seek an ordinary occurrence range. For repair, ask for a plausible
low, high, best guess, and confidence before requesting percentile meanings. Preserve the exact
answer, qualifiers, provenance, status, confidence, and actual grade. One memorable repair cannot
supply a failure frequency.

**Elicit changeover loss, including ramp scrap.** For each product-family transition, ask whether
the first units are usable and what ordinary scrap range results. If an order is split, ask which
extra transitions occur and whether each repeats the loss. If the expert does not know, keep the
clause failing and ask for the least-burdensome source the expert recognizes as authoritative. Do
not substitute an interviewer-created threshold. A promised observation is not evidence of the
value.

**Bound the split-run policy.** Ask only when a split-run objective has activated the relevant
requirements. Establish accepted batch sizes, minimum runs, contiguity or interleaving rules, and
the extra changeovers, cleaning, and ramp scrap caused by one real split. Keep product- or
line-specific exceptions scoped to those cases.

**State the order-release gate.** Replace shorthand such as "tomorrow morning" with the actual
state or event that makes an order runnable and identify where that change is observable. If the
prescribed and practiced release conditions differ, preserve both rather than silently choosing
one.

**Elicit the resource-conflict rule.** When two demands need one shared resource, ask which demand
wins, what overrides that priority, how ties are broken, and which practiced case demonstrates the
rule. C1 never obtains this rule; C2 obtains it only after the prompt explicitly requires
conflict-point probing. Penalty-weight discussion is a separate native strength.

**Bound a conversational question batch.** Default to two to four related questions. A cohesive
five-item response frame is permissible while the user remains engaged. A 29-question opening is
the negative case; a four-question objective opener is the positive case. This is pack guidance,
not a completion diagnostic or a new runtime dispatcher.

## Clarification and closing

When asking for clarification, state the affected coordinate, its present evidence status and
grade, the demanded grade, and the missing evidence. Ask for the smallest evidence change that
could matter. Precision, explicitness, evidential status, and grade remain separate.

When the user signals a time or appetite limit, first honor whether they stop now or explicitly
offer a bounded continuation. If they stop, stop opening topics, state the best useful result and
the consequential gaps, and request the existing controller's settlement, sweep, and durable
delivery operations. Report the controller's deferral result; do not compute or store one in
guidance. The user may stop regardless of completion or licensing. A stop never alters completion.
If existing durability facts do not license continuation, do not promise a future session or
future delivery.

The five CPS cards belong in the CPS elicitation pack. The one generic card remains a candidate for
FE-1406 review, not established reusable harness behavior. The evidence supports only desk
discrimination: each card points to a transcript location where its question appears relevant or
where it must deactivate. It does not establish runtime activation, improvement, effect size, or
reliability. FE-1404 must run that test.

The current plugin hook cannot yet serialize several cards faithfully: it permits one technique
and one `firesWhen` predicate per proposal type, while the reviewed cards need diagnostic
disjunctions. FE-1431 must decide whether authoring gains binding multiplicity or splits bindings
without losing the shared card. Until then, these are tested content and a concrete authoring seam,
not a compilable manifest.

## Strain report and disposition

The renderer reported S01–S40. Independent contract and replay review added S41–S46. `fixed` means
the normative source was amended in this packet. `narrowed` means the claim or boundary was made
explicit. `carried` means the external contract or later empirical work remains the deliberate
owner.

| ID | Rendering strain | Disposition |
| --- | --- | --- |
| S01 | Completion vocabulary was assumed rather than located. | **Fixed:** the spec now links the plugin and completion contracts and the fixed replay DemandTable. |
| S02 | The referenced seven-value `firesWhen` enum was not enumerated. | **Fixed:** all seven canonical values now appear in the card contract. |
| S03 | Status values and grade ladders were absent. | **Fixed:** the replay's accepted statuses and applicable ladders are stated locally. |
| S04 | Kernel card, ElicitationPack, proposal, capture, and typed issue were contract terms in the rendered draft. | **Narrowed/subtracted:** `typed issue` left with GEN-Q01; the plugin contract remains the named authority for the surviving terms. |
| S05 | Target IDs did not locally map to full coordinates. | **Fixed by reference:** one link now points to the complete fixed DemandTable rather than duplicating it. |
| S06 | Quick-rinse granularity appeared to name a nonexistent projection coordinate. | **Fixed by subtraction/residual carry:** no surviving card targets `CH-CREW` or quick-rinse behavior; E19 remains only an FE-1404 residual until an owning diagnostic exists. |
| S07 | IDEA and the v0 prompt were dangling referents. | **Fixed:** IDEA is expanded and both the research deposit and v0 prompt are linked. |
| S08 | “Documented transformation” lacked an owner and acceptance rule. | **Fixed:** the card no longer relies on it to claim quantile grade. |
| S09 | “Cheapest authoritative source” had no cost or authority rule. | **Fixed:** least burden plus expert-identified authority, with examples, is now the bounded rule. |
| S10 | The absence-locator seam and “honestly located absence” were not actionable. | **Fixed/narrowed:** the seam is linked and the current clause stays failing until an approved locator exists. |
| S11 | Ramp-scrap output looked like a duration proposal. | **Fixed before reconciliation:** it is a typed dynamics proposal for magnitude. |
| S12 | Occurrence frequency was forced into a duration proposal without a declared convention. | **Fixed:** Q01 now requests distinct typed proposals that fold to the named slots. |
| S13 | Milestone and graduation language had no local acceptance rule. | **Carried:** the pack handoff states only candidate ownership; FE-1406 owns graduation. |
| S14 | Close operations and durability facts were named without a component boundary. | **Fixed:** guidance requests and reports; the existing controller and authorities perform and own every state change. |
| S15 | IDEA's anti-anchoring rationale was not transcript evidence. | **Narrowed:** the research deposit owns the rationale; the replay establishes only unresolved slots. |
| S16 | The anti-triangular prohibition was not exercised in the replay. | **Narrowed:** it remains imported technique authority, not a claimed transcript effect. |
| S17 | Scope-preservation and prescribed/practiced rules were not exercised for every card. | **Carried:** they are linked plugin-contract invariants, not new effects claimed by this replay. |
| S18 | Status/grade prohibitions were not separately replayed. | **Narrowed:** the hint labels them inherited completion-contract invariants. |
| S19 | One ramp-scrap miss cannot prove self-inventory universally incapable. | **Narrowed:** the spec prohibits relying on self-inventory for unknown omissions; it does not claim universal causal incapacity. |
| S20 | Replay prose sometimes said a card “would prevent” an outcome. | **Fixed:** counterfactual rows now describe expected separation or requests and label failure mappings predictive. |
| S21 | Lower burden from bounded batching is a prediction. | **Carried:** the replay calls it an expected interaction delta and makes no causal or effect-size claim. |
| S22 | “Addresses,” “avoids,” and “targets” could read as prevention proof. | **Narrowed:** the method and result label these as design mappings; FE-1404 owns intervention evidence. |
| S23 | `Detects` sounded like card-owned detection. | **Fixed:** the field is explicitly the diagnostic accepted by the card; completion machinery detects and adjudicates. |
| S24 | No observer or dispatcher owned the batching signal. | **Fixed/narrowed:** the assembled pack instruction reads it; no implemented dispatcher is claimed. |
| S25 | Respectful-close guidance appeared to command settlement and durability machinery. | **Fixed:** it requests existing controller operations and reports their result. |
| S26 | GEN-Q01 appeared to mutate capture activity. | **Fixed by subtraction:** the card is removed; capture and fold machinery already owns compatible-evidence preservation. |
| S27 | “Preserve unknown-to-user” blurred interview behavior and unavailable storage. | **Fixed:** the clause stays failing; field-local absence awaits the approved locator. |
| S28 | “Quiet only if” did not identify an actor or respect unconditional user stopping. | **Fixed:** the phrase is removed; stopping is honored, while future promises remain license-gated. |
| S29 | “Smallest” sounded like a minimality proof. | **Narrowed:** it means selected after recorded dispositions, not proof that no smaller equivalent exists. |
| S30 | “Desk-supported” could sound like card-effect evidence. | **Narrowed:** it means a relevant firing/deactivation location; every evidence delta remains predictive. |
| S31 | Q01 replay does not test IDEA order, calibration, or quantile method. | **Carried:** the research source owns the technique; FE-1404 owns its applied test. |
| S32 | Q02 replay does not prove the questions yield ranges, repeated loss, or storable absence. | **Carried:** these are expected deltas; the unavailable absence output was removed. |
| S33 | Q03 questions and outputs were not applied. | **Carried:** the transcript proves the clause gap only; FE-1404 must test effect. |
| S34 | Q04's `C2-E11` success is native, not card-produced. | **Fixed/narrowed:** the replay now says native evidence supplies the positive deactivation boundary. |
| S35 | GEN-Q01 has native success in both runs and an unapplied provenance correction with no legal later diagnostic. | **Fixed by subtraction:** the card is removed. E19 remains an FE-1404 residual candidate until an owning diagnostic exists. |
| S36 | An exact four-question ceiling exceeded the evidence because some five-item groups were acceptable. | **Fixed:** two to four is the default; cohesive five-item groups are soft warnings and may proceed. |
| S37 | The ACTA three-to-six-step opener was not replayed even though ACTA was disposed as untestable. | **Fixed:** the opener was removed from the surviving card and remains with the untestable ACTA candidate. |
| S38 | Q02 promised an absence artifact the present contract cannot store. | **Fixed:** the artifact is unavailable and the clause stays failing until the seam is resolved. |
| S39 | Condition 2 continued productively after a time cue, so “always stop” was too strong. | **Fixed:** the close fragment first honors whether the user stops or explicitly offers bounded continuation. |
| S40 | Durable close behavior was not executed. | **Carried:** the replay shows the failure boundary; runtime controller behavior remains unproved. |
| S41 | Multiple card diagnostics could not be represented by FE-1405's singular `firesWhen` field. | **Carried to its owner and claim narrowed:** the cards now name their predicates as design-time disjunctions; FE-1431 must decide binding multiplicity or an evidence-preserving split before the handoff is compilable. |
| S42 | Q01 fired before a failure slot existed and then lost weak motor evidence. | **Fixed:** C1 E02 is an explicit no-fire; E03 is the first mechanical fire and retains verbal motor occurrence plus point-grade repair evidence. |
| S43 | Q03 promised range-grade split costs without asking for ranges. | **Fixed:** separate questions now elicit ordinary low-to-high extra-changeover counts and repeated ramp-scrap quantities before ranged artifacts are expected. |
| S44 | GEN-Q01's firing points did not follow `CH-CREW` diagnostics. | **Fixed, then subtracted:** correction showed both runs resolve the clause natively and E18 cannot reopen it. With preservation machinery-owned, the card has no observed weakness left to own. |
| S45 | C1's release clause was called unselected although the DemandTable selected it as unaddressed. | **Fixed:** the replay now names selected, unaddressed `IW-REL`, preserving the distinction that licenses `slot-unaddressed`. |
| S46 | Conflict-point and penalty-weight probing were collapsed into one redundant candidate. | **Fixed:** native penalty-weight work remains omitted; conflict-rule elicitation survives as CPS-Q05 because C1 misses `BR-POL` and C2 passes only after explicit prompt direction. |

The translation preserved the governing boundary: completion machinery detects and adjudicates
gaps; guidance asks for evidence in response.
