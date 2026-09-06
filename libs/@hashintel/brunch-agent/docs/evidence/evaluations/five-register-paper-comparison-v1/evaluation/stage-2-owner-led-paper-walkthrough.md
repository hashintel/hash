# Stage 2 — Owner-Led Paper Walkthrough

**Status: complete; the owner accepted Candidate A as the surviving paper candidate. No model-facing claim is made.**

- Walkthrough time: `2026-09-01`
- Owner disposition: `2026-09-01`
- Candidate source commit: `2fb4c779a2`
- Eligible candidates: A and C
- Eliminated before this stage: B

This walkthrough applies the eight frozen cases in [`../EVALUATION.md`](../EVALUATION.md) to the two Stage 1-eligible instruments. Each case description is treated as the only given evidence. The trace does not invent quantities, policies, probabilities, or operational facts to make a candidate look complete.

The frozen cases state no simulation objective and supply no populated workpiece. The traces therefore compare authored routes conditionally: a distinction is consequential, applicable, or blocking only if a later stated use depends on it. Stage 2 cannot execute Candidate C's projection, observe resource reads, or establish whether a model follows either candidate; those remain model-facing questions.

Candidates A and C share the universal reference, domain-primary Coverage, workpiece authority structure, construction mappings, and checks. They differ only in readiness placement: A keeps three broad construction-readiness checks in ordinary plugin Verification; C removes those checks and adds a 937-word reference projection after construction is requested.

## Case 1 — Reusable resource reservation and release

| Observation | Candidate A | Candidate C |
| --- | --- | --- |
| Signal | Recognize **Contended resource** and **Consumed, reserved, or read input** as hypotheses. The crew may be reusable and unavailable while held; its return state must be confirmed. | Same Recognition path; C's ordinary profile retains both operational shapes unchanged. |
| Next move | Apply **Classify activity inputs** to ask when the crew is acquired, unavailable, and released, and whether it returns changed. Use **Test contention with a borderline case** only if demand can exceed availability. | Same operational-language moves. The readiness view is not loaded and does not frame the question. |
| Coverage | Use **Participants, locations, flowing things, and resources** for crew identity, count, and availability; use **Activities, inputs, outputs, and resource use** for each acquisition/use/release relation; let the process spine reference their ordering. Qualification becomes relevant only if later evidence and purpose make it consequential. | Same domain-primary Coverage and filing route. |
| Workpiece authority | Keep crew properties at the participant/resource location and the activity-specific reservation/release claim at the relevant activity. The spine references both rather than restating them. | Same authoritative homes. Later readiness entries cite those locations and carry no crew count, rule, or release fact. |
| Construction boundary | Resource-state representation, acquisition/return structure, and arc semantics remain hidden in `pn-construction.md`. | Same boundary. Before mapping, C adds a cited obligation that the representation preserve unavailability and changed-state return. |
| Readiness | Plugin Verification already checks classification, acquisition, unavailability, release, and count; its broad readiness section also requires reusable-resource occupancy to be recorded before handoff. Shared pre-construction checks repeat the boundary at construction time. | Ordinary Verification retains the same specific resource checks but omits A's three broad readiness bullets. At construction, the readiness view cites resource, activity, and spine locations, then shared checks apply. |
| Verification | **Resource disappearance** repairs back into the activity/input relation. Static net review may report an intended return structure, not conservation. | Same repair and evidence bound. The readiness projection adds navigation but no new resource distinction or oracle. |
| Evidence level | Before construction, only a workpiece claim exists. After construction, report tool acceptance, static correspondence, or scoped behavioral evidence separately. | Same levels. The readiness view is not an evidence level. |

**Comparison:** Both author an elicitation route for reservation semantics when those semantics bear on the use. C mandates an additional construction-time projection before the same mapping and checks; paper inspection finds no additional resource distinction in that projection, but cannot establish what either candidate would discover in a run.

## Case 2 — Failure, retry, and recovery

| Observation | Candidate A | Candidate C |
| --- | --- | --- |
| Signal | Recognize **Failure, retry, and recovery** and possibly **Event rather than step**. Failure may redirect the case and may release, retain, or lose occupied resources. | Same Recognition path. |
| Next move | Apply **Trace disruption and recovery** from failure through work in hand, occupied resources, partial retry, recovery, and terminal outcome. Use a concrete failure story when the ordinary path does not establish the exception. | Same move and user-facing vocabulary. |
| Coverage | File local failure outcomes and resource effects with the affected activities; file the authoritative retry/recovery order in the process spine; keep occurrence quantities only where supported. | Same Coverage and filing. |
| Workpiece authority | The activity owns what failure does locally. The spine owns where retry rejoins or terminates and references the activity/resource claims. One memorable incident remains evidence of mechanism, not rate. | Same authoritative structure. Readiness later cites the failure path rather than paraphrasing it. |
| Construction boundary | Interruptions, alternate paths, recovery transitions, and resource-return structures remain construction choices. | Same boundary; the readiness projection records the recovery and resource obligations before those choices. |
| Readiness | Ordinary Verification names dead spine and resource disappearance as failure signals; broad readiness requires order, enabling conditions, and occupied resources before handoff. | The same specific checks remain in ordinary Verification. C later indexes ordering, recovery, and resource references under construction notes. |
| Verification | Repair a missing retry destination at the process spine and missing release semantics at the activity/input relation. Do not infer failure frequency from the case. | Same repairs. Shared construction checks inspect recovery and enumerated holding paths afterward. |
| Evidence level | A static recovery path is structural correspondence only; runtime progress or non-leakage needs named execution or stronger analysis. | Same evidence boundary. |

**Comparison:** The domain profile already connects failure, retry, and occupied resources. C makes that connection explicit again at construction without changing gap timing, authority, or evidence.

## Case 3 — Contextual location

| Observation | Candidate A | Candidate C |
| --- | --- | --- |
| Signal | Recognize physical location as a possible boundary, eligibility condition, capacity, travel source, state distinction, resource effect, or irrelevant detail—not automatically a Petri-net place. | Same explicit Recognition signal and backstage-formalism directive. |
| Next move | Follow one concrete case through the location and use a contrastive case to ask what changes when the location changes. Stop if no purpose-relevant operational consequence appears. | Same move; no target node is proposed during questioning. |
| Coverage | Put the authoritative location meaning under **Participants, locations, flowing things, and resources**. Activity, time, boundary, or policy sections reference that meaning only when they own a distinct consequence. | Same domain-primary Coverage. |
| Workpiece authority | Record one location claim with its selecting context and evidence. If its effect changes activity duration or eligibility, place that separate proposition at its own concern and reference the location claim rather than repeating it. | Same authority rule. A readiness entry may cite several locations but cannot become a second location account. |
| Construction boundary | Whether the effect becomes state, capacity, guard, parameter, travel delay, or no net structure remains in construction guidance. | Same boundary. C records only which operational distinction a mapping must preserve and defers the concrete representation. |
| Readiness | Ordinary Recognition and Verification already prevent pattern-generated process facts and require target-relevant gaps to remain visible. The construction mapping principle asks for an evidenced operational effect. | C omits the broad target-gap bullet during elicitation but retains the pattern-generated-fact repair. Its readiness lens cites the location effect before the same construction principle applies. |
| Verification | If the interview turns “location” directly into a place, repair by returning to observable operational consequences. If no consequence bears on the objective, omit the distinction. | Same repair. The readiness view cannot promote location into structure. |
| Evidence level | A visible place or parameter later establishes only a reviewed representation, not that the location behavior is correct. | Same evidence boundary. |

**Comparison:** Neither candidate requires formalism vocabulary in the question. C's reference projection does not resolve a location ambiguity that A's Recognition, Coverage, construction principle, and checks leave unresolved.

## Case 4 — External event versus internal threshold

| Observation | Candidate A | Candidate C |
| --- | --- | --- |
| Signal | Recognize both **Gate, release, trigger, or prerequisite** and **Threshold on a changing quantity**. Do not assume that all trigger language has the same origin. | Same two hypotheses. |
| Next move | Slice the case to ask what observable event enables work and where it comes from. For the internal quantity, clarify direction, rate, threshold, consequence, and reset only to purpose-relevant depth. | Same operational moves. |
| Coverage | Put external arrivals/events and admission conditions under boundary/triggers; put changing quantity and threshold evidence under time/quantities/stochastic behavior; let the process spine reference both enabling conditions. | Same domain-primary filing. |
| Workpiece authority | The external event claim and internal quantity claim have separate homes because they are separate propositions. The spine references how each enables the relevant activity without copying their details. | Same authority. Readiness later cites both homes. |
| Construction boundary | Source transitions, scenario inputs, guards, dynamics, and crossing-triggered events remain candidate mappings, not elicitation concepts. | Same boundary. C's readiness resource records only boundary and dynamic obligations and explicitly defers where they are represented. |
| Readiness | Recognition and Coverage name event origin, threshold consequence, and reset, so they are available to a purpose-relative elicitation move. Verification checks spine completeness and contextual quantity precision but does not independently demand each of those details. | C retains the same ordinary routes. At construction, separate boundary and continuous-change lenses can cite each concern when applicable; the resource does not require them to be paired. |
| Verification | Repair an unsupported threshold or invented arrival pattern at its authoritative claim. A missing enabling relation repairs at the spine. | Same repairs; shared checks later require parameters/initial populations or explicit external inputs. |
| Evidence level | Static presence of a source or threshold structure is not evidence that arrival or crossing behavior occurs as intended. | Same evidence boundary. |

**Comparison:** C authors a dedicated construction-time index across the two domain homes, while A leaves construction to consult the same workpiece through mapping guidance and checks. Both require a cold-readable workpiece; paper inspection cannot establish which path avoids transcript archaeology in execution.

## Case 5 — Directional mode change

| Observation | Candidate A | Candidate C |
| --- | --- | --- |
| Signal | Recognize **Mode change** and the possibility that A-to-B and B-to-A differ in time, scrap, material, capacity, or downstream sequence. | Same Recognition path. |
| Next move | Apply **Compare both directions of a mode change** and pursue only consequences the operation distinguishes. Use contextual quantity work when values vary by regime. | Same move and stopping rule. |
| Coverage | Keep the mode-change activity and directional consequences under activities/resource use; keep separately supported quantity behavior at the time/quantity concern; reference both from the process spine where sequencing changes. | Same domain-primary Coverage. |
| Workpiece authority | Place each directional proposition once beside its evidence and context. A shared quantity section may own a distribution, but it references rather than restates the directional activity rule. | Same authority structure. Readiness cites both directional homes. |
| Construction boundary | Mode states, directional transitions, and loss structures remain in construction guidance. | Same boundary. C records the obligation to preserve direction but does not choose the factoring. |
| Readiness | Ordinary Verification explicitly requires direction-dependent losses to remain distinct; broad readiness adds no unique mode-change content. | Candidate C retains the same direction-specific Verification check. Its later readiness lens repeats the preservation obligation by reference. |
| Verification | A collapsed symmetric account repairs at the two directional claims. Static review later checks distinct structural losses without claiming runtime exclusivity. | Same repair and evidence wording. |
| Evidence level | Distinct structures can be reviewed against the workpiece; their actual loss behavior requires execution or stronger analysis. | Same levels. |

**Comparison:** Candidate C authors an additional navigation step for this case. The directional distinction already has explicit ordinary Recognition, Operations, Coverage, and Verification routes in both candidates; whether a model applies them remains unobserved.

## Case 6 — Hidden waiting

| Observation | Candidate A | Candidate C |
| --- | --- | --- |
| Signal | Recognize **Hidden waiting** as a possible unavailable input/resource/calendar, release rule, batch, transport, approval, policy, or recovery condition rather than a self-explanatory queue. | Same Recognition path. |
| Next move | Apply **Follow waiting to its enabling condition**: ask what the case is waiting for and what observable event makes it able to continue. | Same move. |
| Coverage | Put the wait episode and enabling relation in the process spine; put the underlying resource, policy, calendar, batch, transport, approval, or recovery proposition at its domain concern and reference it from the spine. | Same domain-primary filing. |
| Workpiece authority | The spine owns that the case waits at this point and cites the local cause. It does not duplicate the resource availability or policy rule that explains the wait. | Same single-home arrangement. Readiness cites the spine and cause. |
| Construction boundary | An intermediate place may emerge, but its meaning comes from mapped surrounding conditions. Queue structure is not elicited directly. | Same boundary. C records enabling semantics only and defers structure. |
| Readiness | Ordinary Verification explicitly requires waiting to have an evidenced enabling condition; broad readiness also requires what enables the case. | Candidate C retains the same explicit waiting check. The later readiness ordering lens adds no new operational distinction. |
| Verification | An unsupported queue repairs by returning to the surrounding condition and activity claims. Shared static checks later reject unsupported queue objects. | Same repair and check. |
| Evidence level | A visible waiting place is structural correspondence only; waiting duration or release behavior needs scoped behavioral evidence. | Same boundary. |

**Comparison:** A authors the same waiting-gap check in ordinary Verification and construction checks. C adds a derived reference entry before the same mapping and static check.

## Case 7 — Correction versus contextual coexistence

| Observation | Candidate A | Candidate C |
| --- | --- | --- |
| Signal | Use universal **Tension within or between accounts**. A later difference may be correction, conflict, unnamed context, or source error. | Same universal Recognition; readiness is irrelevant until the active account is settled enough to map. |
| Next move | Apply **State a contradiction without resolving it**, asking whether one replaces the other, both hold under different conditions, or evidence would distinguish them. | Same move. |
| Coverage | Use universal authorship/divergence coverage and the domain policy/context concern where a practiced regime selects among accounts. | Same Coverage. |
| Workpiece authority | A correction updates the authoritative claim and marks what it replaces without leaving both active. Contextual coexistence keeps each account beside its selecting condition. Use the issue ledger when the unresolved relationship affects several claims or needs a later return path. | Same authority. The readiness view may cite only the active/contextual claims and cannot settle the relationship. |
| Construction boundary | Do not compile an unresolved conflict or treat recency as a universal guard. Concrete policy/guard mapping remains behind the construction branch. | Same boundary. C may mark a blocking selection gap but cannot choose a rule. |
| Readiness | Ordinary universal and plugin Verification already check correction, conflict, and contextual regimes. A's broad target-gap bullet can mark an unresolved selection as construction-relevant. | The same epistemic checks remain in C. Its policy readiness lens later cites the unresolved location and routes a re-entry question; only the affected construction path blocks when the gap admits materially different structures. |
| Verification | Repair silent collapse or doubled active correction at the authoritative claim before mapping. After mapping, check that only supported contextual selection appears. | Same repair. The readiness view supplies no additional evidence. |
| Evidence level | A workpiece can preserve unresolved accounts. No net claim that resolves or compiles the disputed relationship is justified until a supported treatment is constructed and checked; unaffected supported structure may proceed. | Same levels. |

**Comparison:** Both preserve the epistemic distinction before construction. C provides a later reference slot for the gap, but the existing issue ledger, construction notes, and checks already supply that route.

## Case 8 — Unknown versus unasked

| Observation | Candidate A | Candidate C |
| --- | --- | --- |
| Signal | Use universal **Silence and absence**: absence alone does not say whether material is irrelevant, unknown, unasked, declined, forgotten, or deferred. | Same Recognition. |
| Next move | Apply **Select the smallest consequential absence**. If asked and unavailable, use **Deposit and defer**; if never raised and consequential, keep it visibly unasked and ask only when it outranks the active thread. | Same move during ordinary elicitation. |
| Coverage | Keep the unknown value at its authoritative domain concern with its source and consequence; keep a distinct consequential topic **Not yet asked** at its own home. Do not create person-declared uncertainty from interviewer omission. | Same domain-primary Coverage and annotations. |
| Workpiece authority | Each absence state lives beside the claim or missing concern it qualifies. A cross-cutting ledger entry references several affected claims only when re-entry spans them. | Same authority. The readiness view cites the absent authoritative home; it does not copy the unknown or convert unasked to unknown. |
| Construction boundary | Unknowns, assumptions, and their consequences are already visible in the workpiece. During construction, an unknown may receive a named representational treatment such as a parameter or blocker; it cannot become an assumption without explicit agent authorship. An unasked topic remains an acquisition gap, not a default value. | Same boundary. C's readiness view can record the construction consequence before mapping. |
| Readiness | A's ordinary broad readiness check requires target-relevant gaps to be visible before handoff, while universal Coverage requires consequential unsupported dependencies to remain visible. Shared construction checks instruct the agent to formulate the smallest resolving question when materially different structures remain possible. | C removes only the broad readiness line; universal Coverage retains the same unsupported-dependency contract. Its construction-only view provides a route for recording the material consequence and re-entry question under construction notes before shared checks. |
| Verification | Repair a mislabeled unknown at its authoritative home. If the unasked topic can change structure, route the smallest operational question rather than inventing a value or rule. | Same repair and evidence discipline. |
| Evidence level | Parameterization of an unknown is a visible construction treatment, not evidence of its value. An unasked topic supports no operational claim. | Same evidence boundary. |

**Comparison:** This is the strongest authored rationale for C: it supplies a dedicated construction-notes location for consequence and re-entry. A nevertheless makes the same distinction available earlier through universal Coverage and Verification, its readiness line, and shared pre-construction checks. Paper inspection establishes placement, not whether either model path notices or routes the gap reliably.

## Cross-case comparison

| Criterion | Candidate A | Candidate C | Paper result |
| --- | --- | --- | --- |
| Operational-language questioning | All eight cases route through the same domain Recognition and Operations. | Same; readiness remains construction-only. | Tie; both pass. |
| Single-home workpiece authority | Domain claims stay local; spine, ledger, construction notes, and delivery reference them. | Same; readiness entries are reference-only. | Tie; both pass. |
| Consequential gap timing | The combined Recognition, Operations, Coverage, and Verification registers author a route for every frozen case; broad readiness is visible before construction and shared checks run during construction. | The same case-specific routes remain, minus three broad readiness lines; the detailed projection runs after construction is requested. | A has the earlier authored readiness pointer; actual noticing is unobserved. |
| Construction mechanics in elicitation | None; broad readiness is stated in operational language. | None. | Tie; both pass. |
| Construction navigation | Workpiece → construction guidance → checks. | Workpiece → readiness projection → construction guidance → checks. | A is shallower. |
| Duplicate operational claims | None required. | None required; readiness cites claims. | Tie on authority. |
| Repeated classification effort | Mapping and checks consult authoritative claims directly. | The selected slice is projected through applicable readiness lenses, which may be omitted when irrelevant, before mapping and checks. | C mandates an additional pass; its per-claim effort is unobserved. |
| Context cost | 6,072 ordinary activated words; 2,741 construction-only words. | 6,036 ordinary activated words; 3,678 construction-only words. | C saves 36 ordinary words and adds 937 construction words. |
| Construction fidelity oracle | Shared mapping guidance and three evidence levels. | Same mapping guidance and evidence levels; readiness is not an oracle. | Tie on authored oracle; no fidelity behavior was demonstrated. |
| Unique frozen-case distinction | All eight have an operational elicitation and checking route before construction. | No additional operational or target distinction is authored. | None found for C in the paper instruments. |

## Structural discriminator

Candidate C supplies a structurally coherent example of a domain-primary workpiece paired with a separate, reference-only SDCPN readiness view without requiring duplicated authoritative claims or elicitation-time mappings. The paper walkthrough finds no new authored operational distinction or oracle relative to Candidate A:

- every frozen case has a route through the shared domain Recognition, Operations, Coverage, and Verification material, conditional on a stated use making that route relevant;
- Candidate A's three readiness bullets contain no construction mechanics and are available before a construct-only runtime would have to return a gap;
- shared `checks.md` already contains a detailed pre-construction sufficiency pass;
- Candidate C mandates a projection through applicable lenses before the same mapping and checking resources, without adding evidence or another oracle.

The instruments do not establish whether C's explicit projection improves model attention enough to outweigh that extra pass. Under the protocol's fallback for a non-dominating comparison, the smaller reversible candidate is A. The 36-word ordinary-context reduction does not offset a 937-word construction resource and another required navigation step on paper alone. This is a topology and reversibility decision, not a behavioral superiority claim.

## Owner disposition

- **Candidate A:** selected as the surviving paper candidate.
- **Candidate C:** eliminated; this walkthrough preserves the evidence that the separate readiness view is feasible but not yet earned, while its candidate source remains recoverable at commit `2fb4c779a2`.
- **Candidate B:** remains eliminated from Stage 1; its source remains recoverable at commit `2fb4c779a2`.
- **Stage 3:** skipped. No candidate-comparison runner or paid comparison is justified after accepting the smaller-candidate fallback. If later behavioral evidence reopens the decision, the named discriminating probe is a frozen construct-only workpiece containing one consequential omission among otherwise supported process facts: compare whether the alternatives surface that omission before unsupported mapping, preserve a reference-only re-entry question without transcript archaeology, and avoid unsupported assumptions under the same model, tools, and stop rule.
- **Progressive disclosure:** no further split is earned. A paper walkthrough cannot establish model attention or retrieval strain and supplies no evidence that would meet the protocol's split threshold; word count alone remains insufficient.

The owner accepted this disposition and authorized removal of the losing alternative instruments.
