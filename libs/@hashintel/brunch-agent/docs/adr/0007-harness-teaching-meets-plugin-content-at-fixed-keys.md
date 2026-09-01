# ADR-0007: Harness teaching meets plugin content at fixed keys

Date: 2026-08-25
Status: accepted 2026-08-25 (Lu), with one caveat recorded as decision 9 — the key catalogue of
decision 2 is a working set that two plugins converge on, not a list frozen by this record
Amends: [ADR-0006](0006-plugins-per-target-formalism.md), decision 2 (a plugin is no longer one
Markdown file whose prose is concatenated whole; the machine-read tables become schema-validated
data and the prose becomes cells under harness-owned keys) and decision 5 (the "later lift" of
harness-generic guidance is designed here, and it is not pattern-shaped)
Preserves: [ADR-0002](0002-topology-and-placement-rules.md) N2 (harness-shipped guidance lives in
a harness package, never in app `skills/` directories), [ADR-0003](0003-three-register-ir.md)
(three registers), [ADR-0005](0005-model-assisted-sdcpn-realization.md) (`project` / `validate`
as code), IR Layer B's rule that interview ordering is derived from completion rather than
taught, and completion rule 15 (whether a session may stop is session control, never guidance)
Corrected by Mission 4 on 2026-09-01: references below to a plugin naming “no domain” mean no concrete domain, organization, situation, or scenario. A plugin now explicitly pairs a reusable domain typology with its target formalism; its cells may use that typology.
Decided on: the `ln/fe-1406-harness-teaching-adr` branch, from the
[lineage audit](../evidence/audits/harness-teaching-lineage-audit.md) and the
[penciled directions of 2026-08-14](../archive/planning-inputs/penciled-directions-2026-08-14.md);
owning issue FE-1406 (gist: what the harness teaches)

## Context

Kernel spec §11.5 has said since 2026-08-11 that **guidance ownership follows vocabulary
ownership**: a plugin teaches what to notice through its domain typology and for its target formalism; the harness teaches how to work an
interview situation the shared envelope can name. The rule was reaffirmed by FE-1397, ADR-0002,
FE-1406, and ADR-0006's supersession map, and it has never been designed. The
[audit](../evidence/audits/harness-teaching-lineage-audit.md) finds fifteen restatements,
eight vocabularies, five layers, and no build; each rescoping shrank the deliverable — a designed
quiver, then graduated cards, then five relocated rows — while the rule stood. What ships today is
eight protocol sentences in `packages/core` followed by the plugin file's prose.

The richest prior form is the plugin manifest penciled on 2026-08-14: `licenses / techniques /
movements (slice_moves, sweep_moves) / scopes_and_motifs / rabbit_holes / failure_modes / smells /
lenses / checks / tools / ontology / schema`, with an ownership sort per key — "you may press a
busy expert" is harness-side, "press on tint-qualification claims" is the same key plugin-side —
and the observation that `rabbit_holes` (where _not_ to dig) is the one key the literature does
not cover. Its own gap note says completion and the anchor were missing. Every key on that list
follows one principle: an author supplies direction specific to a formalism, **in terms of
concepts the harness defines and teaches**.

ADR-0006 put the how-to under the plugin file's `Moves` heading as job runbooks, and by its
decision 2 the harness concatenates that section into the interviewer's instructions unread. The
consequence is visible in the one plugin that exists: of the SDCPN `construct` runbook's six steps
— open with objectives, slice, sweep, probe, keep the ledger, close honestly — five are generic
method a `gherkin` plugin would have to repeat. The runbook is mostly harness craft filed in a
plugin because the contract gives the harness no place to put its own.

The audit also finds that the idea has always carried two dimensions the record never separated.
One is **sequence**: open before structure, slice before sweep, close by summarising and offering
one correction. The other is **selection**: which probe to use on this answer, whether to slice or
sweep now, how much to batch, how to phrase the next question for this expert's appetite.
FE-1406's 2026-08-19 design stated the selection half — strategy varies with a posture inferred at
kickoff — and the 2026-08-25 rescope dropped it. Most of the penciled keys are selection and
anchor content that applies in every job; only kickoff, trajectory, and close are per-job
procedure.

Meanwhile the read path landed (FE-1497): the plugin-file parser and the proposal-schema narrowing
that hangs off it are 378 lines of hand-written Markdown table reading, with the floor read by
regex over prose and the completion anchor found by naming convention — the size finding on
`STEERING.md` asks whether the machine-read part of the file should be data.

## Decision

1. **One principle for every key: the harness defines and teaches the concept; the plugin
   specialises it in the harness's terms.** Plugin authoring is a fixed set of **keys**. The
   harness owns every key, its meaning, and its default text; a plugin fills cells under those keys
   with content that names its domain typology and kinds and never a concrete domain. Rendering interleaves, key by key: the
   key, the harness default, then the plugin's cell if it is not blank. Cells add; they never
   override a default — a default a plugin needs to contradict is a finding about the harness.
   Once the catalogue is frozen (decision 9), adding a key is an amendment to this record and the
   generality test of ADR-0006 extends to keys — a second formalism or a third job adds zero.

2. **The keys, in four groups.** Groups are by nature — data, guidance, procedure, code — not by
   file.

   **Contract keys** (data, validated by a schema, never read by prose rules):

   | Key | Holds |
   | --- | --- |
   | `ontology` | The `Kinds` table: kind, slots, projects-to. |
   | `schema` | The `Must know` rows with precision and accepted absence; the static floor as counts; the anchor kind and its dependency slot, declared, not found by convention; the proposal payload shapes. |
   | `patterns` | Kind-indexed, machine-matchable triggers on node state with the question that resolves them (P01–P05, P07, P08, P13 today). Matched by the harness at read time; surfaced, never mandated. |

   **Guidance keys** (prose; harness default plus plugin cell; each typed by the mechanism it
   works through):

   | Key | Mechanism | The harness teaches | A plugin cell adds |
   | --- | --- | --- | --- |
   | `lenses` | attention | The interview situations the envelope can name: conflict, competing alternatives, ambiguity, weak or missing evidence, absence clusters, choice-point pressure (§11.5's six) — what each looks like and what to do when it appears. | Where the formalism's kinds hide in ordinary talk. |
   | `techniques` | technique | Question forms that deepen one answer: the vague quantifier, the story instead of the generalisation, the tension between two answers, the smallest delta to the demanded precision, "don't know" routed to a source, the universal follow-up ("how would you know that?"). | Formalism-specific methods (the quantile protocol for a spread). |
   | `movements` | technique | `slice`: walk one concrete case end to end before anything systematic; the bounded opener; the shape comes from the slice. `sweep`: make one property hold across one stratum; the completion report is the map of what is unknown, never the order to ask in; close each stratum by asking for absences and unwritten rules. | What one case is in this formalism; kind order; what a stratum is. |
   | `licenses` | license | Moves a cooperative model suppresses and may make: press a busy expert; batch two to four questions for breadth, one thread for depth; decline to sweep; propose structure, keeping a proposal a suggestion until confirmed (FM-15); stop when the expert must stop. | Formalism-specific permissions; usually blank. |
   | `motifs` | attention | Motifs scaffold questions and never generate structure; the interviewer asks which pattern is present with what parameters, never assembles free-form structure from a catalogue. | The formalism's recurring shapes (queue, batch, rework loop, shared resource) as question scaffolds — Layer B's motif quiver, homed. |
   | `smells` | attention | Signs in the interviewer's own output that something has gone wrong: schema-shaped questioning, null collapse, silent hardening, correction-as-duplication, fluency taken for completeness. | Formalism smells (a quantity given for one type and no other; a continuous quantity that triggers nothing). |
   | `rabbit_holes` | anchor | Where not to dig and what looks like progress and is not: asking the expert what you failed to ask; restating the whole model; stating a value the expert did not give; taking a schedule or a document for the practised rule; reopening a settled stratum without new evidence. | Formalism holes. |
   | `failure_modes` | anchor | FE-1407's technique-owned failures with their detection signatures — opening overload (FM-12), unresolved-ambiguity bypass (FM-14), unlicensed influence (FM-15) — as the failures this guidance exists to prevent. | Formalism failure modes (a dead net; an unsupported objective). |

   **Runbook keys** (procedure; one runbook per job; harness default runbook plus plugin cells):

   | Key | The harness teaches | A plugin cell adds |
   | --- | --- | --- |
   | `kickoff` | What to establish before structure: the objective, why, boundaries, and the expert's **posture** (time, intended use, required confidence, tolerance for proposed assumptions). Never an opening battery. | What "no model exists" or "a model exists" means for this job; the kind the objective is captured as; for review, orientation on the artifact and scope. |
   | `trajectory` | Which movements in which bias, varied by posture: slice-and-trace first, sweep second, re-entering slice inside a new sub-area; explore openly when appetite is high, synthesise and invite correction when constrained, propose low-risk structure and question only high-impact uncertainty in mixed cases. Presented as postures, never as a state machine. | Job-specific order among the plugin's kinds; for review, the affected-slice discipline. |
   | `close` | Completion is computed, not felt; a smooth interview, a busy expert, a delivered document, an exhausted budget, and a complete model are five different things. If the expert must stop, stop. Summarise per kind, state what is missing or assumed, offer one correction. Whether one _may_ stop is session control (rule 15). | The job's named stopping outcomes; the deliverable's shape. |

   **Machinery keys** (code, ADR-0005's seam):

   | Key | Holds |
   | --- | --- |
   | `checks` | Validators: proposal payload validators, reconcile checks, `validate`. What the harness enforces — completion, the sweep list, the assumption ledger, the affected slice — is harness code and is stated to the interviewer in a fixed harness preamble, not a plugin cell. |
   | `tools` | `project`, and the client tools a job needs. |

3. **The words.** A **mechanism type** says how a guidance key works: **license** permits a
   suppressed move; **technique** supplies a method the model does not reliably apply;
   **attention** points native ability at a target; **anchor** holds leading words for judgment.
   **Procedure** belongs only to runbook keys. This is Principle v2 — _procedure for mechanism,
   anchors for judgment, shapes for output_ — applied key by key. The harness-shipped guidance is
   the **repertoire**; "quiver" retires as its synonym. **Selection** is choosing among repertoire
   cells at the moment; **sequence** is a runbook. **Posture** is the selection input kickoff
   produces; it is inferred continuously and never a stored field.

4. **Jobs are harness vocabulary.** `construct` (no model exists) and `review and revise` (a model
   exists) are situations the harness names without any plugin. The repertoire carries one default
   runbook per job; a plugin declares which jobs it supports and fills their cells. A third job is
   an amendment to this record.

5. **The harness surfaces and never selects.** The rule already stated for patterns ("the harness
   surfaces; the interviewer decides") governs every guidance key: the completion cue may say what
   is unsatisfied and which patterns match; it never says "sweep now." No mechanism selects a move
   for the interviewer.

6. **Conversational triggers are guidance, not patterns.** A pattern needs a trigger the harness
   can match against node state. Guidance whose trigger is conversational — a vague answer, an
   expert who does not know, the end of a topic — belongs under a guidance key. FE-1406's five
   candidates sort accordingly: P06, P10, and P12 into `techniques`; P09 and P11 into
   `movements.sweep`; their ids retire with the rows.

7. **Admission to the repertoire is by evidence.** A default is admitted where FE-1403's verdict
   rule holds — it fires where the bare model demonstrably failed, not where instinct already
   succeeds. The first admissions are the ones the record already evidences: the three
   technique-owned failures of FE-1407, the v0 prompt's seven headings (condition 2 beat condition
   1 on them), and GEN-Q02's batching license from the FE-1403 desk replay. Everything else waits
   for a run.

8. **The layers are topology.** The repertoire is a package, `packages/repertoire`, that depends
   only on `packages/core`; bindings depend on it to render; plugins never import it — a plugin
   composes with the repertoire by filling cells and omitting what the repertoire already teaches.
   A plugin package is: `plugin.yaml` (contract keys and the guidance and runbook cells, validated
   against a JSON schema published by `core`; cells may point at sibling Markdown files when they
   are long), plus `src/` for the machinery keys. The parser becomes the schema and a key reader.
   Gates: the schema rejects an unknown key; the repertoire must fill every guidance key and every
   runbook key; a plugin may leave any cell blank and may add no key; the binding renders by
   interleaving. Every layer ships with its intent — a package README saying what the layer is for,
   pointing here.

9. **The catalogue converges by co-authoring, not by decree.** Decision 2 names a working set.
   Fixing it before it has been written against would repeat the record this ADR corrects: a
   structure affirmed in prose and tested by nothing. The set is stabilised in cycles — write the
   schema, `plugin-sdcpn`, `plugin-gherkin`, and the repertoire _together_; review whether each key
   plausibly serves both plugins; run the result where a run is available; edit. Two pressures are
   applied in every cycle. The first is the two test-case plugins: one schema must read well for
   both. The second is the process-modelling edge material already in the record (the CPS
   grilling inputs, the truck-fleet and coating cases, the literature deposit), asked three
   questions — is the set general enough to cover different elicitations of that kind; is it
   specific enough that an author can give direction that changes what the interviewer does; does
   it still fit elicitations of another kind (gherkin now; formal verification as the sketch)?
   During convergence, adding, merging, or dropping a key is done in the schema and both plugins at
   once and recorded in the package changelog, not by amending this record. The catalogue is
   **frozen** when a cycle changes no key and a third-formalism sketch fills cells only; from then
   decision 1's amendment rule applies. The cycle is the method; its product is the catalogue, the
   two plugins, and the repertoire, converged at the same time.

## Condition

Revisit if a second formalism or a third job needs a new key; if a plugin cell must contradict a
harness default rather than add to it; if any mechanism needs the harness to _select_ a move
rather than surface the facts a selection is made from; or if posture needs to be stored. Each is
a finding about the abstraction, decided by amending this record — never by adding a key to one
plugin, a per-domain cell, or a hidden field. Any rescoping of the repertoire must cite run
evidence; the audit records three rescopings that cited none.

## Consequences

- **FE-1406 is restored to its original question** — what the harness teaches — with this record
  as its design and `packages/repertoire` as its deliverable; the 2026-08-25 five-row scope is
  replaced by decision 6. **FE-1431** (declarative plugin authoring) becomes the plugin side of
  decision 8: the schema, `plugin.yaml`, the key reader, and the SDCPN plugin's migration.
  **FE-1393** keeps its role: the gherkin plugin fills cells only and adds zero keys. Under
  decision 9 the three advance together in each cycle rather than in sequence; the Linear edits
  were made on acceptance (2026-08-25).
- **The SDCPN `construct` runbook shrinks.** Slice, sweep, probe, ledger, and close move to the
  repertoire; the plugin keeps what one case is, its kind order, and its stopping outcomes. The
  `review and revise` runbook keeps orientation, scope, and its job checks. `Patterns` P06, P09,
  P10, P11, P12 leave the plugin.
- **The parser shrinks to a schema and a key reader.** Table reading, the floor regex, and the
  anchor convention become declared fields; the binding's instruction assembly interleaves per
  decision 1 instead of appending a file.
- **The glossary changes on acceptance** (`CONTEXT.md`, per `docs/agents/domain.md`): Plugin is
  redefined by keys; Runbook as the three runbook keys for one job; Pattern gains "machine-matchable
  trigger on node state"; the retired Kernel card entry stops asserting the quiver "becomes
  harness-generic patterns"; ElicitationPack is retired in favour of the guidance keys; new
  entries for Repertoire, Key, Mechanism type, Posture. `SPEC-LEDGER.md` §11.5 moves from
  pending to designed by this record; §11.1 and §11.2 point here.
- **Anti-guidance gets a home.** `rabbit_holes` is where the negations now scattered through steps
  go, so the steps can be stated positively.
- **The evaluation prompts become recoverable defaults.** The v0 prompt's seven headings and the
  condition-3 hint fragments are the first drafts of repertoire text; the prompts themselves stay
  sealed as condition inputs.
