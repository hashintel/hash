# Intermediate representation — design (FE-1364)

Resolved 2026-08-13 (FE-1364 grilling session). Two layers: a general, architecture-level
definition of the IR — **ratified on worked examples** (FE-1397), see the status note — and the
CPS plugin's specific payload design, the September working design. Inputs: the kernel spec
(§5, §6, §11), the Petrinaut survey's format facts, Dora's PRO-98 ontology (its Maps-to column),
the open-questions doc §7, and the FE-1363 use-case resolution. Layer-A amendments from the
worked-examples exercise are marked *(amended FE-1397)*; the exercise itself is
[`ir-worked-examples.md`](./ir-worked-examples.md).

## Layer A — what "the IR" is, architecturally

**Definition.** The intermediate representation of a target-document is the set of active
captures, read through the plugin's declared payload type system. There is no second store:
every consolidated view — an entity graph, a net, a completion table — is a read-time
projection over active captures. The rendered artifact is one projection of the IR, never the
IR itself.

The harness half is already fixed by the kernel spec: each capture is an envelope (id, evidence
spans, epistemic status, confidence, value-xor-absence, alternatives, supersession) around an
opaque plugin payload. Defining an IR is therefore defining a payload type system.

**What a plugin's payload type system must do** (durable, cross-plugin):

1. **Declare a closed, named catalog of assertion kinds** (namespaced concept declarations).
   Assurance: `Statement` kinds; Gherkin: scenario/step records; CPS: the catalog below.
   *(already spec canon, §11.1)*
2. **Evidence granularity.** Each payload is one assertion at the resolution the evidence
   states it — the user's utterance in the primary case, the declared default or documented
   transformation for `defaulted` / `external-lookup` captures. One utterance may yield several
   single-assertion captures (granularity is per-assertion, never per-utterance), and a user
   who happens to speak in artifact-shaped units is coincidence, not violation. Factoring into
   artifact-shaped elements belongs to `project`; the interviewer never does the artifact's
   modelling work mid-conversation. *(new in this decision; amended FE-1397 — generalized from
   statement granularity for log-derived captures)*
3. **Projection-independence.** Kinds are defined in domain vocabulary, and the IR may
   legitimately hold kinds no current projection consumes — the typed loss report is what keeps
   that honest. The second clause is the enforceable content: the property's bite is
   proportional to domain–format distance, and where the target format *is* the domain
   (Gherkin), the vocabulary clause degenerates gracefully rather than failing. *(new in this
   decision; amended FE-1397)*
4. **Relations are payload data, not envelope structure.** A plugin needing structure declares
   its own reference/edge vocabulary (assurance's four edge kinds; CPS's symbolic name
   references). *(already spec canon, §5)*
5. **Domain labels and rollups derive at read time via `project`, never stored.**
   *(already spec canon, §5, §13.3)*

**Recommended patterns** (graded per FE-1397):

- **SHOULD** *(promoted from MAY, FE-1397 — all four worked designs use it)*: symbolic,
  name-based references between payloads, with `reconcile` doing identity resolution at read
  time — matches how experts talk and survives supersession without dangling edges. A plugin
  departing from it should say why.
- **MAY**: **completion-anchor kinds** for a question-relative completion contract — a distinct
  purpose/objective kind where the domain has explicit purposes (CPS, BPMN), existing
  purpose-shaped kinds otherwise (Gherkin's feature narrative + rules; assurance's `goal`).
  *(amended FE-1397 — the pattern is "completion anchors on purpose-bearing captures", not
  "declare a kind named objective")*
- **MAY**, for process-shaped domains *(added FE-1397, promoted from Layer B)*: a
  **source-regime** attribute (`prescribed | practiced`) on every kind — one model, never
  parallel models; divergence surfaces as ordinary typed `conflicting` issues; regime composes
  with (never duplicates) epistemic status, so log-observed vs. expert-believed practice is
  already the envelope's `external-lookup` vs. `explicit`.
- **Named escape hatch only** *(demoted FE-1397 — zero uptake across all four designs)*:
  non-load-bearing pattern/motif annotations that projection may take hints from but never
  depend on; retained as a name pending a projection that demonstrably needs the hint.

**Status: ratified on worked examples** (Lu, 2026-08-13, FE-1397). The ratification condition —
speculative payload designs across at least three plugin targets at different complexity levels,
checked property by property — is discharged in
[`ir-worked-examples.md`](./ir-worked-examples.md): Gherkin (thin), CPS (thick, this document's
Layer B), BPMN/process-mining (mid), with the assurance plugin (spec §13.2) as a fourth free
corroborant. All five MUST properties survive — 2 and 3 amended as worded above — and the
expected sublimation pressure — a payload-level concept proving so universal it rises out of
plugin space, in the strongest case into the harness envelope itself — materialized as pattern
promotion (source-regime moving Layer-B → Layer-A) rather than any kind moving into the
envelope. Everything remains **desk-validated
only**: Layer-A claims stay provisional until real examples run through a working harness — the
September build exercises that.

## Layer B — the CPS plugin's IR

A working design, validated only against the truck-fleet reference case (FE-1363). The
worked-examples exercise (FE-1397) left it unbent — its one export is source-regime, promoted to
a Layer-A pattern — but the harness still gets its turn.

### Assertion kinds

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
| 9 | **data-binding** | model variable ↔ data feed | nothing today (Live Mode — Petrinaut's named-but-unimplemented mode for driving a running simulation from external data feeds — is the surface this kind would project to) |
| 10 | **validation-criterion** | how we would know the model is right | nothing today |

Kinds 1–6 are **net-bearing**; 7–10 are partly or wholly **IR-only**. That split is the demo's
story: the net is one projection of the elicited description, and what the net cannot hold is
neither lost nor hidden — it is in the IR with provenance, and the loss report says so.
(Corroborated independently: Dora's Maps-to column marks constraints, policies, and penalty
weights as living "in the intermediate representation", and routes objectives to the
simulation/experiment layer — i.e. metrics.)

**Attribute patterns** (cross-kind, deliberately not kinds):

- **quantity** — durations, rates, probabilities, capacities; quantile-elicited (never
  min/mode/max — per FE-1360's literature verdict: the TU Delft/EFSA quantile line, plus one
  published comparison in which the min/mode/max triangular habit overstated a measured mean by
  ~69%; a single study, but the quantile prescription stands on the protocol line independently),
  attachable to any kind; shared/tunable quantities project to `parameters` (which quantities
  earn a named parameter rather than an inline value is undefined here — the plugin spec's
  binding table owns that criterion).
- **rationale** — available on every kind, never only under objective.
- **source-regime** — `prescribed | practiced` on every kind (manuals vs. how it actually
  runs). One model, not parallel models; a prescribed/practiced divergence surfaces as an
  ordinary typed `conflicting` issue — which is elicitation gold ("rules nobody wrote down"),
  not an error state.

### Granularity rule (Dora's claim #2, validated with correction)

"Steps become transitions; states between become places" survives as a **projection** rule,
not a storage rule. The IR stores activities at the expert's statement granularity, durations
included. Petrinaut has no timing field of any kind — a timed step cannot be one transition —
so `project` owns the factoring (e.g. start-transition → in-progress place → end-transition,
or rate code). If the IR stored net-granularity elements, every factoring change would
masquerade as a knowledge change and the interviewer would be doing net modelling
mid-conversation.

### Motifs

The motif quiver (small, parameterised, variant selectors) lives in the **ElicitationPack as
question guidance only** — scaffold-yes, generator-no, per the literature verdict. No motif
vocabulary in the payload for September; the optional non-load-bearing annotation pattern
(Layer A) exists if projection ever demonstrably needs the hint. Per-object-type templates
live nowhere.

### Completion

The CPS plugin commits to **question-relative completion**: `objective` captures anchor the
completion contract — every objective has its supporting kinds covered — over a small static
floor (at least one objective; entities; a happy-path flow). The interview therefore opens on
objectives. This operationalizes the earning test (stochasticity and colour only where an
objective demands them — the open-questions doc's criterion for model complexity) and is the
corrected form of a static category ordering: Dora's PRO-98 strategy outline prescribes a fixed
category sequence for the interview; question-relative completion keeps its coverage intent but
replaces the fixed sequence with objective-driven coverage, so ordering emerges from what the
objectives demand rather than from the ontology's own layout.

### Projection to Petrinaut

- **Emission surfaces**: all four in-file surfaces — net structure (places, transitions,
  colours, ODEs, arcs), **scenario** (mandatory: a bare net loads with an empty marking and
  does nothing when simulated), **metrics**, **parameters**. The Optuna/optimization file
  format (`petrinaut-optimization`) is **excluded for September**: its ontology is itself in
  flight (Yannis is working on it; his design is a candidate future input). Penalty weights
  stay IR-only and appear in the loss report.
- **Typed loss report**: per-capture; every active capture lands in exactly one of
  `mapped-exactly / normalized / approximate / collapsed / omitted / defaulted /
  unrepresentable`. The table above implies the first cut: entity-types and dynamics map
  exactly (names normalized); boundary-conditions map to scenario content; activity structure
  is normalized with durations approximate (rate code); orderings map exactly; policies are
  approximate/collapsed with rationale unrepresentable; objectives normalize to metrics where
  scalar-expressible, with penalty weights and rationale unrepresentable; constraints collapse
  partially with regulatory references unrepresentable; data-bindings and validation-criteria
  are unrepresentable. **First cut, illustrative** — the binding table is owned by the plugin
  spec; the mechanism (per-capture, seven categories) is resolution-grade.
- **Regime rule**: the net projects the **practiced** process. Where prescribed and practiced
  diverge unresolved, practiced wins and the prescribed reading lands as `omitted` in the
  report.
- **Naming discipline**: IR payloads keep expert-language names verbatim (evidence-faithful).
  The ProjectionPack owns a deterministic name→PascalCase identifier scheme, emits the name-map
  as projection metadata for the demo shell to display, and records collision renames as
  `normalized`. The failure mode this prevents: place names are identifiers inside every code
  surface (guards, kernels, ODEs, metrics) and import does not validate them, so an
  inconsistent rename leaves code referencing identifiers that no longer resolve — nothing
  catches it at import time; it surfaces only when simulation misbehaves.
- **Provenance stays outside the file.** The Petrinaut format has no provenance, rationale,
  confidence, or draft-ness fields anywhere, and unknown keys are stripped on import (inline
  annotation is explicitly not round-trippable). Everything IR-only is honestly
  `unrepresentable` in the artifact; provenance display is the demo shell's job, never
  smuggled into the file.

### September minimum (the open-questions doc's §7.2, answered)

The schema holds all ten kinds. The demo requires captures in the seven net-bearing-plus-
objective kinds (entity-type, boundary-condition, activity, ordering/flow, policy, dynamics,
objective); constraint, data-binding, and validation-criterion are schema-present and may be
sparsely populated — their presence *is* the "net is one projection" story even at two
captures each.

§7.1 asked what else belongs on the lives-outside-the-net list: **initial/boundary conditions**
(populations, arrival rates, external inputs — scenario-bound, not net-bound) and **user
identity as elicitation-shaping metadata** (Dora's ontology; harness-side, not payload).
