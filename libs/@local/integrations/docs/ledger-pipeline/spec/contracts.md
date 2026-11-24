# Contracts

Agreed by Paul on 2026-11-19. The types and functions that one milestone calls from another. A milestone may change anything inside its own modules. It may not change what is on this page without the page being changed first.

## What each milestone provides and uses

Every milestone is in this table. A block further down exists for each milestone that others call into. Milestones 8, 10 and 11 have no block of their own. Nothing calls into milestones 8 and 10 except the caller of the crate, and their one function each is in the first block. Milestone 11 is that caller: the command line tool.

| #   | Milestone                 | Provides to others                                                                                                  | Uses                                                            |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1   | Crate and storage         | `Storage`, `CasVersion`, `S3Bucket`                                                                                 |                                                                 |
| 2   | Run state                 | `RunId`, `RunRecord` and its parts, `Stage`, `load`, `save`, `current::read`, `current::complete`, `start`          | 1                                                               |
| 3   | Stage frame and Capture   | `StageError`, `begin`, `end`, `permanent`, `retryable`; the function `capture`                                      | 1, 2                                                            |
| 4   | Sync table                | `SyncRow`, `Op`, `write`, `read`, `order_key`                                                                       | 1, 2 (the run id)                                               |
| 5   | Workspace                 | `Workspace` with `open`, `load_capture`, `create_table`, `describe`, `count`, `query`, `pipeline_sql`; `Identifier` | 3 (the `stage` folder)                                          |
| 6   | SQL steps                 | `prepare_pipeline`, `prepare_link_pipeline`, `check_metadata`                                                       | 5                                                               |
| 7   | Ids and properties        | `derive_entity_id`, `derive_link_id`, `SinkRow`, `SinkColumns`                                                      | 3 (the `stage` folder)                                          |
| 8   | Prepare, incremental      | the function `prepare_incremental`                                                                                  | 1, 2, 3, 4, 5, 6, 7                                             |
| 9   | Graph requests and client | the bodies `create`, `patch`, `archive`; `integration_provenance`; `GraphClient`, `Answer`                          | 2 (the run id), 3 (the `stage` folder), 4 (the row type)        |
| 10  | Send                      | the function `send`                                                                                                 | 1, 2, 3, 4, 9                                                   |
| 11  | The whole pipeline        | the command line tool                                                                                               | 2, 3, 8, 10 (`start`, `capture`, `prepare_incremental`, `send`) |

**Visibility.** The page writes `pub` for everything another milestone calls, and the milestone files do the same in their sketches. In the code only the four functions a caller uses and the types in their signatures are public (`Storage`, `S3Bucket`, `IntegrationNamespace`, `StartInput`, `RunId`, `GraphClient` and the error types). Everything else is `pub(crate)`: the workspace's lints warn on a `pub` item that cannot be reached from outside (`unreachable_pub`).

Everything here is taken from `../plan.md` or from existing code. Each block names its origin. Three kinds of mark are used in the whole spec:

- **Fact:** checked in code or by a test, with the place.
- **Chosen:** a choice by Claude that stays inside one milestone and is cheap to change.
- **D1, D2, ...:** a decision that crosses milestones. All of them are in `decisions.md`.

## How the milestones use each other

```text
                 ┌──────────────── stage (3) ────────────────┐
 lib.rs ──►  run::start (2)   capture (3)   prepare (8)   send (10)
                 │               │            │   │          │  │
                 │               │   workspace (5, 6)        │  requests, client (9)
                 │               │   ids, properties (7)     │
                 │               │            └── sync_table (4) ──┘
                 └───────────────┴──── run (2) ───────────────┘
                                        storage (1)
```

## The four functions a caller uses (`lib.rs`; milestones 2, 3, 8 and 10)

```rust
pub async fn start(storage: &Storage, definition: &Definition, input: StartInput) -> Result<RunId, Report<StartError>>;
pub async fn capture(storage: &Storage, run: RunId, files: &BTreeMap<SourceName, PathBuf>) -> Result<(), Report<StageError>>;
pub async fn prepare_incremental(storage: &Storage, run: RunId) -> Result<(), Report<StageError>>;
pub async fn send(storage: &Storage, run: RunId, graph: &GraphClient) -> Result<(), Report<StageError>>;
```

- **Origin:** `../plan.md`, step 3. Every stage takes the run id and reads the rest from `run.json`. Capture also takes the files, one per table of the definition (D14), and Send the Graph client. In a definition a table is called a source, so the name of a table is a `SourceName`.
- **Chosen:** `start` creates the run id and returns it.
- **The caller parses the definition, once** (D9). It needs the connector to open the integration's `Storage`, and passes the parsed definition to `start` with the text, which `run.json` keeps (D4). Start parses nothing.

## Storage (milestone 1)

Used by `run`, `stage`, `sync_table`, Capture and Prepare.

```rust
pub struct Storage { .. }                    // one integration's place in the bucket

/// tenants/{web}/integrations/{sha256("{web}:{connector}")}
pub struct IntegrationNamespace { .. }

impl IntegrationNamespace {
    pub fn new(web: Uuid, connector: &ConnectorId) -> Self;
}

impl Storage {
    /// Opens the place of `namespace` below the prefix in the bucket's URI.
    pub fn s3(bucket: S3Bucket, namespace: &IntegrationNamespace) -> Result<Self, Report<StorageError>>;
    /// The bucket's settings, with the namespace in its URI. The sync table opens its own connection with them.
    pub(crate) fn bucket(&self) -> Option<&S3Bucket>;
    /// The in-memory store of `object_store`, for tests. It has no bucket.
    #[cfg(test)]
    pub(crate) fn memory() -> Self;

    /// Uploads the file to `key` and returns its size.
    pub(crate) async fn upload(&self, file: &Path, key: &str) -> Result<u64, Report<StorageError>>;
    /// Downloads `key` into `directory` and returns the path of the file.
    pub(crate) async fn download(&self, key: &str, directory: &Path) -> Result<PathBuf, Report<StorageError>>;

    /// The bytes at `key` and their version, or `None` if the key is missing.
    pub(crate) async fn read_versioned(&self, key: &str) -> Result<Option<(Vec<u8>, CasVersion)>, Report<StorageError>>;
    /// Writes `bytes` if the file still has the version `expected`, or if the key is missing
    /// when `expected` is `None`. Returns `false` if nothing was written.
    pub(crate) async fn replace_if(&self, key: &str, expected: Option<&CasVersion>, bytes: Vec<u8>) -> Result<bool, Report<StorageError>>;
}

pub enum StorageError { Read, Write }
```

- **Origin:** `upload` and `download` are `ArtifactStorage::upload` and `materialize` of hashintel/hash#10392, without the content hash. `IntegrationNamespace` is `ArtifactNamespace` of hashintel/hash#10392, which follows labs `BlobNamespace` (`blob.rs`). All integrations share one bucket, and the web and the connector name an integration's place in it. `read_versioned`, `replace_if` and `CasVersion` are taken unchanged from `versioned.rs` on the branch `pe/ledger-r1-conditional-write`, which ported them from labs `blob.rs`. `S3Bucket` is the struct of hashintel/hash#10392.
- **Two functions cover all small files.** `replace_if` with `None` is "create if absent". With a version it is "replace if unchanged". `run.json` and `current.json` use them. The file in the module tree is therefore `storage/versioned.rs`, not `storage/json.rs`. Turning a type into JSON is done by the caller.
- **Chosen:** a key is a `&str`. The keys are built in `run`, for a run's files. The sync table opens its own store at `sync/`.
- **Fact:** `replace_if` works against MinIO with the workspace's `object_store` 0.12.5 (`../background/spikes.md`). Milestone 4 moves the workspace to 0.14.2, the version `deltalake-core` uses, and the storage tests pass on it.
- **Only `Storage`, `Storage::s3`, `S3Bucket`, `IntegrationNamespace` and `StorageError` are public.** A caller of the crate opens the integration's place in the bucket and passes it to the stages. For Start it reads the connector from the definition, and for a stage it is given the web and the connector. The four functions on it are called only inside the crate.
- **No local folder as a second kind of storage** (D6). Tests use `Storage::memory`, and the storage and sync table tests use a MinIO container.
- `read_versioned` and `replace_if` refuse a file larger than 16 MiB. The code they are ported from has 1 MiB (`versioned.rs:19` on the branch). The limit was raised so that `run.json` can hold the failed entities of a large run (D8).

## Run state (milestone 2)

Used by Start and by every stage.

```rust
pub struct RunId(Uuid);

pub struct RunRecord {                       // runs/{run}/run.json
    pub input: Input,
    pub batch: BatchLimits,
    pub capture: Option<CapturePart>,
    pub prepare: Option<PreparePart>,
    pub send: Option<SendPart>,
    pub failure: Option<Failure>,
}

pub struct Input {
    pub run: RunId,
    pub web: WebId,
    pub connector: Box<str>,                 // the connector's id, as text
    pub actor: ActorEntityUuid,
    pub definition: Box<str>,                // the definition as written (D4)
    pub id_namespace: Box<str>,              // the namespace of entity ids, as labs `id_namespace`
    pub submitted_at: OffsetDateTime,
}
pub struct BatchLimits { pub max_writes: u32, pub max_bytes: u64 }    // the `batch` part: 128 and 1,500,000

pub struct CapturePart { pub sources: BTreeMap<Box<str>, CapturedFile> }   // one entry per table, by its name (D14)
pub struct CapturedFile { pub key: Box<str>, pub size: u64, pub rows: u64 }
pub struct PreparePart { pub rows: u64, pub issues: Option<Box<str>>, pub issue_count: u64 }
pub struct SendPart {
    pub created: u64, pub updated: u64, pub archived: u64,
    pub create_existed: u64, pub update_missing: u64, pub archive_missing: u64,
    pub failed: Vec<FailedEntity>,
}
pub struct FailedEntity { pub batch: u32, pub index: u32,   /* both count from 0 */ pub entity_id: EntityId, pub status: u16, pub message: Box<str> }
pub struct Failure { pub stage: Stage, pub code: Box<str>, pub message: Box<str> }   // the error's text, cut to 1,024 characters
pub enum Stage { Capture, Prepare, Send }    // the name of a stage, as it is written into `failure`

pub struct Current { pub active: Option<RunId>, pub last_completed: Option<RunId> }   // current.json

// run/mod.rs
pub(crate) fn run_file(run: RunId) -> String;        // runs/{run}/run.json
pub(crate) fn capture_file(run: RunId, source: &SourceName) -> String;    // runs/{run}/capture/{source}.parquet
pub(crate) fn issues_file(run: RunId) -> String;     // runs/{run}/issues.jsonl
pub(crate) async fn load(storage: &Storage, run: RunId) -> Result<(RunRecord, CasVersion), Report<RunError>>;
pub(crate) async fn save(storage: &Storage, record: &RunRecord, expected: Option<&CasVersion>) -> Result<(), Report<RunError>>;

// run/current.rs
pub(crate) async fn read(storage: &Storage) -> Result<(Current, Option<CasVersion>), Report<RunError>>;
pub(crate) async fn complete(storage: &Storage, run: RunId) -> Result<(), Report<RunError>>;
```

- **Origin:** the parts and their fields are those of `review.md` and of `../plan.md`, step 3, with one field less: `review.md` has `retryable` in the `failure` part. Only a failure that a rerun cannot help is ever written, so the field would always say the same. The types `WebId`, `ActorEntityUuid`, `EntityId` and `ConnectorId` exist in `type-system` and `definition`.
- **Two namespaces, two names.** `id_namespace` goes into every entity id (`derive_entity_id`, milestone 7), and defaults to the connector's id. `IntegrationNamespace` is where the integration's files are stored. Labs names them `id_namespace` and `BlobNamespace`.
- **Names are text in `run.json`.** The connector's id and the names of the tables are written as text. `ConnectorId` and `SourceName` of the `definition` crate cannot be written as JSON, and that crate is not changed.
- **The `failure` part has a message** beside its code: the text of the error, such as the SQL step that failed with DuckDB's message (D12).
- `RunError` has five cases: `NotFound`, `Unreadable`, `Changed`, `NotActive` and `Storage`. `03-stage-frame-and-capture.md` has the table of what each becomes for a stage.
- **`save` fails if `run.json` changed since it was loaded.** A stage loads the file when it starts and saves it when it ends. If another process wrote in between, the stage fails and overwrites nothing. This covers one case of the open issue "Two attempts of one stage at the same time".

## Stage frame (milestone 3)

Used by the three stages.

```rust
// `Stage` is defined in `run/record.rs`, because run.json names a stage in its `failure` part.

pub enum StageError {
    /// Running the stage again can help: storage or the Graph was not available.
    Retryable { stage: Stage },
    /// Running it again cannot help. `end` records `code` in the `failure` part of run.json.
    /// `begin` returns this error without writing, for a run it cannot read or may not work on.
    Permanent { stage: Stage, code: &'static str },
    /// The stage before this one has not finished.
    NotReady { stage: Stage },
}

pub(crate) struct Open { pub record: RunRecord, version: CasVersion }

/// Reads run.json. Every stage starts with this. Refuses a run that has a `failure` part,
/// and a run that `current.json` does not name (D10).
pub(crate) async fn begin(storage: &Storage, run: RunId, stage: Stage) -> Result<Open, Report<StageError>>;
/// Every stage ends with this, as its last write. `Ok` saves run.json with the stage's part.
/// A permanent error saves run.json with the `failure` part. A retryable error writes nothing.
pub(crate) async fn end(storage: &Storage, open: Open, result: Result<(), Report<StageError>>) -> Result<(), Report<StageError>>;
```

A stage then has this shape. The three stages differ only in the middle:

```rust
pub async fn capture(storage, run, files) -> Result<(), Report<StageError>> {
    let mut open = stage::begin(storage, run, Stage::Capture).await?;
    if open.record.capture.is_some() { return Ok(()); }     // finished before
    let result = store(storage, run, files).await           // the steps of the stage
        .map(|part| open.record.capture = Some(part));
    stage::end(storage, open, result).await
}
```

- **Origin:** `../plan.md`, "How a stage writes" and step 4. Labs and `engine` have no stage frame.
- **Chosen:** no trait and no closure for "a stage". Each stage checks its own part and sets it, which is two lines.
- **Chosen:** one error type for all stages. The place where something fails says whether a rerun can help, and gives the code. Changed on this page on 2026-11-19 while writing milestone 3: `finish` and `fail` became one function, `end`, and `StageError` got `code` and `NotReady`.

## Sync table (milestone 4)

Written by Prepare, read by Send.

```rust
/// Declared in the order Send delivers them.
pub enum Op { CreateEntity, UpdateEntity, CreateLink, UpdateLink, ArchiveLink, ArchiveEntity }

pub struct SyncRow {
    pub run: RunId,
    pub seq: i64,
    pub op: Op,
    pub entity_id: EntityId,
    pub entity_type: VersionedUrl,
    pub left_entity_id: Option<EntityId>,
    pub right_entity_id: Option<EntityId>,
    pub properties: PropertyObjectWithMetadata,       // JSON text in the table
}

/// Replaces the rows of `run` with `rows`, in one commit.
pub async fn write(storage: &Storage, run: RunId, rows: Vec<SyncRow>) -> Result<(), Report<SyncTableError>>;
/// The rows of `run`, ordered by `seq`, then by entity id (`order_key`).
/// `EntityId` has no order of its own. `order_key` gives its web id and its entity UUID, as `engine` sorts.
pub(crate) struct OrderKey { web_id: Uuid, entity_uuid: Uuid }   // ordered by its fields
pub(crate) fn order_key(id: &EntityId) -> OrderKey;
pub async fn read(storage: &Storage, run: RunId) -> Result<Vec<SyncRow>, Report<SyncTableError>>;
```

- **Origin:** the columns are those of `../plan.md`, step 3. `EntityId`, `VersionedUrl` and `PropertyObjectWithMetadata` are the Graph's own types, which `engine` already uses for the same values.
- **Stored as Delta** (D17): a table under `sync/` in the integration's place, partitioned by run, one commit per write. `write` and `read` open their own connection to the bucket with `Storage::bucket`.
- `SyncTableError` has two cases. `Storage`: the bucket could not be reached, and a rerun can help. `Invalid`: a row cannot be written or read, or the storage has no bucket, and a rerun cannot help.
- **A run's rows are held in memory as one list** (D5).
- An update with an empty `properties` adds no property, and Send removes none. An archive carries an empty `properties`.

## Workspace and SQL steps (milestones 5 and 6)

Used by Prepare. All functions block, because DuckDB does. Prepare calls them inside one blocking task.

```rust
pub struct Workspace { .. }
pub struct WorkspaceConfig { pub variables: .., pub memory_limit: .., pub threads: .., pub temp_directory_limit: .. }

impl Workspace {
    pub fn open(path: &Path, config: WorkspaceConfig) -> Result<Self, Report<OpenError>>;
    pub fn load_capture(&self, file: &Path, table: &str) -> Result<u64, Report<StatementError>>;
    pub fn create_table(&self, table: &str, sql: &str) -> Result<(), Report<StatementError>>;
    pub fn describe(&self, sql: &str) -> Result<Vec<(String, String)>, Report<StatementError>>;   // of a query, not of a table
    pub fn count(&self, sql: &str) -> Result<u64, Report<StatementError>>;
    /// Checks that `sql` is a single SELECT and returns it without comments and terminators.
    pub fn pipeline_sql(&self, sql: &str) -> Result<String, Report<StatementError>>;
    pub fn query(&self, sql: &str) -> Result<Rows, Report<StatementError>>;

    pub fn prepare_pipeline(&self, pipeline: &EntityPipeline, input: &str, checkpoints: &BTreeMap<CheckpointName, Box<str>>) -> Result<PreparedPipeline, Report<PreparationError>>;
    pub fn prepare_link_pipeline(&self, pipeline: &LinkPipeline, checkpoints: &BTreeMap<CheckpointName, Box<str>>) -> Result<PreparedLink, Report<PreparationError>>;
    pub fn check_metadata(&self, table: &str) -> Result<(), Report<PreparationError>>;
}
```

- **Origin:** these are the functions of `engine`'s `Connection` (`workspace/connection/`), with the names they have there. Today they are reached through `Workspace`, which sends each call to a thread. That layer is left behind (`../plan.md`, step 2), so the new `Workspace` is the old `Connection`.
- `Rows`, `PreparedPipeline`, `PreparedLink`, `PreparationError`, `StatementError` and `OpenError` keep their names and shapes. `PreparedSink` loses its `step` field, which nothing reads. `PreparationError` loses the cases for cancelling, a stopped thread and source checks. `StatementError` has one case for a statement DuckDB could not run, with DuckDB's message in the report (D11). Milestone 8 adds two cases to `PreparationError`: `MissingChange` and `InvalidChange`.
- `Identifier` (`sql.rs`) quotes a table or column name. Milestones 6 and 8 use it.
- `describe`, `count` and `pipeline_sql` belong to milestone 5 and return `StatementError`. In `engine` they return `PreparationError`, which milestone 6 defines.
- `check_metadata` requires `_op`, `_key` and `_seq`, on entity tables and on link tables (D1). In `engine` it requires `_op` and `_key`, on entity tables only.
- A sink step writes no table. `PreparedSink.table` names the table the step received, which carries the three columns.

## Ids and properties (milestone 7)

Used by Prepare.

```rust
pub fn derive_entity_id(web_id: WebId, namespace: &str, entity_type: &VersionedUrl, source_id: &str) -> EntityId;
pub fn derive_link_id(web_id: WebId, namespace: &str, link_type: &VersionedUrl, left: LinkEndpoint<'_>, right: LinkEndpoint<'_>) -> EntityId;

pub struct LinkEndpoint<'a> { pub entity_type: &'a VersionedUrl, pub source_id: &'a str }
pub struct SinkColumns(..);                                   // FromIterator over column names
impl<'a> SinkRow<'a> {
    pub const fn new(columns: &'a SinkColumns, values: &'a [Value]) -> Self;
    pub fn text(&self, column: &ColumnName) -> Option<String>;
    pub fn resolve(&self, properties: &Properties, unit_maps: &BTreeMap<UnitMapName, UnitMap>) -> ResolvedProperties;
}
pub struct ResolvedProperties { pub properties: PropertyObjectWithMetadata, pub failures: Vec<ConversionFailure> }
pub struct ConversionFailure { pub property: VersionedUrl, pub value: Option<String>, pub reason: FailureReason }
pub enum FailureReason { Coercion(Coercion), MeasureAmount, MeasureUnit, Unsupported(UnsupportedValue) }
```

- **Origin:** all of it exists in `engine` with these signatures (`entity_id.rs`, `graph/mod.rs`, `graph/property/mod.rs`). `derive_link_id` is the id rule inside `LinkUpsert::new`, as a function of its own. It returns the id of the link only. The ids of its two ends come from `derive_entity_id`.

## Graph requests and client (milestone 9)

Used by Send.

```rust
// stage/send/request.rs: the body for a row, as the bytes that are sent
pub(super) fn create(row: &SyncRow, provenance: &ProvidedEntityEditionProvenance) -> Result<Box<RawValue>, Report<RequestError>>;
pub(super) fn patch(row: &SyncRow, provenance: &ProvidedEntityEditionProvenance) -> Result<Box<RawValue>, Report<RequestError>>;
pub(super) fn archive(row: &SyncRow, provenance: &ProvidedEntityEditionProvenance) -> Result<Box<RawValue>, Report<RequestError>>;
pub fn integration_provenance(source: SourceProvenance) -> ProvidedEntityEditionProvenance;

// stage/send/client.rs
pub struct GraphClient { .. }
impl GraphClient {
    pub fn new(graph_url: &Url, service_secret: Pin<Box<Secret<str>>>) -> Result<Self, Report<GraphError>>;
    pub(super) async fn create_bulk(&self, actor: ActorEntityUuid, bodies: &[&RawValue]) -> Answer;
    pub(super) async fn patch_bulk(&self, actor: ActorEntityUuid, bodies: &[&RawValue]) -> Answer;
    pub(super) async fn create(&self, actor: ActorEntityUuid, body: &RawValue) -> Answer;
    pub(super) async fn patch(&self, actor: ActorEntityUuid, body: &RawValue) -> Answer;
}

pub(super) enum Answer {
    Applied,
    Unavailable,                               // no answer, a timeout, 429, 502, 503, 504
    Refused { status: u16, message: Box<str> },   // every other answer; the message is cut to 1,024 characters
}
```

- **Origin:** the three bodies are `CreateEntity`, `PatchEntity` and `ArchiveEntity` of `engine/graph/plan/request.rs`. `GraphClient::new` and `integration_provenance` exist in `engine` with these signatures. The bulk routes follow labs `create_batch_once`. `Answer` is the list of cases in `../plan.md`, step 3, "Send".
- An archive is sent with `patch` or `patch_bulk`. The Graph has no route of its own for it.
- `RequestError` names the entity whose body could not be built. Send treats it as a permanent failure.
- The client does not interpret a refusal. It returns the status and the message, and Send decides what a status means for the request it sent: a 409 after a create is "exists", a 404 after a patch is "not found". On a create the Graph also answers 404, for an entity type it does not know, and that is an ordinary refusal. Every refusal therefore has a status and a message to record.
- A body is built before the batches are cut, because a batch is limited by its size in bytes.
