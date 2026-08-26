# Plugin schema changelog

The key catalogue is a working set until a co-authoring cycle changes no key
(ADR-0007 decision 9). Each cycle records here what it added, merged, dropped,
or left alone, and why, with the evidence that moved it. `plugin.schema.json`
is derived from `PluginDefinitionSchema` in `src/plugin-definition.ts`; a test
fails when the two drift.

## Cycle 1 — 2026-08-25

First materialisation. Both test-case plugins (`plugin-sdcpn`, `plugin-gherkin`)
and the repertoire were written against this shape together.

- **Groups:** `plugin` (identity, not a key), `ontology`, `schema`, `patterns`,
  `guidance`, `runbooks`, `machinery`.
- **Contract keys:** `ontology.kinds` (`kind`, `is`, `projects_to`), optional
  `ontology.not_kinds` and `ontology.attributes`; `schema.anchor` (declared,
  replacing the `objective`-by-convention anchor of the Markdown plugin file),
  `schema.floor`, `schema.must_know`, `schema.proposals`; `patterns.items`
  (`id`, `on`, `when`, `ask`).
- **Guidance keys:** `lenses`, `techniques`, `movements{slice,sweep}`,
  `licenses`, `motifs`, `smells`, `rabbit_holes`, `failure_modes` — each a
  list of `{name, text, signature?, source?}` so that default and cell
  concatenate.
- **Runbook keys:** `kickoff`, `trajectory`, `close` per declared job.
- **Machinery:** `checks` and `tools` as identifier lists; nothing consumes
  them yet.
- **Dropped from the Markdown plugin file:** the precision-words table (now
  harness vocabulary, `PRECISION_LADDER`), the `Moves` and `Deliverable` prose
  sections (their content is distributed over guidance and runbook keys), and
  the fixed heading order as the contract (the schema is).
- **Open after this cycle:** whether `motifs` needs parameters as data rather
  than prose; whether `licenses` has any plugin-specific content at all (both
  plugins left it blank); whether `machinery.checks` should name harness
  check implementations or plugin-provided ones.

## Cycle 2 — input, 2026-08-25

What the first cycle's "validate" step returned. Source: the desk pressure review
[`docs/evidence/proofs/design/plugin-keys-pressure-review-cycle-1.md`](../../../docs/evidence/proofs/design/plugin-keys-pressure-review-cycle-1.md)
(100 situations from the CPS process-modelling material, the literature review,
and the condition-2 run; a discrete-event and a formal-verification plugin
sketched against the keys). The condition-4 baseline run (the rendered layer as
a prompt only) adds its strains in
`docs/evidence/evaluations/process-model-elicitation/baseline/readout.md`.

**Verdict on the catalogue: not frozen.** No key is added, merged, dropped,
split, or renamed by this input. All 100 situations land on an existing key or
contract row (33 carried by the repertoire default, 29 by sdcpn content, 38
expressible but unwritten, 0 inexpressible). Two key *shapes* must change and
one matching defect was fixed before the catalogue can be said to have been
written against.

### Fixed in this cycle

- **`patterns.items[*].on: []` never fired.** `buildSweepList` tested
  `kinds.includes(node.kind)`, which is false for an empty list, while the
  contract documents "empty means any node". sdcpn `P08` (source-regime
  divergence) therefore never reached the interviewer as a harness fact.
  Fixed in `src/cue.ts`; `test/cue.test.ts` now covers a pattern indexed on no
  kind firing on a failing node of another kind.

### Shape changes proposed (inside existing keys)

1. **`patterns.items[*].slot?: string`** — optional; when present the harness
   surfaces the pattern only while *that* slot on the node is unsatisfied.
   Evidence: kind-only matching makes sdcpn P01 and P02 indistinguishable at
   fire time (both surface on any failing `activity`); a state-dependent
   failure rate has no trigger at all; the archived CPS cards carried
   slot-state predicates that the migration dropped. Cost to gherkin: none
   (P01 would gain `slot: the examples that illustrate it`, P03
   `slot: the observable outcome`).
2. **`schema.must_know[*].precision` accepts a list (any-of).** A single word
   forces the wrong word or a split row: sdcpn "the arrival or availability
   pattern: spread" cannot accept a shift calendar (`spelled out`); "what
   'better' means: range" cannot accept a lexicographic cliff/slope rule
   (`spelled out`). Cost to gherkin and the formal-verification sketch: none —
   every row stays one word.
3. **Repertoire entry applicability facet** — e.g. `for_precision?: [range,
   spread]` on a repertoire item; `renderGuidance` renders it only when some
   `must_know` row of the plugin demands one of those words. Not a plugin
   override (decision 1 holds: the harness decides from the plugin's own
   contract data). Evidence: six of the repertoire's 36 guidance entries are
   quantity methods ("Mean or tail", "Quantiles, never three points", "The
   clairvoyant test", "Premortem", kickoff "numerically where possible", sweep
   "every step has a duration") rendered for gherkin and for a
   formal-verification plugin, where they are noise; and the lens "Policy
   versus practice" is one a specification-of-intent plugin (gherkin
   `status: proposed`, any verification property) must *contradict*, which
   decision 1 forbids — it needs the same facet or a conditioned text.

### Content findings (no schema change; edits due in this cycle)

- **Specificity.** sdcpn `motifs` are six name-only lines that restate the
  patterns 1:1 and violate the repertoire's own "Name plus variant" default
  rendered directly above them; each needs its axis (server semantics —
  indivisible vs several; batch formation rule — count *or* clock; several
  wear components — weakest decides). Quantile elicitation is stated four
  times in the sdcpn render; "every rule has an example" four times in the
  gherkin render. Cells add and never override, but nothing says they never
  repeat and no gate checks it — a "cells add, never repeat" test is worth
  adding.
- **Selection half missing.** `kickoff` produces a posture and nothing
  consumes it: the `trajectory` default has no posture-varied biases (ADR
  decision 2's "explore openly when appetite is high, synthesise and invite
  correction when constrained, propose low-risk structure"). Write them or
  drop posture from `kickoff`.
- **Repertoire under-fill against ADR decision 2's own rows.** `licenses`
  lacks "press a busy expert", "decline to sweep", "propose structure as a
  suggestion"; `rabbit_holes` lacks "asking the expert what you failed to
  ask", "restating the whole model", "taking a schedule or a document for the
  practised rule"; `smells` lacks "schema-shaped questioning" and
  "correction-as-duplication"; `kickoff` lacks boundaries / horizon /
  experimental factors / accuracy bar; `close` (construct) names no stopping
  outcomes.
- **Contract data.** `ontology.attributes` renders as prose; `source-regime`
  works only because the harness hard-codes it. The never-asked sdcpn row
  (`activity` — what is lost when it changes the system's mode) is
  `not_applicable: true` and can be ticked away without a question, which
  reproduces condition 2's ramp-scrap omission. Gherkin `step — the known step
  it binds to: named` needs a team step lexicon the interviewer cannot see:
  a plugin needs reference *data* that is neither cell nor code.
- **Contradictions the repertoire resolves silently** (must be stated, not
  fixed by fiat): the clearinghouse probe is licensed by `movements.sweep`
  and forbidden by the archived CPS guidance, the condition-3 prompt, and
  ADR-0007's `rabbit_holes` row; the quantile order is v0's typical-first
  while citing the IDEA protocol's interval-first; batching 2–4 is stated as
  a license without its single-run basis; "hypotheticals only from a real
  case" would forbid condition 2's most productive move (four constructed
  scenarios); "Restate to check" / "Assent taken as origin" do not say how a
  confirmed interviewer inference becomes a capture; "No structure in the
  first exchange" then asks for a three-to-six-step account, which is
  structure; sdcpn "depth on IR-only kinds" defers `validation-criterion`
  where the literature puts the accuracy bar before building.

### Considered and left

- `motifs` parameters as data — nothing consumes them; fix the content first
  (open item carried from cycle 1).
- Merge `motifs` into `patterns` — they differ by mechanism (attention
  scaffold vs matched trigger); gherkin's motifs have no pattern twin.
- Merge `smells` into `failure_modes` — the frame distinction (own output vs
  named failure) is sound; authors are not honouring it.
- Drop the plugin cell of `licenses` — both blank, zero cost, and a cell that
  contradicts a default is better detected present than absent.
- Add a `scope` runbook key — `kickoff` and `close` carry it once written.
- Add a fourth movement (`cross-examine`) — the consistency probe is a
  technique; soundness questions need projection machinery first.
- Make `ontology.attributes` data — promote when a second attribute needs the
  fold, not before.
- `movements` fixed to `{slice, sweep}` — every formalism examined fits the
  pair; a single-walkthrough formalism would leave `sweep` empty, which the
  schema allows for plugins.

## Cycle 2 — implementation, 2026-08-26

- Added optional `patterns.items[*].slot`. The reader rejects a slot that an
  explicitly indexed kind does not demand; the cue surfaces a slot-scoped
  pattern only for a failure on that slot. SDCPN P01/P02 and Gherkin P01/P03
  now declare the predicates identified by the cycle-1 pressure review.
- Extended `schema.must_know[*].precision` to accept a non-empty list of
  alternative precision words. Completion accepts a value that satisfies any
  listed word and renders the alternatives explicitly. SDCPN's objective
  metric accepts `range` or `spelled out`; its arrival pattern accepts `spread`
  or `spelled out`, covering numeric distributions and structural rules without
  splitting either semantic slot.
- Added repertoire-item `for_precision`, a non-empty list of precision words.
  Rendering now omits an annotated default unless the plugin demands at least
  one listed word. The seven quantity and observed-practice entries identified
  by the cycle review use the facet, so Gherkin is no longer taught numeric or
  retrospective elicitation merely because it shares the fixed key catalogue.
- Completed the cycle-two content pass without adding or removing a key. The
  repertoire now consumes posture in trajectory selection; fills the ADR's
  missing licenses, smells, rabbit holes, kickoff scope, and stopping outcomes;
  and states its choices on clearinghouse probes, quantile order, batching,
  hypotheticals, confirmed restatements, and structure after kickoff. SDCPN
  motifs now name their variant axes, its cells no longer repeat generic
  quantile teaching, and its demand rows, sweep, and anti-guidance cover
  dynamics noise and the missed edge material. Gherkin's duplicate
  rule-without-example failure mode was removed. A gate now rejects exact
  sentence repetition between repertoire defaults and plugin cells.
