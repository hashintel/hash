# Arc close

Arc close is the required final control pass before submitting a branch that closes a work arc.
Load the `arc-close` skill and run this protocol; do not rely on remembering its constituent
checks. It complements, rather than replaces, the legibility protocol's close-out rendering for
arcs with significant agent-generated output.

An arc is closing when a bounded branch or session lands implementation, settles a planning or
design decision, closes or materially changes a Linear issue, or changes a project control
surface. Exploratory work that leaves no durable truth does not require arc close.

If a conditional pass changes nothing, do not append a dated evaluation or no-op record. Git is
the history of these control surfaces.

## Required sequence

### 1. Settle the inbox and reconcile the index

Always inspect `docs/inbox/` and `docs/INDEX.md` together.

- Move settled inbox material to its canonical home under `docs/reference/`,
  `docs/planning/<effort>/`, or `docs/planning/_shared/`.
- Delete source material only when its durable information has been transferred and its
  consumption is named.
- Ensure every non-archive Markdown document is indexed and every index entry still resolves.
- Update status, ownership, and digest text when this arc changed their truth.

### 2. Audit the Linear registry and touched references

Always run `turbo run linear:graph --filter '@hashintel/brunch-agent'` and inspect every open project
issue with no parent.

- Every non-root issue must have a parent.
- Every intentional root must be a recognized map or sweep root under the registry rule, or be
  named under **Exceptional roots** in `docs/planning/_shared/COORDINATION.md`.
- Repair missing parentage in Linear when the intended owner is unambiguous; otherwise record the
  unresolved root in `COORDINATION.md`.
- Re-read every issue the arc closes or materially changes. Repair stale branch, dependency,
  evidence, and document references before closing it.
- Follow `issue-writing.md`: preserve a root issue's human-owned contract and put agent-maintained
  detail inside `🏗️ Agent notes`.

### 3. Reconcile the spec ledger when affected

Update `docs/planning/_shared/SPEC-LEDGER.md` in the same change when the arc builds, disproves,
supersedes, or changes evidence for a milestone-one specification obligation. Change the smallest
affected set of rows; do not add an evaluation narrative. When milestone one closes, settle the
ledger as a terminal record rather than keeping it artificially live.

### 4. Reassess project coordination when affected

Reassess `docs/planning/_shared/COORDINATION.md` when the arc changes:

- a hard blocker, issue parent, project membership, or exceptional root;
- a soft `coord`, `input`, or `state-gate` edge;
- an unresolved cross-map seam; or
- issue semantics that could change the current project-wide sequencing recommendation.

Use `turbo run linear:graph --filter '@hashintel/brunch-agent'` for deterministic facts, then read
the relevant issue bodies and infer the recommendation. Linear remains canonical for hard blockers,
state, and hierarchy. Keep one compact pseudo-style map of the current recommendation; do not paste
the full generated graph or maintain alternative or historical orderings. If the judgment did not
change, leave the document untouched.

### 5. Repair tense and report

Read the arc's planning prose in the state that will exist after landing. Remove stale future
tense, provisional labels, temporary pointers, and inaccurate status language. Report which
control surfaces changed and which conditional passes were not applicable; do not persist the
no-op report in those surfaces.

## Definition of done

Arc close is complete when:

1. inbox and index agree with the tree;
2. the Linear orphan audit has no unexplained roots;
3. touched issue references are current;
4. affected spec-ledger rows are current;
5. affected coordination judgment is current; and
6. changed planning prose reads correctly after landing.
