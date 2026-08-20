# Spec: the plugin contract — two schemas, two tables

Status: **provisional** — desk-validated on baseline transcripts and cross-plugin thumbnails.
Ratification condition (inherited from [ADR-0003](../../adr/0003-three-register-ir.md)): a full
FE-1397-style worked pass across at least three plugin targets. Until the September build
exercises a real fold, everything here is design, not demonstrated behavior.
Decided on: FE-1405 (the payload-interiors session, 2026-08-18); inputs were that session's
working draft and its pseudo-YAML structural rendering, which collapse into this document.

## Problem Statement

The elicitation system needs to work across domains: cyber-physical process models (the
September target), BDD/Gherkin feature specification, formal verification, and domains not yet
named. Today there is no defined answer to "what is a plugin?" — the capture envelope
(FE-1383, the build root: capture store and envelope semantics) says how evidence is stored,
and the ratified IR design says captures are typed, but nothing says what a domain author must
write down to make the machinery elicit *their* domain, and nothing turns a pile of typed
captures into the thing the user actually wants: a model of their plant, their feature, their
system.

Three people feel this as a problem:

- **The plugin author** has no contract. Every new domain looks like it needs bespoke
  machinery — its own assembly logic, its own completion logic, its own follow-up-question
  logic — which makes plugin authoring an engineering project instead of a declaration, and
  makes example plugins unreadable as examples.
- **The analyst running an elicitation** cannot ask "is this model complete enough to answer
  my objective?" of a bag of captures. Completion questions are questions about a *model* —
  which activities lack duration distributions, which resources are uncounted — and no model
  exists to ask them of.
- **The reviewer** cannot audit semantic judgments. If "half a shift" becomes "4 hours"
  somewhere inside a read path, the interpretation happened invisibly: unattributable,
  unsupersedable, unreproducible.

## Solution

A plugin is **two schemas and two small tables**, all declarative:

1. declare your domain's node kinds and their slots (the **model schema**);
2. declare the utterance-shaped typed proposals that fill them (the **proposal catalog**),
   annotating each with how to elicit it;
3. say how proposals fold into slots (the **fold table** — almost always empty, because fold
   rules derive from the slot declarations);
4. say what your completion anchors demand (the **demand table**).

Everything else is harness machinery explained once: a pure fold derives the elicited model
from active captures (ADR-0003's register 2), slot states report what is known, absent,
conflicted, or diverged, grades gate promotion, identity resolves by union-find over recorded
same-as assertions, and follow-up questions fire mechanically off slot states. Semantic
interpretation happens only at write time, in the sweep, where every bridge is deposited as a
contestable capture.

For the plugin author this means writing YAML, not code (code remains only in validators and
projections). For the analyst it means completion computes over model slots, not capture
counts. For the reviewer it means every model part answers "which captures made you."
The readability oracle for the whole design: someone who has read the Gherkin plugin should be
able to write a third plugin by analogy in a sitting.

## User Stories

1. As a plugin author, I want to declare my domain as node kinds with slots, so that the
   harness derives the model shape without me writing assembly code.
2. As a plugin author, I want a catalog of typed proposals whose interiors I compose from a
   standard library of stated-form families, so that I don't reinvent "how experts state
   quantities" for every domain.
3. As a plugin author, I want fold rules derived from my slot declarations by default, so that
   I only write fold-table rows for genuine exceptions.
4. As a plugin author, I want to annotate each proposal type with an elicitation technique and
   a mechanical firing condition, so that "which technique does this field force?" is a
   completeness check over one column.
5. As a plugin author, I want to declare grade orders per slot — referencing a library ladder
   or declaring my own composition ladder — so that my domain's notion of "more pinned down"
   drives promotion without new machinery.
6. As a plugin author writing a thin plugin (Gherkin), I want the registers to collapse
   gracefully, so that I never pay the thick plugin's ceremony.
7. As a new plugin author, I want to read the Gherkin example and write my own plugin by
   analogy in a sitting, so that plugin authoring is tractable without harness expertise.
8. As a domain expert being interviewed, I want my hedged, low-grade statements ("about
   3 hours") captured honestly rather than refused or hardened, so that the record reflects
   what I actually said.
9. As a domain expert, I want to say "I don't know" or "we don't track that" and have it
   recorded as a first-class absence, so that I'm not re-asked what I've already disclaimed.
10. As a domain expert, I want to state a uniformity once ("same everywhere, same crew") and
    have it cover everything in scope, so that I'm not interrogated per instance.
11. As a domain expert, I want to correct myself ("flag that as one I got wrong") and have the
    correction supersede — not overwrite — the original, so that my history stays honest.
12. As an analyst, I want the elicited model in the expert's vocabulary with every slot in a
    definite state (unaddressed / stated-at-grade / absent / conflicted / diverged), so that I
    can see at a glance what the elicitation has and lacks.
13. As an analyst, I want completion computed as "every objective's demanded slots at demanded
    grade over a static floor," so that "done" is relative to what I'm trying to answer, not
    a global checklist.
14. As an analyst, I want prescribed-vs-practiced divergence surfaced per slot, so that
    unwritten rules and workarounds are findings, not noise.
15. As an analyst, I want conflicting statements to fold to a typed conflict — never a silent
    pick — so that contradictions become questions instead of errors.
16. As the interviewing agent, I want next-question candidates to fire mechanically off slot
    states (below demanded grade → quantile protocol; statistic unspecified → "typical, or
    worst case?"), so that follow-ups are grounded in the model's actual gaps.
17. As the sweep executor (FE-1392, the write-time mapping of utterances to proposals), I want
    the proposal catalog compiled to a JSON Schema on my tool input and a decision-tree route
    over statement forms, so that mapping is two small decisions, not one pick from a flat
    ~19-type list.
18. As the sweep executor, I want honest low-grade defaults (verbal form,
    `statistic: unspecified`) to be legal captures, so that uncertainty degrades to
    under-typing that cues a follow-up, never to silent hardening.
19. As a reviewer, I want every semantic bridge — unit parse, identity link, composition,
    formalization — deposited as an `inferred` capture with evidence spans, so that I can
    audit, contest, and supersede any interpretation.
20. As a reviewer, I want the fold forbidden to interpret, so that re-running it on the same
    store always yields the same model.
21. As a projection author (net renderer, loss report, completion table), I want to consume
    the elicited model without rereading the transcript or interpreting generic capture
    fields, so that my projection is a pure function of register 2.
22. As a harness developer (FE-1393, the plugin SDK and fold engine), I want every harness
    mechanism to be a pure function classified by which plugin declaration it reads, so that
    the harness/plugin boundary is mechanically checkable.
23. As a team reader, I want example plugins that read as declarations of their domain, so
    that I can evaluate the product's generality without reading harness internals.

## Implementation Decisions

The shapes below are trimmed from the session's ds-pseudo prototype (an untracked session
artifact); they encode the decisions more precisely than prose.

### The three registers (ADR-0003, binding)

Assertions (envelope-wrapped typed proposals) → the elicited model (derived by a pure fold,
never stored) → projections. Write-time-only semantics: no semantic act at read time; every
bridge is a capture. The acceptance oracle: a second projection must consume the model without
rereading the transcript or semantically interpreting generic capture fields. Promotion, never
refusal: low-grade statements are captured honestly and never promote to a demanded grade
without a higher-grade capture superseding them.

### Harness machinery: pure functions classified by what they read

The harness is the functions; the plugin is the tables they read. This is the
harness/plugin boundary, stated as a typology:

```yaml
HarnessMachinery:
  foldEngine:       { reads: foldTable + modelSchema,            emits: register-2 model }
  demandRunner:     { reads: demandTable + active anchor captures, emits: demanded grade per slot }
  identityResolver: { reads: identity-bearing proposals,          emits: canonical names }   # union-find
  slotStateDeriver: { reads: fold output + open issues + absences, emits: slot state per slot }
  promotionGuard:   { reads: gradeOrder per slot,                 emits: supersession legality }
  affordanceCuer:   { reads: firesWhen x slot states,             emits: next-question candidates }
  captureEnvelope:  fixed   # kernel canon; the one non-function; amendable only at the seam
```

The slot-state algebra, fold engine, grade/promotion mechanism, identity mechanism, and demand
runner are harness (plugin-SDK) territory; the standard interiors are an importable library;
the node-kind catalog, proposal catalog, affordance annotations, demand table, and loss
categories are plugin-authored. (Ratified as FE-1393 design input.)

### The plugin contract

```yaml
PluginContract:
  modelSchema: NodeKind[]           # register 2 — derived, never stored
  proposalCatalog: ProposalType[]   # register 1 — utterance-shaped, envelope-wrapped
  foldTable: FoldRow[]              # overrides only; default rules derive from SlotDecl
  demandTable: { rows: DemandRow[], staticFloor: string[] }
  variantDimension: enum?           # e.g. prescribed | practiced; enables slot state 'diverged'
  lossCategories: enum[]

NodeKind:
  name: string                      # closed catalog (Layer-A property 1)
  slots: map<string, SlotDecl>
  completionAnchor: boolean

SlotDecl:
  valueType: string                 # domain type or standard interior
  cardinality: enum                 # one | set | ordered
  gradeOrder: enum[]?               # plugin-declared, lowest first; library ladder or composition ladder

ProposalType:
  name: string                      # named by its semantic act, keyed to its fold target
  interior: shape                   # composed from the standard-interiors library
  validators: string[]              # tiered: deterministic / semi-mechanical / residue
  affordance:
    technique: string               # ref to an FE-1403/FE-1406 technique card
    firesWhen: enum                 # closed 7-value set, below
```

This survives the penciled manifest design as the manifest's `ontology/schema` key: the
prompt-mechanism keys (techniques, lenses, smells, …) are untouched (FE-1403/FE-1406,
the technique-card and prompt-mechanism efforts); `checks`/`tools` receive the proposal and
projection validators; code remains only in validators and projections.

### Typed proposals, not generic field atoms

The generic kind+field EAV union is retired. Register 1 is an enumerated catalog of typed
semantic proposals with domain-shaped interiors (`duration-estimate` carrying a
`QuantityStated`, not `quantity-stated` carrying a string). For CPS the first-cut catalog is
~19 types worked from the C1 baseline transcript (entity-noted, attribute-noted,
attribute-domain, population, activity-noted, duration-estimate, resource-requirement,
actor-assignment, precondition-noted, outcome-noted, sequence, trigger, policy-noted,
relationship-noted, question-to-answer, goal-noted, penalty-noted, rationale-noted, same-as).
Constraint, data-binding, and validation-criterion stay schema-present but shallow — one
`*-noted` proposal each — per the September minimum; all three have real C1 instances.

### The standard-interiors library

Finiteness claim: interiors are indexed on *how experts state facts* — measurement scale
types plus logical forms — not on domains. Six families over a shared supertype, plus one
flagged tarpit:

```yaml
StatedForm:            # base — every family extends this
  verbatim: string     # fidelity anchor; never normalized away
  parsed: shape?       # mechanical-tier structure; its absence IS the grade floor
  # convention: every family declares explicit UNSPECIFIEDNESS MARKERS — slots recording
  # what the utterance did NOT say. Grade derives from parsed-ness; markers are exactly
  # what the affordance cuer fires on.

QuantityStated:        # 1 — magnitude (ratio/interval): verbal | point | range | quantiles; statistic marker
ComparisonStated:      # 2 — order (ordinal): a/b/dimension/direction; direction-without-magnitude marker
RankingStated:         # 2b — total/partial order over a set
VocabularyStated:      # 3 — category (nominal): dimension + values
ConditionStated:       # 4 — predicate: verbatim < structured < formal (the FV ladder lives here)
UniformityClaim:       # 5 — quantified claim over a ScopeExpr, with exceptions carve-out
SubjectRef:            # 6 — reference/identity; same-as pairs two of them
TemporalPattern:       # flagged tarpit — NOT claimed finite; verbatim-heavy, coarse window only
```

Number-hedges ("about", "maybe", "roughly") live in `QuantityStated`'s qualifier, not in
capture confidence — two different homes. Capture-level confidence is the picklist
`firm | hedged | speculative`, and the store refuses numeric-parsing confidence strings
(closes remediation item A5).

### Grade is narrowing of interpretation space

Grade means "fewer readings remain," never claim strength (that is envelope confidence —
orthogonal by design). Two sources: **form grades** fall out of the library (each family's
ladder is its unspecifiedness markers progressively resolved: verbal < point < range <
quantiles; informal < vocabulary-bound < formal-parsed) — plugins demand rungs, they don't
define these ladders; **composition grades** are plugin-declared (Gherkin's given-only <
given-when < full-gwt is about slot composition, not one statement's form). The fold engine
reads grade off the interior or the fold output, never off the proposal type name — formal
verification's `formalization` is a *different proposal type* folding into the *same slot* at
higher grade. Beyond formal-parsed lies checking, which is validation, not grade.

### Slot states and fold rules

```yaml
SlotState: unaddressed | stated(value, grade, supportingCaptureIds)
         | absent(absence, captureId)          # populatable pending envelope pressure #2
         | conflicted(openIssueIds)
         | diverged(prescribed, practiced)     # only if the plugin declares a variant dimension

_foldRuleDerivation:   # foldTable holds overrides only; both example fold tables are empty
  - cardinality one + gradeOrder   -> unique-at-highest-grade
  - cardinality one, ungraded      -> unique (second active non-alternative => conflicted)
  - cardinality set                -> set-union (member removal = supersede that member)
  - cardinality ordered, positions stated in-utterance -> ordered-append
  - order stated pairwise          -> graph-union, order derived at read
  - identity-bearing proposal      -> union-find
  - scope-bearing proposal         -> shared-support
  # closure: fold behavior = (cardinality) x (graded y/n) + two specials. Finite product
  # space; the rule enum is its image.
```

Two active, un-superseded, non-alternative proposals for a unique slot fold to `conflicted`
with a typed issue — never a silent pick. Regime divergence is per-slot; a regime-split
*existence* (the off-shift wash that's prescribed-possible, practiced-never) is the degenerate
node-level case.

### Demand, scope, and firing conditions

Requiredness is question-relative: a static floor (≥1 objective; entity coverage; a happy-path
flow) plus objective-demanded grades (a capacity objective demands quantile-grade durations on
the activities in its support). Demand rows map anchor patterns to `ScopeExpr → grade` maps.
`ScopeExpr` has three constructors — `kind`, `where`-filter, `inSupport(anchor)` — and
**September ships kind-only**; the other two are the named growth path. `support(anchor)` is
defined as reference closure over a plugin-declared list of support-bearing proposal types
(proposal interiors carrying SubjectRefs *are* the edges; the proposal type is the edge type,
per Layer-A property 4).

`firesWhen` is a closed 7-value enum, every value a predicate over slot states —
`slot-unaddressed | below-demanded-grade | unspecified-marker-present | conflicted-open |
absence-uncorroborated | uniformity-unprobed | identity-ambiguous` — so the affordance column
is mechanically checkable.

### Identity and supersession

Identity assertions (`same-as`) are schema citizens: `inferred`, supersedable; reconciliation
is deterministic union-find over them; renames are new identity assertions, never edits.
Retraction residue: a retraction that replaces a claim with a guess-plus-known-unknown is a
`tentative` superseding capture now, plus an absence capture once the envelope's absence
locator lands (see Open strains).

### The envelope is untouched

Nothing here amends the capture envelope. The one confirmed pressure — absence captures carry
no payload, so a field-specific absence cannot name its slot — is recorded at the FE-1383
seam with three concrete C1 cases; the locator an absence needs is precisely a fold-table
`target` coordinate. Adjudication happens at the seam, not by forking.

## Testing Decisions

A good test here asserts external behavior at a seam — captures in, slot states out — never
fold internals or intermediate representations. Three seams, one primary:

1. **The fold** (primary, new, the highest seam available): `fold(pluginContract,
   activeCaptures) → model` is pure by construction, so the whole contract is golden-testable
   at one seam — hand-worked capture sets in, asserted slot states out. The seed gold set is
   the FE-1405 worked-instance set from C1: the anchor changeover utterance (~9 captures →
   four activities with graded durations and one rationale; the asymmetry claim derivable, not
   captured), the quantile promotion pair (point supersedes to quantiles; slot promotes; no
   refusal at any step), the regime-split off-shift wash, and the first-pass-yield absence
   (blocked, and *asserted* blocked, pending the envelope locator). This gold set doubles as
   the sweep-accuracy rubric material for FE-1407 (the evaluation/gold-set effort).
2. **The acceptance oracle, executable**: a second projection consumes the folded model with
   no transcript access and no generic-field interpretation — enforced structurally by the
   projection's input type being register 2 only. If the projection can't be written that
   way, the failure is the finding.
3. **Contract validation**: plugin contract documents validate against the harness
   meta-schema; the fold-rule derivation is tested as a table-driven pure function over its
   finite product space (cardinality × gradedness + the two specials).

Everything downstream — demand runner, slot-state deriver, promotion guard, affordance cuer —
reads off the fold's output, so seam 1 covers them without new seams. Modules under test are
FE-1393's fold engine and plugin SDK, with the CPS and Gherkin contracts as fixtures. Prior
art in this repo: the docs-index gate (`test/docs-index.test.ts`) for the table-driven,
fail-loud style, and the capture-store suite (FE-1390 side) for envelope-adjacent fixtures.
Test-fit order stands: smallest honest plugin and Gherkin before CPS.

## Open strains (first-class, with owners)

Adjudicated in the FE-1405 session; recorded here so settlement doesn't launder them into
decidedness.

- **Strain 4 — grade sources (resolved in shape, worked pass pending).** Grade = narrowing;
  form grades library-owned, composition grades plugin-declared. The shape is ratified; no
  real fold has read a grade yet. Owner: FE-1393 (fold engine), against the gold set.
- **Strain 5 — support closure (downgraded, worked pass pending).** Typed references already
  exist (interiors carrying SubjectRefs are edges); `support(anchor)` needs one declared
  column and a closure rule, and a hand-worked pass over C1 before `inSupport` ships.
  Owner: FE-1393, with FE-1402 (the completion contract) as consumer.
- **Strain 6 — temporal patterns (roped off).** Scheduling is out of scope as a modelling
  area; `TemporalPattern` stays verbatim-heavy, coarse window only, no calendar algebra
  claimed or planned. Reopening it is a deliberate act, not drift.
- **Strain 7 — sweep-time concentration (recorded; mitigations must travel).** Write-time-only
  semantics makes the sweep's utterance→proposal mapping the single point of semantic failure.
  Mitigations, none yet built: (a) the family index as a decision-tree sweep skill — route by
  statement form, then fold target (FE-1403 authoring, FE-1392 consumes); (b) the proposal
  catalog compiled to JSON Schema on the sweep tool input (FE-1392); (c) graceful
  under-mapping via honest defaults, with over-mapping — silent hardening — as the real
  failure, targeted by the verbatim-containment validators (FE-1392/FE-1393); (d) the
  worked-instance gold set as the accuracy rubric (FE-1407).
- **Envelope pressure #2 — absence locator (seam, unresolved).** Absence captures carry no
  payload; a field-specific absence cannot name its slot. Three C1 cases logged. The needed
  locator is a fold-table coordinate. Owner: the FE-1383 seam (CONVERGENCE record), for
  adjudication — the register-2 `absent` state is representable but not populatable until it
  lands.

## Out of Scope

- Amending the capture envelope. Pressure #2 is recorded for adjudication at the seam.
- Scheduling and temporal-pattern modelling (strain 6).
- The `where` and `inSupport` ScopeExpr constructors shipping in September (kind-only ships;
  the others are the named growth path).
- Authoring the sweep skill, technique cards, and prompt-mechanism manifest keys
  (FE-1392/FE-1403/FE-1406 territory — this spec fixes only the `firesWhen` and `technique`
  hook points).
- The full FE-1397-style ratification pass — it is this spec's *condition*, owed before the
  provisional marker comes off, not part of its build scope.
- Loss-category content and projection implementations beyond the oracle projection.
- Any UI.

## Further Notes

- This document is the settled form of the FE-1405 session's working draft and its
  ds-pseudo YAML rendering — untracked session artifacts (`drafts/`, per the documentation
  protocol) that collapsed into this spec and are not load-bearing anywhere.
- The decision this spec builds on is [ADR-0003](../../adr/0003-three-register-ir.md); the
  worked cross-plugin thumbnails (Gherkin thin, formal verification mid, CPS thick) live in
  the working draft and discharge the ratification bar only provisionally.
- The authoring story is the product claim to protect: *declare your kinds and slots; declare
  the proposals that fill them; annotate how to elicit each; say what your anchors demand.*
  Any harness change that breaks the readability oracle — a Gherkin reader can write a third
  plugin by analogy — is a regression even if all tests pass.
