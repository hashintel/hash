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

- Promote settled inbox material to its role-based home under `documentation.md`. Do not add to the
  retired `docs/planning/` or `docs/history/` paths.
- Delete source material only when its durable information has been transferred and its
  consumption is named.
- Ensure every document under `docs/` except `docs/INDEX.md` and `docs/agents/**` is indexed and
  every index entry still resolves.
- Update status, ownership, and digest text when this arc changed their truth.

### 2. Audit the Linear registry and touched references

Always run `turbo run linear:graph --filter '@hashintel/brunch-agent' -- --all`. Inspect every
project issue's assignment and every open issue with no parent.

- Every non-root issue must have a parent.
- Every intentional root must be a recognized map or sweep root under the registry rule, or be
  named under **Exceptional roots** in `docs/control/STEERING.md`.
- Subject to [the issue tracker's external-write approval gate](issue-tracker.md#conventions),
  repair missing parentage in Linear when the intended owner is unambiguous; otherwise record the
  unresolved root in `STEERING.md`.
- Re-read every issue the arc closes or materially changes. Repair stale branch, dependency,
  evidence, and document references before closing it, subject to the same approval gate for any
  Linear mutation.
- Follow `issue-writing.md`: preserve a root issue's human-owned contract and put agent-maintained
  detail inside `🏗️ Agent notes`.

### 3. Reconcile the spec ledger when affected

Update `docs/control/SPEC-LEDGER.md` in the same change when the arc builds, disproves,
supersedes, or changes evidence for a milestone-one specification obligation. Change the smallest
affected set of rows; do not add an evaluation narrative. When milestone one closes, settle the
ledger as a terminal record rather than keeping it artificially live.

### 4. Reconcile the current control when affected

Reassess `docs/control/STEERING.md` only when exceptional roots, active soft edges, or project-wide
sequencing/strategy materially change. Ordinary blockers, parents, project membership, and ticket
movement remain Linear facts and are not independent steering triggers.

Use the Linear graph for deterministic facts, then check soft edges, exceptional roots, governing
strategy, gates, and proof frontier. Linear remains canonical for hard blockers, state, assignment,
and hierarchy. If the judgment did not change, leave the control untouched. If a material strategy
trigger fired, validate that the new append-only strategy entry has evidence and supersedes, and
that `STEERING` references it. No-op reconciliation persists nothing.

### 5. Reconcile steering and proof when triggered

If a steering trigger fired, invoke `/ds-steer`. It consults the Brunch
[steering supplement](steering.md); do not copy its procedure here.

If no trigger fired, continue the current proof frontier without a no-op steering update.

### 6. Repair tense and report

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
5. affected steering soft edges, roots, strategy, gates, and frontier are current; and
6. any triggered steering pass meets `/ds-steer`'s completion criterion; and
7. changed planning prose reads correctly after landing.
