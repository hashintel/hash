> **Superseded 2026-08-25.** Archive copy of `docs/specs/elicitation-completion.md` as it stood
> before [ADR-0006](../../adr/0006-plugins-per-target-formalism.md). The CPS `DemandTable`, the
> `where`-scoped `PresenceClause` / `SlotClause` vocabulary, and the `completionAnchor` matching
> below have no current authority; completion is now specified as the invariants of
> `evaluateCompletion(model, mustKnowRows)` over the plugin file's `Must know` table in the
> rewritten [`elicitation-completion.md`](../../specs/elicitation-completion.md). Content is
> otherwise verbatim; only relative link targets were re-rooted for the archive location.

# Spec: target-document completion and session stopping

Status: **provisional** — manually desk-scored over the two FE-1361 baseline transcripts. The
replay validates design discrimination, not implementation. FE-1402 owns this required-behavior
contract; plugin authoring consumes it.

This specification defines a read-time answer to one question: given one version-bound snapshot
of the durable evidence, derived model, active objectives, and plugin demands, is the
target-document complete enough for those objectives? The companion
[rehearsal](../../evidence/proofs/design/elicitation-completion-rehearsal.md) owns the provisional CPS
oracle and prefix verdicts. The
[plain rendering](../../evidence/proofs/design/elicitation-completion-plain.md) checks this contract in
a second register.

## Required distinctions

These facts can coincide, but none except the first asserts completion:

| Fact | Meaning | Effect on completion |
| --- | --- | --- |
| Target-document completion | Every static demand, universal active-anchor support check, and objective demand passes. | This is the computation. |
| Session stopping | A conversation is intentionally quieted or produces no more entries. | None. |
| User-requested quiet | The user asks to pause, leave, or receive no further questions. | None. |
| Delivery | A current projection or another promised result is emitted. | None. |
| No progress | Recent frames add no demanded evidence or state and deliver nothing. | None; session control may require adjudication. |
| Budget exhaustion | A turn, token, time, or cost bound ends the session. | None. |
| Licensed deferral | Session control verifies that existing durable authorities can support recoverable re-entry. | None. |

“Best useful result within this session” is therefore ordinary behavior: durably deliver the best
current projection with its loss and open obligations, license later continuation only from
existing authoritative state, and stop the session while the completion boolean remains false.

## Version-bound input snapshot

The harness evaluates one immutable snapshot:

```yaml
CompletionInput:
  targetDocumentRevision: opaque immutable revision
  pluginContractVersion: immutable plugin version or digest
  demandTableVersion: immutable demand-table version or digest
  model: register-2 derived model at targetDocumentRevision
  activeCaptures: evidence metadata reachable from model support links
  openIssues: issue state at targetDocumentRevision
```

The plugin version and demand-table version are part of the identity of the verdict. If the target
document or either plugin version changes during the read, the caller retries. It must not combine
model state from one revision with demands from another.

The computation reads active objectives, the plugin's static floor and demand rows, derived slot
states, grades, epistemic statuses, evidence spans or bases, and open issues. It does **not** read
conversation fluency, self-assessment, turn count, delivery state, recent novelty, session state,
or a deferral-licensing report.

The plugin owns the demand declaration. The harness owns deterministic expansion and evaluation.
The session controller consumes the report but cannot author or override it.

## Demand algebra

The smallest required algebra distinguishes existence from slot quality:

```yaml
DemandTable:
  version: immutable string or digest
  staticFloor: DemandClause[]
  rows: DemandRow[]

DemandRow:
  id: stable plugin-local identifier
  whenObjective: pattern over one active completion anchor
  clauses: DemandClause[]

DemandClause:
  PresenceClause | SlotClause

PresenceClause:
  id: stable plugin-local identifier
  type: presence
  scope: ScopeExpr
  minimumCount: positive integer

SlotClause:
  id: stable plugin-local identifier
  type: slot
  scope: ScopeExpr
  slot: slot name
  minimumGrade: rung in that slot's grade order
  acceptedEpistemicStatuses: non-empty subset of capture-envelope statuses
  acceptedAbsences: subset of capture-envelope absence states, default empty
```

All static clauses and all clauses from every matched objective row are conjunctive. A presence
clause counts model nodes selected by its scope; it is how a plugin declares objective, entity, or
path cardinality. A slot clause evaluates a named slot on every selected model node. An empty slot
selection fails with `no-selected-slot`; existence cannot pass accidentally through an empty
selection.

This algebra adds no graph-query language. It uses the plugin contract's `ScopeExpr`. September may
ship kind-only scopes. The already named `where` and `inSupport(anchor)` constructors remain future
growth paths; this contract does not generalize them.

### Universal active-anchor support

Independently of the static floor, the harness checks every active node whose kind declares
`completionAnchor: true`:

1. match that anchor against every demand row using the plugin-declared objective pattern;
2. fail that anchor with `unsupported-active-anchor` when no row matches; and
3. evaluate the union of clauses from every matching row when at least one matches.

No objective is silently ignored, and the static floor cannot substitute for this universal
check. A target-document with no active completion anchor fails through its plugin-declared
presence clause in the floor.

### Status, grade, and confidence

Epistemic status and grade are independent:

- status says how content relates to its source (`explicit`, `inferred`, `tentative`, `defaulted`,
  or `external-lookup`);
- grade says how narrow the slot value's interpretation space is; and
- confidence says claim strength and satisfies neither requirement.

Statuses are not ordered. A slot clause explicitly lists accepted statuses. An `inferred` capture
uses evidence spans under the existing envelope contract; a demand may accept it directly. A
`documented-transformation` basis belongs to `external-lookup`, not to `inferred`. Grade and
traceable evidence are checked separately from status.

## Evaluation

```text
evaluateCompletion(input, plugin):
  require input.pluginContractVersion == plugin.version
  require input.demandTableVersion == plugin.demandTable.version

  floor := expand and evaluate every static clause
  anchors := every active completion-anchor node

  for each anchor:
    matchedRows := all demand rows matching anchor
    anchorSupport.pass := matchedRows is not empty
    obligations := expand and evaluate every clause in matchedRows
    anchor.pass := anchorSupport.pass and every obligation passes

  complete := every floor clause passes
              and every active anchor passes

  return the version-bound evidence-bearing report
```

The boolean is the only completion value required. Diagnostics explain it; they are not a second
public status vocabulary.

### Presence evaluation

A presence clause passes when the selected node count is at least `minimumCount`. The report
includes the selected node IDs. Presence checks model cardinality only; they do not manufacture
evidence or grade.

### Slot evaluation

Every selected slot must pass:

- `stated(value, grade, supportingCaptureIds)` passes when grade meets the declared minimum, all
  support needed for the folded value is active and traceable, and every supporting status the
  fold relies on is accepted.
- `unaddressed` fails with `unaddressed`.
- `absent(absence, captureId)` passes only when that exact absence is accepted, the capture is
  active and traceable, and its status is accepted. `not-mentioned` cannot pass because it is a
  computed fact, not evidence.
- `conflicted(openIssueIds)` fails with `open-conflict` until explicit resolution.
- `diverged(prescribed, practiced)` fails with `unevaluable-divergence`. The canonical shorthand
  does not expose grade and supporting captures for each side, so this contract cannot evaluate
  either constituent honestly.

Other diagnostics are `below-minimum-count`, `no-selected-slot`, `below-required-grade`,
`inadmissible-status`, `unaccepted-absence`, `missing-evidence`, `unsupported-active-anchor`, and
`version-mismatch`.
Open issues outside selected demand coordinates remain visible but do not block objective-relative
completion.

## Evidence-bearing report

```yaml
CompletionReport:
  targetDocumentRevision: opaque immutable revision
  pluginContractVersion: immutable plugin version or digest
  demandTableVersion: immutable demand-table version or digest
  complete: boolean
  floor:
    - clauseId
      clauseType
      selectedModelCoordinates
      requirement
      actual
      pass: boolean
      diagnostics
      supportingCaptureIds
      openIssueIds
  objectives:
    - anchorNodeId
      supportingCaptureIds
      matchedDemandRowIds
      supportCheck:
        pass: boolean
        diagnostics
      obligations: same assessment shape as floor
      pass: boolean
```

The report follows register-2 support links to deposited captures and carries their capture IDs. It
never semantically rereads the transcript.

## Session control and no progress

After each settled sweep, session control may read the completion report plus separate session
facts. It may ask, deliver and defer, or stop. None rewrites the report. A later evidence
change can also make a previously complete target-document incomplete; completion never locks it.

Runtime no-progress policy remains outside this contract. A candidate detector may compare frames
for newly deposited demanded evidence, demanded slot or obligation changes, and delivery changes.
An advisory can force session-control adjudication but cannot supply a positive completion verdict.
The rehearsal owns one bounded threshold solely to score the baseline.

## Read-time deferral licensing

Licensed deferral is a session-control decision computed from existing authorities. It creates no
third persistence surface and writes no target-document truth. The session controller owns this
pure projection:

```yaml
DeferralLicensingInput:
  completionReport: version-bound CompletionReport
  captureStore:
    snapshotRevision: immutable revision inspected by completion
    locatedIssuesAndAbsences: existing capture-store records
  sessionLog:
    archivePointer: durable archive pointer
    archiveRevision: immutable revision or digest
    sweptHighWaterMark: durable entry identifier
    unsweptTail: bounded entry range or empty
  pendingAffordanceSlot:
    stateRevision: immutable revision or digest
    affordanceId: identifier?
  delivery:
    projectionRef: durable projection/artifact pointer?
    sourceTargetDocumentRevision: immutable revision?

BlockingObligationLocator:
  ModelCoordinateLocator | UnresolvedTargetLocator

ModelCoordinateLocator:
  type: model-coordinate
  coordinate: register-2 model coordinate
  issueIds: existing identifiers[]
  absenceCaptureIds: existing identifiers[]

UnresolvedTargetLocator:
  type: unresolved-target
  clauseId: stable demand-clause identifier
  scope: exact ScopeExpr
  diagnostic: below-minimum-count | no-selected-slot

DeferralLicensingReport:
  inspected:
    targetDocumentRevision
    pluginContractVersion
    demandTableVersion
    captureStoreSnapshotRevision
    sessionArchivePointer
    sessionArchiveRevision
    sweptHighWaterMark
    unsweptTailRange
    pendingAffordanceStateRevision
    pendingAffordanceId
    deliveryProjectionRef
    deliverySourceTargetDocumentRevision
  blockers:
    - clauseId
      locator: BlockingObligationLocator
  checks:
    sweepAndArchiveStateRecoverable: boolean
    everyBlockingObligationLocated: boolean
    currentBestProjectionDurablyDelivered: boolean
    reentryFactsRecoverable: boolean
  licensed: boolean
  diagnostics: string[]
```

The locator is a union because a blocker may already have a model coordinate, issue, or explicit
absence, while a failed presence clause or `no-selected-slot` has no selected model node. The
second arm preserves the unresolved clause and exact scope instead. Every completion blocker must
have one arm; a missing locator keeps `everyBlockingObligationLocated` false.

`sweepAndArchiveStateRecoverable` permits an explicitly bounded unswept tail only when the archive
pointer, archive revision, and swept high-water mark recover it exactly; it does not silently call
that tail settled.

`licensed` is true only when all four checks pass and every inspected revision, digest, pointer,
high-water mark, pending-affordance fact, and projection reference still resolves to the state
shown in the report. The durable delivery must be the best current projection for the same
`targetDocumentRevision` evaluated by completion; absent delivery fields make
`currentBestProjectionDurablyDelivered` false. The report itself is ephemeral: it may be
recomputed for audit, but it is not stored as target-document or capture-store truth.

The current authoritative schemas carry no durable undelivered-delivery obligation with reason,
owner, and next action. Therefore an undelivered best result cannot license deferral. Such an
obligation remains successor strain and requires an approved durability-contract owner; it must not
be invented in `CaptureIssue` or in a new record here.

### Existing-operation sequence

Before quieting, session control uses existing operations in this order: settle/sweep and archive;
recompute version-bound completion; locate every blocker; durably deliver the best current
projection; validate recoverable session-log/capture-store changes and the existing pending
affordance; compute the licensing report; then quiet only if `licensed` is true. On re-entry it
reloads the same authoritative surfaces, validates the report's bound revisions and pointers, and
recomputes completion and licensing. There is no create/update/consume lifecycle for a new deposit.

## Claims, limits, and replay

This contract claims only deterministic, version-bound completion and deferral-licensing
computation shapes over existing authorities. It does not show that the harness, plugin SDK,
capture store, sweep, controller, detector, binding, projection, or application implements them.
FE-1407's specified and candidate prevention claims keep those grades.

The [rehearsal](../../evidence/proofs/design/elicitation-completion-rehearsal.md) owns the provisional
CPS demand table, all prefix assessments, failure-signature verdicts, amendments found by replay,
and successor evidence. Keeping those judgment-bearing results out of required behavior prevents a
single baseline oracle from becoming generic plugin canon.

## Out of scope

- runtime, detector, controller, or TypeScript implementation;
- capture-envelope, `CaptureIssue`, session-state, or durability-contract changes;
- final CPS demand-table authoring;
- projection, realization, or delivery validation; and
- a public lifecycle-status enum.
