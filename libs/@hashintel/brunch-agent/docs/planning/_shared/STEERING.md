# Brunch steering model

This is the current strategic understanding of Brunch: what outcome matters now, what the system
can actually do, which beliefs remain weak, and where to spend the next unit of time. Its immediate
decision horizon is the September demo, but it steers the whole context rather than one package or
one Linear map.

This is not a roadmap, a specification, or an issue mirror. Specifications and accepted ADRs define
obligations and settled architecture. Linear is canonical for issue state, hierarchy, and hard
blockers. [COORDINATION](./COORDINATION.md) projects this strategy onto the mechanically available
work. This document owns the judgment between them: which objective to pursue under the current
time, evidence, risk, and product pressure; what to defer; and what new evidence would change that
choice. It may expose a conflict with a specification or ADR, but cannot silently override one.

The document remains live. A steering pass orients from current evidence, chooses a frontier,
executes to a named proof, reconciles the result with specifications and issues, then replans only
where the evidence changed. Git carries the history; this file carries only the current model. Its
shape is intentionally specific to the present effort. Do not extract a generic template or skill
until a second real planning cycle shows which parts recur.

## The September outcome

As of **2026-08-24**, the working constraint is roughly two human weeks. The event date and final
business use case are not yet recorded here; Dora's confirmation is a decision gate, not an excuse
to leave the technical spine vague.

FE-1476 (the September demo delivery) supplies the working scenario:

1. A reviewer opens a prebuilt cyber-physical-process requirements model and its generated SDCPN in
   Petrinaut.
2. The reviewer selects or describes a net element and asks why it was modelled that way.
3. Brunch traces the answer through the requirements model and captures to an exact source
   utterance.
4. The reviewer scopes one correction and conducts three to five focused chat turns.
5. New or superseding captures change the elicited model; reprojection changes the corresponding
   part of the live net without rebuilding unrelated parts.
6. The resulting artifact is handed to the existing optimisation experiment flow.

This is a **review-and-revise** demonstration. It does not need to prove that Brunch can elicit an
entire CPS model from a blank conversation. It does need to prove a closed semantic and interaction
loop. A chat transcript beside a static fixture, an unexplained net mutation, or a test that injects
wiring absent from the deployed entrypoint does not satisfy the outcome.

The proof spine is therefore:

```text
source utterance
  -> active typed capture
  -> folded CPS requirements model
  -> SDCPN element + provenance
  -> reviewer question and scoped correction
  -> superseding capture
  -> changed folded model
  -> changed live SDCPN
  -> optimisation handoff
```

## Where the system actually stands

The package topology is in place and the implemented tracer is real, but the September loop is not
an incremental extension of an almost-finished product. Most of the contract-bearing middle is
absent.

| Surface | Evidence now | September consequence |
| --- | --- | --- |
| Ask, suspend, return | A user answer to `brunch_ask` survives the AI SDK/Flue boundary and resumes durable history. | Reuse; do not redesign the ask protocol. |
| Settlement and capture | A settled range is privately swept into quote-anchored captures and applied atomically. Supersession and active-head validation exist in the store. | Preserve as the evidence foundation, but expose active state to the controller. |
| Plugin SDK | The exported `Plugin` is deliberately only identity plus exactly one proposal type. Gherkin captures one verbatim statement. | There is no implemented fold, demand runner, model, projection, or useful hard-target plugin to extend. |
| Elicitation control | The agent receives general ask/sweep instructions. Sweep extraction sees a conversation range and proposal names only. No production path reads the active capture set or a derived model back into the interview. | Brunch cannot yet choose a next question from what it has learned or conduct a targeted correction. |
| CPS semantics | The three-register design and provisional two-schema/two-table plugin contract are desk-designed. No `plugin-cps` exists. | The critical semantic path must be built against a concrete CPS case, not inferred from Gherkin completeness. |
| Correction | The store can represent supersession, but extraction cannot see active capture IDs, model issues, or the target region; Gherkin cannot propose a supersession. | Targeted re-elicitation is structurally unreachable despite the storage mechanics being present. |
| Petrinaut transport | Local panel streaming and human ask-return work. Machine client-tool-result follow-ups are explicitly refused pending FE-1438 (the client-tool round-trip). | The agent cannot yet apply a projection to the live document and receive the result. |
| Session target | The current application derives `targetDocumentId` from `conversationId`. | A new reviewer session cannot address a pre-existing elicitation target without changing this identity boundary. |
| Demo website | The production website still uses its stock assistant route. The `/brunch` Actual Mode is a separate read-only fixture/SSE surface. | Local tracer proof must not be mistaken for deployed integration. |

The decisive reading is that the current design is not too rigorous in its preservation of
evidence, correction, or register boundaries. It is too broad and too generic for the remaining
time. Completing generic plugin machinery, a second target, a full CPS ontology, and a cold-start
interviewer before crossing the real reviewer loop would optimize the library while leaving the
demo hollow.

## The strategic bet

Build the smallest honest **CPS review-and-revise loop** through all three registers and the real
Petrinaut entrypoint. Let that concrete implementation discover the minimum plugin interface, then
generalize only what the CPS case and existing Gherkin case both need.

This is not permission to take another thin tracer as the definition of done. The vertical proof is
contract-bearing: it includes model assembly, provenance, targeted correction, reprojection,
application, and the deployed route. Breadth inside each layer may be narrow; no layer in that loop
may be a fixture masquerading as production wiring.

The bet preserves these load-bearing decisions:

- Captures remain the durable, source-grounded assertion register.
- Every semantic inference happens at write time and is recorded as a contestable capture.
- The elicited model is a pure fold over active captures and every model part names its supporting
  capture IDs.
- SDCPN projection consumes the elicited model without rereading the transcript or making hidden
  semantic judgments.
- Petrinaut application and diagnostics are separate from semantic projection: the application may
  use client tools to apply a projected artifact, but it does not become the authority that invents
  the model.
- A correction supersedes or adds assertions and re-runs the fold and projection; it does not patch
  an unexplained net element directly.

FE-1480 (requirements-model-to-SDCPN inference) challenges the third and fourth decisions by
assuming the projection itself requires LLM inference. That assumption is unresolved. If a worked
CPS case proves that the register-2 model is insufficient for pure projection, the honest choices
are to record the missing semantic judgment as a capture before folding or to amend ADR-0003 (the
three-register IR) explicitly. Hiding inference inside a read-time projection is not an available
shortcut.

## The elicitor architecture under this load

The discussion began with four parts; the current model has five responsibilities across the
harness and plugin layers, plus one per-engagement input. The missing responsibility is the
controller that closes the loop between captured evidence and the next move.

| Responsibility | Owner | What it contains | State and September obligation |
| --- | --- | --- | --- |
| Strategy repertoire | Harness | Orientations, motivations, conversational licences, interviewing techniques, and question-formulation guidance. | Partly researched, not operationally selected. Implement only the techniques used by the review-and-revise runbook. |
| Evidence engine | Harness | Archive, settlement sweep, quote anchoring, durable captures, issues, conflict, supersession, and provenance primitives. | Strongest implemented layer. Add the active-model/issues read path needed by control and correction; do not broaden storage semantics without evidence. |
| Elicitation controller | Harness | Reads the engagement brief, active folded model and issues, current runbook, and strategy repertoire; chooses `ask`, `propose`, `contrast`, `validate`, `project`, `explain`, or `stop`. | Absent. Build the narrow controller loop needed to explain and revise one selected region. |
| Domain contract | Plugin | Proposal and model schemas; identity, fold, grade, demand, diagnostics, projection, and provenance rules for one target domain. | Designed but unimplemented. Build the CPS subset exercised by the fixture and correction; let it pressure the generic interface. |
| Job runbooks | Plugin | Named jobs over the same domain: objectives, entry conditions, trajectories, demand/completion rules, checks, stopping, revision, boundaries, and handoff. | Absent. Implement `review-and-revise`; defer a complete cold-start runbook. |

The **engagement brief** is dynamic input, not plugin policy: target document, participant role,
objective, scope, known constraints, allowed actions, and time budget for this run. For September it
binds a reviewer to an existing target and one revisable region.

A separate free-form “next-question ledger” should not become another authority. Most of it is a
derived control trace:

```text
runbook demand -> model gap or issue -> candidate move -> chosen move -> concrete ask
```

Persist only what replay, audit, or explicit user commitment requires. The controller must be able
to explain its chosen move from the runbook and active model; it must not accumulate an independent
shadow plan.

The September `review-and-revise` runbook is provisionally:

```text
entry:
  existing target + folded requirements model + projected net + reviewer scope
trajectory:
  orient -> select -> explain provenance -> frame correction
         -> ask/validate (3-5 turns) -> show semantic and net delta -> confirm -> hand off
done:
  scoped demands are met at the declared grade
  no open conflict blocks the selected projection
  reviewer confirms the intended delta
  every changed net element retains provenance
boundary:
  do not expand into cold-start elicitation or unrelated net repair
```

## Proof frontiers and execution order

The work has four frontiers. They are ordered by learning dependency, not by which ticket is
currently unblocked. The semantic and experience lanes start in parallel after Frontier 0, then
join as early as possible; they are not two long independent streams to integrate at the end.

### Frontier 0 — make the demo claim decidable

Confirm the business use case, freeze one representative prebuilt requirements-model/net fixture,
and name the optimisation handoff artifact. On that fixture, settle the FE-1480 authority question:
which steps are write-time semantic capture, pure model fold, pure SDCPN projection, and document
application?

The prebuilt fixture must be a valid register-1 store state with a source conversation and
quote-anchored captures produced through, or independently validated against, the production
capture/fold path. A hand-authored register-2 model or register-3 net cannot prove provenance and
cannot serve as the correction baseline.

**Proof:** one reviewed worked transformation in which every SDCPN element needed by the scenario
traces to model fields and captures, with every non-mechanical judgment assigned to a write-time
producer. If this cannot be drawn honestly, implementation should not freeze an interface.

### Frontier 1 — close the CPS semantic loop

Implement only the CPS proposal kinds, model slots, identity/fold rules, demands, projection, and
provenance exercised by the fixture and one realistic correction. Carry capture IDs through every
derived layer. Make active model issues and selected-region context available to the controller.

**Proof:** from the production fold/projection APIs, one source-grounded supersession changes the
expected model field and corresponding SDCPN elements, leaves an unrelated region stable, and
answers both forward and reverse provenance queries. A YAML or Markdown rendering of the model is
enough for inspection at this frontier. The proving proposal must have the shape the production
sweep will emit; the cross-frontier join is not accepted until that sweep produces it from the
reviewer's actual utterance rather than a test inserting it directly.

### Frontier 2 — close the reviewer control loop

Allow a new conversation to bind to an existing target document. Admit the machine client-tool
results needed to apply and diagnose a net change. Mount the narrow `review-and-revise` runbook and
controller so that the active model and selected region, rather than the raw transcript alone,
drive three to five questions.

Session binding and client-tool admission may proceed in parallel with Frontier 1. Mounting the
controller against active model/issues waits for Frontier 1's production read path; do not replace
that dependency with request-shaped model context.

**Proof:** through the real Brunch HTTP handler and Petrinaut panel, a reviewer selects the prepared
region, receives a grounded explanation, submits a scoped correction, and sees the returned apply
result resume the same durable session. The net delta must trace to a superseding capture produced
by the production sweep from the reviewer's utterance, not one inserted by the test or fabricated
by the controller. No test-only injection supplies the target or tool wiring.

### Frontier 3 — converge on the deployed demo

Wire provider/mode routing, browser principal and private session lookup, remote transport,
deployment gates, and the optimisation handoff. Rehearse the exact scenario with a clean browser
against the deployed demo surface.

**Proof:** a screen-recordable run completes the six September beats, survives one reload, exposes
the before/after requirements-model delta, and hands the resulting SDCPN to the optimisation flow.
Diagnostics show the source capture and projection identities needed to investigate a failure.

## What is deliberately cut

Until the proof spine is closed:

- Do not freeze a broad declarative plugin SDK or require a second hard target. Extract the shared
  contract after CPS has stressed it.
- Do not make the Gherkin artifact path a prerequisite for the CPS demo.
- Do not build a full requirements-graph UI. FE-1481's YAML or Markdown export is the selected
  fallback; a UI earns time only if the core loop is already green.
- Do not build a complete cold-start CPS interview, general target gallery, every affordance type,
  voice input, surprising-scenario generation, or broad telemetry vocabulary.
- Do not implement a comprehensive CPS ontology. Support the fixture, the correction, and the
  optimisation handoff while keeping the data model honest about what it omits.
- Do not bypass provenance or write-time semantics to make a visually convincing net mutation.

These are sequencing cuts, not claims that the deferred obligations are unimportant.

## Issue projection

The PM-authored issues are adopted here as the September delivery decomposition. Linear has not yet
been changed; its current unparented state is recorded in COORDINATION until an explicitly approved
registry update. The recommended hierarchy is FE-1357 (September planning and plugin design) →
FE-1476 (September delivery) → FE-1477 through FE-1482.

| Issue | Strategic role | Reconciliation with existing work |
| --- | --- | --- |
| FE-1476 — prepare the September demo | Outcome owner and acceptance narrative. | Child of FE-1357 while that map remains active; owns rehearsal and handoff rather than implementation details. |
| FE-1477 — route Petrinaut AI and Brunch | Experience-lane entry and mode selection. | Product acceptance overlaps FE-1440 (ship the elicitor in the demo site). Keep one implementation owner; do not build two switches. |
| FE-1478 — trace a generated net to requirements | Provenance acceptance through registers 3 → 2 → 1 → utterance. | Must shape Frontier 1 from its first model/projection types, not arrive as post-hoc metadata. |
| FE-1479 — targeted re-elicitation | Convergence issue for the reviewer loop. | Consumes FE-1438's machine client-tool/application path, FE-1439's session ownership, and the CPS correction path; it does not own a second mutation mechanism. |
| FE-1480 — infer requirements model to SDCPN | Authority and projection decision, then the production projector. | Must be reconciled with ADR-0003 before implementation. FE-1438 owns browser application, not hidden semantic projection. |
| FE-1481 — expose the requirements model | Inspection fallback and demo delta surface. | Select YAML/Markdown first. Defer FE-1442's broader live capture/completion UI unless the proof spine closes early. |
| FE-1482 — add the CPS plugin | Semantic-lane owner and concrete pressure on the plugin boundary. | Pulls the demo-critical slices from FE-1402 (completion), FE-1403 (CPS guidance), FE-1406 (strategies), and FE-1431 (declarative contract). FE-1393 remains the generic/Gherkin path and no longer gates September. |

Other consequences for the old graph:

- FE-1387 (second target and plugin-contract freeze) follows the CPS proof instead of preceding the
  demo.
- FE-1331 (start from create-new-net) is outside the current reviewer-against-existing-target
  scenario, but ADR-0004 explicitly un-deferred it as September topology. The FE-1476 scenario
  therefore creates an exposed conflict pending Dora's confirmation and, if review-and-revise
  stands, a dated ADR-0004 amendment; this steering document does not silently re-defer it.
- FE-1438, FE-1439, FE-1440, FE-1423 (pre-remote gates), and FE-1441 (deployment) remain real
  implementation obligations; the new issues state user outcomes rather than replacing these
  substrate and release seams.
- FE-1402, FE-1403, FE-1406, and FE-1431 should produce only what the CPS runbook and domain
  contract consume. Their old standalone completion must not become a hidden prerequisite.
- The active Petrinaut integration spec still describes a cold-start interview in some user
  stories. Reconcile those stories with the confirmed scenario rather than treating this plan as a
  silent specification amendment.

## Beliefs, risks, and replan conditions

| Current belief | Confidence and evidence | Replan when |
| --- | --- | --- |
| A bounded review-and-revise scenario can carry the September product claim without cold-start elicitation. | Medium. It is the written FE-1476 scenario, but Dora has not confirmed the use case. | The confirmed use case requires model creation rather than review, or the optimisation handoff requires fields absent from the fixture. |
| A concrete CPS implementation will discover a better minimum plugin contract faster than completing the generic design first. | Medium-high. Gherkin deliberately under-stresses the interface; CPS is the first real consumer. | The first worked CPS transformation cannot be expressed without a reusable harness primitive that must precede it. Build that primitive, then return immediately to the vertical proof. |
| Register 2 can be rich enough for pure SDCPN projection. | Low-medium. ADR-0003 requires it, but no real fold or projector exists and FE-1480 asserts non-determinism. | The worked transformation identifies an unavoidable semantic choice not represented in captures/model. Record it earlier or explicitly revisit the ADR. |
| Three to five turns can produce a meaningful scoped correction. | Low. No CPS runbook has been rehearsed. | Two rehearsals exceed the budget or require unrelated context. Narrow the region, preload explicit context, or revise the demo claim rather than script fake success. |
| The proven ask suspension can extend to document-application client tools. | Medium-low. The suspension spike succeeded, but the production transport intentionally refuses machine tool-result follow-ups. | The first tool round-trip cannot preserve correlation, durability, or non-user evidence semantics. Treat this as a critical integration blocker, not a UI detail. |
| The production website and remote server can be joined inside the timebox. | Medium-low. Local host seams exist; provider routing, session ownership, deployment, and release gates do not yet converge. | A deployable path is not proved by the end of Frontier 2. Preserve the real semantic loop and seek an explicit demo-surface decision rather than quietly falling back to test-only wiring. |
| Requirements-model UI is unnecessary for comprehension. | Medium. The reviewer needs inspectability, but FE-1481 explicitly permits export. | Rehearsal shows that provenance and delta cannot be understood from chat plus a structured export. |

## Current choice

Stop treating “unblocked” as “next.” The next strategic move is to run Frontier 0 immediately and
open Frontiers 1 and 2 in parallel: one worked CPS semantic slice and one existing-target reviewer
session/tool-return slice. Join them at the earliest correction, then drive the same bones through
provider routing and deployment. The generic Gherkin/plugin-freeze path and broad UI work wait for
that join.

Revisit this choice as soon as Dora confirms the use case, the FE-1480 worked transformation lands,
or either parallel frontier fails its first proof. A steering pass that only updates ticket status
does not change this document; a new fact that changes the objective, proof spine, authority
boundary, or cut line does.
