# Integration pipeline: stage 3, Plan writes

## Purpose

Stage 3 reads the changed rows and the archives of checkpoint 2 and writes checkpoint 3: the `writes` file with one row per entity ID in send order, the `issues` file, and the marker `plan/_done.json`. Each upsert row holds the create body and the patch body of its entity, and each archive row holds the archive body. The patch body replaces the whole property object (P7), every body carries the same edition provenance (P14), and entity IDs are read from the `changes` files (A2). The same planning inputs and engine build give the same schema and ordered rows, including exact request JSON; the Parquet bytes may differ (CR-3).

This spec implements [`01-contracts.md`](01-contracts.md) and refers to its sections by title. [`shared-run.md`](shared-run.md) specifies the code in `engine/src/run/`, and this spec uses its names. Decision IDs are those of [`00-overview.md`](00-overview.md).

Paths are relative to `libs/@local/integrations/` unless they start with `libs/`, `apps/` or `tests/`. Line numbers under `engine/src/graph/` are those of `origin/main` at `c47a17eed3`. Line numbers under `engine/src/workspace/`, `engine/src/storage/` and `engine/src/sources/` are those of the BE-933 checkout.

### Terms

- **Body:** the JSON text of one entity in a request to the Graph.
- **First request:** the request stage 4 sends first for a write. It is the create for a row with `change` `insert`, and the patch for every other row. For an archive it is the patch request that carries the archive body.
- **Group:** the writes that have the same operation and the same first request. The six groups, in send order, are: entity upserts that start with the create, entity upserts that start with the patch, link upserts that start with the create, link upserts that start with the patch, link archives, entity archives.
- **Range:** the rows of one table whose `_row` is at least a start and less than an end.
- **Cursor:** the reader of one target's `changes` table for one group. It holds one range in memory.

## Module layout

### New files under `engine/src/stage/plan/`

| File | Content | Visibility |
| --- | --- | --- |
| `mod.rs` | `PlanOutput`, the stage function `plan`, and `write_checkpoint`, which calls the other files in order. | `plan` and `PlanOutput` are `pub`. `write_checkpoint` is private. |
| `provenance.rs` | `run_provenance`, which builds the edition provenance of the run. | `pub(super)` |
| `target.rs` | `PlanTarget`, `Mapping`, and `plan_targets`, which finds the sink or link pipeline of each target that has a `changes` file. | `pub(super)` |
| `rows.rs` | `RANGE_ROWS`, the names of the engine columns, `read_range`, `ChangePage`, `ChangeRow`, `ChangeCursor`, `parse_entity_id`. | `pub(super)` |
| `upsert.rs` | `plan_upserts`, which reads one target at a time within a group, and `plan_row`, which plans one row. | `plan_upserts` is `pub(super)`. `plan_row` is private. |
| `archive.rs` | `number_archives` and `plan_archives`. | `pub(super)` |
| `buffer.rs` | `BufferedFile`, which pushes rows to a `RowFile` on a blocking thread. | `pub(super)` |
| `write.rs` | `FirstRequest`, `Group`, `Write`, `Batcher`, `WriteFile`, `StoredWrites`, and the batch limits. | `pub(super)` |
| `issue.rs` | `IssueFile` and `reason_name`. | `pub(super)` |
| `tests.rs` | The fixtures and the tests of this module. | `#[cfg(test)]` |
| `scenario_tests.rs` | The stage 3 expectations of the scenarios S1 to S9. | `#[cfg(test)]` |

### Changed files

| File | Change | Visibility of the changed items |
| --- | --- | --- |
| `engine/src/graph/mod.rs` | `EntityUpsert::new`, `LinkUpsert::new`, `LinkEndpoint` and `GraphOperation` are removed. `LinkUpsert::properties` is no longer optional. `OperationKind` gets `as_str`, `from_stored` and a serde form. | `EntityUpsert`, `LinkUpsert`, `Archive` and `OperationKind` stay `pub`. |
| `engine/src/graph/plan/mod.rs` | `Planner` plans one row per call and returns the bodies. `PlannedUpsert` is new. The payload and plan types are removed. | `Planner`, `PlannedUpsert` and `UnencodableRequest` are `pub`. |
| `engine/src/graph/plan/request.rs` | The patch body becomes one replace. The delivery envelope is removed. Three functions return bodies as text. | `upsert_entity`, `upsert_link`, `archive` and `UpsertBodies` are `pub(super)`. Everything else is private. |
| `engine/src/graph/property/mod.rs` | `ConversionFailure` no longer holds the row's value. | `ConversionFailure` stays `pub`. |
| `engine/src/workspace/rows.rs` | `Rows::get` is new. | `pub` |
| `engine/src/run/error.rs` | `Code` gets the three variants of "Error mapping". | `pub` |
| `engine/src/lib.rs` | The re-exports follow the removed and added items. | `pub` |

The table in "Existing code" gives each change with its line. The contracts put the `Graph` trait and `GraphResponse` in `engine/src/graph/`, next to `GraphClient`, and `stage-4-send.md` specifies them. Stage 3 uses neither, and no change in the table above touches them.

## Types

Types that the contracts or `shared-run.md` give in full are used as they are: `RunContext`, `RunInput`, `CaptureOutput`, `DiffOutput`, `TargetDiff`, `Target`, `Kind`, `Change`, `Column`, `ColumnKind`, `Cell`, `RowFile`, `StageError`, `Code`.

### `engine/src/stage/plan/mod.rs`

```rust
/// The stored result of stage 3.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlanOutput {
    /// The `writes` file.
    pub writes: ArtifactRef,
    /// The `issues` file of stage 3.
    pub issues: ArtifactRef,
    /// The number of batches in `writes`. The batch numbers are 0 to `batches - 1`.
    pub batches: u32,
    /// The number of writes per operation. Every operation has an entry, also when it has no write.
    pub counts: BTreeMap<OperationKind, u64>,
}
```

### `engine/src/stage/plan/target.rs`

```rust
/// How the rows of one target become properties.
pub(super) enum Mapping<'definition> {
    /// The target is a sink step.
    Entity(&'definition EntitySink),
    /// The target is a link pipeline.
    Link(&'definition LinkPipeline),
}

/// A target of the run that has a `changes` file.
pub(super) struct PlanTarget<'run> {
    /// The target as `DiffOutput::targets` names it.
    pub(super) target: &'run Target,
    /// The sink or link pipeline of the target in the run's definition.
    pub(super) mapping: Mapping<'run>,
    /// The target's `changes` file.
    pub(super) changes: &'run ArtifactRef,
    /// The workspace table the file is loaded into: `changes/{target}`, for example `changes/entity/sink-aircraft`.
    pub(super) table: Box<str>,
}
```

### `engine/src/stage/plan/rows.rs`

```rust
/// The number of `_row` values one range query covers.
pub(super) const RANGE_ROWS: u64 = 2_048;

pub(super) const ROW: &str = "_row";
pub(super) const ENTITY_ID: &str = "_entity_id";
pub(super) const CHANGE: &str = "_change";
pub(super) const SOURCE_ID: &str = "_source_id";
pub(super) const KEY: &str = "_key";
pub(super) const LEFT_ENTITY_ID: &str = "_left_entity_id";
pub(super) const RIGHT_ENTITY_ID: &str = "_right_entity_id";

/// The positions of the engine columns in the rows of one query.
struct ChangeColumns {
    /// The position of `_entity_id`.
    entity_id: usize,
    /// The position of `_change`.
    change: usize,
    /// The position of `_source_id`.
    source_id: usize,
    /// The position of `_key`, when the file has the column.
    key: Option<usize>,
    /// The position of `_left_entity_id`, when the file has the column.
    left_entity_id: Option<usize>,
    /// The position of `_right_entity_id`, when the file has the column.
    right_entity_id: Option<usize>,
}

/// The rows of one range of a `changes` table.
pub(super) struct ChangePage {
    /// The positions of all columns by name, for the property accessors.
    columns: SinkColumns,
    /// The positions of the engine columns.
    engine: ChangeColumns,
    /// The rows, in `_row` order.
    rows: Rows,
}

/// One row of a `changes` table. It borrows from its page.
pub(super) struct ChangeRow<'page> {
    /// The text of `_entity_id`.
    pub(super) entity_id: &'page str,
    /// The value of `_change`.
    pub(super) change: Change,
    /// The text of `_source_id`.
    pub(super) source_id: &'page str,
    /// The text of `_key`, when the file has the column and the value is not null.
    pub(super) key: Option<&'page str>,
    /// The text of `_left_entity_id`, for a link.
    pub(super) left_entity_id: Option<&'page str>,
    /// The text of `_right_entity_id`, for a link.
    pub(super) right_entity_id: Option<&'page str>,
    /// All values of the row, read by column name.
    pub(super) values: SinkRow<'page>,
}

/// Reads the rows of one group from one target's `changes` table, in `_row` order.
pub(super) struct ChangeCursor<'run> {
    /// The target the rows belong to.
    pub(super) target: &'run PlanTarget<'run>,
    /// The first request of the group.
    first: FirstRequest,
    /// The number of rows in the table.
    rows: u64,
    /// The rows of the group that the cursor has not returned yet.
    remaining: u64,
    /// The start of the next range.
    next_row: u64,
    /// The range in memory.
    page: Option<ChangePage>,
    /// The position of the next row in `page`.
    position: usize,
}
```

### `engine/src/stage/plan/write.rs`

```rust
/// The most writes one batch holds.
pub(super) const BATCH_WRITES: u32 = 128;
/// The most bytes the first-request bodies of one batch add up to.
pub(super) const BATCH_BYTES: u64 = 1_500_000;
/// The largest request the Graph reads: axum's default body limit of 2 MiB.
pub(super) const GRAPH_REQUEST_BYTES: u64 = 2 * 1024 * 1024;

/// The request stage 4 sends first for a write.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum FirstRequest { Create, Patch }

/// The operation and first request that the writes of one batch share.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct Group {
    pub(super) operation: OperationKind,
    pub(super) first: FirstRequest,
}

/// One row of the `writes` file without `seq` and `batch`.
pub(super) struct Write {
    pub(super) operation: OperationKind,
    pub(super) change: Change,
    /// `{web}~{uuid}`.
    pub(super) entity_id: Box<str>,
    /// The step ID or link ID.
    pub(super) target: Box<str>,
    pub(super) source_id: Box<str>,
    /// Set for a link upsert.
    pub(super) left_entity_id: Option<Box<str>>,
    /// Set for a link upsert.
    pub(super) right_entity_id: Option<Box<str>>,
    /// The create body. `None` for an archive.
    pub(super) create: Option<Box<str>>,
    /// The patch body, or the archive body for an archive.
    pub(super) patch: Box<str>,
}

/// Gives each write its batch number.
pub(super) struct Batcher {
    /// The number the next new batch gets.
    next: u32,
    /// The batch that still takes writes.
    open: Option<OpenBatch>,
}

/// The state of the batch that still takes writes.
struct OpenBatch {
    group: Group,
    number: u32,
    writes: u32,
    bytes: u64,
}

/// The `writes` file while it is written.
pub(super) struct WriteFile {
    file: BufferedFile,
    batcher: Batcher,
    /// The `seq` of the next write.
    seq: u64,
    counts: BTreeMap<OperationKind, u64>,
}

/// The stored `writes` file with the values `PlanOutput` needs.
pub(super) struct StoredWrites {
    pub(super) file: ArtifactRef,
    pub(super) batches: u32,
    pub(super) counts: BTreeMap<OperationKind, u64>,
}
```

### `engine/src/stage/plan/issue.rs`

```rust
/// The `issues` file of stage 3 while it is written.
pub(super) struct IssueFile {
    file: BufferedFile,
}
```

### `engine/src/stage/plan/buffer.rs`

```rust
/// The rows `BufferedFile` holds before it pushes them.
const BUFFER_ROWS: usize = 1_024;
/// The bytes of cell text `BufferedFile` holds before it pushes them.
const BUFFER_BYTES: usize = 8 * 1024 * 1024;

/// A `RowFile` whose pushes run on a blocking thread.
pub(super) struct BufferedFile {
    /// The file. It is `None` while a blocking task holds it, and after a push failed.
    file: Option<RowFile>,
    /// The rows that are not pushed yet.
    rows: Vec<Box<[Cell]>>,
    /// The bytes of the text cells in `rows`.
    bytes: usize,
}
```

### `engine/src/graph/plan/mod.rs`

```rust
/// Plans the request bodies of one run.
#[derive(Debug, Clone)]
pub struct Planner {
    /// The edition provenance every body carries.
    provenance: ProvidedEntityEditionProvenance,
    /// The unit maps of the run's definition.
    unit_maps: BTreeMap<UnitMapName, UnitMap>,
}

/// The bodies of one upsert and the properties that were left out.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlannedUpsert {
    /// The body of the create request.
    pub create: Box<str>,
    /// The body of the patch request.
    pub patch: Box<str>,
    /// One entry per property whose value could not be converted.
    pub failures: Vec<ConversionFailure>,
}
```

### `engine/src/graph/plan/request.rs`

```rust
/// The create body and the patch body of one upsert.
pub(super) struct UpsertBodies {
    pub(super) create: Box<str>,
    pub(super) patch: Box<str>,
}

/// Updates an existing entity and brings it back if it was archived, as `PatchEntityParams` reads it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PatchEntity {
    entity_id: EntityId,
    entity_type_ids: [VersionedUrl; 1],
    properties: [PropertyPatch; 1],
    archived: bool,
    provenance: ProvidedEntityEditionProvenance,
}

/// A change to the properties, as `PropertyPatchOperation` reads it.
#[derive(Debug, Serialize)]
#[serde(tag = "op", rename_all = "camelCase")]
enum PropertyPatch {
    /// Replaces the property at `path`. An empty path names the whole property object.
    Replace {
        path: [BaseUrl; 0],
        property: PropertyObjectWithMetadata,
    },
}
```

### `engine/src/graph/property/mod.rs`

```rust
/// A property left out of a row's properties because its value could not be converted.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
#[display("could not convert the value of `{property}`")]
pub struct ConversionFailure {
    pub property: VersionedUrl,
    #[error(source)]
    pub reason: FailureReason,
}
```

## Functions

The first subsections state the rules that several functions apply, one per decision. The subsections after "Property issues" give each function with its signature, steps, pseudocode and errors.

### P9: rows come from the `changes` files

Stage 3 reads row values only from the `changes` files of `DiffOutput`. A value takes this path:

1. `load_table` (contracts, "Tables as files") downloads the file and calls `Workspace::load_capture` (`engine/src/workspace/mod.rs:156`). The table gets one column per Parquet column, with the DuckDB type of the Arrow type stored in the file (`engine/src/workspace/connection/capture.rs:135-157`, `:170`).
2. `Workspace::query` (`engine/src/workspace/mod.rs:369`) reads each cell with `row.get::<_, Value>(index)` of the `duckdb` crate (`engine/src/workspace/connection/mod.rs:289`). The variant of `duckdb::types::Value` follows from the column type: `VARCHAR` gives `Value::Text`, `UBIGINT` gives `Value::UBigInt`, `BIGINT` gives `Value::BigInt`, `DECIMAL` gives `Value::Decimal`, `DATE` gives `Value::Date32`, and so on. Stage 3 adds no conversion.
3. `SinkColumns` (`engine/src/graph/property/mod.rs:41`) is built from `Rows::columns()` of the query, and `SinkRow::new` (`:66`) takes the row's values in that order. `SinkRow::resolve` (`:74`) then reads the accessor columns by name.

Every range query is `SELECT *`, so the row holds the engine columns beside the accessor columns. `resolve` reads only the columns the accessors name. An accessor column never has the name of an engine column, because stage 2 fails with `reserved_column` (contracts, "Reserved column names").

### A2: entity IDs come from the row

Stage 3 reads `_entity_id` from the row, and for a link also `_left_entity_id` and `_right_entity_id`. `plan_row` and `plan_archives` parse each text with `parse_entity_id` and pass the IDs to the planner. No code in stage 3 calls `derive_entity_id`.

- `Planner` (`engine/src/graph/plan/mod.rs:252`) loses the fields `web_id` and `namespace`. `Planner::new` (`:263`) loses both parameters.
- `plan_entities` (`:282`) becomes `plan_entity`. It takes the entity ID and one row.
- `plan_links` (`:316`) becomes `plan_link`. It takes the link ID, both endpoint IDs and one row.
- `EntityUpsert::new` (`engine/src/graph/mod.rs:49`) and `LinkUpsert::new` (`:91`) are removed. The planner fills the public fields of `EntityUpsert` and `LinkUpsert`. The derivation they hold moves to step 3 of stage 2, which `stage-2-rows.md` specifies.
- The `namespace` parameter has no reader left in `engine/src/graph`. Stage 3 does not read `RunInput::namespace`.
- `PlanIssue::MissingSourceId` (`engine/src/graph/plan/mod.rs:111`) is removed with `PlanIssue`. Stage 2 leaves a row without an ID out of `changes` and writes the `missing_id` or `missing_endpoint` issue. A `changes` row whose `_entity_id` is null or is not an entity ID fails stage 3 with `invalid_checkpoint`.

The planner takes the IDs as parameters, so the engine column names appear only in `rows.rs`.

### P7: the patch body

Checked against the Graph at `origin/main`:

- `PropertyPatchOperation::Replace { path, property }` is tagged with `op` in camel case (`libs/@blockprotocol/type-system/rust/src/knowledge/property/patch.rs:9-21`). `PropertyPath` is a transparent list (`.../property/path.rs:83-87`), so the empty path is `[]`.
- `PropertyWithMetadata::replace` with an empty path replaces the root (`.../property/mod.rs:329-335`): `get_mut` with no path element returns the root (`:236-274`).
- After the patch the Graph requires the root to be an object and stops with `unreachable!` otherwise (`libs/@local/graph/postgres-store/src/store/postgres/knowledge/entity/patch.rs:491-493`). The `property` of the replace therefore has to deserialize as `PropertyWithMetadata::Object`.
- `PropertyWithMetadata` is untagged with the variants array, object, value in that order (`.../property/mod.rs:136-155`). `PropertyObjectWithMetadata` has the field `value`, a map from base URL to `PropertyWithMetadata`, and the field `metadata`, which defaults when absent and is left out by the serializer when it is empty (`.../property/object.rs:168-176`). `{"value":{}}` and `{"value":{},"metadata":{}}` both deserialize as the object variant.
- `PatchEntityParams` reads `properties` as a list of operations (`libs/@local/graph/store/rust/src/entity/store.rs:497-517`).

The contracts' "Request bodies" state the same form. The planner serializes a `PropertyObjectWithMetadata`, so the `property` is always an object: `{"value":{…}}` with one entry per property and no `metadata` key. Each entry is `{"metadata":{"dataTypeId":…},"value":…}`, the same text the create body holds under `properties.value`. The patch body of an entity and of a link is:

```json
{"archived":false,"entityId":"{web}~{uuid}","entityTypeIds":["{type}"],"properties":[{"op":"replace","path":[],"property":{"value":{}}}],"provenance":{}}
```

- `PropertyPatch` (`engine/src/graph/plan/request.rs:290`) loses the variant `Add` and gets the variant `Replace`.
- `PatchEntity::properties` (`:282`) becomes an array of one `PropertyPatch` and loses `skip_serializing_if`. The body has the `properties` key also when the object is empty.
- `Request::upsert` (`:204`) becomes the private function `upsert`. It no longer builds one patch per property (`:212-221`) and no longer builds an archive body.
- `LinkUpsert::properties` (`engine/src/graph/mod.rs:81`) becomes a `PropertyObjectWithMetadata`. `plan_link` passes the resolved object also when it is empty (`engine/src/graph/plan/mod.rs:346` is removed).
- The create body of a link without properties is unchanged: it holds `"properties":{"value":{}}` and `linkData` with `leftEntityId` and `rightEntityId`.

### P14: one edition provenance per run

`run_provenance` builds the provenance once, and `Planner` copies it into every create, patch and archive body. `loadedAt` is `CaptureOutput::captured_at`, and `location.name` is `RunInput::connector`. Stage 3 reads no clock.

### Labels and operations

| Row | `operation` | `change` | `create` | `patch` | First request |
| --- | --- | --- | --- | --- | --- |
| `changes` row of an entity target with `_change` `insert` | `upsert_entity` | `insert` | The create body | The patch body | Create |
| `changes` row of an entity target with `_change` `update` or `resend` | `upsert_entity` | As `_change` | The create body | The patch body | Patch |
| `changes` row of a link target with `_change` `insert` | `upsert_link` | `insert` | The create body | The patch body | Create |
| `changes` row of a link target with `_change` `update` or `resend` | `upsert_link` | As `_change` | The create body | The patch body | Patch |
| `archives` row with `kind` `link` | `archive_link` | `archive` | Null | The archive body | Patch |
| `archives` row with `kind` `entity` | `archive_entity` | `archive` | Null | The archive body | Patch |

Every upsert row holds both bodies, because stage 4 sends the other one when the first request answers 409 or 404.

### Order

The contracts order `writes` by operation, then first request, then target, then `entity_id`. Stage 3 writes the six groups one after another. Inside a group it obtains that order like this:

- Each `changes` file is ordered by `_entity_id`, and `_row` follows that order. A cursor reads one target's table in `_row` order and returns only the rows of the group.
- `plan_upserts` visits targets of the group's kind in target-ID byte order, as returned by `plan_targets`, and consumes one cursor completely before opening the next. Entity IDs must increase within each target's group; they need not increase across target boundaries. Stage 2 checks entity-ID uniqueness across targets.
- An archive group has one source, the numbered archive table of its kind, which `number_archives` orders by `target`, then `entity_id`. This uses the target stored in the archive record, even if it has left the definition. The checkpoint 2 `archives` file keeps its existing order by kind and entity ID.

Stage 3 holds in memory one range for the current target, one row being planned, and the bounded buffers of `BufferedFile` and `RowFile`. Each pending-row buffer flushes at 1,024 rows or 8 MiB of cell text; one large row can exceed the byte threshold. The number of targets no longer multiplies the number of ranges held in memory.

### Batches

`Batcher::assign` applies the contracts' batch rules to the writes in `seq` order. A write joins the open batch when it has the same group, the batch has fewer than 128 writes, and the batch's bytes plus the byte length of the write's first-request body are at most 1,500,000. Otherwise a new batch starts with the next number.

A bulk request is `[`, the bodies joined by `,`, and `]`. A batch of 128 bodies with 1,500,000 bytes gives a request of 1,500,129 bytes, which is below the Graph's limit of 2,097,152 bytes.

A target boundary does not start a new batch. `Batcher` is shared across all targets of the group.

### Bodies above the limits

- **A first-request body above 1,500,000 bytes.** The write does not fit the open batch, so a new batch starts. The next write does not fit either, so the write is alone in its batch.
- **A body above 2,097,150 bytes.** The request `[body]` is larger than the Graph reads. Stage 3 writes the row as planned and logs one `tracing::warn!` event with the entity ID, the operation and the byte length. Stage 4 sends the write, the Graph refuses it, and stage 4 records it in `rejected` by its table for a single write. The check covers the create body and the patch body, because stage 4 can send either.

### Determinism

The schemas and ordered rows of `writes` and `issues`, including the text of every request body, depend only on checkpoint 2, `RunInput::connector`, `RunInput::definition`, `CaptureOutput::captured_at` and the compiled engine. Parquet encoding is not part of this guarantee (CR-3). Each source of difference in the rows is handled as follows:

| Source | How it is removed |
| --- | --- |
| Key order of JSON objects. `PropertyObjectWithMetadata::value` is a `HashMap` (`libs/@blockprotocol/type-system/rust/src/knowledge/property/object.rs:173`), and a struct or map value of a row becomes a `HashMap` (`engine/src/graph/property/value.rs:83-97`). | `sorted_json` converts the body to a `serde_json::Value`, calls `sort_all_objects`, and prints it. Every object at every depth has its keys in byte order. This also holds when `serde_json` is built with `preserve_order`, which `libs/@local/durable-kernel/Cargo.toml:25` turns on. |
| Whitespace in JSON. | `serde_json::to_string` writes none. |
| The text of a number. | `Real` serializes as an `f64` (`libs/@local/codec/rust/src/numeric/real.rs:383-387`), and `serde_json` prints the shortest text that reads back as the same `f64`. |
| The time. | Stage 3 reads no clock. `loadedAt` is `CaptureOutput::captured_at`. |
| The order DuckDB returns rows in. | Every range query ends with `ORDER BY "_row"`. |
| The order targets are visited in. | `DiffOutput::targets` is a `BTreeMap`; within each kind its target IDs are in byte order. `plan_upserts` consumes each target in that order. Archives are numbered by target and entity ID. Two targets never hold the same entity ID, because stage 2 fails on a duplicate. |
| The order of the failures of one row. | `Properties` is a `BTreeMap` (`definition/src/step.rs:105`), and `SinkRow::resolve` visits it in key order. |
| The order of `issues` rows. | An issue row is written when its write is planned, so `issues` follows `seq`. |
| Iteration of `SinkColumns`, a `HashMap` (`engine/src/graph/property/mod.rs:41`). | It is used for lookups only. |
| Batch numbers. | They are a function of the order and the body lengths. |
| Random names: the database file and the Parquet files in the scratch directory. | None of them is written to a stored file. |
| The Parquet writer. | The schema and row order are preserved. Record-batch boundaries, row-group boundaries and writer metadata may change the file bytes without changing its rows. Tests compare decoded schemas and ordered rows, including the exact JSON strings. |

Different Parquet encodings may have different sizes and sha256 values. Two engine builds can also produce different request text. In either case `finish` returns the marker of the attempt that finished first, and stage 4 reads that attempt's file and sends its exact stored bodies. File hashes still verify artifact integrity; they are not a comparison of logical table contents across attempts.

### Property issues

`SinkRow::resolve` leaves a property out when its value cannot be converted and returns one `ConversionFailure` for it. `plan_row` writes one `issues` row per failure:

| Column | Value |
| --- | --- |
| `kind` | The kind of the target. |
| `target` | The step ID or link ID of the target. |
| `entity_id` | The row's `_entity_id`. |
| `key` | The row's `_key`. It is null when the `changes` file has no `_key` column, which is the case when the target's table has none, or when the value is null. |
| `issue` | `property_unconverted` |
| `property` | `ConversionFailure::property`, the versioned property type URL. |
| `reason` | `reason_name` of `ConversionFailure::reason`: `coercion`, `measure_amount`, `measure_unit` or `unsupported`. |

The row's value is in no column (BE-1146). `ConversionFailure` loses its `value` field so that no log line or error report can print it.

A blank value produces no property and no issue, as today (`engine/src/graph/property/mod.rs:121-123`).

### Error notation

Every error is a `Report<StageError>` that carries a `Code` (contracts, "Errors"; `shared-run.md` sections 3.3 and 4.2). The pseudocode builds one with `Code::X.report()`, or with `Code::X.wrap(report)` when an error of called code is the cause. An error of the workspace goes through `error::statement` or `error::close`. A function of `run/` (`finished`, `finish`, `load_table`, `RunContext::open_workspace`, `RunInput::parse_definition`, and the methods of `RowFile`) returns a `Report<StageError>`, which stage 3 passes on with `?`. The error tables below name the codes stage 3 raises itself. "Error mapping" gives their kinds.

### `plan`, `stage/plan/mod.rs`

```rust
pub async fn plan(
    context: &RunContext,
    input: &RunInput,
    capture: &CaptureOutput,
    diff: &DiffOutput,
) -> Result<PlanOutput, Report<StageError>>
```

1. Build the key of `plan/_done.json` with `ArtifactNamespace::plan_output` and call `finished`. Return the stored output when there is one.
2. Parse the definition with `RunInput::parse_definition`. It returns `None` for a run without a definition.
3. Call `plan_targets`.
4. Build the `Planner` from `run_provenance(input, capture)` and the definition's unit maps. A run without a definition has no unit maps.
5. Open the workspace with `RunContext::open_workspace` and the definition's variables. The workspace is used only to read Parquet files, and no query of stage 3 reads a variable.
6. Call `write_checkpoint`.
7. Close the workspace, whatever step 6 returned.
8. Return the error of step 6 when there is one. Otherwise return the error of step 7 when there is one.
9. Call `finish` and return what it returns.

```rust
let key = context.namespace.plan_output(Uuid::from(input.run));
if let Some(output) = finished::<PlanOutput>(context, &key).await? {
    return Ok(output);
}
let definition = input.parse_definition()?;
let targets = plan_targets(definition.as_ref(), diff)?;
let unit_maps = definition.as_ref().map(|definition| definition.unit_maps().clone()).unwrap_or_default();
let variables = definition.as_ref().map(|definition| definition.variables().clone()).unwrap_or_default();
let planner = Planner::new(run_provenance(input, capture), unit_maps);

let workspace = context.open_workspace(variables).await?;
let written = write_checkpoint(context, &workspace, &planner, &targets, diff).await;
let closed = workspace.close().await.map_err(error::close);
let output = match (written, closed) {
    (Ok(output), Ok(())) => output,
    (Ok(_), Err(error)) => return Err(error),
    (Err(error), closed) => {
        if let Err(close) = closed {
            tracing::warn!(error = ?close, "the plan workspace did not close");
        }
        return Err(error);
    }
};
finish(context, &key, &output).await
```

The function has `#[tracing::instrument(level = "info", skip_all, fields(run = %input.run))]`.

The database file stays in `context.scratch` until the caller deletes the directory (`shared-run.md` section 4.5).

`plan` raises no code of its own. It returns `invalid_definition` from `parse_definition`, `workspace_unavailable` from `open_workspace` and `error::close`, and the errors of `finished`, `write_checkpoint` and `finish`.

### `run_provenance`, `stage/plan/provenance.rs`

```rust
pub(super) fn run_provenance(input: &RunInput, capture: &CaptureOutput) -> ProvidedEntityEditionProvenance
```

1. Build a `SourceProvenance` whose location name is the connector ID and whose `loaded_at` is the capture time. Every other field is empty.
2. Pass it to `integration_provenance` (`engine/src/graph/mod.rs:165`), which sets the source type `integration`, the actor type `machine` and the origin `api`.

```rust
integration_provenance(SourceProvenance {
    ty: SourceType::Integration,
    entity_id: None,
    authors: Vec::new(),
    location: Some(Location {
        name: Some(input.connector.to_string()),
        uri: None,
        description: None,
    }),
    first_published: None,
    last_updated: None,
    loaded_at: Some(capture.captured_at),
})
```

It returns no error. The serialized form is `{"actorType":"machine","origin":{"type":"api"},"sources":[{"loadedAt":"2026-11-06T12:00:00.000000000Z","location":{"name":"aviation"},"type":"integration"}]}` for the connector `aviation` and the capture time `2026-11-06T12:00:00Z`.

### `plan_targets`, `stage/plan/target.rs`

```rust
pub(super) fn plan_targets<'run>(
    definition: Option<&'run Definition>,
    diff: &'run DiffOutput,
) -> Result<Vec<PlanTarget<'run>>, Report<StageError>>
```

1. Collect every sink of the definition by step ID. A sink is a step with `StepKind::Action(Action::Sink(_))`, or a step of a branch with `Action::Sink(_)` (`definition/src/step.rs:159`, `:166`, `:220`).
2. For each entry of `diff.targets` whose `changes` is set, in map order: find the sink with the target's ID when the kind is `Entity`, or the link pipeline with that `LinkPipeline::id` when the kind is `Link`.
3. Return one `PlanTarget` per entry with the table name `changes/{target}`.

```rust
let sinks = definition.map(entity_sinks).unwrap_or_default();     // BTreeMap<&str, &EntitySink>
let links = definition.map_or(&[][..], Definition::link_pipelines);
let mut targets = Vec::new();
for (target, target_diff) in &diff.targets {
    let Some(changes) = &target_diff.changes else { continue };
    let mapping = match target.kind() {
        Kind::Entity => sinks.get(target.id()).copied().map(Mapping::Entity),
        Kind::Link => links.iter().find(|link| link.id.as_ref() == target.id()).map(Mapping::Link),
    }
    .ok_or_else(|| Code::InvalidCheckpoint.report())?;
    targets.push(PlanTarget { target, mapping, changes, table: format!("changes/{target}").into() });
}
Ok(targets)
```

`entity_sinks` is a private function of the same file that walks `Definition::entity_pipelines` and returns the map of step 1.

| Error | Code |
| --- | --- |
| A target with a `changes` file has no sink or link pipeline in the definition, or the run has no definition. | `invalid_checkpoint` |

### `write_checkpoint`, `stage/plan/mod.rs`

```rust
async fn write_checkpoint(
    context: &RunContext,
    workspace: &Workspace,
    planner: &Planner,
    targets: &[PlanTarget<'_>],
    diff: &DiffOutput,
) -> Result<PlanOutput, Report<StageError>>
```

1. Load each target's `changes` file into its table with `load_table`.
2. Load `diff.archives` into the table `archives` and call `number_archives`.
3. Create the `WriteFile` and the `IssueFile`.
4. Plan the four upsert groups in send order.
5. Plan the link archives, then the entity archives.
6. Store `issues`, then `writes`, and return the `PlanOutput`.

```rust
for target in targets {
    load_table(context, workspace, target.changes, target.table.clone()).await?;
}
load_table(context, workspace, &diff.archives, "archives".into()).await?;
number_archives(workspace).await?;

let mut writes = WriteFile::create(context)?;
let mut issues = IssueFile::create(context)?;
for kind in [Kind::Entity, Kind::Link] {
    for first in [FirstRequest::Create, FirstRequest::Patch] {
        plan_upserts(workspace, planner, targets, kind, first, &mut writes, &mut issues).await?;
    }
}
for kind in [Kind::Link, Kind::Entity] {
    plan_archives(workspace, planner, kind, &mut writes).await?;
}
let issues = issues.store(context).await?;
let StoredWrites { file, batches, counts } = writes.store(context).await?;
Ok(PlanOutput { writes: file, issues, batches, counts })
```

It returns the errors of the functions it calls.

### `read_range`, `stage/plan/rows.rs`

```rust
pub(super) async fn read_range(
    workspace: &Workspace,
    table: &str,
    start: u64,
    end: u64,
    filter: Option<&str>,
) -> Result<Rows, Report<StageError>>
```

1. Build the query. `table` is quoted with `Identifier` (`engine/src/sql.rs:9`).
2. Run it with `Workspace::query` (`engine/src/workspace/mod.rs:369`) and map its error with `error::statement`.

The query, with the filter of the create group as the example:

```sql
SELECT * FROM "changes/entity/sink-aircraft"
WHERE "_row" >= 0 AND "_row" < 2048 AND "_change" = 'insert'
ORDER BY "_row"
```

`FirstRequest::Create` has the filter `"_change" = 'insert'`. `FirstRequest::Patch` has the filter `"_change" <> 'insert'`. The archive tables are read without a filter.

### `ChangePage::new`, `ChangePage::row`, `stage/plan/rows.rs`

```rust
fn new(rows: Rows) -> Result<ChangePage, Report<StageError>>
fn row(&self, position: usize) -> Result<Option<ChangeRow<'_>>, Report<StageError>>
```

`new`:

1. Build `SinkColumns` from `rows.columns()`.
2. Find the position of each engine column by its name, compared without regard to ASCII case. `_entity_id`, `_change` and `_source_id` are required.

`row`:

1. Return `None` when `position` is past the last row. Otherwise take the row's values with `Rows::get`.
2. Read `_entity_id`, `_change` and `_source_id` as `Value::Text`. Parse `_change` with the `FromStr` of `Change`.
3. Read `_key`, `_left_entity_id` and `_right_entity_id` as `Value::Text` when the column exists and the value is not null.
4. Return the `ChangeRow` with `SinkRow::new(&self.columns, values)`.

| Error | Code |
| --- | --- |
| `_entity_id`, `_change` or `_source_id` is absent from the query's columns. The file breaks the contracts' "`changes`: one file per target". | `invalid_checkpoint` |
| `_entity_id`, `_change` or `_source_id` is not text, or `_change` is none of `insert`, `update`, `resend`. | `invalid_checkpoint` |

### `ChangeCursor`, `stage/plan/rows.rs`

```rust
pub(super) async fn open(
    workspace: &Workspace,
    target: &'run PlanTarget<'run>,
    first: FirstRequest,
) -> Result<ChangeCursor<'run>, Report<StageError>>
pub(super) async fn fill(&mut self, workspace: &Workspace) -> Result<(), Report<StageError>>
pub(super) fn row(&self) -> Result<Option<ChangeRow<'_>>, Report<StageError>>
pub(super) fn advance(&mut self)
```

`open`:

1. Count the rows of the table and the rows of the create group with one query:

   ```sql
   SELECT count(*) AS "rows", count(*) FILTER (WHERE "_change" = 'insert') AS "creates"
   FROM "changes/entity/sink-aircraft"
   ```

   Both values arrive as `Value::BigInt` and are converted with `u64::try_from`.
2. Set `remaining` to `creates` for `FirstRequest::Create` and to `rows - creates` for `FirstRequest::Patch`. Set `next_row` to 0 and `page` to `None`.

`fill` loads the next range that holds a row of the group. It does nothing while the page has an unread row or `remaining` is 0.

```rust
while self.remaining > 0 && self.page_is_read() {
    if self.next_row >= self.rows {
        return Err(Code::InvalidCheckpoint.report());     // `_row` is not 0 to rows - 1
    }
    let end = self.next_row.saturating_add(RANGE_ROWS);
    let rows = read_range(workspace, &self.target.table, self.next_row, end, Some(self.first.filter())).await?;
    self.page = Some(ChangePage::new(rows)?);
    self.position = 0;
    self.next_row = end;
}
Ok(())
```

`row` returns `None` when `remaining` is 0, and `ChangePage::row(self.position)` otherwise. `advance` adds 1 to `position` and subtracts 1 from `remaining`.

A cursor with `remaining` 0 runs no range query. A file with 10,000,000 rows takes 4,883 range queries per group.

| Error | Code |
| --- | --- |
| A count is not a `BIGINT` or is negative. | `invalid_checkpoint` |
| All ranges are read and rows of the group remain. | `invalid_checkpoint` |
| A query fails. | The code `error::statement` gives. A table without `_row` or `_change` gives `query_invalid`. |

### `parse_entity_id`, `stage/plan/rows.rs`

```rust
pub(super) fn parse_entity_id(text: &str) -> Result<EntityId, Report<StageError>>
```

1. Split `text` at the first `~` (`ENTITY_ID_DELIMITER`, `libs/@blockprotocol/type-system/rust/src/knowledge/entity/id.rs:88`).
2. Parse both parts with `Uuid::parse_str` and build an `EntityId` with `draft_id: None`.
3. Require that the `EntityId` displays as `text`.

| Error | Code |
| --- | --- |
| The text has no `~`, a part is not a UUID, or the text is not the lowercase hyphenated form. | `invalid_checkpoint` |

### `plan_upserts`, `stage/plan/upsert.rs`

```rust
pub(super) async fn plan_upserts(
    workspace: &Workspace,
    planner: &Planner,
    targets: &[PlanTarget<'_>],
    kind: Kind,
    first: FirstRequest,
    writes: &mut WriteFile,
    issues: &mut IssueFile,
) -> Result<(), Report<StageError>>
```

1. Visit the targets of `kind` in the order returned by `plan_targets`.
2. Open one cursor for the current target and reset the previous entity ID.
3. Fill that cursor. When it has no row left, continue with the next target.
4. Require that the `_entity_id` is greater than the last one written for this target in this group.
5. Plan the row with `plan_row`, push the write, and push one issue per failure.
6. Advance the cursor and continue with step 3.

```rust
for target in targets.iter().filter(|target| target.target.kind() == kind) {
    let mut cursor = ChangeCursor::open(workspace, target, first).await?;
    let mut previous = String::new();
    loop {
        cursor.fill(workspace).await?;
        let Some(row) = cursor.row()? else { break };
        if row.entity_id <= previous.as_str() {
            return Err(Code::InvalidCheckpoint.report());
        }
        let (write, failures) = plan_row(planner, target, &row)?;
        for failure in &failures {
            issues.push(target.target, &row, failure).await?;
        }
        writes.push(write).await?;
        previous.clear();
        previous.push_str(row.entity_id);
        cursor.advance();
    }
}
Ok(())
```

Only the current target has an open cursor. There is no merge across targets and no check that entity IDs increase across target boundaries.

| Error | Code |
| --- | --- |
| An `_entity_id` is not greater than the one before it for this target in the group. The target's file is not ordered or repeats an entity ID. | `invalid_checkpoint` |

### `plan_row`, `stage/plan/upsert.rs`

```rust
fn plan_row(
    planner: &Planner,
    target: &PlanTarget<'_>,
    row: &ChangeRow<'_>,
) -> Result<(Write, Vec<ConversionFailure>), Report<StageError>>
```

1. Parse `row.entity_id`.
2. For `Mapping::Entity`, call `Planner::plan_entity`. For `Mapping::Link`, parse `row.left_entity_id` and `row.right_entity_id` and call `Planner::plan_link`.
3. Build the `Write`: the operation is `UpsertEntity` or `UpsertLink` by the mapping, `change` is `row.change`, `target` is the target's ID, `source_id` is `row.source_id`, the endpoint IDs are the row's texts for a link and `None` for an entity, `create` is `Some`, and `patch` is the patch body.

| Error | Code |
| --- | --- |
| An ID text is not an entity ID, or a link row has no `_left_entity_id` or `_right_entity_id`. | `invalid_checkpoint` |
| The planner returns `UnencodableRequest`. It is wrapped with `Code::UnencodableRequest.wrap(Report::new(error))`. | `unencodable_request` |

### `number_archives`, `plan_archives`, `stage/plan/archive.rs`

```rust
pub(super) async fn number_archives(workspace: &Workspace) -> Result<(), Report<StageError>>
pub(super) async fn plan_archives(
    workspace: &Workspace,
    planner: &Planner,
    kind: Kind,
    writes: &mut WriteFile,
) -> Result<(), Report<StageError>>
```

The `archives` file has no `_row` column. `number_archives` creates one numbered table per kind with `Workspace::create_table` (`engine/src/workspace/mod.rs:404`), named `archives/link` and `archives/entity`, and maps its error with `error::statement`:

```sql
SELECT CAST(row_number() OVER (ORDER BY "target", "entity_id") - 1 AS UBIGINT) AS "_row",
       "entity_id", "target", "source_id"
FROM "archives"
WHERE "kind" = 'link'
```

`plan_archives`:

1. Read the table of `kind` in ranges of `RANGE_ROWS` with `read_range` and no filter, starting at 0.
2. For each row, read `entity_id`, `target` and `source_id` as `Value::Text` at the positions 1, 2 and 3, parse the entity ID, and call `Planner::plan_archive`.
3. Push a `Write` with the operation `ArchiveLink` or `ArchiveEntity` by `kind`, `change` `Archive`, no endpoint IDs, `create` `None`, and the archive body as `patch`.
4. Stop after a range that returns fewer than `RANGE_ROWS` rows.

```rust
let table = format!("archives/{}", kind.as_str());
let operation = match kind {
    Kind::Link => OperationKind::ArchiveLink,
    Kind::Entity => OperationKind::ArchiveEntity,
};
let mut start = 0_u64;
loop {
    let end = start.saturating_add(RANGE_ROWS);
    let rows = read_range(workspace, &table, start, end, None).await?;
    for values in rows.iter() {
        let (entity_id, target, source_id) = archive_texts(values)?;      // positions 1, 2, 3
        let patch = planner
            .plan_archive(parse_entity_id(entity_id)?)
            .map_err(|error| Code::UnencodableRequest.wrap(Report::new(error)))?;
        writes.push(Write { operation, change: Change::Archive, entity_id: entity_id.into(),
            target: target.into(), source_id: source_id.into(),
            left_entity_id: None, right_entity_id: None, create: None, patch }).await?;
    }
    if rows.iter().len() < RANGE_ROWS as usize { break }      // the last range
    start = end;
}
Ok(())
```

| Error | Code |
| --- | --- |
| `entity_id`, `target` or `source_id` is not text, or `entity_id` is not an entity ID. | `invalid_checkpoint` |
| The planner returns `UnencodableRequest`. | `unencodable_request` |
| A query fails. | The code `error::statement` gives. |

### `Batcher::assign`, `stage/plan/write.rs`

```rust
fn assign(&mut self, group: Group, bytes: u64) -> Result<u32, Report<StageError>>
```

1. The write fits the open batch when the batch has the same group, fewer than `BATCH_WRITES` writes, and `bytes` plus the batch's bytes is at most `BATCH_BYTES`.
2. When it does not fit, or no batch is open, open a new batch with the number `next` and add 1 to `next`.
3. Add 1 to the batch's writes and `bytes` to its bytes. Return the batch number.

```rust
let fits = |open: &OpenBatch| {
    open.group == group && open.writes < BATCH_WRITES && open.bytes.saturating_add(bytes) <= BATCH_BYTES
};
let mut open = match self.open.take() {
    Some(open) if fits(&open) => open,
    _ => {
        let number = self.next;
        self.next = number.checked_add(1).ok_or_else(|| Code::PlanTooLarge.report())?;
        OpenBatch { group, number, writes: 0, bytes: 0 }
    }
};
open.writes += 1;
open.bytes = open.bytes.saturating_add(bytes);
let number = open.number;
self.open = Some(open);
Ok(number)
```

`Batcher::batches` returns `next`, the number of batches.

| Error | Code |
| --- | --- |
| The run has more than `u32::MAX` batches. | `plan_too_large` |

### `BufferedFile`, `stage/plan/buffer.rs`

```rust
pub(super) fn create(context: &RunContext, columns: &[Column]) -> Result<BufferedFile, Report<StageError>>
pub(super) async fn push(&mut self, row: Box<[Cell]>) -> Result<(), Report<StageError>>
pub(super) async fn store(mut self, context: &RunContext) -> Result<ArtifactRef, Report<StageError>>
async fn flush(&mut self) -> Result<(), Report<StageError>>
```

`RowFile::push` does file IO on the calling thread, and `shared-run.md` section 4.7 has a stage that pushes more than one batch of rows call it inside `tokio::task::spawn_blocking`. `BufferedFile` does that for `writes` and `issues`.

This buffer remains to bound memory and move blocking IO off the async executor. CR-3 removes the requirement to reproduce Parquet bytes, not these responsibilities. Its flush thresholds need not match `RowFile`'s, and changing them must preserve the schema and ordered rows, including exact request JSON.

- `create` calls `RowFile::create`. It runs on the calling thread, because it borrows the `RunContext` and creates one empty file.
- `push` adds the row to `rows`, adds the byte length of its `Cell::Text` values to `bytes`, and calls `flush` when `rows` holds `BUFFER_ROWS` rows or `bytes` is at least `BUFFER_BYTES`.
- `flush` moves the `RowFile` and the buffered rows into `spawn_blocking`, pushes the rows there in order, and takes the `RowFile` back, as the REST reader does with its spool (`engine/src/sources/rest.rs:161-166`).
- `store` calls `flush` and then `RowFile::store`.

```rust
async fn flush(&mut self) -> Result<(), Report<StageError>> {
    if self.rows.is_empty() {
        return Ok(());
    }
    let rows = mem::take(&mut self.rows);
    self.bytes = 0;
    let mut file = self.file.take().ok_or_else(|| Code::ScratchUnavailable.report())?;
    let file = tokio::task::spawn_blocking(move || {
        for row in &rows {
            file.push(row)?;
        }
        Ok::<_, Report<StageError>>(file)
    })
    .await
    .map_err(error::scratch)??;
    self.file = Some(file);
    Ok(())
}
```

| Error | Code |
| --- | --- |
| The blocking task stops. `error::scratch` maps the `JoinError`. | `scratch_unavailable` |
| `push` or `store` is called after a push failed, so the `RowFile` is gone. `plan` returns the first error, so no caller reaches this case. | `scratch_unavailable` |
| `RowFile::create`, `RowFile::push` or `RowFile::store` fails. | As returned. |

### `WriteFile`, `stage/plan/write.rs`

```rust
pub(super) fn create(context: &RunContext) -> Result<WriteFile, Report<StageError>>
pub(super) async fn push(&mut self, write: Write) -> Result<(), Report<StageError>>
pub(super) async fn store(self, context: &RunContext) -> Result<StoredWrites, Report<StageError>>
```

`create` calls `BufferedFile::create` with the columns of the contracts' "`writes`" table and sets the count of each of the four operations to 0:

| Column | `ColumnKind` | Nullable |
| --- | --- | --- |
| `seq` | `UInt64` | No |
| `batch` | `UInt32` | No |
| `operation`, `change`, `entity_id`, `target`, `source_id` | `Text` | No |
| `left_entity_id`, `right_entity_id`, `create` | `Text` | Yes |
| `patch` | `Text` | No |

`push`:

1. The first request is `Create` when `write.change` is `Insert`, and `Patch` otherwise. The first-request body is `write.create` for `Create` and `write.patch` for `Patch`.
2. Call `Batcher::assign` with the group and the byte length of the first-request body.
3. Log the warning of "Bodies above the limits" when the create body or the patch body is longer than `GRAPH_REQUEST_BYTES - 2`.
4. Push one row to the `BufferedFile`: `seq`, the batch number, `OperationKind::as_str`, `Change::as_str`, and the other fields of the write as text or null.
5. Add 1 to `seq` and to the count of the operation.

`store` calls `BufferedFile::store` and returns the reference, `Batcher::batches` and the counts.

| Error | Code |
| --- | --- |
| `write.change` is `Insert` and `write.create` is `None`. No caller builds such a write. | `invalid_checkpoint` |

### `IssueFile`, `reason_name`, `stage/plan/issue.rs`

```rust
pub(super) fn create(context: &RunContext) -> Result<IssueFile, Report<StageError>>
pub(super) async fn push(&mut self, target: &Target, row: &ChangeRow<'_>, failure: &ConversionFailure) -> Result<(), Report<StageError>>
pub(super) async fn store(self, context: &RunContext) -> Result<ArtifactRef, Report<StageError>>
pub(super) const fn reason_name(reason: FailureReason) -> &'static str
```

`create` calls `BufferedFile::create` with the seven text columns of the contracts' "`issues`" table. `entity_id`, `key`, `property` and `reason` are nullable. `push` writes the row of "Property issues", with `Kind::as_str` and `Target::id` in the first two columns. `store` calls `BufferedFile::store`. A run without issues stores a file with no rows.

`reason_name` maps `Coercion(_)` to `coercion`, `MeasureAmount` to `measure_amount`, `MeasureUnit` to `measure_unit` and `Unsupported(_)` to `unsupported`.

### `Planner`, `engine/src/graph/plan/mod.rs`

```rust
pub fn new(provenance: ProvidedEntityEditionProvenance, unit_maps: BTreeMap<UnitMapName, UnitMap>) -> Self

pub fn plan_entity(
    &self,
    sink: &EntitySink,
    entity_id: EntityId,
    row: SinkRow<'_>,
) -> Result<PlannedUpsert, UnencodableRequest>

pub fn plan_link(
    &self,
    link: &LinkPipeline,
    link_id: EntityId,
    left_entity_id: EntityId,
    right_entity_id: EntityId,
    row: SinkRow<'_>,
) -> Result<PlannedUpsert, UnencodableRequest>

pub fn plan_archive(&self, entity_id: EntityId) -> Result<Box<str>, UnencodableRequest>
```

`plan_entity`:

1. Resolve `sink.properties` from the row with `SinkRow::resolve` and the planner's unit maps.
2. Build an `EntityUpsert` with the entity ID, `sink.entity_type`, the resolved properties and a clone of the provenance.
3. Encode it with `request::upsert_entity` and return the bodies with the failures.

```rust
let ResolvedProperties { properties, failures } = row.resolve(&sink.properties, &self.unit_maps);
let UpsertBodies { create, patch } = request::upsert_entity(EntityUpsert {
    entity_id,
    entity_type: sink.entity_type.clone(),
    properties,
    provenance: self.provenance.clone(),
})
.map_err(|source| UnencodableRequest { entity_id, source })?;
Ok(PlannedUpsert { create, patch, failures })
```

`plan_link` does the same with `link.properties`, a `LinkUpsert` that holds the three IDs and `link.link_type`, and `request::upsert_link`. `plan_archive` builds an `Archive` and returns `request::archive`.

| Error | Returned as | Code in stage 3 |
| --- | --- | --- |
| `serde_json` cannot encode a body. | `UnencodableRequest` (`engine/src/graph/plan/mod.rs:91`) | `unencodable_request` |

### Request functions, `engine/src/graph/plan/request.rs`

```rust
pub(super) fn upsert_entity(upsert: EntityUpsert) -> Result<UpsertBodies, serde_json::Error>
pub(super) fn upsert_link(upsert: LinkUpsert) -> Result<UpsertBodies, serde_json::Error>
pub(super) fn archive(archive: Archive) -> Result<Box<str>, serde_json::Error>

fn upsert(
    entity_id: EntityId,
    entity_type: VersionedUrl,
    properties: PropertyObjectWithMetadata,
    link_data: Option<Link>,
    provenance: ProvidedEntityEditionProvenance,
) -> Result<UpsertBodies, serde_json::Error>

fn sorted_json(value: serde_json::Value) -> Result<Box<str>, serde_json::Error>
```

- `upsert_entity` calls `upsert` with `link_data: None`.
- `upsert_link` calls `upsert` with `Some(Link::Directed { source: endpoint(left_entity_id), target: endpoint(right_entity_id) })`, as `engine/src/graph/plan/request.rs:164-167` does today.
- `archive` converts the `Archive` into an `ArchiveEntity` (`:306`) and returns `sorted_json(serde_json::to_value(&body)?)`.

`upsert`:

1. Build the `PatchEntity` with `properties: [PropertyPatch::Replace { path: [], property: properties.clone() }]` and `archived: false`.
2. Build the `CreateEntity` as `:235-244` does today, with `draft: false` and `read_only: true`.
3. Return both as `sorted_json(serde_json::to_value(&body)?)`.

`sorted_json`:

```rust
let mut value = value;
value.sort_all_objects();
serde_json::to_string(&value).map(String::into_boxed_str)
```

### `OperationKind::as_str`, `OperationKind::from_stored`, `engine/src/graph/mod.rs`

```rust
/// The text of the `operation` column.
pub const fn as_str(self) -> &'static str

/// The operation whose stored text is `text`.
pub fn from_stored(text: &str) -> Option<Self>
```

| Variant | Text |
| --- | --- |
| `UpsertEntity` | `upsert_entity` |
| `UpsertLink` | `upsert_link` |
| `ArchiveLink` | `archive_link` |
| `ArchiveEntity` | `archive_entity` |

`as_str` is a `match` over the four variants. `from_stored` compares `text` with the four texts and returns `None` for any other text. It does not change the letter case and does not trim. Stage 3 writes the texts with `as_str`, and stage 4 reads them with `from_stored`.

`OperationKind` also derives `Serialize` and `Deserialize` with `#[serde(rename_all = "snake_case")]`, which gives the same four texts. `serde_json` writes a unit variant as a string, so the keys of `PlanOutput::counts` in `plan/_done.json` are these texts.

### `SinkRow::read`, `engine/src/graph/property/mod.rs`

```rust
fn read(
    &self,
    accessor: &Accessor,
    unit_maps: &BTreeMap<UnitMapName, UnitMap>,
) -> Result<Option<ResolvedValue>, FailureReason>
```

The error type changes from `Unconverted` to `FailureReason`. Each `Unconverted::new(value, reason)` becomes the reason alone. `resolve` builds `ConversionFailure { property: property.clone(), reason }`. The rules for reading a value are unchanged.

### `Rows::get`, `engine/src/workspace/rows.rs`

```rust
/// Returns the values of the row at `index`, in the order of `columns`.
#[must_use]
pub fn get(&self, index: usize) -> Option<&[Value]>
```

It returns `self.rows.get(index).map(|row| &**row)`.

## Existing code

| Path and line | Item | Change |
| --- | --- | --- |
| `engine/src/graph/mod.rs:24-34` | Re-exports | `DuplicateWrite`, `FinishedPlan`, `GraphPlan`, `Payload`, `PlanIssue` and `PlannedWrite` are removed. `PlannedUpsert` is added. |
| `engine/src/graph/mod.rs:39` | `EntityUpsert` | Used as is. |
| `engine/src/graph/mod.rs:49` | `EntityUpsert::new(web_id, namespace, entity_type, source_id, properties, provenance) -> Self` | Removed. |
| `engine/src/graph/mod.rs:68` | `LinkEndpoint` | Removed. |
| `engine/src/graph/mod.rs:81` | `LinkUpsert::properties: Option<PropertyObjectWithMetadata>` | Becomes `properties: PropertyObjectWithMetadata`. |
| `engine/src/graph/mod.rs:91` | `LinkUpsert::new(web_id, namespace, link_type, left, right, properties, provenance) -> Self` | Removed. |
| `engine/src/graph/mod.rs:122` | `Archive` | Used as is. |
| `engine/src/graph/mod.rs:129`, `:138` | `GraphOperation`, `GraphOperation::kind` | Removed. |
| `engine/src/graph/mod.rs:153` | `OperationKind` | Gets `Serialize`, `Deserialize` with snake case names, `as_str` and `from_stored`. |
| `engine/src/graph/mod.rs:165` | `integration_provenance` | Used as is. |
| `engine/src/graph/plan/mod.rs:36` | `PlannedWrite` | Removed. `Write` in `stage/plan/write.rs` holds one row of `writes`. |
| `engine/src/graph/plan/mod.rs:47`, `:70` | `Payload`, `TryFrom<GraphOperation> for PlannedWrite` | Removed. A body is a `Box<str>`. |
| `engine/src/graph/plan/mod.rs:91` | `UnencodableRequest` | Used as is. |
| `engine/src/graph/plan/mod.rs:99` | `DuplicateWrite` | Removed. Stage 2 fails with `duplicate_entity_id`. |
| `engine/src/graph/plan/mod.rs:108` | `PlanIssue` | Removed. `PlannedUpsert::failures` carries the conversion failures. |
| `engine/src/graph/plan/mod.rs:129`, `:140`, `:151`, `:177`, `:195`, `:233`, `:242` | `GraphPlan` with `add`, `finish`, `source_id`, `report`, `Extend`, `FromIterator` | Removed. `WriteFile` writes the rows in order. |
| `engine/src/graph/plan/mod.rs:215` | `FinishedPlan` | Removed. |
| `engine/src/graph/plan/mod.rs:252` | `Planner { web_id, namespace, provenance, unit_maps }` | Becomes `Planner { provenance, unit_maps }`. |
| `engine/src/graph/plan/mod.rs:263` | `Planner::new(web_id, namespace, provenance, unit_maps) -> Self` | Becomes `new(provenance, unit_maps) -> Self`. |
| `engine/src/graph/plan/mod.rs:282` | `plan_entities(&self, sink, rows) -> Result<GraphPlan, UnencodableRequest>` | Becomes `plan_entity(&self, sink, entity_id, row) -> Result<PlannedUpsert, UnencodableRequest>`. |
| `engine/src/graph/plan/mod.rs:316` | `plan_links(&self, link, rows) -> Result<GraphPlan, UnencodableRequest>` | Becomes `plan_link(&self, link, link_id, left_entity_id, right_entity_id, row) -> Result<PlannedUpsert, UnencodableRequest>`. |
| `engine/src/graph/plan/request.rs:31`, `:36`, `:49` | `DELIVERY_VERSION`, `Delivery`, `Delivery::encode` | Removed. `sorted_json` keeps the key sorting of `encode`. |
| `engine/src/graph/plan/request.rs:69`, `:83`, `:87`, `:95`, `:103`, `:115` | `SavedRequests`, `UnreadablePayload`, `SavedDelivery`, `RequestKind`, `SavedRequest`, `Payload::requests` | Removed. Stage 4 reads the bodies from the `create` and `patch` columns. |
| `engine/src/graph/plan/request.rs:139` | `From<GraphOperation> for Delivery` | Removed. `upsert_entity`, `upsert_link` and `archive` take its three cases. |
| `engine/src/graph/plan/request.rs:190` | `Request` | Removed. |
| `engine/src/graph/plan/request.rs:204` | `Request::upsert(entity_id, entity_type, properties, link_data, provenance) -> Self` | Becomes the function `upsert` with the same parameters and the result `Result<UpsertBodies, serde_json::Error>`. |
| `engine/src/graph/plan/request.rs:249` | `endpoint` | Used as is. |
| `engine/src/graph/plan/request.rs:261` | `CreateEntity` | Used as is. |
| `engine/src/graph/plan/request.rs:277` | `PatchEntity` | `properties: Vec<PropertyPatch>` with `skip_serializing_if` becomes `properties: [PropertyPatch; 1]`. |
| `engine/src/graph/plan/request.rs:290` | `PropertyPatch::Add { path: [BaseUrl; 1], property: PropertyWithMetadata }` | Becomes `PropertyPatch::Replace { path: [BaseUrl; 0], property: PropertyObjectWithMetadata }`. |
| `engine/src/graph/plan/request.rs:300`, `:306` | `ArchiveEntity`, `From<Archive>` | Used as is. |
| `engine/src/graph/property/mod.rs:41`, `:58`, `:66`, `:74` | `SinkColumns`, `SinkRow`, `SinkRow::new`, `SinkRow::resolve` | Used as is. |
| `engine/src/graph/property/mod.rs:116` | `SinkRow::text` | It loses its only caller, `GraphPlan::source_id` (`engine/src/graph/plan/mod.rs:184`). `stage-2-rows.md` states where it moves, because step 3 of stage 2 renders the source ID with it. |
| `engine/src/graph/property/mod.rs:126` | `SinkRow::read(..) -> Result<Option<ResolvedValue>, Unconverted>` | Becomes `-> Result<Option<ResolvedValue>, FailureReason>`. |
| `engine/src/graph/property/mod.rs:181` | `FailureReason` | Used as is. |
| `engine/src/graph/property/mod.rs:201` | `ConversionFailure { property, value, reason }` | Becomes `ConversionFailure { property, reason }`. |
| `engine/src/graph/property/mod.rs:252`, `:259` | `Unconverted`, `Unconverted::new` | Removed. |
| `engine/src/graph/property/value.rs`, `engine/src/graph/property/coerce.rs` | Value conversion and coercions | Used as is. |
| `engine/src/graph/client/mod.rs:29`, `:114` | `use super::{PlannedWrite, plan::SavedRequests}`, `GraphClient::send` | They use removed types. `stage-4-send.md` removes `send`. The two changes land in one commit. |
| `engine/src/lib.rs:34-39` | Re-exports of `graph` | `DuplicateWrite`, `FinishedPlan`, `GraphOperation`, `GraphPlan`, `LinkEndpoint`, `Payload`, `PlanIssue` and `PlannedWrite` are removed. `PlannedUpsert`, `stage::plan::plan` and `PlanOutput` are added. |
| `engine/src/workspace/mod.rs:156`, `:222`, `:369`, `:404`, `:455` | `Workspace::load_capture`, `open`, `query`, `create_table`, `close` | Used as is. |
| `engine/src/workspace/mod.rs:39-40` | `WorkspaceConfig` | Used through `RunContext::open_workspace`. The contracts give it `Clone`, and `shared-run.md` adds the derive. |
| `engine/src/workspace/rows.rs:8`, `:80`, `:85` | `Rows`, `columns`, `iter` | Used as is. `get` is added. |
| `engine/src/sql.rs:9`, `:31` | `Identifier`, `literal` | Used as is. |
| `engine/src/storage/artifact/reference.rs:37` | `ArtifactRef` | Used as is. |
| `engine/src/storage/namespace.rs:16` | `ArtifactNamespace` | `shared-run.md` section 4.3 adds `plan_output`. Stage 3 calls it with `Uuid::from(input.run)`. |

## Error mapping

Stage 3 maps no shared error type itself. It calls the mapping functions of `run/error.rs`, and `shared-run.md` section 6 gives their codes and kinds:

- `error::statement` for `Workspace::query` and `Workspace::create_table`. A query that does not fit the loaded table, for example because `_row` is absent, and a column type the workspace cannot read give `query_invalid`. `StatementError::DiskLimit` gives `workspace_unavailable`, which is retryable.
- `error::close` for `Workspace::close`.
- `error::scratch` for the `JoinError` of `spawn_blocking`.

`finished`, `finish`, `load_table`, `RunContext::open_workspace`, `RunContext::fetch`, `RunContext::publish`, `RunInput::parse_definition` and the methods of `RowFile` return a `Report<StageError>` that already carries its code. They call `error::artifact`, `error::capture`, `error::open` and `error::stored_json` themselves. Stage 3 passes their errors on with `?`.

Stage 3 adds three variants to `Code`. Each has its `#[display]` text and an entry in `Code::ALL` (`shared-run.md` section 3.3):

| Variant | Text | Kind | Condition |
| --- | --- | --- | --- |
| `InvalidCheckpoint` | `invalid_checkpoint` | Permanent | A `changes` or `archives` file, or `DiffOutput::targets`, breaks the contracts' rules, as the function tables above list. |
| `UnencodableRequest` | `unencodable_request` | Permanent | `serde_json` cannot encode a body. The planner returns `UnencodableRequest` (`engine/src/graph/plan/mod.rs:91`). |
| `PlanTooLarge` | `plan_too_large` | Permanent | The run has more than `u32::MAX` batches. |

## Tests

### Notation

- `W` is the web ID. It is `a2c8e6c7-485d-4b54-a248-53c9b9b014a2` in `engine/src/graph/plan/tests.rs` (`:78`) and `00000000-0000-4000-8000-000000000001` in the tests of `stage/plan`.
- `T` is `https://example.com/@demo/types`.
- `ID(name)` is `W~{uuid}` with the UUID of the entity `name` in the table "Entities" of `03-scenarios.md`.
- `PROV(time, name)` is `{"actorType":"machine","origin":{"type":"api"},"sources":[{"loadedAt":"time","location":{"name":"name"},"type":"integration"}]}`.
- `V(x)` is `{"metadata":{"dataTypeId":null},"value":x}`. `M(x, unit)` is `{"metadata":{"dataTypeId":"T/data-type/unit/v/1"},"value":x}`.
- `LS(v, tail, icao)` is the link source ID `T/entity-type/aircraft/v/{v}::{tail}::T/entity-type/airfield/v/1::{icao}`.

The three bodies, with their keys in the order the planner writes them:

```text
CREATE(uuid, type, props)
  {"draft":false,"entityTypeIds":["type"],"entityUuid":"uuid","properties":{"value":props},"provenance":PROV,"readOnly":true,"webId":"W"}
CREATE(uuid, type, props, left, right)
  {"draft":false,"entityTypeIds":["type"],"entityUuid":"uuid","linkData":{"leftEntityId":"left","rightEntityId":"right"},"properties":{"value":props},"provenance":PROV,"readOnly":true,"webId":"W"}
PATCH(id, type, props)
  {"archived":false,"entityId":"id","entityTypeIds":["type"],"properties":[{"op":"replace","path":[],"property":{"value":props}}],"provenance":PROV}
ARCHIVE(id)
  {"archived":true,"entityId":"id","provenance":PROV}
```

The property objects of the scenario entities, with their keys in byte order:

| Entity | `props` |
| --- | --- |
| `AC-SEXXX`, `AC2-SEXXX` | `{"T/property-type/empty-mass/":M(8030.0, kilogram),"T/property-type/first-flight/":V("1946-04-02"),"T/property-type/model/":V("DC-3")}` |
| `AC-N100`, `AC2-N100` | `{"T/property-type/empty-mass/":M(69000.0, pound),"T/property-type/first-flight/":V("1957-07-15"),"T/property-type/model/":V("L-1049")}` |
| `AC-GABCD` | `{"T/property-type/empty-mass/":M(2560.0, kilogram),"T/property-type/first-flight/":V("1946-09-25"),"T/property-type/model/":V("DH-104")}` |
| `AF-ESSA` | `{"T/property-type/name/":V("Arlanda")}` |
| `AF-ESSB` | `{"T/property-type/name/":V("Bromma")}` |
| `AF-ESGG` | `{"T/property-type/name/":V("Landvetter")}` |
| Every link | `{}` |

As a check of the notation, the create body of `AC-SEXXX` in scenario S1 run 1 is 782 bytes long and its patch body is 797 bytes long.

### Fixtures of `stage/plan/tests.rs`

- `context()` builds a `RunContext` with `ArtifactStorage::local` on a `TempDir`, a scratch directory in the same `TempDir`, `WorkspaceConfig::default()` and a clock that fails the test when it is read.
- `changes(context, columns, rows)` stores a `changes` file. It opens a workspace and calls `store_query` with a `SELECT … FROM (VALUES …)` query. `_row` is cast to `UBIGINT`. Every other column is text unless a test states a type.
- `archives(context, rows)` stores an `archives` file the same way.
- `diff(targets, archives)` builds a `DiffOutput` with `base: None`, no resent runs, and the stored files. `hashes` and `issues` refer to an empty file, which stage 3 does not read.
- `input(definition)` builds a `RunInput` for the web `W`, the connector `aviation` and `Operation::Apply { resend_all: false }`.
- `capture(time)` builds a `CaptureOutput` with `captured_at: time` and no sources.
- `read_writes(context, output)` loads `output.writes` into a workspace and returns all rows ordered by `seq`. `read_issues` does the same for `output.issues`.

The aviation `changes` files have these columns after the engine columns: `FIELD_NAME` for `entity/sink-airfields`; `MODEL`, `FIRST_FLIGHT`, `EMPTY_MASS`, `MASS_UNIT` for `entity/sink-aircraft`; none for `link/aircraft-based-at`, which has `_left_entity_id` and `_right_entity_id`.

### Unit tests of `engine/src/graph/plan/tests.rs`

The helper `planner` (`:100`) becomes `Planner::new(provenance(), definition.unit_maps().clone())`. `PROV` is `PROV("2026-11-06T12:00:00.000000000Z", "aviation")` (`:82-98`). IDs are built with `derive_entity_id` and the namespace `aviation`, as `aircraft_id` does (`:109`).

| Test | Input | Expected |
| --- | --- | --- |
| `entity_bodies` | `plan_entity` with the aircraft sink, `ID(AC-SEXXX)`, and the row `("SE-XXX", "DC-3", "1946-04-02", "8030", "KG", "ESSA")` of `COLUMNS` (`:32`). | `create` equals `CREATE(468da978-f2fd-52d7-ad32-e319a155c918, T/entity-type/aircraft/v/1, props of AC-SEXXX)`. `patch` equals `PATCH(ID(AC-SEXXX), T/entity-type/aircraft/v/1, props of AC-SEXXX)`. `failures` is empty. Both are compared as text. |
| `link_bodies` | `plan_link` with the `based-at` link, `ID(L-SEXXX-ESSA)`, `ID(AC-SEXXX)`, `ID(AF-ESSA)` and the same row. | `create` equals `CREATE(b16436f1-2384-575c-b2d3-e5606539d19e, T/entity-type/based-at/v/1, {}, ID(AC-SEXXX), ID(AF-ESSA))`. `patch` equals `PATCH(ID(L-SEXXX-ESSA), T/entity-type/based-at/v/1, {})`, which contains `"properties":[{"op":"replace","path":[],"property":{"value":{}}}]`. |
| `blank_row_patch` | `plan_entity` with the row `("SE-XXX", "", " ", "", "KG", "")`. | `patch` equals `PATCH(ID(AC-SEXXX), T/entity-type/aircraft/v/1, {})`. `create` contains `"properties":{"value":{}}`. `failures` is empty. |
| `unconverted_property` | `plan_entity` with the row `("G-ABC", "  Ju 52 ", "unknown", "", "KG", "")`. | Both bodies have the one property `"T/property-type/model/":V("Ju 52")`. `failures` equals `[ConversionFailure { property: T/property-type/first-flight/v/1, reason: FailureReason::Coercion(Coercion::Date) }]`. |
| `archive_body` (replaces `archive_payload`, `:240`) | `plan_archive(ID(AC-SEXXX))`. | The text equals `ARCHIVE(ID(AC-SEXXX))`. |
| `body_property_order` (replaces `payload_property_order`, `:221`) | `request::upsert_entity` twice with the five properties of `:222-228`, inserted in opposite orders. | Both `create` texts are equal, and both `patch` texts are equal. |
| `bodies_graph_readable` (replaces `requests_graph_readable`, `:149`) | The bodies of `entity_bodies`. | `create` deserializes into `CreateEntityParams` with `web_id` `W`, the entity UUID, `read_only` true and three properties. `patch` deserializes into `PatchEntityParams` with `archived` `Some(false)` and one operation that matches `PropertyPatchOperation::Replace { path, property: PropertyWithMetadata::Object(object) }` with an empty `path` and three entries in `object.value`. The archive body deserializes into `PatchEntityParams` with `archived` `Some(true)` and no operation. |
| `link_patch_graph_readable` | The `patch` of `link_bodies`. | It deserializes into `PatchEntityParams` with one `Replace` whose `property` is `PropertyWithMetadata::Object` with no entry. |
| `operation_texts` | The four values of `OperationKind`. | `as_str` returns `upsert_entity`, `upsert_link`, `archive_link`, `archive_entity`. `from_stored` of each text returns its variant, and `from_stored` of `Upsert_Entity` and of ` upsert_entity` returns `None`. `serde_json::to_string` returns each text in quotes. |
| `golden_bodies` | See "Labs golden bodies". | |
| `plan_aviation` | See "Snapshot `plan_aviation`". | |

Removed tests: `unreadable_payload` (`:264`), `finish_order` (`:272`) and `finish_duplicate_entity` (`:309`). The order is tested by `order_across_targets` below, and the duplicate guard by stage 2.

In `engine/src/graph/tests.rs`, `entity_id_from_source_record` (`:79`), `link_endpoints_match_entities` (`:94`) and `link_id_from_type_and_endpoints` (`:109`) move with the derivation to stage 2. `operations_sort_into_application_order` (`:149`) sorts four `OperationKind` values. `integration_provenance_wire_shape` (`:174`) is unchanged.

In `engine/src/graph/property/tests.rs`, `resolve_failure` (`:331`) loses its `value` argument and compares with `ConversionFailure { property, reason }`.

### Snapshot `plan_aviation`

The test (`engine/src/graph/plan/tests.rs:352`) plans the rows `SE-XXX` and `G-ABC` of `:358-359` with `plan_entity`, and the row `SE-XXX` with `plan_link`. The row with a blank `TAIL` (`:360`) and the link row of `G-ABC` are no longer planned, because stage 2 leaves rows without an ID out. `render` (`:328`) prints, per upsert, a line with `OperationKind::as_str` and the entity ID, the create body and the patch body as pretty-printed JSON, and then one line per failure with the property URL and `reason_name`.

Changes in `engine/src/graph/plan/snapshots/hash_integrations_engine__graph__plan__tests__plan_aviation.snap`:

- The `archive` object of each write is gone (lines 7-25, 137-155, 231-249), and so is the `kind` key (lines 72, 190, 281).
- The header lines read `upsert_entity` and `upsert_link` (lines 5, 135, 229).
- The patch of `SE-XXX` has one `properties` entry with `"op": "replace"`, `"path": []` and `"property": {"value": {…}}` holding the three properties, in place of three `add` entries (lines 79-116). The patch of `G-ABC` has the same form with one property (lines 197-210).
- The patch of the link gains `properties` with one replace of `{"value": {}}` (after line 287).
- The issues are one line for `first-flight/v/1` of `G-ABC` with `coercion`. The three lines about rows without an ID are gone (lines 308-310).

### Labs golden bodies

Labs `tests/golden/graph-delivery-v1.json` holds the stored payload of one entity and one link. `golden_bodies` ports its inputs and UUIDs:

- Web `00000000-0000-4000-8000-000000000001`, location name `fixture`, load time `2026-07-22T10:00:00Z`.
- Entity: type `https://example.com/types/entity-type/item/v/1`, ID `…0001~6ca9cc88-4fa6-5acf-bf59-eb22a504b891`, property `https://example.com/types/property-type/name/v/1` read from a column with the value `Widget`.
- Link: type `https://example.com/types/entity-type/related/v/1`, ID `…0001~f81f487f-1011-583c-9bbc-c11d82d8e58e`, left endpoint the entity above, right endpoint `…0001~3a060105-8b02-5108-956e-fe52d3909e45`, no properties.

Expected, with `PROV` equal to `PROV("2026-07-22T10:00:00.000000000Z", "fixture")` and `N` equal to `{"https://example.com/types/property-type/name/":V("Widget")}`:

| Body | Expected text |
| --- | --- |
| Entity create | `CREATE(6ca9cc88-4fa6-5acf-bf59-eb22a504b891, https://example.com/types/entity-type/item/v/1, N)` |
| Entity patch | `PATCH(…0001~6ca9cc88-4fa6-5acf-bf59-eb22a504b891, https://example.com/types/entity-type/item/v/1, N)` |
| Entity archive | `ARCHIVE(…0001~6ca9cc88-4fa6-5acf-bf59-eb22a504b891)` |
| Link create | `CREATE(f81f487f-1011-583c-9bbc-c11d82d8e58e, https://example.com/types/entity-type/related/v/1, {}, …0001~6ca9cc88-4fa6-5acf-bf59-eb22a504b891, …0001~3a060105-8b02-5108-956e-fe52d3909e45)` |
| Link patch | `PATCH(…0001~f81f487f-1011-583c-9bbc-c11d82d8e58e, https://example.com/types/entity-type/related/v/1, {})` |
| Link archive | `ARCHIVE(…0001~f81f487f-1011-583c-9bbc-c11d82d8e58e)` |

What differs from the labs file:

- The labs envelope (`version`, `encoding_version`, `graph_identity`, `request.kind`) is gone. Each body is compared on its own.
- Keys are in byte order. Labs writes them in field order.
- `loadedAt` is `2026-07-22T10:00:00.000000000Z`. Labs writes `2026-07-22T10:00:00Z`.
- The entity patch has one `replace` at the empty path. Labs has one `add` with the path of the property.
- The link patch has `entityTypeIds` and `properties` with one replace of `{"value":{}}`. Labs has neither key.
- The create bodies, the archive bodies and the three UUIDs have the same content as in labs.

### Unit tests of `stage/plan`

`G(operation, first)` is a `Group`.

| Test | Input | Expected |
| --- | --- | --- |
| `batch_cut_at_128_writes` | `Batcher::assign(G(UpsertEntity, Create), 100)` 129 times. | The first 128 calls return 0. The 129th returns 1. `batches` is 2. |
| `batch_cut_at_bytes` | Three calls with one group and 600,000 bytes each. | 0, 0, 1. |
| `batch_bytes_at_the_limit` | Two calls with 750,000 bytes each. Then, with a new `Batcher`, calls with 750,000 and 750,001 bytes. | 0, 0 for the first pair. 0, 1 for the second pair. |
| `batch_oversized_body_alone` | Calls with 100, 1,600,000 and 100 bytes in one group. | 0, 1, 2. |
| `batch_cut_at_group` | Two calls with `G(UpsertEntity, Create)`, one with `G(UpsertEntity, Patch)`, one with `G(UpsertLink, Patch)`. | 0, 0, 1, 2. |
| `batch_counts_first_request` | `WriteFile::push` of two `UpsertEntity` writes with `change` `Update`, a create body of 1,000,000 bytes and a patch body of 10 bytes. | Both rows have `batch` 0. |
| `no_writes` | `WriteFile::create` and `store` with no push. | `batches` 0, every count 0, a file with the eleven columns and no row. |
| `parse_entity_id_forms` | `W~468da978-f2fd-52d7-ad32-e319a155c918`; the same text in upper case; the same text followed by `~` and a UUID; a text without `~`. | The first parses. The other three return `invalid_checkpoint`. |
| `reason_names` | `Coercion(Coercion::Date)`, `MeasureAmount`, `MeasureUnit`, `Unsupported(UnsupportedValue::Blob)`. | `coercion`, `measure_amount`, `measure_unit`, `unsupported`. |
| `provenance_of_run` | `run_provenance` with the connector `aviation` and `captured_at` `2026-11-06T12:00:00Z`. | `serde_json::to_value` equals `PROV("2026-11-06T12:00:00.000000000Z", "aviation")`. |
| `target_lookup` | `plan_targets` with `definition/examples/aviation.yaml` and a `DiffOutput` whose three targets have `changes`. | Three `PlanTarget` values with the tables `changes/entity/sink-aircraft`, `changes/entity/sink-airfields`, `changes/link/aircraft-based-at`, in that order. |
| `target_in_branch` | `plan_targets` with `engine/tests/fixtures/pipeline-branches.yaml` and a target for a sink step inside a branch. | The target is found. |
| `target_unknown` | `plan_targets` with the aviation definition and the target `entity/sink-planes`; and with no definition and any target that has `changes`. | `invalid_checkpoint` in both cases. |

### Stage tests of `stage/plan/tests.rs`

Each test stores its files with the fixtures, calls `plan`, and reads the result with `read_writes` and `read_issues`. The capture time is `2026-11-06T12:00:00Z`.

| Test | Input | Expected |
| --- | --- | --- |
| `order_across_targets` | The two sinks of the aviation definition. Target A is `entity/sink-aircraft` and has the rows `W~…0001` `insert`, `W~…0003` `update`, `W~…0004` `insert`. Target B is `entity/sink-airfields` and has `W~…0002` `insert`, `W~…0005` `resend`. `…000n` stands for `00000000-0000-4000-8000-00000000000n`. | `writes` has, in `seq` order: `…0001` (A, batch 0), `…0004` (A, batch 0), `…0002` (B, batch 0), `…0003` (A, batch 1), `…0005` (B, batch 1). `batches` is 2. |
| `archives_across_targets` | No definition. The `archives` file contains entity `W~…0001` for `sink-airfields` and entity `W~…0002` for `sink-aircraft`, in entity-ID order. | Writes are `…0002` then `…0001`, both `archive_entity` in batch 0. Target order applies even though the targets are absent from the definition. |
| `ranges` | One aircraft `changes` file of 4,100 rows from `range(4100)`: `_row` is the number, `_entity_id` is `W~00000000-0000-4000-8000-` followed by the number padded to 12 digits, `_change` is `insert` for an even number and `update` for an odd one. | 4,100 rows with `seq` 0 to 4,099. The first 2,050 are the even numbers in ascending order with `change` `insert`, the next 2,050 the odd numbers with `update`. `batches` is 34: 17 for each group. `counts` has `upsert_entity` 4,100. |
| `batch_cut_at_128_rows` (scenario case) | One `changes` file with 129 `insert` rows. | Rows 0 to 127 have `batch` 0. Row 128 has `batch` 1. |
| `batch_cut_at_bytes_rows` (scenario case) | Three aircraft `insert` rows whose `MODEL` is `repeat('x', 700000)`. | Each create body is longer than 700,000 bytes. The rows have `batch` 0, 0, 1. |
| `oversized_body` | Three aircraft `insert` rows. The second has a `MODEL` of 1,600,000 bytes, the others `DC-3`. A fourth test has a `MODEL` of 2,200,000 bytes. | The rows have `batch` 0, 1, 2. With 2,200,000 bytes the row is still written, alone in its batch, and `plan` returns `Ok`. |
| `unconverted_value` (scenario case) | One aircraft row `G-ABC` with `FIRST_FLIGHT` `unknown`, `_key` `["G-ABC"]` and `_change` `insert`. | One write whose bodies have `model` and no `first-flight`. `issues` has one row: `entity`, `sink-aircraft`, the row's entity ID, `["G-ABC"]`, `property_unconverted`, `T/property-type/first-flight/v/1`, `coercion`. No column of the row holds `unknown`. |
| `issue_without_key` | The same row in a file without a `_key` column. | The issue row has a null `key`. |
| `blank_value` | One aircraft row with `EMPTY_MASS` `''`. | The bodies have no `empty-mass`. `issues` has no row. |
| `typed_columns` | One aircraft `changes` file whose `EMPTY_MASS` is `DECIMAL(10,2)` with the value `8030.00` and whose `FIRST_FLIGHT` is `DATE`. | The bodies hold `8030.0` with the kilogram data type and `"1946-04-02"`. |
| `archives_only` | No target, an `archives` file with two entity rows and one link row, and `input.definition` `None`. | Three rows: the link with `archive_link` in batch 0, then the two entities with `archive_entity` in batch 1, ordered by target, then entity ID. `create` is null. `patch` equals `ARCHIVE(id)`. `left_entity_id` and `right_entity_id` are null. |
| `deterministic` (scenario case) | The checkpoint 2 of S5 run 2, planned twice with two run IDs and two `RunContext` values. | Decode both `writes` files and compare their schemas and all rows in order, including exact JSON text, `seq` and `batch`. Do the same for `issues`; compare `PlanOutput::counts` and `batches`. Do not require equal Parquet bytes, sizes or sha256 values. |
| `runs_twice` (scenario case) | `plan` called twice with the same input. Before the second call the `changes` files are deleted from the local storage directory. | The second call returns a `PlanOutput` equal to the first. |
| `empty_run` | No target has `changes`, and `archives` has no row. | `batches` 0, every count 0, `writes` and `issues` have no row. |
| `unordered_changes` | A `changes` file whose `_entity_id` values descend while `_row` ascends. | `invalid_checkpoint`. No `plan/_done.json` exists. |
| `missing_source_id_column` | A `changes` file without `_source_id`. | `invalid_checkpoint`. |
| `bad_entity_id` | A `changes` row whose `_entity_id` is `not-an-id`. | `invalid_checkpoint`. |
| `workspace_closed_on_failure` | The input of `bad_entity_id`. | `plan` returns `invalid_checkpoint` after it closed the workspace: `Workspace::open` on the `.duckdb` file that `plan` left in the scratch directory succeeds. |

### Scenario tests of `stage/plan/scenario_tests.rs`

The capture times follow `03-scenarios.md`, "What a test compares": run 1 of a scenario is captured at `2026-11-06T12:00:00Z` and each later run one hour later, so run 2 is `13:00`, run 3 `14:00`, run 4 `15:00` and run 5 `16:00`. A restore to a run and a reconcile keep the capture time of the run whose captures they adopt. `loadedAt` in every body of a run is the run's capture time with nine fraction digits.

Each test builds the `changes` and `archives` files that `03-scenarios.md` lists for the run, calls `plan`, and compares all columns of `writes`. The bodies are compared as text and are also stored as one snapshot per run. In the tables, `target` and `source_id` are given once per entity:

| Entity | `target` | `source_id` | `left_entity_id` | `right_entity_id` |
| --- | --- | --- | --- | --- |
| `AC-SEXXX` | `sink-aircraft` | `SE-XXX` | | |
| `AC-N100` | `sink-aircraft` | `N100` | | |
| `AC-GABCD` | `sink-aircraft` | `G-ABCD` | | |
| `AC2-SEXXX` | `sink-aircraft` | `SE-XXX` | | |
| `AC2-N100` | `sink-aircraft` | `N100` | | |
| `AF-ESSA` | `sink-airfields` | `ESSA` | | |
| `AF-ESSB` | `sink-airfields` | `ESSB` | | |
| `AF-ESGG` | `sink-airfields` | `ESGG` | | |
| `L-SEXXX-ESSA` | `aircraft-based-at` | `LS(1, SE-XXX, ESSA)` | `ID(AC-SEXXX)` | `ID(AF-ESSA)` |
| `L-N100-ESSA` | `aircraft-based-at` | `LS(1, N100, ESSA)` | `ID(AC-N100)` | `ID(AF-ESSA)` |
| `L-GABCD-ESSB` | `aircraft-based-at` | `LS(1, G-ABCD, ESSB)` | `ID(AC-GABCD)` | `ID(AF-ESSB)` |
| `L2-SEXXX-ESSA` | `aircraft-based-at` | `LS(2, SE-XXX, ESSA)` | `ID(AC2-SEXXX)` | `ID(AF-ESSA)` |
| `L2-N100-ESSA` | `aircraft-based-at` | `LS(2, N100, ESSA)` | `ID(AC2-N100)` | `ID(AF-ESSA)` |

An upsert row has `create` equal to `CREATE` and `patch` equal to `PATCH` of its entity, with the property object of the table in "Notation" unless the run states another. The entity type is `T/entity-type/aircraft/v/1`, `T/entity-type/airfield/v/1` or `T/entity-type/based-at/v/1`, and `T/entity-type/aircraft/v/2` for `AC2-…`. An archive row has a null `create`, `patch` equal to `ARCHIVE(ID(entity))`, and null endpoint IDs. `counts` is written as upsert entity, upsert link, archive link, archive entity.

The rows of each run, as `seq`: entity (`change`, batch):

| Run | `loadedAt` hour | Rows of `writes` | Bodies that differ from the base | `batches` | `counts` |
| --- | --- | --- | --- | --- | --- |
| S1 run 1, S6 run 1, S7 run 1, S8 run 1, S9 run 1 | 12:00 | 0: `AC-SEXXX` (`insert`, 0). 1: `AC-N100` (`insert`, 0). 2: `AF-ESSB` (`insert`, 0). 3: `AF-ESSA` (`insert`, 0). 4: `L-N100-ESSA` (`insert`, 1). 5: `L-SEXXX-ESSA` (`insert`, 1). | | 2 | 4, 2, 0, 0 |
| S2 run 2 | 13:00 | 0: `AC-N100` (`update`, 0). | `model` is `V("L-1049G")`. | 1 | 1, 0, 0, 0 |
| S2 run 3 | 14:00 | 0: `AC-SEXXX` (`update`, 0). | The property object has `first-flight` and `model` and no `empty-mass`. | 1 | 1, 0, 0, 0 |
| S3 run 2, S9 run 3 | 13:00 for S3, 14:00 for S9 | 0: `L-N100-ESSA` (`archive`, 0). 1: `AC-N100` (`archive`, 1). | | 2 | 0, 0, 1, 1 |
| S3 run 3 | 14:00 | 0: `AC-N100` (`update`, 0). 1: `L-N100-ESSA` (`update`, 1). | | 2 | 1, 1, 0, 0 |
| S3 run 5 | 16:00 | 0: `L-N100-ESSA` (`archive`, 0). 1: `L-SEXXX-ESSA` (`archive`, 0). 2: `AC-SEXXX` (`archive`, 1). 3: `AC-N100` (`archive`, 1). | | 2 | 0, 0, 2, 2 |
| S4 run 3 | 14:00 | 0: `AC-SEXXX` (`update`, 0). 1: `AC-N100` (`update`, 0). | `target` is `sink-planes`. The property objects have `empty-mass` and `first-flight` and no `model`. | 1 | 2, 0, 0, 0 |
| S5 run 2 | 13:00 | 0: `AC2-SEXXX` (`insert`, 0). 1: `AC2-N100` (`insert`, 0). 2: `L2-SEXXX-ESSA` (`insert`, 1). 3: `L2-N100-ESSA` (`insert`, 1). 4: `L-N100-ESSA` (`archive`, 2). 5: `L-SEXXX-ESSA` (`archive`, 2). 6: `AC-SEXXX` (`archive`, 3). 7: `AC-N100` (`archive`, 3). | The `AC2-…` bodies have `entityTypeIds` `["T/entity-type/aircraft/v/2"]`. | 4 | 2, 2, 2, 2 |
| S6 run 2 | 13:00 | 0: `AC-N100` (`resend`, 0). 1: `L-N100-ESSA` (`resend`, 1). | | 2 | 1, 1, 0, 0 |
| S7 run 2 | 13:00 | 0: `AC-GABCD` (`insert`, 0). 1: `AC-N100` (`update`, 1). 2: `L-GABCD-ESSB` (`insert`, 2). 3: `L-SEXXX-ESSA` (`archive`, 3). 4: `AC-SEXXX` (`archive`, 4). | `model` of `AC-N100` is `V("L-1049G")`. | 5 | 2, 1, 1, 1 |
| S7 run 3 | 14:00 | 0: `AC-SEXXX` (`resend`, 0). 1: `AC-N100` (`resend`, 0). 2: `L-SEXXX-ESSA` (`resend`, 1). 3: `L-GABCD-ESSB` (`archive`, 2). 4: `AC-GABCD` (`archive`, 3). | | 4 | 2, 1, 1, 1 |
| S8 run 2 | 13:00 | 0: `AF-ESGG` (`insert`, 0). 1: `AC-N100` (`update`, 1). 2: `AF-ESSB` (`archive`, 2). | `model` of `AC-N100` is `V("L-1049G")`. | 3 | 2, 0, 0, 1 |
| S8 run 3 | 12:00, the capture time of run 1 | 0: `AC-N100` (`update`, 0). 1: `AF-ESSB` (`update`, 0). 2: `AF-ESGG` (`archive`, 1). | | 2 | 2, 0, 0, 1 |
| S8 run 4 | 15:00 | 0: `L-N100-ESSA` (`archive`, 0). 1: `L-SEXXX-ESSA` (`archive`, 0). 2: `AC-SEXXX` (`archive`, 1). 3: `AC-N100` (`archive`, 1). 4: `AF-ESSB` (`archive`, 1). 5: `AF-ESSA` (`archive`, 1). | | 2 | 0, 0, 2, 4 |
| S9 run 2 | 12:00, the capture time of run 1 | 0: `AC-SEXXX` (`resend`, 0). 1: `AC-N100` (`resend`, 0). 2: `AF-ESSB` (`resend`, 0). 3: `AF-ESSA` (`resend`, 0). 4: `L-N100-ESSA` (`resend`, 1). 5: `L-SEXXX-ESSA` (`resend`, 1). | | 2 | 4, 2, 0, 0 |
| S9 run 4 | 14:00, the capture time of run 3 | 0: `AC-SEXXX` (`resend`, 0). 1: `AF-ESSB` (`resend`, 0). 2: `AF-ESSA` (`resend`, 0). 3: `L-SEXXX-ESSA` (`resend`, 1). 4: `L-N100-ESSA` (`archive`, 2). 5: `AC-N100` (`archive`, 3). | | 4 | 3, 1, 1, 1 |

The runs S1 run 2, S3 run 4 and S4 run 2 have no writes. Each gives `batches` 0, every count 0, and a `writes` file without rows, as `empty_run` tests. The `issues` file of stage 3 has no row in every run of every scenario.

In S8 run 4 the run has no definition, and the test passes `input.definition` `None`.

### The test against a real Graph

`tests/integrations/graph/aviation/mod.rs` builds a `Planner` with a web and a namespace (`:68-73`), collects a `GraphPlan` (`:75`, `:109-114`, `:131-136`), calls `finish` (`:138-140`) and sends each `PlannedWrite` with `GraphClient::send` (`:299-308`). All of these are removed. The test calls the runner `run` of the contracts with the HTTP implementation of `Graph`, which `stage-4-send.md` specifies together with the new body of the test. For stage 3 the test asserts after run 1 of S1 that `PlanOutput::counts` is 4, 2, 0, 0 and `batches` is 2, and that the `issues` file has no row, which replaces the assertion on `plan.issues()` (`:141-145`).

## Open questions

1. **A body above the Graph's request limit.** Stage 3 plans it, stage 4 gets a refusal, and the entity is sent and refused again on every later run, because the base run's rejected IDs join the resend set (P2). An `issues` value such as `body_too_large` would make the row visible after stage 3. The contracts' `issue` column has no such value.
2. **`RANGE_ROWS`.** 2,048 is not measured. A larger value means fewer queries and more memory per cursor. A range query on a table of several million rows should be timed before the value is fixed.
3. **A failed close of the workspace.** This spec fails the stage as retryable when the close fails after the files are stored. The stored files do not depend on the close, so the stage could also log the failure and finish. Stage 2 should decide the same way.
4. **`reason`.** `coercion` and `unsupported` do not say which coercion or which value type. The property URL identifies the accessor, and with it the coercion. If the kind should be in the file, `reason_name` can return, for example, `coercion_date`.

## Contract problems

1. **`archives` has no `_row`.** `Workspace::query` returns all rows of a query, and a restore to empty of a large integration has one archive per entity. This spec numbers the rows per kind in its own workspace (`number_archives`). A `_row` column per kind in the file would remove that step.
