# Integration pipeline: contracts

This file fixes everything that more than one stage uses: the shared types, the error kinds, the storage layout, the schema and rules of every stored file, the signature of each stage function, the operations, the runner and the module tree. A stage spec implements these contracts and does not change them. A change is made here first.

[`00-overview.md`](00-overview.md) gives the goal, the terms and the decisions (A1 to A7, P1 to P14, D1 to D12). [`02-reference-inventory.md`](02-reference-inventory.md) lists the existing code each stage reuses.

All Rust in this file is a contract for names, fields and signatures. Derives, visibility and doc comments are left to the stage specs.

[`shared-run.md`](shared-run.md) specifies the shared `run` module in full: derives, text and JSON forms, error codes and their mapping functions, key builders, the marker and table functions, `current.json`, `start`, the runner and the entry points. A stage spec uses its names for everything shared.

## Names

The overview calls the stored result of a stage a checkpoint. The definition crate already has `Checkpoint` and `CheckpointName` for a named table inside a pipeline. In code, the stored result of a stage is therefore its **output**: `CaptureOutput`, `DiffOutput`, `PlanOutput`, `SendOutput`. In prose, checkpoint 1, 2 and 3 are the outputs of stages 1, 2 and 3.

| Concept | Name in code | Name in files |
| --- | --- | --- |
| Stage 1, Capture | `stage::capture` | `capture/` |
| Stage 2, Hash and diff | `stage::diff` | `diff/` |
| Stage 3, Plan writes | `stage::plan` | `plan/` |
| Stage 4, Send and commit | `stage::send` | `send/` |
| Marker of a finished stage | `…Output`, stored as JSON | `_done.json` |
| A sink or a link pipeline | `Target` | `entity/{StepId}` or `link/{LinkId}` |

A step ID and a link ID can be equal (`definition/src/definition/check.rs:86-90`, `:189-198`), so a sink or link pipeline is always named together with its kind.

## Shared types

```rust
/// Identifies one run. Serialized as hyphenated lowercase text.
pub struct RunId(Uuid);

/// Whether a row describes an entity or a link.
pub enum Kind { Entity, Link }                    // stored as "entity" | "link"

/// A sink step or a link pipeline of a definition.
pub struct Target { kind: Kind, id: Box<str> }    // displayed as "entity/sink-aircraft"

/// Why a row is written.
pub enum Change { Insert, Update, Resend, Archive }   // stored as "insert" | "update" | "resend" | "archive"

/// Supplies the current time.
pub trait Clock: Send + Sync {
    fn now(&self) -> OffsetDateTime;
}
```

- `RunId` wraps the `Uuid` that `CaptureRun::id` already uses (`engine/src/sources/mod.rs:90`). The run interface's `RunId` is the same UUID as text (`apps/hash-integrations/src/service/start.rs:23`), and the app converts between the two.
- `EntityId`, `WebId`, `ActorEntityUuid` and `VersionedUrl` are the `type_system` types the planner already uses.
- `ArtifactRef` (`engine/src/storage/artifact/reference.rs:37`) is the reference to a stored file: key, sha256, size, format.
- A time is a `time::OffsetDateTime`, the type of `SourceProvenance::loaded_at`.
- `RunId` is `Copy` and converts to and from `Uuid` with `From`.
- `Kind` and `Change` have `as_str` and `FromStr` for their stored text. `Target` has `Target::entity(&StepId)`, `Target::link(&LinkId)`, `kind()` and `id()`, displays as `{kind}/{id}`, and is serialized as that text, so that it can be the key of a JSON object.
- `Operation kind` in the tables below is the existing `OperationKind` (`engine/src/graph/mod.rs:152`): `UpsertEntity`, `UpsertLink`, `ArchiveLink`, `ArchiveEntity`, in the order writes are sent.
- `OperationKind` gets `as_str` and `from_stored` for the texts of the `operation` column, and is serialized as that text where it is a key.
- `ConnectorId` and `SourceName` get a serde form as text in the definition crate.

### JSON form

Every stored type (`RunInput`, the four outputs, `Current`) is stored as JSON with the Rust field names. The two operation enums carry a `kind` tag with the values `apply`, `restore` and `reconcile`. A time is written in RFC 3339 form. The stored JSON has no version tag (D13).

### Run request and run input

A caller submits a `RunRequest`. The runner resolves it into a `RunInput` once, stores it, and every stage reads only the `RunInput`.

```rust
pub struct RunRequest {
    pub run: RunId,
    pub web: WebId,
    pub connector: ConnectorId,
    pub actor: ActorEntityUuid,
    pub operation: OperationRequest,
    /// Lets the run archive more than the archive limit allows.
    pub allow_mass_archive: bool,
}

pub enum OperationRequest {
    /// Capture the sources of `definition` and send what changed.
    /// With `resend_all`, send every row, changed or not.
    Apply { definition: Box<str>, namespace: Box<str>, resend_all: bool },
    /// Recompute run `target` and send what differs from the committed run.
    /// `None` restores to empty.
    Restore { target: Option<RunId> },
    /// Recompute the committed run and send every entity again.
    Reconcile,
}

pub struct RunInput {
    pub run: RunId,
    pub web: WebId,
    pub connector: ConnectorId,
    pub actor: ActorEntityUuid,
    pub operation: Operation,
    /// The definition the run executes, as written. `None` when the run has none:
    /// a restore to empty, or a run whose target has none.
    pub definition: Option<Box<str>>,
    /// The namespace entity IDs derive from.
    pub namespace: Box<str>,
    pub allow_mass_archive: bool,
}

pub enum Operation {
    Apply { resend_all: bool },
    Restore { target: Option<RunId> },
    /// `target` is the committed run at the time the run started.
    Reconcile { target: RunId },
}
```

Rules:

- `definition` holds YAML text, because `Definition` has no serde form. A stage parses it with `Definition::from_yaml`.
- For `Restore { target: Some(run) }` and `Reconcile`, `definition` and `namespace` are copied from the target run's `RunInput`.
- For a restore to empty, `definition` is `None` and `namespace` is copied from the committed run, or is empty when no run is committed.
- The namespace of an apply run comes from the caller (D3).
- `start` fails with `integration_mismatch` when the definition names another connector than the request.
- `start` returns the stored `RunInput` when `input.json` exists and the request resolves to the same input. It fails with `request_mismatch` when the request resolves to another input.
- `RunInput::parse_definition` parses the text once per stage and returns `Option<Definition>`. It fails with `invalid_definition`.

This replaces the BE-1136 `RunInput` (`apps/hash-integrations/src/service/run_input.rs:15`). Its `invocation.links_only` has no counterpart.

## Errors

A stage returns `Report<StageError>`.

```rust
pub enum StageError {
    /// A later attempt with the same input can succeed.
    Retryable,
    /// No attempt with this input can succeed.
    Permanent,
}
```

- The two kinds map one to one onto `FailureKind::{Retryable, Permanent}` of the run interface (`orchestration/src/event.rs:50`).
- Every stage error carries a `Code`. The code decides the kind, and the runner turns it into the `FailureCode` of a `StepFailure`.
- A write the Graph refuses is a rejected write. It is recorded in the send stage's output and is neither kind of stage error.

```rust
/// Names why a stage failed. One variant per code.
pub enum Code { /* … */ }

impl Code {
    pub const fn as_str(self) -> &'static str;
    /// The kind of every stage error that carries this code.
    pub const fn kind(self) -> StageError;
    /// A new report of this code's kind that carries this code.
    pub fn report(self) -> Report<StageError>;
    /// Puts this code and its kind on top of `report`.
    pub fn wrap<C>(self, report: Report<C>) -> Report<StageError>;
    /// The code that was put on `report` last.
    pub fn of(report: &Report<StageError>) -> Option<Self>;
}
```

- `run/error.rs` has one mapping function per existing error type that more than one stage meets: `error::artifact`, `error::capture`, `error::statement`, `error::preparation`, `error::open`, `error::close`, `error::scratch` and `error::stored_json`. `shared-run.md` section 6 has their tables. A stage calls these functions and writes no mapping of its own for those types.
- A stage spec maps the error types that only it meets (`SourceError` in stage 1, the Graph's responses in stage 4) and adds a variant to `Code` for each failure that only it raises.

Codes defined by these contracts. `shared-run.md` section 3.3 lists the codes of the shared mapping functions.

| Code | Kind | Raised by | Condition |
| --- | --- | --- | --- |
| `invalid_definition` | Permanent | start, any stage | The definition text does not parse. |
| `target_missing` | Permanent | start, stage 1 | A run that a restore or reconcile reads has no stored input or no capture output. For a restore to empty this is the committed run. |
| `nothing_committed` | Permanent | start | A reconcile was requested and no run is committed. |
| `duplicate_entity_id` | Permanent | stage 2 | Two rows of the run have the same entity ID. |
| `archive_limit` | Permanent | stage 2 | The run would archive more than the archive limit and `allow_mass_archive` is false. |
| `base_moved` | Permanent | stage 4 | The committed run differs from the run stage 2 diffed against. |
| `superseded` | Permanent | stage 4 | Another run that this run did not resend is listed in `Current::sending`. |
| `request_mismatch` | Permanent | start | The run ID has a stored input that another request produced. |
| `integration_mismatch` | Permanent | start | The request, its definition and the `RunContext` do not name the same web and connector. |
| `reserved_column` | Permanent | stage 2 | A target's table has a column with a reserved name. |
| `marker_missing` | Permanent | stage 2 | A run named by `current.json` lacks a marker the stage has to read. |

## Storage

### Layout

Every key is relative to the storage root. `{root}` is `tenants/{web}/integrations/{integration}`, where `{integration}` is the lowercase hex SHA-256 of the text `{web}:{connector}` (`engine/src/storage/namespace.rs:22`).

```text
{root}/
  current.json                                  overwritten; see "current.json"
  artifacts/sha256/{xx}/{sha256}.{ext}          every data file and every marker body
  runs/{run}/
    input.json                                  marker: RunInput
    capture/{source}.{fingerprint}.json         binding of one captured source
    capture/_done.json                          marker: CaptureOutput
    diff/_done.json                             marker: DiffOutput
    plan/_done.json                             marker: PlanOutput
    send/_done.json                             marker: SendOutput
```

- **Data files** are stored under their sha256 with `ArtifactStorage::publish` (P10). Two runs that produce the same bytes store one object. A data file has no key of its own under `runs/`; the marker names it by `ArtifactRef`.
- **A marker** is written in two steps that already exist: the JSON body is published as a `Format::Json` artifact, then its `ArtifactRef` is bound at the marker key with `ArtifactStorage::bind`. `bind` succeeds only if the key is empty. A second attempt gets `Bound::Exists` and reads the first attempt's marker.
- **The capture binding** moves from `captures/{run}/{source}.{fingerprint}.json` to `runs/{run}/capture/{source}.{fingerprint}.json`. This is one function, `ArtifactNamespace::capture`, on the BE-933 branch. No file with the old key exists outside development.
- **Nothing is deleted** (D10).

### Marker functions

Every stage uses the same two functions.

```rust
/// Returns the output stored at `key`, if a stage has finished there.
async fn finished<T: DeserializeOwned>(
    context: &RunContext,
    key: &ArtifactKey,
) -> Result<Option<T>, Report<StageError>>;

/// Stores `output` at `key` unless an output is already there, and returns the stored one.
async fn finish<T: Serialize + DeserializeOwned>(
    context: &RunContext,
    key: &ArtifactKey,
    output: &T,
) -> Result<T, Report<StageError>>;
```

- A stage calls `finished` first and returns the stored output when there is one.
- A stage calls `finish` last. When another attempt has finished in the meantime, `finish` returns that attempt's output, and the stage returns it.
- `ArtifactNamespace` has one key builder per key: `current()`, `input(run)`, `capture(run, source, fingerprint)`, `capture_output(run)`, `diff_output(run)`, `plan_output(run)` and `send_output(run)`. A builder that takes a run takes it as a `Uuid`.
- `RunContext::publish` stores a local file and `RunContext::fetch` downloads one. `RunContext::open_workspace(variables)` opens a stage's workspace in the scratch directory with the limits of `RunContext::workspace` and the definition's variables. `WorkspaceConfig` and `ArtifactStorage` derive `Clone`, and the runner builds the `SourceReader` from a clone of the context's storage.

### Tables as files

Stages exchange Parquet files. Two functions cover every case.

```rust
/// Writes the rows of `sql` to a Parquet file, stores it, and returns its reference.
async fn store_query(
    context: &RunContext,
    workspace: &Workspace,
    sql: Box<str>,
) -> Result<ArtifactRef, Report<StageError>>;

/// Downloads `file` and loads it into `table` of `workspace`.
async fn load_table(
    context: &RunContext,
    workspace: &Workspace,
    file: &ArtifactRef,
    table: Box<str>,
) -> Result<(), Report<StageError>>;
```

- `store_query` uses `Workspace::capture` and `ArtifactStorage::publish`. `load_table` uses `ArtifactStorage::materialize`, `SourceCapture::open` and `Workspace::load_capture`.
- A workspace query cannot open a file (`engine/src/workspace/select.rs:37`), so these two functions are the only way a Parquet file enters or leaves DuckDB.
- Rows built in Rust reach a Parquet file through `RowFile`, which writes text, integer and boolean columns. The REST reader's private `Spool` (`engine/src/sources/rest.rs:244`) is its starting point. Stage 2 uses it for the entity IDs, stage 3 for `writes` and `issues`, stage 4 for `rejected`.

```rust
pub struct Column {
    pub name: &'static str,
    pub kind: ColumnKind,
    pub nullable: bool,
}

pub enum ColumnKind { Text, UInt16, UInt32, UInt64, Boolean }

pub enum Cell { Null, Text(Box<str>), UInt(u64), Boolean(bool) }

/// A local Parquet file that rows are appended to.
pub struct RowFile { /* private */ }

impl RowFile {
    /// Starts a file with `columns` in the run's scratch directory.
    pub fn create(context: &RunContext, columns: &[Column]) -> Result<Self, Report<StageError>>;

    /// Appends one row. `row` has one cell per column.
    pub fn push(&mut self, row: &[Cell]) -> Result<(), Report<StageError>>;

    /// Closes the file and returns it for `Workspace::load_capture`.
    pub fn close(self) -> Result<SourceCapture, Report<StageError>>;

    /// Closes the file, stores it, and returns its reference.
    pub async fn store(self, context: &RunContext) -> Result<ArtifactRef, Report<StageError>>;
}
```

- `Text` is written as Arrow `Utf8`, `UInt16`, `UInt32` and `UInt64` as the Arrow types of the same names, and `Boolean` as `Boolean`.
- The writer uses Snappy and row groups of 65,536 rows, as the REST reader does, and writes no key-value metadata of its own. The same rows give the same file.
- A file with no rows is a valid Parquet file with the declared columns.
- A column's type in a stage is the type DuckDB gives it when it reads the Parquet file. Stage 3 reads rows only this way (P9).
- One type changes on the way through a file: a `HUGEINT` column comes back as `DECIMAL(38,0)`. A value with more than 38 digits fails the load (D17).

### `current.json`

One file per integration, overwritten in place.

```rust
pub struct Current {
    /// The run the next run diffs against.
    pub committed: Option<RunId>,
    /// Runs that started sending and did not commit, oldest first.
    pub sending: Vec<RunId>,
}
```

Three functions read and write it:

```rust
/// Returns the stored value, or an empty `Current` when the file does not exist.
async fn read(context: &RunContext) -> Result<Current, Report<StageError>>;

/// Adds `run` to `sending`.
async fn mark_sending(context: &RunContext, run: RunId, base: Option<RunId>)
    -> Result<(), Report<StageError>>;

/// Sets `committed` to `run` and removes `run` and `resent` from `sending`.
async fn commit(context: &RunContext, run: RunId, base: Option<RunId>, resent: &[RunId])
    -> Result<(), Report<StageError>>;
```

- `mark_sending` first returns `base_moved` when `committed` differs from `base`. It then does nothing when `run` is already listed.
- `commit` does nothing when `committed` is already `run`. Otherwise it returns `base_moved` when `committed` differs from `base`.
- Each write shall replace the file only if it is unchanged since the read. `ArtifactStorage` has no such write today, and `object_store` returns `NotImplemented` for it on the local file system (D9). Until the coordination work adds it, the write is a plain overwrite, and one active run per integration is the engine's guarantee.

## The stored files

A file is described by its columns and its rules. Every file is Parquet. Column names that start with `_` are written by the engine.

### Checkpoint 1: `CaptureOutput`

```rust
pub struct CaptureOutput {
    /// Used as `loadedAt` in every request of the run (P14).
    pub captured_at: OffsetDateTime,
    pub sources: BTreeMap<SourceName, CapturedSource>,
    /// The run whose captures this run uses, for a restore or a reconcile.
    pub adopted_from: Option<RunId>,
}

pub struct CapturedSource {
    pub file: ArtifactRef,
    pub rows: u64,
}
```

- `sources` has one entry for every source of the definition that is read (`SourceKind` other than `Checkpoint`).
- Each file holds the source's rows as fetched, in the form `Workspace::capture` writes today.
- `captured_at` is the time the stage started in the attempt that wrote the marker. For an adopted capture it is the adopted run's `captured_at`.
- `rows` is the row count of the capture before any SQL step. The source coverage rule reads it.
- `CapturedSource` is defined in `sources/`, where the capture is made, and re-exported from `stage::capture`. `time` becomes a public dependency of the engine, because `captured_at` is in its public API.

### Checkpoint 2: `DiffOutput`

```rust
pub struct DiffOutput {
    /// The committed run this run was diffed against (A3).
    pub base: Option<RunId>,
    /// The runs whose writes joined the resend set (A3).
    pub resent: Vec<RunId>,
    pub hashes: ArtifactRef,
    pub archives: ArtifactRef,
    pub issues: ArtifactRef,
    pub targets: BTreeMap<Target, TargetDiff>,
}

pub struct TargetDiff {
    /// Rows to insert, update or resend. Absent when there are none.
    pub changes: Option<ArtifactRef>,
    pub counts: DiffCounts,
}

pub struct DiffCounts {
    pub inserted: u64,
    pub updated: u64,
    pub resent: u64,
    pub unchanged: u64,
    pub archived: u64,
    pub without_id: u64,
}
```

`targets` has one entry for every sink and link pipeline of the definition, and one for every kind and target of the `archives` file that the definition no longer has.

#### `hashes`: the hash table

One file per run for the whole integration (A1).

| Column | Type | Content |
| --- | --- | --- |
| `entity_id` | `VARCHAR` | `{web}~{uuid}` |
| `kind` | `VARCHAR` | `entity` or `link` |
| `target` | `VARCHAR` | The step ID of the sink or the link ID that last produced the row |
| `source_id` | `VARCHAR` | The text the UUID was derived from |
| `content_hash` | `VARCHAR` | 32 hex digits; see "Content hash" |
| `live` | `BOOLEAN` | `true` when the integration wants the entity to exist after this run |

Rules:

- The file holds exactly one row per entity ID.
- The file holds every row of the base run's hash table. A row is never dropped; an entity that is no longer wanted keeps its row with `live = false`.
- A row with `live = false` keeps the `target`, `source_id` and `content_hash` it had when it was last live.
- Rows are sorted by `entity_id`.
- The file describes what the run wants, whether or not the Graph accepted every write.

#### `changes`: one file per target

Each sink has its own columns, so each target has its own file.

| Column | Type | Content |
| --- | --- | --- |
| `_row` | `UBIGINT` | 0, 1, 2 and so on, in the order of `_entity_id` |
| `_entity_id` | `VARCHAR` | `{web}~{uuid}` |
| `_change` | `VARCHAR` | `insert`, `update` or `resend` |
| `_source_id` | `VARCHAR` | The text the UUID was derived from |
| `_key` | `VARCHAR`, nullable | The row's `_key` from staging. The column is present only when the target's table has one. |
| `_left_entity_id` | `VARCHAR` | Links only: the entity the link starts at |
| `_right_entity_id` | `VARCHAR` | Links only: the entity the link ends at |
| every column an accessor of the target reads | as in the target's table | The row's values |

Rules:

- The file holds one row for every entity of the target that is inserted, updated or resent, and no other row.
- The file holds the columns the target's property accessors read, by their names in the target's table. It holds no other column of that table, apart from the engine columns above.
- `_row` lets stage 3 read the file in ranges, because `Workspace::query` returns all rows of a query in memory.
- This is the "full mapped row" the overview requires for sources that send only changes.

#### Reserved column names

A target's table shall not have a column named `_op`, `_key`, `_content_hash`, `_entity_id`, `_source_id`, `_left_entity_id`, `_right_entity_id`, `_row`, `_change` or `rowid`, other than the ones the engine adds. Staging refuses the first three today (`engine/src/workspace/connection/staging.rs:76`). Step 3 checks the others and fails with `reserved_column`.

#### `archives`

| Column | Type | Content |
| --- | --- | --- |
| `entity_id` | `VARCHAR` | `{web}~{uuid}` |
| `kind` | `VARCHAR` | `entity` or `link` |
| `target` | `VARCHAR` | As in the hash table |
| `source_id` | `VARCHAR` | As in the hash table |

The file holds one row for every entity the run archives, sorted by `kind`, then `entity_id`. An archive needs no row values, and its target may no longer exist in the definition.

#### `issues`

Stage 2 and stage 3 write the same schema. It holds no row values (BE-1146).

| Column | Type | Content |
| --- | --- | --- |
| `kind` | `VARCHAR` | `entity` or `link` |
| `target` | `VARCHAR` | The step ID or link ID |
| `entity_id` | `VARCHAR`, nullable | Absent when the row has no ID |
| `key` | `VARCHAR`, nullable | The row's `_key` from staging, when the target's table has one |
| `issue` | `VARCHAR` | `missing_id`, `missing_endpoint` or `property_unconverted` |
| `property` | `VARCHAR`, nullable | The property type URL |
| `reason` | `VARCHAR`, nullable | The name of the `FailureReason` (`engine/src/graph/property/mod.rs:178`) |

### Checkpoint 3: `PlanOutput`

```rust
pub struct PlanOutput {
    pub writes: ArtifactRef,
    pub issues: ArtifactRef,
    pub batches: u32,
    pub counts: BTreeMap<OperationKind, u64>,
}
```

#### `writes`

| Column | Type | Content |
| --- | --- | --- |
| `seq` | `UBIGINT` | The send order: 0, 1, 2 and so on |
| `batch` | `UINTEGER` | Writes with the same number are sent in one request |
| `operation` | `VARCHAR` | `upsert_entity`, `upsert_link`, `archive_link` or `archive_entity` |
| `change` | `VARCHAR` | `insert`, `update`, `resend` or `archive` |
| `entity_id` | `VARCHAR` | `{web}~{uuid}` |
| `target` | `VARCHAR` | As in the hash table |
| `source_id` | `VARCHAR` | As in the hash table |
| `left_entity_id` | `VARCHAR`, nullable | Link upserts only |
| `right_entity_id` | `VARCHAR`, nullable | Link upserts only |
| `create` | `VARCHAR`, nullable | The JSON body of the create request; absent for archives |
| `patch` | `VARCHAR` | The JSON body of the patch request; for an archive, the archive body |

Rules:

- The file holds one row per entity ID.
- Rows are ordered by `operation` in the order upsert entity, upsert link, archive link, archive entity, then by first request with creates before patches, then by `entity_id`. `seq` follows that order.
- The first request of a write is the create when `change` is `insert`, and the patch otherwise.
- A batch holds writes of one `operation` and one first request. It holds at most 128 writes, and the bodies of its first requests add up to at most 1,500,000 bytes. A body larger than that is alone in its batch.
- `batch` increases with `seq`.
- A `create` or `patch` value is the exact body of one entity in a request. A bulk request is the JSON array of the bodies of one batch.
- The next run reads the `entity_id` column of a run that failed while sending.

#### Request bodies

The create and archive bodies stay as the planner writes them today (`engine/src/graph/plan/request.rs:259`, `:298`). The patch body changes (P7):

```json
{
  "entityId": "{web}~{uuid}",
  "entityTypeIds": ["https://…/entity-type/aircraft/v/1"],
  "properties": [{ "op": "replace", "path": [], "property": { "value": { } } }],
  "archived": false,
  "provenance": { }
}
```

- An entity patch and a link patch always carry `properties` with one replace at the empty path, also when the object is empty. The replaced property is always an object; the Graph stops on any other value (`postgres-store/.../knowledge/entity/patch.rs:491-493`). An empty `metadata` is left out.
- Every patch carries `archived: false`, so it brings an archived entity back.
- Every request of a run carries the same edition provenance: actor type `machine`, origin `api`, and one source of type `integration` whose `location.name` is the connector ID and whose `loadedAt` is `CaptureOutput::captured_at`. A location per source belongs to H-6831.
- No request carries provenance or a run-specific value in property metadata (D7).

### `SendOutput`

```rust
pub struct SendOutput {
    /// Absent when the Graph accepted every write.
    pub rejected: Option<ArtifactRef>,
    pub counts: SendCounts,
}

pub struct SendCounts {
    pub created: u64,
    pub patched: u64,
    pub archived: u64,
    /// Archives of entities the Graph does not have.
    pub absent: u64,
    pub rejected: u64,
}
```

#### `rejected`

| Column | Type | Content |
| --- | --- | --- |
| `entity_id` | `VARCHAR` | `{web}~{uuid}` |
| `operation` | `VARCHAR` | As in `writes` |
| `change` | `VARCHAR` | As in `writes` |
| `target` | `VARCHAR` | As in `writes` |
| `source_id` | `VARCHAR` | As in `writes` |
| `status` | `USMALLINT`, nullable | The HTTP status of the last response |
| `reason` | `VARCHAR` | `graph_status`, `endpoint_rejected`, `not_found_after_conflict` or `conflict_after_not_found` |

The rows are in `seq` order. The file holds no response body and no row value.

## Rules of stage 2

These rules decide the content of checkpoint 2. The stage 2 spec implements them and adds none.

### Entity ID

- The entity ID of a row is derived once, in Rust, in step 3 (A2), with `derive_entity_id` and the text rendering the planner uses today (`engine/src/graph/property/value.rs:154`).
- For an entity the source ID is the text of the sink's `entity_id` column.
- For a link the source ID is `"{from type}::{from id}::{to type}::{to id}"` (`engine/src/graph/mod.rs:100`), and the two endpoint IDs are derived from the `from` and `to` columns the same way.
- A row whose ID column is null, blank or has no text form has no entity ID. It is left out of the hash table and of `changes`, counted in `without_id`, and written to `issues` as `missing_id`, or `missing_endpoint` for a link.

### Content hash

- The hash of a row is the existing `_content_hash` (`engine/src/workspace/connection/pipeline.rs:245`): an md5 over the values of the columns the target's property accessors read.
- A link's hash is computed the same way over its property accessors, and is `md5('')` when it has none.
- The first version has no config hash and no hash version (D1). The diff has one rule: two rows are equal when their hashes are equal.

What follows from that:

- Adding or removing a property changes the hash of every row of the target, because the hashed columns change. Those rows are sent.
- A renamed sink with an unchanged mapping changes no hash.
- A change that keeps the hashed columns changes no hash and sends nothing: another property type URL for the same column, another coercion, or a changed unit map. An apply run with `resend_all` sends such a change.
- A DuckDB upgrade that renders a struct as different text changes every hash. Every row is then sent once, and the Graph writes nothing for a row whose values are unchanged.

### The diff

Step 4 joins all rows of the run with the base run's hash table on entity ID.

| Row of this run | Row in the base | Label | `live` in the new hash table |
| --- | --- | --- | --- |
| Present | Absent | `insert` | `true` |
| Present | `live = false` | `update` | `true` |
| Present | `live = true`, other hash | `update` | `true` |
| Present | `live = true`, same hash | none, or `resend` | `true` |
| Absent | `live = true` | `archive`, or none when the coverage rule applies | `false`, or `true` when the coverage rule applies |
| Absent | `live = false` | none, or `archive` | `false` |
| Absent | Absent, in the resend set | `archive` | `false` |

- A row with no label is unchanged and produces no write.
- A run resends everything when its operation is a reconcile or an apply with `resend_all`.
- `resend` replaces "none" in the fourth line when the entity ID is in the resend set or the run resends everything.
- `archive` replaces "none" in the sixth line when the entity ID is in the resend set or the run resends everything.
- A run with no base treats every row as absent from the base.

### The resend set

The resend set of a run holds:

- every `entity_id` in the `writes` file of each run listed in `Current::sending`, and
- every `entity_id` in the `rejected` file of the base run (P2).

Stage 2 reads `current.json` once, when it starts, and records the base and the listed runs in `DiffOutput`. An entity ID that is in the resend set and in neither the run's rows nor the base comes from a run that failed while sending. The new hash table copies its row from that run's hash table and sets `live = false`.

### Guards

- **Duplicate entity IDs.** If two rows of the run have the same entity ID, the stage fails with `duplicate_entity_id`. The check covers all targets together (P13).
- **Source coverage.** A target archives nothing when a source it reads has `coverage: partial`, or has `coverage: complete` and `CapturedSource::rows` is 0. The base rows of that target that are absent from the run stay `live = true`. The sources a target reads are the captured sources on its data path: the source of its pipeline, and the sources read by every pipeline that produces one of its input definition checkpoints, taken by the same rule. A source of kind `Checkpoint` stands for the sources of the pipeline that produces its definition checkpoint. When the rule applies to at least one target of the run, the base rows of targets that the definition no longer has also stay `live = true`.
- **Archive limit.** Counted per kind over the whole integration. The count holds the archives of base rows with `live = true` whose entity ID is not in the resend set. If the count of one kind exceeds the larger of 1,000 and half of the base rows of that kind with `live = true`, the stage fails with `archive_limit`. `RunInput::allow_mass_archive` turns the check off.
- **The resend set is not guarded.** An entity ID from the resend set that is absent from the run's rows is archived also when the coverage rule applies to its target. The entity is brought back by the first later run that reads its row. D6 covers partial sources.

### Inside stage 2

Stage 2 has two spec files. `stage-2-rows.md` covers steps 2 and 3, and `stage-2-diff.md` covers step 4 and the stage function. They meet at one function:

```rust
/// Runs steps 2 and 3: loads the captures, runs the definition, and gives every row its hash and entity ID.
async fn prepare_rows(
    context: &RunContext,
    workspace: &Workspace,
    input: &RunInput,
    definition: Option<&Definition>,
    capture: &CaptureOutput,
) -> Result<PreparedRows, Report<StageError>>;

pub struct PreparedRows {
    pub targets: Vec<TargetRows>,
    /// A workspace table with the columns of the `issues` file.
    pub issues: Box<str>,
}

/// The rows of one target after steps 2 and 3.
pub struct TargetRows {
    pub target: Target,
    /// The workspace table that holds the rows.
    pub table: Box<str>,
    /// The columns of `table` that the target's property accessors read.
    pub columns: Vec<Box<str>>,
    /// The sources the target reads, for the coverage rule.
    pub sources: BTreeSet<SourceName>,
    /// The rows that were left out because they have no ID.
    pub without_id: u64,
}
```

Each target's table has these columns beside the target's own:

| Column | Type | Content |
| --- | --- | --- |
| `_entity_id` | `VARCHAR`, not null | `{web}~{uuid}` |
| `_source_id` | `VARCHAR`, not null | The text the UUID was derived from |
| `_content_hash` | `VARCHAR`, not null | The row's hash |
| `_left_entity_id`, `_right_entity_id` | `VARCHAR`, not null | Links only |

- A row without an ID is not in the table. It is in the `issues` table.
- `prepare_rows` returns one `TargetRows` for every sink and link pipeline of the definition, also when the table is empty. For a run without a definition it returns no targets and an empty `issues` table.
- The duplicate guard, the diff and every file of checkpoint 2 belong to step 4.
- The caller parses the definition once and opens the workspace with the definition's variables.
- The hash is computed while a pipeline runs (`Workspace::prepare_pipeline`, `prepare_link_pipeline`), because the expression needs the column types.

## Rules of stage 4

### The Graph client

Stage 4 sends through a trait, so that tests run against an in-memory fake.

```rust
pub trait Graph: Send + Sync {
    /// Creates the entities whose bodies are given, in one request.
    fn create(&self, actor: ActorEntityUuid, bodies: &[&RawValue])
        -> impl Future<Output = GraphResponse> + Send;

    /// Patches the entities whose bodies are given, in one request.
    fn patch(&self, actor: ActorEntityUuid, bodies: &[&RawValue])
        -> impl Future<Output = GraphResponse> + Send;
}

pub enum GraphResponse {
    /// The Graph applied every body.
    Applied,
    /// The Graph answered with a status that applies nothing.
    Status(u16),
    /// The request did not reach the Graph, or no response arrived.
    Unreachable,
}
```

- The HTTP implementation sends `POST /entities/bulk` and `PATCH /entities/bulk`. It reuses the URL check, the headers and the HTTP client of `GraphClient` (`engine/src/graph/client/mod.rs:77`, `:142`).
- The trait and `GraphResponse` are defined in `graph/`, next to `GraphClient`, which implements the trait. The futures are `Send`, because the run interface needs that.
- The fake keeps, per entity ID, whether the entity exists, whether it is archived, its property object and its edition count, and can be told to answer a given status for a given entity ID or request.
- Request pacing is inside the implementation (D11).

### Sending

Batches are sent one after another, in `seq` order.

For a request of more than one write:

| Response | Action |
| --- | --- |
| `Applied` | Every write of the batch is done. |
| `Status` 429, 502, 503 or 504, or `Unreachable` | Wait and send the request again. After `max_attempts` the stage fails as retryable. |
| Any other status | Send each write of the batch on its own. |

For a single write:

| Response | First request is the create | First request is the patch | Archive |
| --- | --- | --- | --- |
| `Applied` | Done | Done | Done |
| 409 | Send the patch | Reject | Reject |
| 404 | Reject | Send the create | Done, counted as absent |
| 429, 502, 503, 504, `Unreachable` | Wait and send again; after `max_attempts` the stage fails as retryable | Same | Same |
| 499 | Wait and send again; after `max_attempts` the stage fails as retryable | Same | Same |
| 500 | Wait and send again; after `max_attempts` reject | Same | Same |
| Any other status | Reject | Reject | Reject |

- The create and the patch of one write are each sent at most once as a fallback of the other. A 404 on the patch after a 409 on the create rejects the write with `not_found_after_conflict`. A 409 on the create after a 404 on the patch rejects it with `conflict_after_not_found`.
- A link upsert whose `left_entity_id` or `right_entity_id` was rejected earlier in the same run is not sent. It is rejected with `endpoint_rejected`.
- `max_attempts` counts the attempts of one request. A write with a fallback can therefore cause up to twice that many requests.
- `max_attempts` and the wait between attempts are in `SendSettings`, a field of `RunContext`.

### Order of the stage

1. When `send/_done.json` exists, skip to step 5 and return the stored `SendOutput`.
2. Read `current.json`. Fail with `superseded` when `sending` lists a run that is neither this run nor in `DiffOutput::resent`.
3. Call `mark_sending` with `DiffOutput::base`.
4. Send every batch. Write `rejected` and `send/_done.json`.
5. Call `commit` with `DiffOutput::base` and `DiffOutput::resent`.

A stage that runs again after step 3 sends every batch again. That is safe: a create that finds the entity is followed by its patch, and the Graph writes nothing for a patch that changes nothing.

## Stage functions

Every stage is one function. `RunContext` holds what every stage needs.

```rust
pub struct RunContext {
    pub storage: ArtifactStorage,
    pub namespace: ArtifactNamespace,
    /// A local directory for the run's temporary files.
    pub scratch: PathBuf,
    pub workspace: WorkspaceConfig,
    pub send: SendSettings,
    pub clock: Box<dyn Clock>,
}

/// Resolves a request into the run's input and stores it.
pub async fn start(context: &RunContext, request: RunRequest)
    -> Result<RunInput, Report<StageError>>;

/// Stage 1.
pub async fn capture(
    context: &RunContext,
    input: &RunInput,
    sources: &SourceReader,
    secrets: &impl SecretStore,
) -> Result<CaptureOutput, Report<StageError>>;

/// Stage 2.
pub async fn diff(
    context: &RunContext,
    input: &RunInput,
    capture: &CaptureOutput,
) -> Result<DiffOutput, Report<StageError>>;

/// Stage 3.
pub async fn plan(
    context: &RunContext,
    input: &RunInput,
    capture: &CaptureOutput,
    diff: &DiffOutput,
) -> Result<PlanOutput, Report<StageError>>;

/// Stage 4.
pub async fn send(
    context: &RunContext,
    input: &RunInput,
    diff: &DiffOutput,
    plan: &PlanOutput,
    graph: &impl Graph,
) -> Result<SendOutput, Report<StageError>>;
```

What each function reads and writes:

| Function | Reads | Writes | Opens a workspace |
| --- | --- | --- | --- |
| `start` | `current.json` and the target run's `input.json`, for a restore or reconcile | `runs/{run}/input.json` | No |
| `capture` | The sources, or the target run's `capture/_done.json` | The capture files, their bindings, `capture/_done.json` | Yes, for SQL sources |
| `diff` | The capture files, `current.json`, the base run's `hashes` and `rejected`, the `writes` and `hashes` of the runs listed in `sending` | `hashes`, `changes`, `archives`, `issues`, `diff/_done.json` | Yes |
| `plan` | `changes`, `archives`, `CaptureOutput::captured_at`, the definition and the connector of the `RunInput` | `writes`, `issues`, `plan/_done.json` | Yes, to read `changes` |
| `send` | `writes`, `current.json` | Requests to the Graph, `rejected`, `send/_done.json`, `current.json` | No |

A stage opens its own workspace in `scratch` and closes it before it returns. No DuckDB file is passed between stages or kept between runs.

## Operations

`start` and stages 1 and 2 behave differently per operation. Stages 3 and 4 do not read the operation.

| | Apply | Restore to run K | Restore to empty | Reconcile |
| --- | --- | --- | --- | --- |
| `start`: definition and namespace | From the request | From K's `RunInput` | No definition; namespace of the committed run | From the committed run's `RunInput` |
| `start`: fails when | The definition does not parse | K has no `input.json` | | No run is committed |
| Stage 1 | Captures every source | Stores K's `CaptureOutput` as its own, with `adopted_from: K` | Stores an output with no sources and the current time | Stores the committed run's `CaptureOutput` as its own |
| Stage 2: rows of the run | From the captures | From K's captures | None | From the committed run's captures |
| Stage 2: labels | As in "The diff"; with `resend_all`, unchanged rows are `resend` and rows with `live = false` are `archive` | As in "The diff" | As in "The diff": every live entity is archived | Unchanged rows are `resend`; rows with `live = false` are `archive` |
| Stage 2: source coverage rule | Applies | Applies | Does not apply | Applies |

- A restore or a reconcile stores a `RunInput` with the target's definition and a `CaptureOutput` with the target's files. The run is then restorable itself.
- A run that fails while sending needs no operation: the next run of any kind puts its writes into the resend set.
- Cancel is the engine stopping the run between or inside stage calls. A run cancelled after `mark_sending` stays in `Current::sending`.

## The runner

```rust
/// Runs one request to the end.
pub async fn run(
    context: &RunContext,
    request: RunRequest,
    sources: &SourceReader,
    secrets: &impl SecretStore,
    graph: &impl Graph,
) -> Result<SendOutput, Report<StageError>> {
    let input = start(context, request).await?;
    let capture = capture(context, &input, sources, secrets).await?;
    let diff = diff(context, &input, &capture).await?;
    let plan = plan(context, &input, &capture, &diff).await?;
    send(context, &input, &diff, &plan, graph).await
}
```

- **Local runner.** A `run` subcommand of `apps/hash-integrations` builds the `RunContext` and calls `run`. Starting it again with the same run ID continues the run: every finished stage returns its stored output.
- **Run interface.** A `RunFunction` (`orchestration/src/run.rs:26`) with `Input = RunRequest` calls the same five functions, each inside `StepContext::run` with the step names `start`, `capture`, `diff`, `plan` and `send`. The recorded step outputs are `RunInput`, `CaptureOutput`, `DiffOutput`, `PlanOutput` and `SendOutput`. They hold references and counts, and no rows.
- A `StageError` becomes a `StepFailure` with the same kind and the error's code.

## Module tree

All new code is in the engine crate, next to the code it reuses. Paths are under `libs/@local/integrations/engine/src/`.

```text
run/
  mod.rs          RunId, RunRequest, OperationRequest, RunInput, Operation, start, run
  context.rs      RunContext, SendSettings, Clock, SystemClock, FixedClock
  current.rs      Current, read, mark_sending, commit
  marker.rs       finished, finish
  table.rs        store_query, load_table, RowFile, Column, ColumnKind, Cell
  error.rs        StageError and the error codes
  target.rs       Kind, Target, Change, InvalidText
stage/
  capture/        stage 1: capture, CaptureOutput, CapturedSource
  diff/           stage 2: diff, DiffOutput, TargetDiff, DiffCounts
  plan/           stage 3: plan, PlanOutput
  send/           stage 4: send, SendOutput, SendCounts
graph/            existing: operations, request bodies, property resolution, HTTP client; new: Graph, GraphResponse, the fake
sources/          existing: source readers, secrets
workspace/        existing: the DuckDB workspace
pipeline/         existing: prepared pipelines, assertions
storage/          existing: content-addressed files, bindings
entity_id.rs      existing: derive_entity_id
capture.rs        existing: SourceCapture
```

- A stage module depends on `run` and on the existing modules. From another stage module it imports the output type and nothing else.
- Code that two stages need is in `run` or in an existing module. Stage specs place each function they add by this rule.
- The files inside each stage module are fixed by the stage specs.
