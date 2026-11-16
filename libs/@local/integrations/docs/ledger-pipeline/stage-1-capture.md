# Stage 1: Capture — first planning pass

Continues the [stage breakdown](03-step-contracts.md). Capture must support **full database dumps, partial incremental updates and future input types**. The contracts below are proposals, not final wire schemas.

## Responsibility

Read source data, preserve its meaning and publish a repeatable capture in S3. Capture does source decoding and structural validation. Entity IDs, Graph property conversion, diff computation, prior-state reconstruction and Iceberg writes belong to Prepare.

Generic capture means a shared publication contract with input-specific readers and payload formats. It does not mean treating a database dump as a stream of partial updates. Every published input kind must have a compatible Prepare strategy.

## Supported inputs

| Input | Capture preserves | Prepare does |
| --- | --- | --- |
| Full database dump | Complete rows, schema, covered tables/scope and source snapshot/completeness information. Large dumps may span many files. | Initial sync prepares all rows; snapshot hash/diff compares with the accepted baseline to derive changes. |
| Partial incremental updates | Record identity, supplied fields, explicit deletions and source ordering/positions where available. | Resolve patches against required prior context, then prepare entity changes. |
| Future input types | A declared kind, versioned format and the metadata needed to interpret the payload. | A matching strategy produces the same ledger change contract. |

Snapshot absence only supports deletion detection within a declared complete scope. A file chunk is not a complete snapshot. A capture timestamp alone does not prove source consistency. Partial updates must retain omitted versus explicitly null fields.

## Shared capture output

The completed manifest identifies the input kind, format/schema version, source and scope, immutable file/chunk references, counts and completion evidence. Snapshot tokens or incremental cursor ranges are input-specific metadata; neither is mandatory for every kind of input. Unsupported kinds or versions fail explicitly before preparation.

The physical formats remain to be agreed. Use bounded reads/writes so full dumps do not need to fit in memory.

## Incremental payload example

This envelope applies to the incremental path only; snapshots keep their row representation.

| Information | Purpose |
| --- | --- |
| Source identity and record key | Identify the source record, including composite keys. Source identity can be shared by the file/manifest. |
| Source operation | Distinguish creation, update and record deletion. Preserve the source's actual guarantees about creation payloads. |
| Event identity and position | Support ordering, duplicate recognition and replay. Include partition information where positions are partition-local. |
| Supplied fields and values | Preserve only the fields actually present in the update, including explicit null values. |
| Explicit field removals, where supported | Distinguish removing a field from setting it to null or leaving it unchanged. |

Illustrative update:

```text
source: people
key: 42
operation: update
position: 108
supplied: { age: "31", nickname: null }
removed: []
```

`age` is supplied in its source representation; conversion happens later. `nickname` is explicitly null. An omitted `name` means leave it unchanged. A record deletion carries its identity and operation without a fake empty property object.

Nested field paths, array updates and conflicting set/remove instructions need a defined encoding. Ordinary nullable Parquet columns alone do not distinguish omission from explicit null; use a presence representation if we retain that format. Do not choose the physical format before agreeing these semantics.

## Output types and reuse

| Existing type | Proposed adaptation |
| --- | --- |
| [`CaptureOutput`](../../pipeline/src/stage/capture/mod.rs) | Retain the source manifest map and capture metadata. Declare input kind, scope and completed boundaries. |
| [`CapturedSource`](../../pipeline/src/sources/mod.rs) | Extend the current single file + row count to file/chunk references, schema/format, counts and input-specific snapshot/range metadata. |
| `ArtifactRef`, `CaptureStore` | Reuse immutable publication, checksums and completed-source reuse. Adapt paths to the integration bucket. |
| [`SourceCapture`](../../pipeline/src/capture.rs) | Reuse bounded Parquet IO where suitable. Its current row format is not automatically a partial-update envelope. |

Keep source event positions separate from stage 2's `change_index`: one source event may produce several entity changes. Multiple updates to the same record are not necessarily duplicates; retain their ordering and identities for Prepare.

## Execution and recovery

1. Validate the pinned run/source request and return a matching completed capture if one exists.
2. Establish the snapshot scope or finite source range for each input. Record how retries retain that boundary; do not silently mix snapshots or source ranges.
3. Read, decode and structurally validate the input, writing bounded files. Do not drop malformed records silently or acknowledge source data before its required durable capture evidence exists.
4. Publish the complete source manifests, then `capture/_done.json` after every required source is ready. Stage 2 consumes only this completed output.

An interrupted capture may reuse completed source/chunk data only when its snapshot/range and schema remain compatible. Otherwise restart with a valid capture boundary; do not stitch incompatible attempts together. Empty completed inputs are valid. A timeout, page limit or truncated response is not automatically completion.

Per-source resume records and cursor acknowledgement details remain to be specified for the selected connector. Captured progress and Graph-applied progress must stay distinct. Retain the existing completed-capture and partial-retry regressions from [capture tests](../../pipeline/src/stage/capture/tests.rs).

## First review cases

- A full dump retains its schema and declared coverage across chunks; no individual chunk implies snapshot completion or missing-row deletion.
- The same captured snapshot can feed initial sync or hash/diff without changing Capture's responsibility.
- Omitted field, explicit null and explicit removal remain distinct after storage/reload.
- Repeated events retain identity; distinct updates to the same key retain order.
- Explicit record deletion survives capture without being confused with an empty update.
- A crash before completion does not expose a partial capture; a completed capture is reused even if the live source changes.
- Empty inputs, chunk boundaries and malformed payloads produce the declared completion/error behavior.
- Input kind and format version select a compatible reader/Prepare strategy; unsupported inputs fail explicitly.

## Next decisions

Agree the shared manifest first, then define payload formats for full snapshots and partial updates separately. For snapshots, specify scope and consistency evidence; for updates, specify field presence, nested patches and cursor semantics. Selecting the first CLI connector must not narrow the overall Capture contract.

**Prepare dependency:** partial patches need a known baseline or sufficient prior source context. The mapped entity ledger may not preserve every raw field required by later transformations. Stage 2 planning must resolve this; Capture must not hide the gap by inventing missing values.

## Next session: turn this into an issue-ready contract

1. Walk through two concrete inputs: a full dump spanning several chunks, and partial updates containing omission, explicit null and deletion. Confirm the meaning Prepare must receive.
2. Agree the common manifest fields and input-specific metadata. Trace empty, complete and interrupted captures; identify which source boundaries can actually be resumed.
3. Choose the first CLI input/connector and its payload format. Compare the proposed types with the existing Capture implementation and record reusable code versus required changes.
4. Draft **1.1 Capture and publish input** as the parent issue. Add sub-issues only for coherent work such as manifest/publication or an input-specific reader. Attach the review cases above and explicit Prepare dependencies.

The output of this session should be reviewed contract shapes, publication/recovery rules and issue drafts with acceptance criteria. Do not treat the illustrative patch envelope or an existing Parquet layout as an already agreed schema.
