# ADR-0007: Harness teaching meets plugin content at fixed move headings

Date: 2026-08-25
Status: proposed — drafted for Lu's ratification; nothing below governs until accepted
Amends: [ADR-0006](0006-plugins-per-target-formalism.md), decision 2 (the `Moves` section is no
longer plugin prose concatenated whole; the machine-read tables become schema-validated data) and
decision 5 (the "later lift" of harness-generic guidance is designed here, and it is not
pattern-shaped)
Preserves: [ADR-0002](0002-topology-and-placement-rules.md) N2 (harness-shipped guidance lives
in `core`), [ADR-0003](0003-three-register-ir.md) (three registers), IR Layer B's rule that
interview ordering is derived from completion rather than taught, and completion rule 15 (whether
a session may stop is session control, never guidance)
Decided on: the `ln/fe-1406-harness-teaching-adr` branch, from the
[lineage audit](../evidence/proofs/audits/harness-teaching-lineage-audit.md); owning issue FE-1406
(gist: what the harness teaches)

## Context

Kernel spec §11.5 has said since 2026-08-11 that **guidance ownership follows vocabulary
ownership**: a plugin teaches what to notice in its formalism; the harness teaches how to work an
interview situation the shared envelope can name. The rule was reaffirmed by FE-1397, ADR-0002,
FE-1406, and ADR-0006's supersession map, and it has never been designed. The
[audit](../evidence/proofs/audits/harness-teaching-lineage-audit.md) finds fifteen restatements,
eight vocabularies, five layers, and no build. What ships today is eight protocol sentences in
`packages/core` followed by the plugin file's prose.

ADR-0006 put the how-to under the plugin file's `Moves` heading as job runbooks, and by its
decision 2 the harness concatenates that section into the interviewer's instructions unread. The
consequence is visible in the one plugin that exists: of the SDCPN `construct` runbook's six
steps — open with objectives, slice, sweep, probe, keep the ledger, close honestly — five are
generic method that a `gherkin` plugin written to the same contract would have to repeat. The
runbook is mostly harness craft filed in a plugin, because the contract gives the harness no place
to put its own.

The audit also finds that the idea has always carried two dimensions the record never separated.
One is **sequence**: open before structure, slice before sweep, close by summarising and offering
one correction. The other is **selection**: which probe to use on this answer, whether to slice or
sweep right now, how much to batch, how to phrase the next question for this expert's appetite.
The 2026-08-19 design of FE-1406 stated the selection half precisely — strategy varies with an
interaction posture inferred at kickoff — and the 2026-08-25 rescope dropped it, along with the
one named form of anti-guidance (`rabbit_holes`, 2026-08-14: where _not_ to dig) that survives only
as negations inside steps.

Meanwhile the read path landed (FE-1497): the plugin-file parser and the proposal-schema
narrowing that hangs off it are 378 lines of hand-written Markdown table reading, with the floor
read by regex over prose and the completion anchor found by naming convention — the size finding
on `STEERING.md` asks whether the machine-read part of the file should be data.

## Decision

1. **A plugin has three parts, split by their nature, not by file.** The **contract** is data:
   kinds, `Must know` rows, the floor, the anchor, and `Patterns` rows — validated by a schema,
   never interpreted by prose rules. The **runbook** is prose under fixed move headings, one per
   job. The **harness repertoire** is prose under the same headings, shipped from `core`
   (ADR-0002 N2), rendered before every plugin's cells. Guidance ownership follows vocabulary
   ownership at the level of the heading: the harness owns every heading and its default; a plugin
   owns the cells that name its kinds.

2. **The move headings are fixed, small, and typed.** Eight headings, in this order, identical
   for every plugin and every job. Adding one is an amendment to this record; the generality test
   of ADR-0006 extends to them — a second formalism or a third job adds zero headings.

   | Heading | Type | Required | The harness default teaches | A plugin cell may add |
   | --- | --- | --- | --- | --- |
   | `Kickoff` | procedure | yes | What to establish before structure: objective, why, boundaries, and the expert's **posture** (time, intended use, required confidence, tolerance for proposed assumptions). Never an opening battery (FM-12). | What "no model exists" or "a model exists" means for this job; the kind the objective is captured as; for review, orientation and scope. |
   | `Slice moves` | repertoire | no | Walk one concrete case end to end before anything systematic; the bounded opener (three to six steps); the shape comes from the slice. | What one case is in this formalism ("one instance from arriving to leaving"; one scenario). |
   | `Sweep moves` | repertoire | no | Make one property hold across one stratum. The completion report is the map of what is unknown, never the order to ask in. End each stratum by asking for absences and for the unwritten rules. | Kind order; which slots go together; what a stratum is here. |
   | `Probes` | repertoire | no | Question forms that deepen one answer: the vague quantifier, the story instead of the generalisation, the tension between two answers, the smallest delta to the demanded precision, the "don't know" routed to a source, the universal follow-up ("how would you know that?"). | Formalism-specific forms (the quantile protocol for a spread). |
   | `Postures` | repertoire | no | How selection varies with the posture from kickoff: explore openly; synthesise and invite correction; propose low-risk structure and question only high-impact uncertainty. Batch breadth (two to four), sequence depth. A proposal stays a suggestion until confirmed (FM-15). | Usually blank. |
   | `Rabbit-holes` | anchor | no | Where not to dig and what looks like progress and is not: asking the expert what you failed to ask; restating the whole model; stating a value the expert did not give; taking a schedule or a document for the practised rule; taking fluency for completeness. | Formalism-specific holes (a continuous quantity that triggers nothing). |
   | `Checks` | anchor | no | What the harness enforces so the interviewer need not police it: completion, the sweep list, the assumption ledger, the affected slice. | Job-specific checks the harness owns (for review: trace, scope, projection identity). |
   | `Close` | procedure | yes | Completion is computed, not felt; a smooth interview, a busy expert, a delivered document, an exhausted budget, and a complete model are five different things. If the expert must stop, stop. Summarise per kind, state what is missing or assumed, offer one correction. Whether one _may_ stop is session control (rule 15). | The job's named stopping outcomes; the deliverable's shape. |

3. **Three heading types, and the words for them.** A **procedure** heading holds ordered steps
   with checkable completion; it is followed. A **repertoire** heading holds options — each a
   when / what it gets / how — from which the interviewer **selects** at the moment, against the
   situation and the posture; nothing under it is a sequence. An **anchor** heading holds leading
   words for judgment; it is kept in mind. This is Principle v2 — _procedure for mechanism,
   anchors for judgment, shapes for output_ — applied heading by heading. "Repertoire" is the word
   for the selection dimension and for the harness's document; "quiver" retires as its synonym.
   "Runbook" remains the word for one job's `Moves`, whether the harness's default or a plugin's.
   "Posture" is the selection input kickoff produces.

4. **Jobs are harness vocabulary.** `construct` (no model exists) and `review and revise` (a model
   exists) are situations the harness can name without any plugin. The harness repertoire carries
   one default runbook per job; a plugin declares which jobs it supports and supplies cells under
   their headings. A third job is an amendment to this record.

5. **Rendering interleaves; the harness surfaces and never selects.** For each job the binding
   renders, heading by heading in contract order: the heading, the harness default, then the
   plugin's cell if it is not blank. Cells add; they do not override a default — a default that a
   plugin needs to contradict is a finding about the repertoire. The rule already stated for
   patterns ("the harness surfaces; the interviewer decides") governs every repertoire heading:
   the completion cue may say what is unsatisfied and which patterns match; it never says "sweep
   now."

6. **`Patterns` stay in the contract, kind-indexed, formalism-owned.** A pattern is a
   machine-matchable trigger on node state plus a question; that is what lets the harness surface
   it. Guidance whose trigger is conversational — a vague answer, an expert who does not know, the
   end of a topic — is not pattern-shaped and belongs under a move heading. FE-1406's five
   candidates sort accordingly: P06, P10, and P12 are `Probes` defaults; P09 and P11 are
   `Sweep moves` defaults; their ids retire with the rows.

7. **Admission to the harness repertoire is by evidence.** A default is admitted where FE-1403's
   verdict rule holds — it fires where the bare model demonstrably failed, not where instinct
   already succeeds — and FE-1407's technique-owned failures are the first three obligations:
   `Kickoff` against opening overload (FM-12), `Probes` against unresolved-ambiguity bypass
   (FM-14), `Postures` against unlicensed influence (FM-15). Everything else waits for a run.

8. **Serialisation is not decided here.** This record fixes the split, the headings, their types,
   and the meeting rule. That the contract is schema-validated data recommends YAML with a JSON
   schema (strict, commentable, plainly readable); that runbook cells are prose the model reads
   recommends sectioned Markdown or YAML block scalars under the fixed headings. The
   plugin-contract spec records the choice when the implementing issue makes it; the parser reads
   headings either way.

## Condition

Revisit if a second formalism or a third job needs a ninth heading; if a plugin cell must
contradict a harness default rather than add to it; or if any mechanism needs the harness to
_select_ a move rather than surface the facts a selection is made from. Each is a finding about
the abstraction, decided by amending this record — never by adding a heading to one plugin, a
per-domain cell, or a stored posture field.

## Consequences

- **FE-1406 is restored to its original question** — what the harness teaches — with this record
  as its design; the 2026-08-25 five-row scope is replaced by decision 6. This is a proposed Linear
  edit, not one made here.
- **The SDCPN `construct` runbook shrinks.** Its slice, sweep, probe, ledger, and close steps
  become harness defaults; the plugin keeps what one case is, its kind order, and its stopping
  outcomes. The `review and revise` runbook keeps its orientation, scope, and checks cells. A
  `gherkin` plugin inherits every default and writes cells only; FE-1393's zero-new-headings test
  covers move headings.
- **The parser shrinks to a schema and a heading splitter.** The table reading, the floor regex,
  and the anchor convention become a schema; the anchor and floor become declared fields. The binding's instruction assembly interleaves per decision 5 instead of
  appending the file.
- **The glossary changes on acceptance** (`CONTEXT.md`, per `docs/agents/domain.md`): Runbook is
  redefined as the eight typed headings for one job; Pattern gains "machine-matchable trigger on
  node state"; the retired Kernel card entry stops asserting that the quiver "becomes
  harness-generic patterns"; ElicitationPack's prose sections are the runbook; new entries for
  Repertoire, Posture, and Move heading. `SPEC-LEDGER.md` §11.5 moves from pending to designed
  by this record.
- **The v0 prompt is recoverable as the first draft of the defaults.** Its seven headings map
  onto `Kickoff`, `Slice moves`, `Sweep moves`, `Probes`, `Postures`, `Checks`, and `Close`; the
  prompt itself stays sealed as condition-2 input.
- **Anti-guidance gets a home.** `Rabbit-holes` is where the negations now scattered through
  steps go, so the steps can be stated positively.
