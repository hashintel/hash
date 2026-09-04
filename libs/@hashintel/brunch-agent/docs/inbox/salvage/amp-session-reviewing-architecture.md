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

| Layer                                                              | Readiness                                                        | Critical-path judgment                                |
| ------------------------------------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------- |
| Ask/suspend/transport                                              | Mechanically substantial                                         | Foundation ready; broader affordances are deferrable  |
| Sweep/capture/provenance                                           | Mechanically substantial                                         | Foundation ready, but not yet usable for revision     |
| Model-aware elicitation loop                                       | Absent                                                           | **Critical**                                          |
| Register-2 fold/model                                              | Design only                                                      | **Critical**, in a deliberately narrow CPS form       |
| CPS plugin                                                         | Absent                                                           | **Critical**                                          |
| SDCPN projection                                                   | Design only and contested                                        | **Critical design decision**                          |
| Petrinaut document application                                     | Ask-only local tracer                                            | **Critical**, but its correct mechanism is unresolved |
| Existing-document/reviewer session                                 | Domain primitives exist; host collapses document to conversation | **Critical** for FE-1476                              |
| Artifact provenance and scoped re-elicitation                      | Store primitives only                                            | **Critical** for FE-1478/1479                         |
| Generic plugin authoring, completion, loss reporting, full catalog | Design only                                                      | Mostly deferrable unless selected by the demo story   |
| Public durability/security/deployment                              | Partial                                                          | Critical only after the functional loop exists        |

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
