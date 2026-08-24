# Documentation protocol: ingest, promote, index

This protocol assigns one authority to each kind of durable knowledge. It complements
`issue-tracker.md`, which governs issue facts. `docs/agents/` remains the operating-guidance set,
and `docs/INDEX.md` remains the registry described below.

## Authoritative topology

| Location | Role |
| --- | --- |
| `docs/control/` | Compact, mutable strategic, coordination, and obligation control surfaces |
| `docs/specs/` | Required behavior |
| `docs/adr/` | Accepted decisions |
| `docs/evidence/proofs/` | Immutable observed proof, witness, and implementation snapshots |
| `docs/evidence/evaluations/` | Immutable evaluation runs and readouts |
| `docs/reference/` | Stable explanatory and source material |
| `docs/archive/` | Historical, superseded, or settled material with no current authority |
| `docs/inbox/` | Transient, untriaged intake |
| `evaluations/cases/` | Executable evaluation cases and corpora |
| `evaluations/protocols/` | Executable evaluation procedures |
| `evaluations/oracles/` | Executable checks for validated categorical claims |

Effort is metadata recorded in the index or document, not a placement rule. Do not create an
effort-shaped documentation tree.

`docs/planning/` and `docs/history/` are legacy paths pending one atomic migration. Existing files
remain authoritative according to their present role until that migration repairs all external
pointers and updates the index. Add no new files to either path, and do not describe the target
topology as already physically complete. Do not create `evaluations/` until executable assets are
actually promoted there.

External stores hold pointers or tracker facts, never the only repo-owned document. Before moving
or deleting a path referenced from Linear, Notion, or another external store, repair every pointer;
external writes require their own approval. Nothing is deleted until its `INDEX.md` entry records
the disposition.

## Evidence vocabulary

- **Case / corpus**: bounded evaluation input, or a reviewed collection from which cases are
  selected. It defines what may be presented, not the expected answer.
- **Fixture**: reviewed, versioned setup derived from a case and suitable for a production-path
  run. It may provide domain state, never missing product wiring.
- **Run snapshot**: immutable capture of inputs, environment identity, production entrypoint,
  outputs, and result for one execution.
- **Oracle**: executable check promoted from a validated categorical claim. Hidden answer keys and
  oracles stay behind the information wall and are not interviewee or elicitor inputs.

An **immutable legibility snapshot** renders the proof in another register and records the strain
found during translation. A **witness record** identifies the claim observed, scenario and build,
witness, date, observation, and verdict. UX, interpretation, live-runtime, and
demo-comprehension claims require one unless explicitly inapplicable. See `legibility.md` for the
render-and-read mechanics.

## Intake, promotion, and disposition

1. **Arrive:** transient material enters `docs/inbox/`, timestamped when arrival time matters.
2. **Register:** when first used, add it to `docs/INDEX.md` with status `inbox`.
3. **Review:** identify provenance, consumer, information-wall boundary, and intended authority.
4. **Promote:**
   - required behavior goes to `docs/specs/`;
   - accepted decisions go to `docs/adr/`;
   - observed proof and witness snapshots go to `docs/evidence/proofs/`;
   - evaluation run readouts go to `docs/evidence/evaluations/`;
   - stable explanations and source material go to `docs/reference/`;
   - executable cases, protocols, and oracles go outside docs under `evaluations/`;
   - superseded or settled context with no present authority goes to `docs/archive/`.
5. **Reconcile:** update the index and all internal and approved external pointers atomically.

Promote a validated categorical claim to an oracle when recurrence is plausible, the claim is
mechanizable, and silent regression matters. Keep judgment that cannot be mechanized in protocol
or review guidance. A run snapshot never becomes a mutable control, and a control surface never
accumulates run history.

## Mutable controls

Controls under `docs/control/` carry only current objective, topology, obligations, choices, gates,
and stop conditions. Keep them compact. Link immutable evidence and historical context instead of
copying it or appending chronology; Git records control-surface history. Linear owns issue state,
hierarchy, and hard blockers, while repo controls may project those facts and record soft edges.

## Index and link rules

- Every document under `docs/` except `docs/INDEX.md` and `docs/agents/**` has exactly one covering
  `docs/INDEX.md` row, and every row resolves. Every agent protocol is reachable from `AGENTS.md`.
- Introduce an issue ID with a gist so prose survives loss of tracker access. Outside control and
  tracking surfaces, issue IDs are citations rather than load-bearing facts.
- Reconcile stale tense, status, provenance, and links when an arc changes their truth.
- Drafts are git-ignored ephemera, never indexed or linked from durable records.

Arc close performs inbox, index, pointer, and control reconciliation; see `arc-close.md`.
