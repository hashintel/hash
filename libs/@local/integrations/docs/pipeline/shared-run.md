# Integration pipeline: the shared `run` module, the runner and the entry points

**Implementation guidance.** Follow [04-implementation-workflow.md](04-implementation-workflow.md) and [RUST_DESIGN_GUIDELINES.md](RUST_DESIGN_GUIDELINES.md). Stage/step contracts, shared APIs, persisted schemas and behavior remain mandatory. Private functions, local signatures, file layouts and pseudocode are orientation and may be simplified. Test tables are a case inventory; the workflow defines the high-value initial acceptance set.

This spec implements the parts of [`01-contracts.md`](01-contracts.md) that every stage uses, and the two ways a run is started. It names a contract by its section title and does not repeat it.

Paths are relative to `libs/@local/integrations/` unless they start with `apps/` or `libs/`. Line numbers come from four places:

| Code | Read from |
| --- | --- |
| `engine/src/storage`, `engine/src/sources`, every other `engine/` file except `engine/src/graph` | The checkout, `38c7b84926`. The storage and sources files are the same at the BE-933 tip `9c48ffecc9`. |
| `engine/src/graph`, `definition/`, `apps/hash-integrations` marked (main) | `origin/main`, `c47a17eed3` |
| `orchestration/` | `origin/asa/be-1132-orchestration-run-interface`, `da9fb175a8` |
| `apps/hash-integrations/src/service` and files marked (BE-1136) | `pe/be-1136-add-the-integration-service-with-submit-status`, `b053dd6578` |

## 1. Purpose

The `run` module holds the types, error kinds, storage helpers and Parquet helpers that the four stage functions share, and the function `start` that turns a `RunRequest` into the stored `RunInput`. The function `run` calls `start` and the four stages in order. The `hash-integrations` app calls `run` from a new `run` subcommand, and wraps the same five calls in a `RunFunction` for the run interface. A second call with the same run ID finds the stored `RunInput` and the stored stage outputs and continues after the last finished stage.

## 2. Module layout

### Engine: `engine/src/run/`

| File | Holds |
| --- | --- |
| `mod.rs` | The run ID, the request and input types, `RunInput::parse_definition`, `start` with its private helpers, and `run`. |
| `context.rs` | `RunContext` with its helper methods, `SendSettings`, the `Clock` trait and its two implementations. |
| `current.rs` | `Current` and the four functions that read, check and update `current.json`. |
| `marker.rs` | `finished` and `finish`. |
| `table.rs` | `store_query`, `load_table` and `RowFile` with its column types. |
| `error.rs` | `StageError`, `Code`, and one mapping function per error type of the existing engine code. |
| `target.rs` | `Kind`, `Target`, `Change` and `InvalidText`. |
| `tests/mod.rs` | Test helpers that the stage tests also use. It is declared `pub(crate) mod tests` under `#[cfg(test)]`, as `engine/src/storage/mod.rs:4-5` does. |
| `tests/{target,error,marker,table,current,start,scenarios}.rs` | The tests of section 7. |

Visibility of each item. "Exported" means `pub` and re-exported from `engine/src/lib.rs`. Every other item is `pub(crate)` or private, because the workspace warns on `unreachable_pub` (`Cargo.toml:414` in the repository root).

| File | Item | Visibility |
| --- | --- | --- |
| `mod.rs` | `RunId`, `RunRequest`, `OperationRequest`, `RunInput`, `RunInput::parse_definition`, `Operation`, `start`, `run` | Exported |
| `mod.rs` | `resolve`, `parse`, `check_definition`, `stored_input`, `resolved_from` | Private |
| `context.rs` | `RunContext`, `RunContext::new`, `SendSettings`, `Clock`, `SystemClock`, `FixedClock` | Exported |
| `context.rs` | `RunContext::scratch_file`, `publish`, `fetch`, `open_workspace` | `pub(crate)` |
| `current.rs` | `Current`, `read`, `mark_sending`, `check_sending`, `commit` | `pub(crate)` |
| `current.rs` | the conditional update helper | Private |
| `marker.rs` | `finished`, `finish` | `pub(crate)` |
| `table.rs` | `store_query`, `load_table`, `RowFile`, `Column`, `ColumnKind`, `Cell` | `pub(crate)` |
| `table.rs` | `RowFile::write_pending`, `batch`, `check` | Private |
| `error.rs` | `StageError`, `Code` | Exported |
| `error.rs` | `artifact`, `capture`, `statement`, `preparation`, `open`, `close`, `scratch`, `stored_json` | `pub(crate)` |
| `target.rs` | `Kind`, `Target`, `Change`, `InvalidText` | Exported |

`run::run` calls the four stage functions, and each stage module uses `run`. The two modules therefore name each other. `run::run` and the app take the `Graph` trait from `engine/src/graph/`, where the contract "The Graph client" defines it with `GraphResponse`.

### Engine: files outside `run/`

| File | Holds |
| --- | --- |
| `engine/src/storage/namespace.rs` | The key builders of section 4.3. |
| `engine/src/storage/artifact/mutable.rs` (new) | `ArtifactStorage::read_versioned` and `ArtifactStorage::replace_if`, both `pub(crate)`. |

### App: `apps/hash-integrations/src/`

| File | Holds | Visibility |
| --- | --- | --- |
| `subcommand/run.rs` (new) | `RunArgs`, `OperationArgs`, `RunCommandError` and the function `run_command`: the local runner. | `pub` for the clap types, as `subcommand/completions.rs:8` (main); `pub(crate)` for the rest |
| `service/function.rs` (new) | `PipelineFunction`, its `RunFunction` implementation, and `step_failure`. | `pub(crate)` |
| `service/start.rs` | `run_id`, changed, and `interface_run_id`, new. | `pub(crate)` |
| `service/mod.rs` | `Submission` and `submit`, changed. | `pub(crate)` |
| `service/run_input.rs` | Deleted. | |

## 3. Types

### 3.1 Derives and stored forms of the contract types

The contracts give the fields of these types, and the contract "JSON form" gives the rule for the stored JSON. This table adds the derives and the serde attributes that produce those forms.

| Type | Derives | Text form | JSON form |
| --- | --- | --- | --- |
| `RunId` | `Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, derive_more::Display, derive_more::From, derive_more::Into` | `Display` writes the UUID in hyphenated lowercase form, for example `00000000-0000-4000-8000-0000000000a1`. `FromStr` calls `Uuid::try_parse` and has `Err = uuid::Error`. | `#[serde(transparent)]`: the text form as a JSON string. |
| `Kind` | `Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize` | `entity`, `link`. `Display` and `FromStr` use the same text. `FromStr` has `Err = InvalidText`. | `#[serde(rename_all = "lowercase")]`: the text form. |
| `Change` | The same as `Kind`. | `insert`, `update`, `resend`, `archive`, with `Display` and `FromStr` as for `Kind`. | `#[serde(rename_all = "lowercase")]`: the text form. |
| `Target` | `Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, derive_more::Display` with `#[display("{kind}/{id}")]` | `{kind}/{id}`, for example `entity/sink-aircraft`. `FromStr` has `Err = InvalidText`. | `#[serde(try_from = "String", into = "String")]`: the text form. A `Target` can therefore be the key of a JSON object, which `DiffOutput::targets` needs. |
| `RunRequest`, `RunInput` | `Debug, Clone, PartialEq, Eq, Serialize, Deserialize` | None. | `#[serde(deny_unknown_fields)]`, as `ArtifactRefV1` has (`engine/src/storage/artifact/reference.rs:45`). The field names are the Rust field names. |
| `OperationRequest`, `Operation` | `Debug, Clone, PartialEq, Eq, Serialize, Deserialize` | None. | `#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]`. The tag values are `apply`, `restore` and `reconcile`. |
| `Current` | `Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize` | None. | `#[serde(deny_unknown_fields)]`. `Current::default()` is the empty value of the contract "`current.json`". |
| `StageError` | `Debug, Clone, Copy, PartialEq, Eq, derive_more::Display, derive_more::Error` | `Retryable` displays as `the stage failed and another attempt can succeed`. `Permanent` displays as `the stage failed and no attempt with this input can succeed`. | None. |
| `Column`, `ColumnKind` | `Debug, Clone, Copy, PartialEq, Eq` | None. | None. |
| `Cell` | `Debug, Clone, PartialEq, Eq` | None. | None. |

Ordering:

- `Kind` orders `Entity` before `Link`. `Change` orders `Insert`, `Update`, `Resend`, `Archive`. Both orders are the declaration order.
- `Target` orders by kind, then by ID. This is also the order of the text forms, so a `BTreeMap<Target, _>` is written to JSON with every `entity/…` key before every `link/…` key.
- `RunId` orders by the bytes of the UUID. No rule of the pipeline reads this order. The order in which runs started sending is the position in `Current::sending`.

`RunId` converts to and from `Uuid` with `From`. Every key and every JSON value uses the `Display` form.

Rules of the JSON form that hold for every stored type, also for the outputs the stage specs define:

- The field names are the Rust field names. No `rename_all` is set on a struct.
- A time field of type `OffsetDateTime` carries `#[serde(with = "time::serde::rfc3339")]`, so it is written in RFC 3339 form, for example `"2026-11-06T12:00:00Z"`.
- The stored JSON has no version tag (D13).
- `ConnectorId` and `SourceName` are written as their text form. The definition crate adds that serde form (section 5.2).

`OperationKind::as_str` and `OperationKind::from_stored` are defined in `engine/src/graph/mod.rs` by the stage 3 spec. Neither `run` nor the runner calls them.

Examples of the JSON forms, as `serde_json::to_vec` writes them:

```json
{"run":"00000000-0000-4000-8000-0000000000a1","web":"00000000-0000-4000-8000-000000000001","connector":"aviation","actor":"00000000-0000-4000-8000-000000000002","operation":{"kind":"apply","resend_all":false},"definition":"connector: aviation\n","namespace":"aviation","allow_mass_archive":false}
```

```json
{"kind":"apply","definition":"connector: aviation\n","namespace":"aviation","resend_all":false}
{"kind":"restore","target":"00000000-0000-4000-8000-0000000000a1"}
{"kind":"restore","target":null}
{"kind":"reconcile"}
{"kind":"reconcile","target":"00000000-0000-4000-8000-0000000000a1"}
```

```json
{"committed":"00000000-0000-4000-8000-0000000000a1","sending":["00000000-0000-4000-8000-0000000000a2"]}
```

The first block is a `RunInput`. Its 296 bytes have the SHA-256 `1c46ed691535acb5e3e56123c0c175fef476b83fd6bcea9b3de83748deca6cb0`. In the second block, lines 1 to 4 are `OperationRequest` values and lines 2, 3 and 5 are `Operation` values. The third block is a `Current`.

### 3.2 New types in `run/target.rs`

```rust
/// Reports that a stored text is not the text form of the type it was read as.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
#[display("`{text}` is not {expected}")]
pub struct InvalidText {
    /// The text that was read.
    pub text: Box<str>,
    /// The form that was expected, such as "`entity` or `link`".
    pub expected: &'static str,
}

impl Kind {
    /// The stored text: `entity` or `link`.
    pub const fn as_str(self) -> &'static str;
}

impl Change {
    /// The stored text: `insert`, `update`, `resend` or `archive`.
    pub const fn as_str(self) -> &'static str;
}

impl Target {
    /// The target of kind `kind` whose step ID or link ID is `id`.
    pub fn new(kind: Kind, id: &str) -> Result<Self, InvalidText>;
    /// The target of the sink step `step`.
    pub fn entity(step: &StepId) -> Self;
    /// The target of the link pipeline `link`.
    pub fn link(link: &LinkId) -> Self;
    pub const fn kind(&self) -> Kind;
    /// The step ID or link ID, as stored in the `target` column of the hash table.
    pub fn id(&self) -> &str;
}
```

The `expected` texts are `` `entity` or `link` ``, `` `insert`, `update`, `resend` or `archive` `` and ``a target such as `entity/sink-aircraft` ``.

### 3.3 New types in `run/error.rs`

```rust
/// Names why a stage failed. The run interface stores it, and the local runner prints it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, derive_more::Display)]
pub enum Code {
    #[display("invalid_definition")]
    InvalidDefinition,
    #[display("target_missing")]
    TargetMissing,
    #[display("nothing_committed")]
    NothingCommitted,
    #[display("duplicate_entity_id")]
    DuplicateEntityId,
    #[display("archive_limit")]
    ArchiveLimit,
    #[display("base_moved")]
    BaseMoved,
    #[display("superseded")]
    Superseded,
    /// The run ID has a stored input that another request produced.
    #[display("request_mismatch")]
    RequestMismatch,
    /// The request and its definition name different connectors, or the request is for
    /// another integration than the `RunContext`.
    #[display("integration_mismatch")]
    IntegrationMismatch,
    /// A target's table has a column with a reserved name.
    #[display("reserved_column")]
    ReservedColumn,
    /// A run named by `current.json` lacks a marker a stage has to read.
    #[display("marker_missing")]
    MarkerMissing,
    /// Object storage could not be read or written.
    #[display("storage_unavailable")]
    StorageUnavailable,
    /// A stored object does not match its reference.
    #[display("storage_mismatch")]
    StorageMismatch,
    /// A marker body or `current.json` is not the JSON form of its type.
    #[display("stored_json_invalid")]
    StoredJsonInvalid,
    /// A file in the scratch directory could not be read or written.
    #[display("scratch_unavailable")]
    ScratchUnavailable,
    /// The workspace could not be opened, closed or used.
    #[display("workspace_unavailable")]
    WorkspaceUnavailable,
    /// DuckDB cannot run a query as written.
    #[display("query_invalid")]
    QueryInvalid,
    /// A value in the rows made a query fail.
    #[display("data_invalid")]
    DataInvalid,
    /// A row passed to a `RowFile` does not fit its columns.
    #[display("row_invalid")]
    RowInvalid,
}

impl Code {
    /// Every code, in declaration order.
    pub const ALL: [Self; mem::variant_count::<Self>()];
    /// The text the `Display` implementation writes.
    pub const fn as_str(self) -> &'static str;
    /// The kind of every stage error that carries this code.
    pub const fn kind(self) -> StageError;
    /// A new report of this code's kind that carries this code.
    pub fn report(self) -> Report<StageError>;
    /// Puts this code and its kind on top of `report`.
    pub fn wrap<C>(self, report: Report<C>) -> Report<StageError>;
    /// The code that was put on `report` last, if it carries one.
    pub fn of(report: &Report<StageError>) -> Option<Self>;
}
```

The first eleven variants are the codes of the table in the contract "Errors". `reserved_column` and `marker_missing` are raised by stage 2, and this spec only declares them. The eight variants after them are the codes of the shared mapping functions and of `RowFile`.

Each stage spec adds further variants: one for every failure that only that stage raises, each with its text, its kind and its entry in `ALL`. `ALL` therefore has no fixed length in this spec. Its length is `mem::variant_count::<Self>()`, which the engine already uses for such arrays (`engine/src/workspace/error.rs:24`), so a variant that is missing from `ALL` does not compile.

### 3.4 New types in `run/context.rs`

```rust
/// How often and how fast stage 4 repeats a request to the Graph.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SendSettings {
    /// How many times one request is sent before the stage gives up on it. At least 1.
    pub max_attempts: u32,
    /// The wait after the first attempt.
    pub first_wait: Duration,
    /// The longest wait between two attempts.
    pub longest_wait: Duration,
}

impl Default for SendSettings {
    /// 5 attempts, a first wait of 500 ms and a longest wait of 30 s.
    fn default() -> Self;
}

/// Reads the time from the operating system.
#[derive(Debug, Clone, Copy, Default)]
pub struct SystemClock;

/// Returns the same time on every call. Tests use it.
#[derive(Debug, Clone, Copy)]
pub struct FixedClock(pub OffsetDateTime);
```

`SendSettings` is the field `send` of `RunContext` and an argument of `RunContext::new`. `run/context.rs` holds the type and its `Default`. The stage 4 spec holds the code that reads the fields, such as the wait after a given number of attempts.

`RunContext` has the fields of the contract "Stage functions". `Clock` has no `Debug` supertrait, so `RunContext` implements `Debug` by hand and writes every field except `clock`, ending with `finish_non_exhaustive()`.

### 3.5 Private fields of `RowFile` in `run/table.rs`

```rust
pub(crate) struct RowFile {
    /// The columns every row is checked against.
    columns: Box<[Column]>,
    /// The path the finished file is moved to: `{scratch}/{uuid v4}.parquet`.
    target: PathBuf,
    /// Writes to the temporary file that `SourceCapture::stage` created beside `target`.
    writer: ArrowWriter<NamedTempFile>,
    /// The rows that are not yet written as a record batch.
    pending: Vec<Box<[Cell]>>,
    /// The bytes of the text cells in `pending`.
    pending_bytes: usize,
    /// The rows pushed so far.
    rows: u64,
}
```

`RowFile` is `Send`. Dropping it without `close` or `store` deletes the temporary file, because `NamedTempFile` deletes its file on drop.

### 3.6 New types in the app

```rust
// apps/hash-integrations/src/subcommand/run.rs

/// Arguments of the `run` subcommand. Section 4.11 lists every argument.
#[derive(Debug, clap::Parser)]
pub struct RunArgs { /* section 4.11 */ }

/// The operation of the run, as a subcommand of `run`.
#[derive(Debug, clap::Subcommand)]
pub enum OperationArgs {
    Apply { definition: PathBuf, namespace: Box<str>, resend_all: bool },
    Restore { target: Option<Uuid>, empty: bool },
    Reconcile,
}

/// Why the `run` subcommand failed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub(crate) enum RunCommandError {
    /// The definition file could not be read, or storage, sources, Vault or the Graph client
    /// could not be set up.
    #[display("the run could not be set up")]
    Setup,
    /// `run` returned an error. The report keeps the `StageError` and its code.
    #[display("the run failed")]
    Stage,
}
```

```rust
// apps/hash-integrations/src/service/function.rs

/// Runs the pipeline as the steps of the run interface.
pub(crate) struct PipelineFunction<S, G> {
    /// The web this node serves. A request for another web fails.
    web: WebId,
    storage: ArtifactStorage,
    /// The directory in which each run gets its own scratch directory.
    scratch: PathBuf,
    workspace: WorkspaceConfig,
    send: SendSettings,
    /// Reads sources and stores captures in a clone of `storage`.
    sources: SourceReader,
    secrets: S,
    graph: G,
}
```

`PipelineFunction` has the two type parameters because `SecretStore` and `Graph` each have a production implementation and a test implementation, and the engine functions take them as `&impl` parameters. `IntegrationService<R>` uses the same form (`apps/hash-integrations/src/service/mod.rs:49`, BE-1136). `Graph`, `GraphResponse` and `GraphClient` are imported from `hash_integrations_engine`.

```rust
// apps/hash-integrations/src/service/mod.rs, replaces `Submission` at :25-28 (BE-1136)

/// What to run, and for which connector.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Submission {
    pub connector: ConnectorId,
    pub operation: OperationRequest,
    pub allow_mass_archive: bool,
}
```

## 4. Functions

Every function that returns `Report<StageError>` builds its error with `Code::report` or with a mapping function of section 4.2. The error lists below name a code, and section 6 gives the kind of each code.

### 4.1 `Kind`, `Change`, `Target`, `RunId`

`Target::new(kind: Kind, id: &str) -> Result<Target, InvalidText>`

1. It parses `id` as a `StepId` when `kind` is `Entity` and as a `LinkId` when `kind` is `Link` (`definition/src/name.rs:129`, `:144`, main). Both accept one name of at most 64 bytes that matches `[a-z0-9][a-z0-9_-]*`.
2. It returns `InvalidText` when the parse fails, and the target with `id` copied otherwise.

`impl FromStr for Target`

1. It splits the text at the first `/`. A text without `/` is `InvalidText`.
2. It parses the part before the `/` as a `Kind` and passes the rest to `Target::new`.

```rust
impl FromStr for Target {
    type Err = InvalidText;

    fn from_str(text: &str) -> Result<Self, InvalidText> {
        let invalid = || InvalidText { text: text.into(), expected: "a target such as `entity/sink-aircraft`" };
        let (kind, id) = text.split_once('/').ok_or_else(invalid)?;
        Self::new(kind.parse().map_err(|_error| invalid())?, id).map_err(|_error| invalid())
    }
}
```

`TryFrom<String> for Target` calls `from_str`. `From<Target> for String` calls `to_string`. `Target::entity` and `Target::link` copy the text of an ID the definition crate has already checked.

`Kind::from_str` and `Change::from_str` compare the text with each stored text and return `InvalidText` for any other text. They do not change the letter case and do not trim.

### 4.2 `run/error.rs`

`Code::kind(self) -> StageError` returns the kind in the table of section 6.

`Code::report`, `Code::wrap`, `Code::of`:

```rust
pub fn report(self) -> Report<StageError> {
    Report::new(self.kind()).attach(self)
}

pub fn wrap<C>(self, report: Report<C>) -> Report<StageError> {
    report.change_context(self.kind()).attach(self)
}

pub fn of(report: &Report<StageError>) -> Option<Self> {
    report.downcast_ref::<Self>().copied()
}
```

- `attach` stores the code as a printed attachment (`libs/error-stack/src/report.rs:533`), so the code appears when the report is logged.
- `downcast_ref` returns the first matching frame from the top of the report (`libs/error-stack/src/report.rs:702`). `Code::of` therefore returns the code that was attached last.
- A function that receives a `Report<StageError>` passes it on with `?` and attaches no second code.

The mapping functions. Each takes the report of one existing error type and returns `Report<StageError>`. A stage calls it in `map_err`:

```rust
let artifact = context.storage.bound(key).await.map_err(error::artifact)?;
```

| Function | Signature |
| --- | --- |
| `artifact` | `fn artifact(report: Report<ArtifactError>) -> Report<StageError>` |
| `capture` | `fn capture(report: Report<CaptureError>) -> Report<StageError>` |
| `statement` | `fn statement(report: Report<StatementError>) -> Report<StageError>` |
| `preparation` | `fn preparation(report: Report<PreparationError>) -> Report<StageError>` |
| `open` | `fn open(report: Report<OpenError>) -> Report<StageError>` |
| `close` | `fn close(report: Report<CloseError>) -> Report<StageError>` |
| `scratch` | `fn scratch<E: Error + Send + Sync + 'static>(error: E) -> Report<StageError>` |
| `stored_json` | `fn stored_json(error: serde_json::Error) -> Report<StageError>` |

The shared mappings use the following steps; `preparation` first resolves step wrappers as specified below:

1. It reads `report.current_context()`.
2. It picks the code from the table of section 6. For the rows that say "the code of the statement", it calls `report.downcast_ref::<StatementError>()` and uses the code the `statement` row gives for that value.
3. It returns `code.wrap(report)`.

```rust
pub(crate) fn capture(report: Report<CaptureError>) -> Report<StageError> {
    let code = match report.current_context() {
        CaptureError::InvalidData => Code::DataInvalid,
        CaptureError::Query => report
            .downcast_ref::<StatementError>()
            .map_or(Code::WorkspaceUnavailable, statement_code),
        CaptureError::Read
        | CaptureError::Write
        | CaptureError::SyncDirectory { .. }
        | CaptureError::Exists { .. }
        | CaptureError::WorkspaceFile { .. } => Code::ScratchUnavailable,
        CaptureError::DiskUsage | CaptureError::Cancelled | CaptureError::Stopped => {
            Code::WorkspaceUnavailable
        }
    };
    code.wrap(report)
}
```

`statement_code(error: &StatementError) -> Code` is a private function that holds the `statement` rows of section 6. `statement`, `capture` and `preparation` call it.

`error::preparation` must not classify only the top `PreparationError::Step`. Iterate the report frames from newest to oldest, read each `PreparationError` frame, and skip `Step` wrappers to select the nearest underlying preparation cause. Map `ReservedColumn` to permanent `reserved_column`; map the other causes by section 6. Only `Statement` (or a Step with no underlying preparation cause) uses the StatementError lookup and fallback. `Report::downcast_ref::<PreparationError>()` alone is insufficient because it returns the outer Step. Preserve the report chain when applying the chosen Code. Test the mapping through entity-sink preparation and link preparation, not merely a constructed bare ReservedColumn.

`scratch` returns `Code::ScratchUnavailable.wrap(Report::new(error))`. Its callers pass a `std::io::Error`, a `parquet::errors::ParquetError`, the Arrow error that `RecordBatch::try_from_iter_with_nullable` returns, or a `tokio::task::JoinError`. `stored_json` returns `Code::StoredJsonInvalid.wrap(Report::new(error))`.

A mapping function for an error type that one stage alone calls, such as `SourceError` or the Graph client's error, is specified by that stage and follows the same three steps.

### 4.3 Key builders in `engine/src/storage/namespace.rs`

`{root}` is the value of `ArtifactNamespace::root` (`engine/src/storage/namespace.rs:25`). `{run}` is the hyphenated lowercase UUID. Every builder is `pub(crate)` and takes the run as a `Uuid`, as `capture` does today (`engine/src/storage/namespace.rs:33`). A caller passes `Uuid::from(run_id)`.

| Builder | Key |
| --- | --- |
| `fn current(&self) -> ArtifactKey` | `{root}/current.json` |
| `fn input(&self, run: Uuid) -> ArtifactKey` | `{root}/runs/{run}/input.json` |
| `fn capture(&self, run: Uuid, source: &SourceName, fingerprint: &str) -> ArtifactKey` | `{root}/runs/{run}/capture/{source}.{fingerprint}.json` |
| `fn capture_output(&self, run: Uuid) -> ArtifactKey` | `{root}/runs/{run}/capture/_done.json` |
| `fn diff_output(&self, run: Uuid) -> ArtifactKey` | `{root}/runs/{run}/diff/_done.json` |
| `fn plan_output(&self, run: Uuid) -> ArtifactKey` | `{root}/runs/{run}/plan/_done.json` |
| `fn send_output(&self, run: Uuid) -> ArtifactKey` | `{root}/runs/{run}/send/_done.json` |

A private `fn run(&self, run: Uuid, rest: &str) -> ArtifactKey` writes `{root}/runs/{run}/{rest}`. The six builders that take a run call it. A source name matches `[a-z0-9][a-z0-9_-]*` (`definition/src/name.rs:114-119`, main), so no capture binding key equals `capture/_done.json`.

For web `00000000-0000-4000-8000-000000000001` and connector `aviation`, `{root}` is `tenants/00000000-0000-4000-8000-000000000001/integrations/615b1c9940913ae65656b12d3e9936aba1e0fdbfb11754db10afd6bcb52e8f59`.

### 4.4 Conditional mutable storage

`ArtifactStorage` gains two concrete methods in `storage/artifact/mutable.rs`. Immutable artifacts and bindings keep their existing implementation. There is no unconditional mutable write API.

```rust
pub(crate) struct MutableObject {
    pub bytes: Bytes,
    pub version: MutableVersion,
}

pub(crate) enum MutableVersion {
    Object(object_store::UpdateVersion),
    Local(Sha256Digest),
}

impl ArtifactStorage {
    pub(crate) async fn read_versioned(&self, key: &ArtifactKey)
        -> Result<Option<MutableObject>, Report<ArtifactError>>;

    /// Returns false only when the expected state no longer matches.
    pub(crate) async fn replace_if(
        &self,
        key: &ArtifactKey,
        expected: Option<&MutableVersion>,
        bytes: Bytes,
    ) -> Result<bool, Report<ArtifactError>>;
}
```

`None` means the key must be absent. An existing object's token belongs to the bytes returned by that same read. Both reads and replacement payloads are limited to 1,048,576 bytes. Only not-found means absence; authentication, IO, unsupported atomic operations and other storage errors fail the operation. A version for another backend is rejected. `ArtifactStorage` records the local root in its local constructor; an S3 staging directory is never treated as local mutable storage.

**S3:** `read_versioned` uses one `get`, returning its bytes and `UpdateVersion { e_tag: meta.e_tag, version: meta.version }`. Preserve both token fields when supplied. `replace_if` uses `put_opts` with `PutMode::Create` for absence or `PutMode::Update` for an existing token. `AlreadyExists` and `Precondition` return `false`; other errors return `ArtifactError::Write`. A missing usable update token is an error, never permission to overwrite. A successful put returns `true`.

**Local:** use an exclusive cross-process file lock on a stable sidecar of the key, for example `current.json.lock`. Every read and conditional replacement opens and locks that same sidecar; never delete it or lock the `current.json` inode that will be replaced. Under the lock, read the complete current file, enforce the size limit and compute its SHA-256. Compare absence or that digest with `expected`. On a mismatch return `false` without writing. Otherwise write a temporary file beside the destination, sync the temporary file, atomically rename it over the destination, sync the containing directory, and release the lock. Readers return bytes and digest under the same lock. All blocking lock/file work runs in `spawn_blocking`; closing the OS file handle or process exit releases the OS lock. Dropping a Tokio JoinHandle does not stop a blocking task: it may finish a conditional update, which the next attempt recovers by reading current state. Unsupported locking or atomic replacement fails closed. Lock-file creation alone is not a lock.

The local token identifies the current bytes; a change back to identical bytes is equivalent for these state predicates. `Current` transitions never deliberately rewind a committed run. Temporary files left by a crashed writer do not become current state. Do not implement conditional replacement as a separate unlocked read followed by `put` or rename.

Errors are `ArtifactError::Read` or `ArtifactError::Write`, retaining the underlying cause. An ambiguous response is not a conflict: propagate it and let the stage retry by reading current state. The idempotent rules in section 4.8 recover an update that succeeded before its response was lost.

### 4.5 `run/context.rs`

`RunContext::new(storage: ArtifactStorage, web: WebId, connector: &ConnectorId, scratch: PathBuf, workspace: WorkspaceConfig, send: SendSettings, clock: Box<dyn Clock>) -> RunContext`

1. It sets `namespace` to `ArtifactNamespace::new(web.into(), connector)` (`engine/src/storage/namespace.rs:22`) and copies the other arguments into their fields.

`SendSettings::default()` returns `max_attempts: 5`, `first_wait: Duration::from_millis(500)` and `longest_wait: Duration::from_secs(30)`. Both entry points pass the default. A test of stage 4 passes its own value in the `send` field.

A caller that also builds a `SourceReader` gives its `CaptureStore` a clone of the storage it gives to `RunContext::new`. The capture files and the markers are then under one storage root.

The caller creates the directory `scratch` before the first stage runs and deletes it after the run function returns. Nothing in a stage relies on a file that an earlier call left in `scratch`.

Files in `scratch`:

| File | Written by | Removed by |
| --- | --- | --- |
| `{scratch}/{uuid v4}.json` | `finish`, for the marker body | `RunContext::publish` |
| `{scratch}/{uuid v4}.parquet` | `store_query`, `RowFile` | `RunContext::publish`. A file that `RowFile::close` returns stays until the caller deletes `scratch`. |
| `{scratch}/{uuid v4}.duckdb`, with `.wal`, `.tmp` and `.lock` beside it (`engine/src/workspace/files.rs:46-52`) | `RunContext::open_workspace` | The caller, with `scratch` |
| `{scratch}/{artifact key}` | `RunContext::fetch` | The caller, with `scratch` |

`RunContext::scratch_file(&self, format: Format) -> PathBuf` returns `ArtifactStorage::staging_file(&self.scratch, format)` (`engine/src/storage/artifact/mod.rs:95`). Each call returns a new path.

`RunContext::publish(&self, path: &Path, format: Format) -> Result<ArtifactRef, Report<StageError>>`

1. It calls `self.storage.publish(&self.namespace.artifacts(), path, format)` (`engine/src/storage/artifact/mod.rs:110`).
2. It deletes the file at `path` with `tokio::fs::remove_file`, whether or not step 1 succeeded, and ignores the result of the delete.
3. It returns the reference, or the error of step 1 through `error::artifact`.

`RunContext::fetch(&self, artifact: &ArtifactRef) -> Result<PathBuf, Report<StageError>>`

1. It calls `self.storage.materialize(artifact, &self.scratch)` (`engine/src/storage/artifact/mod.rs:142`) and maps the error with `error::artifact`. A second call for the same artifact returns the file of the first call (`engine/src/storage/artifact/mod.rs:152-154`).

`RunContext::open_workspace(&self, variables: Variables) -> Result<Workspace, Report<StageError>>`

1. It builds `WorkspaceConfig { variables, ..self.workspace.clone() }`. The `variables` of `self.workspace` are not used, because the `$NAME` parameters belong to the run's definition (`Definition::variables`, `definition/src/definition/mod.rs:92`, main).
2. It calls `Workspace::open(self.scratch_file(Format::DuckDb), config)` (`engine/src/workspace/mod.rs:222`) and maps the error with `error::open`.

A stage closes the workspace with `workspace.close().await.map_err(error::close)?` (`engine/src/workspace/mod.rs:455`).

```rust
pub(crate) async fn open_workspace(&self, variables: Variables) -> Result<Workspace, Report<StageError>> {
    let config = WorkspaceConfig { variables, ..self.workspace.clone() };
    Workspace::open(self.scratch_file(Format::DuckDb), config).await.map_err(error::open)
}
```

Errors: `publish` and `fetch` return `storage_unavailable` or `storage_mismatch`. `open_workspace` returns `workspace_unavailable`.

`SystemClock::now` returns `OffsetDateTime::now_utc()`. `FixedClock::now` returns its field.

### 4.6 `run/marker.rs`

`finished` and `finish` have the signatures of the contract "Marker functions".

`finished`:

1. It calls `context.storage.bound(key)` (`engine/src/storage/artifact/binding.rs:50`). `None` gives `Ok(None)`.
2. It downloads the bound artifact with `context.fetch`.
3. It reads the file with `tokio::fs::read`.
4. It decodes the bytes with `serde_json::from_slice` and returns the value.

```rust
pub(crate) async fn finished<T: DeserializeOwned>(
    context: &RunContext,
    key: &ArtifactKey,
) -> Result<Option<T>, Report<StageError>> {
    let Some(artifact) = context.storage.bound(key).await.map_err(error::artifact)? else {
        return Ok(None);
    };
    let path = context.fetch(&artifact).await?;
    let bytes = tokio::fs::read(&path).await.map_err(error::scratch)?;
    serde_json::from_slice(&bytes).map(Some).map_err(error::stored_json)
}
```

`finish`:

1. It encodes `output` with `serde_json::to_vec`.
2. It writes the bytes to `context.scratch_file(Format::Json)`.
3. It stores the file with `context.publish(&path, Format::Json)`. The marker body is then at `{root}/artifacts/sha256/{xx}/{sha256}.json`.
4. It calls `context.storage.bind(key, &artifact)` (`engine/src/storage/artifact/binding.rs:28`).
5. On `Bound::Created` it decodes the bytes of step 1 and returns the value. The function has no `Clone` bound, and decoding also checks that the stored body can be read back.
6. On `Bound::Exists` it calls `finished(context, key)` and returns that value. If `finished` returns `None`, it returns `storage_unavailable`.

```rust
pub(crate) async fn finish<T: Serialize + DeserializeOwned>(
    context: &RunContext,
    key: &ArtifactKey,
    output: &T,
) -> Result<T, Report<StageError>> {
    let bytes = serde_json::to_vec(output).map_err(error::stored_json)?;
    let path = context.scratch_file(Format::Json);
    tokio::fs::write(&path, &bytes).await.map_err(error::scratch)?;
    let artifact = context.publish(&path, Format::Json).await?;
    match context.storage.bind(key, &artifact).await.map_err(error::artifact)? {
        Bound::Created => serde_json::from_slice(&bytes).map_err(error::stored_json),
        Bound::Exists => finished(context, key)
            .await?
            .ok_or_else(|| Code::StorageUnavailable.report()),
    }
}
```

Two attempts that produce equal outputs encode equal marker bytes, because every map in an output is a `BTreeMap`, and they publish one marker-body artifact. Equivalent Parquet tables can have different artifact references and therefore different marker bodies (CR-3). The binding still selects one complete output: the losing attempt returns the winning marker and all downstream stages read its references.

Errors of both functions: `storage_unavailable`, `storage_mismatch`, `scratch_unavailable`, `stored_json_invalid`.

### 4.7 `run/table.rs`

`store_query`, `load_table` and the methods of `RowFile` have the signatures of the contract "Tables as files".

`store_query`:

1. It calls `workspace.capture(sql, context.scratch_file(Format::Parquet))` (`engine/src/workspace/mod.rs:189`) and maps the error with `error::capture`.
2. It returns `context.publish(capture.path(), Format::Parquet)`.

```rust
pub(crate) async fn store_query(
    context: &RunContext,
    workspace: &Workspace,
    sql: Box<str>,
) -> Result<ArtifactRef, Report<StageError>> {
    let target = context.scratch_file(Format::Parquet);
    let capture = workspace.capture(sql, target).await.map_err(error::capture)?;
    context.publish(capture.path(), Format::Parquet).await
}
```

- `Workspace::capture` writes Snappy-compressed Parquet. A row group ends after 65,536 rows, or earlier when the writer holds 8 MiB of encoded data (`engine/src/workspace/connection/capture.rs:61-64`, `:78-80`).
- `Workspace::capture` deletes its temporary file when the query fails (test `capture_failed_query_cleanup`, `engine/tests/capture.rs:309`).
- A query that returns no rows gives a file with the columns of the query and no row group (test `capture_empty_schema`, `engine/tests/capture.rs:258`).
- The caller gives `sql` an `ORDER BY`. `store_query` adds none.

Errors: `query_invalid`, `data_invalid`, `workspace_unavailable`, `scratch_unavailable`, `storage_unavailable`, `storage_mismatch`.

`load_table`:

1. It downloads the file with `context.fetch(file)`.
2. It calls `SourceCapture::open(path)` (`engine/src/capture.rs:51`) and maps the error with `error::capture`.
3. It calls `workspace.load_capture(capture, table)` (`engine/src/workspace/mod.rs:156`) and maps the error with `error::capture`.

```rust
pub(crate) async fn load_table(
    context: &RunContext,
    workspace: &Workspace,
    file: &ArtifactRef,
    table: Box<str>,
) -> Result<(), Report<StageError>> {
    let path = context.fetch(file).await?;
    let capture = SourceCapture::open(path).map_err(error::capture)?;
    workspace.load_capture(capture, table).await.map_err(error::capture)
}
```

`load_capture` replaces a table of the same name and creates the columns of the file also when the file has no rows (`engine/src/workspace/connection/capture.rs:164-173`, test `load_capture_types_and_empty_schema`, `engine/tests/capture.rs:465`).

Errors: `storage_unavailable`, `storage_mismatch`, `scratch_unavailable`, `workspace_unavailable`.

`RowFile` takes four things from `Spool` (`engine/src/sources/rest.rs:244`): the record batch built with `RecordBatch::try_from_iter_with_nullable` (`:329`), the writer properties (`:356-359`), the batch of 1,024 rows (`:375`), and the row group that is flushed at 8 MiB (`:347-349`). It leaves out the JSON file that `Spool` writes first, because the columns of a `RowFile` are known when it is created.

The contract "Tables as files" fixes the Arrow types and the writer settings. The table adds the array type that builds each column and the DuckDB type `load_capture` gives it through `to_duckdb_logical_type_for_field` (`engine/src/workspace/connection/capture.rs:116`):

| `ColumnKind` | Arrow type | Array | DuckDB type |
| --- | --- | --- | --- |
| `Text` | `Utf8` | `StringArray` | `VARCHAR` |
| `UInt16` | `UInt16` | `UInt16Array` | `USMALLINT` |
| `UInt32` | `UInt32` | `UInt32Array` | `UINTEGER` |
| `UInt64` | `UInt64` | `UInt64Array` | `UBIGINT` |
| `Boolean` | `Boolean` | `BooleanArray` | `BOOLEAN` |

How a `RowFile` writes. These settings bound memory and control IO; they do not define file-byte identity. A writer must preserve the schema and push order, while record-batch and row-group boundaries may change between attempts (CR-3):

- **Record batches.** The pushed rows wait in `pending`. `RowFile` writes them as one record batch when `pending` holds 1,024 rows or 8 MiB of cell text, whichever comes first. The cell text of a row is the sum of the byte lengths of its `Cell::Text` values. `close` writes the rows that are left as the last record batch.
- **Row groups.** A row group ends after 65,536 rows. After each record batch, `RowFile` also ends the row group when `ArrowWriter::in_progress_size` is at least 8 MiB.
- **Compression.** Snappy.
- **Metadata.** `RowFile` sets no key-value metadata. The file holds what `ArrowWriter` writes by default: the Arrow schema, and the `created_by` text of the `parquet` crate. A new version of that crate can therefore give other bytes for the same rows.
- **Memory.** `pending` holds less than 8 MiB of cell text plus one row. The writer holds less than 8 MiB of encoded data plus one record batch. The number of rows pushed does not change either bound.
- **No rows.** A `RowFile` that is closed without a row gives a valid Parquet file with the declared columns and no row group.

`RowFile::create`:

1. It returns `row_invalid` when `columns` is empty or two columns have the same name.
2. It sets `target` to `context.scratch_file(Format::Parquet)`.
3. It creates the temporary file with `SourceCapture::stage(&target)` (`engine/src/capture.rs:105`).
4. It builds the schema as `Self::batch(columns, &[])?.schema()`.
5. It creates `ArrowWriter::try_new(partial, schema, Some(SourceCapture::writer_properties()))`. Section 5 adds `writer_properties`.

`RowFile::push`:

1. It calls `Self::check(&self.columns, row)`.
2. It appends a copy of `row` to `pending`, adds the row's cell text to `pending_bytes`, and adds 1 to `rows`.
3. It calls `write_pending` when `pending` holds 1,024 rows or `pending_bytes` is at least 8 MiB.

`RowFile::check(columns: &[Column], row: &[Cell]) -> Result<(), Report<StageError>>` returns `row_invalid` when:

- `row` has another length than `columns`;
- a cell is `Cell::Null` and its column has `nullable: false`;
- a cell is `Cell::Text` and its column is not `Text`, or `Cell::Boolean` and its column is not `Boolean`;
- a cell is `Cell::UInt` and its column is `Text` or `Boolean`, or the value is above `u16::MAX` in a `UInt16` column or above `u32::MAX` in a `UInt32` column.

`RowFile::write_pending`:

1. It returns when `pending` is empty.
2. It builds one record batch from `pending` with `Self::batch`.
3. It calls `writer.write(&batch)`, and `writer.flush()` when `writer.in_progress_size()` is at least 8 MiB.
4. It clears `pending` and sets `pending_bytes` to 0.

`RowFile::batch(columns: &[Column], rows: &[Box<[Cell]>]) -> Result<RecordBatch, Report<StageError>>` builds one array per column from the cells at that column's index and calls `RecordBatch::try_from_iter_with_nullable` with each column's `name` and `nullable`.

`RowFile::close`:

1. It calls `write_pending`.
2. It calls `self.writer.into_inner()`, which writes the Parquet footer and returns the `NamedTempFile`.
3. It returns `SourceCapture::publish(partial, &self.target, self.rows)` (`engine/src/capture.rs:114`), mapped with `error::capture`.

`RowFile::store`:

1. It runs `close` inside `tokio::task::spawn_blocking`.
2. It returns `context.publish(capture.path(), Format::Parquet)`.

```rust
impl RowFile {
    pub(crate) fn create(context: &RunContext, columns: &[Column]) -> Result<Self, Report<StageError>> {
        check_columns(columns)?;
        let target = context.scratch_file(Format::Parquet);
        let partial = SourceCapture::stage(&target).map_err(error::capture)?;
        let schema = Self::batch(columns, &[])?.schema();
        let writer = ArrowWriter::try_new(partial, schema, Some(SourceCapture::writer_properties()))
            .map_err(error::scratch)?;
        Ok(Self { columns: columns.into(), target, writer, pending: Vec::new(), pending_bytes: 0, rows: 0 })
    }

    pub(crate) fn push(&mut self, row: &[Cell]) -> Result<(), Report<StageError>> {
        Self::check(&self.columns, row)?;
        self.pending_bytes += row.iter().map(cell_bytes).sum::<usize>();
        self.pending.push(row.into());
        self.rows += 1;
        if self.pending.len() == BATCH_ROWS || self.pending_bytes >= BUFFER_BYTES {
            self.write_pending()?;
        }
        Ok(())
    }

    pub(crate) fn close(mut self) -> Result<SourceCapture, Report<StageError>> {
        self.write_pending()?;
        let partial = self.writer.into_inner().map_err(error::scratch)?;
        SourceCapture::publish(partial, &self.target, self.rows).map_err(error::capture)
    }

    pub(crate) async fn store(self, context: &RunContext) -> Result<ArtifactRef, Report<StageError>> {
        let capture = tokio::task::spawn_blocking(move || self.close())
            .await
            .map_err(error::scratch)??;
        context.publish(capture.path(), Format::Parquet).await
    }
}
```

`BATCH_ROWS` is 1,024 and `BUFFER_BYTES` is `8 * 1024 * 1024`. `check_columns` and `cell_bytes` are private functions of `table.rs`. `cell_bytes` returns the byte length of a `Cell::Text` and 0 for every other cell.

- `create`, `push` and `close` do file IO on the calling thread. A stage that pushes more than one batch of rows calls them inside `tokio::task::spawn_blocking`, as the REST reader does for `Spool` (`engine/src/sources/rest.rs:161-166`).
- For a file without rows, `SourceCapture::rows` is 0, and `load_capture` creates the table with the columns and no rows. The REST reader relies on the same behaviour (test `empty_response_preserves_key_schema`, `engine/src/sources/rest.rs:673`).
- The stage 3 case "the same `changes` file planned twice" compares decoded schemas and ordered rows, including exact request JSON. File bytes, sizes and artifact references need not match. The memory limits and blocking-IO rules above still apply.

Errors: `create` returns `row_invalid` or `scratch_unavailable`. `push` returns `row_invalid` or `scratch_unavailable`. `close` returns `scratch_unavailable`. `store` returns those of `close`, and `storage_unavailable` or `storage_mismatch`.

### Checkpoint decimal validation

The owner is the existing `workspace/connection/capture.rs` export path, shared by source captures and `store_query`. This closes the measured `HUGEINT` round-trip failure without a second workspace, a full-file readback, or stage-specific casts.

- DuckDB exports signed `HUGEINT` as Arrow `Decimal128(38, 0)`. The resulting checkpoint loads as `DECIMAL(38,0)`. Preserve this existing representation and its exact values when they fit; hashing and Rust ID derivation before export do not change.
- Before converting result values to Arrow, inspect the query's DuckDB logical result types, including their nested children. An `UHUGEINT` anywhere in a result is unsupported for v1 checkpoint export and fails with `CaptureError::InvalidData`. Its unsigned range cannot be assumed safe in a signed Arrow carrier. The definition can explicitly cast it to `DECIMAL(38,0)` (which range-checks) or `VARCHAR`. Do not infer unsigned safety from an already converted decimal array.
- Before each `ArrowWriter::write`, validate every non-null decimal element against that array's declared precision, recursively through nested arrays. Use the Arrow decimal array precision-validation methods for Decimal128/Decimal256 rather than treating construction of an Arrow array or successful Parquet writing as proof of valid decimal values. `PrimitiveArray::validate_decimal_precision` is available in arrow-array 60.0.0. Retain bounded batches and the workspace's existing blocking thread; do not collect the file in memory.
- An invalid value or unsupported unsigned logical type returns the new `CaptureError::InvalidData`, mapped to permanent `data_invalid`. Attach the column/path and type information, not row values; do not attach a library diagnostic that prints the offending value. No rounding, null substitution, or implicit text conversion is permitted.
- Failure drops the temporary capture and prevents its publication. Earlier complete artifact files may exist, but the producing stage must not bind its `_done.json`. A SQL source capture also must not create the invalid source's capture binding. The check applies to every exported batch, including batches after a valid prefix and nested decimals.
- `load_table` and stage 3 retain the existing reader. This change is a producer guarantee for pipeline-generated exports, not validation of all externally supplied Parquet files or a general numeric policy for Graph JSON (deferred finding F3).

Add `InvalidData` to `CaptureError` in `capture.rs`; add the export checks in `workspace/connection/capture.rs`. The shared `error::capture` and stage 1's lower-frame mapping both map it to `Code::DataInvalid`, even when a source wrapper would otherwise be retryable. Other mappings remain as specified.

High-value cases for the shared export/import boundary:

| Case | Expected |
| --- | --- |
| Signed `HUGEINT` values 0, negative values, `10^38 - 1`, `-(10^38 - 1)`, and NULL | Capture and load preserve values, with the declared checkpoint type `DECIMAL(38,0)`. |
| `10^38`, `-10^38`, and the signed 128-bit extrema, after a valid first batch | Permanent `data_invalid`; no published capture or producing-stage marker. A retry gives the same classification. |
| Valid and invalid decimal values nested in supported list/struct columns | The same precision rule applies recursively; invalid nested values cannot reach the next stage's checkpoint. |
| Top-level and nested `UHUGEINT`, including a value whose unsigned carrier could appear negative after conversion | Permanent `data_invalid` before Arrow conversion. Explicit valid SQL casts are accepted. |
| Stage 1 SQL capture and stage 2 changed-row export containing an invalid decimal | Both fail permanently before publishing their checkpoint; stage 3 is never invoked with that output. |

### 4.8 `run/current.rs`

`read`, `mark_sending`, `check_sending` and `commit` have the signatures in the contracts. The stored JSON remains `Current`; storage versions are transient and are not extra fields in that JSON.

`read` decodes `read_versioned` and discards its version. An absent key gives `Current::default()`. Private helpers may share decoding and predicate checks; their decomposition is not a contract.

`mark_sending(context, run, base, resent)`:

1. Read the current value and its version together.
2. Return `base_moved` when `committed` differs from `base`.
3. Return `superseded` when any entry in `sending` is neither `run` nor in `resent`.
4. When `run` is already listed, return success only if it is last; otherwise return `superseded`.
5. Append `run`, encode the new value, and call `replace_if` with the version of step 1 (or absence).
6. On a conflict, start again at step 1, rechecking every predicate. After eight failed conditional writes, return retryable `storage_unavailable`. On a storage error, propagate it.

`check_sending(context, run, base, resent)`:

1. Read current state.
2. Return `base_moved` when `committed` differs from `base`.
3. Return `superseded` unless `sending.last()` is `Some(run)` and every other listed run is in `resent`. An absent run does not pass.
4. Return success without writing.

`commit(context, run, base, resent)`:

1. Read the current value and its version together.
2. Return success when `committed` is already `Some(run)`, recovering a lost commit response.
3. Apply the predicates of `check_sending` to the value just read. Do not perform a separate read for those checks.
4. Set `committed` to `Some(run)` and remove exactly `run` and every member of `resent` from `sending`.
5. Call `replace_if` with the version of step 1. On a conflict re-read, revalidate, and rebuild the update; use the same eight-attempt bound as `mark_sending`.

A takeover from run A to run B succeeds only when B's diff recorded A in `resent`. A cannot append itself again while B is listed, overwrite B's state, or commit a completed send marker after B took over. Two runs that diffed the same base before either started sending race at `mark_sending`: only one can enter; the loser re-reads and returns `superseded`.

Each Graph attempt is preceded by `check_sending`, including single-write fallbacks and retries after waiting. Delivery also checks again before finalizing its output. A marker is immutable evidence of completed delivery, not a lock: a takeover between the final check and marker publication is harmless to `current.json` because `commit` rechecks and conditionally writes. The marker may remain as an uncommitted run's output.

This protects control state on S3 and local storage. It does not atomically combine a check with a Graph side effect. A Graph call authorized before a takeover can finish afterward, including a call whose client was delayed. There is at most one such call per sequential sender. Its late effect may require an explicit reconcile; no automatic detection or Graph-side fencing is claimed. The workflow's one-run-per-integration scheduling remains required normal operation, while the checks bound stale-worker behavior.

Errors: `storage_unavailable`, `stored_json_invalid`, `base_moved`, `superseded`. Do not translate a stale sender into a rejected entity or continue to the next write.

### 4.9 `start`

`pub async fn start(context: &RunContext, request: RunRequest) -> Result<RunInput, Report<StageError>>`

1. It returns `integration_mismatch` when `context.namespace` differs from `ArtifactNamespace::new(request.web.into(), &request.connector)`.
2. It calls `finished` with the key `context.namespace.input(request.run.into())`.
3. When no input is stored, it calls `resolve` and stores the result with `finish`. `finish` returns the input of another attempt when that attempt stored its input first.
4. It returns `request_mismatch` when `resolved_from` is false for the input of step 2 or 3.
5. It returns that input.

Step 2 comes before `resolve`, so a run keeps its first input. A reconcile that is started again after it committed keeps the `target` it resolved the first time.

```rust
pub async fn start(context: &RunContext, request: RunRequest) -> Result<RunInput, Report<StageError>> {
    if context.namespace != ArtifactNamespace::new(request.web.into(), &request.connector) {
        return Err(Code::IntegrationMismatch.report());
    }
    let key = context.namespace.input(request.run.into());
    let input = match finished(context, &key).await? {
        Some(stored) => stored,
        None => finish(context, &key, &resolve(context, &request).await?).await?,
    };
    if !resolved_from(&input, &request) {
        return Err(Code::RequestMismatch.report());
    }
    Ok(input)
}
```

`resolve(context: &RunContext, request: &RunRequest) -> Result<RunInput, Report<StageError>>` copies `run`, `web`, `connector`, `actor` and `allow_mass_archive` from the request and fills the other three fields by operation:

| Request | Reads | `operation` | `definition` | `namespace` | Fails with |
| --- | --- | --- | --- | --- | --- |
| `Apply { definition, namespace, resend_all }` | Nothing | `Apply { resend_all }` | `Some(definition)` | `namespace` | `invalid_definition`, `integration_mismatch`, from `check_definition` |
| `Restore { target: Some(k) }` | `runs/{k}/input.json` | `Restore { target: Some(k) }` | The `definition` of k's input | The `namespace` of k's input | `target_missing` when k has no stored input |
| `Restore { target: None }` | `current.json`, and `runs/{c}/input.json` when a run c is committed | `Restore { target: None }` | `None` | The `namespace` of c's input, or the empty text when no run is committed | `target_missing` when c has no stored input |
| `Reconcile` | `current.json`, `runs/{c}/input.json` | `Reconcile { target: c }` | The `definition` of c's input | The `namespace` of c's input | `nothing_committed` when no run is committed; `target_missing` when c has no stored input |

```rust
async fn resolve(context: &RunContext, request: &RunRequest) -> Result<RunInput, Report<StageError>> {
    let (operation, definition, namespace) = match &request.operation {
        OperationRequest::Apply { definition, namespace, resend_all } => {
            check_definition(definition, &request.connector)?;
            (Operation::Apply { resend_all: *resend_all }, Some(definition.clone()), namespace.clone())
        }
        OperationRequest::Restore { target: Some(target) } => {
            let stored = stored_input(context, *target).await?;
            (Operation::Restore { target: Some(*target) }, stored.definition, stored.namespace)
        }
        OperationRequest::Restore { target: None } => {
            let namespace = match read(context).await?.committed {
                Some(committed) => stored_input(context, committed).await?.namespace,
                None => Box::default(),
            };
            (Operation::Restore { target: None }, None, namespace)
        }
        OperationRequest::Reconcile => {
            let committed = read(context)
                .await?
                .committed
                .ok_or_else(|| Code::NothingCommitted.report())?;
            let stored = stored_input(context, committed).await?;
            (Operation::Reconcile { target: committed }, stored.definition, stored.namespace)
        }
    };
    Ok(RunInput {
        run: request.run,
        web: request.web,
        connector: request.connector.clone(),
        actor: request.actor,
        operation,
        definition,
        namespace,
        allow_mass_archive: request.allow_mass_archive,
    })
}
```

`parse(text: &str) -> Result<Definition, Report<StageError>>`, private

1. It calls `Definition::from_yaml(text)` (`definition/src/yaml/mod.rs:200`, main). A failure is `Code::InvalidDefinition.wrap(report)`, so the report keeps the `ParseError` and its issues.

`RunInput::parse_definition(&self) -> Result<Option<Definition>, Report<StageError>>`

1. It returns `Ok(None)` when `self.definition` is `None`.
2. It returns `parse(text).map(Some)` otherwise.

```rust
impl RunInput {
    pub fn parse_definition(&self) -> Result<Option<Definition>, Report<StageError>> {
        self.definition.as_deref().map(parse).transpose()
    }
}
```

A stage calls `parse_definition` once, after it found no marker of its own, and passes the `Definition` on by reference. The method stores nothing in the `RunInput`, so each stage that needs the definition parses the text once. Its only error is `invalid_definition`. A stored input of an apply run parsed when `start` stored it, so the error means that the parser changed between two deploys.

`check_definition(text: &str, connector: &ConnectorId) -> Result<(), Report<StageError>>`, private

1. It calls `parse(text)`.
2. It returns `integration_mismatch` when `definition.connector()` differs from `connector`. `SourceReader::capture_sources` builds its storage root from the definition's connector (`engine/src/sources/mod.rs:210`), so the two must be equal.

```rust
fn check_definition(text: &str, connector: &ConnectorId) -> Result<(), Report<StageError>> {
    if parse(text)?.connector() != connector {
        return Err(Code::IntegrationMismatch.report());
    }
    Ok(())
}
```

How the two relate: `parse_definition` is the only way a stage gets a `Definition`, and it reads a stored `RunInput`. `check_definition` runs in `start` for an apply request, before any `RunInput` exists, and drops the parsed value after the connector check. Both call the private `parse`, so both fail with the same `invalid_definition` for the same text. No other function parses the definition text.

`stored_input(context: &RunContext, run: RunId) -> Result<RunInput, Report<StageError>>` calls `finished` with `context.namespace.input(run.into())` and returns `target_missing` for `None`.

`resolved_from(input: &RunInput, request: &RunRequest) -> bool` is true when all of these hold:

- `run`, `web`, `connector`, `actor` and `allow_mass_archive` are equal.
- For an `Apply` request: the input's operation is `Apply` with the same `resend_all`, its `definition` is `Some` of the same text, and its `namespace` is the same text.
- For a `Restore` request: the input's operation is `Restore` with the same `target`.
- For a `Reconcile` request: the input's operation is `Reconcile`.

A target that has no definition, because it was itself a restore to empty, gives an input with `definition: None`. Stages 1 and 2 then treat the run as a run without a definition.

`start` does not check that the target run has a capture output. Stage 1 returns `target_missing` for that case.

Errors of `start`:

| Code | Condition |
| --- | --- |
| `integration_mismatch` | The context is for another web or connector than the request, or the definition of an apply request names another connector. |
| `invalid_definition` | The definition of an apply request does not parse. |
| `target_missing` | The target of a restore, or the committed run of a reconcile or a restore to empty, has no `input.json`. |
| `nothing_committed` | A reconcile is requested and `current.json` has no committed run. |
| `request_mismatch` | `input.json` exists for the run ID and `resolved_from` is false. |
| `storage_unavailable`, `storage_mismatch`, `stored_json_invalid`, `scratch_unavailable` | From `finished`, `finish` and `read`. |

### 4.10 `run`

`run` is the function of the contract "The runner":

```rust
pub async fn run(
    context: &RunContext,
    request: RunRequest,
    sources: &SourceReader,
    secrets: &impl SecretStore,
    graph: &impl Graph,
) -> Result<SendOutput, Report<StageError>>;
```

It has no code beyond the five calls, and it returns the first error unchanged. `Graph` is the trait of `engine/src/graph/`, imported as `crate::graph::Graph`. The runner needs no other bound, because the trait's methods already return `Send` futures. `start` and `run` carry `#[tracing::instrument(level = "debug", skip_all, fields(web_id = %request.web, run_id = %request.run))]`, as `capture_sources` does (`engine/src/sources/mod.rs:202`).

### 4.11 The local runner: `hash-integrations run`

`pub(crate) async fn run_command(args: RunArgs) -> ExitCode` in `apps/hash-integrations/src/subcommand/run.rs`.

Arguments of `run`:

| Argument | Type | Required | Meaning |
| --- | --- | --- | --- |
| `--run-id <UUID>` | `Uuid` | No | The run to start or continue. When absent, the runner creates a UUID v4. |
| `--web <UUID>` | `Uuid` | Yes | `RunRequest::web`. |
| `--connector <ID>` | `ConnectorId` | Yes | `RunRequest::connector`. |
| `--actor <UUID>` | `Uuid` | Yes | `RunRequest::actor`. |
| `--allow-mass-archive` | flag | No | `RunRequest::allow_mass_archive`. |
| `--storage-dir <DIR>` | `PathBuf` | One of this and `--s3-uri` | The root of local artifact storage. |
| `--s3-uri <URI>` | `Box<str>` | One of this and `--storage-dir` | `S3Bucket::uri` (`engine/src/storage/bucket.rs:7`). |
| `--s3-region <REGION>` | `Box<str>` | With `--s3-uri` | `S3Bucket::region`. |
| `--s3-endpoint <HOST>` | `Box<str>` | No | `S3Bucket::endpoint`. |
| `--s3-insecure` | flag | No | Sets `S3Bucket::use_ssl` to false. |
| `--s3-access-key-id <ID>` | `Box<str>` | With `--s3-uri` | `S3Bucket::key_id`. |
| `--s3-secret-access-key`, env `HASH_INTEGRATIONS_S3_SECRET_ACCESS_KEY` | `Pin<Box<Secret<str>>>` | With `--s3-uri` | `S3Bucket::secret`, built from the bytes of the text with `Secret::from_vec` (`libs/@local/crypto/src/secret.rs:155`). The environment variable name is new. |
| `--local-sources <DIR>` | `PathBuf` | Yes | The directory that `SourceKind::Local` sources are read from. It must exist and must be outside the storage directory (`engine/src/sources/mod.rs:116-122`). |
| `--scratch-dir <DIR>` | `PathBuf` | No | The directory in which the runner creates its temporary directory. The default is `std::env::temp_dir()`. |
| `--graph-url <URL>` | `Url` | Yes | The Graph API, for example `http://127.0.0.1:4000`. |
| `--graph-service-secret`, env `HASH_GRAPH_SERVICE_SECRET` | `Pin<Box<Secret<str>>>` | Yes | The service secret, with the environment variable the Graph server reads (`apps/hash-graph/src/subcommand/server.rs:466`). |
| `--vault-url <URL>` | `String` | Yes | `GraphVaultConfig::vault_url` (`engine/src/sources/secrets/mod.rs:61-67`). |
| `--vault-mount <NAME>` | `String` | Yes | `GraphVaultConfig::vault_mount`. |
| `--vault-token`, env `HASH_INTEGRATIONS_VAULT_TOKEN` | `Pin<Box<Secret<str>>>` | Yes | `GraphVaultConfig::vault_token`. The environment variable name is new. |

Secret arguments use `hide_env_values = true` and the value parser of `libs/@local/crypto/src/cli.rs:56-62`.

The operation is a subcommand of `run`:

| Subcommand | Arguments | Request |
| --- | --- | --- |
| `apply` | `--definition <FILE>`, `--namespace <TEXT>`, `--resend-all` | `Apply` with the text of the file |
| `restore` | Exactly one of `--target <UUID>` and `--empty`, as a required clap group | `Restore { target: Some(run) }` or `Restore { target: None }` |
| `reconcile` | None | `Reconcile` |

What `run_command` does:

1. It takes the run ID from `--run-id` or creates one, and writes the line `run {run}` to standard error.
2. It builds the `RunRequest`. For `apply` it reads the definition file with `tokio::fs::read_to_string`.
3. It creates a temporary directory `base` in `--scratch-dir` with the prefix `hash-integrations-`, and the directory `{base}/scratch` inside it.
4. It builds the storage: `ArtifactStorage::local(&storage_dir)` (`engine/src/storage/artifact/mod.rs:50`), or `ArtifactStorage::s3(&bucket, &base.join("staging"))` (`:66`).
5. It builds the context: `RunContext::new(storage, web, &connector, base.join("scratch"), WorkspaceConfig::default(), SendSettings::default(), Box::new(SystemClock))`.
6. It builds the source reader from a clone of the context's storage: `SourceReader::new(CaptureStore::new(&local_sources, context.storage.clone())?, CaptureLimits::default())` (`engine/src/sources/mod.rs:111`, `:186`).
7. It builds the secret store: `GraphVaultSecretStore::new(GraphVaultConfig { .. })` (`engine/src/sources/secrets/mod.rs:155`), with `graph_url` set to the text of `--graph-url`. `graph_service_secret` is a second secret with the same text, built with `Secret::from_string` (`libs/@local/crypto/src/secret.rs:266`), because a secret has no `Clone`.
8. It builds the Graph client: `GraphClient::new(&graph_url, service_secret)` (`engine/src/graph/client/mod.rs:77`, main). `GraphClient` implements `Graph` (contract "The Graph client").
9. It calls `hash_integrations_engine::run(&context, request, &sources, &secrets, &graph)`.
10. It drops `base`, which deletes the directory, and returns the exit code.

Steps 2 to 8 are one function, `setup(args, run) -> Result<Setup, Report<RunCommandError>>`, whose errors change context to `RunCommandError::Setup`. `Setup` is a private struct with the fields `request`, `context`, `sources`, `secrets`, `graph` and `base`. An error of step 9 changes context to `RunCommandError::Stage`.

Output. The runner writes with `std::io::Write`, as `completions` does (`apps/hash-integrations/src/subcommand/completions.rs:15-20`, main):

- Standard error, before step 2: `run {run}`.
- Standard output, on success: one line of JSON, `{"run":"{run}","output":{SendOutput}}`.
- Standard error, on failure: the report in its `Debug` form, then one line. The line is `failed: setup` for `RunCommandError::Setup`, and `failed: {kind} {code}` for `RunCommandError::Stage`, where `{kind}` is `retryable` or `permanent` and `{code}` is the text of `Code::of`, or `unclassified` when the report carries no code.

Exit codes:

| Code | Meaning |
| --- | --- |
| 0 | `run` returned a `SendOutput`. The run is committed. Rejected writes do not change the exit code. |
| 1 | A stage failed with `StageError::Permanent`. |
| 2 | An argument is invalid, which is clap's own exit code, or `RunCommandError::Setup`. |
| 3 | A stage failed with `StageError::Retryable`. |

`exit_code(report: &Report<RunCommandError>) -> ExitCode` reads `report.current_context()` and, for `Stage`, `report.downcast_ref::<StageError>()`.

Starting again with the same run ID. The operator passes the `--run-id` that the first call wrote to standard error, and the same other arguments.

- `start` finds `input.json` and returns the stored input.
- Each stage that has a marker returns its stored output. The first stage without a marker runs.
- A call whose arguments give another request fails with `request_mismatch` and exit code 1. This covers a definition file that was edited after the first call.
- A run that already committed returns its stored `SendOutput` with exit code 0 and sends nothing.

The first version has no arguments for `WorkspaceConfig`, `SendSettings` or `CaptureLimits`. It uses the default of each.

### 4.12 The run-interface function: `PipelineFunction`

```rust
impl<S: SecretStore, G: Graph> RunFunction for PipelineFunction<S, G> {
    type Input = RunRequest;

    const VERSION: FunctionVersion = FUNCTION_VERSION;

    async fn run(&self, context: &mut impl StepContext, request: RunRequest) -> Result<(), Report<RunError>>;
}
```

`RunFunction` is at `orchestration/src/run.rs:26`, `StepContext::run` at `:66`, and `FUNCTION_VERSION` at `apps/hash-integrations/src/service/start.rs:9` (BE-1136). `Graph` declares its methods as `fn … -> impl Future<Output = GraphResponse> + Send`, so the future of `run` is `Send`, which `RunFunction::run` requires (`orchestration/src/run.rs:40-44`).

`PipelineFunction::new(web: WebId, storage: ArtifactStorage, local_sources: &Path, scratch: PathBuf, secrets: S, graph: G) -> Result<Self, Report<SourceError>>`

1. It builds `sources` as `SourceReader::new(CaptureStore::new(local_sources, storage.clone())?, CaptureLimits::default())`, so the source reader stores captures in a clone of the storage the markers are written to.
2. It sets `workspace` to `WorkspaceConfig::default()` and `send` to `SendSettings::default()`, and copies the other arguments into their fields.

`run`:

1. It returns `RunError::Failed` with the failure code `web_mismatch` when `request.web` differs from `self.web`. No step is requested. This keeps the check that `RunInput::definition` made (`apps/hash-integrations/src/service/run_input.rs:44-46`, BE-1136).
2. It creates a temporary directory in `self.scratch` with `TempDir::new_in`. A failure is `RunError::Failed` with the failure code `scratch_unavailable`.
3. It builds `RunContext::new(self.storage.clone(), request.web, &request.connector, scratch.path().to_owned(), self.workspace.clone(), self.send, Box::new(SystemClock))`.
4. It requests five steps in this order. Each step calls one engine function and maps its error with `step_failure`.

| Step name | Engine function | Recorded output |
| --- | --- | --- |
| `start` | `start(&run_context, request.clone())` | `RunInput` |
| `capture` | `capture(&run_context, &input, &self.sources, &self.secrets)` | `CaptureOutput` |
| `diff` | `diff(&run_context, &input, &capture)` | `DiffOutput` |
| `plan` | `plan(&run_context, &input, &capture, &diff)` | `PlanOutput` |
| `send` | `send(&run_context, &input, &diff, &plan, &self.graph)` | `SendOutput` |

5. It returns `Ok(())`. The temporary directory is deleted when `run` returns.

```rust
async fn run(&self, context: &mut impl StepContext, request: RunRequest) -> Result<(), Report<RunError>> {
    if request.web != self.web {
        return Err(Report::new(RunError::Failed { code: failure_code("web_mismatch") }));
    }
    let scratch = TempDir::new_in(&self.scratch)
        .change_context(RunError::Failed { code: failure_code("scratch_unavailable") })?;
    let run_context = RunContext::new(/* step 3 */);

    let input = context
        .run(step_name("start"), || async {
            start(&run_context, request.clone()).await.map_err(step_failure)
        })
        .await?;
    let capture = context
        .run(step_name("capture"), || async {
            capture(&run_context, &input, &self.sources, &self.secrets).await.map_err(step_failure)
        })
        .await?;
    // `diff`, `plan` and `send` follow the same form.
    Ok(())
}
```

`step_name(text: &'static str) -> StepName` and `failure_code(text: &str) -> FailureCode` parse the text and call `expect` with the messages `"a stage name should be a step name"` and `"a code should be a failure code"`. Both rules are at `orchestration/src/name.rs:101-128`.

- The step names and their order are the same for every request, as `RunFunction` requires (`orchestration/src/run.rs:23-25`).
- A recorded step returns its recorded output and does not call the engine function (`orchestration/src/run.rs:51-53`). A step that the engine calls again finds the marker of the earlier attempt.
- The engine `RunId` is inside the `RunRequest`. `RunFunction::run` receives no run ID of the run interface.

`step_failure(report: Report<StageError>) -> Report<StepFailure>`

1. It maps `StageError::Retryable` to `FailureKind::Retryable` and `StageError::Permanent` to `FailureKind::Permanent` (`orchestration/src/event.rs:50`).
2. It takes the code text from `Code::of(&report)`, or `unclassified` when the report carries no code.
3. It returns `report.change_context(StepFailure { kind, code })` (`orchestration/src/event.rs:59`).

```rust
pub(crate) fn step_failure(report: Report<StageError>) -> Report<StepFailure> {
    let kind = match report.current_context() {
        StageError::Retryable => FailureKind::Retryable,
        StageError::Permanent => FailureKind::Permanent,
    };
    let code = failure_code(Code::of(&report).map_or("unclassified", Code::as_str));
    report.change_context(StepFailure { kind, code })
}
```

The run ID. `run_id` returns the engine `RunId`, and one new function gives the run interface its form:

```rust
// apps/hash-integrations/src/service/start.rs

/// Returns the run that `request` in `web` starts, so a repeated request attaches to it.
pub(crate) fn run_id(web: WebId, request: Uuid) -> hash_integrations_engine::RunId;

/// Returns `run` as the run ID of the run interface: the UUID in hyphenated lowercase form.
pub(crate) fn interface_run_id(run: hash_integrations_engine::RunId) -> hash_integrations_orchestration::RunId;
```

`run_id` keeps the UUID v5 derivation of `apps/hash-integrations/src/service/start.rs:23-34` (BE-1136) and returns `RunId::from(uuid)`. `interface_run_id` returns `run.to_string().parse().expect("a UUID should be a run ID")`. A hyphenated lowercase UUID has 36 bytes and matches the rule for a run ID of the run interface (`orchestration/src/name.rs:130-136`). No code converts in the other direction: `status` and `cancel` take the run interface's `RunId` from their caller (`apps/hash-integrations/src/service/mod.rs:110`, `:129`, BE-1136).

`IntegrationService::submit` (`apps/hash-integrations/src/service/mod.rs:72-102`, BE-1136) changes as follows:

1. For an `Apply` operation it parses the definition, as today, and returns `ServiceError::InvalidDefinition` when the parse fails or the definition names another connector than `submission.connector`.
2. It builds `RunRequest { run: run_id(request.web, request.id), web: request.web, connector: submission.connector, actor: request.actor, operation: submission.operation, allow_mass_archive: submission.allow_mass_archive }`.
3. It encodes the `RunRequest` as `RunStart::input`, builds the admission key from `request.web` and `submission.connector`, and calls `Runs::start` with `interface_run_id(run)`.

## 5. Existing code

### 5.1 The first implementation step: one branch with all the code

| Branch | Commit | Brings |
| --- | --- | --- |
| `origin/pe/be-933-store-integration-artifacts-and-run-records-in-the-object` | `9c48ffecc9` | `engine/src/storage`, the changed `engine/src/sources`. It already contains `origin/main` up to `669b8594eb`, so it has `engine/src/graph` without `graph/client`. |
| `origin/main` | `c47a17eed3` | `engine/src/graph/client`, the `Display` derive on `Coercion`, the app with its Tokio runtime. |
| `pe/be-1136-add-the-integration-service-with-submit-status` | `b053dd6578` | `apps/hash-integrations/src/service`. It contains `origin/asa/be-1132-orchestration-run-interface` (`da9fb175a8`), which brings `orchestration/`. |

The state version and work manifest records of hashintel/hash#10453 are not part of the branch.

Files that need a decision when the three are combined:

| File | Result |
| --- | --- |
| `engine/src/lib.rs` | The module list and the exports of both sides: `graph` from main (`:22`, `:34-39`, main) and `storage` from BE-933 (`:26`, `:43-46`). |
| `engine/Cargo.toml` | The union of both dependency lists. `derive_more` has the features `display`, `error`, `from`, `into`. `time` has `formatting`, `macros`, `parsing`. |
| `engine/src/sources/mod.rs`, `fingerprint.rs`, `postgres.rs`, `engine/src/sql.rs` | The BE-933 side. |
| `engine/src/sources/tests.rs:29`, `:46` | `Server` and `server` are `pub(crate)`, as on main (`:30`, `:47`, main), because `engine/src/graph/client/tests.rs` imports them. |
| `apps/hash-integrations/src/main.rs` | The runtime and `init_tracing` of main (`:33-42`, main) and `mod service` of BE-1136 (`:13-17`, BE-1136). |
| `apps/hash-integrations/Cargo.toml` | The union of both dependency lists. |

### 5.2 Changes and uses

| Path:line | Item | Change |
| --- | --- | --- |
| `engine/src/lib.rs:19-28` | Module list | Add `mod run;`. The stage specs add `mod stage;`. |
| `engine/src/lib.rs:30-51` | Exports | Add `run::{Change, Clock, Code, FixedClock, InvalidText, Kind, Operation, OperationRequest, RunContext, RunId, RunInput, RunRequest, SendSettings, StageError, SystemClock, Target, run, start}`. The stage 4 spec adds `Graph` and `GraphResponse` in `engine/src/graph/` and exports both, so the app can name them. |
| `engine/Cargo.toml:21` | `uuid` | Add the feature `serde`. |
| `engine/Cargo.toml:40` | `time` | Add the feature `std`, which `OffsetDateTime::now_utc` needs, and `serde`, which with `formatting` and `parsing` gives `time::serde::rfc3339`. |
| `engine/src/storage/namespace.rs:33-35` | `ArtifactNamespace::capture` | The signature stays. The key changes from `{root}/captures/{run}/{source}.{fingerprint}.json` to `{root}/runs/{run}/capture/{source}.{fingerprint}.json` (C5). |
| `engine/src/storage/namespace.rs:20-44` | `impl ArtifactNamespace` | Add `current`, `input`, `capture_output`, `diff_output`, `plan_output`, `send_output` and the private `run` of section 4.3. |
| `engine/src/storage/artifact/mod.rs:1-4` | Module list | Add `mod mutable;` with the conditional storage API of section 4.4, and retain the local backend root for its lock/replace implementation. |
| `engine/src/storage/artifact/mod.rs:35` | `ArtifactStorage` | `#[derive(Debug)]` becomes `#[derive(Debug, Clone)]`. The runner gives one clone to `CaptureStore::new` and one to `RunContext`. |
| `engine/src/storage/artifact/mod.rs:95` | `ArtifactStorage::staging_file` | Used as is. |
| `engine/src/storage/artifact/mod.rs:110`, `:142` | `publish`, `materialize` | Used as is. |
| `engine/src/storage/artifact/binding.rs:14`, `:28`, `:50` | `Bound`, `bind`, `bound` | Used as is. `pub(crate)` is enough, because `run` is in the engine crate. |
| `engine/src/storage/mod.rs:16`, `:30` | `ArtifactError`, `ArtifactKey` | Used as is. |
| `engine/src/storage/artifact/reference.rs:12`, `:37` | `Format`, `ArtifactRef` | Used as is. |
| `engine/src/workspace/mod.rs:39` | `WorkspaceConfig` | `#[derive(Debug)]` becomes `#[derive(Debug, Clone)]`. Stages 1, 2 and 3 each open a workspace from the one config in `RunContext`. |
| `engine/src/workspace/mod.rs:156`, `:189`, `:222`, `:455` | `load_capture`, `capture`, `open`, `close` | Signatures unchanged; `capture` adds the shared export validation. |
| `engine/src/workspace/error.rs:49`, `:175`, `:259` | `OpenError`, `StatementError`, `CloseError` | Used as is. |
| `engine/src/pipeline/mod.rs:47` | `PreparationError` | Used as is. |
| `engine/src/capture.rs:13`, `:51`, `:105`, `:114` | `CaptureError`, `SourceCapture::open`, `stage`, `publish` | Add `CaptureError::InvalidData`; file helpers keep their signatures. |
| `engine/src/capture.rs:45` | `impl SourceCapture` | Add `pub(crate) fn writer_properties() -> WriterProperties`, which returns Snappy compression and at most `64 * 1024` rows per row group. |
| `engine/src/workspace/connection/capture.rs:61-64`, `engine/src/sources/rest.rs:356-359` | The two `WriterProperties::builder()` blocks | Each becomes a call of `SourceCapture::writer_properties()`. |
| `engine/src/sources/rest.rs:244` | `Spool` | Used as is. `RowFile` is new code that follows it. |
| `engine/src/sources/mod.rs:222` | The call of `namespace.capture` | Used as is. It writes the moved key. |
| `engine/src/sources/mod.rs:111`, `:186` | `CaptureStore::new`, `SourceReader::new` | Used as is. |
| `engine/src/sources/secrets/mod.rs:50`, `:155` | `SecretStore`, `GraphVaultSecretStore::new` | Used as is. |
| `engine/src/graph/client/mod.rs:77` (main) | `GraphClient::new` | Used as is. The stage 4 spec makes `GraphClient` an implementation of `Graph`. |
| `definition/src/name.rs:93-97` (main) | `ConnectorId` | Add `Serialize` and `Deserialize` through `Display` and `FromStr`, so the JSON form is the text. `RunRequest` and `RunInput` hold it. |
| `definition/src/name.rs:108-112` (main) | `SourceName` | The same as `ConnectorId`. It is the key type of `CaptureOutput::sources`. |
| `definition/src/yaml/mod.rs:200`, `definition/src/definition/mod.rs:86` (main) | `Definition::from_yaml`, `connector` | Used as is. |
| `apps/hash-integrations/src/main.rs:25-43` (main) | `main` | `fn main()` becomes `fn main() -> ExitCode`. The block passed to `block_on` returns `subcommand.execute().await`. |
| `apps/hash-integrations/src/subcommand/mod.rs:7-10` (main) | `Subcommand` | Add `Run(Box<RunArgs>)`. |
| `apps/hash-integrations/src/subcommand/mod.rs:13` (main) | `Subcommand::execute` | `pub(crate) fn execute(self)` becomes `pub(crate) async fn execute(self) -> ExitCode`. `Completions` returns `ExitCode::SUCCESS`. `Run` returns `run_command(*args).await`. |
| `apps/hash-integrations/Cargo.toml` | Dependencies | Add `hash-integrations-engine`, `hash-crypto` with the feature `clap`, `serde_json`, `tempfile`, `url`, and `tokio` with `fs` and `rt-multi-thread`. |
| `apps/hash-integrations/src/service/run_input.rs:8`, `:15`, `:25`, `:43` (BE-1136) | `Invocation`, `RunInput`, `RunInputError`, `RunInput::definition` | The file is deleted. `RunRequest` is the recorded input. The definition check is in `start`, and the web check is in `PipelineFunction::run`. `links_only` has no successor. |
| `apps/hash-integrations/src/service/mod.rs:1`, `:12` (BE-1136) | `mod run_input;` and its re-export | Removed. Add `mod function;`. |
| `apps/hash-integrations/src/service/mod.rs:25-28` (BE-1136) | `Submission` | `{ definition: Box<str>, invocation: Invocation }` becomes the struct of section 3.6. |
| `apps/hash-integrations/src/service/mod.rs:72-102` (BE-1136) | `IntegrationService::submit` | The signature stays. The body changes as in section 4.12. |
| `apps/hash-integrations/src/service/start.rs:23` (BE-1136) | `run_id` | `fn run_id(web: WebId, request: Uuid) -> RunId` of the run interface becomes `-> hash_integrations_engine::RunId`. Add `interface_run_id`. |
| `apps/hash-integrations/src/service/start.rs:9`, `:12`, `:41` (BE-1136) | `FUNCTION_VERSION`, `RETRY_POLICY`, `admission_key` | Used as is. |
| `orchestration/src/run.rs:10`, `:26`, `:48`; `orchestration/src/event.rs:50`, `:59`; `orchestration/src/name.rs:101-136` | `RunError`, `RunFunction`, `StepContext`, `FailureKind`, `StepFailure`, `StepName`, `FailureCode`, `RunId` | Used as is. |

## 6. Error mapping table

Codes and their kinds:

| Code | Kind | Raised in `run` by |
| --- | --- | --- |
| `invalid_definition` | Permanent | `start`, `RunInput::parse_definition` |
| `target_missing` | Permanent | `start` |
| `nothing_committed` | Permanent | `start` |
| `duplicate_entity_id` | Permanent | Not raised in `run`. |
| `archive_limit` | Permanent | Not raised in `run`. |
| `base_moved` | Permanent | `mark_sending`, `check_sending`, `commit` |
| `superseded` | Permanent | `mark_sending`, `check_sending`, `commit` |
| `request_mismatch` | Permanent | `start` |
| `integration_mismatch` | Permanent | `start` |
| `reserved_column` | Permanent | Not raised in `run`. Stage 2 raises it. |
| `marker_missing` | Permanent | Not raised in `run`. Stage 2 raises it. |
| `storage_unavailable` | Retryable | `error::artifact`, `finish` |
| `storage_mismatch` | Permanent | `error::artifact` |
| `stored_json_invalid` | Permanent | `error::stored_json` |
| `scratch_unavailable` | Retryable | `error::scratch`, `error::capture` |
| `workspace_unavailable` | Retryable | `error::open`, `error::close`, `error::capture`, `error::statement`, `error::preparation` |
| `query_invalid` | Permanent | `error::statement`, `error::capture`, `error::preparation` |
| `data_invalid` | Permanent | `error::statement`, `error::capture`, `error::preparation` |
| `row_invalid` | Permanent | `RowFile::create`, `RowFile::push` |

Existing errors and their codes. "Called in `run`" names the functions of this spec that produce the error.

| Error | Variant | Code | Called in `run` by |
| --- | --- | --- | --- |
| `ArtifactError` (`engine/src/storage/mod.rs:16`) | `Read`, `Write` | `storage_unavailable` | `finished`, `finish`, `read`, conditional updates, `RunContext::publish`, `RunContext::fetch` |
| | `Mismatch` | `storage_mismatch` | The same |
| `CaptureError` (`engine/src/capture.rs:13`) | `Query` | The code of the statement in the report; `workspace_unavailable` when the report holds no `StatementError` | `store_query`, `load_table` |
| | `InvalidData` | `data_invalid` | Decimal precision or unsupported unsigned checkpoint type during export |
| | `Read`, `Write`, `SyncDirectory`, `Exists`, `WorkspaceFile` | `scratch_unavailable` | `store_query`, `load_table`, `RowFile::create`, `RowFile::close` |
| | `DiskUsage`, `Cancelled`, `Stopped` | `workspace_unavailable` | `store_query`, `load_table` |
| `StatementError` (`engine/src/workspace/error.rs:175`) | `NotSelect`, `StatementCount`, `TableFunction`, `UnknownParameter`, `UnsupportedType`, `InvalidQuery` | `query_invalid` | Through `CaptureError::Query` in `store_query` |
| | `InvalidData` | `data_invalid` | The same |
| | `Failed`, `DiskLimit`, `DiskUsage`, `Stopped` | `workspace_unavailable` | The same |
| `OpenError` (`engine/src/workspace/error.rs:49`) | Every variant | `workspace_unavailable` | `RunContext::open_workspace` |
| `CloseError` (`engine/src/workspace/error.rs:259`) | Every variant | `workspace_unavailable` | Not called in `run`. Stages call `error::close`. |
| `PreparationError` (`engine/src/pipeline/mod.rs:47`) | `Statement`, or `Step` without an underlying preparation cause | The code of the statement in the report; `query_invalid` when the report holds no `StatementError` | Not called in `run`. Stage 2 calls `error::preparation`. |
| | `ReservedColumn` | `reserved_column` | The same |
| | `MissingColumn`, `Metadata`, `MissingCheckpoint`, `LinkInputs` | `query_invalid` | The same |
| | `Assertions` | `data_invalid` | The same |
| | `Cancelled`, `Stopped` | `workspace_unavailable` | The same |
| `ParseError` (`definition/src/yaml/mod.rs:148`, main) | Every variant | `invalid_definition` | `parse`, called by `check_definition` and `RunInput::parse_definition` |
| `std::io::Error`, `ParquetError`, `ArrowError`, `JoinError` | | `scratch_unavailable` | `finished`, `finish`, `RowFile` |
| `serde_json::Error` | | `stored_json_invalid` | `finished`, `finish`, `read`, conditional updates |

Reasons for the kinds that are a choice:

- `StatementError::DiskLimit` and `OpenError::Configure` depend on the worker's settings. Another worker or a changed setting can let the same input succeed, so both are retryable. The retry policy of the run interface limits the attempts (`apps/hash-integrations/src/service/start.rs:12-17`, BE-1136).
- `StatementError::InvalidData` is permanent, because the rows come from stored captures and are the same in every attempt.
- `CaptureError::InvalidData` is permanent `data_invalid`; retrying the same export cannot repair its numeric range or unsupported logical type. `CaptureError::Read` remains retryable for IO failures. A digest verifies bytes, not semantic validity; the producer-side decimal check prevents the known invalid decimal export, but does not prove arbitrary external Parquet data is valid.
- `ArtifactError::Read` is retryable also when the object is missing, because `materialize` reports a missing object and a failed request with the same variant (`engine/src/storage/artifact/mod.rs:162-166`).

## 7. Tests

Use the workflow's initial acceptance set first. The cases below supply expected behavior and additional regression candidates, not a requirement to reproduce one test per listed private function.

The engine tests are unit tests in `engine/src/run/tests/`. They use local storage in a `TempDir`. The cases that name S3 use the MinIO helpers `minio` and `s3_storage` (`engine/src/storage/tests.rs:23`, `:61`).

Helpers in `run/tests/mod.rs`, all `pub(crate)`:

| Helper | Returns |
| --- | --- |
| `WEB` | `00000000-0000-4000-8000-000000000001` |
| `ACTOR` | `00000000-0000-4000-8000-000000000002` |
| `connector()` | `aviation` |
| `run_id(n: u128)` | The run `00000000-0000-4000-8000-0000000000a{n}`, written "run a{n}" below |
| `context(directory: &Path)` | A `RunContext` for `WEB` and `aviation` with local storage in `{directory}/artifacts`, the created directory `{directory}/scratch`, `WorkspaceConfig::default()`, `SendSettings::default()` and `FixedClock(2026-11-06 12:00:00 UTC)` |
| `apply(run: RunId, definition: &str)` | A `RunRequest` with `Apply { definition, namespace: "aviation", resend_all: false }`, `ACTOR` and `allow_mass_archive: false` |
| `ROOT` | `tenants/00000000-0000-4000-8000-000000000001/integrations/615b1c9940913ae65656b12d3e9936aba1e0fdbfb11754db10afd6bcb52e8f59` |

`MINIMAL` is the definition text `connector: aviation\n`. It parses, as the BE-1136 test `definition_matching` shows for `connector: demo\n` (`apps/hash-integrations/src/service/run_input.rs:78-86`, BE-1136).

### 7.1 `Kind`, `Change`, `Target`, `RunId` (`tests/target.rs`)

| Test | Input | Expected |
| --- | --- | --- |
| `stored_text_forms` | Every variant of `Kind` and `Change` | `as_str`, `Display` and the JSON string are `entity`, `link`, `insert`, `update`, `resend`, `archive`. Each text parses back to its variant. |
| `kind_unknown_text` | `Entity`, ` entity`, `sink` | `InvalidText` |
| `target_text` | `Target::entity(&"sink-aircraft")`, `Target::link(&"aircraft-based-at")` | The text forms are `entity/sink-aircraft` and `link/aircraft-based-at`. Each parses back to an equal target. The JSON form is the text as a string. |
| `target_invalid_text` | `sink-aircraft`, `sink/sink-aircraft`, `entity/`, `entity/Sink`, `entity/a/b`, `entity/` followed by 65 times `a` | `InvalidText` |
| `target_same_id` | `Target::new(Kind::Entity, "aircraft")`, `Target::new(Kind::Link, "aircraft")` | The two are not equal. |
| `target_map_keys` | A `BTreeMap` with the keys `link/aircraft-based-at`, `entity/sink-airfields`, `entity/sink-aircraft` and the values 1, 2, 3 | The JSON is `{"entity/sink-aircraft":3,"entity/sink-airfields":2,"link/aircraft-based-at":1}`, and it decodes to an equal map. |
| `run_id_text` | `00000000-0000-4000-8000-0000000000A1` | It parses to run a1. `Display` and the JSON string are `00000000-0000-4000-8000-0000000000a1`. |

Scenarios: S4 run 2 has `entity/sink-planes` as a key of `DiffOutput::targets`. Every `_done.json` of every scenario holds the JSON forms.

### 7.2 `Code` and the mapping functions (`tests/error.rs`)

| Test | Input | Expected |
| --- | --- | --- |
| `code_texts` | `Code::ALL` | `ALL` has `mem::variant_count::<Code>()` entries. Every text is at most 64 bytes, matches `[a-z0-9][a-z0-9_-]*`, and is distinct. |
| `code_contract_texts` | The first eleven codes | The texts are `invalid_definition`, `target_missing`, `nothing_committed`, `duplicate_entity_id`, `archive_limit`, `base_moved`, `superseded`, `request_mismatch`, `integration_mismatch`, `reserved_column`, `marker_missing`, and each kind is `Permanent`. |
| `code_report` | `Code::BaseMoved.report()` | The context is `StageError::Permanent` and `Code::of` is `Some(Code::BaseMoved)`. |
| `code_absent` | `Report::new(StageError::Retryable)` | `Code::of` is `None`. |
| `artifact_variants` | Reports of `ArtifactError::Read`, `Write`, `Mismatch` | `storage_unavailable` and `Retryable` for the first two; `storage_mismatch` and `Permanent` for the third. |
| `capture_missing_table` | `Workspace::capture` of `SELECT * FROM missing`, through `error::capture` | `query_invalid`, `Permanent`. The report still holds the `StatementError`. |
| `capture_failed_cast` | `Workspace::capture` of `SELECT 'x'::INTEGER AS id`, through `error::capture` | `data_invalid`, `Permanent` |
| `capture_existing_target` | A report of `CaptureError::Exists` | `scratch_unavailable`, `Retryable` |
| `open_locked` | A second `Workspace::open` on the same path, through `error::open` | `workspace_unavailable`, `Retryable` |

### 7.3 Key builders and `ArtifactStorage` (`engine/src/storage/tests.rs`)

| Test | Input | Expected |
| --- | --- | --- |
| `namespace_keys_are_stable` (`engine/src/storage/tests.rs:390`), extended | Web `00000000-0000-0000-0000-000000000001`, connector `aviation`, run `00000000-0000-0000-0000-000000000002`, source `items`, fingerprint `fingerprint` | With `{root}` as in the test today: `{root}/current.json`, `{root}/runs/00000000-0000-0000-0000-000000000002/input.json`, `{root}/runs/00000000-0000-0000-0000-000000000002/capture/items.fingerprint.json`, and `…/capture/_done.json`, `…/diff/_done.json`, `…/plan/_done.json`, `…/send/_done.json` under the same run. The assertion at `:396-402` changes to the moved capture key. |
| `conditional_writers` (local and S3) | Two independent storage handles read absence and race to create; then both read one existing version and race to replace | Exactly one write succeeds in each race; the loser returns conflict and cannot clobber the winner. Local variant uses separate processes sharing the root. |
| `conditional_crash` (local) | Stop a writer before rename, and after rename before its acknowledgment; then acquire the same sidecar lock in another process | The current file is complete old or complete new JSON, the lock is released, and retry resolves from the observed value. |
| `conditional_unavailable` | Unsupported local lock/replace, S3 conditional failure other than precondition, or absent version on an existing remote object | Error; no unconditional overwrite. |
| `read_s3_error` (new) | `read_versioned` on S3 storage with a wrong secret | `ArtifactError::Read`. The result is not `None`. It follows `s3_errors_are_not_missing_bindings` (`engine/src/storage/tests.rs:191`). |
| `read_oversized` (new) | An externally seeded 1,048,577-byte object, then `read_versioned`; also an oversized `replace_if` payload | `ArtifactError::Read` for the read; `ArtifactError::Write` for the replacement, without changing the key. |

The tests `bound_returns_the_bound_reference` (`:120`) and `bind_keeps_the_first_reference` (`:160`) and the capture tests in `engine/src/sources/tests.rs:177`, `:266`, `:326` build their keys with `ArtifactNamespace::capture` and need no change.

### 7.4 `finished` and `finish` (`tests/marker.rs`)

The tests use `#[derive(Serialize, Deserialize, PartialEq, Debug)] struct Output { rows: u64 }` and the key `context.namespace.diff_output(run a1)`. `finish_equivalent_tables` instead uses an output with an `ArtifactRef` field so that the marker selects a complete file reference.

| Test | Input | Expected |
| --- | --- | --- |
| `finished_absent` | A new context | `None` |
| `finish_stores_body` | `finish` with `Output { rows: 2 }` | It returns `Output { rows: 2 }`. `bound(key)` returns a reference with the key `{ROOT}/artifacts/sha256/19/19b98918aa59c26ee086d8a818e64fded188be8b6e213ac21eea6ec19fa3bc00.json`, size 10 and format `Json`. The stored file holds `{"rows":2}`. `finished` returns `Some(Output { rows: 2 })`. |
| `finish_keeps_first` | `finish` with `rows: 2`, then `finish` with `rows: 3` through a second context on the same directory | The second call returns `Output { rows: 2 }`, and `finished` returns the same. |
| `finish_concurrent` | `tokio::join!` of two `finish` calls with `rows: 2` and `rows: 3` | Both return the same value, and `finished` returns it. |
| `finish_equivalent_tables` | Two Parquet files with equal schemas and ordered rows but different row-group layouts and artifact references; concurrent `finish` calls whose outputs reference those files | Both calls return the same winning output. `finished` returns that output, and fetching its reference reads the expected rows. The losing file cannot replace the winning reference. |
| `finish_removes_scratch_file` | `finish` with `rows: 2` | The top level of `scratch` holds no `.json` file. |
| `finished_invalid_body` | A JSON artifact `{"rows":"two"}` bound at the key | `stored_json_invalid`, `Permanent` |
| `finished_missing_body` | A marker written with `finish`, then the artifact file deleted from `{directory}/artifacts` and `scratch` emptied | `storage_unavailable`, `Retryable` |

Scenarios: every stage of every run calls both functions. The case "A stage runs twice with the same input" of `03-scenarios.md` relies on `finish_keeps_first`.

### 7.5 `store_query`, `load_table`, `RowFile` (`tests/table.rs`)

Each test opens workspaces with `context.open_workspace(Variables::default())`.

| Test | Input | Expected |
| --- | --- | --- |
| `store_query_round_trip` | `SELECT * FROM (VALUES (1::UBIGINT, 'a'), (2, NULL)) AS t(id, label) ORDER BY id`, stored, then loaded into table `loaded` of a second workspace | The reference has format `Parquet`. `SELECT * FROM loaded ORDER BY id` returns `(1, 'a')` and `(2, NULL)`. The top level of `scratch` holds no `.parquet` file after `store_query`. |
| `store_query_no_rows` | `SELECT 1::UBIGINT AS id, 'x' AS label WHERE false` | The loaded table has the columns `id` `UBIGINT` and `label` `VARCHAR`, read from `information_schema.columns`, and `count(*)` is 0. |
| `store_query_same_rows` | The query of `store_query_round_trip`, stored twice from two workspaces | The decoded schemas and ordered rows are equal. The artifact references need not be equal. |
| `store_query_missing_table` | `SELECT * FROM missing` | `query_invalid`, `Permanent`. The top level of `scratch` holds no `.parquet` file. |
| `load_table_replaces` | Two files loaded into the same table name, the second with other columns | The table has the columns and rows of the second file. |
| `load_table_missing_artifact` | A stored file whose object is deleted from `{directory}/artifacts` | `storage_unavailable`, `Retryable` |
| `row_file_types` | Columns `a` `Text`, `b` `Text` nullable, `c` `UInt16` nullable, `d` `UInt32`, `e` `UInt64`, `f` `Boolean`; rows `("x", Null, UInt(65535), UInt(4294967295), UInt(18446744073709551615), true)` and `("", Text("y"), Null, UInt(0), UInt(0), false)`; closed and loaded | The DuckDB types are `VARCHAR`, `VARCHAR`, `USMALLINT`, `UINTEGER`, `UBIGINT`, `BOOLEAN`. The rows read back equal, in push order. `SourceCapture::rows` is 2. |
| `row_file_no_rows` | The columns of `row_file_types`, closed without a row | `SourceCapture::rows` is 0. The loaded table has the six columns and no rows. |
| `row_file_batch_boundaries` | One `UInt64` column with 1,023, 1,024, 1,025 and 70,000 rows that hold 0, 1, 2 and so on | `SourceCapture::rows` equals the count, and `sum` of the column equals `n * (n - 1) / 2`. The file with 70,000 rows has two row groups of 65,536 and 4,464 rows. |
| `row_file_same_rows` | The rows of `row_file_types`, stored twice | The decoded schemas and rows in push order are equal. File bytes, sizes and artifact hashes need not match. |
| `row_file_invalid_row` | One case each: five cells for six columns; `Null` in `a`; `Text` in `d`; `Boolean` in `a`; `UInt(65536)` in `c`; `UInt(4294967296)` in `d` | `row_invalid`, `Permanent`. A later `close` writes the rows pushed before. |
| `row_file_invalid_columns` | No column; two columns named `a` | `row_invalid`, `Permanent` |
| `row_file_dropped` | A `RowFile` with one row, dropped | `scratch` holds no file. |
| `row_file_store` | A `RowFile` with one row, stored | The reference has format `Parquet`, and the top level of `scratch` holds no `.parquet` file. |

Scenarios: S1 run 1 writes `archives` and both `issues` files with no rows, and S1 run 2 writes `writes` with no rows. S1 run 1 writes `hashes`, `changes`, `writes` with rows. S6 run 1 writes `rejected` with a nullable `status` that is absent in one row.

Existing tests that cover the reused code: `capture_batch_boundaries`, `capture_empty_schema`, `load_capture_types_and_empty_schema` (`engine/tests/capture.rs:65`, `:258`, `:465`) and `publish_bounds_buffered_rows_by_size` (`engine/src/sources/rest.rs:745`). They stay as they are.

### 7.6 Current-state transitions (`tests/current.rs`)

| Test | State before | Call | Expected |
| --- | --- | --- | --- |
| `read_absent` | No file | `read` | `Current { committed: None, sending: [] }` |
| `mark_sending_first` | No file | `mark_sending(a2, None, &[])` | `committed` absent, `sending` [a2]. |
| `mark_sending_takeover` | `committed` a1, `sending` [a2] | `mark_sending(a3, Some(a1), &[a2])` | `sending` [a2, a3]. a2 subsequently fails `check_sending` and `commit` with `superseded`. |
| `mark_sending_listed` | `committed` a1, `sending` [a2] | Repeat `mark_sending(a2, Some(a1), &[])` | Success, no write. |
| `mark_sending_race` | Two callers read base a1 with no sender | Both mark with empty `resent`, synchronized before conditional replacement | One enters; the other re-reads and returns `superseded`. No sender is lost. |
| `commit_race` | a2 is sending against a1; a3's diff resends a2 | Race a2's commit with a3's mark | If commit wins, a3 gets `base_moved`; if takeover wins, a2 gets `superseded`. Neither overwrites the winner. |
| `commit_lost_response` | a2 is sending against a1 | Commit is stored but its response is lost; retry commit | Success with committed a2, without another write. |
| `commit_base_moved` | Another run committed after the caller read | Attempt the stale CAS and retry | `base_moved`, without restoring the old base or clearing newer senders. |
| `check_sending_absent` | Correct base, no sending entry | Check a2 | `superseded`. |
| `cas_contention_bound` | Eight competing updates invalidate the token before replacement | Mark or commit | Retryable `storage_unavailable`; no unconditional fallback. |
| `read_invalid_json` | The file holds `{"committed":7,"sending":[]}` | `read` | `stored_json_invalid`, Permanent. |

Scenarios: S1 run 1 (`committed` 1) and run 2 (`committed` 2). S6 run 1 commits with rejected writes. S7 run 2 leaves `committed` 1 and `sending` [2]; S7 run 3 commits with `resent` [2] and leaves `sending` empty. The stage 4 case "`committed` differs from `DiffOutput::base`" is `mark_sending_base_moved`.

### 7.7 `start` (`tests/start.rs`)

| Test | State before | Request | Expected |
| --- | --- | --- | --- |
| `start_apply` | Empty storage | `apply(a1, MINIMAL)` | The input of the first JSON block in section 3.1. The body bound at `{ROOT}/runs/00000000-0000-4000-8000-0000000000a1/input.json` has 296 bytes and the SHA-256 `1c46ed691535acb5e3e56123c0c175fef476b83fd6bcea9b3de83748deca6cb0`. |
| `start_apply_invalid_definition` | Empty storage | `apply(a1, "connector: [\n")` | `invalid_definition`, `Permanent`. `bound` of the input key is `None`. |
| `start_apply_other_connector` | Empty storage | `apply(a1, "connector: other\n")` | `integration_mismatch`, `Permanent`. It replaces `definition_other_connector` (`apps/hash-integrations/src/service/run_input.rs:101`, BE-1136). |
| `start_other_context` | A context built for the connector `linear` | `apply(a1, MINIMAL)` | `integration_mismatch`, `Permanent` |
| `start_repeated` | Run a1 started | The same request | The same input. The reference bound at the input key is unchanged. |
| `start_changed_request` | Run a1 started | One case each: the definition `connector: aviation\n\n`; `resend_all: true`; the namespace `other`; another actor; `allow_mass_archive: true`; `Reconcile` | `request_mismatch`, `Permanent` |
| `start_restore_run` | Run a1 started with `MINIMAL` | `Restore { target: Some(a1) }` as run a2 | `operation` `Restore { target: Some(a1) }`, `definition` `Some(MINIMAL)`, `namespace` `aviation` |
| `start_restore_missing_target` | Empty storage | `Restore { target: Some(a9) }` as run a2 | `target_missing`, `Permanent` |
| `start_restore_empty` | Run a1 started and `mark_sending(a1, None, &[])` then `commit(a1, None, &[])` called | `Restore { target: None }` as run a2 | `definition` `None`, `namespace` `aviation` |
| `start_restore_empty_uncommitted` | Empty storage | `Restore { target: None }` as run a2 | `definition` `None`, `namespace` empty |
| `start_restore_of_empty` | The state after `start_restore_empty` | `Restore { target: Some(a2) }` as run a3 | `operation` `Restore { target: Some(a2) }`, `definition` `None`, `namespace` `aviation` |
| `start_reconcile` | Run a1 started and committed | `Reconcile` as run a2 | `operation` `Reconcile { target: a1 }`, `definition` `Some(MINIMAL)`, `namespace` `aviation` |
| `start_reconcile_uncommitted` | Empty storage | `Reconcile` as run a2 | `nothing_committed`, `Permanent` |
| `start_reconcile_after_commit` | The state after `start_reconcile`, then `mark_sending(a2, Some(a1), &[])` and `commit(a2, Some(a1), &[])` | `Reconcile` as run a2 again | `operation` is still `Reconcile { target: a1 }`. |
| `start_committed_without_input` | `mark_sending(a7, None, &[])` then `commit(a7, None, &[])` called, no input for a7 | `Reconcile` as run a2 | `target_missing`, `Permanent` |

Tests of `RunInput::parse_definition`, in the same file. Each builds a `RunInput` by hand:

| Test | `definition` | Expected |
| --- | --- | --- |
| `parse_definition_absent` | `None` | `Ok(None)` |
| `parse_definition_minimal` | `Some(MINIMAL)` | `Ok(Some(definition))`, and `definition.connector()` is `aviation`. |
| `parse_definition_invalid` | `Some("connector: [\n")` | `invalid_definition`, `Permanent`. The report still holds the `ParseError`. |

Scenarios: every run 1 is an apply. S8 run 3 is a restore to run 1, with `definition` equal to run 1's. S8 run 4 is a restore to empty, with the namespace `aviation` of the committed run 3. S9 runs 2 and 4 are reconciles with the targets 1 and 3.

### 7.8 `run` (`tests/scenarios.rs`)

One test per scenario of `03-scenarios.md` calls `run` once per run of the scenario. The tests are unit tests of the engine crate, because they use the fake `Graph` of the stage 4 spec. A source that changes between runs is a changed definition text, as the scenarios state.

After each run, this spec asserts the stored `RunInput` and `read(&context)`. Each stage spec adds the assertions on its output and files to the same tests.

| Scenario | Assertions of this spec |
| --- | --- |
| S1 | After run 1: `committed` 1, `sending` []. After run 2: `committed` 2. |
| S6 | After run 1: `committed` 1, `sending` [], with two rejected writes. |
| S7 | Run 2 returns `Retryable`. After run 2: `committed` 1, `sending` [2], and `bound` of run 2's `send_output` key is `None`. After run 3: `committed` 3, `sending` []. |
| S8 | Run 3: `RunInput::operation` is `Restore { target: Some(1) }` and `definition` equals run 1's. Run 4: `Restore { target: None }`, `definition` `None`, `namespace` `aviation`. After run 4: `committed` 4. |
| S9 | Run 2: `Reconcile { target: 1 }`. Run 4: `Reconcile { target: 3 }`. |
| S2, S3, S4, S5 | After each run, `committed` is that run and `sending` is empty. |

Three more tests of `run`:

| Test | Runs | Expected |
| --- | --- | --- |
| `run_committed_again` | S1 run 1, then the same request again | The second call returns the `SendOutput` of the first. The fake Graph receives no request during the second call. The bytes of `current.json` are unchanged. |
| `run_continues_failed_send` | S7 run 2 with the fake unreachable after two requests, then the same request with the fake reachable | The second call returns `Ok`. The references bound at the `input`, `capture_output`, `diff_output` and `plan_output` keys of the run are the same before and after the second call. After it: `committed` 2, `sending` []. |
| `run_invalid_definition` | An apply with the definition `connector: [\n` | `invalid_definition`. `bound` is `None` for the `input` key and the four output keys. The fake Graph receives no request. |

### 7.9 The app

| Test | File | Input | Expected |
| --- | --- | --- | --- |
| `step_failure_kinds` | `service/function.rs` | `Code::BaseMoved.report()`, `Code::StorageUnavailable.report()`, `Report::new(StageError::Permanent)` | `StepFailure { Permanent, base_moved }`, `StepFailure { Retryable, storage_unavailable }`, `StepFailure { Permanent, unclassified }` |
| `failure_codes_valid` | `service/function.rs` | `Code::ALL` and `unclassified`, `web_mismatch`, `scratch_unavailable` | Every text parses as a `FailureCode`. |
| `function_step_names` | `service/function.rs` | A `PipelineFunction` with local storage in a `TempDir`, a `SecretStore` that fails every read, and a `Graph` that returns `Applied`; a `StepContext` that calls each step once and records its name; an apply of `connector: demo\n` | `Ok`. The recorded names are `start`, `capture`, `diff`, `plan`, `send`. |
| `function_retried_step` | `service/function.rs` | The same, with a `StepContext` that calls each step twice and returns the second result | `Ok`. Both calls of each step return equal outputs. |
| `function_other_web` | `service/function.rs` | A request for another web than the function's | `RunError::Failed` with the code `web_mismatch`. No step is requested. It replaces `definition_other_web` (`apps/hash-integrations/src/service/run_input.rs:89`, BE-1136). |
| `run_id_pinned` (`service/start.rs:60`, BE-1136), changed | `service/start.rs` | Web `00000000-0000-4000-8000-000000000001`, request `00000000-0000-4000-8000-00000000000a` | `interface_run_id(run_id(web, request)).as_ref()` is `0ccc2c92-e805-5182-803d-9d6c5fb90394`, the value the test asserts today. |
| `submit_records_run_start` (`service/tests.rs:133`, BE-1136), changed | `service/tests.rs` | A submission with connector `demo`, `Apply { definition: "connector: demo\n", namespace: "demo", resend_all: false }`, `allow_mass_archive: false`, and request ID `…00000000000a` | The recorded input is `{"run":"0ccc2c92-e805-5182-803d-9d6c5fb90394","web":"00000000-0000-4000-8000-000000000001","connector":"demo","actor":"00000000-0000-4000-8000-000000000002","operation":{"kind":"apply","definition":"connector: demo\n","namespace":"demo","resend_all":false},"allow_mass_archive":false}`. |
| `submit_other_connector` (new) | `service/tests.rs` | A submission with connector `other` and the definition `connector: demo\n` | `ServiceError::InvalidDefinition` |
| `exit_codes` | `subcommand/run.rs` | Reports of `Setup`, of `Stage` over `StageError::Permanent`, of `Stage` over `StageError::Retryable` | 2, 1, 3 |
| `request_restore` | `subcommand/run.rs` | The arguments `restore --empty` and `restore --target 00000000-0000-4000-8000-0000000000a1` | `Restore { target: None }` and `Restore { target: Some(a1) }` |

The helper `submission` (`apps/hash-integrations/src/service/tests.rs:120-125`, BE-1136) builds the new `Submission`. The tests `definition_matching`, `definition_other_web` and `definition_other_connector` are deleted with `run_input.rs`. No test starts the `run` subcommand as a process, because it needs a Graph and a Vault. The engine tests of section 7.8 cover `run`.

## 8. Open questions and contract problems

### Open questions

1. **Vault arguments.** The local runner requires the three Vault arguments also for a definition that has no source with credentials. The alternative is a second `SecretStore` in production code that fails every read. The only such type today is the test-only `NoSecrets` (`engine/src/sources/tests.rs:86`).
2. **Disk use of `scratch`.** The DuckDB files of stages 1, 2 and 3 stay in `scratch` until the run function returns. Deleting each file when its stage closes the workspace needs a path from `open_workspace` or a delete in `Workspace::close`.
3. **Empty namespace.** `start` accepts an apply request with an empty namespace. D3 has not fixed the value, so no check is specified.
4. **Workspace and capture limits of the local runner.** They are the defaults. Arguments for them can be added without a change to the engine.

### Contract problems

1. **`integration_mismatch` for the context.** The contract "Errors" raises `integration_mismatch` when the request and its definition name different connectors. `start` also raises it when the `RunContext` was built for another web or connector than the request, because the markers would then be written under another integration's root. Change needed: the condition in the contract also names the context.
2. **A restore to empty can fail.** The contract "Operations" gives no failure for a restore to empty, and `target_missing` names only the target of a restore or reconcile. `start` reads the namespace from the committed run's `input.json` and fails with `target_missing` when that file is missing. Change needed: the condition of `target_missing` also names the committed run of a restore to empty.
3. **Key builders and the run.** The contract "Marker functions" says that each key builder takes the run as a `Uuid`. `current()` takes no run. Change needed: the sentence names the six builders that take a run.
4. **Module tree.** The contract "Module tree" does not list `OperationRequest`, `FixedClock` and `InvalidText`. This spec puts them in `run/mod.rs`, `run/context.rs` and `run/target.rs`. Change needed: the tree lists them.
