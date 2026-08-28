---
title: Package architecture review
author: Lu Nelson
threadId: T-01a032f5-37ff-7328-a0d5-f8ee48678dd2
created: 2026-08-24T08:48:46.591Z
agentMode: high
---

# Package architecture review

## User

please get oriented in this package, and then I'd like to conduct a high-level design- and planning-review session

## Assistant

I’ll first map the package’s declared architecture, posture, active planning artifacts, and recent work. Then I’ll frame the review around the decisions that are actually open rather than giving a generic codebase tour.

## User

it's actually multiple packages; I should have referred to it as a "context root"

## Assistant

Right — I’ll treat `libs/@hashintel/brunch-agent` as the **Brunch context root**: one authority surface for the glossary, ADRs, protocols, and planning records; four child package workspaces; plus the separately located `apps/brunch-agent` application. That distinction is architecturally important here.

The initial read suggests the package boundaries are comparatively settled; the more consequential review target is likely the transition from the completed import/integration spine to the still-provisional elicitation semantics and milestone plan. I’m narrowing that now against the coordination ledger and current Linear state.

## Assistant

The coordination document’s literal `yarn turbo …` form is stale for this Yarn setup; it fails before invoking Turbo. I’ll use the repository’s installed Turbo binary directly, preserving the same read-only graph task.

## Assistant

The live DAG materially diverges from the 21 August coordination snapshot: seven new root-level issues, FE-1476–FE-1482, now describe the September/demo, routing, provenance, re-elicitation, requirements-graph projection, and CPS-plugin direction. Before proposing a review frame, I’m reading those issue contracts and the three established root maps to determine whether this is intentional reframing or planning drift.

## Assistant

I’m oriented to the **Brunch context root**:

```diagram
┌──────────────────────────────────────────────┐
│ Brunch context root                          │
│ glossary · ADRs · protocols · planning       │
└───────────────┬──────────────────────────────┘
                │
   ┌────────────┼─────────────┬──────────────┐
   ▼            ▼             ▼              ▼
 core     binding-flue   transport-aisdk  plugin-gherkin
 harness   substrate       UI wire         target policy
   └────────────┴─────────────┴──────────────┘
                         │
                         ▼
                apps/brunch-agent
                  remote server
                         │
                         ▼
              apps/petrinaut-website
               user-facing composition
```

### Assessment

- Package boundaries are coherent and mechanically guarded by the [ratified topology](file:///Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/planning/_shared/topology.md#L10-L75).
- The durable mechanics exist: ask/reply, settlement and sweep, provenance anchoring, capture storage, Flue binding, and AI SDK transport.
- The product-defining path remains mostly design: the plugin API is intentionally skeletal, and Gherkin is only a one-proposal tracer ([plugin API](file:///Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/packages/core/src/plugin.ts#L5-L14), [Gherkin tracer](file:///Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/packages/plugin-gherkin/src/index.ts#L43-L54)).
- The live Linear plan has drifted beyond [COORDINATION.md](file:///Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md#L14-L65): FE-1476–FE-1482 are unregistered roots, FE-1477 substantially duplicates FE-1440, and several new tickets overlap earlier plugin/demo work.
- Most importantly, FE-1480 assumes an inferential requirements-graph → SDCPN projection. That conflicts with ADR-0003’s rule that projections are deterministic over register 2 and semantic inference occurs only through contestable captures ([decision](file:///Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/adr/0003-three-register-ir.md#L24-L49)).

### Recommendation

Next: an `arc-map` review of the September milestone—but first settle that projection boundary. Afterwards we can reconcile the demo story, dependencies, and duplicate tickets.

Opening question:

**Where should the non-deterministic requirements → SDCPN judgment live?**

1. **Preserve ADR-0003:** the LLM emits explicit, provenance-bearing formalization captures; folding and SDCPN projection remain pure.
2. **Amend ADR-0003:** projection itself may infer, requiring an auditable and reproducible projection-run model.

My initial recommendation is **1**. Is that still your intended architecture?

## User

To your points:

- yes, there are new tickets, drafted by my PM Dora, which we must adopt and fold-in to our graph
- package boundaries are in place yes; but implementation boundaries and paths are only traced so far, and this needs serious attention
- and yes FE-1480 will require discussion (as will other issues)

Before we address those things, let me give you the high-level concerns that are on my mind, as other entrypoints:

- the integration with the petrinaut demo website is only the thinnest of tracer bullets so far; completing the full contract layers here will bloom in to much larger scopes
- we haven't even begun `plugin-cps`, which is the actual thing we need to build a critical demo around, very soon (2 weeks in human time)
- the current design for the elicitor architecture seems sound; but its rigor may be at cross-purposes with establishing an e2e working model as fast as we can
- IMO the current issue topology/graph likely does not inherently express the goals we need to be driving at

## Assistant

Those concerns point to one underlying problem: the current plan is organized around **contract completion**, while the urgent objective is a **demo-capable vertical system**. That makes locally sensible work compete with global time-to-proof.

I think the review should separate what must stay rigorous from what may remain deliberately narrow for two weeks, then rebuild the dependency graph around the demonstrated outcome.

## Assistant

Your diagnosis matches mine. The tension is less **rigor versus speed** than **generality versus speed**.

We should retain rigor at irreversible boundaries—provenance, capture correction, real application wiring, valid SDCPN output—and defer broad genericity: complete plugin SDK, full CPS ontology, every affordance, multi-target validation, and contract freeze.

I’d reshape the plan around vertical proofs:

```diagram
Fixture captures ─▶ CPS model ─▶ valid SDCPN
                        │
Live correction ─▶ supersession ─▶ changed SDCPN
                        │
Net element ─▶ model slot ─▶ capture ─▶ user evidence
                        │
              real Petrinaut demo website
```

Existing capability tickets become constraints and inputs, not the primary execution sequence. FE-1476 should likely own the demo outcome, with FE-1477–FE-1482 folded beneath it and reconciled against FE-1393/1402/1403/1438/1440/1442.

The first decisive question:

**Is FE-1476 now the authoritative demo contract, replacing cold-start comprehensive elicitation with the prebuilt-model → provenance → targeted revision story?**

My recommendation: **yes**. Otherwise we are planning two demos in two weeks. This would remove full cold-start elicitation and comprehensive completion accounting from the critical path unless they are still explicitly required.

## User

This essential line of reasoning is correct; but may still be working on too-thin signals. The core concern that exhibits the tension between the priorities of correct/complete vs "works effective e2e" is the actual elicitor architecture, and I think we should work through a fuller evaluation of this, to understand what's really on the critical path and what's not

## Assistant

Agreed. We should not infer the critical path from ticket titles or the demo script yet. We need to evaluate the elicitor as a system: trace each runtime responsibility from user turn to durable assertion, model, projection, and UI effect; then distinguish **missing load-bearing behavior** from merely incomplete contract breadth.

I’ll assess the traced layers for role completeness, contract coverage, and fidelity to the proposed architecture before we resume prioritization.

## Assistant

One concrete issue is already emerging: the implemented loop can interview and append provenance-safe captures, but it cannot yet *reason over the target-document it has built*. The binding gives the model generic ask/sweep instructions; the private sweep sees conversation text and a proposal schema, but there is no register-2 model, demand state, projection, or plugin guidance feeding the next turn.

I’m checking the correction and projection seams now, because the new demo requires the loop to revise existing knowledge—not merely capture new statements.

### Readiness Map: Elicitor architecture

**Verdict:** the substrate and capture foundation is strong, but the system is only tracer-complete. The implemented path currently terminates at captures:

```diagram
Implemented
───────────
User ─▶ agent ─▶ ask/reply ─▶ settlement ─▶ sweep ─▶ durable captures
                                                        │
                                                        └── dead end

Designed but absent
───────────────────
captures ─▶ fold ─▶ elicited model ─┬─▶ completion/gaps ─▶ next-question policy
                                    ├─▶ SDCPN projection ─▶ Petrinaut
                                    └─▶ provenance map ─▶ targeted revision
```

| Layer | Readiness | Critical-path judgment |
|---|---|---|
| Ask/suspend/transport | Mechanically substantial | Foundation ready; broader affordances are deferrable |
| Sweep/capture/provenance | Mechanically substantial | Foundation ready, but not yet usable for revision |
| Model-aware elicitation loop | Absent | **Critical** |
| Register-2 fold/model | Design only | **Critical**, in a deliberately narrow CPS form |
| CPS plugin | Absent | **Critical** |
| SDCPN projection | Design only and contested | **Critical design decision** |
| Petrinaut document application | Ask-only local tracer | **Critical**, but its correct mechanism is unresolved |
| Existing-document/reviewer session | Domain primitives exist; host collapses document to conversation | **Critical** for FE-1476 |
| Artifact provenance and scoped re-elicitation | Store primitives only | **Critical** for FE-1478/1479 |
| Generic plugin authoring, completion, loss reporting, full catalog | Design only | Mostly deferrable unless selected by the demo story |
| Public durability/security/deployment | Partial | Critical only after the functional loop exists |

#### Important architectural findings

1. **The elicitor does not yet consult what it has elicited.**  
   Sweep extraction receives conversation text and proposal names, not active captures, issues, or a derived model ([binding](file:///Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/packages/binding-flue/src/index.ts#L138-L227)). Consequently, no model state can steer the next question.

2. **Targeted correction is not reachable.**  
   The store rigorously supports `supersedes`, but extraction cannot see the active capture IDs it must reference. The current Gherkin schema cannot emit `supersedes` either.

3. **The planned projection and client-tool paths potentially duplicate semantic authority.**  
   The plugin design says register 2 projects to a canonical SDCPN. FE-1438 instead has the agent manipulate Petrinaut through browser tools. If both perform modelling judgments, provenance and reproducibility break. We must separate:
   - semantic projection: model → SDCPN;
   - application: SDCPN/diff → live document;
   - optional repair: diagnostics → revised projection.

4. **The reviewer workflow needs a real target-document boundary.**  
   The domain model supports multiple sessions against one document, but the current host maps `targetDocumentId` directly from `conversationId` ([current mapping](file:///Users/lunelson/Code/hashintel/hash/apps/brunch-agent/src/petrinaut-chat.ts#L31-L45)). FE-1476 requires a reviewer session reopening an existing elicitation.

5. **The generic plugin architecture may be premature, but its fundamental registers are not.**  
   We probably need captures → model → projection for provenance and revision. We probably do **not** need the complete declarative meta-schema, generic fold algebra, Gherkin-first SDK, all CPS proposal kinds, and contract freeze before proving one CPS path.

My resulting hypothesis is:

> Preserve the three-register architecture, but let the first CPS implementation discover the executable plugin boundary instead of completing the generic plugin framework first.

The next unresolved design area is therefore the **semantic materialization boundary**: concrete CPS fold, projection ownership, provenance mapping, and how the resulting artifact enters Petrinaut.

**Routing**: where should we go next?

1. **Explore module shape (Recommended)** — design two competing executable shapes for that semantic boundary.
2. **Design verification** — first define the minimum end-to-end proof and its oracles.
3. **Back to triage** — continue auditing other architectural layers before choosing a boundary.

Reply **1–3**, or redirect the review.

## User

Those routing options are good; but let's keep discussing for now.

FWIW, your observations match my intuition and my suspicions.

I must say, that tracer discpline has been a real double-edged sword: it's been a very common for the agent to take the tracer as the "definition of done" and for the actual implementation to be essentially left not only incomplete but barely started.

I think your essential prioritization and plan-shape is correct; but we're going to need a new protocol for representing and driving that kind of plan or it's going to evaporate after this session: the `COORDINATION.md` doc is nice, but right now only tracks the issue-graph topology with a bias toward _what is mechanically next_ i.e. unblocked, while not having any way to track an actual strategic execution plan, which should rather be objective-driven, epistemically-tracked and with the issue-graph as a sequencing and trade-off surface

I want to offer the mental model I have of the elicitor architecture so far, which I had skethed out before starting this thread, and which you can also therefore analyze as both a proposal and and an inventory, and help me determine where I have gaps or weak layers. So far, I think of it in roughly four parts, which belong to two essential layers (there are more layers than these two but these are the two with real architectural design pressure and which are currently hollow)

1. __harness layer: elicitation agentics__. the prompting and skilling parts, general to all elicitations:
  - orientations, motivations, licenses
  - interviewing/question-formulation guidance
2. __harness layer: capture mechanics and agentics__. the capture mechanics so far; but lacking further build-out, as you've observed
  - evidence sweeping and logging mechanism; with annotations re: supersession, conflicts etc.
  - next-question ledger and loop?
  - mapping plugin-defined types from utterances: entities (nodes), relations (edges), quantities, conditionalities
3. __plugin layer: typologies, critical points and motifs, ...?__. the things for the capture parts to be aware of
  - what entities are we after
  - what shapes and relations do they have
4. __plugin: runbook (objectives, trajectories, boundaries)__. this is the least sketched part so far IMO, and so "runbook" is a proposal at this point, about how the rest of the plugin manifest could actually be shaped
  - the job
  - what 'done' looks like
  - how to check
  - ... (what else?)

## Assistant

Your model is sound. I would make two refinements:

1. Separate the **elicitation controller** from capture mechanics.
2. Separate the plugin’s static **runbook** from the dynamic **engagement brief** it produces for one target-document.

```diagram
                 HARNESS
┌─────────────────────────────────────────────┐
│ Strategy repertoire                         │
│ orientations · techniques · licenses        │
└───────────────────┬─────────────────────────┘
                    ▼
┌─────────────────────────────────────────────┐
│ Elicitation controller                      │
│ assess situation · choose move · stop/replan│
└───────▲───────────────────────────┬─────────┘
        │                           ▼
┌───────┴───────────────┐   ask · propose · validate
│ Evidence engine       │
│ sweep · capture ·     │
│ supersede · resolve   │
└──────────┬────────────┘
           │ assertions
           ▼
                 PLUGIN
┌─────────────────────────────────────────────┐
│ Domain contract                             │
│ proposals · model · fold · diagnostics ·    │
│ projection · provenance                     │
└──────────▲──────────────────────────────────┘
           │ model state and gaps
┌──────────┴──────────────────────────────────┐
│ Job runbook                                 │
│ objectives · trajectory · checks · stopping │
└─────────────────────────────────────────────┘
```

### 1. Harness: strategy repertoire

Your contents fit, with one qualification:

- **Orientations**: generic role and epistemic posture.
- **Licenses**: re-ask, challenge, propose for correction, expose assumptions.
- **Techniques**: contrastive questions, incident reconstruction, quantile elicitation.
- **Question formulation guidance**: generic forms only.

The harness should define these capabilities, but not decide when domain-specific questions matter. Prompting and Flue skills are their delivery mechanism—not the architectural concepts themselves.

**Current weakness:** the generic quiver is named but not designed. More importantly, there is no module composing its strategies into a coherent engagement.

### 2. Harness: evidence engine

This should own:

- conversation archive and evidence classification;
- settlement and sweep execution;
- capture envelope and provenance;
- atomic application;
- issues, conflicts, supersession and retraction;
- invocation of plugin-defined proposal extraction.

But two items in your list sit elsewhere:

- **“Next-question ledger and loop” belongs to the controller.**
- **Entities, relations and conditionalities belong to plugin vocabulary.** The harness executes schema-constrained extraction; the plugin defines what can be extracted. Quantities may come from a shared stated-form library, but should not become universal harness ontology.

A useful decomposition is:

```diagram
Model demand ─▶ knowledge gap ─▶ candidate move ─▶ chosen move ─▶ concrete ask
   derived          derived          derived         session state     transcript
```

The “ledger” should mostly be derived, not persisted. Persist the selected trajectory or active commitment only when continuity requires it; otherwise stale agendas will compete with the current model.

**Current weakness:** the evidence engine writes captures but provides no read path back into an elicitation controller. It is an append-capable substrate, not yet a closed loop.

### 3. Plugin: domain contract

This is broader than “what entities are we after.” It owns:

- model node kinds, slots and relations;
- utterance-shaped proposal catalog;
- fold and identity semantics;
- grade and conflict semantics;
- domain validators and diagnostics;
- projection into artifacts;
- artifact-element → model-slot → capture provenance mapping.

I would place your concepts as follows:

- **Typologies** → model/proposal schemas.
- **Critical points** → derived diagnostics and question triggers.
- **Motifs** → runbook hypotheses or questioning scaffolds, not model facts unless the user confirms them.

The existing “two schemas, two tables” design covers much of this, but is probably overcommitted to a generic authoring representation before one real CPS model works.

### 4. Plugin: runbook

“Runbook” is a good provisional name because it adds time, direction and judgment to the current `ElicitationPack`, which is otherwise mostly a bag of cards and checks ([current contract](file:///Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/spec.md#L531-L550)).

A runbook likely needs:

- **Supported job**: build, review, explain, or revise.
- **Kickoff contract**: objective, intended use, scope, audience, available effort.
- **Trajectory**: orient → skeleton → deepen → cross-examine → validate → hand off.
- **Priority policy**: objective relevance, information gain, dependency, user effort and risk.
- **Demand/completion rules**: what knowledge is required and to what grade.
- **Challenge checks**: contradictions, ungrounded assumptions, missing boundaries, invalid projections.
- **Stopping outcomes**: sufficient, useful-partial, stalled, budget-exhausted, user-stopped.
- **Default/inference policy**: what may be proposed, defaulted, inferred or must be asked.
- **Revision policy**: how to scope targeted re-elicitation and determine affected projections.
- **Output/handoff contract**: artifacts, provenance, visible gaps and validation results.
- **Recovery policy**: re-entry after another session or changed target-document.

However, “the job” is not wholly static plugin content. The plugin offers a runbook template; kickoff creates an **engagement brief** containing the actual objective, boundaries, appetite and selected trajectory.

### The largest missing architectural role

The current design contains pieces of the controller—`demandRunner`, `affordanceCuer`, `firesWhen`, completion—but no interface unifying them. The controller must read:

```text
engagement brief
+ current model and open issues
+ runbook
+ available generic strategies
+ recent conversation state
```

and produce a bounded next move:

```text
ask | propose | contrast | validate | project | explain | stop
```

That is the hollow center between “we captured facts” and “we conducted an effective elicitation.”

There is a parallel planning insight here: **the issue graph is analogous to the capture store**—durable inventory and dependencies, but not an execution strategy. `COORDINATION.md` is a projection over that inventory. A separate strategic plan must act like the controller/runbook: objective, current model of reality, confidence, current bet, proof spine, issue mapping and replanning triggers.

The next architectural question I would examine is:

> Does a plugin have one runbook, or a family of job-specific runbooks sharing one domain contract?

My recommendation is the latter. For CPS, at least **cold-start construction** and **review-and-revise** have different kickoff, trajectory and stopping conditions. The September demo can then implement one honest `review-and-revise` runbook without pretending the complete CPS elicitor already exists.

## User

I agree a plugin could define multiple runbooks, that makes sense. And yes the planning insight echoes the gaps we're seeing in teh implementation. The planning itself needs a kind of "runbook" as well, in effect. The routines we've instituted so far here around the COORDINATION.md doc are just one part of that surface, and that surface should be the central sense-making tool for running the project

## Assistant

Exactly. **Unblocked is a property of the work graph, not a reason to perform work.** The missing surface must decide what matters next from objectives, evidence, risk and time.

```diagram
Code/tests/docs/Linear
        │ evidence
        ▼
┌──────────────────────────┐
│ Strategic execution model│
│ objective · current truth│
│ bets · proof spine · risk│
└────────────┬─────────────┘
             │ selects and scopes
             ▼
       Issue graph / work
             │
             └──── new evidence ────┘
```

The existing artifacts each retain a narrower authority:

- **Linear:** issue state and hard dependency truth.
- **COORDINATION.md:** topology, soft edges, seams and registry integrity.
- **SPEC-LEDGER.md:** implementation against settled obligations.
- **ADRs/specs:** durable design truth.
- **New strategic surface:** current objective, execution strategy, priority and confidence.

### What the central surface should contain

#### 1. Milestone contract

- Outcome being pursued.
- Observable proof.
- Deadline and audience.
- Explicitly excluded outcomes.
- Which product claims must be honest versus merely demonstrated narrowly.

#### 2. Current system model

Not “tickets completed,” but:

- what genuinely works end-to-end;
- which layers are tracer-only;
- which responsibilities are absent;
- external facts and constraints;
- assumptions with confidence and supporting evidence.

#### 3. Current strategic bet

A concise theory such as:

> Preserve the three-register architecture, prove one CPS review-and-revise runbook concretely, and allow that implementation to determine the generic plugin interface.

It should state why this bet beats alternatives and what evidence would reverse it.

#### 4. Proof spine

Proof obligations, not issues:

```text
P1  CPS captures derive a model and valid SDCPN with provenance
P2  A reviewer session opens the existing target-document
P3  One scoped correction supersedes evidence and changes the model
P4  Reprojection changes the live Petrinaut net
P5  A provenance question reaches net → model → capture → utterance
P6  The complete path runs through the deployed demo surface
```

Each proof carries:

- certainty;
- missing knowledge;
- acceptance oracle;
- mapped issues;
- dependencies—functional and epistemic;
- replan trigger.

#### 5. Strategic frontiers

“Now / next” chosen from the proof spine, with a reason. An issue being unblocked only makes it *eligible*.

A frontier entry should answer:

- Why now?
- What uncertainty or capability does it retire?
- What becomes possible after it?
- What is the smallest honest proof?
- Which adjacent work remains deliberately deferred?

#### 6. Issue projection

Map issues onto proofs many-to-many. This is where Dora’s tickets are adopted without allowing their initial decomposition to dictate implementation architecture.

It should expose:

- duplicate or overlapping tickets;
- tickets that contribute to no current proof;
- proofs with no owned work;
- scope that should move between tickets;
- trade-offs created by sequencing.

#### 7. Learning and replanning

Record only consequential shifts:

- evidence observed;
- assumption promoted, weakened or falsified;
- confidence change;
- resulting strategy or sequence change.

### Operating protocol

1. **Orient:** read the strategic surface, then query live issue state.
2. **Select:** choose the frontier with the highest closure or information gain—not the lowest issue number.
3. **Scope:** define the smallest proof-producing slice.
4. **Execute and verify.**
5. **Reconcile:** update evidence, confidence, proof status and issue topology.
6. **Replan when a named trigger fires.**

I would not design this protocol abstractly first. The September demo should be its first worked instance. We can construct the real strategic surface around the elicitor architecture, use it through at least one replan, and only then extract a reusable schema or skill.

## User

Agreed. I don't know yet what this is called; but it's not a roadmap, and not a blueprint, and not the spec either (we can have multiple specs anyway, at different levels)

It's the thing that tracks objectives, evidence, risk and time -- but strategically, which is to say it continually evaluates the former against the latter: achieving objectives/obligations _UNDER_ constraints, limitations, pressures, unknowns. It consumes specs as one input and uses issues as a planning surface.

We can model this protocol as we use it. A combination of document structure (perhaps templated?) and perhaps local agent-skills might be necessary, as we go

## Assistant

I think the core concept is **steering**.

- **Steering model** — the current strategic understanding of objectives, position, constraints, evidence, risks and bets.
- **Steering surface** — the document plus tools through which people and agents inspect and update that model.
- **Steering protocol** — the recurring orient → choose → execute → reconcile → replan loop.

`STEERING.md` would be a plausible provisional name. Unlike a roadmap, steering is explicitly feedback-driven: it continually adjusts the route against observed conditions.

### Proposed structure

```md
## Project steering

### Mission
Outcome, obligations, proof, audience, deadline.

### Current position
What is proved, tracer-only, absent, contradicted or unknown.

### Pressures and constraints
Deadline, capacity, external dependencies, non-negotiable invariants.

### Current strategy
The active bet, why it is preferred, and alternatives rejected for now.

### Proof spine
The ordered capabilities or claims that must be demonstrated.

### Active frontiers
The next proof-producing moves, why now, and what they unlock.

### Risks, assumptions and unknowns
Confidence, evidence, consequence, retirement test and fallback.

### Commitments and cut lines
Must / should / stretch / defer, with dates or evidence that trigger cuts.

### Issue projection
Issues mapped onto objectives and proofs; overlaps, gaps and trade-offs.
Links to the live coordination graph rather than mirroring its state.

### Replan triggers
Events that require reconsidering the strategy.

### Recent confidence shifts
Only consequential learning; stable truth graduates elsewhere.
```

The key vocabulary could be:

- **Objective:** desired outcome.
- **Obligation:** condition that must remain true.
- **Constraint:** unavailable or prohibited option.
- **Pressure:** fact that changes trade-offs, such as time.
- **Unknown:** material unanswered question.
- **Risk:** uncertain adverse outcome.
- **Bet:** chosen strategy under uncertainty.
- **Proof:** evidence that supports an objective or retires risk.
- **Frontier:** strategically selected next proof—not merely unblocked work.
- **Cut line:** condition under which scope is reduced or fallback selected.

### Relationship to existing artifacts

```diagram
Specs / ADRs ───────▶ obligations and design truth
Code / tests ───────▶ implementation evidence
Linear ─────────────▶ work inventory and hard dependencies
COORDINATION.md ────▶ issue topology, seams and registry
                         │
                         ▼
                    STEERING.md
                strategy and next action
```

I would keep `COORDINATION.md` narrow rather than expanding it indefinitely. The steering surface consumes its graph projection while owning priority and rationale.

### Adoption approach

Start with the document and run it manually for the September effort. Avoid building a family of skills before the operating loop has been exercised.

After a few real updates, stable routines could become local skills:

1. **Orient** — assemble current evidence and identify drift.
2. **Steer** — select or revise the strategic frontier.
3. **Reconcile** — incorporate completed work and confidence shifts.
4. **Pressure-test** — challenge the proof spine, assumptions and cut lines.

“Steering” is my strongest candidate, but I would treat the name as provisional until we use the model on the current elicitor plan.

## User

I like it. Let's run it on the current plan, both the explict (existing) parts and the implicit/projected ones per your observations in this thread. Let the September Demo effort's own content be the driver of the document structure, at least on this first pass (don't let our imagined headings and ontologies become forms to be filled for their own sake). Run it all past the elicitor when you're done for a sanity and comprehensiveness check WRT our findings and decisions above

## Assistant

*(cancelled)*

I’ll create the first steering artifact as an evidence-backed September execution model, not a generic template. It will reconcile the existing coordination/spec/issue material with the architectural gaps established here, while leaving Linear state unchanged.

I’ll then audit it against the actual elicitor flow and its missing feedback loops. The current Brunch agent cannot itself perform that strategic review, so I’m interpreting “past the elicitor” as a systematic check against the elicitor

## User

Sorry I meant "run it all past the oracle when you're done..." above, not the "elicitor"

## Assistant

Understood—I’ll draft the steering artifact, self-review it against the elicitor architecture and live plan, then ask Oracle for an independent sanity and comprehensiveness review before finalizing it.

## Assistant

I’m turning the discussion into a live steering model, not a generic planning template. Its center will be the September reviewer loop, with the current architecture and issue graph treated as evidence and constraints rather than as the plan itself.

**Tool Use:** `shell_command`

```json
{
  "command": "rg -n \"captureStore\\.read|captureStore|targetDocumentIdFor|conversationId|supersedes|active.*head|proposal\" packages/binding-flue/src/index.ts packages/core/src apps/brunch-agent/src/petrinaut-chat.ts 2>/dev/null | head -160",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 10000
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "rg -n \"client tool|tool-result|tool result|brunch_ask|readPetrinaut|write|apply|Petrinaut\" libs/@hashintel/brunch-agent/packages/transport-aisdk/src apps/brunch-agent/src apps/petrinaut-website/src 2>/dev/null | head -200",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 10000
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "rg -n \"ElicitationPack|completion|cards|schema|fold|demand|projection\" libs/@hashintel/brunch-agent/packages/core/src libs/@hashintel/brunch-agent/packages/plugin-gherkin/src | head -220",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 10000
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "git status --short -- docs/INDEX.md docs/planning/_shared/COORDINATION.md docs/planning/_shared/STEERING.md; printf '%s\\n' '--- all worktree status ---'; git status --short",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 10000
}
```

## User

**Tool Result:** `TU-034CeZJSBoqePV9R2KWIqc`

```
{
  "output": "apps/brunch-agent/src/petrinaut-chat.ts:33:const targetDocumentIdFor = (conversationId: string): string =>\napps/brunch-agent/src/petrinaut-chat.ts:34:  `petrinaut-local:${conversationId}`;\napps/brunch-agent/src/petrinaut-chat.ts:37:  conversationId: string,\napps/brunch-agent/src/petrinaut-chat.ts:41:  const agent = init(GherkinElicitor, { id: conversationId });\napps/brunch-agent/src/petrinaut-chat.ts:44:    initialData: { targetDocumentId: targetDocumentIdFor(conversationId) },\napps/brunch-agent/src/petrinaut-chat.ts:64:      input.conversationId,\napps/brunch-agent/src/petrinaut-chat.ts:74:        input.conversationId,\napps/brunch-agent/src/petrinaut-chat.ts:75:        targetDocumentIdFor(input.conversationId),\napps/brunch-agent/src/petrinaut-chat.ts:78:        await session.historyReader.peek(input.conversationId),\napps/brunch-agent/src/petrinaut-chat.ts:89:        input.conversationId,\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-034CeZJSg2bY9mqNZsXPSL`

```
{
  "output": "libs/@hashintel/brunch-agent/packages/transport-aisdk/src/index.ts:136:   * Ask-return support. Absent, every tool-result follow-up stays refused\nlibs/@hashintel/brunch-agent/packages/transport-aisdk/src/index.ts:179:      readonly reason: \"tool-result-follow-up-not-supported\";\nlibs/@hashintel/brunch-agent/packages/transport-aisdk/src/index.ts:196:    reason: \"tool-result-follow-up-not-supported\",\nlibs/@hashintel/brunch-agent/packages/transport-aisdk/src/index.ts:261: * Classify one tool-result follow-up POST. A human answer submitted through\nlibs/@hashintel/brunch-agent/packages/transport-aisdk/src/index.ts:263: * machine tool result: exactly one submitted `brunch_ask` output on the\nlibs/@hashintel/brunch-agent/packages/transport-aisdk/src/index.ts:265: * Petrinaut mutation outputs, the synthetic diagnostics message — remains\nlibs/@hashintel/brunch-agent/packages/transport-aisdk/src/index.ts:587:      execute: async ({ writer }) => {\nlibs/@hashintel/brunch-agent/packages/transport-aisdk/src/index.ts:592:            // panel as an awaiting client tool, and the harness's own output\nlibs/@hashintel/brunch-agent/packages/transport-aisdk/src/index.ts:600:              writer.write({\nlibs/@hashintel/brunch-agent/packages/transport-aisdk/src/index.ts:626:            writer.write(toUiChunk(wireEvent));\napps/petrinaut-website/src/main/app/brunch-demo/brunch-petrinaut.tsx:8:import { Petrinaut, type ViewportAction } from \"@hashintel/petrinaut/ui\";\napps/petrinaut-website/src/main/app/brunch-demo/brunch-petrinaut.tsx:14:  PetrinautDocHandle,\napps/petrinaut-website/src/main/app/brunch-demo/brunch-petrinaut.tsx:21:const BrunchPetrinautWithHandle = ({\napps/petrinaut-website/src/main/app/brunch-demo/brunch-petrinaut.tsx:32:  const [handle] = useState<PetrinautDocHandle>(() =>\napps/petrinaut-website/src/main/app/brunch-demo/brunch-petrinaut.tsx:46:      <Petrinaut\napps/petrinaut-website/src/main/app/brunch-demo/brunch-petrinaut.tsx:58:export const BrunchPetrinaut = ({\napps/petrinaut-website/src/main/app/brunch-demo/brunch-petrinaut.tsx:102:    <BrunchPetrinautWithHandle\napps/petrinaut-website/src/main/app/brunch-demo/brunch-actual-mode-route.tsx:3:import { BrunchPetrinaut } from \"./brunch-petrinaut\";\napps/petrinaut-website/src/main/app/brunch-demo/brunch-actual-mode-route.tsx:33:      <BrunchPetrinaut viewportActions={viewportActions} />\napps/brunch-agent/src/petrinaut-chat.ts:1:/** Application composition for Petrinaut's stock AI SDK chat transport. */\napps/petrinaut-website/src/main/app/brunch-demo/brunch-frame-parsers.ts:50: * Brunch execution-plan shape into a read-only Petrinaut SDCPN for rendering.\napps/petrinaut-website/src/main/app/optimization-demo/petrinaut-opt-optimization.ts:2:  attachPetrinautOptimizationRunStream,\napps/petrinaut-website/src/main/app/optimization-demo/petrinaut-opt-optimization.ts:3:  createPetrinautOptimizerClient,\napps/petrinaut-website/src/main/app/optimization-demo/petrinaut-opt-optimization.ts:4:  PetrinautOptimizerHttpError,\napps/petrinaut-website/src/main/app/optimization-demo/petrinaut-opt-optimization.ts:9:  PetrinautOptimization,\napps/petrinaut-website/src/main/app/optimization-demo/petrinaut-opt-optimization.ts:10:  PetrinautOptimizationEvent,\napps/petrinaut-website/src/main/app/optimization-demo/petrinaut-opt-optimization.ts:12:import type { PetrinautOptimizerFetch } from \"@local/petrinaut-optimizer-client\";\napps/petrinaut-website/src/main/app/optimization-demo/petrinaut-opt-optimization.ts:15: * Dev-proxy base for the local Petrinaut Optimizer: `vite.config.ts` rewrites\napps/petrinaut-website/src/main/app/optimization-demo/petrinaut-opt-optimization.ts:27: * Stamp the duck-typed classification fields Petrinaut's optimization\napps/petrinaut-website/src/main/app/optimization-demo/petrinaut-opt-optimization.ts:33:  error instanceof PetrinautOptimizerHttpError\napps/petrinaut-website/src/main/app/optimization-demo/petrinaut-opt-optimization.ts:66:  error instanceof PetrinautOptimizerHttpError\napps/petrinaut-website/src/main/app/optimization-demo/petrinaut-opt-optimization.ts:72:/** Create the local-only Petrinaut capability backed directly by Python. */\napps/petrinaut-website/src/main/app/optimization-demo/petrinaut-opt-optimization.ts:73:export const createPetrinautOptOptimization = (\napps/petrinaut-website/src/main/app/optimization-demo/petrinaut-opt-optimization.ts:74:  fetchImpl: PetrinautOptimizerFetch = fetch,\napps/petrinaut-website/src/main/app/optimization-demo/petrinaut-opt-optimization.ts:75:): PetrinautOptimization => {\napps/petrinaut-website/src/main/app/optimization-demo/petrinaut-opt-optimization.ts:76:  const client = createPetrinautOptimizerClient(\napps/petrinaut-website/src/main/app/optimization-demo/petrinaut-opt-optimization.ts:100:      let events: AsyncIterable<PetrinautOptimizationEvent>;\napps/petrinaut-website/src/main/app/optimization-demo/petrinaut-opt-optimization.ts:102:        ({ events } = await attachPetrinautOptimizationRunStream({\napps/petrinaut-website/src/main/app/brunch-demo/brunch-status-page.tsx:58:        Back to Petrinaut\napps/petrinaut-website/src/main/app/brunch-demo/brunch-protocol.ts:45: * This is intentionally not Petrinaut's full SDCPN document format. It only\napps/petrinaut-website/src/main/app/brunch-demo/brunch-protocol.ts:53: * creating a read-only handle with Petrinaut extensions disabled.\napps/petrinaut-website/src/main/app/brunch-demo/brunch-protocol.ts:56: * Brunch/Petrinaut protocol once that protocol is owned in Petrinaut Core.\napps/brunch-agent/src/routes.ts:4:/** Stock `DefaultChatTransport` endpoint used by Petrinaut's local panel. */\napps/petrinaut-website/src/main/app/brunch-demo/brunch-route.ts:2: * This is temporary, until Petrinaut Demo app gets a real Router.\napps/brunch-agent/src/agents/gherkin-elicitor.ts:54: * demo shell is chartered to mount this library alongside the Petrinaut\napps/petrinaut-website/src/main/app/optimization-demo/optimization-demo-app.tsx:2:import { PetrinautOptOptimizationProvider } from \"./petrinaut-opt-optimization-provider\";\napps/petrinaut-website/src/main/app/optimization-demo/optimization-demo-app.tsx:5:  <PetrinautOptOptimizationProvider>\napps/petrinaut-website/src/main/app/optimization-demo/optimization-demo-app.tsx:7:  </PetrinautOptOptimizationProvider>\napps/petrinaut-website/src/main/app/optimization-demo/petrinaut-opt-optimization.test.ts:3:import { createPetrinautOptOptimization } from \"./petrinaut-opt-optimization\";\napps/petrinaut-website/src/main/app/optimization-demo/petrinaut-opt-optimization.test.ts:5:import type { PetrinautOptimizationInput } from \"@hashintel/petrinaut-core\";\napps/petrinaut-website/src/main/app/optimization-demo/petrinaut-opt-optimization.test.ts:10:} as PetrinautOptimizationInput;\napps/petrinaut-website/src/main/app/optimization-demo/petrinaut-opt-optimization.test.ts:12:describe(\"createPetrinautOptOptimization\", () => {\napps/petrinaut-website/src/main/app/optimization-demo/petrinaut-opt-optimization.test.ts:33:    const optimization = createPetrinautOptOptimization(fetchImpl);\napps/petrinaut-website/src/main/app/optimization-demo/petrinaut-opt-optimization.test.ts:72:    const optimization = createPetrinautOptOptimization(fetchImpl);\napps/petrinaut-website/src/main/app/optimization-demo/petrinaut-opt-optimization-provider.tsx:1:import { PetrinautOptimizationContext } from \"@hashintel/petrinaut/react\";\napps/petrinaut-website/src/main/app/optimization-demo/petrinaut-opt-optimization-provider.tsx:3:import { createPetrinautOptOptimization } from \"./petrinaut-opt-optimization\";\napps/petrinaut-website/src/main/app/optimization-demo/petrinaut-opt-optimization-provider.tsx:7:const petrinautOptOptimization = createPetrinautOptOptimization();\napps/petrinaut-website/src/main/app/optimization-demo/petrinaut-opt-optimization-provider.tsx:9:/** Direct Petrinaut Opt integration for the local demo website only. */\napps/petrinaut-website/src/main/app/optimization-demo/petrinaut-opt-optimization-provider.tsx:10:export const PetrinautOptOptimizationProvider: FC<PropsWithChildren> = ({\napps/petrinaut-website/src/main/app/optimization-demo/petrinaut-opt-optimization-provider.tsx:13:  <PetrinautOptimizationContext value={petrinautOptOptimization}>\napps/petrinaut-website/src/main/app/optimization-demo/petrinaut-opt-optimization-provider.tsx:15:  </PetrinautOptimizationContext>\napps/petrinaut-website/src/main/app/local-storage-demo/brunch-ask-interactive-tool.tsx:12:  definePetrinautAiInteractiveTool,\napps/petrinaut-website/src/main/app/local-storage-demo/brunch-ask-interactive-tool.tsx:143:export const brunchAskInteractiveTool = definePetrinautAiInteractiveTool({\napps/petrinaut-website/src/main/app/local-storage-demo/local-storage-demo-app.tsx:7:  type PetrinautDocHandle,\napps/petrinaut-website/src/main/app/local-storage-demo/local-storage-demo-app.tsx:8:  type PetrinautHandleCapabilities,\napps/petrinaut-website/src/main/app/local-storage-demo/local-storage-demo-app.tsx:13:  Petrinaut,\napps/petrinaut-website/src/main/app/local-storage-demo/local-storage-demo-app.tsx:14:  type PetrinautAiChatTransport,\napps/petrinaut-website/src/main/app/local-storage-demo/local-storage-demo-app.tsx:15:  type PetrinautAiMessage,\napps/petrinaut-website/src/main/app/local-storage-demo/local-storage-demo-app.tsx:74:} satisfies PetrinautHandleCapabilities;\napps/petrinaut-website/src/main/app/local-storage-demo/local-storage-demo-app.tsx:76:const createHandle = (net: SDCPNInLocalStorage): PetrinautDocHandle =>\napps/petrinaut-website/src/main/app/local-storage-demo/local-storage-demo-app.tsx:83:const petrinautAiChatTransport: PetrinautAiChatTransport =\napps/petrinaut-website/src/main/app/local-storage-demo/local-storage-demo-app.tsx:100:  handle: PetrinautDocHandle;\napps/petrinaut-website/src/main/app/local-storage-demo/local-storage-demo-app.tsx:112: * Local-storage demo shell for Petrinaut.\napps/petrinaut-website/src/main/app/local-storage-demo/local-storage-demo-app.tsx:115: * Petrinaut document handle owns the currently open net's live editable state.\napps/petrinaut-website/src/main/app/local-storage-demo/local-storage-demo-app.tsx:263:      onMessages: (messages: PetrinautAiMessage[]) => {\napps/petrinaut-website/src/main/app/local-storage-demo/local-storage-demo-app.tsx:299:        <Petrinaut\napps/petrinaut-website/src/main/app/local-storage-demo/use-local-storage-ai-messages.ts:3:import type { PetrinautAiMessage } from \"@hashintel/petrinaut/ui\";\napps/petrinaut-website/src/main/app/local-storage-demo/use-local-storage-ai-messages.ts:7:type AiMessagesByNetId = Record<string, PetrinautAiMessage[]>;\napps/petrinaut-website/src/main/app/local-storage-demo/walkthrough/walkthrough-steps.tsx:28:        Welcome to Petrinaut\napps/petrinaut-website/src/main/app/local-storage-demo/walkthrough/walkthrough-steps.tsx:34:          <strong>Petrinaut</strong> is a workshop for building, simulating, and\napps/petrinaut-website/src/main/app/local-storage-demo/walkthrough/walkthrough-steps.tsx:46:    videoAlt: \"The Petrinaut editor with an example net on the canvas\",\napps/petrinaut-website/src/main/app/local-storage-demo/walkthrough/walkthrough-steps.tsx:59:          <strong>Petrinaut</strong> lets you run experiments on complex\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-034CeZJT4MsLJLaJGxncm4`

```
{
  "output": "libs/@hashintel/brunch-agent/packages/plugin-gherkin/src/index.ts:51:      schema: StatementNotedProposal,\nlibs/@hashintel/brunch-agent/packages/core/src/testing/index.ts:41:        schema: fixtureProposalSchema,\nlibs/@hashintel/brunch-agent/packages/core/src/session-log.ts:12:  /** Stable identity supplied by the substrate's public projection. */\nlibs/@hashintel/brunch-agent/packages/core/src/session-log.ts:24:  /** Substrate projection identity, distinct from the harness session id. */\nlibs/@hashintel/brunch-agent/packages/core/src/sweep-protocol.ts:22:    proposals: v.array(plugin.proposalCatalog[0].schema),\nlibs/@hashintel/brunch-agent/packages/core/src/sweep-protocol.ts:227:    `Use only the declared proposal schema: ${plugin.proposalNames.join(\", \")}. Do not add parsed structure or undeclared proposal types.`,\nlibs/@hashintel/brunch-agent/packages/core/src/sweep-protocol.ts:297:  \"Projection and validation are read-time operations; do not treat sweep completion as a stored derived result.\",\nlibs/@hashintel/brunch-agent/packages/core/src/capture-store.ts:294:// Range ordering belongs to this schema rather than to any one caller: every\nlibs/@hashintel/brunch-agent/packages/core/src/capture-store.ts:746:      // States what the schema checked, and no more: the spans are structurally\nlibs/@hashintel/brunch-agent/packages/core/src/capture-store.ts:748:      // having been resolved against an entry projection.\nlibs/@hashintel/brunch-agent/packages/core/src/capture-store.ts:1111:      // Through the same schema a persisted issue is read with, so a command\nlibs/@hashintel/brunch-agent/packages/core/src/capture-store.ts:1131:      // than in the schema: a closed conflict's captures are legitimately\nlibs/@hashintel/brunch-agent/packages/core/src/plugin.ts:11: * target has stressed it, so nothing in this scaffold ratifies the SDK export\nlibs/@hashintel/brunch-agent/packages/core/src/plugin.ts:29:  readonly schema: v.GenericSchema<unknown, CaptureInputProposal>;\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-034CeZJTSUcr5qWmnMmPHy`

```
{
  "output": "--- all worktree status ---\n M libs/@hashintel/brunch-agent/docs/agents/git-workflow.md\n M libs/@hashintel/brunch-agent/docs/agents/issue-writing.md\n M libs/@hashintel/brunch-agent/docs/agents/legibility.md\n M libs/@hashintel/brunch-agent/docs/planning/_shared/hash-monorepo-import-plan.md\n",
  "exitCode": 0
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "sed -n '1,240p' packages/core/src/plugin.ts; sed -n '180,340p' packages/core/src/sweep-protocol.ts",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "rg -n \"captureStore|sweep|archive|read\\(\" packages/binding-flue/src/index.ts; sed -n '300,560p' packages/binding-flue/src/index.ts",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "sed -n '1,120p' ../../../apps/brunch-agent/src/petrinaut-chat.ts; sed -n '240,290p' packages/transport-aisdk/src/index.ts; sed -n '120,210p' packages/transport-aisdk/src/index.ts",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "sed -n '1,120p' packages/plugin-gherkin/src/index.ts; sed -n '1,170p' ../../../apps/brunch-agent/src/agents/gherkin-elicitor.ts",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

## User

**Tool Result:** `TU-034CeZZ7NzVgHV9ojR89cd`

```
{
  "output": "import * as v from \"valibot\";\n\nimport type { CaptureInputProposal } from \"./capture-store\";\n\n/**\n * The plugin descriptor — identity only, at this stage.\n *\n * The plugin's real surface is its packs and the four operations (spec §6.1,\n * §11.1). Those are **deliberately absent here**: spec §13's two-targets rule\n * says the trivial target must not freeze the plugin contract before the hard\n * target has stressed it, so nothing in this scaffold ratifies the SDK export\n * surface. What the descriptor fixes now is only what the topology needs —\n * that a plugin declares which target-domain it defines, and does so through\n * Valibot like every other boundary in the system (spec §12.4).\n */\nexport const PluginDescriptor = v.object({\n  /** Package-level identity, matching the `plugin-*` role prefix (spec §12.2). */\n  name: v.pipe(\n    v.string(),\n    v.regex(/^plugin-[a-z][a-z0-9-]*$/, \"expected a `plugin-<name>` name\"),\n  ),\n  /** The artifact family this plugin elicits — gherkin scenarios, assurance arguments. */\n  targetDomain: v.pipe(v.string(), v.nonEmpty()),\n});\n\nexport interface PluginProposalType {\n  readonly name: string;\n  readonly description: string;\n  readonly schema: v.GenericSchema<unknown, CaptureInputProposal>;\n}\n\nexport type Plugin = v.InferOutput<typeof PluginDescriptor> & {\n  /** FE-1392's declared floor; FE-1393 grows the catalog and SDK around it. */\n  readonly proposalCatalog: readonly [PluginProposalType];\n};\n\n/**\n * Declare a plugin. Inversion of control (spec §4): the plugin declares and\n * registers; the harness discovers, orders, and invokes. Nothing a plugin\n * declares can reach persistence — the storage port is harness-defined and\n * binding-implemented, and plugins are storage-blind (spec §9.6).\n */\nexport function definePlugin(descriptor: Plugin): Plugin {\n  const identity = v.parse(PluginDescriptor, descriptor);\n  const [proposal, ...extraProposals] = descriptor.proposalCatalog;\n  if (!proposal || extraProposals.length > 0) {\n    throw new TypeError(\n      \"This slice requires exactly one declared proposal type.\",\n    );\n  }\n  const name = v.parse(v.pipe(v.string(), v.nonEmpty()), proposal.name);\n  const description = v.parse(\n    v.pipe(v.string(), v.nonEmpty()),\n    proposal.description,\n  );\n  return {\n    ...identity,\n    proposalCatalog: [{ ...proposal, name, description }],\n  };\n}\n    ...parsedState,\n    lastCheckedUserEntryId: parsedState.sweptThroughUserEntryId,\n  });\n};\n\nconst renderEntry = (entry: SweepSessionEntry): readonly string[] => {\n  const rendered: string[] = [];\n  for (const affordance of entry.affordances ?? []) {\n    rendered.push(`[assistant ask] ${affordance.markdown}`);\n  }\n  if (entry.text.length > 0) {\n    const label = isTrueUserEntry(entry) ? \"user\" : entry.kind;\n    rendered.push(`[${label}] ${entry.text}`);\n  }\n  return rendered;\n};\n\nconst renderTail = (tail: readonly SweepSessionEntry[]): string =>\n  tail.flatMap(renderEntry).join(\"\\n\");\n\nexport interface SettlementCheckSignal {\n  readonly type: \"settlement-check\";\n  readonly tagName: \"settlement-check\";\n  readonly body: string;\n}\n\nexport const buildSettlementCheckSignal = (\n  tail: readonly SweepSessionEntry[],\n): SettlementCheckSignal => ({\n  type: \"settlement-check\",\n  tagName: \"settlement-check\",\n  body: [\n    \"The harness computed this unswept conversation tail:\",\n    renderTail(tail),\n    `Judge whether this range has settled. If it has, call ${toolName(\"sweep\")}. Declining is legal; continue the interview when the topic is still open.`,\n  ].join(\"\\n\\n\"),\n});\n\nexport const buildSweepExtractionPrompt = (\n  plugin: {\n    readonly targetDomain: string;\n    readonly proposalNames: readonly string[];\n  },\n  tail: readonly SweepSessionEntry[],\n): string =>\n  [\n    `Extract capture proposals for the ${plugin.targetDomain} target from this settled conversation range.`,\n    `Use only the declared proposal schema: ${plugin.proposalNames.join(\", \")}. Do not add parsed structure or undeclared proposal types.`,\n    \"Every user-grounded proposal must cite one or more exact verbatim quotes from the user lines below. Never supply entry ids, ranges, pointers, or evidence sources; the harness resolves those.\",\n    \"The declared verbatim interior must preserve what was said without paraphrase or normalization. Return an empty proposal list when no honest capture is available.\",\n    renderTail(tail),\n  ].join(\"\\n\\n\");\n\nexport interface SweepRepairSignal {\n  readonly type: \"sweep-repair\";\n  readonly tagName: \"sweep-repair\";\n  readonly body: string;\n}\n\nexport const buildSweepRepairSignal = (\n  refusal: Pick<CaptureStoreRefusal, \"code\" | \"message\"> | SweepRefusalFact,\n): SweepRepairSignal => ({\n  type: \"sweep-repair\",\n  tagName: \"sweep-repair\",\n  body: `The sweep was refused: ${refusal.message} Repair the proposal and call ${toolName(\"sweep\")} again. Declining is legal.`,\n});\n\nexport const pendingSweepRepair = (\n  entries: readonly SweepSessionEntry[],\n): SweepRefusalFact | null => {\n  let pending: SweepRefusalFact | null = null;\n  for (const entry of entries) {\n    if (entry.sweepRepairSignal) pending = null;\n    if (entry.sweepResult?.status === \"refused\" && entry.sweepResult.refusal) {\n      pending = entry.sweepResult.refusal;\n    } else if (entry.sweepResult && entry.sweepResult.status !== \"refused\") {\n      pending = null;\n    }\n  }\n  return pending;\n};\n\nexport interface UnaccountedAskAdvisory {\n  readonly type: \"unaccounted-ask\";\n  readonly affordanceId: string;\n  readonly question: string;\n  readonly message: string;\n}\n\nexport const computeUnaccountedAskAdvisories = (\n  tail: readonly SweepSessionEntry[],\n  capturedUserEntryIds: ReadonlySet<string>,\n): readonly UnaccountedAskAdvisory[] => {\n  const accountedAffordanceIds = new Set(\n    tail.flatMap((entry) =>\n      entry.replyToAffordanceId === undefined ||\n      !capturedUserEntryIds.has(entry.id)\n        ? []\n        : [entry.replyToAffordanceId],\n    ),\n  );\n  return tail.flatMap((entry) =>\n    (entry.affordances ?? [])\n      .filter((affordance) => !accountedAffordanceIds.has(affordance.id))\n      .map((affordance) => ({\n        type: \"unaccounted-ask\" as const,\n        affordanceId: affordance.id,\n        question: affordance.markdown,\n        message:\n          \"The swept range contains an ask with no affordance-bound capture.\",\n      })),\n  );\n};\n\nexport const settlementProtocolInstructionFragments = (): readonly string[] => [\n  \"When the harness reports an unswept tail, judge whether that range has settled. Declining is legal.\",\n  `When it has settled, call ${toolName(\"sweep\")}. The harness privately extracts quote-anchored proposals, refreshes durable history, applies them atomically, and advances the swept high-water mark only on success.`,\n  \"Projection and validation are read-time operations; do not treat sweep completion as a stored derived result.\",\n];\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-034CeZZ7m3yMGGMRQHGE53`

```
{
  "output": "45:  sweepableRange,\n78:  readonly captureStore: CaptureStore;\n100:    \"sweepHighWater\",\n104:  let sweepState = parseSweepState(storedSweepState);\n139:    name: toolName(\"sweep\"),\n141:      \"Apply or replay the settled conversation prefix. The harness privately extracts quote-anchored captures, refreshes durable history immediately before atomic application, and advances sweep state only on success.\",\n152:      const range = sweepableRange(historyAtJudgment);\n159:        \"extract-sweep-proposals\",\n178:      // archive write makes every quote resolvable before the store sees it.\n181:          await session.historyReader.read(session.sessionId),\n184:      const applied = await step.do(\"apply-sweep\", () =>\n185:        session.captureStore.execute(\n187:            type: \"apply-sweep\",\n196:        sweepState = reopenSweepAfterRefusal(sweepState);\n197:        setSweepState(sweepState);\n203:      sweepState = advanceSweepHighWater(sweepState, throughUserEntryId);\n204:      setSweepState(sweepState);\n206:        session.captureStore,\n246:      state: sweepState,\n251:    sweepState = decision.nextState;\n252:    setSweepState(sweepState);\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-034CeZZ8SSapF1CCmTDc8k`

```
{
  "output": "/** Application composition for Petrinaut's stock AI SDK chat transport. */\n\nimport { init } from \"@flue/runtime\";\n\nimport {\n  decideAskReplyAdmission,\n  pendingAskAffordanceId,\n} from \"@hashintel/brunch-agent\";\nimport {\n  createFlueReplyProjector,\n  projectFlueHistoryForSweep,\n} from \"@hashintel/brunch-agent-binding-flue\";\nimport {\n  createAiSdkChatHandler,\n  type HarnessReplyEvent,\n  type TransportInspectionEvent,\n} from \"@hashintel/brunch-agent-transport-aisdk\";\n\nimport { GherkinElicitor } from \"./agents/gherkin-elicitor.ts\";\nimport { createGherkinElicitationSession } from \"./elicitation-session.ts\";\n\nconst inspect =\n  process.env.BRUNCH_TRANSPORT_AISDK_INSPECT === \"1\"\n    ? (event: TransportInspectionEvent): void => {\n        // This is an opt-in shell diagnostic stream. It is never dispatched\n        // into Flue and therefore cannot become elicitation evidence.\n        console.log(`TRANSPORT_AISDK ${JSON.stringify(event)}`);\n      }\n    : undefined;\n\n// FE-1439 replaces this local one-conversation/one-document identity\n// with principal-owned private session lookup. Keep it opaque here.\nconst targetDocumentIdFor = (conversationId: string): string =>\n  `petrinaut-local:${conversationId}`;\n\nconst streamElicitorTurn = async (\n  conversationId: string,\n  dispatch: { readonly message: string; readonly idempotencyKey: string },\n  emit: (event: HarnessReplyEvent) => void,\n): Promise<void> => {\n  const agent = init(GherkinElicitor, { id: conversationId });\n  const receipt = await agent.dispatch({\n    ...dispatch,\n    initialData: { targetDocumentId: targetDocumentIdFor(conversationId) },\n  });\n  const projector = createFlueReplyProjector({\n    submissionId: receipt.submissionId,\n    emit,\n  });\n  await agent.read(receipt, { onEvent: (chunk) => projector.accept(chunk) });\n};\n\nexport const petrinautChatHandler = createAiSdkChatHandler({\n  allowedOrigins: (\n    process.env.BRUNCH_PETRINAUT_ORIGINS ??\n    \"http://127.0.0.1:4915,http://localhost:4915\"\n  )\n    .split(\",\")\n    .map((origin) => origin.trim())\n    .filter((origin) => origin.length > 0),\n  inspect,\n  runTurn: (input, emit) =>\n    streamElicitorTurn(\n      input.conversationId,\n      { message: input.userMessage.text, idempotencyKey: input.idempotencyKey },\n      emit,\n    ),\n  askReply: {\n    // Admission consults durable Flue history, not request-shaped claims: the\n    // submission resumes the conversation only when its tool-call id\n    // correlates with the one ask still awaiting a reply.\n    async admit(input) {\n      const session = createGherkinElicitationSession(\n        input.conversationId,\n        targetDocumentIdFor(input.conversationId),\n      );\n      const entries = projectFlueHistoryForSweep(\n        await session.historyReader.peek(input.conversationId),\n      );\n      return decideAskReplyAdmission(\n        pendingAskAffordanceId(entries),\n        input.ask.toolCallId,\n      );\n    },\n    // The admitted answer is a fresh user dispatch (spec §7.4); the binding\n    // binds it to the pending affordance, making it the user-affordance reply.\n    run: (input, emit) =>\n      streamElicitorTurn(\n        input.conversationId,\n        { message: input.ask.answer, idempotencyKey: input.idempotencyKey },\n        emit,\n      ),\n  },\n});\n        \"text\" in part &&\n        typeof part.text === \"string\",\n    )\n    .map((part) => part.text)\n    .join(\"\");\n  return text.length > 0 ? text : undefined;\n};\n\ntype ParsedTransportRequest =\n  | { readonly kind: \"initial\"; readonly value: HarnessTurnInput }\n  | { readonly kind: \"ask-reply\"; readonly value: HarnessAskReplyInput }\n  | { readonly kind: \"refused\"; readonly refusal: TransportRequestRefusal };\n\nconst isAnsweredAskPart = (\n  part: NonNullable<PanelMessage[\"parts\"]>[number],\n): boolean =>\n  ((part.type === \"dynamic-tool\" && part.toolName === ASK_TOOL_NAME) ||\n    part.type === `tool-${ASK_TOOL_NAME}`) &&\n  part.state === \"output-available\";\n\n/**\n * Classify one tool-result follow-up POST. A human answer submitted through\n * the registered ask component travels tool-output-shaped but is not a\n * machine tool result: exactly one submitted `brunch_ask` output on the\n * referenced assistant message is a candidate reply. Everything else —\n * Petrinaut mutation outputs, the synthetic diagnostics message — remains\n * the machine-input protocol this transport still refuses (FE-1438 owns it).\n */\nconst parseAskReplyTurn = (body: PanelPostBody): ParsedTransportRequest => {\n  if (\n    typeof body.id !== \"string\" ||\n    body.id.length === 0 ||\n    typeof body.messageId !== \"string\" ||\n    body.messageId.length === 0 ||\n    body.trigger !== \"submit-message\" ||\n    !Array.isArray(body.messages)\n  ) {\n    return {\n      kind: \"refused\",\n      refusal: transportRequestRefusals.invalidChatRequest,\n    };\n  }\n\n  const message = body.messages.find(\n    (candidate) =>\n      candidate.id === body.messageId && candidate.role === \"assistant\",\n  );\n  const askParts = (message?.parts ?? []).filter(isAnsweredAskPart);\n  if (askParts.length === 0) {\n    return {\n      kind: \"refused\",\n      readonly type: \"ask-reply-admitted\";\n      readonly requestId: string;\n      readonly conversationId: string;\n      readonly toolCallId: string;\n    }\n  | {\n      readonly type: \"ask-reply-refused\";\n      readonly requestId: string;\n      readonly conversationId: string;\n      readonly toolCallId: string;\n      readonly reason: \"no-pending-ask\" | \"different-ask-pending\";\n    };\n\nexport interface AiSdkChatHandlerOptions {\n  readonly runTurn: HarnessTurnRunner;\n  /**\n   * Ask-return support. Absent, every tool-result follow-up stays refused\n   * (the FE-1436 negative contract); present, exactly the pending ask's\n   * correlated submission resumes the conversation.\n   */\n  readonly askReply?: AskReplyHandler;\n  /** Exact browser origins allowed to call this endpoint across origins. */\n  readonly allowedOrigins?: readonly string[];\n  /** Opt-in diagnostic sink. Events are metadata only and never re-enter the conversation. */\n  readonly inspect?: (event: TransportInspectionEvent) => void;\n}\n\nconst panelPartSchema = v.looseObject({\n  type: v.optional(v.unknown()),\n  text: v.optional(v.unknown()),\n  toolName: v.optional(v.unknown()),\n  toolCallId: v.optional(v.unknown()),\n  state: v.optional(v.unknown()),\n  output: v.optional(v.unknown()),\n});\n\nconst panelMessageSchema = v.looseObject({\n  id: v.optional(v.unknown()),\n  role: v.optional(v.unknown()),\n  parts: v.optional(v.array(panelPartSchema)),\n});\n\nconst panelPostBodySchema = v.looseObject({\n  id: v.optional(v.unknown()),\n  messageId: v.optional(v.unknown()),\n  messages: v.optional(v.array(panelMessageSchema)),\n  trigger: v.optional(v.unknown()),\n});\n\ntype PanelMessage = v.InferOutput<typeof panelMessageSchema>;\ntype PanelPostBody = v.InferOutput<typeof panelPostBodySchema>;\n\ntype TransportRequestRefusal =\n  | {\n      readonly reason: \"invalid-chat-request\";\n      readonly status: 400;\n      readonly error: \"invalid_chat_request\";\n    }\n  | {\n      readonly reason: \"tool-result-follow-up-not-supported\";\n      readonly status: 422;\n      readonly error: \"tool_result_follow_up_not_supported\";\n    }\n  | {\n      readonly reason: \"invalid-ask-submission\";\n      readonly status: 400;\n      readonly error: \"invalid_ask_submission\";\n    };\n\nconst transportRequestRefusals = {\n  invalidChatRequest: {\n    reason: \"invalid-chat-request\",\n    status: 400,\n    error: \"invalid_chat_request\",\n  },\n  toolResultFollowUpNotSupported: {\n    reason: \"tool-result-follow-up-not-supported\",\n    status: 422,\n    error: \"tool_result_follow_up_not_supported\",\n  },\n  invalidAskSubmission: {\n    reason: \"invalid-ask-submission\",\n    status: 400,\n    error: \"invalid_ask_submission\",\n  },\n} as const satisfies Record<string, TransportRequestRefusal>;\n\nconst askReplyRefusalErrors = {\n  \"no-pending-ask\": \"ask_not_pending\",\n  \"different-ask-pending\": \"ask_mismatch\",\n} as const;\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-034CeZZ8wgHAAtTub6xUHz`

```
{
  "output": "/**\n * `@hashintel/brunch-agent-plugin-gherkin` — the gherkin target-domain (spec §13.1).\n *\n * The tracer target: cheap enough to wire end-to-end first, and deliberately\n * trivial, so it must not be the plugin that freezes the contract (spec §13's\n * two-targets-on-each-axis rule). Its packs, `project`, and `validate` land\n * with their own slice.\n *\n * **This package resolves `@hashintel/brunch-agent` and nothing else** — never the binding,\n * never Flue. Target policy has no business knowing which substrate it is\n * running on, and it is storage-blind besides (spec §9.6).\n */\n\nimport * as v from \"valibot\";\n\nimport { definePlugin } from \"@hashintel/brunch-agent\";\n\nconst nonEmptyString = v.pipe(v.string(), v.nonEmpty());\nconst evidenceQuote = v.strictObject({ excerpt: nonEmptyString });\n\nconst StatementNotedProposal = v.pipe(\n  v.strictObject({\n    evidence: v.pipe(v.array(evidenceQuote), v.minLength(1)),\n    epistemicStatus: v.literal(\"explicit\"),\n    confidence: v.picklist([\"firm\", \"hedged\", \"speculative\"]),\n    content: v.strictObject({\n      value: v.strictObject({\n        type: v.literal(\"statement-noted\"),\n        interior: v.strictObject({ verbatim: nonEmptyString }),\n      }),\n    }),\n  }),\n  v.check(\n    (proposal) =>\n      proposal.evidence.some(\n        (evidence) =>\n          evidence.excerpt === proposal.content.value.interior.verbatim,\n      ),\n    \"The verbatim interior must equal one cited user quote.\",\n  ),\n);\n\nexport const gherkin = definePlugin({\n  name: \"plugin-gherkin\",\n  targetDomain: \"gherkin\",\n  proposalCatalog: [\n    {\n      name: \"statement-noted\",\n      description:\n        \"Record one condition-shaped statement at the verbatim grade floor, with no parsed structure.\",\n      schema: StatementNotedProposal,\n    },\n  ],\n});\n\"use agent\";\n/**\n * The gherkin elicitor (spec §12.5: one agent per target).\n *\n * Named as a noun — the thing, not the act — and read target-first, so the\n * family sorts together as targets multiply: `gherkin-elicitor`,\n * `assurance-elicitor`.\n *\n * The product is the harness library in a thin host-authored agent — Flue's\n * build-time scan makes the alternative structurally unavailable, since a\n * library cannot ship a pre-registered agent (spec §12.1). So this module is\n * deliberately thin: it mounts harness capability and holds no elicitation\n * semantics of its own.\n *\n * Three recorded Flue constraints are honoured here by construction (spec §10):\n * the `'use agent'` directive is the file's first statement; `agentName` is a\n * pinned string literal, because conversation storage keys on it; and the tool\n * set is static, because prompt-cache economics forbid per-question tool\n * swapping.\n */\n\nimport { useInitialData, useModel, type AgentProps } from \"@flue/runtime\";\nimport * as v from \"valibot\";\n\nimport { useElicitation } from \"@hashintel/brunch-agent-binding-flue\";\nimport { gherkin } from \"@hashintel/brunch-agent-plugin-gherkin\";\n\nimport { createGherkinElicitationSession } from \"../elicitation-session.ts\";\n\n/**\n * One definition for the agent and the faux provider alike: the two must name\n * the same model id, and drift fails at resolution only if both sides resolve\n * the same string (Flue patterns audit, 2026-08-17).\n */\nexport const GHERKIN_MODEL_ID = \"claude-haiku-4-5\";\n\nexport function GherkinElicitor(props: AgentProps) {\n  useModel(`anthropic/${GHERKIN_MODEL_ID}`);\n  const initialData = useInitialData<{ targetDocumentId: string }>();\n  return useElicitation(\n    gherkin,\n    createGherkinElicitationSession(props.id, initialData.targetDocumentId),\n  );\n}\n\n/**\n * Pinned, and never to be edited: conversation storage keys on this literal,\n * so changing it orphans every existing conversation. Flue requires a string\n * literal here because build targets derive durable identifiers from it before\n * any user code runs.\n *\n * Product-prefixed on purpose, and this is the one place the prefix is not\n * cosmetic. Agent identities are global per application, and the September\n * demo shell is chartered to mount this library alongside the Petrinaut\n * libraries — a bare `gherkin-elicitor` could collide with another library's\n * agent, and the collision would land on durable conversation storage.\n *\n * The exported symbol stays the shorter `GherkinElicitor` because it reads\n * better at the mount site; `agentName` exists precisely to let durable\n * identity and source-level name differ.\n */\nGherkinElicitor.agentName = \"brunch-gherkin-elicitor\";\n\n/**\n * Session→document binding (spec §9.1, adjudication L4): a new session's\n * `initialData` carries the target-document id, validated once at creation and\n * immutable thereafter — Flue's own lane for a target descriptor. Dispatching\n * to an existing conversation id resumes that session against the current state\n * of its target-document.\n */\nGherkinElicitor.initialData = v.object({\n  targetDocumentId: v.pipe(v.string(), v.nonEmpty()),\n});\n",
  "exitCode": 0
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "sed -n '1,275p' packages/binding-flue/src/index.ts",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

## User

**Tool Result:** `TU-034CeZeseLZ2GAIwyJ0ck0`

```
{
  "output": "/**\n * `@hashintel/brunch-agent-binding-flue` — the Flue binding.\n *\n * One binding per substrate. It implements the substrate-capability list\n * (spec §10), owns the local capture-store/session-log storage-port\n * implementation (spec §9.6), and is the\n * only shell allowed to know Flue's dialect: **the harness imports no\n * substrate; a binding imports both** (spec §4).\n *\n * Every time mechanism wants to land in here, the second-binding test applies\n * (spec §14.2): genuinely substrate-specific, or mechanism leaking into Flue's\n * dialect?\n */\n\nimport {\n  useAgentFinish,\n  useAgentStart,\n  useDataWriter,\n  useDelivery,\n  usePersistentState,\n  useTool,\n} from \"@flue/runtime\";\nimport * as v from \"valibot\";\n\nimport {\n  ASK_TOOL_DESCRIPTION,\n  AskInput,\n  FreeTextAffordance,\n  advanceSweepHighWater,\n  askProtocolInstructionFragments,\n  buildSettlementCheckSignal,\n  buildReplyBindingSignalPayload,\n  buildSweepExtractionPrompt,\n  buildSweepRepairSignal,\n  computeUnaccountedAskAdvisories,\n  createSweepExtractionResultSchema,\n  createInitialSweepState,\n  decidePendingAffordance,\n  decideSettlementTrigger,\n  mintAskAffordance,\n  parseSweepState,\n  pendingSweepRepair,\n  reopenSweepAfterRefusal,\n  settlementProtocolInstructionFragments,\n  sweepableRange,\n  toolName,\n  type CaptureStore,\n  type FreeTextAffordanceValue,\n  type Plugin,\n  type SweepState,\n} from \"@hashintel/brunch-agent\";\n\nimport { capturedUserEntryIdsForSession } from \"./capture-accounting\";\nimport {\n  projectFlueHistoryForSweep,\n  type FlueHistoryReader,\n} from \"./history-reader\";\n\nconst SweepToolOutput = v.looseObject({\n  status: v.picklist([\"no-settled-range\", \"refused\", \"applied\"]),\n});\n\nexport { CAPABILITIES, type Capability, type Provision } from \"./capabilities\";\nexport {\n  createFlueHistoryReader,\n  projectFlueHistoryForSweep,\n  type FlueHistoryReaderOptions,\n} from \"./history-reader\";\nexport {\n  createFlueReplyProjector,\n  type FlueReplyProjector,\n  type FlueReplyProjectorOptions,\n} from \"./reply-projector\";\nexport { createLocalCaptureStore } from \"./local-capture-store\";\n\nexport interface ElicitationSession {\n  readonly sessionId: string;\n  readonly captureStore: CaptureStore;\n  readonly historyReader: FlueHistoryReader;\n}\n\n/**\n * Mount the elicitation harness in a Flue agent.\n *\n * Flue has no ask-the-user primitive, so the harness owns the turn-suspension\n * protocol: a `terminate: true` ask tool, the pending affordance in\n * per-session state, and the answer arriving as a fresh dispatch (spec §7.4).\n */\nexport function useElicitation(\n  plugin: Plugin,\n  session: ElicitationSession,\n): string {\n  const delivery = useDelivery();\n  const [pending, setPending] =\n    usePersistentState<FreeTextAffordanceValue | null>(\n      \"pendingAffordance\",\n      null,\n    );\n  const [storedSweepState, setSweepState] = usePersistentState<SweepState>(\n    \"sweepHighWater\",\n    createInitialSweepState(),\n  );\n  let pendingAtFinish = pending;\n  let sweepState = parseSweepState(storedSweepState);\n  const extractionResult = createSweepExtractionResultSchema(plugin);\n  const writeAffordance = useDataWriter(\"affordance\", {\n    schema: FreeTextAffordance,\n  });\n\n  useAgentStart((ctx) => {\n    if (delivery.kind !== \"user\" || pending === null) return;\n\n    pendingAtFinish = null;\n    setPending(null);\n    ctx.append({ kind: \"signal\", ...buildReplyBindingSignalPayload(pending) });\n  });\n\n  useTool({\n    name: toolName(\"ask\"),\n    description: ASK_TOOL_DESCRIPTION,\n    input: AskInput,\n    output: FreeTextAffordance,\n    run({ data, toolCallId }) {\n      const affordance = mintAskAffordance(data.question, toolCallId);\n\n      setPending((current) => {\n        const decision = decidePendingAffordance(current, affordance);\n        if (!decision.ok) throw new Error(decision.reason);\n        pendingAtFinish = decision.pending;\n        return decision.pending;\n      });\n      writeAffordance(affordance);\n\n      return { output: affordance, terminate: true };\n    },\n  });\n\n  useTool({\n    name: toolName(\"sweep\"),\n    description:\n      \"Apply or replay the settled conversation prefix. The harness privately extracts quote-anchored captures, refreshes durable history immediately before atomic application, and advances sweep state only on success.\",\n    input: v.strictObject({}),\n    output: SweepToolOutput,\n    harness: true,\n    durable: true,\n    async run({ harness, signal, step }) {\n      const historyAtJudgment = await step.do(\"read-settled-range\", async () =>\n        projectFlueHistoryForSweep(\n          await session.historyReader.peek(session.sessionId),\n        ),\n      );\n      const range = sweepableRange(historyAtJudgment);\n      const throughUserEntryId = range.at(-1)?.id;\n      if (!throughUserEntryId) {\n        return { output: { status: \"no-settled-range\" as const } };\n      }\n\n      const extraction = await step.do(\n        \"extract-sweep-proposals\",\n        async () =>\n          (\n            await harness.prompt(\n              buildSweepExtractionPrompt(\n                {\n                  targetDomain: plugin.targetDomain,\n                  proposalNames: plugin.proposalCatalog.map(\n                    (proposal) => proposal.name,\n                  ),\n                },\n                range,\n              ),\n              { result: extractionResult, signal },\n            )\n          ).data,\n      );\n\n      // This read is intentionally adjacent to application: its binding-owned\n      // archive write makes every quote resolvable before the store sees it.\n      await step.do(\"refresh-history-before-apply\", async () =>\n        projectFlueHistoryForSweep(\n          await session.historyReader.read(session.sessionId),\n        ),\n      );\n      const applied = await step.do(\"apply-sweep\", () =>\n        session.captureStore.execute(\n          {\n            type: \"apply-sweep\",\n            // The plugin schema narrows the existing envelope here; the store\n            // repeats envelope validation and owns anchoring at apply.\n            proposals: extraction.proposals,\n          },\n          { sessionId: session.sessionId },\n        ),\n      );\n      if (!applied.ok) {\n        sweepState = reopenSweepAfterRefusal(sweepState);\n        setSweepState(sweepState);\n        return {\n          output: { status: \"refused\" as const, refusal: applied.refusal },\n        };\n      }\n\n      sweepState = advanceSweepHighWater(sweepState, throughUserEntryId);\n      setSweepState(sweepState);\n      const accountedEntryIds = await capturedUserEntryIdsForSession(\n        session.captureStore,\n        applied.snapshot,\n        session.sessionId,\n      );\n      return {\n        output: {\n          status: \"applied\" as const,\n          appliedCaptureIds:\n            \"appliedCaptureIds\" in applied.value\n              ? applied.value.appliedCaptureIds\n              : [],\n          skippedDedupKeys:\n            \"skippedDedupKeys\" in applied.value\n              ? applied.value.skippedDedupKeys\n              : [],\n          advisories: [\n            ...(\"advisories\" in applied.value ? applied.value.advisories : []),\n            ...computeUnaccountedAskAdvisories(range, accountedEntryIds),\n          ],\n        },\n      };\n    },\n  });\n\n  useAgentFinish(async (ctx) => {\n    // useAgentFinish also fires on terminate:true asks. The callback's local\n    // view is updated by ask/reply callbacks in this render, so it observes the\n    // live slot rather than the render-time persistent-state snapshot.\n    if (pendingAtFinish !== null) return;\n\n    const entries = projectFlueHistoryForSweep(\n      await session.historyReader.peek(session.sessionId),\n    );\n    const repair = pendingSweepRepair(entries);\n    if (repair) {\n      ctx.append({ kind: \"signal\", ...buildSweepRepairSignal(repair) });\n      return;\n    }\n    const decision = decideSettlementTrigger({\n      entries,\n      state: sweepState,\n      pendingAffordance: false,\n    });\n    if (decision.action !== \"nudge\") return;\n\n    sweepState = decision.nextState;\n    setSweepState(sweepState);\n    ctx.append({\n      kind: \"signal\",\n      ...buildSettlementCheckSignal(decision.tail),\n    });\n  });\n\n  return [\n    ...askProtocolInstructionFragments(plugin.targetDomain),\n    ...settlementProtocolInstructionFragments(),\n  ].join(\"\\n\\n\");\n}\n",
  "exitCode": 0
}
```

## Assistant

**Tool Use:** `apply_patch`

```json
{
  "patchText": "*** Begin Patch\n*** Add File: /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/planning/_shared/STEERING.md\n+# Brunch steering model\n+\n+This is the current strategic understanding of Brunch: what outcome matters now, what the system\n+can actually do, which beliefs remain weak, and where to spend the next unit of time. Its immediate\n+decision horizon is the September demo, but it steers the whole context rather than one package or\n+one Linear map.\n+\n+This is not a roadmap, a specification, or an issue mirror. Specifications and accepted ADRs define\n+obligations and settled architecture. Linear is canonical for issue state, hierarchy, and hard\n+blockers. [COORDINATION](./COORDINATION.md) projects this strategy onto the mechanically available\n+work. This document owns the judgment between them: which objective to pursue under the current\n+time, evidence, risk, and product pressure; what to defer; and what new evidence would change that\n+choice. It may expose a conflict with a specification or ADR, but cannot silently override one.\n+\n+The document remains live. A steering pass orients from current evidence, chooses a frontier,\n+executes to a named proof, reconciles the result with specifications and issues, then replans only\n+where the evidence changed. Git carries the history; this file carries only the current model. Its\n+shape is intentionally specific to the present effort. Do not extract a generic template or skill\n+until a second real planning cycle shows which parts recur.\n+\n+## The September outcome\n+\n+As of **2026-08-24**, the working constraint is roughly two human weeks. The event date and final\n+business use case are not yet recorded here; Dora's confirmation is a decision gate, not an excuse\n+to leave the technical spine vague.\n+\n+FE-1476 (the September demo delivery) supplies the working scenario:\n+\n+1. A reviewer opens a prebuilt cyber-physical-process requirements model and its generated SDCPN in\n+   Petrinaut.\n+2. The reviewer selects or describes a net element and asks why it was modelled that way.\n+3. Brunch traces the answer through the requirements model and captures to an exact source\n+   utterance.\n+4. The reviewer scopes one correction and conducts three to five focused chat turns.\n+5. New or superseding captures change the elicited model; reprojection changes the corresponding\n+   part of the live net without rebuilding unrelated parts.\n+6. The resulting artifact is handed to the existing optimisation experiment flow.\n+\n+This is a **review-and-revise** demonstration. It does not need to prove that Brunch can elicit an\n+entire CPS model from a blank conversation. It does need to prove a closed semantic and interaction\n+loop. A chat transcript beside a static fixture, an unexplained net mutation, or a test that injects\n+wiring absent from the deployed entrypoint does not satisfy the outcome.\n+\n+The proof spine is therefore:\n+\n+```text\n+source utterance\n+  -> active typed capture\n+  -> folded CPS requirements model\n+  -> SDCPN element + provenance\n+  -> reviewer question and scoped correction\n+  -> superseding capture\n+  -> changed folded model\n+  -> changed live SDCPN\n+  -> optimisation handoff\n+```\n+\n+## Where the system actually stands\n+\n+The package topology is in place and the implemented tracer is real, but the September loop is not\n+an incremental extension of an almost-finished product. Most of the contract-bearing middle is\n+absent.\n+\n+| Surface | Evidence now | September consequence |\n+| --- | --- | --- |\n+| Ask, suspend, return | A user answer to `brunch_ask` survives the AI SDK/Flue boundary and resumes durable history. | Reuse; do not redesign the ask protocol. |\n+| Settlement and capture | A settled range is privately swept into quote-anchored captures and applied atomically. Supersession and active-head validation exist in the store. | Preserve as the evidence foundation, but expose active state to the controller. |\n+| Plugin SDK | The exported `Plugin` is deliberately only identity plus exactly one proposal type. Gherkin captures one verbatim statement. | There is no implemented fold, demand runner, model, projection, or useful hard-target plugin to extend. |\n+| Elicitation control | The agent receives general ask/sweep instructions. Sweep extraction sees a conversation range and proposal names only. No production path reads the active capture set or a derived model back into the interview. | Brunch cannot yet choose a next question from what it has learned or conduct a targeted correction. |\n+| CPS semantics | The three-register design and provisional two-schema/two-table plugin contract are desk-designed. No `plugin-cps` exists. | The critical semantic path must be built against a concrete CPS case, not inferred from Gherkin completeness. |\n+| Correction | The store can represent supersession, but extraction cannot see active capture IDs, model issues, or the target region; Gherkin cannot propose a supersession. | Targeted re-elicitation is structurally unreachable despite the storage mechanics being present. |\n+| Petrinaut transport | Local panel streaming and human ask-return work. Machine client-tool-result follow-ups are explicitly refused pending FE-1438 (the client-tool round-trip). | The agent cannot yet apply a projection to the live document and receive the result. |\n+| Session target | The current application derives `targetDocumentId` from `conversationId`. | A new reviewer session cannot address a pre-existing elicitation target without changing this identity boundary. |\n+| Demo website | The production website still uses its stock assistant route. The `/brunch` Actual Mode is a separate read-only fixture/SSE surface. | Local tracer proof must not be mistaken for deployed integration. |\n+\n+The decisive reading is that the current design is not too rigorous in its preservation of\n+evidence, correction, or register boundaries. It is too broad and too generic for the remaining\n+time. Completing generic plugin machinery, a second target, a full CPS ontology, and a cold-start\n+interviewer before crossing the real reviewer loop would optimize the library while leaving the\n+demo hollow.\n+\n+## The strategic bet\n+\n+Build the smallest honest **CPS review-and-revise loop** through all three registers and the real\n+Petrinaut entrypoint. Let that concrete implementation discover the minimum plugin interface, then\n+generalize only what the CPS case and existing Gherkin case both need.\n+\n+This is not permission to take another thin tracer as the definition of done. The vertical proof is\n+contract-bearing: it includes model assembly, provenance, targeted correction, reprojection,\n+application, and the deployed route. Breadth inside each layer may be narrow; no layer in that loop\n+may be a fixture masquerading as production wiring.\n+\n+The bet preserves these load-bearing decisions:\n+\n+- Captures remain the durable, source-grounded assertion register.\n+- Every semantic inference happens at write time and is recorded as a contestable capture.\n+- The elicited model is a pure fold over active captures and every model part names its supporting\n+  capture IDs.\n+- SDCPN projection consumes the elicited model without rereading the transcript or making hidden\n+  semantic judgments.\n+- Petrinaut application and diagnostics are separate from semantic projection: the application may\n+  use client tools to apply a projected artifact, but it does not become the authority that invents\n+  the model.\n+- A correction supersedes or adds assertions and re-runs the fold and projection; it does not patch\n+  an unexplained net element directly.\n+\n+FE-1480 (requirements-model-to-SDCPN inference) challenges the third and fourth decisions by\n+assuming the projection itself requires LLM inference. That assumption is unresolved. If a worked\n+CPS case proves that the register-2 model is insufficient for pure projection, the honest choices\n+are to record the missing semantic judgment as a capture before folding or to amend ADR-0003 (the\n+three-register IR) explicitly. Hiding inference inside a read-time projection is not an available\n+shortcut.\n+\n+## The elicitor architecture under this load\n+\n+The discussion began with four parts; the current model has five responsibilities across the\n+harness and plugin layers, plus one per-engagement input. The missing responsibility is the\n+controller that closes the loop between captured evidence and the next move.\n+\n+| Responsibility | Owner | What it contains | State and September obligation |\n+| --- | --- | --- | --- |\n+| Strategy repertoire | Harness | Orientations, motivations, conversational licences, interviewing techniques, and question-formulation guidance. | Partly researched, not operationally selected. Implement only the techniques used by the review-and-revise runbook. |\n+| Evidence engine | Harness | Archive, settlement sweep, quote anchoring, durable captures, issues, conflict, supersession, and provenance primitives. | Strongest implemented layer. Add the active-model/issues read path needed by control and correction; do not broaden storage semantics without evidence. |\n+| Elicitation controller | Harness | Reads the engagement brief, active folded model and issues, current runbook, and strategy repertoire; chooses `ask`, `propose`, `contrast`, `validate`, `project`, `explain`, or `stop`. | Absent. Build the narrow controller loop needed to explain and revise one selected region. |\n+| Domain contract | Plugin | Proposal and model schemas; identity, fold, grade, demand, diagnostics, projection, and provenance rules for one target domain. | Designed but unimplemented. Build the CPS subset exercised by the fixture and correction; let it pressure the generic interface. |\n+| Job runbooks | Plugin | Named jobs over the same domain: objectives, entry conditions, trajectories, demand/completion rules, checks, stopping, revision, boundaries, and handoff. | Absent. Implement `review-and-revise`; defer a complete cold-start runbook. |\n+\n+The **engagement brief** is dynamic input, not plugin policy: target document, participant role,\n+objective, scope, known constraints, allowed actions, and time budget for this run. For September it\n+binds a reviewer to an existing target and one revisable region.\n+\n+A separate free-form “next-question ledger” should not become another authority. Most of it is a\n+derived control trace:\n+\n+```text\n+runbook demand -> model gap or issue -> candidate move -> chosen move -> concrete ask\n+```\n+\n+Persist only what replay, audit, or explicit user commitment requires. The controller must be able\n+to explain its chosen move from the runbook and active model; it must not accumulate an independent\n+shadow plan.\n+\n+The September `review-and-revise` runbook is provisionally:\n+\n+```text\n+entry:\n+  existing target + folded requirements model + projected net + reviewer scope\n+trajectory:\n+  orient -> select -> explain provenance -> frame correction\n+         -> ask/validate (3-5 turns) -> show semantic and net delta -> confirm -> hand off\n+done:\n+  scoped demands are met at the declared grade\n+  no open conflict blocks the selected projection\n+  reviewer confirms the intended delta\n+  every changed net element retains provenance\n+boundary:\n+  do not expand into cold-start elicitation or unrelated net repair\n+```\n+\n+## Proof frontiers and execution order\n+\n+The work has four frontiers. They are ordered by learning dependency, not by which ticket is\n+currently unblocked. The semantic and experience lanes start in parallel after Frontier 0, then\n+join as early as possible; they are not two long independent streams to integrate at the end.\n+\n+### Frontier 0 — make the demo claim decidable\n+\n+Confirm the business use case, freeze one representative prebuilt requirements-model/net fixture,\n+and name the optimisation handoff artifact. On that fixture, settle the FE-1480 authority question:\n+which steps are write-time semantic capture, pure model fold, pure SDCPN projection, and document\n+application?\n+\n+**Proof:** one reviewed worked transformation in which every SDCPN element needed by the scenario\n+traces to model fields and captures, with every non-mechanical judgment assigned to a write-time\n+producer. If this cannot be drawn honestly, implementation should not freeze an interface.\n+\n+### Frontier 1 — close the CPS semantic loop\n+\n+Implement only the CPS proposal kinds, model slots, identity/fold rules, demands, projection, and\n+provenance exercised by the fixture and one realistic correction. Carry capture IDs through every\n+derived layer. Make active model issues and selected-region context available to the controller.\n+\n+**Proof:** from the production fold/projection APIs, one source-grounded supersession changes the\n+expected model field and corresponding SDCPN elements, leaves an unrelated region stable, and\n+answers both forward and reverse provenance queries. A YAML or Markdown rendering of the model is\n+enough for inspection at this frontier.\n+\n+### Frontier 2 — close the reviewer control loop\n+\n+Allow a new conversation to bind to an existing target document. Admit the machine client-tool\n+results needed to apply and diagnose a net change. Mount the narrow `review-and-revise` runbook and\n+controller so that the active model and selected region, rather than the raw transcript alone,\n+drive three to five questions.\n+\n+**Proof:** through the real Brunch HTTP handler and Petrinaut panel, a reviewer selects the prepared\n+region, receives a grounded explanation, submits a scoped correction, and sees the returned apply\n+result resume the same durable session. No test-only injection supplies the target or tool wiring.\n+\n+### Frontier 3 — converge on the deployed demo\n+\n+Wire provider/mode routing, browser principal and private session lookup, remote transport,\n+deployment gates, and the optimisation handoff. Rehearse the exact scenario with a clean browser\n+against the deployed demo surface.\n+\n+**Proof:** a screen-recordable run completes the six September beats, survives one reload, exposes\n+the before/after requirements-model delta, and hands the resulting SDCPN to the optimisation flow.\n+Diagnostics show the source capture and projection identities needed to investigate a failure.\n+\n+## What is deliberately cut\n+\n+Until the proof spine is closed:\n+\n+- Do not freeze a broad declarative plugin SDK or require a second hard target. Extract the shared\n+  contract after CPS has stressed it.\n+- Do not make the Gherkin artifact path a prerequisite for the CPS demo.\n+- Do not build a full requirements-graph UI. FE-1481's YAML or Markdown export is the selected\n+  fallback; a UI earns time only if the core loop is already green.\n+- Do not build a complete cold-start CPS interview, general target gallery, every affordance type,\n+  voice input, surprising-scenario generation, or broad telemetry vocabulary.\n+- Do not implement a comprehensive CPS ontology. Support the fixture, the correction, and the\n+  optimisation handoff while keeping the data model honest about what it omits.\n+- Do not bypass provenance or write-time semantics to make a visually convincing net mutation.\n+\n+These are sequencing cuts, not claims that the deferred obligations are unimportant.\n+\n+## Issue projection\n+\n+The PM-authored issues are adopted here as the September delivery decomposition. Linear has not yet\n+been changed; its current unparented state is recorded in COORDINATION until an explicitly approved\n+registry update. The recommended hierarchy is FE-1357 (September planning and plugin design) →\n+FE-1476 (September delivery) → FE-1477 through FE-1482.\n+\n+| Issue | Strategic role | Reconciliation with existing work |\n+| --- | --- | --- |\n+| FE-1476 — prepare the September demo | Outcome owner and acceptance narrative. | Child of FE-1357 while that map remains active; owns rehearsal and handoff rather than implementation details. |\n+| FE-1477 — route Petrinaut AI and Brunch | Experience-lane entry and mode selection. | Product acceptance overlaps FE-1440 (ship the elicitor in the demo site). Keep one implementation owner; do not build two switches. |\n+| FE-1478 — trace a generated net to requirements | Provenance acceptance through registers 3 → 2 → 1 → utterance. | Must shape Frontier 1 from its first model/projection types, not arrive as post-hoc metadata. |\n+| FE-1479 — targeted re-elicitation | Convergence issue for the reviewer loop. | Consumes FE-1438's machine client-tool/application path, FE-1439's session ownership, and the CPS correction path; it does not own a second mutation mechanism. |\n+| FE-1480 — infer requirements model to SDCPN | Authority and projection decision, then the production projector. | Must be reconciled with ADR-0003 before implementation. FE-1438 owns browser application, not hidden semantic projection. |\n+| FE-1481 — expose the requirements model | Inspection fallback and demo delta surface. | Select YAML/Markdown first. Defer FE-1442's broader live capture/completion UI unless the proof spine closes early. |\n+| FE-1482 — add the CPS plugin | Semantic-lane owner and concrete pressure on the plugin boundary. | Pulls the demo-critical slices from FE-1402 (completion), FE-1403 (CPS guidance), FE-1406 (strategies), and FE-1431 (declarative contract). FE-1393 remains the generic/Gherkin path and no longer gates September. |\n+\n+Other consequences for the old graph:\n+\n+- FE-1387 (second target and plugin-contract freeze) follows the CPS proof instead of preceding the\n+  demo.\n+- FE-1331 (start from create-new-net) is outside the current reviewer-against-existing-target\n+  scenario.\n+- FE-1438, FE-1439, FE-1440, FE-1423 (pre-remote gates), and FE-1441 (deployment) remain real\n+  implementation obligations; the new issues state user outcomes rather than replacing these\n+  substrate and release seams.\n+- FE-1402, FE-1403, FE-1406, and FE-1431 should produce only what the CPS runbook and domain\n+  contract consume. Their old standalone completion must not become a hidden prerequisite.\n+\n+## Beliefs, risks, and replan conditions\n+\n+| Current belief | Confidence and evidence | Replan when |\n+| --- | --- | --- |\n+| A bounded review-and-revise scenario can carry the September product claim without cold-start elicitation. | Medium. It is the written FE-1476 scenario, but Dora has not confirmed the use case. | The confirmed use case requires model creation rather than review, or the optimisation handoff requires fields absent from the fixture. |\n+| A concrete CPS implementation will discover a better minimum plugin contract faster than completing the generic design first. | Medium-high. Gherkin deliberately under-stresses the interface; CPS is the first real consumer. | The first worked CPS transformation cannot be expressed without a reusable harness primitive that must precede it. Build that primitive, then return immediately to the vertical proof. |\n+| Register 2 can be rich enough for pure SDCPN projection. | Low-medium. ADR-0003 requires it, but no real fold or projector exists and FE-1480 asserts non-determinism. | The worked transformation identifies an unavoidable semantic choice not represented in captures/model. Record it earlier or explicitly revisit the ADR. |\n+| Three to five turns can produce a meaningful scoped correction. | Low. No CPS runbook has been rehearsed. | Two rehearsals exceed the budget or require unrelated context. Narrow the region, preload explicit context, or revise the demo claim rather than script fake success. |\n+| The proven ask suspension can extend to document-application client tools. | Medium-low. The suspension spike succeeded, but the production transport intentionally refuses machine tool-result follow-ups. | The first tool round-trip cannot preserve correlation, durability, or non-user evidence semantics. Treat this as a critical integration blocker, not a UI detail. |\n+| The production website and remote server can be joined inside the timebox. | Medium-low. Local host seams exist; provider routing, session ownership, deployment, and release gates do not yet converge. | A deployable path is not proved by the end of Frontier 2. Preserve the real semantic loop and seek an explicit demo-surface decision rather than quietly falling back to test-only wiring. |\n+| Requirements-model UI is unnecessary for comprehension. | Medium. The reviewer needs inspectability, but FE-1481 explicitly permits export. | Rehearsal shows that provenance and delta cannot be understood from chat plus a structured export. |\n+\n+## Current choice\n+\n+Stop treating “unblocked” as “next.” The next strategic move is to run Frontier 0 immediately and\n+open Frontiers 1 and 2 in parallel: one worked CPS semantic slice and one existing-target reviewer\n+session/tool-return slice. Join them at the earliest correction, then drive the same bones through\n+provider routing and deployment. The generic Gherkin/plugin-freeze path and broad UI work wait for\n+that join.\n+\n+Revisit this choice as soon as Dora confirms the use case, the FE-1480 worked transformation lands,\n+or either parallel frontier fails its first proof. A steering pass that only updates ticket status\n+does not change this document; a new fact that changes the objective, proof spine, authority\n+boundary, or cut line does.\n*** Update File: /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/INDEX.md\n@@\n | Document                                                                         | Status                             | Linear                                                                                                          | Digest                                                                                                                                                                                                                                                     |\n | -------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |\n | [COORDINATION](planning/_shared/COORDINATION.md)                                 | active                             | cross-project; maintained by arc-close                                                                          | Current sequencing recommendation, soft cross-map edges, unresolved seams, and exceptional roots; hard blockers, state, and hierarchy remain in Linear                                                                                                     |\n | [hash-monorepo-import-plan](planning/_shared/hash-monorepo-import-plan.md)       | active until FE-1437 lands         | FE-1437                                                                                                         | Native HASH assimilation plan: preserved history and child package workspaces under one Brunch context root, explicit authority cutover, exhaustive repository-material disposition, toolchain port, boundary gates, and verification                      |\n | [SPEC-LEDGER](planning/_shared/SPEC-LEDGER.md)                                   | active until milestone-one closure | FE-1383                                                                                                         | Obligation-level status and evidence ledger for the elicitation-kernel specification; settles when the milestone closes                                                                                                                                    |\n+| [STEERING](planning/_shared/STEERING.md)                                         | active                             | FE-1357 / FE-1476                                                                                                | Current objective-driven strategy for the September CPS review-and-revise proof: evidence, architectural pressure, proof frontiers, cuts, issue projection, risks, and replan conditions                                                                    |\n | [flue-architecture-cheatsheet](planning/_shared/flue-architecture-cheatsheet.md) | active                             | commented on FE-1383; feeds docs/agents/flue-routing.md                                                         | Architect's consolidation of all 21 Flue guide pages: direct structured generation uses `harness.prompt`; model-delegated work uses `useSubagent`; three-lane boundary summary and ranked divergence risks; reconciled against installed Flue 2.0.3 source |\n | [topology](planning/_shared/topology.md)                                         | active                             | ratified → ADR-0002; N1 discharged by FE-1422 + FE-1392; local N5 implemented by FE-1391; N3 amended by FE-1437 | Pseudo-style verification of the package/app tree against the three-lane model and spec §12.2: portable ask/sweep protocols, Flue binding wiring, package boundaries, and application-only Brunch–Petrinaut composition                                    |\n*** Update File: /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md\n@@\n-This is the cross-map coordination surface for the `brunch-agent` project. FE-1383 owns the\n-milestone-one harness build; FE-1357 owns the September demo and process-model plugin design.\n-Linear is canonical for issue state, parentage, and hard `blocks` relations. This file owns\n-only the judgment Linear cannot express: the current project-wide recommendation, soft edges,\n-unresolved seams, and exceptional roots.\n+This is the cross-map coordination surface for the `brunch-agent` project. FE-1383 owns the\n+milestone-one harness build; FE-1357 owns the September demo and process-model plugin design.\n+Linear is canonical for issue state, parentage, and hard `blocks` relations. The\n+[steering model](./STEERING.md) chooses the current objective, proof frontiers, and cuts under\n+pressure. This file projects that strategy onto mechanically available work: the current\n+project-wide recommendation, soft edges, unresolved seams, and exceptional roots.\n@@\n ## Current sequencing recommendation\n \n-As of **2026-08-21**, the FE-1437 authority cutover has been executed: the full brunch-lite\n-history is imported on `ln/fe-1437-hash-monorepo-import` in `hashintel/hash` (frozen standalone\n-SHA `43a0022918861846344b96a32cb94f92e2ee96ae`), every import gate re-verified. `hashintel/hash`\n-is authoritative; the standalone repository accepts no further implementation work. FE-1437\n-closes when the branch lands on `main` (squash merge, per convention). Part of FE-1440's website\n-wiring (the Brunch interactive-tool panel in `apps/petrinaut-website`) travelled with the import\n-branch; FE-1440 was trimmed on 2026-08-21 to the remaining mode wiring (mode switch, browser\n-identifier bootstrap, remote transport swap). After landing, advance FE-1438 (client-tool round-trip)\n-beside FE-1393 (plugin SDK and first projection); FE-1439 (private durable sessions) proceeds in\n-parallel. The integration stream joins at FE-1440 and deployment follows at FE-1441 (which also\n-waits on FE-1423's pre-exposure gates), while the harness stream reaches its contract-freeze\n-decision at FE-1387. FE-1402/FE-1403 form a parallel content/evaluation stream, without\n-displacing the two convergence edges.\n+As of **2026-08-24**, FE-1476 (the September demo delivery) changes the recommendation from generic\n+package completion to a concrete CPS review-and-revise proof. After FE-1437 (the monorepo import)\n+lands, open two fronts in parallel. The semantic front starts FE-1482 (the CPS plugin) against one\n+worked fixture and settles FE-1480's requirements-model-to-SDCPN authority boundary before it\n+implements a projector; FE-1478 (net-to-requirements provenance) is part of that spine from its\n+first types. The experience front advances FE-1438 (machine client-tool round-trip) and FE-1439\n+(private sessions) far enough for a new reviewer conversation to target an existing document,\n+while FE-1477/FE-1440 share one provider-routing implementation. Join the fronts at FE-1479\n+(targeted re-elicitation), then drive the same path through FE-1423's pre-exposure gates and\n+FE-1441 deployment.\n+\n+FE-1393's generic Gherkin artifact and FE-1387's second-target contract freeze no longer gate the\n+September proof. FE-1402, FE-1403, FE-1406, and FE-1431 supply only the completion, guidance,\n+strategy, and contract slices the CPS `review-and-revise` runbook consumes. FE-1481 selects\n+YAML/Markdown export as the requirements-model inspection floor; broad UI follows only if the\n+closed loop is already proved.\n@@\n nodes:\n   FE-1437 [executed, landing]      # history imported; HASH authoritative; PR pending\n-  FE-1438 [next]                   # client-tool round-trip\n-  FE-1439 [next, parallel]         # private durable sessions\n-  FE-1440 [join, partly landed]    # website elicitor mode; panel wiring on import branch\n-  FE-1441 [post-landing]           # HASH deployment\n-  FE-1393 [next]                   # plugin SDK + first projection\n-  FE-1387 [after-FE-1393]          # second pack + contract freeze\n-  FE-1395 [coordination]           # full affordance set\n-  FE-1402 [parallel, content]      # completion contract\n-  FE-1403 [parallel, content]      # interviewing guidance\n-  FE-1404 [after-content]          # armed baseline\n+  FE-1476 [objective]              # September reviewer demo\n+  FE-1482 [next, semantic]         # concrete CPS plugin + review/revise runbook\n+  FE-1480 [decision, semantic]     # model/projection authority, then projector\n+  FE-1478 [semantic proof]         # provenance through all three registers\n+  FE-1438 [next, experience]       # machine client-tool round-trip + application\n+  FE-1439 [next, experience]       # existing-target reviewer session ownership\n+  FE-1477/FE-1440 [experience]     # one provider-routing implementation\n+  FE-1479 [join]                   # targeted correction changes the live net\n+  FE-1481 [fallback]               # structured model export before UI\n+  FE-1441 [deployed proof]         # HASH deployment\n \n edges:\n   FE-1449                 -[hard]->       FE-1438\n-  FE-1392                 -[hard]->       FE-1393\n   FE-1438, FE-1439,\n   FE-1437                 -[hard]->       FE-1440\n   FE-1437, FE-1439,\n   FE-1423                 -[hard]->       FE-1441\n-  FE-1393                 -[hard]->       FE-1387\n-  FE-1402, FE-1403        -[hard]->       FE-1404\n-  FE-1395                 -[coord]->      FE-1438\n   FE-1437 branch on main  -[state-gate]-> FE-1438, FE-1439, FE-1393\n-  FE-1387                 -[input]->      FE-1440\n+  FE-1480 decision        -[input]->      FE-1482, FE-1478\n+  FE-1402, FE-1403,\n+  FE-1406, FE-1431        -[input]->      FE-1482\n+  FE-1482, FE-1478,\n+  FE-1438, FE-1439        -[input]->      FE-1479\n+  FE-1479, FE-1440        -[input]->      FE-1441\n ```\n@@\n ## Open seams\n \n-- **Contract freeze — FE-1387.** The process-model target must stress the plugin contract before\n-  it freezes. FE-1393 makes the contract programmable; FE-1387 remains the cross-map hinge.\n+- **Projection authority — FE-1480.** The ticket assumes non-deterministic LLM inference from the\n+  requirements model to SDCPN, while ADR-0003 requires write-time-only semantic inference and a\n+  pure projection. A worked CPS transformation must assign every judgment to capture, fold,\n+  projection, or document application before the interface freezes.\n+- **Controller and runbook.** The harness does not read the folded model or open issues back into\n+  the agent, and no plugin defines a job trajectory or stopping rule. FE-1482 must exercise the\n+  narrow `review-and-revise` loop; FE-1406 and FE-1402/FE-1403 are inputs, not parallel products.\n+- **Reviewer target identity — FE-1439 × FE-1479.** The current host derives target-document\n+  identity from conversation identity. September requires a new reviewer conversation against an\n+  existing target without weakening owner isolation.\n+- **Contract freeze — FE-1387.** The CPS target must stress the plugin contract before it freezes.\n+  The freeze follows the September semantic proof rather than gating it.\n@@\n ## Exceptional roots\n@@\n - **FE-1406 — design reusable elicitation strategies.** The cross-map home for the\n   harness-shipped generic strategy quiver; intentionally independent of either delivery map.\n+- **FE-1472 — evaluate the nested Anthropic SDK pin.** Unrelated triage root; no owning delivery\n+  map has been chosen.\n+- **FE-1476 — prepare the September demo.** Temporary delivery root pending the recommended fold\n+  under FE-1357.\n+- **FE-1477 through FE-1482 — September outcome slices.** PM-authored issues adopted by the\n+  steering model but not yet folded in Linear. The recommended parent is FE-1476; overlaps and\n+  ownership boundaries are recorded in STEERING's issue projection before external mutation.\n*** End Patch"
}
```

## User

**Tool Result:** `TU-034CebqF6NebEylhcnTlux`

```
{
  "files": [
    {
      "uri": "file:///Users/lunelson/Code/hashintel/hash/libs/%40hashintel/brunch-agent/docs/planning/_shared/STEERING.md",
      "diff": "Index: /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/planning/_shared/STEERING.md\n===================================================================\n--- /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/planning/_shared/STEERING.md\n+++ /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/planning/_shared/STEERING.md\n@@ -0,0 +1,278 @@\n+# Brunch steering model\n+\n+This is the current strategic understanding of Brunch: what outcome matters now, what the system\n+can actually do, which beliefs remain weak, and where to spend the next unit of time. Its immediate\n+decision horizon is the September demo, but it steers the whole context rather than one package or\n+one Linear map.\n+\n+This is not a roadmap, a specification, or an issue mirror. Specifications and accepted ADRs define\n+obligations and settled architecture. Linear is canonical for issue state, hierarchy, and hard\n+blockers. [COORDINATION](./COORDINATION.md) projects this strategy onto the mechanically available\n+work. This document owns the judgment between them: which objective to pursue under the current\n+time, evidence, risk, and product pressure; what to defer; and what new evidence would change that\n+choice. It may expose a conflict with a specification or ADR, but cannot silently override one.\n+\n+The document remains live. A steering pass orients from current evidence, chooses a frontier,\n+executes to a named proof, reconciles the result with specifications and issues, then replans only\n+where the evidence changed. Git carries the history; this file carries only the current model. Its\n+shape is intentionally specific to the present effort. Do not extract a generic template or skill\n+until a second real planning cycle shows which parts recur.\n+\n+## The September outcome\n+\n+As of **2026-08-24**, the working constraint is roughly two human weeks. The event date and final\n+business use case are not yet recorded here; Dora's confirmation is a decision gate, not an excuse\n+to leave the technical spine vague.\n+\n+FE-1476 (the September demo delivery) supplies the working scenario:\n+\n+1. A reviewer opens a prebuilt cyber-physical-process requirements model and its generated SDCPN in\n+   Petrinaut.\n+2. The reviewer selects or describes a net element and asks why it was modelled that way.\n+3. Brunch traces the answer through the requirements model and captures to an exact source\n+   utterance.\n+4. The reviewer scopes one correction and conducts three to five focused chat turns.\n+5. New or superseding captures change the elicited model; reprojection changes the corresponding\n+   part of the live net without rebuilding unrelated parts.\n+6. The resulting artifact is handed to the existing optimisation experiment flow.\n+\n+This is a **review-and-revise** demonstration. It does not need to prove that Brunch can elicit an\n+entire CPS model from a blank conversation. It does need to prove a closed semantic and interaction\n+loop. A chat transcript beside a static fixture, an unexplained net mutation, or a test that injects\n+wiring absent from the deployed entrypoint does not satisfy the outcome.\n+\n+The proof spine is therefore:\n+\n+```text\n+source utterance\n+  -> active typed capture\n+  -> folded CPS requirements model\n+  -> SDCPN element + provenance\n+  -> reviewer question and scoped correction\n+  -> superseding capture\n+  -> changed folded model\n+  -> changed live SDCPN\n+  -> optimisation handoff\n+```\n+\n+## Where the system actually stands\n+\n+The package topology is in place and the implemented tracer is real, but the September loop is not\n+an incremental extension of an almost-finished product. Most of the contract-bearing middle is\n+absent.\n+\n+| Surface | Evidence now | September consequence |\n+| --- | --- | --- |\n+| Ask, suspend, return | A user answer to `brunch_ask` survives the AI SDK/Flue boundary and resumes durable history. | Reuse; do not redesign the ask protocol. |\n+| Settlement and capture | A settled range is privately swept into quote-anchored captures and applied atomically. Supersession and active-head validation exist in the store. | Preserve as the evidence foundation, but expose active state to the controller. |\n+| Plugin SDK | The exported `Plugin` is deliberately only identity plus exactly one proposal type. Gherkin captures one verbatim statement. | There is no implemented fold, demand runner, model, projection, or useful hard-target plugin to extend. |\n+| Elicitation control | The agent receives general ask/sweep instructions. Sweep extraction sees a conversation range and proposal names only. No production path reads the active capture set or a derived model back into the interview. | Brunch cannot yet choose a next question from what it has learned or conduct a targeted correction. |\n+| CPS semantics | The three-register design and provisional two-schema/two-table plugin contract are desk-designed. No `plugin-cps` exists. | The critical semantic path must be built against a concrete CPS case, not inferred from Gherkin completeness. |\n+| Correction | The store can represent supersession, but extraction cannot see active capture IDs, model issues, or the target region; Gherkin cannot propose a supersession. | Targeted re-elicitation is structurally unreachable despite the storage mechanics being present. |\n+| Petrinaut transport | Local panel streaming and human ask-return work. Machine client-tool-result follow-ups are explicitly refused pending FE-1438 (the client-tool round-trip). | The agent cannot yet apply a projection to the live document and receive the result. |\n+| Session target | The current application derives `targetDocumentId` from `conversationId`. | A new reviewer session cannot address a pre-existing elicitation target without changing this identity boundary. |\n+| Demo website | The production website still uses its stock assistant route. The `/brunch` Actual Mode is a separate read-only fixture/SSE surface. | Local tracer proof must not be mistaken for deployed integration. |\n+\n+The decisive reading is that the current design is not too rigorous in its preservation of\n+evidence, correction, or register boundaries. It is too broad and too generic for the remaining\n+time. Completing generic plugin machinery, a second target, a full CPS ontology, and a cold-start\n+interviewer before crossing the real reviewer loop would optimize the library while leaving the\n+demo hollow.\n+\n+## The strategic bet\n+\n+Build the smallest honest **CPS review-and-revise loop** through all three registers and the real\n+Petrinaut entrypoint. Let that concrete implementation discover the minimum plugin interface, then\n+generalize only what the CPS case and existing Gherkin case both need.\n+\n+This is not permission to take another thin tracer as the definition of done. The vertical proof is\n+contract-bearing: it includes model assembly, provenance, targeted correction, reprojection,\n+application, and the deployed route. Breadth inside each layer may be narrow; no layer in that loop\n+may be a fixture masquerading as production wiring.\n+\n+The bet preserves these load-bearing decisions:\n+\n+- Captures remain the durable, source-grounded assertion register.\n+- Every semantic inference happens at write time and is recorded as a contestable capture.\n+- The elicited model is a pure fold over active captures and every model part names its supporting\n+  capture IDs.\n+- SDCPN projection consumes the elicited model without rereading the transcript or making hidden\n+  semantic judgments.\n+- Petrinaut application and diagnostics are separate from semantic projection: the application may\n+  use client tools to apply a projected artifact, but it does not become the authority that invents\n+  the model.\n+- A correction supersedes or adds assertions and re-runs the fold and projection; it does not patch\n+  an unexplained net element directly.\n+\n+FE-1480 (requirements-model-to-SDCPN inference) challenges the third and fourth decisions by\n+assuming the projection itself requires LLM inference. That assumption is unresolved. If a worked\n+CPS case proves that the register-2 model is insufficient for pure projection, the honest choices\n+are to record the missing semantic judgment as a capture before folding or to amend ADR-0003 (the\n+three-register IR) explicitly. Hiding inference inside a read-time projection is not an available\n+shortcut.\n+\n+## The elicitor architecture under this load\n+\n+The discussion began with four parts; the current model has five responsibilities across the\n+harness and plugin layers, plus one per-engagement input. The missing responsibility is the\n+controller that closes the loop between captured evidence and the next move.\n+\n+| Responsibility | Owner | What it contains | State and September obligation |\n+| --- | --- | --- | --- |\n+| Strategy repertoire | Harness | Orientations, motivations, conversational licences, interviewing techniques, and question-formulation guidance. | Partly researched, not operationally selected. Implement only the techniques used by the review-and-revise runbook. |\n+| Evidence engine | Harness | Archive, settlement sweep, quote anchoring, durable captures, issues, conflict, supersession, and provenance primitives. | Strongest implemented layer. Add the active-model/issues read path needed by control and correction; do not broaden storage semantics without evidence. |\n+| Elicitation controller | Harness | Reads the engagement brief, active folded model and issues, current runbook, and strategy repertoire; chooses `ask`, `propose`, `contrast`, `validate`, `project`, `explain`, or `stop`. | Absent. Build the narrow controller loop needed to explain and revise one selected region. |\n+| Domain contract | Plugin | Proposal and model schemas; identity, fold, grade, demand, diagnostics, projection, and provenance rules for one target domain. | Designed but unimplemented. Build the CPS subset exercised by the fixture and correction; let it pressure the generic interface. |\n+| Job runbooks | Plugin | Named jobs over the same domain: objectives, entry conditions, trajectories, demand/completion rules, checks, stopping, revision, boundaries, and handoff. | Absent. Implement `review-and-revise`; defer a complete cold-start runbook. |\n+\n+The **engagement brief** is dynamic input, not plugin policy: target document, participant role,\n+objective, scope, known constraints, allowed actions, and time budget for this run. For September it\n+binds a reviewer to an existing target and one revisable region.\n+\n+A separate free-form “next-question ledger” should not become another authority. Most of it is a\n+derived control trace:\n+\n+```text\n+runbook demand -> model gap or issue -> candidate move -> chosen move -> concrete ask\n+```\n+\n+Persist only what replay, audit, or explicit user commitment requires. The controller must be able\n+to explain its chosen move from the runbook and active model; it must not accumulate an independent\n+shadow plan.\n+\n+The September `review-and-revise` runbook is provisionally:\n+\n+```text\n+entry:\n+  existing target + folded requirements model + projected net + reviewer scope\n+trajectory:\n+  orient -> select -> explain provenance -> frame correction\n+         -> ask/validate (3-5 turns) -> show semantic and net delta -> confirm -> hand off\n+done:\n+  scoped demands are met at the declared grade\n+  no open conflict blocks the selected projection\n+  reviewer confirms the intended delta\n+  every changed net element retains provenance\n+boundary:\n+  do not expand into cold-start elicitation or unrelated net repair\n+```\n+\n+## Proof frontiers and execution order\n+\n+The work has four frontiers. They are ordered by learning dependency, not by which ticket is\n+currently unblocked. The semantic and experience lanes start in parallel after Frontier 0, then\n+join as early as possible; they are not two long independent streams to integrate at the end.\n+\n+### Frontier 0 — make the demo claim decidable\n+\n+Confirm the business use case, freeze one representative prebuilt requirements-model/net fixture,\n+and name the optimisation handoff artifact. On that fixture, settle the FE-1480 authority question:\n+which steps are write-time semantic capture, pure model fold, pure SDCPN projection, and document\n+application?\n+\n+**Proof:** one reviewed worked transformation in which every SDCPN element needed by the scenario\n+traces to model fields and captures, with every non-mechanical judgment assigned to a write-time\n+producer. If this cannot be drawn honestly, implementation should not freeze an interface.\n+\n+### Frontier 1 — close the CPS semantic loop\n+\n+Implement only the CPS proposal kinds, model slots, identity/fold rules, demands, projection, and\n+provenance exercised by the fixture and one realistic correction. Carry capture IDs through every\n+derived layer. Make active model issues and selected-region context available to the controller.\n+\n+**Proof:** from the production fold/projection APIs, one source-grounded supersession changes the\n+expected model field and corresponding SDCPN elements, leaves an unrelated region stable, and\n+answers both forward and reverse provenance queries. A YAML or Markdown rendering of the model is\n+enough for inspection at this frontier.\n+\n+### Frontier 2 — close the reviewer control loop\n+\n+Allow a new conversation to bind to an existing target document. Admit the machine client-tool\n+results needed to apply and diagnose a net change. Mount the narrow `review-and-revise` runbook and\n+controller so that the active model and selected region, rather than the raw transcript alone,\n+drive three to five questions.\n+\n+**Proof:** through the real Brunch HTTP handler and Petrinaut panel, a reviewer selects the prepared\n+region, receives a grounded explanation, submits a scoped correction, and sees the returned apply\n+result resume the same durable session. No test-only injection supplies the target or tool wiring.\n+\n+### Frontier 3 — converge on the deployed demo\n+\n+Wire provider/mode routing, browser principal and private session lookup, remote transport,\n+deployment gates, and the optimisation handoff. Rehearse the exact scenario with a clean browser\n+against the deployed demo surface.\n+\n+**Proof:** a screen-recordable run completes the six September beats, survives one reload, exposes\n+the before/after requirements-model delta, and hands the resulting SDCPN to the optimisation flow.\n+Diagnostics show the source capture and projection identities needed to investigate a failure.\n+\n+## What is deliberately cut\n+\n+Until the proof spine is closed:\n+\n+- Do not freeze a broad declarative plugin SDK or require a second hard target. Extract the shared\n+  contract after CPS has stressed it.\n+- Do not make the Gherkin artifact path a prerequisite for the CPS demo.\n+- Do not build a full requirements-graph UI. FE-1481's YAML or Markdown export is the selected\n+  fallback; a UI earns time only if the core loop is already green.\n+- Do not build a complete cold-start CPS interview, general target gallery, every affordance type,\n+  voice input, surprising-scenario generation, or broad telemetry vocabulary.\n+- Do not implement a comprehensive CPS ontology. Support the fixture, the correction, and the\n+  optimisation handoff while keeping the data model honest about what it omits.\n+- Do not bypass provenance or write-time semantics to make a visually convincing net mutation.\n+\n+These are sequencing cuts, not claims that the deferred obligations are unimportant.\n+\n+## Issue projection\n+\n+The PM-authored issues are adopted here as the September delivery decomposition. Linear has not yet\n+been changed; its current unparented state is recorded in COORDINATION until an explicitly approved\n+registry update. The recommended hierarchy is FE-1357 (September planning and plugin design) →\n+FE-1476 (September delivery) → FE-1477 through FE-1482.\n+\n+| Issue | Strategic role | Reconciliation with existing work |\n+| --- | --- | --- |\n+| FE-1476 — prepare the September demo | Outcome owner and acceptance narrative. | Child of FE-1357 while that map remains active; owns rehearsal and handoff rather than implementation details. |\n+| FE-1477 — route Petrinaut AI and Brunch | Experience-lane entry and mode selection. | Product acceptance overlaps FE-1440 (ship the elicitor in the demo site). Keep one implementation owner; do not build two switches. |\n+| FE-1478 — trace a generated net to requirements | Provenance acceptance through registers 3 → 2 → 1 → utterance. | Must shape Frontier 1 from its first model/projection types, not arrive as post-hoc metadata. |\n+| FE-1479 — targeted re-elicitation | Convergence issue for the reviewer loop. | Consumes FE-1438's machine client-tool/application path, FE-1439's session ownership, and the CPS correction path; it does not own a second mutation mechanism. |\n+| FE-1480 — infer requirements model to SDCPN | Authority and projection decision, then the production projector. | Must be reconciled with ADR-0003 before implementation. FE-1438 owns browser application, not hidden semantic projection. |\n+| FE-1481 — expose the requirements model | Inspection fallback and demo delta surface. | Select YAML/Markdown first. Defer FE-1442's broader live capture/completion UI unless the proof spine closes early. |\n+| FE-1482 — add the CPS plugin | Semantic-lane owner and concrete pressure on the plugin boundary. | Pulls the demo-critical slices from FE-1402 (completion), FE-1403 (CPS guidance), FE-1406 (strategies), and FE-1431 (declarative contract). FE-1393 remains the generic/Gherkin path and no longer gates September. |\n+\n+Other consequences for the old graph:\n+\n+- FE-1387 (second target and plugin-contract freeze) follows the CPS proof instead of preceding the\n+  demo.\n+- FE-1331 (start from create-new-net) is outside the current reviewer-against-existing-target\n+  scenario.\n+- FE-1438, FE-1439, FE-1440, FE-1423 (pre-remote gates), and FE-1441 (deployment) remain real\n+  implementation obligations; the new issues state user outcomes rather than replacing these\n+  substrate and release seams.\n+- FE-1402, FE-1403, FE-1406, and FE-1431 should produce only what the CPS runbook and domain\n+  contract consume. Their old standalone completion must not become a hidden prerequisite.\n+\n+## Beliefs, risks, and replan conditions\n+\n+| Current belief | Confidence and evidence | Replan when |\n+| --- | --- | --- |\n+| A bounded review-and-revise scenario can carry the September product claim without cold-start elicitation. | Medium. It is the written FE-1476 scenario, but Dora has not confirmed the use case. | The confirmed use case requires model creation rather than review, or the optimisation handoff requires fields absent from the fixture. |\n+| A concrete CPS implementation will discover a better minimum plugin contract faster than completing the generic design first. | Medium-high. Gherkin deliberately under-stresses the interface; CPS is the first real consumer. | The first worked CPS transformation cannot be expressed without a reusable harness primitive that must precede it. Build that primitive, then return immediately to the vertical proof. |\n+| Register 2 can be rich enough for pure SDCPN projection. | Low-medium. ADR-0003 requires it, but no real fold or projector exists and FE-1480 asserts non-determinism. | The worked transformation identifies an unavoidable semantic choice not represented in captures/model. Record it earlier or explicitly revisit the ADR. |\n+| Three to five turns can produce a meaningful scoped correction. | Low. No CPS runbook has been rehearsed. | Two rehearsals exceed the budget or require unrelated context. Narrow the region, preload explicit context, or revise the demo claim rather than script fake success. |\n+| The proven ask suspension can extend to document-application client tools. | Medium-low. The suspension spike succeeded, but the production transport intentionally refuses machine tool-result follow-ups. | The first tool round-trip cannot preserve correlation, durability, or non-user evidence semantics. Treat this as a critical integration blocker, not a UI detail. |\n+| The production website and remote server can be joined inside the timebox. | Medium-low. Local host seams exist; provider routing, session ownership, deployment, and release gates do not yet converge. | A deployable path is not proved by the end of Frontier 2. Preserve the real semantic loop and seek an explicit demo-surface decision rather than quietly falling back to test-only wiring. |\n+| Requirements-model UI is unnecessary for comprehension. | Medium. The reviewer needs inspectability, but FE-1481 explicitly permits export. | Rehearsal shows that provenance and delta cannot be understood from chat plus a structured export. |\n+\n+## Current choice\n+\n+Stop treating “unblocked” as “next.” The next strategic move is to run Frontier 0 immediately and\n+open Frontiers 1 and 2 in parallel: one worked CPS semantic slice and one existing-target reviewer\n+session/tool-return slice. Join them at the earliest correction, then drive the same bones through\n+provider routing and deployment. The generic Gherkin/plugin-freeze path and broad UI work wait for\n+that join.\n+\n+Revisit this choice as soon as Dora confirms the use case, the FE-1480 worked transformation lands,\n+or either parallel frontier fails its first proof. A steering pass that only updates ticket status\n+does not change this document; a new fact that changes the objective, proof spine, authority\n+boundary, or cut line does.\n",
      "type": "add",
      "additions": 278,
      "deletions": 0
    },
    {
      "uri": "file:///Users/lunelson/Code/hashintel/hash/libs/%40hashintel/brunch-agent/docs/INDEX.md",
      "diff": "Index: /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/INDEX.md\n===================================================================\n--- /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/INDEX.md\n+++ /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/INDEX.md\n@@ -70,8 +70,9 @@\n | -------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |\n | [COORDINATION](planning/_shared/COORDINATION.md)                                 | active                             | cross-project; maintained by arc-close                                                                          | Current sequencing recommendation, soft cross-map edges, unresolved seams, and exceptional roots; hard blockers, state, and hierarchy remain in Linear                                                                                                     |\n | [hash-monorepo-import-plan](planning/_shared/hash-monorepo-import-plan.md)       | active until FE-1437 lands         | FE-1437                                                                                                         | Native HASH assimilation plan: preserved history and child package workspaces under one Brunch context root, explicit authority cutover, exhaustive repository-material disposition, toolchain port, boundary gates, and verification                      |\n | [SPEC-LEDGER](planning/_shared/SPEC-LEDGER.md)                                   | active until milestone-one closure | FE-1383                                                                                                         | Obligation-level status and evidence ledger for the elicitation-kernel specification; settles when the milestone closes                                                                                                                                    |\n+| [STEERING](planning/_shared/STEERING.md)                                         | active                             | FE-1357 / FE-1476                                                                                                | Current objective-driven strategy for the September CPS review-and-revise proof: evidence, architectural pressure, proof frontiers, cuts, issue projection, risks, and replan conditions                                                                    |\n | [flue-architecture-cheatsheet](planning/_shared/flue-architecture-cheatsheet.md) | active                             | commented on FE-1383; feeds docs/agents/flue-routing.md                                                         | Architect's consolidation of all 21 Flue guide pages: direct structured generation uses `harness.prompt`; model-delegated work uses `useSubagent`; three-lane boundary summary and ranked divergence risks; reconciled against installed Flue 2.0.3 source |\n | [topology](planning/_shared/topology.md)                                         | active                             | ratified → ADR-0002; N1 discharged by FE-1422 + FE-1392; local N5 implemented by FE-1391; N3 amended by FE-1437 | Pseudo-style verification of the package/app tree against the three-lane model and spec §12.2: portable ask/sweep protocols, Flue binding wiring, package boundaries, and application-only Brunch–Petrinaut composition                                    |\n \n ## planning/legibility-sweep (FE-1401 arc records)\n",
      "type": "update",
      "additions": 1,
      "deletions": 0
    },
    {
      "uri": "file:///Users/lunelson/Code/hashintel/hash/libs/%40hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md",
      "diff": "Index: /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md\n===================================================================\n--- /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md\n+++ /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md\n@@ -1,33 +1,37 @@\n # Project coordination\n \n This is the cross-map coordination surface for the `brunch-agent` project. FE-1383 owns the\n milestone-one harness build; FE-1357 owns the September demo and process-model plugin design.\n-Linear is canonical for issue state, parentage, and hard `blocks` relations. This file owns\n-only the judgment Linear cannot express: the current project-wide recommendation, soft edges,\n-unresolved seams, and exceptional roots.\n+Linear is canonical for issue state, parentage, and hard `blocks` relations. The\n+[steering model](./STEERING.md) chooses the current objective, proof frontiers, and cuts under\n+pressure. This file projects that strategy onto mechanically available work: the current\n+project-wide recommendation, soft edges, unresolved seams, and exceptional roots.\n \n Before revising the recommendation, run\n `turbo run linear:graph --filter '@hashintel/brunch-agent'`. Its compact projection supplies the\n factual open-issue DAG; read the relevant issue bodies for semantic content, then infer the smallest\n honest recommendation. Do not paste the generated graph here or mirror issue status.\n \n ## Current sequencing recommendation\n \n-As of **2026-08-21**, the FE-1437 authority cutover has been executed: the full brunch-lite\n-history is imported on `ln/fe-1437-hash-monorepo-import` in `hashintel/hash` (frozen standalone\n-SHA `43a0022918861846344b96a32cb94f92e2ee96ae`), every import gate re-verified. `hashintel/hash`\n-is authoritative; the standalone repository accepts no further implementation work. FE-1437\n-closes when the branch lands on `main` (squash merge, per convention). Part of FE-1440's website\n-wiring (the Brunch interactive-tool panel in `apps/petrinaut-website`) travelled with the import\n-branch; FE-1440 was trimmed on 2026-08-21 to the remaining mode wiring (mode switch, browser\n-identifier bootstrap, remote transport swap). After landing, advance FE-1438 (client-tool round-trip)\n-beside FE-1393 (plugin SDK and first projection); FE-1439 (private durable sessions) proceeds in\n-parallel. The integration stream joins at FE-1440 and deployment follows at FE-1441 (which also\n-waits on FE-1423's pre-exposure gates), while the harness stream reaches its contract-freeze\n-decision at FE-1387. FE-1402/FE-1403 form a parallel content/evaluation stream, without\n-displacing the two convergence edges.\n+As of **2026-08-24**, FE-1476 (the September demo delivery) changes the recommendation from generic\n+package completion to a concrete CPS review-and-revise proof. After FE-1437 (the monorepo import)\n+lands, open two fronts in parallel. The semantic front starts FE-1482 (the CPS plugin) against one\n+worked fixture and settles FE-1480's requirements-model-to-SDCPN authority boundary before it\n+implements a projector; FE-1478 (net-to-requirements provenance) is part of that spine from its\n+first types. The experience front advances FE-1438 (machine client-tool round-trip) and FE-1439\n+(private sessions) far enough for a new reviewer conversation to target an existing document,\n+while FE-1477/FE-1440 share one provider-routing implementation. Join the fronts at FE-1479\n+(targeted re-elicitation), then drive the same path through FE-1423's pre-exposure gates and\n+FE-1441 deployment.\n \n+FE-1393's generic Gherkin artifact and FE-1387's second-target contract freeze no longer gate the\n+September proof. FE-1402, FE-1403, FE-1406, and FE-1431 supply only the completion, guidance,\n+strategy, and contract slices the CPS `review-and-revise` runbook consumes. FE-1481 selects\n+YAML/Markdown export as the requirements-model inspection floor; broad UI follows only if the\n+closed loop is already proved.\n+\n ```text\n legend:\n   -[hard]->       native Linear blocker\n   -[coord]->      either order; do not implement concurrently\n@@ -35,31 +39,32 @@\n   -[state-gate]-> condition in the world, not an issue edge\n \n nodes:\n   FE-1437 [executed, landing]      # history imported; HASH authoritative; PR pending\n-  FE-1438 [next]                   # client-tool round-trip\n-  FE-1439 [next, parallel]         # private durable sessions\n-  FE-1440 [join, partly landed]    # website elicitor mode; panel wiring on import branch\n-  FE-1441 [post-landing]           # HASH deployment\n-  FE-1393 [next]                   # plugin SDK + first projection\n-  FE-1387 [after-FE-1393]          # second pack + contract freeze\n-  FE-1395 [coordination]           # full affordance set\n-  FE-1402 [parallel, content]      # completion contract\n-  FE-1403 [parallel, content]      # interviewing guidance\n-  FE-1404 [after-content]          # armed baseline\n+  FE-1476 [objective]              # September reviewer demo\n+  FE-1482 [next, semantic]         # concrete CPS plugin + review/revise runbook\n+  FE-1480 [decision, semantic]     # model/projection authority, then projector\n+  FE-1478 [semantic proof]         # provenance through all three registers\n+  FE-1438 [next, experience]       # machine client-tool round-trip + application\n+  FE-1439 [next, experience]       # existing-target reviewer session ownership\n+  FE-1477/FE-1440 [experience]     # one provider-routing implementation\n+  FE-1479 [join]                   # targeted correction changes the live net\n+  FE-1481 [fallback]               # structured model export before UI\n+  FE-1441 [deployed proof]         # HASH deployment\n \n edges:\n   FE-1449                 -[hard]->       FE-1438\n-  FE-1392                 -[hard]->       FE-1393\n   FE-1438, FE-1439,\n   FE-1437                 -[hard]->       FE-1440\n   FE-1437, FE-1439,\n   FE-1423                 -[hard]->       FE-1441\n-  FE-1393                 -[hard]->       FE-1387\n-  FE-1402, FE-1403        -[hard]->       FE-1404\n-  FE-1395                 -[coord]->      FE-1438\n   FE-1437 branch on main  -[state-gate]-> FE-1438, FE-1439, FE-1393\n-  FE-1387                 -[input]->      FE-1440\n+  FE-1480 decision        -[input]->      FE-1482, FE-1478\n+  FE-1402, FE-1403,\n+  FE-1406, FE-1431        -[input]->      FE-1482\n+  FE-1482, FE-1478,\n+  FE-1438, FE-1439        -[input]->      FE-1479\n+  FE-1479, FE-1440        -[input]->      FE-1441\n ```\n \n Hard-edge truth remains in Linear. The graph above is a deliberately focused recommendation,\n not a second issue database.\n@@ -89,10 +94,20 @@\n explicit approval from Lu.\n \n ## Open seams\n \n-- **Contract freeze — FE-1387.** The process-model target must stress the plugin contract before\n-  it freezes. FE-1393 makes the contract programmable; FE-1387 remains the cross-map hinge.\n+- **Projection authority — FE-1480.** The ticket assumes non-deterministic LLM inference from the\n+  requirements model to SDCPN, while ADR-0003 requires write-time-only semantic inference and a\n+  pure projection. A worked CPS transformation must assign every judgment to capture, fold,\n+  projection, or document application before the interface freezes.\n+- **Controller and runbook.** The harness does not read the folded model or open issues back into\n+  the agent, and no plugin defines a job trajectory or stopping rule. FE-1482 must exercise the\n+  narrow `review-and-revise` loop; FE-1406 and FE-1402/FE-1403 are inputs, not parallel products.\n+- **Reviewer target identity — FE-1439 × FE-1479.** The current host derives target-document\n+  identity from conversation identity. September requires a new reviewer conversation against an\n+  existing target without weakening owner isolation.\n+- **Contract freeze — FE-1387.** The CPS target must stress the plugin contract before it freezes.\n+  The freeze follows the September semantic proof rather than gating it.\n - **Absence locator.** An absence capture carries no payload, but the fold needs a field-specific\n   coordinate (anchor × slot). The plugin-contract spec records three worked cases; any envelope\n   amendment belongs to the harness side of this seam.\n - **Structured-tap evidence — FE-1395 × capture store.** `resolve-conflict` currently rejects\n@@ -119,4 +134,11 @@\n - **FE-1334 — offer the user a surprising scenario of their model.** A validation gesture with\n   no owning map yet; closest to the motif/quiver strategy work.\n - **FE-1406 — design reusable elicitation strategies.** The cross-map home for the\n   harness-shipped generic strategy quiver; intentionally independent of either delivery map.\n+- **FE-1472 — evaluate the nested Anthropic SDK pin.** Unrelated triage root; no owning delivery\n+  map has been chosen.\n+- **FE-1476 — prepare the September demo.** Temporary delivery root pending the recommended fold\n+  under FE-1357.\n+- **FE-1477 through FE-1482 — September outcome slices.** PM-authored issues adopted by the\n+  steering model but not yet folded in Linear. The recommended parent is FE-1476; overlaps and\n+  ownership boundaries are recorded in STEERING's issue projection before external mutation.\n",
      "type": "update",
      "additions": 55,
      "deletions": 33
    }
  ],
  "summary": "add: /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/planning/_shared/STEERING.md (+278/-0)\nupdate: /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/INDEX.md (+1/-0)\nupdate: /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md (+55/-33)"
}
```

## Assistant

The first pass is now written and wired into the existing control surface. Before I treat it as settled, I’m checking whether it actually preserves the key distinction we reached: concrete end-to-end contract proof first, without weakening the evidence/register architecture or turning the new ticket list into the strategy.

**Tool Use:** `oracle`

```json
{
  "task": "Review the current uncommitted steering/control-surface diff for the September Brunch demo. Intended outcome: @docs/planning/_shared/STEERING.md must be an objective-driven strategic model (not a roadmap/template or issue mirror) that captures this session's findings: the current implementation ends at durable captures; the missing controller/model/projection/correction loops are the critical architecture; the September scenario is a prebuilt CPS model reviewed for provenance then corrected in 3–5 turns; build a concrete CPS review-and-revise path before generic plugin breadth; preserve write-time semantics, pure fold, pure projection, provenance, and real-entrypoint verification; treat FE-1480's LLM-projection premise as unresolved; and adopt/fold FE-1476–FE-1482 into the old graph without making Linear writes. @docs/planning/_shared/COORDINATION.md should remain the compact sequencing projection, and @docs/INDEX.md should register the new control document. Read the current diff plus @docs/adr/0003-three-register-ir.md, @docs/adr/0004-in-petrinaut-staging-and-the-monorepo-import.md, @docs/planning/process-model-elicitation/plugin-contract-spec.md, @docs/planning/process-model-elicitation/petrinaut-integration-spec.md, and relevant source if needed. Determine whether the steering model is strategically comprehensive and internally coherent under the roughly two-week constraint. Report only concrete high-impact omissions, contradictions, unjustified commitments, or sequencing errors, with the smallest correction for each. Explicitly assess whether the proof frontiers close the real semantic and deployed interaction loops rather than repeating the project's tracer-as-done failure. Ignore copyediting and unrelated repository findings."
}
```

## User

**Tool Result:** `TU-034CefPqdFOcX5VtYmUwLi`

```
## Verdict

The steering document does what the outcome asked: it is an objective-driven strategic model, not a roadmap or issue mirror; it captures the durable-captures ceiling, the missing controller/model/projection/correction loops, the review-and-revise scenario, the CPS-before-breadth bet, the preserved invariants, the FE-1480 open question, and the no-Linear-writes issue adoption. COORDINATION correctly demotes itself to a projection of STEERING, and INDEX registers the new document. I verified the load-bearing status-table claims against source: `targetDocumentId` is derived from `conversationId` ([petrinaut-chat.ts#L33-L44](file:///Users/lunelson/Code/hashintel/hash/apps/brunch-agent/src/petrinaut-chat.ts#L33-L44)), the transport refuses machine tool-result follow-ups pending FE-1438 ([transport-aisdk/src/index.ts#L261-L291](file:///Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/packages/transport-aisdk/src/index.ts#L261-L291)), and `Plugin` is identity plus exactly one proposal type ([core/src/plugin.ts#L32-L35](file:///Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/packages/core/src/plugin.ts#L32-L35)).

Three findings should change the text before it ships. All are S-sized doc edits.

## Blocking findings

**1. The sweep — the declared single point of semantic failure — has no proof owner in the frontiers.**
The proof spine's arrow `reviewer question and scoped correction -> superseding capture` is the write-time sweep, which ADR-0003 and the plugin-contract spec (strain 7) name as the single point of semantic failure, and which the status table itself says cannot currently see active capture IDs or propose a supersession. Yet no frontier proof asserts it. Frontier 1's proof ("one source-grounded supersession changes the expected model field") can be passed with a hand-inserted superseding capture; Frontier 2's proof ("submits a scoped correction, and sees the returned apply result") can be passed by a controller that changes the projection without any superseding capture at all — its "no test-only injection" clause covers *wiring*, not *semantic extraction*. That is exactly the tracer-as-done shape the document warns against, surviving one layer deeper.
**Smallest fix:** one sentence added to the Frontier 2 proof (and mirrored in Frontier 1's join expectation): the applied net delta must trace to a superseding capture produced by the production sweep from the reviewer's actual utterance — not injected by the test or fabricated by the controller.

**2. Frontier 0 doesn't constrain how the prebuilt fixture gets its register-1 content.**
Demo beat 3 is "captures to an exact source utterance," but a "prebuilt requirements-model/net fixture" authored directly at register 2 or 3 has no genuine source utterances — forward/reverse provenance queries would run against fabricated evidence, violating the doc's own "no layer may be a fixture masquerading as production wiring" rule at the layer the demo most depends on. Frontier 0 says "freeze one fixture" without stating this constraint.
**Smallest fix:** add to Frontier 0 that the fixture is a valid store state — source conversation plus captures produced through (or validated against) the production capture/fold path — not a hand-authored register-2/3 artifact, so that both provenance directions and the correction supersession run on real data.

**3. FE-1331's deferral silently contradicts accepted ADR-0004.**
ADR-0004's consequences explicitly state "FE-1331 (start elicitation from create-new-net) is **un-deferred** — in-Petrinaut initiation is now the September topology, not the post-September one." STEERING says FE-1331 "is outside the current reviewer-against-existing-target scenario," and COORDINATION's exceptional-roots entry re-defers it — neither names the ADR. STEERING's own charter says it "may expose a conflict with a specification or ADR, but cannot silently override one," and this is a silent override: the review-and-revise scenario reverses ADR-0004's initiation-topology consequence.
**Smallest fix:** in the issue-projection bullet, name the conflict explicitly ("ADR-0004 un-deferred FE-1331; the FE-1476 scenario re-defers it — exposed conflict pending a dated ADR-0004 amendment or Dora's use-case confirmation") rather than treating the deferral as unremarkable.

## Non-blocking follow-ups

- **Controller's F1 dependency is implicit.** Frontier 2 mounts a controller that reads "the active model and selected region," which only exists once Frontier 1's read path lands; the frontiers "start in parallel" text could let F2 stall on it unnoticed. One clause noting that F2's controller-mounting step waits on F1's active-model read path (while session binding and tool-result admission proceed independently) would make the parallelism honest.
- **The petrinaut-integration-spec's user stories are now partially stale** (cold-start framing: "interview me about my process before building," "watch the net appear"). STEERING doesn't need to amend it, but a reconciliation note belongs on the next arc-close pass so the `active` spec doesn't contradict the demo claim.
- The other files in this diff (git-workflow, issue-writing, legibility protocol additions; import-plan `gt` wording) are unrelated to the steering model and raise no concerns.

## Tracer-as-done assessment

Apart from finding 1, the frontiers genuinely close the loops rather than repeating the failure: Frontier 1 proves semantic purity and bidirectional provenance at the production fold/projection APIs; Frontier 2 explicitly requires the real HTTP handler and panel with no test-only target or tool wiring; Frontier 3 requires a clean-browser run against the deployed surface, a reload survival, and the optimisation handoff. The status table's "Demo website" row and the belief-table replan condition ("seek an explicit demo-surface decision rather than quietly falling back to test-only wiring") show the failure mode is understood. Findings 1 and 2 are the two remaining seams where a fixture or hand-authored capture could still stand in for the real semantic path; closing them in the text closes the loop definition completely.
```

## Assistant

The Oracle found two places where a “green” proof could still cheat: a hand-authored prebuilt model could fake provenance, and a hand-inserted supersession could fake correction. It also caught a real conflict with ADR-0004 around the create-new-net entrypoint. I’m tightening those acceptance boundaries rather than adding more plan structure.

**Tool Use:** `apply_patch`

```json
{
  "patchText": "*** Begin Patch\n*** Update File: /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/planning/_shared/STEERING.md\n@@\n Confirm the business use case, freeze one representative prebuilt requirements-model/net fixture,\n and name the optimisation handoff artifact. On that fixture, settle the FE-1480 authority question:\n which steps are write-time semantic capture, pure model fold, pure SDCPN projection, and document\n application?\n+\n+The prebuilt fixture must be a valid register-1 store state with a source conversation and\n+quote-anchored captures produced through, or independently validated against, the production\n+capture/fold path. A hand-authored register-2 model or register-3 net cannot prove provenance and\n+cannot serve as the correction baseline.\n \n **Proof:** one reviewed worked transformation in which every SDCPN element needed by the scenario\n traces to model fields and captures, with every non-mechanical judgment assigned to a write-time\n producer. If this cannot be drawn honestly, implementation should not freeze an interface.\n@@\n **Proof:** from the production fold/projection APIs, one source-grounded supersession changes the\n expected model field and corresponding SDCPN elements, leaves an unrelated region stable, and\n answers both forward and reverse provenance queries. A YAML or Markdown rendering of the model is\n-enough for inspection at this frontier.\n+enough for inspection at this frontier. The proving proposal must have the shape the production\n+sweep will emit; the cross-frontier join is not accepted until that sweep produces it from the\n+reviewer's actual utterance rather than a test inserting it directly.\n@@\n Allow a new conversation to bind to an existing target document. Admit the machine client-tool\n results needed to apply and diagnose a net change. Mount the narrow `review-and-revise` runbook and\n controller so that the active model and selected region, rather than the raw transcript alone,\n drive three to five questions.\n+\n+Session binding and client-tool admission may proceed in parallel with Frontier 1. Mounting the\n+controller against active model/issues waits for Frontier 1's production read path; do not replace\n+that dependency with request-shaped model context.\n \n **Proof:** through the real Brunch HTTP handler and Petrinaut panel, a reviewer selects the prepared\n region, receives a grounded explanation, submits a scoped correction, and sees the returned apply\n-result resume the same durable session. No test-only injection supplies the target or tool wiring.\n+result resume the same durable session. The net delta must trace to a superseding capture produced\n+by the production sweep from the reviewer's utterance, not one inserted by the test or fabricated\n+by the controller. No test-only injection supplies the target or tool wiring.\n@@\n-- FE-1331 (start from create-new-net) is outside the current reviewer-against-existing-target\n-  scenario.\n+- FE-1331 (start from create-new-net) is outside the current reviewer-against-existing-target\n+  scenario, but ADR-0004 explicitly un-deferred it as September topology. The FE-1476 scenario\n+  therefore creates an exposed conflict pending Dora's confirmation and, if review-and-revise\n+  stands, a dated ADR-0004 amendment; this steering document does not silently re-defer it.\n - FE-1438, FE-1439, FE-1440, FE-1423 (pre-remote gates), and FE-1441 (deployment) remain real\n   implementation obligations; the new issues state user outcomes rather than replacing these\n   substrate and release seams.\n - FE-1402, FE-1403, FE-1406, and FE-1431 should produce only what the CPS runbook and domain\n   contract consume. Their old standalone completion must not become a hidden prerequisite.\n+- The active Petrinaut integration spec still describes a cold-start interview in some user\n+  stories. Reconcile those stories with the confirmed scenario rather than treating this plan as a\n+  silent specification amendment.\n*** Update File: /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md\n@@\n-- **FE-1331 — start elicitation from Petrinaut's create-new-net flow.** Deferred post-September\n-  consumer topology; returns after in-Petrinaut staging proves itself.\n+- **FE-1331 — start elicitation from Petrinaut's create-new-net flow.** ADR-0004 un-deferred this as\n+  September topology, while FE-1476's new reviewer scenario starts from an existing target. Keep\n+  the conflict visible until Dora confirms the use case and the ADR is amended if necessary.\n*** End Patch"
}
```

## User

**Tool Result:** `TU-034CejRiYoQEn9tyZlBKRM`

```
{
  "files": [
    {
      "uri": "file:///Users/lunelson/Code/hashintel/hash/libs/%40hashintel/brunch-agent/docs/planning/_shared/STEERING.md",
      "diff": "Index: /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/planning/_shared/STEERING.md\n===================================================================\n--- /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/planning/_shared/STEERING.md\n+++ /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/planning/_shared/STEERING.md\n@@ -169,8 +169,13 @@\n and name the optimisation handoff artifact. On that fixture, settle the FE-1480 authority question:\n which steps are write-time semantic capture, pure model fold, pure SDCPN projection, and document\n application?\n \n+The prebuilt fixture must be a valid register-1 store state with a source conversation and\n+quote-anchored captures produced through, or independently validated against, the production\n+capture/fold path. A hand-authored register-2 model or register-3 net cannot prove provenance and\n+cannot serve as the correction baseline.\n+\n **Proof:** one reviewed worked transformation in which every SDCPN element needed by the scenario\n traces to model fields and captures, with every non-mechanical judgment assigned to a write-time\n producer. If this cannot be drawn honestly, implementation should not freeze an interface.\n \n@@ -182,20 +187,28 @@\n \n **Proof:** from the production fold/projection APIs, one source-grounded supersession changes the\n expected model field and corresponding SDCPN elements, leaves an unrelated region stable, and\n answers both forward and reverse provenance queries. A YAML or Markdown rendering of the model is\n-enough for inspection at this frontier.\n+enough for inspection at this frontier. The proving proposal must have the shape the production\n+sweep will emit; the cross-frontier join is not accepted until that sweep produces it from the\n+reviewer's actual utterance rather than a test inserting it directly.\n \n ### Frontier 2 — close the reviewer control loop\n \n Allow a new conversation to bind to an existing target document. Admit the machine client-tool\n results needed to apply and diagnose a net change. Mount the narrow `review-and-revise` runbook and\n controller so that the active model and selected region, rather than the raw transcript alone,\n drive three to five questions.\n \n+Session binding and client-tool admission may proceed in parallel with Frontier 1. Mounting the\n+controller against active model/issues waits for Frontier 1's production read path; do not replace\n+that dependency with request-shaped model context.\n+\n **Proof:** through the real Brunch HTTP handler and Petrinaut panel, a reviewer selects the prepared\n region, receives a grounded explanation, submits a scoped correction, and sees the returned apply\n-result resume the same durable session. No test-only injection supplies the target or tool wiring.\n+result resume the same durable session. The net delta must trace to a superseding capture produced\n+by the production sweep from the reviewer's utterance, not one inserted by the test or fabricated\n+by the controller. No test-only injection supplies the target or tool wiring.\n \n ### Frontier 3 — converge on the deployed demo\n \n Wire provider/mode routing, browser principal and private session lookup, remote transport,\n@@ -244,14 +257,19 @@\n \n - FE-1387 (second target and plugin-contract freeze) follows the CPS proof instead of preceding the\n   demo.\n - FE-1331 (start from create-new-net) is outside the current reviewer-against-existing-target\n-  scenario.\n+  scenario, but ADR-0004 explicitly un-deferred it as September topology. The FE-1476 scenario\n+  therefore creates an exposed conflict pending Dora's confirmation and, if review-and-revise\n+  stands, a dated ADR-0004 amendment; this steering document does not silently re-defer it.\n - FE-1438, FE-1439, FE-1440, FE-1423 (pre-remote gates), and FE-1441 (deployment) remain real\n   implementation obligations; the new issues state user outcomes rather than replacing these\n   substrate and release seams.\n - FE-1402, FE-1403, FE-1406, and FE-1431 should produce only what the CPS runbook and domain\n   contract consume. Their old standalone completion must not become a hidden prerequisite.\n+- The active Petrinaut integration spec still describes a cold-start interview in some user\n+  stories. Reconcile those stories with the confirmed scenario rather than treating this plan as a\n+  silent specification amendment.\n \n ## Beliefs, risks, and replan conditions\n \n | Current belief | Confidence and evidence | Replan when |\n",
      "type": "update",
      "additions": 21,
      "deletions": 3
    },
    {
      "uri": "file:///Users/lunelson/Code/hashintel/hash/libs/%40hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md",
      "diff": "Index: /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md\n===================================================================\n--- /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md\n+++ /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md\n@@ -128,10 +128,11 @@\n ## Exceptional roots\n \n These project issues intentionally have no parent and are roots under the registry rule:\n \n-- **FE-1331 — start elicitation from Petrinaut's create-new-net flow.** Deferred post-September\n-  consumer topology; returns after in-Petrinaut staging proves itself.\n+- **FE-1331 — start elicitation from Petrinaut's create-new-net flow.** ADR-0004 un-deferred this as\n+  September topology, while FE-1476's new reviewer scenario starts from an existing target. Keep\n+  the conflict visible until Dora confirms the use case and the ADR is amended if necessary.\n - **FE-1334 — offer the user a surprising scenario of their model.** A validation gesture with\n   no owning map yet; closest to the motif/quiver strategy work.\n - **FE-1406 — design reusable elicitation strategies.** The cross-map home for the\n   harness-shipped generic strategy quiver; intentionally independent of either delivery map.\n",
      "type": "update",
      "additions": 3,
      "deletions": 2
    }
  ],
  "summary": "update: /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/planning/_shared/STEERING.md (+21/-3)\nupdate: /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md (+3/-2)"
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "cat docs/planning/_shared/STEERING.md",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "cat docs/planning/_shared/COORDINATION.md",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "sed -n '63,80p' docs/INDEX.md; git diff --check -- libs/@hashintel/brunch-agent/docs/INDEX.md libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md libs/@hashintel/brunch-agent/docs/planning/_shared/STEERING.md",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 10000
}
```

## User

**Tool Result:** `TU-034CejrJFCxLm7ojcPqke4`

```
{
  "output": "# Brunch steering model\n\nThis is the current strategic understanding of Brunch: what outcome matters now, what the system\ncan actually do, which beliefs remain weak, and where to spend the next unit of time. Its immediate\ndecision horizon is the September demo, but it steers the whole context rather than one package or\none Linear map.\n\nThis is not a roadmap, a specification, or an issue mirror. Specifications and accepted ADRs define\nobligations and settled architecture. Linear is canonical for issue state, hierarchy, and hard\nblockers. [COORDINATION](./COORDINATION.md) projects this strategy onto the mechanically available\nwork. This document owns the judgment between them: which objective to pursue under the current\ntime, evidence, risk, and product pressure; what to defer; and what new evidence would change that\nchoice. It may expose a conflict with a specification or ADR, but cannot silently override one.\n\nThe document remains live. A steering pass orients from current evidence, chooses a frontier,\nexecutes to a named proof, reconciles the result with specifications and issues, then replans only\nwhere the evidence changed. Git carries the history; this file carries only the current model. Its\nshape is intentionally specific to the present effort. Do not extract a generic template or skill\nuntil a second real planning cycle shows which parts recur.\n\n## The September outcome\n\nAs of **2026-08-24**, the working constraint is roughly two human weeks. The event date and final\nbusiness use case are not yet recorded here; Dora's confirmation is a decision gate, not an excuse\nto leave the technical spine vague.\n\nFE-1476 (the September demo delivery) supplies the working scenario:\n\n1. A reviewer opens a prebuilt cyber-physical-process requirements model and its generated SDCPN in\n   Petrinaut.\n2. The reviewer selects or describes a net element and asks why it was modelled that way.\n3. Brunch traces the answer through the requirements model and captures to an exact source\n   utterance.\n4. The reviewer scopes one correction and conducts three to five focused chat turns.\n5. New or superseding captures change the elicited model; reprojection changes the corresponding\n   part of the live net without rebuilding unrelated parts.\n6. The resulting artifact is handed to the existing optimisation experiment flow.\n\nThis is a **review-and-revise** demonstration. It does not need to prove that Brunch can elicit an\nentire CPS model from a blank conversation. It does need to prove a closed semantic and interaction\nloop. A chat transcript beside a static fixture, an unexplained net mutation, or a test that injects\nwiring absent from the deployed entrypoint does not satisfy the outcome.\n\nThe proof spine is therefore:\n\n```text\nsource utterance\n  -> active typed capture\n  -> folded CPS requirements model\n  -> SDCPN element + provenance\n  -> reviewer question and scoped correction\n  -> superseding capture\n  -> changed folded model\n  -> changed live SDCPN\n  -> optimisation handoff\n```\n\n## Where the system actually stands\n\nThe package topology is in place and the implemented tracer is real, but the September loop is not\nan incremental extension of an almost-finished product. Most of the contract-bearing middle is\nabsent.\n\n| Surface | Evidence now | September consequence |\n| --- | --- | --- |\n| Ask, suspend, return | A user answer to `brunch_ask` survives the AI SDK/Flue boundary and resumes durable history. | Reuse; do not redesign the ask protocol. |\n| Settlement and capture | A settled range is privately swept into quote-anchored captures and applied atomically. Supersession and active-head validation exist in the store. | Preserve as the evidence foundation, but expose active state to the controller. |\n| Plugin SDK | The exported `Plugin` is deliberately only identity plus exactly one proposal type. Gherkin captures one verbatim statement. | There is no implemented fold, demand runner, model, projection, or useful hard-target plugin to extend. |\n| Elicitation control | The agent receives general ask/sweep instructions. Sweep extraction sees a conversation range and proposal names only. No production path reads the active capture set or a derived model back into the interview. | Brunch cannot yet choose a next question from what it has learned or conduct a targeted correction. |\n| CPS semantics | The three-register design and provisional two-schema/two-table plugin contract are desk-designed. No `plugin-cps` exists. | The critical semantic path must be built against a concrete CPS case, not inferred from Gherkin completeness. |\n| Correction | The store can represent supersession, but extraction cannot see active capture IDs, model issues, or the target region; Gherkin cannot propose a supersession. | Targeted re-elicitation is structurally unreachable despite the storage mechanics being present. |\n| Petrinaut transport | Local panel streaming and human ask-return work. Machine client-tool-result follow-ups are explicitly refused pending FE-1438 (the client-tool round-trip). | The agent cannot yet apply a projection to the live document and receive the result. |\n| Session target | The current application derives `targetDocumentId` from `conversationId`. | A new reviewer session cannot address a pre-existing elicitation target without changing this identity boundary. |\n| Demo website | The production website still uses its stock assistant route. The `/brunch` Actual Mode is a separate read-only fixture/SSE surface. | Local tracer proof must not be mistaken for deployed integration. |\n\nThe decisive reading is that the current design is not too rigorous in its preservation of\nevidence, correction, or register boundaries. It is too broad and too generic for the remaining\ntime. Completing generic plugin machinery, a second target, a full CPS ontology, and a cold-start\ninterviewer before crossing the real reviewer loop would optimize the library while leaving the\ndemo hollow.\n\n## The strategic bet\n\nBuild the smallest honest **CPS review-and-revise loop** through all three registers and the real\nPetrinaut entrypoint. Let that concrete implementation discover the minimum plugin interface, then\ngeneralize only what the CPS case and existing Gherkin case both need.\n\nThis is not permission to take another thin tracer as the definition of done. The vertical proof is\ncontract-bearing: it includes model assembly, provenance, targeted correction, reprojection,\napplication, and the deployed route. Breadth inside each layer may be narrow; no layer in that loop\nmay be a fixture masquerading as production wiring.\n\nThe bet preserves these load-bearing decisions:\n\n- Captures remain the durable, source-grounded assertion register.\n- Every semantic inference happens at write time and is recorded as a contestable capture.\n- The elicited model is a pure fold over active captures and every model part names its supporting\n  capture IDs.\n- SDCPN projection consumes the elicited model without rereading the transcript or making hidden\n  semantic judgments.\n- Petrinaut application and diagnostics are separate from semantic projection: the application may\n  use client tools to apply a projected artifact, but it does not become the authority that invents\n  the model.\n- A correction supersedes or adds assertions and re-runs the fold and projection; it does not patch\n  an unexplained net element directly.\n\nFE-1480 (requirements-model-to-SDCPN inference) challenges the third and fourth decisions by\nassuming the projection itself requires LLM inference. That assumption is unresolved. If a worked\nCPS case proves that the register-2 model is insufficient for pure projection, the honest choices\nare to record the missing semantic judgment as a capture before folding or to amend ADR-0003 (the\nthree-register IR) explicitly. Hiding inference inside a read-time projection is not an available\nshortcut.\n\n## The elicitor architecture under this load\n\nThe discussion began with four parts; the current model has five responsibilities across the\nharness and plugin layers, plus one per-engagement input. The missing responsibility is the\ncontroller that closes the loop between captured evidence and the next move.\n\n| Responsibility | Owner | What it contains | State and September obligation |\n| --- | --- | --- | --- |\n| Strategy repertoire | Harness | Orientations, motivations, conversational licences, interviewing techniques, and question-formulation guidance. | Partly researched, not operationally selected. Implement only the techniques used by the review-and-revise runbook. |\n| Evidence engine | Harness | Archive, settlement sweep, quote anchoring, durable captures, issues, conflict, supersession, and provenance primitives. | Strongest implemented layer. Add the active-model/issues read path needed by control and correction; do not broaden storage semantics without evidence. |\n| Elicitation controller | Harness | Reads the engagement brief, active folded model and issues, current runbook, and strategy repertoire; chooses `ask`, `propose`, `contrast`, `validate`, `project`, `explain`, or `stop`. | Absent. Build the narrow controller loop needed to explain and revise one selected region. |\n| Domain contract | Plugin | Proposal and model schemas; identity, fold, grade, demand, diagnostics, projection, and provenance rules for one target domain. | Designed but unimplemented. Build the CPS subset exercised by the fixture and correction; let it pressure the generic interface. |\n| Job runbooks | Plugin | Named jobs over the same domain: objectives, entry conditions, trajectories, demand/completion rules, checks, stopping, revision, boundaries, and handoff. | Absent. Implement `review-and-revise`; defer a complete cold-start runbook. |\n\nThe **engagement brief** is dynamic input, not plugin policy: target document, participant role,\nobjective, scope, known constraints, allowed actions, and time budget for this run. For September it\nbinds a reviewer to an existing target and one revisable region.\n\nA separate free-form “next-question ledger” should not become another authority. Most of it is a\nderived control trace:\n\n```text\nrunbook demand -> model gap or issue -> candidate move -> chosen move -> concrete ask\n```\n\nPersist only what replay, audit, or explicit user commitment requires. The controller must be able\nto explain its chosen move from the runbook and active model; it must not accumulate an independent\nshadow plan.\n\nThe September `review-and-revise` runbook is provisionally:\n\n```text\nentry:\n  existing target + folded requirements model + projected net + reviewer scope\ntrajectory:\n  orient -> select -> explain provenance -> frame correction\n         -> ask/validate (3-5 turns) -> show semantic and net delta -> confirm -> hand off\ndone:\n  scoped demands are met at the declared grade\n  no open conflict blocks the selected projection\n  reviewer confirms the intended delta\n  every changed net element retains provenance\nboundary:\n  do not expand into cold-start elicitation or unrelated net repair\n```\n\n## Proof frontiers and execution order\n\nThe work has four frontiers. They are ordered by learning dependency, not by which ticket is\ncurrently unblocked. The semantic and experience lanes start in parallel after Frontier 0, then\njoin as early as possible; they are not two long independent streams to integrate at the end.\n\n### Frontier 0 — make the demo claim decidable\n\nConfirm the business use case, freeze one representative prebuilt requirements-model/net fixture,\nand name the optimisation handoff artifact. On that fixture, settle the FE-1480 authority question:\nwhich steps are write-time semantic capture, pure model fold, pure SDCPN projection, and document\napplication?\n\nThe prebuilt fixture must be a valid register-1 store state with a source conversation and\nquote-anchored captures produced through, or independently validated against, the production\ncapture/fold path. A hand-authored register-2 model or register-3 net cannot prove provenance and\ncannot serve as the correction baseline.\n\n**Proof:** one reviewed worked transformation in which every SDCPN element needed by the scenario\ntraces to model fields and captures, with every non-mechanical judgment assigned to a write-time\nproducer. If this cannot be drawn honestly, implementation should not freeze an interface.\n\n### Frontier 1 — close the CPS semantic loop\n\nImplement only the CPS proposal kinds, model slots, identity/fold rules, demands, projection, and\nprovenance exercised by the fixture and one realistic correction. Carry capture IDs through every\nderived layer. Make active model issues and selected-region context available to the controller.\n\n**Proof:** from the production fold/projection APIs, one source-grounded supersession changes the\nexpected model field and corresponding SDCPN elements, leaves an unrelated region stable, and\nanswers both forward and reverse provenance queries. A YAML or Markdown rendering of the model is\nenough for inspection at this frontier. The proving proposal must have the shape the production\nsweep will emit; the cross-frontier join is not accepted until that sweep produces it from the\nreviewer's actual utterance rather than a test inserting it directly.\n\n### Frontier 2 — close the reviewer control loop\n\nAllow a new conversation to bind to an existing target document. Admit the machine client-tool\nresults needed to apply and diagnose a net change. Mount the narrow `review-and-revise` runbook and\ncontroller so that the active model and selected region, rather than the raw transcript alone,\ndrive three to five questions.\n\nSession binding and client-tool admission may proceed in parallel with Frontier 1. Mounting the\ncontroller against active model/issues waits for Frontier 1's production read path; do not replace\nthat dependency with request-shaped model context.\n\n**Proof:** through the real Brunch HTTP handler and Petrinaut panel, a reviewer selects the prepared\nregion, receives a grounded explanation, submits a scoped correction, and sees the returned apply\nresult resume the same durable session. The net delta must trace to a superseding capture produced\nby the production sweep from the reviewer's utterance, not one inserted by the test or fabricated\nby the controller. No test-only injection supplies the target or tool wiring.\n\n### Frontier 3 — converge on the deployed demo\n\nWire provider/mode routing, browser principal and private session lookup, remote transport,\ndeployment gates, and the optimisation handoff. Rehearse the exact scenario with a clean browser\nagainst the deployed demo surface.\n\n**Proof:** a screen-recordable run completes the six September beats, survives one reload, exposes\nthe before/after requirements-model delta, and hands the resulting SDCPN to the optimisation flow.\nDiagnostics show the source capture and projection identities needed to investigate a failure.\n\n## What is deliberately cut\n\nUntil the proof spine is closed:\n\n- Do not freeze a broad declarative plugin SDK or require a second hard target. Extract the shared\n  contract after CPS has stressed it.\n- Do not make the Gherkin artifact path a prerequisite for the CPS demo.\n- Do not build a full requirements-graph UI. FE-1481's YAML or Markdown export is the selected\n  fallback; a UI earns time only if the core loop is already green.\n- Do not build a complete cold-start CPS interview, general target gallery, every affordance type,\n  voice input, surprising-scenario generation, or broad telemetry vocabulary.\n- Do not implement a comprehensive CPS ontology. Support the fixture, the correction, and the\n  optimisation handoff while keeping the data model honest about what it omits.\n- Do not bypass provenance or write-time semantics to make a visually convincing net mutation.\n\nThese are sequencing cuts, not claims that the deferred obligations are unimportant.\n\n## Issue projection\n\nThe PM-authored issues are adopted here as the September delivery decomposition. Linear has not yet\nbeen changed; its current unparented state is recorded in COORDINATION until an explicitly approved\nregistry update. The recommended hierarchy is FE-1357 (September planning and plugin design) →\nFE-1476 (September delivery) → FE-1477 through FE-1482.\n\n| Issue | Strategic role | Reconciliation with existing work |\n| --- | --- | --- |\n| FE-1476 — prepare the September demo | Outcome owner and acceptance narrative. | Child of FE-1357 while that map remains active; owns rehearsal and handoff rather than implementation details. |\n| FE-1477 — route Petrinaut AI and Brunch | Experience-lane entry and mode selection. | Product acceptance overlaps FE-1440 (ship the elicitor in the demo site). Keep one implementation owner; do not build two switches. |\n| FE-1478 — trace a generated net to requirements | Provenance acceptance through registers 3 → 2 → 1 → utterance. | Must shape Frontier 1 from its first model/projection types, not arrive as post-hoc metadata. |\n| FE-1479 — targeted re-elicitation | Convergence issue for the reviewer loop. | Consumes FE-1438's machine client-tool/application path, FE-1439's session ownership, and the CPS correction path; it does not own a second mutation mechanism. |\n| FE-1480 — infer requirements model to SDCPN | Authority and projection decision, then the production projector. | Must be reconciled with ADR-0003 before implementation. FE-1438 owns browser application, not hidden semantic projection. |\n| FE-1481 — expose the requirements model | Inspection fallback and demo delta surface. | Select YAML/Markdown first. Defer FE-1442's broader live capture/completion UI unless the proof spine closes early. |\n| FE-1482 — add the CPS plugin | Semantic-lane owner and concrete pressure on the plugin boundary. | Pulls the demo-critical slices from FE-1402 (completion), FE-1403 (CPS guidance), FE-1406 (strategies), and FE-1431 (declarative contract). FE-1393 remains the generic/Gherkin path and no longer gates September. |\n\nOther consequences for the old graph:\n\n- FE-1387 (second target and plugin-contract freeze) follows the CPS proof instead of preceding the\n  demo.\n- FE-1331 (start from create-new-net) is outside the current reviewer-against-existing-target\n  scenario, but ADR-0004 explicitly un-deferred it as September topology. The FE-1476 scenario\n  therefore creates an exposed conflict pending Dora's confirmation and, if review-and-revise\n  stands, a dated ADR-0004 amendment; this steering document does not silently re-defer it.\n- FE-1438, FE-1439, FE-1440, FE-1423 (pre-remote gates), and FE-1441 (deployment) remain real\n  implementation obligations; the new issues state user outcomes rather than replacing these\n  substrate and release seams.\n- FE-1402, FE-1403, FE-1406, and FE-1431 should produce only what the CPS runbook and domain\n  contract consume. Their old standalone completion must not become a hidden prerequisite.\n- The active Petrinaut integration spec still describes a cold-start interview in some user\n  stories. Reconcile those stories with the confirmed scenario rather than treating this plan as a\n  silent specification amendment.\n\n## Beliefs, risks, and replan conditions\n\n| Current belief | Confidence and evidence | Replan when |\n| --- | --- | --- |\n| A bounded review-and-revise scenario can carry the September product claim without cold-start elicitation. | Medium. It is the written FE-1476 scenario, but Dora has not confirmed the use case. | The confirmed use case requires model creation rather than review, or the optimisation handoff requires fields absent from the fixture. |\n| A concrete CPS implementation will discover a better minimum plugin contract faster than completing the generic design first. | Medium-high. Gherkin deliberately under-stresses the interface; CPS is the first real consumer. | The first worked CPS transformation cannot be expressed without a reusable harness primitive that must precede it. Build that primitive, then return immediately to the vertical proof. |\n| Register 2 can be rich enough for pure SDCPN projection. | Low-medium. ADR-0003 requires it, but no real fold or projector exists and FE-1480 asserts non-determinism. | The worked transformation identifies an unavoidable semantic choice not represented in captures/model. Record it earlier or explicitly revisit the ADR. |\n| Three to five turns can produce a meaningful scoped correction. | Low. No CPS runbook has been rehearsed. | Two rehearsals exceed the budget or require unrelated context. Narrow the region, preload explicit context, or revise the demo claim rather than script fake success. |\n| The proven ask suspension can extend to document-application client tools. | Medium-low. The suspension spike succeeded, but the production transport intentionally refuses machine tool-result follow-ups. | The first tool round-trip cannot preserve correlation, durability, or non-user evidence semantics. Treat this as a critical integration blocker, not a UI detail. |\n| The production website and remote server can be joined inside the timebox. | Medium-low. Local host seams exist; provider routing, session ownership, deployment, and release gates do not yet converge. | A deployable path is not proved by the end of Frontier 2. Preserve the real semantic loop and seek an explicit demo-surface decision rather than quietly falling back to test-only wiring. |\n| Requirements-model UI is unnecessary for comprehension. | Medium. The reviewer needs inspectability, but FE-1481 explicitly permits export. | Rehearsal shows that provenance and delta cannot be understood from chat plus a structured export. |\n\n## Current choice\n\nStop treating “unblocked” as “next.” The next strategic move is to run Frontier 0 immediately and\nopen Frontiers 1 and 2 in parallel: one worked CPS semantic slice and one existing-target reviewer\nsession/tool-return slice. Join them at the earliest correction, then drive the same bones through\nprovider routing and deployment. The generic Gherkin/plugin-freeze path and broad UI work wait for\nthat join.\n\nRevisit this choice as soon as Dora confirms the use case, the FE-1480 worked transformation lands,\nor either parallel frontier fails its first proof. A steering pass that only updates ticket status\ndoes not change this document; a new fact that changes the objective, proof spine, authority\nboundary, or cut line does.\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-034CejrKhsqzE7ZBmXWT1H`

```
{
  "output": "# Project coordination\n\nThis is the cross-map coordination surface for the `brunch-agent` project. FE-1383 owns the\nmilestone-one harness build; FE-1357 owns the September demo and process-model plugin design.\nLinear is canonical for issue state, parentage, and hard `blocks` relations. The\n[steering model](./STEERING.md) chooses the current objective, proof frontiers, and cuts under\npressure. This file projects that strategy onto mechanically available work: the current\nproject-wide recommendation, soft edges, unresolved seams, and exceptional roots.\n\nBefore revising the recommendation, run\n`turbo run linear:graph --filter '@hashintel/brunch-agent'`. Its compact projection supplies the\nfactual open-issue DAG; read the relevant issue bodies for semantic content, then infer the smallest\nhonest recommendation. Do not paste the generated graph here or mirror issue status.\n\n## Current sequencing recommendation\n\nAs of **2026-08-24**, FE-1476 (the September demo delivery) changes the recommendation from generic\npackage completion to a concrete CPS review-and-revise proof. After FE-1437 (the monorepo import)\nlands, open two fronts in parallel. The semantic front starts FE-1482 (the CPS plugin) against one\nworked fixture and settles FE-1480's requirements-model-to-SDCPN authority boundary before it\nimplements a projector; FE-1478 (net-to-requirements provenance) is part of that spine from its\nfirst types. The experience front advances FE-1438 (machine client-tool round-trip) and FE-1439\n(private sessions) far enough for a new reviewer conversation to target an existing document,\nwhile FE-1477/FE-1440 share one provider-routing implementation. Join the fronts at FE-1479\n(targeted re-elicitation), then drive the same path through FE-1423's pre-exposure gates and\nFE-1441 deployment.\n\nFE-1393's generic Gherkin artifact and FE-1387's second-target contract freeze no longer gate the\nSeptember proof. FE-1402, FE-1403, FE-1406, and FE-1431 supply only the completion, guidance,\nstrategy, and contract slices the CPS `review-and-revise` runbook consumes. FE-1481 selects\nYAML/Markdown export as the requirements-model inspection floor; broad UI follows only if the\nclosed loop is already proved.\n\n```text\nlegend:\n  -[hard]->       native Linear blocker\n  -[coord]->      either order; do not implement concurrently\n  -[input]->      semantic input, not a blocker\n  -[state-gate]-> condition in the world, not an issue edge\n\nnodes:\n  FE-1437 [executed, landing]      # history imported; HASH authoritative; PR pending\n  FE-1476 [objective]              # September reviewer demo\n  FE-1482 [next, semantic]         # concrete CPS plugin + review/revise runbook\n  FE-1480 [decision, semantic]     # model/projection authority, then projector\n  FE-1478 [semantic proof]         # provenance through all three registers\n  FE-1438 [next, experience]       # machine client-tool round-trip + application\n  FE-1439 [next, experience]       # existing-target reviewer session ownership\n  FE-1477/FE-1440 [experience]     # one provider-routing implementation\n  FE-1479 [join]                   # targeted correction changes the live net\n  FE-1481 [fallback]               # structured model export before UI\n  FE-1441 [deployed proof]         # HASH deployment\n\nedges:\n  FE-1449                 -[hard]->       FE-1438\n  FE-1438, FE-1439,\n  FE-1437                 -[hard]->       FE-1440\n  FE-1437, FE-1439,\n  FE-1423                 -[hard]->       FE-1441\n  FE-1437 branch on main  -[state-gate]-> FE-1438, FE-1439, FE-1393\n  FE-1480 decision        -[input]->      FE-1482, FE-1478\n  FE-1402, FE-1403,\n  FE-1406, FE-1431        -[input]->      FE-1482\n  FE-1482, FE-1478,\n  FE-1438, FE-1439        -[input]->      FE-1479\n  FE-1479, FE-1440        -[input]->      FE-1441\n```\n\nHard-edge truth remains in Linear. The graph above is a deliberately focused recommendation,\nnot a second issue database.\n\n## Repository handoff threshold\n\nFE-1437 (the monorepo import; [execution plan](./hash-monorepo-import-plan.md)) was the authority\ncutover, not a general freeze on harness work. It was crossed on 2026-08-21:\n\n```text\nbrunch-lite authoritative (until 2026-08-21)\n  FE-1434 + FE-1435 verdicts landed\n  FE-1388/1389/1390/1399 review stack merged\n                    |\n                    v\n      == FE-1437 import (executed) ==\n                    |\n                    v\nhashintel/hash authoritative (now)\n  FE-1440 website wiring + FE-1441 deployment\n```\n\nThe standalone repository is frozen at SHA `43a0022918861846344b96a32cb94f92e2ee96ae` and is\nread-only reference material. All further work — including FE-1438 and FE-1439, which were not\nimport gates — happens in `hashintel/hash`. Do not run both repositories as writable authorities.\nClosing out the standalone repository's shared state (archival, access) is deferred and requires\nexplicit approval from Lu.\n\n## Open seams\n\n- **Projection authority — FE-1480.** The ticket assumes non-deterministic LLM inference from the\n  requirements model to SDCPN, while ADR-0003 requires write-time-only semantic inference and a\n  pure projection. A worked CPS transformation must assign every judgment to capture, fold,\n  projection, or document application before the interface freezes.\n- **Controller and runbook.** The harness does not read the folded model or open issues back into\n  the agent, and no plugin defines a job trajectory or stopping rule. FE-1482 must exercise the\n  narrow `review-and-revise` loop; FE-1406 and FE-1402/FE-1403 are inputs, not parallel products.\n- **Reviewer target identity — FE-1439 × FE-1479.** The current host derives target-document\n  identity from conversation identity. September requires a new reviewer conversation against an\n  existing target without weakening owner isolation.\n- **Contract freeze — FE-1387.** The CPS target must stress the plugin contract before it freezes.\n  The freeze follows the September semantic proof rather than gating it.\n- **Absence locator.** An absence capture carries no payload, but the fold needs a field-specific\n  coordinate (anchor × slot). The plugin-contract spec records three worked cases; any envelope\n  amendment belongs to the harness side of this seam.\n- **Structured-tap evidence — FE-1395 × capture store.** `resolve-conflict` currently rejects\n  `user-affordance-payload` evidence. FE-1395 must decide the transport fact before the store\n  rule can settle.\n- **Guidance placement — FE-1403 × FE-1406.** Plugin cards and the harness-shipped generic\n  strategy quiver share authoring methods but not ownership. Packages export; hosts register.\n- **Telemetry vocabulary — FE-1385 × FE-1404 × FE-1423.** The probe surface, experiment\n  accounting, and remote telemetry should share span vocabulary rather than invent it three\n  times.\n- **Living-prototype charter.** The deployed elicitor as a cumulative record of proved and\n  unproved behavior remains pre-charter until the infrastructure conversation settles.\n\nSettled seam decisions still governing open work: FE-1392 established the plugin-declared\nverbatim proposal floor, and ask accounting remains a read-time relation rather than an envelope\nfield. ADR-0003 keeps field-level structure below the capture's single epistemic status.\n\n## Exceptional roots\n\nThese project issues intentionally have no parent and are roots under the registry rule:\n\n- **FE-1331 — start elicitation from Petrinaut's create-new-net flow.** ADR-0004 un-deferred this as\n  September topology, while FE-1476's new reviewer scenario starts from an existing target. Keep\n  the conflict visible until Dora confirms the use case and the ADR is amended if necessary.\n- **FE-1334 — offer the user a surprising scenario of their model.** A validation gesture with\n  no owning map yet; closest to the motif/quiver strategy work.\n- **FE-1406 — design reusable elicitation strategies.** The cross-map home for the\n  harness-shipped generic strategy quiver; intentionally independent of either delivery map.\n- **FE-1472 — evaluate the nested Anthropic SDK pin.** Unrelated triage root; no owning delivery\n  map has been chosen.\n- **FE-1476 — prepare the September demo.** Temporary delivery root pending the recommended fold\n  under FE-1357.\n- **FE-1477 through FE-1482 — September outcome slices.** PM-authored issues adopted by the\n  steering model but not yet folded in Linear. The recommended parent is FE-1476; overlaps and\n  ownership boundaries are recorded in STEERING's issue projection before external mutation.\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-034CejrLBy1mv7nq81RC0k`

```
{
  "output": "sed: docs/INDEX.md: No such file or directory\n",
  "exitCode": 0
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "sed -n '63,80p' docs/INDEX.md",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "git diff --check -- libs/@hashintel/brunch-agent/docs/INDEX.md libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md libs/@hashintel/brunch-agent/docs/planning/_shared/STEERING.md; git diff --stat -- libs/@hashintel/brunch-agent/docs/INDEX.md libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md libs/@hashintel/brunch-agent/docs/planning/_shared/STEERING.md",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 10000
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "git diff -- libs/@hashintel/brunch-agent/docs/INDEX.md libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md libs/@hashintel/brunch-agent/docs/planning/_shared/STEERING.md | sed -n '1,340p'",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 10000
}
```

## User

**Tool Result:** `TU-034Cek53htAlJQWEntJALf`

```
{
  "output": "| [notes/deep-read-fe-1389](planning/process-model-elicitation/notes/deep-read-fe-1389.md)                                                     | active     | FE-1401 / findings in FE-1420            | Deep-read of the walking skeleton: builder's account, spec-discharge table (issues 10/13 capabilities discharged; markdown floor contradicted in the UI), 12 findings; source of PR #10's backfilled record                                                                                                            |\n| [notes/deep-read-fe-1390](planning/process-model-elicitation/notes/deep-read-fe-1390.md)                                                     | active     | FE-1401 / probes on FE-1419              | Deep-read of the capture store: spec-discharge table, write-time tiering assessment (penciled item 7), the FE-1405 status-arity answer, and live-probed confirmation of FE-1419's capture-store claims plus one new aliasing hole; source of PR #11's backfilled record                                                |\n| [plugin-contract-spec](planning/process-model-elicitation/plugin-contract-spec.md)                                                           | active     | FE-1431 (spec issue); decided on FE-1405 | Provisional spec: a plugin is two schemas and two tables (model schema, proposal catalog, fold table, demand table) over the three-register IR (ADR-0003) — harness-machinery typology, standard-interiors library, grade-as-narrowing, derived fold rules; strains 4–7 and envelope pressure #2 held open with owners |\n\n## planning/\\_shared (cross-effort control documents)\n\n| Document                                                                         | Status                             | Linear                                                                                                          | Digest                                                                                                                                                                                                                                                     |\n| -------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |\n| [COORDINATION](planning/_shared/COORDINATION.md)                                 | active                             | cross-project; maintained by arc-close                                                                          | Current sequencing recommendation, soft cross-map edges, unresolved seams, and exceptional roots; hard blockers, state, and hierarchy remain in Linear                                                                                                     |\n| [hash-monorepo-import-plan](planning/_shared/hash-monorepo-import-plan.md)       | active until FE-1437 lands         | FE-1437                                                                                                         | Native HASH assimilation plan: preserved history and child package workspaces under one Brunch context root, explicit authority cutover, exhaustive repository-material disposition, toolchain port, boundary gates, and verification                      |\n| [SPEC-LEDGER](planning/_shared/SPEC-LEDGER.md)                                   | active until milestone-one closure | FE-1383                                                                                                         | Obligation-level status and evidence ledger for the elicitation-kernel specification; settles when the milestone closes                                                                                                                                    |\n| [STEERING](planning/_shared/STEERING.md)                                         | active                             | FE-1357 / FE-1476                                                                                                | Current objective-driven strategy for the September CPS review-and-revise proof: evidence, architectural pressure, proof frontiers, cuts, issue projection, risks, and replan conditions                                                                    |\n| [flue-architecture-cheatsheet](planning/_shared/flue-architecture-cheatsheet.md) | active                             | commented on FE-1383; feeds docs/agents/flue-routing.md                                                         | Architect's consolidation of all 21 Flue guide pages: direct structured generation uses `harness.prompt`; model-delegated work uses `useSubagent`; three-lane boundary summary and ranked divergence risks; reconciled against installed Flue 2.0.3 source |\n| [topology](planning/_shared/topology.md)                                         | active                             | ratified → ADR-0002; N1 discharged by FE-1422 + FE-1392; local N5 implemented by FE-1391; N3 amended by FE-1437 | Pseudo-style verification of the package/app tree against the three-lane model and spec §12.2: portable ask/sweep protocols, Flue binding wiring, package boundaries, and application-only Brunch–Petrinaut composition                                    |\n\n## planning/legibility-sweep (FE-1401 arc records)\n\n| Document                                                                                                                  | Status  | Linear                                                                     | Digest                                                                                                                                                                                                                                               |\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-034Cek55eiK2UBnapC75mu`

```
{
  "output": " libs/@hashintel/brunch-agent/docs/INDEX.md         |  1 +\n .../docs/planning/_shared/COORDINATION.md          | 93 ++++++++++++++--------\n 2 files changed, 59 insertions(+), 35 deletions(-)\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-034Cek56pKeADZNxtxu42g`

```
{
  "output": "diff --git a/libs/@hashintel/brunch-agent/docs/INDEX.md b/libs/@hashintel/brunch-agent/docs/INDEX.md\nindex ca6ea309c0..b0834155a7 100644\n--- a/libs/@hashintel/brunch-agent/docs/INDEX.md\n+++ b/libs/@hashintel/brunch-agent/docs/INDEX.md\n@@ -71,6 +71,7 @@ _(empty — items settle out via the arc-close inbox sweep)_\n | [COORDINATION](planning/_shared/COORDINATION.md)                                 | active                             | cross-project; maintained by arc-close                                                                          | Current sequencing recommendation, soft cross-map edges, unresolved seams, and exceptional roots; hard blockers, state, and hierarchy remain in Linear                                                                                                     |\n | [hash-monorepo-import-plan](planning/_shared/hash-monorepo-import-plan.md)       | active until FE-1437 lands         | FE-1437                                                                                                         | Native HASH assimilation plan: preserved history and child package workspaces under one Brunch context root, explicit authority cutover, exhaustive repository-material disposition, toolchain port, boundary gates, and verification                      |\n | [SPEC-LEDGER](planning/_shared/SPEC-LEDGER.md)                                   | active until milestone-one closure | FE-1383                                                                                                         | Obligation-level status and evidence ledger for the elicitation-kernel specification; settles when the milestone closes                                                                                                                                    |\n+| [STEERING](planning/_shared/STEERING.md)                                         | active                             | FE-1357 / FE-1476                                                                                                | Current objective-driven strategy for the September CPS review-and-revise proof: evidence, architectural pressure, proof frontiers, cuts, issue projection, risks, and replan conditions                                                                    |\n | [flue-architecture-cheatsheet](planning/_shared/flue-architecture-cheatsheet.md) | active                             | commented on FE-1383; feeds docs/agents/flue-routing.md                                                         | Architect's consolidation of all 21 Flue guide pages: direct structured generation uses `harness.prompt`; model-delegated work uses `useSubagent`; three-lane boundary summary and ranked divergence risks; reconciled against installed Flue 2.0.3 source |\n | [topology](planning/_shared/topology.md)                                         | active                             | ratified → ADR-0002; N1 discharged by FE-1422 + FE-1392; local N5 implemented by FE-1391; N3 amended by FE-1437 | Pseudo-style verification of the package/app tree against the three-lane model and spec §12.2: portable ask/sweep protocols, Flue binding wiring, package boundaries, and application-only Brunch–Petrinaut composition                                    |\n \ndiff --git a/libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md b/libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md\nindex 54e343fb83..8c2d3d1ca4 100644\n--- a/libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md\n+++ b/libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md\n@@ -2,9 +2,10 @@\n \n This is the cross-map coordination surface for the `brunch-agent` project. FE-1383 owns the\n milestone-one harness build; FE-1357 owns the September demo and process-model plugin design.\n-Linear is canonical for issue state, parentage, and hard `blocks` relations. This file owns\n-only the judgment Linear cannot express: the current project-wide recommendation, soft edges,\n-unresolved seams, and exceptional roots.\n+Linear is canonical for issue state, parentage, and hard `blocks` relations. The\n+[steering model](./STEERING.md) chooses the current objective, proof frontiers, and cuts under\n+pressure. This file projects that strategy onto mechanically available work: the current\n+project-wide recommendation, soft edges, unresolved seams, and exceptional roots.\n \n Before revising the recommendation, run\n `turbo run linear:graph --filter '@hashintel/brunch-agent'`. Its compact projection supplies the\n@@ -13,19 +14,22 @@ honest recommendation. Do not paste the generated graph here or mirror issue sta\n \n ## Current sequencing recommendation\n \n-As of **2026-08-21**, the FE-1437 authority cutover has been executed: the full brunch-lite\n-history is imported on `ln/fe-1437-hash-monorepo-import` in `hashintel/hash` (frozen standalone\n-SHA `43a0022918861846344b96a32cb94f92e2ee96ae`), every import gate re-verified. `hashintel/hash`\n-is authoritative; the standalone repository accepts no further implementation work. FE-1437\n-closes when the branch lands on `main` (squash merge, per convention). Part of FE-1440's website\n-wiring (the Brunch interactive-tool panel in `apps/petrinaut-website`) travelled with the import\n-branch; FE-1440 was trimmed on 2026-08-21 to the remaining mode wiring (mode switch, browser\n-identifier bootstrap, remote transport swap). After landing, advance FE-1438 (client-tool round-trip)\n-beside FE-1393 (plugin SDK and first projection); FE-1439 (private durable sessions) proceeds in\n-parallel. The integration stream joins at FE-1440 and deployment follows at FE-1441 (which also\n-waits on FE-1423's pre-exposure gates), while the harness stream reaches its contract-freeze\n-decision at FE-1387. FE-1402/FE-1403 form a parallel content/evaluation stream, without\n-displacing the two convergence edges.\n+As of **2026-08-24**, FE-1476 (the September demo delivery) changes the recommendation from generic\n+package completion to a concrete CPS review-and-revise proof. After FE-1437 (the monorepo import)\n+lands, open two fronts in parallel. The semantic front starts FE-1482 (the CPS plugin) against one\n+worked fixture and settles FE-1480's requirements-model-to-SDCPN authority boundary before it\n+implements a projector; FE-1478 (net-to-requirements provenance) is part of that spine from its\n+first types. The experience front advances FE-1438 (machine client-tool round-trip) and FE-1439\n+(private sessions) far enough for a new reviewer conversation to target an existing document,\n+while FE-1477/FE-1440 share one provider-routing implementation. Join the fronts at FE-1479\n+(targeted re-elicitation), then drive the same path through FE-1423's pre-exposure gates and\n+FE-1441 deployment.\n+\n+FE-1393's generic Gherkin artifact and FE-1387's second-target contract freeze no longer gate the\n+September proof. FE-1402, FE-1403, FE-1406, and FE-1431 supply only the completion, guidance,\n+strategy, and contract slices the CPS `review-and-revise` runbook consumes. FE-1481 selects\n+YAML/Markdown export as the requirements-model inspection floor; broad UI follows only if the\n+closed loop is already proved.\n \n ```text\n legend:\n@@ -36,29 +40,30 @@ legend:\n \n nodes:\n   FE-1437 [executed, landing]      # history imported; HASH authoritative; PR pending\n-  FE-1438 [next]                   # client-tool round-trip\n-  FE-1439 [next, parallel]         # private durable sessions\n-  FE-1440 [join, partly landed]    # website elicitor mode; panel wiring on import branch\n-  FE-1441 [post-landing]           # HASH deployment\n-  FE-1393 [next]                   # plugin SDK + first projection\n-  FE-1387 [after-FE-1393]          # second pack + contract freeze\n-  FE-1395 [coordination]           # full affordance set\n-  FE-1402 [parallel, content]      # completion contract\n-  FE-1403 [parallel, content]      # interviewing guidance\n-  FE-1404 [after-content]          # armed baseline\n+  FE-1476 [objective]              # September reviewer demo\n+  FE-1482 [next, semantic]         # concrete CPS plugin + review/revise runbook\n+  FE-1480 [decision, semantic]     # model/projection authority, then projector\n+  FE-1478 [semantic proof]         # provenance through all three registers\n+  FE-1438 [next, experience]       # machine client-tool round-trip + application\n+  FE-1439 [next, experience]       # existing-target reviewer session ownership\n+  FE-1477/FE-1440 [experience]     # one provider-routing implementation\n+  FE-1479 [join]                   # targeted correction changes the live net\n+  FE-1481 [fallback]               # structured model export before UI\n+  FE-1441 [deployed proof]         # HASH deployment\n \n edges:\n   FE-1449                 -[hard]->       FE-1438\n-  FE-1392                 -[hard]->       FE-1393\n   FE-1438, FE-1439,\n   FE-1437                 -[hard]->       FE-1440\n   FE-1437, FE-1439,\n   FE-1423                 -[hard]->       FE-1441\n-  FE-1393                 -[hard]->       FE-1387\n-  FE-1402, FE-1403        -[hard]->       FE-1404\n-  FE-1395                 -[coord]->      FE-1438\n   FE-1437 branch on main  -[state-gate]-> FE-1438, FE-1439, FE-1393\n-  FE-1387                 -[input]->      FE-1440\n+  FE-1480 decision        -[input]->      FE-1482, FE-1478\n+  FE-1402, FE-1403,\n+  FE-1406, FE-1431        -[input]->      FE-1482\n+  FE-1482, FE-1478,\n+  FE-1438, FE-1439        -[input]->      FE-1479\n+  FE-1479, FE-1440        -[input]->      FE-1441\n ```\n \n Hard-edge truth remains in Linear. The graph above is a deliberately focused recommendation,\n@@ -90,8 +95,18 @@ explicit approval from Lu.\n \n ## Open seams\n \n-- **Contract freeze — FE-1387.** The process-model target must stress the plugin contract before\n-  it freezes. FE-1393 makes the contract programmable; FE-1387 remains the cross-map hinge.\n+- **Projection authority — FE-1480.** The ticket assumes non-deterministic LLM inference from the\n+  requirements model to SDCPN, while ADR-0003 requires write-time-only semantic inference and a\n+  pure projection. A worked CPS transformation must assign every judgment to capture, fold,\n+  projection, or document application before the interface freezes.\n+- **Controller and runbook.** The harness does not read the folded model or open issues back into\n+  the agent, and no plugin defines a job trajectory or stopping rule. FE-1482 must exercise the\n+  narrow `review-and-revise` loop; FE-1406 and FE-1402/FE-1403 are inputs, not parallel products.\n+- **Reviewer target identity — FE-1439 × FE-1479.** The current host derives target-document\n+  identity from conversation identity. September requires a new reviewer conversation against an\n+  existing target without weakening owner isolation.\n+- **Contract freeze — FE-1387.** The CPS target must stress the plugin contract before it freezes.\n+  The freeze follows the September semantic proof rather than gating it.\n - **Absence locator.** An absence capture carries no payload, but the fold needs a field-specific\n   coordinate (anchor × slot). The plugin-contract spec records three worked cases; any envelope\n   amendment belongs to the harness side of this seam.\n@@ -114,9 +129,17 @@ field. ADR-0003 keeps field-level structure below the capture's single epistemic\n \n These project issues intentionally have no parent and are roots under the registry rule:\n \n-- **FE-1331 — start elicitation from Petrinaut's create-new-net flow.** Deferred post-September\n-  consumer topology; returns after in-Petrinaut staging proves itself.\n+- **FE-1331 — start elicitation from Petrinaut's create-new-net flow.** ADR-0004 un-deferred this as\n+  September topology, while FE-1476's new reviewer scenario starts from an existing target. Keep\n+  the conflict visible until Dora confirms the use case and the ADR is amended if necessary.\n - **FE-1334 — offer the user a surprising scenario of their model.** A validation gesture with\n   no owning map yet; closest to the motif/quiver strategy work.\n - **FE-1406 — design reusable elicitation strategies.** The cross-map home for the\n   harness-shipped generic strategy quiver; intentionally independent of either delivery map.\n+- **FE-1472 — evaluate the nested Anthropic SDK pin.** Unrelated triage root; no owning delivery\n+  map has been chosen.\n+- **FE-1476 — prepare the September demo.** Temporary delivery root pending the recommended fold\n+  under FE-1357.\n+- **FE-1477 through FE-1482 — September outcome slices.** PM-authored issues adopted by the\n+  steering model but not yet folded in Linear. The recommended parent is FE-1476; overlaps and\n+  ownership boundaries are recorded in STEERING's issue projection before external mutation.\n",
  "exitCode": 0
}
```

## Assistant

**Tool Use:** `apply_patch`

```json
{
  "patchText": "*** Begin Patch\n*** Update File: /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md\n@@\n-  FE-1437 branch on main  -[state-gate]-> FE-1438, FE-1439, FE-1393\n+  FE-1437 branch on main  -[state-gate]-> FE-1438, FE-1439\n@@\n-These project issues intentionally have no parent and are roots under the registry rule:\n+These project issues currently have no parent. Some are intentional roots; the temporary or\n+unresolved roots are named here until their Linear parentage is settled:\n*** End Patch"
}
```

## User

**Tool Result:** `TU-034CekGiiRgw1pZ1J1qAGT`

```
{
  "files": [
    {
      "uri": "file:///Users/lunelson/Code/hashintel/hash/libs/%40hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md",
      "diff": "Index: /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md\n===================================================================\n--- /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md\n+++ /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md\n@@ -56,9 +56,9 @@\n   FE-1438, FE-1439,\n   FE-1437                 -[hard]->       FE-1440\n   FE-1437, FE-1439,\n   FE-1423                 -[hard]->       FE-1441\n-  FE-1437 branch on main  -[state-gate]-> FE-1438, FE-1439, FE-1393\n+  FE-1437 branch on main  -[state-gate]-> FE-1438, FE-1439\n   FE-1480 decision        -[input]->      FE-1482, FE-1478\n   FE-1402, FE-1403,\n   FE-1406, FE-1431        -[input]->      FE-1482\n   FE-1482, FE-1478,\n@@ -126,9 +126,10 @@\n field. ADR-0003 keeps field-level structure below the capture's single epistemic status.\n \n ## Exceptional roots\n \n-These project issues intentionally have no parent and are roots under the registry rule:\n+These project issues currently have no parent. Some are intentional roots; the temporary or\n+unresolved roots are named here until their Linear parentage is settled:\n \n - **FE-1331 — start elicitation from Petrinaut's create-new-net flow.** ADR-0004 un-deferred this as\n   September topology, while FE-1476's new reviewer scenario starts from an existing target. Keep\n   the conflict visible until Dora confirms the use case and the ADR is amended if necessary.\n",
      "type": "update",
      "additions": 3,
      "deletions": 2
    }
  ],
  "summary": "update: /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md (+3/-2)"
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "sed -n '44,74p' docs/planning/_shared/COORDINATION.md; sed -n '120,155p' docs/planning/_shared/COORDINATION.md",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

## User

**Tool Result:** `TU-034CekNwpeOY5YQMx9PhLB`

```
{
  "output": "  FE-1482 [next, semantic]         # concrete CPS plugin + review/revise runbook\n  FE-1480 [decision, semantic]     # model/projection authority, then projector\n  FE-1478 [semantic proof]         # provenance through all three registers\n  FE-1438 [next, experience]       # machine client-tool round-trip + application\n  FE-1439 [next, experience]       # existing-target reviewer session ownership\n  FE-1477/FE-1440 [experience]     # one provider-routing implementation\n  FE-1479 [join]                   # targeted correction changes the live net\n  FE-1481 [fallback]               # structured model export before UI\n  FE-1441 [deployed proof]         # HASH deployment\n\nedges:\n  FE-1449                 -[hard]->       FE-1438\n  FE-1438, FE-1439,\n  FE-1437                 -[hard]->       FE-1440\n  FE-1437, FE-1439,\n  FE-1423                 -[hard]->       FE-1441\n  FE-1437 branch on main  -[state-gate]-> FE-1438, FE-1439\n  FE-1480 decision        -[input]->      FE-1482, FE-1478\n  FE-1402, FE-1403,\n  FE-1406, FE-1431        -[input]->      FE-1482\n  FE-1482, FE-1478,\n  FE-1438, FE-1439        -[input]->      FE-1479\n  FE-1479, FE-1440        -[input]->      FE-1441\n```\n\nHard-edge truth remains in Linear. The graph above is a deliberately focused recommendation,\nnot a second issue database.\n\n## Repository handoff threshold\n\nFE-1437 (the monorepo import; [execution plan](./hash-monorepo-import-plan.md)) was the authority\n  times.\n- **Living-prototype charter.** The deployed elicitor as a cumulative record of proved and\n  unproved behavior remains pre-charter until the infrastructure conversation settles.\n\nSettled seam decisions still governing open work: FE-1392 established the plugin-declared\nverbatim proposal floor, and ask accounting remains a read-time relation rather than an envelope\nfield. ADR-0003 keeps field-level structure below the capture's single epistemic status.\n\n## Exceptional roots\n\nThese project issues currently have no parent. Some are intentional roots; the temporary or\nunresolved roots are named here until their Linear parentage is settled:\n\n- **FE-1331 — start elicitation from Petrinaut's create-new-net flow.** ADR-0004 un-deferred this as\n  September topology, while FE-1476's new reviewer scenario starts from an existing target. Keep\n  the conflict visible until Dora confirms the use case and the ADR is amended if necessary.\n- **FE-1334 — offer the user a surprising scenario of their model.** A validation gesture with\n  no owning map yet; closest to the motif/quiver strategy work.\n- **FE-1406 — design reusable elicitation strategies.** The cross-map home for the\n  harness-shipped generic strategy quiver; intentionally independent of either delivery map.\n- **FE-1472 — evaluate the nested Anthropic SDK pin.** Unrelated triage root; no owning delivery\n  map has been chosen.\n- **FE-1476 — prepare the September demo.** Temporary delivery root pending the recommended fold\n  under FE-1357.\n- **FE-1477 through FE-1482 — September outcome slices.** PM-authored issues adopted by the\n  steering model but not yet folded in Linear. The recommended parent is FE-1476; overlaps and\n  ownership boundaries are recorded in STEERING's issue projection before external mutation.\n",
  "exitCode": 0
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "jq -r '.scripts | to_entries[] | select(.key|test(\"^(lint|test|build|fix:format)\")) | \"\\(.key)=\\(.value)\"' package.json | sed -n '1,160p'",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 10000
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "yarn oxfmt --help | sed -n '1,180p'",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 10000
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "git status --short; printf '%s\\n' '--- manifest'; git status --short -- libs/@hashintel/brunch-agent/docs/INDEX.md libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md libs/@hashintel/brunch-agent/docs/planning/_shared/STEERING.md",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 10000
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "find docs/inbox -maxdepth 1 -type f -not -name '.DS_Store' -not -name '.gitkeep' -print 2>/dev/null; printf '%s\\n' '--- spec ledger references to affected obligations'; rg -n \"FE-147|FE-148|CPS|projection|Petrinaut|plugin\" docs/planning/_shared/SPEC-LEDGER.md | head -100",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

## User

**Tool Result:** `TU-034CekYfG1MyOTg5hrDmVz`

```
{
  "output": "fix:format=oxfmt --write\nlint=npm-run-all --continue-on-error \"lint:*\"\nlint:constraints=yarn constraints\nlint:eslint=CARGO_TERM_PROGRESS_WHEN=never turbo --continue=always lint:eslint --\nlint:format=oxfmt --check\nlint:license-in-workspaces=yarn workspace @local/repo-chores exe scripts/check-license-in-workspaces.ts\nlint:markdownlint=mise exec --env dev markdownlint-cli2 -- markdownlint-cli2\nlint:skill=yarn agents:skill-management validate\nlint:taplo=taplo fmt --check\nlint:tsc=mise run lint:tsc\nlint:yarn-deduplicate=yarn dedupe --strategy highest --check\ntest=npm-run-all --continue-on-error \"test:*\"\ntest:integration=CARGO_TERM_PROGRESS_WHEN=never turbo run test:integration --env-mode=loose --\ntest:playwright=CARGO_TERM_PROGRESS_WHEN=never turbo run test:integration --env-mode=loose --filter @tests/hash-playwright --\ntest:unit=CARGO_TERM_PROGRESS_WHEN=never turbo run test:unit --env-mode=loose --\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-034CekYg2JVLrzgKw7ueZr`

```
{
  "output": "Usage: [-c=PATH] [PATH]...\n\nMode Options:\n        --init               Initialize `.oxfmtrc.json` with default values\n        --migrate=SOURCE     Migrate configuration to `.oxfmtrc.json` from specified source\n                             Available sources: prettier, biome\n        --lsp                Start language server protocol (LSP) server\n        --stdin-filepath=PATH  Specify the file name to use to infer which parser to use\n\nOutput Options:\n        --write              Format and write files in place (default)\n        --check              Check if files are formatted, also show statistics\n        --list-different     List files that would be changed\n\nConfig Options\n    -c, --config=PATH        Path to the configuration file (.json, .jsonc, .ts, .mts, .cts, .js,\n                             .mjs, .cjs)\n        --disable-nested-config  Do not search for configuration files in subdirectories\n\nIgnore Options\n        --ignore-path=PATH   Path to ignore file(s). Can be specified multiple times. If not\n                             specified, .gitignore and .prettierignore in the current directory are\n                             used.\n        --with-node-modules  Format code in node_modules directory (skipped by default)\n\nRuntime Options\n        --no-error-on-unmatched-pattern  Do not exit with error when pattern is unmatched\n        --threads=INT        Number of threads to use. Set to 1 for using only 1 CPU core.\n\nAvailable positional items:\n    PATH                     Single file, path or list of paths. Glob patterns are also supported.\n                             (Be sure to quote them, otherwise your shell may expand them before\n                             passing.) Exclude patterns with `!` prefix like `'!**/fixtures/*.js'`\n                             are also supported. If not provided, current working directory is used.\n\nAvailable options:\n    -h, --help               Prints help information\n    -V, --version            Prints version information\n\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-034CekYgQWoicWIdAeBogw`

```
{
  "output": " M libs/@hashintel/brunch-agent/docs/INDEX.md\n M libs/@hashintel/brunch-agent/docs/agents/git-workflow.md\n M libs/@hashintel/brunch-agent/docs/agents/issue-writing.md\n M libs/@hashintel/brunch-agent/docs/agents/legibility.md\n M libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md\n M libs/@hashintel/brunch-agent/docs/planning/_shared/hash-monorepo-import-plan.md\n?? libs/@hashintel/brunch-agent/docs/planning/_shared/STEERING.md\n--- manifest\n M libs/@hashintel/brunch-agent/docs/INDEX.md\n M libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md\n?? libs/@hashintel/brunch-agent/docs/planning/_shared/STEERING.md\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-034CekYgod3wfyc7qMtIAB`

```
{
  "output": "--- spec ledger references to affected obligations\n20:| Shell separation: plugins→core only; core imports no substrate; binding imports both    | §4, §12.2    | **discharged**              | boundary gates (FE-1388/FE-1399, `test/boundaries.test.ts`); `workspacePackages()` derives groups from manifest; `plugin-gherkin` imports `@brunch/core` only                                                                                                                                                                                                   |\n21:| Package topology                                                                        | §12.2        | **partial**                 | `core` (+`testing` subpath), `binding-flue`, `transport-aisdk`, `plugin-gherkin`, `apps/brunch-agent` exist; `plugin-assurance` pending. FE-1437 imported them to their native HASH destinations and preserved the existing dependency boundaries. Topology pin derives from §12.2 itself (FE-1400 `ef00201`); FE-1436 adds the transport-only dependency gate. |\n26:| Host-authored thin agent calling `useElicitation(plugin, session)`                      | §12.1        | **discharged**              | `apps/brunch-agent/src/agents/gherkin-elicitor.ts`; FE-1392 adds host-owned immutable session/document and transport wiring                                                                                                                                                                                                                                     |\n29:| Remote-parity constraints (pinned agentName, storage outside plugin, no dynamic agents) | §12.5        | **discharged**              | pinned-identity gates (FE-1399/FE-1400); storage port in binding (FE-1390)                                                                                                                                                                                                                                                                                      |\n40:| Confidence qualitative, never a scalar                                                                                                                   | §5       | **partial**                         | non-empty string only; `\"0.93\"` accepted. Vocabulary is settled by the plugin-contract spec as `firm                                                                                                                                                                                                                                                                                                                                   | hedged | speculative`; its proposed store refusal rule for numeric-parsing strings remains to implement |\n43:| One epistemic status per capture                                                                                                                         | §5       | **discharged**, with named friction | Status is the proposal union's discriminant, coupled to provenance shape — per-field status is unrepresentable, and payload-smuggling it breaks dedup identity. This was FE-1405's central input (deep-read FE-1390, tiering section); the arc consumed it _without_ amendment — one status per capture survives, and the structure that wanted per-field status lives below it in proposal interiors (ADR-0003, plugin-contract spec) |\n49:| `project` + typed loss report; `validate`; optional `reconcile`; purity (C2) | §6.1 | **pending**    | FE-1392 adds only the plugin-declared `statement-noted` verbatim proposal floor; operations remain FE-1393                                                                                                                                                                        |\n52:| Duplicate detection free for flat-record plugins                             | §6.2 | **partial**    | near-identical advisory fires for string payloads only; a flat record gets none                                                                                                                                                                                                   |\n55:| Cadence as policy (§6.4)                                                     | §6.4 | **partial**    | FE-1392 makes successful sweep the cadence boundary and keeps projection/validation read-time-only, leaving sweep outcome unchanged. Concrete operations remain absent until FE-1393                                                                                              |\n90:| Only the true user's side is evidence; injected entries structurally non-user    | §9.4 | **partial**                                       | FE-1391 verifies role/purpose against the public projection, refuses signal/advisory text, and classifies affordance replies only from the harness-owned reply-binding signal. The kickoff remains a machine-authored `user` entry until FE-1420/FE-1385 move it to `useInitialData`; FE-1396 still owns briefing-never-evidence                 |\n92:| Storage port: harness-defined, binding-implemented, plugin-blind (C1)            | §9.6 | **discharged for the local target**               | core owns capture/archive/anchoring semantics; `binding-flue` owns the file implementation; plugins cannot import the binding (FE-1390 + FE-1391)                                                                                                                                                                                                |\n94:| Compaction vs. durable log                                                       | §9.7 | **partial — source-settled, behavioral pin open** | Flue 2.0.3's append-only stream contract and implementation show compaction appends a canonical record, rewrites only model context, preserves the public message projection, and leaves `state_write` reduction untouched. The source-read record reshapes FE-1386 to one upgrade pin; `test/open-gaps.ts` remains until behavioral proof lands |\n101:| Caps 6–8, incl. entry-projection read                                                             | §10  | **discharged** | FE-1391 supplies the public reader/archive. FE-1392 uses direct structured `harness.prompt` inside a durable tool whose peek/extract/refresh/apply boundaries use `step.do`; the mounted runtime pins same-response finish-hook steering and refresh-before-apply |\n107:| Plugin ownership: packs, forms, validators                                       | §11.1      | **partial**                      | `plugin-gherkin` now owns its one FE-1392 proposal declaration/schema and target identity; packs, forms, validators, fold, and demand table remain FE-1393/FE-1387 work                                                    |\n109:| Smallest honest plugin as a standing bar                                         | §11.3      | **partial**                      | `statement-noted.test.ts` and the core plugin fixture encode the one-type verbatim floor and reject undeclared parsed/pointer shape; the standing bar must grow with FE-1393's operations                                  |\n122:| Invariants 3, 8 (projection loss, equivalent projection)        | §14.1 | **pending**                     | no `project` exists                                                                                                                                                                                                                               |\n124:| Gating tests (reprojection, minimal pairs, black-box authoring) | §14.3 | **pending**                     | —                                                                                                                                                                                                                                                 |\n",
  "exitCode": 0
}
```

## Assistant

The reviewed plan now makes the production sweep itself part of “done”: the correction must originate in the reviewer’s utterance and become a real superseding capture. It also requires the prebuilt demo baseline to begin from valid source conversation/capture state, not a hand-authored model with decorative provenance. I’m moving through the package’s verification and control-surface closeout now.

**Tool Use:** `shell_command`

```json
{
  "command": "yarn markdownlint-cli2 libs/@hashintel/brunch-agent/docs/INDEX.md libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md libs/@hashintel/brunch-agent/docs/planning/_shared/STEERING.md && turbo run lint:eslint --filter '@hashintel/brunch-agent'",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 60000
}
```

## User

**Tool Result:** `TU-034CekpIOxnYwkta6op8sD`

```
{
  "output": "Usage Error: Couldn't find a script named \"markdownlint-cli2\".\n\n$ yarn run [--inspect] [--inspect-brk] [-T,--top-level] [-B,--binaries-only] [--require #0] <scriptName> ...\n",
  "exitCode": 1
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "mise exec --env dev markdownlint-cli2 -- markdownlint-cli2 libs/@hashintel/brunch-agent/docs/INDEX.md libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md libs/@hashintel/brunch-agent/docs/planning/_shared/STEERING.md && turbo run lint:eslint --filter '@hashintel/brunch-agent'",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 60000
}
```

## User

**Tool Result:** `TU-034Cel1wEvg9lhiTrj1jis`

```
{
  "output": "markdownlint-cli2 v0.22.1 (markdownlint v0.40.0)\nFinding: libs/@hashintel/brunch-agent/docs/INDEX.md libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md libs/@hashintel/brunch-agent/docs/planning/_shared/STEERING.md *.md **/*.md **/*.mdc !**/LICENSE*.md !**/AGENTS*.md !node_modules/** !target/** !**/_temp/** !**/_ai/** !**/.cursor/plans/** !libs/@hashintel/ds-components/** !libs/@hashintel/ds-helpers/** !libs/@hashintel/brunch-agent/docs/**\nLinting: 256 file(s)\nSummary: 0 error(s)\nturbo 2.6.3\n\n• Packages in scope: @hashintel/brunch-agent\n• Running lint:eslint in 1 packages\n• Remote caching disabled\n@local/eslint:build: cache miss, executing 721d5b9a378f6a70\n@hashintel/brunch-agent:lint:eslint: cache miss, executing 59f21353e1c3ce33\n@hashintel/brunch-agent:lint:eslint: Found 0 warnings and 0 errors.\n@hashintel/brunch-agent:lint:eslint: Finished in 651ms on 29 files with 110 rules using 16 threads.\n\n Tasks:    2 successful, 2 total\nCached:    0 cached, 2 total\n  Time:    5.875s \n\n",
  "exitCode": 0
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "yarn oxfmt --check libs/@hashintel/brunch-agent/docs/INDEX.md libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md libs/@hashintel/brunch-agent/docs/planning/_shared/STEERING.md",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 60000
}
```

## User

**Tool Result:** `TU-034CelM4ZMYxG1P5RAJY93`

```
{
  "output": "(node:57738) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///Users/lunelson/Code/hashintel/hash/oxfmt.config.ts?cache=1787567470038 is not specified and it doesn't parse as CommonJS.\nReparsing as ES module because module syntax was detected. This incurs a performance overhead.\nTo eliminate this warning, add \"type\": \"module\" to /Users/lunelson/Code/hashintel/hash/package.json.\n(Use `node --trace-warnings ...` to show where the warning was created)\nChecking formatting...\n\nExpected at least one target file. All matched files may have been excluded by ignore rules.\n",
  "exitCode": 2
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "yarn bin prettier || true; yarn bin markdownlint-cli2 || true; rg -n \"brunch-agent/docs|\\.md\" oxfmt.config.ts .prettierignore 2>/dev/null | head -80",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 10000
}
```

## User

**Tool Result:** `TU-034CelVd9SekIht8fTjx82`

```
{
  "output": "Usage Error: Couldn't find a binary named \"prettier\" for package \"hash@workspace:.\"\n\n$ yarn bin [-v,--verbose] [--json] [name]\nUsage Error: Couldn't find a binary named \"markdownlint-cli2\" for package \"hash@workspace:.\"\n\n$ yarn bin [-v,--verbose] [--json] [name]\noxfmt.config.ts:61:    \"**/LICENSE*.md\",\noxfmt.config.ts:64:    \"libs/@hashintel/brunch-agent/docs/**\",\n",
  "exitCode": 0
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "turbo run lint:tsc --filter '@hashintel/brunch-agent'",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 60000
}
```

## User

**Tool Result:** `TU-034Celf5ywUscVmI5cF36u`

```
{
  "output": "turbo 2.6.3\n\n• Packages in scope: @hashintel/brunch-agent\n• Running lint:tsc in 1 packages\n• Remote caching disabled\n@hashintel/brunch-agent:lint:tsc: cache miss, executing 50584d5be80cc7ec\n\n Tasks:    1 successful, 1 total\nCached:    0 cached, 1 total\n  Time:    2.681s \n\n",
  "exitCode": 0
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "turbo run test:unit --filter '@hashintel/brunch-agent'",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 60000
}
```

## User

**Tool Result:** `TU-034CelqMiYvo5Mj62t4N5A`

```
{
  "output": "turbo 2.6.3\n\n• Packages in scope: @hashintel/brunch-agent\n• Running test:unit in 1 packages\n• Remote caching disabled\n@hashintel/brunch-agent:test:unit: cache miss, executing d4c5393b6af87011\n@hashintel/brunch-agent:test:unit: \n@hashintel/brunch-agent:test:unit:  RUN  v4.1.10 /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/packages/core\n@hashintel/brunch-agent:test:unit: \n@hashintel/brunch-agent:test:unit:  ✓ test/architecture/boundaries.test.ts (29 tests) 33ms\n@hashintel/brunch-agent:test:unit:  ✓ test/naming.test.ts (11 tests) 3ms\n@hashintel/brunch-agent:test:unit:  ✓ test/capture-store.test.ts (24 tests) 21ms\n@hashintel/brunch-agent:test:unit:  ✓ test/anchoring.test.ts (6 tests) 4ms\n@hashintel/brunch-agent:test:unit:  ✓ test/session-log.test.ts (4 tests) 8ms\n@hashintel/brunch-agent:test:unit:  ✓ test/sweep-protocol.test.ts (9 tests) 3ms\n@hashintel/brunch-agent:test:unit:  ✓ test/architecture/workspace.test.ts (7 tests) 3ms\n@hashintel/brunch-agent:test:unit:  ✓ test/architecture/linear-project-graph.test.ts (2 tests) 14ms\n@hashintel/brunch-agent:test:unit:  ✓ test/architecture/docs-index.test.ts (7 tests) 12ms\n@hashintel/brunch-agent:test:unit:  ✓ test/ask-protocol.test.ts (9 tests) 2ms\n@hashintel/brunch-agent:test:unit: stderr | test/architecture/open-gaps.test.ts\n@hashintel/brunch-agent:test:unit: \n@hashintel/brunch-agent:test:unit: ⚠ 3 verification gaps are open (spec §14.5 and friends):\n@hashintel/brunch-agent:test:unit:    · restart-durability — FE-1396 (spec §14.5)\n@hashintel/brunch-agent:test:unit:    · compaction-vs-durable-history — FE-1386 (spec §9.7, §14.5)\n@hashintel/brunch-agent:test:unit:    · interpretation-render-plugin-seam — FE-1394 (spec §7.6, §14.5)\n@hashintel/brunch-agent:test:unit:    Closing one means deleting its entry in the commit that lands its proof.\n@hashintel/brunch-agent:test:unit: \n@hashintel/brunch-agent:test:unit: \n@hashintel/brunch-agent:test:unit:  ✓ test/architecture/open-gaps.test.ts (2 tests) 1ms\n@hashintel/brunch-agent:test:unit:  ✓ test/architecture/baseline-runner.test.ts (4 tests) 1867ms\n@hashintel/brunch-agent:test:unit:      ✓ checkpoints a truncated expert reply and stops before another interviewer call  756ms\n@hashintel/brunch-agent:test:unit:      ✓ resume regenerates a trailing truncated expert reply before continuing  636ms\n@hashintel/brunch-agent:test:unit:      ✓ continues a truncated final delivery without sending checkpoint metadata  311ms\n@hashintel/brunch-agent:test:unit: \n@hashintel/brunch-agent:test:unit:  Test Files  12 passed (12)\n@hashintel/brunch-agent:test:unit:       Tests  114 passed (114)\n@hashintel/brunch-agent:test:unit:    Start at  12:31:31\n@hashintel/brunch-agent:test:unit:    Duration  2.08s (transform 76ms, setup 0ms, import 155ms, tests 1.97s, environment 0ms)\n@hashintel/brunch-agent:test:unit: \n\n Tasks:    1 successful, 1 total\nCached:    0 cached, 1 total\n  Time:    4.748s \n\n",
  "exitCode": 0
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "turbo run build --filter '@hashintel/brunch-agent'",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 60000
}
```

## User

**Tool Result:** `TU-034Cem7UfNqOgfA1Uva9tF`

```
{
  "output": "turbo 2.6.3\n\n• Packages in scope: @hashintel/brunch-agent\n• Running build in 1 packages\n• Remote caching disabled\n@hashintel/brunch-agent:build: cache bypass, force executing d9f7ac2bc077ccba\n@hashintel/brunch-agent:build: vite v8.1.0 building client environment for production...\n@hashintel/brunch-agent:build: \u001b[2K\r@hashintel/brunch-agent:build: transforming...✓ 13 modules transformed.\n@hashintel/brunch-agent:build: rendering chunks...\n@hashintel/brunch-agent:build: computing gzip size...\n@hashintel/brunch-agent:build: dist/client-tools.js           0.12 kB │ gzip: 0.12 kB\n@hashintel/brunch-agent:build: dist/storage.js                0.20 kB │ gzip: 0.15 kB\n@hashintel/brunch-agent:build: dist/plugin-BlyisbcK.js        0.68 kB │ gzip: 0.41 kB │ map:  3.09 kB\n@hashintel/brunch-agent:build: dist/testing/index.js          0.69 kB │ gzip: 0.41 kB │ map:  2.13 kB\n@hashintel/brunch-agent:build: dist/naming-DhqH8ada.js        0.78 kB │ gzip: 0.48 kB │ map:  4.29 kB\n@hashintel/brunch-agent:build: dist/session-log-1mbM2HlS.js   6.44 kB │ gzip: 2.22 kB │ map: 20.44 kB\n@hashintel/brunch-agent:build: dist/index.js                 25.31 kB │ gzip: 7.67 kB │ map: 80.29 kB\n@hashintel/brunch-agent:build: \n@hashintel/brunch-agent:build: ✓ built in 23ms\n\n Tasks:    1 successful, 1 total\nCached:    0 cached, 1 total\n  Time:    2.689s \n\n",
  "exitCode": 0
}
```

## Assistant

**Tool Use:** `skill`

```json
{
  "name": "arc-close",
  "arguments": "Close the steering-model control-surface arc. Manifest: docs/planning/_shared/STEERING.md, docs/planning/_shared/COORDINATION.md, docs/INDEX.md. Do not mutate Linear or unrelated worktree files."
}
```

## User

**Tool Result:** `TU-034CemKIXqnng601WefzlI`

```
{
  "content": [
    {
      "text": "<loaded_skill name=\"arc-close\">\n# arc-close Skill\n\n\nRead `docs/agents/arc-close.md` from the Brunch context root and execute its five steps in order.\nThis wrapper carries no duplicate procedure. Report the required checks and whether each\nconditional control surface changed; never persist a no-op evaluation.\n\n\nARGUMENTS: Close the steering-model control-surface arc. Manifest: docs/planning/_shared/STEERING.md, docs/planning/_shared/COORDINATION.md, docs/INDEX.md. Do not mutate Linear or unrelated worktree files.\n\nBase directory for this skill: file:///Users/lunelson/Code/hashintel/hash/libs/%40hashintel/brunch-agent/.agents/skills/arc-close\nRelative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.\n</loaded_skill>",
      "type": "text"
    }
  ]
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "turbo run linear:graph --filter '@hashintel/brunch-agent' 2>/dev/null | sed -n '/project brunch-agent/,$p'",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 60000
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "git diff --check -- libs/@hashintel/brunch-agent/docs/INDEX.md libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md; if rg -n '[[:blank:]]+$' libs/@hashintel/brunch-agent/docs/planning/_shared/STEERING.md; then exit 1; fi; printf '%s\\n' 'no whitespace errors'",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 10000
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "printf '%s\\n' '--- inbox'; find docs/inbox -maxdepth 1 -type f -not -name '.DS_Store' -not -name '.gitkeep' -print 2>/dev/null; printf '%s\\n' '--- manifest status'; git status --short -- docs/INDEX.md docs/planning/_shared/COORDINATION.md docs/planning/_shared/STEERING.md; printf '%s\\n' '--- unrelated status retained'; git status --short -- docs/agents/git-workflow.md docs/agents/issue-writing.md docs/agents/legibility.md docs/planning/_shared/hash-monorepo-import-plan.md",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

## User

**Tool Result:** `TU-034CemaoZZtzEmqq2jtwmT`

```
{
  "output": "@hashintel/brunch-agent:linear:graph: project brunch-agent open=35 hard=16\n@hashintel/brunch-agent:linear:graph: legend: L=hard-dependency layer; p=parent; <=blocked by; =>blocks; *=outside project\n@hashintel/brunch-agent:linear:graph: L0 FE-1331 [Todo root] | Start elicitation from Petrinaut's create-new-net flow\n@hashintel/brunch-agent:linear:graph: L0 FE-1334 [Todo root] | Offer user a surprising scenario of their model\n@hashintel/brunch-agent:linear:graph: L0 FE-1357 [In progress root] | Plan the September elicitation demo and plugin specification\n@hashintel/brunch-agent:linear:graph: L0 FE-1383 [In progress root] | Build the first complete elicitation interview\n@hashintel/brunch-agent:linear:graph: L0 FE-1386 [Backlog p:FE-1383] | Test durable history across transcript compaction\n@hashintel/brunch-agent:linear:graph: L0 FE-1393 [Todo p:FE-1383] =>FE-1384,FE-1387,FE-1394 | Produce the first Gherkin artifact through the plugin SDK\n@hashintel/brunch-agent:linear:graph: L0 FE-1395 [Todo p:FE-1383] =>FE-1385 | Add choices, questionnaires, and explicit absence replies\n@hashintel/brunch-agent:linear:graph: L0 FE-1402 [Next up p:FE-1357] =>FE-1404 | Define and rehearse the elicitation completion contract\n@hashintel/brunch-agent:linear:graph: L0 FE-1403 [Next up p:FE-1357] =>FE-1404 | Assemble and test the CPS interview guidance\n@hashintel/brunch-agent:linear:graph: L0 FE-1406 [Next up root] | Design reusable elicitation strategies\n@hashintel/brunch-agent:linear:graph: L0 FE-1407 [Next up p:FE-1357] | Catalogue elicitor failures that published measures miss\n@hashintel/brunch-agent:linear:graph: L0 FE-1420 [Next up p:FE-1383] | Make affordance handling safe under retries and abandonment\n@hashintel/brunch-agent:linear:graph: L0 FE-1431 [Todo p:FE-1357] | Define declarative plugin authoring\n@hashintel/brunch-agent:linear:graph: L0 FE-1437 [Ready for review p:FE-1433] =>FE-1440,FE-1441 | Move brunch-agent into hashintel/hash with its history\n@hashintel/brunch-agent:linear:graph: L0 FE-1438 [Todo p:FE-1433] =>FE-1440 | Build and repair Petrinaut nets through client tools\n@hashintel/brunch-agent:linear:graph: L0 FE-1439 [Todo p:FE-1433] =>FE-1440,FE-1441 | Keep elicitation sessions private and durable per browser\n@hashintel/brunch-agent:linear:graph: L0 FE-1448 [Ready for review p:FE-1433] | Let Petrinaut hosts render interactive chat tools\n@hashintel/brunch-agent:linear:graph: L0 FE-1472 [Triage root] | Evaluate the cost of pinning bedrock-sdk's nested Anthropic SDK\n@hashintel/brunch-agent:linear:graph: L0 FE-1476 [Todo root] | Prepare September demo\n@hashintel/brunch-agent:linear:graph: L0 FE-1477 [Next up root] | Define the routing logic between Petrinaut AI and the brunch elicitor\n@hashintel/brunch-agent:linear:graph: L0 FE-1478 [Todo root] | Provide provenance from a generated net back to the requirements graph\n@hashintel/brunch-agent:linear:graph: L0 FE-1479 [Todo root] | Update a section of the net through targeted re-elicitation\n@hashintel/brunch-agent:linear:graph: L0 FE-1480 [Todo root] | Infer requirements graph to SDCPN in Petrinaut editor\n@hashintel/brunch-agent:linear:graph: L0 FE-1481 [Todo root] | Show the requirements graph in UI OR export as YAML or Markdown\n@hashintel/brunch-agent:linear:graph: L0 FE-1482 [Next up root] | Add Cyber-physical process modelling plugin to brunch agent\n@hashintel/brunch-agent:linear:graph: L1 FE-1384 [Backlog p:FE-1383] <=FE-1393 | Generate replay tests for the harness rules\n@hashintel/brunch-agent:linear:graph: L1 FE-1387 [Backlog p:FE-1383] <=FE-1393 | Choose a second target and stabilize the plugin interface\n@hashintel/brunch-agent:linear:graph: L1 FE-1394 [Todo p:FE-1383] <=FE-1393 =>FE-1385,FE-1396 | Preserve conflicts until the user resolves them\n@hashintel/brunch-agent:linear:graph: L1 FE-1404 [Next up p:FE-1357] <=FE-1402,FE-1403 | Run the third baseline with completion and interview guidance\n@hashintel/brunch-agent:linear:graph: L1 FE-1440 [Todo p:FE-1433] <=FE-1437,FE-1438,FE-1439 =>FE-1442 | Ship the elicitor in demo.petrinaut.org’s chat panel\n@hashintel/brunch-agent:linear:graph: L2 FE-1385 [Backlog p:FE-1383] <=FE-1394,FE-1395 | Expand the dev app into a target gallery and diagnostic view\n@hashintel/brunch-agent:linear:graph: L2 FE-1396 [Todo p:FE-1383] <=FE-1394 =>FE-1423 | Restore interview context after resume and restart\n@hashintel/brunch-agent:linear:graph: L2 FE-1442 [Todo p:FE-1433] <=FE-1440 | Show live captures and completion accounting in the demo\n@hashintel/brunch-agent:linear:graph: L3 FE-1423 [Todo p:FE-1357] <=FE-1396 =>FE-1441 | Require safe remote access to the elicitor server\n@hashintel/brunch-agent:linear:graph: L4 FE-1441 [Todo p:FE-1433] <=FE-1423,FE-1437,FE-1439 | Deploy the elicitor server behind the remote-release checks\n@hashintel/brunch-agent:linear:graph: cycles: none\n\n Tasks:    1 successful, 1 total\nCached:    0 cached, 1 total\n  Time:    3.73s \n\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-034Cemap9xVYDSej2U9SVL`

```
{
  "output": "no whitespace errors\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-034Cemape2wKP2Oug8G2WK`

```
{
  "output": "--- inbox\n--- manifest status\n M docs/INDEX.md\n M docs/planning/_shared/COORDINATION.md\n?? docs/planning/_shared/STEERING.md\n--- unrelated status retained\n M docs/agents/git-workflow.md\n M docs/agents/issue-writing.md\n M docs/agents/legibility.md\n M docs/planning/_shared/hash-monorepo-import-plan.md\n",
  "exitCode": 0
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "git add libs/@hashintel/brunch-agent/docs/INDEX.md libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md libs/@hashintel/brunch-agent/docs/planning/_shared/STEERING.md && git status --short && printf '%s\\n' '--- staged paths' && git diff --cached --name-only",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 10000
}
```

## User

**Tool Result:** `TU-034Cemxbk8eOgW09TrYLmd`

```
{
  "output": "M  libs/@hashintel/brunch-agent/docs/INDEX.md\n M libs/@hashintel/brunch-agent/docs/agents/git-workflow.md\n M libs/@hashintel/brunch-agent/docs/agents/issue-writing.md\n M libs/@hashintel/brunch-agent/docs/agents/legibility.md\nM  libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md\nA  libs/@hashintel/brunch-agent/docs/planning/_shared/STEERING.md\n M libs/@hashintel/brunch-agent/docs/planning/_shared/hash-monorepo-import-plan.md\n--- staged paths\nlibs/@hashintel/brunch-agent/docs/INDEX.md\nlibs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md\nlibs/@hashintel/brunch-agent/docs/planning/_shared/STEERING.md\n",
  "exitCode": 0
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "git diff --cached --check && git diff --cached --stat && git commit -m \"Add September steering model\"",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 60000
}
```

## User

**Tool Result:** `TU-034CenBB5thhw0PWVBUWVn`

```
{
  "output": " libs/@hashintel/brunch-agent/docs/INDEX.md         |   1 +\n .../docs/planning/_shared/COORDINATION.md          |  98 ++++---\n .../brunch-agent/docs/planning/_shared/STEERING.md | 296 +++++++++++++++++++++\n 3 files changed, 358 insertions(+), 37 deletions(-)\n╭──────────────────────────────────────╮\n│ 🥊 lefthook v2.0.0  hook: pre-commit │\n╰──────────────────────────────────────╯\n│  yarn (skip) no matching staged files\n│  toml (skip) no files for inspection\n│  sqlfluff (skip) no files for inspection\n│  rust (skip) no files for inspection\n┃  oxfmt ❯ \n\n(node:65832) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///Users/lunelson/Code/hashintel/hash/oxfmt.config.ts?cache=1787567541808 is not specified and it doesn't parse as CommonJS.\r\nReparsing as ES module because module syntax was detected. This incurs a performance overhead.\r\nTo eliminate this warning, add \"type\": \"module\" to /Users/lunelson/Code/hashintel/hash/package.json.\r\n(Use `node --trace-warnings ...` to show where the warning was created)\r\nExpected at least one target file. All matched files may have been excluded by ignore rules.\r\n\n┃  markdownlint ❯ \n\nmarkdownlint-cli2 v0.22.1 (markdownlint v0.40.0)\r\nFinding: libs/@hashintel/brunch-agent/docs/INDEX.md libs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md libs/@hashintel/brunch-agent/docs/planning/_shared/STEERING.md !**/LICENSE*.md !**/AGENTS*.md !node_modules/** !target/** !**/_temp/** !**/_ai/** !**/.cursor/plans/** !libs/@hashintel/ds-components/** !libs/@hashintel/ds-helpers/** !libs/@hashintel/brunch-agent/docs/**\r\nLinting: 0 file(s)\r\nSummary: 0 error(s)\r\n\n                                      \n  ────────────────────────────────────\nsummary: (done in 0.93 seconds)       \n✔️ oxfmt (0.40 seconds)\n✔️ markdownlint (0.85 seconds)\n[ln/fe-xxxx-whats-next d4e61bb23b] Add September steering model\n 3 files changed, 358 insertions(+), 37 deletions(-)\n create mode 100644 libs/@hashintel/brunch-agent/docs/planning/_shared/STEERING.md\n",
  "exitCode": 0
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "git status --short; git show --stat --oneline --summary HEAD",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 10000
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "git show --format= --name-only HEAD; git show --format= --check HEAD",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 10000
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "nl -ba docs/planning/_shared/STEERING.md | sed -n '1,330p' | tail -20; nl -ba docs/planning/_shared/COORDINATION.md | sed -n '1,170p' | tail -45",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

## User

**Tool Result:** `TU-034CenRkjCL9VDpfTx9Umd`

```
{
  "output": " M libs/@hashintel/brunch-agent/docs/agents/git-workflow.md\n M libs/@hashintel/brunch-agent/docs/agents/issue-writing.md\n M libs/@hashintel/brunch-agent/docs/agents/legibility.md\n M libs/@hashintel/brunch-agent/docs/planning/_shared/hash-monorepo-import-plan.md\nd4e61bb23b Add September steering model\n libs/@hashintel/brunch-agent/docs/INDEX.md         |   1 +\n .../docs/planning/_shared/COORDINATION.md          |  98 ++++---\n .../brunch-agent/docs/planning/_shared/STEERING.md | 296 +++++++++++++++++++++\n 3 files changed, 358 insertions(+), 37 deletions(-)\n create mode 100644 libs/@hashintel/brunch-agent/docs/planning/_shared/STEERING.md\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-034CenRl7UIjQsnLZeIYR3`

```
{
  "output": "libs/@hashintel/brunch-agent/docs/INDEX.md\nlibs/@hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md\nlibs/@hashintel/brunch-agent/docs/planning/_shared/STEERING.md\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-034CenRltj53l8AQQst4wC`

```
{
  "output": "   277\t| A bounded review-and-revise scenario can carry the September product claim without cold-start elicitation. | Medium. It is the written FE-1476 scenario, but Dora has not confirmed the use case. | The confirmed use case requires model creation rather than review, or the optimisation handoff requires fields absent from the fixture. |\n   278\t| A concrete CPS implementation will discover a better minimum plugin contract faster than completing the generic design first. | Medium-high. Gherkin deliberately under-stresses the interface; CPS is the first real consumer. | The first worked CPS transformation cannot be expressed without a reusable harness primitive that must precede it. Build that primitive, then return immediately to the vertical proof. |\n   279\t| Register 2 can be rich enough for pure SDCPN projection. | Low-medium. ADR-0003 requires it, but no real fold or projector exists and FE-1480 asserts non-determinism. | The worked transformation identifies an unavoidable semantic choice not represented in captures/model. Record it earlier or explicitly revisit the ADR. |\n   280\t| Three to five turns can produce a meaningful scoped correction. | Low. No CPS runbook has been rehearsed. | Two rehearsals exceed the budget or require unrelated context. Narrow the region, preload explicit context, or revise the demo claim rather than script fake success. |\n   281\t| The proven ask suspension can extend to document-application client tools. | Medium-low. The suspension spike succeeded, but the production transport intentionally refuses machine tool-result follow-ups. | The first tool round-trip cannot preserve correlation, durability, or non-user evidence semantics. Treat this as a critical integration blocker, not a UI detail. |\n   282\t| The production website and remote server can be joined inside the timebox. | Medium-low. Local host seams exist; provider routing, session ownership, deployment, and release gates do not yet converge. | A deployable path is not proved by the end of Frontier 2. Preserve the real semantic loop and seek an explicit demo-surface decision rather than quietly falling back to test-only wiring. |\n   283\t| Requirements-model UI is unnecessary for comprehension. | Medium. The reviewer needs inspectability, but FE-1481 explicitly permits export. | Rehearsal shows that provenance and delta cannot be understood from chat plus a structured export. |\n   284\t\n   285\t## Current choice\n   286\t\n   287\tStop treating “unblocked” as “next.” The next strategic move is to run Frontier 0 immediately and\n   288\topen Frontiers 1 and 2 in parallel: one worked CPS semantic slice and one existing-target reviewer\n   289\tsession/tool-return slice. Join them at the earliest correction, then drive the same bones through\n   290\tprovider routing and deployment. The generic Gherkin/plugin-freeze path and broad UI work wait for\n   291\tthat join.\n   292\t\n   293\tRevisit this choice as soon as Dora confirms the use case, the FE-1480 worked transformation lands,\n   294\tor either parallel frontier fails its first proof. A steering pass that only updates ticket status\n   295\tdoes not change this document; a new fact that changes the objective, proof spine, authority\n   296\tboundary, or cut line does.\n   102\t- **Controller and runbook.** The harness does not read the folded model or open issues back into\n   103\t  the agent, and no plugin defines a job trajectory or stopping rule. FE-1482 must exercise the\n   104\t  narrow `review-and-revise` loop; FE-1406 and FE-1402/FE-1403 are inputs, not parallel products.\n   105\t- **Reviewer target identity — FE-1439 × FE-1479.** The current host derives target-document\n   106\t  identity from conversation identity. September requires a new reviewer conversation against an\n   107\t  existing target without weakening owner isolation.\n   108\t- **Contract freeze — FE-1387.** The CPS target must stress the plugin contract before it freezes.\n   109\t  The freeze follows the September semantic proof rather than gating it.\n   110\t- **Absence locator.** An absence capture carries no payload, but the fold needs a field-specific\n   111\t  coordinate (anchor × slot). The plugin-contract spec records three worked cases; any envelope\n   112\t  amendment belongs to the harness side of this seam.\n   113\t- **Structured-tap evidence — FE-1395 × capture store.** `resolve-conflict` currently rejects\n   114\t  `user-affordance-payload` evidence. FE-1395 must decide the transport fact before the store\n   115\t  rule can settle.\n   116\t- **Guidance placement — FE-1403 × FE-1406.** Plugin cards and the harness-shipped generic\n   117\t  strategy quiver share authoring methods but not ownership. Packages export; hosts register.\n   118\t- **Telemetry vocabulary — FE-1385 × FE-1404 × FE-1423.** The probe surface, experiment\n   119\t  accounting, and remote telemetry should share span vocabulary rather than invent it three\n   120\t  times.\n   121\t- **Living-prototype charter.** The deployed elicitor as a cumulative record of proved and\n   122\t  unproved behavior remains pre-charter until the infrastructure conversation settles.\n   123\t\n   124\tSettled seam decisions still governing open work: FE-1392 established the plugin-declared\n   125\tverbatim proposal floor, and ask accounting remains a read-time relation rather than an envelope\n   126\tfield. ADR-0003 keeps field-level structure below the capture's single epistemic status.\n   127\t\n   128\t## Exceptional roots\n   129\t\n   130\tThese project issues currently have no parent. Some are intentional roots; the temporary or\n   131\tunresolved roots are named here until their Linear parentage is settled:\n   132\t\n   133\t- **FE-1331 — start elicitation from Petrinaut's create-new-net flow.** ADR-0004 un-deferred this as\n   134\t  September topology, while FE-1476's new reviewer scenario starts from an existing target. Keep\n   135\t  the conflict visible until Dora confirms the use case and the ADR is amended if necessary.\n   136\t- **FE-1334 — offer the user a surprising scenario of their model.** A validation gesture with\n   137\t  no owning map yet; closest to the motif/quiver strategy work.\n   138\t- **FE-1406 — design reusable elicitation strategies.** The cross-map home for the\n   139\t  harness-shipped generic strategy quiver; intentionally independent of either delivery map.\n   140\t- **FE-1472 — evaluate the nested Anthropic SDK pin.** Unrelated triage root; no owning delivery\n   141\t  map has been chosen.\n   142\t- **FE-1476 — prepare the September demo.** Temporary delivery root pending the recommended fold\n   143\t  under FE-1357.\n   144\t- **FE-1477 through FE-1482 — September outcome slices.** PM-authored issues adopted by the\n   145\t  steering model but not yet folded in Linear. The recommended parent is FE-1476; overlaps and\n   146\t  ownership boundaries are recorded in STEERING's issue projection before external mutation.\n",
  "exitCode": 0
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "rg -n '^## |^### ' docs/planning/_shared/STEERING.md; rg -n '^## |^### ' docs/planning/_shared/COORDINATION.md; rg -n '\\[STEERING\\]' docs/INDEX.md",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

## User

**Tool Result:** `TU-034CenaJhj5wq8tcm8LEb5`

```
{
  "output": "21:## The September outcome\n58:## Where the system actually stands\n82:## The strategic bet\n114:## The elicitor architecture under this load\n160:## Proof frontiers and execution order\n166:### Frontier 0 — make the demo claim decidable\n182:### Frontier 1 — close the CPS semantic loop\n195:### Frontier 2 — close the reviewer control loop\n212:### Frontier 3 — converge on the deployed demo\n222:## What is deliberately cut\n239:## Issue projection\n273:## Beliefs, risks, and replan conditions\n285:## Current choice\n15:## Current sequencing recommendation\n72:## Repository handoff threshold\n96:## Open seams\n128:## Exceptional roots\n74:| [STEERING](planning/_shared/STEERING.md)                                         | active                             | FE-1357 / FE-1476                                                                                                | Current objective-driven strategy for the September CPS review-and-revise proof: evidence, architectural pressure, proof frontiers, cuts, issue projection, risks, and replan conditions                                                                    |\n",
  "exitCode": 0
}
```

## Assistant

Created and committed the [Brunch steering model](file:///Users/lunelson/Code/hashintel/hash/libs/%40hashintel/brunch-agent/docs/planning/_shared/STEERING.md#L1-L296), including:

- September objective, architecture inventory, strategic bet, proof frontiers, cuts, risks, and issue projection.
- Updated [coordination sequencing](file:///Users/lunelson/Code/hashintel/hash/libs/%40hashintel/brunch-agent/docs/planning/_shared/COORDINATION.md#L15-L69).
- Oracle-reviewed acceptance criteria preventing fake provenance or hand-inserted corrections.
- Explicit FE-1480/ADR-0003 and FE-1331/ADR-0004 conflicts.

No Linear changes were made. Verification passed: lint, type-check, 114 tests, build, documentation index/link gates.

Commit: `d4e61bb23b` (`Add September steering model`)

The next substantive discussion should be Frontier 0: the CPS fixture and FE-1480 authority boundary.

## User

OK this is very helpful. A few thoughts:

- a more compact overview, in nested bullet-list or perhaps tree form, collecting issues to the frontiers they support, and calling out where more issues might need to be mapped, would be helpful
- the proof obligations list must also call out legibility: a proof without a legible surface, and ideally a human witness, is the proverbial tree that falls in the forest with nobody around to hear it. This is the legibility protocol, which I need in order to maintain my shared understanding
- your confidence assignments in the "beliefs..." table are mostly what I would assign as well; I would say my low-confidence hovers around the following two cuts that you made, mainly because I'm not confident that belief row 1 will hold, i.e. we will not be asked to show a cold-start elicitation

> - Do not build a complete cold-start CPS interview, general target gallery, every affordance type, voice input, surprising-scenario generation, or broad telemetry vocabulary.
> - Do not implement a comprehensive CPS ontology. Support the fixture, the correction, and the optimisation handoff while keeping the data model honest about what it omits.

Let's talk about Frontier 0 next. (ASIDE: we have an unclear topology of planning docs now, in terms of canonicality, order-of-reading, authority, scope; and we have several documents which are effectively stale and should move to `docs/_archive/` or be deleted

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "cat docs/agents/legibility.md",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

## User

**Tool Result:** `TU-034CfkNUto2uMtzB5jmd3F`

```
{
  "output": "# Legibility protocol: render, read the strain, reconcile\n\nHow work arcs with significant agent-generated output close: produce legibility artifacts that\naid review and re-establish shared understanding between the humans and the agents carrying the\nwork. Companion to `documentation.md` (which governs where documents live; this file governs\nhow understanding is checked and kept).\n\nThe protocol serves one thesis, the same one the CI gates and the capture store serve in code:\n**no claim without a way for it to fail.** A document read in its own register can nod along\nwith itself; re-rendered into a different register, every claim must survive translation, and\nthe places where it doesn't are findings.\n\n## The move: render and read the strain\n\nAt the close of an arc, re-render its central artifact into another register and instruct the\nrenderer to report **every place the source resisted plain rendering** — a dangling referent, a\nterm defined nowhere, a prohibition citing nothing, a causal claim whose causality had to be\ninferred. The strain report _is_ the review yield; the rendering itself is a byproduct (often a\nuseful one — a teammate-readable account).\n\nRun renderings as fork subagents carrying the strain-report instruction, so the main thread\nreviews the findings instead of doing the translation. Instrumenting the collection raises the\nyield: the ir-design plain rendering returned seven strain points where an uninstrumented\nround-2 read of the FE-1374 spec renderings had found four by accident (each of which fed a\nreal spec change — the practice predates its name).\n\n## The register dial\n\nThe register is a dial, not a single target. One practice, several grades — pick the cheapest\ngrade that can still fail:\n\n- **Plain prose** (Google/GOV.UK style): the default. Catches undefined terms, uncited rules,\n  compressed allusions.\n- **STE grade** (controlled vocabulary, one instruction per sentence): for sources whose claims\n  are dense or load-bearing enough that plain prose can still paper over them. Costs more;\n  earns it when the source will govern implementation.\n- **Worked examples** (FE-1397's form): re-render a _definition_ into concrete instances and\n  check what breaks. The strongest grade for type systems and contracts — a definition that\n  survives three worked designs at different thicknesses has been tested, not admired.\n\n## Filings are render-and-read material too\n\nA sweep's own capture — its tickets, its accrual comments, its penciled directions — is itself\na rendering of the session's understanding, and gets the same treatment: expect a challenge\npass over the filings before the arc closes. The FE-1405/FE-1406 round came from re-reading the\nfirst round's own text (\"shapes-to-fill\" quoted back); the gaps were real and had been deepened\nby the filings meant to close them.\n\n## Point findings may reveal a recurrent class\n\nA point finding is evidence of a possible fault class, not proof that the whole codebase shares\nit. Promote the finding to an audit only when recurrence is plausible, the class is cheaply\nsearchable, and missed instances could fail silently. Search both the mechanical family and the\nownership boundaries where the same contract may be reimplemented. Keep finding and fixing as\nseparate steps so a human can confirm the class and scope before repair begins.\n\nWhen the class is confirmed, make its categorical part executable as a boundary or regression\ncheck. Put any judgment that cannot be mechanized into review guidance. Do not widen a one-off\nfinding into a repository sweep merely for symmetry.\n\n## Consolidation: capture-as-we-go, reconcile-before-landing\n\nCapture channels (accrual comments, pencil lists, strain appendices, handoffs) guard against\nevaporation, not fragmentation. Two rules keep the yield coherent:\n\n- **Every capture channel names its consolidation target** — accruals reconcile into the\n  owning control surface, pencils graduate to issues or planning documents, and strain reports\n  become document fixes. A channel with no named target is a leak with a delay.\n- **An arc is not closed until consolidation runs.** The closing step reconciles what the\n  captures established into the durable artifacts (coordination, ledger, docs, issues) — a\n  handoff note alone is a deferral, not a deposit.\n\n## Deposit: work describes itself at authoring time\n\nProse backfill is remediation, not workflow. A branch's commit message and PR body carry its\nsemantics when it lands — the record must not abstain exactly where description is most needed\n(FE-1390 landed 1,392 lines with an empty body; the deep-read that repaired it cost more than\nwriting it at authoring time would have). The same rule for tooling: a skill output written\ninto `docs/` passes through the documentation protocol — an `INDEX.md` row or an `AGENTS.md`\npointer — like any other document.\n\nReflections belong in work products, marked as `> **Reflection:**` blockquotes, distinct from\nthe captured facts — insight left only in chat evaporates with the context that produced it.\n",
  "exitCode": 0
}
```

## Assistant

Agreed on all three adjustments.

The two cuts should become **conditional bets**, not commitments:

- Default to review-and-revise until Frontier 0 confirms whether cold-start is a demo obligation.
- Build a **minimum coherent CPS semantic closure**, not merely a fixture-shaped subset. It must support the demo, provenance, correction, completion, and optimisation handoff while explicitly inventorying omissions.

A compact frontier map could look like:

```text
FE-1476 September outcome
├─ Frontier 0 — make the claim decidable
│  ├─ FE-1480 projection-authority decision
│  ├─ FE-1478 provenance acceptance criteria
│  ├─ FE-1482 CPS semantic scope
│  ├─ FE-1402 completion criteria
│  ├─ FE-1331 cold-start conflict
│  └─ Missing mappings
│     ├─ confirmed demo claim/use case
│     ├─ valid source/capture fixture
│     ├─ optimisation handoff contract
│     └─ witnessed worked-example review
│
├─ Frontier 1 — CPS semantic loop
│  ├─ FE-1482 CPS plugin
│  ├─ FE-1480 SDCPN projection
│  ├─ FE-1478 provenance
│  ├─ FE-1481 structured legibility surface
│  ├─ FE-1402 completion input
│  ├─ FE-1431 plugin-contract input
│  └─ Missing mappings
│     ├─ active-model/issues read path
│     └─ CPS semantic-coverage oracle
│
├─ Frontier 2 — reviewer control loop
│  ├─ FE-1479 targeted re-elicitation
│  ├─ FE-1438 client-tool return/application
│  ├─ FE-1439 existing-target session identity
│  ├─ FE-1394 supersession/conflict behavior
│  ├─ FE-1403 / FE-1406 guidance and strategies
│  └─ Missing mappings
│     ├─ controller implementation
│     ├─ review-and-revise runbook
│     └─ selected-region identity
│
└─ Frontier 3 — deployed witnessed proof
   ├─ FE-1477 / FE-1440 routing and website integration
   ├─ FE-1423 exposure gates
   ├─ FE-1441 deployment
   ├─ FE-1476 rehearsal and acceptance
   └─ Missing mappings
      ├─ optimisation-flow integration
      └─ witnessed demo/legibility deposit
```

Each frontier’s proof should become a three-part bundle:

1. **Executable evidence** — the behavior succeeds and can fail honestly.
2. **Legible rendering** — translate it into another register and record the strain.
3. **Human witness and deposit** — a named person reviews it; findings reconcile into the governing artifact.

For example, Frontier 1 is not proved merely because projection tests pass. A human must be able to follow:

```text
utterance → capture → model field → SDCPN element
```

…and understand the before/after correction without reading implementation code.

For Frontier 0, I suggest four decisions:

1. **What claim must the demo support?**
   - Review/revise only
   - Bootstrap one bounded region from cold start
   - Elicit an entire model from cold start

2. **What semantic closure is necessary?**
   - Every demonstrated net construct has a model/capture source.
   - Every runbook demand has a representable slot or issue.
   - Optimisation inputs are represented.
   - Omitted CPS concepts and their consequences are legible.

3. **Where does inference belong?**
   Work one concrete capture → model → SDCPN transformation and allocate every judgment to capture, fold, projection, or application.

4. **Who witnesses it?**
   Ideally you for architectural legibility, Dora for the product claim, and Chris/Yannis for the optimisation handoff.

My first question is therefore: **what is the strongest cold-start claim you think stakeholders may expect—one bounded region, a recognisable partial model, or the complete process?**

On the planning-doc aside: agreed. We need scoped authority rather than a single total order:

```text
How we work       AGENTS + protocols
Settled truth     CONTEXT + ADRs + active specs
What matters now  STEERING
What runs next    COORDINATION + Linear
Why we believe it planning/reference records
```

Several records currently blur those roles. After Frontier 0, I’d run a separate inventory that classifies each document as current authority, supporting evidence, historical record, superseded/archive, or deletable—with link and Linear-reference repair before moving anything.

## User

Good. That kind of projection is much more legible and usable for me. Long-lived active documents like STEERING.md should also be designed with only as much prose as they need, in such a way as to aid rapid comprehension and reduce VCS churn and conflicts. legible artifacts can be of various forms, and would in at least some cases follow patterns such as dictated for prototyping in `ds-prototype`; but should not be throwaway, rather collected as documentation snapshots of decision/design, and even as regression oracles. 

To your question: I think it's safe to assume that time constraints for a live demo preclude eliciting a complete model *during the live demo*; but that doesn't mean that attendees will not ask to try it out, and it's also possible that external factors or stakeholder decisions will change the focus/substance of the demo with short notice, so I think an implementation that is reasonably capable of a full model elicitation, which works better than a "baseline" (see our earlier comparisons, where we had claude code elicit based on a bare flat prompt), has to be considered important, but it takes time and the judgement of the quality of the output takes time. It's the more bounded scenarios where we want it to be clear (legible) that the elicitation process results in consequent change

## Assistant

**Tool Use:** `skill`

```json
{
  "name": "dogsled:ds-prototype",
  "arguments": "Use its artifact and proof conventions as a reference while shaping persistent legibility artifacts for Brunch Frontier 0; do not build a prototype yet."
}
```

## User

**Tool Result:** `TU-034CfzGWw83L0SzcJU5WFJ`

```
{
  "content": [
    {
      "text": "<loaded_skill name=\"dogsled:ds-prototype\">\n# ds-prototype Skill\n\n\n<!-- Vendored from mattpocock/skills@84fdeff: skills/engineering/prototype -->\n\n# Prototype\n\nA prototype is **throwaway code that answers a question**. The question decides the shape.\n\n## Pick a branch\n\nIdentify which question is being answered — from the user's prompt, the surrounding code, or by asking if the user is around:\n\n- **\"Does this logic / state model feel right?\"** → [LOGIC.md](LOGIC.md). Build a single shareable HTML file — free-play buttons plus tabbed guided walkthroughs — that pushes the state machine through cases that are hard to reason about on paper, and that a non-developer can drive.\n- **\"What should this look like?\"** → [UI.md](UI.md). Generate several radically different UI variations on a single route, switchable via a URL search param and a floating bottom bar.\n\nThe two branches produce very different artifacts — getting this wrong wastes the whole prototype. If the question is genuinely ambiguous and the user isn't reachable, default to whichever branch better matches the surrounding code (a backend module → logic; a page or component → UI) and state the assumption at the top of the prototype.\n\n## Rules that apply to both\n\nUse /ds-subtraction after you understand the question — the first sufficient prototype, not a smaller product.\n\n1. **Throwaway from day one, and clearly marked as such.** Locate the prototype code close to where it will actually be used (next to the module or page it's prototyping for) so context is obvious — but name it so a casual reader can see it's a prototype, not production. For throwaway UI routes, obey whatever routing convention the project already uses; don't invent a new top-level structure.\n2. **Trivial to run.** A UI prototype starts from one command in the project's task runner — `pnpm <name>`, `python <path>`, `bun <path>`, etc. A logic demo is a single HTML file the user double-clicks. Either way, no thinking required to start it.\n3. **No persistence by default.** State lives in memory. Persistence is the thing the prototype is _checking_, not something it should depend on. If the question explicitly involves a database, hit a scratch DB or a local file with a clear \"PROTOTYPE — wipe me\" name.\n4. **Skip the polish.** No tests, no error handling beyond what makes the prototype _runnable_, no abstractions. The point is to learn something fast.\n5. **Surface the state.** After every action (logic) or on every variant switch (UI), print or render the full relevant state so the user can see what changed.\n6. **Capture it when done.** Fold any validated decision into the real code, then capture the prototype itself as a **primary source**: commit it to a throwaway branch, out of main, and leave a context pointer to that branch on the implementation issue. Capture the answer too — the verdict and the question it settled — in the issue or a commit. The main branch keeps only the validated decision.\n\n\nARGUMENTS: Use its artifact and proof conventions as a reference while shaping persistent legibility artifacts for Brunch Frontier 0; do not build a prototype yet.\n\nBase directory for this skill: file:///Users/lunelson/.config/amp/plugins/dogsled/skills/ds-prototype\nRelative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.\n\n<skill_files>\n<file>/Users/lunelson/.config/amp/plugins/dogsled/skills/ds-prototype/LOGIC.md</file>\n<file>/Users/lunelson/.config/amp/plugins/dogsled/skills/ds-prototype/UI.md</file>\n<file>/Users/lunelson/.config/amp/plugins/dogsled/skills/ds-prototype/agents/openai.yaml</file>\n</skill_files>\n</loaded_skill>",
      "type": "text"
    }
  ]
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "cat /Users/lunelson/.config/amp/plugins/dogsled/skills/ds-prototype/LOGIC.md",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

## User

**Tool Result:** `TU-034CfzOJwx7qDvtPhxnrcK`

```
{
  "output": "# Logic Prototype\n\nA single, self-contained HTML file — a **shareable demo** — that lets anyone drive a state model by clicking buttons. Use this when the question is about **business logic, state transitions, or data shape** — the kind of thing that looks reasonable on paper but only feels wrong once you push it through real cases.\n\nBecause it's one file with nothing to install, you can hand it to a non-developer — a designer, a PM, a domain expert — and let them feel the model for themselves. So it speaks their language, not the code's.\n\n## When this is the right shape\n\n- \"I'm not sure if this state machine handles the edge case where X then Y.\"\n- \"Does this data model actually let me represent the case where...\"\n- \"I want to feel out what the API should look like before writing it.\"\n- Anything where someone wants to **press buttons and watch state change**.\n\nIf the question is \"what should this look like\" — wrong branch. Use [UI.md](UI.md).\n\n## Process\n\n### 1. State the question\n\nBefore writing code, write down what state model and what question you're prototyping. One paragraph, at the top of the demo (in a visible intro, not just a comment). A logic prototype that answers the wrong question is pure waste — make the question explicit so it can be checked later, whether the user is watching now or returning to it AFK.\n\n### 2. Isolate the logic in a portable module\n\nPut the actual logic — the bit that's answering the question — in a single `<script>` block written as a small, pure module that could be lifted out and dropped into the real codebase later. The page around it is throwaway; this module isn't.\n\nThe right shape depends on the question:\n\n- **A pure reducer** — `(state, action) => state`. Good when actions are discrete events and state is a single value.\n- **A state machine** — explicit states and transitions. Good when \"which actions are even legal right now\" is part of the question.\n- **A small set of pure functions** over a plain data type. Good when there's no implicit current state — just transformations.\n- **A class or module with a clear method surface** when the logic genuinely owns ongoing internal state.\n\nPick whichever shape best fits the question being asked, *not* whichever is easiest to wire to a page. Keep it pure: no DOM, no `document`, no button handlers reaching inside it. The page calls into it; nothing flows the other direction. This is what makes the prototype useful past its own lifetime: once the question's answered, the validated reducer / machine / function set lifts into the real module on its own.\n\n### 3. Build the shareable HTML file\n\nOne file, plain HTML/CSS/JS — no framework, no bundler, no server, everything inline so it opens by double-click and survives being emailed around. Anyone should be able to run it by opening it.\n\nWrite it for a non-developer. Every label is in **domain language**, not code — buttons and state read like the business, not the reducer. Explain in plain words what's happening.\n\nLay it out with a clean hierarchy, top to bottom:\n\n1. **Title and one-line explanation** of what this demo lets you explore (the question from step 1).\n2. **Current state** — the full relevant state, rendered as a readable panel (labelled fields, not a raw JSON dump), re-rendered after every click so the change is visible. Where it helps a non-developer follow, call out what just changed.\n3. **Free-play buttons** — one button per action, always available, so anyone can poke at the model in any order. Each click dispatches its action and re-renders the state.\n4. **Guided walkthroughs** — a set of **scenarios**, one per tab. Each tab holds a short plain-language description of the scenario — the situation it sets up and what to watch for — and underneath it, the ordered **buttons to press** for that scenario. Each step is a real button: clicking it performs that action and moves to the next step. Starting a walkthrough resets to a known initial state so the scenario runs the same way every time.\n\nChoose scenarios that demonstrate the awkward cases — the happy path, a tricky edge case, an attempt at something that should be illegal — the ones hard to reason about on paper.\n\nKeep it beautiful but restrained: clean typography, generous spacing, one accent colour. No animations, no gimmicks — nothing that competes with the state and the buttons.\n\n### 4. Hand it over\n\nSend them the file, or open it for them. They'll click through the walkthroughs and free-play whenever they get to it; the interesting moments are when they say \"wait, that shouldn't be possible\" or \"huh, I assumed X would be different\" — those are the bugs in the _idea_, which is the whole point. If they want new actions or a new scenario, add them. Prototypes evolve.\n\n### 5. Capture the answer and the prototype\n\nOnce the prototype has answered its question, capture the answer, then capture the prototype the way the [SKILL](SKILL.md) describes. The logic-specific mapping: the validated reducer / machine / function set lifts into the real module (the decision, absorbed); the HTML shell rides along to the throwaway branch that keeps the prototype as a primary source — and being one self-contained file, it stays trivially re-runnable there.\n\n## Anti-patterns\n\n- **Don't add tests.** A prototype that needs tests is no longer a prototype.\n- **Don't wire it to the real database.** Use in-memory state unless the question is specifically about persistence.\n- **Don't generalise.** No \"what if we wanted to support X later.\" The prototype answers one question.\n- **Don't blur the logic and the page together.** If the pure module references the DOM, `document`, or button handlers, it's no longer liftable. Keep the page as a thin shell over a pure module.\n- **Don't reach for a framework, bundler, or server.** One file the recipient double-clicks; a React app or a dev server defeats \"shareable\".\n- **Don't ship the HTML shell into production.** The page is optimised for being clicked through by hand. The logic module behind it is the bit worth keeping.\n",
  "exitCode": 0
}
```

## Assistant

That changes the cut materially: cold-start should not be the live-demo spine, but it also cannot be relegated to “after the proof.” I’m treating it as a contingency capability with its own slower quality oracle, sharing the same semantic and controller machinery as the bounded demo path.

**Tool Use:** `shell_command`

```json
{
  "command": "rg --files docs/planning/process-model-elicitation/baseline | sort; printf '%s\\n' '--- baseline summaries'; rg -n '^#|baseline|Claude|prompt|score|verdict|finding|comparison|coverage|quality' docs/planning/process-model-elicitation/baseline --glob '*.md' | head -240",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "rg -n \"Production Scheduling|cold.chain|use case|scenario|situation|baseline\" docs/planning/process-model-elicitation docs/reference --glob '*.md' | head -240",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

## User

**Tool Result:** `TU-034Cg01qJ5oV2sSHOLsV1Z`

```
{
  "output": "docs/planning/process-model-elicitation/baseline/opening-message.md\ndocs/planning/process-model-elicitation/baseline/protocol.md\ndocs/planning/process-model-elicitation/baseline/readout.md\ndocs/planning/process-model-elicitation/baseline/run.ts\ndocs/planning/process-model-elicitation/baseline/situation-pack.md\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1-model.txt\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.raw.json\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2-model.txt\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.raw.json\ndocs/planning/process-model-elicitation/baseline/v0-prompt.md\n--- baseline summaries\ndocs/planning/process-model-elicitation/baseline/protocol.md:1:# Baseline control — experiment protocol (FE-1361)\ndocs/planning/process-model-elicitation/baseline/protocol.md:3:What does one-shot / lightly-prompted AI elicitation already achieve? Two conditions of the\ndocs/planning/process-model-elicitation/baseline/protocol.md:7:## Conditions\ndocs/planning/process-model-elicitation/baseline/protocol.md:9:| #   | Interviewer     | System prompt                | Approximates                                                                                                                                           |\ndocs/planning/process-model-elicitation/baseline/protocol.md:11:| 1   | `claude-opus-5` | none                         | the incumbent: a strong model told to interview-then-build (the Petrinaut assistant's prompt already mandates interview-first, per the FE-1358 survey) |\ndocs/planning/process-model-elicitation/baseline/protocol.md:12:| 2   | `claude-opus-5` | [v0-prompt.md](v0-prompt.md) | the degenerate plugin: the seven-category elicitation surface as pure guidance, no machinery                                                           |\ndocs/planning/process-model-elicitation/baseline/protocol.md:15:([opening-message.md](opening-message.md)); the v0 system prompt is the only difference, so\ndocs/planning/process-model-elicitation/baseline/protocol.md:18:## Subject and interviewee\ndocs/planning/process-model-elicitation/baseline/protocol.md:21:reference model — FE-1363 retained it as the flat-baseline testbed). The interviewee is a\ndocs/planning/process-model-elicitation/baseline/protocol.md:30:## Mechanics ([run.ts](run.ts))\ndocs/planning/process-model-elicitation/baseline/protocol.md:33:  situation pack; the expert never sees the v0 prompt.\ndocs/planning/process-model-elicitation/baseline/protocol.md:41:  at 24. Delivering only at the forced wrap is itself a stopping-discipline finding.\ndocs/planning/process-model-elicitation/baseline/protocol.md:42:- The interviewer keeps the model's default adaptive thinking (part of \"vanilla Claude\"); the\ndocs/planning/process-model-elicitation/baseline/protocol.md:51:`turbo run baseline:run --filter '@hashintel/brunch-agent' -- 1` /\ndocs/planning/process-model-elicitation/baseline/protocol.md:52:`turbo run baseline:run --filter '@hashintel/brunch-agent' -- 2` (needs `ANTHROPIC_API_KEY`).\ndocs/planning/process-model-elicitation/baseline/protocol.md:55:## Instruments (scored in the read-out)\ndocs/planning/process-model-elicitation/baseline/protocol.md:60:   scored per LLMREI practice: Question Formulation, Question Omission, Order of Interview,\ndocs/planning/process-model-elicitation/baseline/protocol.md:63:2. **Seven-category surface coverage**: per category — asked? probed past the first answer?\ndocs/planning/process-model-elicitation/baseline/protocol.md:75:## Threats to validity (acknowledged)\ndocs/planning/process-model-elicitation/baseline/protocol.md:80:  would inflate coverage in both conditions equally, but absolute coverage numbers should not\ndocs/planning/process-model-elicitation/baseline/protocol.md:82:- The v0 prompt was written by the same team that will score the transcripts. The mistake\ndocs/planning/process-model-elicitation/baseline/protocol.md:85:  (different provider/model, no tools). The FE-1358 survey's prompt excerpt is the bridge; the\ndocs/planning/process-model-elicitation/baseline/v0-prompt.md:1:# v0 elicitation prompt (condition 2 system prompt)\ndocs/planning/process-model-elicitation/baseline/v0-prompt.md:15:## The elicitation surface\ndocs/planning/process-model-elicitation/baseline/v0-prompt.md:33:   entity (age, quality, setup state). Ask what distinctions matter — two items are \"the same\"\ndocs/planning/process-model-elicitation/baseline/v0-prompt.md:45:   compatibilities, regulatory and quality rules. Then ask separately for the unwritten ones:\ndocs/planning/process-model-elicitation/baseline/v0-prompt.md:51:## How to interview\ndocs/planning/process-model-elicitation/baseline/v0-prompt.md:76:## The deliverable\ndocs/planning/process-model-elicitation/baseline/situation-pack.md:1:# Situation pack — Vestera Coatings (baseline control, FE-1361)\ndocs/planning/process-model-elicitation/baseline/situation-pack.md:3:**Private to the simulated interviewee.** This file is the system prompt for the agent playing\ndocs/planning/process-model-elicitation/baseline/situation-pack.md:4:the user in the baseline-control interviews. It is authored from the operational prose of the\ndocs/planning/process-model-elicitation/baseline/situation-pack.md:9:## Role instructions\ndocs/planning/process-model-elicitation/baseline/situation-pack.md:19:   a real person naturally would. Never enumerate your knowledge unprompted.\ndocs/planning/process-model-elicitation/baseline/situation-pack.md:44:## Who you are\ndocs/planning/process-model-elicitation/baseline/situation-pack.md:53:## What you want (surfaces only if asked about goals / what the model should answer)\ndocs/planning/process-model-elicitation/baseline/situation-pack.md:65:## The plant, as you'd describe it\ndocs/planning/process-model-elicitation/baseline/situation-pack.md:85:  Worse after the big washdowns. _(doesn't know)_ exact scrap per changeover type; quality\ndocs/planning/process-model-elicitation/baseline/situation-pack.md:109:## The demand side\ndocs/planning/process-model-elicitation/baseline/situation-pack.md:131:## Things you plainly don't know (say so if asked)\ndocs/planning/process-model-elicitation/baseline/opening-message.md:1:# Opening message (shared by both conditions)\ndocs/planning/process-model-elicitation/baseline/opening-message.md:4:difference between condition 1 and condition 2 is the presence of the v0 system prompt.\ndocs/planning/process-model-elicitation/baseline/readout.md:1:# Baseline control — read-out (FE-1361)\ndocs/planning/process-model-elicitation/baseline/readout.md:8:## Headline findings\ndocs/planning/process-model-elicitation/baseline/readout.md:10:**1. The baseline is far stronger than the positioning assumed.** Bare Claude — no system\ndocs/planning/process-model-elicitation/baseline/readout.md:11:prompt at all — opened objectives-first, walked the process end to end, probed retractions and\ndocs/planning/process-model-elicitation/baseline/readout.md:14:using the model politically before validation, and delivered its model with an unprompted\ndocs/planning/process-model-elicitation/baseline/readout.md:18:Bano instrument scores as better than the human novices the taxonomy was built from. Any\ndocs/planning/process-model-elicitation/baseline/readout.md:20:the frontier model already works upstream unprompted. The differentiation argument must rest\ndocs/planning/process-model-elicitation/baseline/readout.md:34:data-pull specs and scenario probes. ReqElicitGym's finding (\"models overwhelmingly lack\ndocs/planning/process-model-elicitation/baseline/readout.md:38:**3. The v0 prompt buys real, specific improvements** — see the 1→2 delta below — but not the\ndocs/planning/process-model-elicitation/baseline/readout.md:40:materialize, because bare Claude already keeps a register. What guidance actually bought:\ndocs/planning/process-model-elicitation/baseline/readout.md:45:silent hardening of vague statements into \"confirmed\" constants, coverage blind spots\ndocs/planning/process-model-elicitation/baseline/readout.md:48:is a thing a prompt cannot fix and the harness/plugin design claims to. That is the\ndocs/planning/process-model-elicitation/baseline/readout.md:51:## Bano questionnaire scores\ndocs/planning/process-model-elicitation/baseline/readout.md:55:scoring notes; the table gives the scores.\ndocs/planning/process-model-elicitation/baseline/readout.md:88:Both conditions score dramatically better than Bano's student cohorts (where e.g. 19/28\ndocs/planning/process-model-elicitation/baseline/readout.md:89:groups failed to summarize and 16/28 built no rapport) and in line with LLMREI's finding that\ndocs/planning/process-model-elicitation/baseline/readout.md:97:relevant questions\" is the one item where condition 2 scored _worse_ (3 vs 2): it never asked\ndocs/planning/process-model-elicitation/baseline/readout.md:98:about ramp scrap, maintenance, margins, or minimum run sizes — see the coverage blind-spot\ndocs/planning/process-model-elicitation/baseline/readout.md:99:finding.\ndocs/planning/process-model-elicitation/baseline/readout.md:101:## Seven-category surface coverage\ndocs/planning/process-model-elicitation/baseline/readout.md:105:| Objectives & questions-to-answer | yes / yes / yes — but penalty weights never pursued numerically; design sidesteps via KPI-vector comparison                                                                          | yes / yes / yes — weights co-constructed from betting questions, fitted ratio flagged as fitted                                                                    |\ndocs/planning/process-model-elicitation/baseline/readout.md:113:## Excavation against the situation pack's tiers\ndocs/planning/process-model-elicitation/baseline/readout.md:136:coverage is materially luck — which is itself the argument for harness-computed completion\ndocs/planning/process-model-elicitation/baseline/readout.md:139:## Silent-assumption audit\ndocs/planning/process-model-elicitation/baseline/readout.md:141:Both conditions produced explicit assumption registers — bare Claude unprompted (15\ndocs/planning/process-model-elicitation/baseline/readout.md:161:harness-computed coverage are for.\ndocs/planning/process-model-elicitation/baseline/readout.md:163:## Output artifacts\ndocs/planning/process-model-elicitation/baseline/readout.md:187:## The 1→2 delta — what pack content alone buys\ndocs/planning/process-model-elicitation/baseline/readout.md:204:6. **Ledger quality** (not existence): per-entry source attribution, load-bearing flags,\ndocs/planning/process-model-elicitation/baseline/readout.md:207:What the delta was expected to include but didn't: register existence (bare Claude already\ndocs/planning/process-model-elicitation/baseline/readout.md:209:refusing invention (both refuse — neither offered the incumbent prompt's \"make it up\" escape\ndocs/planning/process-model-elicitation/baseline/readout.md:212:## Residual gaps in condition 2 — the evidence-derived plugin requirements\ndocs/planning/process-model-elicitation/baseline/readout.md:231:5. **Computed coverage.** The ramp-scrap hole was invisible to C2's own gap accounting —\ndocs/planning/process-model-elicitation/baseline/readout.md:241:## Notes on the instrument itself (for reruns and condition 3)\ndocs/planning/process-model-elicitation/baseline/readout.md:254:  scores in particular are one judge's reading. Fine for design evidence; don't quote them\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:1:# Baseline control — condition 1 (bare)\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:4:- Interviewer: claude-opus-5 (no system prompt)\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:35:## 1. What are you trying to learn from it?\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:41:## 2. The process route\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:48:## 3. Equipment\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:55:## 4. Batches and time\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:62:## 5. Changeovers — probably the crux\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:69:## 6. QC and rework\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:75:## 7. Demand and disruption\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:82:## 8. Scoring the schedule\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:86:3. How do you actually sequence today — a spreadsheet, a rule of thumb, gut feel? I'd like the model to be able to reproduce your current approach as a baseline, so you can compare alternatives against it.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:98:## 1. What I want to know\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:110:## 2 & 3. Process and equipment — quick corrections\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:118:## 5. Changeovers — since you want detail here\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:124:## 6. Quality — correction to your model\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:126:No mid-process sample-adjust-retest loop. What happens is: batch finishes fill & pack, then sits in QA hold — about four hours typically, specialty can be a day. Lab's two people, backs up end of week. I don't have first-pass-yield numbers off the top of my head; I don't think we track it that granularly, quality just reports scrap as a monthly percentage across the board.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:130:## 8. Scoring and how I do it today\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:136:Today I sequence off a spreadsheet — I map the week's demand book onto the three lines, rough rate per product per line, add changeover by feel, and I re-juggle it out loud at the 07:30 huddle most mornings. That sheet is the baseline you should try to reproduce first, honestly — if your model can't match what the sheet does, I won't trust what it says about doing better.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:150:## Flag 1: your Q1 isn't a simulation question, quite\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:158:## Flag 2: I can't settle the Line 1 tank argument, and neither can the model\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:169:## Flag 3: the numbers you don't have\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:171:You flagged three: first-pass yield, ramp scrap per changeover type, and quality only reporting monthly scrap in aggregate.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:181:## What I actually need\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:201:**One validation question:** should the baseline match _the sheet's plan_, or _what actually happened_? They differ, and the gap is usually your improvising at the huddle. I'd rather match actuals — that's what makes it credible to your boss — but I'd use the sheet for the sequencing logic.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:253:## Three things your answers changed\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:263:## The model\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:267:### Colour sets\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:278:### Places\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:284:### Transitions\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:300:### Changeover matrix (minutes, techs in brackets)\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:314:### Policy layer — the part you'll actually tune\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:316:The baseline reproduces you:\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:327:### KPIs\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:333:## Assumptions register — all UNVALIDATED\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:351:## What I still need\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:367:## PNML\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:371:Send the shift pattern and I'll start wiring the baseline against your ERP export. First thing I'll report is whether the model can reproduce your actual weekly output per line — if it can't, that's the finding, and we fix the model before it tells you anything about Tuesdays.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:387:Go ahead and wire the baseline against the ERP export once you've got it, and I'll chase the shift confirmation on Line 3 overtime frequency if you need it — right now \"rare\" is genuinely the best I've got, I don't have a count.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:397:## The headline question, which I should have asked two turns ago\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:407:## The tech-hour budget\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:430:## The 11:00 problem, and what it does to Meridian\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:446:## Your Q2 changes shape\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:456:## KPI definition, tightened before your boss sees it\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:470:## Model updates\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:476:Line 3 overtime: don't go counting it. Treat as zero in baseline and use it as a **lever** — \"what is it worth to approve Line 3 overtime twice a week?\" is a better question than \"how often does it happen,\" and it takes work off you.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:482:## Standing asks\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:490:I'll wire the baseline the day the ERP export lands. First report is whether the model reproduces your actual weekly output per line, before it says anything about Tuesdays.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:520:## What the day actually looks like now\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:535:**A new rule falls out of that:** don't commit a morning family switch unless there's enough work in that family to fill through 22:00. Switch Line 2 to white at 09:00 with four hours of white orders behind it and you get four good hours and then a dead line until morning — you've spent a 3-hour wash _and_ stranded the evening. Call it the fill-the-shift rule; I'll add it as a policy variant and test it against the baseline.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:539:## Capacity or timing? — the question your ops director's answer hangs on\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:545:That's a hypothesis, not a finding — it could equally be that the mix is big-wash-heavy and eight _is_ the ceiling in practice. But it's exactly what the tick sheet will settle, and it's the difference between \"we need another head\" and \"we need the existing heads at different hours.\" Worth knowing which before the conversation, not during.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:551:## One fix to the measurement design\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:564:## Model updates\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:569:- **Policy variants to race:** baseline (you) / fill-the-shift rule / time-of-day wait-rule / tech shift 06:00–14:00 vs 10:00–18:00 vs split / Line 3 overtime as a purchasable lever.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:575:## Where this stands\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:581:**From me, on ERP arrival:** baseline wired and the reproduction check — actual weekly output per line, and roughly eight family switches a week. If it can't hit those, that's the finding and I fix the model before it says anything about Tuesdays.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:621:**When the export lands** I'll wire the baseline and run the reproduction check first — weekly output per line, and the switch count. If it misses, that's the interesting result and I'll come back with what the model thinks is happening versus what your ERP says happened. That's normal, not a setback; the gap is usually where an assumption is wrong, and we have eleven of those on the register waiting to be caught.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:643:One thing not worth waiting a fortnight for: if the tick sheet shows an operator doing a family switch in week one, send it straight over. That single row would retire a hard guard in the model and change what the baseline predicts, so I'd rather rework early than build two weeks on it.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:836:# Coatings Plant Scheduling Model — v1.0\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:844:# PAGE ONE — ASSUMPTIONS REGISTER\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:846:## A. Confirmed by you in interview\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:866:## B. UNVALIDATED — my assumptions, not your statements\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:887:**A19 is the one to watch.** A single contrary row retires a hard guard and changes what the baseline predicts. Send it the same day it appears.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:889:## C. What this model cannot do\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:897:# 1. Scope and resolution\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:911:# 2. Colour sets\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:926:# 3. Places\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:928:### 3.1 Shared\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:945:### 3.2 Per line L ∈ {1,2,3}\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:962:# 4. Transitions\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:964:## 4.1 Calendar subnet (drives everything)\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:976:## 4.2 Production\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:987:## 4.3 Changeover — the detailed part\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:997:### Changeover matrix\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:1010:### Latest feasible start (derived from C4 + C8)\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:1021:## 4.4 Failure and QA\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:1033:# 5. Policy layer\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:1037:## 5.1 Baseline — reproduces you\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:1050:## 5.2 Variants to race against it\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:1066:# 6. KPIs\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:1068:## 6.1 Service (primary)\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:1077:## 6.2 Changeover — reported as three separate numbers\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:1093:## 6.3 Secondary\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:1099:# 7. How to use it\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:1101:## 7.1 Run this first — the reproduction check\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:1112:**If it misses, that is the finding.** The gap points at a register row and we fix the model before it says anything about Tuesdays.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:1114:## 7.2 Then, in order\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:1121:## 7.3 The Line 1 tank inversion — after the stopwatch, not before\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:1132:# 8. Parameter file\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:1137:# === lines.csv ===\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:1143:# === skus.csv ===\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:1150:# === rates.csv ===   units/hr, PLACEHOLDER = A14\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:1153:# === changeover.csv ===\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:1166:# === ramp_scrap.csv ===   A5 — swept, not asserted\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:1173:# === resources.csv ===\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:1178:# === tiers.csv ===\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:1187:# 9. PNML\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:1291:          <lever>count = 2 (baseline) | 3 (third-tech arm)</lever>\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:1607:# 10. Building Lines 2 and 3\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:1623:# 11. What happens next\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:1635:# 12. Two lines that don't depend on any of this\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:1:# Baseline control — condition 2 (v0 prompt)\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:4:- Interviewer: claude-opus-5 + v0-prompt.md\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:64:2. **Meridian.** Roughly what share of your volume and of your order count is Meridian? Is _every_ Meridian order phone-call-worthy, or is it specific products/sites? And when you say \"risk Meridian\" — is the risk lateness, or is it something else (quality, a specific short lead time, an audit)?\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:80:2. **Meridian.** They're maybe a third of our volume by units — almost all base whites, a couple of tint SKUs too. Order count is smaller than that, they order in bigger batches than most. Not every single Meridian order gets a call — it's specifically anything that's going to miss the ship window, doesn't matter which SKU. The risk is purely lateness — they've got a vendor scorecard and a fine schedule, and if you're late enough often enough they start pulling shelf space. It's not a quality thing for them, it's a contract thing.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:116:**11. Coastal instead.** Yeah, this changes things. Coastal's not on a scorecard, they're not going to fine us. If it's their whole week's order I'd still care — a full week's requirement matters even for a small account, because if I blow it I've got nowhere to slot them next week either. But I'd take the tint job even at six hours late for Coastal, honestly, as long as six hours doesn't turn into \"we missed by two days.\" Somewhere around a day late is where I'd start to feel bad about it. So there really are two different curves in my head — Meridian's is a cliff, everyone else's is a slope.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:124:That's not blunter than an exchange rate — it's _more_ informative. A cliff and a slope is a perfectly implementable penalty structure, and it's a real finding: it means your policy is lexicographic (protect Meridian's window absolutely, then optimise everything else), not a weighted sum. I'll build it that way.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:157:**Ships.** Once released, warehouse pulls it for the Thursday truck. If QA release comes in Wednesday evening, it comfortably makes Thursday. If it had slipped — say the filler jam had been two hours instead of twenty minutes, or QA had a backlog — Thursday morning becomes tight, and that's the point where I'd be making calls, maybe asking QA to prioritize the pallet, maybe finding out if there's a later truck.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:171:3. **The three lines.** What can each run, and what can't it? You said Meridian white \"always goes Line 2, no debate\" — is that a hard qualification (Line 1 physically can't), a quality rule, or just habit? And what makes Line 3 different besides day-shift-only?\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:186:- **Line 3** is newest and quick, but it's product-by-product qualified — there's a list, and I know two tint SKUs specifically aren't on it yet, someone in quality is slowly working through validating it for more. Day-shift-only is a separate constraint on top — that one's a staffing/overtime decision, not a capability one.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:323:- One row per order line: order ID, account, SKU, family if it's a field, quantity, date the order entered the book, promise date (the one on-time is scored against), actual ship date, and line it ran on if that's captured.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:414:1. **Lateness scored in hours against promise date**, not days. _Assumed_ — your board is binary, but a binary metric can't distinguish your own cliff/slope answer. _Check:_ ship-date vs promise-date fields in the ERP pull.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:437:**D.** Behind by about a shift is roughly the trigger — if I can see Wednesday that a Meridian order won't make it without extra hours, I ask then. Asking Thursday or later usually doesn't help, not enough runway to get approval and staff it. I've had a case where I didn't ask even though I was tempted — a slip that would've needed Saturday overtime, but it was Coastal, not Meridian, and I judged it wasn't worth the argument with the ops director for a non-scorecard account. That one shipped a day late and nobody outside the plant noticed.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:459:**And one finding from D worth testing, which I don't think you said out loud:** you get Saturday overtime approved on Line 1 or 2 — but the lab is day-shift, weekdays. So Saturday production may just queue for Monday's lab and arrive no earlier than if it hadn't run. Unless the Saturday ask _includes_ a lab person, or the Friday-evening trap catches it anyway. Worth asking the ops director whether lab overtime has ever been part of that approval — if it hasn't, some of those four or five Saturdays this year may have bought you nothing.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:637:# A. THE MODEL\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:641:## A.0 Global switches (set these per experiment)\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:653:## A.1 Colour sets\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:693:## A.2 Places\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:738:## A.3 Transitions\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:740:### Arrivals and release\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:757:### Production stages (per line, per batch)\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:797:### Changeover\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:825:### QA\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:837:### Shipping and scoring\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:846:### Breakdowns\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:855:## A.4 Calendars (gate sub-nets)\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:866:## A.5 The policy layer — conflict resolution\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:895:## A.6 Scoring\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:917:## A.7 Experiments mapped to your three questions\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:930:# B. ASSUMPTION LEDGER\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:934:### From the interview, provisionally agreed\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:936:1. **Lateness scored in hours vs promise date.** Your board is binary but binary can't express your own cliff/slope. _Check:_ ship-date vs promise-date in the ERP pull.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:953:# B. ASSUMPTION LEDGER\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:957:### Objectives and scoring\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:959:1. **Lateness scored in hours against promise date**, not days. Your board is binary, but a binary metric cannot express the cliff/slope you described. _Check:_ promise-date vs actual-ship-date fields in the ERP pull.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:967:### Structure and taxonomy\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:973:5. **Line 3's unqualified list = 2 tint SKUs.** Your number, but I picked _which_ two. _Check:_ the quality validation list.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:977:### Durations\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:989:### Policies\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:998:### Boundary conditions\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:1011:# C. WHAT THE MODEL DELIBERATELY LEAVES OUT\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:1017:2. **The unwritten rules.** We never covered week-one mistakes, always/nevers, or rules that exist because of one bad incident. In my experience this category produces two or three constraints that invalidate otherwise-attractive schedules — the model will likely propose something that makes you say \"we'd never do that,\" and each time it does, that's an unwritten rule surfacing. **Treat those moments as findings, not bugs**, and send them to me.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:1032:**If you do three things before the first real run, do these:** load the ERP order book (kills assumptions 31–33, the ones that can make the model lie comfortably); answer the batch-contiguity question in one sentence (unblocks your run-size question); and run `RELEASE_POLICY = STANDING_MERIDIAN` against the default (tests whether your headline dilemma is manufactured upstream of you, which is the cheapest finding available and doesn't need the data at all).\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:1046:# COATINGS PLANT SCHEDULING MODEL — FINAL DELIVERABLE\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:1052:# A. THE MODEL\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:1056:## A.0 Experiment switches\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:1068:## A.1 Colour sets\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:1084:## A.2 Places\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:1108:## A.3 Transitions\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:1110:### Arrival and release\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:1127:### Production (per line, per batch)\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:1157:### Changeover\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:1179:### QA\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:1189:### Ship, score, break\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:1201:## A.4 Calendars\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:1212:## A.5 Policy layer (every rule swappable)\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:1232:## A.6 Scoring — unit is one line-hour\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:1252:## A.7 Experiments → your three questions\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:1265:# B. ASSUMPTION LEDGER\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:1279:**Structure** 8. Four stages, identical topology on all three lines (you walked me through L2 only). 9. **Tank caps: L1 mill→fill = 1 batch, others = 2.** _Check: nameplate ÷ batch size._ 10. Vessels 1,100 / 1,650 / 1,350 — **L3 is the one you said not to quote.** _Check: 30 seconds at the vessel._ 11. 14 SKUs as 4 white / 8 tint / 2 specialty, tint depths assigned arbitrarily. _Check: SKU master — also tells me which tints are dark._ 12. L3's two unqualified tint SKUs — your count, my choice of which. _Check: quality's validation list._ 13. **Specialty on L1 only. I never asked whether L3 can run specialty — if it can, the mill-motor answer changes materially.** 14. Meridian ⇒ L2 is absolute, no emergency override. _Check: has it ever been broken?_\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:1289:# C. WHAT THE MODEL LEAVES OUT\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:1295:2. **The unwritten rules.** Never covered. Expect the model to propose schedules that make you say \"we'd never do that.\" **Treat each of those as a finding, not a bug** — that's an unwritten rule surfacing.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:1314:3. **Run `RELEASE_POLICY = STANDING_MERIDIAN` against the default** — tests whether your headline dilemma is manufactured upstream of you. It's the cheapest finding available and needs no data at all.\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-034Cg01rBYBbLv96l18gJv`

```
{
  "output": "is ready pack content for FE-1403; the baseline did not test it directly (neither condition ran an incident timeline), which makes it one of the untested imports.\ndocs/planning/process-model-elicitation/notes/research-patterns-audit.md:21:**The ACTA knowledge audit.** Applied Cognitive Task Analysis, from Militello and Hutton — a deliberately simplified cognitive task analysis for practitioners, built as a sequence: task diagram, then knowledge audit, then simulation interview. The knowledge audit is eight probes designed to surface knowledge experts have but never volunteer: past-and-future (seeing where a situation came from and is heading), the big picture, noticing what others miss, tricks of the trade, improvising, self-monitoring, anomalies (\"can you remember a time you knew something was amiss?\"), and information difficulties (\"when did the data point one way and your judgment another?\"). Two details carry as much value as the probes. First, a universal follow-up after every answer: \"how would you know this? what cues are you relying on? how would this be hard for someone less experienced?\" — the expert–novice contrast used routinely as a cue extractor. Second, probe 8 is, for this project, a data-binding question in disguise: it surfaces where the ERP or historian is systematically wrong. Evidence grade: the catalogue is verbatim from published applications; ACTA's own validation is practitioner-grade, not experimental. Ready pack content for FE-1403; untested in the baseline.\ndocs/planning/process-model-elicitation/notes/research-patterns-audit.md:25:**The question typology.** A 2021 requirements-engineering paper (Zaremba and Liaskos) assembled a cross-disciplinary typology of interview question forms — around 35 types across dimensions of time, content, form, style, and probing style. The effort imported it less as a taxonomy than as a phrasebook. The individually valuable moves: the **consistency probe** (\"you said earlier that X, but then you told me Y — how do you explain that?\"), which an LLM is unusually well placed to execute because it holds the whole transcript; the **clearinghouse probe** (\"what have I not asked that is important?\"), used as a closing ritual before any completion claim; the **negative balance question** (\"you seem very efficient — do you remember occasions when problems slowed you down?\"), built to counteract the tendency to describe the idealized version of the work; and the teachback family (restating an interpretation for confirmation). The typology also names the anti-patterns — leading probes, forced choices — for the do-not-do list. All of this is pack-card material; the baseline showed the bare model already does consistency probing and teachback unprompted, so FE-1403's redundancy verdicts will likely retire some of these.\ndocs/planning/process-model-elicitation/notes/research-patterns-audit.md:27:**Laddering, card sorting, and triadic elicitation.** The knowledge-engineering toolkit for eliciting taxonomies — the \"what kinds of things are there, and what distinctions matter\" questions. Laddering here means the laddered grid: move down (\"can you give examples of X?\"), across (\"what alternatives to X are there?\"), and up (\"what do these have in common?\") through the domain's class structure, plus two quietly powerful probes — \"how can you tell it is X?\" (which elicits the operational recognition criteria nobody wrote down) and \"what is the key difference between X and Y?\" (which turns a flat list into a typed taxonomy). One correction the research pass made: this is _not_ the \"why is that important?\" laddering from consumer research — the two traditions share a name and nothing else. Triadic elicitation (from Kelly's repertory-grid tradition) presents three items and asks how two are alike and one differs, surfacing the attributes an expert uses without naming them. In this effort these feed the taxonomy card in FE-1403 and ground the CPS `entity-type` kind's interview strategy. Untested in the baseline.\ndocs/planning/process-model-elicitation/notes/research-patterns-audit.md:29:**Work-as-imagined versus work-as-done.** The framing for unwritten rules, from resilience engineering (Hollnagel): what procedures say happens differs systematically from what happens, and the gap is normal, not deviant — people trade thoroughness for efficiency as a matter of course. The practical consequence is a reframing of the question: not \"what are the undocumented rules?\" (which invites denial) but \"where does the written procedure not survive contact with the day?\" (which invites description). The same distinction arrives independently from two other imported directions: the say–do problem in requirements engineering (\"people know how to do many things that they cannot describe… don't believe the answers\"), and process mining's de jure versus de facto models (below). Three fields converging on one distinction is the strongest kind of confirmation this review found. In this effort it became the `prescribed | practiced` source-regime attribute in the IR — the design decision that there is one model with a regime tag, never two parallel models, and that a prescribed/practiced divergence is recorded as an ordinary conflict issue, because such divergences are elicitation gold. The baseline validated the underlying premise: both conditions surfaced real unwritten rules (the tint veto, the lateness hierarchy) only under deliberately-shaped probes.\ndocs/planning/process-model-elicitation/notes/research-patterns-audit.md:31:**Anchored hypotheticals, and hypothetical bias.** Can you ask an expert \"what would happen if…\"? The literature splits usefully. CDM endorses hypotheticals — but always anchored to a real incident already narrated, varying a case rather than inventing one. The stated-preference literature supplies the warning for the free-floating kind: when people answer about imagined situations, they systematically overstate (a meta-analysis found hypothetical answers exceeding real ones by a median factor of 1.35, with severe skew). The mechanism transfers to elicitation: an unanchored \"what would you do if\" returns the expert's _policy_ — the idealized self — rather than their practice, fluently and confidently, which makes it hard to detect. The mitigations: anchor to a narrated incident first, and ask what the expert would be _looking at_ rather than what they would decide. In this effort: the scenario-probe style the v0 prompt prescribes for conflict points (\"two lines need the crew at the same moment — what actually happens?\"), and a precondition attached to the hypothetical-escalation card in FE-1403.\ndocs/planning/process-model-elicitation/notes/research-patterns-audit.md:33:**Value-focused devices for objectives and weights.** Penalty weights and trade-off rates are almost never written down and cannot be asked for directly (\"what weight would you give lateness?\" produces noise). The imported toolkit is Keeney's: ask for a wish list with constraints removed, name a particularly good and particularly bad outcome and what makes each so, enumerate shortcomings of the status quo, ask what other stakeholders would want. For the weights themselves, swing weighting: have the expert compare the swing from worst to best on each attribute rather than state a number. One honest note on provenance: the baseline's standout weight excavation — condition 2's betting-framed questions that produced \"Meridian's penalty is a cliff, everyone else's is a slope\" — used a device (willingness-to-bet framing) that none of the imported sources prescribe and the v0 prompt never mentions. The model improvised it. It has a respectable ancestry in probability elicitation, but as pack content it is currently uncredited folklore; FE-1403 should either adopt it deliberately or note it as model disposition.\ndocs/planning/process-model-elicitation/notes/research-patterns-audit.md:37:**The quantile protocol, and the case against min/mode/max.** The flagship quantitative finding. Simulation practice commonly elicits a minimum, most-likely, and maximum for a duration and fits a triangular distribution to them. A published comparison against measured data (emergency-department length of stay) found this habit overstated the true mean by about 69 percent — while a distribution that read the same expert's middle value as a _mean_ rather than a mode landed within 1 percent. Two mechanisms: experts' stated middle values behave like means, not modes, and a triangular distribution structurally cannot represent the long right tail real service times have. The prescription: elicit quantiles instead — \"typical?\", \"one time in ten, worse than?\", \"one time in ten, better than?\" — and never fit a triangular to a volunteered three-point estimate. Evidence grade: the 69%/1% contrast is a single conference study in one domain; the quantile prescription itself is independently the settled format of the whole structured-expert-judgment field (the TU Delft studies, EFSA guidance), so the practice rests on more than the headline number. In this effort: v0 prompt category 4, the IR's quantity attribute (\"quantile-elicited, never min/mode/max\"), and the baseline's cleanest technique delta — condition 1 fell into exactly the warned-against triangular; condition 2 executed quantiles throughout. This entry also supplies the citation the IR document currently lacks for its prohibition.\ndocs/planning/process-model-elicitation/notes/research-patterns-audit.md:39:**The IDEA four-step question.** The most transplantable script in the structured-judgment literature, from research on reducing expert overconfidence (Speirs-Bridge et al.): ask for the lowest plausible value, then the highest, then the best guess, then \"how confident are you that your interval captures the true value — give a number between 50 and 100 percent.\" The order matters: interval before best guess, because leading with the best guess anchors the interval too narrow. The confidence step lets intervals be standardized across experts afterward. Evidence grade: solid — the format measurably widens intervals toward honesty. In this effort the v0 prompt adopted the quantile idea but _not_ the IDEA script: its \"typical, then one-in-ten\" phrasing leads with the central value and drops the calibration step. That simplification worked in the baseline, but the divergence between what the docs call \"the quantile/IDEA protocol\" and what the prompt actually says should be resolved deliberately when FE-1403 writes the card.\ndocs/planning/process-model-elicitation/notes/research-patterns-audit.md:41:**The clairvoyant test.** Ron Howard's discipline from decision analysis: a quantity is well-defined only if a clairvoyant — someone with perfect knowledge but exercising no judgment — could answer it. \"Cycle time\" fails until you say what's in and out of it (does it include setup?). Cheap and constantly applicable: much apparent disagreement between experts is definitional, not factual, and the test separates the two. In this effort: the definitions-first rule in the outside-the-net checklist, and the prescribed first move when two sources conflict. Untested in the baseline.\ndocs/planning/process-model-elicitation/notes/research-patterns-audit.md:43:**Handling expert disagreement, and Cooke's classical model.** When experts disagree, the literature's recommendation cuts against instinct: do not seek consensus, and above all do not average silently, because averaging manufactures false certainty and destroys the most valuable signal in the interview. Two formal traditions exist — behavioral aggregation (facilitate toward what a rational impartial observer would believe) and mathematical aggregation (Cooke's classical model: score experts on seed questions with known answers, then weight them by calibration). The empirical record favors performance weighting decisively, but the method needs prepared seed variables, so it is not available to a live interviewer. What the effort imports instead is the format (quantiles) and the discipline (preserve disagreement as a first-class contested fact, with both positions and both reasonings recorded). In the IR this is why conflicts become typed issues rather than merged values, and why resolution requires an explicit user-cited record. The baseline touched this only lightly (condition 1 refused to arbitrate a within-pack dispute and designed a measurement to settle it — exemplary behavior, already dispositional).\ndocs/planning/process-model-elicitation/notes/research-patterns-audit.md:51:**Motifs as obligations, and the exception sweep.** The usable core of the catalogue idea: each motif carries obligatory questions. A buffer obliges capacity and full-behavior (block, spill, or divert); a resource pool obliges size, claim discipline, and a contention rule; failure/repair obliges a trigger type, a repair-time distribution, and a repair resource. The workflow exception-patterns study adds a ready sweep: for each of five exception types (work-item failure, deadline expiry, resource unavailability, external trigger, constraint violation), ask what happens to the work item, to the case, and what recovery runs — with the empirical note that tooling almost universally ignores resource-unavailability exceptions, so elicitation must ask explicitly. Pack content for FE-1403; the ramp-scrap miss in the baseline is exactly the class of hole an obligation sweep exists to catch.\ndocs/planning/process-model-elicitation/notes/research-patterns-audit.md:53:**Soundness as cross-examination.** The most implementable finding in the review: the formalism generates its own interview questions. Workflow-net soundness — every reachable state can still reach completion, completion is clean, no transition is dead — converts mechanically into questions (\"you described this step but nothing can trigger it; when does it actually happen?\"). A shared input place _forces_ the contention question; token conservation asks for the invariants; Robinson's factor-versus-response distinction mechanically detects a mis-scoped quantity (throughput offered as an input). None of this requires interviewing skill — the structure obliges the questions — which is precisely the differentiation-by-machinery argument. In this effort this is ProjectionPack territory (`validate` plus issue generation) and the readout's finding 6 in reverse: both baseline artifacts contained structural bugs that no soundness check existed to catch.\ndocs/planning/process-model-elicitation/notes/research-patterns-audit.md:57:**The four cognitive stopping rules.** From requirements-engineering research on when analysts actually stop eliciting (Pitts and Browne): two judgment rules (stop when belief in sufficiency crosses a threshold; stop when the latest information adds too little) and two representation rules (stop when a mental checklist is exhausted; stop when your internal model of the problem stops changing). The empirical finding: analysts stop too soon — in one study, professional analysts captured 57 percent of available requirement categories before stopping — and the rule an LLM naturally implements (stop when the representation stabilizes) is one of the two associated with premature stopping. The imported counter-measure: make stopping criterion-based (the category set plus the questions table), never stability-based, and fire the clearinghouse probe before closing. The baseline extended this finding in a direction the literature had not documented: at the frontier, the failure inverts from stopping too soon to being _unable to stop at all_ — condition 1's pleasantry loop and condition 2's phantom second session are new entries for the stopping-failure catalogue, not instances of the documented one.\ndocs/planning/process-model-elicitation/notes/research-patterns-audit.md:59:**The assumptions document and the structured walkthrough.** From Law's simulation-practice tutorials: the output of the information-gathering phase is an _assumptions document_ — not a model — and its acceptance test is social: project it and walk it bullet by bullet with the experts, because pre-circulating for silent reading demonstrably does not produce the collective challenge that catches errors. Robinson adds the load-bearing distinction between assumptions (limited knowledge — an elicitation backlog) and simplifications (deliberate abstraction — design decisions to defend), which have different lifecycles and must not be merged into one \"limitations\" section. Scope decisions get recorded in include/exclude/justification tables, where every exclusion carries a reason. In this effort: the walkthrough is the ancestor of the interpretation-render affordance (show the captured state, get correction), the assumptions/simplifications split maps onto epistemic status, and the include/exclude tables are candidate ProjectionPack output shapes. The baseline validated the register idea beyond expectation (both conditions kept good ones unprompted) while exposing what registers cannot do — which is the machinery argument.\ndocs/planning/process-model-elicitation/notes/research-patterns-audit.md:67:**The Bano taxonomy and its questionnaire.** The effort's principal scoring instrument. Bano, Zowghi, Ferrari, Spoletini, and Donati observed 110 students in 28 role-played requirements interviews and catalogued 34 interviewer mistakes in seven categories — question formulation (vague questions was the most frequent mistake overall, in 21 of 28 groups), question omission (no probing questions: 11), interview order (no closing summary: 19; bad opening: 15), communication, analyst behaviour, customer interaction, and teamwork. The taxonomy ships with an operationalized Likert questionnaire (\"The analyst asked vague questions\", 1–5), which has become the de facto evaluation instrument for machine interviewers — LLMREI evaluated against it directly. The baseline scored both conditions with it and both dramatically outperformed the student cohorts, which produced the audit's most important instrument-level insight: the taxonomy was built from _novice human_ failures, and frontier-model failures are simply elsewhere (stopping, silent hardening, coverage blindness). The instrument still earns its keep as a floor check and as a mutation library for adversarial testing, but a frontier-elicitor failure catalogue is a genuine open gap this effort will have to fill itself. A related finding from the same research line: training fixes the mechanical mistakes (no summary, no probing) and barely touches the behavioural ones — practice, not instruction, is the active ingredient — which is an early version of the disposition/technique split the baseline landed on.\ndocs/planning/process-model-elicitation/notes/research-patterns-audit.md:69:**The LLM-interviewer studies.** Four systems shaped the baseline's design. **LLMREI** (an LLM elicitation chatbot evaluated against the Bano questionnaire) made a similar number of mistakes to human interviewers but _ended interviews too readily when users signalled impatience_ — one of the two documented stopping failures. **ReqElicitGym** (an evaluation environment with simulated users) found the opposite: models \"overwhelmingly lack effective stopping criteria\" and exhaust their turn budgets — and also that the best models elicit under a third of implicit requirements, and that effective questions arrive _late_ in dialogues. The baseline's impatience probe plus turn budget exists precisely to make both failure modes observable in one run; both reproduced, in novel forms. **Shen, Singhal and Breaux** showed that follow-up questions generated _with the mistake taxonomy in the prompt_ beat human interviewers' questions in blind preference — direct evidence that taxonomy-guided prompting works, which is the mechanism FE-1403's cards rely on. **Görer and Aydemir** found LLM-generated interview scripts lack depth — breadth is cheap, probing is the differentiator. And a fine-tuning cautionary tale from LLMREI: training on novice-interviewer transcripts failed outright, degrading the model — worth remembering whenever \"just fine-tune on transcripts\" comes up.\ndocs/planning/process-model-elicitation/notes/research-patterns-audit.md:71:**Mental models emerge late.** From a large study of AI-conducted qualitative interviews (381 interviews, with behavioural follow-up eight months later): interviewees' first responses differ systematically from their later ones, with mental models surfacing consistently late in the conversation. Three consequences the effort adopted: depth of probing is the differentiator, not breadth; question batching is suspect because it optimizes throughput on first-pass answers, the least valuable kind; and the first-response-versus-post-probe content delta is a measurable evaluation proxy that needs no ground-truth model — one of two literature-grounded candidates for the evaluation-proxy problem (the other being propositions-per-minute yield rates). The v0 prompt's compromise — batch two to four survey questions, never batch depth — is a deliberate softening of this finding, and the baseline suggests the compromise landed well (condition 2's batching read as an improvement over condition 1's opening barrage).\ndocs/planning/process-model-elicitation/notes/research-patterns-audit.md:73:**Ambiguity as a resource.** From Ferrari, Spoletini and Gnesi's interview studies: an ambiguity in the conversation is not just a defect but a trigger — each detected ambiguity marks a spot where the speaker's mental model and the listener's diverge, so each is a follow-up question waiting to be asked, and every _undetected_ one is a missed discovery. The companion work lists the linguistic cues a listening interviewer should react to: vague terms, underspecified terms, quantifiers (\"usually\", \"mostly\"), pronouns without referents, unexplained domain terms. In this effort this grounds the v0 prompt's \"probe vague quantifiers\" rule and is the design seed for clarification hints in the pack; the baseline showed the disposition already present (both conditions chased quantifiers unprompted).\ndocs/planning/process-model-elicitation/notes/research-patterns-audit.md:85:1. **\"Betting questions\" is not an import.** The baseline's standout excavation (C2's cliff/slope penalty weights) is credited to a technique no source prescribes; the v0 prompt says only \"expect to co-construct\". The method was model improvisation under prompt-directed attention — the 1→2 delta's item 5 is partly misattributed. FE-1403 should adopt the technique deliberately (decision-analysis willingness-to-bet ancestry) or reclassify it as disposition-plus-attention.\ndocs/planning/process-model-elicitation/notes/research-patterns-audit.md:89:5. **The premortem's \"~30%\" is one 1989 lab result** (student scenario experiments); Klein's operationalization carries no effect size of its own. Treat as indicative.\ndocs/planning/process-model-elicitation/research/elicitation-strategy-literature.md:59:Robinson's first framework activity is \"understand the problem situation\" **[V]**, and Law's\ndocs/planning/process-model-elicitation/research/elicitation-strategy-literature.md:86:1. understand the problem situation;\ndocs/planning/process-model-elicitation/research/elicitation-strategy-literature.md:281:| Standard scenarios   | \"Does this case fit a standard or typical scenario?\" · \"Does it fit a scenario you were trained to deal with?\"          |\ndocs/planning/process-model-elicitation/research/elicitation-strategy-literature.md:288:| Situation assessment | \"If you were asked to describe the situation to a relief officer at this point, how would you summarize the situation?\" |\ndocs/planning/process-model-elicitation/research/elicitation-strategy-literature.md:290:| Hypotheticals        | \"If a key feature of the situation had been different, what difference would it have made in your decision?\"            |\ndocs/planning/process-model-elicitation/research/elicitation-strategy-literature.md:315:| 1   | Past and future             | \"Can you remember entering a coaching situation when you knew how things got there and where they were headed?\"                       |\ndocs/planning/process-model-elicitation/research/elicitation-strategy-literature.md:317:| 3   | Noticing                    | \"Can you remember any element of a situation popping out at you that others did not notice?\"                                          |\ndocs/planning/process-model-elicitation/research/elicitation-strategy-literature.md:342:- **Incident-probe card (CDM, verbatim above)**: narrate one real incident, timeline it, then sweep per event. Prioritise _basis of choice_ (→ conflict policy), _situation assessment via handover_ (→ marking content), _options_ and _errors_ (→ guards and exception paths).\ndocs/planning/process-model-elicitation/research/elicitation-strategy-literature.md:356:on what happens when people answer about imagined situations, and it finds systematic\ndocs/planning/process-model-elicitation/research/elicitation-strategy-literature.md:602:scenarios, elaborating with instances, generating counterarguments), which outperformed a\ndocs/planning/process-model-elicitation/research/elicitation-strategy-literature.md:717:- **Comparison/contrast**: \"Can you tell me about the situation in department X…? How is it the same or different from what happens in your department?\"\ndocs/planning/process-model-elicitation/research/elicitation-strategy-literature.md:764:construct a situation where the readings predict different behaviour and ask which happens. Note\ndocs/planning/process-model-elicitation/research/elicitation-strategy-literature.md:797:the individual distributions as a width baseline, **do not show it to the experts**, and be\ndocs/planning/process-model-elicitation/research/elicitation-strategy-literature.md:812:- Where the disagreement concerns a model parameter, the honest projection is a range or a scenario pair, with the model's answer reported under both.\ndocs/planning/process-model-elicitation/research/elicitation-strategy-literature.md:858:| **Live data feed**                          | The _use_ is reactive — re-run from observed current state. A property of the use case, not the system.                                                                                         | The use is design-time or comparative.                                                                                                                                                                                                                                        |\ndocs/planning/process-model-elicitation/research/elicitation-strategy-literature.md:890:### 6.3 Which use case earns the showcase?\ndocs/planning/process-model-elicitation/research/elicitation-strategy-literature.md:906:cases will not earn dynamic colouring**, so a showcase demo needs either a purpose-chosen use case\ndocs/planning/process-model-elicitation/research/elicitation-strategy-literature.md:1008:\"vanilla LLM baseline\" has already been measured to do.\ndocs/planning/process-model-elicitation/research/elicitation-strategy-literature.md:1075:publishable experiment and it is nearly a by-product of the September demo if any use case has\ndocs/planning/process-model-elicitation/research/elicitation-strategy-literature.md:1149:_situation assessment_ handover framing elicits what the marking must record; and the\ndocs/planning/process-model-elicitation/baseline/protocol.md:21:reference model — FE-1363 retained it as the flat-baseline testbed). The interviewee is a\ndocs/planning/process-model-elicitation/baseline/protocol.md:23:defined by [situation-pack.md](situation-pack.md). The pack was authored from the use case's\ndocs/planning/process-model-elicitation/baseline/protocol.md:33:  situation pack; the expert never sees the v0 prompt.\ndocs/planning/process-model-elicitation/baseline/protocol.md:51:`turbo run baseline:run --filter '@hashintel/brunch-agent' -- 1` /\ndocs/planning/process-model-elicitation/baseline/protocol.md:52:`turbo run baseline:run --filter '@hashintel/brunch-agent' -- 2` (needs `ANTHROPIC_API_KEY`).\ndocs/planning/process-model-elicitation/baseline/protocol.md:70:   FE-1358 survey (scenario-or-dead-net, PascalCase identifiers, no timing fields, arc shape).\ndocs/planning/process-model-elicitation/baseline/v0-prompt.md:43:   scenarios (\"two lines need the crew at the same moment — what actually happens?\").\ndocs/planning/process-model-elicitation/baseline/situation-pack.md:1:# Situation pack — Vestera Coatings (baseline control, FE-1361)\ndocs/planning/process-model-elicitation/baseline/situation-pack.md:4:the user in the baseline-control interviews. It is authored from the operational prose of the\ndocs/planning/process-model-elicitation/baseline/situation-pack.md:5:Production Process Scheduling use case (Notion DB entry), **never** from any net outline or\ndocs/planning/process-model-elicitation/research/re-interviewing-literature-worker-report.md:27:- ⚠️ **Premise correction:** the familiar six-category taxonomy (traditional/group/prototyping/model-driven/cognitive/contextual) is **not** theirs — it is **Nuseibeh & Easterbrook, \"Requirements Engineering: A Roadmap,\" ICSE 2000, pp. 35–46, DOI 10.1145/336512.336523**. Zowghi & Coulin list ~20 techniques (interviews, questionnaires, task analysis, domain analysis, introspection, repertory grids, card sorting, laddering, group work, brainstorming, JAD, workshops, ethnography, observation, protocol analysis, apprenticing, prototyping, goal-based approaches, scenarios, viewpoints) and reduce them to a **core eight** (interviews, domain analysis, groupwork, ethnography, prototyping, goals, scenarios, viewpoints) in two tables: Table 2.1 maps techniques × the five activities (interviews/domain/groupwork suit all five); Table 2.2 marks each pair Complementary vs Alternative (e.g., interviews complementary with goals/scenarios/viewpoints, alternative to groupwork/ethnography/prototyping).\ndocs/planning/process-model-elicitation/research/re-interviewing-literature-worker-report.md:29:- On matching technique to situation: they cite Hickey & Davis's four reasons analysts actually choose ((a) only technique known, (b) favorite, (c) prescribed by methodology, (d) intuition), and close: \"**requirements elicitation still remains more of an art than a science**.\" Ethnographic techniques are flagged as \"very expensive… requir[ing] significant skill,\" with the observer effect noted.\ndocs/planning/process-model-elicitation/research/re-interviewing-literature-worker-report.md:34:- **Hickey & Davis, \"Requirements Elicitation and Elicitation Technique Selection: A Model for Two Knowledge-Intensive Software Development Processes,\" HICSS-36, 2003, DOI 10.1109/HICSS.2003.1174229** (read in full). The model: elicitation as iterated function application — **elicitᵢ(Rᵢ, Sᵢ, tᵢ) → Rᵢ₊₁, Sᵢ₊₁**, where Rᵢ = current knowledge of requirements, Sᵢ = situation (problem-domain + solution-domain + project characteristics), tᵢ ∈ T (all known techniques). Selection: **σ(Rᵢ, Sᵢ, χ(T)) → {applicable techniques}**, where χ(T) = static technique characteristics; then a personal selector **π({t}, P) → tᵢ** applying analyst preferences. Composed: elicitᵢ(Rᵢ, Sᵢ, π(σ(Rᵢ,Sᵢ,χ(T)),P)). A methodology is then just a fixed sequence of elicit steps — and their critique of methodologies is that fixing tᵢ a priori assumes Sᵢ and Rᵢ in advance: \"one size [methodology] fits all.\"\ndocs/planning/process-model-elicitation/research/re-interviewing-literature-worker-report.md:36:- The situational-characteristics ontology is in **Hickey & Davis, \"A Tale of Two Ontologies: The Basis for Systems Analysis Technique Selection,\" AMCIS 2003, paper 386** (read in full): 24 printed coded situational characteristics in five categories (problem domain: FUZZ, CPLX, CNFL, MATU, SECU, RESP, SAFE, RELI; solution domain: TYPE, COTS, OUTS; stakeholders: #STK, STEX, STCM, STCP, STTV, STAC, STDV; solution builders: SOEX, SOCO, SOSW, SOTO; bridge-builders: BBEX, BBTE, BBCO) out of \"over fifty\" isolated; plus a **ten-dimension technique attribute vector** (physical co-location, temporal co-location, record-keeping, analyst role, convergence/divergence, anonymity, stakeholder count, tool-based, product/human focus, direct/indirect). Notable empirical observation: \"a moderately good technique for a specific situation in the hands of an experienced 'master' can become an ideal technique for that situation.\" ⚠️ No numbered \"propositions\" exist in any of the three 2003 papers; if JMIS 2004 adds them, that is unverified.\ndocs/planning/process-model-elicitation/research/re-interviewing-literature-worker-report.md:46:- On matching to situation: they recommend a \"**zooming**\" method — cheap methods broadly, \"the more expensive but detailed methods… only employed selectively for problems that have been determined by other techniques to be especially important\"; recommended sequence: ethnography first, then interviews, then conversation/interaction analysis on selected hot spots. ⚠️ RE'93 contains **no table or figure**; the requirements-are-emergent claim (\"requirements… gradually emerge from interactions\") is verbatim only in Goguen's 1994 chapter \"Requirements Engineering as the Reconciliation of Technical and Social Issues\" (in Jirotka & Goguen, _Requirements Engineering: Social and Technical Issues_, Academic Press, 1994).\ndocs/planning/process-model-elicitation/research/re-interviewing-literature-worker-report.md:144:- **IEEE Std 830-1998** §4.3.3: \"An SRS is complete if, and only if, it includes… a) All significant requirements… b) Definition of the responses of the software to all realizable classes of input data in all realizable classes of situations… c) Full labels and references to all figures, tables… and definition of all terms and units of measure.\" §4.3.3.1: \"Any SRS that uses the phrase 'to be determined' (TBD) is not a complete SRS.\" (Status: superseded by 29148:2011.)\ndocs/planning/process-model-elicitation/research/re-interviewing-literature-worker-report.md:171:- **Korn, A., Gorsch, S., Vogelsang, A., \"LLMREI: Automating Requirements Elicitation Interviews with LLMs,\" RE'25, pp. 19–30, DOI 10.1109/RE63999.2025.00013 (arXiv:2507.02564)** (read in full). GPT-4o chatbot, 33 simulated stakeholder interviews, evaluated **directly against the Bano et al. mistake questionnaire** (Question Formulation / Question Omission / Order of Interview / Communication Skills / Customer Interaction; 2 of the human categories dropped as inapplicable). Results: LLMREI made a similar number of mistakes to human interviewers; raters even scored its communication skills _better_; long \"least-to-most\" prompt embedding Ferrari et al. guidelines beat a 3-sentence zero-shot prompt on mistake avoidance (64.2% vs 59.1% disagree-mistake-present); elicited up to 60.9% of ground-truth requirements fully + 12.8% partially (73.7% total; ground truth = 12- and 8-requirement scenarios); ~50% of questions context-dependent. **What failed:** fine-tuning GPT-3.5 on 50 transcripts of Ferrari et al.'s student interviews failed entirely (\"incoherent responses,\" lost focus — attributed to poor quality of novice-interviewer training data); hallucination (bot invented a project price estimate); boundary-crossing (asked for the user's email); and the bot **ended interviews too readily** when users signaled impatience, \"missed opportunities to gather crucial information\" — i.e., no stopping discipline.\ndocs/planning/process-model-elicitation/research/re-interviewing-literature-worker-report.md:173:- **Jin, D., Jin, Z., et al., \"ReqElicitGym: An Evaluation Environment for Interview Competence in Conversational Requirements Elicitation,\" arXiv:2602.18306 (2026; under submission to TOSEM)** (read in full). 101 website scenarios, LLM oracle user + evaluator (κ = 0.72 vs experts); metrics **IRE** (implicit-requirements elicitation ratio), ESR, **TKQR** (nDCG-style, rewards early key questions). Findings: best LLM reaches **IRE 0.32**; models \"overwhelmingly favor probing over clarification and **often lack effective stopping criteria**\" (GPT-5.2 exhausts the 20-turn budget); effective questions emerge late; style-related requirements consistently missed.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:5:- Simulated expert: claude-sonnet-5 + situation-pack.md\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:86:3. How do you actually sequence today — a spreadsheet, a rule of thumb, gut feel? I'd like the model to be able to reproduce your current approach as a baseline, so you can compare alternatives against it.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:136:Today I sequence off a spreadsheet — I map the week's demand book onto the three lines, rough rate per product per line, add changeover by feel, and I re-juggle it out loud at the 07:30 huddle most mornings. That sheet is the baseline you should try to reproduce first, honestly — if your model can't match what the sheet does, I won't trust what it says about doing better.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:154:What it _will_ do: let you set up the Tuesday-morning-Line-2-is-dead scenario and race three or four candidate responses against each other (push everything to Line 1 / hold the tint block and pull whites forward / split across 1 and 3 and eat the specialty changeover). You get lateness and changeover hours for each. Over enough simulated breakdowns you can find which _rule_ wins on average, and that's the thing you'd actually take to the huddle — not a schedule, a reflex.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:201:**One validation question:** should the baseline match _the sheet's plan_, or _what actually happened_? They differ, and the gap is usually your improvising at the huddle. I'd rather match actuals — that's what makes it credible to your boss — but I'd use the sheet for the sequencing logic.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:295:| `T_Fail_L` / `T_Repair_L` | stochastic / scenario         | —                                                                 |\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:316:The baseline reproduces you:\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:343:| A7  | Line 1 mill motor modelled as scenario, not random | too rare to sample meaningfully in a 6-week run; you'd get noise, not signal |\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:371:Send the shift pattern and I'll start wiring the baseline against your ERP export. First thing I'll report is whether the model can reproduce your actual weekly output per line — if it can't, that's the finding, and we fix the model before it tells you anything about Tuesdays.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:387:Go ahead and wire the baseline against the ERP export once you've got it, and I'll chase the shift confirmation on Line 3 overtime frequency if you need it — right now \"rare\" is genuinely the best I've got, I don't have a count.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:476:Line 3 overtime: don't go counting it. Treat as zero in baseline and use it as a **lever** — \"what is it worth to approve Line 3 overtime twice a week?\" is a better question than \"how often does it happen,\" and it takes work off you.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:490:I'll wire the baseline the day the ERP export lands. First report is whether the model reproduces your actual weekly output per line, before it says anything about Tuesdays.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:535:**A new rule falls out of that:** don't commit a morning family switch unless there's enough work in that family to fill through 22:00. Switch Line 2 to white at 09:00 with four hours of white orders behind it and you get four good hours and then a dead line until morning — you've spent a 3-hour wash _and_ stranded the evening. Call it the fill-the-shift rule; I'll add it as a policy variant and test it against the baseline.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:569:- **Policy variants to race:** baseline (you) / fill-the-shift rule / time-of-day wait-rule / tech shift 06:00–14:00 vs 10:00–18:00 vs split / Line 3 overtime as a purchasable lever.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:581:**From me, on ERP arrival:** baseline wired and the reproduction check — actual weekly output per line, and roughly eight family switches a week. If it can't hit those, that's the finding and I fix the model before it says anything about Tuesdays.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:621:**When the export lands** I'll wire the baseline and run the reproduction check first — weekly output per line, and the switch count. If it misses, that's the interesting result and I'll come back with what the model thinks is happening versus what your ERP says happened. That's normal, not a setback; the gap is usually where an assumption is wrong, and we have eleven of those on the register waiting to be caught.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:643:One thing not worth waiting a fortnight for: if the tick sheet shows an operator doing a family switch in week one, send it straight over. That single row would retire a hard guard in the model and change what the baseline predicts, so I'd rather rework early than build two weeks on it.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:875:| **A7**  | Line 1 mill motor modelled as a **named scenario**, not a random failure         | Too rare to sample in a 6-week run — you'd get noise, not signal                             | n/a — design choice, but say so out loud           |\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:887:**A19 is the one to watch.** A single contrary row retires a hard guard and changes what the baseline predicts. Send it the same day it appears.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:1025:| `T_Fail_L`   | `Exp(MTBF_L)`           | A6/A8. Line 1 mill motor is a **scenario injection**, not sampled (A7) |\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md:1291:          <lever>count = 2 (baseline) | 3 (third-tech arm)</lever>\ndocs/planning/process-model-elicitation/research/petrinaut-survey.md:38:   only. A generated net that should start with tokens must emit a `scenario`, or\ndocs/planning/process-model-elicitation/research/petrinaut-survey.md:131:  via Babel, metric and scenario expressions via `new Function()` — so it needs\ndocs/planning/process-model-elicitation/research/petrinaut-survey.md:215:check `extensions` before using optional SDCPN features, use scenario parameters\ndocs/planning/process-model-elicitation/research/petrinaut-survey.md:221:scenario initial state, an auto-layout policy, and finally:\ndocs/planning/process-model-elicitation/research/petrinaut-survey.md:225:> continuous dynamics, parameters, visualizer code, and scenarios:\ndocs/planning/process-model-elicitation/research/petrinaut-survey.md:460:  `{ places, transitions, types, differentialEquations, parameters, scenarios?,\ndocs/planning/process-model-elicitation/research/petrinaut-survey.md:545:  scenarios?: Scenario[];\ndocs/planning/process-model-elicitation/research/petrinaut-survey.md:556:`scenarioSchema`, `subnetSchema`, `componentInstanceSchema`), plus\ndocs/planning/process-model-elicitation/research/petrinaut-survey.md:557:`src/schemas/{entity,metric,scenario}-schema.ts`.\ndocs/planning/process-model-elicitation/research/petrinaut-survey.md:602:name but is unrelated: it migrates _positional scenario rows_ when a user edits a\ndocs/planning/process-model-elicitation/research/petrinaut-survey.md:605:notes \"Name-only renames are NOT represented here: scenario rows are positional,\ndocs/planning/process-model-elicitation/research/petrinaut-survey.md:611:  `metric-schema.ts`, `scenario-schema.ts`. Every entity is `z.strictObject` with\ndocs/planning/process-model-elicitation/research/petrinaut-survey.md:668:`scenarioParameters`, `initialState`, with `parameterOverrides` defaulting to\ndocs/planning/process-model-elicitation/research/petrinaut-survey.md:669:`{}`; scenario parameter `type` admits a fourth value, **`ratio`**, that net\ndocs/planning/process-model-elicitation/research/petrinaut-survey.md:672:and notably has **no** `scenarios`/`metrics`/nested `subnets`.\ndocs/planning/process-model-elicitation/research/petrinaut-survey.md:684:`differentialEquations`, `parameters`, `scenarios`, `metrics`, `subnets`, and\ndocs/planning/process-model-elicitation/research/petrinaut-survey.md:731:- **a scenario** — `scenario.initialState`, a discriminated union\ndocs/planning/process-model-elicitation/research/petrinaut-survey.md:732:  (`schemas/scenario-schema.ts:42-80`):\ndocs/planning/process-model-elicitation/research/petrinaut-survey.md:734:    _string expressions_ with `parameters` and `scenario` in scope (e.g.\ndocs/planning/process-model-elicitation/research/petrinaut-survey.md:735:    `\"scenario.population * (1 - scenario.infected_ratio)\"`, `Math.round`ed and\ndocs/planning/process-model-elicitation/research/petrinaut-survey.md:741:`scenario`.** A bare `places` + `transitions` file loads as an empty-marking net\ndocs/planning/process-model-elicitation/research/petrinaut-survey.md:791:- Also in-format: global `parameters`, named `scenarios` (parameter overrides +\ndocs/planning/process-model-elicitation/research/petrinaut-survey.md:811:> **TikZ** — […] Token types, dynamics, read/inhibitor arcs, scenarios, and\ndocs/planning/process-model-elicitation/research/petrinaut-survey.md:851:  `id` with no `scenarios`/`metrics`.\ndocs/planning/process-model-elicitation/research/petrinaut-survey.md:1006:  `scenario` has no initial marking, so it opens but simulates to nothing. These\ndocs/planning/process-model-elicitation/research/petrinaut-survey.md:1034:  `action-schemas.ts` (561 lines) / `metric-schema.ts` / `scenario-schema.ts`.\ndocs/planning/process-model-elicitation/research/petrinaut-survey.md:1131:- Optimization via Optuna over a scenario's flat parameters, streamed trials,\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:5:- Simulated expert: claude-sonnet-5 + situation-pack.md\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:249:**21. Variability — white batch, Line 2 fill.** Typical, like I said, an hour to an hour and a half. One time in ten it's worse — that's your filler jam scenario, tack on 20 minutes to half an hour for a small jam, or if it's a bad one, could eat the rest of the shift, but that's rarer than one-in-ten, that's more like once every couple weeks across the whole line, not per batch. One time in ten it's better — honestly not much better, maybe you shave ten minutes if everything's smooth, there's not a lot of upside slack in fill, it runs close to its rate when nothing's wrong. So the bad tail is real and fat, the good tail is thin. The cause of the bad tail is almost always the filler — jams, or waiting on packaging materials running low, that happens too, cases or labels not being restocked fast enough, that's more a warehouse problem than a line problem but it still stops the fill head.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:311:Blocked in — tomorrow, fifteen minutes, items 1, 4 and 5. I'll come with those as concrete scenarios rather than open questions so we don't burn time.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:361:1. **Conflict points** — I'll put four concrete scenarios to you: two lines wanting the crew simultaneously; how you sequence within a line; whether QA can be jumped and who pays; what triggers and what blocks the Saturday ask.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:384:I'll come tomorrow with the four conflict scenarios pre-written, so you're reacting to concrete cases rather than generating from scratch. Fifteen minutes should hold if we don't wander.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:402:So you're not generating from cold tomorrow, here are the four scenarios in advance — no need to prepare, just useful if you happen to read them before we talk. Answer them the way you actually behave, not the way the procedure would read.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:418:5. **Changeover crew = one indivisible 2-person server**, one job at a time, day shift with discretionary flex. _From Q22_, but I've assumed the quick rinses also consume the full crew. _Check:_ scenario A will probably settle it.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:823:**The punitive mechanism (from your Scenario A answer):** because the crew requires `P_CrewShift`, a line that misses the crew window doesn't wait for the crew to _finish_ — it waits until the crew's next shift _starts_. Line 1 in your scenario doesn't lose 2 hours, it loses the whole overnight. This falls out of the net structure; no special rule needed.\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md:974:6. **Specialty runs on Line 1 only.** Follows from L2 not being piped and L3's list — but I never asked whether L3 can run specialty. _Check:_ one question. **If L3 can, the mill-motor scenario changes materially**, because specialty currently has nowhere to go.\n",
  "exitCode": 0
}
```

## Assistant

That implies a **two-track commitment**, not a cold-start cut:

```text
Shared CPS capability
├─ Semantic core
│  ├─ captures → model → SDCPN
│  ├─ provenance and correction
│  └─ controller + completion
│
├─ Live-demo runbook
│  └─ bounded review-and-revise with conspicuous consequences
│
└─ Cold-start runbook
   ├─ capable of reaching objective-complete models
   ├─ available for attendee experimentation
   └─ evaluated offline against the existing baseline
```

Issue projection:

- **Shared core:** FE-1482, FE-1480, FE-1478, FE-1431.
- **Bounded live path:** FE-1479, FE-1438, FE-1439, FE-1477/1440.
- **Cold-start quality path:** FE-1402, FE-1403, FE-1404, FE-1406.
- **Likely missing:** controller/runbook implementation, full-model quality evaluation, and explicit legibility/witness ownership.

The earlier cuts should become:

- Do not require complete cold-start elicitation **during the live demo**. Do implement and evaluate a `build-from-scratch` runbook offline.
- Do not attempt an exhaustive CPS ontology. Implement the smallest **coherent, objective-complete** domain contract: every demanded slot is stated, absent, conflicted, or explicitly unresolved—not merely omitted because the fixture did not exercise it.

“Better than baseline” must also be specific. The baseline showed that bare Claude already interviews surprisingly well. Brunch needs to win on machinery:

- computed coverage rather than apparent conversational completeness;
- no silent hardening of uncertain statements;
- preserved conflict and absence;
- exact provenance;
- valid, reproducible projection;
- disciplined stopping and explicit residual gaps.

For legibility, I suggest every frontier produces a persistent proof bundle:

```text
Proof bundle
├─ Instrument — runnable, domain-language surface exposing state and transitions
├─ Snapshot   — immutable record of what a human reviewed and decided
└─ Oracle     — executable regression check preserving the mechanical claim
```

This adapts `ds-prototype`’s strongest patterns—explicit question, guided scenarios, free play, visible state—without treating the result as disposable.

And agreed: the current `STEERING.md` is too prose-heavy for its long-term role. After Frontier 0, it should collapse into:

1. objective and constraints;
2. compact frontier/issue tree;
3. active bets and confidence;
4. replan triggers;
5. links to immutable decision/proof snapshots.

The next Frontier 0 decision is practical: **should Vestera Coatings remain the cold-start benchmark even if Dora selects a different live-demo use case?** It already has the situation pack and two baseline conditions, making it our cheapest comparative oracle.

## User

I think it can remain the benchmark for now; but there are specific scenarios, corresponding to levels of PN modelling complexity, which have been outlined in Dora's blog post and which Yannis is preparing as petri nets as well. Eventually we may want to switch to one of those, so we're sharing a reference surface with the rest of the team. In any case I think the "baseline" should be re-established soon, as we can probably improve the base flat prompt for Claude as well. 

And BTW we need a better convention for where to keep our fixture material, for the various kinds of evaluations and tests we are running

## Assistant

That suggests the benchmark should have a stable **evaluation role** independent of whichever domain scenario currently supplies its content. I’m checking the existing scenario levels and fixture sprawl before proposing a storage convention, so we don’t encode today’s Vestera shape into the directory taxonomy.

**Tool Use:** `shell_command`

```json
{
  "command": "rg -n '^#{1,4} |Level|level|scenario|use case|complex' 'docs/reference/2026-08 SDCPNs for cyber-physical systems.md' | sed -n '1,240p'",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "printf '%s\\n' '--- fixture-like paths in context root'; rg --files | rg '(^|/)(fixtures?|golden|snapshots?|examples?|baseline|scenarios?|test-data|mocks?)(/|$)|\\.(fixture|golden|snap)\\.' | sort | sed -n '1,320p'",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "printf '%s\\n' '--- fixture-like paths in app'; rg --files apps/brunch-agent | rg '(^|/)(fixtures?|golden|snapshots?|examples?|baseline|scenarios?|test-data|mocks?)(/|$)|\\.(fixture|golden|snap)\\.' | sort | sed -n '1,260p'; printf '%s\\n' '--- petrinaut brunch fixture-like paths'; rg --files apps/petrinaut-website | rg 'brunch|fixture|golden|scenario' | sort | sed -n '1,320p'",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 10000
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "printf '%s\\n' '--- test fixture imports/references'; rg -n \"fixture|golden|snapshot|situation-pack|condition-[12]|scenario\" packages/*/test packages/*/src ../../../apps/brunch-agent/src ../../../apps/brunch-agent/test 2>/dev/null | sed -n '1,300p'",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

## User

**Tool Result:** `TU-034Cg7w7Kqs6mbguihmZRl`

```
{
  "output": "1:# SDCPNs for cyber-physical systems\n5:# SDCPN as a Common Language for Physical and Digital Systems\n7:Most industrial systems have a physical part (machines, stock levels) and a digital part (control rules, schedulers). A Stochastic Dynamic Coloured Petri Net (SDCPN) can represent both cyber and physical in the same net, sharing the same state. A change on one side immediately affects the other: a physical event enables or blocks decisions, and decisions change the physical trajectory. There is no handoff between separate tools and no assumption that the other side behaves as expected.\n11:This blog post builds one such model through five levels of the formalism, then applies the full SDCPN to two further industries to explore how it can be used to model various domains and its limitations.\n13:# What is an SDCPN?\n15:A [Petri net](https://petrinaut.org/) is a directed graph of places, transitions, and arcs. Tokens sit in places, transitions fire and move tokens between places, and the arrangement of all tokens at a given moment represents the state of the system. A plain Petri net records what can happen and in what order, but without modelling durations, likelihoods, or what distinguishes one token from another, it cannot answer \"how often\" or \"how likely\" in a scenario.\n29:## Where SDCPNs come from\n33:The formalism was designed to support a safety case: a defensible and quantitative statement about how often something bad happens in a system too complex to test exhaustively. The ARIA Safeguarded AI programme chose the same formalism for the same reason. Its goal is a world model expressive enough to hold both the physical system and the AI that controls it, with a safety specification over both. The air traffic problem, with continuous dynamics, multiple agents, human and automated controllers, rare catastrophic events is exactly the class of system Safeguarded AI is building for. The only difference is the controller: the original use case modelled human operators and procedural automation; Safeguarded AI focuses on neural networks.\n35:# Modelling real world with SDCPNs\n37:The following sections model an industrial supply chain process progressively, adding one feature of the formalism at each level until the model is a full SDCPN. To illustrate the expressivity of SDCPNs, we model two further domains as full SDCPNs: truck fleet maintenance and semiconductor fabrication.\n39:## Industrial gas supply chain\n41:Taking an industrial gases supply chain as an example use case: a gas supplier delivers liquid gases (e.g. nitrogen, oxygen) to customer sites by road tankers. The supply chain operates in a standard practice where the supplier owns the liquid in each customer's tank, reads the level by telemetry, and decides when to send a refill. The customer draws product as needed and only pays for what they consumes, but does not place orders.\n51:### Plain Petri net\n57:As the customer consumes the nitrogen and some boils off, the level drops. When the level drops to 15 (representing the telemetry-based sensor in the tank), an order is placed. A tanker dispatches, arrives and delivers 12 units (only if 12 units of space exist in the tank). The permit and tanker return on delivery and cycle repeats.\n61:If the tank is completely full, a relief valve opens and reduces the level of gas (by 1 unit). Under this level trigger order policy, venting is unreachable since the maths of the reorder point and load size prevent it (gas only refills by 12 units when below 15 units). In later timed-extensions of the model, we introduce pressure-driven venting since in practice, venting is required when pressure gradually builds as the liquid warms.\n63:\\[BELOW\\] shows the net for a variant of the order policy based on consumption-trigger. Instead of reordering when the level drops below a threshold, the system reorders after every 8 units are drawn by the customer without accounting for any evaporation. This results in a failure mode whereby, If enough nitrogen boils off, the tank empties without the consumption counter ever reaching 8\\. The system reaches a deadlock: the tank is at zero, fewer than 8 units have been drawn since the last order, and nothing in the model can change the state in the system so the production line stops and never restarts.\n65:Without time accounted for in the model, the net picks any enabled transition to fire without any rules on ordering. There can be a scenario where the transition for consuming nitrogen is fired repeatedly and empties the contents without dispatching the tanker for refill. Adding durations fixes this so events happen according to rates rather than random choice, which we explore in the next progression to SPN.\n69:### SPN\n85:### SCPN\n95:### DCPN\n97:The Dynamic Coloured Petri Net (DCPN) replaces the stack of unit tokens with a single token governed by differential equations, to model the level of gas and pressure as real numbers that can fall or grow continuously. With the inclusion of dynamics, the net can now model scenarios that simpler nets couldn’t:\n105:### SDCPN\n113:## Truck fleet maintenance\n133:## Semiconductor wafer fabrication\n139:For this use case we modelled 16 chambers across 4 machine groups (4 lithography, 6 etch, 4 deposition, 2 inspection), 3 product types (logic, memory, analog) arriving stochastically, a capacity limit of 50 lots in progress, and 3 technicians shared between planned and unplanned work.\n141:Each lot token carries its product type, current layer, cumulative defects, age, and a customer due date. Each machine token holds data on its condition, particle count, hours since maintenance, machine group, qualification level, and batch counter. The degradation mechanisms use the following SDCPN features:\n147:- **Per-chamber process drift as stochastic dynamics.** Each chamber's process accuracy varies independently via a second diffusion process. Drift in either direction from zero increases defect rates. Maintenance recalibrates the chamber, but calibration is imperfect and each reset samples a small residual error. This means two chambers on the same tool can produce different defect rates even at identical condition and particle levels.\n155:- **Chamber-level recipes.** Processing time depends on the product being made. For example, a furnace step takes 5 hours at baseline; analog lots take 15% longer, memory lots 15% shorter. The same applies to lithography and etch steps.\n161:The model can help fabrication managers understand the interaction between maintenance policy,chamber calibration, batch sizing and in progress capacity in relation to yield and on-time delivery. The main simplifications are that each chamber processes one lot at a time and lots cannot be split for partial rework (lot-splitting). This means the model's absolute throughput figures are lower than a real foundry's , but relative comparisons between scenarios remain valid because all scenarios share the same simplification. Modelling lot-splitting would reduce the cost of contamination events by allowing partial recovery as a secondary effect, but does not change the fundamental question of when to maintain.\n163:## Why SDCPNs?\n167:### Structural guarantees\n177:These checks require a finite state space. Once tokens carry real-valued data (continuous levels, pressures, temperatures), the state graph cannot be exhaustively checked and these proofs do not apply directly. Extending formal guarantees to models with continuous state and stochastic dynamics is an open research problem, and one of the reasons the ARIA Safeguarded AI programme is investing in this formalism.\n179:### Probabilistic claims\n187:# Conclusion\n197:- Continuous dynamics replace discrete approximations with differential equations for flows like gas levels, machine degradation and contamination.\n201:What makes the formalism worth the added complexity is not that it can represent these interactions, but that it can quantify the frequency, costs and conditions that trigger them. When the controller is an AI making real-time decisions over a physical system, that quantification is what separates a deployment backed by evidence, and eventually verification, from one backed by assumption.\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-034Cg7w81353sGji2BwSA0`

```
{
  "output": "--- fixture-like paths in context root\ndocs/planning/process-model-elicitation/baseline/opening-message.md\ndocs/planning/process-model-elicitation/baseline/protocol.md\ndocs/planning/process-model-elicitation/baseline/readout.md\ndocs/planning/process-model-elicitation/baseline/run.ts\ndocs/planning/process-model-elicitation/baseline/situation-pack.md\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1-model.txt\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.md\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-1.raw.json\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2-model.txt\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.md\ndocs/planning/process-model-elicitation/baseline/transcripts/condition-2.raw.json\ndocs/planning/process-model-elicitation/baseline/v0-prompt.md\npackages/core/test/architecture/fixtures/baseline-anthropic-stub.ts\npackages/transport-aisdk/test/fixtures/elicitor-initial.normalized.json\npackages/transport-aisdk/test/fixtures/panel-follow-up.sse\npackages/transport-aisdk/test/fixtures/panel-initial.post.json\npackages/transport-aisdk/test/fixtures/panel-initial.sse\npackages/transport-aisdk/test/fixtures/panel-tool-results.post.json\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-034Cg7w8PKTWflM0m25oq9`

```
{
  "output": "--- fixture-like paths in app\n--- petrinaut brunch fixture-like paths\napps/petrinaut-website/scripts/brunch-sse-fixture.ts\napps/petrinaut-website/src/main/app/brunch-demo/brunch-actual-mode-provider.tsx\napps/petrinaut-website/src/main/app/brunch-demo/brunch-actual-mode-route.tsx\napps/petrinaut-website/src/main/app/brunch-demo/brunch-definition.ts\napps/petrinaut-website/src/main/app/brunch-demo/brunch-demo-app.tsx\napps/petrinaut-website/src/main/app/brunch-demo/brunch-endpoint.ts\napps/petrinaut-website/src/main/app/brunch-demo/brunch-frame-parsers.ts\napps/petrinaut-website/src/main/app/brunch-demo/brunch-petrinaut.tsx\napps/petrinaut-website/src/main/app/brunch-demo/brunch-protocol.ts\napps/petrinaut-website/src/main/app/brunch-demo/brunch-route.ts\napps/petrinaut-website/src/main/app/brunch-demo/brunch-status-page.tsx\napps/petrinaut-website/src/main/app/local-storage-demo/brunch-ask-interactive-tool.tsx\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-034Cg7w8hS9Dj7f9TMhvU8`

```
{
  "output": "--- test fixture imports/references\n../../../apps/brunch-agent/test/walking-skeleton.integration.ts:58:        question: \"What outcome should the scenario describe?\",\n../../../apps/brunch-agent/test/walking-skeleton.integration.ts:287:          \"What outcome should the scenario describe?\",\n../../../apps/brunch-agent/test/walking-skeleton.integration.ts:293:            \"What outcome should the scenario describe?\",\n../../../apps/brunch-agent/test/petrinaut-chat.test.ts:86:  const golden = JSON.parse(\n../../../apps/brunch-agent/test/petrinaut-chat.test.ts:90:        \"../../../libs/@hashintel/brunch-agent/packages/transport-aisdk/test/fixtures/elicitor-initial.normalized.json\",\n../../../apps/brunch-agent/test/petrinaut-chat.test.ts:95:  expect(normalizedChunks(result.chunks, result.messageId)).toEqual(golden);\n../../../apps/brunch-agent/test/petrinaut-ask.test.ts:51:  // exactly as the FE-1436 application golden streams its second step.\n../../../apps/brunch-agent/test/transport-aisdk-server.test.ts:17:  \"../../../libs/@hashintel/brunch-agent/packages/transport-aisdk/test/fixtures\",\n../../../apps/brunch-agent/test/transport-aisdk-server.test.ts:20:const fixture = (name: string): string =>\n../../../apps/brunch-agent/test/transport-aisdk-server.test.ts:321:  test(\"encodes fixed harness events as the real-panel golden SSE\", async () => {\n../../../apps/brunch-agent/test/transport-aisdk-server.test.ts:345:        body: fixture(\"panel-initial.post.json\"),\n../../../apps/brunch-agent/test/transport-aisdk-server.test.ts:352:      fixture(\"panel-initial.sse\").trimEnd(),\n../../../apps/brunch-agent/test/transport-aisdk-server.test.ts:420:        body: fixture(\"panel-tool-results.post.json\"),\npackages/binding-flue/src/index.ts:207:        applied.snapshot,\npackages/binding-flue/src/index.ts:233:    // live slot rather than the render-time persistent-state snapshot.\n../../../apps/brunch-agent/test/petrinaut-chat.integration.ts:49:  const fixturePath = fileURLToPath(\n../../../apps/brunch-agent/test/petrinaut-chat.integration.ts:51:      \"../../../libs/@hashintel/brunch-agent/packages/transport-aisdk/test/fixtures/panel-initial.post.json\",\n../../../apps/brunch-agent/test/petrinaut-chat.integration.ts:62:      body: await readFile(fixturePath, \"utf8\"),\npackages/binding-flue/src/capabilities.ts:80:      \"public materialized history snapshot over a host-injected conversation URL/transport; `role`/`purpose` discriminate provenance; no raw entry ranges\",\npackages/binding-flue/test/capture-accounting.test.ts:18:    const snapshot = {\npackages/binding-flue/test/capture-accounting.test.ts:88:      snapshot,\npackages/binding-flue/test/capture-accounting.test.ts:97:    const snapshot = {\npackages/binding-flue/test/capture-accounting.test.ts:141:      snapshot,\npackages/binding-flue/src/capture-accounting.ts:13:  snapshot: CaptureStoreSnapshot,\npackages/binding-flue/src/capture-accounting.ts:17:  for (const capture of snapshot.captures) {\npackages/core/src/plugin.ts:22:  /** The artifact family this plugin elicits — gherkin scenarios, assurance arguments. */\npackages/binding-flue/src/history-reader.ts:90:  snapshot: Pick<FlueConversationSnapshot, \"messages\">,\npackages/binding-flue/src/history-reader.ts:92:  const { messages } = snapshot;\npackages/binding-flue/src/history-reader.ts:174:  snapshot: FlueConversationSnapshot,\npackages/binding-flue/src/history-reader.ts:176:  projectFlueHistoryForSweep(snapshot).map((entry, index) => ({\npackages/binding-flue/src/history-reader.ts:180:    materialized: materializedJson(snapshot.messages[index]!),\npackages/binding-flue/src/history-reader.ts:197:      const snapshot = await peek(sessionId);\npackages/binding-flue/src/history-reader.ts:200:        substrateConversationId: snapshot.conversationId,\npackages/binding-flue/src/history-reader.ts:201:        offset: snapshot.offset,\npackages/binding-flue/src/history-reader.ts:202:        ...(snapshot.incarnation === undefined\npackages/binding-flue/src/history-reader.ts:204:          : { incarnation: snapshot.incarnation }),\npackages/binding-flue/src/history-reader.ts:205:        entries: classifyMessages(snapshot),\npackages/binding-flue/src/history-reader.ts:206:        settlements: snapshot.settlements.map(materializedJson),\npackages/binding-flue/src/history-reader.ts:208:      return snapshot;\npackages/binding-flue/test/local-capture-store.test.ts:90:    const snapshot = await reopened.read();\npackages/binding-flue/test/local-capture-store.test.ts:91:    expect(snapshot.captures).toHaveLength(1);\npackages/binding-flue/test/local-capture-store.test.ts:92:    expect(snapshot.captures[0]!.content).toEqual({ value: \"alpha\" });\npackages/binding-flue/test/local-capture-store.test.ts:127:    const snapshot = await createLocalCaptureStore(path).read();\npackages/binding-flue/test/local-capture-store.test.ts:128:    expect(snapshot.captures.map((capture) => capture.content)).toEqual([\npackages/binding-flue/test/local-capture-store.test.ts:189:    // And still readable through the parser, which is what makes it a snapshot\npackages/binding-flue/test/local-capture-store.test.ts:209:    const captureId = created.snapshot.captures[0]!.id;\npackages/binding-flue/test/local-capture-store.test.ts:220:    // wrote it. If the snapshot aliased any of it, the result the caller was\npackages/binding-flue/test/local-capture-store.test.ts:226:      retracted.snapshot,\npackages/transport-aisdk/test/golden.test.ts:36:const FIXTURES = join(import.meta.dirname, \"fixtures\");\npackages/transport-aisdk/test/golden.test.ts:53:  test(\"validates the load-bearing fields in the complete initial panel POST fixture\", () => {\npackages/binding-flue/src/local-capture-store.ts:105:            document: { ...document, captureStore: result.snapshot },\npackages/core/src/testing/index.ts:2: * `@hashintel/brunch-agent/testing` — fixtures, arbitraries, and the replay driver.\npackages/core/src/testing/index.ts:9: * land with their own slices; this module holds the seed fixtures they grow\npackages/core/src/testing/index.ts:17:const fixtureProposalSchema = v.strictObject({\npackages/core/src/testing/index.ts:24:  content: v.strictObject({ value: v.literal(\"fixture\") }),\npackages/core/src/testing/index.ts:28: * The smallest honest plugin (spec §11.3), as a fixture: a flat record list and\npackages/core/src/testing/index.ts:35:    name: \"plugin-fixture\",\npackages/core/src/testing/index.ts:36:    targetDomain: \"fixture\",\npackages/core/src/testing/index.ts:39:        name: \"fixture-proposal\",\npackages/core/src/testing/index.ts:40:        description: \"A fixture-only capture proposal.\",\npackages/core/src/testing/index.ts:41:        schema: fixtureProposalSchema,\npackages/binding-flue/test/history-reader.test.ts:30:const snapshot = {\npackages/binding-flue/test/history-reader.test.ts:99:    expect(projectFlueHistoryForSweep(snapshot)).toEqual([\npackages/binding-flue/test/history-reader.test.ts:127:      ...snapshot,\npackages/binding-flue/test/history-reader.test.ts:190:  test(\"uses only the host-resolved URL and transport, then archives the public snapshot\", async () => {\npackages/binding-flue/test/history-reader.test.ts:196:      return Response.json(snapshot);\npackages/binding-flue/test/history-reader.test.ts:205:    expect(await reader.peek(\"session-1\")).toEqual(snapshot);\npackages/binding-flue/test/history-reader.test.ts:208:    expect(await reader.read(\"session-1\")).toEqual(snapshot);\npackages/binding-flue/test/history-reader.test.ts:226:      JSON.parse(JSON.stringify(snapshot.messages[0]!)),\npackages/binding-flue/test/history-reader.test.ts:245:    const capture = captured.snapshot.captures[0]!;\npackages/binding-flue/test/history-reader.test.ts:279:      snapshot: { captures: [expect.any(Object), expect.any(Object)] },\npackages/binding-flue/test/history-reader.test.ts:316:    const snapshots = [\npackages/binding-flue/test/history-reader.test.ts:318:        ...snapshot,\npackages/binding-flue/test/history-reader.test.ts:323:        messages: snapshot.messages.slice(0, 3),\npackages/binding-flue/test/history-reader.test.ts:325:      { ...snapshot, offset: \"2\" },\npackages/binding-flue/test/history-reader.test.ts:330:        Response.json(snapshots.shift()!)) as unknown as typeof fetch,\npackages/binding-flue/test/history-reader.test.ts:370:    expect(retry.snapshot.captures).toHaveLength(1);\npackages/binding-flue/test/history-reader.test.ts:377:    const snapshots = [\npackages/binding-flue/test/history-reader.test.ts:379:        ...snapshot,\npackages/binding-flue/test/history-reader.test.ts:398:        ...snapshot,\npackages/binding-flue/test/history-reader.test.ts:414:      Response.json(snapshots.shift()!)) as unknown as typeof fetch;\npackages/core/src/capture-store.ts:277:      readonly snapshot: CaptureStoreSnapshot;\npackages/core/src/capture-store.ts:296:// commands, persisted snapshots — reaches it through here, so all of them\npackages/core/src/capture-store.ts:417:const snapshotSchema = v.strictObject({\npackages/core/src/capture-store.ts:453:  const snapshot = v.parse(snapshotSchema, input) as CaptureStoreSnapshot;\npackages/core/src/capture-store.ts:454:  for (const records of [snapshot.captures, snapshot.issues, snapshot.events]) {\npackages/core/src/capture-store.ts:461:  for (const capture of snapshot.captures) {\npackages/core/src/capture-store.ts:474:      !snapshot.captures.some(\npackages/core/src/capture-store.ts:484:  for (const event of snapshot.events) {\npackages/core/src/capture-store.ts:495:        !snapshot.captures.some((capture) => capture.id === event.captureId)\npackages/core/src/capture-store.ts:503:    const issue = snapshot.issues.find(\npackages/core/src/capture-store.ts:533:  for (const issue of snapshot.issues) {\npackages/core/src/capture-store.ts:537:          !snapshot.captures.some((capture) => capture.id === captureId),\npackages/core/src/capture-store.ts:552:  for (const capture of snapshot.captures) {\npackages/core/src/capture-store.ts:555:  for (const event of snapshot.events) {\npackages/core/src/capture-store.ts:564:  for (const capture of snapshot.captures) {\npackages/core/src/capture-store.ts:569:      snapshot.captures.some((candidate) => candidate.id === current)\npackages/core/src/capture-store.ts:580:  const openConflicts = snapshot.issues.filter(\npackages/core/src/capture-store.ts:586:      (captureId) => deriveCaptureStatus(snapshot, captureId) !== \"active\",\npackages/core/src/capture-store.ts:606:  return snapshot;\npackages/core/src/capture-store.ts:710:  snapshot: CaptureStoreSnapshot,\npackages/core/src/capture-store.ts:717:  return snapshot.captures\npackages/core/src/capture-store.ts:798:  snapshot: CaptureStoreSnapshot,\npackages/core/src/capture-store.ts:802:    snapshot.events.some(\npackages/core/src/capture-store.ts:809:    snapshot.captures.some((capture) => capture.supersedes === captureId) ||\npackages/core/src/capture-store.ts:810:    snapshot.events.some(\npackages/core/src/capture-store.ts:822:  snapshot: CaptureStoreSnapshot,\npackages/core/src/capture-store.ts:825:  snapshot.events.some(\npackages/core/src/capture-store.ts:842:  snapshot: CaptureStoreSnapshot,\npackages/core/src/capture-store.ts:845:  snapshot.issues\npackages/core/src/capture-store.ts:850:        deriveIssueStatus(snapshot, issue.id) === \"open\",\npackages/core/src/capture-store.ts:855:  snapshot: CaptureStoreSnapshot,\npackages/core/src/capture-store.ts:862:    for (const capture of snapshot.captures) {\npackages/core/src/capture-store.ts:872:    for (const event of snapshot.events) {\npackages/core/src/capture-store.ts:883:  return snapshot.captures\npackages/core/src/capture-store.ts:888:        deriveCaptureStatus(snapshot, capture.id) === \"active\",\npackages/core/src/capture-store.ts:912:  snapshot: CaptureStoreSnapshot,\npackages/core/src/capture-store.ts:925:    const exactRetry = snapshot.captures.some(\npackages/core/src/capture-store.ts:935:      snapshot.captures.some(\npackages/core/src/capture-store.ts:949:      const target = snapshot.captures.find(\npackages/core/src/capture-store.ts:962:      const blockingIssueIds = openConflictsNaming(snapshot, target.id);\npackages/core/src/capture-store.ts:972:        deriveCaptureStatus(snapshot, target.id) !== \"active\" ||\npackages/core/src/capture-store.ts:979:          currentHeadIds: currentHeads(snapshot, target.id),\npackages/core/src/capture-store.ts:987:  const captures = [...snapshot.captures];\npackages/core/src/capture-store.ts:998:  const nextSnapshot = { ...snapshot, captures };\npackages/core/src/capture-store.ts:1035:    snapshot: nextSnapshot,\npackages/core/src/capture-store.ts:1041:  snapshot: CaptureStoreSnapshot,\npackages/core/src/capture-store.ts:1067:            snapshot,\npackages/core/src/capture-store.ts:1092:      const result = applySweep(snapshot, proposals);\npackages/core/src/capture-store.ts:1122:          !snapshot.captures.some((capture) => capture.id === captureId),\npackages/core/src/capture-store.ts:1130:      // Activity is a fact about this snapshot, so it is checked here rather\npackages/core/src/capture-store.ts:1137:                deriveCaptureStatus(snapshot, captureId) !== \"active\",\npackages/core/src/capture-store.ts:1143:          message: `A new conflicting issue must reference active captures; capture ${inactiveReference} is ${deriveCaptureStatus(snapshot, inactiveReference)}.`,\npackages/core/src/capture-store.ts:1148:          ? snapshot.issues.find(\npackages/core/src/capture-store.ts:1151:                deriveIssueStatus(snapshot, issue.id) === \"open\" &&\npackages/core/src/capture-store.ts:1165:        snapshot: { ...snapshot, issues: [...snapshot.issues, candidateIssue] },\npackages/core/src/capture-store.ts:1171:      const issue = snapshot.issues.find(\npackages/core/src/capture-store.ts:1181:      if (deriveIssueStatus(snapshot, issue.id) === \"closed\") {\npackages/core/src/capture-store.ts:1203:        snapshot: { ...snapshot, events: [...snapshot.events, event] },\npackages/core/src/capture-store.ts:1209:      const issue = snapshot.issues.find(\npackages/core/src/capture-store.ts:1245:        // Cloned, not aliased: the snapshot is the store's record, and a caller\npackages/core/src/capture-store.ts:1257:        deriveIssueStatus(snapshot, issue.id) === \"closed\" ||\npackages/core/src/capture-store.ts:1262:          (captureId) => deriveCaptureStatus(snapshot, captureId) !== \"active\",\npackages/core/src/capture-store.ts:1274:        snapshot: {\npackages/core/src/capture-store.ts:1275:          ...snapshot,\npackages/core/src/capture-store.ts:1276:          events: [...snapshot.events, candidateRecord],\npackages/core/src/capture-store.ts:1283:      const capture = snapshot.captures.find(\npackages/core/src/capture-store.ts:1293:      const blockingIssueIds = openConflictsNaming(snapshot, capture.id);\npackages/core/src/capture-store.ts:1331:        deriveCaptureStatus(snapshot, capture.id) !== \"active\" ||\npackages/core/src/capture-store.ts:1344:        snapshot: { ...snapshot, events: [...snapshot.events, event] },\npackages/core/test/anchoring.test.ts:63:    const capture = result.snapshot.captures[0]!;\npackages/core/test/anchoring.test.ts:118:      first.snapshot,\npackages/core/test/anchoring.test.ts:126:    expect(replay.snapshot.captures).toHaveLength(1);\npackages/core/test/anchoring.test.ts:128:      first.snapshot.captures[0]!.dedupKey,\npackages/core/test/anchoring.test.ts:173:      first.snapshot,\npackages/core/test/anchoring.test.ts:181:    expect(replay.snapshot.captures).toHaveLength(1);\npackages/core/test/anchoring.test.ts:183:      replay.snapshot.captures.flatMap((capture) =>\npackages/core/test/anchoring.test.ts:194:      replay.snapshot,\npackages/core/test/anchoring.test.ts:203:    expect(bothOccurrences.snapshot.captures).toHaveLength(2);\npackages/core/test/anchoring.test.ts:205:      bothOccurrences.snapshot.captures.flatMap((capture) =>\npackages/core/test/anchoring.test.ts:252:      first.snapshot,\npackages/core/test/anchoring.test.ts:259:    expect(retry.snapshot.captures).toHaveLength(1);\npackages/transport-aisdk/test/ask-reply.test.ts:25:const FIXTURES = join(import.meta.dirname, \"fixtures\");\npackages/core/test/ask-protocol.test.ts:18:  \"What outcome should the scenario describe?\",\npackages/core/test/ask-protocol.test.ts:27:      markdown: \"What outcome should the scenario describe?\",\npackages/core/test/ask-protocol.test.ts:28:      payload: { question: \"What outcome should the scenario describe?\" },\npackages/core/test/ask-protocol.test.ts:60:        \"What outcome should the scenario describe?\",\npackages/core/test/capture-store.test.ts:59:  snapshot: CaptureStoreSnapshot,\npackages/core/test/capture-store.test.ts:62:  applyCaptureStoreCommandWithArchive(snapshot, command, {\npackages/core/test/capture-store.test.ts:85:  snapshot: CaptureStoreSnapshot,\npackages/core/test/capture-store.test.ts:88:  const result = applyCaptureStoreCommand(snapshot, command);\npackages/core/test/capture-store.test.ts:93:  // through the file it will be kept in, and come back the same snapshot. The\npackages/core/test/capture-store.test.ts:95:  // value the command surface accepts and JSON cannot carry is a snapshot the\npackages/core/test/capture-store.test.ts:98:    parseCaptureStoreSnapshot(JSON.parse(JSON.stringify(result.snapshot))),\npackages/core/test/capture-store.test.ts:99:  ).toEqual(result.snapshot);\npackages/core/test/capture-store.test.ts:110:    const retry = apply(first.snapshot, {\npackages/core/test/capture-store.test.ts:115:    expect(first.snapshot.captures).toHaveLength(1);\npackages/core/test/capture-store.test.ts:116:    expect(retry.snapshot.captures).toHaveLength(1);\npackages/core/test/capture-store.test.ts:119:      skippedDedupKeys: [first.snapshot.captures[0]!.dedupKey],\npackages/core/test/capture-store.test.ts:123:    const originalId = retry.snapshot.captures[0]!.id;\npackages/core/test/capture-store.test.ts:124:    const revisedReading = apply(retry.snapshot, {\npackages/core/test/capture-store.test.ts:130:    expect(revisedReading.snapshot.captures).toHaveLength(2);\npackages/core/test/capture-store.test.ts:131:    expect(revisedReading.snapshot.captures[1]).toMatchObject({\npackages/core/test/capture-store.test.ts:132:      dedupKey: first.snapshot.captures[0]!.dedupKey,\npackages/core/test/capture-store.test.ts:139:    // JSON.stringify(-0) is \"0\", so accepting -0 mints a snapshot whose read\npackages/core/test/capture-store.test.ts:192:    expect(result.snapshot.events).toEqual([]);\npackages/core/test/capture-store.test.ts:238:    expect(result.snapshot.captures.map((capture) => capture.content)).toEqual(\npackages/core/test/capture-store.test.ts:242:      result.snapshot.captures.every(\npackages/core/test/capture-store.test.ts:271:      result.snapshot.captures.map((capture) => capture.epistemicStatus),\npackages/core/test/capture-store.test.ts:302:      result.snapshot.captures.map((capture) => capture.epistemicStatus),\npackages/core/test/capture-store.test.ts:305:    const userCitedDefault = applyCaptureStoreCommand(result.snapshot, {\npackages/core/test/capture-store.test.ts:325:    const originalId = original.snapshot.captures[0]!.id;\npackages/core/test/capture-store.test.ts:326:    const corrected = apply(original.snapshot, {\npackages/core/test/capture-store.test.ts:334:    const correctionId = corrected.snapshot.captures[1]!.id;\npackages/core/test/capture-store.test.ts:336:    expect(corrected.snapshot.captures).toHaveLength(2);\npackages/core/test/capture-store.test.ts:337:    expect(deriveCaptureStatus(corrected.snapshot, originalId)).toBe(\npackages/core/test/capture-store.test.ts:340:    expect(deriveCaptureStatus(corrected.snapshot, correctionId)).toBe(\npackages/core/test/capture-store.test.ts:344:      corrected.snapshot.captures.every(\npackages/core/test/capture-store.test.ts:349:    const stale = applyCaptureStoreCommand(corrected.snapshot, {\npackages/core/test/capture-store.test.ts:377:    const [marchId, juneId] = captures.snapshot.captures.map(\npackages/core/test/capture-store.test.ts:380:    const issue = apply(captures.snapshot, {\npackages/core/test/capture-store.test.ts:392:      applyCaptureStoreCommand(issue.snapshot, {\npackages/core/test/capture-store.test.ts:398:      applyCaptureStoreCommand(issue.snapshot, {\npackages/core/test/capture-store.test.ts:413:      applyCaptureStoreCommand(issue.snapshot, {\npackages/core/test/capture-store.test.ts:428:    const resolved = apply(issue.snapshot, {\npackages/core/test/capture-store.test.ts:437:    expect(deriveIssueStatus(resolved.snapshot, issueId)).toBe(\"closed\");\npackages/core/test/capture-store.test.ts:438:    expect(deriveCaptureStatus(resolved.snapshot, marchId!)).toBe(\"superseded\");\npackages/core/test/capture-store.test.ts:439:    expect(deriveCaptureStatus(resolved.snapshot, juneId!)).toBe(\"active\");\npackages/core/test/capture-store.test.ts:440:    expect(resolved.snapshot.issues[0]).not.toHaveProperty(\"status\");\npackages/core/test/capture-store.test.ts:452:    const captureIds = captures.snapshot.captures.map((capture) => capture.id);\npackages/core/test/capture-store.test.ts:453:    const issue = apply(captures.snapshot, {\npackages/core/test/capture-store.test.ts:463:    const partial = applyCaptureStoreCommand(issue.snapshot, {\npackages/core/test/capture-store.test.ts:487:            // one reference this fixture is refused for referencing too few\npackages/core/test/capture-store.test.ts:499:  test(\"persisted snapshots refuse more than one closing event for an issue\", () => {\npackages/core/test/capture-store.test.ts:503:    }).snapshot;\npackages/core/test/capture-store.test.ts:511:    }).snapshot;\npackages/core/test/capture-store.test.ts:515:    }).snapshot;\npackages/core/test/capture-store.test.ts:533:  test(\"persisted snapshots refuse stale keys and forking supersession graphs\", () => {\npackages/core/test/capture-store.test.ts:544:    }).snapshot;\npackages/core/test/capture-store.test.ts:574:    const captureId = created.snapshot.captures[0]!.id;\npackages/core/test/capture-store.test.ts:601:      const result = applyCaptureStoreCommand(created.snapshot, {\npackages/core/test/capture-store.test.ts:614:    expect(apply(created.snapshot, wellFormed).snapshot.issues).toHaveLength(1);\npackages/core/test/capture-store.test.ts:631:    const [marchId, juneId, septemberId] = created.snapshot.captures.map(\npackages/core/test/capture-store.test.ts:635:    const corrected = apply(created.snapshot, {\npackages/core/test/capture-store.test.ts:643:    const withRetraction = apply(corrected.snapshot, {\npackages/core/test/capture-store.test.ts:648:    const aprilId = corrected.snapshot.captures.at(-1)!.id;\npackages/core/test/capture-store.test.ts:650:      applyCaptureStoreCommand(withRetraction.snapshot, {\npackages/core/test/capture-store.test.ts:691:    const issue = apply(withRetraction.snapshot, {\npackages/core/test/capture-store.test.ts:700:    const resolved = apply(issue.snapshot, {\npackages/core/test/capture-store.test.ts:708:    expect(deriveIssueStatus(resolved.snapshot, issue.value.issueId)).toBe(\npackages/core/test/capture-store.test.ts:714:    const ambiguous = apply(withRetraction.snapshot, {\npackages/core/test/capture-store.test.ts:723:    const closed = apply(ambiguous.snapshot, {\npackages/core/test/capture-store.test.ts:727:    expect(deriveIssueStatus(closed.snapshot, ambiguous.value.issueId)).toBe(\npackages/core/test/capture-store.test.ts:743:      captures.snapshot.captures.map((capture) => capture.id);\npackages/core/test/capture-store.test.ts:744:    const first = apply(captures.snapshot, {\npackages/core/test/capture-store.test.ts:757:      const result = applyCaptureStoreCommand(first.snapshot, {\npackages/core/test/capture-store.test.ts:777:    const disjoint = apply(first.snapshot, {\npackages/core/test/capture-store.test.ts:784:    expect(disjoint.snapshot.issues).toHaveLength(2);\npackages/core/test/capture-store.test.ts:788:        ...first.snapshot,\npackages/core/test/capture-store.test.ts:790:          ...first.snapshot.issues,\npackages/core/test/capture-store.test.ts:802:    // The command surface pins these captures, but a persisted snapshot could\npackages/core/test/capture-store.test.ts:808:        ...first.snapshot,\npackages/core/test/capture-store.test.ts:810:          ...first.snapshot.events,\npackages/core/test/capture-store.test.ts:833:    const [marchId, juneId, venueId] = captures.snapshot.captures.map(\npackages/core/test/capture-store.test.ts:836:    const issue = apply(captures.snapshot, {\npackages/core/test/capture-store.test.ts:887:      const result = applyCaptureStoreCommand(issue.snapshot, command);\npackages/core/test/capture-store.test.ts:907:      apply(issue.snapshot, {\npackages/core/test/capture-store.test.ts:911:      }).snapshot.events,\npackages/core/test/capture-store.test.ts:916:    const resolved = apply(issue.snapshot, {\npackages/core/test/capture-store.test.ts:924:    expect(deriveCaptureStatus(resolved.snapshot, marchId!)).toBe(\"superseded\");\npackages/core/test/capture-store.test.ts:926:      apply(resolved.snapshot, {\npackages/core/test/capture-store.test.ts:930:      }).snapshot.events,\npackages/core/test/capture-store.test.ts:942:    const [marchId, juneId] = created.snapshot.captures.map(\npackages/core/test/capture-store.test.ts:945:    const issue = apply(created.snapshot, {\npackages/core/test/capture-store.test.ts:951:    }).snapshot;\npackages/core/test/capture-store.test.ts:974:    const [marchId, juneId] = captures.snapshot.captures.map(\npackages/core/test/capture-store.test.ts:977:    const issue = apply(captures.snapshot, {\npackages/core/test/capture-store.test.ts:986:    const resolved = apply(issue.snapshot, {\npackages/core/test/capture-store.test.ts:993:    }).snapshot;\npackages/core/test/capture-store.test.ts:1012:    const [marchId, juneId] = created.snapshot.captures.map(\npackages/core/test/capture-store.test.ts:1015:    const issue = apply(created.snapshot, {\npackages/core/test/capture-store.test.ts:1027:    const resolved = apply(issue.snapshot, {\npackages/core/test/capture-store.test.ts:1036:    const retracted = apply(resolved.snapshot, {\npackages/core/test/capture-store.test.ts:1051:    const resolution = retracted.snapshot.events.find(\npackages/core/test/capture-store.test.ts:1054:    const retraction = retracted.snapshot.events.find(\npackages/core/test/capture-store.test.ts:1072:    // And the snapshot the caller could still reach is one the parser accepts.\npackages/core/test/capture-store.test.ts:1073:    expect(() => parseCaptureStoreSnapshot(retracted.snapshot)).not.toThrow();\npackages/core/test/capture-store.test.ts:1092:    const [marchId, juneId, septemberId] = captures.snapshot.captures.map(\npackages/core/test/capture-store.test.ts:1095:    const issue = apply(captures.snapshot, {\npackages/core/test/capture-store.test.ts:1138:      const result = applyCaptureStoreCommand(issue.snapshot, command);\npackages/core/test/capture-store.test.ts:1147:  test(\"persisted snapshots refuse a reversed evidence range in a capture or an event\", () => {\npackages/core/test/capture-store.test.ts:1152:    const retracted = apply(created.snapshot, {\npackages/core/test/capture-store.test.ts:1154:      captureId: created.snapshot.captures[0]!.id,\npackages/core/test/capture-store.test.ts:1156:    }).snapshot;\npackages/core/test/capture-store.test.ts:1158:    // Bent from a snapshot the store itself produced, so the reversed range is\npackages/core/test/capture-store.test.ts:1194:    let snapshot = apply(createEmptyCaptureStoreSnapshot(), {\npackages/core/test/capture-store.test.ts:1210:    }).snapshot;\npackages/core/test/capture-store.test.ts:1212:    const [marchId, juneId, venueId] = snapshot.captures.map(\npackages/core/test/capture-store.test.ts:1217:    // and a snapshot with a supersession link in it.\npackages/core/test/capture-store.test.ts:1218:    snapshot = apply(snapshot, {\npackages/core/test/capture-store.test.ts:1226:    }).snapshot;\npackages/core/test/capture-store.test.ts:1228:    const ambiguous = apply(snapshot, {\npackages/core/test/capture-store.test.ts:1238:    snapshot = apply(ambiguous.snapshot, {\npackages/core/test/capture-store.test.ts:1241:    }).snapshot;\npackages/core/test/capture-store.test.ts:1244:    const conflict = apply(snapshot, {\npackages/core/test/capture-store.test.ts:1253:    snapshot = apply(conflict.snapshot, {\npackages/core/test/capture-store.test.ts:1260:    }).snapshot;\npackages/core/test/capture-store.test.ts:1263:    snapshot = apply(snapshot, {\npackages/core/test/capture-store.test.ts:1267:    }).snapshot;\npackages/core/test/capture-store.test.ts:1276:      parseCaptureStoreSnapshot(JSON.parse(JSON.stringify(snapshot))),\npackages/core/test/capture-store.test.ts:1277:    ).toEqual(snapshot);\npackages/core/test/capture-store.test.ts:1279:      captures: snapshot.captures.length,\npackages/core/test/capture-store.test.ts:1280:      issues: snapshot.issues.length,\npackages/core/test/capture-store.test.ts:1281:      events: snapshot.events.length,\npackages/core/test/capture-store.test.ts:1290:    const captureId = created.snapshot.captures[0]!.id;\npackages/core/test/capture-store.test.ts:1292:      applyCaptureStoreCommand(created.snapshot, {\npackages/core/test/capture-store.test.ts:1304:    const retracted = apply(created.snapshot, {\npackages/core/test/capture-store.test.ts:1310:    expect(deriveCaptureStatus(retracted.snapshot, captureId)).toBe(\npackages/core/test/capture-store.test.ts:1313:    expect(retracted.snapshot.captures[0]).not.toHaveProperty(\"status\");\npackages/core/test/capture-store.test.ts:1314:    expect(retracted.snapshot.events.at(-1)).toMatchObject({\n",
  "exitCode": 0
}
```

## Assistant

We should stop asking one scenario to serve every proof role:

```text
Evaluation corpus
├─ Vestera Coatings
│  └─ cold-start elicitation quality benchmark
├─ Industrial gas: PN → SPN → SCPN → DCPN → SDCPN
│  └─ semantic/projection complexity ladder
├─ Yannis’s reference nets
│  └─ reviewed projection targets and shared team vocabulary
└─ Confirmed September case
   └─ live product narrative and optimisation handoff
```

Vestera remains useful until another case has both a net **and** an interviewable source-of-truth pack.

The baseline reset should compare three conditions on the same model/version and situation pack:

1. Bare Claude.
2. Best current flat elicitation prompt.
3. Brunch cold-start runbook.

Never overwrite prior runs. Version prompts/protocols and preserve immutable run records. Brunch must beat the prompt baseline on computed coverage, provenance, uncertainty/conflict preservation, stopping, and projectable output—not merely conversational quality.

For fixture organization, I suggest vocabulary and placement by role:

```text
evaluations/
├─ cases/                 reusable domain corpus
│  ├─ vestera-coatings/
│  └─ industrial-gas/
├─ protocols/             versioned comparison procedures and prompts
└─ oracles/               reviewed semantic expectations

packages/*/test/fixtures/ exact package-contract inputs
apps/*/test/fixtures/     application/integration inputs

docs/planning/<effort>/
└─ evaluations/<dated-run>/
   └─ immutable outputs, legibility rendering, strain, witness, verdict
```

Definitions:

- **Case/corpus:** reusable domain truth.
- **Fixture:** exact input owned by one test boundary.
- **Run snapshot:** observed evidence, never overwritten.
- **Golden/oracle:** a reviewed claim distilled from a snapshot—not necessarily the entire output.

This avoids brittle “whole LLM transcript equals golden” tests while allowing witnessed findings to graduate into regression oracles.

One crucial question: **do Dora and Yannis’s materials include enough narrative/expert facts to establish expected requirements, or only the resulting nets?** If only nets, they are immediately useful as projection-complexity fixtures, but not yet as cold-start elicitation benchmarks.

## User

I like that topology and agree in every part except `docs/planning/<effort>/` -- I worry that 'effort' is now a competing ordering principle to our STEERING.md doc

For use-case descriptions and PN / SDCPN models thereof, this is all still in motion and hasn't settled; some were already mentioned in @docs/reference/2026-08 SDCPNs for cyber-physical systems.md and there are some JSON net representations of those I can give you, but the rest is in flux. Claude in Slack made me the following summary--you won't be able to open the links, but I can:

---

There are two competing use-case tracks, and the one you were given in the brunch:left_right_arrow:Petrinaut sync has since been overridden — that's probably the thing that matters most to you.

Track A — the blog-post nets (these exist)
Seven nets, all as Petrinaut JSON in the blog post Drive folder, built by Dora for the SDCPN generalisation blog post:
• gases-1-spn → gases-5-sdcpn — one industrial gas supply chain modelled five times, climbing the formalism ladder SPN → CPN → DCPN → SDCPN-with-diffusion. This is the "you can translate any model of the world into an SDCPN" argument ARIA asked for..
• truck-fleet-predictive-maintenance and semiconductor-fab-drift — the same formalism applied to two other domains..

Review state, from the blog thread: Yannis ran a maths-conformance pass and found the coloured nets lacked stochastic firing, net 2's DEs were fake (clocks dressed as differential equations), and the semiconductor/truck DEs were just constant assignments. Dora fixed all of that. The one open item is net 5 — Petrinaut only integrates ODEs today, so diffusion is faked by a kernel every 0.5h; Chris says real SDE support is small (expose diffusion alongside drift, x: [1, 0.5]) and that Coherence decided in Bristol they need SDEs after all, so it's worth doing rather than working around.

Track B — biopharma (where it's heading)
Dei pushed back on all three: the demo should match the problem curriculum/ladder dataset, on the grounds that live-presenting a domain we actually know is safer. No nets exist for this yet. Candidates:
• Supply allocation — from the problem curriculum doc; optimise the allocation decision logic as a stand-in for an AI controller. Ciaran flags it as probably quite complicated..
• Inventory purchasing — no doc yet; optimise order quantity and rate, trading overstock cost (quantity × time) against production delay..
• Nora's vaccine supply chain from Zulip — batches in QC, expiry as waste, two products one refrigerated. Dei doesn't like "clinics order at random" but does want the surrounding artefacts (batch-release SOP, order-history CSV, planner persona) built either way, as backtest material for extraction and process mining..

The conflict to resolve
Point 7 of the brunch↔Petrinaut agreement fixed the use case as truck fleet or semiconductor, and your Sept MVP deliverable (elicit SDCPN in Petrinaut, generate net, view IR) is scoped against that. Dei's biopharma steer lands after it and isn't reconciled anywhere. Dora's vote deadline is tomorrow, Tue 25th, and it's on the TA1.3 sync agenda for the second half. If biopharma wins, the demo needs a net that doesn't exist yet, which is a different shape of work for you than pointing brunch at an existing one.

Yannis
He isn't building nets. His output is the formalism and the curriculum scaffolding:
• Difficulty ladder L0–L5 + grading dimensions in the Final Exam doc — this is the main thing. He finished editing it and posted for collective review on Zulip (#58 Problem Curriculum Design → Semantic Ladder), asking for feedback by EOD Wed 26 Aug. Tracked as SOL-89, under SOL-88..
• Instance schema — he handed this to Dora: port the blog-post supply chain nets and split them per ladder rung, each with a list of state specifications ("are there any raw material tokens whose temperature fell below 80°C?"). SOL-90, blocked by SOL-89..
• Maths documentation — a Reference/formalism page on hash.dev/docs/petrinaut pulling from internal-docs/petri-nets, two-way linked to the glossary: FE-1323, H-6662, glossary content in FE-1458 and FE-1430..

His net review lives only as messages in that blog thread, not as a document, so if you want his read on model quality that thread is the source.

## Assistant

This clarifies the roles—and corrects my earlier attribution: Yannis supplies the **ladder, grading dimensions, and instance schema**, not the reference nets.

```text
Frontier 0 — make the claim decidable
├─ Use-case state gate
│  ├─ Track A: existing blog-post nets
│  │  ├─ gas formalism ladder
│  │  ├─ truck fleet
│  │  └─ semiconductor fab
│  └─ Track B: biopharma
│     ├─ domain artifacts partly available
│     ├─ no reference net
│     └─ substantially more preparatory work if selected
│
├─ Evaluation reference surfaces
│  ├─ Vestera → cold-start elicitation benchmark
│  ├─ Blog JSON → projection/conformance corpus
│  ├─ SOL-89 → complexity ladder and grading protocol
│  └─ SOL-90 → case-instance/state-specification schema
│
├─ Demonstration proof
│  ├─ bounded change with visible consequence
│  ├─ provenance back to evidence
│  └─ witnessed legibility artifact
│
└─ Missing mappings
   ├─ baseline-v2 protocol and rerun
   ├─ ingestion/versioning of Dora’s seven nets
   ├─ Yannis review/conformance snapshot
   ├─ biopharma case + reference net if selected
   ├─ SDE support dependency if gas level 5 matters
   └─ optimisation handoff contract
```

The tracks imply different work:

- **Track A:** Brunch can target reviewed, existing nets. The risk is elicitation/projection quality.
- **Track B:** the team must first establish domain truth, a reference model, state specifications, and optimisation intent. That preparation joins the critical path.
- Regardless of the vote, the blog nets remain valuable as a formalism-complexity corpus.

I would begin the baseline reset independently:

```text
B0  bare current Claude
B1  strongest current flat prompt
T1  Brunch build-from-scratch runbook
```

Version the protocol, prompt, model, and runs. Re-run B0 and B1 soon; add T1 when executable.

On documentation topology: agreed. **Effort should become metadata, not the filesystem’s organizing authority.** A better target is:

```text
docs/
├─ control/       STEERING, COORDINATION, active ledgers
├─ specs/         current obligation-bearing contracts
├─ adr/           settled decisions
├─ evidence/
│  ├─ proofs/<claim>/
│  └─ evaluations/<protocol>/<run-id>/
├─ reference/     settled source material
└─ archive/       superseded records
```

Executable evaluation material remains outside docs:

```text
evaluations/
├─ cases/
├─ protocols/
└─ oracles/
```

STEERING links objectives/frontiers to immutable evidence; evidence is organized by the claim or protocol it supports, not by whichever “effort” happened to produce it.

Please send the seven JSON nets when convenient. They are useful regardless of tomorrow’s use-case decision. A Slack export of Yannis’s review would also let us preserve its conformance findings as a proper evidence snapshot.

## User

The JSON nets are now in @docs/inbox/SDCPNs

## Assistant

I’ll inventory the nets as candidate corpus material—identities, formalism level, schema shape, and obvious completeness/conformance signals—without yet declaring them settled reference fixtures. Because they are now being used, I’ll also register their inbox status under the documentation protocol.

**Tool Use:** `shell_command`

```json
{
  "command": "find docs/inbox/SDCPNs -maxdepth 2 -type f -print | sort; printf '%s\\n' '--- sizes'; find docs/inbox/SDCPNs -maxdepth 2 -type f -exec wc -c {} + | sort -n",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "git status --short -- docs/inbox/SDCPNs docs/INDEX.md; printf '%s\\n' '--- all status'; git status --short",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "find docs/inbox/SDCPNs -maxdepth 2 -type f -name '*.json' -print0 | while IFS= read -r -d '' f; do printf '\\n=== %s ===\\n' \"$f\"; jq -r '\"type=\" + (type), (if type == \"object\" then \"keys=\" + (keys|join(\",\")) else \"length=\" + (length|tostring) end)' \"$f\" 2>&1; done",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

## User

**Tool Result:** `TU-034CgbqCwlvLobV0Oupi7B`

```
{
  "output": "docs/inbox/SDCPNs/gases-1-pn-consumption-trigger-layout.json\ndocs/inbox/SDCPNs/gases-1-pn-layout.json\ndocs/inbox/SDCPNs/gases-2-spn-layout.json\ndocs/inbox/SDCPNs/gases-3-cpn-layout.json\ndocs/inbox/SDCPNs/gases-4-dcpn-layout.json\ndocs/inbox/SDCPNs/semiconductor-fab-drift-layout.json\ndocs/inbox/SDCPNs/truck-fleet-predictive-maintenance-layout.json\n--- sizes\n   13774 docs/inbox/SDCPNs/gases-1-pn-layout.json\n   14262 docs/inbox/SDCPNs/gases-1-pn-consumption-trigger-layout.json\n   30679 docs/inbox/SDCPNs/gases-2-spn-layout.json\n   41070 docs/inbox/SDCPNs/gases-3-cpn-layout.json\n   64493 docs/inbox/SDCPNs/gases-4-dcpn-layout.json\n   97303 docs/inbox/SDCPNs/truck-fleet-predictive-maintenance-layout.json\n  104228 docs/inbox/SDCPNs/semiconductor-fab-drift-layout.json\n  365809 total\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-034CgbqDv4jy6S1gTtHUhg`

```
{
  "output": "?? docs/inbox/SDCPNs/\n--- all status\n M docs/agents/git-workflow.md\n M docs/agents/issue-writing.md\n M docs/agents/legibility.md\n M docs/planning/_shared/STEERING.md\n M docs/planning/_shared/hash-monorepo-import-plan.md\n?? docs/inbox/SDCPNs/\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-034CgbqF5bHRM4uNxTX6DR`

```
{
  "output": "\n=== docs/inbox/SDCPNs/truck-fleet-predictive-maintenance-layout.json ===\ntype=object\nkeys=componentInstances,differentialEquations,meta,metrics,parameters,places,scenarios,subnets,title,transitions,types,version\n\n=== docs/inbox/SDCPNs/gases-1-pn-layout.json ===\ntype=object\nkeys=componentInstances,differentialEquations,meta,metrics,parameters,places,scenarios,subnets,title,transitions,types,version\n\n=== docs/inbox/SDCPNs/gases-2-spn-layout.json ===\ntype=object\nkeys=componentInstances,differentialEquations,meta,metrics,parameters,places,scenarios,subnets,title,transitions,types,version\n\n=== docs/inbox/SDCPNs/gases-4-dcpn-layout.json ===\ntype=object\nkeys=componentInstances,differentialEquations,meta,metrics,parameters,places,scenarios,subnets,title,transitions,types,version\n\n=== docs/inbox/SDCPNs/gases-1-pn-consumption-trigger-layout.json ===\ntype=object\nkeys=componentInstances,differentialEquations,meta,metrics,parameters,places,scenarios,subnets,title,transitions,types,version\n\n=== docs/inbox/SDCPNs/gases-3-cpn-layout.json ===\ntype=object\nkeys=componentInstances,differentialEquations,meta,metrics,parameters,places,scenarios,subnets,title,transitions,types,version\n\n=== docs/inbox/SDCPNs/semiconductor-fab-drift-layout.json ===\ntype=object\nkeys=componentInstances,differentialEquations,meta,metrics,parameters,places,scenarios,subnets,title,transitions,types,version\n",
  "exitCode": 0
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "for f in docs/inbox/SDCPNs/*.json; do jq -r --arg f \"$f\" '[ $f, (.title // \"\"), (.version|tostring), (.places|length|tostring), (.transitions|length|tostring), (.types|length|tostring), (.differentialEquations|length|tostring), (.parameters|length|tostring), (.scenarios|length|tostring), (.metrics|length|tostring), (.subnets|length|tostring), (.componentInstances|length|tostring) ] | @tsv' \"$f\"; done | (printf 'file\\ttitle\\tversion\\tplaces\\ttransitions\\ttypes\\tDEs\\tparameters\\tscenarios\\tmetrics\\tsubnets\\tcomponents\\n'; cat)",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "for f in docs/inbox/SDCPNs/*.json; do printf '\\n=== %s ===\\n' \"$(basename \"$f\")\"; jq '{meta, typeNames: [.types[].name], differentialEquationNames: [.differentialEquations[].name], scenarioNames: [.scenarios[].name], metricNames: [.metrics[].name]}' \"$f\"; done",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "rg -n \"parseSDCPNFile|SDCPNFile\" ../../../libs/@hashintel/petrinaut-core ../../../libs/@hashintel/petrinaut --glob '*.ts' | head -120; jq -r '.name,.scripts' ../../../libs/@hashintel/petrinaut-core/package.json",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "rg -n 'SDCPNs|blog-post nets|gases-[1-5]|truck-fleet|semiconductor' docs/INDEX.md docs --glob '*.md' | head -120",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

## User

**Tool Result:** `TU-034Cgc9LrXSI6LVPzHZrft`

```
{
  "output": "file\ttitle\tversion\tplaces\ttransitions\ttypes\tDEs\tparameters\tscenarios\tmetrics\tsubnets\tcomponents\ndocs/inbox/SDCPNs/gases-1-pn-consumption-trigger-layout.json\tGases 1 — plain net, one customer (consumption trigger)\t1\t14\t8\t0\t0\t1\t2\t7\t0\t0\ndocs/inbox/SDCPNs/gases-1-pn-layout.json\tGases 1 — plain net, one customer\t1\t13\t8\t0\t0\t1\t2\t7\t0\t0\ndocs/inbox/SDCPNs/gases-2-spn-layout.json\tGases 2 — stochastic net, two customers on one tanker\t1\t25\t17\t0\t0\t9\t4\t12\t0\t0\ndocs/inbox/SDCPNs/gases-3-cpn-layout.json\tGases 3 — coloured net, three customers and a mixed fleet\t1\t36\t25\t1\t0\t9\t4\t11\t0\t0\ndocs/inbox/SDCPNs/gases-4-dcpn-layout.json\tGases 4 — dynamic coloured net\t1\t31\t26\t3\t3\t23\t5\t16\t0\t0\ndocs/inbox/SDCPNs/semiconductor-fab-drift-layout.json\tSemiconductor fab — process drift & multi-chamber tools (v2)\t1\t19\t25\t2\t5\t36\t4\t12\t0\t0\ndocs/inbox/SDCPNs/truck-fleet-predictive-maintenance-layout.json\tTruck fleet with condition-based maintenance (v2)\t1\t26\t26\t3\t7\t40\t11\t19\t0\t0\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-034Cgc9MXtB3TqEqHe24AQ`

```
{
  "output": "\n=== gases-1-pn-consumption-trigger-layout.json ===\n{\n  \"meta\": {\n    \"generator\": \"Petrinaut\"\n  },\n  \"typeNames\": [],\n  \"differentialEquationNames\": [],\n  \"scenarioNames\": [\n    \"Customer drawing normally\",\n    \"Customer shut, tank still evaporating\"\n  ],\n  \"metricNames\": [\n    \"Loads delivered\",\n    \"Stockouts\",\n    \"Vented through relief\",\n    \"Evaporated\",\n    \"Consumed\",\n    \"Contents plus ullage\",\n    \"Stranded customers\"\n  ]\n}\n\n=== gases-1-pn-layout.json ===\n{\n  \"meta\": {\n    \"generator\": \"Petrinaut\"\n  },\n  \"typeNames\": [],\n  \"differentialEquationNames\": [],\n  \"scenarioNames\": [\n    \"Customer drawing normally\",\n    \"Customer shut, tank still evaporating\"\n  ],\n  \"metricNames\": [\n    \"Loads delivered\",\n    \"Stockouts\",\n    \"Vented through relief\",\n    \"Evaporated\",\n    \"Consumed\",\n    \"Contents plus ullage\",\n    \"Stranded customers\"\n  ]\n}\n\n=== gases-2-spn-layout.json ===\n{\n  \"meta\": {\n    \"generator\": \"Petrinaut\"\n  },\n  \"typeNames\": [],\n  \"differentialEquationNames\": [],\n  \"scenarioNames\": [\n    \"Customers drawing normally\",\n    \"Customers shut, tanks still evaporating\",\n    \"A second tanker on the depot\",\n    \"Routes half again as long\"\n  ],\n  \"metricNames\": [\n    \"Loads delivered\",\n    \"Stockouts\",\n    \"Criticality-weighted stockouts\",\n    \"Vented through relief\",\n    \"Evaporated\",\n    \"Consumed\",\n    \"Share of outflow lost to boil-off\",\n    \"Stockouts per 100 units consumed\",\n    \"SteadyNitrogen stockouts\",\n    \"SlowNitrogen stockouts\",\n    \"Contents plus ullage\",\n    \"Stranded customers\"\n  ]\n}\n\n=== gases-3-cpn-layout.json ===\n{\n  \"meta\": {\n    \"generator\": \"Petrinaut\"\n  },\n  \"typeNames\": [\n    \"Tanker\"\n  ],\n  \"differentialEquationNames\": [],\n  \"scenarioNames\": [\n    \"Three tankers, normal routes\",\n    \"Three tankers, routes half again as long\",\n    \"Two tankers, normal routes\",\n    \"Three tankers, two of them oxygen\"\n  ],\n  \"metricNames\": [\n    \"Loads delivered\",\n    \"Stockouts\",\n    \"Criticality-weighted stockouts\",\n    \"Vented through relief\",\n    \"Evaporated\",\n    \"Consumed\",\n    \"SteadyNitrogen stockouts\",\n    \"SlowNitrogen stockouts\",\n    \"CriticalOxygen stockouts\",\n    \"Contents plus ullage\",\n    \"Stranded customers\"\n  ]\n}\n\n=== gases-4-dcpn-layout.json ===\n{\n  \"meta\": {\n    \"generator\": \"Petrinaut\"\n  },\n  \"typeNames\": [\n    \"Tanker\",\n    \"Tank\",\n    \"Plant\"\n  ],\n  \"differentialEquationNames\": [\n    \"Tank\",\n    \"Journey clock (on route)\",\n    \"Journey clock (returning)\"\n  ],\n  \"scenarioNames\": [\n    \"Three tankers, normal routes\",\n    \"Three tankers, routes half again as long\",\n    \"Two tankers, normal routes\",\n    \"SlowNitrogen throttled back\",\n    \"No spot hire\"\n  ],\n  \"metricNames\": [\n    \"Loads delivered\",\n    \"Stockouts\",\n    \"Criticality-weighted stockouts\",\n    \"Vented through relief\",\n    \"Evaporated\",\n    \"Surplus lost on delivery\",\n    \"Consumed\",\n    \"Stockouts per 100 units delivered to customers\",\n    \"SteadyNitrogen stockouts\",\n    \"SlowNitrogen stockouts\",\n    \"CriticalOxygen stockouts\",\n    \"Level in tanks\",\n    \"Relief valve openings\",\n    \"Pressure at SlowNitrogen\",\n    \"Tankers hired in\",\n    \"Plant outages\"\n  ]\n}\n\n=== semiconductor-fab-drift-layout.json ===\n{\n  \"meta\": {\n    \"generator\": \"Petrinaut\"\n  },\n  \"typeNames\": [\n    \"Lot\",\n    \"Chamber\"\n  ],\n  \"differentialEquationNames\": [\n    \"Lot urgency escalation (+ age, wait clocks)\",\n    \"Clock: process countdown (+ age)\",\n    \"Chamber wear and contamination (coupled)\",\n    \"Clock: maintenance countdown\",\n    \"Lot urgency escalation in batch queue (+ age, wait, batch clocks)\"\n  ],\n  \"scenarioNames\": [\n    \"Normal operation\",\n    \"High process drift\",\n    \"Frequent calibration\",\n    \"Reduced maintenance crew\"\n  ],\n  \"metricNames\": [\n    \"Throughput\",\n    \"Yield\",\n    \"Average cycle time (hours)\",\n    \"On-time delivery rate\",\n    \"Average process bias\",\n    \"Maximum chamber drift\",\n    \"Chamber utilisation\",\n    \"Maintenance events\",\n    \"Unplanned breakdowns\",\n    \"Calibrations\",\n    \"WIP level\",\n    \"Batch queue size\"\n  ]\n}\n\n=== truck-fleet-predictive-maintenance-layout.json ===\n{\n  \"meta\": {\n    \"generator\": \"Petrinaut\"\n  },\n  \"typeNames\": [\n    \"Truck\",\n    \"Load\",\n    \"Conditions\"\n  ],\n  \"differentialEquationNames\": [\n    \"Wear, fuel and road conditions (loaded)\",\n    \"Wear, fuel and road conditions (running back empty)\",\n    \"Clock: standing at the depot (age only)\",\n    \"Clock: service countdown\",\n    \"Clock: driver rest countdown\",\n    \"Clock: load ageing on the board\",\n    \"Regional weather drift (+ resample clock)\"\n  ],\n  \"scenarioNames\": [\n    \"Run to failure\",\n    \"Condition-based servicing\",\n    \"Servicing too early\",\n    \"Condition-based, worn trucks off mountain work\",\n    \"Condition-based, one bay\",\n    \"Condition-based, one part on the shelf\",\n    \"Winter conditions\",\n    \"Summer baseline\",\n    \"Demand surge\",\n    \"Winter + demand surge\",\n    \"Route-aware dispatch + winter\"\n  ],\n  \"metricNames\": [\n    \"Loads delivered on time\",\n    \"Loads delivered late\",\n    \"Loads dropped\",\n    \"Service level\",\n    \"Revenue\",\n    \"Total fuel burned\",\n    \"Operating cost\",\n    \"Profit\",\n    \"Roadside failures\",\n    \"Planned services\",\n    \"Unplanned repairs\",\n    \"Services deferred\",\n    \"Driver rest events\",\n    \"Trucks earning\",\n    \"Trucks off the road\",\n    \"Fleet utilisation\",\n    \"Average brake wear\",\n    \"Average engine wear\",\n    \"Average tyre wear\"\n  ]\n}\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-034Cgc9NKHsMYcpDroBIpm`

```
{
  "output": "../../../libs/@hashintel/petrinaut-core/src/file-format/parse-sdcpn-file.ts:123:export const parseSDCPNFile = (data: unknown): ImportResult => {\n../../../libs/@hashintel/petrinaut-core/src/file-format/parse-sdcpn-file.test.ts:3:import { parseSDCPNFile } from \"./parse-sdcpn-file\";\n../../../libs/@hashintel/petrinaut-core/src/file-format/parse-sdcpn-file.test.ts:33:describe(\"parseSDCPNFile\", () => {\n../../../libs/@hashintel/petrinaut-core/src/file-format/parse-sdcpn-file.test.ts:36:      const result = parseSDCPNFile({\n../../../libs/@hashintel/petrinaut-core/src/file-format/parse-sdcpn-file.test.ts:51:      const result = parseSDCPNFile({\n../../../libs/@hashintel/petrinaut-core/src/file-format/parse-sdcpn-file.test.ts:71:        const result = parseSDCPNFile({\n../../../libs/@hashintel/petrinaut-core/src/file-format/parse-sdcpn-file.test.ts:94:      const result = parseSDCPNFile({\n../../../libs/@hashintel/petrinaut-core/src/file-format/parse-sdcpn-file.test.ts:112:      const result = parseSDCPNFile({\n../../../libs/@hashintel/petrinaut-core/src/file-format/parse-sdcpn-file.test.ts:160:      const result = parseSDCPNFile({\n../../../libs/@hashintel/petrinaut-core/src/file-format/parse-sdcpn-file.test.ts:226:      const result = parseSDCPNFile({\n../../../libs/@hashintel/petrinaut-core/src/file-format/parse-sdcpn-file.test.ts:245:      const result = parseSDCPNFile({\n../../../libs/@hashintel/petrinaut-core/src/file-format/parse-sdcpn-file.test.ts:269:      const result = parseSDCPNFile({\n../../../libs/@hashintel/petrinaut-core/src/file-format/parse-sdcpn-file.test.ts:284:      const result = parseSDCPNFile(minimalSDCPN);\n../../../libs/@hashintel/petrinaut-core/src/file-format/parse-sdcpn-file.test.ts:293:      const result = parseSDCPNFile(minimalSDCPN);\n../../../libs/@hashintel/petrinaut-core/src/file-format/parse-sdcpn-file.test.ts:305:      const result = parseSDCPNFile({\n../../../libs/@hashintel/petrinaut-core/src/file-format/parse-sdcpn-file.test.ts:316:      const result = parseSDCPNFile({\n../../../libs/@hashintel/petrinaut-core/src/file-format/parse-sdcpn-file.test.ts:327:      const result = parseSDCPNFile({\n../../../libs/@hashintel/petrinaut-core/src/file-format/parse-sdcpn-file.test.ts:360:      const result = parseSDCPNFile({\n../../../libs/@hashintel/petrinaut-core/src/file-format/parse-sdcpn-file.test.ts:372:      const result = parseSDCPNFile({\n../../../libs/@hashintel/petrinaut-core/src/file-format/parse-sdcpn-file.test.ts:389:      const result = parseSDCPNFile({\n../../../libs/@hashintel/petrinaut-core/src/file-format/parse-sdcpn-file.test.ts:407:      const result = parseSDCPNFile(minimalSDCPN);\n../../../libs/@hashintel/petrinaut-core/src/file-format/parse-sdcpn-file.test.ts:419:      const result = parseSDCPNFile({\n../../../libs/@hashintel/petrinaut-core/src/file-format/parse-sdcpn-file.test.ts:431:      const result = parseSDCPNFile({\n../../../libs/@hashintel/petrinaut-core/src/file-format/parse-sdcpn-file.test.ts:445:      const result = parseSDCPNFile({\n../../../libs/@hashintel/petrinaut-core/src/file-format/parse-sdcpn-file.test.ts:457:      const result = parseSDCPNFile(null);\n../../../libs/@hashintel/petrinaut-core/src/file-format/parse-sdcpn-file.test.ts:462:      const result = parseSDCPNFile(\"not a json object\");\n../../../libs/@hashintel/petrinaut-core/src/file-format/parse-sdcpn-file.test.ts:467:      const result = parseSDCPNFile({});\n../../../libs/@hashintel/petrinaut-core/src/file-format/parse-sdcpn-file.test.ts:472:      const result = parseSDCPNFile({\n../../../libs/@hashintel/petrinaut-core/src/file-format/parse-sdcpn-file.test.ts:484:      const result = parseSDCPNFile({ title: \"Test\" });\n../../../libs/@hashintel/petrinaut-core/src/index.ts:440:  parseSDCPNFile,\n../../../libs/@hashintel/petrinaut-core/src/optimization.ts:3:import { parseSDCPNFile } from \"./file-format/parse-sdcpn-file\";\n../../../libs/@hashintel/petrinaut-core/src/optimization.ts:160:    const parsed = parseSDCPNFile({ ...model.definition, title: model.title });\n../../../libs/@hashintel/petrinaut/src/ui/file-io/import-sdcpn.ts:1:import { type ImportResult, parseSDCPNFile } from \"@hashintel/petrinaut-core\";\n../../../libs/@hashintel/petrinaut/src/ui/file-io/import-sdcpn.ts:5: * {@link parseSDCPNFile} (which lives in `/core/file-format/`). Returns null\n../../../libs/@hashintel/petrinaut/src/ui/file-io/import-sdcpn.ts:29:          resolve(parseSDCPNFile(loadedData));\n../../../libs/@hashintel/petrinaut-core/src/lsp/lib/file-paths.ts:6:export type SDCPNFileType =\n../../../libs/@hashintel/petrinaut-core/src/lsp/lib/file-paths.ts:48:export const getItemFilePath = <T extends SDCPNFileType>(\n@hashintel/petrinaut-core\n{\n  \"build\": \"vite build\",\n  \"fix:eslint\": \"oxlint --fix --type-aware --report-unused-disable-directives-severity=error .\",\n  \"lint:eslint\": \"oxlint --type-aware --report-unused-disable-directives-severity=error .\",\n  \"lint:tsc\": \"tsgo --noEmit\",\n  \"prepack\": \"node ../../../scripts/check-package-payload.mjs\",\n  \"prepublishOnly\": \"turbo run build\",\n  \"test:unit\": \"vitest\"\n}\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-034Cgc9PlRwgOvjfoEcmFY`

```
{
  "output": "docs/INDEX.md:24:| [2026-08 SDCPNs for cyber-physical systems](reference/2026-08%20SDCPNs%20for%20cyber-physical%20systems.md) | settled | 2026-08 (settled 2026-08-18) | Unattributed draft blog post (image placeholders, typos): five-level SDCPN explainer applied to gas supply, truck fleet, semiconductor fab; arrived during the FE-1405 arc. Read skeptically: good pedagogy, promotional register — concedes its formal guarantees don't apply once continuous/stochastic features are used (open research problem), models carry heavy kernel/guard logic that strains the \"formal and inspectable\" claim, and Petrinaut's integrator limitation is admitted | Register-3 background (projection-target expressivity) only; not elicitation design input; no consumer yet |\ndocs/INDEX.md:24:| [2026-08 SDCPNs for cyber-physical systems](reference/2026-08%20SDCPNs%20for%20cyber-physical%20systems.md) | settled | 2026-08 (settled 2026-08-18) | Unattributed draft blog post (image placeholders, typos): five-level SDCPN explainer applied to gas supply, truck fleet, semiconductor fab; arrived during the FE-1405 arc. Read skeptically: good pedagogy, promotional register — concedes its formal guarantees don't apply once continuous/stochastic features are used (open research problem), models carry heavy kernel/guard logic that strains the \"formal and inspectable\" claim, and Petrinaut's integrator limitation is admitted | Register-3 background (projection-target expressivity) only; not elicitation design input; no consumer yet |\ndocs/reference/SDCPN Library - Ideas.md:86:This example is particularly effective because it combines physics (component wear and degradation), real-time sensing, predictive analytics, and operational decision-making. The cyber system must continuously estimate each vehicle's health, predict future failures, and coordinate maintenance without unnecessarily disrupting fleet operations. It showcases SDCPNs' ability to model systems where continuous degradation, stochastic failures, resource allocation, and logistics interact over long time horizons.\ndocs/reference/SDCPN Library - Ideas.md:158:This is a particularly compelling SDCPN example because it couples human behaviour, communication infrastructure, continuous traffic dynamics, and discrete control decisions. Unlike many CPS examples where the physical dynamics arise from machines or vehicles, here the driving force is the stochastic movement and behaviour of large populations, making it an excellent demonstration that SDCPNs can model systems where cyber decisions adapt continuously to changing human activity. It also illustrates an important optimisation objective that is easy for a non-technical audience to grasp: _providing enough network capacity where and when people need it, while minimizing the energy consumed by thousands of cell towers._\ndocs/reference/2026-08 SDCPNs for cyber-physical systems.md:1:# SDCPNs for cyber-physical systems\ndocs/reference/2026-08 SDCPNs for cyber-physical systems.md:3:_One formalism for continuous dynamics, stochastic events and typed state, demonstrated across industrial gas supply, truck fleet maintenance, and semiconductor fabrication._\ndocs/reference/2026-08 SDCPNs for cyber-physical systems.md:27:The four features together allow SDCPNs to represent all aspects of a cyber-physical system in the same state and clock: its physical process (a tank emptying, a machine wearing), control logic (when to dispatch, when to service), and the randomness that affects both (a breakdown, a demand spike).\ndocs/reference/2026-08 SDCPNs for cyber-physical systems.md:29:## Where SDCPNs come from\ndocs/reference/2026-08 SDCPNs for cyber-physical systems.md:35:# Modelling real world with SDCPNs\ndocs/reference/2026-08 SDCPNs for cyber-physical systems.md:37:The following sections model an industrial supply chain process progressively, adding one feature of the formalism at each level until the model is a full SDCPN. To illustrate the expressivity of SDCPNs, we model two further domains as full SDCPNs: truck fleet maintenance and semiconductor fabrication.\ndocs/reference/2026-08 SDCPNs for cyber-physical systems.md:111:Introducing noise and randomness to the dynamics in SDCPNs enables us to answer questions on the system’s varying environment. One limitation of this model is specific to the current Petrinaut engine: its integrator handles only deterministic ODEs, so diffusion is injected discretely via a kernel every 0.5 simulated hours rather than continuously. The approximation works, but its quality depends on the step size the model builder chooses rather than improving automatically as the engine's time step shrinks.\ndocs/reference/2026-08 SDCPNs for cyber-physical systems.md:115:SDCPNs can be used for truck fleet operators to solve their maintenance problem, in deciding when and where they should service each vehicle. The service must occur early enough to prevent a breakdown on the road, and late enough not to waste maintenance capacity. The maintenance schedule must ensure deliveries are still completed within the agreed window.\ndocs/reference/2026-08 SDCPNs for cyber-physical systems.md:135:A semiconductor foundry processes batches of wafers (wafer lots) through 28 steps using shared machines. The same machine group handles multiple steps in the sequence, for example the same lithography group is visited at layers 0, 4, 9, 12, 16, 20, and 24, so wafer lots at different stages compete for the same machines.\ndocs/reference/2026-08 SDCPNs for cyber-physical systems.md:163:## Why SDCPNs?\ndocs/reference/2026-08 SDCPNs for cyber-physical systems.md:185:- **Rare-event probabilities can be quantified.** Some failures are too rare to observe in ordinary Monte Carlo, estimating a probability of 10⁻⁹ would need billions of runs. SDCPNs support acceleration methods ([importance sampling](https://doi.org/10.1109/acc.2011.5991305), [interacting particle systems](https://doi.org/10.1201/9781420008548.ch10)) that exploit the net's structure (strong Markov property) to estimate these probabilities efficiently.\ndocs/reference/2026-08 SDCPNs for cyber-physical systems.md:189:This post applied SDCPNs to model three domains: industrial gas supply, truck fleet maintenance and semiconductor fabrication. We explored what each feature from the formalism adds, where by:\ndocs/planning/legibility-sweep/issue-pr-migration-2026-08-20/review/linear-editorial-review.md:33:- **FE-1363 — STATUS_DRIFT:** Resolved. The outer identifies truck-fleet predictive maintenance as the engineering recommendation pending team agreement, cold chain as the runner-up, and production scheduling as the baseline.\ndocs/planning/process-model-elicitation/ir-design-plain.md:31:Layer B is a working design, validated only against the truck-fleet reference case. The worked-examples exercise left it unchanged, except that it exported source-regime up to Layer A. The harness still gets its turn.\ndocs/planning/process-model-elicitation/notes/grilling-inputs-2026-08-12.md:85:  technical criterion; candidates truck-fleet / cold-chain / scheduling.\ndocs/planning/process-model-elicitation/research/petrinaut-survey.md:191:> (SDCPNs) in Petrinaut.\ndocs/planning/process-model-elicitation/ir-design.md:86:A working design, validated only against the truck-fleet reference case (FE-1363). The\ndocs/planning/legibility-sweep/issue-pr-migration-2026-08-20/review/linear-FE-1357.md:13:This issue is the planning map for that demo: each decision that must be made before serious building starts is a sub-issue below, and the sections after the divider index what's decided and what's still open. Status: the groundwork research is done, and three big decisions have landed — the demo will be a purpose-built demo app that uses a new interviewing library and Petrinaut's existing libraries side by side, passing a model file between them, rather than building the interviewer into Petrinaut itself (2026-08-12); the demo's reference use case is truck-fleet predictive maintenance (recommended to the team, ratification expected ~18 August), with the interviewee played from a prepared briefing rather than requiring a live domain expert (2026-08-12); and the form interview knowledge is stored in is settled (2026-08-13) — the store is the set of recorded, source-traceable statements the expert made, and the runnable diagram is one view generated from it, so everything an expert says that has no place in a diagram (reasons, policies, unwritten rules) is kept rather than lost. Next: pressure-test that storage definition against more plugin kinds, then write the plugin spec once the team ratifies the use case. Planning documents live in the brunch-lite repo under `docs/planning/process-model-elicitation/`.\ndocs/planning/legibility-sweep/issue-pr-migration-2026-08-20/review/linear-FE-1357.md:145:**Title:** Source dossier: published fleet-maintenance models + operational data for the truck-fleet case → **Compile the truck-fleet source dossier**\ndocs/planning/legibility-sweep/issue-pr-migration-2026-08-20/review/linear-FE-1357.md:153:Find published fleet-maintenance models, public operational data, and practitioner evidence sufficient to author the truck-fleet situation pack, reference net, and answer key without a live expert. Record licenses and granularity, and pay particular attention to models of per-vehicle degradation. The dossier resolves the sourcing part of FE-1363; situation-pack authoring waits for team feedback on PRO-99.\ndocs/planning/process-model-elicitation/notes/research-patterns-audit.md:45:**The VUT earning test, and colour as a folding.** Two results that turn \"which formalism features does this system need?\" from taste into tests. The Kingman/VUT relation from queueing theory says queue time scales with variability times utilization times service time — so stochastic modelling is _earned_ when utilization is high or variability is large, and genuinely unnecessary when both are low and the question concerns a mean. Conversely, coloured tokens add no expressive power at all: a coloured net with finite colour sets unfolds mechanically into a plain net, so colour is compactness and maintainability — an engineering convenience, not a capability a system can \"need.\" Together these retired the effort's earlier \"formalism ladder\" framing (which ranked features by prestige) in favor of per-capability evidence tests, and they ground the showcase criterion that chose the truck-fleet case: the one thing that genuinely earns dynamic per-entity state is a continuous quantity gating a threshold-crossing question. Also derived from VUT: the \"too-good agreement\" checklist — when the simulation matches the spreadsheet, check utilization first; agreement is suspicious only when utilization is high.\n",
  "exitCode": 0
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "jq '{name,exports,type}' libs/@hashintel/petrinaut-core/package.json; test -d libs/@hashintel/petrinaut-core/dist && find libs/@hashintel/petrinaut-core/dist -maxdepth 1 -type f | head",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 10000
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "sed -n '110,175p' libs/@hashintel/petrinaut-core/src/file-format/parse-sdcpn-file.ts; sed -n '430,448p' libs/@hashintel/petrinaut-core/src/index.ts",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 10000
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "rg -n '\"tsx\"|\"ts-node\"|\"vite-node\"' package.json yarn.lock | head -40",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 10000
}
```

## User

**Tool Result:** `TU-034CgcPj1P0Nf5yAwTvEvq`

```
{
  "output": "{\n  \"name\": \"@hashintel/petrinaut-core\",\n  \"exports\": {\n    \".\": {\n      \"types\": \"./dist/index.d.d.ts\",\n      \"import\": \"./dist/index.js\"\n    },\n    \"./ai\": {\n      \"types\": \"./dist/ai.d.d.ts\",\n      \"import\": \"./dist/ai.js\"\n    },\n    \"./compiled-model\": {\n      \"types\": \"./dist/compiled-model.d.d.ts\",\n      \"import\": \"./dist/compiled-model.js\"\n    },\n    \"./examples\": {\n      \"types\": \"./dist/examples/index.d.d.ts\",\n      \"import\": \"./dist/examples/index.js\"\n    },\n    \"./hir\": {\n      \"types\": \"./dist/hir.d.d.ts\",\n      \"import\": \"./dist/hir.js\"\n    },\n    \"./hir-runtime\": {\n      \"types\": \"./dist/hir-runtime.d.d.ts\",\n      \"import\": \"./dist/hir-runtime.js\"\n    },\n    \"./optimization\": {\n      \"types\": \"./dist/optimization.d.d.ts\",\n      \"import\": \"./dist/optimization.js\"\n    },\n    \"./workers/lsp\": {\n      \"types\": \"./dist/workers/lsp.d.d.ts\",\n      \"import\": \"./dist/workers/lsp.js\"\n    },\n    \"./workers/monte-carlo\": {\n      \"types\": \"./dist/workers/monte-carlo.d.d.ts\",\n      \"import\": \"./dist/workers/monte-carlo.js\"\n    },\n    \"./workers/simulation\": {\n      \"types\": \"./dist/workers/simulation.d.d.ts\",\n      \"import\": \"./dist/workers/simulation.js\"\n    },\n    \"./package.json\": \"./package.json\"\n  },\n  \"type\": \"module\"\n}\nlibs/@hashintel/petrinaut-core/dist/language-server.worker-CdgJLTC7.js.map\nlibs/@hashintel/petrinaut-core/dist/hir-C8Dn6nC5.js\nlibs/@hashintel/petrinaut-core/dist/examples-CAEchurz.js\nlibs/@hashintel/petrinaut-core/dist/ai.js\nlibs/@hashintel/petrinaut-core/dist/extensions-DPGqwj9E.js.map\nlibs/@hashintel/petrinaut-core/dist/instantiate-C0T6Bd80.js.map\nlibs/@hashintel/petrinaut-core/dist/protocol-Cu-9ylyx.d.ts\nlibs/@hashintel/petrinaut-core/dist/environment-Cf4KfzoD.d.ts\nlibs/@hashintel/petrinaut-core/dist/hir-metric-Bt36EA1z.js\nlibs/@hashintel/petrinaut-core/dist/language-server.worker-CdgJLTC7.js\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-034CgcPjnmPc7HtfdIbzKv`

```
{
  "output": "      componentInstances: (subnet.componentInstances ?? []).map((instance) => ({\n        ...instance,\n        x: instance.x ?? 0,\n        y: instance.y ?? 0,\n      })),\n    })),\n  }) as SDCPNWithTitle;\n\n/**\n * Parses raw JSON data into an SDCPN, handling versioned, legacy, and old\n * pre-2025-11-28 formats. Pure — no DOM, no I/O. Callers (e.g. the `/ui`\n * file-picker wrapper) are responsible for sourcing the data.\n */\nexport const parseSDCPNFile = (data: unknown): ImportResult => {\n  // Try the versioned format first\n  const versioned = sdcpnFileSchema.safeParse(data);\n  if (versioned.success) {\n    const { version: _version, meta: _meta, ...sdcpnData } = versioned.data;\n    return {\n      ok: true,\n      sdcpn: fillMissingVisualInfo(sdcpnData),\n      hadMissingPositions: hasMissingPositions(sdcpnData),\n    };\n  }\n\n  // If the data has a `version` field but failed the versioned schema, reject it\n  // rather than falling through to the legacy path (which would silently accept\n  // future-versioned files by stripping the unknown `version` key).\n  if (typeof data === \"object\" && data !== null && \"version\" in data) {\n    const version = (data as { version: unknown }).version;\n    if (\n      typeof version === \"number\" &&\n      version >= 1 &&\n      version <= SDCPN_FILE_FORMAT_VERSION\n    ) {\n      // Supported version but invalid structure — show actual Zod errors\n      return {\n        ok: false,\n        error: `Invalid SDCPN file: ${versioned.error.issues.map((i) => `${i.path.join(\".\")}: ${i.message}`).join(\", \")}`,\n      };\n    }\n    return {\n      ok: false,\n      error: \"Unsupported SDCPN file format version\",\n    };\n  }\n\n  // Fall back to legacy format (current schema without version/meta)\n  const legacy = legacySdcpnFileSchema.safeParse(data);\n  if (legacy.success) {\n    return {\n      ok: true,\n      sdcpn: fillMissingVisualInfo(legacy.data),\n      hadMissingPositions: hasMissingPositions(legacy.data),\n    };\n  }\n\n  return {\n    ok: false,\n    error: `Invalid SDCPN file: ${legacy.error.issues.map((i) => i.message).join(\", \")}`,\n  };\n};\n} from \"./simulation/engine/uuid\";\nexport {\n  displayNameSchema,\n  validateDisplayName,\n} from \"./validation/display-name\";\nexport { entityNameSchema, validateEntityName } from \"./validation/entity-name\";\nexport { validateVariableName } from \"./validation/variable-name\";\n\n// --- File, clipboard, and editor protocol helpers ---\nexport {\n  parseSDCPNFile,\n  type ImportResult,\n} from \"./file-format/parse-sdcpn-file\";\nexport { serializeSDCPN } from \"./file-format/serialize-sdcpn\";\nexport { sdcpnToTikZ } from \"./file-format/sdcpn-to-tikz\";\nexport { pastePayloadIntoSDCPN } from \"./clipboard/paste\";\nexport {\n  parseClipboardPayload,\n  serializeSelection,\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-034CgcPkHtPRy0FIzS5vN9`

```
{
  "output": "",
  "exitCode": 0
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "node --input-type=module <<'NODE'\nimport { readFile, readdir } from 'node:fs/promises';\nimport { join } from 'node:path';\nimport { parseSDCPNFile } from './libs/@hashintel/petrinaut-core/dist/index.js';\n\nconst dir = './libs/@hashintel/brunch-agent/docs/inbox/SDCPNs';\nfor (const name of (await readdir(dir)).filter((name) => name.endsWith('.json')).sort()) {\n  const parsed = parseSDCPNFile(JSON.parse(await readFile(join(dir, name), 'utf8')));\n  console.log(`${name}\\t${parsed.ok ? `ok missingPositions=${parsed.hadMissingPositions}` : parsed.error}`);\n}\nNODE",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 10000
}
```

## User

**Tool Result:** `TU-034CgccodshdIhsnzs7aAc`

```
{
  "output": "gases-1-pn-consumption-trigger-layout.json\tok missingPositions=false\ngases-1-pn-layout.json\tok missingPositions=false\ngases-2-spn-layout.json\tok missingPositions=false\ngases-3-cpn-layout.json\tok missingPositions=false\ngases-4-dcpn-layout.json\tok missingPositions=false\nsemiconductor-fab-drift-layout.json\tok missingPositions=false\ntruck-fleet-predictive-maintenance-layout.json\tok missingPositions=false\n",
  "exitCode": 0
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "sed -n '1,32p' docs/INDEX.md",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

## User

**Tool Result:** `TU-034CgcogQ9fxZVVNNpsgUC`

```
{
  "output": "# Document index\n\nOne line per document: what it is, where it lives, where it's used. Protocol:\n[`docs/agents/documentation.md`](agents/documentation.md). Statuses: `inbox` (awaiting\nsettlement) · `active` (artifact of a live effort) · `settled` (permanent home) · `superseded`\n(retained history replaced by newer canon) · `accepted` (ratified ADR) · `external` (canonical\ncopy lives outside the repo).\n\n## Inbox (awaiting settlement)\n\n_(empty — items settle out via the arc-close inbox sweep)_\n\n## Reference (settled sources)\n\n| Document                                                                                                    | Status  | Date                         | Digest                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Used by                                                                                                    |\n| ----------------------------------------------------------------------------------------------------------- | ------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |\n| [agentic-elicitation-challenges](reference/agentic-elicitation-challenges-2026-08-06T10-02-41Z.md)          | settled | 2026-08-06                   | Turn 1 of the founding analysis: four contracts, packs, IR; source of the \"capture meaning before representation\" principle                                                                                                                                                                                                                                                                                                                                                                   | elicitation-kernel spec §1                                                                                 |\n| [agentic-elicitation-criteria](reference/agentic-elicitation-criteria-2026-08-06T14-11-18Z.md)              | settled | 2026-08-06                   | Turn 2: hourglass, five proof obligations, ten invariants, smells, test matrix                                                                                                                                                                                                                                                                                                                                                                                                                | elicitation-kernel spec §14                                                                                |\n| [SDCPN Library - Ideas](reference/SDCPN%20Library%20-%20Ideas.md)                                           | settled | 2026-08-11                   | Eight CPS use-case sketches (physical/cyber/events/continuous-state/emergence anatomy), ChatGPT-drafted                                                                                                                                                                                                                                                                                                                                                                                       | FE-1357 map; FE-1363 candidates                                                                            |\n| [hash-sails-public-report.pdf](reference/hash-sails-public-report.pdf)                                      | settled | 2026-08-11 (pub. 2026-01)    | SAILS/ARIA public report: Safeguarded AI gatekeeper (world model + safety spec + verifier), biopharma supply-chain research, tacit knowledge as adoption barrier                                                                                                                                                                                                                                                                                                                              | FE-1357 map (the \"why\"); FE-1363 cold-chain anchor                                                         |\n| [voice-implementation-recommendation-pplx](reference/voice-implementation-recommendation-pplx.md)           | settled | 2026-08-11                   | Perplexity research: voice-adapter options (ElevenLabs/OpenAI/Gemini/xAI)                                                                                                                                                                                                                                                                                                                                                                                                                     | FE-1359 (superseded in part by its findings)                                                               |\n| [yannis-dora-lu-transcript](reference/yannis-dora-lu-transcript-2026-08-11.md)                              | settled | 2026-08-11                   | Meeting transcript: no in-house interviewing practice; SDCPN-as-hypothesis aired; baseline-control and priming ideas                                                                                                                                                                                                                                                                                                                                                                          | expert-meeting-findings note; FE-1360, FE-1361                                                             |\n| [amp-analysis-flue-vs-tilde](reference/amp-analysis-flue-vs-tilde.md)                                       | settled | 2026-08-14                   | Amp thread export: comparative assessment of the Flue and tilde agent frameworks (development and deployment stories) and its import for this project; verdict: keep Flue, Tilde is a control plane not a runtime                                                                                                                                                                                                                                                                             | reconciled into flue-architecture-cheatsheet (2026-08-17); source of the pre-remote-exposure gates         |\n| [2026-08 SDCPNs for cyber-physical systems](reference/2026-08%20SDCPNs%20for%20cyber-physical%20systems.md) | settled | 2026-08 (settled 2026-08-18) | Unattributed draft blog post (image placeholders, typos): five-level SDCPN explainer applied to gas supply, truck fleet, semiconductor fab; arrived during the FE-1405 arc. Read skeptically: good pedagogy, promotional register — concedes its formal guarantees don't apply once continuous/stochastic features are used (open research problem), models carry heavy kernel/guard logic that strains the \"formal and inspectable\" claim, and Petrinaut's integrator limitation is admitted | Register-3 background (projection-target expressivity) only; not elicitation design input; no consumer yet |\n\n## history/planning/elicitation-kernel (effort complete 2026-08-10; settled 2026-08-12)\n\n| Document                                                                                                 | Status  | Linear                                                      | Digest                                                                                                                                                                         |\n| -------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |\n| [spec.md](spec.md)                                                                                       | settled | linked from FE-1366 (context-canonical)                     | The elicitation-kernel spec: 14 sections + adjudications; FE-1437 import amendment records the native HASH package family, context root, and remote-server application charter |\n| [product-description.md](history/planning/elicitation-kernel/product-description.md)                     | settled | none                                                        | STE-style product description                                                                                                                                                  |\n| [product-description-plain.md](history/planning/elicitation-kernel/product-description-plain.md)         | settled | none                                                        | Plain-prose rendering of the product description                                                                                                                               |\n",
  "exitCode": 0
}
```

## Assistant

**Tool Use:** `apply_patch`

```json
{
  "patchText": "*** Begin Patch\n*** Update File: /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/INDEX.md\n@@\n ## Inbox (awaiting settlement)\n \n-_(empty — items settle out via the arc-close inbox sweep)_\n+| Document                     | Status | Date       | Digest                                                                                                                                                                                                 | Used by                                                      |\n+| ---------------------------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |\n+| [SDCPN JSON nets](inbox/SDCPNs/) | inbox  | 2026-08-24 | Seven valid Petrinaut v1 JSON files: two plain-net gas variants, gas SPN/CPN/DCPN models, truck-fleet maintenance, and semiconductor-fab drift; the expected fifth gas SDCPN is not present in this arrival | Frontier 0 corpus inventory; settlement/conformance pending |\n \n ## Reference (settled sources)\n*** End Patch"
}
```

## User

**Tool Result:** `TU-034Cgcx2uvAOhQiG3FWDO2`

```
{
  "files": [
    {
      "uri": "file:///Users/lunelson/Code/hashintel/hash/libs/%40hashintel/brunch-agent/docs/INDEX.md",
      "diff": "Index: /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/INDEX.md\n===================================================================\n--- /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/INDEX.md\n+++ /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/INDEX.md\n@@ -7,9 +7,11 @@\n copy lives outside the repo).\n \n ## Inbox (awaiting settlement)\n \n-_(empty — items settle out via the arc-close inbox sweep)_\n+| Document                     | Status | Date       | Digest                                                                                                                                                                                                 | Used by                                                      |\n+| ---------------------------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |\n+| [SDCPN JSON nets](inbox/SDCPNs/) | inbox  | 2026-08-24 | Seven valid Petrinaut v1 JSON files: two plain-net gas variants, gas SPN/CPN/DCPN models, truck-fleet maintenance, and semiconductor-fab drift; the expected fifth gas SDCPN is not present in this arrival | Frontier 0 corpus inventory; settlement/conformance pending |\n \n ## Reference (settled sources)\n \n | Document                                                                                                    | Status  | Date                         | Digest                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Used by                                                                                                    |\n",
      "type": "update",
      "additions": 3,
      "deletions": 1
    }
  ],
  "summary": "update: /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/INDEX.md (+3/-1)"
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "sed -n '1,19p' docs/INDEX.md",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

## User

**Tool Result:** `TU-034Cgd6qnurG4IQRfLcIgu`

```
{
  "output": "# Document index\n\nOne line per document: what it is, where it lives, where it's used. Protocol:\n[`docs/agents/documentation.md`](agents/documentation.md). Statuses: `inbox` (awaiting\nsettlement) · `active` (artifact of a live effort) · `settled` (permanent home) · `superseded`\n(retained history replaced by newer canon) · `accepted` (ratified ADR) · `external` (canonical\ncopy lives outside the repo).\n\n## Inbox (awaiting settlement)\n\n| Document                     | Status | Date       | Digest                                                                                                                                                                                                 | Used by                                                      |\n| ---------------------------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |\n| [SDCPN JSON nets](inbox/SDCPNs/) | inbox  | 2026-08-24 | Seven valid Petrinaut v1 JSON files: two plain-net gas variants, gas SPN/CPN/DCPN models, truck-fleet maintenance, and semiconductor-fab drift; the expected fifth gas SDCPN is not present in this arrival | Frontier 0 corpus inventory; settlement/conformance pending |\n\n## Reference (settled sources)\n\n| Document                                                                                                    | Status  | Date                         | Digest                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Used by                                                                                                    |\n| ----------------------------------------------------------------------------------------------------------- | ------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |\n| [agentic-elicitation-challenges](reference/agentic-elicitation-challenges-2026-08-06T10-02-41Z.md)          | settled | 2026-08-06                   | Turn 1 of the founding analysis: four contracts, packs, IR; source of the \"capture meaning before representation\" principle                                                                                                                                                                                                                                                                                                                                                                   | elicitation-kernel spec §1                                                                                 |\n",
  "exitCode": 0
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "for f in docs/inbox/SDCPNs/gases-4-dcpn-layout.json docs/inbox/SDCPNs/truck-fleet-predictive-maintenance-layout.json docs/inbox/SDCPNs/semiconductor-fab-drift-layout.json; do printf '\\n=== %s DE shape ===\\n' \"$(basename \"$f\")\"; jq '[.differentialEquations[] | {name, keys:(keys), code:(.code // .expression // .equation // .derivatives // .values // null)}]' \"$f\"; done",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "for f in docs/inbox/SDCPNs/*.json; do printf '\\n=== %s transition timing ===\\n' \"$(basename \"$f\")\"; jq -r '[.transitions[] | (.kind // .type // .timing.type // .firing.type // \"unspecified\")] | group_by(.) | map({kind:.[0], count:length})' \"$f\"; done",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "jq '.differentialEquations[0]' docs/inbox/SDCPNs/truck-fleet-predictive-maintenance-layout.json; jq '.transitions[0]' docs/inbox/SDCPNs/gases-2-spn-layout.json",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

## User

**Tool Result:** `TU-034CgdTFhTetiMBJyiSwGI`

```
{
  "output": "\n=== gases-4-dcpn-layout.json DE shape ===\n[\n  {\n    \"name\": \"Tank\",\n    \"keys\": [\n      \"code\",\n      \"colorId\",\n      \"id\",\n      \"name\"\n    ],\n    \"code\": \"// The rung the whole domain is built for. Level falls from the customer's draw\\n// and from boil-off together, and stops at empty so Euler cannot drive it\\n// negative. Pressure rises as boil-off gas fills whatever ullage is left, so a\\n// nearly full tank pressurises fastest, and falls as liquid is drawn off. Empty\\n// stops the customer's line and full opens the relief valve, so the safe region\\n// is an interval and \\\"hold more stock\\\" is not a safe default.\\nexport default Dynamics((tokens, parameters) => {\\n  return tokens.map((unit) => ({\\n    level: unit.level > 0 ? -(unit.draw + parameters.boiloff_rate) : 0, pressure: Math.max(parameters.pressure_gain * parameters.boiloff_rate / Math.max(unit.capacity - unit.level, 1) - parameters.pressure_vented_by_draw * unit.draw, unit.pressure > 1 ? -1 : 0), capacity: 0, draw: 0, drawn: unit.level > 0 ? unit.draw : 0, boiled: unit.level > 0 ? parameters.boiloff_rate : 0, spilled: 0\\n  }));\\n});\"\n  },\n  {\n    \"name\": \"Journey clock (on route)\",\n    \"keys\": [\n      \"code\",\n      \"colorId\",\n      \"id\",\n      \"name\"\n    ],\n    \"code\": \"export default Dynamics((tokens) => {\\n  return tokens.map(() => ({ remaining: -1, payload: 0 }));\\n});\"\n  },\n  {\n    \"name\": \"Journey clock (returning)\",\n    \"keys\": [\n      \"code\",\n      \"colorId\",\n      \"id\",\n      \"name\"\n    ],\n    \"code\": \"export default Dynamics((tokens) => {\\n  return tokens.map(() => ({ remaining: -1, payload: 0 }));\\n});\"\n  }\n]\n\n=== truck-fleet-predictive-maintenance-layout.json DE shape ===\n[\n  {\n    \"name\": \"Wear, fuel and road conditions (loaded)\",\n    \"keys\": [\n      \"code\",\n      \"colorId\",\n      \"id\",\n      \"name\"\n    ],\n    \"code\": \"export default Dynamics((tokens, parameters) => {\\n  return tokens.map((truck) => {\\n    const speed = parameters.average_speed * truck.speed_factor;\\n    const severity = truck.road_severity;\\n    const brakeRoute = truck.route_class === 2 ? 2.5 : truck.route_class === 1 ? 1.4 : 1.0;\\n    const tyreRoute = truck.route_class === 2 ? 1.6 : 1.0;\\n    return {\\n      brake_wear: parameters.brake_wear_per_km * speed * severity * brakeRoute\\n        * (1 + parameters.wear_feedback * truck.brake_wear),\\n      engine_wear: parameters.engine_wear_per_km * speed * severity * 1.2\\n        * (1 + parameters.wear_feedback * truck.engine_wear),\\n      tyre_wear: parameters.tyre_wear_per_km * speed * severity * tyreRoute\\n        * (1 + parameters.wear_feedback * truck.tyre_wear),\\n      km_remaining: -speed,\\n      route_distance: 0, service_remaining: 0, load_due: 0, load_revenue: 0, age: 1,\\n      road_severity: parameters.severity_reversion\\n        * (parameters.base_severity_mean - truck.road_severity),\\n      speed_factor: parameters.speed_reversion\\n        * (parameters.base_speed_mean - truck.speed_factor),\\n      conditions_clock: -1,\\n      fuel_burned: parameters.fuel_per_km * speed * severity\\n        * (truck.route_class === 2 ? 1.4 : 1.0),\\n      hours_driven: 1, rest_remaining: 0, fuel_rate: 0\\n    };\\n  });\\n});\"\n  },\n  {\n    \"name\": \"Wear, fuel and road conditions (running back empty)\",\n    \"keys\": [\n      \"code\",\n      \"colorId\",\n      \"id\",\n      \"name\"\n    ],\n    \"code\": \"export default Dynamics((tokens, parameters) => {\\n  return tokens.map((truck) => {\\n    const speed = parameters.average_speed * truck.speed_factor;\\n    const severity = truck.road_severity;\\n    const brakeRoute = truck.route_class === 2 ? 2.5 : truck.route_class === 1 ? 1.4 : 1.0;\\n    const tyreRoute = truck.route_class === 2 ? 1.6 : 1.0;\\n    return {\\n      brake_wear: parameters.brake_wear_per_km * speed * severity * brakeRoute * 0.7\\n        * (1 + parameters.wear_feedback * truck.brake_wear),\\n      engine_wear: parameters.engine_wear_per_km * speed * severity * 0.7\\n        * (1 + parameters.wear_feedback * truck.engine_wear),\\n      tyre_wear: parameters.tyre_wear_per_km * speed * severity * tyreRoute * 0.7\\n        * (1 + parameters.wear_feedback * truck.tyre_wear),\\n      km_remaining: -speed,\\n      route_distance: 0, service_remaining: 0, load_due: 0, load_revenue: 0, age: 1,\\n      road_severity: parameters.severity_reversion\\n        * (parameters.base_severity_mean - truck.road_severity),\\n      speed_factor: parameters.speed_reversion\\n        * (parameters.base_speed_mean - truck.speed_factor),\\n      conditions_clock: -1,\\n      fuel_burned: parameters.fuel_per_km * speed * severity\\n        * (truck.route_class === 2 ? 1.4 : 1.0) * 0.8,\\n      hours_driven: 1, rest_remaining: 0, fuel_rate: 0\\n    };\\n  });\\n});\"\n  },\n  {\n    \"name\": \"Clock: standing at the depot (age only)\",\n    \"keys\": [\n      \"code\",\n      \"colorId\",\n      \"id\",\n      \"name\"\n    ],\n    \"code\": \"export default Dynamics((tokens) => {\\n  return tokens.map(() => ({ brake_wear: 0, engine_wear: 0, tyre_wear: 0, km_remaining: 0, route_distance: 0, service_remaining: 0, load_due: 0, load_revenue: 0, age: 1, road_severity: 0, speed_factor: 0, conditions_clock: 0, fuel_burned: 0, hours_driven: 0, rest_remaining: 0, fuel_rate: 0 }));\\n});\"\n  },\n  {\n    \"name\": \"Clock: service countdown\",\n    \"keys\": [\n      \"code\",\n      \"colorId\",\n      \"id\",\n      \"name\"\n    ],\n    \"code\": \"export default Dynamics((tokens) => {\\n  return tokens.map(() => ({ brake_wear: 0, engine_wear: 0, tyre_wear: 0, km_remaining: 0, route_distance: 0, service_remaining: -1, load_due: 0, load_revenue: 0, age: 1, road_severity: 0, speed_factor: 0, conditions_clock: 0, fuel_burned: 0, hours_driven: 0, rest_remaining: 0, fuel_rate: 0 }));\\n});\"\n  },\n  {\n    \"name\": \"Clock: driver rest countdown\",\n    \"keys\": [\n      \"code\",\n      \"colorId\",\n      \"id\",\n      \"name\"\n    ],\n    \"code\": \"export default Dynamics((tokens) => {\\n  return tokens.map(() => ({ brake_wear: 0, engine_wear: 0, tyre_wear: 0, km_remaining: 0, route_distance: 0, service_remaining: 0, load_due: 0, load_revenue: 0, age: 1, road_severity: 0, speed_factor: 0, conditions_clock: 0, fuel_burned: 0, hours_driven: 0, rest_remaining: -1, fuel_rate: 0 }));\\n});\"\n  },\n  {\n    \"name\": \"Clock: load ageing on the board\",\n    \"keys\": [\n      \"code\",\n      \"colorId\",\n      \"id\",\n      \"name\"\n    ],\n    \"code\": \"export default Dynamics((tokens) => {\\n  return tokens.map(() => ({ distance: 0, due: 0, revenue: 0, age: 1 }));\\n});\"\n  },\n  {\n    \"name\": \"Regional weather drift (+ resample clock)\",\n    \"keys\": [\n      \"code\",\n      \"colorId\",\n      \"id\",\n      \"name\"\n    ],\n    \"code\": \"export default Dynamics((tokens, parameters) => {\\n  return tokens.map((cond) => ({\\n    severity_mean: parameters.env_reversion\\n      * (parameters.base_severity_mean - cond.severity_mean),\\n    speed_mean: parameters.env_reversion\\n      * (parameters.base_speed_mean - cond.speed_mean),\\n    clock: -1\\n  }));\\n});\"\n  }\n]\n\n=== semiconductor-fab-drift-layout.json DE shape ===\n[\n  {\n    \"name\": \"Lot urgency escalation (+ age, wait clocks)\",\n    \"keys\": [\n      \"code\",\n      \"colorId\",\n      \"id\",\n      \"name\"\n    ],\n    \"code\": \"export default Dynamics((tokens, parameters) => {\\n  return tokens.map((lot) => ({\\n    priority: lot.priority < parameters.max_priority\\n      ? (lot.priority * lot.priority) / parameters.target_cycle_time\\n      : 0,\\n    age: 1, defect_count: 0, process_remaining: 0, wait_time: 1, due_date: 0, process_bias: 0, batch_wait: 0\\n  }));\\n});\"\n  },\n  {\n    \"name\": \"Clock: process countdown (+ age)\",\n    \"keys\": [\n      \"code\",\n      \"colorId\",\n      \"id\",\n      \"name\"\n    ],\n    \"code\": \"export default Dynamics((tokens) => {\\n  return tokens.map(() => ({\\n    priority: 0, age: 1, defect_count: 0, process_remaining: -1, wait_time: 0, due_date: 0, process_bias: 0, batch_wait: 0\\n  }));\\n});\"\n  },\n  {\n    \"name\": \"Chamber wear and contamination (coupled)\",\n    \"keys\": [\n      \"code\",\n      \"colorId\",\n      \"id\",\n      \"name\"\n    ],\n    \"code\": \"export default Dynamics((tokens, parameters) => {\\n  return tokens.map((chamber) => {\\n    const particleTarget = parameters.particle_baseline\\n      + parameters.particle_drift * chamber.hours_since_maintenance\\n      + parameters.particle_condition_factor * chamber.condition;\\n    return {\\n      condition: parameters.degradation_rate\\n        * (1 + chamber.particle_count / parameters.particle_threshold),\\n      particle_count: parameters.particle_reversion\\n        * (particleTarget - chamber.particle_count),\\n      hours_since_maintenance: 1,\\n      maintenance_remaining: 0,\\n      diffusion_clock: -1,\\n      process_drift: -parameters.drift_reversion * chamber.process_drift\\n    };\\n  });\\n});\"\n  },\n  {\n    \"name\": \"Clock: maintenance countdown\",\n    \"keys\": [\n      \"code\",\n      \"colorId\",\n      \"id\",\n      \"name\"\n    ],\n    \"code\": \"export default Dynamics((tokens) => {\\n  return tokens.map(() => ({\\n    condition: 0, particle_count: 0, hours_since_maintenance: 0, maintenance_remaining: -1, diffusion_clock: 0, process_drift: 0\\n  }));\\n});\"\n  },\n  {\n    \"name\": \"Lot urgency escalation in batch queue (+ age, wait, batch clocks)\",\n    \"keys\": [\n      \"code\",\n      \"colorId\",\n      \"id\",\n      \"name\"\n    ],\n    \"code\": \"export default Dynamics((tokens, parameters) => {\\n  return tokens.map((lot) => ({\\n    priority: lot.priority < parameters.max_priority\\n      ? (lot.priority * lot.priority) / parameters.target_cycle_time\\n      : 0,\\n    age: 1, defect_count: 0, process_remaining: 0, wait_time: 1, due_date: 0, process_bias: 0, batch_wait: 1\\n  }));\\n});\"\n  }\n]\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-034CgdTG5ZvD1F2PAOx8HG`

```
{
  "output": "\n=== gases-1-pn-consumption-trigger-layout.json transition timing ===\n[\n  {\n    \"kind\": \"unspecified\",\n    \"count\": 8\n  }\n]\n\n=== gases-1-pn-layout.json transition timing ===\n[\n  {\n    \"kind\": \"unspecified\",\n    \"count\": 8\n  }\n]\n\n=== gases-2-spn-layout.json transition timing ===\n[\n  {\n    \"kind\": \"unspecified\",\n    \"count\": 17\n  }\n]\n\n=== gases-3-cpn-layout.json transition timing ===\n[\n  {\n    \"kind\": \"unspecified\",\n    \"count\": 25\n  }\n]\n\n=== gases-4-dcpn-layout.json transition timing ===\n[\n  {\n    \"kind\": \"unspecified\",\n    \"count\": 26\n  }\n]\n\n=== semiconductor-fab-drift-layout.json transition timing ===\n[\n  {\n    \"kind\": \"unspecified\",\n    \"count\": 25\n  }\n]\n\n=== truck-fleet-predictive-maintenance-layout.json transition timing ===\n[\n  {\n    \"kind\": \"unspecified\",\n    \"count\": 26\n  }\n]\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-034CgdTGZwPMRDgyDcEVnf`

```
{
  "output": "{\n  \"id\": \"de__driving\",\n  \"name\": \"Wear, fuel and road conditions (loaded)\",\n  \"colorId\": \"type__truck\",\n  \"code\": \"export default Dynamics((tokens, parameters) => {\\n  return tokens.map((truck) => {\\n    const speed = parameters.average_speed * truck.speed_factor;\\n    const severity = truck.road_severity;\\n    const brakeRoute = truck.route_class === 2 ? 2.5 : truck.route_class === 1 ? 1.4 : 1.0;\\n    const tyreRoute = truck.route_class === 2 ? 1.6 : 1.0;\\n    return {\\n      brake_wear: parameters.brake_wear_per_km * speed * severity * brakeRoute\\n        * (1 + parameters.wear_feedback * truck.brake_wear),\\n      engine_wear: parameters.engine_wear_per_km * speed * severity * 1.2\\n        * (1 + parameters.wear_feedback * truck.engine_wear),\\n      tyre_wear: parameters.tyre_wear_per_km * speed * severity * tyreRoute\\n        * (1 + parameters.wear_feedback * truck.tyre_wear),\\n      km_remaining: -speed,\\n      route_distance: 0, service_remaining: 0, load_due: 0, load_revenue: 0, age: 1,\\n      road_severity: parameters.severity_reversion\\n        * (parameters.base_severity_mean - truck.road_severity),\\n      speed_factor: parameters.speed_reversion\\n        * (parameters.base_speed_mean - truck.speed_factor),\\n      conditions_clock: -1,\\n      fuel_burned: parameters.fuel_per_km * speed * severity\\n        * (truck.route_class === 2 ? 1.4 : 1.0),\\n      hours_driven: 1, rest_remaining: 0, fuel_rate: 0\\n    };\\n  });\\n});\"\n}\n{\n  \"id\": \"transition__s1_draw\",\n  \"name\": \"Draw a unit (SteadyNitrogen)\",\n  \"inputArcs\": [\n    {\n      \"placeId\": \"place__s1_contents\",\n      \"weight\": 1,\n      \"type\": \"standard\"\n    }\n  ],\n  \"outputArcs\": [\n    {\n      \"placeId\": \"place__s1_consumed\",\n      \"weight\": 1\n    },\n    {\n      \"placeId\": \"place__s1_ullage\",\n      \"weight\": 1\n    }\n  ],\n  \"lambdaType\": \"stochastic\",\n  \"lambdaCode\": \"export default Lambda((input, parameters) => {\\n  return Math.max(parameters.draw_1 * parameters.draw_enabled, 1e-9);\\n});\",\n  \"transitionKernelCode\": \"\",\n  \"x\": 990,\n  \"y\": 1410\n}\n",
  "exitCode": 0
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "for f in docs/inbox/SDCPNs/*.json; do printf '%s\\t' \"$(basename \"$f\")\"; jq -c '[.transitions[].lambdaType // \"missing\"] | group_by(.) | map({type:.[0], count:length})' \"$f\"; done",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

## User

**Tool Result:** `TU-034CgdcSXkqLeZqZWKW3Cq`

```
{
  "output": "gases-1-pn-consumption-trigger-layout.json\t[{\"type\":\"predicate\",\"count\":8}]\ngases-1-pn-layout.json\t[{\"type\":\"predicate\",\"count\":8}]\ngases-2-spn-layout.json\t[{\"type\":\"stochastic\",\"count\":17}]\ngases-3-cpn-layout.json\t[{\"type\":\"stochastic\",\"count\":25}]\ngases-4-dcpn-layout.json\t[{\"type\":\"predicate\",\"count\":16},{\"type\":\"stochastic\",\"count\":10}]\nsemiconductor-fab-drift-layout.json\t[{\"type\":\"predicate\",\"count\":20},{\"type\":\"stochastic\",\"count\":5}]\ntruck-fleet-predictive-maintenance-layout.json\t[{\"type\":\"predicate\",\"count\":19},{\"type\":\"stochastic\",\"count\":7}]\n",
  "exitCode": 0
}
```

## Assistant

The arrival contains seven valid Petrinaut v1 files, but not the seven described in the Slack summary: it has two plain-net gas variants plus gas SPN/CPN/DCPN, truck, and semiconductor. The expected fifth gas SDCPN/diffusion model is absent. I’m preserving that discrepancy in the inbox record rather than normalizing it away.

**Tool Use:** `shell_command`

```json
{
  "command": "git diff --check -- docs/INDEX.md && for file in docs/inbox/SDCPNs/*.json; do jq empty \"$file\"; done && node --input-type=module <<'NODE'\nimport { readFile, readdir } from 'node:fs/promises';\nimport { join } from 'node:path';\nimport { parseSDCPNFile } from '../../../petrinaut-core/dist/index.js';\n\nconst directory = 'docs/inbox/SDCPNs';\nfor (const name of (await readdir(directory)).filter((entry) => entry.endsWith('.json')).sort()) {\n  const result = parseSDCPNFile(JSON.parse(await readFile(join(directory, name), 'utf8')));\n  if (!result.ok) throw new Error(`${name}: ${result.error}`);\n  if (result.hadMissingPositions) throw new Error(`${name}: missing positions`);\n}\nconsole.log('7 SDCPN files parse with complete positions');\nNODE",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

## User

**Tool Result:** `TU-034CgdtN8TtCkx3VGokkSN`

```
{
  "output": "node:internal/modules/esm/resolve:271\n    throw new ERR_MODULE_NOT_FOUND(\n          ^\n\nError [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/lunelson/Code/hashintel/hash/petrinaut-core/dist/index.js' imported from /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/[eval1]\n    at finalizeResolution (node:internal/modules/esm/resolve:271:11)\n    at moduleResolve (node:internal/modules/esm/resolve:865:10)\n    at defaultResolve (node:internal/modules/esm/resolve:992:11)\n    at #cachedDefaultResolve (node:internal/modules/esm/loader:701:20)\n    at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:721:38)\n    at ModuleLoader.resolveSync (node:internal/modules/esm/loader:759:56)\n    at #resolve (node:internal/modules/esm/loader:683:17)\n    at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:603:35)\n    at ModuleJob.syncLink (node:internal/modules/esm/module_job:163:33)\n    at ModuleJob.link (node:internal/modules/esm/module_job:253:17) {\n  code: 'ERR_MODULE_NOT_FOUND',\n  url: 'file:///Users/lunelson/Code/hashintel/hash/petrinaut-core/dist/index.js'\n}\n\nNode.js v24.19.0\n",
  "exitCode": 1
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "git diff --check -- docs/INDEX.md && for file in docs/inbox/SDCPNs/*.json; do jq empty \"$file\"; done && node --input-type=module <<'NODE'\nimport { readFile, readdir } from 'node:fs/promises';\nimport { join } from 'node:path';\nimport { parseSDCPNFile } from '../petrinaut-core/dist/index.js';\n\nconst directory = 'docs/inbox/SDCPNs';\nfor (const name of (await readdir(directory)).filter((entry) => entry.endsWith('.json')).sort()) {\n  const result = parseSDCPNFile(JSON.parse(await readFile(join(directory, name), 'utf8')));\n  if (!result.ok) throw new Error(`${name}: ${result.error}`);\n  if (result.hadMissingPositions) throw new Error(`${name}: missing positions`);\n}\nconsole.log('7 SDCPN files parse with complete positions');\nNODE",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

## User

**Tool Result:** `TU-034Cge5FVEeKVZdpfeM1RL`

```
{
  "output": "7 SDCPN files parse with complete positions\n",
  "exitCode": 0
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "turbo run lint:tsc --filter '@hashintel/brunch-agent' && turbo run test:unit --filter '@hashintel/brunch-agent' && turbo run build --filter '@hashintel/brunch-agent'",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 60000
}
```

## User

**Tool Result:** `TU-034CgeGF5En6w5h4BCeCf6`

```
{
  "output": "turbo 2.6.3\n\n• Packages in scope: @hashintel/brunch-agent\n• Running lint:tsc in 1 packages\n• Remote caching disabled\n@hashintel/brunch-agent:lint:tsc: cache hit, replaying logs 50584d5be80cc7ec\n\n Tasks:    1 successful, 1 total\nCached:    1 cached, 1 total\n  Time:    3.983s >>> FULL TURBO\n\nturbo 2.6.3\n\n• Packages in scope: @hashintel/brunch-agent\n• Running test:unit in 1 packages\n• Remote caching disabled\n@hashintel/brunch-agent:test:unit: cache hit, replaying logs d4c5393b6af87011\n@hashintel/brunch-agent:test:unit: \n@hashintel/brunch-agent:test:unit:  RUN  v4.1.10 /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/packages/core\n@hashintel/brunch-agent:test:unit: \n@hashintel/brunch-agent:test:unit:  ✓ test/architecture/boundaries.test.ts (29 tests) 33ms\n@hashintel/brunch-agent:test:unit:  ✓ test/naming.test.ts (11 tests) 3ms\n@hashintel/brunch-agent:test:unit:  ✓ test/capture-store.test.ts (24 tests) 21ms\n@hashintel/brunch-agent:test:unit:  ✓ test/anchoring.test.ts (6 tests) 4ms\n@hashintel/brunch-agent:test:unit:  ✓ test/session-log.test.ts (4 tests) 8ms\n@hashintel/brunch-agent:test:unit:  ✓ test/sweep-protocol.test.ts (9 tests) 3ms\n@hashintel/brunch-agent:test:unit:  ✓ test/architecture/workspace.test.ts (7 tests) 3ms\n@hashintel/brunch-agent:test:unit:  ✓ test/architecture/linear-project-graph.test.ts (2 tests) 14ms\n@hashintel/brunch-agent:test:unit:  ✓ test/architecture/docs-index.test.ts (7 tests) 12ms\n@hashintel/brunch-agent:test:unit:  ✓ test/ask-protocol.test.ts (9 tests) 2ms\n@hashintel/brunch-agent:test:unit: stderr | test/architecture/open-gaps.test.ts\n@hashintel/brunch-agent:test:unit: \n@hashintel/brunch-agent:test:unit: ⚠ 3 verification gaps are open (spec §14.5 and friends):\n@hashintel/brunch-agent:test:unit:    · restart-durability — FE-1396 (spec §14.5)\n@hashintel/brunch-agent:test:unit:    · compaction-vs-durable-history — FE-1386 (spec §9.7, §14.5)\n@hashintel/brunch-agent:test:unit:    · interpretation-render-plugin-seam — FE-1394 (spec §7.6, §14.5)\n@hashintel/brunch-agent:test:unit:    Closing one means deleting its entry in the commit that lands its proof.\n@hashintel/brunch-agent:test:unit: \n@hashintel/brunch-agent:test:unit: \n@hashintel/brunch-agent:test:unit:  ✓ test/architecture/open-gaps.test.ts (2 tests) 1ms\n@hashintel/brunch-agent:test:unit:  ✓ test/architecture/baseline-runner.test.ts (4 tests) 1867ms\n@hashintel/brunch-agent:test:unit:      ✓ checkpoints a truncated expert reply and stops before another interviewer call  756ms\n@hashintel/brunch-agent:test:unit:      ✓ resume regenerates a trailing truncated expert reply before continuing  636ms\n@hashintel/brunch-agent:test:unit:      ✓ continues a truncated final delivery without sending checkpoint metadata  311ms\n@hashintel/brunch-agent:test:unit: \n@hashintel/brunch-agent:test:unit:  Test Files  12 passed (12)\n@hashintel/brunch-agent:test:unit:       Tests  114 passed (114)\n@hashintel/brunch-agent:test:unit:    Start at  12:31:31\n@hashintel/brunch-agent:test:unit:    Duration  2.08s (transform 76ms, setup 0ms, import 155ms, tests 1.97s, environment 0ms)\n@hashintel/brunch-agent:test:unit: \n\n Tasks:    1 successful, 1 total\nCached:    1 cached, 1 total\n  Time:    1.527s >>> FULL TURBO\n\nturbo 2.6.3\n\n• Packages in scope: @hashintel/brunch-agent\n• Running build in 1 packages\n• Remote caching disabled\n@hashintel/brunch-agent:build: cache bypass, force executing d9f7ac2bc077ccba\n@hashintel/brunch-agent:build: vite v8.1.0 building client environment for production...\n@hashintel/brunch-agent:build: \u001b[2K\r@hashintel/brunch-agent:build: transforming...✓ 13 modules transformed.\n@hashintel/brunch-agent:build: rendering chunks...\n@hashintel/brunch-agent:build: computing gzip size...\n@hashintel/brunch-agent:build: dist/client-tools.js           0.12 kB │ gzip: 0.12 kB\n@hashintel/brunch-agent:build: dist/storage.js                0.20 kB │ gzip: 0.15 kB\n@hashintel/brunch-agent:build: dist/plugin-BlyisbcK.js        0.68 kB │ gzip: 0.41 kB │ map:  3.09 kB\n@hashintel/brunch-agent:build: dist/testing/index.js          0.69 kB │ gzip: 0.41 kB │ map:  2.13 kB\n@hashintel/brunch-agent:build: dist/naming-DhqH8ada.js        0.78 kB │ gzip: 0.48 kB │ map:  4.29 kB\n@hashintel/brunch-agent:build: dist/session-log-1mbM2HlS.js   6.44 kB │ gzip: 2.22 kB │ map: 20.44 kB\n@hashintel/brunch-agent:build: dist/index.js                 25.31 kB │ gzip: 7.67 kB │ map: 80.29 kB\n@hashintel/brunch-agent:build: \n@hashintel/brunch-agent:build: ✓ built in 16ms\n\n Tasks:    1 successful, 1 total\nCached:    0 cached, 1 total\n  Time:    2.731s \n\n",
  "exitCode": 0
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "yarn workspace @hashintel/brunch-agent vitest run test/architecture/docs-index.test.ts",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 60000
}
```

## User

**Tool Result:** `TU-034CgeiPXHFUIKXmG3aJMw`

```
{
  "output": "\n RUN  v4.1.10 /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/packages/core\n\n ✓ test/architecture/docs-index.test.ts (7 tests) 12ms\n\n Test Files  1 passed (1)\n      Tests  7 passed (7)\n   Start at  13:48:18\n   Duration  218ms (transform 14ms, setup 0ms, import 22ms, tests 12ms, environment 0ms)\n\n",
  "exitCode": 0
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "turbo run linear:graph --filter '@hashintel/brunch-agent' 2>/dev/null | sed -n '/project brunch-agent/p;/cycles:/p'",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 60000
}
```

## User

**Tool Result:** `TU-034CgetbOt6dYI1rVHQg6w`

```
{
  "output": "@hashintel/brunch-agent:linear:graph: project brunch-agent open=35 hard=16\n@hashintel/brunch-agent:linear:graph: cycles: none\n",
  "exitCode": 0
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "git add docs/INDEX.md docs/inbox/SDCPNs/gases-1-pn-consumption-trigger-layout.json docs/inbox/SDCPNs/gases-1-pn-layout.json docs/inbox/SDCPNs/gases-2-spn-layout.json docs/inbox/SDCPNs/gases-3-cpn-layout.json docs/inbox/SDCPNs/gases-4-dcpn-layout.json docs/inbox/SDCPNs/semiconductor-fab-drift-layout.json docs/inbox/SDCPNs/truck-fleet-predictive-maintenance-layout.json && git status --short && printf '%s\\n' '--- staged paths' && git diff --cached --name-only",
  "workdir": "/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent",
  "timeout_ms": 10000
}
```

## User

**Tool Result:** `TU-034CgfA2MIuwW27fT6G0Du`

```
{
  "output": "M  docs/INDEX.md\n M docs/agents/git-workflow.md\n M docs/agents/issue-writing.md\n M docs/agents/legibility.md\nA  docs/inbox/SDCPNs/gases-1-pn-consumption-trigger-layout.json\nA  docs/inbox/SDCPNs/gases-1-pn-layout.json\nA  docs/inbox/SDCPNs/gases-2-spn-layout.json\nA  docs/inbox/SDCPNs/gases-3-cpn-layout.json\nA  docs/inbox/SDCPNs/gases-4-dcpn-layout.json\nA  docs/inbox/SDCPNs/semiconductor-fab-drift-layout.json\nA  docs/inbox/SDCPNs/truck-fleet-predictive-maintenance-layout.json\n M docs/planning/_shared/STEERING.md\n M docs/planning/_shared/hash-monorepo-import-plan.md\n--- staged paths\nlibs/@hashintel/brunch-agent/docs/INDEX.md\nlibs/@hashintel/brunch-agent/docs/inbox/SDCPNs/gases-1-pn-consumption-trigger-layout.json\nlibs/@hashintel/brunch-agent/docs/inbox/SDCPNs/gases-1-pn-layout.json\nlibs/@hashintel/brunch-agent/docs/inbox/SDCPNs/gases-2-spn-layout.json\nlibs/@hashintel/brunch-agent/docs/inbox/SDCPNs/gases-3-cpn-layout.json\nlibs/@hashintel/brunch-agent/docs/inbox/SDCPNs/gases-4-dcpn-layout.json\nlibs/@hashintel/brunch-agent/docs/inbox/SDCPNs/semiconductor-fab-drift-layout.json\nlibs/@hashintel/brunch-agent/docs/inbox/SDCPNs/truck-fleet-predictive-maintenance-layout.json\n",
  "exitCode": 0
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "git diff --cached --check && git commit -m \"Register incoming SDCPN nets\"",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 60000
}
```

## User

**Tool Result:** `TU-034CgfJ4NhE2hAPxrpnbXK`

```
{
  "output": "╭──────────────────────────────────────╮\n│ 🥊 lefthook v2.0.0  hook: pre-commit │\n╰──────────────────────────────────────╯\n│  toml (skip) no files for inspection\n│  sqlfluff (skip) no files for inspection\n│  rust (skip) no files for inspection\n│  yarn (skip) no matching staged files\n┃  oxfmt ❯ \n\n(node:29806) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///Users/lunelson/Code/hashintel/hash/oxfmt.config.ts?cache=1787572121528 is not specified and it doesn't parse as CommonJS.\r\nReparsing as ES module because module syntax was detected. This incurs a performance overhead.\r\nTo eliminate this warning, add \"type\": \"module\" to /Users/lunelson/Code/hashintel/hash/package.json.\r\n(Use `node --trace-warnings ...` to show where the warning was created)\r\nExpected at least one target file. All matched files may have been excluded by ignore rules.\r\n\n┃  markdownlint ❯ \n\nmarkdownlint-cli2 v0.22.1 (markdownlint v0.40.0)\r\nFinding: libs/@hashintel/brunch-agent/docs/INDEX.md !**/LICENSE*.md !**/AGENTS*.md !node_modules/** !target/** !**/_temp/** !**/_ai/** !**/.cursor/plans/** !libs/@hashintel/ds-components/** !libs/@hashintel/ds-helpers/** !libs/@hashintel/brunch-agent/docs/**\r\nLinting: 0 file(s)\r\nSummary: 0 error(s)\r\n\n                                      \n  ────────────────────────────────────\nsummary: (done in 0.97 seconds)       \n✔️ oxfmt (0.30 seconds)\n✔️ markdownlint (0.90 seconds)\n[ln/fe-xxxx-whats-next c3d29164ab] Register incoming SDCPN nets\n 8 files changed, 8602 insertions(+), 1 deletion(-)\n create mode 100644 libs/@hashintel/brunch-agent/docs/inbox/SDCPNs/gases-1-pn-consumption-trigger-layout.json\n create mode 100644 libs/@hashintel/brunch-agent/docs/inbox/SDCPNs/gases-1-pn-layout.json\n create mode 100644 libs/@hashintel/brunch-agent/docs/inbox/SDCPNs/gases-2-spn-layout.json\n create mode 100644 libs/@hashintel/brunch-agent/docs/inbox/SDCPNs/gases-3-cpn-layout.json\n create mode 100644 libs/@hashintel/brunch-agent/docs/inbox/SDCPNs/gases-4-dcpn-layout.json\n create mode 100644 libs/@hashintel/brunch-agent/docs/inbox/SDCPNs/semiconductor-fab-drift-layout.json\n create mode 100644 libs/@hashintel/brunch-agent/docs/inbox/SDCPNs/truck-fleet-predictive-maintenance-layout.json\n",
  "exitCode": 0
}
```

## Assistant

**Tool Use:** `shell_command`

```json
{
  "command": "git status --short; git show --stat --oneline --summary HEAD",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 10000
}
```

**Tool Use:** `shell_command`

```json
{
  "command": "git show --format= --check HEAD; git show --format= --name-only HEAD",
  "workdir": "/Users/lunelson/Code/hashintel/hash",
  "timeout_ms": 10000
}
```

## User

**Tool Result:** `TU-034CgfTxQq1LE53iOSKNFb`

```
{
  "output": " M libs/@hashintel/brunch-agent/docs/agents/git-workflow.md\n M libs/@hashintel/brunch-agent/docs/agents/issue-writing.md\n M libs/@hashintel/brunch-agent/docs/agents/legibility.md\n M libs/@hashintel/brunch-agent/docs/planning/_shared/STEERING.md\n M libs/@hashintel/brunch-agent/docs/planning/_shared/hash-monorepo-import-plan.md\nc3d29164ab Register incoming SDCPN nets\n libs/@hashintel/brunch-agent/docs/INDEX.md         |    4 +-\n .../gases-1-pn-consumption-trigger-layout.json     |  486 +++++\n .../docs/inbox/SDCPNs/gases-1-pn-layout.json       |  472 +++++\n .../docs/inbox/SDCPNs/gases-2-spn-layout.json      |  978 +++++++++\n .../docs/inbox/SDCPNs/gases-3-cpn-layout.json      | 1300 ++++++++++++\n .../docs/inbox/SDCPNs/gases-4-dcpn-layout.json     | 1619 ++++++++++++++\n .../SDCPNs/semiconductor-fab-drift-layout.json     | 1509 +++++++++++++\n .../truck-fleet-predictive-maintenance-layout.json | 2235 ++++++++++++++++++++\n 8 files changed, 8602 insertions(+), 1 deletion(-)\n create mode 100644 libs/@hashintel/brunch-agent/docs/inbox/SDCPNs/gases-1-pn-consumption-trigger-layout.json\n create mode 100644 libs/@hashintel/brunch-agent/docs/inbox/SDCPNs/gases-1-pn-layout.json\n create mode 100644 libs/@hashintel/brunch-agent/docs/inbox/SDCPNs/gases-2-spn-layout.json\n create mode 100644 libs/@hashintel/brunch-agent/docs/inbox/SDCPNs/gases-3-cpn-layout.json\n create mode 100644 libs/@hashintel/brunch-agent/docs/inbox/SDCPNs/gases-4-dcpn-layout.json\n create mode 100644 libs/@hashintel/brunch-agent/docs/inbox/SDCPNs/semiconductor-fab-drift-layout.json\n create mode 100644 libs/@hashintel/brunch-agent/docs/inbox/SDCPNs/truck-fleet-predictive-maintenance-layout.json\n",
  "exitCode": 0
}
```

**Tool Result:** `TU-034CgfTy1DdxTa9G2ZCEpv`

```
{
  "output": "libs/@hashintel/brunch-agent/docs/INDEX.md\nlibs/@hashintel/brunch-agent/docs/inbox/SDCPNs/gases-1-pn-consumption-trigger-layout.json\nlibs/@hashintel/brunch-agent/docs/inbox/SDCPNs/gases-1-pn-layout.json\nlibs/@hashintel/brunch-agent/docs/inbox/SDCPNs/gases-2-spn-layout.json\nlibs/@hashintel/brunch-agent/docs/inbox/SDCPNs/gases-3-cpn-layout.json\nlibs/@hashintel/brunch-agent/docs/inbox/SDCPNs/gases-4-dcpn-layout.json\nlibs/@hashintel/brunch-agent/docs/inbox/SDCPNs/semiconductor-fab-drift-layout.json\nlibs/@hashintel/brunch-agent/docs/inbox/SDCPNs/truck-fleet-predictive-maintenance-layout.json\n",
  "exitCode": 0
}
```

## Assistant

Registered and committed the seven nets as inbox material (`c3d29164ab`).

Findings:

- All parse successfully with current Petrinaut schemas and complete positions.
- Inventory: two gas PN variants, gas SPN/CPN/DCPN, truck fleet, semiconductor fab.
- The expected gas SDCPN/diffusion net is absent.
- Structural inspection reflects stochastic transitions and nontrivial DEs, but is not a mathematical conformance review.

They remain in `docs/inbox/SDCPNs/` pending the corpus-location decision and provenance/conformance settlement. If `gases-5-sdcpn` exists, please add it.

## User

No, gases-5 doesn't seem to exist, that might be a bad reference. What else can I provide now? Where are we with locking these decisions?

BTW I suggest you use subagents from now on in this thread, for all forms of file processing including parsing/evaluation/reporting, but especially for executing file moves, cleanups etc. so we don't waste our discussion context on tool calling

## Assistant

Agreed. I’ll keep the strategic synthesis in this thread and route file inspection, parsing, migrations, cleanup, and artifact generation through subagents. I’m having one inspect the current control documents now—read-only—so I can distinguish what is actually deposited from what remains only agreed in conversation, without touching your in-flight edits.

**Tool Use:** `Task`

```json
{
  "prompt": "Perform a read-only audit in the Brunch context root `/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent`. Do not modify, stage, or commit anything; the worktree is shared and has unrelated/in-flight edits. Inspect current `docs/planning/_shared/STEERING.md`, `docs/planning/_shared/COORDINATION.md`, `docs/INDEX.md`, relevant ADR references they point to, and `git diff` for those files. Determine which of these session decisions are durably deposited versus absent/stale/contradicted: (1) Vestera remains the cold-start benchmark for now; (2) Dora's seven delivered JSON files are a projection/formalism-complexity corpus, with no evidence that a `gases-5` file exists and the prior five-stage filename reference likely bad; (3) live-demo completeness is bounded, but a reasonably capable full-model cold-start path and an improved-flat-prompt baseline comparison remain important; (4) proof means executable evidence + a legible persistent artifact + ideally a human witness; artifacts may graduate into regression oracles; (5) long-lived STEERING should be compact, using a frontier/issue tree and links to immutable evidence; (6) `docs/planning/<effort>` is no longer accepted as the target ordering principle—effort should be metadata, with control/spec/decision/evidence/reference/archive roles proposed but not finalized; (7) evaluation-material vocabulary/placement (case corpus, local test fixture, immutable run snapshot, reviewed oracle) is proposed but not locked; (8) demo use case Track A vs biopharma Track B remains an external decision gate; (9) FE-1480 inference authority remains unresolved. Return a compact table: decision, deposited status, current authoritative location if any, exact stale/contradictory text with file:line, and smallest future reconciliation action. Also report whether the current uncommitted STEERING diff belongs to another actor and must remain untouched. No broad review or copyediting.",
  "description": "Audit deposited decisions"
}
```

## User

**Tool Result:** `TU-034Cgjgp2amD8smaEq2yqO`

```
Read-only audit completed. No files modified, staged, or committed.

| # | Decision | Status | Current authority | Stale/contradictory text | Smallest reconciliation |
|---|---|---|---|---|---|
| 1 | Vestera remains the cold-start benchmark | **Absent as a current decision**; corpus exists | `baseline/situation-pack.md:1,11` identifies Vestera as FE-1361’s baseline | `STEERING.md:126,157,229` defers/ excludes complete cold-start work without preserving Vestera’s benchmark role | Add one compact steering/frontier note linking the existing baseline corpus and naming Vestera as retained benchmark. |
| 2 | Dora’s seven JSON files are a projection/formalism-complexity corpus; no `gases-5`; prior five-stage filename likely bad | **Partially deposited, awaiting settlement** | `docs/INDEX.md:13` records seven files and absence of the expected fifth gas file | `docs/INDEX.md:26`: “five-level SDCPN explainer applied to gas supply…” may perpetuate the level/ladders framing, though it is not itself a filename claim. No `gases-5` reference exists in searched Markdown. | Settle the inbox corpus with the projection/formalism-complexity role; explicitly retire the presumed five-stage filename rather than infer a missing file. |
| 3 | Live-demo completeness bounded, while capable full-model cold-start and improved-flat-prompt comparison remain important | **Bounded demo deposited; retained importance absent/stale** | Demo bound: `STEERING.md:39-42,143-158,222-233` | `STEERING.md:126`: “defer a complete cold-start runbook”; `:157`: “do not expand into cold-start elicitation”; `:229`: “Do not build a complete cold-start CPS interview…” No improved-flat-prompt comparison is recorded. | Preserve the demo cut while adding both items as post-frontier evaluation obligations, not current demo scope. |
| 4 | Proof = executable evidence + legible persistent artifact + ideally human witness; artifacts may graduate to regression oracles | **Partially deposited** | Executable/product-path proofs: `STEERING.md:178-180,188-193,206-210,218-220`; persistent inspectable artifacts appear at `:190-191,218-220`; witness-like confirmation at `:154` | No explicit three-part proof definition, human-witness preference, or artifact-to-regression-oracle lifecycle exists. | Add a compact proof convention and link each frontier to immutable evidence; record oracle graduation as a proposed lifecycle. |
| 5 | Long-lived STEERING should be compact: frontier/issue tree plus immutable-evidence links | **Contradicted by current shape; frontier concept deposited** | Frontier ordering: `STEERING.md:160-220`; issue projection: `:235-264` | `STEERING.md:17`: “this file carries only the current model”; `:18`: “shape is intentionally specific to the present effort.” The file is 292 lines and embeds extensive narrative/tables rather than compact links. | On a future reconciliation pass, retain current choice, frontier/issue tree, gates and links; move durable evidence/details to immutable records. |
| 6 | `docs/planning/<effort>` no longer accepted as ordering principle; effort becomes metadata; role taxonomy proposed, not final | **Contradicted / proposal absent** | Current index remains effort-oriented | `docs/INDEX.md:28`: `history/planning/elicitation-kernel`; `:39`: `planning/process-model-elicitation (effort active…)`; `:69`: `planning/_shared`; `:114-118`: “Both efforts moved wholesale to `docs/planning/<effort>/`…” | Record the proposed role taxonomy as unresolved design input; only after ratification revise INDEX/path policy. |
| 7 | Evaluation vocabulary/placement: case corpus, local fixture, immutable run snapshot, reviewed oracle | **Absent / not locked** | No authoritative vocabulary found | Existing terms are inconsistent: `docs/INDEX.md:13` “corpus inventory”; `STEERING.md:168-176` “fixture”; `:190-193` test/proposal evidence. No lifecycle distinction is defined. | Add an explicitly provisional vocabulary note with placement examples; do not migrate files until ratified. |
| 8 | Demo Track A vs biopharma Track B is an external decision gate | **Substance deposited; track labels absent** | `STEERING.md:23-25,256-259,271-274,289`; `COORDINATION.md:133-135` | Current documents frame the gate as create-new/cold-start versus review-existing, not “Track A/Track B.” Biopharma appears only as background at `docs/INDEX.md:22`. | Name both candidate tracks and their external owner/gate in one steering line once terminology is confirmed. |
| 9 | FE-1480 inference authority unresolved | **Durably deposited and consistent** | `STEERING.md:107-112,168-180,248,275,289`; `COORDINATION.md:20-21,45,61,98-101`; governing constraint `ADR-0003:24-46` | No contradiction found. ADR-0003 requires write-time semantics and pure projection; planning correctly leaves the worked CPS adjudication open. | No reconciliation beyond linking the eventual worked transformation/decision and amending ADR-0003 if required. |

### Uncommitted STEERING diff

`docs/planning/_shared/STEERING.md` is already modified. Its diff consists only of Markdown table/list reformatting and line wrapping. It was not produced by this audit; in the shared-worktree protocol it therefore belongs to another actor and **must remain untouched**. Git cannot identify the uncommitted actor, only that the last committed author was Lu Nelson.
```

## Assistant

**Tool Use:** `Task`

```json
{
  "prompt": "Make one narrowly scoped factual correction in the Brunch context root `/Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent`. The shared worktree has unrelated/in-flight edits, especially `docs/planning/_shared/STEERING.md` and agent protocol files: do not touch, stage, format, or commit those. Read `docs/INDEX.md`, then change only its inbox row for `docs/inbox/SDCPNs/` so it no longer calls a fifth gas SDCPN 'expected' or implies a missing artifact. State compactly that the arrival contains seven valid Petrinaut v1 files—two plain-net gas variants, gas SPN/CPN/DCPN, truck, semiconductor—and that a prior `gases-5` reference is unconfirmed/likely erroneous rather than part of the corpus. Re-read the changed file, run `git diff --check -- docs/INDEX.md` and `yarn workspace @hashintel/brunch-agent vitest run test/architecture/docs-index.test.ts` from the HASH root. Stage only the literal path `libs/@hashintel/brunch-agent/docs/INDEX.md`, verify the staged set contains only that path, and commit with message `Correct SDCPN corpus inventory`. Return the commit SHA, exact wording, validation, and confirm unrelated changes remain untouched.",
  "description": "Correct corpus inbox wording"
}
```

## User

**Tool Result:** `TU-034CglO4YHRHYXZ8Nsxp83`

```
Committed as `d38c17120e13d1bc7dd57a9949ec308882108ad6`.

Exact wording:

> Seven valid Petrinaut v1 files: two plain-net gas variants, gas SPN/CPN/DCPN, truck, and semiconductor; a prior `gases-5` reference is unconfirmed and likely erroneous, not part of the corpus

Validation passed:

- `git diff --check -- docs/INDEX.md`
- Docs index test: 7/7 passed
- Pre-commit hooks passed

Only `docs/INDEX.md` was staged and committed. All unrelated in-flight changes remain untouched.
```

## Assistant

Agreed on subagents. I’ll keep this thread for synthesis and decisions; file inspection, parsing, reports, migrations, and verification will run in delegated workers.

I also corrected the corpus inventory so `gases-5` is treated as an unconfirmed, likely erroneous reference—not a missing artifact. Commit: `d38c17120e`.

### Lock status

**Durably deposited**

- Three-register architecture and write-time semantic constraint.
- FE-1480 remains an explicit unresolved authority decision.
- Bounded review-and-revise demo spine.
- Seven-net corpus inventory.

**Agreed here, but not yet deposited**

- Vestera remains the cold-start benchmark.
- Cold-start capability remains important outside the bounded live demonstration.
- Baseline comparison becomes bare Claude vs improved flat prompt vs Brunch.
- Proof bundles require executable evidence, persistent legibility, and human witness.
- STEERING should become a compact frontier/issue tree linking immutable evidence.
- Evaluation vocabulary: case, fixture, run snapshot, reviewed oracle.
- Effort should become metadata rather than documentation’s directory authority.

**Still pending**

- Track A versus biopharma demo decision.
- Exact optimisation handoff contract.
- Minimum coherent CPS semantic coverage.
- Evaluation/document placement convention.
- Issue coverage for controller, runbooks, proof instruments, and baseline reruns.

The current STEERING file therefore does **not** yet represent all settled discussion. It also has an in-flight modification from another actor, which remains untouched.

### Most useful material now

In priority order:

1. **Outcome of tomorrow’s use-case decision**, including rationale and expected demo claim.
2. **Yannis’s L0–L5 ladder and grading dimensions**—an export rather than inaccessible links.
3. **SOL-90 instance/state-specification schema** when available.
4. **Optimisation handoff example:** one representative input artifact and what Chris/Yannis expect to consume.
5. **Export of Yannis’s mathematical review thread**, including Dora’s fixes.
6. **Best current flat prompt** for the new baseline—or confirmation that we should derive it from the existing research and v0 prompt.
7. For provenance, a small manifest for the seven nets: author, source location, revision date, and review status.

Once the use-case decision lands, we can conduct the actual Frontier 0 lock pass: ratify only the necessary decisions, route each to its correct authority, compact STEERING, and expose remaining issue gaps.

## User

In the meantime, we can do the topology cleanups and stale-to-archive passes that we've already described and agreed upon, and reconciliation and clarification of all attendant agent guidance. I then also want to re-examine the list of routine agent actions you had proposed when first outlining the "STEERING" protocol, before you had actually named it. Scan back over that stuff, collect it, look for any gap we haven't mapped or agreed, let's lock those and do them

## Assistant

I’ll treat this as one control-surface migration with three outputs: a role-based documentation topology, reconciled agent guidance, and a locked steering operating loop. I’ll keep synthesis here and delegate the inventory, file classification, moves, link repair, and verification. First I’m loading the governing guidance for architecture-sensitive and agent-facing changes.

**Tool Use:** `skill`

```json
{
  "name": "posture",
  "arguments": "Apply the Brunch prototype/high-stakes/current-milestone posture to a documentation/control-surface topology migration."
}
```

**Tool Use:** `skill`

```json
{
  "name": "dogsled:ds-writing-for-agents",
  "arguments": "Reconcile Brunch AGENTS.md and docs/agents guidance around STEERING, documentation topology, proof artifacts, and recurring steering actions."
}
```

**Tool Use:** `skill`

```json
{
  "name": "building-skills",
  "arguments": "Assess and, only if justified by the locked protocol, create or edit a local Brunch steering skill. Load before touching skill files."
}
```

**Tool Use:** `skill`

```json
{
  "name": "dogsled:ds-domain-modeling",
  "arguments": "Use precise authority and lifecycle vocabulary for control, spec, decision, evidence, reference, and archive documents."
}
```

## User

**Tool Result:** `TU-034Cgr60mtLZY97kxALo2K`

```
{
  "content": [
    {
      "text": "<loaded_skill name=\"posture\">\n# posture Skill\n\n\n# Posture\n\nA **posture** declares a repo's epistemic and strategic stance so architecture-sensitive decisions default correctly. The instance lives in `<cwd>/memory/POSTURE.md`; this skill is the schema and its behavioral consequences.\n\n## Instance format\n\n`memory/POSTURE.md` declares one **preset**, then only the axes that diverge:\n\n```\nposture: prototype\n\nstakes: high                 # override + one-line reason\nhorizon: current-milestone\n```\n\nA bare preset name with no overrides is valid. The overrides carry the signal — they are the interesting, non-default facts about the project. Presets are authoring shorthand; they expand to the six stored dimensions (the form persisted in the workspace state stub).\n\n## Presets\n\nPick the closest preset, override the rest.\n\n| axis         | `prototype`    | `product`              |\n| ------------ | -------------- | ---------------------- |\n| certainty    | proving        | earned                 |\n| migration    | free-rewrite   | deprecation-discipline |\n| dependencies | resist         | resist                 |\n| audience     | internal       | external               |\n| stakes       | low            | high                   |\n| horizon      | current-slice  | current-milestone      |\n\n- **`prototype`** — early, uncertain, internal. Optimize for proof and rewrite speed.\n- **`product`** — shipped, externally consumed, stable. Optimize for continuity and public-surface care.\n- **`library`** — `product` with `horizon: next-major` (API stability across majors).\n\n`dependencies` defaults to `resist` in both presets; it is the axis most often overridden to `accept` when a project deliberately buys into a framework.\n\n## Axes and behavior\n\nEach axis names the behavior its non-default pole imposes; the relaxed pole is the baseline.\n\n**certainty: proving | earned**\n- `proving` → no abstraction until two real callers (rule of three); no generics; prefer inlining. Under uncertainty, complexity is a tax on future understanding.\n- `earned` → abstraction permitted where a second real caller exists; materialize topology into structure; canonicalize names; delete obsolete shims and concept bridges. Closure and conceptual integrity over first-cut speed.\n\n**migration: free-rewrite | deprecation-discipline**\n- `free-rewrite` → change or remove the old shape directly; let compile/type/test breakage enumerate the rewrite. No aliases, adapters, shims, or expand/contract schemes unless (a) the transition crosses a boundary you cannot update atomically — separate deploys/processes, persisted data, external consumers — or (b) the bridge is named, tiny, and removed in the same slice.\n- `deprecation-discipline` → preserve existing call sites and contracts across slices; deprecate before removing.\n\n**dependencies: accept | resist**\n- `accept` → take well-fit dependencies on their happy path; don't reinvent.\n- `resist` → treat new dependency surface as cost until proven otherwise; strip or fork before adding; lose weight opportunistically.\n\n**audience: internal | external**\n- `internal` → optimize for the team; minimal public-surface ceremony.\n- `external` → care with public surface: naming, docs, error messages, stability.\n\n**stakes: low | high**\n- `low` → trust internal callers; minimal defensive code.\n- `high` → validate at boundaries; fail loud; defensive error paths.\n\n**horizon: current-slice | current-milestone | next-major**\n- Stubs and layouts extend only as far as work named in project planning artifacts (e.g. `memory/PLAN.md`, `memory/SPEC.md`) within the declared horizon — no further.\n\n## Scope — repo default, narrower override\n\n`memory/POSTURE.md` is the **repo default**, but posture is not uniform across a codebase: a mostly-`earned` repo can carry a fresh `proving` seam, and a settled seam can regress to `proving` on a new unknown. A narrower scope — a frontier, milestone, or work item — may therefore **override** one or more axes for its duration; the override wins inside that scope and falls back to the repo default outside it.\n\n`certainty` is the axis that most often varies this way, because it flips the planning decision kernel (`proving` → optimize for information gain; `earned` → optimize for closure gain); the other axes are usually stable repo-wide. An override is a **state, not a permanent mode** — `earned → proving` on a new unknown is a transition, not a third value.\n\nHow overrides are recorded is the project's call. In repos using the `ln-*` planning system, each frontier in `memory/PLAN.md` carries an explicit `Certainty:` field — consult that planning convention rather than restating it here.\n\n## The common early-stage posture\n\n`prototype` (proving · free-rewrite · current-slice) is the default for new work: prefer breakage-driven rewrite over compatibility scaffolding — remove or change the thing, then follow the fix list. Well-typed systems make the fix list legible; reach for a bridge only when the type/test surface cannot reach the change (wire formats, persisted state, external consumers).\n\n## Conflicts\n\nThe **effective** posture for a piece of work is the repo default plus any active per-frontier override. If a request implies a posture different from that (external API but `audience: internal`; a generic framework but `certainty: proving`), state the mismatch, name the behavioral consequence, and ask before taking the more committing path. Do not silently average conflicting postures.\n\n---\n\n*Note — posture can also appear as a **product** concept: a project-grounding tool may capture a user's project posture as first-class data (Brunch mirrors this exact vocabulary). Keep any such product model independently owned — this skill is the methodology vocabulary, not a shared module.*\n\n\nARGUMENTS: Apply the Brunch prototype/high-stakes/current-milestone posture to a documentation/control-surface topology migration.\n\nBase directory for this skill: file:///Users/lunelson/.agents/skills/posture\nRelative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.\n</loaded_skill>",
      "type": "text"
    }
  ]
}
```

**Tool Result:** `TU-034Cgr61xLTkCJl9lJfHtQ`

```
{
  "content": [
    {
      "text": "<loaded_skill name=\"dogsled:ds-writing-for-agents\">\n# ds-writing-for-agents Skill\n\n\n<!-- Vendored from mattpocock/skills@84fdeff: skills/productivity/writing-for-agents -->\n\nReference for writing any document an agent consumes — a skill, an `AGENTS.md` / `CLAUDE.md`, a doc reached by a pointer. The packaging differs; the writing does not: the same levers make each one predictable — the agent taking the same _process_ every run, not producing the same output.\n\nWhen the document you're writing is a skill, read [`SKILL-MECHANICS.md`](SKILL-MECHANICS.md) for frontmatter, invocation choice, and router skills.\n\n## Context pointers\n\nA **context pointer** is a reference held in the agent's context that names some out-of-context material and encodes the condition for reaching it. A skill's description is one; a line in `AGENTS.md` naming a doc is the same object. The pointer's _wording_, not its target, decides when the agent reaches the material — and how reliably. A must-have target behind a weakly worded pointer is a variance bug: sharpen the wording first, and inline the material only if sharpening fails.\n\nA pointer does two jobs — state what the material is, and list the **branches** that should trigger reaching it (a branch is a distinct case the document handles, so different runs take different paths through it). Every word of an always-loaded pointer costs on every turn, so it earns even harder pruning than the body:\n\n- **Front-load the leading word** — the pointer is where it does its triggering work.\n- **One trigger per branch.** Synonyms that rename a single branch are one branch written twice; collapse them and keep only genuinely distinct branches.\n- **Cut identity the body already carries.**\n\n## The two loads\n\nEvery document and pointer you add spends one of two budgets:\n\n- **Context load** — the cost of always-loaded material on the agent's window: an `AGENTS.md` line, a skill description, anything sitting in context every turn, spending tokens and attention whether or not it fires.\n- **Cognitive load** — the cost on the human: which documents exist and when to reach for each. The human is the index. Not a cost to minimise — it is the price of human agency; spend it where human judgement matters, remove it where it does not.\n\nMaterial reached only through a pointer escapes context load at the price of the pointer's own line; material with no pointer at all rides entirely on cognitive load.\n\n## Information hierarchy\n\nA document is built from two content types — **steps** (the ordered actions the agent performs) and **reference** (definitions, rules, facts consulted on demand) — that mix freely: all steps (a recipe), all reference (a review's rules, this skill), or both. The core decision is where each piece sits on the **information hierarchy**, a ladder ranked by how immediately the agent needs the material:\n\n1. **In-file step** — the primary tier: what the agent does, in order.\n2. **In-file reference** — consulted on demand. Often a legitimately flat peer-set (every rule of a review on one rung) — a fine arrangement, not a smell.\n3. **Disclosed reference** — pushed out into a separate file, reached by a context pointer, loaded only when the pointer fires. Spans a sibling file in the same folder through fully external reference that lives anywhere and any document can point at.\n\nPush too little down and the top bloats; push too much and you hide material the agent actually needs. That tension is the whole decision.\n\n**Progressive disclosure** is the move down the ladder — out of the main file and behind a pointer — so the top stays legible. Not primarily a token optimisation: it is how the hierarchy is protected. Branching is the cleanest disclosure test: inline what every branch needs, and push behind a pointer what only some branches reach. When a document has steps, in-file reference that should be disclosed buries them and turns attending to them into a coin-flip — a variance lever, not just a legibility one.\n\n**Co-location** is the within-file companion: where the ladder decides _how far down_ a piece sits, co-location decides _what sits beside it_ once there. Keep a concept's definition, rules, and caveats under one heading rather than scattered, so reading one part brings its neighbours with it. The test: the document should read like documentation written for the agent — grouped material reads that way; scattered material does not. (Distinct from duplication: that repeats one meaning in two places; scattering fragments one meaning across many.)\n\n**Sprawl** is the failure mode here: a document simply too long, even when every line is live and unique. Attention thins across the excess, and every extra line is one more to keep relevant. The cure is the ladder: disclose reference behind pointers, and split by branch or sequence so each path carries only what it needs.\n\n## Steps and completion criteria\n\nEvery step ends on a **completion criterion** — the condition that tells the agent the work is done. Two properties make it a lever:\n\n- **Clarity** — can the agent tell done from not-done? A vague bound (\"understanding reached\") invites **premature completion**: ending the step before it is genuinely done, attention slipping to _being done_. The visible steps still ahead — the **post-completion steps** — supply the pull; the criterion's clarity is the resistance. Defend in order: **sharpen the bound first** (local and cheap); only if it is irreducibly fuzzy _and_ you observe the rush, hide the later steps by splitting the sequence — and hiding only works across a real context boundary (a hand-off or a subagent dispatch; an inline call leaves the later steps in context and clears nothing).\n- **Demand** — how much it requires. \"Every modified model accounted for\" forces thorough work where \"produce a change list\" does not. Demand drives **legwork** — the digging the agent does within the work, latent in the wording rather than written as its own step — and it is not step-bound: \"every rule applied\" binds a body of flat reference just as \"every step done\" binds a sequence, which is how an all-reference document still carries an exhaustiveness bar.\n\nThe strongest criteria are both checkable and exhaustive.\n\n## When to split\n\nSplitting one document into two spends one of the two loads, so split only when the cut earns it:\n\n- **By sequence** — split a run of steps where the post-completion steps tempt the agent to rush the one in front of it. Keeping them out of view drives more legwork on the current task. Beware the reverse: merging sequences exposes each step's later steps to what follows, inviting premature completion.\n- **By invocation** — skill-specific: see [`SKILL-MECHANICS.md`](SKILL-MECHANICS.md).\n\n## Leading words\n\nA **leading word** is a compact concept already living in the model's pretraining that the agent thinks with while running the document (_lesson_, _fog of war_, _tracer bullets_). Repeated as a token, never as a sentence, it accumulates a distributed definition and anchors a whole region of behaviour in the fewest tokens, by recruiting priors the model already holds. Coining your own works if you define it clearly, but a made-up word recruits no priors — you pay in definition tokens what a pretrained word gives free; reach for an existing word first.\n\nIt anchors twice. In the body, _execution_: the agent reaches for the same behaviour every time the word appears, and inside flat reference it focuses attention on a class of thing to look for. In a pointer, _invocation_: when the same word lives in your prompts, your docs, and your codebase, the agent links that shared language to the material and reaches it more reliably.\n\nHunt for opportunities to refactor with leading words. A triad spelled out at three sites, a pointer spending a sentence to gesture at one idea — each is a passage begging to collapse into a single token:\n\n- \"fast, deterministic, low-overhead\" → _tight_ (a _tight_ loop).\n- \"a loop you believe in\" → _red_ — a fuzzy gate becomes a binary observable state (the loop goes _red_ on the bug, or it doesn't).\n\nYou win twice: fewer tokens, and a sharper hook for the agent to hang its thinking on. Assume every document is carrying restatements that leading words retire — go find them.\n\n**Negation** is the failure mode beside this lever: steering by prohibition drags the forbidden behaviour into context and makes it _more_ available, not less. _Don't think of an elephant_, and the elephant is all there is; the negation is a weak modifier the strongly-activated concept overruns, so the ban half-reads as an instruction to do the thing. Prompt the **positive** — state the target behaviour (\"write one-line comments\") so the banned one is never spoken. A prohibition earns its place only as a hard guardrail you cannot phrase positively; even then, pair it with the positive target so attention lands on what to do.\n\n## Pruning\n\n- Keep each meaning in a **single source of truth**: one authoritative place, so changing the behaviour is a one-place edit. **Duplication** — the same meaning in more than one place — costs maintenance and tokens, and inflates a meaning's prominence on the ladder past its real rank. (The accidental inverse of a leading word, which repeats a token on purpose, never the meaning.)\n- The **environment** is a source of truth too — `package.json` scripts, config files, the directory layout, `--help` output — and a document that restates it is a **cache**: a copy of a lookup, earning its load only when the lookup is expensive. Cache what the agent cannot find by looking: the unwritten convention, the reason behind a choice, the gotcha no config confesses. Leave the one-file, one-command lookups to the environment, where they cannot go stale.\n- Check every line for **relevance**: does it still bear on what the document does? A line loses relevance by never bearing on the task (mere exposition, or a branch that should be disclosed) or by going stale as the behaviour or world it describes changes. Shorter documents are easier to keep relevant. Without a pruning discipline the default fate is **sediment**: stale layers that settle because adding feels safe and removing feels risky, until you must core down through them to find what is still live.\n- Hunt **no-ops** sentence by sentence: an instruction the model already obeys by default pays load to say nothing. The test — does it change behaviour versus the default? — is model-relative, not reader-relative: two people disagreeing about a no-op disagree about the default, and settle it by running the document, not by debate. When a sentence fails, delete the whole sentence rather than trim words from it. The test also grades leading words: a word too weak to beat the default (_be thorough_ when the agent is already thorough-ish) is a no-op, and the fix is a stronger word (_relentless_), not a different technique.\n\n\nARGUMENTS: Reconcile Brunch AGENTS.md and docs/agents guidance around STEERING, documentation topology, proof artifacts, and recurring steering actions.\n\nBase directory for this skill: file:///Users/lunelson/.config/amp/plugins/dogsled/skills/ds-writing-for-agents\nRelative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.\n\n<skill_files>\n<file>/Users/lunelson/.config/amp/plugins/dogsled/skills/ds-writing-for-agents/SKILL-MECHANICS.md</file>\n<file>/Users/lunelson/.config/amp/plugins/dogsled/skills/ds-writing-for-agents/agents/openai.yaml</file>\n</skill_files>\n</loaded_skill>",
      "type": "text"
    }
  ]
}
```

**Tool Result:** `TU-034Cgr62RW6NM1JMBBmjYK`

```
{
  "content": [
    {
      "text": "<loaded_skill name=\"building-skills\">\n# building-skills Skill\n\n# Building Skills\n\nCreates well-structured Agent Skills following best practices.\n\n## Skill Structure\n\nEvery skill needs a `SKILL.md` file with YAML frontmatter:\n\n```markdown\n---\nname: my-skill-name\ndescription: Does X when Y happens. Use for Z tasks.\n---\n\n# Skill Title\n\nInstructions go here.\n```\n\n## Frontmatter Requirements\n\n### name (required)\n- Maximum 64 characters\n- Lowercase letters (a-z), numbers (0-9), and hyphens only\n- Must not start or end with a hyphen\n- No consecutive hyphens (`my--skill` is invalid)\n- Must match parent directory name exactly\n- Use gerund form (verb + -ing): `processing-pdfs`, `analyzing-data`, `managing-deployments`\n- Avoid vague names: `helper`, `utils`, `tools`\n\n### description (required)\n- Maximum 1024 characters (should be much shorter than 1024 characters)\n- Write in third person (\"Processes files\" not \"I process files\")\n- Include BOTH what the skill does AND when to use it\n- Be specific with key terms for discovery\n- **Quote the value** if it contains colons, special YAML characters, or \"Triggers on:\" patterns:\n  ```yaml\n  description: \"Fetches tasks from Notion. Triggers on: my tasks, show work.\"\n  ```\n\n**Good descriptions:**\n- \"Extracts text and tables from PDF files, fills forms, merges documents. Use when working with PDF files or asked to read/edit PDFs.\"\n- \"Queries BigQuery datasets using the bq CLI. Use for data analytics, SQL queries, or Google Cloud data warehouse tasks.\"\n- \"Reviews pull requests for code quality, security, and test coverage. Use when asked to review a PR or diff.\"\n\n**Bad descriptions:**\n- \"Helps with files\" (too vague)\n- \"I can help you with data\" (wrong POV)\n- \"PDF tool\" (no trigger context)\n\n### Optional fields\n- `license`: License identifier (e.g., \"MIT\", \"Apache-2.0\")\n- `compatibility`: Max 500 characters describing compatibility requirements\n- `metadata`: Arbitrary metadata object\n- `allowed-tools`: List of tools the skill can use\n- `argument-hint`: Hint for skill arguments\n- `model`: Preferred model for the skill\n- `mode`: Agent mode override\n- `isolatedContext`: Run skill in isolated context\n- `mcpServers`: Inline MCP server config for skills, especially single-file skills (see Bundling MCP Servers)\n\n## Directory Structure\n\n### Simple Skill (instructions only)\n```\n.agents/skills/my-skill/\n└── SKILL.md\n```\n\n### Skill with Scripts\n```\n.agents/skills/my-skill/\n├── SKILL.md\n└── scripts/\n    └── my-script.sh\n```\n\n### Complex Skill (progressive disclosure)\n```\n.agents/skills/my-skill/\n├── SKILL.md           # Overview, under 500 lines\n├── reference/\n│   ├── api.md         # Detailed API docs\n│   └── examples.md    # Code examples\n└── scripts/\n    └── validate.py    # Executable scripts\n```\n\n## Progressive Disclosure\n\nSkills load in stages to save context:\n\n1. **Level 1 - Metadata**: Name + description loaded at startup (~100 tokens)\n2. **Level 2 - Instructions**: SKILL.md body loaded when triggered (<5k tokens)\n3. **Level 3 - Resources**: Additional files loaded only when needed\n\nKeep SKILL.md under 500 lines. Split large content into separate files.\n\n## Writing Effective Instructions\n\n### Do\n- Start with a clear one-line summary\n- List specific capabilities\n- Provide step-by-step workflows\n- Include concrete examples\n- Reference scripts with execution intent: \"Run `scripts/validate.py` to check...\"\n\n### Don't\n- Explain concepts the model already knows\n- Add lengthy introductions or summaries\n- Include time-sensitive information in main sections\n- Use abstract examples\n\n## Executable Scripts\n\nPlace scripts in a `scripts/` subdirectory and reference them in SKILL.md:\n\n```\n.agents/skills/my-skill/\n├── SKILL.md\n└── scripts/\n    └── run-task.sh\n```\n\nReference with execution intent: \"Run `scripts/run-task.sh` to execute the task\"\n\n## Bundling MCP Servers\n\nSkills can bundle MCP servers. The MCP starts at Amp startup but its tools stay hidden until the skill loads. There are two ways to declare servers.\n\n### Inline in frontmatter (default)\n\nPrefer this. Declare servers under an `mcpServers` key in SKILL.md frontmatter, keyed by server name. It keeps the skill a single self-contained file — the simplest to move, import, and review.\n\n```markdown\n---\nname: web-browser\ndescription: Automates a Chrome browser. Use for navigating pages and taking screenshots.\nmcpServers:\n  chrome-devtools:\n    command: npx\n    args: [\"-y\", \"chrome-devtools-mcp@latest\"]\n    includeTools: [\"navigate_page\", \"take_screenshot\"]\n---\n```\n\n### Sibling mcp.json (multi-file skills)\n\nUse a separate `mcp.json` only when the skill already needs a directory of resources (`scripts/`, `reference/`). If an `mcpServers` key is present it takes precedence over a sibling `mcp.json` — even when empty or containing no valid specs — and the two are never merged, so do not leave a stale `mcp.json` behind after moving config inline.\n\n```\n.agents/skills/web-browser/\n├── SKILL.md\n└── mcp.json\n```\n\n**Example mcp.json:**\n```json\n{\n  \"chrome-devtools\": {\n    \"command\": \"npx\",\n    \"args\": [\"-y\", \"chrome-devtools-mcp@latest\"],\n    \"includeTools\": [\"navigate_page\", \"take_screenshot\"]\n  }\n}\n```\n\nBoth forms use the same server-spec fields, so folding an `mcp.json` into inline frontmatter is a direct copy of the server map.\n\n### ALWAYS Filter MCP Tools\n\n**This is critical.** MCP servers often expose many tools (chrome-devtools has 26 tools = 17,700 tokens). Always use `includeTools` to expose only what the skill needs.\n\nAsk the user: \"Which tools from this MCP do you actually need?\"\n\n```json\n{\n  \"includeTools\": [\"navigate_page\", \"take_screenshot\", \"click\"]\n}\n```\n\nThis reduces token cost by 90%+ and keeps the skill focused.\n\nThe same gating exists for plugin tools: a plugin's bundled skill can list the\nplugin's own tools in `builtin-tools` frontmatter to hide them until the skill\nloads. See the building-plugins skill.\n\n### MCP server fields\n\n- `command`: Command to run for stdio servers (required unless `url` is set)\n- `args`: Array of arguments for stdio servers\n- `env`: Environment variables for stdio servers\n- `url`: HTTP MCP server URL (required unless `command` is set)\n- `headers`: HTTP request headers\n- `transport`: HTTP transport (`http`, `sse`, or `http-first`)\n- `includeTools`: **Always set this.** Glob patterns for which tools to expose. Do not guess tool names; use web search to find the tool names if in doubt.\n\n## Importing or Moving Skills\n\nWhen importing a skill (from another repo, a teammate, or the internet) or moving one between locations:\n\n- Prefer collapsing it to a single SKILL.md. Fold any sibling `mcp.json` into inline `mcpServers` frontmatter and delete the `mcp.json`.\n- A skill that ships `scripts/` or `reference/` must keep its directory layout; move the whole directory intact.\n- Preserve `includeTools` filters; if missing, add them before use.\n- Rename the frontmatter `name` and its parent directory to match your conventions.\n\n### Untrusted skills from the internet\n\nTreat internet-sourced skills as untrusted until reviewed:\n\n- MCP `command` servers run arbitrary local processes when Amp discovers the skill at startup, before the skill is triggered. Read every server spec before adding the skill.\n- Inspect `command`, `args`, `env`, and any bundled scripts for anything unexpected (network calls, credential access, install steps).\n- Always set `includeTools` to the minimum the skill needs.\n\n## Skill Locations\n\nSkills are discovered from:\n- `.agents/skills/` in the workspace (project-specific)\n- `~/.config/agents/skills/` globally (user-wide)\n- `~/.agents/skills/` globally (legacy user-wide)\n- `~/.config/amp/skills/` globally for backwards compatibility\n- Global User/Workspace Skills repositories (managed, loaded from the server)\n\nRepository- or app-specific skills belong in `.agents/skills/`, checked in with\nthe project's code. Global skills may bundle text files (`scripts/`,\n`reference/`) alongside `SKILL.md`; binary files are not served, so skills\nwith binary assets stay in a project repo.\n\nIn an Amp sandbox/orb, local skill directories do not outlive the sandbox, so a\npersistent skill belongs in a global repository (or `.agents/skills/` when it is\nrepo-specific).\n\nTo install a skill into the local global directory from an existing source, use\n`amp skill add --global <source>` where the source is `@user/skill`,\n`owner/repo`, a git URL, or a local path (`--name`, `--overwrite`). Global\nUser/Workspace skills are managed through their repository instead.\n\nInspect an Amp personal skill URL with `read_web_page`. If it is inaccessible, say\nit may be private or unavailable. If the current user message explicitly asks to\nimport it, clone the requested User or Workspace Skills repository. Then run\n`amp skills import <url> --repository <clone-directory>`.\nThis downloads and verifies the revision-pinned files but does not commit or push.\nFor an explicit update request, run `amp skills update <name>` in the clone, never\nto check or compare.\nUse `--force` only when explicitly asked to replace committed changes.\nReview the imported files, then use the signed global repository commit and push\nworkflow below. Only a workspace admin can push a Workspace import, and the\nWorkspace scope must be writable. A personal skill with the same name continues\nto take precedence for that user until it is deleted.\n\nFor a named member, use `list_workspace_members`, then\n`find_shared_plugins_and_skills` with their `userID`, the kind, and the name.\n\n## Global User/Workspace Skills\n\nDiscover global repositories with `amp skills repositories`. It lists each scope\n(User/Workspace) with its clone URL and `amp clone` command, whether it has any\nskills yet, and whether the user can write it. If the command is unavailable or\nlists no repositories, only the local directories are available. A scope with no\nskills yet is simply empty — do not present it as a missing or uncreated\nrepository; the repository is created automatically on the first push.\n\nWriting to a global skills repository:\n- Each skill is a top-level `<skill-name>/` directory with `SKILL.md` directly\n  inside it; the directory name must match the frontmatter `name`. Text files\n  bundled under the skill directory (`scripts/`, `reference/`) are served too.\n  Binary files are not: a skill containing one is not loaded. A skill that\n  needs MCP tools can use inline `mcpServers` frontmatter or a sibling\n  `mcp.json`.\n- Default an unqualified request to the User Skills scope; use a Workspace scope\n  only when the user asks for it and its repository entry is writable. Workspace\n  pushes affect all teammates and require workspace admin permission.\n- Work in the canonical clone directory, never in the repo root:\n  `~/.cache/amp/repositories/<host>-<scope>-skills` (host from the clone URL,\n  e.g. `~/.cache/amp/repositories/ampcode.com-user-skills`). If the directory\n  already holds a clone, reuse it: fetch and reset to the remote's main branch\n  instead of re-cloning. Otherwise clone the repository there with the\n  `amp clone` command that `amp skills repositories` prints, passing the cache\n  directory as the target (it handles authentication), add the skill, and\n  commit. If the scope has no skills yet (no repository to clone), `git init`\n  the directory, run\n  `git config credential.helper '!amp git-credential-helper'`, commit, then add\n  the clone URL as the `origin` remote (create-on-first-write creates it on\n  the first push).\n- Do not push unless the user explicitly asks or confirms; a push makes the\n  skill visible to other threads, users, or workspaces. A new skill or a change\n  to an existing one only takes effect after a push (Amp loads global skills\n  from the server, not the local clone), so after committing, offer to push,\n  naming the destination repository (for example \"Ready to push this to your\n  global user skills repository so it takes effect?\") — never a bare \"Want me\n  to push it?\", a destination-less \"committed\" or \"not pushed\", or git\n  mechanics. After a confirmed push, tell the user where the skill was pushed\n  and when it takes effect (new threads pick it up automatically; the current\n  session after `reload_skills`).\n- Updating or deleting a global skill works the same way: change or remove its\n  `<skill-name>/` directory in the repository clone, commit, and (with\n  confirmation) push. Never edit or delete `~/.cache/amp/global-skills/`; it is\n  a read-only materialized cache that re-syncs from the server, so changes there\n  are silently undone.\n\n## Reloading Skills\n\nAfter creating, editing, deleting, or (for global skills) pushing a skill, use\nthe `reload_skills` tool so the running session picks up the change — no Amp\nrestart needed. It rescans local skill directories and re-syncs global skills\nfrom the server. Shell commands like `amp skills list` do not reload the\nrunning session.\n\n\nARGUMENTS: Assess and, only if justified by the locked protocol, create or edit a local Brunch steering skill. Load before touching skill files.\n\nBase directory for this skill: builtin:///skills\nRelative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.\n</loaded_skill>",
      "type": "text"
    }
  ]
}
```

**Tool Result:** `TU-034Cgr62prWoQAmOIZRF6K`

```
{
  "content": [
    {
      "text": "<loaded_skill name=\"dogsled:ds-domain-modeling\">\n# ds-domain-modeling Skill\n\n\n<!-- Vendored from mattpocock/skills@8b78b53: skills/engineering/domain-modeling -->\n\n# Domain Modeling\n\nActively build and sharpen the project's domain model as you design. This is the *active* discipline — challenging terms, inventing edge-case scenarios, and writing the glossary and decisions down the moment they crystallise. (Merely *reading* `CONTEXT.md` for vocabulary is not this skill — that's a one-line habit any skill can do. This skill is for when you're changing the model, not just consuming it.)\n\n## File structure\n\nMost repos have a single context:\n\n```\n/\n├── CONTEXT.md\n├── docs/\n│   └── adr/\n│       ├── 0001-event-sourced-orders.md\n│       └── 0002-postgres-for-write-model.md\n└── src/\n```\n\nIf a `CONTEXT-MAP.md` exists at the root, the repo has multiple contexts. The map points to where each one lives:\n\n```\n/\n├── CONTEXT-MAP.md\n├── docs/\n│   └── adr/                          ← system-wide decisions\n├── src/\n│   ├── ordering/\n│   │   ├── CONTEXT.md\n│   │   └── docs/adr/                 ← context-specific decisions\n│   └── billing/\n│       ├── CONTEXT.md\n│       └── docs/adr/\n```\n\nCreate files lazily — only when you have something to write. If no `CONTEXT.md` exists, create one when the first term is resolved. If no `docs/adr/` exists, create it when the first ADR is needed.\n\n## During the session\n\n### Challenge against the glossary\n\nWhen the user uses a term that conflicts with the existing language in `CONTEXT.md`, call it out immediately. \"Your glossary defines 'cancellation' as X, but you seem to mean Y — which is it?\"\n\n### Sharpen fuzzy language\n\nWhen the user uses vague or overloaded terms, propose a precise canonical term. \"You're saying 'account' — do you mean the Customer or the User? Those are different things.\"\n\n### Discuss concrete scenarios\n\nWhen domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.\n\n### Cross-reference with code\n\nWhen the user states how something works, check whether the code agrees. If you find a contradiction, surface it: \"Your code cancels entire Orders, but you just said partial cancellation is possible — which is right?\"\n\n### Update CONTEXT.md inline\n\nWhen a term is resolved, update `CONTEXT.md` right there. Don't batch these up — capture them as they happen. Use the format in [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md).\n\n`CONTEXT.md` should be totally devoid of implementation details. Do not treat `CONTEXT.md` as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.\n\n### Offer ADRs sparingly\n\nOnly offer to create an ADR when all three are true:\n\n1. **Hard to reverse** — the cost of changing your mind later is meaningful\n2. **Surprising without context** — a future reader will wonder \"why did they do it this way?\"\n3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons\n\nIf any of the three is missing, skip the ADR. Use the format in [ADR-FORMAT.md](./ADR-FORMAT.md).\n\n\nARGUMENTS: Use precise authority and lifecycle vocabulary for control, spec, decision, evidence, reference, and archive documents.\n\nBase directory for this skill: file:///Users/lunelson/.config/amp/plugins/dogsled/skills/ds-domain-modeling\nRelative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.\n\n<skill_files>\n<file>/Users/lunelson/.config/amp/plugins/dogsled/skills/ds-domain-modeling/ADR-FORMAT.md</file>\n<file>/Users/lunelson/.config/amp/plugins/dogsled/skills/ds-domain-modeling/CONTEXT-FORMAT.md</file>\n<file>/Users/lunelson/.config/amp/plugins/dogsled/skills/ds-domain-modeling/agents/openai.yaml</file>\n</skill_files>\n</loaded_skill>",
      "type": "text"
    }
  ]
}
```

## Assistant

The authority split I’m aiming to validate is:

- `STEERING` — current strategic state under constraint
- `COORDINATION` — issue-graph roots, dependencies, and mechanical sequencing
- specs — required behavior
- ADRs — durable decisions and rationale
- evidence — observed proof and promoted regression oracles
- reference — stable explanatory material
- archive — historical context with no current authority

I’m commissioning three independent audits now: document lifecycle/topology, agent guidance, and the steering routine/gaps. No files will move until those inventories agree on authority and inbound links.

**Tool Use:** `Task`

```json
{
  "prompt": "READ-ONLY AUDIT. Work in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent. Do not modify, stage, or commit anything. The user wants a role-based documentation topology replacing docs/planning/<effort>, plus a stale-to-archive/delete pass. Read CONTEXT.md, docs/INDEX.md, docs/agents/documentation.md, all current docs file paths and enough content to classify them, plus inbound Markdown links/references. Also inspect git status and recent history so you do not confuse concurrent edits with committed baseline. Deliver: (1) current document inventory grouped by current authority/role, (2) per-file keep/move/archive/delete recommendation with concise rationale, (3) exact proposed destination for every move, (4) inbound links/index/guidance that must be repaired, (5) documents whose currentness or external references make deletion unsafe, (6) a compact final role-based tree. Treat 'effort' as metadata, not a filesystem ordering principle. Preserve docs/inbox as transient intake unless evidence shows a better role. Flag any ambiguity that materially blocks safe execution. Report exact paths.",
  "description": "Classify Brunch documents"
}
```

**Tool Use:** `Task`

```json
{
  "prompt": "READ-ONLY AUDIT. Work in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent. Do not modify, stage, or commit anything. Audit AGENTS.md, docs/agents/*.md, .agents/skills/** if present, docs/INDEX.md, and relevant package scripts/tests for a migration to role-based docs and a recurring strategic STEERING protocol. Important: docs/agents/git-workflow.md, issue-writing.md, legibility.md, docs/planning/_shared/STEERING.md, and hash-monorepo-import-plan.md have concurrent uncommitted edits; inspect but do not propose overwriting unrelated changes. Deliver: (1) current guidance authority map and contradictions/duplication, (2) exact files/sections that must change for new topology and steering loop, (3) recommendation whether a local skill is justified versus a protocol only, applying single-source-of-truth/progressive-disclosure principles, (4) minimal trigger wording for AGENTS.md or skill metadata, (5) verification commands/tests relevant to docs/guidance/skills, (6) any files better archived or deleted. Use the desired authority split: STEERING strategic state; COORDINATION issue graph; specs behavior; ADR decisions; evidence observed proof/oracles; reference stable explanation; archive historical context.",
  "description": "Audit agent guidance"
}
```

**Tool Use:** `Task`

```json
{
  "prompt": "READ-ONLY AUDIT. Work in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent. Do not modify, stage, or commit anything. Read current docs/planning/_shared/STEERING.md (including worktree diff), COORDINATION.md, docs/agents/arc-close.md, documentation.md, legibility.md, posture.md, issue-tracker.md, and related active planning docs. Evaluate the proposed recurring loop: orient -> choose -> execute -> reconcile -> replan. Responsibilities under consideration: classify facts/beliefs/unknowns/external gates; select frontiers by objective/risk/information gain rather than merely unblocked work; define proof bundle and cut line; map supporting issues/gaps; implement through production wiring; create runnable proof plus immutable legibility snapshot and preferably human witness; promote validated claims into regression oracles; deposit decisions/spec/strategy/sequence/evidence in their authoritative homes; archive stale docs; update confidence only from evidence; replan on changed pressure, failed proof, frontier completion, external decision, or arc close; require approval before external issue writes. Deliver: (1) recovered routine as the smallest complete operating protocol, (2) gaps/overlap/contradictions versus current docs, (3) exact invocation triggers and completion criteria, (4) what belongs in STEERING template versus agent protocol/skill versus arc-close, (5) concrete edits/moves needed to lock it without duplicating meaning. Account for cold-start benchmark/contingency lane, corpus->fixture->run snapshot->oracle lifecycle, human witness/legibility, and external-gate watching.",
  "description": "Audit steering protocol"
}
```

## User

**Tool Result:** `TU-034CgsbG8eG51ZUuU2Nisb`

```
## Audit basis

Read `CONTEXT.md`, `docs/INDEX.md`, `docs/agents/documentation.md`, every documentation path/title/status, internal Markdown link graph, `git status`, diffs, and recent documentation history.

Working tree already has unrelated edits in:

- `docs/agents/git-workflow.md`
- `docs/agents/issue-writing.md`
- `docs/agents/legibility.md`
- `docs/planning/_shared/STEERING.md`
- `docs/planning/_shared/hash-monorepo-import-plan.md`

The first three add guidance; the latter changes are formatting/Graphite wording. I made no changes.

## 1. Current inventory by authority/role

- **Domain authority:** `CONTEXT.md`
- **Index:** `docs/INDEX.md`
- **Accepted decisions:** `docs/adr/*.md`
- **Operating guidance:** `docs/agents/*.md`
- **Primary specification:** `docs/spec.md`
- **Living strategy/control:** `docs/planning/_shared/{STEERING,COORDINATION,SPEC-LEDGER}.md`
- **Architecture/reference aids:** `docs/planning/_shared/{topology,flue-architecture-cheatsheet}.md`
- **Completed migration plan:** `docs/planning/_shared/hash-monorepo-import-plan.md`
- **Active/provisional specifications:** process-model `ir-*`, `plugin-contract-spec.md`, `petrinaut-integration-spec.md`
- **Research:** process-model `research/*`, research-pattern audit, and `docs/reference/*`
- **Experimental evidence:** process-model `baseline/**`, spikes, implementation records
- **Engineering audits/records:** process-model deep reads and `planning/legibility-sweep/*`
- **Historical planning:** `docs/history/planning/elicitation-kernel/**`
- **Superseded records:** demo-vehicle recommendation and open-questions local copy
- **Transient intake:** `docs/inbox/SDCPNs/**`

## 2–3. Recommendations and exact destinations

Paths ending in `/**` preserve their relative contents exactly.

### Keep in place

- `CONTEXT.md`
- `docs/INDEX.md`
- `docs/agents/*.md`
- `docs/adr/*.md`
- `docs/reference/**`
- `docs/inbox/SDCPNs/**`

These already express role rather than effort. Keep the inbox transient pending settlement/conformance.

### Specifications and architecture

| Current path | Recommendation / destination | Rationale |
|---|---|---|
| `docs/spec.md` | `docs/specifications/elicitation-kernel.md` | Primary product contract |
| `docs/planning/process-model-elicitation/ir-design.md` | `docs/specifications/intermediate-representation.md` | Ratified design |
| `docs/planning/process-model-elicitation/ir-design-plain.md` | `docs/specifications/intermediate-representation-plain.md` | Companion rendering |
| `docs/planning/process-model-elicitation/plugin-contract-spec.md` | `docs/specifications/plugin-contract.md` | Provisional specification |
| `docs/planning/process-model-elicitation/petrinaut-integration-spec.md` | `docs/specifications/petrinaut-integration.md` | Active integration contract |
| `docs/planning/process-model-elicitation/capture-store-plain.md` | `docs/architecture/capture-store.md` | Current architectural explanation |
| `docs/planning/_shared/topology.md` | `docs/architecture/topology.md` | Ratified architecture support |
| `docs/planning/_shared/flue-architecture-cheatsheet.md` | `docs/reference/flue-architecture-cheatsheet.md` | Dependency reference, consumed by guidance |

### Strategy and ledgers

| Current path | Destination |
|---|---|
| `docs/planning/_shared/STEERING.md` | `docs/strategy/STEERING.md` |
| `docs/planning/_shared/COORDINATION.md` | `docs/strategy/COORDINATION.md` |
| `docs/planning/_shared/SPEC-LEDGER.md` | `docs/ledgers/SPEC-LEDGER.md` |

All remain living documents; effort is metadata in their headers/index rows.

### Research and meeting records

| Current path | Destination |
|---|---|
| `docs/planning/process-model-elicitation/research/elicitation-strategy-literature.md` | `docs/research/elicitation/elicitation-strategy-literature.md` |
| `docs/planning/process-model-elicitation/research/re-interviewing-literature-worker-report.md` | `docs/research/elicitation/interviewing-literature-source-catalog.md` |
| `docs/planning/process-model-elicitation/research/petrinaut-survey.md` | `docs/research/petrinaut-survey.md` |
| `docs/planning/process-model-elicitation/research/voice-feasibility.md` | `docs/research/voice-feasibility.md` |
| `docs/planning/process-model-elicitation/notes/research-patterns-audit.md` | `docs/research/elicitation/research-patterns-audit.md` |
| `docs/planning/process-model-elicitation/notes/expert-meeting-findings-2026-08-11.md` | `docs/records/meetings/expert-meeting-findings-2026-08-11.md` |

### Evidence

| Current path | Destination |
|---|---|
| `docs/planning/process-model-elicitation/baseline/**` | `docs/evidence/experiments/baseline-control/**` |
| `docs/planning/process-model-elicitation/ir-worked-examples.md` | `docs/evidence/design-validation/ir-worked-examples.md` |
| `docs/planning/process-model-elicitation/spikes/fe-1434-suspension-verdict-2026-08-19.md` | `docs/evidence/spikes/fe-1434-suspension-verdict-2026-08-19.md` |
| `docs/planning/process-model-elicitation/spikes/fe-1434-suspension-evidence-2026-08-19.json` | `docs/evidence/spikes/fe-1434-suspension-evidence-2026-08-19.json` |
| `docs/planning/process-model-elicitation/adapter-panel-spike-2026-08-19.md` | `docs/evidence/spikes/fe-1435-adapter-panel-2026-08-19.md` |
| `docs/planning/process-model-elicitation/transport-aisdk-implementation-2026-08-19.md` | `docs/evidence/implementations/fe-1436-transport-aisdk-2026-08-19.md` |
| `docs/planning/process-model-elicitation/ask-return-implementation-2026-08-19.md` | `docs/evidence/implementations/fe-1449-ask-return-2026-08-19.md` |
| `docs/planning/process-model-elicitation/notes/deep-read-fe-1389.md` | `docs/evidence/audits/deep-read-fe-1389.md` |
| `docs/planning/process-model-elicitation/notes/deep-read-fe-1390.md` | `docs/evidence/audits/deep-read-fe-1390.md` |
| `docs/planning/legibility-sweep/flue-patterns-audit-2026-08-17.md` | `docs/evidence/audits/flue-patterns-audit-2026-08-17.md` |
| `docs/planning/legibility-sweep/flue-entry-projection-source-read-2026-08-18.md` | `docs/evidence/audits/flue-entry-projection-source-read-2026-08-18.md` |

### Archive

| Current path | Destination | Rationale |
|---|---|---|
| `docs/history/planning/elicitation-kernel/**` | `docs/archive/elicitation-kernel/**` | Closed map, resolved tickets and assembly records |
| `docs/planning/_shared/hash-monorepo-import-plan.md` | `docs/archive/migrations/hash-monorepo-import-plan.md` | FE-1437 executed; document itself says to settle afterward |
| `docs/planning/legibility-sweep/issue-pr-migration-2026-08-20/**` | `docs/archive/migrations/issue-pr-legibility-2026-08-20/**` | Completed migration, but rollback/hash evidence must remain intact |
| `docs/planning/legibility-sweep/refactor-queue-2026-08-14.md` | `docs/archive/engineering/legibility/refactor-queue-2026-08-14.md` | Executed queue |
| `docs/planning/legibility-sweep/remediation-plan-2026-08-17.md` | `docs/archive/engineering/legibility/remediation-plan-2026-08-17.md` | Historical ledger |
| `docs/planning/legibility-sweep/review-remediation-2026-08-18.md` | `docs/archive/engineering/legibility/review-remediation-2026-08-18.md` | Settled execution record |
| `docs/planning/process-model-elicitation/recommendation-demo-vehicle.md` | `docs/archive/decisions/superseded/recommendation-demo-vehicle.md` | Explicitly superseded by ADR-0004 |
| `docs/planning/process-model-elicitation/notes/open-questions-elicitation-design-2026-08-11.md` | `docs/archive/external-snapshots/open-questions-elicitation-design-2026-08-11.md` | Local copy superseded by Notion |
| `docs/planning/process-model-elicitation/notes/expert-meeting-prep-2026-08-11.md` | `docs/archive/meetings/expert-meeting-prep-2026-08-11.md` | One-off completed preparation |
| `docs/planning/process-model-elicitation/notes/grilling-inputs-2026-08-12.md` | `docs/archive/planning-inputs/grilling-inputs-2026-08-12.md` | Dated carryover record |
| `docs/planning/process-model-elicitation/notes/penciled-directions-2026-08-14.md` | `docs/archive/planning-inputs/penciled-directions-2026-08-14.md` | Dated pre-ticket list |

### Delete

- `docs/inbox/.gitkeep` only. The inbox is no longer empty.
- No substantive document is presently safe to delete.

## 4. Links and guidance requiring repair

Mandatory direct repairs:

- `README.md` links to `docs/spec.md` and `docs/INDEX.md`.
- `docs/INDEX.md`: every moved path, role heading, status, digest, and the obsolete “Path migration note”.
- `docs/agents/documentation.md`: entire zone model, ingest settlement destinations, control-vs-record language, effort-close policy.
- `docs/agents/arc-close.md`: references to `docs/planning/<effort>`, `_shared`, `SPEC-LEDGER`, and `COORDINATION`.
- `docs/agents/issue-tracker.md`: repository artifact locations, `_shared/COORDINATION`, and historical planning paths.
- `docs/agents/issue-writing.md`: long-form artifact location.
- `docs/agents/domain.md`: proposed role tree.
- `docs/agents/flue-routing.md`: links to cheatsheet and Flue audits.
- `docs/adr/0001`–`0004`: links to specification, topology, IR, integration spec, and superseded recommendation.
- `docs/strategy/COORDINATION.md` and `STEERING.md`: mutual links and import-plan reference.
- All relative links inside the moved elicitation-kernel archive, baseline experiment, research set, migration package, and implementation/spike records.
- `docs/architecture/topology.md`: hard-coded `docs/planning/**/baseline/run.ts`.
- Migration package `README.md`: validator command paths.
- Tests enforcing topology/index coverage, notably `packages/core/test/architecture/docs-index.test.ts`.

Historical prose containing obsolete but evidentiary paths should generally remain verbatim and receive a migration note rather than silent rewriting:

- `docs/reference/amp-analysis-flue-vs-tilde.md`
- archived Linear/GitHub migration snapshots
- completed elicitation-kernel tickets
- old `brunch-lite` repository references

External Linear descriptions also contain many literal `docs/planning/...` paths. The documentation protocol says those references must be updated before deletion of the old paths.

## 5. Unsafe deletions

Do not delete:

- Any `docs/reference/**` source: several are direct spec/research evidence; the PDF and transcript have irreplaceable provenance.
- `docs/inbox/SDCPNs/**`: added on 2026-08-24 and explicitly awaiting corpus settlement.
- Elicitation-kernel history: mirrored from FE-1366–1379 and linked by the specification/research.
- Migration package: canonical hashes, source snapshots, proposals, validator, apply log, and rollback evidence.
- Superseded recommendation: ADR-0004 explicitly cites it.
- Open-questions snapshot: Notion is canonical, but local research links to it and external availability is not guaranteed.
- Flue audits/cheatsheet: current agent guidance consumes them and they pin dependency-version behavior.
- `SPEC-LEDGER.md`: still contains many partial/pending obligations.
- Any active process-model specification or evidence record without first checking current Linear state.

## 6. Compact target tree

```text
CONTEXT.md
docs/
├── INDEX.md
├── agents/
├── adr/
├── inbox/
├── strategy/
├── ledgers/
├── specifications/
├── architecture/
├── research/
├── reference/
├── evidence/
│   ├── audits/
│   ├── design-validation/
│   ├── experiments/
│   ├── implementations/
│   └── spikes/
├── records/
│   └── meetings/
└── archive/
    ├── decisions/superseded/
    ├── elicitation-kernel/
    ├── engineering/legibility/
    ├── external-snapshots/
    ├── meetings/
    ├── migrations/
    └── planning-inputs/
```

## Material ambiguity

Safe execution is blocked on one point: `docs/INDEX.md` still labels several August legibility and process-model records “active,” while their text or owning work appears completed. Linear is canonical for issue state, so archive decisions for FE-1419, FE-1383, FE-1401, FE-1434–1436, and FE-1449 should be confirmed against Linear immediately before moving. The role destinations themselves are unaffected.
```

**Tool Result:** `TU-034CgsbGWpOm9v5mhT8Q8F`

```
## Audit outcome

Read-only audit completed. No files were modified, staged, or committed. Existing uncommitted edits were preserved.

## 1. Current authority map and conflicts

| Authority | Current source | Finding |
|---|---|---|
| Strategic state | `docs/planning/_shared/STEERING.md` | Correctly declares objectives, bets, proof frontiers, cuts, beliefs, and replan conditions. No recurring protocol currently ensures it is revisited. |
| Issue graph / sequencing projection | Linear + `COORDINATION.md` | Linear correctly owns state, hierarchy, and blockers. `COORDINATION.md` appropriately owns soft edges and graph projection, but its prose still duplicates strategic sequencing from `STEERING.md`. |
| Behavior | `docs/spec.md`, effort specs, `SPEC-LEDGER.md` | Specs correctly own obligations. The ledger owns obligation status/evidence, not behavior itself. |
| Decisions | `docs/adr/*.md` | Clear and appropriately protected from silent steering overrides. |
| Evidence / oracles | Scattered through `docs/planning/**`, tests, spike records | No role-based home. “Research,” “notes,” implementation records, spike evidence, and verification artifacts are mixed with planning. |
| Stable explanation | `docs/reference/**`, `CONTEXT.md`, some `_shared` documents | `CONTEXT.md` correctly owns glossary. Some stable explanatory documents remain in `_shared` because placement is lifecycle-based rather than role-based. |
| Historical context | `docs/history/**`, completed records still under `docs/planning/**` | Split authority: documentation protocol says completed effort artifacts remain permanently in `planning`, while a historical tree also exists. |

### Principal duplication and contradictions

1. **Strategic recommendation is stated twice.**  
   `STEERING.md` §“Current choice” and `COORDINATION.md` §“Current sequencing recommendation” both describe what should happen next. Coordination should only translate the selected strategy into issue edges/frontier availability.

2. **Arc close omits strategic reconciliation.**  
   `docs/agents/arc-close.md` reassesses `COORDINATION.md` when sequencing changes, but never reassesses `STEERING.md` when evidence changes the objective, proof spine, authority boundary, cut line, belief, or replan condition.

3. **Documentation placement is lifecycle-based, not authority-based.**  
   `documentation.md` puts nearly all working artifacts under `docs/planning/<effort>/`. This conflicts with the requested split between specifications, evidence, reference, and archive.

4. **Completed-material policy is inconsistent.**  
   `documentation.md` says completed effort artifacts stay under `docs/planning/<effort>/`; `docs/history/planning/**` already exists. `INDEX.md` consequently mixes active state and historical records.

5. **The import plan is no longer a live control surface.**  
   `hash-monorepo-import-plan.md` says it remains active until FE-1437 lands, while `COORDINATION.md` says the authority threshold was crossed on 2026-08-21. It should become archived evidence/history after its concurrent correction lands.

6. **AGENTS.md exposes protocols as an undifferentiated list.**  
   “Read the corresponding protocol” plus a complete filename inventory provides reachability but weak routing. It does not say when to run strategic steering.

7. **Skill/protocol indirection is circular but workable.**  
   AGENTS says run `arc-close`; the skill says read the protocol; the protocol says load the skill. The procedure still has one source, but the protocol should not instruct loading its own wrapper.

8. **Skill copies are duplicated.**  
   `.agents/skills/arc-close/SKILL.md` and `.claude/skills/arc-close/SKILL.md` are parallel copies. Unless both discovery locations are mandatory, one should be generated/symlinked or explicitly treated as a compatibility mirror.

9. **Stale external skill names appear in guidance.**  
   `issue-tracker.md` refers to `tool-linear-cli` and `ds-wayfind`, neither present locally. Either point to available canonical tooling/skills or make the protocol self-contained.

## 2. Files and sections that must change

### Required control/protocol changes

- **`AGENTS.md`**
  - Replace the flat protocol list with role/trigger routing.
  - Add the steering trigger.
  - Point to the new role-based documentation topology.
  - Retain explicit arc-close and Flue design triggers.

- **`docs/agents/documentation.md`**
  - Replace **“Zones”**, **“Control surface vs record”**, **“Ingest protocol”**, and **“Effort completion”**.
  - Define the desired authorities:
    - `STEERING`: current strategic state
    - `COORDINATION`: issue graph projection
    - specs: behavior
    - ADRs: decisions
    - evidence: observed proof and oracles
    - reference: stable explanation
    - archive: historical context
  - State promotion rules and link-not-copy rules.

- **`docs/agents/arc-close.md`**
  - Add a conditional steering reconciliation step.
  - Narrow coordination reconciliation to issue projection.
  - Clarify that evidence changes update evidence records first, then affected spec/ADR/steering authorities.
  - Remove “load the skill” from the canonical protocol to eliminate the circular instruction.

- **`docs/agents/issue-tracker.md`**
  - Remove strategic sequencing from map/coordination semantics.
  - Define `COORDINATION.md` solely as graph projection and exceptional-root authority.
  - Repair stale skill/tool references.

- **`docs/agents/legibility.md`**
  - Update **“Consolidation”** so each finding deposits into exactly one authority: specification, ADR, evidence, reference, steering, coordination, or archive.
  - Preserve the concurrent “point finding” addition.

- **`docs/INDEX.md`**
  - Reorganize sections by role rather than by `planning/<effort>` location.
  - Update every moved path/status.
  - Keep archive summaries compact rather than indexing historical files as live planning.

### Required control-document changes

- **`docs/planning/_shared/STEERING.md`**
  - Preserve its substantive current model.
  - Add only the recurring steering-pass contract: inputs, triggers, outputs, and reconciliation order.
  - Remove issue-graph detail that belongs solely in coordination.
  - Do not disturb the current formatting-only uncommitted edits.

- **`docs/planning/_shared/COORDINATION.md`**
  - Remove duplicated strategic rationale and cuts.
  - Retain issue nodes, hard/soft edges, exceptional roots, unresolved graph seams, and links back to the selected steering frontier.

- **`docs/planning/_shared/SPEC-LEDGER.md`**
  - Move under the specifications role or clearly identify it as a temporary evidence/status companion to the canonical spec.
  - Archive when its declared milestone closes.

- **`docs/planning/_shared/topology.md`**
  - Classify either as:
    - stable architecture explanation → reference; or
    - enforceable architecture decision → ADR/spec.
  - Its current “verification and specification” combination spans two authorities and should be split or assigned decisively.

- **`docs/planning/_shared/flue-architecture-cheatsheet.md`**
  - Move to reference; it is stable explanatory consolidation, not planning state.

- **`docs/planning/_shared/hash-monorepo-import-plan.md`**
  - After concurrent edits settle, archive it as completed migration history/evidence.
  - Update `INDEX.md` and links from `COORDINATION.md`.
  - Do not rewrite its unrelated Graphite correction.

### Mechanical test changes

- **`packages/core/test/architecture/docs-index.test.ts`**
  - Replace the current `planning/`-only placement assertion with role-directory assertions.
  - Continue enforcing:
    - every governed document is indexed,
    - every index target resolves,
    - relative links resolve,
    - every protocol is reachable from `AGENTS.md`.
  - Add checks for exactly one live `STEERING` and `COORDINATION` authority.
  - Optionally enforce prohibited role mixing only where mechanically decidable.

## 3. Local skill recommendation

**Use a protocol first; do not add a steering skill yet.**

`STEERING.md` already explicitly says not to extract a generic skill until a second real planning cycle demonstrates recurrence. That is sound single-source-of-truth discipline.

Recommended arrangement:

- Canonical procedure: `docs/agents/steering.md`
- Current strategic state: `STEERING.md`
- Minimal AGENTS trigger routes agents to the protocol.
- Add a tiny wrapper skill only after repeated failures show that automatic discovery is needed.

A future skill should contain only metadata and “read and execute `docs/agents/steering.md`,” matching `arc-close`; it must not duplicate the loop.

## 4. Minimal trigger wording

For `AGENTS.md`:

> When new evidence may change the current objective, proof frontier, strategic bet, cut line, or replan condition, follow `docs/agents/steering.md` and reconcile `STEERING.md` before changing issue sequencing.

If a wrapper skill later proves necessary:

```yaml
description: Reassess Brunch strategy when evidence may change its objective, proof frontier, strategic bet, cuts, or replan conditions.
```

## 5. Relevant verification

Focused documentation/guidance checks:

```bash
yarn workspace @hashintel/brunch-agent test:unit -- \
  test/architecture/docs-index.test.ts
```

Or through Turbo:

```bash
turbo run test:unit --filter '@hashintel/brunch-agent'
```

Issue graph projection:

```bash
turbo run linear:graph --filter '@hashintel/brunch-agent'
```

Formatting check scoped to changed documentation:

```bash
yarn oxfmt --check \
  libs/@hashintel/brunch-agent/AGENTS.md \
  libs/@hashintel/brunch-agent/docs \
  libs/@hashintel/brunch-agent/.agents/skills
```

Relevant package stack if the architecture test changes:

```bash
turbo run lint:eslint lint:tsc test:unit build \
  --filter '@hashintel/brunch-agent'
```

Also run `git diff --check` on the affected paths. There is currently no dedicated skill-schema test; adding one is only justified if more local skills appear.

## 6. Archive/delete candidates

### Archive

- `docs/planning/_shared/hash-monorepo-import-plan.md` — completed migration record.
- `docs/planning/_shared/SPEC-LEDGER.md` — when milestone one closes.
- Completed implementation/spike/remediation records currently marked `active`.
- `recommendation-demo-vehicle.md` and other superseded effort records, preserving links and provenance.
- Completed legibility-sweep material as one archived effort set.

### Move, not archive

- `flue-architecture-cheatsheet.md` → reference.
- Stable research syntheses still used as explanation → reference.
- Machine-readable proof, spike transcripts, and oracle reports → evidence.
- Behavior-defining `*-spec.md` documents → specs.

### Delete only after reference repair

- Redundant `.agents`/`.claude` skill mirror if both discovery paths are not required.
- Superseded notes that add no evidence beyond their canonical successor.
- Obsolete external-skill references in prose rather than creating compatibility stubs.

No immediate deletion should occur before `INDEX.md`, Linear links, and document consumers are checked.
```

**Tool Result:** `TU-034CgsbI5PKchEicDYQFFD`

```
# Read-only audit

No files were modified, staged, or committed. The `STEERING.md` worktree diff is formatting-only; its substantive steering model is already present.

## 1. Smallest complete recurring protocol

### Orient

1. Read the current objective and constraints from `STEERING.md`.
2. Refresh mechanical facts from Linear, `COORDINATION.md`, relevant specs/ADRs, and production code.
3. Classify each material statement:
   - **fact** — directly evidenced;
   - **belief** — confidence plus supporting evidence;
   - **unknown** — named question and cheapest resolving probe;
   - **external gate** — owner, expected decision, watch method, and consequence.
4. Detect changed pressure: objective, deadline, authority boundary, failed proof, completed frontier, or external decision.

### Choose

5. Rank candidate frontiers by:
   - contribution to the current objective;
   - risk retired;
   - information gained;
   - dependency/authority pressure;
   - cost and reversibility.
   
   “Open and unblocked” supplies candidates; it does not choose the next move.
6. Select one frontier or a deliberately joined pair.
7. State:
   - the claim being tested;
   - the **proof bundle**;
   - the **cut line**;
   - supporting issues/gaps;
   - stop and replan conditions.

### Execute

8. Build through the production entrypoint and real wiring. Fixtures may seed state but must not supply wiring or truth that production is supposed to produce.
9. Follow the evidence lifecycle:

```text
source corpus
  -> reviewed representative fixture
  -> runnable production-path proof
  -> immutable dated run snapshot
  -> validated invariant
  -> executable regression oracle
```

10. Produce:
    - a rerunnable proof;
    - an immutable legibility snapshot in another register;
    - preferably a recorded human witness for UX, interpretation, or live-runtime claims.

### Reconcile

11. Compare the result with the original claim. Update confidence only from evidence.
12. Deposit each result in its authoritative home:
    - architecture/invariants → ADR or specification;
    - current strategic judgment → `STEERING.md`;
    - sequencing/soft edges/external gates → `COORDINATION.md`;
    - issue state/hierarchy/hard blockers → Linear, **only after approval**;
    - milestone obligations → `SPEC-LEDGER.md`;
    - dated evidence/run snapshots → owning effort directory;
    - reusable categorical guarantees → executable tests/gates.
13. Settle capture channels and stale documents under `documentation.md`: repair, mark superseded/settled, or delete only with indexed disposition and repaired references.

### Replan

14. Re-run orientation when:
    - objective, deadline, or pressure changes;
    - proof fails or exposes an authority conflict;
    - a frontier completes;
    - an external decision lands;
    - an arc closes.
15. Otherwise continue the selected frontier; do not rewrite steering for ordinary ticket movement.

---

## 2. Gaps, overlap, and contradictions

### Already strong

- `STEERING.md` already owns objective, evidence, strategic bet, frontiers, cut line, beliefs, confidence, and replan conditions.
- It explicitly rejects “unblocked means next,” test-injected wiring, fixture-shaped false proof, and hidden projection inference.
- `COORDINATION.md` correctly separates strategic judgment from Linear’s hard facts.
- `legibility.md` already requires alternate-register rendering, strain findings, consolidation, and promotion of recurrent findings into executable gates.
- `arc-close.md` already reconciles inbox/index, Linear registry, spec ledger, coordination, and stale planning tense.
- `documentation.md` provides authoritative document placement and disposition rules.
- Existing integration docs demonstrate the intended fixture/snapshot/oracle progression: panel transcript → golden fixture → contract test.

### Missing or incomplete

1. **No canonical recurring steering protocol.**  
   The loop is described in `STEERING.md`, but its operating rules are scattered across steering, legibility, documentation, issue tracking, and arc close.

2. **No standard proof-bundle contract.**  
   Frontiers have prose proofs, but there is no required bundle covering production entrypoint, rerun command, expected observation, immutable snapshot, witness status, and oracle-promotion decision.

3. **No explicit corpus lifecycle.**  
   `docs/INDEX.md` now identifies an inbox SDCPN corpus, while `STEERING.md` asks to freeze a fixture. Nothing defines selection, conformance review, fixture provenance, snapshot retention, or oracle promotion.

4. **Cold-start contingency is cut, not preserved as a lane.**  
   `STEERING.md` properly excludes full cold-start implementation, but Dora’s external decision can reverse the scenario. A bounded contingency lane is needed: preserve a benchmark and representative cold-start fixture without making it a delivery prerequisite.

5. **Human witness is precedent, not policy.**  
   Historical HITL evidence was highly productive, but current legibility guidance does not say which claims require witness, how acceptance is recorded, or that automated proof and human witness are complementary.

6. **External-gate watching is under-specified.**  
   Dora’s decision and branch-on-main gates are visible, but gates lack watcher, cadence/event source, stale threshold, and consequence. Agents could either ignore them or repeatedly poll without purpose.

7. **Approval-before-external-write is not general.**  
   Current guidance allows issue repair and creation in several places. The proposed rule requires an explicit general gate before issue creation, parent changes, comments, state changes, or project updates.

8. **Confidence vocabulary lacks transition rules.**  
   `STEERING.md` records confidence well, but there is no rule requiring a cited evidence delta for every confidence change.

### Direct contradiction

`issue-tracker.md` defines the wayfinder frontier as:

> open, unblocked, unassigned sub-issues — lowest issue number first

`STEERING.md` defines strategic frontier selection by objective, learning dependency, and risk rather than ticket availability. These are different meanings of **frontier**.

**Resolution:** rename the tracker concept to **claimable queue** or **mechanical frontier**. Reserve **proof frontier** for steering. Mechanical availability filters candidates; steering selects work.

### Lifecycle tension

`documentation.md` says effort artifacts are permanent and generally stay in place; “archive stale docs” could imply moving or deleting them.

**Resolution:** define archive operationally as disposition, not blanket relocation:

- stale active control surface → repair or supersede;
- completed effort artifact → mark settled;
- replaced canon → mark superseded and link successor;
- deletion only after indexed disposition and reference repair;
- move to `docs/history/` only for a whole intentionally frozen historical effort.

### Posture inconsistency

The operative posture exists at `docs/agents/posture.md`, while the broader posture protocol expects `memory/POSTURE.md`. Within Brunch, `AGENTS.md` explicitly points to the former, so behavior is recoverable, but tooling may not discover it consistently.

---

## 3. Invocation triggers and completion criteria

### Steering pass triggers

Invoke the recurring protocol when:

- starting or resuming an arc without a current proof target;
- the objective, deadline, business use case, or strategic pressure changes;
- a frontier proof succeeds or fails;
- implementation exposes a spec/ADR authority conflict;
- an external gate changes;
- the selected frontier becomes impossible or materially less valuable;
- arc close finds coordination or confidence drift.

Do **not** invoke it merely because an issue changed state.

### Execution-pass completion

A frontier is complete only when:

1. its named claim has a pass/fail result;
2. the proof runs through production wiring;
3. fixture provenance is recorded;
4. unrelated fixture regions remain stable where required;
5. rerun instructions and expected observations exist;
6. an immutable run snapshot exists;
7. human witness is recorded or explicitly classified unnecessary;
8. reusable guarantees have been promoted to regression oracles;
9. failures and residual unknowns have owners;
10. confidence changes cite the new evidence.

### Reconciliation completion

Reconciliation is complete when every changed truth has exactly one authoritative home, affected mirrors point to it, stale active prose is dispositioned, and no chat-only decision remains.

### External-gate completion

A gate record is complete when it names:

- question;
- external owner;
- authoritative source;
- watcher;
- watch trigger or cadence;
- current state and last checked date;
- consequences of each likely outcome.

No external tracker mutation occurs without explicit approval.

### Arc-close completion

Keep the existing six criteria, adding only confirmation that:

- the steering loop was reconciled if a trigger fired;
- immutable proof and witness records are indexed;
- validated categorical claims were considered for oracle promotion;
- no watched external gate is stale or ownerless.

---

## 4. Correct ownership split

### `STEERING.md` template

Own current, project-specific judgment only:

- objective and pressure;
- known facts;
- beliefs with confidence/evidence;
- unknowns;
- external gates and consequences;
- proof spine;
- current proof frontiers;
- selected frontier;
- proof bundle;
- cut line;
- strategic issue/gap projection;
- replan conditions;
- cold-start contingency lane.

It should not contain generic operating instructions, archival mechanics, Linear write procedures, or arc-close checklists.

### Agent protocol / skill

Own the reusable `orient → choose → execute → reconcile → replan` procedure:

- classification rules;
- frontier-selection criteria;
- proof-bundle schema;
- production-wiring rule;
- corpus/fixture/snapshot/oracle lifecycle;
- witness requirement;
- confidence-update discipline;
- authoritative-home routing;
- approval gate for external writes;
- external-gate watching mechanics.

The skill should execute the protocol; the documentation page should remain canonical.

### `arc-close.md`

Own the final control pass only:

- verify the recurring loop’s outputs were deposited;
- reconcile inbox/index, issue registry, ledger, coordination, and planning tense;
- ensure proof/witness snapshots are indexed;
- confirm oracle promotion was handled;
- report conditional passes.

Arc close should not choose the next frontier or reproduce the steering procedure.

---

## 5. Concrete edits and moves recommended

1. **Add `docs/agents/steering.md`.**  
   Make it the canonical minimal protocol above. Link it from `AGENTS.md` and `docs/INDEX.md`.

2. **Add a compact reusable template section to `STEERING.md`, not a second document.**  
   Suggested headings:
   - Objective and pressure
   - Facts / beliefs / unknowns / external gates
   - Proof spine
   - Current frontiers
   - Current choice
   - Proof bundle and cut line
   - Contingency lane
   - Replan conditions

   Preserve the current substantive September content beneath that shape.

3. **Move generic loop prose out of `STEERING.md`.**  
   Replace its introductory procedural paragraph with a link to `docs/agents/steering.md`. Keep only “this document carries current judgment.”

4. **Amend `issue-tracker.md`.**
   - Rename its “Frontier” to “Mechanical frontier” or “Claimable queue.”
   - State that steering chooses among mechanically available work.
   - Add explicit approval before all external writes.

5. **Amend `legibility.md`.**
   - Define immutable legibility snapshot.
   - Require a human witness for UX, interpretation, live-runtime, and demo-comprehension claims unless explicitly inapplicable.
   - Require witness identity/date/scenario/verdict, not a transcript dump.
   - Link recurrent-class findings to oracle promotion in the steering protocol.

6. **Amend `documentation.md`.**
   - Define the corpus → fixture → dated run snapshot → oracle lifecycle and homes:
     - corpus: inbox/reference;
     - representative fixture: owning effort or test fixtures, with provenance;
     - run snapshot: dated immutable effort record;
     - oracle: executable test/gate;
     - superseded evidence: retained and dispositioned.
   - Clarify that “archive” means explicit disposition, not automatic movement.

7. **Amend `arc-close.md` minimally.**
   Add one conditional steering reconciliation check and proof/witness/oracle deposit checks. Do not copy the full loop.

8. **Add a cold-start contingency block to current `STEERING.md`.**
   - one benchmark scenario;
   - one representative corpus-derived fixture;
   - expected minimum outcome;
   - activation condition: Dora confirms creation-from-blank;
   - explicit statement that it does not gate review-and-revise until activated.

9. **Turn the SDCPN inbox corpus into a governed fixture source.**
   - inspect and settle the seven files;
   - record selection criteria;
   - choose one representative fixture;
   - preserve source hashes/provenance;
   - generate run snapshots rather than editing the baseline;
   - promote stable semantic expectations into fold/projection/provenance tests.

10. **Resolve posture discoverability.**  
    Either move the declaration to `memory/POSTURE.md` and point Brunch guidance there, or explicitly document `docs/agents/posture.md` as the context-local exception. Avoid two posture authorities.

The main design is sound. The missing piece is not more planning content; it is one canonical operating protocol joining the already-good steering, proof, legibility, documentation, tracker, and close-out practices without duplicating their meaning.
```

## Assistant

The audits converge on the operating loop and authority split. Two corrections are important before editing:

1. I’m keeping the previously agreed names (`control`, `specs`, `evidence`, `reference`, `archive`) rather than introducing new top-level synonyms like `strategy`, `specifications`, or `records`.
2. Executable evaluation material should leave `docs/`; `docs/evidence` will hold human-readable snapshots, while `evaluations/{cases,protocols,oracles}` holds runnable assets.

I’m checking two execution hazards before the move pass: which planned paths are entangled with concurrent edits, and how the existing baseline divides between executable assets and evidence.

**Tool Use:** `Task`

```json
{
  "prompt": "READ-ONLY. In /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent, determine which role-topology moves can be executed without modifying or breaking files that currently have foreign uncommitted edits: docs/agents/git-workflow.md, issue-writing.md, legibility.md, docs/planning/_shared/STEERING.md, docs/planning/_shared/hash-monorepo-import-plan.md. Target roles are docs/control, docs/specs, docs/evidence/{proofs,evaluations}, docs/reference, docs/archive, with docs/inbox retained. Inspect the actual worktree diffs and every inbound link from those five files to planned move targets. Return: (1) files that must remain at current paths this pass, (2) move targets whose move must be deferred because one of those foreign-edited files would acquire a broken link, (3) safe moves plus exact link-repair files, (4) whether git mv of a foreign-edited file would alter/claim another actor's work (answer conservatively), (5) external Linear/plain-path references that materially block moves under the current documentation protocol. Do not modify anything.",
  "description": "Partition safe document moves"
}
```

**Tool Use:** `Task`

```json
{
  "prompt": "READ-ONLY. In /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent, inspect docs/planning/process-model-elicitation/baseline/** and all internal consumers/config. The agreed topology is executable materials outside docs under evaluations/{cases,protocols,oracles}; docs/evidence/evaluations holds immutable human-readable run snapshots/reports. Classify every baseline file as reusable case/corpus truth, protocol/runner, oracle/expected claim, or immutable evidence snapshot. Propose exact destination paths with minimal renames and all required import/script/link/config changes. Also state whether adding top-level evaluations/ creates a new architectural unit requiring local guidance or declaration. Do not modify anything.",
  "description": "Classify evaluation assets"
}
```

## User

**Tool Result:** `TU-034Cgx5BP31MDifaYdjU7a`

```
Read-only inspection completed; no files changed.

## 1. Must remain at current paths this pass

These contain foreign uncommitted edits and must not be moved or edited:

- `docs/agents/git-workflow.md`
- `docs/agents/issue-writing.md`
- `docs/agents/legibility.md`
- `docs/planning/_shared/STEERING.md`
- `docs/planning/_shared/hash-monorepo-import-plan.md`

Conservatively, `git mv` would claim another actor’s edited content by staging its deletion/addition under new paths. Do not move them until that work is committed or explicitly handed over.

## 2. Moves deferred by inbound links from those files

| Planned target | Why deferred |
|---|---|
| `docs/agents/issue-tracker.md` → `docs/control/...` | Referenced twice by foreign-edited `issue-writing.md`. |
| `docs/agents/documentation.md` → `docs/control/...` | Referenced by foreign-edited `legibility.md`. |
| `docs/planning/_shared/COORDINATION.md` → `docs/control/...` | Markdown-linked by both foreign-edited `STEERING.md` and `hash-monorepo-import-plan.md`. |
| `docs/planning/_shared/SPEC-LEDGER.md` → `docs/control/...` | Plain-path reference in foreign-edited import plan. |
| `docs/adr/0004-in-petrinaut-staging-and-the-monorepo-import.md` → `docs/specs/...` | Markdown-linked by foreign-edited import plan. |
| `docs/spec.md` → `docs/specs/...` | Explicit disposition-path reference in foreign-edited import plan. |

Also defer moving `issue-writing.md` or `legibility.md` indirectly through a wholesale `docs/agents/` move: `git-workflow.md` links both by relative filename.

## 3. Moves safe relative to the five foreign-edited files

Subject to repairing ordinary repository links and external tracker paths:

- Other agent protocols can move to `docs/control/`:
  - `arc-close.md`, `domain.md`, `flue-routing.md`, `posture.md`, `triage-labels.md`
  - `git-workflow.md`, `issue-writing.md`, and `legibility.md` excluded this pass.
- Other shared controls can move:
  - `flue-architecture-cheatsheet.md`
  - `topology.md`
  - `STEERING.md` and import plan excluded; `COORDINATION.md` and `SPEC-LEDGER.md` deferred as above.
- ADRs 0001–0003 can move to `docs/specs/`; ADR-0004 cannot.
- `docs/history/**` can move to `docs/archive/**`.
- Evidence/research records may move into `docs/evidence/proofs` or `docs/evidence/evaluations`; none is directly linked from the five edited files.
- `docs/reference/**` already occupies its target role.
- `docs/inbox/**` can remain retained as requested.

Exact link-repair surfaces for any safe move are discoverable repository-wide with `rg`, but always include:

- `docs/INDEX.md`
- Markdown files returned by searching the old exact path
- `AGENTS.md` for moved agent protocols
- `.agents/skills/arc-close/SKILL.md` and its Claude mirror if `arc-close.md` moves
- `packages/core/test/architecture/docs-index.test.ts` if its zone assumptions change

## 4. Foreign-edited `git mv`

**Yes, conservatively it alters/claims another actor’s work.** Although Git can preserve bytes, the move stages the old-path deletion and new-path addition containing their uncommitted edits. That changes ownership and complicates their eventual commit/rebase.

## 5. External references that materially block moves

The documentation protocol says a repo path referenced from Linear must not be removed without updating Linear. The preserved Linear snapshots show current or historically load-bearing plain paths to:

- Agent protocols: `issue-tracker.md`, `issue-writing.md`, `arc-close.md`, `documentation.md`, `flue-routing.md`, `triage-labels.md`
- Shared controls: `topology.md` and the former `CONVERGENCE.md`
- ADRs 0003 and 0004
- Numerous process-model specs, research, baseline, deep-read, remediation, and evaluation records
- Reference documents

Therefore these moves are not fully executable merely by repairing repository Markdown. The corresponding live Linear descriptions must be fetched and updated atomically with each move. Historical comments may remain unchanged under precedent, but live issue descriptions and canonical plain-path pointers materially block deletion of the old paths. The checked-in migration snapshots are evidence, not proof of current Linear state; live tracker verification is required before execution.
```

**Tool Result:** `TU-034Cgx5BtKahaaHixL8wgl`

```
## File classification and destinations

### Reusable case/corpus truth

- `opening-message.md` → `evaluations/cases/process-model-elicitation/baseline/opening-message.md`
- `situation-pack.md` → `evaluations/cases/process-model-elicitation/baseline/situation-pack.md`

### Protocol/runner

- `protocol.md` → `evaluations/protocols/process-model-elicitation/baseline/protocol.md`
- `v0-prompt.md` → `evaluations/protocols/process-model-elicitation/baseline/v0-prompt.md`
- `run.ts` → `evaluations/protocols/process-model-elicitation/baseline/run.ts`

### Oracle/expected claim

None. The situation pack contains hidden case facts, but it is interviewee-side corpus truth—not the separate modeller-side answer key defined by `CONTEXT.md`. The readout is post-run evidence, not a reusable oracle. Leave `evaluations/oracles/` empty until an answer key or machine-readable expectations are authored.

### Immutable evidence snapshots

Move unchanged beneath `docs/evidence/evaluations/process-model-elicitation/baseline/`:

- `readout.md`
- `transcripts/condition-1.md`
- `transcripts/condition-1.raw.json`
- `transcripts/condition-1-model.txt`
- `transcripts/condition-2.md`
- `transcripts/condition-2.raw.json`
- `transcripts/condition-2-model.txt`

## Required consumer/config changes

- `packages/core/package.json`
  - Change `baseline:run` to:
    `node --experimental-strip-types ../../evaluations/protocols/process-model-elicitation/baseline/run.ts`
- `packages/core/test/architecture/baseline-runner.test.ts`
  - Replace the old `BASELINE_DIR`.
  - Copy protocol and case inputs separately into the isolated fixture.
  - Read generated checkpoints from the fixture evidence/output directory.
- `run.ts`
  - Resolve `v0-prompt.md` beside the runner.
  - Resolve case inputs from `../../../cases/process-model-elicitation/baseline/`.
  - Resolve production outputs under `../../../../docs/evidence/evaluations/process-model-elicitation/baseline/transcripts/`.
  - Prefer an explicit test-only output-directory environment variable so tests never mutate committed evidence.
  - Update usage/output comments and generated metadata paths.
- `protocol.md`
  - Relink `opening-message.md` and `situation-pack.md` to `../../../cases/process-model-elicitation/baseline/`.
  - Relink `readout.md` and transcript location to `../../../../docs/evidence/evaluations/process-model-elicitation/baseline/`.
  - Its research link becomes `../../../../docs/planning/process-model-elicitation/research/re-interviewing-literature-worker-report.md`.
- `readout.md`
  - Local `transcripts/` links remain valid after moving the whole evidence bundle together.
  - Relink `protocol.md` to the new `evaluations/protocols/...` path.
- `docs/INDEX.md`
  - Replace the old `baseline/` planning row with an evidence-bundle row targeting `evidence/evaluations/process-model-elicitation/baseline/`.
  - Executable `evaluations/**` materials should not masquerade as indexed documents.
- `docs/planning/_shared/topology.md`
  - Replace `docs/planning/**/baseline/run.ts` with `evaluations/protocols/**/run.ts`.
- `packages/core/test/architecture/docs-index.test.ts`
  - No semantic change appears necessary; verify that `docs/evidence/**` is accepted and covered by the new index row.
- Type-check/pruned-workspace configuration
  - Ensure any existing inclusion/copy rule that formerly covered `docs/planning/**` scripts also includes `evaluations/**`; `workspace.ts` notes that context-root non-workspace paths require explicit prune copying.
- External pointers
  - Update the FE-1361 Linear/GitHub destination links if still live. Do **not** rewrite the committed migration JSON snapshots; they are historical evidence.

## Architectural-unit verdict

Yes. Top-level `evaluations/` introduces a distinct responsibility and trust topology: reusable cases, executable protocols, and private oracles, separated from immutable evidence.

No Petrinaut-style `@layerRoot` declaration applies here, and it is not a workspace package. It should receive local guidance—preferably `evaluations/AGENTS.md`—covering:

- case/protocol/oracle ownership;
- situation-pack versus answer-key information-wall rules;
- prohibition on generated run evidence under `evaluations/`;
- canonical evidence destination under `docs/evidence/evaluations/`;
- runner and verification conventions.

Read-only inspection only; no files changed or tests run.
```

## Assistant

There are two real blockers to the physical move pass:

- five source files have another actor’s uncommitted edits, so renaming or editing them would claim that work;
- many old paths are still canonical pointers in Linear, and moving them requires external issue edits that you have not explicitly authorized.

I won’t route around either with duplicate files or compatibility stubs. I can still lock the protocol now: declare the role topology, prohibit new effort-centric placement, add the steering loop, separate strategic selection from the issue “claimable queue,” and extend arc-close. That leaves the physical migration as a controlled next action once we settle the two gates.

**Tool Use:** `Task`

```json
{
  "prompt": "IMPLEMENT a bounded agent-guidance/control-protocol slice in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent. You are editing files. Respect shared-worktree discipline: do not modify, move, stage, or commit these foreign-edited files: docs/agents/git-workflow.md, docs/agents/issue-writing.md, docs/agents/legibility.md, docs/planning/_shared/STEERING.md, docs/planning/_shared/hash-monorepo-import-plan.md. Do not move any existing docs yet; external Linear pointers and foreign edits block that. Do not write to Linear. Read current contents before patching.\n\nOutcome: lock the recurring strategic steering protocol and the agreed role-based topology, without duplicating meaning.\n\nRequired edits:\n1. Add docs/agents/steering.md as the canonical compact protocol for `orient -> choose -> execute -> reconcile -> replan`.\n   - Triggers: starting/resuming without a current proof target; changed objective/deadline/use case/pressure; proof succeeds/fails; authority conflict; external gate change/staleness; selected frontier loses value; arc close detects drift. Ordinary ticket movement is not a trigger.\n   - Orient classifies fact, belief+confidence+evidence, unknown+cheapest probe, external gate+owner/source/watch trigger/last checked/consequences.\n   - Choose treats mechanical issue availability as a filter, then ranks by objective contribution, risk retired, information gain, deadline pressure, cost/reversibility. Select one proof frontier or deliberate pair and state claim, proof bundle, cut, issue/gap projection, stop/replan trigger.\n   - Execute through real production entrypoints/wiring; no fixture-supplied product wiring. Require runnable proof plus immutable legibility snapshot in another register; human witness required for UX, interpretation, live runtime, and demo-comprehension claims unless explicitly inapplicable.\n   - Define the lifecycle `corpus/case -> reviewed fixture -> production-path run -> immutable run snapshot -> validated claim -> executable oracle`, with information-wall note that hidden answer keys/oracles are not interviewee inputs.\n   - Reconcile each changed truth into exactly one authority: STEERING strategy, COORDINATION issue graph projection/soft edges, Linear state/hierarchy/hard blockers (external writes only after explicit approval), specs behavior, ADR decisions, evidence observed proof, reference stable explanation, archive historical context. Confidence changes cite evidence. Link, do not copy.\n   - Replan on triggers; otherwise continue. Include concise checkable completion criteria and proof-bundle fields. Link to documentation.md, legibility.md, issue-tracker.md, arc-close.md instead of repeating their mechanics.\n2. Update AGENTS.md with compact trigger-based protocol routing. Add steering trigger. Preserve arc-close, Flue, issue/domain/documentation guidance but route by condition rather than only an undifferentiated list. Keep always-loaded text short.\n3. Update docs/agents/documentation.md to make this role model authoritative:\n   - docs/control: compact mutable strategic/coordination/obligation control surfaces\n   - docs/specs: required behavior\n   - docs/adr: accepted decisions (already exists)\n   - docs/evidence/proofs: immutable observed proof/witness/implementation snapshots\n   - docs/evidence/evaluations: immutable evaluation runs/readouts\n   - docs/reference: stable explanatory/source material\n   - docs/archive: historical, superseded, or settled material with no current authority\n   - docs/inbox: transient intake\n   - executable evaluation assets outside docs under evaluations/{cases,protocols,oracles}\n   - docs/agents remains operating guidance; INDEX remains complete registry.\n   - Existing docs/planning and docs/history are legacy paths pending an atomic migration; add no new files there.\n   - Effort is metadata, not placement.\n   - Define case/corpus, fixture, run snapshot, oracle; promotion/disposition rules; immutable legibility snapshot and witness record; external pointer repair before moves; keep mutable controls compact and link history/evidence rather than accumulating prose.\n4. Update docs/agents/issue-tracker.md so its open/unblocked/unassigned list is called the `claimable queue` or `mechanical frontier`, not the strategic proof frontier. Linear owns issue facts; COORDINATION projects topology/soft edges; STEERING selects by objective/risk/info gain. Add explicit approval gate before issue creation, edits, comments, hierarchy/state/project mutations.\n5. Update docs/agents/arc-close.md minimally: conditional steering reconciliation when a trigger fired; proof/witness snapshot indexed; validated categorical claims considered for oracle promotion; external gates not stale/ownerless; coordination remains issue projection, not strategy. Avoid copying the loop.\n6. Update docs/agents/domain.md only if its current proposed tree or authority language conflicts with the role topology.\n7. Update docs/INDEX.md to register docs/agents/steering.md and revise only the topology/protocol wording needed now. Do not pretend physical moves already occurred.\n8. Update packages/core/test/architecture/docs-index.test.ts only if needed to enforce reachability of steering or allow the declared transitional state. Do not weaken existing coverage.\n9. Inspect CONTEXT.md. Add only already-resolved glossary terms if absent and genuinely domain-level; do not put implementation/process details there.\n\nDo NOT add a local steering skill yet: one canonical protocol plus AGENTS pointer is sufficient for this first cycle. Do NOT create evaluations/ yet because no executable assets move in this slice. Do not stage/commit. Run focused docs-index tests and git diff --check for files you changed. Return exact files changed, concise semantic summary, test results, and blockers left for the physical migration.",
  "description": "Lock steering guidance"
}
```

## User

**Tool Result:** `TU-034Ch0qrBl9tTNCfgS48XA`

```
Implemented the steering/control-protocol slice.

Changed:
- `AGENTS.md`
- `docs/INDEX.md`
- `docs/agents/arc-close.md`
- `docs/agents/documentation.md`
- `docs/agents/issue-tracker.md`
- `docs/agents/steering.md` — new canonical loop

Key outcomes:
- Established role-based documentation authority and evidence lifecycle.
- Distinguished strategic proof frontiers from Linear’s mechanical frontier.
- Added explicit approval gates for all Linear writes.
- Added trigger-based protocol routing and arc-close steering reconciliation.
- Left `CONTEXT.md`, domain guidance, tests, foreign-edited files, and Linear untouched.

Verification:
- Docs-index tests: **7 passed**
- Formatting check: passed
- `git diff --check`: passed

Migration blockers remain: external pointer repair, concurrent foreign edits, and an atomic move from legacy `docs/planning`/`docs/history`. No directories were moved or created; nothing staged or committed.
```

## Assistant

The protocol slice is written and its focused checks pass. I’m having a separate agent cold-review the resulting diff for authority duplication, accidental overreach, and whether the completion criteria are genuinely checkable before I commit it.

**Tool Use:** `Task`

```json
{
  "prompt": "READ-ONLY REVIEW of the current uncommitted diff in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent. Focus only on changes to AGENTS.md, docs/INDEX.md, docs/agents/arc-close.md, documentation.md, issue-tracker.md, and new steering.md. Do not modify anything. Preserve and ignore unrelated foreign diffs in git-workflow.md, issue-writing.md, legibility.md, STEERING.md, and hash-monorepo-import-plan.md. Review against these intents: one authoritative steering loop; compact trigger-based AGENTS routing; role topology docs/control, specs, adr, evidence/{proofs,evaluations}, reference, archive, inbox; legacy planning/history transitional and no new files; mechanical frontier vs proof frontier; explicit approval for external writes; corpus->fixture->run snapshot->oracle lifecycle; immutable legibility + conditional human witness; arc-close does not duplicate steering. Report only actionable findings with file/line references and suggested smallest fixes, then a pass/fail verdict. Also identify exactly which diff paths belong to this slice for staging.",
  "description": "Review steering guidance diff"
}
```

## User

**Tool Result:** `TU-034Ch5XPVoXEDFKaRqMUJF`

```
- **`docs/agents/arc-close.md:25`** — Exempting archive documents from indexing conflicts with `documentation.md:83` and the existing index test.  
  **Fix:** Replace “every non-archive Markdown document” with “every non-agent document.”

- **`docs/agents/arc-close.md:38-39`** — Requires Linear repairs/closure without explicitly applying the external-write approval gate.  
  **Fix:** Prefix these mutations with “With explicit approval,” or directly reference `issue-tracker.md`’s approval gate.

- **`docs/agents/arc-close.md:68-73`** — Duplicates steering’s proof/witness/oracle/gate reconciliation checklist despite saying not to copy the loop.  
  **Fix:** Remove the duplicated bullets and require running `steering.md` when triggered.

- **`docs/agents/steering.md:85`** — “Observed proof → `docs/evidence/`” is less precise than the authoritative topology’s separate `proofs/` and `evaluations/` authorities.  
  **Fix:** Split into observed proof/witness → `docs/evidence/proofs/`, and evaluation runs/readouts → `docs/evidence/evaluations/`.

**Verdict: FAIL** — four actionable authority/control inconsistencies.

**Exact slice paths for staging:**
- `libs/@hashintel/brunch-agent/AGENTS.md`
- `libs/@hashintel/brunch-agent/docs/INDEX.md`
- `libs/@hashintel/brunch-agent/docs/agents/arc-close.md`
- `libs/@hashintel/brunch-agent/docs/agents/documentation.md`
- `libs/@hashintel/brunch-agent/docs/agents/issue-tracker.md`
- `libs/@hashintel/brunch-agent/docs/agents/steering.md`
```

## Assistant

The review caught four small authority inconsistencies: archive indexing, the Linear approval gate at arc-close, a duplicated close checklist, and an imprecise evidence destination. I’m correcting those without widening the slice.

**Tool Use:** `Task`

```json
{
  "prompt": "EDIT the current steering-guidance slice in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent. Read files before patching. Do not touch foreign-edited files. Apply only these review fixes:\n1. docs/agents/arc-close.md around line 25: align indexing with docs/agents/documentation.md and existing tests; use 'every non-agent document' rather than exempting archive.\n2. arc-close Linear mutation steps: explicitly require approval by linking/referencing issue-tracker.md's external-write approval gate; do not duplicate its mechanics.\n3. arc-close final steering section: remove duplicated proof/witness/oracle/external-gate bullets; when a steering trigger fired, require running/reconciling docs/agents/steering.md and rely on its completion criteria. Keep only close-specific deposit/index checks that are not already part of steering, if any.\n4. docs/agents/steering.md authority routing: split observed proof/witness -> docs/evidence/proofs/ and evaluation runs/readouts -> docs/evidence/evaluations/.\nDo not stage or commit. Run the docs-index test and git diff --check for the slice. Return summary and results.",
  "description": "Fix steering guidance review"
}
```

## User

**Tool Result:** `TU-034Ch7Bmpkjc9C1sjzUs2A`

```
Applied requested review fixes:

- Updated indexing language to “every non-agent document.”
- Linked Linear mutations to `issue-tracker.md`’s approval gate.
- Simplified arc-close steering reconciliation to rely on `steering.md`.
- Split proof/witness and evaluation authority paths in `steering.md`.

Verification:
- Docs-index test: **7/7 passed**
- `git diff --check`: **passed**
- Nothing staged or committed.
```

## Assistant

**Tool Use:** `Task`

```json
{
  "prompt": "READ-ONLY re-review the current steering-guidance diff in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent after fixes. Scope: AGENTS.md, docs/INDEX.md, docs/agents/{arc-close,documentation,issue-tracker,steering}.md. Ignore all foreign diffs. Verify the four prior findings are resolved and check for any remaining contradiction, duplication, broken relative link, ambiguous completion criterion, or role-topology mismatch. Do not modify. Return pass/fail, concise findings, and exact slice paths.",
  "description": "Recheck steering guidance"
}
```

## User

**Tool Result:** `TU-034Ch8hfN4Kflot50yERja`

```
**FAIL**

Four prior findings appear resolved:

- External Linear writes require approval.
- Mechanical queue is distinct from strategic proof frontier.
- Legacy paths remain authoritative pending atomic migration.
- Agent protocols route through `AGENTS.md`, not `docs/INDEX.md`.

Remaining finding:

- **Ambiguous/impossible index completion criterion:** “every document outside `docs/agents/`” includes `docs/INDEX.md` itself—and potentially `AGENTS.md`/`CONTEXT.md`—yet they are not indexed. Narrow the scope explicitly, excluding the index itself.
  - `docs/agents/documentation.md:83`
  - `docs/agents/arc-close.md:24`
  - Completion impact: `docs/agents/arc-close.md:84`

All checked Markdown relative links resolve; no remaining role-topology contradiction or material duplication found.

Exact reviewed slice:

- `AGENTS.md`
- `docs/INDEX.md`
- `docs/agents/arc-close.md`
- `docs/agents/documentation.md`
- `docs/agents/issue-tracker.md`
- `docs/agents/steering.md`
```

## Assistant

**Tool Use:** `Task`

```json
{
  "prompt": "EDIT only docs/agents/documentation.md and docs/agents/arc-close.md in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent. Read packages/core/test/architecture/docs-index.test.ts to use its exact governed scope. Fix the ambiguous index criterion so it explicitly excludes docs/INDEX.md and docs/agents/** (and does not accidentally claim AGENTS.md/CONTEXT.md if outside the test's scope). Use one concise phrase consistently in both docs. Do not modify tests, foreign-edited files, stage, or commit. Run focused docs-index tests and git diff --check. Return exact wording and results.",
  "description": "Clarify index scope"
}
```

## User

**Tool Result:** `TU-034Ch9o6UBmu4H1uBXeq3r`

```
Updated only the two requested docs.

Exact shared wording:

> every document under `docs/` except `docs/INDEX.md` and `docs/agents/**`

Also removed the ambiguous “every other document” claim.

Verification:
- Focused docs-index tests: **7/7 passed**
- `git diff --check`: **passed**
- No tests modified; nothing staged or committed.
```

## Assistant

The control protocol now passes its consistency review. Before committing this finished unit, I’m running the package’s full applicable stack—not only the focused documentation test—while scoping any writable tooling to the six files in this slice.

**Tool Use:** `Task`

```json
{
  "prompt": "VERIFY the completed steering-guidance slice in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent. Do not modify source files, run fixers, stage, or commit. Manifest: AGENTS.md, docs/INDEX.md, docs/agents/arc-close.md, documentation.md, issue-tracker.md, steering.md. Ignore unrelated foreign diffs. Inspect package scripts/config and run all applicable checks in this order, scoped to @hashintel/brunch-agent and these files where possible: static lint, formatting check, TypeScript typecheck, full package unit tests (not only focused), build, plus the focused docs-index test and git diff --check. If a check is inapplicable because docs are excluded, state that with the config evidence; do not invent a check. Stop and report on the first failure, per repo discipline. Return exact commands, pass/fail, test counts, and whether any source file changed unexpectedly.",
  "description": "Verify steering protocol slice"
}
```

## User

**Tool Result:** `TU-034ChAzOWI0O490gW6KPlw`

```
Verification passed. No source files changed unexpectedly.

- Static lint: `yarn exec turbo run lint:eslint --filter @hashintel/brunch-agent --` — PASS, 0 warnings/errors across 29 files.
- Formatting: scoped `yarn exec oxfmt --check …` — PASS. Only `AGENTS.md` matched; `oxfmt.config.ts` explicitly excludes `libs/@hashintel/brunch-agent/docs/**`.
- Typecheck: `yarn exec turbo run lint:tsc --filter @hashintel/brunch-agent --` — PASS.
- Full unit tests: `yarn exec turbo run test:unit --filter @hashintel/brunch-agent -- --run` — PASS, 12 files / 114 tests.
- Build: `yarn exec turbo run build --filter @hashintel/brunch-agent --` — PASS.
- Focused index test: `yarn workspace @hashintel/brunch-agent vitest run test/architecture/docs-index.test.ts` — PASS, 1 file / 7 tests.
- Diff hygiene: scoped `git diff --check -- …` — PASS.

Markdownlint is inapplicable: `.markdownlint-cli2.jsonc` excludes both `**/AGENTS*.md` and `libs/@hashintel/brunch-agent/docs/**`.

One initial malformed invocation (`yarn turbo …`) failed because no Yarn script named `turbo` exists; the corrected `yarn exec turbo …` check passed. Foreign diffs remained untouched.
```

## Assistant

**Tool Use:** `Task`

```json
{
  "prompt": "COMMIT the verified steering-guidance unit in /Users/lunelson/Code/hashintel/hash. Shared worktree rules are strict. First inspect git status. Stage exactly these literal paths and no others:\n- libs/@hashintel/brunch-agent/AGENTS.md\n- libs/@hashintel/brunch-agent/docs/INDEX.md\n- libs/@hashintel/brunch-agent/docs/agents/arc-close.md\n- libs/@hashintel/brunch-agent/docs/agents/documentation.md\n- libs/@hashintel/brunch-agent/docs/agents/issue-tracker.md\n- libs/@hashintel/brunch-agent/docs/agents/steering.md\nVerify the staged set equals exactly those six files and that all foreign diffs remain unstaged. Then commit with concise message: `Add strategic steering protocol`. Do not amend, push, move files, or touch Linear. Return commit SHA and post-commit status separating remaining foreign modifications from clean slice state.",
  "description": "Commit steering protocol"
}
```

## User

**Tool Result:** `TU-034ChDtLVTQ4JkC1RDaOCd`

```
Committed `397405a27602508520959747dce4395d4553fde9` — `Add strategic steering protocol`.

- Slice: clean; exactly six requested files committed.
- Foreign modifications: five files remain unstaged (`git-workflow.md`, `issue-writing.md`, `legibility.md`, and two planning files).
- No push, amend, moves, or Linear changes.
```

## Assistant

The routine is now locked in commit `397405a276`:

- `orient → choose → execute → reconcile → replan`
- strategic proof frontiers are distinct from the issue tracker’s claimable queue
- proof requires production wiring, immutable legibility, and witness where interpretation matters
- evaluation material has an explicit case/fixture/run-snapshot/oracle lifecycle
- confidence moves only with cited evidence
- external writes require approval

The remaining cleanup is now a migration, not a design question. I’m doing one live, read-only Linear pointer audit so I can ask for a bounded authorization rather than a vague “may I edit Linear?” request.

**Tool Use:** `Task`

```json
{
  "prompt": "READ-ONLY external audit. Work from /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent. Do not modify repository files or Linear. Use the local Linear tooling/CLI and load cli-linear skill if needed. Find current FE team issues in the brunch-agent project whose live descriptions contain repository-relative paths under `libs/@hashintel/brunch-agent/docs/planning/`, `docs/history/`, or the exact current `docs/spec.md` path. Historical comments need not be exhaustively searched unless tooling makes it cheap; focus on current issue descriptions because they are canonical pointers. Build a complete table: issue key/title/state, each old path, whether the issue is still open/current versus completed/canceled, and the proposed role destination using this locked topology: docs/control, docs/specs, docs/evidence/{proofs,evaluations}, docs/reference, docs/archive, executable evaluations/{cases,protocols,oracles}. For any path whose destination is ambiguous, flag it rather than inventing. Also count affected issues and path occurrences, and state the smallest set of external mutations required to make the physical repo move atomic. Do not write or comment. Return direct evidence of the queries/commands used and any access limitation.",
  "description": "Audit live Linear path pointers"
}
```

## User

**Tool Result:** `TU-034ChF8JY7AasEKwuWjqFt`

```
## Audit result

Queried all **82 FE issues** in Linear project `brunch-agent`; pagination reported `hasNextPage: false`.

- **Affected issues:** 16
- **Open/current:** 7
- **Completed:** 9
- **Canceled affected:** 0
- **Path occurrences:** 30
- **Distinct matched path strings:** 22
- `docs/history/` occurrences: 0
- Exact `docs/spec.md` occurrences: 0

| Issue / state | Current? | Old path(s) → proposed role destination |
|---|---|---|
| FE-1464 — Close the final stack review findings before repository handoff — Done | Completed | `…/baseline/run.ts` → `evaluations/protocols`; `…/plugin-contract-spec.md` → `docs/specs` |
| FE-1437 — Move brunch-agent into hashintel/hash with its history — Ready for review | Open/current | `…/_shared/hash-monorepo-import-plan.md` ×2 → `docs/control` while active; later archival disposition is separate |
| FE-1432 — Resolve the stack's open review threads — Done | Completed | `…/review-remediation-2026-08-18.md` → `docs/evidence/proofs` |
| FE-1431 — Define declarative plugin authoring — Todo | Open/current | `…/plugin-contract-spec.md` → `docs/specs` |
| FE-1424 — Complete the documentation protocol — Done | Completed | `docs/planning/_shared/` → **ambiguous/mixed directory**; contents require per-document destinations |
| FE-1422 — Move the portable ask protocol into core — Done | Completed | `…/remediation-plan-2026-08-17.md` → **ambiguous:** proof record vs archive; `…/_shared/topology.md` → `docs/evidence/proofs`; `…/deep-read-fe-1389.md` → `docs/evidence/proofs`; `…/_shared/CONVERGENCE.md` → **ambiguous:** likely retired control/archive |
| FE-1420 — Make affordance handling safe under retries and abandonment — Next up | Open/current | `…/deep-read-fe-1389.md` → `docs/evidence/proofs` |
| FE-1419 — Align capture-store rules and verification claims — Done | Completed | `…/refactor-queue-2026-08-14.md` → **ambiguous:** settled proof record vs archive |
| FE-1407 — Catalogue elicitor failures that published measures miss — Next up | Open/current | `docs/planning/process-model-elicitation/` → **ambiguous directory pointer**; intended catalogue likely `docs/reference` |
| FE-1404 — Run the third baseline with completion and interview guidance — Next up | Open/current | `…/baseline/` → **mixed:** cases → `evaluations/cases`; procedure/runner → `evaluations/protocols`; transcripts/readouts → `docs/evidence/evaluations` |
| FE-1400 — Strengthen verification, dev storage, and the baseline runner — Done | Completed | `…/baseline/run.ts:213` → `evaluations/protocols` |
| FE-1383 — Build the first complete elicitation interview — In progress | Open/current | `docs/planning/elicitation-kernel/spec.md` → `docs/specs` |
| FE-1382 — Compile the truck-fleet source dossier — Done | Completed | `…/research/` → `docs/reference` |
| FE-1374 — Assemble the elicitation harness specification — Done | Completed | `docs/planning/elicitation-kernel/spec.md` → `docs/specs` |
| FE-1366 — Document the elicitation harness architecture — Done | Completed | `…/spec.md` ×2 → `docs/specs`; `docs/planning/elicitation-kernel/` → **mixed:** spec to `docs/specs`, remaining settled effort records to `docs/archive` |
| FE-1357 — Plan the September elicitation demo and plugin specification — In progress | Open/current | process-model root → **mixed/ambiguous**; kernel spec → `docs/specs`; notes directory → **ambiguous per document**; recommendation → `docs/archive`; truck-fleet dossier/research → `docs/reference`; IR design → `docs/specs`; baseline directory → split among `evaluations/{cases,protocols}` and `docs/evidence/evaluations`; grilling inputs → **ambiguous:** control/reference/archive |

## Minimum external mutation set

To make the physical repository migration pointer-atomic:

1. Decide final filenames for the ambiguous/mixed destinations.
2. Update the **16 affected Linear issue descriptions** in the same approved cutover as the repository move and `docs/INDEX.md` reconciliation.
3. Repair all **30 description occurrences**; directory pointers must be rewritten into explicit role-specific pointers where content splits.
4. No Linear comments or state changes are required.

Completed issues still require description edits because their live descriptions remain canonical pointers. Historical comments were not exhaustively searched, as requested.

## Direct query evidence

```sh
linear auth whoami
linear api <<'GRAPHQL'
query {
  projects(first: 100, filter: {name: {eq: "brunch-agent"}}) {
    nodes { id name state }
  }
}
GRAPHQL
```

Resolved project ID: `74c3fa2d-202d-4344-96e3-30ee3a86784f`.

```sh
linear api --variable projectId=74c3fa2d-202d-4344-96e3-30ee3a86784f <<'GRAPHQL'
query($projectId: ID!) {
  issues(first: 250, filter: {
    project: {id: {eq: $projectId}},
    team: {key: {eq: "FE"}}
  }) {
    pageInfo { hasNextPage endCursor }
    nodes { identifier title description state { name type } updatedAt url }
  }
}
GRAPHQL
```

Then descriptions were filtered locally for `docs/planning/`, `docs/history/`, and exact `docs/spec.md`.

**Access limitations:** none. Linear authentication succeeded as Lu Nelson in the HASH workspace. Repository and Linear remained unmodified. Existing unrelated worktree modifications were observed and untouched.
```

## Assistant

The steering protocol is locked and committed as `397405a276`.

Key gaps now covered: human witness, external-gate ownership, confidence transitions, evaluation lifecycle, oracle promotion, and strategic vs mechanical frontiers. A local skill is deliberately deferred until a second cycle proves it necessary.

The physical topology migration is ready but blocked by:

1. **Linear approval:** update 16 issue descriptions containing 30 old paths. No comments, state, or hierarchy changes.
2. **Concurrent edits:** five files must be committed or explicitly handed over before moving:
   - `git-workflow.md`
   - `issue-writing.md`
   - `legibility.md`
   - `STEERING.md`
   - `hash-monorepo-import-plan.md`

May I update those Linear descriptions and incorporate the concurrent edits into the migration?

## User

working state is now clean. Linear changes approved (observe our issue authoring guidance and patterns); topology migration approved.

## Assistant

Approval received. I’ll perform this as one coordinated cutover: migrate repository paths and evaluation assets, repair internal links/tests/guidance, update the 16 Linear descriptions without changing issue contracts beyond path repair, then run the full verification and close-out pass.

**Tool Use:** `skill`

```json
{
  "name": "dogsled:ds-writing-issues",
  "arguments": "Apply Brunch issue-contract rules while repairing repository paths in 16 existing Linear issue descriptions. Preserve titles, prose contracts, states, hierarchy, and agent-note boundaries; change only stale artifact pointers necessary for the approved topology migration."
}
```

**Tool Use:** `skill`

```json
{
  "name": "cli-linear",
  "arguments": "Update approved repository-path pointers in existing FE brunch-agent issue descriptions during an atomic docs topology migration; no comments, state, hierarchy, assignment, or project changes."
}
```

## User

**Tool Result:** `TU-034Ci0oG04hUrouxThB5wB`

```
{
  "content": [
    {
      "text": "<loaded_skill name=\"dogsled:ds-writing-issues\">\n# ds-writing-issues Skill\n\n\n<!-- dogsled original — carries the issue contract designed in https://github.com/lunelson/dogsled/issues/13 -->\n\n# Writing Issues\n\nEvery issue serves two audiences: the team, who scan for direction and progress, and the agent, which needs precise state to continue the work. Don't make one body serve both equally. Give the issue a **contract** — the human-readable surface — above, and an **execution record** — the agent's working state — below. One source of truth, two projections.\n\nThe rhetorical mode changes at each layer: **outcome language for scanning, explanatory language for understanding, specification language for execution.** The content guidance here is tracker-agnostic; how this repo's tracker expresses labels, parents, and sub-issues lives in its tracker doc (`docs/agents/issue-tracker.md`).\n\n## Who carries the contract\n\nThe test is structural, not type-based. An issue **with no parent** (\"root\") carries the contract. An issue **with a parent** (\"child\") is exempt — it inherits legibility from its parent and keeps whatever shape its driving workflow needs (a wayfinder ticket's `## Question`, a build ticket's own template). Label every child **`dogsled:unframed`** at creation so team-facing views can filter it out. The exemption is automatic the moment a skill creates a child issue — no registry of exempt types. (`dogsled:unframed` marks framing-exemption; it is distinct from type labels like `wayfinder:<type>`.)\n\n## Title — the scan layer\n\nName the outcome: the behavior that becomes possible, the incorrect behavior that stops, the property that becomes reliable, the question the work will answer. Verb + user/system outcome, mechanism only as a trailing qualifier. Two tests, not a vibe:\n\n- **Plan-change test** — the title stays substantially true if the implementation approach changes; swapping the technology must not force a rewrite.\n- **Concept vs. mechanism** — not technical vs. non-technical: domain terms the wider team already uses (\"webhook\", \"workspace\", \"regional outage\") belong in a title; internal class, table, framework, and algorithm names don't.\n\n| Mechanism-shaped                                     | Outcome-shaped                                                  |\n| ---------------------------------------------------- | --------------------------------------------------------------- |\n| Add idempotent webhook persistence with dedupe key   | Prevent duplicate customer notifications from retried webhooks  |\n| Backfill `reports.organization_id` and add NOT NULL FK | Make every report belong to the correct workspace             |\n| Implement HNSW search over issue embeddings          | Decide how agents should retrieve older planning decisions      |\n\nTitle a bug by its observable symptom and affected experience, not the hypothesized root cause. Title research by the question or decision — never disguise a favored implementation as the purpose of an investigation. And internal work names its real engineering outcome — \"safer to test and release\", \"faster incident diagnosis\", \"clearer ownership\" — rather than inventing a tenuous end-user story.\n\n## Context — the prose layer\n\nOne or two short paragraphs of plain prose at the top of the body, mandatory on every root issue; two to four sentences suffice for a small task — don't pad. The reader should be able to recover, where relevant: **current state → consequence → intended change → material status or uncertainty.**\n\nThe central rule: **use a list when the list itself is the information; use prose when the relationship between the facts is the information.** Cause, impact, direction, status, and uncertainty are relationships — prose. A list earns its place only when enumeration is genuinely the point: independent alternatives, several affected products, a set the reader must compare.\n\nThe failure mode is the **property-bag** — facts without their relationship:\n\n```text\nProblem: Users see stale data\nImpact: Confusing UX\nSolution: Cache invalidation\nStatus: In progress\n```\n\nWrite the explanation instead:\n\n> After a user saves a profile change, the page can continue to show the old value until the browser is refreshed, making a successful save look as though it failed. This work will make the page reflect the saved server state immediately. The basic update path is complete, but concurrent edits still need testing.\n\nStatus inside the context describes achieved state and remaining uncertainty in the same prose voice — not \"In progress, PR open, blocked\".\n\n**Synchronization.** Update the context only on a *material* change — one that affects outcome, scope, status, risk, or timing — never on routine technical progress (a commit landing, a pull request opening).\n\n## Aggregating root issues\n\nA root issue **with children** — a map, an epic — additionally carries list-shaped sections, because enumerating many children's state genuinely is the information:\n\n- **Decisions so far** — durable, append-only: one line per closed child, gist + link.\n- **Current plan** — mutable; changes as the work replans.\n- **Open questions** — the one named home for known-unknowns, pruned as items resolve.\n\nThese sections are earned by aggregation, not universal. A single-narrative root issue folds its state into the context prose (\"the recovery design is agreed, implementation has started\") rather than bolting on a one-entry list.\n\n## The execution record\n\nEverything below a `---` divider is the agent's and driving engineer's own — optional, and schema-free: the narrowest readership, so cross-issue consistency has no payoff. Hold whatever the workflow needs — constraints, assumption tables, decisions-vs-current-plan, acceptance criteria, asset links, a posture check. Present when there's something to hold; never mandatory boilerplate on a trivial issue. Technical detail is additive, never deleted merely to simplify the issue.\n\n## One kind of entity\n\nEphemeral or investigative work — research, a prototype, a spike — becomes a **child issue** holding both the query and the result. Never a comment thread used as a workspace; never a body checklist as decomposition. The single exception is the immutable **resolution comment** posted when an issue closes — a closing act, not a workspace.\n\n## Ownership direction\n\nState a fact once; everywhere else links. Within an issue: `Current plan` links to a decision, never restates it. Across issues: a child never re-explains a fact its parent's context already states.\n\n## At close\n\nAn aggregating issue prunes its mutable sections (`Current plan`, `Open questions`) to empty, leaving context + `Decisions so far` + the resolution comment as the durable record. A non-aggregating root issue gets one final context edit reflecting closure. The execution record is left as-is — it never carried a durability promise, so pruning it is ceremony.\n\n## Before publishing\n\n- **Scan test** — can a teammate understand the direction from the title alone?\n- **Plan-change test** — would the title survive a different implementation?\n- **Prose test** — does the context explain causality, or list fragments?\n- **Containment test** — are code-level details below the divider?\n- **List test** — does every list hold genuinely parallel or ordered items?\n- **Uncertainty test** — are open questions presented as uncertainty, not fact?\n\n\nARGUMENTS: Apply Brunch issue-contract rules while repairing repository paths in 16 existing Linear issue descriptions. Preserve titles, prose contracts, states, hierarchy, and agent-note boundaries; change only stale artifact pointers necessary for the approved topology migration.\n\nBase directory for this skill: file:///Users/lunelson/.config/amp/plugins/dogsled/skills/ds-writing-issues\nRelative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.\n\n<skill_files>\n<file>/Users/lunelson/.config/amp/plugins/dogsled/skills/ds-writing-issues/agents/openai.yaml</file>\n</skill_files>\n</loaded_skill>",
      "type": "text"
    }
  ]
}
```

**Tool Result:** `TU-034Ci0oGUHehmqaGNel84M`

```
{
  "content": [
    {
      "text": "<loaded_skill name=\"cli-linear\">\n# cli-linear Skill\n\n\n# Linear CLI\n\nA CLI to manage Linear issues from the command line, with git and jj integration.\n\n## Prerequisites\n\nThe `linear` command must be available on PATH. To check:\n\n```bash\nlinear --version\n```\n\nIf not installed, follow the instructions at:\\\nhttps://github.com/schpet/linear-cli?tab=readme-ov-file#install\n\n## Best Practices for Markdown Content\n\nWhen working with issue descriptions or comment bodies that contain markdown, **always prefer using file-based flags** instead of passing content as command-line arguments:\n\n- Use `--description-file` for `issue create` and `issue update` commands\n- Use `--body-file` for `comment add` and `comment update` commands\n\n**Why use file-based flags:**\n\n- Ensures proper formatting in the Linear web UI\n- Avoids shell escaping issues with newlines and special characters\n- Prevents literal `\\n` sequences from appearing in markdown\n- Makes it easier to work with multi-line content\n\n**Example workflow:**\n\n```bash\n# Write markdown to a temporary file\ncat > /tmp/description.md <<'EOF'\n## Summary\n\n- First item\n- Second item\n\n## Details\n\nThis is a detailed description with proper formatting.\nEOF\n\n# Create issue using the file\nlinear issue create --title \"My Issue\" --description-file /tmp/description.md\n\n# Or for comments\nlinear issue comment add ENG-123 --body-file /tmp/comment.md\n```\n\n**Only use inline flags** (`--description`, `--body`) for simple, single-line content.\n\n## Available Commands\n\n```\nlinear auth               # Manage Linear authentication\nlinear issue              # Manage Linear issues\nlinear team               # Manage Linear teams\nlinear project            # Manage Linear projects\nlinear project-update     # Manage project status updates\nlinear cycle              # Manage Linear team cycles\nlinear milestone          # Manage Linear project milestones\nlinear initiative         # Manage Linear initiatives\nlinear initiative-update  # Manage initiative status updates (timeline posts)\nlinear label              # Manage Linear issue labels\nlinear document           # Manage Linear documents\nlinear config             # Interactively generate .linear.toml configuration\nlinear schema             # Print the GraphQL schema to stdout\nlinear api                # Make a raw GraphQL API request\n```\n\n## Reference Documentation\n\n- [auth](references/auth.md) - Manage Linear authentication\n- [issue](references/issue.md) - Manage Linear issues\n- [team](references/team.md) - Manage Linear teams\n- [project](references/project.md) - Manage Linear projects\n- [project-update](references/project-update.md) - Manage project status updates\n- [cycle](references/cycle.md) - Manage Linear team cycles\n- [milestone](references/milestone.md) - Manage Linear project milestones\n- [initiative](references/initiative.md) - Manage Linear initiatives\n- [initiative-update](references/initiative-update.md) - Manage initiative status updates (timeline posts)\n- [label](references/label.md) - Manage Linear issue labels\n- [document](references/document.md) - Manage Linear documents\n- [config](references/config.md) - Interactively generate .linear.toml configuration\n- [schema](references/schema.md) - Print the GraphQL schema to stdout\n- [api](references/api.md) - Make a raw GraphQL API request\n\nFor curated examples of organization features (initiatives, labels, projects, bulk operations), see [organization-features](references/organization-features.md).\n\n## Discovering Options\n\nTo see available subcommands and flags, run `--help` on any command:\n\n```bash\nlinear --help\nlinear issue --help\nlinear issue list --help\nlinear issue create --help\n```\n\nEach command has detailed help output describing all available flags and options.\n\n## Using the Linear GraphQL API Directly\n\n**Prefer the CLI for all supported operations.** The `api` command should only be used as a fallback for queries not covered by the CLI.\n\n### Check the schema for available types and fields\n\nWrite the schema to a tempfile, then search it:\n\n```bash\nlinear schema -o \"${TMPDIR:-/tmp}/linear-schema.graphql\"\ngrep -i \"cycle\" \"${TMPDIR:-/tmp}/linear-schema.graphql\"\ngrep -A 30 \"^type Issue \" \"${TMPDIR:-/tmp}/linear-schema.graphql\"\n```\n\n### Make a GraphQL request\n\n**Important:** GraphQL queries containing non-null type markers (e.g. `String` followed by an exclamation mark) must be passed via heredoc stdin to avoid escaping issues. Simple queries without those markers can be passed inline.\n\n```bash\n# Simple query (no type markers, so inline is fine)\nlinear api '{ viewer { id name email } }'\n\n# Query with variables — use heredoc to avoid escaping issues\nlinear api --variable teamId=abc123 <<'GRAPHQL'\nquery($teamId: String!) { team(id: $teamId) { name } }\nGRAPHQL\n\n# Search issues by text\nlinear api --variable term=onboarding <<'GRAPHQL'\nquery($term: String!) { searchIssues(term: $term, first: 20) { nodes { identifier title state { name } } } }\nGRAPHQL\n\n# Numeric and boolean variables\nlinear api --variable first=5 <<'GRAPHQL'\nquery($first: Int!) { issues(first: $first) { nodes { title } } }\nGRAPHQL\n\n# Complex variables via JSON\nlinear api --variables-json '{\"filter\": {\"state\": {\"name\": {\"eq\": \"In Progress\"}}}}' <<'GRAPHQL'\nquery($filter: IssueFilter!) { issues(filter: $filter) { nodes { title } } }\nGRAPHQL\n\n# Pipe to jq for filtering\nlinear api '{ issues(first: 5) { nodes { identifier title } } }' | jq '.data.issues.nodes[].title'\n```\n\n### Advanced: Using curl directly\n\nFor cases where you need full HTTP control, use `linear auth token`:\n\n```bash\ncurl -s -X POST https://api.linear.app/graphql \\\n  -H \"Content-Type: application/json\" \\\n  -H \"Authorization: $(linear auth token)\" \\\n  -d '{\"query\": \"{ viewer { id } }\"}'\n```\n\n\nARGUMENTS: Update approved repository-path pointers in existing FE brunch-agent issue descriptions during an atomic docs topology migration; no comments, state, hierarchy, assignment, or project changes.\n\nBase directory for this skill: file:///Users/lunelson/.agents/skills/cli-linear\nRelative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.\n\n<skill_files>\n<file>/Users/lunelson/.agents/skills/cli-linear/SKILL.template.md</file>\n<file>/Users/lunelson/.agents/skills/cli-linear/references/api.md</file>\n<file>/Users/lunelson/.agents/skills/cli-linear/references/auth.md</file>\n<file>/Users/lunelson/.agents/skills/cli-linear/references/commands.md</file>\n<file>/Users/lunelson/.agents/skills/cli-linear/references/config.md</file>\n<file>/Users/lunelson/.agents/skills/cli-linear/references/cycle.md</file>\n<file>/Users/lunelson/.agents/skills/cli-linear/references/document.md</file>\n<file>/Users/lunelson/.agents/skills/cli-linear/references/initiative-update.md</file>\n<file>/Users/lunelson/.agents/skills/cli-linear/references/initiative.md</file>\n<file>/Users/lunelson/.agents/skills/cli-linear/references/issue.md</file>\n<file>/Users/lunelson/.agents/skills/cli-linear/references/label.md</file>\n<file>/Users/lunelson/.agents/skills/cli-linear/references/milestone.md</file>\n<file>/Users/lunelson/.agents/skills/cli-linear/references/organization-features.md</file>\n<file>/Users/lunelson/.agents/skills/cli-linear/references/project-update.md</file>\n<file>/Users/lunelson/.agents/skills/cli-linear/references/project.md</file>\n<file>/Users/lunelson/.agents/skills/cli-linear/references/schema.md</file>\n<file>/Users/lunelson/.agents/skills/cli-linear/references/team.md</file>\n<file>/Users/lunelson/.agents/skills/cli-linear/scripts/generate-docs.ts</file>\n</skill_files>\n</loaded_skill>",
      "type": "text"
    }
  ]
}
```

## Assistant

I’m using the locked authority model as the migration rule, not inventing a new taxonomy:

- mutable current state → `docs/control`
- required behavior → `docs/specs`
- observed proof and evaluation records → `docs/evidence`
- stable explanation/research → `docs/reference`
- settled or superseded material → `docs/archive`
- runnable evaluation inputs/protocols/oracles → `evaluations`

The first repository pass moves all non-baseline material and repairs its internal consumers. The baseline then gets split by information role rather than moved wholesale.

**Tool Use:** `Task`

```json
{
  "prompt": "IMPLEMENT the approved non-baseline documentation topology migration in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent. Worktree is expected clean except your work; inspect status first and preserve any unexpected changes. Read every file before moving/editing. Do not touch Linear yet. Do not stage/commit. Leave docs/planning/process-model-elicitation/baseline/** for a separate pass, but repair links to other files you move when necessary.\n\nCanonical roles are already locked in docs/agents/documentation.md. Keep docs/agents, docs/adr, docs/inbox, and existing docs/reference source materials. Delete docs/inbox/.gitkeep if present because inbox is populated.\n\nUse git mv and these destination decisions, preserving names unless specified:\n\nCONTROL\n- docs/planning/_shared/STEERING.md -> docs/control/STEERING.md\n- .../COORDINATION.md -> docs/control/COORDINATION.md\n- .../SPEC-LEDGER.md -> docs/control/SPEC-LEDGER.md\n\nSPECS\n- docs/spec.md -> docs/specs/elicitation-kernel.md\n- process-model-elicitation/ir-design.md -> docs/specs/intermediate-representation.md\n- ir-design-plain.md -> docs/specs/intermediate-representation-plain.md (mark/link as non-authoritative legibility companion if the content currently risks dual authority; minimal edit only)\n- plugin-contract-spec.md -> docs/specs/plugin-contract.md\n- petrinaut-integration-spec.md -> docs/specs/petrinaut-integration.md\n\nREFERENCE\n- _shared/topology.md -> docs/reference/architecture/topology.md\n- _shared/flue-architecture-cheatsheet.md -> docs/reference/architecture/flue-architecture-cheatsheet.md\n- process-model-elicitation/capture-store-plain.md -> docs/reference/architecture/capture-store.md\n- research/elicitation-strategy-literature.md -> docs/reference/research/elicitation/elicitation-strategy-literature.md\n- research/re-interviewing-literature-worker-report.md -> docs/reference/research/elicitation/interviewing-literature-source-catalog.md\n- research/petrinaut-survey.md -> docs/reference/research/petrinaut-survey.md\n- research/voice-feasibility.md -> docs/reference/research/voice-feasibility.md\n\nEVIDENCE/PROOFS\n- ir-worked-examples.md -> docs/evidence/proofs/design/intermediate-representation-worked-examples.md\n- spikes/fe-1434-suspension-* -> docs/evidence/proofs/spikes/ with names preserved\n- adapter-panel-spike-2026-08-19.md -> docs/evidence/proofs/spikes/fe-1435-adapter-panel-2026-08-19.md\n- transport-aisdk-implementation-2026-08-19.md -> docs/evidence/proofs/implementations/fe-1436-transport-aisdk-2026-08-19.md\n- ask-return-implementation-2026-08-19.md -> docs/evidence/proofs/implementations/fe-1449-ask-return-2026-08-19.md\n- notes/deep-read-fe-1389.md and deep-read-fe-1390.md -> docs/evidence/proofs/audits/\n- notes/research-patterns-audit.md -> docs/evidence/proofs/audits/research-patterns-audit.md\n- notes/expert-meeting-findings-2026-08-11.md -> docs/evidence/proofs/research/expert-meeting-findings-2026-08-11.md\n- planning/legibility-sweep/flue-patterns-audit-* and flue-entry-projection-source-read-* -> docs/evidence/proofs/audits/\n\nARCHIVE\n- docs/history/planning/elicitation-kernel/** -> docs/archive/elicitation-kernel/** preserving relative subtree\n- _shared/hash-monorepo-import-plan.md -> docs/archive/migrations/hash-monorepo-import-plan.md\n- planning/legibility-sweep/issue-pr-migration-2026-08-20/** -> docs/archive/migrations/issue-pr-legibility-2026-08-20/**\n- legibility refactor-queue/remediation-plan/review-remediation -> docs/archive/engineering/legibility/ names preserved\n- recommendation-demo-vehicle.md -> docs/archive/decisions/superseded/recommendation-demo-vehicle.md\n- notes/open-questions-elicitation-design-* -> docs/archive/external-snapshots/\n- notes/expert-meeting-prep-* -> docs/archive/meetings/\n- notes/grilling-inputs-* and penciled-directions-* -> docs/archive/planning-inputs/\n\nAfter inventorying, classify any omitted non-baseline file still under docs/planning by the same authority rules rather than leaving an unexplained remnant; if materially ambiguous, stop and report instead of inventing.\n\nRepair all internal Markdown links, exact path mentions that are operational instructions, README/AGENTS/protocol pointers, docs/INDEX registry entries/status/digests, package/test/config consumers, and relative links inside moved trees. Preserve historical evidence: do not rewrite committed migration source snapshots, hashes, quoted historical commands, or plain-text old paths whose evidentiary meaning is the old location; add a concise migration note only where necessary to prevent reader confusion. Do not create compatibility stubs.\n\nUpdate packages/core/test/architecture/docs-index.test.ts for the role-based zones while retaining complete indexing, target resolution, relative-link checks, and protocol reachability. During this transitional pass it may explicitly allow only the baseline subtree under legacy docs/planning; no other planning/history documents should remain. Do not weaken the test broadly.\n\nRun focused docs-index tests and git diff --check. Return: full move list including omitted files classified, all edited files, tests, remaining docs/planning remnants, and any concern for the baseline pass.",
  "description": "Migrate role-based documents"
}
```

## User

**Tool Result:** `TU-034Ci1TKTLf7qgVBnTZCOT`

```
Implemented the non-baseline documentation topology migration.

### Moves

- Controls → `docs/control/{STEERING,COORDINATION,SPEC-LEDGER}.md`
- Specs → `docs/specs/`:
  - `elicitation-kernel.md`
  - `intermediate-representation.md`
  - `intermediate-representation-plain.md`
  - `plugin-contract.md`
  - `petrinaut-integration.md`
- Architecture/research sources → `docs/reference/{architecture,research}/`
- Proofs → `docs/evidence/proofs/{design,spikes,implementations,audits,research}/`
- Elicitation-kernel history → `docs/archive/elicitation-kernel/`
- Migration records → `docs/archive/migrations/`
- Legibility plans → `docs/archive/engineering/legibility/`
- Superseded decision → `docs/archive/decisions/superseded/`
- Meeting, snapshot, and planning inputs → corresponding `docs/archive/` zones
- Deleted populated inbox’s `.gitkeep`

All specified files moved, including renamed FE-1435/1436/1449 records. No ambiguous omitted non-baseline planning files remained.

### Edited files

Updated links, operational path references, authority wording, or index entries in:

- `README.md`
- `docs/INDEX.md`
- `docs/adr/0001`–`0004`
- `docs/agents/{arc-close,documentation,flue-routing,issue-tracker,issue-writing}.md`
- `docs/control/{COORDINATION,STEERING}.md`
- moved specs, architecture references, proofs, and affected archive Markdown
- `docs/planning/process-model-elicitation/baseline/protocol.md`
- `packages/core/test/architecture/{boundaries,docs-index}.test.ts`

The plain IR document is explicitly marked non-authoritative. Immutable migration snapshots and historical path evidence were preserved; their narrow link-check exemptions are documented.

### Verification

- Formatting: passed
- ESLint: passed
- TypeScript: passed
- Unit tests: **114 passed**
- Build: passed
- `git diff --check`: passed
- Index coverage, target resolution, relative links, and protocol reachability: passed

### Remaining legacy planning content

Only:

`docs/planning/process-model-elicitation/baseline/**`

No `docs/history/` content remains. The baseline runner/package paths intentionally remain unchanged for the separate baseline pass.

Nothing is staged or committed.
```

## Assistant

The non-baseline move is complete and the full package suite passes. Before committing, I’m checking the large rename/link diff for semantic misclassification, hidden path breakage, and whether the test exemptions preserve historical evidence without becoming a general escape hatch.

**Tool Use:** `Task`

```json
{
  "prompt": "READ-ONLY cold review of the current non-baseline topology migration diff in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent. Do not modify/stage/commit. Review intent-first: role topology docs/control, specs, evidence/proofs, reference, archive; only baseline may remain under legacy docs/planning until next pass; docs/agents and adr stay; no compatibility stubs; historical snapshots/hashes retain evidentiary old paths; INDEX/test coverage remains strict. Inspect git diff --find-renames, current tree, all changed tests, INDEX, guidance, moved controls/specs/proofs/reference/archive, and internal links. Check specifically: lost files, duplicate authorities, misclassified active controls, broken operational paths, overbroad docs-index exceptions, accidental edits to immutable migration evidence, stale `docs/history` or non-baseline `docs/planning` references that imply live authority, and co-tenancy/staging risk. Return actionable findings with file/line and smallest fix; pass/fail; exact manifest paths suitable for staging if passed after fixes.",
  "description": "Review topology migration"
}
```

## User

**Tool Result:** `TU-034CiAOOAqbD9YZ3bL5kCp`

```
## Verdict: **FAIL**

### Findings

1. **Stale operational path in active evidence**
   - `docs/evidence/proofs/audits/deep-read-fe-1390.md:7`
   - References ``../capture-store-plain.md``, which no longer exists.
   - Smallest fix: change it to `../../../reference/architecture/capture-store.md`, preferably as a Markdown link so link tests enforce it.

2. **Stale live-authority filename in glossary**
   - `CONTEXT.md:74,87`
   - References ``plugin-contract-spec.md`` although authority moved to `docs/specs/plugin-contract.md`.
   - Smallest fix: replace both references with `docs/specs/plugin-contract.md`.

### Evidence

- No staged changes; co-tenancy risk currently limited to the unstaged migration.
- File accounting is complete: 73 replacement files for 73 moved documents; only deleted `.gitkeep` has no replacement.
- No duplicate byte-identical documents found.
- Immutable issue/PR migration snapshots and hash files remain byte-identical.
- Legacy-path scan found no inappropriate live `docs/history` or non-baseline `docs/planning` authority beyond the two stale references above and intentionally preserved historical evidence.
- Link exemptions cover the byte-preserved migration corpus; no overbroad non-archive exception found.
- `git diff --check`: passed.
- Focused architecture tests: **36/36 passed**.

Because findings remain, no staging manifest is approved. After fixing them, rerun the focused tests and use the complete then-current `git status --porcelain` path set as the staging manifest; do not stage by directory or with `git add .`.
```

## Assistant

**Tool Use:** `Task`

```json
{
  "prompt": "EDIT only these two files in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent after reading them:\n1. docs/evidence/proofs/audits/deep-read-fe-1390.md: replace the stale ../capture-store-plain.md reference with a working Markdown link to ../../../reference/architecture/capture-store.md, preserving sentence meaning.\n2. CONTEXT.md: replace both live-authority references to plugin-contract-spec.md with the canonical docs/specs/plugin-contract.md path; preserve glossary meaning.\nDo not touch other files, stage, or commit. Run focused architecture/docs-index tests and git diff --check. Return exact changes and results.",
  "description": "Fix topology review findings"
}
```

## User

**Tool Result:** `TU-034CiCrAtqHOpSU1rW1G4n`

```
Updated only:

- `deep-read-fe-1390.md`: replaced stale reference with [`capture-store.md`](../../../reference/architecture/capture-store.md).
- `CONTEXT.md`: replaced both `plugin-contract-spec.md` references with `docs/specs/plugin-contract.md`.

Verification:
- Architecture/docs-index suite: **114 tests passed**
- `git diff --check`: **passed**
- Both targets exist
- Nothing staged or committed.
```

## Assistant

**Tool Use:** `Task`

```json
{
  "prompt": "READ-ONLY final review of the non-baseline topology migration in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent. Confirm the two prior stale references are fixed, no other live non-baseline docs/planning or docs/history references remain outside intentionally immutable archive snapshots, no duplicate authority/file loss, and current tests enforce that only baseline remains under legacy planning. Inspect git status for unexpected foreign changes. Return pass/fail, any actionable finding, and the complete explicit manifest of current migration changes (renames/edits/deletions) suitable for literal staging. Do not modify/stage/commit.",
  "description": "Recheck topology migration"
}
```

## User

**Tool Result:** `TU-034CiF8RUPYBrT00cFsjVg`

```
## PASS

- Both prior stale references are fixed.
- No live non-baseline `docs/planning/**`, `docs/history/**`, or stale references remain.
- Historical references remain only in immutable snapshots, including `docs/reference/amp-analysis-flue-vs-tilde.md`.
- Legacy planning contains only the baseline experiment; `docs/history/` is absent.
- 73 documents migrated; 50 byte-identical and 23 pointer-edited. No duplicate content or file loss.
- Sole true deletion: `docs/inbox/.gitkeep`.
- No foreign changes outside `libs/@hashintel/brunch-agent`.

Verification passed:

- ESLint: 0 errors/warnings
- Type check
- Unit tests: 114/114
- Build
- `git diff --check`

## Literal staging manifest

```sh
git add -- \
  CONTEXT.md \
  README.md \
  docs/INDEX.md \
  docs/adr/0001-brunch-is-the-product-name.md \
  docs/adr/0002-topology-and-placement-rules.md \
  docs/adr/0003-three-register-ir.md \
  docs/adr/0004-in-petrinaut-staging-and-the-monorepo-import.md \
  docs/agents/arc-close.md \
  docs/agents/documentation.md \
  docs/agents/flue-routing.md \
  docs/agents/issue-tracker.md \
  docs/agents/issue-writing.md \
  docs/planning/process-model-elicitation/baseline/protocol.md \
  packages/core/test/architecture/boundaries.test.ts \
  packages/core/test/architecture/docs-index.test.ts \
  docs/history/planning/elicitation-kernel \
  docs/inbox/.gitkeep \
  docs/planning/_shared \
  docs/planning/legibility-sweep \
  docs/planning/process-model-elicitation \
  docs/spec.md \
  docs/archive \
  docs/control \
  docs/evidence \
  docs/reference/architecture \
  docs/reference/research \
  docs/specs
```

This stages all 73 renames, 15 tracked edits, and the `.gitkeep` deletion without including unrelated paths.
```

## Assistant

The topology review now passes: 73 documents migrated, no duplicate authorities or lost files, immutable migration evidence unchanged, and only the baseline remains in the legacy planning path. I’m committing this as the first migration unit before splitting the executable baseline.

**Tool Use:** `Task`

```json
{
  "prompt": "COMMIT the verified non-baseline topology migration in /Users/lunelson/Code/hashintel/hash. Inspect status first; abort and report if any change exists outside libs/@hashintel/brunch-agent or if an unexpected file appeared since review. Build an explicit literal path list from the current status (including both sides of renames/deletions as Git requires); do not use `git add .`, `git add -A`, wildcard staging, or stage outside the manifest. Stage all and only current migration paths under libs/@hashintel/brunch-agent. Verify staged diff/accounting: 73 migrated documents, tracked pointer/guidance/test edits, and deletion of docs/inbox/.gitkeep; baseline files remain except protocol link edits. Verify no unstaged migration changes remain and no unrelated staged files exist. Commit with message `Organize Brunch documentation by role`. Do not push or touch Linear. Return commit SHA, staged statistics, and post-commit status.",
  "description": "Commit document topology migration"
}
```

## User

**Tool Result:** `TU-034CiLI9i0zOlKWGX8xk8g`

```
Committed `3b4a73f4a7f5544f1ac90b5f3dacfffe509e5d96`.

- 89 files: 73 renames, 15 modifications, 1 deletion
- 156 insertions, 140 deletions
- Pre-commit checks passed
- Post-commit worktree clean
- No push or Linear changes performed
```

## Assistant

The remaining migration is the important semantic split: source material, execution protocol, and observed results stop living together. The runner will remain reproducible, tests will write only to isolated output, and no oracle directory will be invented until a reviewed answer key exists.

**Tool Use:** `Task`

```json
{
  "prompt": "IMPLEMENT the approved baseline split in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent. Worktree must be clean at start; stop on unexpected changes. Read all baseline files, package scripts, tests, and relevant workspace/prune config before editing. Do not touch Linear yet. Do not stage/commit.\n\nUse git mv and this exact role split:\nCASES/CORPUS TRUTH\n- docs/planning/process-model-elicitation/baseline/opening-message.md -> evaluations/cases/process-model-elicitation/baseline/opening-message.md\n- situation-pack.md -> evaluations/cases/process-model-elicitation/baseline/situation-pack.md\n\nPROTOCOL/RUNNER\n- protocol.md -> evaluations/protocols/process-model-elicitation/baseline/protocol.md\n- v0-prompt.md -> evaluations/protocols/process-model-elicitation/baseline/v0-prompt.md\n- run.ts -> evaluations/protocols/process-model-elicitation/baseline/run.ts\n\nIMMUTABLE EVALUATION EVIDENCE\nMove into docs/evidence/evaluations/process-model-elicitation/baseline/:\n- readout.md\n- transcripts/** (all current files, relative structure preserved)\n\nNo oracle exists. Do not create an empty evaluations/oracles directory or claim that situation-pack is an answer key.\n\nAdd evaluations/AGENTS.md because evaluations is a new responsibility/trust boundary. Keep it compact and specific:\n- cases own reusable domain/source truth and interviewee-visible inputs;\n- protocols own prompts/runners/procedures;\n- oracles own reviewed expected claims/answer keys and must remain outside interviewee/model inputs;\n- generated/observed run evidence belongs under docs/evidence/evaluations, not evaluations;\n- preserve provenance and never silently overwrite immutable snapshots;\n- use test-only output paths for tests.\nIf root Brunch AGENTS.md needs a one-line pointer for this boundary, add only the minimal trigger.\n\nUpdate run.ts minimally:\n- resolve v0-prompt beside runner;\n- resolve case inputs from the cases path without duplicating files;\n- default production output to docs/evidence/evaluations/process-model-elicitation/baseline/transcripts;\n- support one explicit test-only output-directory environment variable or existing local pattern so tests never mutate committed evidence;\n- update generated metadata/path comments without changing experiment behavior.\n\nUpdate:\n- packages/core/package.json baseline:run path\n- packages/core/test/architecture/baseline-runner.test.ts to copy/use protocol and cases separately and isolated output\n- workspace/prune/copy config only if inspection proves evaluations would otherwise be omitted from the actual execution/build boundary\n- docs/INDEX.md: register the immutable evidence bundle; executable evaluations files are not docs index entries\n- docs/agents/documentation.md: remove transitional legacy planning/history exception now that migration is complete; retain role rules\n- packages/core/test/architecture/docs-index.test.ts: remove transitional baseline exception and prohibit all docs/planning and docs/history documents; retain coverage/link/protocol rules\n- docs/reference/architecture/topology.md and every operational/internal Markdown link/path consumer\n- README/AGENTS only if needed\n\nDelete empty docs/planning directories as a natural result; do not create stubs. Preserve transcript/readout bytes except required link repairs. Do not rewrite immutable raw JSON. Do not alter evaluation semantics or prompts.\n\nRun formatting/static lint/typecheck/full package unit tests/build/focused docs-index and baseline-runner tests/git diff --check. Return complete move/edit manifest, exact environment variable/API behavior added, verification results, and confirmation no docs/planning or docs/history remains.",
  "description": "Split baseline evaluation assets"
}
```

## User

**Tool Result:** `TU-034CiNAIx9e8QMh2A4PNDB`

```
Implemented the approved baseline split.

- Moved cases, protocols/runner, and immutable evidence to the specified locations.
- Added compact `evaluations/AGENTS.md` and root pointer.
- Added `BRUNCH_BASELINE_TEST_OUTPUT_DIR`; production defaults to `docs/evidence/evaluations/.../transcripts`.
- Updated package scripts, tests, docs/index/topology, links, and prune config.
- Transcript and raw JSON bytes remain unchanged.
- No `docs/planning`, `docs/history`, or `evaluations/oracles` directory remains.
- Nothing staged or committed; Linear untouched.

Verification passed:
- Formatting and ESLint
- Typecheck
- Full core unit suite: 114 tests
- Build
- Focused docs-index/baseline-runner: 11 tests
- Runner syntax, Python compile, `git diff --check`
```

## Assistant

**Tool Use:** `Task`

```json
{
  "prompt": "READ-ONLY cold review of the current baseline/evaluation split diff in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent. Do not modify/stage/commit. Intent: cases and interviewee-visible truth under evaluations/cases; runner/prompts/procedures under evaluations/protocols; no oracle until reviewed expected claims exist; immutable observed output under docs/evidence/evaluations; test runs never mutate committed evidence; production command still works from repo/package contexts; prune/build includes required assets; docs planning/history fully gone; transcript/raw JSON semantics preserved. Inspect git diff --find-renames, run.ts path resolution, package script, baseline-runner test, workspace/prune config, AGENTS guidance, INDEX/docs tests, topology links, and current tree. Check for information-wall violations, path arithmetic errors, unsafe output override available in production, tests that recreate wiring the production entrypoint lacks, overbroad test exceptions, accidental evidence edits, and missing consumers. Return actionable findings with file/line and smallest fix; pass/fail; exact manifest paths if passed after fixes.",
  "description": "Review evaluation split"
}
```

## User

**Tool Result:** `TU-034CiUV29OXgYfHk0gz4Qh`

```
## Verdict: **FAIL**

### Finding

**High — production can redirect or overwrite output through a test-only environment variable.**

- `evaluations/protocols/process-model-elicitation/baseline/run.ts:118-125`
- `packages/core/turbo.json:4-10`

`BRUNCH_BASELINE_TEST_OUTPUT_DIR` is accepted unconditionally and explicitly forwarded by the production Turbo task. A real API-backed run can therefore write outside immutable evidence storage, defeating the evidence-location contract.

**Smallest fix:** only honor the override when `BRUNCH_BASELINE_ANTHROPIC_MODULE` is also set; otherwise reject it. Remove it from `baseline:run.passThroughEnv`. Add a regression test proving an override without the stub is refused before any API call.

### Passed checks

- Case/protocol information wall is correct; no oracle exists.
- Historical transcripts and raw JSON are byte-identical after relocation.
- No accidental evidence edits beyond readout link repair.
- Production runner works from HASH root and package directory.
- Path arithmetic and package script work.
- Focused tests: 11 passed.
- Typecheck, ESLint, formatting, build, and `git diff --check` passed.
- Prune dry-run includes `evaluations/`.
- Retired `docs/planning` and `docs/history` trees are absent.
- INDEX and topology links resolve.
- Tests use isolated output and preserve production-relative topology.

No files were modified, staged, or committed. A passing manifest is not applicable until the finding is fixed.
```

## Assistant

The review found one real trust-boundary flaw: the test output override was available to production runs. I’m constraining it to the existing stubbed-model test mode and adding a regression test that rejects any production override before an API call.

**Tool Use:** `Task`

```json
{
  "prompt": "EDIT the current evaluation split in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent. Read current files before patching. Fix only the review finding:\n- In evaluations/protocols/process-model-elicitation/baseline/run.ts, BRUNCH_BASELINE_TEST_OUTPUT_DIR may be honored only when BRUNCH_BASELINE_ANTHROPIC_MODULE is also set. If output override is set without the stub module, fail clearly before any API/module call or output mutation.\n- Remove BRUNCH_BASELINE_TEST_OUTPUT_DIR from packages/core/turbo.json baseline:run.passThroughEnv. Preserve whatever pass-through is actually needed for production and stub tests.\n- Add a focused regression test in packages/core/test/architecture/baseline-runner.test.ts proving an override without the stub module is rejected before any API call and does not create output.\nDo not alter experiment behavior, prompt/case files, evidence snapshots, stage, commit, or touch Linear. Run formatting, lint, typecheck, full unit tests, build, focused baseline/docs tests, runner syntax, and git diff --check. Return exact change and results.",
  "description": "Constrain baseline test output"
}
```

## User

**Tool Result:** `TU-034CiYHsMgYJPEYxMWvWp6`

```
Implemented the evaluation-split review fix:

- `run.ts`: rejects `BRUNCH_BASELINE_TEST_OUTPUT_DIR` unless `BRUNCH_BASELINE_ANTHROPIC_MODULE` is set, before SDK/module loading or filesystem mutation.
- `turbo.json`: removed output override pass-through; retained API key and stub-module pass-through.
- `baseline-runner.test.ts`: added regression coverage proving exit failure, zero API requests, and no output directory creation.

Verification passed:

- Formatting and ESLint
- Typecheck
- Full unit suite: 115/115
- Build
- Focused baseline/docs tests: 12/12
- Runner syntax check
- `git diff --check`

Nothing staged, committed, or sent to Linear. Existing unrelated worktree changes were untouched.
```

## Assistant

**Tool Use:** `Task`

```json
{
  "prompt": "READ-ONLY final review of the baseline/evaluation split in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent. Confirm prior output-override finding is fixed, test catches it before module/API/filesystem effects, Turbo no longer exposes the override to production, no unexpected/foreign changes exist, immutable evidence bytes remain unchanged except required readout links, no docs/planning/history remains, and all consumers resolve. Return pass/fail, any actionable finding, exact current diff manifest for literal staging, and clarify what the prior implementer meant by 'unrelated worktree changes'. Do not modify/stage/commit.",
  "description": "Recheck evaluation split"
}
```

## User

**Tool Result:** `TU-034Cic59BsYV5E0hbM154G`

```
## PASS

No actionable findings.

- Output override is rejected before SDK/module import, API calls, input reads, or output-directory creation.
- Regression test proves zero API calls and no filesystem output; all 5 runner tests pass.
- Turbo passes only `ANTHROPIC_API_KEY` and the test module override—not `BRUNCH_BASELINE_TEST_OUTPUT_DIR`.
- Immutable transcript/raw/model bytes are unchanged. Readout changed only to repair its protocol link.
- `docs/planning/` and `docs/history/` are absent. Remaining mentions are historical/archive references.
- Documentation links and consumers resolve.
- No foreign changes detected. The sole change outside Brunch, `.github/actions/prune-repository/prune.py`, is directly required to include `evaluations/` in pruned CI checkouts. Thus “unrelated worktree changes” appears to have meant “outside the Brunch directory,” not semantically unrelated work.

### Verification

- ESLint: pass
- Formatting: pass
- Typecheck: pass
- Unit tests: 115/115 pass
- Build: pass

### Exact staging manifest

```text
.github/actions/prune-repository/prune.py
libs/@hashintel/brunch-agent/AGENTS.md
libs/@hashintel/brunch-agent/docs/INDEX.md
libs/@hashintel/brunch-agent/docs/agents/arc-close.md
libs/@hashintel/brunch-agent/docs/agents/documentation.md
libs/@hashintel/brunch-agent/docs/evidence/evaluations/process-model-elicitation/baseline/readout.md
libs/@hashintel/brunch-agent/docs/evidence/evaluations/process-model-elicitation/baseline/transcripts/condition-1-model.txt
libs/@hashintel/brunch-agent/docs/evidence/evaluations/process-model-elicitation/baseline/transcripts/condition-1.md
libs/@hashintel/brunch-agent/docs/evidence/evaluations/process-model-elicitation/baseline/transcripts/condition-1.raw.json
libs/@hashintel/brunch-agent/docs/evidence/evaluations/process-model-elicitation/baseline/transcripts/condition-2-model.txt
libs/@hashintel/brunch-agent/docs/evidence/evaluations/process-model-elicitation/baseline/transcripts/condition-2.md
libs/@hashintel/brunch-agent/docs/evidence/evaluations/process-model-elicitation/baseline/transcripts/condition-2.raw.json
libs/@hashintel/brunch-agent/docs/planning/process-model-elicitation/baseline/opening-message.md
libs/@hashintel/brunch-agent/docs/planning/process-model-elicitation/baseline/protocol.md
libs/@hashintel/brunch-agent/docs/planning/process-model-elicitation/baseline/readout.md
libs/@hashintel/brunch-agent/docs/planning/process-model-elicitation/baseline/run.ts
libs/@hashintel/brunch-agent/docs/planning/process-model-elicitation/baseline/situation-pack.md
libs/@hashintel/brunch-agent/docs/planning/process-model-elicitation/baseline/transcripts/condition-1-model.txt
libs/@hashintel/brunch-agent/docs/planning/process-model-elicitation/baseline/transcripts/condition-1.md
libs/@hashintel/brunch-agent/docs/planning/process-model-elicitation/baseline/transcripts/condition-1.raw.json
libs/@hashintel/brunch-agent/docs/planning/process-model-elicitation/baseline/transcripts/condition-2-model.txt
libs/@hashintel/brunch-agent/docs/planning/process-model-elicitation/baseline/transcripts/condition-2.md
libs/@hashintel/brunch-agent/docs/planning/process-model-elicitation/baseline/transcripts/condition-2.raw.json
libs/@hashintel/brunch-agent/docs/planning/process-model-elicitation/baseline/v0-prompt.md
libs/@hashintel/brunch-agent/docs/reference/architecture/topology.md
libs/@hashintel/brunch-agent/evaluations/AGENTS.md
libs/@hashintel/brunch-agent/evaluations/cases/process-model-elicitation/baseline/opening-message.md
libs/@hashintel/brunch-agent/evaluations/cases/process-model-elicitation/baseline/situation-pack.md
libs/@hashintel/brunch-agent/evaluations/protocols/process-model-elicitation/baseline/protocol.md
libs/@hashintel/brunch-agent/evaluations/protocols/process-model-elicitation/baseline/run.ts
libs/@hashintel/brunch-agent/evaluations/protocols/process-model-elicitation/baseline/v0-prompt.md
libs/@hashintel/brunch-agent/packages/core/package.json
libs/@hashintel/brunch-agent/packages/core/test/architecture/baseline-runner.test.ts
libs/@hashintel/brunch-agent/packages/core/test/architecture/docs-index.test.ts
```
```

## Assistant

The evaluation split now passes review and adds one necessary repository-wide change: the prune action copies `evaluations/` into CI checkouts. No unrelated work is present. I’m committing this second unit before touching Linear.

**Tool Use:** `Task`

```json
{
  "prompt": "COMMIT the verified evaluation split in /Users/lunelson/Code/hashintel/hash. Inspect status first; abort if anything differs from the reviewed manifest or a foreign change appears. Stage exactly the literal paths in current status for this split, including `.github/actions/prune-repository/prune.py`, old baseline deletions/new destinations, AGENTS/index/guidance/topology updates, package.json, turbo.json if currently changed, runner test, and docs-index test. Do not use `git add .`, `git add -A`, wildcard staging, or stage unrelated paths. Verify staged diff recognizes moves where possible, no immutable transcript/raw/model content changed, no docs/planning or docs/history remains, no unstaged split changes remain, and no unrelated staged files exist. Commit with message `Separate evaluation assets from evidence`. Do not push or touch Linear. Return SHA, staged stats, and post-commit status.",
  "description": "Commit evaluation topology"
}
```

## User

**Tool Result:** `TU-034CifxaWzAh8mkiqryjoa`

```
Committed `Separate evaluation assets from evidence`.

- SHA: `daf7778bdc229b4565ef6c7202052e6977f02f5a`
- Stats: 22 files, 168 insertions, 49 deletions
- Immutable transcript/raw/model files: unchanged, recognized as 100% renames
- Pre-commit checks: passed
- Post-commit status: clean
- No push or Linear changes performed.
```

## Assistant

Repository cutover is committed and clean. I’m now repairing the approved Linear pointers against the final tree. The issue bodies will otherwise remain byte-for-byte stable: no title, prose-contract, execution-record, state, hierarchy, assignment, label, or comment changes. Mixed directory pointers will be replaced by the smallest explicit role-specific path list their sentence actually requires.

**Tool Use:** `Task`

```json
{
  "prompt": "EXECUTE the approved Linear path repair for FE project `brunch-agent`, using /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent as source of truth. External writes are explicitly approved, but ONLY issue-description artifact-pointer repairs are authorized. Read docs/agents/issue-writing.md and issue-tracker.md first and load cli-linear/ds-writing-issues if available. Do not modify repo files. Do not change titles, states, hierarchy, assignments, labels, projects, comments, or substantive issue contracts/execution records.\n\nProcess:\n1. Re-query all live descriptions and identify every occurrence of `libs/@hashintel/brunch-agent/docs/planning/`, `docs/history/`, exact `docs/spec.md`, or the old relative Brunch paths found in the prior 16-issue audit.\n2. Save original descriptions outside the repo in a temporary directory for comparison/recovery during this operation. Use file-based description updates, not inline shell strings.\n3. Replace only path/link text and the minimum connective text required when one old mixed directory becomes multiple destinations. Preserve Markdown, issue contract, agent notes, and all non-path wording.\n4. Use these final canonical destinations:\n- docs/planning/_shared/STEERING.md -> docs/control/STEERING.md\n- COORDINATION.md -> docs/control/COORDINATION.md\n- SPEC-LEDGER.md -> docs/control/SPEC-LEDGER.md\n- hash-monorepo-import-plan.md -> docs/archive/migrations/hash-monorepo-import-plan.md\n- docs/spec.md or docs/planning/elicitation-kernel/spec.md -> docs/specs/elicitation-kernel.md\n- plugin-contract-spec.md -> docs/specs/plugin-contract.md\n- ir-design.md -> docs/specs/intermediate-representation.md\n- petrinaut-integration-spec.md -> docs/specs/petrinaut-integration.md\n- topology.md -> docs/reference/architecture/topology.md\n- capture-store-plain.md -> docs/reference/architecture/capture-store.md\n- research/** -> docs/reference/research/** using actual final filenames/tree\n- deep-read and Flue audit records -> docs/evidence/proofs/audits/**\n- completed review/remediation/refactor records -> docs/archive/engineering/legibility/**\n- recommendation-demo-vehicle -> docs/archive/decisions/superseded/recommendation-demo-vehicle.md\n- grilling/penciled notes -> docs/archive/planning-inputs/**\n- old elicitation-kernel non-spec history -> docs/archive/elicitation-kernel/**\n- baseline/opening-message.md and situation-pack.md -> evaluations/cases/process-model-elicitation/baseline/**\n- baseline/protocol.md, v0-prompt.md, run.ts -> evaluations/protocols/process-model-elicitation/baseline/**\n- baseline/readout.md and transcripts/** -> docs/evidence/evaluations/process-model-elicitation/baseline/**\nFor old directory pointers spanning mixed roles, inspect the sentence and replace with the smallest explicit list of relevant canonical paths; do not invent a new umbrella directory. If intent is materially ambiguous (rather than mechanically inferable from file names/context), skip that occurrence and report it.\n5. Update each affected issue once. Treat connection failures as unknown outcome: re-read before any retry.\n6. Re-query all 82 project issues after writes. Verify zero remaining live description occurrences of old planning/history/spec paths, and compare each changed issue pre/post to prove only path/link/connective text changed. Report issue keys changed, exact old->new substitutions per issue, skipped ambiguities, remaining old occurrences, and confirmation no other fields/actions changed.\n\nPrior audit found 16 issues/30 occurrences: FE-1464, 1437, 1432, 1431, 1424, 1422, 1420, 1419, 1407, 1404, 1400, 1383, 1382, 1374, 1366, 1357. Re-query rather than assuming this list is unchanged.",
  "description": "Repair Linear artifact pointers"
}
```

## User

**Tool Result:** `TU-034CijpQ3BHuczbWRHejnC`

```
Completed the Linear path repair.

- Updated 17 issues: FE-1357, FE-1366, FE-1374, FE-1382, FE-1383, FE-1397, FE-1400, FE-1404, FE-1407, FE-1419, FE-1420, FE-1422, FE-1424, FE-1431, FE-1432, FE-1437, FE-1464.
- FE-1397 was newly discovered beyond the prior 16-issue audit.
- Re-queried all 82 project issues: zero old planning/history/spec path occurrences remain.
- Post-write descriptions exactly matched prepared file-based updates.
- Titles, states, hierarchy, assignments, labels, projects, and all other queried fields were unchanged.
- No ambiguities were skipped.
- No repository files or comments were changed.

Substitutions followed the requested mappings. FE-1424 and FE-1357 mixed-directory references were replaced with explicit canonical destination lists; all other changes were direct path substitutions. Temporary recovery copies were retained during execution and removed after successful verification.
```

## Assistant

The approved Linear repair updated 17 issues—the original 16 plus FE-1397, discovered by the fresh query—and reports zero obsolete pointers. I’m independently checking every new path resolves in the migrated tree and that the issue edits did not introduce malformed or umbrella-path substitutions.

**Tool Use:** `Task`

```json
{
  "prompt": "READ-ONLY independent verification of the just-completed Linear description path cutover. Work from /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent; do not modify repo or Linear. Query all 82 FE brunch-agent project issue descriptions. Verify: (1) zero remaining live description occurrences of old docs/planning, docs/history, docs/spec.md, docs/planning/elicitation-kernel, old baseline paths; (2) every new Brunch repository path inserted into the 17 changed issues exists in the current committed tree or is an intentional directory that exists; (3) mixed replacements in FE-1424 and FE-1357 are explicit role-specific paths rather than a new umbrella; (4) Markdown link syntax/path connective wording is not malformed; (5) issue activity/updated fields are consistent with description-only edits and no comments/state changes if accessible. Sample or inspect all 17 descriptions, not just grep counts. Return pass/fail, exact issues/paths for any finding, count of current canonical path occurrences, and any limitation of independent verification.",
  "description": "Verify Linear path cutover"
}
```

## User

**Tool Result:** `TU-034Cip0by9WTu0Fx23KNq0`

```
## Verdict: **FAIL — one path finding**

Audited all 82 project descriptions and manually inspected all 17 changed issues.

- **Old paths:** PASS — zero occurrences of `docs/planning`, `docs/history`, `docs/spec.md`, `docs/planning/elicitation-kernel`, or old baseline paths.
- **New paths:** FAIL — FE-1357 references `docs/reference/research/truck-fleet-source-dossier.md`, which is absent from the current committed tree. The description says it exists only on branch `research/truck-fleet-dossier`. All other inserted concrete paths/directories exist.
- **Mixed replacements:** PASS — FE-1424 and FE-1357 use explicit role-specific `archive`, `control`, `evidence`, `reference`, `specs`, and `evaluations` paths; neither introduces a replacement umbrella.
- **Markdown/connective wording:** PASS — no malformed links, unbalanced delimiters, or broken path wording found.
- **Activity:** PASS with limitation — the 17 updates are sequential at `13:15:40–56Z`, attributed to Lu, with no contemporaneous comments, state changes, or title changes. Linear’s latest history records expose `changes: null`, so the API does not explicitly label them description-only edits.

Current canonical path occurrences across all 82 descriptions: **56**:

- `docs/archive/`: 11
- `docs/control/`: 3
- `docs/evidence/`: 6
- `docs/reference/`: 20
- `docs/specs/`: 12
- `evaluations/cases/`: 1
- `evaluations/protocols/`: 3

Repository and Linear were not modified.
```

## Assistant

One verification exception remains: FE-1357 now names the canonical future destination for a truck-fleet dossier that the issue itself says exists only on another branch. I’m checking whether that is a valid branch-qualified pointer or an accidental claim that the file exists here before changing the issue again.

**Tool Use:** `skill`

```json
{
  "name": "dogsled:ds-adjudicate",
  "arguments": "Adjudicate whether FE-1357's path docs/reference/research/truck-fleet-source-dossier.md is a valid branch-qualified future destination or a broken current-tree pointer requiring repair after the approved topology migration."
}
```

## User

**Tool Result:** `TU-034CivO2bdh5ABHZYV3i7U`

```
{
  "content": [
    {
      "text": "<loaded_skill name=\"dogsled:ds-adjudicate\">\n# ds-adjudicate Skill\n\n\n<!-- Claim discrimination adapted from antithesishq/antithesis-skills@b69ee7c (Apache-2.0); procedure specified by https://github.com/lunelson/dogsled/issues/54 -->\n\n# Adjudicate\n\nA claim is untrusted until a run in the **real environment** could have falsified it. The output is a **verdict** backed by a **discriminator**.\n\n`ds-tdd` owns the red-green loop. `ds-diagnosing-bugs` owns a tight loop for a known failure — including after this skill returns CONFIRMED and the job is to fix. This skill owns the gate from claim to verdict.\n\n## Gate\n\nValidate the claim when the work would otherwise state it as behavior or a guarantee, derive a requirement, risk, test, or fix from it, or use it to accept or reject another finding. Leave every other claim **inert**.\n\n**Done when** the claim is inert and you stopped, or it is named as load-bearing and you continue.\n\n## Discriminate\n\nFill the **claim record** as you go:\n\n```markdown\nClaim:\nRelied on by:\nClaimed guarantee or observed behavior:\nCompeting explanation:\nPrimary evidence examined:\nDiscriminating probe:\nDiscriminating observation:\nRemaining uncertainty:\n```\n\n1. **Normalize** to the narrowest falsifiable statement. Separate the claimed guarantee from anything observed.\n2. **Name the reliance** — the decision that changes if the claim is true. None means inert; stop.\n3. **Name a competing explanation before searching.** Prefer an ordinary rival: reporter configuration, environment, stale documentation, misuse, an adjacent failure, or a different mechanism with the same symptom.\n4. **Inspect primary evidence** to locate the probe: the code path, raw logs, configuration, chronology, issue resolution. Summaries locate evidence; they do not replace it.\n5. **Design a discriminating probe** — an observation that would differ under the claim and its competitor. A run that fits both is not a discriminator.\n\n**Done when** the claim record has a falsifiable statement, a named reliance, a competitor written before any probe ran, and a probe that would come out differently under each — or you stopped at inert.\n\n`ds-triage` reproduces reporter claims; it does not invoke this procedure.\n\n## Confirm\n\nRun that probe in the **real environment** — the one where the bug is claimed to occur. Record the command and its output, secrets redacted as `<REDACTED>`. Quote the discriminating observation into the claim record.\n\nA verdict input is a run that could have falsified the claim. A reading of the code is not a verdict input. A constructed environment is **fabricated**. If you cannot run in the real environment, skip Independent review: go to Verdict as **FABRICATED-ENV** when the offered repro was constructed; otherwise leave **unresolved** and stop.\n\nIf the observation is missing or fits both explanations, leave the claim **unresolved** and stop.\n\n**Done when** the probe has been run in the real environment and the observation is quoted, or you left the claim unresolved, or you skipped to Verdict as FABRICATED-ENV.\n\n## Independent review\n\n**Lint-adjacent** claims skip to Verdict. **Shipped-code** or **security** claims take the full gate.\n\nIndependent re-check, split review, and the contrarian pass are the **measurable-hypothesis** tier. This context is the `ds-cold-review` **caller**.\n\n1. **Re-check.** Question: re-derive the repro from the claim text and observe the discriminator.\n2. **Split.** Produce an inspectable artifact (failing test, trace, screenshot). Question A: does the artifact show the claim? Question B: does the producing code generate that artifact?\n3. **Contrarian.** Question: refute the claim.\n\nAn unresolved call from those reviews blocks CONFIRMED.\n\n**Done when** lint-adjacent skipped these, or every dispatched review has returned.\n\n## Verdict\n\nRecord exactly one:\n\n- **CONFIRMED** — the discriminator supports the claim over the competitor, from a real-environment run. Shipped-code and security claims also need the independent-review returns. Pin a regression that goes red on this bug before reporting the finding resolved (`ds-tdd` owns what that test is). For lint-adjacent, an existing lint rule that already catches it is the pin.\n- **UNREPRODUCIBLE** — the real-environment run does not produce the claimed behavior, or the discriminator favors the competitor.\n- **FABRICATED-ENV** — the only run was in an environment the claimant constructed.\n- **DUPLICATE** — an existing pin or confirmed finding is the same discriminator.\n- **WONT-FIX** — discriminated, and we will not act (intended behavior, accepted limitation, out of scope). Distinct from inert.\n\nUnresolved is not a verdict.\n\n**Done when** exactly one verdict is recorded with the claim record, and CONFIRMED includes its pin.\n\n## Failure modes\n\n- **Headline confirmation** — repeating a report's conclusion after reproducing only its symptom.\n- **Non-discriminating execution** — a run that could look the same under every plausible explanation.\n- **Guarantee laundering** — treating documentation or design intent as a fact about the implementation.\n- **Effort promotion** — treating a claim as true because it was investigated at length.\n- **Source deference** — accepting a high-standing source without checking the evidence the claim depends on.\n- **Fabricated-environment proof** — treating a demo from a constructed environment as evidence about the real one.\n\n\nARGUMENTS: Adjudicate whether FE-1357's path docs/reference/research/truck-fleet-source-dossier.md is a valid branch-qualified future destination or a broken current-tree pointer requiring repair after the approved topology migration.\n\nBase directory for this skill: file:///Users/lunelson/.config/amp/plugins/dogsled/skills/ds-adjudicate\nRelative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.\n\n<skill_files>\n<file>/Users/lunelson/.config/amp/plugins/dogsled/skills/ds-adjudicate/agents/openai.yaml</file>\n</skill_files>\n</loaded_skill>",
      "type": "text"
    }
  ]
}
```

## Assistant

**Tool Use:** `Task`

```json
{
  "prompt": "READ-ONLY adjudication in /Users/lunelson/Code/hashintel/hash. Do not modify repo, branches, or Linear. Claim: FE-1357's `docs/reference/research/truck-fleet-source-dossier.md` is a valid branch-qualified future destination rather than a broken current-tree pointer. Reliance: whether to edit FE-1357 again. Competing explanation: the migration update invented a nonexistent path and removed the only usable pointer. Inspect the exact FE-1357 sentence/context and available local/remote git refs for the branch it names (`research/truck-fleet-dossier` or exact stated ref). Without checking out or changing worktree, use git show/ls-tree against that branch/ref to locate the dossier and its current old path; inspect its content/title if needed. Determine whether the new role path is the mechanically correct destination when that branch is reconciled with the topology migration, and whether the issue clearly qualifies it as branch-only/not current-main. Return a ds-adjudicate claim record, evidence commands/observations, and verdict or unresolved. If no ref is available, state that; do not infer.",
  "description": "Adjudicate FE-1357 dossier path"
}
```

## User

**Tool Result:** `TU-034CivaXZXmHHSQ52I98WM`

```
## Claim record

**Claim:** FE-1357’s `docs/reference/research/truck-fleet-source-dossier.md` is a branch-qualified future destination, not a current-tree pointer.  
**Relied on by:** Whether FE-1357 needs another edit.  
**Competing explanation:** Migration invented a nonexistent path and removed the only usable pointer.

**Primary evidence:**
- Current `linear issue view FE-1357` says:
  > “dossier on branch `research/truck-fleet-dossier` (`docs/reference/research/truck-fleet-source-dossier.md`).”
- Archived pre-migration FE-1357 used the same branch qualifier with:
  `docs/planning/process-model-elicitation/research/truck-fleet-source-dossier.md`.
- Commit `3b4a73f4a7` moved research documents from that legacy research directory into `docs/reference/research/`; the documentation protocol assigns stable source material there.
- `git ls-remote`, `git show-ref`, `git cat-file`, and local ref scans found no available `research/truck-fleet-dossier` ref. HEAD also contains no dossier.

**Discriminating probe:** Inspect the named branch with `git ls-tree`/`git show`, confirming its old path and applying the topology migration mechanically.

**Observation:** The required branch/ref is unavailable locally and from `origin`; therefore its tree and dossier content could not be inspected.

**Remaining uncertainty:** Whether the branch actually contains the dossier at the stated old path.

## Result

**Unresolved — no verdict.**

The issue clearly qualifies the path as branch-only, so it is not presented as a current-main pointer. The new path is mechanically consistent with the role-topology migration. However, without the named ref, the dossier’s existence and exact reconciliation cannot be confirmed. Do not edit FE-1357 merely because the path is absent from the current tree; recover the branch/ref before asserting full validity. No repository or Linear changes made.
```

## Assistant

FE-1357 is not actually a broken current-tree claim: its sentence explicitly qualifies the dossier as branch-only. The named branch is no longer available locally or on origin, so existence remains unresolved, but the role path is the correct migration target if that branch is recovered. I’m leaving the issue unchanged and treating this as an external evidence gap, not a topology failure.

Repository and Linear cutovers are complete. I’m running the mandatory Brunch arc-close control pass now to reconcile index, issue graph, steering/coordination authority, and stale-path residue.

**Tool Use:** `skill`

```json
{
  "name": "arc-close",
  "arguments": "Close the approved Brunch documentation topology and steering-protocol work arc. Verify repository migration, Linear pointer cutover, INDEX, role authorities, evaluation lifecycle, STEERING/COORDINATION drift, stale paths, and evidence/legibility deposits. Do not create or edit issues without further approval beyond the already-completed path repairs."
}
```

## User

**Tool Result:** `TU-034Cj1Dhf9ouWFYKqDXC8w`

```
{
  "content": [
    {
      "text": "<loaded_skill name=\"arc-close\">\n# arc-close Skill\n\n\nRead `docs/agents/arc-close.md` from the Brunch context root and execute its five steps in order.\nThis wrapper carries no duplicate procedure. Report the required checks and whether each\nconditional control surface changed; never persist a no-op evaluation.\n\n\nARGUMENTS: Close the approved Brunch documentation topology and steering-protocol work arc. Verify repository migration, Linear pointer cutover, INDEX, role authorities, evaluation lifecycle, STEERING/COORDINATION drift, stale paths, and evidence/legibility deposits. Do not create or edit issues without further approval beyond the already-completed path repairs.\n\nBase directory for this skill: file:///Users/lunelson/Code/hashintel/hash/libs/%40hashintel/brunch-agent/.agents/skills/arc-close\nRelative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.\n</loaded_skill>",
      "type": "text"
    }
  ]
}
```

## Assistant

**Tool Use:** `Task`

```json
{
  "prompt": "EXECUTE the canonical Brunch arc-close procedure after reading /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/agents/arc-close.md. Work from that context root. Current repo worktree should be clean after commits 397405a276, 3b4a73f4a7, daf7778bdc. Linear description path repairs are complete and approved; do not perform any further external writes/comments/state/hierarchy changes. Use read-only Linear queries/linear:graph where required. Follow every step in order and report conditional no-op vs changed.\n\nScope of this arc: steering protocol + role-based docs topology + evaluation asset/evidence split + Linear path repair. Verify docs inbox/INDEX, fresh Linear registry/graph, control/spec ledger/coordination/steering drift, stale tense/paths, proof/witness/oracle disposition, external gates, and repository status. FE-1357's branch-qualified truck-fleet dossier remains unresolved because the named branch/ref is unavailable; the issue explicitly calls it branch-only, so treat it as an external evidence gap, not an existing-tree path failure.\n\nIf the canonical close procedure requires repository edits because this arc changed durable truth, make the smallest correct edits, read before patching, do not touch unrelated content, and run applicable checks. Do not stage or commit—return edits for parent review. If no edit is warranted, persist nothing. Return each close step's evidence/result, any changed files, remaining blockers, and recommended final status.",
  "description": "Run Brunch arc-close"
}
```

## User

**Tool Result:** `TU-034Cj1OkGORaj5Una48yGB`

```
Executed canonical arc-close in order.

1. **Inbox/index — no-op**
   - Seven SDCPN inbox files remain intentionally unsettled and are covered by `docs/INDEX.md`.
   - Authoritative `docs-index` tests passed.

2. **Linear registry/references — no external writes**
   - Fresh graph: 35 open issues, 16 hard edges, no cycles.
   - All 13 parentless issues are recognized roots or documented exceptional roots.
   - Open issue descriptions showed no obsolete role-topology paths.
   - FE-1357’s truck-fleet dossier branch/ref is unavailable; treated as an external evidence gap, not a tree failure.

3. **Spec ledger — no-op**
   - Arc changed documentation/control topology, not milestone-one obligation evidence.

4. **Coordination — changed**
   - Updated stale FE-1437 landing tense while retaining the `main` state gate.

5. **Steering/proof — changed**
   - Added explicit external-gate records for Dora’s use-case confirmation and the unavailable truck-fleet dossier.
   - Proof/witness/oracle disposition otherwise unchanged; no new proof was produced.

6. **Tense/status — changed as above**
   - Remaining historical/provisional language is appropriate to archived evidence or current uncertainty.

**Files changed**
- `docs/control/COORDINATION.md`
- `docs/control/STEERING.md`

**Verification**
- ESLint: passed
- TypeScript: passed
- Unit tests: 115 passed
- Build: passed
- `git diff --check`: passed
- Final worktree contains only the two unstaged edits above.

**Remaining blockers**
- Truck-fleet dossier branch/ref unavailable.
- Dora’s business-use-case confirmation remains an external gate.
- Existing verification gaps remain: FE-1396, FE-1386, FE-1394.

**Recommended status:** arc-close complete with two control-surface edits ready for parent review; do not close the external evidence gap as resolved.
```

## Assistant

Arc-close found two durable updates rather than a no-op: FE-1437’s tense had drifted, and the active external gates were not represented in the steering surface. I’m reviewing those two compact control edits for factual accuracy and churn before committing them.

**Tool Use:** `Task`

```json
{
  "prompt": "READ-ONLY review of the current diff in docs/control/COORDINATION.md and docs/control/STEERING.md under /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent. Do not modify/stage/commit. Check against fresh facts: commits 397405a276, 3b4a73f4a7, daf7778bdc exist locally; FE-1437 live state is Ready for review and import authority threshold crossed but `main` gate remains; Dora business-use-case decision is not supplied in this thread; FE-1357 dossier points to unavailable branch `research/truck-fleet-dossier`. Ensure edits are compact, current-state not history accumulation, use precise owner/source/watch trigger/last-checked/consequence fields for external gates, do not claim unknown facts, and preserve strategic vs coordination authority. Return pass/fail and smallest fixes with lines.",
  "description": "Review arc-close control edits"
}
```

## User

**Tool Result:** `TU-034Cj7IUHWzXPI7InpTsuq`

```
## Result: Fail

1. **`COORDINATION.md:18–19`** — FE-1437 wording is imprecise. It should state: authority threshold crossed; issue is **Ready for review**; work remains gated until the branch reaches `main`. “Completed the authority cutover” overstates completion.

2. **`STEERING.md:49`** — gate ownership/source is ambiguous. `FE-1382` is presented as owner without identifying an accountable person, while FE-1357 is the confirmed dossier source. Separate or clarify owner and source; do not assert ownership if unknown.

Everything else passes: Dora’s decision remains explicitly unknown, the unavailable dossier branch is correctly treated as an evidence gap, the controls remain compact, and strategic versus coordination authority is preserved. All three supplied commits exist locally; the dossier branch does not.
```

## Assistant

**Tool Use:** `Task`

```json
{
  "prompt": "EDIT only docs/control/COORDINATION.md and docs/control/STEERING.md in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent after reading current diff.\n1. COORDINATION FE-1437 line: state precisely that the authority threshold crossed, FE-1437 is Ready for review, and the work remains gated until the branch reaches main. Avoid saying the cutover is completed.\n2. STEERING truck-fleet dossier external gate: do not use FE-1382 as a person/owner. Record owner as unresolved/unknown; source as FE-1357 plus historical build ticket FE-1382 (if that matches current text/evidence); retain named unavailable branch, watch trigger, last-checked date, and consequence. Keep one compact line/row consistent with the table.\nDo not modify other content, stage, commit, or touch Linear. Run docs-index tests and git diff --check. Return exact wording and results.",
  "description": "Fix arc-close controls"
}
```

## User

**Tool Result:** `TU-034Cj8rnuYK375vLJxYiVP`

```
Updated only the requested files; nothing staged or committed.

- **COORDINATION.md:** “FE-1437 crossed the authority threshold in this branch and is Ready for review; the work remains gated until the branch reaches `main`.”
- **STEERING.md:** “Owner unresolved/unknown; source: FE-1357 plus historical build ticket FE-1382; FE-1357 names branch `research/truck-fleet-dossier` and `docs/reference/research/truck-fleet-source-dossier.md`”

Verification:
- Docs-index: **7/7 passed**
- `git diff --check`: **passed**
```

## Assistant

**Tool Use:** `Task`

```json
{
  "prompt": "READ-ONLY final review of current docs/control/COORDINATION.md and STEERING.md diff in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent. Verify both prior findings resolved, external gate rows remain compact/checkable, and no unsupported assertion or authority overlap remains. Do not modify. Return pass/fail, exact changed paths, and whether prior full verification plus focused docs tests are sufficient for this docs-only close unit.",
  "description": "Recheck arc-close controls"
}
```

## User

**Tool Result:** `TU-034CjB58VSNdhOccpquhOG`

```
**PASS — no findings.**

Changed paths:
- `docs/control/COORDINATION.md`
- `docs/control/STEERING.md`

Both prior findings are resolved:
- FE-1437 now distinguishes branch authority from the `main` landing gate.
- External gates are compact, checkable, and include all required fields.

No unsupported assertions or authority overlap found. Branch/PR and missing-dossier claims were independently confirmed.

Prior full verification plus focused docs tests are sufficient for this docs-only close unit. `git diff --check` passes. No files modified.
```

## Assistant

**Tool Use:** `Task`

```json
{
  "prompt": "COMMIT the verified arc-close reconciliation in /Users/lunelson/Code/hashintel/hash. Inspect status; stage exactly these two literal paths and no others:\n- libs/@hashintel/brunch-agent/docs/control/COORDINATION.md\n- libs/@hashintel/brunch-agent/docs/control/STEERING.md\nVerify staged set and no unstaged/foreign changes. Commit message: `Reconcile Brunch control surfaces`. Do not amend, push, or touch Linear. Return SHA and post-commit status.",
  "description": "Commit arc-close reconciliation"
}
```

## User

**Tool Result:** `TU-034CjDykjOAv2LcMOSbYWk`

```
Committed `Reconcile Brunch control surfaces`.

SHA: `28f3e3bfa820265a9e6ac25e7f684cb7d2952cf3`

Post-commit status: clean. No unstaged or foreign changes.
```

## Assistant

The close reconciliation is committed. I’m doing one final read-only ledger check—clean worktree, expected four commits, zero stale Linear paths—then I’ll hand back the locked protocol, migrated topology, and remaining strategic gates.

**Tool Use:** `Task`

```json
{
  "prompt": "READ-ONLY final state check in /Users/lunelson/Code/hashintel/hash. Do not modify anything. Verify: git worktree clean; latest relevant commits 397405a276, 3b4a73f4a7, daf7778bdc, 28f3e3bfa8 present in order; no docs/planning or docs/history directories under Brunch; canonical docs/control/specs/evidence/reference/archive and evaluations cases/protocols exist; no evaluations/oracles; 82 live Linear project issue descriptions contain zero obsolete Brunch planning/history/spec paths; FE-1357 branch-only unresolved pointer remains explicitly qualified. Return concise pass/fail and any discrepancy.",
  "description": "Verify final migration state"
}
```

## User

**Tool Result:** `TU-034CjF1yt1gueWZT2KR2nX`

```
**PASS — no discrepancies.**

- Git worktree clean.
- Commits present in required ancestry order: `397405a276` → `3b4a73f4a7` → `daf7778bdc` → `28f3e3bfa8`.
- Brunch has no `docs/planning`, `docs/history`, or `evaluations/oracles`.
- Required canonical docs and evaluation directories exist.
- All 82 Linear project issue descriptions contain zero obsolete planning/history/spec paths.
- FE-1357’s unresolved branch-only dossier pointer is explicitly qualified; branch/ref and file remain absent.
```

## Assistant

Completed and locked:

- Role-based docs topology and evaluation split.
- Canonical [steering protocol](file:///Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/agents/steering.md).
- 17 Linear descriptions repaired; all 82 verified free of stale paths.
- 115 tests, lint, typecheck, build, and link checks pass.
- Worktree clean; four local commits created, not pushed.

Remaining external gates: Dora’s use-case decision and the unavailable FE-1357 dossier branch.

## User

Use-case decision will still be outstanding for a while; all Linear issues scoped to `brunch-agent` project are now assigned to me and new issues should also be so; but now didn't we say wanted to reduce the prose content of @docs/control/STEERING.md  as much as possible? -- and OTOH if we do that, where does our agreed-upon strategy live? Do we need something like a decision log perhaps, which is not ADR decisions but strategic ones? (this could be append-only, to avoid churn). And finally: while I like the new topology, it doesn't really feel like we need both @docs/control/COORDINATION.md  and @docs/control/STEERING.md , and I worry about how we keep the lifecycle of this setup disciplined and not drifting...

FWIW I had a fresh agent "orient" itself in the migrated file structure and this is what it wrote; you can validate this against what you'd expect an agent to read:

---

This directory is the **Brunch context root**: domain language, decisions, agent operating protocols, and the four child packages live here. It is not a Yarn/Turbo root. HASH’s repository root still owns lockfile, workspace discovery, and CI. HASH guidance wins on conflict.

The distinctive fact is not the package layout. It is that this context treats **authority, proof, and close-out as executable protocol**, not as documentation hygiene.

---

### What Brunch is

Brunch is a **stateful elicitation harness**: an agent interviews a person about a target domain, extracts structured evidence, folds that evidence into a model, and projects the model (today: Gherkin; September: a CPS requirements model → SDCPN in Petrinaut).

The glossary in `CONTEXT.md` is load-bearing. Shells are **substrate / UI / harness / plugin / binding**. Durable truth lives on a **target-document** (capture store + session logs), not on a rendered artifact. Sessions go quiet rather than close. Vocabulary avoidances are real: do not say “kernel,” “host,” “adapter,” or “spec” for the workpiece.

Four packages here, one application elsewhere:

- `packages/core` — harness (`@hashintel/brunch-agent`)
- `packages/binding-flue` — Flue substrate adapter
- `packages/transport-aisdk` — wire transport; must not depend on a binding
- `packages/plugin-gherkin` — first target plugin
- `apps/brunch-agent` — remote server and diagnostics
- `apps/petrinaut-website` — the only compile-time meeting point with Petrinaut

Reusable Brunch and Petrinaut libraries stay mutually unaware (ADR-0004).

---

### Authority: one truth, one home

The central convention. Every durable fact has exactly one owner. Link; do not copy.

| Truth | Authority |
| --- | --- |
| Current objective, cuts, beliefs, gates | `docs/control/STEERING.md` |
| Soft sequencing, seams, exceptional roots | `docs/control/COORDINATION.md` |
| Issue state, parentage, hard blockers | Linear (`FE` / project `brunch-agent`) |
| Required behavior | `docs/specs/` |
| Accepted decisions | `docs/adr/` |
| Observed proof | `docs/evidence/proofs/` |
| Evaluation runs | `docs/evidence/evaluations/` |
| Stable explanation | `docs/reference/` |
| Settled history | `docs/archive/` |
| Untriaged intake | `docs/inbox/` |
| Executable cases / protocols / oracles | `evaluations/` |
| Milestone-one spec discharge | `docs/control/SPEC-LEDGER.md` |

`docs/INDEX.md` is the registry. Effort is metadata, not a folder. Retired trees (`docs/planning/`, `docs/history/`, `.scratch/`) must not come back. Git is the history of control surfaces; the files themselves stay current-only.

Linear writes need **explicit approval** per operation. Reading is free. Approval for one mutation is not approval for adjacent ones.

---

### The operating loop

Work is not “pick the next unblocked ticket.” The claimable queue is an availability filter. Strategy lives in `STEERING`.

**Steering** runs on start/resume without a proof target, or when objective, proof result, authority conflict, external gate, frontier value, or arc-close drift changes. Ordinary ticket movement does not trigger it.

The pass is: **orient → choose → execute → reconcile → replan**.

- Classify inputs as **fact**, **belief** (with confidence and evidence), **unknown** (with cheapest probe), or **external gate** (owner, source, last-checked, consequences).
- Choose **one proof frontier**, or a named pair. Record claim, proof bundle, cut, issue projection, stop/replan trigger.
- Execute on **real production entrypoints**. A fixture may supply domain inputs; it must not supply missing product wiring.
- Deposit each changed truth in exactly one authority.

The evidence lifecycle is itself a convention:

```text
corpus/case → reviewed fixture → production-path run → immutable snapshot
            → validated claim → executable oracle
```

Hidden answer keys and oracles stay behind an **information wall**. They never become interviewee or elicitor inputs. UX, live-runtime, and demo-comprehension claims need a **human witness** unless the claim records why not.

---

### Protocols as ceremonies

`AGENTS.md` / `CLAUDE.md` route by trigger. Load only the matching compact protocol.

| Trigger | Protocol | What it actually is |
| --- | --- | --- |
| Start, resume, pressure/proof/authority change | `steering.md` | Choose a falsifiable frontier |
| Create/mutate/structure issues | `issue-tracker.md`, `issue-writing.md`, `triage-labels.md` | Linear mechanics + house style |
| Add/move/settle documents | `documentation.md` | Intake → promote → index |
| Change terms or decisions | `domain.md` | Glossary + ADR conflict surfacing |
| Flue design choice | `flue-routing.md` | Symptom → Flue affordance, before writing a new layer |
| Significant agent-authored artifact | `legibility.md` | Re-render into another register; strain is the review |
| Architecture-sensitive move | `posture.md` | Epistemic defaults |
| Branches, stacks, PRs | `git-workflow.md` | Graphite, one issue per branch |
| Close a work arc | `arc-close` skill + `arc-close.md` | Mandatory landing control pass |

**Issue writing** splits two audiences: a human-owned **contract** (plain technical prose: current state → consequence → intended change) above, and agent-maintained **`🏗️ Agent notes`** below. Titles start with an active verb. Do not rewrite a teammate-authored issue’s structure. In Linear bodies, issue references are full URLs; in the repo, they are bare IDs with a gloss.

**Git**: Graphite (`gt`) for stack operations; plain git for commit/status/diff. Never `gh stack`. Branch `ln/fe-xxxx-keywords`. PR title `FE-XXXX: Linear title in sentence case`. Description is deposited at authoring time; an empty PR body on a heavy branch is a defect. HASH commit style applies: sentence case, imperative, no `feat:` prefixes.

**Wayfinding**: a Linear map issue with typed children. Claim = assign yourself. Resolve = comment + Done + gist on the map. Product stubs are related, never duplicated, never closed by the map. Every project issue must be reachable from a recognized root (currently FE-1383 build, FE-1357 demo) or named under COORDINATION’s exceptional roots.

**Arc close** is the required ceremony before landing a branch that closes an arc. Sequence: settle inbox + index → Linear orphan audit (`turbo run linear:graph --filter '@hashintel/brunch-agent'`) → spec ledger if affected → coordination if the graph or seams changed → steering only if a trigger fired → repair stale tense. Do not append no-op dated evaluations. Git is the history.

**Legibility**: no claim without a way for it to fail. Re-render the central artifact into another register (plain prose, STE, or worked examples) and treat **strain** as the review yield. Capture channels must name their consolidation target. A handoff note is a deferral, not a deposit.

**Posture** (the interesting override): `prototype`, but **stakes: high** and **horizon: current-milestone**. That combination means: prove and rewrite freely, but persisted capture data and merge gates **fail loudly**. Do not abstract until two real callers. Do not shim across a rewrite unless the boundary cannot be updated atomically.

---

### Architecture conventions that constrain code

**Three lanes** (ADR-0002, `flue-routing.md`):

1. Shell-facing (UI, evals, deploy) — consume Flue directly; never wrap.
2. Agent-loop (tools, state, suspension) — translate in the binding against a named capability list.
3. Elicitation semantics + capture store — ours outright.

Placement rules N1–N6 are gates, not taste: ask/sweep mechanism in core; plugin content exported from plugin packages and registered by hosts; applications are the only composition boundary; storage-port implementations live in the binding; experiment runners do not live in `packages/`.

**Three-register IR** (ADR-0003):

1. Typed **captures** (every semantic judgment at write time, contestable)
2. **Model** — a pure fold over active captures; never stored; never interprets
3. **Projections** (net, loss report) — consume the model, not the transcript

Hiding LLM inference inside a read-time projection is not an available shortcut. FE-1480 currently challenges this; the honest responses are record the judgment as a capture, or amend the ADR.

Executable gates to preserve: package-direction, Flue entrypoint, bundle, hermetic runtime. The walking skeleton is a retained CI pin, not disposable scaffolding.

---

### Current strategic reading (as of 2026-08-24)

The September outcome is a **review-and-revise** demo, not a cold-start interview: a reviewer opens a prebuilt CPS model/net, asks why an element is there, traces it to an utterance, makes a scoped correction in 3–5 turns, sees the live net change, hands off to optimisation.

Most of the contract-bearing middle is still absent. Ask/suspend/sweep/store are real. Fold, demand, model, projection, controller, CPS plugin, existing-target session binding, and machine client-tool round-trip are not.

The bet: build the smallest honest vertical loop through all three registers and the real Petrinaut entrypoint; let CPS discover the minimum plugin interface; generalize only what CPS and Gherkin both need.

Four frontiers, ordered by learning dependency. **Frontier 0** (make the demo claim decidable, including the FE-1480 authority question) is the named next move; then Frontiers 1 and 2 in parallel; join at targeted correction; then deploy. Generic Gherkin completion and a second-target contract freeze no longer gate September.

Cuts are sequencing, not dismissal: no frozen generic SDK, no full CPS ontology, no cold-start interview, no requirements-graph UI before the loop is green, no fake net mutation.

External gates still open: Dora has not confirmed the use case; Linear has not been mutated to match the recommended FE-1476 hierarchy; FE-1331 (create-new-net) is an exposed conflict with ADR-0004 that this steering document does not silently re-defer.

---

### How I will behave here

I will load the matching protocol by trigger rather than carrying all of them. I will use glossary terms and surface ADR conflicts instead of overriding them. I will not treat “unblocked” as “next,” will not write Linear without approval, will not invent product wiring in a fixture, and will not close an arc without the arc-close pass. Proofs need a production path and a second-register snapshot.

If you want a live steering pass next — classifying current facts vs beliefs and confirming whether Frontier 0 is still the right claim — say so and I will run that loop against Linear and the inbox rather than restating the documents.

## Assistant

Yes—the concern is real. The migration clarified *where* things live, but it may have preserved too many mutable control authorities. A compact current-state control plus an append-only strategic decision record is a plausible correction; I want to test it against the actual overlap and the fresh agent’s read behavior before recommending the exact cut. I’ll also fold in the new policy that every Brunch project issue defaults to you as assignee.

**Tool Use:** `skill`

```json
{
  "name": "dogsled:ds-codebase-design",
  "arguments": "Evaluate whether Brunch's mutable STEERING and COORDINATION control surfaces should merge, with strategic decisions moved to an append-only record, while preserving a deep/simple authority model and disciplined lifecycle."
}
```

## User

**Tool Result:** `TU-034CjQzANJ6KpLMAQAiF36`

```
{
  "content": [
    {
      "text": "<loaded_skill name=\"dogsled:ds-codebase-design\">\n# ds-codebase-design Skill\n\n\n<!-- Vendored from mattpocock/skills@84fdeff: skills/engineering/codebase-design -->\n\n# Codebase Design\n\nDesign **deep modules**: a lot of behaviour behind a small interface, placed at a clean seam, testable through that interface. Use this language and these principles wherever code is being designed or restructured. The aim is leverage for callers, locality for maintainers, and testability for everyone.\n\n## Glossary\n\nUse these terms exactly — don't substitute \"component,\" \"service,\" \"API,\" or \"boundary.\" Consistent language is the whole point.\n\n**Module** — anything with an interface and an implementation. Deliberately scale-agnostic: a function, class, package, or tier-spanning slice. _Avoid_: unit, component, service.\n\n**Interface** — everything a caller must know to use the module correctly: the type signature, but also invariants, ordering constraints, error modes, required configuration, and performance characteristics. _Avoid_: API, signature (too narrow — they refer only to the type-level surface).\n\n**Implementation** — what's inside a module, its body of code. Distinct from **Adapter**: a thing can be a small adapter with a large implementation (a Postgres repo) or a large adapter with a small implementation (an in-memory fake). Reach for \"adapter\" when the seam is the topic; \"implementation\" otherwise.\n\n**Depth** — leverage at the interface: the amount of behaviour a caller (or test) can exercise per unit of interface they have to learn. A module is **deep** when a large amount of behaviour sits behind a small interface, **shallow** when the interface is nearly as complex as the implementation.\n\n**Seam** _(Michael Feathers)_ — a place where you can alter behaviour without editing in that place; the *location* at which a module's interface lives. Where to put the seam is its own design decision, distinct from what goes behind it. _Avoid_: boundary (overloaded with DDD's bounded context).\n\n**Adapter** — a concrete thing that satisfies an interface at a seam. Describes *role* (what slot it fills), not substance (what's inside).\n\n**Leverage** — what callers get from depth: more capability per unit of interface they learn. One implementation pays back across N call sites and M tests.\n\n**Locality** — what maintainers get from depth: change, bugs, knowledge, and verification concentrate in one place rather than spreading across callers. Fix once, fixed everywhere.\n\n## Deep vs shallow\n\n**Deep module** = small interface + lots of implementation:\n\n```\n┌─────────────────────┐\n│   Small Interface   │  ← Few methods, simple params\n├─────────────────────┤\n│                     │\n│  Deep Implementation│  ← Complex logic hidden\n│                     │\n└─────────────────────┘\n```\n\n**Shallow module** = large interface + little implementation (avoid):\n\n```\n┌─────────────────────────────────┐\n│       Large Interface           │  ← Many methods, complex params\n├─────────────────────────────────┤\n│  Thin Implementation            │  ← Just passes through\n└─────────────────────────────────┘\n```\n\nWhen designing an interface, ask:\n\n- Can I reduce the number of methods?\n- Can I simplify the parameters?\n- Can I hide more complexity inside?\n\n## Principles\n\n- **Depth is a property of the interface, not the implementation.** A deep module can be internally composed of small, mockable, swappable parts — they just aren't part of the interface. A module can have **internal seams** (private to its implementation, used by its own tests) as well as the **external seam** at its interface.\n- **The deletion test.** Imagine deleting the module. If complexity vanishes, it was a pass-through. If complexity reappears across N callers, it was earning its keep.\n- **The interface is the test surface.** Callers and tests cross the same seam. If you want to test *past* the interface, the module is probably the wrong shape.\n- **One adapter means a hypothetical seam. Two adapters means a real one.** Don't introduce a seam unless something actually varies across it.\n\n## Designing for testability\n\nGood interfaces make testing natural:\n\n1. **Accept dependencies, don't create them.**\n\n   ```typescript\n   // Testable\n   function processOrder(order, paymentGateway) {}\n\n   // Hard to test\n   function processOrder(order) {\n     const gateway = new StripeGateway();\n   }\n   ```\n\n2. **Return results, don't produce side effects.**\n\n   ```typescript\n   // Testable\n   function calculateDiscount(cart): Discount {}\n\n   // Hard to test\n   function applyDiscount(cart): void {\n     cart.total -= discount;\n   }\n   ```\n\n3. **Small surface area.** Fewer methods = fewer tests needed. Fewer params = simpler test setup.\n\n## Relationships\n\n- A **Module** has exactly one **Interface** (the surface it presents to callers and tests).\n- **Depth** is a property of a **Module**, measured against its **Interface**.\n- A **Seam** is where a **Module**'s **Interface** lives.\n- An **Adapter** sits at a **Seam** and satisfies the **Interface**.\n- **Depth** produces **Leverage** for callers and **Locality** for maintainers.\n\n## Rejected framings\n\n- **Depth as ratio of implementation-lines to interface-lines** (Ousterhout): rewards padding the implementation. We use depth-as-leverage instead.\n- **\"Interface\" as the TypeScript `interface` keyword or a class's public methods**: too narrow — interface here includes every fact a caller must know.\n- **\"Boundary\"**: overloaded with DDD's bounded context. Say **seam** or **interface**.\n\n## Going deeper\n\n- **Deepening a cluster given its dependencies** — see [DEEPENING.md](DEEPENING.md): dependency categories, seam discipline, and replace-don't-layer testing.\n- **Exploring alternative interfaces** — see [DESIGN-IT-TWICE.md](DESIGN-IT-TWICE.md): several radically different interface sketches, then compare on depth, locality, and seam placement.\n- **Whether the module or seam should exist at all** — use /ds-subtraction.\n\n\nARGUMENTS: Evaluate whether Brunch's mutable STEERING and COORDINATION control surfaces should merge, with strategic decisions moved to an append-only record, while preserving a deep/simple authority model and disciplined lifecycle.\n\nBase directory for this skill: file:///Users/lunelson/.config/amp/plugins/dogsled/skills/ds-codebase-design\nRelative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.\n\n<skill_files>\n<file>/Users/lunelson/.config/amp/plugins/dogsled/skills/ds-codebase-design/DEEPENING.md</file>\n<file>/Users/lunelson/.config/amp/plugins/dogsled/skills/ds-codebase-design/DESIGN-IT-TWICE.md</file>\n<file>/Users/lunelson/.config/amp/plugins/dogsled/skills/ds-codebase-design/agents/openai.yaml</file>\n</skill_files>\n</loaded_skill>",
      "type": "text"
    }
  ]
}
```

## Assistant

**Tool Use:** `Task`

```json
{
  "prompt": "READ-ONLY design audit in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent. Do not modify anything. Analyze docs/control/STEERING.md, COORDINATION.md, SPEC-LEDGER.md, docs/agents/steering.md, issue-tracker.md, arc-close.md, documentation.md, docs/INDEX.md, and relevant git history since STEERING was introduced. Quantify current size/prose, headings, duplicated facts/issue mappings/sequencing/gates, update cadence/churn, and authority ambiguity between STEERING and COORDINATION. Test this proposed shape: one compact mutable current-state control surface plus an append-only strategic decision log distinct from ADRs. Compare at least: A) keep both and tighten, B) merge STEERING+COORDINATION, C) replace both with compact STATUS/CONTROL plus strategic decision log. Recommend the smallest deep interface, exact responsibilities, lifecycle rules, and what current sections move/delete/condense. Address whether SPEC-LEDGER remains separate. Return exact file/line evidence and a concrete compact document sketch; no implementation.",
  "description": "Analyze control-surface overlap"
}
```

**Tool Use:** `Task`

```json
{
  "prompt": "READ-ONLY orientation audit in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent. Do not modify anything. A fresh agent reported: Brunch is a stateful elicitation harness; glossary and package roles; one-truth-one-home table; steering loop/evidence lifecycle; all protocol ceremonies; issue-writing/git/wayfinding/arc-close/legibility/posture details; three-lane architecture and three-register IR; and a detailed current strategic reading (September review-and-revise, missing middle, current bet, four frontiers, cuts, open gates). Determine what an agent following current AGENTS.md pointers should normally read for a generic 'orient in this context root' request, and trace each category of the report to source files. Identify: (1) accurate and expected synthesis, (2) material inaccuracies/stale claims, especially cold-start scope and current Linear/assignment state, (3) content it likely over-read because trigger-specific protocols should stay unloaded, (4) important content it missed, (5) whether current guidance reliably produces a compact useful orientation or encourages reading the entire control apparatus. Return file/line evidence and a recommended default orientation read set versus conditional pointers.",
  "description": "Validate fresh-agent orientation"
}
```

**Tool Use:** `Task`

```json
{
  "prompt": "READ-ONLY control-lifecycle audit in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent. Do not modify repo or Linear. Read AGENTS.md, docs/agents/{steering,arc-close,documentation,issue-tracker,issue-writing}.md, docs/control files, docs-index/architecture tests, and current Linear project settings/issues. Verify the user's new fact: all current `brunch-agent` project issues are assigned to the current user, and inspect whether Linear offers a project/team default assignee mechanism available here. Determine the smallest durable rule ensuring every newly created project issue is assigned to the current user, while respecting issue authoring patterns and external-write approval. Then identify lifecycle drift risks if mutable control becomes one file plus append-only strategic decision log: trigger ownership, append criteria, supersession links, compaction, VCS conflict behavior, arc-close checks, index/test gates, and how no-op updates are prevented. Recommend exact guidance/test changes, but do not implement. Include query evidence and any Linear limitation.",
  "description": "Audit lifecycle and assignment policy"
}
```

## User

**Tool Result:** `TU-034CjRQDoNDE4tFerNeTHa`

```
# Read-only design audit

No files were modified.

## Finding

The documented authority split is clear in theory but not preserved in practice.

- `STEERING` owns objectives, choices, cuts, beliefs, and gates (`docs/agents/steering.md:76-84`).
- `COORDINATION` owns issue projection and soft edges (`docs/agents/steering.md:80-82`).
- Linear owns issue state, hierarchy, and hard blockers (`docs/control/STEERING.md:8-13`; `docs/control/COORDINATION.md:5-8`).

Yet both mutable documents now restate the same strategic sequencing, issue mappings, gates, and unresolved decisions. The interface requires readers and writers to decide repeatedly which of two files owns a changed fact.

**Recommendation: option C — replace both with one compact mutable `CONTROL.md` plus an append-only strategic decision log.**

This is the smallest deep interface: one place answers “what now?”, while the log answers “why did strategy change?” ADRs continue answering “what architecture or durable operating rule was accepted?”

---

## Quantitative inventory

| Document | Lines | Words | Headings | Issue mentions / unique |
| --- | ---: | ---: | ---: | ---: |
| `STEERING.md` | 303 | 3,505 | 15 | 48 / 22 |
| `COORDINATION.md` | 147 | 1,114 | 5 | 97 / 32 |
| Combined current-strategy surface | **450** | **4,619** | **20** | **145 mentions** |
| `SPEC-LEDGER.md` | 126 | 2,498 | 10 | 83 / 25 |
| `agents/steering.md` | 103 | 627 | 7 | 0 |
| `agents/issue-tracker.md` | 135 | 1,192 | 9 | 9 |
| `agents/arc-close.md` | 92 | 662 | 9 | 0 |
| `agents/documentation.md` | 87 | 688 | 6 | 0 |
| `INDEX.md` | 122 | 2,225 | 10 | 86 / 36 |

`STEERING` and `COORDINATION` share **20 issue IDs**—20 of STEERING’s 22 unique issues. The overlap includes the whole active September spine: FE-1476–1482, FE-1438/1439/1440/1441, FE-1480, FE-1387, and the FE-1402/1403/1406/1431 inputs.

### Churn and cadence

- `STEERING`: introduced and revised in **3 commits on 2026-08-24**, 305 changed lines.
- `COORDINATION`: **10 commits across Aug 20–24**, 343 changed lines; four revisions on Aug 21 and three on Aug 24.
- The STEERING-introduction commit added 296 lines while simultaneously rewriting COORDINATION by **61 additions/37 deletions**.
- `SPEC-LEDGER`: 3 commits, 154 changed lines, concentrated around implementation evidence.

The immediate synchronized rewrite is evidence that STEERING did not merely add a distinct strategic layer: it forced the existing current-state layer to restate the new strategy.

---

## Duplication and authority ambiguity

### Sequencing is represented at least four times

1. Four proof frontiers in `STEERING.md:167-227`.
2. Narrative “current choice” in `STEERING.md:292-303`.
3. Narrative sequencing recommendation in `COORDINATION.md:15-33`.
4. Issue-node/edge map in `COORDINATION.md:35-68`.

Examples repeated across both files:

- Parallel semantic and experience lanes joining at targeted correction:
  - `STEERING.md:169-171,294-298`
  - `COORDINATION.md:20-27,45-67`
- Generic Gherkin and contract freeze no longer gate September:
  - `STEERING.md:233-241,265-275,297-298`
  - `COORDINATION.md:29-33`
- YAML/Markdown before broad UI:
  - `STEERING.md:236-237,260`
  - `COORDINATION.md:31-33,52`
- FE-1480’s pure-projection authority conflict:
  - `STEERING.md:114-119,175-187,259,286`
  - `COORDINATION.md:21-22,46,62,99-102`
- Existing-target session identity:
  - `STEERING.md:80,204-217,258`
  - `COORDINATION.md:23-25,49,106-108`

### Issue mapping crosses the declared seam

`STEERING` says COORDINATION projects strategy onto work (`STEERING.md:8-13`), but STEERING itself contains an extensive **Issue projection** section (`STEERING.md:246-278`). COORDINATION then repeats those roles and dependencies in its recommendation and graph (`COORDINATION.md:15-68`).

### COORDINATION mirrors tracker state despite forbidding it

It says “Do not … mirror issue status” (`COORDINATION.md:10-13`) but records that FE-1437 is “Ready for review” and waits to reach `main` (`COORDINATION.md:17-20`), then repeats its executed/landing state in the graph (`COORDINATION.md:43,58-61`) and handoff history (`COORDINATION.md:73-95`).

### Gates and seams are split by interpretation, not stable ownership

Strategic gates live in STEERING (`STEERING.md:44-63`), while issue/state gates and unresolved seams live in COORDINATION (`COORDINATION.md:35-68,97-127`). The distinction fails for FE-1480, target identity, contract freeze, and Dora’s decision: each is simultaneously a strategic belief, a sequencing input, and a coordination seam.

### Existing lifecycle rules already point toward one mutable surface

- Controls should contain only current objective, topology, obligations, choices, gates, and stop conditions (`documentation.md:71-76`).
- Git carries mutable-control history (`STEERING.md:15-19`; `arc-close.md:12-13`).
- Unchanged conditional passes should leave controls untouched (`arc-close.md:62-73`).

The current 450-line pair is too broad to satisfy “compact.”

---

## Options

### A. Keep both and tighten

**Pros:** smallest path-level change; preserves the protocol’s declared split.

**Required repair:** delete issue projection from STEERING; delete strategic explanation and open strategic seams from COORDINATION.

**Problem:** the seam remains unstable. A new gate or authority conflict often changes objective, sequencing, and issue projection together. Arc close would still require deciding whether one or both documents change (`arc-close.md:53-73`).

**Verdict:** viable but shallow—two interfaces expose one underlying decision.

### B. Merge STEERING and COORDINATION

**Pros:** removes ownership ambiguity and duplicate sequencing immediately.

**Problem:** a straight merge produces a 450-line current-state document and still loses strategically meaningful rationale whenever current truth is overwritten. Git technically contains history, but discovering “why did generic-first become CPS-first?” requires commit archaeology.

**Verdict:** better interface, insufficient lifecycle design.

### C. Compact `CONTROL` plus strategic decision log

**Pros:** one current-state interface; durable rationale without polluting current truth; strategic decisions no longer masquerade as ADRs.

**Verdict:** recommended.

---

## Recommended responsibilities

### `docs/control/CONTROL.md` — mutable current truth

It should answer only:

1. **Objective and acceptance proof**
2. **Current choice**
3. **Frontier:** now / next / join
4. **Gates and stop/replan conditions**
5. **Cuts**
6. **Focused issue projection:** only IDs needed to act now
7. **Exceptional roots:** retained because the tracker protocol needs a repository-owned exception list

Target: **60–100 lines**, one sequencing representation, ideally a compact pseudo-map.

It must not contain:

- system architecture explanations;
- historical handoff narratives;
- full issue-role tables;
- settled seam history;
- tracker state readily obtained from Linear;
- multiple equivalent descriptions of sequencing.

### `docs/control/STRATEGIC-DECISIONS.md` — append-only rationale

One entry only when a strategic choice changes:

```md
## SD-0003 — Prefer the CPS vertical proof over generic plugin completion

Date: 2026-08-24
Status: current
Trigger: FE-1476 established the review-and-revise scenario.
Decision: Build one CPS semantic slice and one reviewer-session slice in parallel.
Because: The generic path did not cross the September proof spine.
Cuts: Gherkin completion, second-target freeze, broad requirements UI.
Revisit when: Dora changes the scenario, FE-1480 fails, or either first proof fails.
Supersedes: SD-0002
Evidence: [links only]
```

Lifecycle:

- Existing entries are immutable except typo/link repair.
- A changed choice appends a new entry and names what it supersedes.
- Do not append ticket movement, status summaries, proof runs, or no-op steering passes.
- `CONTROL` links the currently governing decision IDs.
- Git remains the history of the mutable control; the log preserves only strategically meaningful decisions.

### Distinction from ADRs

ADRs record accepted architecture and durable operating rules (`documentation.md:12-14`; `steering.md:83-85`). Examples are the three-register IR and application-placement rules.

The strategic log records reversible choices under current time, evidence, and product pressure—the exact judgment STEERING claims at `STEERING.md:11-13`. A strategic entry may expose the need for an ADR amendment, but cannot amend one itself.

---

## Section disposition

### From `STEERING.md`

- **Condense:** September outcome (`21-42`) into objective + six-beat acceptance proof.
- **Move to CONTROL:** external gates (`44-49`), proof spine (`51-63`), current choice (`292-303`), concise cuts (`229-244`).
- **Condense heavily:** current-system table (`65-87`) to only facts that alter the active frontier.
- **Move durable architecture elsewhere or delete duplication:** strategic bet invariants and elicitor architecture (`89-165`). Existing ADR/spec/plugin-contract material should remain authoritative; only unresolved choices stay in CONTROL.
- **Collapse:** four frontier essays (`167-227`) into now/next/join plus proof and stop condition.
- **Delete as a separate section:** issue projection (`246-278`); represent each issue once in the compact execution map.
- **Move to strategic log:** the generic-first → CPS-first choice and its rationale.
- **Condense:** beliefs table (`280-290`) to only low-confidence beliefs that can trigger replanning.

### From `COORDINATION.md`

- **Merge and deduplicate:** current recommendation and graph (`15-71`) into CONTROL’s single execution map.
- **Archive/delete from live control:** repository handoff threshold (`73-95`); it is completed historical migration context.
- **Classify open seams (`97-127`):**
  - active decision/gate → CONTROL;
  - accepted architectural rule → ADR/spec link;
  - settled history → archive or delete from current control.
- **Retain:** exceptional roots (`129-147`), but only IDs, gist, intended parent/disposition—no duplicated strategic explanation.

---

## SPEC-LEDGER

**Keep it separate.**

It has a different key, cadence, and terminal lifecycle:

- Keyed by specification obligation rather than current objective or issue sequence.
- Code and tests are authoritative (`SPEC-LEDGER.md:3-6`).
- It tracks nuanced states not represented by tracker status: partial, contradicted, superseded, orphaned (`SPEC-LEDGER.md:8-14`).
- It becomes a settled terminal record at milestone-one closure (`SPEC-LEDGER.md:5-6`; `arc-close.md:46-51`).

Its 126 lines are predominantly nine obligation tables, not narrative duplication. Folding it into CONTROL would make the current-state interface substantially shallower. CONTROL should link only the few ledger rows that gate the active frontier.

---

## Compact document sketch

```md
# Brunch control

Governing strategic decision: SD-0003
Tracker authority: Linear owns state, hierarchy, and hard blockers.

## Objective
Prove one source-grounded CPS review-and-revise loop through the deployed
Petrinaut entrypoint.

Acceptance: [six concise beats]

## Current choice
Run the CPS semantic proof and existing-target reviewer proof in parallel.
Join at one production-swept correction; deployment follows that join.

## Execution
now:
  FE-1480 -> settle semantic authority
  FE-1482 + FE-1478 -> fold/projection/provenance proof
  FE-1438 + FE-1439 -> existing-target tool/session proof
join:
  FE-1479 -> correction changes live net
then:
  FE-1440 + FE-1423 -> FE-1441

## Gates
| Gate | Owner/source | Last checked | Effect | Replan trigger |

## Cuts
- Generic Gherkin completion does not gate September.
- Contract freeze follows the CPS proof.
- Structured export precedes broad UI.
- No cold-start or comprehensive CPS ontology before the join.

## Stop/replan
- Dora changes the scenario.
- FE-1480 cannot preserve the three-register rule.
- Either first production proof fails.
- Deployment is not viable after the join.

## Exceptional roots
| Issue | Why root | Intended disposition |
```

This provides one low-cost interface for action while hiding issue-graph mechanics, strategic history, and specification accounting behind links to their proper authorities.
```

**Tool Result:** `TU-034CjRQFrREfGryK47EKAL`

```
## Audit verdict

The report mixed a strong project orientation with substantial trigger-specific over-reading. Current guidance is explicitly route-by-trigger, but “orient” can still expand into roughly 500 lines of glossary and steering material.

### 1. Accurate, expected synthesis

| Report category | Source evidence | Assessment |
|---|---|---|
| Brunch is a stateful elicitation harness | `README.md:3-16` | Expected. |
| Package roles | `AGENTS.md:6-17`; `README.md:11-16` | Expected. The README additionally names `transport-aisdk`, which the summary should retain. |
| Glossary/domain model | `CONTEXT.md:7-27`, `29-48`, `50-121` | Expected for meaningful orientation. |
| Steering loop and evidence lifecycle | `docs/agents/steering.md:19-72` | Expected when starting/resuming without a proof target, per `AGENTS.md:30-33`. |
| One-truth-one-home table | `docs/agents/steering.md:74-94` | Accurate and useful. |
| September review-and-revise objective | `docs/control/STEERING.md:21-42` | Accurate current strategy, though conditional. |
| Missing implementation middle | `docs/control/STEERING.md:65-87`, especially `75-81` | Accurate. |
| Current strategic bet | `docs/control/STEERING.md:89-119` | Accurate. |
| Four frontiers, cuts, gates | `docs/control/STEERING.md:167-244`; gates at `44-50` | Accurate, expected only for current-work orientation. |
| Three-register IR | `CONTEXT.md:73-75`; authoritative detail in `docs/adr/0003-three-register-ir.md:24-63` | Accurate. The glossary-level account is enough for generic orientation. |
| Three-lane architecture | `docs/adr/0002-topology-and-placement-rules.md:10-43` | Accurate, but detailed reading is conditional on architecture/package placement. |

### 2. Material inaccuracies or stale-risk claims

#### Cold-start scope

A generic description may say Brunch ultimately supports elicitation, but **a complete cold-start CPS interview is not the current September scope**:

- Current demonstration is review-and-revise: `docs/control/STEERING.md:39-42`.
- Cold-start is explicitly cut: `docs/control/STEERING.md:229-244`.
- The provisional runbook starts from an existing target: `docs/control/STEERING.md:150-165`.
- Whether review-and-revise supersedes create-new-net remains an external gate: `docs/control/STEERING.md:44-49`.
- The belief that this can carry the demo is only medium-confidence and awaits Dora: `docs/control/STEERING.md:282-285`.
- There is an acknowledged conflict with ADR-0004 and cold-start integration stories: `docs/control/STEERING.md:263-278`.

Therefore any unqualified claim that cold-start is either the current target or permanently out of scope is wrong. It is deferred by the present strategy pending an external decision.

`CONTEXT.md:138-140` still describes the older “revision story” as a working hypothesis, not ratified. It must not be promoted over the newer steering document.

#### Current Linear and assignment state

Local controls correctly say Linear owns state, hierarchy, assignment, and hard blockers:

- `docs/control/STEERING.md:8-13`
- `docs/agents/issue-tracker.md:73-90`

A live read-only Linear query on 2026-08-24 found:

- FE-1357 and FE-1383: **In progress**, assigned to Lu Nelson.
- FE-1477 and FE-1482: **Next up**, assigned to Lu Nelson.
- FE-1476–FE-1482 remain unparented.
- Nearly every open project issue is assigned to Lu; FE-1472 is the notable unassigned issue.

Because a “claimable queue” requires open, unblocked, **unassigned** work (`docs/agents/issue-tracker.md:87-91`), “Next up” does not mean claimable. Any report describing FE-1477/FE-1482 as available for a fresh agent is materially wrong.

The unparented statement remains current and agrees with `docs/control/COORDINATION.md:129-147` and `docs/control/STEERING.md:246-251`.

### 3. Likely over-read content

A generic orientation should not load every ceremony. `AGENTS.md:30-43` explicitly says “Route by trigger; load only the applicable compact protocol.”

These are conditional:

- Issue writing/tracker/triage: only issue operations (`AGENTS.md:34-35`)
- Documentation protocol: only document settlement/indexing (`AGENTS.md:36`)
- Domain protocol: only terminology or accepted-context changes (`AGENTS.md:37`)
- Flue routing: only Flue design choices (`AGENTS.md:38`)
- Legibility: significant artifacts/proofs (`AGENTS.md:39`)
- Posture: architecture-sensitive moves (`AGENTS.md:40`)
- Git workflow: branch/commit/PR work (`AGENTS.md:41`)
- Arc-close: closing a work arc (`AGENTS.md:42-43`)

Thus detailed issue-writing, Git, wayfinding, arc-close, legibility, posture, triage, and all protocol ceremonies were over-read for a read-only generic orientation.

Full ADR-0002 and ADR-0003 readings were also unnecessary unless the request asked about topology, IR design, or architecture. Their summaries in `docs/INDEX.md:101-106` plus the glossary are adequate initially.

### 4. Important content missed or under-emphasized

1. **Current application boundary**  
   The accepted topology is in-Petrinaut staging with a separate remote server, not a standalone demo shell: `docs/adr/0004-in-petrinaut-staging-and-the-monorepo-import.md:30-65`.

2. **Transport and evaluation surfaces**  
   `README.md:11-16` names the AI SDK transport and remote application. `AGENTS.md:13` and `evaluations/AGENTS.md:1-8` identify evaluation cases, protocols, oracles, and the information wall.

3. **Current implementation limitations**  
   Session identity, machine client-tool refusal, and the stock deployed website route are decisive present constraints: `docs/control/STEERING.md:79-81`.

4. **Authority and status discipline**  
   `docs/INDEX.md:3-11` explains document statuses and authority. This is more useful in orientation than detailed ceremony mechanics.

5. **Posture, only as a warning**  
   Current posture is prototype/high-stakes/current-milestone: `docs/agents/posture.md:1-4`. It matters before architecture-sensitive work, but need not be expanded during generic orientation.

## Recommended read sets

### Default generic orientation

1. `README.md:1-19` — identity and concrete surfaces.
2. `AGENTS.md:1-43` — scope and trigger routing.
3. `CONTEXT.md` — glossary; initially headings plus relevant terms.
4. `docs/INDEX.md:1-12`, `73-82`, `95-116` — authority map and concise current-document summaries.
5. If orienting to current work:  
   `docs/agents/steering.md:1-42`, then `docs/control/STEERING.md:21-119`, `167-244`, `280-303`.
6. Query Linear live before asserting availability, assignment, hierarchy, or blockers.

### Conditional pointers

- Architecture/package placement → ADR-0002, topology reference.
- IR semantics → ADR-0003, IR/plugin specs.
- Petrinaut integration → ADR-0004, integration spec.
- Current sequencing → `COORDINATION.md` plus live Linear.
- Evaluation work → `evaluations/AGENTS.md`.
- Flue choice → `flue-routing.md`.
- Issue, documentation, Git, artifact, posture, or close protocols → only on their named triggers.

## Overall assessment

Current guidance **can produce a compact, useful orientation** because `AGENTS.md:30-43` explicitly enforces trigger routing. The fresh report’s ceremony coverage indicates the agent ignored that instruction.

The main remaining weakness is that “start or resume without a proof target” routes a generic orientation into the large steering apparatus. A disciplined agent should read only the steering sections needed to establish current objective, uncertainty, and next proof—not every protocol and historical artifact. No files were modified.
```

**Tool Result:** `TU-034CjRQGXdoJ4wQ2O3j55L`

```
## Outcome

Read-only audit completed. No repository or Linear changes were made; `git status --short` remained empty.

## Linear evidence

GraphQL query on 2026-08-24 found:

- Viewer: **Lu Nelson** (`ln@hash.ai`)
- Project: `brunch-agent`, team `FE`
- Project lead/member: Lu Nelson
- 82 project issues:
  - 81 assigned to Lu Nelson
  - 0 assigned to another user
  - **1 unassigned:** FE-1472, “Evaluate the cost of pinning bedrock-sdk's nested Anthropic SDK,” in Triage

Thus the stated fact is almost, but not completely, true. FE-1472 is the exception; assigning it would require explicit approval.

### Linear limitation

Linear’s current API schema and CLI expose no project-level default assignee:

- `Project`/`ProjectUpdateInput` has lead and members, but no default assignee.
- `linear project update` has no assignee option.
- FE has team-wide default issue-template facilities, but both member and non-member defaults are unset.
- A team template could carry an assignee, but would affect all FE issues, is not project-specific, and can be bypassed.
- `linear issue create` supports `--assignee self`.

No available project setting therefore guarantees assignment specifically for `brunch-agent`.

## Smallest durable assignment rule

Update `docs/agents/issue-tracker.md` so every issue created for this project uses:

```sh
linear issue create \
  --team FE \
  --project brunch-agent \
  --assignee self \
  --parent FE-XXXX
```

State explicitly:

1. Assignment is part of the approved creation operation, not a later cleanup write.
2. The creator must verify the returned issue has project, parent, and current-user assignee before reporting success.
3. Creating or repairing assignment still requires explicit external-write approval.
4. Existing teammate-authored issues are not reassigned without separate approval.

Also revise the wayfinding model: its “claimable queue” currently requires issues to be **unassigned**, and says unassigned project work is normal. That directly conflicts with the proposed invariant. Replace claimability with open + unblocked, with assignment indicating the current owner; remove “claim by assigning yourself” for project-created issues.

## Control-lifecycle risks

If the three controls become one mutable control plus an append-only strategic decision log:

- **Trigger ownership:** Steering triggers are defined, but nobody is explicitly responsible for evaluating them. Name the arc driver as owner; arc-close is the backstop.
- **Append criteria:** Without a materiality threshold, routine ticket movement becomes chronology. Append only when objective, proof frontier, authority boundary, cut, gate consequence, or confidence materially changes.
- **Supersession:** Entries need stable IDs and explicit `supersedes` links. The mutable control must link the active decision rather than restating history.
- **Compaction:** Never rewrite append-only entries. Close a bounded volume, index/archive it unchanged, and start another volume. Define a size or settled-frontier threshold.
- **VCS conflicts:** A mutable monolith and a shared EOF are both conflict hotspots. Require one decision entry per commit, append only after rebasing, and resolve conflicts by retaining both entries and reconciling ordering/supersession—never by dropping one side.
- **Arc close:** Current checks separately name STEERING, COORDINATION, and SPEC-LEDGER. Consolidation would otherwise silently lose obligation and coordination checks.
- **Index/tests:** Existing `docs-index.test.ts` proves coverage, links, retired paths, and AGENTS reachability, but not control shape, decision identity, append discipline, or supersession integrity.
- **No-op prevention:** Existing guidance is strong but prose-only. A decision entry must cite the triggering changed fact and affected current-control section; otherwise no append is allowed.

## Exact recommended guidance changes

- **`docs/agents/documentation.md`**
  - Define the single mutable control’s owned fields.
  - Define the strategic log as immutable historical decisions, not evidence or routine updates.
  - Specify entry IDs, trigger/evidence, decision, consequence, supersedes, and current-control link.
  - Specify volume rollover instead of in-place compaction.

- **`docs/agents/steering.md`**
  - Assign trigger evaluation to the arc driver.
  - Add exact append criteria and require supersession links.
  - Require current control to point to active strategic decisions.

- **`docs/agents/arc-close.md`**
  - Replace the three conditional control passes with one reconciliation pass that still checks:
    issue topology, soft edges, exceptional roots, specification obligations, strategy, gates, and proof frontier.
  - Verify every new log entry has a material trigger and changed current truth.
  - Verify no no-op entry was appended.
  - Audit project issues for missing/current-user assignee, but repair only with approval.

- **`docs/agents/issue-tracker.md`**
  - Add mandatory `--assignee self`.
  - Reconcile the claimable-queue semantics.
  - Document the lack of a project-level Linear default.

- **`docs/INDEX.md` / `AGENTS.md`**
  - Replace control registrations and protocol wording atomically; retain one covering row per new log volume.

## Recommended tests

Extend `packages/core/test/architecture/docs-index.test.ts` or add a focused control-lifecycle architecture test to assert:

- exactly one current mutable control;
- every decision-log entry has a unique ID, date, trigger/evidence, decision, and consequence;
- every `supersedes` target exists and no supersession cycle exists;
- the current control references only existing active decision IDs;
- closed log volumes remain indexed;
- legacy control files are absent after migration.

Extend `linear-project-graph` and its test to include assignee identity and surface any project issue not assigned to the current user. Keep this as an audit gate rather than an auto-repair: Linear writes remain approval-controlled.
```

## Assistant

Yes: the current setup is too wide. `STEERING` is 303 lines, `COORDINATION` 147, and they share 20 issue IDs. Their conceptual seam is not holding.

I recommend:

- Keep one compact mutable [`STEERING.md`](file:///Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/control/STEERING.md), targeting 60–100 lines.
- Delete `COORDINATION.md`; fold only active soft edges and exceptional roots into `STEERING`.
- Add append-only `STRATEGY-LOG.md` for material strategic choices—not ticket movement.
- Keep `SPEC-LEDGER.md` separate.

`STEERING` answers **what now**:

- objective and acceptance proof
- governing strategy-log entries
- now → join → next issue map
- cuts
- external gates and replan triggers
- exceptional roots

`STRATEGY-LOG` answers **why this strategy**. Each immutable entry records:

```text
ID · date · trigger/evidence · decision · consequences/cuts
revisit condition · supersedes · links
```

Append only when the objective, proof frontier, authority boundary, material cut, gate consequence, or confidence changes. No-op steering passes write nothing. ADRs remain architectural decisions; the strategy log records reversible choices under current pressure.

Arc-close should enforce:

1. exactly one mutable strategic control;
2. each new log entry has a material trigger;
3. `STEERING` references current decision IDs;
4. supersession links resolve;
5. Linear remains authoritative for live issue facts.

The fresh agent’s orientation was strong but over-read almost every trigger-specific protocol. A generic orientation should normally read `README`, `AGENTS`, `CONTEXT`, `INDEX`, compact `STEERING`, then live Linear. Git, issue-writing, legibility, Flue, and arc-close protocols should load only on their triggers.

One substantive correction: **cold-start does not gate the current demo, but it remains an important benchmark/contingency lane**. “No cold-start interview” is too categorical.

Finally, live Linear shows 81/82 issues assigned to you; FE-1472 remains unassigned. New issue creation should always use `--assignee self`, and assignment should mean human ownership—not work claiming. May I assign FE-1472 and implement this control-surface consolidation?

## User

Yes, to both

## Assistant

I’ll keep the established name `STEERING.md` for the single mutable control, add an append-only `STRATEGY-LOG.md`, retire `COORDINATION.md`, and leave `SPEC-LEDGER.md` separate. The consolidation will include executable lifecycle checks and the new assignment invariant; issue assignment will become ownership, not a work-claim mechanism.

**Tool Use:** `Task`

```json
{
  "prompt": "EXECUTE the explicitly approved Linear assignment repair. In the FE `brunch-agent` project, re-read FE-1472 and current viewer identity. Assign FE-1472 to the current user (Lu Nelson) and make no other change: no title/body/comment/state/parent/project/label changes. Treat connection failure as unknown and re-read before retry. Then query all 82 project issues and verify every issue is assigned to the current user, with zero unassigned or differently assigned. Do not modify repository files. Return before/after issue fields, operation used, and aggregate verification.",
  "description": "Assign FE-1472"
}
```

**Tool Use:** `Task`

```json
{
  "prompt": "IMPLEMENT the approved Brunch control-surface consolidation in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent. Inspect clean status, read all affected files, and preserve unrelated work. Do not stage/commit or mutate Linear. Outcome: one compact mutable current control (`docs/control/STEERING.md`) plus one append-only material strategic decision record (`docs/control/STRATEGY-LOG.md`); remove `docs/control/COORDINATION.md`; keep `SPEC-LEDGER.md` separate.\n\nDESIGN\n1. Rewrite STEERING to approximately 60–100 lines (slightly over only if a checkable gate/table requires it). It owns current truth only:\n- objective and concise acceptance proof;\n- links to governing strategy decision IDs;\n- one compact now -> join -> next execution tree with only actionable issue IDs and gaps;\n- active gates, owner/source/watch trigger/last checked/consequence;\n- only decision-relevant beliefs/unknowns with confidence/evidence or cheapest probe;\n- cuts stated as sequencing, including the corrected rule: full cold-start does not gate the current review-and-revise proof, but cold-start quality remains an important benchmark/contingency lane and can activate if the use-case decision changes;\n- stop/replan conditions;\n- exceptional roots with intended disposition.\nDo not mirror Linear status/assignment/hard blockers, duplicate architecture/spec rationale, retain completed handoff history, or explain the generic steering procedure. Link authorities.\nUse current facts from existing STEERING/COORDINATION and this context: Dora’s use-case decision will remain outstanding for a while, so make it event-watched/non-blocking rather than a frequently polled gate; FE-1480 remains unresolved; truck-fleet dossier ref unavailable; review-and-revise is current proof but not permanent product scope.\n\n2. Add STRATEGY-LOG.md as an append-only material-decision log, explicitly distinct from ADRs and a diary. Seed only the minimum current strategic choices recovered from existing controls:\n- review-and-revise is the September proof while cold-start remains benchmark/contingency;\n- CPS establishes the minimum plugin contract before generic contract freeze;\n- semantic and reviewer lanes run in parallel and join at targeted correction before deployment.\nUse stable IDs S-001..S-003. Each entry: Date, Trigger/evidence, Decision, Consequences/cuts, Revisit when, Supersedes (`none` for initial seeded decisions), Evidence links. Keep entries compact. Existing entries immutable except typo/link repairs; changes append a superseding entry. STEERING links all governing IDs.\n\n3. Delete COORDINATION.md without archive/stub. Merge only its live unique responsibilities into STEERING: current soft execution edges and exceptional roots. Git carries handoff history. Repair all active repo links/path references. Historical plain-text evidence of old paths may remain only if intentionally evidentiary and not a live link.\n\nLIFECYCLE GUIDANCE\nUpdate minimally and without duplicated procedures:\n- docs/agents/steering.md: arc driver owns trigger evaluation; current control references governing log IDs; append only when objective, proof frontier, authority boundary, material cut, gate consequence, or confidence materially changes; require trigger/evidence and supersedes; no-op writes nothing.\n- docs/agents/documentation.md: one compact mutable STEERING authority; strategy log immutable append-only rationale; ADR distinction; Git is mutable history; no diary/status entries.\n- docs/agents/arc-close.md: one control reconciliation, still conditional; check issue soft edges/exceptional roots, strategy/gates/frontier; validate any new strategy entry is material and referenced; no-op persists nothing; SPEC-LEDGER remains separately conditional.\n- docs/agents/issue-tracker.md: all new brunch-agent project issues use `--assignee self` as part of the approved create operation and verify assignee/project/parent; assignment denotes accountable human ownership, not agent claim. Replace unassigned claimable-queue semantics with a mechanical frontier of open+unblocked work; before work, check state/active branch or PR to avoid duplication. Existing reassignments remain separately approval-gated.\n- AGENTS.md/README/docs/INDEX and other active guidance only where pointers/authority table need repair.\n\nEXECUTABLE GATES\n- Update/add architecture tests so exactly one current mutable strategic control exists, COORDINATION is absent, and STRATEGY-LOG entry structure is validated: unique IDs, required fields, valid supersedes targets/no cycles, STEERING governing IDs resolve. Keep tests simple and tied to the exact Markdown schema.\n- Inspect the current Linear graph generator/tests. Extend its read-only audit to include assignee identity and surface any brunch-agent project issue not assigned to the current authenticated user, if this fits the existing module without broad refactor. Do not auto-repair. Add/update tests first or alongside. If it does not fit cleanly, report rather than force it.\n- Repair INDEX/link tests and all consumers.\n\nDo not add log-volume rollover machinery now; milestone close can revisit if the file becomes large. Do not add a skill or new abstraction. Do not write Linear descriptions in this task.\n\nRun formatting, ESLint, typecheck, full package unit tests, build, focused docs/control and Linear graph tests, and git diff --check. Return exact files changed/deleted/added, final STEERING line/word count, test results, any live external pointers to retired COORDINATION requiring separately approved repair, and any unresolved concern.",
  "description": "Consolidate Brunch controls"
}
```

## User

**Tool Result:** `TU-034Cjetkn4lWzDnHjRAHCr`

```
Assignment repair completed.

- **Viewer:** Lu Nelson (`ln@hash.ai`)
- **Operation:** `linear issue update FE-1472 --assignee self`
- **FE-1472 before:** assignee `null`
- **FE-1472 after:** assignee Lu Nelson
- **Unchanged:** title, body, state (`Triage`), parent, project (`brunch-agent`), labels
- **Project verification:** 82/82 assigned to Lu Nelson; 0 unassigned; 0 differently assigned; no additional pages
- **Repository files:** none modified
```

**Tool Result:** `TU-034CjetlHD9Wq00JGIE0a8`

```
Implemented the Brunch control-surface consolidation.

**Changed**
- Added `docs/control/STRATEGY-LOG.md`
- Added `packages/core/test/architecture/control-surfaces.test.ts`
- Deleted `docs/control/COORDINATION.md`
- Reworked `docs/control/STEERING.md`: **93 lines, 915 words**
- Updated:
  - `README.md`
  - `docs/INDEX.md`
  - `docs/agents/{arc-close,documentation,issue-tracker,steering}.md`
  - `docs/control/SPEC-LEDGER.md`
  - `docs/specs/plugin-contract.md`
  - `scripts/linear-project-graph.ts`
  - `packages/core/test/architecture/linear-project-graph.test.ts`

Linear graph now audits assignees against the authenticated user without mutation.

**Verification**
- ESLint: passed
- Formatting: passed
- Typecheck: passed
- Unit tests: **119 passed**
- Build: passed
- Focused control/index/Linear tests: **13 passed**
- Live Linear graph: passed; 35 open issues, 0 assignee mismatches, no cycles
- `git diff --check`: passed
- Arc-close reconciliation: completed
- No staging, commits, or Linear mutations performed

No active repository references to `COORDINATION` remain. Historical archive references remain intentionally evidentiary. External Linear/Notion bodies were not exhaustively audited, so separately approved pointer repair may still be needed there.
```

## Assistant

FE-1472 is now assigned; live verification shows 82/82 project issues assigned to you.

The consolidation is implemented at 93 lines for `STEERING`, with three seeded strategy entries and executable lifecycle/assignment checks. I’m now cold-reviewing the content and the Linear audit independently, and checking whether retiring `COORDINATION` left any live external pointers.

**Tool Use:** `Task`

```json
{
  "prompt": "READ-ONLY cold review of the current control-consolidation diff in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent. Do not modify/stage/commit. Review docs/control/STEERING.md, new STRATEGY-LOG.md, deleted COORDINATION.md, and all guidance/index/spec pointer edits. Intent: STEERING is compact current-only (target 60–100 lines, minimal prose), log is append-only material strategy distinct from ADR/diary, SPEC-LEDGER separate, cold-start corrected to benchmark/contingency not current gate, use-case decision event-watched/non-blocking, no tracker-state mirroring, unique live soft edges/exceptional roots retained, no strategy loss. Check whether 915 words is still unnecessarily prose-heavy; identify exact deletions/condensations. Validate seeded S-001..S-003 against prior controls/agreed strategy and check no architectural ADR decision was misfiled. Check lifecycle rules for drift/no-op/churn/conflicts. Return actionable findings with file/line and smallest fixes, pass/fail, and a judgment on whether the fresh agent would now get a compact accurate current orientation.",
  "description": "Review consolidated controls"
}
```

**Tool Use:** `Task`

```json
{
  "prompt": "READ-ONLY code/test review of current changes to scripts/linear-project-graph.ts, packages/core/test/architecture/linear-project-graph.test.ts, control-surfaces.test.ts, and issue-tracker guidance in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent. Do not modify. Verify: live graph remains read-only; authenticated viewer identity is authoritative; all project issues (not just open) are audited or any scope is explicitly correct; mismatch/unassigned failures are clear; pagination unaffected; tests cover unassigned, wrong assignee, all-good, absent viewer/assignee fields, and existing graph behavior; issue creation uses --assignee self and assignment no longer means agent claim; external-write approval remains. Check test parser for strategy log is robust enough without overengineering. Return actionable findings with lines, pass/fail, smallest fixes.",
  "description": "Review assignment audit code"
}
```

**Tool Use:** `Task`

```json
{
  "prompt": "READ-ONLY external/internal pointer audit after deleting docs/control/COORDINATION.md. Do not modify repository or external systems. Query all 82 live Linear brunch-agent issue descriptions and current repository Markdown/link paths for `COORDINATION.md`, the retired path, or text that treats COORDINATION as active authority. If accessible, inspect project documents/Notion references only when directly linked from current Brunch docs; do not broad-search unrelated systems. Return exact live pointers needing repair, issue IDs and context, whether a direct replacement is STEERING.md or STRATEGY-LOG.md, and count. Distinguish intentional historical archive mentions. Also verify no current active repo link target is broken.",
  "description": "Audit retired coordination pointers"
}
```

## User

**Tool Result:** `TU-034CjpNKnCAwZG7iMF7Qg6`

```
## Verdict: **FAIL — close, but not lossless**

The consolidation is substantially better and gives a fresh agent a compact, mostly accurate current orientation. However, one live seam has a broken pointer, several unique coordination seams disappear without another authority, and lifecycle guidance can still cause tracker-driven churn.

### Findings

1. **Broken absence-locator authority**
   - `docs/specs/plugin-contract.md:366` now points to `STEERING`, but `STEERING` contains no absence-locator seam.
   - Smallest fix: add one compact soft-edge sentence under `STEERING.md:38`, or point the spec to the existing SPEC-LEDGER obligation if that is the intended owner.

2. **Potential strategy loss from deleted COORDINATION**
   - Deleted unique live seams have no clear replacement:
     - structured-tap evidence (`FE-1395 × capture store`)
     - telemetry vocabulary (`FE-1385 × FE-1404 × FE-1423`)
     - living-prototype charter
   - Guidance placement is adequately covered by ADR-0002; projection authority, controller, target identity, contract freeze, and absence locator are otherwise represented.
   - Smallest fix: retain only genuinely live unique seams as terse bullets under soft edges, or link each to its actual spec/ledger authority.

3. **Tracker changes can trigger unnecessary STEERING churn**
   - `docs/agents/arc-close.md:55-60` requires reassessment for hard blockers, parentage, and project membership, although `docs/agents/steering.md:17` says ordinary ticket movement is not a trigger and Linear owns these facts.
   - Smallest fix: remove hard blocker/parent/project changes as independent triggers; retain exceptional-root or sequencing-impact changes.

4. **Strategy-log lifecycle underspecifies conflicts and drift**
   - `docs/agents/steering.md:101-103` and `STRATEGY-LOG.md:3-6` cover append-only, supersession, and no-op behavior, but not:
     - conflicting still-live entries;
     - removing superseded IDs from STEERING;
     - complementary decisions versus superseding decisions;
     - ID sequencing.
   - The test only checks resolvable backward references and cycles.
   - Smallest fix: state that conflicting decisions must supersede prior entries and only unsuperseded governing IDs may remain in STEERING. Optionally enforce monotonically increasing IDs.

### Seeded strategy review

- **S-001:** Correctly strategic, not architectural. It narrows the current proof while explicitly preserving ADR-0004 reconciliation and cold-start as benchmark/contingency.
- **S-002:** Faithfully captures the prior CPS-before-generic-freeze strategy.
- **S-003:** Faithfully captures the parallel semantic/reviewer lanes and mandatory FE-1479 join.
- **No ADR decision appears misfiled.**

### Prose/size judgment

`STEERING.md` is 93 lines but still 915 words; compact by line count, moderately prose-heavy by scan cost.

Exact reductions:

- `3-5`: collapse to one ownership sentence.
- `38-42`: replace with 3 terse soft-edge bullets.
- `56-60`: shorten each belief row to evidence fragment + probe; much repeats gates and stop conditions.
- `64-67`: collapse into one “not gates” line referencing S-001/S-002.
- `73-81`: convert to five one-line triggers; remove explanatory tails already present in gates.
- Preserve objective, acceptance proof, execution tree, gates, roots, and production-wiring warning.

This should reach roughly 650–750 words without losing current strategy.

### Fresh-agent orientation

**Mostly yes:** objective, proof, execution order, cold-start posture, use-case watch behavior, cuts, and exceptional roots are immediately legible.  
**Not fully accurate yet:** the missing absence-locator destination and silently dropped live seams prevent a clean pass.

No files modified; review was read-only.
```

**Tool Result:** `TU-034CjpNLNTQdjTVPmdXHcO`

```
## Review verdict: **FAIL**

### Findings

1. **High — audit contradicts “every project issue.”**  
   `docs/agents/issue-tracker.md:122` claims every project issue is audited, but the documented command omits `--all` (`:117`), while `fetchProjectGraph()` defaults to open issues only (`scripts/linear-project-graph.ts:441,459-460`). Closed mismatches are therefore excluded.  
   **Smallest fix:** document the audit command with `-- --all`, or explicitly limit the guidance to open issues.

2. **High — required fetch behavior is effectively untested.**  
   `linear-project-graph.test.ts` only tests rendering. It does not exercise GraphQL parsing, viewer-ID authority, missing viewer/assignee fields, pagination, closed issue inclusion, or read-only CLI invocation. Consequently, requested unassigned/wrong-assignee/all-good cases are only partially represented; absent-field and pagination cases are absent.  
   **Smallest fix:** export/inject the query boundary or page parser and add focused fixtures for:
   - viewer ID match despite names;
   - unassigned and wrong assignee;
   - zero mismatches;
   - missing viewer fails clearly;
   - absent/null assignee becomes unassigned;
   - two-page accumulation and cursor failure;
   - default-open versus `--all`.

3. **Medium — missing viewer failure is misleading.**  
   At `scripts/linear-project-graph.ts:299-311`, an absent/malformed viewer produces “Expected exactly one Linear project,” even when the project is valid.  
   **Smallest fix:** validate viewer separately and report “Linear returned an unexpected/missing authenticated viewer.”

4. **Medium — strategy-log parser can silently skip malformed entries.**  
   `control-surfaces.test.ts:26-40` only returns entries matching the exact shape. A malformed `### S-…` entry can disappear while tests still pass because only `entries.length > 0` is asserted.  
   **Smallest fix:** separately count strategy-ID headings and assert that count equals parsed entries. No full Markdown parser is needed.

### Passed checks

- Live graph remains read-only: only `linear api` is invoked.
- Viewer ID, not display name, determines assignment (`:435`).
- Mismatch/unassigned rendering is clear.
- Existing graph cycle behavior remains covered.
- Issue creation now uses `--assignee self`; assignment is explicitly human ownership, not agent claim.
- External writes remain approval-gated.
- Focused tests: **6 passed**.
- ESLint: **passed**.
- Type check: **passed**.
- `git diff --check`: **passed**.

No files modified.
```

**Tool Result:** `TU-034CjpNM3jBKBe3MybSm3G`

```
## Audit result

**1 live pointer needs repair.**

- `docs/agents/legibility.md:70` — “durable artifacts (coordination, ledger, docs, issues)”
  - Treats coordination as a current control.
  - Replace with **`STEERING.md`** / “steering”.
  - Not `STRATEGY-LOG.md`: this sentence concerns current reconciliation, not historical rationale.

## Linear

Queried all **82/82** `brunch-agent` project issue descriptions.

- **No live issue pointer needs repair.**
- `FE-1464`, line 117, mentions `COORDINATION.md` only in a completed historical account of commit `0629903`. Intentional history; retain.
- Other lowercase “coordination” occurrences are ordinary prose/headings, not control-document authority.

## Historical repository mentions

`docs/archive/migrations/hash-monorepo-import-plan.md`:

- Line 6: historical link to `./COORDINATION.md`
- Line 138: historical cutover-gate reference
- Line 177: historical statement that the file was live at import time

These are intentionally historical. The line-6 link is now unresolved, but it is not an active authority pointer and has no honest direct `STEERING.md`/`STRATEGY-LOG.md` replacement.

## Link integrity

- Checked **69 current Brunch Markdown/MDX files**: **0 broken active local link targets**.
- Embedded old-worktree links in the preserved framework-comparison transcript are historical snapshot content, not current navigation.
- Linear project has **no attached documents**.
- Four directly linked Notion pages were identified; their contents were inaccessible due authentication/redirects, so they could not be audited.

No repository or external-system changes were made.
```

## Assistant

The cold review found useful tightening rather than a design reversal:

- `STEERING` can lose another 150–250 words.
- Three genuinely live soft seams from `COORDINATION` need terse retention.
- Arc-close was still letting ordinary tracker movement provoke strategy churn.
- The strategy-log test could miss malformed entries.
- The assignment audit needs an explicit all-issues mode and tests at its query boundary.
- One live legibility reference still said “coordination.”

I’m applying those corrections and then will re-review the whole slice.

**Tool Use:** `Task`

```json
{
  "prompt": "EDIT the current uncommitted control-consolidation slice in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent. Read current files and deleted COORDINATION from HEAD/diff before patching. Do not stage/commit or mutate Linear. Apply the review findings with the smallest coherent changes:\n\nCONTROL CONTENT\n1. Reduce docs/control/STEERING.md from 915 words toward 650–750 while preserving objective, acceptance proof, execution tree, gates, exceptional roots, and production-wiring rule. Specifically collapse ownership intro; use terse soft-edge bullets; shorten beliefs to evidence fragment + probe; collapse cuts/not-gates with strategy-log links; turn replan into one-line triggers without duplicated explanations.\n2. Retain exactly the genuinely live unique seams from deleted COORDINATION as terse active soft edges, using exact issue IDs/meaning from HEAD:\n- structured-tap evidence into capture-store truth;\n- telemetry vocabulary across its named issues/exposure gate;\n- living-prototype charter.\nAlso ensure the absence-locator seam has an honest current authority. Inspect SPEC-LEDGER: if it already owns the exact obligation, point docs/specs/plugin-contract.md there; otherwise add one terse STEERING soft edge and keep the spec pointer accurate. Do not resurrect handoff history or full issue graph.\n3. docs/agents/arc-close.md: ordinary hard-blocker/parent/project movement is not an independent steering trigger. Reconcile STEERING only when exceptional roots or sequencing/strategy materially change. Keep assignment audit as a separate read-only close check if present.\n4. Strategy lifecycle in docs/agents/steering.md and STRATEGY-LOG.md: conflicting decisions must append a superseding entry; complementary decisions need no supersedes; only unsuperseded governing IDs may remain in STEERING; IDs increase monotonically. Keep compact.\n5. docs/agents/legibility.md: replace current-authority 'coordination' reference with steering/STEERING. Preserve historical archive mentions.\n\nEXECUTABLE CHECKS\n6. control-surfaces.test.ts: separately count all strategy-ID headings and assert count equals successfully parsed entries, so malformed entries cannot disappear. Enforce monotonically increasing unique IDs. Assert STEERING governing IDs are unsuperseded, while allowing complementary initial entries. Keep simple regex; no parser abstraction.\n7. Assignment audit:\n- docs/agents/issue-tracker.md must use `turbo run linear:graph --filter '@hashintel/brunch-agent' -- --all` when claiming to audit every project issue. Preserve normal open-only graph use elsewhere.\n- scripts/linear-project-graph.ts: validate authenticated viewer separately and give a precise missing/malformed-viewer error.\n- Add focused tests at the query/page parsing boundary for viewer ID vs name, unassigned, wrong assignee, all-good, missing viewer, null/absent assignee, two-page accumulation/cursor behavior, and default-open vs --all. Export/inject only the smallest boundary needed; do not broad-refactor or add dependencies. Preserve read-only behavior and existing graph output.\n8. Repair any pointers affected by these changes.\n\nRun formatting, ESLint, typecheck, full unit suite, build, focused control/docs/Linear graph tests, live read-only linear:graph with --all, and git diff --check. Return exact edits, STEERING line/word count, test counts, live assignment audit result, and remaining concerns.",
  "description": "Fix control consolidation review"
}
```

## User

**Tool Result:** `TU-034CjtjYtb0f427e05OEHt`

```
Implemented the control-consolidation review changes without staging, committing, or mutating Linear.

Key edits:
- Condensed `STEERING.md` to **93 lines / 726 words**.
- Preserved required proof, execution tree, gates, roots, and production-wiring rule.
- Restored only the three live COORDINATION seams plus the absence-locator soft edge.
- Clarified arc-close, strategy supersession, and current-authority rules.
- Added strategy-ID integrity checks.
- Added focused viewer, assignment, pagination, and `--all` tests.
- Improved malformed/missing authenticated-viewer errors.
- Updated affected documentation pointers.

Verification:
- Formatting: passed
- ESLint: passed
- Typecheck: passed
- Full unit suite: **128/128 passed**
- Focused tests: **22/22 passed**
- Build: passed
- `git diff --check`: passed
- Live `linear:graph --all`: **82 project issues, 0 assignment mismatches, 1 external issue, no cycles**

Remaining concern: Node emits the existing typeless-package ES-module performance warning when running the graph script.
```

## Assistant

**Tool Use:** `Task`

```json
{
  "prompt": "READ-ONLY final content/lifecycle review of current control-consolidation diff in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent. Do not modify. Verify prior findings resolved: absence locator, three live seams, no strategy loss, 650–750-word scan cost, cold-start nuance, event-watched Dora gate, arc-close no tracker churn, strategy conflict/complement/supersession/current-ID rules, live legibility pointer, no broken active links, no active COORDINATION authority. Assess whether the resulting STEERING + STRATEGY-LOG + SPEC-LEDGER split is disciplined and whether a fresh generic/current-work agent gets concise accurate orientation. Return pass/fail and only actionable findings.",
  "description": "Recheck consolidated controls"
}
```

**Tool Use:** `Task`

```json
{
  "prompt": "READ-ONLY final code/test review of current control-consolidation diff in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent. Do not modify. Verify prior findings resolved: all-issues assignment command, viewer validation, query/page parser tests including pagination/default-open/--all/null/wrong/unassigned, read-only behavior, strategy heading count/parse equality, monotonic unique IDs, valid acyclic supersedes, STEERING only unsuperseded IDs. Inspect for overfitting or unnecessary abstractions, and confirm full test/build claims if possible from direct focused runs. Return pass/fail and only actionable findings.",
  "description": "Recheck control and graph tests"
}
```

## User

**Tool Result:** `TU-034CjyLK6Em9emHgFR0UuS`

```
**PASS — no actionable findings.**

Verified all requested lifecycle/content concerns, including 652-word STEERING scan cost, active-link integrity, and removal of active COORDINATION authority.

Focused verification: 22 tests passed across control surfaces, documentation links/indexing, and Linear graph behavior.
```

**Tool Result:** `TU-034CjyLKsYnRhyx9I1dE2J`

```
**FAIL — 2 actionable findings**

1. `control-surfaces.test.ts:56` counts only `### S-*` headings. A malformed entry heading such as `### T-004` is ignored, so heading/parse equality still passes. Count all level-3 entry headings.
2. `control-surfaces.test.ts:84` checks only the “Governing strategic decisions” paragraph. Other strategy IDs in `STEERING.md` can remain superseded unnoticed. Validate every `S-\d{3}` reference in STEERING.

All other requested findings appear resolved: assignment command, viewer/assignee validation, pagination/default-open/`--all`/null/wrong/unassigned cases, read-only querying, unique monotonic IDs, and backward acyclic supersedes.

Verification passed: ESLint, formatting, typecheck, 128 unit tests, build, `git diff --check`, and live default/`--all` Linear graph runs. No unnecessary abstractions identified; no files modified.
```

## Assistant

**Tool Use:** `Task`

```json
{
  "prompt": "EDIT only packages/core/test/architecture/control-surfaces.test.ts in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent after reading it. Fix two review findings with minimal regex assertions:\n1. Count all level-3 headings in STRATEGY-LOG's entry area (not only valid S-* headings) and assert the count equals parsed valid entries, so malformed IDs/headings cannot disappear. Do not count the document title or non-entry explanatory prose.\n2. Collect every S-\\d{3} reference anywhere in STEERING.md, not only the governing paragraph, and assert each resolves to an existing unsuperseded strategy entry. Preserve the separate requirement that the governing list exists.\nDo not modify other files, stage, commit, or touch Linear. Run formatting, ESLint, typecheck, full unit tests, build, focused control tests, and git diff --check. Return exact assertions and results.",
  "description": "Harden control lifecycle tests"
}
```

## User

**Tool Result:** `TU-034Ck0mKHdCs2bbnpQLMMc`

```
Updated only `packages/core/test/architecture/control-surfaces.test.ts`.

Exact new assertions:
- `expect(entryArea).not.toBeNull();`
- `expect(entries).toHaveLength(entryHeadingCount);`
- `expect(governingLine![1]).toMatch(/S-\d{3}/);`
- Every global `S-\d{3}` reference is asserted known and unsuperseded.

Verification passed:
- Formatting
- ESLint
- Typecheck
- Unit tests: 128/128
- Build
- Focused tests: 5/5
- `git diff --check`

No staging, commit, Linear activity, or other file edits.
```

## Assistant

**Tool Use:** `Task`

```json
{
  "prompt": "READ-ONLY final review of the entire current control-consolidation diff in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent after the test hardening. Do not modify. Confirm both latest test findings are resolved and no remaining blocker across content authority, lifecycle guidance, assignment invariant/audit, links, deleted COORDINATION, compact STEERING, strategy log, and tests. Return pass/fail, exact complete changed-path manifest suitable for literal staging, verification summary, and any external pointer repair still required.",
  "description": "Final review control consolidation"
}
```

## User

**Tool Result:** `TU-034Ck3S6mUHRivsxlJvZyw`

```
## Verdict: **FAIL**

Latest test-hardening findings are resolved:

- Assignee matching uses authenticated viewer **ID**, not display name.
- Pagination is tested, including cursor forwarding and `--all` closed-issue coverage.

Remaining blockers:

1. `docs/archive/migrations/hash-monorepo-import-plan.md:6` contains a broken `./COORDINATION.md` link, plus stale references at lines 138 and 177.
2. Linear issue **FE-1464** still references `COORDINATION.md`; external repair requires explicit approval.

## Changed-path manifest

```text
libs/@hashintel/brunch-agent/README.md
libs/@hashintel/brunch-agent/docs/INDEX.md
libs/@hashintel/brunch-agent/docs/agents/arc-close.md
libs/@hashintel/brunch-agent/docs/agents/documentation.md
libs/@hashintel/brunch-agent/docs/agents/issue-tracker.md
libs/@hashintel/brunch-agent/docs/agents/legibility.md
libs/@hashintel/brunch-agent/docs/agents/steering.md
libs/@hashintel/brunch-agent/docs/control/COORDINATION.md
libs/@hashintel/brunch-agent/docs/control/SPEC-LEDGER.md
libs/@hashintel/brunch-agent/docs/control/STEERING.md
libs/@hashintel/brunch-agent/docs/control/STRATEGY-LOG.md
libs/@hashintel/brunch-agent/docs/specs/plugin-contract.md
libs/@hashintel/brunch-agent/packages/core/test/architecture/control-surfaces.test.ts
libs/@hashintel/brunch-agent/packages/core/test/architecture/linear-project-graph.test.ts
libs/@hashintel/brunch-agent/scripts/linear-project-graph.ts
```

## Verification

- ESLint: pass
- Formatting: pass
- TypeScript: pass
- Unit tests: **128/128 pass**
- Build: pass
- `git diff --check`: pass
- Live Linear graph: pass; **0 assignee mismatches**, no cycles
- Repository search: no active `COORDINATION` references outside the archived plan
- Read-only review; no files modified or committed.
```

## Assistant

The final reviewer re-raised two historical references that an earlier pointer audit had deliberately classified as evidence, not live authority. I’m adjudicating that distinction rather than rewriting history mechanically. The likely repair is only to de-link the archived broken path while retaining its historical text; FE-1464’s completed-account mention should remain untouched.

**Tool Use:** `Task`

```json
{
  "prompt": "READ-ONLY adjudication in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent plus live Linear. Do not modify. Claims: (A) docs/archive/migrations/hash-monorepo-import-plan.md:6 is an unacceptable broken active link after COORDINATION deletion; competing explanation: it is historical evidence whose text should remain but need not be clickable. Inspect lines 1-15, 130-145, 170-182 and archive/documentation/link-test policy. Decide whether to de-link, replace, or retain. (B) FE-1464's COORDINATION.md mention needs external pointer repair; competing explanation: it is a completed historical account of commit 0629903 and changing it would falsify history. Inspect exact issue context/state and distinguish operational link from historical mention. Return claim records/evidence and verdicts/recommended smallest action. Do not infer from substring alone.",
  "description": "Adjudicate historical coordination references"
}
```

## User

**Tool Result:** `TU-034Ck6AR07BlPQA3fxhAfY`

```
## Claim A

**Claim:** Archived import plan contains an unacceptable active broken link at line 6.  
**Reliance:** Whether to de-link, replace, or retain it.  
**Competing explanation:** It is preserved historical evidence, intentionally exempt from live-link validation.  
**Evidence:**

- `hash-monorepo-import-plan.md:3–6` declares the plan settles as a record.
- Lines 138 and 177–178 describe `COORDINATION.md` as it existed during cutover.
- `docs/agents/documentation.md` defines `docs/archive/` as settled material without current authority.
- `docs-index.test.ts:44–48` explicitly exempts this exact file as an immutable migration snapshot whose old paths are evidence.
- The target is currently absent, but the exemption is deliberate rather than accidental.

**Verdict:** **WONT-FIX — retain unchanged.** The link is historical evidence, not active navigation. De-linking or redirecting it would alter the archived record.

## Claim B

**Claim:** FE-1464’s `COORDINATION.md` mention requires pointer repair after deletion.  
**Reliance:** Whether to edit the completed Linear issue.  
**Competing explanation:** It records historical chronology around commit `0629903`, rather than providing an operational pointer.  
**Evidence:**

- Live FE-1464 is **Done**, with completion evidence and 172 passing tests.
- Its exact passage says commit `0629903` removed `CONVERGENCE.md` and split responsibilities between bounded `COORDINATION.md` and the specification ledger.
- `COORDINATION.md` appears only as inline code—there is no clickable repository link.
- The surrounding section is “Already resolved threads,” documenting why a historical review finding was stale.
- Current documentation policy requires repairing external **pointers** when paths move; this is a historical mention, not a pointer or instruction to consult the file.

**Verdict:** **WONT-FIX — retain FE-1464 unchanged.** Updating it to reflect the later deletion would falsify the issue’s completed historical account.

**Smallest action:** None. No files or Linear records were modified.
```

## Assistant

The historical-reference findings are adjudicated as intentional evidence, not live pointers: the archived migration snapshot and FE-1464 remain unchanged. The implementation now has no unresolved review findings, so I’m committing the consolidation as one unit.

**Tool Use:** `Task`

```json
{
  "prompt": "COMMIT the verified control-consolidation unit in /Users/lunelson/Code/hashintel/hash. Inspect status first; abort on any unexpected/foreign change. Stage exactly these literal current diff paths and no others:\n- libs/@hashintel/brunch-agent/README.md\n- libs/@hashintel/brunch-agent/docs/INDEX.md\n- libs/@hashintel/brunch-agent/docs/agents/arc-close.md\n- libs/@hashintel/brunch-agent/docs/agents/documentation.md\n- libs/@hashintel/brunch-agent/docs/agents/issue-tracker.md\n- libs/@hashintel/brunch-agent/docs/agents/legibility.md\n- libs/@hashintel/brunch-agent/docs/agents/steering.md\n- libs/@hashintel/brunch-agent/docs/control/COORDINATION.md (deletion)\n- libs/@hashintel/brunch-agent/docs/control/SPEC-LEDGER.md\n- libs/@hashintel/brunch-agent/docs/control/STEERING.md\n- libs/@hashintel/brunch-agent/docs/control/STRATEGY-LOG.md (addition)\n- libs/@hashintel/brunch-agent/docs/specs/plugin-contract.md\n- libs/@hashintel/brunch-agent/packages/core/test/architecture/control-surfaces.test.ts\n- libs/@hashintel/brunch-agent/packages/core/test/architecture/linear-project-graph.test.ts\n- libs/@hashintel/brunch-agent/scripts/linear-project-graph.ts\nDo not use git add ./-A/wildcards. Verify staged set exactly matches and no unstaged slice changes remain. Verify COORDINATION absent, STEERING/STRATEGY log lifecycle tests passed, historical archived references are unchanged, and no unrelated staged files. Commit message: `Consolidate Brunch strategic controls`. Do not push or mutate Linear. Return SHA, stats, post-commit status.",
  "description": "Commit control consolidation"
}
```

## User

**Tool Result:** `TU-034Ck853UC3IPUL1nl6zB5`

```
Committed `921b05858b90ac4b8bd24871dd318341d7556fd9`.

- Stats: 15 files, +554/−495
- Tests: 15 passed
- COORDINATION deleted; STEERING/STRATEGY lifecycle verified
- Archived references unchanged
- Post-commit worktree clean
- No push or Linear mutation performed
```

## Assistant

The consolidation is committed. I’m running the revised arc-close once against its own new lifecycle rules; this should either be a true no-op or expose exactly where the new discipline still fails.

**Tool Use:** `Task`

```json
{
  "prompt": "EXECUTE the canonical arc-close procedure from /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent/docs/agents/arc-close.md after commit 921b05858b90ac4b8bd24871dd318341d7556fd9. Read-only external operations only; no further Linear mutation is approved. Scope: control consolidation, strategy log seed, assignment invariant/audit, FE-1472 assignment already completed. Verify inbox/index, all-issue assignment graph (`--all`), spec-ledger conditional, single STEERING control, strategy-log entry materiality/current IDs/supersession, exceptional roots/soft edges, stale tense/retired COORDINATION active pointers, and no-op behavior. If a durable current truth genuinely requires a repo edit, make the smallest edit, do not stage/commit, and report it; otherwise persist nothing. Run applicable focused tests/status. Return each step and final pass/conditional status.",
  "description": "Validate new control lifecycle"
}
```

## User

**Tool Result:** `TU-034CkADBoGZZkMM79d09g3`

```
Canonical arc-close completed after `921b05858b`.

1. **Inbox/index — PASS**
   - 99 documents covered; all index links resolve.
   - Inbox assets remain valid transient intake.
   - Focused docs-index tests: **7/7 passed**.

2. **Linear registry — PASS**
   - Ran required `linear:graph --all`: 82 open, 0 assignee mismatches, no cycles.
   - All open roots are recognized maps or listed exceptional roots.
   - FE-1472 is assigned to Lu (`a:self`).
   - No Linear writes performed.

3. **Spec ledger — NOT APPLICABLE**
   - No milestone-one obligation or evidence changed.

4. **Current control — PASS / NO-OP**
   - Exactly one `STEERING.md`.
   - Soft edges, gates, proof frontier, and exceptional roots remain current.
   - S-001–S-003 are material, current, monotonically identified, and require no supersession update.

5. **Steering pass — NOT TRIGGERED**
   - No new strategic fact or proof result; no no-op control update persisted.

6. **Tense/pointers — REPAIR REQUIRED AND MADE**
   - Updated `docs/archive/migrations/hash-monorepo-import-plan.md` to settled tense and replaced retired `COORDINATION` active pointers with current `STEERING`.
   - Left **unstaged and uncommitted**, as requested.
   - A second scan found no remaining retired `COORDINATION` pointers outside agent protocol history.

**Remaining external discrepancy:** FE-1476 says the demo scenario is “agreed” while also saying use-case confirmation remains pending. `STEERING` correctly treats confirmation as an active gate. Repair would require an unapproved Linear mutation, so none was made.

**Verification:** graph audit passed; docs-index tests passed; `git diff --check` passed. Formatter excludes this Markdown path. Working tree contains only the one unstaged documentation edit above.
```

## Assistant

The lifecycle check itself passed, but its close agent made one incorrect edit: it rewrote the immutable import snapshot despite our explicit historical-evidence disposition. I’m removing that edit rather than committing it.

It also found a real external inconsistency: FE-1476 calls the scenario “agreed” while the same issue says confirmation is pending. I’ll leave Linear unchanged until you approve that separate body repair.

**Tool Use:** `Task`

```json
{
  "prompt": "EDIT only docs/archive/migrations/hash-monorepo-import-plan.md in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent. The immediately preceding arc-close agent incorrectly changed this immutable historical snapshot after a WONT-FIX adjudication. Compare the current unstaged diff against HEAD commit 921b05858b90ac4b8bd24871dd318341d7556fd9 and reverse every unstaged change in this file exactly, restoring the committed bytes. Do not use broad reset/checkout; apply a precise patch after reading the diff. Do not touch any other file, stage, commit, or Linear. Verify git diff for the file is empty, whole worktree is clean, docs-index tests pass, and git diff --check passes.",
  "description": "Restore immutable archive snapshot"
}
```

## User

**Tool Result:** `TU-034CkDsjiTBE20OYy9D4Av`

```
Restored the file exactly to HEAD bytes.

Verified:
- File diff empty
- Worktree clean
- Docs-index tests: 7 passed
- `git diff --check`: passed

No files staged or committed.
```

## Assistant

**Tool Use:** `Task`

```json
{
  "prompt": "READ-ONLY Linear inspection. Do not modify repo or Linear. Fetch FE-1476 exact title/state/body around every statement that says the demo scenario is agreed and every statement that says use-case confirmation is pending. Given the user's authoritative current fact that the use-case decision will remain outstanding for a while and STEERING treats it as an event-watched non-blocking gate, propose the smallest description-only textual repair that removes contradiction while preserving the issue contract and agent notes. Return exact before/after snippets and whether any other field needs change (expected no).",
  "description": "Prepare FE-1476 repair"
}
```

## User

**Tool Result:** `TU-034CkFUqH9UcNZxIbaNnYu`

```
**FE-1476**
- Title: `Prepare September demo`
- State: `Todo`

**Current body**
```md
The agreed demo scenario is:

1. Present a completed requirements graph (pre-built from a prior elicitation)
2. A reviewer (not the original domain expert) examines the SDCPN built from that graph
3. The reviewer explores provenance ("why was X modelled like Y?")
4. The reviewer updates a section through 3-5 turns of targeted elicitation
5. The net changes accordingly
6. Handoff to optimisation experiments (Chris/Yannis)

Use case to be confirmed by @dm
```

**Smallest description-only repair**

Before:
```md
The agreed demo scenario is:
```

After:
```md
The current demo scenario is:
```

Before:
```md
Use case to be confirmed by @dm
```

After:
```md
Use-case confirmation by @dm remains outstanding; per STEERING, this is an event-watched, non-blocking gate.
```

This preserves the scenario, issue contract, and any agent notes while removing the claim that the scenario is agreed. No other field needs changing. No repository or Linear data was modified.
```

## Assistant

Implemented and committed as `921b05858b`.

- `STEERING.md`: compact current state, 93 lines.
- Added append-only `STRATEGY-LOG.md` with S-001–S-003.
- Removed `COORDINATION.md`.
- Kept `SPEC-LEDGER.md` separate.
- Added lifecycle and assignment audit tests.
- FE-1472 assigned; 82/82 project issues now assigned to you.
- 128 tests, lint, typecheck, and build pass.
- Worktree clean; not pushed.

One Linear repair needs separate approval: change FE-1476 from “The agreed demo scenario” to “The current demo scenario,” clarifying that use-case confirmation remains outstanding. May I apply that description-only edit?

## User

yes

## Assistant

I’ll make only that two-line description repair, preserving the rest of FE-1476 and all other fields.

**Tool Use:** `Task`

```json
{
  "prompt": "EXECUTE the explicitly approved description-only repair on Linear issue FE-1476. Re-read the live issue first. Change exactly:\n- `The agreed demo scenario is:` -> `The current demo scenario is:`\n- `Use case to be confirmed by @dm` -> `Use-case confirmation by @dm remains outstanding; per STEERING, this is an event-watched, non-blocking gate.`\nPreserve every other description byte/Markdown section and do not change title, state, assignee, parent, project, labels, comments, or any other issue. Use a file-based description update. Treat connection failure as unknown; re-read before retry. Afterward re-read and compare before/after, verifying only those two substitutions and unchanged fields. Do not modify repository files. Return concise verification.",
  "description": "Repair FE-1476 scenario wording"
}
```

## User

**Tool Result:** `TU-034CkIXdafvgFj2bSSJV5y`

```
Updated FE-1476 via description file.

Verified:
- Both requested substitutions are live.
- Title, state, assignee, parent, project, and labels unchanged.
- No repository files modified.

Caveat: Linear automatically trimmed the pre-existing terminal space after `@dm`; all other content is unchanged.
```

## Assistant

FE-1476 updated and verified. Only the approved wording changed; Linear also trimmed one trailing space.

## User

we also need to create a linear issue for all the housekeeping we've done in this branch, and mark it as in progress. Then you can use `gt rename <branch-name>` to make this branch match that issue's id and a short slug

## Assistant

I’ll create one outcome-oriented housekeeping issue covering the completed control/documentation migration, assign it to you, mark it In Progress, place it under the appropriate recognized root, then rename the current Graphite branch to `ln/fe-xxxx-<short-slug>`.

**Tool Use:** `skill`

```json
{
  "name": "cli-graphite",
  "arguments": "Rename the current Brunch branch after creating its Linear issue, using `gt rename <branch-name>` and preserving the existing stack/commits."
}
```

## User

**Tool Result:** `TU-034CkL0XWwy2ETsvODIyKv`

```
{
  "content": [
    {
      "text": "<loaded_skill name=\"cli-graphite\">\n# cli-graphite Skill\n\n\n# Graphite Skill\n\n## Prerequisites\n\nBefore first use, verify the CLI is available. If the check fails, tell the\nuser what to install and **stop**.\n\n```bash\ncommand -v gt >/dev/null && echo \"ok: gt\" \\\n  || echo \"MISSING: gt — install with: brew install withgraphite/tap/graphite\"\n```\n\nWork with Graphite (`gt`) for creating, navigating, and managing stacked pull requests.\n\n## Quick Reference\n\n| I want to... | Command |\n|--------------|---------|\n| Create a new branch/PR | `gt create branch-name -m \"message\"` |\n| Add a new commit to current branch | `gt commit create -m \"message\"` (or `gt cc`) |\n| Amend the last commit on current branch | `gt commit amend -m \"message\"` (or `gt ca`) |\n| Navigate up the stack | `gt up` |\n| Navigate down the stack | `gt down` |\n| Jump to top of stack | `gt top` |\n| Jump to bottom of stack | `gt bottom` |\n| View stack structure | `gt ls` |\n| Submit stack for review | `gt submit --no-interactive` |\n| Rebase stack on trunk | `gt restack` |\n| Change branch parent | `gt track --parent <branch>` |\n| Rename current branch | `gt rename <new-name>` |\n| Move branch in stack | `gt move` |\n\n---\n\n## What Makes a Good PR?\n\nIn roughly descending order of importance:\n\n- **Atomic/hermetic** - independent of other changes; will pass CI and be safe to deploy on its own\n- **Narrow semantic scope** - changes only to module X, or the same change across modules X, Y, Z\n- **Small diff** - (heuristic) small total diff line count\n\n**Do NOT worry about creating TOO MANY pull requests.** It is **always** preferable to create more pull requests than fewer.\n\n**NO CHANGE IS TOO SMALL:** tiny PRs allow for the medium/larger-sized PRs to have more clarity.\n\nAlways argue in favor of creating more PRs, as long as they independently pass build.\n\n---\n\n## Branch Naming Conventions\n\nWhen naming PRs in a stack, follow this syntax:\n\n`terse-stack-feature-name/terse-description-of-change`\n\nFor example, a 4 PR stack:\n\n```\nauth-bugfix/reorder-args\nauth-bugfix/improve-logging\nauth-bugfix/improve-documentation\nauth-bugfix/handle-401-status-codes\n```\n\n---\n\n## Creating a Stack\n\n### Basic Workflow\n\n1. Make changes to files\n2. Stage changes: `git add <files>`\n3. Create branch: `gt create branch-name -m \"commit message\"`\n4. Repeat for each PR in the stack\n5. Submit: `gt submit --no-interactive`\n\n### Handle Untracked Branches (common with worktrees)\n\nBefore creating branches, check if the current branch is tracked:\n\n```bash\ngt branch info\n```\n\nIf you see \"ERROR: Cannot perform this operation on untracked branch\":\n\n**Option A (Recommended): Track temporarily, then re-parent**\n1. Track current branch: `gt track -p main`\n2. Create your stack normally with `gt create`\n3. After creating ALL branches, re-parent your first new branch onto main:\n   ```bash\n   gt checkout <first-branch-of-your-stack>\n   gt track -p main\n   gt restack\n   ```\n\n**Option B: Stash changes and start from main**\n1. `git stash`\n2. `git checkout main && git pull`\n3. Create new branch and unstash: `git checkout -b temp-working && git stash pop`\n4. Proceed with `gt track -p main` and `gt create`\n\n---\n\n## Navigating a Stack\n\n```bash\n# Move up one branch (toward top of stack)\ngt up\n\n# Move down one branch (toward trunk)\ngt down\n\n# Jump to top of stack\ngt top\n\n# Jump to bottom of stack (first branch above trunk)\ngt bottom\n\n# View the full stack structure\ngt ls\n```\n\n---\n\n## Modifying a Stack\n\n### Commit vs Amend\n\nGraphite has explicit commit commands that also auto-restack descendants:\n\n```bash\ngit add <files>\ngt commit create -m \"add validation for email field\"  # New commit (preferred)\ngt commit amend -m \"updated commit message\"            # Amend last commit\n# Shorthands: gt cc -m \"...\", gt ca -m \"...\"\n```\n\n**Use `gt commit create` (`gt cc`) by default** unless the user explicitly\nasks to amend or squash. `gt modify` also works (amends by default, `-c` for\nnew commit) but the `gt commit` subcommands are clearer.\n\n### Reorder Branches\n\nUse `gt move` to reorder branches in the stack. This is simpler than trying to use `gt create --insert`.\n\n### Re-parent a Stack\n\nIf you created a stack on top of a feature branch but want it based on main:\n\n```bash\n# Go to first branch of your stack\ngt checkout <first-branch>\n\n# Change its parent to main\ngt track --parent main\n\n# Rebase the entire stack\ngt restack\n```\n\n### Rename a Branch\n\n```bash\ngt rename new-branch-name\n```\n\n---\n\n## Resetting Commits to Unstaged Changes\n\nIf changes are already committed but you want to re-stack them differently:\n\n```bash\n# Reset the last commit, keeping changes unstaged\ngit reset HEAD^\n\n# Reset multiple commits (e.g., last 2 commits)\ngit reset HEAD~2\n\n# View the diff to understand what you're working with\ngit diff HEAD\n```\n\n---\n\n## Before Submitting\n\n### Verify Stack is Rooted on Main\n\nBefore running `gt submit`, verify the first PR is parented on `main`:\n\n```bash\ngt ls\n```\n\nIf the first branch has a parent other than `main`:\n```bash\ngt checkout <first-branch>\ngt track -p main\ngt restack\n```\n\n### Run Validation\n\nAfter creating each PR, run appropriate linting, building, and testing:\n\n1. Refer to the project's CLAUDE.md for specific commands\n2. If validation fails, fix the issue, stage changes, and use `gt cc -m \"fix: ...\"` (or `gt ca` to amend)\n\n---\n\n## Submitting and Updating PRs\n\n### Submit the Stack\n\n```bash\ngt submit --no-interactive\n```\n\n### Update PR Descriptions\n\nAfter submitting, use `gh pr edit` to set proper titles and descriptions.\n\n**IMPORTANT:** Never use Bash heredocs for PR descriptions - shell escaping breaks markdown tables, code blocks, etc. Instead:\n\n1. Use the `Write` tool to create `/tmp/pr-body.md` with the full markdown content\n2. Use `gh pr edit` with `--body-file`:\n\n```bash\ngh pr edit <PR_NUMBER> --title \"stack-name: description\" --body-file /tmp/pr-body.md\n```\n\nPR descriptions must include:\n- **Stack Context**: What is the bigger goal of this stack?\n- **What?** (optional for small changes): Super terse, focus on what not why\n- **Why?**: What prompted the change? Why this solution? How does it fit into the stack?\n\n**Example** (for a PR in a 3-PR stack adding a warning feature):\n\n```markdown\n## Stack Context\n\nThis stack adds a warning on the merge button when users are bypassing GitHub rulesets.\n\n## Why?\n\nUsers who can bypass rulesets (via org admin or team membership) currently see no indication\nthey're circumventing branch protection. This PR threads the bypass data from the server to\nenable the frontend warning (PR 2) to display it.\n```\n\n---\n\n## Troubleshooting\n\n| Problem | Solution |\n|---------|----------|\n| \"Cannot perform this operation on untracked branch\" | Run `gt track -p main` first |\n| Stack parented on wrong branch | Use `gt track -p main` then `gt restack` |\n| Need to reorder PRs | Use `gt move` |\n| Conflicts during restack | Resolve conflicts, then `git rebase --continue` |\n| Want to split a PR | Reset commits (`git reset HEAD^`), re-stage selectively, create new branches |\n| Need to delete a branch (non-interactive) | `gt delete <branch> -f -q` |\n| `gt restack` hitting unrelated conflicts | Use targeted `git rebase <target>` instead (see below) |\n| Rebase interrupted mid-conflict | Check if files are resolved but unstaged, then `git add` + `git rebase --continue` |\n\n---\n\n## Advanced: Surgical Rebasing in Complex Stacks\n\nIn deeply nested stacks with many sibling branches, `gt restack` can be problematic:\n- It restacks ALL branches that need it, not just your stack\n- Can hit conflicts in completely unrelated branches\n- Is all-or-nothing - hard to be surgical\n\n### When to Use `git rebase` Instead of `gt restack`\n\nUse direct `git rebase` when:\n- You only want to update specific branches in your stack\n- `gt restack` is hitting conflicts in unrelated branches\n- You need to skip obsolete commits during the rebase\n\n### Targeted Rebase Workflow\n\n```bash\n# 1. Checkout the branch you want to rebase\ngit checkout my-feature-branch\n\n# 2. Rebase onto the target (e.g., updated parent branch)\ngit rebase target-branch\n\n# 3. If you hit conflicts:\n#    - Resolve the conflict in the file\n#    - Stage it: git add <file>\n#    - Continue: git rebase --continue\n\n# 4. If a commit is obsolete and should be skipped:\ngit rebase --skip\n\n# 5. After rebase, sync graphite's tracking (amend is correct here)\ngt modify --no-edit\n```\n\n### Recovering from Interrupted Rebase (Context Reset)\n\nIf a rebase was interrupted (e.g., Claude session ran out of context):\n\n1. **Check status:**\n   ```bash\n   git status\n   # Look for \"interactive rebase in progress\" and \"Unmerged paths\"\n   ```\n\n2. **Read the \"unmerged\" files** - they may already be resolved (no conflict markers)\n\n3. **If already resolved, just stage and continue:**\n   ```bash\n   git add <resolved-files>\n   git rebase --continue\n   ```\n\n4. **If still has conflict markers**, resolve them first, then stage and continue\n\n### Deleting Branches from a Stack\n\n```bash\n# Delete a branch (non-interactive, even if not merged)\ngt delete branch-to-delete -f -q\n\n# Also delete all children (upstack)\ngt delete branch-to-delete -f -q --upstack\n\n# Also delete all ancestors (downstack)\ngt delete branch-to-delete -f -q --downstack\n```\n\n**Flags:**\n- `-f` / `--force`: Delete even if not merged or closed\n- `-q` / `--quiet`: Implies `--no-interactive`, minimizes output\n\n**After deleting intermediate branches**, children are automatically restacked onto the parent. If you need to manually update tracking:\n```bash\ngt checkout child-branch\ngt track --parent new-parent-branch\n```\n\n\nARGUMENTS: Rename the current Brunch branch after creating its Linear issue, using `gt rename <branch-name>` and preserving the existing stack/commits.\n\nBase directory for this skill: file:///Users/lunelson/.agents/skills/cli-graphite\nRelative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.\n</loaded_skill>",
      "type": "text"
    }
  ]
}
```

## Assistant

**Tool Use:** `Task`

```json
{
  "prompt": "READ-ONLY preparation in /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent. Do not modify repo, Linear, or branch. Read docs/agents/issue-writing.md, issue-tracker.md, triage-labels.md, git-workflow.md, current STEERING exceptional roots, and inspect current branch/status/Graphite stack plus commits since its parent/merge-base. Determine the correct recognized parent/root for one retroactive housekeeping issue covering the work actually done: strategic steering protocol; role-based docs/evaluation topology; Linear path repairs; compact STEERING + append-only strategy log; control/assignment lifecycle tests; assignment invariant. Draft an outcome-oriented Linear issue title and compact root/child-appropriate body following local contract + agent-notes patterns. The issue must be assigned to current user, project brunch-agent, and marked In Progress. Recommend exact short branch slug `ln/fe-xxxx-...` once ID exists. Flag if parent choice is genuinely ambiguous; otherwise justify one. Return current branch, stack relationship, commit list/scope, proposed parent, title, body, labels if required, and exact creation/update/rename sequence.",
  "description": "Draft housekeeping issue"
}
```

## User

**Tool Result:** `TU-034CkL9dS9Jb5R5PKA1paF`

```
## Current state

- **Branch:** `ln/fe-xxxx-whats-next`
- **Worktree:** clean
- **Graphite parent:** `ln/fe-1437-hash-monorepo-import`
- **Merge-base with parent:** parent tip `2bbb3601d5`
- **Relationship:** one child branch, nine commits ahead of FE-1437.

## Commit scope

1. `d4e61bb23b` Add September steering model
2. `c3d29164ab` Register incoming SDCPN nets
3. `d38c17120e` Correct SDCPN corpus inventory
4. `397405a276` Add strategic steering protocol
5. `806714c002` Refine issue, PR, and commit-record precedent
6. `3b4a73f4a7` Organize documentation by role
7. `daf7778bdc` Separate evaluation assets from evidence
8. `28f3e3bfa8` Reconcile control surfaces
9. `921b05858b` Consolidate strategic controls

Collectively these implement the strategic steering protocol, role-based documentation/evaluation topology, repaired Linear/document paths, compact `STEERING.md` plus append-only `STRATEGY-LOG.md`, control and assignment lifecycle tests, and the project assignment invariant.

## Proposed parent

**FE-1401 — Resolve the stack legibility follow-ups**

This is not genuinely ambiguous. FE-1401 is the recognized housekeeping/remediation sweep and already owns documentation and record-quality children such as FE-1424 and FE-1451. The work informs September strategy, but it primarily repairs repository control, documentation, tracker, and verification infrastructure rather than delivering an FE-1357 demo outcome. A closed parent remains valid for this retroactive child and avoids adding another exceptional root.

The Git branch remains stacked on FE-1437 for code-history reasons; tracker hierarchy need not mirror stack ancestry.

## Proposed issue

**Title**

> Keep Brunch strategy and control records coherent

**Body**

```markdown
Brunch’s strategic direction, documentation roles, and Linear ownership rules were spread across overlapping records, which made current priorities and issue reachability difficult to verify. This work establishes one compact strategic control, preserves material decisions in an append-only log, and gives documentation, evaluation assets, and tracker records explicit homes.

The implementation is already present on the current branch. The remaining work is to attach the branch to this tracker record and complete review.

+++ 🏗️ Agent notes

The branch:

- adds the strategic steering protocol;
- organizes documentation by role and separates evaluation inputs from proof evidence;
- repairs moved repository paths referenced by Linear and local control records;
- reduces `docs/control/STEERING.md` to current strategy and moves durable decisions into `docs/control/STRATEGY-LOG.md`;
- adds control-surface and Linear project-graph tests for assignment and lifecycle behavior; and
- enforces that every project issue has the expected accountable human assignment while preserving explicit review for mismatches.

It is stacked on `ln/fe-1437-hash-monorepo-import` and contains commits `d4e61bb23b` through `921b05858b`.

+++
```

## Tracker settings

- **Team:** FE
- **Project:** `brunch-agent`
- **Parent:** FE-1401
- **Assignee:** current user (`Lu Nelson`)
- **State:** In Progress
- **Labels:** none required. This is neither a wayfinder child nor a triage-state issue.

## Exact creation and rename sequence

1. Save the body above outside the repository, for example `/tmp/brunch-strategic-controls.md`.
2. Create the issue atomically:

```sh
linear issue create \
  --team FE \
  --project brunch-agent \
  --parent FE-1401 \
  --assignee self \
  --state "In Progress" \
  --title "Keep Brunch strategy and control records coherent" \
  --description-file /tmp/brunch-strategic-controls.md \
  --no-interactive
```

3. Verify the returned `FE-XXXX` has parent FE-1401, project `brunch-agent`, assignee Lu Nelson, and state In Progress:

```sh
linear issue view FE-XXXX
```

4. If any field was normalized incorrectly, repair only that field with `linear issue update FE-XXXX ...`, then verify again.
5. Rename the Graphite branch:

```sh
gt branch rename ln/fe-XXXX-strategic-controls
```

6. Confirm parentage and cleanliness:

```sh
gt branch info
git status --short --branch
```

No repository, Linear, or branch state was modified.
```

## Assistant

The branch is clean, nine commits above FE-1437. The best semantic parent appears to be FE-1401, the existing housekeeping/legibility sweep, though it is already closed; I’m checking the local child-label rule and whether an open child under that closed map is an accepted precedent before creating anything.

**Tool Use:** `Task`

```json
{
  "prompt": "READ-ONLY final tracker-shape check. Do not modify Linear or repo. Inspect local docs/agents/issue-writing.md and issue-tracker.md plus live FE-1401, FE-1383, FE-1357 (states, parent/root role, children, issue contract), and similar recent retroactive housekeeping issues. Answer: (1) whether a new In Progress child under Done parent FE-1401 is valid local precedent or creates graph/status incoherence; (2) whether FE-1383 or FE-1357 is a better active recognized root for this control/documentation housekeeping branch; (3) whether `dogsled:unframed` or another label is mandatory for any child issue under current local guidance; (4) exact creation settings. Prefer the narrowest semantically correct parent without creating a new exceptional root.",
  "description": "Validate housekeeping issue parent"
}
```

## User

**Tool Result:** `TU-034CkNG46pXnmcqfsCDWFX`

```
## Verdict

1. **Do not add an In Progress child under Done FE-1401.**  
   FE-1401 was a bounded legibility follow-up sweep and is complete; all existing children are Done. Reopening its graph with active work would create status/semantic incoherence, not useful precedent.

2. **Use FE-1383 as parent.**  
   This branch consolidates repository controls, documentation topology, verification, and tracker graph enforcement—the implementation/build substrate governed by FE-1383. FE-1357 is narrower: September demo and plugin-specification work. FE-1383 is the narrowest active recognized root.

3. **No label is mandatory.**  
   `dogsled:unframed` is not required or mentioned by local guidance. Labels are role-specific:
   - `ready-for-agent` only when fully specified for autonomous pickup.
   - Wayfinder labels only for wayfinder children.
   - Other triage roles follow `triage-labels.md`.
   
   For this retroactive already-implemented branch, use **no label**.

4. **Exact creation settings**
   - Team: `FE`
   - Project: `brunch-agent`
   - Parent: `FE-1383`
   - Assignee: `self`
   - State: `In progress`
   - Cycle: current (`Cycle 105`)
   - Priority: none
   - Labels: none
   - Title: active verb describing the concrete consolidation
   - Description: mandatory plain-prose contract, followed by optional collapsed `🏗️ Agent notes` execution record
   - Create parent atomically with the issue, then verify project, parent, and assignee.

```sh
linear issue create \
  --team FE \
  --project brunch-agent \
  --parent FE-1383 \
  --assignee self \
  --state "In progress" \
  --cycle active \
  --title "<active-verb title>" \
  --description-file <file>
```

No Linear or repository state was modified.
```

## Assistant

FE-1401 is already a completed bounded sweep, so adding active work beneath it would reopen a closed graph. I’ll instead parent this under active build root FE-1383, with no special label, assign it to you, place it in the active cycle, and then rename the current branch with the returned issue ID.

**Tool Use:** `Task`

```json
{
  "prompt": "EXECUTE the explicitly approved Linear issue creation and Graphite branch rename from /Users/lunelson/Code/hashintel/hash/libs/@hashintel/brunch-agent.\n\nPreflight:\n- Verify worktree clean, current branch is `ln/fe-xxxx-whats-next`, Graphite parent is `ln/fe-1437-hash-monorepo-import`, and `gt` exists. Stop if any differs materially.\n- Read current issue fields/cycle names as needed; do not alter existing issues.\n\nCreate one Linear issue using a description file outside the repo with these exact settings:\n- Team: FE\n- Project: brunch-agent\n- Parent: FE-1383\n- Assignee: self (Lu Nelson)\n- State: In Progress\n- Cycle: active/current cycle\n- Priority: none/default\n- Labels: none\n- Title: `Keep Brunch strategy and control records coherent`\n\nBody:\n```markdown\nBrunch’s strategic direction, documentation roles, and Linear ownership rules were spread across overlapping records, which made current priorities and issue reachability difficult to verify. This work establishes one compact strategic control, preserves material decisions in an append-only log, and gives documentation, evaluation assets, and tracker records explicit homes.\n\nThe implementation is already present on the current branch. The remaining work is to attach the branch to this tracker record and complete review.\n\n+++ 🏗️ Agent notes\n\nThe branch:\n\n- adds the strategic steering protocol;\n- organizes documentation by role and separates evaluation inputs from proof evidence;\n- repairs moved repository paths referenced by Linear and local control records;\n- reduces `docs/control/STEERING.md` to current strategy and moves durable decisions into `docs/control/STRATEGY-LOG.md`;\n- adds control-surface and Linear project-graph tests for assignment and lifecycle behavior; and\n- enforces that every project issue has the expected accountable human assignment while preserving explicit review for mismatches.\n\nIt is stacked on `ln/fe-1437-hash-monorepo-import` and contains commits `d4e61bb23b` through `921b05858b`.\n\n+++\n```\n\nUse file-based creation. On connection failure, treat outcome as unknown and query before retry. Verify the resulting issue title/body, project, parent, assignee, state, cycle, priority, and labels. Do not add a comment or alter other issues.\n\nThen derive the branch name `ln/<lowercase-issue-id>-strategic-controls` (example `ln/fe-1490-strategic-controls`) and run exactly `gt rename <new-branch-name>` from the current branch. Do not use plain git branch rename. Verify current branch name, Graphite parent/stack relationship, commits unchanged, and worktree clean. Do not submit/push or create/edit a PR. Remove the temporary description file. Return issue ID/URL/settings, old->new branch, Graphite parent, and verification.",
  "description": "Create issue and rename branch"
}
```

## User

**Tool Result:** `TU-034CkPZxCL4KjzaHsrBpRj`

```
Created Linear issue **FE-1494**:  
https://linear.app/hash/issue/FE-1494/keep-brunch-strategy-and-control-records-coherent

Verified:
- Team FE; project `brunch-agent`; parent FE-1383
- Assignee Lu Nelson; state In Progress
- Active Cycle 105; default priority; no labels
- Exact title/body preserved (Linear normalized bullets)

Renamed via Graphite:
- `ln/fe-xxxx-whats-next` → `ln/fe-1494-strategic-controls`
- Parent remains `ln/fe-1437-hash-monorepo-import`
- Commits and HEAD unchanged
- Worktree clean; temporary file removed
- No push, submission, PR changes, comments, or other issue edits.
```

## Assistant

Created [FE-1494](https://linear.app/hash/issue/FE-1494/keep-brunch-strategy-and-control-records-coherent), assigned to you and In Progress.

Branch renamed to `ln/fe-1494-strategic-controls`; stack parent and commits are unchanged.