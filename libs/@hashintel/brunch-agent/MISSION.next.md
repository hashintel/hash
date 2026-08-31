Self-contained canonical capture repository for upcoming missions: what we currently think we know about what to do next — ideas, observations, questions, and named mechanisms already raised. Not execution authority. Implement against [`MISSION.md`](MISSION.md). Do not promote this file wholesale. Do not keep two live missions in one branch.

Plausible future missions are the ordered `# Mission N — …` headings. Imperative, Throughline, Proof, and Status wait until a cluster is cut into `MISSION.md`. Constraints, fog, and stop lines appear where prior discussion already earned them. Spikes, standing locks, out-of-scope decisions, and a live mission's leftovers get unnumbered headings — they are not fake missions. Update this file while planning context is active; it must carry full capture fidelity without relying on a transcript. When cutting or regrouping, compare this draft before and after: every item must either move into the live mission or remain here at the same fidelity.

Archived Mission 2 is the mechanical capture pipe. Mission 3 is closed with a split result: the real Flue runbook and elicitation-to-workpiece path is the accepted control, while real-model semantic construction failed at the provider-schema boundary. Its frozen prospective campaign contains one invalid runtime member and two valid independently graded members; the campaign adjudication is the comparison input, not permission to rewrite observed artifacts.

Live Mission 4 is the owner-led runbook/workpiece redesign in [`MISSION.md`](MISSION.md), tracked by FE-1563. Do not implement another numbered cluster on this branch. The detailed Mission 5–7 clusters below are provisional based on current evidence; Mission 4's manual redesign may alter their workpiece assumptions and join contracts before they are cut.

```text
M1 chat (done)    M2 mechanical capture (archived)    M3 runbook/workpiece (closed)
                                                            └─ frozen prospective control
M4 owner-led, research-informed runbook/workpiece redesign (live)
                                                            ↓ informs the prepared artifact and seam
FE-1476 delivery spine
├─ M5 traceable prebuilt workpiece → live SDCPN → provenance answer       beats 1–3
├─ M6 bounded reviewer re-elicitation → revised workpiece → scoped patch  beats 4–5
└─ M7 whole-story rehearsal → optimisation handoff                        beat 6

Other asynchronous evidence tracks, admitted only when their boundary is stable
├─ provider-visible Petrinaut schema path
├─ inferential observer-fold spike
├─ provenance interaction against a fixture manifest
├─ host-choice and session-lifecycle probes where they do not block the first tracer
└─ Chris/Yannis handoff contract
```

Parallel means separate issues, branches, or worktrees with their own mission authority, not several live missions in this file. A track is independently grabbable only after its input and output boundary is explicit. The shared contracts must be kept smaller than the work they coordinate; otherwise parallelism multiplies incompatible assumptions.

# FE-1476 delivery frame

This is the current milestone frame, not a mission. The delivery window is the end of next week from the 2026-08-31 planning session. The target is the six-beat September review-and-revise story:

1. Show a completed requirements artifact, pre-built from a prior elicitation; no live first interview.
2. A reviewer who is not the original expert examines the SDCPN projected from that artifact.
3. The reviewer asks why a part of the net was modelled that way and receives its provenance.
4. The reviewer conducts 3–5 turns of targeted re-elicitation against one section.
5. The net changes to match without an unrelated full rebuild.
6. The revised artifact is handed to Chris and Yannis for optimisation experiments.

“Requirements graph” does not yet name a settled implementation. The current neutral term is **evidence-backed workpiece**: an inspectable/exportable representation between conversation evidence and the SDCPN. It may prove to be versioned assertion clusters, a stronger Markdown workpiece, or another shape exposed by the first real projection tracer. Do not turn the label “graph” into a graph database, closed ontology, or typed fold before the consumer requires one.

The milestone requires three durable relationships even if their files or stores differ:

```text
conversation evidence → workpiece meaning
workpiece meaning → projection decision → SDCPN element
workpiece revision → bounded net change
```

The known delivery objects are therefore a workpiece, an SDCPN, and a provenance/derivation record connecting them to evidence. The known live operations are a provenance query and a bounded reviewer revision. Whether the provenance record is a standalone manifest or a view over persisted links remains fog.

## Confidence map

### High confidence — observed or owner-settled

- FE-1476's six beats are the milestone target.
- The production door remains Petrinaut panel → AI SDK transport → Flue `ChatAgent`; Brunch is a second assistant, not a replacement for the stock modeller.
- A Flue conversation can activate the packaged runbook skill, read phase-specific resources, and emit a recoverable Markdown workpiece.
- Mission 2 proved an idempotent, model-free capture pipe over real Flue history with source excerpts and empty payloads.
- Petrinaut owns net schemas, mutations, parser behavior, and simulation contracts; Brunch must consume those contracts rather than copy their field shapes.
- A parser-valid empty net is vacuous. Delivery requires non-empty semantic inspection as well as schema acceptance.
- FE-1476 requires a traceable relationship among net elements, workpiece meaning, and conversation evidence; complete production independence between those artifacts cannot satisfy the story.
- Ordinary elicitation turns must not wait on foreground semantic sweep/fold work or return to Condition 5's minute-scale latency.

### Medium confidence — plausible first mechanisms, not yet proven

- Stable, versioned, evidence-backed assertion clusters may be a sufficient workpiece without a comprehensive domain ontology.
- A model-assisted projector can consume those clusters and emit both canonical Petrinaut mutations and an auditable derivation record.
- Stable caller-supplied workpiece and net-element identifiers may be enough to keep a selected revision local.
- SDCPN recognition guidance can offer non-authoritative entity/relationship mapping hints without making those hints a required semantic schema.
- Reprojecting or reconsidering a selected region and applying a bounded patch may satisfy “the net changes without a full rebuild”; the exact internal scope permitted by the delivery owner is not yet pinned.
- An asynchronous observer may consolidate settled evidence without blocking the foreground and may feed the revision operation after an explicit flush barrier.

### Low confidence — must alter the next move

- The appropriate granularity and identity stability of consolidated assertions.
- Whether observer consolidation preserves prior supported meaning while incorporating corrections, qualifications, and conflicts.
- Whether SDCPN mapping hints help projection more than they bias evidence consolidation.
- Whether the live Flue/provider path can expose Petrinaut's canonical nested schemas to the model. The paid construction run went 0-for-9 on `addType.elements` and yielded an empty net.
- Whether model-assisted projection can revise one linked region without unrelated net churn.
- Whether a reviewer who is not the original expert may directly supersede prior meaning or only propose a revision.
- Whether net create/save/load provides the identity and continuity FE-1476 needs.
- Whether compaction preserves evidence/workpiece recovery; this is important beyond the short rehearsal but not yet earned as a blocker for the first tracer.
- The exact optimisation artifact and scenario contract Chris and Yannis require.

## Cross-milestone proof obligations

These obligations belong to the milestone. Each mission should take only the first unproven subset it can discharge through the real boundary.

1. **Workpiece sufficiency:** A cold reader can identify the model's objective, reconstruct the relevant operational account, distinguish evidence from inference/assumption, and locate consequential unresolved material.
2. **Projection fidelity:** The SDCPN is produced from the workpiece rather than by rereading the transcript as the primary model. Every consequential net region names the workpiece material and projection rationale that produced it.
3. **Evidence provenance:** A reviewer can start from a visible net element and reach the relevant current workpiece assertion or passage and its actual conversation evidence. Normalized model prose is not laundered into a user quotation.
4. **Revision integrity:** New reviewer evidence produces an inspectable workpiece revision that preserves prior supported meaning unless it is explicitly corrected, qualified, split, merged, or retired.
5. **Patch locality:** Applying the selected revision changes the intended net region, retains unrelated stable identities and behavior, and reports any necessary expansion of impact rather than silently rebuilding the world.
6. **Petrinaut acceptance:** The revised net satisfies canonical schemas, is non-empty, survives semantic inspection against the workpiece, and is usable by the optimisation consumer. Parser acceptance alone is insufficient.
7. **Interaction quality:** The reviewer can ask why and conduct 3–5 focused turns in the real panel without construction vocabulary taking over the conversation or observer work blocking ordinary turns.
8. **Failure visibility:** Provider-schema failure, observer lag if the observer is selected, unsupported projection, unresolved authority, and failed patch validation stop or visibly degrade the operation; none silently advances canonical state.

## Mechanism restraint

The target does not currently earn a comprehensive process-domain ontology, graph database, universal subject/predicate/value schema, deterministic capture-to-model fold, typed completion algebra, or full regeneration engine. Semantic interpretation is unavoidable; the design question is where it occurs and how it remains inspectable.

The current candidate separates three epistemic levels:

```text
what conversation evidence supports
what SDCPN-relevant structures guidance suggests might be present
what the projector actually represented in the net
```

The previous typed-map cluster (formerly numbered Mission 5) proposed required fields and unresolved gaps that would mechanically derive ask / construct / deliver. That remains a recorded hypothesis, not the new default. It re-enters only if the workpiece-to-projection tracer or construction-gap return demonstrates that model-assisted judgment cannot reliably name the smallest next question without typed demands.

Optional mapping hints are advisory. A workpiece item may have none or several; the projector may accept, reject, or defer them. Hints do not establish completeness and do not duplicate Petrinaut payload fields. If the first real tracer works from evidence-backed prose without hints, do not add them for symmetry.

# Retained teaching, workpiece, and seam backlog

Not missions. These are the self-contained research and prior-design findings that must remain available when a later mission is cut. FE-1476 changes their priority and gives provenance/revision a present consumer; it does not turn any proposed mechanism into observed fact.

## Universal teaching backlog and baseline-gated edits

The supported universal core is objective-relative interviewing: establish intended questions, audience, boundary, horizon, accuracy need, non-claims, and tolerance for assumptions; begin with one concrete occasion and walk it before generalizing; preserve expert statement, inference, assumption, unknown, not-yet-asked, conflict, correction, omission, and loss; treat divergence as information; spend questions by information value; and stop on evidence-bearing criteria rather than fluency, headings, fatigue, or turn count.

Candidate moves present in the research but without a reliable current home include:

- A closing clearinghouse probe: ask what important thing was not asked before any completion claim.
- An anchored-hypothetical precondition: vary a real narrated incident rather than inviting idealized policy through free-floating hypotheticals.
- A clairvoyant definitional test before recording a quantity: define it so perfect knowledge rather than judgment could answer it.
- Contrastive and discriminating probes, including expert-versus-novice contrast, to surface cues and operational distinctions.
- A long-range consistency probe using the full conversation rather than only adjacent answers.
- A depth policy that does not accept the first answer on a load-bearing fact, while avoiding a universal turn-count rule.
- A guard against vague elicitor questions; the literature synthesis identified question vagueness as the most frequent human-interviewer mistake in its cited sample.
- Explicit exception and absence sweeps rather than treating unmentioned material as absent.
- Declined-to-answer, deferred, unknown-to-user, not-yet-decided, not-applicable, and explicitly absent as different outcomes. The current runbook IR has no clean exercised home for all of them.
- An anti-leading guard and premortem phrasing for failure-focused objectives.
- The correction discriminator: ask whether a new account corrects the old one or whether both apply under different conditions.

Known duplication and vague guidance should constrain edits. Caveat/rabbit-hole prose overlaps failure catalogs; the restatement rule appears in several homes; typology children duplicate the last-time probe; and failure lists already repeat source catalogs. “High appetite,” “several turns produce nothing new,” and “deepen before recording” are too vague unless tied to observable behavior or an end state. Do not grow a second catalog to fix those problems.

The main unresolved teaching calls are placement and dosage, not whether the concerns exist: the 2–4 batching guidance failed to prevent 4–10-question opening batteries because both runs asked before reading `elicitation.md`; one-question versus small shared-frame batch remains unsettled; posture collection can become an intake form; clarification versus deeper case probing remains situational; quantitative/tail scripts, closing cadence, and assent semantics need discriminating probes. The frozen prospective baseline must remain unchanged long enough to measure the current package. Teaching edits follow or run in a separately versioned campaign; they do not silently contaminate the baseline.

## SDCPN investigation backlog

The objective-relative investigation floor is a known slice with named holes, not every IR heading or a complete semantic model. Candidate guidance should preserve these obligations in operational vocabulary:

1. Intended decision/comparison/worry, audience, boundary, horizon, accuracy need, and what the model must not claim.
2. One concrete occasion from trigger to end, including what flows, prerequisites, main activities, ordering, and outputs.
3. Per load-bearing input, distinguish consumed, reserved then released, or merely read/inspected; for scarce reusable inputs, ask capacity and simultaneous-demand behavior.
4. Who or what decides branches and contention; distinguish written policy from practiced behavior and retain overrides, retries, failures, recovery, and conflict.
5. Objective-relevant timing, typical and tail behavior, hidden waits, calendars, arrivals, directional losses, grouping/splitting, thresholds, and changing conditions.
6. Expert evidence, assumptions, unknowns, not-yet-asked items, conflicts, corrections, omissions, and projection limits without hardening assent, policy, hedges, or incidents into precise practiced values.
7. What observation would make the result trustworthy and which operational alternatives the expert wants compared.
8. A reconstructable process spine sufficient for construction to name the smallest consequential gap rather than fill it silently.

Typology decisions remain provisional and strain-gated:

- Keep the six current question shapes. Complete Grouped movement, whose questioning is thinner than its siblings.
- Strengthen Timed work to distinguish working from waiting before adding hidden waiting as a separate typology.
- Split Mode change's directional loss into time, material, availability, and what cannot run next.
- Threshold crossing does not cover condition-dependent duration, failure, or loss rate. Add the operational probe “does its state change how long or how often?” under properties/time or continuous-change guidance before promoting a new default type.
- Treat external arrival/demand as an explicit throughput trigger before adding a seventh default typology. Promote only if prospective throughput cases repeatedly omit arrivals.
- Do not add queue/waiting, priority/deadline, or escalation/approval typologies merely because those distinctions can matter; they currently overlap existing resource, branch, trigger, and lens guidance.
- A numeric threshold is mandatory only when the expert uses one or the objective depends on it; a judgeable objective does not always require a number.
- Unclear release of a reserved scarce resource is a construction blocker when alternate semantics change the objective; otherwise retain a conspicuous assumption.

The short candidate return-to-elicitation list remains: missing objective; missing spine; unclear fate of a capped resource; policy without practiced contention; missing arrival account under a throughput objective; or missing tail behavior where the objective depends on tails. Mission 3 did not exercise this loop, so the list is a probe, not typed completion.

The adversarial probe catalog remains available: policy versus practice; shared-resource contention; hidden waiting stored as processing time; directional changeover loss; a rare incident mistaken for a rate; unknown distribution forced into a named family; grouped work that may split; and a continuous quantity that crosses no threshold while still changing a relevant rate. Newcomer, borderline-case, same-situation/different-objective, evidence-order perturbation, and true correction after apparent readiness are useful additions. Probe metadata should distinguish acquisition miss, conservation miss, and simulator nondisclosure.

The `Transform to PN` children still belong conceptually to construction, but two historical runs did not show vocabulary leakage. Move them only in an instrumented teaching variant; survival is weak evidence, not a license to keep duplicate construction knowledge indefinitely.

## Workpiece structure hypotheses and observed strain

Observed in both real Mission 3 artifacts: the Markdown IR was composed wholesale near the end rather than maintained incrementally. The six-mark epistemic vocabulary was useful, but labels did not prevent agent-authored values from reading like expert testimony or never-asked material from being filed as user unknowns. `Situation notes` aided retrieval and also duplicated other sections. `Projection losses` mixed elicitation gaps, construction choices, and genuine representational loss; the loss register should open at construction rather than speculate during elicitation. Assumptions often omitted the required reason and how-to-check. Inline and bulk unsettled marks had no authoritative home. “Not applicable” and “declined” were not exercised. Context-dependent quantities, especially directional values, were difficult to reconstruct from flat prose.

Candidate structures remain hypotheses:

- **A — case/process spine plus epistemic ledger:** one concrete flow carries operational context; a light ledger is the sole home for unresolved claims, assumptions, conflicts, and next questions.
- **B — entity/resource-centric register:** repeated entries make per-entity, product, direction, and quantity context easier to locate, at the cost of more semantic organization.
- **C — current shape split by authorship and phase:** retain broad headings but distinguish expert-given, agent-assumed with reason/check, construction-decided, elicitation gap, and construction-opened loss. This is the lowest-change control.
- **D — append-only journal:** retained only to bound the design space. It conflicts with the current maintained-workpiece intent and has no observed correction lifecycle strong enough to justify its cold-reading burden.
- **Objective slices, cases, then residue:** organize around the questions the model must answer, with supporting cases, evidence, assumptions, blockers, validation, and smallest next questions. This remains an alternate emphasis rather than a proven winner.
- **Versioned assertion clusters:** the current FE-1476 conversation adds this candidate: coherent evidence-backed prose units with revision lineage and optional advisory mapping hints. Its granularity and stability remain low-confidence.

A transcript-blind reviewer should be able to state the objective; reconstruct the process and order; separate expert evidence, inference, assumption, unknown, and conflict; name unresolved contradictions; identify the smallest next questions; judge construction readiness without inventing the spine; and spot-check a claim's epistemic standing and typical-versus-tail shape. Historical cold reviews now calibrate some of these tasks, but successive revision and observer-fold behavior remain untested.

Keep objective, boundary/horizon, concrete cases, practiced-versus-prescribed distinctions, contextual quantities, resources/contention, assumptions, conflicts, omissions, validation, and named losses. Move PN transformation knowledge into construction. Rewrite phase-mixed gap/loss material and formulaic closing claims. Cut duplicate summaries only after one authoritative home is proven.

Rejected mechanisms retain their re-entry conditions:

- Closed kind catalogs, slots, demand rows, and precision ladders re-enter only if the projector repeatedly cannot find consequential meaning in evidence-backed prose and advisory hints.
- Typed completion algebra re-enters only if evidence-based checks repeatedly allow unsupported readiness or cannot name the smallest next question.
- Per-statement epistemic enums re-enter only if prose/revision discipline repeatedly launders authorship or uncertainty despite targeted checks.
- Typed per-capture loss categories re-enter only if projection decisions cannot be audited through an explicit construction-opened loss account.
- Capture envelope → typed fold, `firesWhen`, motif/plugin/repertoire runtime, and one-artifact merger remain rejected until a real second consumer or observed failure requires their mechanism.

## Prior capture/workpiece seam hypotheses and unrun probes

The prior research compared four relationships; FE-1476 does not erase their evidence:

- **A — complete production independence:** zero Condition 5 exposure and fully consistent with Missions 2–3, but cannot by itself answer FE-1476's required net-to-evidence provenance query. High synthesis fan-in and high context dependence would still support independence outside the delivery-specific derivation record.
- **B — support links only:** the smallest prior join, improving auditability without making capture the workpiece. Offline links require only evaluation-local statement identity; durable live links require workpiece identity stable across revisions. FE-1476 currently makes this family the nearest relevant hypothesis, but does not decide its storage form.
- **C — capture fold proposes workpiece updates:** presupposes semantic interpretation, ordered lifecycle, and update authority. It was unproven and carried more Condition 5 exposure. The inferential observer spike is a new, asynchronous version of this question, not proof that the fold is warranted.
- **D — one artifact:** capture payloads and editable workpiece entries merge. This remains refused because immutable evidence and editable semantic synthesis have different lifecycles and because it most closely recreates the prior latency/complexity failure shape.

The prior offline shadow join remains an available non-critical-path probe: run Mission 2-style capture over a settled Mission 3 range, assign temporary ids to material workpiece statements, and grade evidence relation, epistemic treatment, lifecycle relation, and projection treatment separately. Do not collapse these into one mutually exclusive class or count explicit assumptions as evidence support.

Useful measurements remain support coverage, synthesis fan-in, capture utility, context dependence, correction integrity, path sensitivity, and link churn across workpiece revisions. High coverage with fan-in near one and low context dependence weakens complete independence and supports links. High fan-in/context dependence supports keeping evidence ledger and semantic workpiece distinct. A fold becomes plausible only if order perturbation yields equivalent active meaning without in-loop latency and if the elicitor does not need to consult every fold. Deeper merger would require capture idempotency and editable-workpiece semantics to agree across correction, split/merge, and revision—currently unlikely.

The former recommendation was production independence plus offline shadow mapping. FE-1476 supersedes independence only as a sufficient **delivery posture**, because visible provenance and revision are now owner-required. It does not prove a capture-store fold, one-artifact merger, live in-loop support linker, or comprehensive statement-identity system. The observer and derivation-record tracks are the smallest new probes against that changed obligation.

# Mission 5 — traceable projection through the real panel

The first unproven boundary is not a complete requirements graph. It is one evidence-backed workpiece item becoming one semantically meaningful live-net region whose provenance a reviewer can inspect through the production panel.

A candidate tracer uses a fixed prior conversation and a deliberately prepared minimal workpiece item. The Brunch agent consumes that item, invokes the canonical Petrinaut client-tool path, creates or updates one non-empty net region with stable caller-supplied ids, records the derivation from workpiece item to net elements, and answers one “why was this modelled this way?” query by returning the workpiece account plus actual evidence excerpts. The tracer must not reread the whole transcript to invent the answer.

Only after that path works should the mission broaden to the completed prebuilt workpiece and SDCPN needed for beats 1–3. A hand-prepared or one-off model-assisted fixture is legitimate for the first tracer if its provenance is explicit; pretending it is the final observer output is not.

## Constraints already earned

- Use the real Petrinaut panel, AI SDK transport, Flue `ChatAgent`, and existing `onToolCall` client execution. Do not create a second UI, server, or direct canvas bypass.
- Brunch prompting and recognition guidance remain Brunch-owned. Petrinaut schemas and payload shapes remain Petrinaut-owned and must be imported or generated mechanically.
- Start with the smallest canonical mutation subset that crosses the tracer. Do not absorb the stock modeller's full 46-tool catalog.
- The model may interpret evidence-backed prose. Do not disguise that inference as deterministic compilation.
- A derivation record must name workpiece item revisions, evidence references, net element ids, and projection rationale. Its exact storage shape is fog until the tracer exposes what the panel and revision consumer need.
- Construction success requires provider-visible schemas, non-empty output, semantic correspondence to the workpiece, and no unsupported consequential defaults.
- Stable ids must be exercised across at least one repeat projection or edit. Do not assume model-minted identity survives.
- The initial tracer does not require the asynchronous observer, a generic assertion fold, compaction, remote deployment, or a complete optimisation model.

## Fog-line

- Whether the current Markdown workpiece can host a stable evidence-backed item or whether a separate versioned assertion-card artifact is the smallest sufficient input.
- Whether the live client-tool route already exposes canonical Petrinaut schemas in a provider-visible form, avoiding the failed headless Valibot `looseObject` + `rawTransform` bridge. If not, determine whether Flue can accept Standard Schema or supplied JSON Schema, whether a shape-preserving Zod-to-Valibot conversion is the smallest path, or whether this is an upstream Flue requirement.
- Repair-loop behavior after canonical schema rejection: correction budget, stop condition, and whether provider-visible shape plus rejection messages are sufficient to recover from the recorded 0-for-9 failure.
- Petrinaut-core's file-format schemas and `action-schemas.ts` are separate families aligned by hand. The tracer depends on that alignment; a mismatch routes upstream rather than becoming a Brunch prose copy.
- Whether consuming the current last-`runbook-ir`-fence scrape is sufficient for the tracer or the evidence-backed workpiece becomes the first durable consumption contract. This interacts with compaction but does not justify designing persistence before the first projection.
- The smallest net region that is semantically meaningful and visually inspectable rather than a toy place/transition pair.
- How a reviewer identifies a net element for a provenance question: click context, explicit element name/id, or another existing panel affordance.
- Whether the derivation record travels with the workpiece, the net, or as a generated companion manifest.
- Whether a full desired net may be recomputed internally if only the stable diff is applied, or whether the delivery contract requires genuinely local projection computation.
- How much host-choice UI is necessary for this tracer versus a fixed Brunch mode.

## Stop or reorient

- Stop if the tracer requires inventing the complete assertion ontology before one item can project.
- Stop if canonical Petrinaut schemas must be manually copied into Brunch.
- Stop if the agent can only construct by rereading the transcript rather than consuming the workpiece item.
- Stop if provenance is generated as plausible prose without mechanical links to retained evidence.
- Stop if parser success can pass on an empty or semantically unrelated net.
- Stop if the first repeat projection churns unrelated identifiers and the smallest identity pin cannot explain why.
- Stop if panel integration requires Brunch-specific logic inside the Petrinaut library rather than an application-level or generic host extension.

# Mission 6 — bounded reviewer revision to scoped net patch

After Mission 5 establishes one traceable projection, the next mission proves beats 4–5: a reviewer who is not the original expert conducts one bounded 3–5-turn re-elicitation against that region; the system records a source-linked revision of the relevant workpiece meaning; and the Brunch agent applies a validated patch whose impact is limited to the linked net region or explicitly widened with a reason.

The mission should begin from the Mission 5 artifact and one deliberately chosen revision with observable consequences. It is not a general correction platform. The chosen revision must be rich enough to distinguish simple overwrite from qualification, contextual coexistence, conflict, or genuine supersession; otherwise it will not test the workpiece's claimed value.

The mechanism that creates the workpiece revision remains fog. The observer spike informs but does not block the choice and need not succeed. Candidates are an explicit phase-boundary synthesis by the foreground agent, an asynchronously consolidated assertion revision if the spike earns promotion, or the smallest combination that preserves evidence and meets latency. The mission does not assume a generic deterministic fold.

## Constraints already earned

- Ordinary review questions stay on the foreground runbook path and do not wait for semantic sweep/fold work.
- Before canonical workpiece or net state changes, all evidence required for that revision must be durably present and the responsible interpretation must be explicit.
- Preserve the previous workpiece revision and its evidence. A new account must not erase history merely because it is more recent.
- Reviewer authority must be represented honestly. A tentative proposal or unresolved contradiction must not silently become canonical expert truth.
- The patch consumes the current workpiece revision and current net, not the transcript as an unbounded fallback.
- Existing net ids outside the declared impact remain stable. New ids and impact expansion are reported.
- Validate through Petrinaut's canonical contracts and inspect semantic behavior against the selected revision. Tool-call success is not patch success.
- Do not make the observer, capture store, and workpiece one artifact merely to shorten the path.

## Fog-line

- Whether the reviewer can commit corrections directly, creates proposals pending confirmation, or has authority that varies by statement.
- Whether assertion-card revisions are stable enough across observer or foreground synthesis to anchor projection links.
- What counts as a sufficiently local patch when one operational change legitimately affects several connected net elements.
- Whether a selected workpiece item plus its linked net neighborhood gives the projector enough context without the full workpiece.
- Whether mapping hints should be persisted on workpiece revisions, generated after consolidation, or omitted because projection rationales suffice.
- The explicit synchronization point for an asynchronous observer: forced tail sweep and queue flush before revision commit is the current candidate, not a settled mechanism.

## Stop or reorient

- Stop if the revision path requires every conversation turn to block on extraction, typing, fold, completion, and projection.
- Stop if a changed prose item causes unrelated net regeneration with no detectable impact boundary.
- Stop if the reviewer can accidentally launder uncertainty into authoritative correction.
- Stop if previous evidence or projection rationale disappears after revision.
- Stop if the implementation grows a comprehensive semantic ontology to support one selected correction.
- If an observer is selected, stop if its failure or lag can produce a patch from stale evidence without a visible barrier.

# Mission 7 — complete FE-1476 rehearsal and optimisation handoff

After traceable projection and bounded revision are separately proven, broaden only enough to rehearse the complete six-beat story with the prebuilt artifact, the reviewer-facing panel, the selected revision, and the optimisation handoff.

This mission owns integration breadth and staging, not a new semantic architecture. It should make a human witness able to decide whether the story works from the visible panel and exported artifacts. It may absorb only the host continuity and presentation work the rehearsal exposes as necessary.

The completed artifact need not represent every Vestera fact. It must carry a coherent objective-relative slice sufficient for the selected SDCPN and optimisation experiment, with assumptions, omissions, and projection losses visible. The handoff must name what Chris and Yannis can run, which scenario/parameters accompany the net, and which claims remain provisional.

## Constraints already earned

- Keep the stock Petrinaut assistant working when Brunch is unavailable or not selected. Brunch remains a second assistant.
- The panel stays on `useChat` / `onToolCall`; do not rewrite it onto `@flue/react`.
- Do not splice stock and Brunch conversations. A mode choice may route them, but their histories remain distinct.
- Use the prebuilt artifact for the first beat; do not turn the rehearsal into a live first interview.
- No remote exposure while FE-1423's authentication, telemetry, state-versioning/backup, and restart-durability gates remain open. A local or preview rehearsal must be labelled accordingly.
- The optimisation handoff uses Petrinaut's published artifact/scenario boundary rather than coupling the two libraries.
- Presenter-grade polish follows proof of the visible state changes; it cannot substitute for them.

## Fog-line

- The exact picker location and whether mode can switch mid-net or only at start.
- Whether net id is a sufficient conversation discriminator for the rehearsal. Current localStorage maps conversation ids by `netId`, but save/load identity has not been proven.
- The smallest provenance presentation: answer in chat, linked detail panel, net-element selection, or exported manifest view.
- The exact artifact, scenario, parameter, and execution assumptions required by Chris and Yannis.
- Whether the delivery is local, preview-deployed, recorded, or live. Remote production gates do not disappear under deadline pressure.
- Which semantic checks are required before optimisation may treat the net as credible.

## Stop or reorient

- Stop if rehearsal defects expose a missing contract in Missions 5–6; fix the shared boundary rather than scripting around it in the demo.
- Stop if host choice rewrites or destabilizes the stock assistant.
- Stop if the handoff consumer must reconstruct model intent from the original transcript.
- Stop if optimisation runs against a net that passed only parser shape and not the workpiece-specific semantic checks.
- Stop if deployment bypasses the ratified remote-release gates.

# Parallel and asynchronous proof tracks

These tracks can begin before the numbered mission that may consume them. Product-changing tracks still need their own issue, branch, and mission when implementation begins. Results are evidence inputs; they do not silently rewrite another branch's authority.

| Track | Can start from | Produces | Join gate | Does not block |
| --- | --- | --- | --- | --- |
| Frozen prospective baseline | Completed Mission 3 control: one invalid runtime member and two valid graded members | Immutable artifacts plus campaign adjudication | Mission 4 consumes the observed range before freezing or claiming improvement of its candidate instrument | Mission 5's projection tracer |
| Inferential observer fold | Fixed historical transcript and expected source excerpts | Evidence-backed consolidated revisions plus latency/failure observations | Decision report before Mission 6: admit observer-derived state only if evidence preservation, ordering, latency, and flush behavior pass; otherwise select foreground phase-boundary synthesis or reorient | Missions 4–5; Mission 6 is informed by this spike but does not require it to succeed |
| Provider-visible schema path | Existing failed paid run, canonical Petrinaut Zod schemas, live client-tool route | One real-model canonical nested tool call or a crisp upstream blocker | A successful canonical call admits Mission 5 construction; a crisp upstream blocker triggers Mission 5 stop/reorientation and does not count as satisfying the join | Baseline and Mission 4 redesign |
| Provenance interaction fixture | Fixed workpiece item and a tiny versioned derivation-record fixture | Reviewer-visible “why?” interaction | Freeze the smallest fixture contract before Mission 5 projection and UI branches diverge; both must consume that exact version | Provider/model construction while fixtures are used honestly |
| Host choice/session lifecycle | Existing panel routing and localStorage net/conversation mapping | Smallest proof of Brunch selection and resume for the selected artifact | Selected artifact resumes the same Brunch history, a new net starts distinct history, and stock mode remains unaffected | One fixed-mode Mission 5 tracer |
| Optimisation handoff | Existing Petrinaut artifact/scenario formats and stakeholder conversation | Written consumer input/output contract and one accepted fixture | Required before Mission 7 declares handoff | Missions 4–6 implementation |
| Simulation-backed semantic check | Hermetic non-empty net and selected workpiece expectations | Qualitative behavior comparison | Promotes into delivery only if cheap enough and discriminating | First provenance tracer |

The first shared interface candidates are deliberately small and provisional:

```text
EvidenceBackedWorkpieceItem
DerivationRecord
NetPatch
```

Do not freeze richer names or field catalogs before two tracks need them. If fixture UI and projection code cannot agree on the minimal derivation record, that disagreement is the next design evidence and parallel work pauses at that seam.

# Inferential observer-fold hypothesis

Not yet a mission and not part of the current production path. It is a candidate parallel spike whose result may supply Mission 6's revision mechanism.

The observer is the candidate semantic sweep mechanism, not a harness counter parked under that label. It is a separate model-assisted editor over settled conversation ranges, neither a deterministic reducer nor the foreground elicitor calling a sweep tool. It receives new evidence plus the previously committed consolidated understanding and may rewrite coherent assertion-sized units using inference. This intentionally front-loads some interpretation while avoiding a comprehensive semantic typology. The binding may still execute the mechanical capture-store `apply-sweep`; the foreground model must not decide when to invoke it.

A candidate consolidated item remains semantically open prose with generic mechanics only: stable id, revision, title/body, supporting evidence spans, unresolved material, lineage/change account, and optional target-formalism mapping hints. Fields such as `resource.capacity`, `shift: day`, or universal `subject/predicate/value` are not assumed. The right assertion granularity — neither atomic fragments nor one giant process digest — is itself part of the spike.

## Mechanical shell around inferential semantics

- Count eligible unscheduled tokens without a model call. Arm after an observed threshold; precedent is on the order of 10,000 tokens, not a locked value.
- Trigger on the next valid settled agent boundary. In Flue, `useAgentFinish` is the known “would stop” seam and also fires on `terminate: true` suspension, so the pending-affordance guard is load-bearing. Do not bind the architecture to an unverified Pi event name.
- Keep separate `scheduledThrough` and `foldedThrough` high-water marks so a lagging queue does not schedule overlapping ranges.
- Calls are asynchronous relative to the foreground, queued in semantic order, and retried on failure. A later range cannot commit against a state that excludes an earlier required range.
- A failed provider call may be retried from the same range and base revision. If a model result exists but persistence fails, retry the stored candidate commit rather than calling the model again and obtaining a different interpretation.
- Commit the observer result, revision lineage, and folded high-water mark atomically. Once committed, reinterpretation creates a new reviewed revision; it does not silently replace the old one.
- Ordinary elicitation reads neither the pending queue nor every fold. A compact re-group may occur after a larger token interval, on resume, before phase transition, or before revision commit; the prior `every XX tokens` notation named the idea, not an earned threshold.
- Mission 6's likely barrier is a forced tail sweep and queue flush after the 3–5 reviewer turns. This is a hypothesis to prove; the threshold alone may never fire during such a short review.
- If retries exhaust, mark the queue blocked, retain later ranges, and expose staleness. Questions may continue, but canonical revision or projection must not proceed from silently stale evidence.

## Semantic obligation

The observer may consolidate, qualify, split, merge, or rewrite assertions through inference. The safety claim is not deterministic replay. It is that every committed revision remains auditable against the prior revision and real evidence.

A useful oracle compares:

```text
previous consolidated meaning + newly disclosed evidence
against
new consolidated meaning
```

It asks whether prior supported meaning survived unless explicitly changed; new evidence was incorporated; hedges and context remained; corrections affected only what they corrected; conflicts were not harmonized away; unsupported specificity was marked; and every material statement is supportable or explicitly inferential.

The existing elicitation-to-IR ruler and cold reviewer can seed this oracle, but they have not tested successive observer revisions. Path/order perturbation and a true correction are required before confidence rises.

## SDCPN recognition hints

The layer of SDCPN guidance that may later become plugin policy can name entity and relationship lenses plus tips, heuristics, motifs, distinguishing questions, common traps, and candidate projection relevance. Examples include things that flow, work that changes them, reusable constrained inputs, accumulation/waiting, operating conditions, arrivals/departures, reservation/release, consumption, blocking/enabling, routing, grouping/splitting, contention, and condition-dependent rates.

These are attention and mapping hints, not a comprehensive domain ontology or mandatory assertion schema. An assertion revision may carry no hints or several competing hints. A hint must identify the prose it refers to and explain why; the projector records whether it accepted, rejected, or deferred it. Hints do not copy Petrinaut payload fields, establish completeness, or dictate topology.

Evidence consolidation and SDCPN hint annotation remain logically separate even if the first spike emits both in one model response. The observer must first preserve the operational account, then annotate possible relevance. If hints bias consolidation or can be regenerated independently, split them into a later asynchronous pass.

## Spike evidence that would justify promotion

- Two or more settled ranges fold in order into coherent versioned items with valid evidence excerpts.
- An injected transient failure retries without duplicate commits or skipped evidence.
- A real ordinary foreground turn does not wait for observer completion and remains in the healthy teaching-turn latency class.
- A forced flush makes a short revision tail available before canonical workpiece update.
- A correction, a contextual qualification, and a conflict each preserve prior history rather than overwriting by recency.
- A cold reviewer can trace the consolidated revision to evidence and identify any unsupported inference.
- Optional SDCPN hints improve or focus projection on at least one case without degrading assertion fidelity; otherwise omit them.

## Stop or reorient

- Stop if the observer needs the full target ontology before it can preserve one coherent account.
- Stop if foreground questions block on observer calls or consult every intermediate fold.
- Stop if queue ordering requires a second conversation/event log beside Flue history.
- Stop if retry can duplicate or silently replace a committed interpretation.
- Stop if consolidated revisions lose prior supported meaning or launder observer prose into user evidence.
- Stop if mapping hints become required semantic slots, completion accounting, or copied Petrinaut schemas.
- Stop if the observer directly mutates the net; its first candidate role ends at evidence-backed workpiece revision.

## Extraction thickness retained from the prior draft

Mission 2 proved the pipe with no extraction model: one envelope per user utterance, quote equal to that text, payload `{}`. That remains the floor.

Progressive re-entry remains an evidence ladder rather than a destination:

1. Stub envelopes — proven.
2. A separate cheap extraction call producing quotes or opaque blobs without slot types or kind mapping — the prior unadmitted rung. The current observer spike extends this rung into inferential evidence-backed consolidation and must prove that the extra judgment pays for itself.
3. Closed typed claims or plugin proposal catalogs — the prior Condition 5 failure shape; re-enter only if a present consumer proves prose-plus-hints insufficient.

Subagents remain undecided as a product mechanism. The specific prior idea was micro-cognitive specialists for decisioning and decomposition, not a floating multi-agent architecture and not the observer scheduler itself.

# Delivery-adjacent host continuity

These concerns were previously grouped as Mission 4. The FE-1476 spine now pulls only the minimum host work into the numbered mission where the real story requires it; the remainder stays here.

## Two brains, same panel

A person using the Petrinaut demo should be able to choose the stock modeller or the Brunch Flue agent without relaunching. Today the switch is `yarn dev` versus `yarn dev:brunch`.

**Locked.** Brunch is a second assistant, not the new Petrinaut modeller. Panel stays `useChat` / `onToolCall`. Do not splice conversations. Stock must work with brunch-agent down. HASH embed stays stock unless opted in. Do not rewrite the panel onto `@flue/react`.

**Fog, still unasked at the real boundary.** How both backends share an origin; where the picker lives; whether switching mid-net is legitimate or selection occurs only at start. Mission 5 may use a fixed Brunch mode; Mission 7 owns only the choice the rehearsal needs.

## Net create/save/load as session lifecycle

**Working assumption.** Petrinaut net id discriminates one Flue conversation per principal. Prove only when the review/resume path needs it: save/load keeps the same conversation; a new net id mints a new one. If net ids regenerate or collide, drop the assumption and rekey.

**Facts.** Conversation ids today are a localStorage map keyed by `netId`. New session means mint another conversation id; resume means reload the same net. Archived Mission 2 keys capture by Flue conversation identity (principal + conversation id) until this proof lands.

**Locked.** Net id is only the conversation discriminator. A distinct Brunch target-document stays later. Do not collapse “one net is the target-document”; that is an unearned product ontology and would leak into HASH entity versus demo localStorage. Two alternatives remain rejected: collapsing the net into the target-document, and sweeping into a throwaway store to splice later.

## Compaction

Prove the panel and transcript reconstruct across a real Flue compaction boundary (`compaction-vs-durable-history` / FE-1386) before claiming durable long-running provenance. Compaction is Flue-default and unpinned. Product control to compact or show a summarized range waits for that pin.

The current runbook recovers its workpiece by scraping the last `runbook-ir` fence from Flue history. A compaction boundary that summarizes the fence away breaks that pattern. FE-1476 may avoid crossing a compaction boundary during the short rehearsal, but the exported provenance package must say whether it depends on live uncompacted history.

Compaction is history reconstruction, not prompting. Do not use it to sequence the first traceable projection unless the real rehearsal crosses it.

## Voice

Voice is a git parent and integration constraint, not a delivery mission here. Stack on `kostandin/h-6763-openai-canonical-speech` when that branch is the parent. Use the same `POST /api/chat` dock Mission 1 named. Resolve UUID-per-net versus `petrinaut-preview:${netId}`, stolen versus configured `/api/chat`, and `submitText` with no `brunch_ask`. Brunch owns no provider audio.

# Later / opportunistic tracks

These are not sequenced on the FE-1476 critical path. They may ride a live mission only when its real throughline already exposes the hook.

## Observability / eval / tracing

Node OTel SDK → HASH collector / Tempo. Flue `instrument(...)` already exists in `app.ts`, but nothing exports. Prove `gen_ai.conversation.id` equals the Flue instance id. `dispatch()` on `/api/chat` does not propagate `traceparent`. Content capture stays off until a privacy policy. FE-1505 / FE-1423 remain production gates.

Do not make broad OTel a proof bullet of Mission 5. Capture only the latency and tool evidence needed by the tracer; remote release remains separately gated.

## Watch simulated conversations

Parallel spike, not a mission. The product itch is that simulated conversations are not visually observable. Driver remains `@flue/sdk` JSON (`createFlueClient` → `send` → `wait` → `history()`), not PTY polling. Human observer is the same conversation URL. `:4321` already follows a conversation through `useFlueAgent` but only paints text; rendering `dynamic-tool`, `data-*`, and skill activation would make it useful.

The missing capability is a second observer on the same conversation URL, not a new protocol. Herdr panes are PTYs, not browsers. Do not wait for a Herdr webview or couple every simulation to Petrinaut panel client tools.

## Simulation-backed construct check

Nothing yet proves that a non-empty parser-valid net behaves like the workpiece. Candidate oracle: Petrinaut's simulation engine runs the net against qualitative expectations retained with the selected objective and compares behavior. The hermetic side-quest net is a fixture; the empty paid run is not.

This can run as a parallel feasibility track. Promote it into FE-1476 acceptance only if it gives a cheap discriminating check for the selected revision. Otherwise retain non-empty semantic inspection and make the limitation explicit at handoff.

## AI SDK 7 `HarnessAgent`

Undecided. It is the converse of the current door—resume a harness session by chat id. Flue already owns that session; `transport-aisdk` is the UI adapter. A Pi / Claude Code harness would be another substrate, which `binding-flue` isolates, or a Flue replacement. It is not the watch-sims surface and not part of FE-1476 without new evidence.

# Mission 3 close record and carried inputs

Mission 3 locked one off-canvas PN JSON result, Petrinaut validation, manual load as sufficient inspection, and no canvas tools. It closed with the runbook/workpiece path accepted and real-model semantic construction false on the exercised route.

- The runbook skill packages and discloses universal elicitation, the Markdown workpiece, PN construction, and checks through the production Flue agent.
- Two historical real runs remain calibration only. The frozen prospective campaign contains one invalid runtime member and two valid independently graded workpieces; its authoritative range and dispositions are in `docs/evidence/evaluations/vestera-prospective-baseline-v1/campaign-adjudication.md`.
- Opening overload of 4–10 numbered questions appeared in both historical runs but did not recur in either valid prospective member. The system/resource placement question remains unresolved; do not turn either observation into a universal rule.
- One-shot construction ran 162–271 seconds, a distinct budget from healthy 5–23 second teaching turns.
- The validated construction side quest proved packaging, canonical callback validation, and a hermetic non-empty net. Its construct-only agent mounted exactly `getLatestNetDefinition`, `addType`, `addParameter`, `addPlace`, `addTransition`, and `addArc` through immutable Flue `initialData`; those tools remained absent from ordinary panel conversations. The one paid real-model run failed because provider-visible schemas erased nested shape: nine `addType.elements` calls encoded the array as a string. Parser acceptance of the resulting empty document was vacuous.
- Construction-discovered-gap return was unexercised. The agent delivered `partial-with-named-gaps` rather than asking the smallest next question.
- Periodic PN generation, programmatic loading, and a validated live patch remain successor concerns; they are not retroactive Mission 3 success.
- The six `Transform to PN` children still reside under elicitation despite construction owning that knowledge. Move them only in a teaching variant or mission that can observe the effect.

The close decision is “runbook/workpiece path accepted; real-model semantic construction false.” Do not rewrite Mission 3 as if all original proof items passed. Its falsified construction route is now Mission 5's first boundary.

# Standing decisions

Not missions.

## Ownership and teaching mechanism

One real Flue skill remains the teaching mechanism. Do not grow a skill catalog. A concise always-on instruction routes to the skill; its body carries lifecycle procedure and its supporting resources disclose elicitation teaching, the workpiece, PN construction, and checks as needed. Flue `useSkill` is not always-on `useInstruction`, and runbook teaching may incorporate repertoire content without restoring the core YAML runtime or plugin keys.

Ownership boundaries:

- **Prompting and recognition guidance are Brunch-owned.** Interview policy, tips, heuristics, motifs, candidate entity/relationship lenses, and “how to build” prose live here. The latest `petrinautAiPrompt` is coverage evidence, not text to copy; its interview and “make it up” policy do not govern Brunch elicitation.
- **Contracts are Petrinaut-owned.** TypeScript API contracts and payload shapes for nets and Petrinaut are consumed by import or mechanical generation, never hand-copied. FE-1516's one-day prose drift remains the counterexample.
- **Skill packaging is Flue-owned.** An authored skill directory is statically imported through its bare `SKILL.md` specifier and mounted with `useSkill`; no custom frontmatter parser, hand-enumerated resource list, or source-relative runtime reads.
- **Assertion mechanics, if proven, are harness-owned; SDCPN hints are target-formalism policy.** Scheduling, evidence spans, revision lineage, storage, and failure semantics must not know `resource`, `shift`, `place`, or other SDCPN concepts. Optional hint vocabulary is injected guidance and remains advisory.

The universal ↔ SDCPN provenance migration remains an editorial practice recorded per edit, not automation. Mission 3 exercised it zero times on new real evidence.

## Capture and workpiece relationship

Current production paths remain independent because no join has been proven. Mission 2's `apply-sweep` still writes model-free envelopes with empty payloads; the runbook path still writes no capture state. FE-1476 now supplies a concrete reason to test a narrow relationship: evidence-backed workpiece meaning must support provenance and revision. That requirement does not ratify the previous designed two-artifact join, a one-artifact capture/workpiece merger, or an idle capture store waiting for types.

Three premature convergence shapes remain refused:

- A comprehensive capture ledger → typed workpiece fold designed before one real assertion-to-net tracer.
- One artifact where a sweep payload is automatically the canonical workpiece update.
- Restoring kinds, slots, precision grades, completion algebra, plugin runtime, or repertoire YAML as the teaching vehicle.

Condition 5 remains the strain threshold: typed mapping plus in-loop LLM judgment produced ordinary question turns on the order of minutes. Re-admit interpretation only off the foreground path or at an explicit phase barrier, and measure where the mechanism becomes untenable.

## Locked, not a mission

- Keep the AI SDK adapter. Do not rewrite the Petrinaut panel onto `@flue/react`.
- `@flue/react` remains appropriate for brunch-agent's local debug UI.
- `binding-flue` stays a package even if it is the only binding.
- Exploded-view net prototypes belong on petrinaut-website host routes, not on `:4321`.
- When `ChatAgent` leaves the app, place it under `packages/<chat-agent>/`; the app remains the shell.
- Historical Conditions 1 / 2 / 4 / 5 remain batch evidence. The useful drive loop is `createFlueClient` → `send` → `wait` → `history()`. No TUI and no retired SDCPN elicitor.
- No HASH embed path that talks to Brunch is in the current scope.
