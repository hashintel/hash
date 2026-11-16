# Ingestion pipeline: stage and step breakdown

This is the single high-level working plan for the new architecture. It covers responsibilities, shared types, persistence and review scopes. We will define exact schemas, APIs, algorithms and acceptance cases in a separate planning session for each stage, as in the previous refactor.

The [overview diagram](index.html) follows the five review units below, with hover explanations of the stages, preparation strategies and persistence. The [previous pipeline specs](../pipeline/00-overview.md) and existing implementation remain reference material.

## Goal and design boundaries

Build a pipeline that is straightforward to extend, review and recover: accept different source inputs, derive entity changes through interchangeable preparation strategies, and reliably deliver them to the Graph. Support large inputs with bounded memory and chunked processing. Reuse working Rust conversion, identity, storage and delivery code rather than rebuilding it wholesale.

The agreed architectural direction is:

- **Three stages and five review units.** Capture stays generic; initial sync, full-snapshot hash/diff and partial incremental updates are supported paths. Incremental Prepare is the first path to detail, not the only capture contract.
- **One entity-change ledger in Iceberg.** The application computes changes and appends operations and resolved entity values. Iceberg is not being asked to generate arbitrary net diffs between snapshots. Retain the history required to reconstruct earlier accepted states.
- **Separate data from execution progress.** Captured source input and prepared entity changes have different roles. S3 run records track stage completion and confirmed Graph delivery. The ledger is desired integration state, not a replica of all Graph data or proof that writes succeeded.
- **Remove redundant representations.** No projections, separate persisted content-hash table/diff files, separate Plan writes stage or stored request bodies. Artifact checksums and transient comparison work are still allowed; removing a hash table does not remove integrity checks or diff computation.
- **CLI first; orchestration later.** Stage contracts must be callable outside the CLI. Runs for an integration must not overtake unresolved predecessors. RabbitMQ is the intended later queueing direction; its ownership/recovery design is not settled. Restate integration is out of scope.

Precise schemas and algorithms below remain proposals until their stage planning is complete. Simplicity is a design goal, not permission to omit a required recovery or history guarantee.

## Overview

Working proposal; detailed contracts are still being aligned.

### Stages and steps

**Capture → Prepare → Send & record**

| Stage | Steps |
| --- | --- |
| **1. Capture** | Read source data → validate its structure → save data and a completed manifest to S3. Supports full database dumps, partial updates and future input types. |
| **2. Prepare** | Interpret the input → derive entity changes using shared mapping/type conversion → append changes to the Iceberg sync ledger. Initial sync, snapshot hash/diff and incremental updates use different preparation strategies. |
| **3. Send & record** | Read the run's ledger changes → generate Graph requests in memory → send batches → record outcomes and complete the run. |

### S3 and Iceberg

Each integration has its own S3 bucket:

- **Capture data:** saved input plus its format, scope and completeness, so later stages can retry without recapturing.
- **Iceberg sync ledger:** entity changes linked to `run_id` and `change_index`. Upserts store resolved entity values; deletes store tombstones. Retained history supports replay and restore.
- **Run records:** pinned inputs, stage completion markers and batch outcomes. `current.json` points to the active and last completed runs.

Stage outputs are persisted before completion is published. Retries reuse completed outputs and confirmed batch successes; uncertain Graph outcomes require safe replay or reconciliation. There are no projections, separate content-hash/diff files or saved Graph request bodies. Capture retains source input; the ledger retains prepared entity changes.

The CLI drives the stages first. Queue orchestration comes later. Capture formats and the matching Prepare contracts remain to be specified; the incremental strategy below is one supported path.

## Stages and review units

| Stage | Step / parent issue | Input → output | Persistence |
| --- | --- | --- | --- |
| Capture | **1.1 Capture and publish input** | Source snapshot/range → `CaptureOutput` | Capture files, then completion marker |
| Prepare | **2.1 Prepare entity changes** | Capture + definition/base → resolved `SyncChange` records and diagnostics | Internal computation |
| | **2.2 Commit the sync ledger** | Resolved changes → `PrepareOutput` | Iceberg commits, then completion marker |
| Send & record | **3.1 Generate requests and batches** | Pinned ledger selection → bounded `RequestBatch` stream | In-memory requests |
| | **3.2 Deliver, record and complete** | Batches + prior outcomes → `SendOutput` | Batch progress, send marker, then current pointer |

Each step is a cohesive issue/PR scope, with related sub-issues when needed. Internal tasks do not each need a public type, trait or checkpoint. `SyncChange` and `RequestBatch` are proposed logical types; processing must remain bounded rather than loading entire runs into memory.

### 1.1 Capture and publish input

Read a bounded source input: a full database dump, incremental changes or a future supported input kind. Preserve its meaning and declare its kind, format/schema, scope and completion boundary in the manifest. Snapshots retain complete rows and coverage; incremental inputs retain identities/order, partial-field presence and explicit deletions. Input-specific readers share the same publication contract without forcing every payload into a change-event envelope. Write capture files and publish their completed manifest last. An incomplete read must not look complete. See [Stage 1 planning](stage-1-capture.md).

Reuse [`SourceReader`, `CapturedSource`](../../pipeline/src/sources/mod.rs), [`CaptureOutput`](../../pipeline/src/stage/capture/mod.rs), `ArtifactRef` and publication helpers. Incremental connector readers can be related sub-issues. Verify replay from saved input in a fresh process.

### 2.1 Prepare entity changes

The strategy owns transformations, required prior context, source ordering/deduplication, change selection, archives, conflicting-output checks and deterministic `change_index` assignment. It calls the shared converter described below.

Use two related sub-issues: **shared conversion and regression fixtures**, then **incremental strategy integration**. Reuse [row preparation](../../pipeline/src/stage/diff/rows/mod.rs) where its semantics fit incremental data. Complete changed rows make conversion straightforward; partial patches and joins/aggregations may need prior source context that an entity ledger alone cannot supply.

### 2.2 Commit the sync ledger

Encode resolved records, write bounded files, commit through Iceberg and publish the accepted `PrepareOutput`, including diagnostics when needed. A zero-change run still has a completed output. Reuse marker/storage patterns; ledger encoding and append recovery are new work.

Review lossless value storage and recovery when an append committed but its completion marker was never written. Stable change IDs identify duplicates; they do not themselves prevent duplicate appends.

### 3.1 Generate requests and batches

Read accepted ledger data, encode requests and form reproducible batches with count/byte limits and valid entity/link dependencies. Preserve the order of repeated changes to an entity, or consolidate them under an agreed rule. Do not use physical file order as batch identity.

Reuse [request encoders](../../pipeline/src/graph/plan/request.rs), in-memory `PlannedUpsert` where useful, and [batching rules](../../pipeline/src/stage/plan/write.rs). Replace persisted request files and their reader. Define create/patch selection without depending on the old `Change::Insert` hint.

### 3.2 Deliver, record and complete

Submit batches, handle retries/fallbacks and rejected dependencies, record outcomes, resume unresolved work and finalize the run. Sending and recording stay in one parent scope because their failure boundary must be reviewed together.

Reuse `Graph`, `GraphResponse`, `RequestKind`, `SendSettings`, [delivery logic](../../pipeline/src/stage/send/delivery.rs), `SendCounts` and conditional S3 updates. Verify Graph success before progress storage and send completion before pointer publication. Retain relevant real Graph/storage regression coverage.

## Shared conversion

**Input:** complete mapping inputs, pinned property/unit definitions and identity context (web, namespace and source identities).

**Output:** resolved entity/link IDs, exact type versions, properties with metadata, link endpoints where applicable, and diagnostics. Reuse the value shapes of `EntityUpsert` / `LinkUpsert`, [ID helpers](../../pipeline/src/entity_id.rs) and [`SinkRow`, `ResolvedProperties`, `ConversionFailure`](../../pipeline/src/graph/property/mod.rs). Split conversion from the old planner; HTTP encoding stays in Send.

The converter is deterministic, bounded computation with no external IO or current-time dependency. It does not select changes, assign ledger indices or publish data. Each strategy calls it where needed; full-snapshot preparation may convert before comparing.

The strategy resolves partial-input context first. The existing resolver treats missing columns like null, so it cannot be reused unchanged as a patch merger. Invalid values produce diagnostics; acceptance/omission policy must be agreed explicitly. Deletions reuse identity derivation without converting a nonexistent payload.

## Sync-table fields

| Fields | Purpose |
| --- | --- |
| `run_id`, `change_index` | Identify a logical change. The zero-based index is stable within the run across retries. |
| `entity_id`, `operation` | Graph identity and existing `OperationKind`: entity/link upsert or archive. |
| `target`, `source_id` | Originating sink/link pipeline and canonical source identity. |
| `entity_type`, `properties` | Exact type version and complete resolved property values/metadata for an upsert. |
| `left_entity_id`, `right_entity_id` | Endpoints for link upserts. |

No `integration_id` or `run_sequence` column: the bucket identifies the integration, and S3 records establish accepted run order. An upsert includes unchanged properties of that changed entity, not unchanged entities elsewhere. An archive is a tombstone; prior rows retain former values. Whether repeated changes are consolidated remains open; keep `change_index` either way.

## Run state and persistence

Stage markers and batch outcomes are the durable evidence. `current.json` selects the active run and last completed run; any stage summary there is derived, not a second execution history.

| Boundary | Ordered writes | Recovery rule |
| --- | --- | --- |
| Start | Immutable `runs/<id>/run.json` → conditionally set `current.json.active_run` | Pin predecessor, definition, mode, identity/provenance context and format/encoder settings. Validate existing inputs and expected predecessor before starting. |
| Capture | `capture/data/…` → `capture/_done.json` under the run | Reuse completed capture; otherwise resume supported positions or recapture. Partial files are not completion. |
| Prepare | Iceberg append(s) → diagnostics, if any → `prepare/_done.json` | Discover already committed run/chunk data before retrying. The marker selects the complete accepted table/snapshot reference. |
| Deliver | `send/batches/<id>.json` pending record → Graph request → recorded outcome | Store stable change references and outcomes, not request bodies. Skip confirmed successes; pending/unknown needs safe replay or reconciliation. |
| Complete | `send/_done.json` → conditionally advance `last_completed_run` and clear `active_run` | If only the marker exists, finish pointer publication without resending. Never overwrite a newer completed run. |

Paths other than `current.json` and Iceberg data are under `runs/<run-id>/`. Conversion and batch generation have no separate durable checkpoint. Immutable outputs select one result for pinned inputs; mutable records reject stale overwrites. Iceberg commit and S3 marker publication are separate transactions whose recovery protocol needs detailed planning.

The lifecycle is **admitted → captured → prepared → sending → completed**. Resume reads durable evidence; a crash need not write “failed.” Prepared state does not prove Graph delivery. Unresolved or rejected writes currently keep the run incomplete, and later runs must not overtake it. Captured source progress and Graph-applied progress remain distinct. Conditional S3 updates alone do not establish exclusive worker ownership.

## Replay and later stage planning

Replay folds accepted ledger history through a chosen run to reconstruct this integration's desired state. Restore appends compensating changes as a new run; it does not erase history. Repair also considers failed/uncertain delivery, even when desired values have not changed. Retain the data, run references and compatible readers needed for replay.

Next, plan each stage in depth:

1. **Capture:** input envelope, cursor/completeness rules, connector behavior and recovery.
2. **Prepare:** conversion APIs, partial-input context, repeated-change policy, field ownership, exact payload encoding and Iceberg commit recovery.
3. **Send & record:** request/batch identity, create/patch policy, rejection handling, safe replay and finalization.

These sessions will define detailed types, algorithms, sub-issues and acceptance checks, using the previous refactor's fixtures and helpers. This document stays the shared architecture/review map rather than accumulating those implementation details.

## Open decisions

Resolve these in the relevant stage plan before the dependent implementation is accepted. They are required design work, not deferred optional features.

| Topic | Decision needed | Planning scope |
| --- | --- | --- |
| Capture format and completeness | Shared manifest, snapshot scope/consistency, partial-field encoding, chunking, cursor boundaries and the first CLI input. | Capture, with Prepare validating usability |
| Partial updates and transformations | Where prior raw source context comes from; how patches, joins and aggregations remain correct when mapped entity history is insufficient. | Capture/Prepare seam |
| Change semantics | Repeated events versus repeated entity changes, stable indices, no-op detection, invalid-value policy, property ownership and link changes. | Shared conversion and Prepare, checked against Send |
| Iceberg publication | Catalog/deployment, Rust read/write APIs, lossless payload encoding, chunk commits and discovery after commit-before-marker failures. | Prepare and shared storage |
| Snapshot comparison and historical access | Efficient accepted-baseline reconstruction, full-snapshot comparison, indexes/checkpoints if needed, and retention of ledger data, run lineage and compatible readers. | Prepare/replay; do not assume snapshots alone retain full application history |
| Delivery and completion | Stable batches, create/patch rules, partial responses, rejected writes, unknown outcomes, retry limits and conditional pointer updates. | Send & record |
| Restore and repair | Accepted history selection, compensating changes, and handling desired/applied divergence after failed or uncertain delivery. | Prepare/Send seam |

Distributed worker ownership, queue routing and lease recovery remain a separate later orchestration scope. The initial CLI must state its single-executor assumption; `current.json` alone does not enforce it.

## Turning steps into issues

Use the five review units above as parent issue candidates. Split only where the work has a cohesive contract and can be reviewed meaningfully. Shared conversion belongs in a reusable scope under 2.1; it must not be duplicated per strategy. Shared run/storage contracts need explicit ownership and dependency links across the stage issues.

Each issue draft should contain:

1. **Outcome and scope:** behavior delivered, stage/step and explicit exclusions.
2. **Contract:** input/output types, invariants and existing types/helpers to reuse or adapt.
3. **Persistence and recovery:** exact S3/Iceberg reads and writes, publication order and crash/retry behavior.
4. **Acceptance:** concrete behavioral and seam cases, including relevant regression coverage and large-input boundaries.
5. **Dependencies and decisions:** linked prerequisites, unresolved choices and what must be settled before implementation.

Expected fixtures must come from agreed examples/specifications, independently of the implementation being tested. Prioritize data meaning and failure boundaries: snapshot completeness, omission/null/removal, saved-input replay, append-before-marker recovery, Graph-success-before-record recovery and completion-before-pointer recovery. An old end-to-end success does not verify these new contracts.

For implementation planning, consult the previous [review findings](../pipeline/06-review-findings.md), [scenarios](../pipeline/03-scenarios.md), [verification record](../pipeline/verification/results.md) and [Rust design guidelines](../pipeline/RUST_DESIGN_GUIDELINES.md). Recheck findings against current code rather than treating historical observations as current facts. Retain build → test → independent review → fix → accept → commit for implementation milestones; define new milestones from this architecture instead of copying the old stage sequence.
