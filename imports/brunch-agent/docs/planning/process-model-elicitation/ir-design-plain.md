# The intermediate representation, in plain language

> This is a plain-prose rendering of [`ir-design.md`](./ir-design.md), written for review reading. It makes the same content commitments as the original, which remains the authoritative document. The rendering pass doubled as a review instrument: seven places where the source resisted plain rendering are recorded as findings on FE-1401 (third accrual), the load-bearing one being the loss report's unresolved unit of loss (capture vs. capture-facet).

This design was resolved on 13 August 2026 and ratified on worked examples by FE-1397. It has two layers. Layer A defines what an intermediate representation (IR) is for any plugin. Layer B is the concrete design for the CPS plugin — the design the September demo will run on. The design draws on the kernel spec, the Petrinaut survey's format facts, Dora's PRO-98 ontology, the open-questions document, and the FE-1363 use-case resolution.

## Layer A — what the IR is

The intermediate representation of a target-document is the set of active captures, read through the plugin's declared payload type system. There is no second store. Every consolidated view — an entity graph, a net, a completion table — is computed at read time as a projection over the active captures. The rendered artifact is itself one projection of the IR; it is never the IR.

The harness's half of a capture is already fixed by the kernel spec: an envelope holding the capture's id, its evidence spans, its epistemic status, its confidence, a value or an explicit absence, any alternatives, and supersession links. The payload inside that envelope is opaque to the harness. Defining a plugin's IR therefore means defining its payload type system, and nothing more.

Every plugin's payload type system must satisfy five properties.

First, it declares a closed, named catalog of assertion kinds, as namespaced concept declarations. The assurance plugin declares its `Statement` kinds, Gherkin its scenario and rule records, and CPS the ten-kind catalog in Layer B below.

Second, each payload holds one assertion, at the resolution the evidence states it. In the primary case the evidence is the user's utterance, so the payload holds what the user said at the resolution they said it. When a capture is defaulted or comes from an external lookup, the declared default or the documented transformation sets the resolution instead. One utterance may yield several captures, because granularity is per assertion, never per utterance. A user who happens to speak in artifact-shaped units does not violate the property; that is coincidence. Factoring assertions into artifact-shaped elements is the projection function's job, so the interviewer never does the artifact's modelling work in the middle of a conversation.

Third, the IR is independent of its projections. Kinds are defined in the domain's own vocabulary, and the IR may legitimately hold kinds that no current projection consumes; the typed loss report is what keeps that honest. The loss-report clause is the part that can be enforced. The vocabulary clause bites in proportion to the distance between the domain and the target format, and where the target format is the domain — as with Gherkin — it degenerates gracefully rather than failing.

Fourth, relations between captures are payload data, never envelope structure. A plugin that needs structure declares its own reference or edge vocabulary, as the assurance plugin does with its four edge kinds and CPS does with symbolic name references.

Fifth, domain labels and rollups are derived at read time by the projection function. They are never stored.

Beyond these requirements, the design grades three recommended patterns and one escape hatch, with the grades set by the FE-1397 worked-examples exercise. Plugins should use symbolic, name-based references between payloads and let `reconcile` resolve identity at read time: all four worked designs use this pattern, it matches how experts talk, and it survives supersession without leaving dangling edges, so a plugin that departs from it should say why. Plugins may declare completion-anchor kinds — a distinct purpose or objective kind where the domain has explicit purposes, or existing purpose-shaped kinds where it does not, such as Gherkin's feature narrative and rules or the assurance plugin's goal. The pattern is that completion anchors on purpose-bearing captures, not that every plugin declares a kind named objective. Process-shaped domains may add a source-regime attribute, `prescribed` or `practiced`, to every kind. There is one model, never parallel models: where prescription and practice diverge, the divergence surfaces as an ordinary typed conflicting issue. Regime composes with epistemic status rather than duplicating it, because the difference between log-observed and expert-believed practice is already the envelope's `external-lookup` versus `explicit`. Finally, non-load-bearing motif annotations — hints a projection may take but never depend on — survive only as a named escape hatch: no worked design used them, so the name is retained until a projection demonstrably needs the hint.

Layer A was at first conditionally ratified. FE-1397 discharged the condition by drafting speculative payload designs across three plugin targets at different complexity levels — Gherkin (thin), CPS (thick; Layer B here), and BPMN with process mining (mid) — and reading the assurance plugin as a free fourth corroborant, then checking every property against all four. All five properties survived, with the second and third amended into the wording above. The expected pressure for plugin content to migrate into the shared layer did materialize, but as a pattern promotion — source-regime moved from Layer B up to Layer A — and not as any kind moving into the envelope. Everything here is desk-validated only. No example has yet run through a working harness, so every Layer-A claim stays provisional until the September build exercises them.

## Layer B — the CPS plugin's IR

Layer B is a working design, validated only against the truck-fleet reference case. The worked-examples exercise left it unchanged, except that it exported source-regime up to Layer A. The harness still gets its turn.

The plugin declares ten kinds of assertion:

| # | Kind | Holds | Projects to (Petrinaut) |
|---|------|-------|-------------------------|
| 1 | **entity-type** | object types and their attributes, incl. continuous state variables (truck, component, wear level) | colours + typed elements |
| 2 | **boundary-condition** | initial populations, arrival/departure rates, external inputs ("40 trucks, 3 bays", initial wear distribution) | scenario `initialState` + `scenarioParameters` |
| 3 | **activity** | steps *as the expert states them*: actors, resources, preconditions, outcomes, duration | factored transitions (see granularity rule) |
| 4 | **ordering/flow** | sequencing, branching, trigger conditions | arcs, guards, arc types (read/inhibitor) |
| 5 | **policy** | decision rules at choice/conflict points | guard/priority code where compilable; mostly IR-only |
| 6 | **dynamics** | continuous evolution laws (wear accumulation) | differential equations on real-valued colour elements |
| 7 | **objective** | questions the model must answer; goals; penalty weights | metrics where expressible as scalars over simulation state; weights IR-only |
| 8 | **constraint** | regulatory/business rules, conservation laws | guards partially; references IR-only |
| 9 | **data-binding** | model variable ↔ data feed | nothing today (Live Mode unimplemented) |
| 10 | **validation-criterion** | how we would know the model is right | nothing today |

Kinds 1 to 6 bear on the net: they project into Petri-net structure. Kinds 7 to 10 are partly or wholly IR-only. That split is the demo's story. The net is one projection of the elicited description, and what the net cannot hold is neither lost nor hidden: it stays in the IR with its provenance, and the loss report says so. Dora's ontology corroborates the split independently — her Maps-to column places constraints, policies, and penalty weights in the intermediate representation, and routes objectives to the simulation and experiment layer, which is to say to metrics.

Three things attach across kinds and are deliberately not kinds themselves. Quantities — durations, rates, probabilities, capacities — can attach to any kind; they are elicited as quantiles, never as a minimum, mode, and maximum; and the shared or tunable ones project to Petrinaut parameters. A rationale can attach to every kind, never only to objectives. And source-regime marks every capture as prescribed or practiced: the process as the manuals state it versus the process as it actually runs. There is one model, not two parallel ones. A divergence between the regimes surfaces as an ordinary typed conflicting issue, and such a divergence is elicitation gold — the rules nobody wrote down — not an error state.

**The granularity rule.** Dora's claim that steps become transitions and the states between them become places survives, with a correction: it is a projection rule, not a storage rule. The IR stores activities at the granularity the expert stated them, durations included. Petrinaut has no timing field of any kind, so a timed step cannot become a single transition. The projection function therefore owns the factoring — for example into a start transition, an in-progress place, and an end transition, or into rate code. If the IR stored net-granularity elements instead, every change to the factoring would masquerade as a change to what the expert said, and the interviewer would be doing net modelling in the middle of the conversation.

**Motifs.** The motif quiver — small parameterised process patterns with variant selectors — lives in the ElicitationPack as question guidance only: motifs may scaffold the interviewer's questions, but they never generate model structure. This follows the literature verdict. The September payload carries no motif vocabulary; if a projection ever demonstrably needs a motif hint, Layer A's escape hatch exists for that. Per-object-type templates appear nowhere in the design.

**Completion.** The plugin commits to question-relative completion. The objective captures anchor the completion contract — the document is complete when every objective has its supporting kinds covered — over a small static floor: at least one objective, the entities, and a happy-path flow. The interview therefore opens on objectives. This operationalizes the earning test, under which the model gains stochasticity and colour only where an objective demands them, and it replaces a static ordering of categories with that purpose-driven form.

### Projection to Petrinaut

The projection emits all four surfaces of the Petrinaut file: the net structure (places, transitions, colours, differential equations, arcs), the scenario, the metrics, and the parameters. The scenario is mandatory, because a bare net loads with an empty marking and does nothing when simulated. The Optuna optimization file format is excluded for September: its ontology is itself still moving — Yannis is working on it, and his design is a candidate future input — so penalty weights stay IR-only and appear in the loss report.

The loss report is typed and per-capture. Every active capture lands in exactly one of seven categories: mapped exactly, normalized, approximate, collapsed, omitted, defaulted, or unrepresentable. The kind catalog implies the first cut. Entity types and dynamics map exactly, with names normalized. Boundary conditions map to scenario content. Activity structure is normalized, and durations are approximate because they become rate code. Orderings map exactly. Policies land as approximate or collapsed, and their rationale is unrepresentable. Objectives normalize to metrics where a scalar over simulation state can express them; their penalty weights and rationale are unrepresentable. Constraints collapse partially, with regulatory references unrepresentable. Data bindings and validation criteria are wholly unrepresentable. This assignment is a first cut and illustrative only: the plugin spec owns the binding table, while the mechanism itself — per capture, seven categories — is settled.

Two further rules govern what the projection prefers and how it names things. The net projects the practiced process: where prescribed and practiced diverge unresolved, practiced wins, and the prescribed reading lands in the loss report as omitted. And the IR keeps the expert's names verbatim, because payloads are evidence-faithful, while the ProjectionPack owns a deterministic scheme that turns those names into PascalCase identifiers. The scheme is necessary because place names function as identifiers inside every code surface of the file — guards, kernels, differential equations, metrics — and import does not validate them. The ProjectionPack emits the resulting name map as projection metadata for the demo shell to display, and records any collision renames as normalized.

Provenance stays outside the file. The Petrinaut format has no fields for provenance, rationale, confidence, or draft status anywhere, and it strips unknown keys on import, so inline annotation cannot round-trip. Everything IR-only is therefore honestly unrepresentable in the artifact, and displaying provenance is the demo shell's job — never something smuggled into the file.

### The September minimum

The schema holds all ten kinds. The demo requires captures in seven of them — the six net-bearing kinds plus objective: entity-type, boundary-condition, activity, ordering/flow, policy, dynamics, and objective. Constraint, data-binding, and validation-criterion are present in the schema and may be sparsely populated; even at two captures each, their presence tells the story that the net is one projection of a richer description.

The open-questions document also asked what else lives outside the net. Two answers: initial and boundary conditions — populations, arrival rates, external inputs — which bind to the scenario rather than to net structure; and user identity as metadata that shapes the elicitation, which belongs to the harness rather than to the payload, following Dora's ontology.
