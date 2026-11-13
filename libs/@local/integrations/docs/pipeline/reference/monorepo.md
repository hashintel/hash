# Monorepo inventory for the integration pipeline

This file lists the code that exists today for the pipeline described in `libs/@local/integrations/docs/pipeline/00-overview.md`. Nothing was compiled or run. Every signature in Part A is copied from the source. A function body is replaced by `;`, some doc comments and `#[display]` attributes are shortened or left out, and a short enum or signature may be written on one line. Names, types, fields, variants and visibility are unchanged.

## Where each part was read

| Label | Location | Used for |
| --- | --- | --- |
| `main` | Export of `origin/main` at `c47a17eed3` | `definition/`, `engine/` except `sources` and `storage`, `apps/hash-integrations`, `tests/integrations/graph` |
| `checkout` | the monorepo checkout, branch `pe/be-1137-add-state-version-and-work-manifest-records`. Its history contains the BE-933 commits (`Store captures as artifacts bound to their run` and later). | `engine/src/storage`, `engine/src/sources`, `engine/src/sql.rs`, `engine/src/lib.rs` exports |
| `BE-1132` | `origin/asa/be-1132-orchestration-run-interface` at `da9fb175a8` | `libs/@local/integrations/orchestration/src` |
| `BE-1136` | `pe/be-1136-add-the-integration-service-with-submit-status` at `b053dd6578` | `apps/hash-integrations/src/service` |

Paths in Part A are relative to `libs/@local/integrations/` unless they start with `apps/` or `tests/`. A reference such as `engine/src/capture.rs:39` is a file and a line.

Differences between `main` and the checkout inside the two crates (`diff -rq`):

- `definition/src/step.rs`: `main` derives `Display` on `Coercion`. The checkout does not. `main` is newer here.
- `engine/src/graph/` exists only on `main`. `engine/src/storage/` exists only in the checkout.
- `engine/src/sources/{mod.rs,fingerprint.rs,postgres.rs,tests.rs}`, `engine/src/sql.rs` and `engine/src/lib.rs` differ. Everything else under `engine/src` and all of `engine/tests` is identical.

## Findings that differ from the overview

1. **Commit.** The overview names `origin/main` `eafbcce2b7`. This inventory read `c47a17eed3`.
2. **No trait exists for object storage, the source reader or the Graph client.** The overview's trait table lists the first two as existing. `ArtifactStorage` (`engine/src/storage/artifact/mod.rs:36`) is a struct that holds an `Arc<dyn object_store::ObjectStore>` and has two constructors, `local` and `s3`. `SourceReader` (`engine/src/sources/mod.rs:179`) is a struct whose `capture_sources` matches on `SourceKind`. `GraphClient` (`engine/src/graph/client/mod.rs:64`) is a struct. The only trait in the engine is `SecretStore` (`engine/src/sources/secrets/mod.rs:50`).
3. **The planner sets no load time.** `Planner::new` takes a `ProvidedEntityEditionProvenance` and copies it into every create, patch and archive request (`engine/src/graph/plan/mod.rs:263`, `engine/src/graph/plan/request.rs:204-246`). `loadedAt` is present only when the caller puts `loaded_at` into the `SourceProvenance` it passes to `integration_provenance` (`engine/src/graph/mod.rs:165`). The lines the overview cites (`engine/src/graph/property/mod.rs:241-247`) build the property metadata with only `data_type_id` set. They show that property metadata carries no provenance. They do not write a load time.
4. **The storage layout in code differs from the proposed layout.** The integration directory is `tenants/{web}/integrations/{sha256 hex of "{web}:{connector}"}`. Capture bindings are at `{root}/captures/{run}/{source}.{fingerprint}.json`. Files are at `{root}/artifacts/sha256/{xx}/{sha256}.{ext}`. There is no `runs/{run}/` directory and no marker per stage.
5. **The binding API is crate-private.** `ArtifactStorage::bind`, `ArtifactStorage::bound`, `Bound`, `ArtifactNamespace::capture` and the constructor of `ArtifactKey` are `pub(crate)` or private. Code outside the engine crate cannot write or read a marker. `publish` takes a local file path. No method stores bytes, lists keys or deletes.
6. **`Payload` cannot be rebuilt from stored text.** `Payload` (`engine/src/graph/plan/mod.rs:47`) has a private field, no public constructor and no `Deserialize`. `GraphClient::send` takes `&PlannedWrite`. A send stage that reads `plan/writes.parquet` cannot build a `PlannedWrite` with the current API. This affects P6 and P9.
7. **The planner reads DuckDB values.** `SinkRow` wraps `&[duckdb::types::Value]` (`engine/src/graph/property/mod.rs:58`). No code reads a Parquet file into those values. P9 (the planner reads `changes/{sink}.parquet`) needs either a load into DuckDB followed by `Workspace::query`, or a new reader.
8. **`RunInput` on BE-1136 has `invocation.links_only`.** It has no namespace and no operation field (`apps/hash-integrations/src/service/run_input.rs:8-21`). The overview says the monorepo has no `links_only` runs. The definition crate has none. The service branch carries the flag.
9. **A sink and a link pipeline can have the same name.** Step IDs are unique across all entity and link steps (`IssueKind::DuplicateStep`). Link IDs are unique among link pipelines (`IssueKind::DuplicateLink`). The two sets are checked separately (`definition/src/definition/check.rs:86-90` and `:189-198`). A file layout `diff/changes/{sink}.parquet` that uses both kinds of ID needs a prefix per kind.
10. **Output tables have random names.** Every SQL step, definition checkpoint and sink creates a table named `_step/{UUID v4}` (`engine/src/workspace/connection/pipeline.rs:240`). A link pipeline without steps returns the table of its input checkpoint. A table is found only through the `PreparedPipeline`, `PreparedSink` or `PreparedLink` value that `Workspace` returns.
11. **Run ID types differ.** `CaptureRun::id` is a `Uuid` (`engine/src/sources/mod.rs:90`). `RunId` of the run interface is a checked string (`orchestration/src/name.rs:130`). BE-1136 creates it from a UUID v5 rendered as text.
12. **The run interface has two failure kinds.** `FailureKind` is `Retryable` or `Permanent` (`orchestration/src/event.rs:50`). The overview wants a third kind, rejected, for the send stage. It does not exist.

The overview's other statements about existing code were confirmed: links get no `_content_hash`; `derive_entity_id` is called only from `engine/src/graph/mod.rs`; a patch has one `add` per property; the client sends single requests and classifies no status for retry; `SourceCapture` records no capture time; `bind` is the only conditional write.

## Part A: API digest

### A1. Definition crate (`definition/`, read from `main`)

Crate name: `hash-integrations-definition`. Public exports: `definition/src/lib.rs:37-57`.

#### `definition/src/definition/mod.rs`

Purpose: the checked model of one integration definition and its accessors.

```rust
// definition/src/definition/mod.rs:22-31
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DefinitionParts {
    pub connector: ConnectorId,
    pub variables: Variables,
    pub sources: BTreeMap<SourceName, Source>,
    pub unit_maps: BTreeMap<UnitMapName, UnitMap>,
    /// Entity pipelines in declaration order.
    pub entity_pipelines: Vec<EntityPipeline>,
    pub link_pipelines: Vec<LinkPipeline>,
}

// definition/src/definition/mod.rs:37-45
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Definition {
    connector: ConnectorId,
    variables: Variables,
    sources: BTreeMap<SourceName, Source>,
    unit_maps: BTreeMap<UnitMapName, UnitMap>,
    entity_pipelines: Vec<EntityPipeline>,
    link_pipelines: Vec<LinkPipeline>,
}

impl Definition {
    // :53
    pub fn new(parts: DefinitionParts) -> Result<Self, Report<[DefinitionIssue]>>;
    // :86
    pub const fn connector(&self) -> &ConnectorId;
    // :92  Returns the values of `vars`, which SQL reads as `$NAME` parameters.
    pub const fn variables(&self) -> &Variables;
    // :97
    pub const fn sources(&self) -> &BTreeMap<SourceName, Source>;
    // :102
    pub const fn unit_maps(&self) -> &BTreeMap<UnitMapName, UnitMap>;
    // :109  Returns the entity pipelines in the order they run: each after its
    //       dependencies, and otherwise in declaration order.
    pub fn entity_pipelines(&self) -> &[EntityPipeline];
    // :114
    pub fn link_pipelines(&self) -> &[LinkPipeline];
}

// definition/src/yaml/mod.rs:200
impl Definition {
    pub fn from_yaml(text: &str) -> Result<Self, Report<ParseError>>;
}

// definition/src/yaml/mod.rs:148-164
pub enum ParseError {
    Syntax { location: Option<SourceLocation>, reason: SyntaxError },
    Invalid,
}

// definition/src/yaml/mod.rs:227
impl DefinitionIssue {
    pub fn in_report(report: &Report<ParseError>) -> impl Iterator<Item = &Self>;
}
```

`Definition` does not implement `Serialize` or `Deserialize`. The only stored form is the YAML text, which `from_yaml` parses. `from_yaml` replaces `${NAME}` placeholders with `vars` outside SQL and keeps SQL as written (`definition/src/yaml/mod.rs:178-180`).

`Definition::new` checks, among other things: every pipeline's source is declared, each source has at most one pipeline, step IDs are unique, link IDs are unique, each definition checkpoint has exactly one producer and is produced by another pipeline than the one that reads it, and the dependencies have no cycle (`definition/src/definition/check.rs`, issue kinds at `definition/src/issue.rs:128-203`).

#### `definition/src/pipeline.rs` and `definition/src/link.rs`

Purpose: the entity pipeline and the link pipeline of a definition.

```rust
// definition/src/pipeline.rs:11-19
/// A pipeline is named by its source, so each source has at most one pipeline.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EntityPipeline {
    pub source: SourceName,
    /// Pipelines, named by their sources, that must run before this one.
    pub depends_on: Vec<SourceName>,
    /// Checkpoints that SQL steps read under their aliases.
    pub inputs: BTreeMap<InputAlias, CheckpointName>,
    pub steps: Vec<Step>,
}

// definition/src/link.rs:20-21
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LinkInputs(BTreeMap<InputAlias, CheckpointName>);

// definition/src/link.rs:23, :36
impl TryFrom<BTreeMap<InputAlias, CheckpointName>> for LinkInputs { type Error = EmptyLinkInputs; }
impl LinkInputs {
    pub fn iter(&self) -> btree_map::Iter<'_, InputAlias, CheckpointName>;
}

// definition/src/link.rs:51-58
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LinkInput {
    /// The rows of one checkpoint, which the first step reads as `input`.
    Checkpoint(CheckpointName),
    /// Checkpoints that the first step reads under their aliases. With more than one, a step
    /// must combine them into one table.
    Inputs(LinkInputs),
}

// definition/src/link.rs:61-65
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LinkStep {
    pub id: StepId,
    pub query: SqlQuery,
}

// definition/src/link.rs:68-72
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LinkEndpoint {
    pub entity_type: VersionedUrl,
    pub column: ColumnName,
}

// definition/src/link.rs:77-86
/// Link pipelines run after every entity pipeline, so both ends exist when links are written.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LinkPipeline {
    pub id: LinkId,
    pub input: LinkInput,
    pub steps: Vec<LinkStep>,
    pub from: LinkEndpoint,
    pub to: LinkEndpoint,
    pub link_type: VersionedUrl,
    pub properties: Properties,
}
```

#### `definition/src/step.rs`

Purpose: the steps of an entity pipeline, the sink, and how a property is read from a row.

```rust
// definition/src/step.rs:18-42
#[derive(Debug, Copy, Clone, PartialEq, Eq, derive_more::Display)]
#[repr(u8)]
pub enum Coercion { Date, Time, Boolean, Number, Integer, Year, Trim }

// :46
impl Coercion { pub const ALL: [Self; mem::variant_count::<Self>()]; }

// definition/src/step.rs:62-80
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Accessor {
    /// The value of a column, unchanged.
    Column(ColumnName),
    /// The value of a column, converted by a [`Coercion`].
    Coerce {
        column: ColumnName,
        coercion: Coercion,
    },
    /// A quantity whose data type depends on its unit.
    Measure {
        amount: ColumnName,
        unit: ColumnName,
        unit_map: UnitMapName,
    },
}

// :85
impl Accessor { pub const fn unit_map(&self) -> Option<&UnitMapName>; }

// definition/src/step.rs:104-105
/// How each property of an entity or link is read from a row, keyed by property type.
/// Each property type appears in only one version.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Properties(BTreeMap<VersionedUrl, Accessor>);

// :107, :128, :133
impl TryFrom<BTreeMap<VersionedUrl, Accessor>> for Properties { type Error = ConflictingPropertyVersions; }
impl Properties {
    pub fn iter(&self) -> btree_map::Iter<'_, VersionedUrl, Accessor>;
}
impl<'properties> IntoIterator for &'properties Properties { /* (&VersionedUrl, &Accessor) */ }

// definition/src/step.rs:143-149
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EntitySink {
    pub entity_type: VersionedUrl,
    /// The column whose value identifies the entity across runs.
    pub entity_id: ColumnName,
    pub properties: Properties,
}

// definition/src/step.rs:152-160
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Action {
    /// Replaces the table with the result of an SQL query that reads it as `input`.
    Sql(SqlQuery),
    /// Saves the table under a name that other pipelines can read.
    Checkpoint(CheckpointName),
    /// Writes the table to the graph.
    Sink(EntitySink),
}

// definition/src/step.rs:165-169
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BranchStep {
    pub id: StepId,
    pub action: Action,
}

// definition/src/step.rs:185-186, :198, :213
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Branches(Box<[Box<[BranchStep]>]>);
impl Branches {
    pub fn new(branches: impl IntoIterator<Item = Vec<BranchStep>>) -> Result<Self, InvalidBranches>;
    pub fn iter(&self) -> impl ExactSizeIterator<Item = &[BranchStep]>;
}

// definition/src/step.rs:219-225
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StepKind {
    Action(Action),
    /// Runs each branch on its own copy of the table. The pipeline continues with the table as
    /// it was before the branch.
    Branch(Branches),
}

// definition/src/step.rs:228-232
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Step {
    pub id: StepId,
    pub kind: StepKind,
}
```

`Properties` iterates in `VersionedUrl` order (a `BTreeMap`). The content hash uses this order.

#### `definition/src/source/mod.rs` and `definition/src/source/remote.rs`

Purpose: where an entity pipeline reads its rows from.

```rust
// definition/src/source/mod.rs:19-21, :23
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::AsRef)]
#[as_ref(forward)]
pub struct SqlQuery(Box<str>);
impl TryFrom<String> for SqlQuery { type Error = EmptySqlQuery; }

// definition/src/source/mod.rs:44-45, :57, :74
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PrimaryKey(Box<[ColumnName]>);
impl PrimaryKey {
    pub fn new(columns: impl IntoIterator<Item = ColumnName>) -> Result<Self, InvalidPrimaryKey>;
    pub const fn columns(&self) -> &[ColumnName];
}

// definition/src/source/mod.rs:83-95
/// A run archives the entities that a complete source returned in an earlier run but not in this
/// one. Entities that a partial source omits are kept.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[repr(u8)]
pub enum Coverage {
    /// The source returns only some of its entities.
    Partial,
    /// The source returns all of its entities.
    ///
    /// When it returns no rows at all while entities exist from earlier runs, the run treats it
    /// as partial, because an empty result is more likely a fault than a deletion.
    Complete,
    /// The source returns all of its entities, and no rows means that every entity was removed.
    CompleteOrEmpty,
}

// :99
impl Coverage { pub const ALL: [Self; mem::variant_count::<Self>()]; }

// definition/src/source/mod.rs:115-139
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SourceKind {
    /// Rows from an SQL query.
    Sql {
        query: SqlQuery,
        primary_key: PrimaryKey,
    },
    /// Rows from a Parquet file under the configured local storage root.
    Local {
        key: Box<str>,
        primary_key: PrimaryKey,
    },
    /// Rows from a PostgreSQL or Redshift table.
    Postgres {
        source: PostgresSource,
        primary_key: PrimaryKey,
    },
    /// Rows from a paginated REST endpoint.
    Rest {
        endpoint: RestSource,
        primary_key: PrimaryKey,
    },
    /// Rows of a checkpoint that another pipeline in the same definition produces.
    Checkpoint { checkpoint: CheckpointName },
}

// definition/src/source/mod.rs:142-146
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Source {
    pub kind: SourceKind,
    pub coverage: Coverage,
}

impl Source {
    // :150  `None` for `SourceKind::Checkpoint`.
    pub const fn primary_key(&self) -> Option<&PrimaryKey>;
    // :175  Returns the checkpoint this source reads, if it reads one.
    pub const fn checkpoint(&self) -> Option<&CheckpointName>;
}

// definition/src/source/remote.rs:10-14
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SecretReference {
    pub secret_entity_uuid: Uuid,
}

// definition/src/source/remote.rs:28-36
pub struct PostgresSource {
    pub connection: Url,
    pub schema: Box<str>,
    pub table: Box<str>,
    pub credentials: SecretReference,
}

// definition/src/source/remote.rs:127-135, :139
pub enum RestAuth {
    Header { name: String, secret_entity_uuid: Uuid },
    Bearer { secret_entity_uuid: Uuid },
}
impl RestAuth { pub const fn reference(&self) -> SecretReference; }

// definition/src/source/remote.rs:154-157
pub enum Pagination {
    NextLink { field: String },
    Offset,
}

// definition/src/source/remote.rs:162-176
pub struct RestSource {
    pub url: String,
    pub params: BTreeMap<String, String>,
    pub auth: Option<RestAuth>,
    pub results_field: Option<String>,
    pub pagination: Option<Pagination>,
    pub page_size: NonZeroU64,
    pub max_pages: Option<NonZeroU64>,
    pub rate_limit_ms: u64,
}
```

The definition has no field for a changed-rows mode, a cursor or a watermark. `Coverage` is the only field that describes completeness. In the engine, `coverage` is read only by `fingerprint` (`engine/src/sources/fingerprint.rs:58-66`).

#### `definition/src/unit_map.rs` and `definition/src/variables.rs`

```rust
// definition/src/unit_map.rs:13-17
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UnitMap {
    units: BTreeMap<UnitCode, VersionedUrl>,
    fallback: Option<VersionedUrl>,
}
impl UnitMap {
    // :26
    pub fn new(units: BTreeMap<UnitCode, VersionedUrl>, fallback: Option<VersionedUrl>) -> Result<Self, EmptyUnitMap>;
    // :37
    pub const fn units(&self) -> &BTreeMap<UnitCode, VersionedUrl>;
    // :43
    pub const fn fallback(&self) -> Option<&VersionedUrl>;
}

// definition/src/variables.rs:17-18, :20, :41
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Variables(BTreeMap<VariableName, Box<str>>);
impl TryFrom<BTreeMap<VariableName, Box<str>>> for Variables { type Error = ConflictingVariables; }
impl Variables { pub fn get(&self, name: &str) -> Option<&str>; }
```

#### `definition/src/name.rs`

Purpose: checked string types. Each one is a `Box<str>` newtype that derives `Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Display, AsRef` and implements `FromStr<Err = InvalidName>`. None implements `Serialize` or `Deserialize`.

| Type | Line | Rule |
| --- | --- | --- |
| `ConnectorId` | `name.rs:97` | `[a-z0-9][a-z0-9_-]*`, at most 64 bytes. "Identifies an integration within its web." |
| `SourceName` | `name.rs:112` | Same rule. |
| `StepId` | `name.rs:127` | Same rule. "Step IDs are unique across a definition." |
| `LinkId` | `name.rs:142` | Same rule. "Link IDs are unique across a definition." |
| `UnitMapName` | `name.rs:157` | Same rule. |
| `CheckpointName` | `name.rs:174` | One or more names separated by `/`, at most 255 bytes, each segment at most 64 bytes. |
| `InputAlias` | `name.rs:200` | `[a-z_][a-z0-9_]*`, at most 64 bytes, `input` is reserved. |
| `VariableName` | `name.rs:232` | ASCII letter or `_`, then letters, digits and `_`, at most 64 bytes. `matches` compares without regard to ASCII case (`name.rs:244`). |
| `ColumnName` | `name.rs:276` | Any non-empty text of at most 255 bytes. |
| `UnitCode` | `name.rs:292` | Any non-empty text of at most 64 bytes. |

```rust
// definition/src/name.rs:14-36
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum InvalidName {
    Empty,
    TooLong { length: usize, maximum: usize },
    InvalidCharacters,
    InvalidSegment,
    NotSqlIdentifier,
    InvalidVariableName,
    Reserved { name: &'static str },
}
```

#### How a sink and a link pipeline are identified

- **Sink.** A sink has no type of its own for its identity. It is an `Action::Sink(EntitySink)` inside a `Step` or a `BranchStep`, and the `StepId` of that step identifies it. The engine carries it as `PreparedSink::step` (`engine/src/pipeline/mod.rs:76`). `StepId` is unique across all entity steps, branch steps and link steps of a definition (`definition/src/definition/check.rs:86-90`, test `duplicate_step`). A pipeline can have several sinks.
- **Entity pipeline.** It has no ID. Its `source: SourceName` names it.
- **Link pipeline.** `LinkPipeline::id: LinkId` identifies it. `LinkId` is unique among link pipelines (`check.rs:189-198`). A `LinkId` can have the same text as a `StepId`, because the two are checked in separate sets.
- **Name for a file path.** `StepId`, `LinkId` and `SourceName` all match `[a-z0-9][a-z0-9_-]*`, so each is safe as one path component (`definition/src/name.rs:51-56`).

### A2. Engine workspace (`engine/src/workspace`, `engine/src/pipeline`, read from `main`; identical in the checkout)

Crate name: `hash-integrations-engine`. Public exports: `engine/src/lib.rs:30-53` on `main`.

#### `engine/src/pipeline/mod.rs`

Purpose: the types that a staging or pipeline request returns.

```rust
// engine/src/pipeline/mod.rs:8-16
#[derive(Debug, Default, Clone)]
pub struct TableAssertions {
    pub min_rows: Option<u64>,
    pub max_rows: Option<u64>,
    /// Columns whose values must be neither null nor blank.
    pub not_null: Vec<ColumnName>,
    /// Column combinations that must identify at most one row.
    pub unique: Vec<PrimaryKey>,
}

// engine/src/pipeline/mod.rs:19-34
#[derive(Debug, derive_more::Display)]
pub enum AssertionFailure {
    RowCount { actual: u64, min: Option<u64>, max: Option<u64> },
    NotNull { column: ColumnName, rows: u64 },
    Unique { columns: PrimaryKey, groups: u64 },
}

// engine/src/pipeline/mod.rs:46-71
#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum PreparationError {
    #[display("the pipeline statement failed")]
    Statement,
    #[display("pipeline preparation was cancelled")]
    Cancelled,
    #[display("source column `{column}` is reserved for staging metadata")]
    ReservedColumn { column: Box<str> },
    #[display("table has no column `{column}`")]
    MissingColumn { column: Box<str> },
    #[display("table `{table}` must retain non-null VARCHAR `_op` and `_key` columns")]
    Metadata { table: Box<str> },
    #[display(/* "source table failed its assertions: ..." */)]
    Assertions { failures: Vec<AssertionFailure> },
    #[display("checkpoint `{checkpoint}` has not been materialized")]
    MissingCheckpoint { checkpoint: CheckpointName },
    #[display("pipeline step `{step}` failed")]
    Step { step: StepId },
    #[display("the workspace thread stopped before pipeline preparation finished")]
    Stopped,
    #[display("a link pipeline with multiple inputs needs an SQL step")]
    LinkInputs,
}

// engine/src/pipeline/mod.rs:73-80
/// The table and property mapping to be consumed by an entity sink.
#[derive(Debug)]
pub struct PreparedSink {
    pub step: StepId,
    /// A table containing staging metadata and `_content_hash`.
    pub table: Box<str>,
    pub sink: EntitySink,
}

// engine/src/pipeline/mod.rs:82-88
/// The tables produced by a pipeline, with sinks in execution order.
#[derive(Debug)]
pub struct PreparedPipeline {
    pub table: Box<str>,
    pub checkpoints: BTreeMap<CheckpointName, Box<str>>,
    pub sinks: Vec<PreparedSink>,
}

// engine/src/pipeline/mod.rs:103-108
/// A link pipeline's output table and the mapping to be consumed by its sink.
#[derive(Debug)]
pub struct PreparedLink {
    pub table: Box<str>,
    pub pipeline: LinkPipeline,
}
```

Crate-visible request types, built by the `Workspace` methods: `PipelineRequest { pipeline: EntityPipeline, input: Box<str>, checkpoints: BTreeMap<CheckpointName, Box<str>> }` (`:90-94`), `StagingRequest { table: Box<str>, sql: Box<str>, primary_key: PrimaryKey, assertions: TableAssertions }` (`:96-101`), `LinkRequest { pipeline: LinkPipeline, checkpoints: BTreeMap<CheckpointName, Box<str>> }` (`:110-113`).

#### `engine/src/workspace/mod.rs`

Purpose: a DuckDB database file with one connection on a dedicated thread. Every method sends a command to that thread and waits for the reply.

```rust
// engine/src/workspace/mod.rs:39-62
#[derive(Debug)]
pub struct WorkspaceConfig {
    /// The number of requests that can wait while another runs. Defaults to 64.
    pub queue_capacity: NonZeroUsize,
    /// The values of the `$NAME` parameters that queries read.
    pub variables: Variables,
    pub memory_limit: Option<ByteSize>,
    pub temp_directory_limit: Option<ByteSize>,
    pub disk_limit: Option<ByteSize>,
    pub threads: Option<NonZeroUsize>,
}
impl Default for WorkspaceConfig { /* :64, queue_capacity 64, everything else empty */ }

// engine/src/workspace/mod.rs:140-144
#[derive(Debug)]
pub struct Workspace {
    commands: mpsc::Sender<(RequestId, Command)>,
    interrupt: Arc<Interrupt>,
}

impl Workspace {
    // :222  Opens the database at `path` with `config`, creating it if it does not exist.
    pub async fn open(path: PathBuf, config: WorkspaceConfig) -> Result<Self, Report<OpenError>>;

    // :156  Loads an immutable capture into `table`, preserving its schema even when it has no rows.
    pub async fn load_capture(
        &self,
        capture: SourceCapture,
        table: Box<str>,
    ) -> Result<(), Report<CaptureError>>;

    // :189  Captures the rows of `sql` in a new immutable Parquet file at `target`.
    pub async fn capture(
        &self,
        sql: Box<str>,
        target: PathBuf,
    ) -> Result<SourceCapture, Report<CaptureError>>;

    // :268  Materializes `sql` with staging metadata and checks its primary-key columns and assertions.
    pub async fn stage_table(
        &self,
        table: Box<str>,
        sql: Box<str>,
        primary_key: PrimaryKey,
        assertions: TableAssertions,
    ) -> Result<u64, Report<PreparationError>>;

    // :297  Executes a pipeline against a staged `input` and the tables of its input `checkpoints`.
    pub async fn prepare_pipeline(
        &self,
        pipeline: EntityPipeline,
        input: Box<str>,
        checkpoints: BTreeMap<CheckpointName, Box<str>>,
    ) -> Result<PreparedPipeline, Report<PreparationError>>;

    // :322  Combines checkpoint inputs and executes a link pipeline's SQL steps.
    pub async fn prepare_link_pipeline(
        &self,
        pipeline: LinkPipeline,
        checkpoints: BTreeMap<CheckpointName, Box<str>>,
    ) -> Result<PreparedLink, Report<PreparationError>>;

    // :369  Runs the query `sql` and returns all of its rows.
    pub async fn query(&self, sql: Box<str>) -> Result<Rows, Report<StatementError>>;

    // :404  Replaces the table named `table` with the rows of the query `sql`.
    pub async fn create_table(
        &self,
        table: Box<str>,
        sql: Box<str>,
    ) -> Result<(), Report<StatementError>>;

    // :436  Writes a copy of the database to `target` that DuckDB can open on its own.
    pub async fn snapshot(&self, target: PathBuf) -> Result<(), Report<SnapshotError>>;

    // :455  Checkpoints and closes the database after the requests already sent have run.
    pub async fn close(self) -> Result<(), Report<CloseError>>;
}
```

Facts a stage depends on:

- **SQL rules.** Every `sql` argument must be one `SELECT` statement. The only table functions allowed are `range`, `generate_series` and `unnest` (`engine/src/workspace/mod.rs:122-125`, check in `engine/src/workspace/select.rs:37`). A query cannot open a file, so a Parquet file enters the database only through `load_capture`, and leaves it only through `capture`.
- **`capture` writes any query to Parquet.** It streams the rows of `sql` to a temporary file beside `target` and publishes it without replacing an existing file (`engine/src/workspace/connection/capture.rs:37-89`, Snappy, row groups of 65,536 rows). It returns `CaptureError::Exists` if `target` exists. It is the only existing way to write a table to a Parquet file.
- **`query` returns every row in memory** as `Rows` (`engine/src/workspace/connection/mod.rs:260-306`). There is no streaming read.
- **One workspace per database file.** `open` takes a lock on `<database>.lock` and returns `OpenError::Locked` if another workspace holds it.
- **Cancel.** Dropping the future of a request cancels it. `PreparationError::Cancelled` and `CaptureError::Cancelled` report this.
- **`create_table` uses `CREATE OR REPLACE TABLE`** (`engine/src/workspace/connection/mod.rs:309-326`).
- **No method drops a table or lists tables.** A caller can list tables with `query` on `information_schema.tables`.

Error enums (`engine/src/workspace/error.rs`): `Setting` (`:12`), `DiskUsageError` (`:40`), `OpenError` (`:49`), `QueryErrorType` (`:73`), `DataErrorType` (`:128`), `StatementError` (`:175`), `SnapshotError` (`:244`), `CloseError` (`:259`). `ByteSize` is at `engine/src/byte_size.rs:6` with `pub const fn from_bytes(bytes: u64) -> Self` (`:10`).

#### `engine/src/workspace/rows.rs`

```rust
// engine/src/workspace/rows.rs:7-11
/// The rows a query returned.
#[derive(Debug)]
pub struct Rows {
    columns: Box<[Box<str>]>,
    rows: Vec<Box<[Value]>>,   // duckdb::types::Value
}

impl Rows {
    // :80  Returns the column names, in the order the query returned them.
    pub const fn columns(&self) -> &[Box<str>];
    // :85  Returns each row's values, in the order of `columns`.
    pub fn iter(&self) -> impl ExactSizeIterator<Item = &[Value]>;
}
```

`Rows::new` is `pub(super)`, so only the workspace builds a `Rows`. A query fails with `StatementError::UnsupportedType` when a column has a type the `duckdb` crate cannot read, such as `TIME_NS` (`rows.rs:23-76`).

#### `engine/src/workspace/connection/staging.rs`

Purpose: builds the staged source table and checks it. All functions are methods of the private `Connection` and are reached through `Workspace`.

```rust
// engine/src/workspace/connection/staging.rs:21
/// Canonicalizes a checked query so it can be embedded without comments or statement terminators.
pub(super) fn pipeline_sql(&self, sql: &str) -> Result<String, Report<PreparationError>>;

// :36
/// Returns column names and DuckDB types without materializing the query's rows.
pub(super) fn describe(&self, sql: &str) -> Result<Vec<(String, String)>, Report<PreparationError>>;

// :59
/// Reads a count from engine-generated SQL.
pub(super) fn pipeline_count(&self, sql: &str) -> Result<u64, Report<PreparationError>>;

// :69
/// Adds snapshot metadata to source rows and checks their declared constraints.
pub(super) fn stage_table(&self, request: &StagingRequest) -> Result<u64, Report<PreparationError>>;

// :117
fn check_assertions(&self, table: &str, assertions: &TableAssertions) -> Result<u64, Report<PreparationError>>;

// :173
/// Checks that transformations retain usable staging metadata.
pub(super) fn check_metadata(&self, table: &str) -> Result<(), Report<PreparationError>>;
```

`stage_table` does this (`staging.rs:69-114`):

1. It refuses a source column named `_op`, `_key` or `_content_hash` in any letter case (`PreparationError::ReservedColumn`).
2. It refuses a primary key column that the query does not return (`PreparationError::MissingColumn`).
3. It creates the table with this statement, where `{keys}` is `"COL" := "COL"` for each primary key column in declared order:

   ```sql
   SELECT 'snapshot' AS _op, to_json(struct_pack({keys}))::VARCHAR AS _key, source.* FROM ({sql}) AS source
   ```

4. It runs the assertions and returns the row count.

`_op` is always the text `snapshot`. `_key` is the JSON text of the primary key columns, for example `{"id":7}`.

#### `engine/src/workspace/connection/pipeline.rs`

Purpose: runs SQL steps, creates definition checkpoints, and adds `_content_hash` to sink tables.

```rust
// engine/src/workspace/connection/pipeline.rs:24
/// Binds input aliases as CTEs, leaving no shared views to clean up.
fn execute_pipeline_sql(
    &self,
    sql: &str,
    input: Option<&str>,
    inputs: &[(String, Box<str>)],
) -> Result<Box<str>, Report<PreparationError>>;

// :57
/// Resolves a link's checkpoints and runs its SQL without applying entity metadata constraints.
pub(super) fn prepare_link_pipeline(&self, request: &LinkRequest) -> Result<PreparedLink, Report<PreparationError>>;

// :105
/// Runs SQL, branches, and checkpoints, preparing immutable tables for entity sinks.
pub(super) fn prepare_pipeline(&self, request: &PipelineRequest) -> Result<PreparedPipeline, Report<PreparationError>>;

// :158, :169  (impl Execution<'_>)
fn action(&mut self, step: &StepId, action: &Action, input: &str) -> Result<Box<str>, Report<PreparationError>>;
fn execute_action(&mut self, step: &StepId, action: &Action, input: &str) -> Result<Box<str>, Report<PreparationError>>;

// :207
/// Adds the sink's content hash using the columns its property accessors read.
fn sink(&self, input: &str, sink: &EntitySink) -> Result<Box<str>, Report<PreparationError>>;

// :240
/// Generates a distinct table name so branches and repeated executions retain their outputs.
fn table_name() -> Box<str>;   // format!("_step/{}", Uuid::new_v4())

// :245
/// Hashes accessor inputs in property order, normalizing plain text column mappings.
fn hash_expression<'column>(
    columns: impl Iterator<Item = (&'column str, bool)>,
    schema: &[(String, String)],
) -> Result<String, Report<PreparationError>>;

// :276, :294
fn check_properties(properties: &Properties, schema: &[(String, String)]) -> Result<(), Report<PreparationError>>;
fn check_column(column: &str, schema: &[(String, String)]) -> Result<(), Report<PreparationError>>;
```

What each action does (`pipeline.rs:169-204`):

- **`Action::Sql`.** Creates a new table `_step/{uuid}` with `WITH "input" AS (SELECT * FROM "{current}"), "{alias}" AS (SELECT * FROM "{checkpoint table}"), ... SELECT * FROM ({sql}) AS output`. Then `check_metadata` requires that the new table still has `VARCHAR` columns `_op` and `_key` without NULL values. The new table becomes the current table.
- **`Action::Checkpoint`.** Creates a new table `_step/{uuid}` as `SELECT * FROM "{current}"` and records it under the `CheckpointName` in `PreparedPipeline::checkpoints`. The current table stays the same.
- **`Action::Sink`.** Checks that the `entity_id` column and every column an accessor reads exist. Creates a new table `_step/{uuid}` as `SELECT source.*, {hash} AS _content_hash FROM "{current}" AS source` and pushes a `PreparedSink`. The current table stays the same.
- **`StepKind::Branch`.** Runs each branch from the current table. The current table of the pipeline stays the same (`pipeline.rs:142-149`).

The content hash (`pipeline.rs:213-224` and `:245-273`):

- The columns are taken in `Properties` order. `Accessor::Column(c)` gives `c` with normalizing. `Accessor::Coerce { column, .. }` gives `column` without normalizing. `Accessor::Measure { amount, unit, .. }` gives `amount` and `unit` without normalizing.
- A normalized column of DuckDB type `VARCHAR` enters as `nullif(trim("c"), '')`. Every other column enters as `"c"`.
- The expression is `md5(struct_pack(p0 := ..., p1 := ...)::VARCHAR)`. A sink without properties gets `md5('')`.
- The hash does not cover the entity type, the property type URLs, the `entity_id` column, the coercion, the unit map name or the unit map's content.

A link pipeline (`pipeline.rs:57-101`):

- `LinkInput::Checkpoint(c)`: the current table is the table of `c`.
- `LinkInput::Inputs`: each alias is bound to its checkpoint table. With exactly one input, that table is also the current table. With more than one, there is no current table until a step runs.
- Each `LinkStep` runs through `execute_pipeline_sql`. `check_metadata` is not called, so a link table needs no `_op` or `_key`.
- The result table must have the `from.column`, the `to.column` and every column a property accessor reads.
- No `_content_hash` is added. With no steps, `PreparedLink::table` is the checkpoint's own table.

#### Tables that exist after a run

The engine has no function that runs a whole definition. `SourceReader::stage_sources` stages the sources. The caller then calls `prepare_pipeline` once per entity pipeline in `Definition::entity_pipelines()` order, merges each `PreparedPipeline::checkpoints` into one map, and calls `prepare_link_pipeline` once per link pipeline. The tests `definition_aviation_tables` (`engine/tests/pipeline.rs:502`) and `plan` (`tests/integrations/graph/aviation/mod.rs:63`) do this by hand. Neither handles a source of kind `SourceKind::Checkpoint`; for such a pipeline the caller has to pass the checkpoint's table as `input`.

| Table | Name | Created by | Columns |
| --- | --- | --- | --- |
| Raw capture, one per captured source | `_capture/{source}` | `SourceReader::stage_sources` through `load_capture` (`engine/src/sources/mod.rs:309`) | The Parquet columns |
| Staged source, one per captured source | `_source/{source}` | `SourceReader::stage_sources` through `stage_table` (`sources/mod.rs:310`) | `_op`, `_key`, then the source columns |
| Output of an SQL step | `_step/{uuid v4}` | `execute_pipeline_sql` | What the query selects. Entity steps must keep `_op` and `_key`. |
| Definition checkpoint | `_step/{uuid v4}`, found through `PreparedPipeline::checkpoints[name]` | `Action::Checkpoint` | A copy of the current table |
| Sink table | `_step/{uuid v4}`, found through `PreparedSink::table`; `PreparedSink::step` is the sink's `StepId` | `Execution::sink` | The current table's columns plus `_content_hash` |
| Link table | `_step/{uuid v4}`, or the input checkpoint's table when the link has no steps; found through `PreparedLink::table` | `prepare_link_pipeline` | What the last step selects. No `_content_hash`. |

`PreparedPipeline::table` is the pipeline's last current table. Table names differ on every run, so a name cannot be stored in a checkpoint and used later.

#### `engine/src/workspace/connection/capture.rs`

Purpose: writes a query to a Parquet file and loads a Parquet file into a table.

```rust
// engine/src/workspace/connection/capture.rs:37
pub(super) fn capture(&self, sql: &str, target: &Path) -> Result<SourceCapture, Report<CaptureError>>;

// :135
pub(super) fn load_capture(&self, capture: &SourceCapture, table: &str) -> Result<(), Report<CaptureError>>;
```

`load_capture` reads the file with the `parquet` crate, creates the table with `CREATE OR REPLACE TABLE "{table}" AS SELECT * FROM _capture_schema()`, appends the record batches, and commits in one transaction (`capture.rs:159-190`). A failed load keeps the earlier table.

### A3. Engine capture and sources (`engine/src/capture.rs` from `main`, `engine/src/sources` from the checkout)

#### `engine/src/capture.rs` (identical on `main` and in the checkout)

Purpose: a published Parquet file on local disk and how it is published without replacing a file.

```rust
// engine/src/capture.rs:12-32
#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum CaptureError {
    #[display("the source capture query failed")]
    Query,
    #[display("the source capture could not be read")]
    Read,
    #[display("the source capture could not be written")]
    Write,
    #[display("the capture at `{}` was published but its directory could not be synced", path.display())]
    SyncDirectory { path: PathBuf },
    #[display("the workspace disk-limit check failed")]
    DiskUsage,
    #[display("a capture already exists at `{}`", path.display())]
    Exists { path: PathBuf },
    #[display("`{}` is one of the workspace's own files", path.display())]
    WorkspaceFile { path: PathBuf },
    #[display("source capture was cancelled")]
    Cancelled,
    #[display("the workspace thread stopped before source capture finished")]
    Stopped,
}

// engine/src/capture.rs:38-43
#[derive(Debug, Clone)]
pub struct SourceCapture {
    path: PathBuf,
    rows: u64,
    bytes: u64,
}

impl SourceCapture {
    // :51  Reads the Parquet footer at `path` to recover a published capture's row and byte counts.
    pub fn open(path: PathBuf) -> Result<Self, Report<CaptureError>>;
    // :72  Copies a local Parquet `source` to a new capture at `target`.
    pub fn copy_from(source: &Path, target: &Path) -> Result<Self, Report<CaptureError>>;
    // :82
    pub fn path(&self) -> &Path;
    // :88
    pub const fn rows(&self) -> u64;
    // :94
    pub const fn bytes(&self) -> u64;
    // :105  Fails with `CaptureError::Exists` if `target` exists. Returns a temporary file beside it.
    pub(crate) fn stage(target: &Path) -> Result<NamedTempFile, Report<CaptureError>>;
    // :114  Syncs the file, moves it to `target` without replacing a file, syncs the directory.
    pub(crate) fn publish(partial: NamedTempFile, target: &Path, rows: u64) -> Result<Self, Report<CaptureError>>;
}
```

`SourceCapture` holds a path, a row count and a byte size. It holds no capture time, no digest and no schema. `SourceCapture::open` accepts any Parquet file, so it also describes a file that is not a source capture.

#### `engine/src/sources/mod.rs` (checkout)

Purpose: captures every live source of a definition for one run, stores each capture as an artifact, binds it to the run, and stages the captures into a workspace.

```rust
// engine/src/sources/mod.rs:34-78
#[derive(Debug, Clone, Copy, derive_more::Display, derive_more::Error)]
pub enum SourceError {
    Configuration,
    Read,
    Write,
    Load,
    Query,
    Secret,
    SecretRequest { service: SecretService },
    SecretStatus { service: SecretService, status: u16 },
    SecretResponse { service: SecretService },
    SecretEntityCount { count: usize },
    SecretEntity,
    SecretExpiry,
    SecretExpired,
    SecretPath,
    SecretValue,
    Postgres,
    Destination,
    Request,
    Status { status: u16 },
    Response,
    Pagination,
}

// engine/src/sources/mod.rs:81-86
/// Resource limits for the isolated database used by network connectors.
#[derive(Debug, Default, Clone, Copy)]
pub struct CaptureLimits {
    pub memory_limit: Option<ByteSize>,
    pub temp_directory_limit: Option<ByteSize>,
    pub threads: Option<NonZero<usize>>,
}

// engine/src/sources/mod.rs:89-94
/// The owner and stable identity shared by retries and restores of a run.
#[derive(Debug, Clone, Copy)]
pub struct CaptureRun {
    pub web: Uuid,
    pub actor: Uuid,
    pub id: Uuid,
}

// engine/src/sources/mod.rs:97-101
/// Local source files and durable captures, kept apart.
#[derive(Debug)]
pub struct CaptureStore {
    local: PathBuf,
    captures: ArtifactStorage,
}

impl CaptureStore {
    // :111  Opens a local source root and creates the local capture directory if needed.
    pub fn new(local: &Path, captures: ArtifactStorage) -> Result<Self, Report<SourceError>>;
    // :126  private
    fn local_file(&self, key: &str) -> Result<PathBuf, Report<SourceError>>;
    // :146  private. Downloads the capture bound at `key` into `staging`, if there is one.
    async fn restore(&self, key: &ArtifactKey, staging: &Path) -> Result<Option<SourceCapture>, Report<SourceError>>;
}

// engine/src/sources/mod.rs:171-175
/// The captures of one run's sources, staged in a directory that is deleted when they are dropped.
#[derive(Debug)]
pub struct SourceCaptures {
    captures: BTreeMap<SourceName, SourceCapture>,
    _staging: TempDir,
}

// engine/src/sources/mod.rs:178-182
/// Captures all live sources of a run before its pipelines execute.
#[derive(Debug)]
pub struct SourceReader {
    store: CaptureStore,
    limits: CaptureLimits,
}

impl SourceReader {
    // :186
    pub const fn new(store: CaptureStore, limits: CaptureLimits) -> Self;

    // :203  Captures every live source or reuses the capture already bound to this run and source.
    pub async fn capture_sources(
        &self,
        workspace: &Workspace,
        definition: &Definition,
        run: CaptureRun,
        resolver: &impl SecretStore,
    ) -> Result<SourceCaptures, Report<SourceError>>;

    // :295  Loads captures and adds the snapshot metadata consumed by pipeline preparation.
    //       Returns a source-to-staging-table mapping for `Workspace::prepare_pipeline`.
    pub async fn stage_sources(
        workspace: &Workspace,
        definition: &Definition,
        captures: &SourceCaptures,
    ) -> Result<BTreeMap<SourceName, Box<str>>, Report<SourceError>>;
}
```

`SourceCaptures` has no public method. A caller cannot list its captures, read a row count, or get the `ArtifactRef` of a capture. It can only pass the value to `stage_sources`. The files are deleted when the value is dropped.

`CaptureLimits` limits the DuckDB database that the Postgres connector uses. It holds no row limit and no byte limit for a capture.

On `main` the same functions exist with a local directory in place of object storage: `CaptureStore::new(local: &Path, captures: &Path)` and `capture_sources(...) -> Result<BTreeMap<SourceName, SourceCapture>, Report<SourceError>>` (`main`, `engine/src/sources/mod.rs:111` and `:225`). `main` does not export `SourceCaptures`.

How `capture_sources` works (`engine/src/sources/mod.rs:210-284`):

1. `ArtifactNamespace::new(run.web, definition.connector())` gives the integration's storage root.
2. `ArtifactStorage::stage()` creates one staging directory for the call.
3. For each source in `definition.sources()` (a `BTreeMap`, so in name order), a source of kind `Checkpoint` is skipped.
4. The binding key is `namespace.capture(run.id, name, &fingerprint(source))`.
5. If a reference is bound at that key, the artifact is downloaded into the staging directory, checked against its digest, and used. No source is read and no secret is resolved.
6. Otherwise the source is read into a new file `{staging}/{uuid}.parquet`:
   - `Sql`: `workspace.capture(query, target)`.
   - `Local`: `SourceCapture::copy_from` from the local root.
   - `Postgres`: `resolver.read(run.web, run.actor, source.credentials)`, then `postgres::capture(source, &secret, target, self.limits)` (`engine/src/sources/postgres.rs:31`).
   - `Rest`: the secret if `auth` is set, then `rest::capture(endpoint, primary_key, secret.as_deref(), target)` (`engine/src/sources/rest.rs:86`).
7. `storage.publish(&namespace.artifacts(), capture.path(), Format::Parquet)` uploads the file under its SHA-256.
8. `storage.bind(&key, &artifact)` writes the binding only if the key is empty. `Bound::Created` keeps the local capture. `Bound::Exists` downloads the capture that another attempt bound first and uses that one.

How a capture is bound to a run: the binding is a JSON object at `{root}/captures/{run}/{source}.{fingerprint}.json` that holds one `ArtifactRef`. The key contains the run ID, the source name and the fingerprint of the source's definition. A changed source definition gives a new key, so the source is captured again in the same run. Calling `capture_sources` with the run ID and the definition of an earlier run returns that run's captures without reading a source, as long as every binding exists.

`stage_sources` (`sources/mod.rs:295-327`) loads each capture into `_capture/{name}` and stages `SELECT * FROM "_capture/{name}"` as `_source/{name}` with the source's primary key and `TableAssertions::default()`. It skips sources without a primary key, which are the `Checkpoint` sources. It returns `SourceName -> "_source/{name}"`.

#### `engine/src/sources/fingerprint.rs` (checkout)

```rust
// engine/src/sources/fingerprint.rs:9
const ENCODING: &str = "hash-integrations-engine/source-fingerprint/v1";

// engine/src/sources/fingerprint.rs:20
/// Identifies the definition of `source` as 64 lowercase hexadecimal digits.
pub(super) fn fingerprint(source: &Source) -> String;
```

The fingerprint is the SHA-256 over the `ENCODING` text and every field of the `Source`, including `coverage`. Each text is written with its length and each enum variant by name. It is `pub(super)`, so only `sources` can call it.

#### `engine/src/sources/secrets/mod.rs` (checkout)

```rust
// engine/src/sources/secrets/mod.rs:36
/// Pinned secret bytes whose storage is zeroed when dropped.
pub type SecretValue = Pin<Box<Secret<[u8]>>>;

// engine/src/sources/secrets/mod.rs:50-57
/// Resolves a User Secret using the run owner's permissions and web.
pub trait SecretStore: Send + Sync {
    fn read(
        &self,
        web_id: Uuid,
        actor_id: Uuid,
        reference: SecretReference,
    ) -> impl Future<Output = Result<SecretValue, Report<SourceError>>> + Send;
}

// engine/src/sources/secrets/mod.rs:60-67
#[derive(Debug)]
pub struct GraphVaultConfig {
    pub graph_url: String,
    pub graph_service_secret: Pin<Box<Secret<str>>>,
    pub vault_url: String,
    pub vault_mount: String,
    pub vault_token: Pin<Box<Secret<str>>>,
}

// engine/src/sources/secrets/mod.rs:70, :155, :293
pub struct GraphVaultSecretStore { /* private */ }
impl GraphVaultSecretStore {
    pub fn new(config: GraphVaultConfig) -> Result<Self, Report<SourceError>>;
}
impl SecretStore for GraphVaultSecretStore { /* reads the User Secret entity from the Graph, then the value from Vault */ }
```

`SecretStore` is the only trait in the engine with a production implementation and a test implementation (`NoSecrets`, `engine/src/sources/tests.rs:86`).

### A4. Engine storage (`engine/src/storage`, checkout only)

Purpose: stores files under their SHA-256 in object storage and binds a reference to a key with a write that succeeds only if the key is empty.

#### `engine/src/storage/mod.rs`

```rust
// engine/src/storage/mod.rs:7-12
pub(crate) use self::artifact::Bound;
pub use self::{
    artifact::{ArtifactRef, ArtifactRefV1, ArtifactStorage, Format},
    bucket::S3Bucket,
    namespace::ArtifactNamespace,
};

// engine/src/storage/mod.rs:15-23
/// Reports why an artifact could not be read or stored.
#[derive(Debug, Clone, Copy, derive_more::Display, derive_more::Error)]
pub enum ArtifactError {
    #[display("the artifact could not be read")]
    Read,
    #[display("the artifact could not be written")]
    Write,
    #[display("the artifact does not match its reference")]
    Mismatch,
}

// engine/src/storage/mod.rs:29-30
/// Where an artifact is stored, relative to the storage root.
///
/// Keys are built only by [`ArtifactNamespace`], which is the one place that knows the storage
/// layout.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display)]
pub struct ArtifactKey(Box<str>);
```

`ArtifactKey` has a private field and no public constructor. `ArtifactError` has three variants and does not say whether a failure is temporary.

#### `engine/src/storage/namespace.rs`

```rust
// engine/src/storage/namespace.rs:15-18
/// Where the artifacts of one integration are stored:
/// `tenants/{web}/integrations/{sha256("{web}:{connector}")}`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArtifactNamespace {
    root: Box<str>,
}

impl ArtifactNamespace {
    // :22
    pub fn new(web: Uuid, connector: &ConnectorId) -> Self;

    // :33  The key the capture of `source` in the run `run` is bound to, named after the
    //      `fingerprint` of the source's definition so that a changed definition is captured again.
    pub(crate) fn capture(&self, run: Uuid, source: &SourceName, fingerprint: &str) -> ArtifactKey;

    // :41  The prefix artifacts are published under.
    pub fn artifacts(&self) -> ArtifactKey;
}
```

#### `engine/src/storage/bucket.rs`

```rust
// engine/src/storage/bucket.rs:5-14
/// An S3 bucket and the credentials to reach it.
#[derive(Debug)]
pub struct S3Bucket {
    /// The bucket and prefix artifacts are stored under, as `s3://bucket/prefix`.
    pub uri: Box<str>,
    pub region: Box<str>,
    /// An S3-compatible endpoint such as MinIO, addressed with path-style URLs.
    pub endpoint: Option<Box<str>>,
    pub use_ssl: bool,
    pub key_id: Box<str>,
    pub secret: SecretValue,
}
```

#### `engine/src/storage/artifact/reference.rs`

```rust
// engine/src/storage/artifact/reference.rs:10-17
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Format {
    Parquet,
    DuckDb,
    Json,
    Binary,
}
// :20  extensions: "parquet", "duckdb", "json", "bin"
impl Format { pub(super) const fn extension(self) -> &'static str; }

// engine/src/storage/artifact/reference.rs:35-39
/// Stored as `{"version":"v1","value":{…}}`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "version", content = "value", rename_all = "lowercase")]
pub enum ArtifactRef {
    V1(ArtifactRefV1),
}

// engine/src/storage/artifact/reference.rs:44-52
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ArtifactRefV1 {
    key: Box<str>,
    #[serde(with = "hex::serde")]
    sha256: [u8; 32],
    size: u64,
    format: Format,
}

impl ArtifactRef {
    // :57
    pub(super) fn new(prefix: &ArtifactKey, sha256: Sha256Digest, size: u64, format: Format) -> Self;
    // :80  Where the artifact is stored, relative to the storage root.
    pub fn key(&self) -> &str;
    // :86
    pub const fn sha256(&self) -> [u8; 32];
    // :92
    pub const fn size(&self) -> u64;
    // :97
    pub const fn format(&self) -> Format;
    // :102
    pub(super) fn matches(&self, sha256: Sha256Digest, size: u64) -> bool;
    // :109  Whether the key is the content-addressed key of the digest and format.
    pub(super) fn is_addressed(&self) -> bool;
    // :120
    pub(super) fn location(&self) -> Location;
}

// engine/src/storage/artifact/reference.rs:128
/// The end of an artifact's key: `sha256/{xx}/{sha256}.{extension}`.
fn address(sha256: &[u8; 32], format: Format) -> String;
```

`ArtifactRef` is `Serialize` and `Deserialize`, so it can be the output of a run-interface step. Its JSON form is `{"version":"v1","value":{"key":"...","sha256":"<64 hex>","size":123,"format":"parquet"}}`.

#### `engine/src/storage/artifact/mod.rs`

```rust
// engine/src/storage/artifact/mod.rs:26, :28
pub(in crate::storage) const CHUNK_SIZE: usize = 8 * 1024 * 1024;
const UPLOAD_CONCURRENCY: usize = 4;

// engine/src/storage/artifact/mod.rs:35-42
/// Stores artifacts: files written once and addressed by their content.
#[derive(Debug)]
pub struct ArtifactStorage {
    store: Arc<dyn ObjectStore>,
    /// The directory that run staging directories are created in.
    staging: PathBuf,
    /// The local directory artifacts are kept or staged in.
    directory: PathBuf,
}

impl ArtifactStorage {
    // :50  Keeps artifacts in the local directory `root`. Staging is `{root}/.staging`.
    pub fn local(root: &Path) -> Result<Self, Report<ArtifactError>>;

    // :66  Keeps artifacts in `bucket`, materialized into run directories under `staging`.
    pub fn s3(bucket: &S3Bucket, staging: &Path) -> Result<Self, Report<ArtifactError>>;

    // :80  Creates a staging directory for one run, deleted when it is dropped.
    pub(crate) fn stage(&self) -> Result<TempDir, Report<ArtifactError>>;

    // :85  Returns the canonical path of the local directory artifacts are kept or staged in.
    pub(crate) fn directory(&self) -> Result<PathBuf, Report<ArtifactError>>;

    // :95  Returns a new path in `staging` for a writer to publish a file of `format` to.
    pub(crate) fn staging_file(staging: &Path, format: Format) -> PathBuf;

    // :110  Stores the file at `path` under `prefix` and returns its reference.
    //       If the artifact is already stored, nothing is uploaded.
    pub async fn publish(
        &self,
        prefix: &ArtifactKey,
        path: &Path,
        format: Format,
    ) -> Result<ArtifactRef, Report<ArtifactError>>;

    // :142  Downloads the artifact to a file in `staging`, checks it against its reference, and
    //       returns the file's path.
    pub async fn materialize(
        &self,
        artifact: &ArtifactRef,
        staging: &Path,
    ) -> Result<PathBuf, Report<ArtifactError>>;

    // :193  private
    async fn upload(&self, path: &Path, artifact: &ArtifactRef) -> Result<(), Report<ArtifactError>>;
}

// :245  private
fn digest(path: &Path) -> Result<(Sha256Digest, u64), Report<ArtifactError>>;
```

#### `engine/src/storage/artifact/binding.rs`

```rust
// engine/src/storage/artifact/binding.rs:9
const MAX_BINDING_BYTES: usize = 64 * 1024;

// engine/src/storage/artifact/binding.rs:12-19
/// The outcome of binding a reference to a key.
#[must_use]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Bound {
    /// The reference is now bound to the key.
    Created,
    /// Another reference was already bound to the key and was kept.
    Exists,
}

impl ArtifactStorage {
    // :28  Stores `artifact` at `key` unless a reference is already bound there.
    pub(crate) async fn bind(
        &self,
        key: &ArtifactKey,
        artifact: &ArtifactRef,
    ) -> Result<Bound, Report<ArtifactError>>;

    // :50  Returns the reference bound at `key`, if there is one.
    pub(crate) async fn bound(
        &self,
        key: &ArtifactKey,
    ) -> Result<Option<ArtifactRef>, Report<ArtifactError>>;
}
```

`engine/src/storage/artifact/local.rs:10` has `pub(super) fn open(root: &Path) -> Result<LocalFileSystem, Report<ArtifactError>>`. `engine/src/storage/artifact/s3.rs:12` has `pub(super) fn open(bucket: &S3Bucket) -> Result<Arc<dyn ObjectStore>, Report<ArtifactError>>`. The S3 store is wrapped in a `PrefixStore` when the bucket URI has a prefix.

#### Key layout

All keys are relative to the storage root, which is the local directory or `s3://bucket/prefix`.

```text
tenants/{web}/integrations/{integration}/                    ArtifactNamespace::new, namespace.rs:22
  captures/{run}/{source}.{fingerprint}.json                 ArtifactNamespace::capture, namespace.rs:33 (a binding)
  artifacts/sha256/{xx}/{sha256}.{ext}                       ArtifactNamespace::artifacts + address, reference.rs:128
```

- `{web}` and `{run}` are UUIDs in hyphenated lowercase form.
- `{integration}` is the lowercase hex SHA-256 of the text `{web}:{connector}`.
- `{fingerprint}` is the 64 hex digits from `fingerprint(source)`.
- `{xx}` is the first byte of the digest as two hex digits. `{ext}` is `parquet`, `duckdb`, `json` or `bin`.
- A binding is one `ArtifactRef` as JSON, at most 64 KiB when read.
- Artifacts are shared by all runs of one integration. Two runs that capture the same bytes store one object.

#### Which operations are conditional

| Operation | Conditional | Detail |
| --- | --- | --- |
| `bind` | Yes | One `put_opts` with `PutMode::Create`. `Ok` gives `Bound::Created`. `object_store::Error::AlreadyExists` gives `Bound::Exists`. Works on S3 and on the local file system. |
| `publish` | No | `head` on the content key. Same size: return the reference. Other size: `ArtifactError::Mismatch`. Not found: multipart upload. Two writers of one key write the same bytes. The upload is checked against the digest before `finish`. |
| `materialize` | No (read) | Returns a file that already exists at `{staging}/{key}`. Otherwise downloads, checks digest and size, and moves the file into place without replacing. `ArtifactError::Mismatch` if the key is not the content key of the digest. |
| `bound` | No (read) | `None` when the key does not exist. |
| Overwrite if unchanged | Not found | No method writes with `PutMode::Update` or an ETag. |
| List, delete | Not found | No method lists keys or deletes an object. |

### A5. Engine `entity_id.rs` (`main`; identical in the checkout)

Purpose: derives the entity ID of a source record.

```rust
// engine/src/entity_id.rs:8
const NAMESPACE: Uuid = Uuid::from_u128(0xD6E2_C7A1_F84B_4E3A_9C0D_5B7F_1E3A_2D4C);

// engine/src/entity_id.rs:10-24
/// Derives a live entity ID from the integration namespace, entity type, and source record ID.
#[must_use]
pub fn derive_entity_id(
    web_id: WebId,
    namespace: &str,
    entity_type: &VersionedUrl,
    source_id: &str,
) -> EntityId {
    let name = format!("{namespace}::{entity_type}::{source_id}");
    EntityId {
        web_id,
        entity_uuid: EntityUuid::new(Uuid::new_v5(&NAMESPACE, name.as_bytes())),
        draft_id: None,
    }
}
```

- The web ID is part of the returned `EntityId` and is not part of the hashed text.
- `EntityId` displays as `{web}~{uuid}`.
- For a link, the callers pass the link type as `entity_type` and `"{left type}::{left source ID}::{right type}::{right source ID}"` as `source_id` (`engine/src/graph/mod.rs:100-105`).
- The only callers in `engine/src` are `EntityUpsert::new` and `LinkUpsert::new` (`engine/src/graph/mod.rs:58` and `:105-112`).
- The source ID text comes from `SinkRow::text` (`engine/src/graph/property/mod.rs:116`), which uses `value::text` (`engine/src/graph/property/value.rs:154`). The text is not trimmed. A decimal renders without trailing zeros (`8030.00` gives `8030`), a float in its shortest form, a timestamp as RFC 3339, a date as `YYYY-MM-DD`. A NULL value, blank text, a list, a struct, a map, a blob and an interval give no source ID.

### A6. Engine graph (`engine/src/graph`, `main` only)

Nothing in `engine/src` outside `graph/` calls this module. Its only caller is the test `tests/integrations/graph/aviation/mod.rs`.

#### `engine/src/graph/mod.rs`

Purpose: the writes an integration makes to the Graph, as typed operations.

```rust
// engine/src/graph/mod.rs:38-44
/// Creates or updates an entity with an ID derived from its source record.
#[derive(Debug, Clone, PartialEq)]
pub struct EntityUpsert {
    pub entity_id: EntityId,
    pub entity_type: VersionedUrl,
    pub properties: PropertyObjectWithMetadata,
    pub provenance: ProvidedEntityEditionProvenance,
}

impl EntityUpsert {
    // :49
    pub fn new(
        web_id: WebId,
        namespace: &str,
        entity_type: VersionedUrl,
        source_id: &str,
        properties: PropertyObjectWithMetadata,
        provenance: ProvidedEntityEditionProvenance,
    ) -> Self;
}

// engine/src/graph/mod.rs:67-71
#[derive(Debug, Clone, Copy)]
pub struct LinkEndpoint<'a> {
    pub entity_type: &'a VersionedUrl,
    pub source_id: &'a str,
}

// engine/src/graph/mod.rs:74-83
#[derive(Debug, Clone, PartialEq)]
pub struct LinkUpsert {
    pub link_id: EntityId,
    pub link_type: VersionedUrl,
    pub left_entity_id: EntityId,
    pub right_entity_id: EntityId,
    /// The link's own properties, or `None` to leave an existing link's properties unchanged.
    pub properties: Option<PropertyObjectWithMetadata>,
    pub provenance: ProvidedEntityEditionProvenance,
}

impl LinkUpsert {
    // :91
    pub fn new(
        web_id: WebId,
        namespace: &str,
        link_type: VersionedUrl,
        left: LinkEndpoint<'_>,
        right: LinkEndpoint<'_>,
        properties: Option<PropertyObjectWithMetadata>,
        provenance: ProvidedEntityEditionProvenance,
    ) -> Self;
}

// engine/src/graph/mod.rs:121-125
/// Archives an entity or a link entity the integration wrote earlier.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Archive {
    pub entity_id: EntityId,
    pub provenance: ProvidedEntityEditionProvenance,
}

// engine/src/graph/mod.rs:128-134
#[derive(Debug, Clone, PartialEq)]
pub enum GraphOperation {
    UpsertEntity(EntityUpsert),
    UpsertLink(LinkUpsert),
    ArchiveLink(Archive),
    ArchiveEntity(Archive),
}

// :138
impl GraphOperation { pub const fn kind(&self) -> OperationKind; }

// engine/src/graph/mod.rs:152-158
/// The kind of a [`GraphOperation`], ordered as operations must be applied.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, derive_more::Display)]
pub enum OperationKind {
    UpsertEntity,
    UpsertLink,
    ArchiveLink,
    ArchiveEntity,
}

// engine/src/graph/mod.rs:165
/// `source` is recorded as an integration, whatever kind it states.
#[must_use]
pub fn integration_provenance(source: SourceProvenance) -> ProvidedEntityEditionProvenance;
```

`integration_provenance` returns `sources: [source with ty = Integration]`, `actor_type: Machine`, `origin: Api`. `SourceProvenance::loaded_at` is the field that serializes as `loadedAt`. `EntityUpsert` and `Archive` have public fields, so a caller can build either from an entity ID it already has, without `derive_entity_id`. `LinkUpsert` also has public fields.

#### `engine/src/graph/plan/mod.rs`

Purpose: turns rows into `PlannedWrite` values, checks for two writes to one entity, and sorts the writes.

```rust
// engine/src/graph/plan/mod.rs:35-40
/// The requests that write one operation, encoded as delivery sends them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlannedWrite {
    pub kind: OperationKind,
    pub entity_id: EntityId,
    pub payload: Payload,
}

// engine/src/graph/plan/mod.rs:46-47
/// Only planning creates a payload, so it always holds the JSON a write was planned with.
#[derive(Debug, Clone)]
pub struct Payload(Box<RawValue>);

// :51, :56
impl Payload { pub fn as_str(&self) -> &str; }
impl AsRef<[u8]> for Payload {}

// :70
impl TryFrom<GraphOperation> for PlannedWrite { type Error = UnencodableRequest; }

// engine/src/graph/plan/mod.rs:89-94
#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("the requests for `{entity_id}` could not be encoded")]
pub struct UnencodableRequest {
    pub entity_id: EntityId,
    source: serde_json::Error,
}

// engine/src/graph/plan/mod.rs:97-101
#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display, derive_more::Error)]
#[display("`{entity_id}` is written more than once")]
pub struct DuplicateWrite {
    pub entity_id: EntityId,
}

// engine/src/graph/plan/mod.rs:107-124
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum PlanIssue {
    /// The row is left out, as it has no value to identify what it describes.
    #[display("row {row} of `{entity_type}` has no `{column}` to identify its record")]
    MissingSourceId {
        entity_type: VersionedUrl,
        row: usize,
        column: ColumnName,
    },
    /// The entity or link is written without one of its properties.
    #[display("`{entity_id}` of `{entity_type}` is written without a property")]
    Property {
        entity_type: VersionedUrl,
        entity_id: EntityId,
        #[error(source)]
        failure: ConversionFailure,
    },
}

// engine/src/graph/plan/mod.rs:128-132
#[derive(Debug, Default)]
pub struct GraphPlan {
    writes: Vec<PlannedWrite>,
    issues: Vec<PlanIssue>,
}

impl GraphPlan {
    // :140
    pub fn add(&mut self, operation: GraphOperation) -> Result<(), UnencodableRequest>;
    // :151  Sorts by OperationKind, then web UUID, then entity UUID.
    pub fn finish(mut self) -> Result<FinishedPlan, DuplicateWrite>;
}
// :233, :242
impl Extend<Self> for GraphPlan {}
impl FromIterator<Self> for GraphPlan {}

// engine/src/graph/plan/mod.rs:214-218
#[derive(Debug)]
pub struct FinishedPlan {
    writes: Vec<PlannedWrite>,
    issues: Vec<PlanIssue>,
}
impl FinishedPlan {
    // :222
    pub fn writes(&self) -> &[PlannedWrite];
    // :227
    pub fn issues(&self) -> &[PlanIssue];
}

// engine/src/graph/plan/mod.rs:251-257
/// Plans the writes of one run of an integration.
#[derive(Debug, Clone)]
pub struct Planner {
    web_id: WebId,
    namespace: Box<str>,
    provenance: ProvidedEntityEditionProvenance,
    unit_maps: BTreeMap<UnitMapName, UnitMap>,
}

impl Planner {
    // :263
    pub fn new(
        web_id: WebId,
        namespace: impl Into<Box<str>>,
        provenance: ProvidedEntityEditionProvenance,
        unit_maps: BTreeMap<UnitMapName, UnitMap>,
    ) -> Self;

    // :282  Plans an upsert of the entity each of `rows` describes in `sink`.
    pub fn plan_entities<'row>(
        &self,
        sink: &EntitySink,
        rows: impl IntoIterator<Item = SinkRow<'row>>,
    ) -> Result<GraphPlan, UnencodableRequest>;

    // :316  Plans an upsert of the link each of `rows` describes in `link`.
    pub fn plan_links<'row>(
        &self,
        link: &LinkPipeline,
        rows: impl IntoIterator<Item = SinkRow<'row>>,
    ) -> Result<GraphPlan, UnencodableRequest>;
}
```

What the planner takes as input:

- **Once per run** (`Planner::new`): the web ID, the namespace text, one edition provenance used for every write, and the definition's unit maps.
- **For an entity sink** (`plan_entities`): the `EntitySink` (entity type, `entity_id` column, `Properties`) and the rows of the sink's table as `SinkRow` values. A `SinkRow` is a `&SinkColumns` and a `&[duckdb::types::Value]` in the column order of the query. The planner reads the `entity_id` column as text, derives the entity ID from namespace, entity type and that text, resolves every property from the row, and adds one `GraphOperation::UpsertEntity`. It reads no other column. It does not read `_content_hash`, `_op` or `_key`.
- **For a link pipeline** (`plan_links`): the `LinkPipeline` (link type, `from` and `to` with entity type and column, `Properties`) and the rows of the link table as `SinkRow` values. The planner reads `from.column` and `to.column` as text, derives the link ID and both endpoint IDs, resolves the properties, and adds one `GraphOperation::UpsertLink`. A link whose resolved properties are empty is planned with `properties: None`.
- **Archives.** The planner has no method that plans an archive. A caller builds `GraphOperation::ArchiveEntity(Archive { .. })` or `ArchiveLink` and calls `GraphPlan::add`.
- **Rows it does not plan.** A row whose ID column is NULL, blank or has no text form gives `PlanIssue::MissingSourceId` with the row's position, and no write. For a link, the `from` column is checked first.
- **Properties it does not write.** A value that cannot be converted gives `PlanIssue::Property`, and the write is planned without that property.
- **Order and duplicates.** `finish` returns the first `DuplicateWrite` it finds and no plan. Otherwise it sorts by `(kind, web UUID, entity UUID)`.
- **Batches.** Not found. A `FinishedPlan` is a flat list of single writes.

#### `engine/src/graph/plan/request.rs`

Purpose: the JSON bodies of the Graph requests and the envelope they are saved in. Every type in this file is private or crate-visible.

```rust
// engine/src/graph/plan/request.rs:31
const DELIVERY_VERSION: u8 = 1;

// engine/src/graph/plan/request.rs:34-40
/// Everything delivery needs to write one operation, saved before anything is sent.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Delivery {
    version: u8,
    entity_id: EntityId,
    request: Request,
}

impl Delivery {
    // :43
    pub(super) const fn entity_id(&self) -> EntityId;
    // :49  JSON with every object's keys sorted.
    pub(super) fn encode(&self) -> Result<Payload, serde_json::Error>;
}
// :139
impl From<GraphOperation> for Delivery {}

// engine/src/graph/plan/request.rs:68-78
#[derive(Debug, Clone, Copy)]
pub(in crate::graph) enum SavedRequests<'payload> {
    /// Creates the entity, or patches it if it already exists.
    Upsert {
        create: &'payload RawValue,
        patch: &'payload RawValue,
    },
    Archive {
        archive: &'payload RawValue,
    },
}

// engine/src/graph/plan/request.rs:81-83
#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("the payload is not a delivery of version {DELIVERY_VERSION}")]
pub(in crate::graph) struct UnreadablePayload;

// engine/src/graph/plan/request.rs:115
impl Payload {
    /// The requests delivery sends for this write.
    pub(in crate::graph) fn requests(&self) -> Result<SavedRequests<'_>, UnreadablePayload>;
}

// engine/src/graph/plan/request.rs:184-201
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum Request {
    Upsert {
        create: CreateEntity,
        patch: PatchEntity,
        archive: ArchiveEntity,
    },
    Archive {
        archive: ArchiveEntity,
    },
}

// :204
impl Request {
    fn upsert(
        entity_id: EntityId,
        entity_type: VersionedUrl,
        properties: PropertyObjectWithMetadata,
        link_data: Option<Link>,
        provenance: ProvidedEntityEditionProvenance,
    ) -> Self;
}

// engine/src/graph/plan/request.rs:259-271
/// Creates an entity, as `CreateEntityParams` reads it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateEntity {
    web_id: WebId,
    entity_uuid: EntityUuid,
    entity_type_ids: [VersionedUrl; 1],
    properties: PropertyObjectWithMetadata,
    #[serde(skip_serializing_if = "Option::is_none")]
    link_data: Option<Link>,
    draft: bool,
    provenance: ProvidedEntityEditionProvenance,
    read_only: bool,
}

// engine/src/graph/plan/request.rs:275-285
/// Updates an existing entity and revives it if it was archived, as `PatchEntityParams` reads it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PatchEntity {
    entity_id: EntityId,
    entity_type_ids: [VersionedUrl; 1],
    /// Left out when empty, as the Graph rejects an empty property patch.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    properties: Vec<PropertyPatch>,
    archived: bool,
    provenance: ProvidedEntityEditionProvenance,
}

// engine/src/graph/plan/request.rs:288-295
/// A change to one property, as `PropertyPatchOperation` reads it.
#[derive(Debug, Serialize)]
#[serde(tag = "op", rename_all = "camelCase")]
enum PropertyPatch {
    Add {
        path: [BaseUrl; 1],
        property: PropertyWithMetadata,
    },
}

// engine/src/graph/plan/request.rs:298-304
/// Archives an entity, as `PatchEntityParams` reads it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ArchiveEntity {
    entity_id: EntityId,
    archived: bool,
    provenance: ProvidedEntityEditionProvenance,
}
```

The saved payload envelope, one JSON object per write with sorted keys:

```json
{
  "entityId": "{web}~{uuid}",
  "request": {
    "kind": "upsert",
    "create":  { "webId", "entityUuid", "entityTypeIds": [type], "properties": {"value": {...}}, "linkData"?, "draft": false, "provenance", "readOnly": true },
    "patch":   { "entityId", "entityTypeIds": [type], "properties"?: [{"op": "add", "path": [baseUrl], "property": {...}}], "archived": false, "provenance" },
    "archive": { "entityId", "archived": true, "provenance" }
  },
  "version": 1
}
```

An archive write has `"kind": "archive"` and only the `archive` request. `Payload::requests` refuses any other version and any other combination of fields.

Facts a stage depends on:

- **Patch shape.** `Request::upsert` builds one `PropertyPatch::Add` per property with a path of one base URL, in base URL order (`request.rs:212-221`). `PropertyPatch` has no other variant. A property that the row no longer has is not removed.
- **Empty patch.** When the row has no properties, the patch has no `properties` key (`request.rs:281`). The entity keeps its earlier properties.
- **Patch brings an entity back.** Every patch sets `archived: false` and sets `entityTypeIds` to the one type of the sink.
- **Link patch.** The patch body has no link data. A link's endpoints are sent only in the create body.
- **Create.** `draft: false` and `readOnly: true` are fixed (`request.rs:241-243`).
- **Each upsert payload holds three request bodies** with the same provenance. The archive body inside an upsert payload is not read by `Payload::requests` (`request.rs:122-127`).

#### `engine/src/graph/property/mod.rs`

Purpose: reads the properties of one row through the accessors of a sink or link.

```rust
// engine/src/graph/property/mod.rs:40-41, :44
/// The positions of a sink table's columns by name, built once for all of its rows.
/// Names are compared ignoring ASCII case, as DuckDB compares identifiers.
#[derive(Debug, Clone)]
pub struct SinkColumns(HashMap<Box<str>, usize>);
impl<S: AsRef<str>> FromIterator<S> for SinkColumns {}

// engine/src/graph/property/mod.rs:57-61
/// A row of a sink's table, read by column name.
#[derive(Debug, Clone, Copy)]
pub struct SinkRow<'a> {
    columns: &'a SinkColumns,
    values: &'a [Value],   // duckdb::types::Value
}

impl<'a> SinkRow<'a> {
    // :66  A row whose `values` are in the order `columns` were indexed in.
    pub const fn new(columns: &'a SinkColumns, values: &'a [Value]) -> Self;
}

impl SinkRow<'_> {
    // :74  Resolves each of `properties` from the row, looking measure units up in `unit_maps`.
    pub fn resolve(
        &self,
        properties: &Properties,
        unit_maps: &BTreeMap<UnitMapName, UnitMap>,
    ) -> ResolvedProperties;

    // :104  private. The value of `column`, or null if the row has no such column.
    fn get(&self, column: &ColumnName) -> &Value;

    // :116  The text of `column` as the source wrote it, or `None` if it is missing, blank or has
    //       no text form. The text is not trimmed, as it identifies a record across runs.
    pub(in crate::graph) fn text(&self, column: &ColumnName) -> Option<String>;

    // :121  private. The value of `column`, or `None` if it is missing, null or blank text.
    fn value(&self, column: &ColumnName) -> Option<&Value>;

    // :126  private
    fn read(
        &self,
        accessor: &Accessor,
        unit_maps: &BTreeMap<UnitMapName, UnitMap>,
    ) -> Result<Option<ResolvedValue>, Unconverted>;
}

// engine/src/graph/property/mod.rs:178-196
#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display, derive_more::From, derive_more::Error)]
pub enum FailureReason {
    Coercion(Coercion),
    MeasureAmount,
    MeasureUnit,
    Unsupported(UnsupportedValue),
}

// engine/src/graph/property/mod.rs:199-207
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
#[display("could not convert the value of `{property}`")]
pub struct ConversionFailure {
    pub property: VersionedUrl,
    /// The value as the row holds it, for reporting.
    pub value: Option<String>,
    #[error(source)]
    pub reason: FailureReason,
}

// engine/src/graph/property/mod.rs:210-216
#[derive(Debug, Clone, PartialEq)]
pub struct ResolvedProperties {
    /// The properties to write, keyed by base URL.
    pub properties: PropertyObjectWithMetadata,
    /// The properties left out because their values could not be converted.
    pub failures: Vec<ConversionFailure>,
}

// engine/src/graph/property/mod.rs:219-222  (private)
/// A property's value and the data type it is written with.
struct ResolvedValue {
    value: PropertyValue,
    data_type_id: Option<VersionedUrl>,
}
// :225, :234
impl From<PropertyValue> for ResolvedValue {}          // data_type_id: None
impl From<ResolvedValue> for PropertyWithMetadata {}   // ValueMetadata { data_type_id, ..default }

// :268  private
fn is_blank(value: &Value) -> bool;
```

How a property is read (`property/mod.rs:126-174`):

- `Accessor::Column`: a NULL or blank value gives no property. Otherwise the value is converted by `ColumnValue::try_from` and text is trimmed.
- `Accessor::Coerce`: a NULL or blank value gives no property. Otherwise `coerce::apply`.
- `Accessor::Measure`: a NULL or blank amount gives no property. The amount goes through `coerce::number`. The unit text is trimmed and looked up in the unit map, then the fallback. The result is a number with `data_type_id` set.
- Only a measure sets `data_type_id`. No property has provenance or confidence.
- A column that the row does not have reads as NULL.

#### `engine/src/graph/property/value.rs`

Purpose: converts a DuckDB value to a property value or to text.

```rust
// engine/src/graph/property/value.rs:15-31
#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum UnsupportedValue {
    Blob,
    Geometry,
    Interval,
    NonFiniteNumber,
    DateTimeOutOfRange,
    NonTextMapKey,
    Unknown,
}

// engine/src/graph/property/value.rs:37-38, :42, :53
#[derive(Debug, derive_more::Into)]
pub(super) struct ColumnValue(PropertyValue);
impl ColumnValue { pub(super) fn into_trimmed(self) -> PropertyValue; }
impl TryFrom<&Value> for ColumnValue { type Error = UnsupportedValue; }

// :108  The number a numeric row value holds, or `None` if it is not numeric or not finite.
pub(super) fn as_number(value: &Value) -> Option<Real>;

// :145  `number` if it is finite. A property's number is written as an `f64`, so this also rejects
//       numbers too large for one.
pub(super) fn finite(number: Real) -> Option<Real>;

// :154  Renders a row value as text for a conversion to read, or `None` if it is null or has no
//       text form.
pub(super) fn text(value: &Value) -> Option<String>;

// :212  Renders `time` as `HH:MM:SS`, with a fraction in its shortest form only if it has one.
pub(super) fn clock(time: Time) -> Option<String>;
```

`value::text` is `pub(super)`: only `graph::property` can call it. A step outside `graph` that needs the source ID text has to go through `SinkRow::text`, which is visible inside `crate::graph` only. The conversion depends on the DuckDB type of the column: `ColumnValue::try_from` maps integers, floats and decimals to `PropertyValue::Number`, dates, times and timestamps to ISO text, lists to arrays, structs and maps to objects.

#### `engine/src/graph/property/coerce.rs`

Purpose: the conversions a definition can ask for with `coerce`.

```rust
// engine/src/graph/property/coerce.rs:16
/// Converts a non-null `value` by `coercion`, or returns `None` if it cannot be converted.
pub(super) fn apply(coercion: Coercion, value: &Value) -> Option<PropertyValue>;

// :132
/// Reads a number, accepting a decimal comma when it follows the last dot, as in `1.234,56`.
pub(super) fn number(value: &Value) -> Option<Real>;
```

Private helpers: `date` (`:77`, ISO, `DD.MM.YYYY`, `DD/MM/YYYY`, `YYYYMMDD`, output `YYYY-MM-DD`), `time` (`:94`, output `HH:MM:SS[.fraction]±HH:MM`, UTC when no offset), `boolean` (`:119`, `X`, `TRUE`, `1`, `YES`, `Y` are true and everything else is false), `integer` (`:140`, rounds toward zero), `decimal_text` (`:148`), `parse_number` (`:160`). `Coercion::Year` parses a number. `Coercion::Trim` converts like a plain column and trims text.

#### `engine/src/graph/client/mod.rs`

Purpose: sends one planned write to the Graph's entity API over HTTP.

```rust
// engine/src/graph/client/mod.rs:32
const DIAGNOSTIC_LIMIT: usize = 1024;

// engine/src/graph/client/mod.rs:35-49
/// Why a write could not be sent to the Graph.
#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum GraphError {
    /// The Graph URL or service secret cannot be used.
    #[display("the Graph client is not configured correctly")]
    Configuration,
    /// The write's payload is not one planning produced.
    #[display("the write's payload cannot be read")]
    Payload,
    /// The request did not reach the Graph, or its response was not received.
    #[display("the request to the Graph failed")]
    Request,
    /// The Graph answered with a status that does not apply the write.
    #[display("the Graph rejected the request with status {status}")]
    Status { status: u16 },
}

// engine/src/graph/client/mod.rs:52-60
/// What the Graph did with a write.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Applied {
    Created,
    /// The entity existed, so it was patched instead.
    Patched,
    Archived,
    /// The entity to archive does not exist.
    Absent,
}

// engine/src/graph/client/mod.rs:63-68
#[derive(Debug)]
pub struct GraphClient {
    entities: Url,
    service_secret: Pin<Box<Secret<str>>>,
    client: Client,
}

impl GraphClient {
    // :77  A client for the Graph at `graph_url`, authenticating with `service_secret`.
    pub fn new(
        graph_url: &Url,
        service_secret: Pin<Box<Secret<str>>>,
    ) -> Result<Self, Report<GraphError>>;

    // :114  Sends `write` to the Graph, acting for `actor`.
    pub async fn send(
        &self,
        actor: ActorEntityUuid,
        write: &PlannedWrite,
    ) -> Result<Applied, Report<GraphError>>;

    // :142  private
    async fn request(
        &self,
        method: Method,
        actor: ActorEntityUuid,
        body: &RawValue,
    ) -> Result<Response, Report<GraphError>>;
}

// :168  private
async fn accepted(response: Response, applied: Applied) -> Result<Applied, Report<GraphError>>;
```

There is no method named `apply`. `send` is the only method that writes.

What `send` does (`client/mod.rs:119-139`):

- **Upsert.** `POST {graph_url}/entities` with the create body. Any status other than 409: 2xx gives `Applied::Created`, anything else gives `GraphError::Status`. On 409: `PATCH {graph_url}/entities` with the patch body; 2xx gives `Applied::Patched`, anything else gives `GraphError::Status`.
- **Archive.** `PATCH {graph_url}/entities` with the archive body. 404 gives `Applied::Absent`. 2xx gives `Applied::Archived`. Anything else gives `GraphError::Status`.
- **Headers.** `Authorization: {SERVICE_AUTH_SCHEME} {secret}`, the actor ID header `ACTOR_ID_HEADER`, `Content-Type: application/json`.
- **HTTP client.** 30 second timeout, no redirects, no proxy (`client/mod.rs:94-99`).
- **Errors.** A transport failure gives `GraphError::Request`. `GraphError::Status` carries the status code and has the first 1024 characters of the response body attached to the report. The client does not say whether an error is temporary.
- **Not found:** bulk create, bulk patch, any retry, any rate limit, any use of `CoordinationStore`, any request that reads from the Graph.

### A7. Run interface (`orchestration/src`, `BE-1132`)

Crate name: `hash-integrations-orchestration`. Exports: `orchestration/src/lib.rs:30-39`. The crate is not on `main` and not in the checkout.

#### `orchestration/src/run.rs`

Purpose: the function a run executes and the context it requests steps through.

```rust
// orchestration/src/run.rs:9-19
/// Why a run function stopped.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum RunError {
    /// The backend stopped the run at a step: a cancel, a failed step, a wait for a retry, or a
    /// step request that differs from the recorded one. The backend records the reason. The run
    /// function returns this error unchanged, with `?`.
    #[display("the backend stopped the run at a step")]
    Stopped,
    /// The run function failed on its own.
    #[display("the run function failed with `{code}`")]
    Failed { code: FailureCode },
}

// orchestration/src/run.rs:26-45
/// A run function must be deterministic: the same input requests the same steps, in the same
/// order, with the same names. Its side effects happen inside steps, and it builds its resources
/// inside the run, so any process can execute any run.
pub trait RunFunction: Send + Sync {
    /// The input of a run. It is plain data, recorded when the run starts.
    type Input: Serialize + DeserializeOwned + Send + 'static;

    /// The version a run is pinned to. A worker executes only runs started with its function's
    /// version.
    const VERSION: FunctionVersion;

    fn run(
        &self,
        context: &mut impl StepContext,
        input: Self::Input,
    ) -> impl Future<Output = Result<(), Report<RunError>>> + Send;
}

// orchestration/src/run.rs:48-75
/// Executes and records the steps of one run.
pub trait StepContext: Send {
    /// A recorded step returns its recorded output without calling `step`. A new step calls
    /// `step` and records its output. A step that fails with [`FailureKind::Retryable`] is called
    /// again by the run's [`RetryPolicy`], so `step` can be called more than once.
    fn run<T, F, Fut>(
        &mut self,
        name: StepName,
        step: F,
    ) -> impl Future<Output = Result<T, Report<RunError>>> + Send
    where
        T: Serialize + DeserializeOwned + Send,
        F: FnMut() -> Fut + Send,
        Fut: Future<Output = Result<T, Report<StepFailure>>> + Send;
}
```

#### `orchestration/src/name.rs`

```rust
// orchestration/src/name.rs:13-25
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum InvalidName {
    Empty,
    TooLong { length: usize, maximum: usize },
    InvalidCharacters,
    InvalidSegment,
}
```

Each of these is a `Box<str>` newtype with `FromStr<Err = InvalidName>`, `Display` and `AsRef` (macro `name_type!`, `name.rs:74-99`). None implements `Serialize`.

| Type | Line | Rule |
| --- | --- | --- |
| `StepName` | `name.rs:101-110` | One or more names separated by `/`, at most 255 bytes, each name `[a-z0-9][a-z0-9_-]*` in at most 64 bytes. Example in the doc comment: `capture`, `deliver/entities/17`. |
| `AdmissionKey` | `name.rs:112-118` | Same rule as `StepName`. "Identifies the runs that must not be active at the same time." |
| `FailureCode` | `name.rs:120-128` | One name, at most 64 bytes. Example: `graph-unavailable`. Stored with the run. Error messages go to logs. |
| `RunId` | `name.rs:130-136` | One name, at most 64 bytes, "such as a UUID in lowercase". The caller chooses it. |
| `BucketScope` | `name.rs:138-146` | Same rule as `StepName`. |

#### `orchestration/src/event.rs`

```rust
// orchestration/src/event.rs:24-25, :29, :34
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, derive_more::Display)]
pub struct FunctionVersion(u32);
impl FunctionVersion {
    pub const fn new(version: u32) -> Self;
    pub const fn get(self) -> u32;
}

// orchestration/src/event.rs:40-46
/// The request that starts a run. It is recorded before any of the run's events.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunStart {
    pub admission: AdmissionKey,
    pub version: FunctionVersion,
    pub policy: RetryPolicy,
    pub input: Payload,
}

// orchestration/src/event.rs:49-53
/// Whether a failed step can succeed when it is attempted again.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FailureKind {
    Retryable,
    Permanent,
}

// orchestration/src/event.rs:57-62
/// Why a step failed. A step returns it as the context of its error report, whose messages go to
/// logs.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
#[display("the step failed with `{code}`")]
pub struct StepFailure {
    pub kind: FailureKind,
    pub code: FailureCode,
}

// orchestration/src/event.rs:65-84
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display)]
pub enum RunFailure {
    Step { index: StepIndex, name: StepName, attempts: NonZero<u32>, code: FailureCode },
    NonDeterministic { index: StepIndex, recorded: StepName, requested: StepName },
    Function { code: FailureCode },
}

// orchestration/src/event.rs:87-106
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RunEvent {
    StepCompleted { index: StepIndex, name: StepName, output: Payload },
    StepFailed { index: StepIndex, name: StepName, failure: StepFailure, at: UtcDateTime },
    CancelRequested,
    Completed,
    Failed(RunFailure),
    Cancelled,
}
```

`StepIndex(u32)` is at `event.rs:8-9` with `new` and `get`.

#### `orchestration/src/policy.rs` and `orchestration/src/payload.rs`

```rust
// orchestration/src/policy.rs:9-15
/// The delay after the `n`th failure is `initial_delay * multiplier^(n - 1)`, capped at
/// `max_delay`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RetryPolicy {
    pub max_attempts: NonZero<u32>,
    pub initial_delay: Duration,
    pub max_delay: Duration,
    pub multiplier: NonZero<u16>,
}
// :23
impl RetryPolicy { pub fn delay(&self, failures: NonZero<u32>) -> Duration; }

// orchestration/src/payload.rs:8-14
#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum PayloadError {
    Encode,
    Decode { line: usize, column: usize },
}

// orchestration/src/payload.rs:23-25
/// A run's input or a step's output, encoded as JSON.
/// Payloads compare by their bytes, so a value must encode to the same bytes each time. Maps in a
/// payload are `BTreeMap`s, whose keys encode in sorted order.
#[derive(Clone, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Payload(Box<RawValue>);
impl Payload {
    // :31
    pub fn encode<T: Serialize>(value: &T) -> Result<Self, Report<PayloadError>>;
    // :43
    pub fn decode<T: DeserializeOwned>(&self) -> Result<T, Report<PayloadError>>;
}
```

This `Payload` is a different type from `engine::graph::Payload`. Both wrap `Box<RawValue>`.

#### `orchestration/src/runs.rs` and `orchestration/src/coordination.rs`

```rust
// orchestration/src/runs.rs:11-13
pub struct BackendError;

// orchestration/src/runs.rs:16-24
pub enum StartError {
    AlreadyActive { active: RunId },
    StartMismatch,
    Backend,
}

// orchestration/src/runs.rs:27-31
pub struct RunStatus {
    pub phase: RunPhase,          // Pending | Running | Completed | Failed(RunFailure) | Cancelled (state/mod.rs:36)
    pub steps_recorded: u32,
}

// orchestration/src/runs.rs:34-68
pub trait Runs: Send + Sync {
    fn start(&self, run: RunId, start: RunStart) -> impl Future<Output = Result<(), Report<StartError>>> + Send;
    fn status(&self, run: &RunId) -> impl Future<Output = Result<Option<RunStatus>, Report<BackendError>>> + Send;
    fn cancel(&self, run: &RunId) -> impl Future<Output = Result<(), Report<BackendError>>> + Send;
}

// orchestration/src/runs.rs:72-86
pub trait Worker: Send + Sync {
    fn work<F: RunFunction + 'static>(
        &self,
        function: Arc<F>,
        shutdown: CancellationToken,
    ) -> impl Future<Output = Result<(), Report<BackendError>>> + Send;
}

// orchestration/src/coordination.rs:16-19
pub struct TokenBucket {
    pub rate_per_second: NonZero<u32>,
    pub capacity: NonZero<u32>,
}

// orchestration/src/coordination.rs:22-40
pub trait CoordinationStore: Send + Sync {
    fn consume(
        &self,
        scope: &BucketScope,
        bucket: TokenBucket,
        ops: u32,
        now: UtcDateTime,
    ) -> impl Future<Output = Result<f64, Report<CoordinationError>>> + Send;
}
```

Facts a stage depends on:

- **The step output must be `Serialize + DeserializeOwned`.** It is recorded as JSON and compared by bytes. A checkpoint description that holds `ArtifactRef` values fits. A map in it has to be a `BTreeMap`.
- **The step closure is `FnMut`** and can be called more than once.
- **A step error is a `Report<StepFailure>`** with `kind` and `code`. The report's messages go to logs. Only `kind` and `code` are recorded.
- **The run function must request the same step names in the same order** each time. A step per batch (`deliver/entities/17`) needs a batch count that is the same on every execution.
- **Cancel.** The doc comment of `Runs::cancel` says that the run stops before its next step that has not been recorded (`runs.rs:61-62`). It does not say that a running step is interrupted.
- **The run function receives its input by value** and gets no run ID. `RunFunction::run` has no parameter for the `RunId`, so a stage that needs the run ID must find it in the input.
- **No backend implementation of `Runs`, `Worker` or `StepContext` was found** on this branch. `state/mod.rs` holds the pure state machine (`RunState`, `StepDecision`).

### A8. `RunInput` and the integration service (`apps/hash-integrations/src/service`, `BE-1136`)

#### `apps/hash-integrations/src/service/run_input.rs`

Purpose: what a run records when it starts, and the check a worker runs on it.

```rust
// apps/hash-integrations/src/service/run_input.rs:7-10
/// How a run was asked for.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct Invocation {
    pub links_only: bool,
}

// apps/hash-integrations/src/service/run_input.rs:14-21
/// What a run records when it starts: the definition as written, and who started it for which
/// integration.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct RunInput {
    pub web: WebId,
    pub connector: Box<str>,
    pub owner: ActorEntityUuid,
    pub definition: Box<str>,
    pub invocation: Invocation,
}

// apps/hash-integrations/src/service/run_input.rs:24-32
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub(crate) enum RunInputError {
    #[display("the run was started for another web")]
    WebMismatch,
    #[display("the run's definition is not a valid definition")]
    InvalidDefinition,
    #[display("the run's definition names another connector than the run was started for")]
    ConnectorMismatch,
}

impl RunInput {
    // :43  Checks the run belongs to `web`, then parses the recorded definition and checks it
    //      names the run's connector.
    pub(crate) fn definition(&self, web: WebId) -> Result<Definition, Report<RunInputError>>;
}
```

`RunInput` holds the definition as YAML text, the web, the connector name and the owner (the actor). It holds no run ID, no namespace, no operation, no target run and no capture time. `Invocation::links_only` is the only field that changes what a run does, and no code reads it.

#### `apps/hash-integrations/src/service/start.rs`

```rust
// apps/hash-integrations/src/service/start.rs:9
pub(crate) const FUNCTION_VERSION: FunctionVersion = FunctionVersion::new(1);

// apps/hash-integrations/src/service/start.rs:12-17
/// How often a failed step of an integration run is tried: 3 times, waiting 1 s and then 2 s.
pub(crate) const RETRY_POLICY: RetryPolicy = RetryPolicy {
    max_attempts: NonZero::new(3).expect("three should be nonzero"),
    initial_delay: Duration::from_secs(1),
    max_delay: Duration::from_secs(60),
    multiplier: NonZero::new(2).expect("two should be nonzero"),
};

// apps/hash-integrations/src/service/start.rs:20
const RUN_NAMESPACE: Uuid = Uuid::from_u128(0x0A36_54A6_459B_4CE9_BE9E_0E55_5D6D_721F);

// :23  UUID v5 over the bytes of the web UUID followed by the bytes of the request UUID.
pub(crate) fn run_id(web: WebId, request: Uuid) -> RunId;

// :41  format!("{web}/{connector}")
pub(crate) fn admission_key(web: WebId, connector: &ConnectorId) -> AdmissionKey;
```

The run ID is a UUID in lowercase text, so it parses back into the `Uuid` that `CaptureRun::id` needs. The admission key allows one active run per web and connector.

#### `apps/hash-integrations/src/service/mod.rs`

```rust
// apps/hash-integrations/src/service/mod.rs:16-21
/// Who asks, for which web, under which request ID.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Request {
    pub web: WebId,
    pub actor: ActorEntityUuid,
    pub id: Uuid,
}

// apps/hash-integrations/src/service/mod.rs:24-28
/// The definition to run, as written, and how it was asked for.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Submission {
    pub definition: Box<str>,
    pub invocation: Invocation,
}

// apps/hash-integrations/src/service/mod.rs:31-46
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub(crate) enum ServiceError {
    WebMismatch,
    InvalidDefinition,
    AlreadyActive { active: RunId },
    RequestMismatch,
    Backend,
}

// apps/hash-integrations/src/service/mod.rs:49-52
/// Starts, inspects and cancels the integration runs of one node's web.
pub(crate) struct IntegrationService<R> {
    runs: R,
    web: WebId,
}

impl<R: Runs> IntegrationService<R> {
    // :55
    pub(crate) const fn new(runs: R, web: WebId) -> Self;
    // :72  Starts the run of `request`, or attaches to it when the request is repeated.
    pub(crate) async fn submit(&self, request: &Request, submission: Submission) -> Result<RunId, Report<ServiceError>>;
    // :110
    pub(crate) async fn status(&self, request: &Request, run: &RunId) -> Result<Option<RunStatus>, Report<ServiceError>>;
    // :129
    pub(crate) async fn cancel(&self, request: &Request, run: &RunId) -> Result<(), Report<ServiceError>>;
}
```

`submit` parses the definition, builds the `RunInput`, encodes it as the `RunStart::input`, and calls `Runs::start` with `run_id(web, request.id)`. The service is one web per node (`IntegrationService::web`). Nothing calls the service: `main.rs:13-17` on this branch marks the module `dead_code` with the reason "the CLI and the HTTP API do not call the service yet". `service/tests.rs` (304 lines) tests it with a `FakeRuns` that implements `Runs` in memory (`tests.rs:22-100`). No `RunFunction` implementation was found on this branch.

### A9. `apps/hash-integrations` (`main`)

Purpose: the binary that will host the integration worker. On `main` it only parses arguments and starts telemetry.

| File | Content |
| --- | --- |
| `apps/hash-integrations/Cargo.toml` | Package `hash-integrations`. Dependencies: `hash-telemetry`, `clap`, `clap_complete`, `mimalloc`, `simple-mermaid`, `tokio`. It does not depend on `hash-integrations-engine` or `hash-integrations-definition`. |
| `apps/hash-integrations/src/main.rs` (43 lines) | Parses `Args`, starts Sentry, builds a multi-thread Tokio runtime, starts tracing with the name `Integrations`, and calls `subcommand.execute()` (`:25-43`). |
| `apps/hash-integrations/src/args.rs` (45 lines) | `pub struct Args { pub tracing_config: TracingConfig, pub subcommand: Subcommand }` (`:15-22`) and `pub fn parse_args() -> Self` (`:26`). |
| `apps/hash-integrations/src/subcommand/mod.rs` (18 lines) | `pub enum Subcommand { Completions(Box<CompletionsArgs>) }` (`:7-10`) and `pub(crate) fn execute(self)` (`:13`). |
| `apps/hash-integrations/src/subcommand/completions.rs` (21 lines) | `pub struct CompletionsArgs { pub shell: Shell }` (`:8-12`) and `pub fn completions(args: &CompletionsArgs)` (`:14`), which prints a shell completion script. |

Subcommands: `completions` is the only one. A `run`, `serve`, `worker` or `restore` subcommand was not found. `Subcommand::execute` is a synchronous function.

On `BE-1136` the app adds `mod service` and the dependencies `error-stack`, `hash-integrations-definition`, `hash-integrations-orchestration`, `type-system`, `derive_more`, `serde` and `uuid`. Its `main.rs` no longer builds a Tokio runtime and no longer calls `init_tracing` (`main.rs:27-36` on that branch). It still has only the `completions` subcommand, and it does not depend on `hash-integrations-engine`.

## Part B: test inventory

### B1. Definition crate tests and engine integration tests

All paths are relative to the repository root. All line numbers refer to the `origin/main` export. Line numbers for a test point at its `fn` line.

Totals: 5 engine integration test files with 58 test functions, 3 definition integration test files with 8 test functions, 1 definition unit test file with 17 tests, and 10 inline test modules in `definition/src` with 24 tests.

#### Branch comparison

The checkout at the monorepo checkout is on branch `pe/be-1137-add-state-version-and-work-manifest-records`. It is not on a BE-933 branch. The branch `pe/be-933-store-integration-artifacts-and-run-records-in-the-object` is checked out in a separate worktree at `.claude/worktrees/be-933-staging`.

- `engine/tests/capture.rs`: identical between the export and the checkout.
- `engine/tests/entity_id.rs`: identical.
- `engine/tests/pipeline.rs`: identical.
- `engine/tests/workspace.rs`: identical.
- `engine/tests/workspace_metrics.rs`: identical.
- `engine/tests/fixtures/*`, `definition/tests/**`, `definition/examples/aviation.yaml` and `definition/src/definition/tests.rs`: identical (`diff -rq` reports no difference).
- `git diff --stat` between the local `origin/main` ref and the BE-933 branch reports no change under `engine/tests`, `definition/tests` or `definition/examples`. Neither feature branch adds or changes a test in this scope.

#### What these tests establish for the spec

- **`_content_hash` column.** The engine adds `_content_hash` only to a sink's output table. Three tests cover it: `pipeline_content_hashes`, `pipeline_converted_hashes` and `pipeline_measured_hashes` in `engine/tests/pipeline.rs`. They show that the hash covers the columns that the sink's property accessors read. They show that the hash excludes the `entityId` column, `_key`, and columns that no property maps. For a plain column accessor on a `VARCHAR` column the hash trims the text (`' a '` and `'a'` hash equal). For a `measure` accessor the hash covers both the amount column and the unit column.
- **Hash expression (from code, for context).** `engine/src/workspace/connection/pipeline.rs` lines 245-273 build `md5(struct_pack(p0 := ..., p1 := ...)::VARCHAR)` in property order. A plain column accessor on a `VARCHAR` column uses `nullif(trim(column), '')`. `coerce` and `measure` accessors use the raw column. A sink without properties gets `md5('')`. The property type URLs and the entity type are not part of the hash. No test covers the blank-to-NULL step, the `md5('')` case, or a `coerce: trim` accessor with padded text.
- **Links and `_content_hash`.** A link pipeline's output table has no `_content_hash` column in the code (`prepare_link_pipeline`, lines 57-101 of the same file). No test asserts the absence. A test that asserts a link content hash was not found.
- **Output table names.** No test asserts a table name. Every test reads the name from `PreparedSink::table`, `PreparedPipeline::table`, `PreparedPipeline::checkpoints` or `PreparedLink::table`. In the code each SQL step, checkpoint and sink writes a new table named `_step/<UUID v4>` (`table_name`, line 240). The name is random and differs between runs. A link pipeline without steps returns the checkpoint's table as its output table. The tests choose the staged source table name themselves: `source` in most tests and `source/<source name>` in `definition_aviation_tables`.
- **Definition checkpoints.** `pipeline_branch_isolation` shows that a checkpoint table is a copy that keeps its rows after the source table is replaced. `pipeline_named_inputs` and `link_named_inputs` show that a caller passes a map from checkpoint name to table name, and that a missing entry fails with `PreparationError::MissingCheckpoint`. The definition crate tests cover uniqueness (`DuplicateCheckpoint`), unknown checkpoints (`UnknownCheckpoint`), a pipeline reading its own checkpoint (`ReadsOwnCheckpoint`), and run order derived from checkpoints.
- **Branches.** `pipeline_branch_isolation` shows that each branch starts from the table before the branch step, and that the main pipeline continues from that same table after the branch step. The definition tests reject an empty branch list, an empty branch and a nested branch.
- **Staging into DuckDB.** `stage_table` adds `_op` (value `snapshot`) and `_key` (JSON text of the primary key columns in declared order) and returns the row count. Covered by `staging_composite_keys`, `staging_empty_source`, `staging_invalid_columns`, `staging_assertion_failures` and `staging_assertion_row_bounds`. Loading a Parquet capture into a table is covered by `load_capture_types_and_empty_schema` and `load_invalid_capture_preserves_table`.
- **Capture to Parquet.** `engine/tests/capture.rs` covers row count, file size, column types, NULL values, order, empty results, refusal to overwrite, cleanup after failure or cancellation, and copying a local Parquet file.
- **Capture limits.** The only limit under test is the workspace disk limit (`capture_disk_limit_context`). A test for a row limit or a byte limit on a single capture was not found.
- **Entity ID derivation.** `derive_entity_id(web_id, namespace, entity_type, source_id)` returns UUID v5 over the text `{namespace}::{entity_type}::{source_id}` with the fixed namespace UUID `d6e2c7a1-f84b-4e3a-9c0d-5b7f1e3a2d4c` (`engine/src/entity_id.rs` lines 8-24). `engine/tests/entity_id.rs` checks eight recorded vectors from `entity-ids-typescript.json`.
- **Row counts and NULL handling.** `stage_table` returns 1 and 0 in two tests. The `not_null` assertion counts NULL and blank text together (2 rows for `''` and NULL). `check_capture_file` verifies that a `CASE` without `ELSE` yields NULL labels in Parquet for odd IDs. `definition_aviation_tables` checks `count(*)` equals `count(_content_hash)` equals 2 for each sink.
- **Running a pipeline twice.** `pipeline_content_hashes` (3 runs), `pipeline_converted_hashes` (3 runs plus 1 failing run) and `pipeline_measured_hashes` (4 runs) prepare the same pipeline repeatedly in one workspace after re-staging the `source` table, and compare `_content_hash` values across the runs. `pipeline_branch_isolation` re-stages the source after one run and checks that earlier output tables keep their rows. `capture_existing_target` and `copy_local_capture_independence` write to the same capture path twice and expect `CaptureError::Exists`. A test that compares two complete runs to derive created, updated or deleted rows was not found.

#### Fixtures

**`libs/@local/integrations/definition/examples/aviation.yaml`** (62 lines). A complete definition.
- Connector: `aviation`. Variable: `TYPES` = `https://example.com/@demo/types`.
- Unit map: `masses` with units `KG` and `LB` and a fallback data type `mass`.
- Sources: `aircraft` (inline SQL `VALUES`, primary key `TAIL`, 2 rows, columns `TAIL`, `MODEL`, `FIRST_FLIGHT`, `EMPTY_MASS`, `MASS_UNIT`, `HOME_BASE`) and `airfields` (inline SQL `VALUES`, primary key `ICAO`, 2 rows, columns `ICAO`, `FIELD_NAME`).
- Entity pipeline for `airfields`: one step `sink-airfields`, a sink with entity type `.../entity-type/airfield/v/1`, `entityId: ICAO`, and property `name` from column `FIELD_NAME`. It declares no checkpoint.
- Entity pipeline for `aircraft`: `dependsOn: [airfields]`. Step `sink-aircraft` is a sink with entity type `.../entity-type/aircraft/v/1`, `entityId: TAIL`, property `model` from `MODEL`, property `first-flight` from `{ column: FIRST_FLIGHT, coerce: date }`, and property `empty-mass` from `{ amount: EMPTY_MASS, unit: MASS_UNIT, unitMap: masses }`. Step `cp-aircraft` writes checkpoint `aviation/aircraft`.
- Link pipeline `aircraft-based-at`: reads checkpoint `aviation/aircraft`, has no steps and no properties, `from` is entity type `aircraft` with column `TAIL`, `to` is entity type `airfield` with column `HOME_BASE`, link type `.../entity-type/based-at/v/1`.
- Both aircraft rows have `HOME_BASE` = `ESSA`. Airfield `ESSB` has no aircraft.

**`libs/@local/integrations/engine/tests/fixtures/pipeline-sink.yaml`** (6 lines). A step list, used through the `pipeline` helper.
- One step `sink`: entity type `https://example.com/entity/v/1`, `entityId: ID`, property `https://example.com/property/v/1` from column `NAME`.

**`libs/@local/integrations/engine/tests/fixtures/pipeline-branches.yaml`** (22 lines). A step list, used through the `pipeline` helper.
- Step `save`: checkpoint `before`.
- Step `branches` with two branches. Branch 0: SQL step `add-hundred` (`VALUE + 100`), then sink `sink-hundred`. Branch 1: SQL step `add-two-hundred` (`VALUE + 200`), then sink `sink-two-hundred`.
- Step `add-one`: SQL with a CTE and a trailing `;` (`VALUE + 1`).
- Step `sink-main`: sink.
- All three sinks use entity type `https://example.com/entity/v/1`, `entityId: ID` and no properties. All SQL steps select `_op`, `_key`, `ID` and `VALUE` from `input`.

**`libs/@local/integrations/engine/tests/fixtures/pipeline-links.yaml`** (35 lines). A complete definition.
- Connector `demo`. Sources `left` (`SELECT 1 AS ID`) and `right` (`SELECT 2 AS ID`), both with primary key `ID`.
- Entity pipeline for `left`: step `save-left`, checkpoint `left`. Entity pipeline for `right`: step `save-right`, checkpoint `right`. No sinks.
- Link pipeline `joined`: inputs `lhs: left` and `rhs: right`. Step `join` cross joins `lhs` and `rhs` into `FROM_ID` and `TO_ID`. Step `project` selects `FROM_ID, TO_ID FROM input`. `from` uses column `FROM_ID`, `to` uses column `TO_ID`, both with entity type `https://example.com/entity/v/1`. Link type `https://example.com/link/v/1`.

**`libs/@local/integrations/engine/tests/fixtures/pipeline-measured.yaml`** (21 lines). A complete definition.
- Connector `demo`. Unit map `masses` with units `KG` and `LB` and no fallback.
- Source `source` (`SELECT 1 AS ID`, primary key `ID`).
- Entity pipeline for `source`: one step `sink` with entity type `https://example.com/entity/v/1`, `entityId: ID`, and property `https://example.com/property/v/1` from `{ amount: AMOUNT, unit: UNIT, unitMap: masses }`. No checkpoints and no link pipelines.

**`libs/@local/integrations/engine/tests/fixtures/entity-ids-typescript.json`** (66 lines). Eight entity ID vectors. Each has `ns`, `entityType`, `entityId`, `note`, `uuid` and `composite`.
- `ns` is `conn-a` in every vector. Seven vectors use entity type `https://x/@t/types/entity-type/material/v/1`.
- Source IDs: `M-0001`, `1` (numeric ID as text), `1.5` (decimal ID as text), `Grüße-仓库` (Unicode, hashed as UTF-8 bytes), `a::b` (contains the `::` separator), `A|B` (joined composite ID) and the empty string.
- One link vector: `entityType` is the link type `.../entity-type/stored-at/v/1` and `entityId` is `sourceType::sourceId::targetType::targetId` (`.../material/v/1::M-0001::.../plant/v/1::P-0100`).
- `composite` is `web-fixture~<uuid>`. The test replaces `web-fixture` with a web UUID.

**`libs/@local/integrations/engine/tests/fixtures/README.md`** (5 lines). It states that the JSON file holds the UUID vectors recorded by the proof of concept in the `hashintel/labs` repository (`pocs/integrations_rs/tests/golden/uuids.json`), that the two numeric source IDs are stored as text, and that `web-fixture` is replaced with a valid web UUID in the test.

#### `libs/@local/integrations/engine/tests/pipeline.rs` (765 lines)

Fixtures: `engine/tests/fixtures/pipeline-branches.yaml`, `pipeline-sink.yaml`, `pipeline-links.yaml`, `pipeline-measured.yaml` and `definition/examples/aviation.yaml`. Other tests build their data inline. Every test opens a new DuckDB workspace in a `TempDir`.

Helpers:
- `open` (line 16): opens a `Workspace` at `workspace.duckdb` in the directory with the default `WorkspaceConfig`.
- `key` (line 25): builds a `PrimaryKey` from column name strings.
- `pipeline` (line 34): wraps a YAML step list in a definition (connector `demo`, source `source`, primary key `ID`, SQL `SELECT 1 AS ID`) and returns its first `EntityPipeline`.
- `stage` (line 53): calls `stage_table` for table `source` with primary key `ID` and no assertions.
- `values` (line 65): returns the `VALUE` column of a table ordered by `ID`.

Tests:
- `staging_composite_keys` (line 76): stages `SELECT 1 AS ID, 'a"b' AS NAME` with primary key `[NAME, ID]` and a trailing `;` and comment, and asserts a returned row count of 1, `_op` = `snapshot`, `_key` = `{"NAME":"a\"b","ID":1}` (key order kept, text escaped) and `ID` = 1.
- `staging_assertion_failures` (line 108): stages 3 rows with `min_rows: 4`, `not_null: [NAME]` and `unique: [[ID]]` and asserts `PreparationError::Assertions` holding `AssertionFailure::RowCount { actual: 3 }`, `NotNull { rows: 2 }` (one blank and one NULL) and `Unique { groups: 1 }`, plus the exact display text of the report.
- `staging_assertion_row_bounds` (line 155): stages 3 rows with `max_rows: 2` and then with `min_rows: 4, max_rows: 5` and asserts the messages "expected at most 2 rows" and "expected between 4 and 5 rows".
- `staging_invalid_columns` (line 184): asserts `PreparationError::ReservedColumn { column: "_KeY" }` for a source column that collides with `_key` in another case, and `PreparationError::MissingColumn { column: "ID" }` when the key column is absent.
- `pipeline_branch_isolation` (line 216): runs `pipeline-branches.yaml` over one row with `VALUE` 10 and asserts three sinks with `VALUE` 110, 210 and 11, then re-stages `source` and asserts that the checkpoint table still holds 10 and the first sink table still holds 110. Covers branches, definition checkpoints and table retention.
- `pipeline_metadata_loss` (line 262): a SQL step that selects only `ID` fails with `PreparationError::Step { step: "lose-metadata" }` and a `PreparationError::Metadata` frame in the report.
- `pipeline_content_hashes` (line 288): prepares `pipeline-sink.yaml` three times over re-staged rows `(1, ' a ', 1)`, `(2, 'a', 99)` and `(2, 'b', 99)` for `(ID, NAME, NOISE)` and asserts that the first two `_content_hash` values are equal and the third differs. Covers `_content_hash` and repeated runs.
- `pipeline_named_inputs` (line 330): a pipeline with input alias `other` bound to checkpoint `upstream` fails with `PreparationError::MissingCheckpoint` when the map is empty, returns `VALUE` 15 when `upstream` maps to table `lookup`, and leaves no table named `input` or `other` in `information_schema.tables` (count 0).
- `pipeline_sql_sandbox` (line 390): a step that calls `read_csv('secrets.csv')` fails with `StatementError::TableFunction { name: "read_csv" }`, and a second pipeline on the same workspace then returns `ID` 1.
- `staging_empty_source` (line 426): staging `SELECT 1 AS ID WHERE false` returns a row count of 0, and a pipeline over it yields a table with columns `_op`, `_key`, `ID`.
- `link_named_inputs` (line 459): prepares link pipeline `joined` from `pipeline-links.yaml` with checkpoints `left` and `right` mapped to tables `left_data` and `right_data`, and asserts the output row `FROM_ID` 1, `TO_ID` 2. It does not query `_content_hash`.
- `definition_aviation_tables` (line 502): stages each SQL source of `aviation.yaml` as table `source/<source name>`, prepares both entity pipelines in definition order while collecting checkpoints, and asserts 2 sinks, each with `count(*)` 2 and `count(_content_hash)` 2. It then prepares link pipeline `aircraft-based-at` and asserts the rows `(N100, ESSA)` and `(SE-XXX, ESSA)` for `(TAIL, HOME_BASE)`.
- `pipeline_converted_hashes` (line 602): replaces the `NAME` mapping in `pipeline-sink.yaml` with `{ column: NAME, coerce: trim }`, runs three times and asserts equal hashes for rows that differ only in `ID` and `NOISE` and a different hash when `NAME` changes. A fourth run over a source without `NAME` fails with a `PreparationError::MissingColumn { column: "NAME" }` frame.
- `pipeline_measured_hashes` (line 652): runs `pipeline-measured.yaml` four times and asserts equal hashes when only `ID` and `NOISE` change, a different hash when `AMOUNT` changes from 10 to 11, and a different hash when `UNIT` changes from `KG` to `LB`.
- `pipeline_cancellation` (line 698): polls a pipeline with a long query once, drops the future after 100 ms and asserts that `SELECT 1` returns 1 within 10 seconds.
- `pipeline_bound_parameters` (line 726): opens the workspace with variable `INCREMENT` = `7`, stages `SELECT $increment::INTEGER AS ID, 10 AS VALUE` and runs a step that adds `$Increment::INTEGER`, and asserts `VALUE` 17. Parameters bind by name without regard to case in both source SQL and step SQL.

Branch diff: identical between the export and the checkout.

#### `libs/@local/integrations/engine/tests/capture.rs` (600 lines)

Fixtures: none, inline data. Every test opens a new workspace in a `TempDir`.

Helpers:
- `open` (line 25): opens a `Workspace` with the default config.
- `entries` (line 34): counts the entries of a directory. Tests use it to check that no partial file remains.
- `check_capture_rows` (line 69): opens a workspace with variables `COUNT` and `START`, captures `i`, `label` (`'even'` for even `i`, NULL otherwise) and `pair` (`[i, i + 1]`) from `range($START, $START + $COUNT)` ordered by `i` into `source.parquet`, closes the workspace, asserts that `capture.path()` equals the target, and calls `check_capture_file`.
- `check_capture_file` (line 120): asserts `capture.rows()` equals the row count, `capture.bytes()` equals the file size on disk, `SourceCapture::open` reports the same row count, and reads the Parquet file with the given reader batch size to check every `Int64` ID, every `Utf8` label (NULL for odd IDs) and every non-null `List<Int64>` pair in order.

Tests:
- `capture_rows_and_batches` (line 41): property test with 32 cases. For any row count in `0..200_000`, any start in `-100..100` and any reader batch size in `1..8192`, the capture holds exactly the requested rows with the values, types, NULLs and order checked by `check_capture_file`.
- `capture_batch_boundaries` (line 65): ten `rstest` cases (lines 54-63) run `check_capture_rows` with start `-3` at row counts 0, 1, 2, 1023, 1024, 1025, 65535, 65536, 65537 and 131073, which lie around the reader batch size and the 64 * 1024 row group size.
- `capture_disk_limit_context` (line 196): two cases (`capture`, `load`). With `disk_limit` 2 MiB and a 3 MiB file written into `workspace.duckdb.tmp`, both `capture` and `load_capture` fail with `CaptureError::DiskUsage` and a `StatementError::DiskLimit { used, limit }` frame where `used > limit`. In the capture case the target file does not exist afterwards.
- `capture_empty_schema` (line 258): a capture of `SELECT 1::INTEGER AS id WHERE false` has 0 rows and a Parquet schema with field `id` of type `Int32`.
- `capture_existing_target` (line 284): a second capture to the same target fails with `CaptureError::Exists` and the file bytes stay equal to the first capture.
- `capture_failed_query_cleanup` (line 309): a cast that fails on row 999999 of 1000000 fails with `CaptureError::Query`, the output directory has 0 entries, and the workspace still answers `SELECT 1`.
- `capture_restricted_sql` (line 338): capture SQL that calls `read_csv('/etc/passwd')` fails with a `StatementError` in the report, publishes no file, and `current_setting('enable_external_access')` is `false`.
- `capture_workspace_file` (line 367): a capture whose target is `workspace.duckdb.wal` fails with `CaptureError::WorkspaceFile` and the workspace stays usable.
- `capture_cancelled_cleanup` (line 389): a capture over `range(1000000000000)` times out after 20 ms, the workspace answers the next query, and the output directory has 0 entries.
- `copy_local_capture_independence` (line 422): `SourceCapture::copy_from` copies a local Parquet file, the copy still reports 1 row after the original is overwritten with other bytes, and a second copy to the same target fails with `CaptureError::Exists`.
- `copy_invalid_parquet_cleanup` (line 450): `SourceCapture::copy_from` on a file that is not Parquet fails with `CaptureError::Read` and leaves only the original file in the directory (1 entry).
- `load_capture_types_and_empty_schema` (line 465): captures 5000 rows with `BIGINT`, list, struct and `DECIMAL(12, 2)` columns, loads them into table `loaded` and asserts `count(*)` 5000, `min(amount)::VARCHAR` `12.30`, `max(pair[2])` 5000 and `min(nested.label)` `a`. It then captures an empty result with columns `id` and `label`, loads it into `empty_loaded` and asserts that both columns exist and 0 rows return.
- `load_invalid_capture_preserves_table` (line 546): after the capture file is overwritten with other bytes, `load_capture` into existing table `existing` fails with `CaptureError::Read` and the table still holds `id` 1. A query on `_capture_schema()` fails with `StatementError::TableFunction`.

Branch diff: identical between the export and the checkout.

#### `libs/@local/integrations/engine/tests/entity_id.rs` (46 lines)

Fixtures: `engine/tests/fixtures/entity-ids-typescript.json`. The struct `Case` (line 13) deserializes one vector with camelCase field names. No other helpers.

Tests:
- `derive_entity_id_recorded_vectors` (line 23): for each of the eight vectors and web ID `a2c8e6c7-485d-4b54-a248-53c9b9b014a2`, asserts that `derive_entity_id(web_id, ns, entity_type, entity_id).entity_uuid` equals the recorded `uuid`, that the `EntityId` display text equals `composite` with `web-fixture` replaced by the web ID (`<web>~<uuid>`), and that `draft_id` is `None`.

This is the parity test with the recorded vectors. It covers the namespace, the type URL and the source ID as inputs of UUID v5, including the link form of the source ID.

Branch diff: identical between the export and the checkout.

#### `libs/@local/integrations/engine/tests/workspace.rs` (852 lines)

Fixtures: none, inline data.

Helpers:
- `MIB` (line 24): constant `1024 * 1024`.
- `database_path` (line 26): returns `workspace.duckdb` inside the `TempDir`.
- `open_with` (line 30): opens a `Workspace` with a given `WorkspaceConfig`.
- `open` (line 36): opens a `Workspace` with the default config.
- `first_value` (line 40): runs a query and returns the first value of the first row.
- `count_rows` (line 47): opens a database file with a plain `duckdb::Connection` and returns `count(*)` of a table.
- `send` (line 57): polls a request future once and asserts that it is still pending.

Tests:
- `query_returns_rows_in_column_order` (line 65): creates table `flights` with 2 rows and asserts columns `seats`, `code` and rows `(214, BA117)` and `(364, LH400)` in the selected order.
- `query_without_rows_keeps_columns` (line 97): a query with `WHERE false` returns columns `id`, `name` and 0 rows.
- `create_table_replaces_table` (line 115): a second `create_table` with the same name (a name with a space and quotes) replaces the table, so its only column is `seats`.
- `query_failure_keeps_workspace_open` (line 138): a query on a missing table fails with `StatementError::InvalidQuery { error_type: QueryErrorType::Catalog }`, keeps the `duckdb::Error` in the report, and the next query returns 1.
- `query_reports_invalid_data` (line 170): `SELECT 'BA117'::INTEGER` fails with `StatementError::InvalidData { error_type: DataErrorType::Conversion }`.
- `query_refuses_other_statements` (line 191): `CREATE TABLE`, `CALL`, two statements and a misspelled `SELECT` each fail with `StatementError::NotSelect` and a non-empty reason.
- `create_table_refuses_other_statement_counts` (line 216): SQL with 2 statements, empty SQL and comment-only SQL fail with `StatementError::StatementCount` with counts 2, 0 and 0, and `SELECT 1; -- one statement` succeeds.
- `query_refuses_disallowed_table_functions` (line 240): `enable_logging`, `checkpoint`, `query`, `read_csv`, `force_checkpoint` (in a subquery) and `truncate_duckdb_logs` (in a CTE) each fail with `StatementError::TableFunction` naming the function, and `range`, `generate_series` and `unnest` together return a count of 8.
- `open_locks_settings` (line 284): `allow_community_extensions`, `autoinstall_known_extensions`, `autoload_known_extensions` and `enable_external_access` are `false` and `lock_configuration` is `true`.
- `query_reads_supported_types` (line 316): a row with timestamp, decimal, hugeint, date, time, interval, blob, enum, list, struct, map and union values returns 12 values.
- `query_refuses_unsupported_types` (line 338): `TIME_NS` as a column, in a list, in a struct and in a map each fail with `StatementError::UnsupportedType { column: "departs" }`, and `'12:00'::TIME` then returns `Value::Time64(Microsecond, 43_200_000_000)`.
- `open_refuses_second_workspace` (line 370): a second `Workspace::open` on the same file fails with `OpenError::Locked`, and opening succeeds after the first workspace closes.
- `dropping_request_interrupts_query` (line 387): after a long query future is dropped, `SELECT 1` returns 1 within 10 seconds.
- `dropping_queued_request_skips_it` (line 407): with `queue_capacity` 1, two dropped `create_table` requests behind a long query create no tables (`information_schema.tables` count 0 for `skipped` and `skipped_too`).
- `dropping_workspace_interrupts_running_query` (line 448): after the query future and the workspace are dropped, the database file can be opened again within 10 seconds.
- `snapshot_holds_tables_created_before_it` (line 475): a snapshot written over an existing non-database file holds 1 row in `flights` after the workspace replaces the table with 2 rows, and `snapshot.duckdb.partial` does not exist.
- `snapshot_refuses_invalid_targets` (line 509): a relative target and a target containing `..` fail with `SnapshotError::InvalidTarget`.
- `snapshot_refuses_workspace_files` (line 534): the database file and its `.wal`, `.tmp` and `.lock` paths fail with `SnapshotError::WorkspaceFile`.
- `snapshot_failure_removes_partial_copy` (line 560): a snapshot whose target is a directory fails with `SnapshotError::Write` and `snapshot.partial` does not exist.
- `snapshot_replaces_link_at_partial_path` (line 582): with a hard link to the database at `snapshot.partial`, the snapshot succeeds, and both the database and the snapshot hold 1 row in `flights`.
- `open_applies_limits` (line 615): `memory_limit` 256 MiB, `temp_directory_limit` 1024 MiB and `threads` 2 appear as DuckDB settings `256.0 MiB`, `1.0 GiB` and 2.
- `open_refuses_files_over_disk_limit` (line 652): reopening a database with `disk_limit` 1 byte fails with `OpenError::DiskLimit { used, limit }` where `limit` is 1 byte and `used > limit`.
- `create_table_over_disk_limit_keeps_table` (line 682): with `disk_limit` 2 MiB, creating a 300000-row table fails with `StatementError::DiskLimit` where `used > limit`, and the table still holds 300000 rows after close.
- `disk_limit_counts_temp_directory` (line 717): a 3 MiB file in `workspace.duckdb.tmp` makes `SELECT 1` fail with `StatementError::DiskLimit` under a 2 MiB limit.
- `disk_limit_checkpoints_before_refusing` (line 744): 20 replacements of a 10000-row table succeed under a 1 MiB limit, the `.wal` file stays below 1 MiB, and `min(count)` is 19.
- `query_binds_parameters` (line 782): variables `MIN_SEATS` = `300` and `Excluded` = `'); DROP TABLE flights; --` bind as text by name without regard to case in `create_table` and `query`, and the result is the single row `(LH400, '); DROP TABLE flights; --)`.
- `query_refuses_unknown_parameter` (line 835): `SELECT $MISSING` and `SELECT ?` fail with `StatementError::UnknownParameter` with names `MISSING` and `1`.

This file does not cover `_content_hash`, sinks, checkpoints or branches.

Branch diff: identical between the export and the checkout.

#### `libs/@local/integrations/engine/tests/workspace_metrics.rs` (204 lines)

Fixtures: none, inline data. The test installs a global OpenTelemetry meter provider with an `InMemoryMetricExporter`.

Helpers:
- `metric` (line 20): finds an exported metric by name.
- `counter` (line 29): sums the data points of an unsigned counter whose attributes include all given key-value pairs.
- `exercise_workspace` (line 43): opens a workspace with a 64 MiB disk limit, fails a second open (`OpenError::Locked`), creates table `items` with 3 rows, runs one query that returns 2 rows, fails one query (`StatementError::InvalidQuery`), writes one snapshot, fails one snapshot (`SnapshotError::Write`), drops one pending long query, closes the workspace and returns the snapshot file size.

Tests:
- `workspace_observed_outcomes` (line 110): asserts that `integrations.workspace.requests` counts 1 for each of `open`/`success`, `open`/`failure`, `create_table`/`success`, `query`/`success`, `query`/`failure`, `snapshot`/`success`, `snapshot`/`failure` and `close`/`success`, and 1 in total for `query` with outcome `cancelled` or `skipped`. It asserts that `integrations.workspace.rows` is 2 for `query` and 3 for `create_table`, that `integrations.workspace.snapshot.bytes` equals the snapshot file size, that the histogram `integrations.workspace.disk.usage` has a data point with a sum above 0, and that the histogram `integrations.workspace.duration` has 9 recorded values.

Branch diff: identical between the export and the checkout.

#### `libs/@local/integrations/definition/tests/properties.rs` (919 lines)

Fixtures: none, inline data. The tests generate definitions and YAML text.

Helpers:
- `Spelling` (line 39) with `Spelling::kebab_case` (line 49) and `Spelling::of` (line 88): computes the kebab-case spelling of each enum variant at compile time. `COERCIONS` (line 105) and `COVERAGES` (line 109) hold the spellings of `Coercion` and `Coverage`.
- `parse` (line 112): parses a string into any `FromStr` type and panics on failure.
- `COLUMN` (line 117): regex for generated column names, which can contain spaces, quotes, `#`, `:` and `${`.
- `Document` (line 174), built from `DocumentShape` (line 256) by `From` (line 266): a generated valid definition with sources `source-N`, entity pipelines with steps (SQL, checkpoint, sink, branch), and link pipelines that read only produced checkpoints. `Names` (line 183) hands out unique step IDs `step-N`, checkpoint names `demo/checkpoint-N` and property paths.
- `quote_template` (line 363) and `quote` (line 370): write a double-quoted YAML string. `quote` escapes `${` as `$${`.
- `Document::render` (line 509): writes the document as YAML text. `Document::definition` (line 555): builds the same `Definition` through `DefinitionParts` without parsing.
- `Mutation` (line 648) with `apply` (line 661) and `matches` (line 700), and `MUTATIONS` (line 717): five changes that each add one issue to a valid document.
- `line_of` (line 728): returns the 1-based line number of the nth line that contains a marker.
- `fragments` (line 738): strategy that concatenates 0 to 39 YAML-shaped text pieces.
- `parser_error` (line 850): returns the `serde_saphyr::Error` inside a `ParseError` report.

Tests:
- `fragments_located_in_input` (line 775): property. For any text built from the YAML fragments, if `Definition::from_yaml` fails, every reported location (from `ParseError::Syntax` or from each `DefinitionIssue` under `ParseError::Invalid`) has a line number at most the number of input lines plus 1.
- `valid_documents_round_trip` (line 796): property. For any generated `Document`, the rendered YAML parses, and the parsed `Definition` equals the one built directly from `DefinitionParts`. This covers variables in type URLs, quoting of column names, coverage values, `dependsOn`, checkpoints, sinks with all three accessor kinds, branches and links.
- `mutation_reports_one_issue` (line 810): property. For any generated `Document` and one applicable mutation, parsing fails with exactly one `DefinitionIssue`, its kind matches the mutation (`UnknownPipeline`, `UnknownCheckpoint`, `DuplicateStep`, `InvalidName` or `UnknownVariable`), and its location is the line that was changed.
- `alias_bomb_refused` (line 859): YAML with nine levels of ten aliases each fails with `ParseError::Syntax` and a `serde_saphyr::Error::AliasError` whose message starts with `budget breached: Nodes`.
- `deep_nesting_refused` (line 894): YAML nested 10000 levels deep fails with `ParseError::Syntax` and `serde_saphyr::Error::Budget` with `BudgetBreach::Depth`.

#### `libs/@local/integrations/definition/tests/sources.rs` (44 lines)

Fixtures: `definition/tests/ui/source-rest-interpolation.yaml` (loaded with `include_str!`). No helpers.

Tests:
- `rest_interpolation` (line 6): parses the REST source and asserts `endpoint.url` = `https://api.example.org/items`, parameter `status` = `active`, `RestAuth::Header` with name `X-Api-Key`, `results_field` = `data.items`, `Pagination::NextLink` with field `pagination.next`, and the default `page_size` of 100.

#### `libs/@local/integrations/definition/tests/ui.rs` (44 lines)

Fixtures: all 38 files under `definition/tests/ui/*.yaml` and `definition/examples/aviation.yaml`. Snapshots live under `definition/tests/snapshots` (39 files).

Helpers:
- `render` (line 9): parses YAML text and returns the `Debug` print of the `Definition`, or `line:column: reason` for `ParseError::Syntax`, or one line per `DefinitionIssue` for `ParseError::Invalid`.

Tests:
- `ui` (line 31): insta snapshot test. For each file matching `ui/*.yaml` it asserts that `render` output equals the snapshot `ui__ui@<file>.yaml.snap`.
- `examples` (line 39): insta snapshot test. For each `*.yaml` file under `definition/examples` it asserts that `render` output equals the snapshot. The only example is `aviation.yaml`, and its snapshot is `ui__examples.snap` (296 lines, the `Debug` print of the parsed definition).

Input groups under `definition/tests/ui` (each input has one snapshot named `ui__ui@<name>.yaml.snap`):
- `check-*.yaml` (5 files: `check-cycle`, `check-duplicates`, `check-links`, `check-property-urls`, `check-references`). Issues found on a parsed definition: dependency cycles and self-dependency, duplicate step IDs, duplicate checkpoints and duplicate link IDs, a pipeline that reads its own checkpoint, a second pipeline for one source, a link with several inputs and no step, unknown checkpoints, unused and undeclared sources, unknown `dependsOn` targets, and undeclared unit maps. Each snapshot line has `line:column`, the definition path and the message.
- `lower-*.yaml` (13 files: `lower-accessors`, `lower-duplicate-key`, `lower-empty-parts`, `lower-keys`, `lower-kinds`, `lower-names`, `lower-nested-branch`, `lower-primary-keys`, `lower-property-urls`, `lower-source-fields`, `lower-source-kinds`, `lower-steps`, `lower-variables`). Issues found while converting YAML into definition types: malformed accessors, keys that repeat after variable replacement, empty unit maps, empty branches and empty link inputs, two versions of one property type, invalid names, the reserved alias `input`, sources, steps or links with zero or several kind keys, nested branches, primary key errors, SQL sources without a primary key, checkpoint sources with a primary key, empty SQL, and unknown or unterminated `${...}` variables.
- `source-*.yaml` (11 files: `source-conflicting-connectors`, `source-connector-sibling-issues`, `source-connectors`, `source-inline-secret`, `source-postgres-connection`, `source-postgres-malformed-uri`, `source-rest-duplicate-params`, `source-rest-interpolation`, `source-rest-plain-http`, `source-rest-unknown-variables`, `source-rest-variant-fields`). Local, Postgres, Redshift and REST sources: two source kinds on one source, connection URI rules (scheme, inline credentials, `sslmode`, host and port, Unix sockets), inline secrets refused as unknown fields, repeated REST parameters, undeclared variables in REST fields, plain `http` with authentication, and fields that belong to another auth or pagination variant. `source-connectors` and `source-rest-interpolation` are valid and snapshot the parsed definition.
- `syntax-*.yaml` (8 files: `syntax-duplicate-key`, `syntax-expected-mapping`, `syntax-invalid-yaml`, `syntax-merge-key`, `syntax-unknown-coercion`, `syntax-unknown-field`, `syntax-unquoted-column`, `syntax-unquoted-number`). Errors that stop parsing with one `line:column: reason` line: a repeated mapping key, a list where a mapping is expected, text that is not YAML, a merge key `<<`, a coercion outside `date`, `time`, `boolean`, `number`, `integer`, `year`, `trim`, an unknown field, and unquoted numbers used as column names.
- `valid-forms.yaml` (1 file). A valid definition with less common forms: a SQL source that reads variable `REGION` as parameter `$REGION`, a two-column primary key `[id, region]`, a checkpoint source `saved-orders` whose pipeline is declared before the pipeline that writes checkpoint `demo/orders`, short accessors whose column names look like numbers or booleans, a `{ column: region }` accessor, and link pipeline `order-to-order` with inputs `earlier` and `later` (both `demo/orders`) combined by step `pair-orders`. The snapshot is the parsed definition (262 lines).

#### `libs/@local/integrations/definition/src/definition/tests.rs` (525 lines)

Fixtures: none, inline data. The module is included from `definition/src/definition/mod.rs` line 3 under `#[cfg(test)]`. It builds `DefinitionParts` in Rust and calls `Definition::new`.

Helpers:
- `parse` (line 22): parses a string into any `FromStr` type.
- `url` (line 29): builds a `VersionedUrl` under `https://example.com/@demo/types`.
- `query` (line 33): builds a `SqlQuery`.
- `sql_source` (line 37): builds a SQL `Source` with query `SELECT 1`, a one-column primary key and `Coverage::Complete`.
- `step` (line 47): builds a `Step` with one action.
- `sink` (line 54): builds an `Action::Sink` from an entity type path, an entity ID column and property accessors.
- `column` (line 68): builds `Accessor::Column`.
- `aviation` (line 74): returns valid `DefinitionParts` with sources `aircraft` and `airfields`, unit map `masses`, an `aircraft` pipeline (steps `shape-aircraft`, `sink-aircraft`, `cp-aircraft` writing `aviation/aircraft`, `depends_on` `airfields`) declared before an `airfields` pipeline (steps `sink-airfields`, `cp-airfields` writing `aviation/airfields`), and link `aircraft-based-at` reading `aviation/aircraft`. It differs from `aviation.yaml`: it has a SQL step, an `airfields` checkpoint and the reverse declaration order.
- `run_order` (line 159): returns the source names of `entity_pipelines()` in order.
- `issues` (line 168): returns the issue report of invalid parts.
- `paths_and_kinds` (line 173): returns each issue as its printed path and `IssueKind`.
- `pipeline_mut` (line 180): returns the mutable pipeline for a source name.

Tests:
- `order_depends_on` (line 193): `entity_pipelines()` returns `airfields` before `aircraft` because of `depends_on`.
- `order_checkpoint_source` (line 203): with `aircraft` as a checkpoint source on `aviation/airfields` and no `depends_on`, the order is still `airfields`, `aircraft`.
- `order_input` (line 227): with `aircraft` reading `aviation/airfields` through input alias `airfields`, the order is still `airfields`, `aircraft`.
- `undeclared_source` (line 244): removing source `airfields` reports `IssueKind::UndeclaredSource` at `pipelines.entities[1].source`.
- `unused_source` (line 260): an extra source `hangars` reports `IssueKind::UnusedSource` at `sources.hangars`.
- `duplicate_pipeline` (line 276): a second pipeline for `airfields` reports `IssueKind::DuplicatePipeline` at `pipelines.entities[2].source`.
- `unknown_pipeline` (line 297): `depends_on` `hangars` reports `IssueKind::UnknownPipeline` at `pipelines.entities[0].dependsOn[1]`.
- `depends_on_itself` (line 315): `airfields` depending on `airfields` reports `IssueKind::DependsOnItself` at `pipelines.entities[1].dependsOn[0]`.
- `dependency_cycle` (line 331): `airfields` reading `aviation/aircraft` reports `IssueKind::DependencyCycle { pipelines: [aircraft, airfields] }` at `pipelines.entities`.
- `duplicate_step` (line 349): a link step with ID `sink-airfields` reports `IssueKind::DuplicateStep` at `pipelines.links[0].steps[0].id`, so step IDs are unique across entity and link pipelines.
- `duplicate_checkpoint` (line 373): a branch step that writes `aviation/aircraft` again reports `IssueKind::DuplicateCheckpoint` at `pipelines.entities[1].steps[2].branches[0][0].checkpoint`.
- `unknown_checkpoint` (line 398): a link reading `aviation/hangars` reports `IssueKind::UnknownCheckpoint` at `pipelines.links[0].checkpoint`.
- `reads_own_checkpoint` (line 418): `airfields` reading `aviation/airfields` through alias `previous` reports `IssueKind::ReadsOwnCheckpoint` at `pipelines.entities[1].inputs.previous`.
- `unknown_unit_map` (line 436): clearing the unit maps reports `IssueKind::UnknownUnitMap { unit_map: masses }` at the `empty-mass` property of `pipelines.entities[0].steps[1].sink`.
- `inputs_uncombined` (line 454): a link with two inputs and no step reports `IssueKind::UncombinedInputs` at `pipelines.links[0].inputs`.
- `duplicate_link` (line 478): a repeated link ID reports `IssueKind::DuplicateLink { link: aircraft-based-at }` at `pipelines.links[1].id`.
- `issues_all_reported` (line 499): three unrelated problems yield three issues, at the `empty-mass` property path, `pipelines.links[0].checkpoint` and `sources.hangars`.

#### `libs/@local/integrations/definition/src/definition/order.rs` (116 lines, test module at lines 87-116)

Fixtures: none, inline data. No helpers.

Tests:
- `run_order_keeps_declaration_order` (line 94): with 4 items and item 0 depending on item 2, `Dependencies::run_order` returns `Ok([1, 2, 0, 3])`.
- `run_order_cycle` (line 105): with items 1 and 2 depending on each other and item 3 depending on 2, `run_order` returns `Err([1, 2, 3])`.

#### `libs/@local/integrations/definition/src/issue.rs` (290 lines, test module at lines 270-290)

Fixtures: none, inline data. No helpers.

Tests:
- `path_display` (line 275): a `DefinitionPath` built with `field`, `index` and `key` prints as `pipelines.entities[0].inputs.airfields.properties["https://example.com/@demo/types/property-type/name/v/1"]`.

#### `libs/@local/integrations/definition/src/link.rs` (102 lines, test module at lines 88-102)

Fixtures: none, inline data. No helpers.

Tests:
- `link_inputs_empty` (line 95): `LinkInputs::try_from` an empty map returns `Err(EmptyLinkInputs)`.

#### `libs/@local/integrations/definition/src/name.rs` (393 lines, test module at lines 303-393)

Fixtures: none, inline data. No helpers.

Tests:
- `name_uppercase` (line 310): `SourceName` accepts `2orders_archive-2026` and returns `InvalidName::InvalidCharacters` for `Orders`, `orDers`, `ordersZ` and `ORDERS`.
- `name_leading_separator` (line 323): `-orders` and `_orders` return `InvalidName::InvalidCharacters`.
- `name_path_characters` (line 334): `a/b`, `a.b`, `..`, `a\b` and `café` return `InvalidName::InvalidCharacters`.
- `checkpoint_segments` (line 345): `CheckpointName` accepts `aviation/aircraft` and returns `InvalidName::InvalidSegment` for `aviation/../aircraft`, `/aviation`, `aviation//aircraft`, `aviation/`, `Aviation/aircraft`, `aviation/Aircraft` and a segment longer than `MAX_NAME_BYTES`.
- `alias_reserved` (line 367): `InputAlias::from_str("input")` returns `InvalidName::Reserved { name: "input" }`.
- `alias_sql_identifier` (line 376): `InputAlias` accepts `_airfields2` and returns `InvalidName::NotSqlIdentifier` for `2airfields`, `air-fields`, `Airfields`, `airFields`, `INPUT` and `Input`.

#### `libs/@local/integrations/definition/src/source/mod.rs` (217 lines, test module at lines 186-217)

Fixtures: none, inline data. Helper `column` (line 194) builds a `ColumnName`.

Tests:
- `primary_key_duplicate` (line 199): `PrimaryKey::new([TAIL, MODEL, TAIL])` returns `InvalidPrimaryKey::DuplicateColumn { column: TAIL }`.
- `sql_query_whitespace` (line 210): `SqlQuery::try_from` a string of only whitespace returns `Err(EmptySqlQuery)`.

#### `libs/@local/integrations/definition/src/step.rs` (294 lines, test module at lines 234-294)

Fixtures: none, inline data. Helpers: `url` (line 247) builds a `VersionedUrl`; `checkpoint_step` (line 252) builds a `BranchStep` with ID `save` and checkpoint `saved`.

Tests:
- `branches_empty` (line 262): `Branches::new` with no branches returns `InvalidBranches::Empty`, and a second branch without steps returns `InvalidBranches::EmptyBranch { index: 1 }`.
- `properties_conflicting_versions` (line 276): `Properties::try_from` with `property-type/name/v/1` and `property-type/name/v/2` returns `ConflictingPropertyVersions { first: v/1, second: v/2 }`.

#### `libs/@local/integrations/definition/src/unit_map.rs` (62 lines, test module at lines 48-62)

Fixtures: none, inline data. No helpers.

Tests:
- `unit_map_empty` (line 55): `UnitMap::new` with no units and no fallback returns `Err(EmptyUnitMap)`.

#### `libs/@local/integrations/definition/src/variables.rs` (87 lines, test module at lines 49-87)

Fixtures: none, inline data. Helper `name` (line 57) builds a `VariableName`.

Tests:
- `try_from_refuses_names_in_other_case` (line 62): `Variables::try_from` with `LIMIT`, `Limit` and `OFFSET` returns `ConflictingVariables { variable: Limit, other: LIMIT }`.
- `get_ignores_case` (line 78): a variable declared as `Min_Seats` is returned by `get("MIN_SEATS")` with value `200`.

#### `libs/@local/integrations/definition/src/yaml/interpolate.rs` (178 lines, test module at lines 94-178)

Fixtures: none, inline data. Helper `name` (line 101) builds a `VariableName`.

Tests:
- `resolve_escape` (line 106): with `X` = `value`, `$${x}` resolves to `${x}`, `$$${X}` to `$${X}`, `$$ and $` stays unchanged, and `$${X} ${X}` resolves to `${X} value`, each with no issues.
- `resolve_ignores_case` (line 124): `${REGION}` resolves to `eu` for a variable declared as `Region`.
- `resolve_value_not_reinterpolated` (line 135): with `A` = `${B}`, `${A}` resolves to the text `${B}` with no issues.
- `resolve_unknown_variables` (line 146): `${A} and ${B}` without variables reports `IssueKind::UnknownVariable` for `A` and for `B`.
- `resolve_repeated_unknown_variable` (line 159): `${A}-${A}` reports `IssueKind::UnknownVariable` for `A` once.
- `resolve_invalid_declared_name` (line 169): a declared name `my-var` that is invalid as a variable name still replaces `${my-var}` with `value` and reports no issue.

#### `libs/@local/integrations/definition/src/yaml/mod.rs` (277 lines, test module at lines 237-277)

Fixtures: none, inline data. No helpers.

Tests:
- `from_yaml_uses_definition_terms` (line 246): `SyntaxError::from_yaml` prints `expected a list` for `serde_saphyr::Error::Unexpected { expected: "sequence start" }`, `expected text or a mapping` for `ExternallyTaggedEnumExpectedScalarOrMapping`, and `expected a mapping, found null` for `SerdeInvalidType` with `unit value` and `struct SourceSyntax`.

#### Files in `libs/@local/integrations/definition/src` without tests

Inline tests were not found in `lib.rs`, `pipeline.rs`, `variant_name.rs`, `definition/check.rs`, `source/remote.rs`, `yaml/locations.rs`, `yaml/syntax/mod.rs`, `yaml/syntax/spanned_map.rs`, `yaml/syntax/lower/mod.rs`, `yaml/syntax/lower/pipelines.rs` and `yaml/syntax/lower/rest.rs`. A `variant_name.rs` test module exists only in `engine/src/variant_name.rs`, which is outside this section.

### B2. Engine inline test modules and the aviation Graph test

Paths are relative to the repository root. "origin/main" means the file was read from the export of `origin/main`. "BE-933" means the file was read from the feature-branch checkout. A line number after a test name is the line of its `fn` declaration. Nothing in this section was run.

#### Spec topics and the tests that cover them

- **Create body.** `plan_aviation` (snapshot) and `requests_graph_readable` in `graph/plan/tests.rs`. The body has `webId`, `entityUuid`, `entityTypeIds` (one URL), `properties.value` keyed by property base URL (each entry has `value` and `metadata.dataTypeId`), `provenance`, `draft: false`, `readOnly: true`, and for links `linkData.leftEntityId` and `linkData.rightEntityId`.
- **Patch body.** Same two tests. The body has `entityId`, `entityTypeIds`, `archived: false`, `provenance`, and `properties` as a list with one `{"op": "add", "path": [<base URL>], "property": {...}}` entry per property, in base URL order. It does not replace the whole property object. `PropertyPatch` in `graph/plan/request.rs` (line 290) has only the `Add` variant, so the patch cannot remove a property that is missing from a later row. No test covers a removed property. A patch with no properties leaves the `properties` key out (link in the snapshot, lines 282 to 303).
- **Archive body.** `archive_payload` asserts the exact text: `entityId`, `archived: true`, `provenance`. Every upsert payload also stores an `archive` request next to `create` and `patch`.
- **`loadedAt` and provenance.** `integration_provenance_wire_shape` (`graph/tests.rs`), `archive_payload` and the `plan_aviation` snapshot assert `provenance.sources[0].loadedAt == "2026-11-06T12:00:00.000000000Z"`, `actorType: "machine"`, `origin.type: "api"`, `sources[0].type: "integration"`. The provenance is part of all three saved requests. The aviation Graph test sets `loaded_at: None`, so no test checks `loadedAt` on an entity stored in the Graph.
- **`readOnly`.** `requests_graph_readable` asserts `create.read_only`. The plan snapshot has `"readOnly": true` in every create body. The aviation snapshot has `"readOnly": true` on all six stored entities. The patch body has no `readOnly` field.
- **Entity IDs.** `entity_id_from_source_record`, `link_endpoints_match_entities`, `link_id_from_type_and_endpoints` (`graph/tests.rs`). `derive_entity_id` (`entity_id.rs`, line 12) is UUID v5 of `"{namespace}::{entity_type}::{source_id}"` under the fixed namespace UUID `d6e2c7a1-f84b-4e3a-9c0d-5b7f1e3a2d4c`. The web ID is stored in the `EntityId` but is not hashed. A link's source ID is `"{left type}::{left source ID}::{right type}::{right source ID}"`.
- **Duplicate writes.** `finish_duplicate_entity`: `GraphPlan::finish` returns `DuplicateWrite { entity_id }` when two writes address one entity.
- **Plan issues.** `plan_aviation` snapshot lists four issues: one `PlanIssue::Property` and three `PlanIssue::MissingSourceId`. The aviation Graph test asserts that `plan.issues()` is empty.
- **Order of writes.** `finish_order`, `operations_sort_into_application_order`: `UpsertEntity`, `UpsertLink`, `ArchiveLink`, `ArchiveEntity`, then by web ID and entity UUID.
- **Status codes in the Graph client.** `graph/client/tests.rs`. Tested: create 200 gives `Applied::Created`; create 409 then patch 200 gives `Applied::Patched`; archive 200 gives `Applied::Archived`; archive 404 gives `Applied::Absent`; create 422 gives `GraphError::Status { status: 422 }`; create 409 then patch 423 gives `GraphError::Status { status: 423 }`. Not found in any test: a 5xx response, a 404 or 409 on the patch of an upsert, a transport failure (`GraphError::Request`), `GraphError::Payload` through `send`. By the code (`graph/client/mod.rs`, lines 119 to 139 and 168 to 180) every other non-2xx status returns `GraphError::Status` with the first 1024 characters of the response body attached.
- **Bulk requests.** Not found. Each `PlannedWrite` is one POST or one PATCH to `{graph_url}/entities`.
- **Retry in the Graph client.** Not found. The only retry tests are for the REST source `fetch` (`sources/http/response_tests.rs`): retry on 429 only, at most ten retries.
- **Conditional writes (put if absent).** `bind_keeps_the_first_reference` and `bound_returns_the_bound_reference` (`storage/tests.rs`, local and S3). `ArtifactStorage::bind` uses `PutMode::Create` and returns `Bound::Created` or `Bound::Exists`. On `origin/main`, `publish_competing_writers` (`capture.rs`) tests the same rule for local capture files with `CaptureError::Exists`.
- **Binding a capture to a run.** `capture_retry_and_restore` and `capture_isolation` (`sources/tests.rs`, BE-933), `bound_returns_the_bound_reference` (`storage/tests.rs`).
- **Key layout.** `namespace_keys_are_stable` (`storage/tests.rs`): root `tenants/{web}/integrations/{sha256 hex of "{web}:{connector}"}`, capture key `{root}/captures/{run}/{source}.{fingerprint}.json`, artifact prefix `{root}/artifacts`. Artifact keys are `{prefix}/sha256/{first byte as hex}/{sha256 hex}.{extension}` (`storage/artifact/reference.rs`, line 128), checked by `materialize_rejects_unaddressed_references`.
- **Concurrent attempts.** `concurrent_attempts_share_the_bound_capture` (`sources/tests.rs`, BE-933, local storage only). No test runs two concurrent binds against S3.

#### Reusable helpers and fakes

- HTTP mock server: `server(router)` (line 46) and `Server` (line 29) in `libs/@local/integrations/engine/src/sources/tests.rs`. It binds `127.0.0.1:0`, serves an axum `Router`, and stops when dropped. On `origin/main` both are `pub(crate)` because `graph/client/tests.rs` imports them. On BE-933 both are `pub(super)`.
- Mock Graph entity API: `Graph` (line 47), `Graph::serve` (line 63), `Graph::received` (line 72) and `record` (line 77) in `graph/client/tests.rs` (origin/main). It answers POST with one fixed status and every other method with another, and records method, path, actor header, service credential and body.
- Mock Graph query API and mock Vault: built inline with axum routes `/entities/query` and `/v1/secret/data/users/{web}/connector/token` in `sources/secrets/tests.rs`; helpers `entity` (line 58), `assert_query` (line 134), `store` (line 191).
- Fake secret store: `NoSecrets` (line 86, private) in `sources/tests.rs`. Every read returns `SourceError::Secret`. `origin/main` also has `ConflictingSecrets` (line 102); BE-933 removes it.
- Object store: no in-memory object store was found. Storage tests use `ArtifactStorage::local` on a `TempDir`, or MinIO in a test container through `minio()` (line 23), `bucket(port)` (line 49) and `s3_storage(port, parent)` (line 61) in `storage/tests.rs` (all `pub(crate)`). The S3 cases need Docker.
- Fake source reader: not found. Tests build the real `SourceReader` with `reader(directory)` (line 150) and `reader_with(directory, captures)` (line 158) in `sources/tests.rs` (BE-933).
- DNS for local fixtures: `AnyResolver` (line 75) and `public_client(server)` (line 62) in `sources/tests.rs`. `public_client` maps the name `public.test` to the mock server.

#### `libs/@local/integrations/engine/src/graph/plan/tests.rs` (380 lines, origin/main)

Fixtures: `libs/@local/integrations/definition/examples/aviation.yaml` through `include_str!` (lines 42 to 44). No file under `engine/tests/fixtures`. Row data is inline. Helpers: `definition()` (line 41) parses the example; `sink(definition, entity_type)` (line 48) finds an `EntitySink` by type; `based_at(definition)` (line 65) returns the first `LinkPipeline`; `url(path)` (line 72); `web_id()` (line 78) returns web `a2c8e6c7-485d-4b54-a248-53c9b9b014a2`; `provenance()` (line 82) builds integration provenance with location name `aviation` and `loaded_at` 2026-11-06T12:00:00Z; `planner(definition)` (line 100) builds a `Planner` with namespace `aviation`; `aircraft_id(tail)` (line 109); `rows(...)` (line 114) builds text `duckdb::types::Value` rows for the six columns `TAIL, MODEL, FIRST_FLIGHT, EMPTY_MASS, MASS_UNIT, HOME_BASE`; `targets(plan)` (line 131) lists kind and entity ID per write; `requests(write)` (line 142) decodes the `request` object of a payload; `upsert(properties)` (line 190) and `properties(names)` (line 201) build a `GraphOperation::UpsertEntity`; `render(plan)` (line 328) prints every write and issue for the snapshot.

- `requests_graph_readable` (line 149): One aircraft row plans one write whose `request.kind` is `"upsert"`; `request.create` deserializes into the Graph's `CreateEntityParams` with the test web ID, `entity_uuid` equal to the derived aircraft UUID, `read_only == true` and three properties; `request.patch` deserializes into `PatchEntityParams` with the derived `entity_id`, `archived == Some(false)` and three property operations; `request.archive` deserializes into `PatchEntityParams` with `archived == Some(true)`.
- `payload_property_order` (line 221): Two upserts with the same five properties inserted in opposite order encode to the same `payload` text.
- `archive_payload` (line 240): A `GraphOperation::ArchiveEntity` encodes to exactly `{"entityId":"<id>","request":{"archive":{"archived":true,"entityId":"<id>","provenance":{"actorType":"machine","origin":{"type":"api"},"sources":[{"loadedAt":"2026-11-06T12:00:00.000000000Z","location":{"name":"aviation"},"type":"integration"}]}},"kind":"archive"},"version":1}`.
- `unreadable_payload` (line 264, rstest, 3 cases): `Payload::requests()` returns an error for `version: 2`, for an upsert without `patch`, and for an archive that also has `create`.
- `finish_order` (line 272): Two plans collected in the order archive then upsert finish as `UpsertEntity` for `SE-XXX` followed by `ArchiveEntity` for `G-OLD`.
- `finish_duplicate_entity` (line 309): An upsert and an archive of the same aircraft make `GraphPlan::finish` return `Err(DuplicateWrite { entity_id })`.
- `plan_aviation` (line 352, insta snapshot): Plans three aircraft rows as entities and as `based-at` links and compares `render(&plan)` with the snapshot below.

Snapshot `libs/@local/integrations/engine/src/graph/plan/snapshots/hash_integrations_engine__graph__plan__tests__plan_aviation.snap` (310 lines, origin/main). It holds three writes and an `issues:` list. Each write starts with a line `<kind> <web>~<entity UUID>` followed by the pretty-printed `request` object with the keys `archive`, `create`, `kind`, `patch`.

- Write 1 (lines 5 to 133): `UpsertEntity` for aircraft `SE-XXX`, UUID `468da978-f2fd-52d7-ad32-e319a155c918`. `create` has `draft: false`, `entityTypeIds` with the aircraft type, `entityUuid`, `readOnly: true`, `webId`, and three properties: `empty-mass` `8030.0` with `metadata.dataTypeId` set to the kilogram data type, `first-flight` `"1935-12-17"` (input `17.12.1935`) with `dataTypeId: null`, `model` `"DC-3"` with `dataTypeId: null`. `patch` has `archived: false`, `entityId`, `entityTypeIds`, and three `add` operations in base URL order, each with a one-element `path`. `archive` has `archived: true` and `entityId`. All three requests carry the same provenance with `loadedAt`.
- Write 2 (lines 135 to 227): `UpsertEntity` for aircraft `G-ABC`, UUID `5a1b641c-1583-51f0-909e-51d204835309`. Only `model` is written, trimmed to `"Ju 52"`. The date `unknown` is left out and reported. The blank amount is left out without an issue.
- Write 3 (lines 229 to 304): `UpsertLink` for `based-at`, UUID `b16436f1-2384-575c-b2d3-e5606539d19e`. `create.linkData` has `leftEntityId` (aircraft `SE-XXX`) and `rightEntityId` (airfield `ESSA`, UUID `9ec2610c-ca36-53f4-b809-e9af4c4b3b68`), `properties.value` is `{}`, `readOnly: true`. `patch` has no `properties` key and no link data.
- Issues (lines 306 to 310): `G-ABC` is written without `first-flight` because the value cannot be read as a date; row 2 of aircraft has no `TAIL`; row 1 of `based-at` has no `HOME_BASE`; row 2 of `based-at` has no `TAIL`. Row numbers start at 0.

#### `libs/@local/integrations/engine/src/graph/tests.rs` (190 lines, origin/main)

Fixtures: none, inline data. Helpers: `web_id()` (line 22); `url(name)` (line 26) builds `https://hash.ai/@h/types/entity-type/{name}/v/1`; `source()` (line 31) builds a `SourceProvenance` with `SourceType::Webpage`, author `CAA`, location `aviation` and `loaded_at` 2026-11-06T12:00:00Z; `aircraft(source_id)` (line 49) builds an `EntityUpsert`; `stationed_at(aircraft, airfield)` (line 60) builds a `LinkUpsert`.

- `entity_id_from_source_record` (line 79): `EntityUpsert::new` gives the ID of `derive_entity_id(web, "aviation", aircraft type, "G-ABCD")`, and its UUID is `119a2c54-334f-537f-97db-9d7bbb67b3b1`, the value the TypeScript engine derives.
- `link_endpoints_match_entities` (line 94): `LinkUpsert.left_entity_id` equals the aircraft upsert's ID and `right_entity_id` equals `derive_entity_id` for airfield `EGLL`.
- `link_id_from_type_and_endpoints` (line 109): The link UUID is `4ab11b11-9b66-5f0f-8341-687767fad6cf` (TypeScript value), is the same for the same inputs, differs for airfield `EGKK`, and differs when left and right are swapped.
- `operations_sort_into_application_order` (line 149): Sorting four operations by `GraphOperation::kind` gives `UpsertEntity`, `UpsertLink`, `ArchiveLink`, `ArchiveEntity`.
- `integration_provenance_wire_shape` (line 174): `integration_provenance(source())` serializes to `{"actorType":"machine","origin":{"type":"api"},"sources":[{"type":"integration","authors":["CAA"],"location":{"name":"aviation"},"loadedAt":"2026-11-06T12:00:00.000000000Z"}]}`; the input source type `Webpage` is replaced by `integration`.

#### `libs/@local/integrations/engine/src/graph/client/tests.rs` (293 lines, origin/main)

Fixtures: none, inline data. Helpers: `Received` (line 37) and the mock `Graph` (lines 47 to 104) described above; `client(server)` (line 106) builds a `GraphClient` with secret `service-secret`; `actor()` (line 114); `web_id()` (line 118); `provenance()` (line 122, no location and no `loaded_at`); `upsert()` (line 134) builds an aircraft `EntityUpsert` with source ID `N1` and no properties; `planned(operation)` (line 148) converts to `PlannedWrite`; `saved(write, method)` (line 153) returns the raw saved create, patch or archive text; `received(write, method)` (line 162) builds the expected request record with path `/entities`, the actor header and the service credential.

- `upsert_creates` (line 173): With create 200, `send` returns `Applied::Created` and the server received exactly one POST `/entities` whose body is the saved create request, with the actor ID header and the service credential.
- `upsert_patches_existing` (line 192): With create 409 and patch 200, `send` returns `Applied::Patched` and the server received the POST followed by a PATCH `/entities` with the saved patch request.
- `archive` (line 217, rstest, 2 cases): An archive write sends one PATCH with the saved archive request; status 200 gives `Applied::Archived` and status 404 gives `Applied::Absent`.
- `upsert_rejected` (line 238, rstest, 2 cases): Create 422 gives `GraphError::Status { status: 422 }`; create 409 then patch 423 gives `GraphError::Status { status: 423 }`; the report contains the response text `graph says no`.
- `graph_url_path` (line 260): A client built with `{server}/graph/` sends its request to path `/graph/entities`.
- `configuration` (line 285, rstest, 3 cases): `GraphClient::new` returns `GraphError::Configuration` for an `ftp` URL, for a URL with user and password, and for an empty service secret.

No test here sends a write twice, sends more than one write per request, or retries.

#### `libs/@local/integrations/engine/src/graph/property/tests.rs` (409 lines, origin/main)

Fixtures: none, inline data. Helpers: `text` (line 22), `string` (line 30), `number` (line 38), `property(name)` (line 44), `data_type(name)` (line 50), `column(name)` (line 56); `aircraft_properties()` (line 174) builds `Properties` with a plain column (`model`), a date coercion (`first-flight`) and a measure (`empty-mass`); `masses(fallback)` (line 198) builds a unit map `KG` to kilogram and `LB` to pound with an optional fallback data type `mass`; `resolve(values, fallback)` (line 236) resolves one row and returns values, data type IDs and failures; `written` (line 264).

- `date` (line 74, rstest, 9 cases): `coerce::apply(Coercion::Date, value)` returns `"1946-04-02"` for ISO text, timestamp text, `02.04.1946`, ` 02/04/1946 `, `19460402` and `Value::Date32(-8675)`; returns `"2026-11-09"` for a microsecond timestamp; returns `None` for `0000-01-01` and `April 1946`.
- `time` (line 91, rstest, 9 cases): `Coercion::Time` returns `"10:30:00+00:00"` for `10:30:00` and `103000`, keeps fractions and offsets (`10:30:00.25+00:00`, `10:30:00.5+00:00`, `10:30:00+02:00`), reads `Value::Time64`, and returns `None` for `000000`, `10:30:00.` and `noon`.
- `boolean` (line 102, rstest, 6 cases): `Coercion::Boolean` returns `Bool(true)` for `x`, ` Yes `, `1` and `Value::Boolean(true)`, and `Bool(false)` for `no` and `maybe`.
- `numbers_and_text` (line 127, rstest, 13 cases): `Coercion::Number` reads `12`, ` 37.6 `, `1,5` as 1.5, `1.234,56` as 1234.56 and `BigInt(-4)`, and returns `None` for `1e400` and `n/a`; `Coercion::Integer` truncates `12.9` to 12, `-3,7` to -3, `Double(8.5)` to 8 and keeps `9007199254740993`; `Coercion::Year` reads `1998`; `Coercion::Trim` returns `"DC-3"`.
- `column_value` (line 153, rstest, 8 cases): `ColumnValue::try_from` keeps text unchanged, maps `Null` to `PropertyValue::Null`, `Int` to a number, `Date32` to ISO text and a list to an array, and returns `UnsupportedValue::Blob`, `UnsupportedValue::Interval` and `UnsupportedValue::NonFiniteNumber` for a blob, an interval and an infinite double.
- `rendered_text` (line 170, rstest, 3 cases): `value::text` renders `Double(1.5)` as `1.5`, a decimal `8030.00` as `8030` and a timestamp as `2026-11-09T10:30:00Z`.
- `resolve_aircraft_row` (line 272): A clean row resolves to three properties keyed by base URL; `model` is `"DC-3"` and `first-flight` is `"1946-04-02"` with no data type ID, `empty-mass` is 8030 with the kilogram data type ID; there are no failures.
- `resolve_blank_values` (line 299): Blank and whitespace values produce no properties and no failures.
- `resolve_failure` (line 331, rstest, 3 cases): A bad date gives `ConversionFailure` with `FailureReason::Coercion(Coercion::Date)`, a bad amount gives `FailureReason::MeasureAmount`, an unknown unit without fallback gives `FailureReason::MeasureUnit`; the failed property is left out and the other two are kept.
- `resolve_unit_fallback` (line 360): An unknown unit `ST` with a fallback writes 8030 with the `mass` data type ID and no failure.
- `column_case` (line 374): A column named `model` is read for an accessor on `MODEL`.
- `missing_column_reads_as_null` (line 391): A property whose column is not in the row is left out without a failure.

#### `libs/@local/integrations/engine/src/progress/tests.rs` (102 lines, origin/main; identical on BE-933)

Fixtures: none, inline data. No shared helpers.

- `progress_concurrent_updates` (line 9): Eight threads call `Progress::advance(1)` 100 times each; `snapshot().completed` is 800 and `total` stays `Some(800)`.
- `progress_exceeds_expected_total` (line 34): `advance(3)` on a total of 2 gives `completed == 3`; advancing past `u64::MAX` stays at `u64::MAX`; a `None` total stays `None`.
- `progress_report_interval` (line 59): `claim_report` returns false at 9,999 ms, true at 10 s, false again at 10 s, false at 9 s, true at 20 s.
- `progress_concurrent_reports` (line 84): Eight threads call `claim_report(10 s)` and exactly one gets `true`.

#### `libs/@local/integrations/engine/src/capture.rs`, inline `mod tests` (lines 155 to 245 of 245, origin/main; identical on BE-933)

Fixtures: none, inline data; files are written to a `TempDir`. No shared helpers.

- `publish_directory_sync_failure_preserves_capture` (line 167): `SourceCapture::publish_with_sync` with an injected directory sync error returns `CaptureError::SyncDirectory { path }` with the `io::Error` attached; the Parquet file is already at the target; `SourceCapture::open` reads it with 3 rows and the file's byte size; a new `SourceCapture::stage` on the same target returns `CaptureError::Exists { path }`; the directory holds one file.
- `publish_competing_writers` (line 215): Two writers stage the same target; the first `publish` succeeds; the second returns `CaptureError::Exists`; the target still contains `first`; the directory holds one file.

#### `libs/@local/integrations/engine/src/sql.rs`, inline `mod tests` (lines 30 to 51 of 51, origin/main)

Fixtures: none. No shared helpers. On BE-933 the file has 5 more lines (a `literal` function) and the module starts at line 35; the test is the same.

- `identifier_round_trips` (line 38, proptest `#[property_test]`): For any non-empty name without NUL characters, `SELECT 1 AS {Identifier::new(name)}` runs in an in-memory DuckDB and the column name equals the input.

#### `libs/@local/integrations/engine/src/variant_name.rs`, inline `mod tests` (lines 68 to 107 of 107, origin/main)

Fixtures: none. Helper: a local enum `Example` (line 73).

- `words_joins_lowercase_words` (line 79): `VariantName::words('_')` renders `OutOfRange` as `out_of_range` and `words(' ')` renders `Binder` as `binder`.
- `matches_words_ignores_case_and_spaces` (line 94): `matches_words` accepts `Out of Range`, `OUT OF RANGE` and `OutOfRange` for `OutOfRange` and rejects `Out of Ranges`.

#### `libs/@local/integrations/engine/src/workspace/error.rs`, inline `mod tests` (lines 266 to 310 of 310, origin/main)

Fixtures: none. Helper: `from_message(message)` (line 273) builds a `StatementError` from a DuckDB failure message.

- `from_duckdb_reads_error_type` (line 281): `Mismatch Type Error: ...` maps to `StatementError::InvalidQuery { error_type: QueryErrorType::MismatchType }`, `Out of Range Error: ...` maps to `StatementError::InvalidData { error_type: DataErrorType::OutOfRange }`, and `IO Error: ...` and `Error: no error type` map to `StatementError::Failed`.

#### Files under `libs/@local/integrations/engine/src` with no inline tests (origin/main)

No `#[cfg(test)]` and no `#[test]` was found in: `lib.rs`, `byte_size.rs`, `entity_id.rs`, `pipeline/mod.rs`, `workspace/mod.rs`, `workspace/files.rs`, `workspace/interrupt.rs`, `workspace/metrics.rs`, `workspace/reply.rs`, `workspace/rows.rs`, `workspace/select.rs`, `workspace/connection/mod.rs`, `workspace/connection/capture.rs`, `workspace/connection/pipeline.rs`, `workspace/connection/staging.rs`. `workspace/error.rs` is the only file under `workspace/` with tests. `graph/mod.rs`, `graph/client/mod.rs`, `graph/plan/mod.rs`, `graph/property/mod.rs` and `progress/mod.rs` only declare `mod tests`. `graph/plan/request.rs`, `graph/property/coerce.rs` and `graph/property/value.rs` have no tests of their own.

#### `libs/@local/integrations/engine/src/storage/tests.rs` (467 lines, BE-933)

Fixtures: none, inline data. Files are written to a `TempDir`; S3 cases start MinIO (`ghcr.io/hashdeps/minio`, tag `RELEASE.2025-09-07T16-13-09Z`) in a test container. Helpers: `minio()` (line 23) starts MinIO, creates the bucket `captures` and returns the container and its port; `bucket(port)` (line 49) returns an `S3Bucket` with URI `s3://captures/tenants` and the `minioadmin` credentials; `s3_storage(port, parent)` (line 61) returns S3 `ArtifactStorage` that stages under `parent/staging`; `storage(port, directory)` (line 66) returns local storage under `directory/artifacts` or S3 storage; `run()` (line 76) returns a random `CaptureRun`; `connector()` (line 87) returns `aviation`; `namespace(web)` (line 91); `items()` (line 95); `capture(run)` (line 100) returns the capture key of source `items` with fingerprint `fingerprint`; `publish(storage, directory, bytes)` (line 105) publishes bytes as a `Format::Binary` artifact; `file(directory, bytes)` (line 210) writes a new file; `published(directory)` (line 308) publishes `{}` as a `Format::Json` artifact to local storage. The bucket URI ends in `tenants` and the namespace root also starts with `tenants/`, so S3 objects in these tests are stored under `tenants/tenants/...`.

- `bound_returns_the_bound_reference` (line 120, rstest, local and S3): The first `bind(capture key, artifact)` returns `Bound::Created`; a new `ArtifactStorage` on the same location returns `Some(artifact)` from `bound(key)`; the key of another run ID returns `None`.
- `bind_keeps_the_first_reference` (line 160, rstest, local and S3): After a first `bind` returns `Bound::Created`, a second storage binding a different artifact to the same key gets `Bound::Exists`, and `bound(key)` still returns the first artifact.
- `s3_errors_are_not_missing_bindings` (line 191): `bound` on S3 storage with a wrong secret returns an error and does not return `None`.
- `artifacts_round_trip_through_new_staging` (line 220, rstest, local and S3): Publishing `2 * CHUNK_SIZE + 3` bytes (three upload parts) returns a reference with that size and the SHA-256 of the bytes; a new storage materializes the artifact into a run staging directory with the same bytes.
- `publishing_the_same_bytes_returns_the_same_reference` (line 262, rstest, local and S3): Publishing `{}` twice through two storages under one prefix returns equal `ArtifactRef` values.
- `materialize_rejects_a_changed_artifact` (line 282): After the stored file is overwritten with other bytes, `materialize` returns `ArtifactError::Mismatch`.
- `references_round_trip_through_json` (line 321): An `ArtifactRef` serializes with `version == "v1"` and `value.format == "json"`, deserializes to an equal value, and the deserialized reference materializes to `{}`.
- `rejects_malformed_references` (line 351, rstest, 4 cases): Deserialization fails for `version: "v2"`, for an unknown field `value.eTag`, for a 62-character digest and for a non-hex digest.
- `materialize_rejects_unaddressed_references` (line 370, rstest, 3 cases): A reference with a digest of other bytes, with format changed to `parquet`, or with `../` put before the key deserializes but `materialize` returns `ArtifactError::Mismatch`.
- `namespace_keys_are_stable` (line 390): For web `00000000-0000-0000-0000-000000000001` and connector `aviation` the root is `tenants/00000000-0000-0000-0000-000000000001/integrations/a290c6f051d0a83cd0663dd31819fb8d9b8fac2705e6e0618c3b0c11142d7477`; the capture key for run `...0002` is `{root}/captures/00000000-0000-0000-0000-000000000002/items.fingerprint.json`; the artifact prefix is `{root}/artifacts`; connector `linear` gives a different namespace.
- `s3_errors_are_not_missing_or_mismatching_artifacts` (line 416): With a wrong S3 secret, `publish` returns `ArtifactError::Read` (the existence check failed) and `materialize` returns `ArtifactError::Read`.
- `staging_files_are_unique` (line 459): Two calls to `ArtifactStorage::staging_file(directory, Format::Parquet)` return different paths.

`storage/mod.rs` only declares `pub(crate) mod tests` (line 5). No inline tests were found in `storage/bucket.rs`, `storage/namespace.rs`, `storage/artifact/mod.rs`, `storage/artifact/binding.rs`, `storage/artifact/local.rs`, `storage/artifact/reference.rs` or `storage/artifact/s3.rs`. Publishing an artifact is not a conditional write: `publish` checks with `head` and then uploads (`storage/artifact/mod.rs`, lines 110 to 129). Only `bind` is conditional (`storage/artifact/binding.rs`, lines 28 to 47).

#### `libs/@local/integrations/engine/src/sources/tests.rs` (412 lines, BE-933; 387 lines on origin/main)

Fixtures: none; definitions are inline YAML. No file under `engine/tests/fixtures` or `definition/examples`. Helpers: `Server` (line 29), `server(router)` (line 46), `public_client(server)` (line 62), `AnyResolver` (line 75) and `NoSecrets` (line 86) as described above; `sql_definition()` (line 99) defines connector `test` with SQL source `items` (`SELECT 7 AS id, 'initial' AS value`); `remote_definition()` (line 119) defines a REST source `items` at `https://unavailable.invalid` with bearer auth; `run()` (line 142); `reader(directory)` (line 150); `reader_with(directory, captures)` (line 158); `open_workspace(directory, name)` (line 167).

Difference to origin/main: BE-933 makes `CaptureStore::new` take an `ArtifactStorage` in place of a capture directory, runs `capture_retry_and_restore` on local storage and on MinIO by publishing the earlier capture as an artifact and binding it to the run's capture key, and adds `concurrent_attempts_share_the_bound_capture`. It removes `failed_recovery_keeps_the_capture_error` with its helpers `ConflictingSecrets` and `postgres_definition`, and it changes `Server` and `server` from `pub(crate)` to `pub(super)`.

- `capture_retry_and_restore` (line 177, rstest, local and S3): An earlier attempt publishes a Parquet capture and binds it to `ArtifactNamespace::new(run.web, connector).capture(run.id, source name, fingerprint)`; a new reader on a new workspace then runs `capture_sources` for the unreachable REST definition with `NoSecrets` and succeeds; after the reader is dropped, `stage_sources` stages one table, and `"_source/items"` returns one row `id = 7`, `value = "initial"`, `_op = "snapshot"`, `_key = {"id":7}`.
- `concurrent_attempts_share_the_bound_capture` (line 266): Two readers on two workspaces run `capture_sources` for the same run with `tokio::join!` on a source whose value is `uuid()`; both succeed and both staged tables hold the same value, so the attempt that got `Bound::Exists` continued from the bound capture.
- `capture_isolation` (line 326, rstest, 3 cases): After capturing the SQL definition, `capture_sources` for the REST definition with another web, with another run ID, or with the same run returns `SourceError::Secret`, which shows that no stored capture was reused.
- `overlapping_roots` (line 355, rstest, 3 cases): `CaptureStore::new` returns `SourceError::Configuration` when the capture directory equals the local root, is inside it, or contains it.
- `local_root_invalid_key` (line 374, rstest, 3 cases): `CaptureStore::local_file` returns `SourceError::Configuration` for `../source.parquet`, `/etc/passwd` and an empty key.
- `local_root_symlink` (line 393, unix only): `local_file("escape/source.parquet")` through a symlink that points outside the local root returns `SourceError::Read`.

`sources/mod.rs` (328 lines, BE-933) only declares `mod tests` (line 7) and has no inline test functions.

#### `libs/@local/integrations/engine/src/sources/http/tests.rs` (99 lines, BE-933; identical on origin/main)

Fixtures: none. Uses `server` from `sources/tests.rs`. No own helpers.

- `destinations_reject_private_resolution` (line 15): A GET through the guarded `client()` to `localhost` on the mock server's port fails with a request or connect error before any HTTP response.
- `destinations_invalid_url` (line 42, rstest, 11 cases): `validate` returns `SourceError::Destination` for IPv4 and IPv6 loopback, mapped loopback, `169.254.169.254`, `100.64.0.1`, `0.1.2.3`, `224.0.0.1`, `192.0.2.1`, `fc00::1`, a URL with credentials and a `file` URL.
- `pacing_spaces_one_capture` (line 52, paused time): Three `Pacing::wait` calls with a 50 ms interval take 100 ms.
- `pacing_is_not_shared_between_captures` (line 66, paused time): A cancelled wait on a `Pacing` with a 24 hour interval does not delay a second `Pacing` with a zero interval.
- `retry_after_values` (line 91, rstest, 5 cases): `retry_after` reads `0` as 0 s and `1` as 1 s, caps `31` and `18446744073709551615` at 30 s, and returns `None` for `not-an-integer`.

#### `libs/@local/integrations/engine/src/sources/http/response_tests.rs` (133 lines, BE-933; identical on origin/main)

Fixtures: none. Uses `server` and `public_client` from `sources/tests.rs`; each test counts requests with an `AtomicUsize`.

- `fetch_stops_at_retry_budget` (line 25): A server that always answers 429 with `retry-after: 0` makes `fetch` return `SourceError::Status { status: 429 }` after 11 requests.
- `fetch_does_not_retry_other_failures` (line 56, rstest, 3 cases): 503 and 401 return `SourceError::Status` with that status, and 200 with a non-JSON body returns `SourceError::Response`; each case sends one request.
- `fetch_throttled_response` (line 90, rstest, 3 cases): One 429 followed by `{"items":[1]}` returns that JSON after two requests, and the wait is at least 0 s for `retry-after: 0`, 1 s for `1` and 500 ms for an invalid header.

These are the only retry tests in the engine. They cover reading a REST source. They do not cover Graph writes.

#### `libs/@local/integrations/engine/src/sources/secrets/tests.rs` (747 lines, BE-933; identical on origin/main)

Fixtures: none, inline data. Helpers: `entity(web, id)` (line 58) builds a User Secret `Entity` with expiry `2999-01-01T00:00:00Z` and Vault path `users/{web}/connector/token`; `SecretQueryRequest` (line 125) decodes the query body with `deny_unknown_fields`; `assert_query(headers, body, web, actor, id)` (line 134) checks the Graph query; `StoredValue` (line 187); `store(graph_url, vault_url)` (line 191) builds a `GraphVaultSecretStore` with secrets `graph-token` and `vault-token` and mount `secret`.

- `read_graph_authorization_and_vault_value` (line 203): `read` sends POST `/entities/query` with the actor ID header, service credential `graph-token`, a filter on web ID, entity UUID, `archived == false` and the User Secret type, `live_only` temporal axes, `limit` 2, `includeDrafts` false and `includePermissions` false; it then sends GET `/v1/secret/data/users/{web}/connector/token` with `x-vault-token: vault-token`; the result is the JSON `{"value":"stored-token"}`; its debug text does not contain the token; `rest::headers` turns it into `Authorization: Bearer stored-token`.
- `read_request_failure` (line 282, rstest, 2 cases): An unreachable Graph or Vault returns `SourceError::SecretRequest { service }` with the `reqwest::Error` kept, and the debug text contains no URL, `graph-token` or `vault-token`.
- `read_entity_count_and_value` (line 337, rstest, 3 cases): Zero or two entities return `SourceError::SecretEntityCount { count }` with no Vault read; one entity with an empty Vault object returns `SourceError::SecretValue` after one Vault read.
- `response_http_status` (line 400, rstest, 3 cases): `secret_response` returns `SourceError::SecretStatus { service, status }` for Graph 403, Vault 503 and Graph 201; the debug text names the service and the status and does not contain the response body.
- `response_schema_error` (line 443, rstest, 2 cases): Decoding a response with the wrong shape returns `SourceError::SecretResponse { service }`; the debug text contains `expected schema at line 1 column` and does not contain the secret value.
- `vault_secret_object` (line 487, rstest, 4 cases): `VaultResponse<SecretObject>` keeps the stored object's JSON text unchanged and reports `empty` as false for an object with entries and true for `{ }`; a string or an array returns `SourceError::SecretResponse { service: Vault }` without the value.
- `response_incomplete_json` (line 525): The body `{` returns `SourceError::SecretResponse { service: Graph }` with the `serde_json::Error` kept; the debug text contains `EOF` and `Graph` and does not contain the URL.
- `read_redirects` (line 571, rstest, 2 cases): A 307 from the Graph or from Vault returns `SourceError::SecretStatus { service, status: 307 }` and the redirect target receives no request.
- `member_alias_of_another_users_secret` (line 650): `validate_entity` returns `SourceError::SecretPath` when the actor is not the user in the Vault path.
- `entity_identity_expiry_and_path` (line 665): `validate_entity` accepts an active secret in the owner's web; returns `SourceError::SecretEntity` for an archived entity, another web or another type; `SourceError::SecretPath` for four malformed Vault paths; `SourceError::SecretExpiry` for a missing or malformed expiry (without the value in the debug text); `SourceError::SecretExpired` for expiry `2000-01-01T00:00:00Z`.

`sources/secrets/mod.rs` and `sources/http/mod.rs` only declare their test modules (lines 420 to 421, and lines 187 to 191).

#### `libs/@local/integrations/engine/src/sources/fingerprint.rs`, inline `mod tests` (lines 186 to 459 of 459, BE-933)

Fixtures: none, inline data. On origin/main the file has 465 lines and the module starts at line 192; the tests are the same. Helpers: `primary_key` (line 203), `query` (line 212), `checkpoint_name` (line 216); source builders `sql()` (line 220), `local()` (line 230), `postgres()` (line 240), `rest()` (line 258), `checkpoint()` (line 279); accessors `key` (line 288), `table` (line 298), `endpoint` (line 305).

- `fingerprint_known_value` (line 335, rstest, 5 cases): `fingerprint` returns a fixed 64-character hex value for each of the five source kinds, for example `691415c72923dc450765fe2b109d73d6fea654e04ecd2d60627789013cbb6cdb` for the SQL source.
- `fingerprint_changed_source` (line 418, rstest, 24 cases): Changing the SQL query, a primary key, the local key, the Postgres connection, schema, table or credentials, the REST URL, parameters, auth, results field, pagination, page size, max pages or rate limit, the coverage, or the checkpoint name changes the fingerprint.
- `fingerprint_distinct_kinds` (line 430): Eight sources of different kinds, three of them holding the same text `items`, all have different fingerprints.

#### `libs/@local/integrations/engine/src/sources/rest.rs`, inline `mod tests` (lines 389 to 711) and `mod schema_tests` (lines 713 to 788) of 788 lines (BE-933; identical on origin/main)

Fixtures: none, inline data. Uses `server` and `public_client` from `sources/tests.rs`. Helpers: `key()` (line 412) returns primary key `id`; `page` (line 417) is an axum handler that checks the bearer header and the fixed parameter on every page and serves two pages by next link or by offset; `endless` (line 583) is a handler that returns a new row and a new cursor on every page.

- `pagination_late_columns_and_nulls` (line 460, rstest, next-link and offset): `capture_with_client` captures two rows over two pages, and after `load_capture` the table holds `("1", NULL, "{\"a\":2}")` and `("2", "true", NULL)` for `id, later, nested`.
- `pagination_cross_origin_removes_partial_capture` (line 534): A next link to another origin returns `SourceError::Destination`, the target file does not exist and the output directory is empty.
- `empty_token` (line 569): `headers` returns `SourceError::Secret` for a secret `{"value":""}`.
- `pagination_rejects_ignored_offset` (line 594): An endpoint that returns the same page for every offset returns `SourceError::Pagination` and no target file.
- `pagination_stops_at_the_page_ceiling` (line 620): `capture_pages` with ceiling 3 on an endless endpoint returns `SourceError::Pagination` and no target file.
- `pagination_honours_max_pages_beyond_the_ceiling` (line 642): With `maxPages` 5 and ceiling 3 the capture succeeds with 5 rows.
- `empty_response_preserves_key_schema` (line 673): An empty array response gives a capture that loads into a table with the `id` column and zero rows.
- `rows_preserve_missing_key_columns` (line 724): `Spool::append` does not add a missing primary-key column, and a second row with column `VALUE` after `value` returns `SourceError::Response`.
- `publish_bounds_buffered_rows_by_size` (line 745): Three large rows publish to a Parquet file with more than one row group.
- `rows_reject_too_many_columns` (line 773): A row with `MAX_COLUMNS + 1` fields returns `SourceError::Response`.

#### `libs/@local/integrations/engine/src/sources/postgres.rs`, inline `mod tests` (lines 217 to 413) and `mod credential_tests` (lines 415 to 523) of 523 lines (BE-933)

Fixtures: none, inline data. `capture_postgres_table` starts Postgres `18-alpine` in a test container and needs Docker. On origin/main the file has 524 lines and the modules start one line later; the tests are the same. Helpers: `source()` (line 234) describes table `public.capture_fixture`; `source_at(connection)` (line 429).

- `connection_uri_credentials` (line 247): `connection_uri` percent-encodes user and password, keeps the encoded path and existing parameters, and appends `connect_timeout=30`; the test compares the full URI text.
- `connection_uri_hosts` (line 273, rstest, 2 cases): The URI still starts with the configured connection for an IPv6 host and for a `host` parameter with two hosts.
- `connection_uri_defaults` (line 292, rstest, 2 cases): Without parameters the URI has `sslmode=verify-full` and `connect_timeout=30`; configured `sslmode=require&connect_timeout=5` is kept.
- `capture_postgres_table` (line 319): `capture_with_resolver` captures two rows from the container, and the loaded table holds `(1, "first", "12.30")` and `(2, NULL, NULL)`.
- `pinning_rejects_local_destinations` (line 448, rstest, 5 cases): `pinned_addresses` with `http::PublicResolver` returns `SourceError::Destination` for `127.0.0.1`, `::1`, `10.0.0.1`, `localhost` and a host list that contains `127.0.0.1`.
- `pinning_follows_the_host_list` (line 459): With `AnyResolver`, a `host` parameter `192.0.2.1,::1` returns the address text `192.0.2.1,::1`.
- `credentials_redact_malformed_values` (line 483, rstest, 2 cases): A numeric password or an unknown field returns `SourceError::Secret` before any connection, and the debug text contains none of the credential values or field names.

#### `tests/integrations/graph/aviation/mod.rs` (311 lines, origin/main)

Crate `hash-integrations-graph-tests`. Other files: `Cargo.toml` (34 lines), `README.md` (11), `turbo.json` (15), `aviation/database.rs` (30), `aviation/fixtures.rs` (145), `aviation/ontology.json` (177), `aviation/snapshots/aviation__aviation.snap` (256). The crate has only dev-dependencies and one test target `aviation` with path `aviation/mod.rs` (`Cargo.toml`, lines 32 to 34).

Fixtures: `libs/@local/integrations/definition/examples/aviation.yaml` through `include_str!` (lines 64 to 66); `tests/integrations/graph/aviation/ontology.json` through `include_str!` (`fixtures.rs`, line 80); the schemas `data_type::VALUE_V1`, `TEXT_V1`, `NUMBER_V1` and `entity_type::LINK_V1` from `hash_graph_test_data` (`fixtures.rs`, lines 83 to 92). No file under `engine/tests/fixtures`. Helpers: `database::pool()` (`database.rs`, line 10) builds a `PostgresStorePool` from the environment; `fixtures::seed(store)` (`fixtures.rs`, line 35) creates the actor, the web and the ontology types and returns `(ActorId, WebId)`; `seed_ontology` (`fixtures.rs`, line 79); `url(kind, name)` (line 37); `provenance()` (line 43); `namespace(web_id)` (line 59); `plan(workspace, web_id)` (line 63) returns the `FinishedPlan`; `read(store, actor, web_id)` (line 149) queries the stored entities; `entity(entities, web_id, kind, source)` (line 190) finds one entity by its derived ID; `assert_data(entities, actor, web_id)` (line 209) holds the assertions and the snapshot. There is no mock: the test talks to a real Graph server and a real Postgres.

- `delivery_replay` (line 274, `#[tokio::test]`, insta JSON snapshot): Sends the six planned aviation writes to a running Graph over HTTP twice, expects `Applied::Created` for every write in the first pass and `Applied::Patched` for every write in the second pass, and after each pass reads the web through the Postgres store and compares the six entities with the snapshot `aviation`.

End-to-end steps:

1. Database connection (line 275; `database.rs`, lines 10 to 30). `pool()` calls `load_env(Environment::Test)` and reads `HASH_GRAPH_PG_USER`, `HASH_GRAPH_PG_PASSWORD`, `HASH_GRAPH_PG_HOST`, `HASH_GRAPH_PG_PORT` and `HASH_GRAPH_PG_DATABASE`, with the defaults `graph`, `graph`, `localhost`, `5432` and `graph`. Lines 276 to 279 acquire one `PostgresStore` connection. The test does not start a database or a Graph server. It uses the database that the running Graph server uses.
2. Policies, actor and web (line 280; `fixtures.rs`, lines 35 to 77). All calls are in-process store calls on the Postgres connection: `seed_system_policies` (lines 36 to 39), `get_or_create_system_machine("h")` (lines 40 to 43), `create_user_actor` as the system machine with `registration_complete: true` (lines 44 to 54). The actor is the new user's machine (line 55). The web is the new user's web (line 56). The machine's `Member` role in the web is removed (lines 57 to 65) and the `Administrator` role is assigned (lines 66 to 74). Every run of the test creates a new user and so a new web.
3. Ontology types (`fixtures.rs`, lines 79 to 145; `ontology.json`). The file defines four data types (`mass` abstract, `kilogram`, `pound`, `date`), four property types (`name`, `model`, `first-flight`, `empty-mass`) and three entity types (`airfield`, `aircraft` with a `based-at` link to `airfield`, and the link type `based-at`), all under `https://example.com/@demo/types`. The primitive data types and the link entity type from `hash_graph_test_data` are added (lines 82 to 92). The types are created through the store with `create_data_types` (lines 98 to 113), `create_property_types` (lines 114 to 128) and `create_entity_types` (lines 129 to 144), each with `OntologyOwnership::Local { web_id }` and `ConflictBehavior::Skip`. On a database that already has these types, the existing types are kept.
4. Namespace (lines 59 to 61). The integration namespace is `aviation/{web_id}`, so entity IDs differ per run.
5. Workspace (lines 281 to 287). `Workspace::open` creates the DuckDB file `aviation.duckdb` in a `TempDir` with `WorkspaceConfig::default()`.
6. Definition and planner (lines 63 to 73). The test parses `aviation.yaml` and builds `Planner::new(web_id, namespace, provenance(), unit_maps)`. The provenance (lines 43 to 57) has source type `Integration`, location name `aviation` and `loaded_at: None`.
7. Source rows (lines 76 to 93). The test does not use `SourceReader`, `CaptureStore` or any capture. For each entity pipeline it takes the SQL query and the primary key from the source definition (lines 77 to 83; a non-SQL source panics) and stages the query as table `source/{source name}` with `workspace.stage_table(table, query, primary_key, TableAssertions::default())` (lines 84 to 93). The example's SQL sources are `VALUES` lists: airfields `ESSA` (Arlanda) and `ESSB` (Bromma); aircraft `SE-XXX` (DC-3, 1946-04-02, 8030 KG, home base ESSA) and `N100` (L-1049, 1957-07-15, 69000 LB, home base ESSA).
8. Entity pipelines (lines 94 to 116). `workspace.prepare_pipeline(pipeline, table, checkpoints)` runs each pipeline (lines 94 to 97). Its checkpoints are collected for later pipelines (line 98). For each sink the test reads `SELECT * FROM "{sink.table}"` (lines 100 to 103) and calls `planner.plan_entities(&sink.sink, rows)` (lines 109 to 114).
9. Link pipelines (lines 117 to 137). `workspace.prepare_link_pipeline(link, checkpoints)` (lines 118 to 121), then `SELECT *` from the link table (lines 122 to 125), then `planner.plan_links(&prepared.pipeline, rows)` (lines 131 to 136).
10. Finish (lines 138 to 146). `plans.finish()` must succeed, and `plan.issues()` must be empty. The plan has six writes: four `UpsertEntity` and two `UpsertLink`.
11. Graph client (lines 289 to 298). `GraphClient::new` gets `http://{HASH_GRAPH_HTTP_HOST}:{HASH_GRAPH_HTTP_PORT}` (defaults `127.0.0.1` and `4000`) and the secret from `HASH_GRAPH_SERVICE_SECRET`. The test panics if the secret variable is not set.
12. Delivery (lines 299 to 308). The outer loop runs over `[Applied::Created, Applied::Patched]`. The inner loop runs over `plan.writes()` in plan order and calls `client.send(actor.into(), write)`. Each call is a separate HTTP request to the Graph's entity API: POST `/entities` with the saved create body, and in the second pass, after the POST returns 409, PATCH `/entities` with the saved patch body. Writes go through the HTTP `GraphClient` only. Because `finish` sorts by `OperationKind`, the four entities are sent before the two links.
13. Read back (line 309; lines 149 to 188). After each pass the test calls `store.query_entities(Some(actor), QueryEntitiesParams { .. })` on the in-process Postgres store. The filter is `EntityQueryPath::WebId` equal to the web ID, the temporal axes are `QueryTemporalAxesUnresolved::live_only()`, `limit` is 100, drafts and permissions are excluded. The result must hold exactly six entities (lines 182 to 186).
14. Assertions (lines 190 to 271). For each of the four records the entity with ID `derive_entity_id(web_id, namespace, type, source ID)` must exist and its `entity_type_ids` must be exactly the expected type (lines 197 to 205). For each aircraft the link with source ID `"{aircraft type}::{tail}::{airfield type}::ESSA"` must exist, must be `Link::Directed`, its source must be the aircraft's entity ID and its target the entity ID of airfield `ESSA` (lines 222 to 241). For every record `metadata.provenance.created_by_id` must equal the actor (line 250).
15. Snapshot (lines 247 to 270; `aviation__aviation.snap`). The snapshot is a JSON map with the keys `aircraft/N100`, `aircraft/SE-XXX`, `airfield/ESSA`, `airfield/ESSB`, `based-at/N100/ESSA` and `based-at/SE-XXX/ESSA`. Each value has `entityTypeIds`, `properties`, `propertyMetadata`, `readOnly`, `archived`, `provenance` (the provided edition provenance) and `link`. It is asserted with `insta::assert_json_snapshot!("aviation", snapshot)` and `sort_maps => true`. The same snapshot is asserted after the first and after the second pass.
16. Redaction. The test uses no insta redactions. Values that change per run are not put into the snapshot: entity IDs are replaced by the names above (also in `link.source` and `link.target`), and record IDs, edition IDs, temporal versioning, `created_by_id` and timestamps are left out. `loadedAt` is absent because the test does not set it.

What the snapshot shows: all six entities have `archived: false` and `readOnly: true`. The provenance is `{"actorType":"machine","origin":{"type":"api"},"sources":[{"location":{"name":"aviation"},"type":"integration"}]}`. Aircraft have `empty-mass` (8030.0 with the kilogram data type, 69000.0 with the pound data type), `first-flight` and `model`. The Graph filled in the property metadata that the planner sent as `dataTypeId: null`: `model` and `name` have the Block Protocol text data type and `first-flight` has the demo `date` data type; each property also has `canonical` and `originalDataTypeId`. Links have empty `properties` and `propertyMetadata.value`.

Answers:

- (a) Sent twice: yes. The same six `PlannedWrite` values are sent a second time in the same order (lines 299 to 308). The second pass must return `Applied::Patched` for every write, so every resend leads to a PATCH request.
- (b) Edition IDs: no. The test does not read or compare edition IDs, temporal versioning or edition counts. It checks that the web still has six live entities and that the snapshot fields are unchanged after the resend. Whether the PATCH of identical content creates a new edition is not tested.
- (c) Update and archive: the patch request is used only as a resend of identical content after a 409. No test changes a property value, removes a property or changes a link and sends that to the Graph. Archive is not sent to the Graph in this test. Archive is covered only by the unit tests with the mock server (`archive` in `graph/client/tests.rs`) and by `archive_payload`.
- (d) How it is run: the turbo task `test:integration` in `tests/integrations/graph/turbo.json` (lines 4 to 7) runs `cargo nextest run --all-features --all-targets` and depends on `^manifest` and `hash-graph#start:test:healthcheck`. The README gives `cargo nextest run -p hash-integrations-graph-tests`. Required environment: `HASH_GRAPH_SERVICE_SECRET` (no default). Optional with defaults: `HASH_GRAPH_HTTP_HOST`, `HASH_GRAPH_HTTP_PORT`, `HASH_GRAPH_PG_USER`, `HASH_GRAPH_PG_PASSWORD`, `HASH_GRAPH_PG_HOST`, `HASH_GRAPH_PG_PORT`, `HASH_GRAPH_PG_DATABASE`. Required services: a migrated Postgres database and a running Graph HTTP server that uses the same database and the same service secret. The README says to use a Graph and a Postgres that are used only for these tests, because the committed ontology types change the type counts of the Graph store test suite, and that CI runs the package as a separate integration-test job. The CI workflow file was not found in the export. MinIO, Vault and Temporal are not needed.

## Part C: reuse per stage

The recommendation is one of: reuse as is, reuse with change, move, rewrite, drop. Decision IDs (A1 to A7, P1 to P14, D1 to D12) refer to `00-overview.md`. Paths are relative to `libs/@local/integrations/` unless they start with `apps/` or `tests/`. `graph/` code is on `main` only, `storage/` and the cited `sources/` code are in the checkout only, so the first implementation step is a branch that has both.

### C1. Stage 1: Capture

| Code | What it does | Recommendation | Reason |
| --- | --- | --- | --- |
| `engine/src/sources/mod.rs:203` `SourceReader::capture_sources` | Captures each live source to Parquet, publishes it under its SHA-256, binds it to the run, and reuses a bound capture | Reuse with change | It already does P10 for captures. It has to return, per source, the `ArtifactRef`, the row count and the byte size, because checkpoint 1 names the files. It has to record the capture time (P14). It has to write the stage marker. |
| `engine/src/sources/mod.rs:172` `SourceCaptures` | Holds the local capture files of one call and deletes them on drop | Reuse with change | It has no public accessor. Stage 1 needs the references, and stage 2 starts from references and has no `SourceCaptures`. |
| `engine/src/sources/mod.rs:90` `CaptureRun` | Web, actor and run ID as three `Uuid` values | Reuse with change | The contracts fix one run ID type. `RunId` of the run interface is a string. |
| `engine/src/sources/mod.rs:98` `CaptureStore`, `:126` `local_file` | Keeps the local source root apart from the capture storage and checks local keys | Reuse as is | Nothing in the decisions changes it. |
| `engine/src/sources/fingerprint.rs:20` `fingerprint` | SHA-256 over every field of a `Source` | Reuse as is | It is part of the capture binding key. With P1 a run's definition is fixed in `input.json`, so the contracts can decide whether the key still needs it. |
| `engine/src/sources/postgres.rs:31` `capture`, `engine/src/sources/rest.rs:86` `capture`, `engine/src/sources/http/` | The Postgres and REST readers with their destination checks, paging and 429 retry | Reuse as is | The overview states that stage 1 is mostly existing code. |
| `engine/src/sources/secrets/mod.rs:50` `SecretStore`, `:70` `GraphVaultSecretStore` | Resolves a User Secret for the run's web and actor | Reuse as is | It is the one dependency that already is a trait with a test implementation. |
| `engine/src/workspace/mod.rs:189` `Workspace::capture` | Writes the rows of a `SELECT` to a new Parquet file | Reuse as is | SQL sources use it. Stage 1 therefore needs a workspace when the definition has an SQL source. |
| `engine/src/capture.rs:39` `SourceCapture`, `:51` `open`, `:72` `copy_from` | A published local Parquet file with its row count and size | Reuse as is | Stage 2 can call `open` on a materialized file. |
| `engine/src/sources/mod.rs:82` `CaptureLimits` | Memory, temporary directory and thread limits of the Postgres connector's database | Reuse as is | No decision touches it. |
| `engine/src/storage/namespace.rs:33` `ArtifactNamespace::capture` | Builds `{root}/captures/{run}/{source}.{fingerprint}.json` | Reuse with change | The proposed layout is `runs/{run}/capture/...`. The contracts choose one. A change of the key is a change of a stored format. |
| `main` only: `engine/src/sources/mod.rs:155` `CaptureStore::path`, `:189` `recovered` | The local directory layout `{captures}/{web}/{run}/{source}.{fingerprint}.parquet` | Drop | The checkout replaces it with `ArtifactStorage`. |

Gaps for stage 1:

- **Capture time.** No type records when a source was read. P14 needs one time per run in checkpoint 1.
- **Clock.** No clock trait or injected time exists in the engine.
- **Stage marker and description.** No `capture/_done.json`, no type for its content, no function that returns an existing marker.
- **Captures of an earlier run without reading a source.** Restore and reconcile skip stage 1 and use run K's captures. `capture_sources` with K's run ID and K's definition returns K's captures when every binding exists. When a binding is missing it reads the live source. A mode that fails in that case does not exist.
- **Row count per source in durable form.** `SourceCapture::rows` exists in memory only. P13 (a `complete` source that returns no rows) needs the count in checkpoint 1 or a recount in stage 2.

### C2. Stage 2: Hash and diff

| Code | What it does | Recommendation | Reason |
| --- | --- | --- | --- |
| `engine/src/storage/artifact/mod.rs:142` `ArtifactStorage::materialize` | Downloads a file by reference and checks its digest | Reuse as is | Stage 2 reads checkpoint 1 and the committed run's hash table this way. |
| `engine/src/sources/mod.rs:295` `SourceReader::stage_sources` | Loads each capture into `_capture/{source}` and stages it as `_source/{source}` with `_op` and `_key` | Reuse with change | Its input is `&SourceCaptures`, which only `capture_sources` builds. Stage 2 has references from checkpoint 1. The body stays. |
| `engine/src/workspace/mod.rs:156` `load_capture`, `:268` `stage_table` | Parquet into a table; staged table with `_op`, `_key`, assertions | Reuse as is | Step 2 of the overview. `load_capture` also loads the committed hash table for the diff. |
| `engine/src/workspace/connection/staging.rs:69` `stage_table` | Adds `'snapshot' AS _op` and the JSON `_key` | Reuse as is | `_key` is a stable row key inside one source. Keeping `_op` leaves room for BE-1033. |
| `engine/src/workspace/mod.rs:297` `prepare_pipeline`, `engine/src/workspace/connection/pipeline.rs:105`, `:24` `execute_pipeline_sql` | Runs SQL steps, branches and definition checkpoints | Reuse as is | The overview keeps SQL in DuckDB unchanged. |
| `engine/src/workspace/connection/pipeline.rs:207` `Execution::sink`, `:245` `hash_expression` | Adds `_content_hash` to a sink table | Reuse with change | The hash expression stays. Step 3 also has to add the entity ID column (A2) and the sink's `StepId`. D1 keeps the hash inputs as they are. |
| `engine/src/workspace/mod.rs:322` `prepare_link_pipeline`, `pipeline.rs:57` | Runs a link pipeline's steps and checks its columns | Reuse with change | Links need a content hash and three ID columns: link, left, right. A link without steps returns the checkpoint's table, so the added columns need a new table. |
| `engine/src/pipeline/mod.rs:75` `PreparedSink`, `:84` `PreparedPipeline`, `:105` `PreparedLink` | Name the output tables of one call | Reuse as is | They are the only way to find a table. Their table names cannot go into a checkpoint, because they differ on every run. |
| `tests/integrations/graph/aviation/mod.rs:63-146` `plan`, `engine/tests/pipeline.rs:502` `definition_aviation_tables` | The loop that stages sources, runs entity pipelines in order, merges definition checkpoints and runs link pipelines | Move | This loop exists only in tests. Stage 2 needs it as engine code. It also has to pass a checkpoint's table as input for a source of kind `Checkpoint`. |
| `engine/src/entity_id.rs:12` `derive_entity_id` | UUID v5 over `{namespace}::{entity type}::{source ID}` | Reuse as is | A2 calls it once per row in step 3. |
| `engine/src/graph/property/mod.rs:116` `SinkRow::text`, `engine/src/graph/property/value.rs:154` `text` | Render the ID column of a row as the source ID text | Move | Step 3 has to produce the same text the planner produces today, or existing entity IDs change. Both functions are visible only inside `graph`. |
| `engine/src/graph/mod.rs:100-112` in `LinkUpsert::new` | Builds the link source ID text and derives the link and endpoint IDs | Move | Step 3 needs the same derivation for link rows. Extract it into a function next to `derive_entity_id`. |
| `engine/src/graph/plan/mod.rs:177` `GraphPlan::source_id`, `PlanIssue::MissingSourceId` | Reports a row without an ID value | Reuse with change | Under A2 this case is found in step 3. The row needs a place in checkpoint 2 or in the issues file. |
| `engine/src/graph/plan/mod.rs:151` duplicate check in `GraphPlan::finish` | Returns the first entity ID that is written twice and no plan | Rewrite | P13 places the duplicate guard in the diff, over the whole integration. One SQL `GROUP BY` on the ID column reports every duplicate. |
| `definition/src/source/mod.rs:85` `Coverage` | `Partial`, `Complete`, `CompleteOrEmpty` | Reuse as is | P13 and D6 read it. The doc comments already state the rule P13 uses. |
| `engine/src/pipeline/mod.rs:9` `TableAssertions`, `staging.rs:117` `check_assertions` | Row count, not-null and uniqueness checks on a staged table | Reuse as is | The definition cannot set them yet, and `stage_sources` passes the default. They are separate from the guards of P13. |
| `engine/src/workspace/mod.rs:189` `Workspace::capture` | Writes a `SELECT` to Parquet | Reuse as is | It can write `diff/hashes.parquet` and `diff/changes/{sink}.parquet` from DuckDB tables. |
| `engine/src/sql.rs:9` `Identifier`, checkout `:31` `literal` | Quote identifiers and string literals for DuckDB | Reuse as is | The diff SQL is generated and reads tables with names such as `_step/{uuid}`. |
| `engine/src/workspace/mod.rs:436` `Workspace::snapshot`, `Format::DuckDb` | Copies the database file | Drop | The plan keeps one hash table per run and no DuckDB file between runs. The method can stay in the crate; the pipeline does not call it. |

Gaps for stage 2:

- **A column computed in Rust.** A2 derives the entity ID in Rust and stores it as a column. `Workspace` has no way to add such a column. `query` returns all rows in memory, and the only way to bring rows into DuckDB is `load_capture` from a Parquet file. Step 3 needs either a registered scalar function, or a Parquet file of `(row key, entity ID)` that is loaded and joined.
- **Link content hash.** Not found. The overview states it.
- **The hash table.** Schema, writer and reader do not exist.
- **The diff.** No join against an earlier run, no labels (insert, update, archive, resend).
- **The guards.** Duplicate entity IDs across sinks, the archive limit for entities and for links, and source coverage do not exist.
- **The resend set.** Nothing reads `current.json`, an earlier run's `writes.parquet` or its `rejected.parquet`.
- **The base run and the resent runs in the marker** (A3).
- **The config hash** (D1). Not found.
- **The "resend everything" flag** (P11) and the operation field (A6).
- **Rows without a source ID.** The diff has to decide whether such a row counts as present.

### C3. Stage 3: Plan writes

| Code | What it does | Recommendation | Reason |
| --- | --- | --- | --- |
| `engine/src/graph/plan/mod.rs:252` `Planner`, `:263` `new` | Holds web, namespace, one provenance and the unit maps | Reuse with change | The provenance parameter already carries `loaded_at`, so P14 needs no change here: the caller passes the capture time. The namespace is no longer needed once IDs come from the row (A2). |
| `engine/src/graph/plan/mod.rs:282` `plan_entities` | One upsert per row; derives the ID from the `entity_id` column | Reuse with change | A2: read the entity ID column. The stage also plans archives and resends from the label column. |
| `engine/src/graph/plan/mod.rs:316` `plan_links` | One link upsert per row; derives three IDs | Reuse with change | A2: read the link ID and both endpoint IDs from columns. |
| `engine/src/graph/property/mod.rs:58` `SinkRow`, `:41` `SinkColumns`, `:74` `resolve` | Read properties from a row of DuckDB values through the accessors | Reuse as is | The accessor rules stay. The input type forces the P9 path: load `changes/{sink}.parquet` into DuckDB and read it with `Workspace::query`, or write a second reader. P9 forbids the second reader. |
| `engine/src/graph/property/value.rs`, `engine/src/graph/property/coerce.rs` | Value conversion and coercions | Reuse as is | No decision changes them. The overview's note on numbers that do not survive a 64-bit float applies to `value.rs:145` `finite`. |
| `engine/src/graph/mod.rs:39` `EntityUpsert`, `:75` `LinkUpsert`, `:122` `Archive`, `:129` `GraphOperation`, `:153` `OperationKind` | Typed operations and their order | Reuse with change | The structs have public fields, so the planner can fill them from ID columns. `EntityUpsert::new` and `LinkUpsert::new` derive IDs and lose their caller under A2. |
| `engine/src/graph/mod.rs:165` `integration_provenance` | Builds the edition provenance | Reuse as is | The caller sets `loaded_at` to the capture time (P14). |
| `engine/src/graph/plan/request.rs:204-246` `Request::upsert`, `:290` `PropertyPatch`, `:277` `PatchEntity` | Builds the create, patch and archive bodies; the patch has one `add` per property and omits `properties` when empty | Rewrite | P7: one replace of the whole property object. `PropertyPatch` needs a replace variant with an empty path, and the patch must send `properties` also when the object is empty. |
| `engine/src/graph/plan/mod.rs:346` link properties `None` when empty | A link without properties keeps the ones it has | Rewrite | It is the same behaviour P7 removes for entities. The contracts should state it for links. |
| `engine/src/graph/plan/request.rs:261` `CreateEntity`, `:300` `ArchiveEntity` | Create and archive bodies | Reuse as is | `readOnly: true` stays; D4 covers the actor. |
| `engine/src/graph/plan/request.rs:36` `Delivery`, `:31` `DELIVERY_VERSION`, `engine/src/graph/plan/mod.rs:47` `Payload` | One JSON object per write that holds create, patch and archive bodies | Reuse with change | Checkpoint 3 stores one row per write in `writes.parquet`. `Payload` needs a way to be built from stored text. A changed patch body needs a new version number. Bulk requests (P8) need the bodies in a form that can be joined into one request. |
| `engine/src/graph/plan/mod.rs:129` `GraphPlan`, `:215` `FinishedPlan`, `:151` `finish` | Collects writes, sorts by kind and entity ID | Reuse with change | The order is the send order the overview needs. Batches and the Parquet output are new. |
| `engine/src/graph/plan/mod.rs:108` `PlanIssue` | A row without an ID, or a property that was left out | Reuse with change | It becomes `plan/issues.parquet`. `row: usize` is a position in a query result with no `ORDER BY`; `_key` or the entity ID identifies a row across attempts. The issue names the entity type and has no sink or link ID. |
| `engine/src/graph/plan/mod.rs:91` `UnencodableRequest` | A request that could not be serialized | Reuse as is | It is a permanent stage error. |

Gaps for stage 3:

- **Reading `changes/{sink}.parquet` as planner rows** (P9). Not found.
- **Planning archives.** The planner has no method for it. An archive needs only the entity ID and the kind (entity or link) from the hash table.
- **Planning a resend.** A resend is an upsert of a row whose hash did not change, so the row's values must be in `changes/{sink}.parquet`.
- **Batches.** No code cuts writes into batches or measures a body against the 2 MB limit.
- **Bulk request bodies.** No type for a bulk create or a bulk patch body.
- **`writes.parquet` and `issues.parquet`.** No schema, no writer. The only code that writes Parquet from Rust values is the private `Spool` in `engine/src/sources/rest.rs:244`.
- **The stage marker.**

### C4. Stage 4: Send and commit

| Code | What it does | Recommendation | Reason |
| --- | --- | --- | --- |
| `engine/src/graph/client/mod.rs:77` `GraphClient::new` | Checks the URL and secret and builds the HTTP client | Reuse as is | No decision changes it. |
| `engine/src/graph/client/mod.rs:114` `GraphClient::send` | Sends one write: create, then patch on 409; archive with 404 as success | Reuse with change | It already tries create and patch at most once each, which is the single-write path of P8. It becomes the path used after a batch fails. It needs a result that separates applied, rejected and temporary failure. |
| `engine/src/graph/client/mod.rs:142` `request`, `:168` `accepted` | Sends one HTTP request; turns a non-2xx status into `GraphError::Status` with the body attached | Reuse with change | A bulk request needs another path (`/entities/bulk`) and a larger timeout than 30 seconds may be needed. |
| `engine/src/graph/client/mod.rs:36` `GraphError`, `:53` `Applied` | The error and the result of one write | Reuse with change | P8 needs a rejected outcome per write and a mapping from `Status { status }` and `Request` to retryable or permanent. Neither exists. |
| `engine/src/graph/plan/request.rs:115` `Payload::requests`, `:69` `SavedRequests` | Read the create, patch and archive bodies back from a payload | Reuse with change | They are visible only inside `graph`, and they read the version 1 envelope. |
| `engine/src/graph/client/tests.rs:47-104` mock `Graph` | An HTTP server that answers POST with one status and other methods with another and records requests | Move | It is the starting point for the fake the overview lists as new. The fake needs state per entity: exists, archived, refuse this ID. |
| `engine/src/progress/mod.rs:20` `Progress` | Counts completed items and logs at an interval | Reuse as is | It can report the send. It is not the progress counter of D8, which would be durable. |
| `orchestration/src/coordination.rs:22` `CoordinationStore`, `:16` `TokenBucket` (`BE-1132`) | A shared token bucket | Reuse as is | D11 defers the rate limit. The send stage can take it later. |
| `engine/src/storage/artifact/binding.rs:28` `bind` | Writes a key only if it is empty | Reuse as is | It can write `send/_done.json` the same way as every other marker. It cannot write `current.json`, which is overwritten. |

Gaps for stage 4:

- **A Graph client trait and an in-memory fake.** The overview lists both. Neither exists.
- **Bulk requests.** The client has none. The Graph has `POST /entities/bulk` and `PATCH /entities/bulk` (`libs/@local/graph/api/src/rest/legacy/entity/mod.rs:325` and `:600` in the checkout).
- **Retry of a failed batch one write at a time, with a cap per write** (P8).
- **A link is rejected when one of its endpoints was rejected in the same run** (P8).
- **`send/rejected.parquet`.** No schema, no writer.
- **`current.json`.** No reader, no writer, no conditional overwrite. `object_store` is used only with `PutMode::Create` (D9).
- **Commit.** Nothing checks the base run or clears the resent runs (A3).
- **Reading `plan/writes.parquet` into writes** (finding 6 in the header).
- **A rejected error kind.** `FailureKind` has `Retryable` and `Permanent`.
- **Entering the "started sending" state.** Nothing records a run in `current.json` before its first write.

### C5. Shared

| Code | What it does | Recommendation | Reason |
| --- | --- | --- | --- |
| `engine/src/storage/artifact/mod.rs:36` `ArtifactStorage`, `:50` `local`, `:66` `s3`, `:110` `publish`, `:142` `materialize` | Content-addressed files in S3 or a local directory | Reuse as is | P10 stores every checkpoint file this way. Both implementations exist behind `object_store::ObjectStore`, so no trait of our own is needed (A5). |
| `engine/src/storage/artifact/binding.rs:28` `bind`, `:50` `bound`, `:14` `Bound` | A conditional write of one `ArtifactRef` at a key, and its read | Reuse as is | A marker can be written with no change: publish the marker JSON as a `Format::Json` artifact, then bind its reference at the marker key. `Bound::Exists` tells a second attempt to read the first marker. All three are `pub(crate)`, which is enough when the stages live in the engine crate. |
| `engine/src/storage/namespace.rs:16` `ArtifactNamespace`, `:22` `new`, `:41` `artifacts` | The integration root and the artifact prefix | Reuse with change | It needs one key builder per marker and one for `current.json`. `{integration}` is a SHA-256 in hex. The overview's layout text should say so. |
| `engine/src/storage/mod.rs:30` `ArtifactKey` | A key that only the namespace can build | Reuse as is | It keeps the layout in one file. |
| `engine/src/storage/artifact/reference.rs:37` `ArtifactRef`, `:12` `Format` | A serializable file reference with key, digest, size and format | Reuse as is | It is the "file reference" shared type of `01-contracts.md` and can be a step output. |
| `engine/src/storage/mod.rs:16` `ArtifactError` | `Read`, `Write`, `Mismatch` | Reuse with change | A stage returns retryable or permanent. `Read` and `Write` cover both a missing object and a failed network call. |
| `engine/src/storage/bucket.rs:5` `S3Bucket` | Bucket URI and credentials | Reuse as is | Configuration of the app. |
| `engine/src/workspace/` (`Workspace`, `WorkspaceConfig`, `Rows`, errors) | The DuckDB workspace | Reuse as is | Stages 1, 2 and 3 use it. The database file is local to one stage call, because table names are random and the plan keeps no DuckDB file. |
| `definition/` (`Definition::from_yaml`, all model types, name types) | The definition model and parser | Reuse as is | P1 stores the YAML text. `Definition` has no serde form, so `input.json` holds the text. |
| `apps/hash-integrations/src/service/run_input.rs:15` `RunInput`, `:8` `Invocation` (`BE-1136`) | The recorded input of a run | Reuse with change | P1 and A6 need the namespace and the operation with its target run. `links_only` has no counterpart in the plan. The type is `pub(crate)` in the app, and the stages need it. |
| `apps/hash-integrations/src/service/mod.rs:49` `IntegrationService`, `start.rs:23` `run_id`, `:41` `admission_key`, `:12` `RETRY_POLICY` (`BE-1136`) | Start, status and cancel of a run; one active run per web and connector | Reuse as is | The overview leaves coordination to the engine. `run_id` gives a UUID text that fits `CaptureRun::id`. |
| `orchestration/src/run.rs:26` `RunFunction`, `:48` `StepContext`, `event.rs:59` `StepFailure`, `:50` `FailureKind`, `name.rs:101` `StepName`, `policy.rs:10` `RetryPolicy` (`BE-1132`) | The run interface | Reuse as is | Each stage call is one `StepContext::run`. The stage's output type must be `Serialize + DeserializeOwned`, and its error must map to `StepFailure { kind, code }`. |
| `apps/hash-integrations` (`main.rs`, `args.rs`, `subcommand/`) | Argument parsing and telemetry with one `completions` subcommand | Reuse with change | The local runner is a new subcommand. The app needs the engine as a dependency and an async `execute`. |
| `tests/integrations/graph/aviation/` | Sends the aviation plan to a real Graph twice and compares six entities with a snapshot | Reuse with change | It is the only test against a real Graph. It does not read edition IDs, so the statement the plan rests on (a resend writes nothing) is not tested. It sets no `loaded_at`, and it sends no update and no archive. The scenarios need all four. |
| `engine/tests/fixtures/*.yaml`, `definition/examples/aviation.yaml`, `engine/tests/fixtures/entity-ids-typescript.json` | Test definitions and recorded entity ID vectors | Reuse as is | The scenarios run over the aviation example. The ID vectors protect A2 against a changed derivation. |
| `engine/src/sources/tests.rs:29` `Server`, `:46` `server` | An HTTP test server on a free local port | Reuse with change | `main` has them as `pub(crate)` for `graph/client/tests.rs`. The checkout narrows them to `pub(super)`, which breaks that import once both branches meet. |
| State version and work manifest records (hashintel/hash#10453) | Not found in the checkout: no file under `libs/@local/integrations` contains `manifest` or `state_version` | Drop | The overview replaces them with `current.json` and the markers. |

Gaps shared by several stages:

- **The marker helper.** A function that returns an existing marker or writes a new one. The pieces exist (`publish`, `bind`, `bound`, `materialize`); the function does not.
- **Checkpoint description types** for the four stages, and the stage input structs.
- **Error kinds.** No type maps `SourceError`, `CaptureError`, `PreparationError`, `StatementError`, `ArtifactError` or `GraphError` to retryable or permanent. All of them are plain enums without a kind.
- **A clock.** Not found.
- **One run ID type.** `Uuid` in `CaptureRun`, `RunId` in the run interface.
- **`input.json`** (P1). Nothing writes the run input to object storage. On `BE-1136` it exists only as the `RunStart::input` payload inside the workflow engine.
- **The operation type** (A6) and the namespace (D3) as run input.
- **A Parquet writer for rows built in Rust.** `Workspace::capture` writes query results. The REST `Spool` is private and writes text columns only.
- **A runner.** No function calls four stages in order. No `RunFunction` implementation and no backend for `Runs`, `Worker` or `StepContext` was found on `BE-1132` or `BE-1136`.
- **A branch that holds `graph/`, `storage/` and `orchestration/` together.** `main` has `graph/`. The checkout has `storage/`. `orchestration/` is on `BE-1132`. The service is on `BE-1136`.
