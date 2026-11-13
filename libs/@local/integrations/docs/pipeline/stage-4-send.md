# Integration pipeline: stage 4, Send and commit

This file specifies `engine/src/stage/send/` and the changes to `engine/src/graph/client/`. It implements the sections "`writes`", "`SendOutput`", "`current.json`", "Rules of stage 4" and "Stage functions" of [`01-contracts.md`](01-contracts.md) and refers to them by title. The scenario names (S1 to S9) and the entity names (`AC-N100` and so on) are those of [`03-scenarios.md`](03-scenarios.md).

Paths are relative to `libs/@local/integrations/` unless they start with `libs/`, `tests/` or `src/`. A path that starts with `src/` is in labs `pocs/integrations_rs` at `40a8d14`. `engine/src/graph/` and `tests/integrations/graph/` are cited from `origin/main` at `c47a17eed3`. `engine/src/storage/`, `engine/src/sources/` and `engine/Cargo.toml` are cited from the BE-933 checkout. The Graph server is cited from `origin/main`.

## 1. Purpose

Stage 4 reads the `writes` file of checkpoint 3 and sends its request bodies to the Graph in `seq` order, one batch after another. It records every write the Graph refuses in the `rejected` file and stores `SendOutput` at `send/_done.json`. It then makes the run the committed run in `current.json`. Every request body is sent as stage 3 stored it.

## 2. Module layout

### New files under `engine/src/stage/send/`

| File | Content | Visibility |
| --- | --- | --- |
| `mod.rs` | The stage function `send`, `SendOutput`, `SendCounts`, the `superseded` check, and `deliver`, which sends every batch. | `send`, `SendOutput` and `SendCounts` are `pub`. `superseded` and `deliver` are private. |
| `writes.rs` | `Write`, `Requests`, `First`, and `WriteReader`, which reads the `writes` file one record batch at a time. | `pub(super)`. |
| `request.rs` | `Answer`, `Size`, `Class`, `classify`, `SendSettings::wait`, and `request`, which sends one request and repeats it as the response tables say. | `pub(super)`. `Class` and `classify` are private. |
| `single.rs` | `send_write`, `Outcome`, `Reason`: the response table for a single write. | `pub(super)`. |
| `batch.rs` | `send_batch`: the endpoint rule for links and the response table for a request of more than one write. | `send_batch` is `pub(super)`. Its helpers are private. |
| `tally.rs` | `Tally`: the counts, the rejected entity IDs and the `rejected` file. | `pub(super)`. |
| `tests/mod.rs`, `tests/request.rs`, `tests/single.rs`, `tests/batch.rs`, `tests/writes.rs`, `tests/tally.rs`, `tests/fake.rs`, `tests/stage.rs`, `tests/scenarios.rs` | The fixtures and the tests of section 7. `tests/fake.rs` tests the fake through its public functions. | `#[cfg(test)]`. |

### New files under `engine/src/graph/client/`

The contract "The Graph client" puts the trait, the response and the fake in `graph/`, next to `GraphClient`.

| File | Content | Visibility |
| --- | --- | --- |
| `graph.rs` | The trait `Graph`, `GraphResponse`, `RequestKind`. | `pub`. |
| `fake.rs` | `FakeGraph`, `FakeEntity`, `Recorded`: the in-memory implementation of `Graph`. | `pub`, compiled under `#[cfg(any(test, feature = "test-utils"))]`. |

The stage imports them as `crate::graph::{Graph, GraphResponse, RequestKind, OperationKind}`. It imports `SendSettings`, `RunContext`, `Code`, `error`, `Change`, `RunId`, `Current`, `RowFile`, `Column`, `ColumnKind`, `Cell`, `finished` and `finish` from `crate::run`. No module under `graph/` imports from `stage::send`.

### Changed files

| File | Change |
| --- | --- |
| `engine/src/graph/client/mod.rs` | Declares `mod graph` and, under `#[cfg(any(test, feature = "test-utils"))]`, `mod fake`, and re-exports their public items. `GraphClient` implements `Graph` with bulk requests. `GraphClient::send`, `Applied`, `accepted` and two variants of `GraphError` are removed. Section 5 lists each line range. |
| `engine/src/graph/client/tests.rs` | The tests call `Graph::create` and `Graph::patch`. Section 7 lists each test. |
| `engine/src/graph/mod.rs` | The re-export at `:24-25` loses `Applied` and gains `Graph`, `GraphResponse` and `RequestKind`, and, under `#[cfg(any(test, feature = "test-utils"))]`, `FakeGraph`, `FakeEntity` and `Recorded`. The stage 3 spec adds `OperationKind::as_str` and `OperationKind::from_stored` to this file. |
| `engine/src/lib.rs` | The export list (`:34-39` on `main`) loses `Applied` and gains `Graph`, `GraphResponse`, `RequestKind`, `SendOutput`, `SendCounts` and `send`. Under `#[cfg(any(test, feature = "test-utils"))]` it gains `FakeGraph`, `FakeEntity` and `Recorded`. |
| `engine/Cargo.toml` | A feature `test-utils = []` is added. The dev-dependencies gain `hash-integrations-engine = { workspace = true, features = ["test-utils"] }`, so that the tests under `engine/tests/` see the fake. `libs/@local/graph/postgres-store/Cargo.toml:65` and `:77` use the same pattern. |

The stage needs no new third-party dependency. `arrow-array` (`engine/Cargo.toml:28`), `parquet` with the `arrow` feature (`:36`), `reqwest` (`:37`), `serde_json` with `raw_value` (`:38`), `tokio` with `rt`, `sync` and `time` (`:41`) and `hash-graph-store` (`:24`) are dependencies today. The tests use tokio's `test-util` feature (`:58`).

A crate outside the engine that tests against the fake enables the feature in its dev-dependencies: `hash-integrations-engine = { workspace = true, features = ["test-utils"] }`.

## 3. Types

`Graph`, `GraphResponse`, `SendOutput` and `SendCounts` are given in full by the contracts. This section adds their derives and every type the contracts do not give. `Graph`, `GraphResponse` and `RequestKind` are in `engine/src/graph/client/graph.rs`.

### Types of the contracts

```rust
/// Sends request bodies to the Graph's entity API.
pub trait Graph: Send + Sync {
    /// Creates the entities whose bodies are given, in one request.
    fn create(
        &self,
        actor: ActorEntityUuid,
        bodies: &[&RawValue],
    ) -> impl Future<Output = GraphResponse> + Send;

    /// Patches the entities whose bodies are given, in one request.
    fn patch(
        &self,
        actor: ActorEntityUuid,
        bodies: &[&RawValue],
    ) -> impl Future<Output = GraphResponse> + Send;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GraphResponse { Applied, Status(u16), Unreachable }

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SendOutput { /* as in the contracts */ }

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SendCounts { /* as in the contracts */ }
```

- The trait methods have the form the contracts give, which `SecretStore::read` also uses (`engine/src/sources/secrets/mod.rs:50-57`). An implementation writes `async fn`. The returned futures are `Send`.
- `SendOutput` and `SendCounts` keep their Rust field names in JSON and refuse unknown fields, like `ArtifactRefV1` (`engine/src/storage/artifact/reference.rs:44-52`).
- `created + patched + archived + absent + rejected` equals the number of rows in `writes`.

### `RequestKind`

```rust
/// Which of the two requests of the Graph's bulk route is sent.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RequestKind {
    /// `POST /entities/bulk`.
    Create,
    /// `PATCH /entities/bulk`.
    Patch,
}
```

### `SendSettings`

`SendSettings` is defined in `run/context.rs` (`shared-run.md` section 3.4). It is `pub`, has the fields `max_attempts`, `first_wait` and `longest_wait`, and is the field `send` of `RunContext`. This stage does not define it. It reads `context.send` and adds the method `wait` (section 4.5).

- An **attempt** is one call of `Graph::create` or `Graph::patch` with one list of bodies. `max_attempts` counts the attempts of one request (contract "Sending"). The count starts at 1 for every request. The fallback request of a write is another request and has its own count, so one write causes at most `2 × max_attempts` calls.
- `SendSettings::default()` is `max_attempts: 5`, `first_wait: 500 ms`, `longest_wait: 30 s`. The two waits are the labs values (`src/graph/executor.rs:1780-1782`). Labs has no attempt limit per request; 5 is new.

### `Write`, `Requests`, `First`

```rust
/// One row of the `writes` file.
#[derive(Debug)]
pub(super) struct Write {
    /// The row's position in the send order.
    pub seq: u64,
    /// The number of the batch the row belongs to.
    pub batch: u32,
    /// The operation the row was planned as.
    pub operation: OperationKind,
    /// Why the row is written.
    pub change: Change,
    /// The entity the row writes, as `{web}~{uuid}`.
    pub entity_id: Box<str>,
    /// The step ID or link ID, copied to `rejected`.
    pub target: Box<str>,
    /// The source ID, copied to `rejected`.
    pub source_id: Box<str>,
    /// The entity a link upsert starts at.
    pub left_entity_id: Option<Box<str>>,
    /// The entity a link upsert ends at.
    pub right_entity_id: Option<Box<str>>,
    /// The request bodies of the row.
    pub requests: Requests,
}

/// The request bodies of one write.
#[derive(Debug)]
pub(super) enum Requests {
    /// A create body and a patch body. `first` says which one is sent first.
    Upsert { first: First, create: Box<RawValue>, patch: Box<RawValue> },
    /// The archive body, sent as a patch.
    Archive { archive: Box<RawValue> },
}

/// The first request of an upsert.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum First { Create, Patch }
```

- A **batch** is the list of writes with the same `batch` number.
- The stage compares entity IDs as text and never parses one.
- `Write` has three small methods. `first_kind()` returns `RequestKind::Create` for `Upsert { first: First::Create, .. }` and `RequestKind::Patch` otherwise. `first_body()` returns the create body, the patch body or the archive body by the same rule. `first_outcome()` returns `Outcome::Created`, `Outcome::Patched` or `Outcome::Archived` by the same rule.

### Stored text

`writes` and `rejected` hold `operation` and `change` as text. Stage 3 writes the text and stage 4 reads it. The stage uses these conversions and defines none:

- `OperationKind::as_str` and `OperationKind::from_stored`, defined in `engine/src/graph/mod.rs` by the stage 3 spec. `from_stored` returns `None` for any text other than `upsert_entity`, `upsert_link`, `archive_link` and `archive_entity`.
- `Change::as_str` and the `FromStr` implementation of `Change` (`run/target.rs`, `shared-run.md` section 3.2), with the texts `insert`, `update`, `resend` and `archive`.

### `WriteReader`

```rust
/// Reads the `writes` file one record batch at a time.
pub(super) struct WriteReader {
    /// The record batches of the file that are not read yet.
    batches: ParquetRecordBatchReader,
    /// The rows of the last record batch that are not returned yet.
    pending: VecDeque<Write>,
    /// The `seq` the next row must have.
    next_seq: u64,
    /// The number of the last batch returned.
    last_batch: Option<u32>,
}
```

A **record batch** is an Arrow `RecordBatch`, the unit the Parquet reader returns. It is unrelated to a batch of writes.

### `Answer`, `Size`, `Class`

```rust
/// The result of one request after its repeated attempts.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Answer {
    /// The Graph applied every body.
    Applied,
    /// The Graph answered with this status and the response tables decide what follows.
    Status(u16),
}

/// Which response table a request follows.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Size {
    /// One body.
    Single,
    /// More than one body.
    Bulk,
}

/// What one response means for the request that got it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Class {
    /// The request is done.
    Applied,
    /// The response tables decide on this status. The request is not sent again.
    Decide(u16),
    /// Wait and send again. After `max_attempts` the stage fails as retryable.
    Unavailable,
    /// Wait and send again. After `max_attempts` the status is returned as `Answer::Status`.
    Failing(u16),
}
```

### `Outcome`, `Reason`

```rust
/// What became of one write.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Outcome {
    /// The create request was applied.
    Created,
    /// The patch request of an upsert was applied.
    Patched,
    /// The archive request was applied.
    Archived,
    /// The archive request was answered with 404.
    Absent,
    /// The write is recorded in `rejected`.
    Rejected { status: Option<u16>, reason: Reason },
}

/// The `reason` column of `rejected`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Reason {
    GraphStatus,            // "graph_status"
    EndpointRejected,       // "endpoint_rejected"
    NotFoundAfterConflict,  // "not_found_after_conflict"
    ConflictAfterNotFound,  // "conflict_after_not_found"
}
```

`Reason::as_str` returns the text in the comment.

### `Tally`

```rust
/// What the stage has counted and recorded so far.
#[derive(Default)]
pub(super) struct Tally {
    /// The counts of `SendOutput`.
    pub counts: SendCounts,
    /// The entity IDs of the rejected `upsert_entity` writes of this execution.
    pub rejected_entities: HashSet<Box<str>>,
    /// The `rejected` file. It is created when the first write is rejected.
    file: Option<RowFile>,
}
```

`rejected_entities` holds entity upserts only. A link upsert names two entities as endpoints, link upserts are sent after all entity upserts, and no later write reads the set.

### `GraphClient`

```rust
/// Sends bulk requests to the Graph's entity API.
#[derive(Debug)]
pub struct GraphClient {
    /// `{graph_url}/entities/bulk`.
    bulk: Url,
    service_secret: Pin<Box<Secret<str>>>,
    client: Client,
    /// The time before which no request is sent, taken from the last `Retry-After` header.
    not_before: Mutex<Option<tokio::time::Instant>>,
}

/// Why a Graph client could not be built or a request could not be sent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum GraphError {
    #[display("the Graph client is not configured correctly")]
    Configuration,
    #[display("the request to the Graph failed")]
    Request,
}
```

`Mutex` is `std::sync::Mutex`. The lock is never held across an `await`.

### `FakeGraph`, `FakeEntity`, `Recorded`

The fake keeps four things per entity ID, as the contract "The Graph client" requires: whether the entity exists, whether it is archived, its property object and its edition count. An entity exists when `entities` has an entry for its ID, and `FakeEntity` holds the other three.

```rust
/// An in-memory Graph that answers bulk creates and bulk patches like the Graph's entity API.
#[derive(Debug, Default)]
pub struct FakeGraph {
    state: Mutex<FakeState>,
}

#[derive(Debug, Default)]
struct FakeState {
    /// Every entity the fake holds. An entity exists when it has an entry.
    entities: HashMap<EntityId, FakeEntity>,
    /// The answers a test has set, in the order they were set.
    rules: Vec<Rule>,
    /// How many more requests are answered before the fake is unreachable. `None` is no limit.
    reachable_for: Option<u64>,
    /// Every request received since the last call of `requests`.
    recorded: Vec<Recorded>,
}

/// The state of one entity in the fake.
#[derive(Debug, Clone, PartialEq)]
pub struct FakeEntity {
    /// Whether the last edition is archived.
    pub archived: bool,
    /// The property object of the last edition.
    pub properties: PropertyObjectWithMetadata,
    /// How many editions the entity has. A create writes the first.
    pub editions: u64,
}

/// One request the fake received.
#[derive(Debug, Clone, PartialEq)]
pub struct Recorded {
    pub kind: RequestKind,
    pub actor: ActorEntityUuid,
    /// The entity ID of every body the fake could read, in request order.
    pub entity_ids: Vec<EntityId>,
    /// The text of every body, in request order.
    pub bodies: Vec<Box<str>>,
    pub response: GraphResponse,
}

/// An answer a test has set for requests of `kind` that contain `entity_id`.
#[derive(Debug)]
struct Rule {
    kind: RequestKind,
    entity_id: EntityId,
    status: u16,
    /// How many more requests get the answer. `None` is no limit.
    remaining: Option<u32>,
}
```

`EntityId` and `PropertyObjectWithMetadata` are the `type_system` types. `PropertyObjectWithMetadata` derives `PartialEq` (`libs/@blockprotocol/type-system/rust/src/knowledge/property/object.rs:168-176`), so the fake compares two property objects as values. The create body and the patch body of one row can differ as text and still hold the same object.

## 4. Functions

Errors are built with `run/error.rs` (`shared-run.md` section 4.2): `Code::X.report()` makes a new report of code `X`, and `Code::X.wrap(report)` puts code `X` on an existing report. Section 6 lists the codes this stage adds. The marker key is `context.namespace.send_output(Uuid::from(run))`.

### 4.1 `send`

```rust
pub async fn send(
    context: &RunContext,
    input: &RunInput,
    diff: &DiffOutput,
    plan: &PlanOutput,
    graph: &impl Graph,
) -> Result<SendOutput, Report<StageError>>
```

Steps, in the order of the contracts' "Order of the stage":

1. Call `finished::<SendOutput>` with the marker key. When it returns an output, go to step 7 with it.
2. Call `current::read`.
3. When `superseded(&current, input.run, &diff.resent)` is true, return `Code::Superseded.report()`.
4. Call `current::mark_sending(context, input.run, diff.base)`.
5. Call `deliver` with `input.actor`, `plan` and `graph`. It reads `context.send`, sends every batch, stores `rejected` and returns the `SendOutput`.
6. Call `finish` with the marker key and the output. Use the output `finish` returns.
7. Call `current::commit(context, input.run, diff.base, &diff.resent)`.
8. Return the output.

```rust
let key = context.namespace.send_output(Uuid::from(input.run));
let output = match finished::<SendOutput>(context, &key).await? {
    Some(output) => output,
    None => {
        let current = current::read(context).await?;
        if superseded(&current, input.run, &diff.resent) {
            return Err(Code::Superseded.report());
        }
        current::mark_sending(context, input.run, diff.base).await?;
        let output = deliver(context, input.actor, plan, graph).await?;
        finish(context, &key, &output).await?
    }
};
current::commit(context, input.run, diff.base, &diff.resent).await?;
Ok(output)
```

Errors:

| Kind | Code | Condition |
| --- | --- | --- |
| Permanent | `superseded` | Step 3. |
| Permanent | `base_moved` | Returned by `mark_sending` or `commit`. `mark_sending` checks the base first, also when the run is already listed. It runs before the first request, so nothing is sent. |
| Any | Any | Returned by `finished`, `finish`, `read`, `mark_sending`, `commit` or `deliver` and passed on unchanged. |

The function carries `#[tracing::instrument(level = "info", skip_all, fields(run = %input.run))]`.

### 4.2 `superseded`

```rust
fn superseded(current: &Current, run: RunId, resent: &[RunId]) -> bool {
    current.sending.iter().any(|listed| *listed != run && !resent.contains(listed))
}
```

This is the rule of the contract "Order of the stage", step 2: `sending` lists a run that is neither this run nor in `DiffOutput::resent`. Such a run started sending after stage 2 of this run read `current.json`. Stage 2 records every run it finds in `sending` (contracts, "The resend set"), so a run listed before this run is always in `resent`. When this run is already listed, the function is true exactly when a run is listed after it. The function returns no error.

### 4.3 `deliver`

```rust
async fn deliver(
    context: &RunContext,
    actor: ActorEntityUuid,
    plan: &PlanOutput,
    graph: &impl Graph,
) -> Result<SendOutput, Report<StageError>>
```

Steps:

1. Start an empty `Tally`.
2. When `plan.batches` is 0, go to step 7. The `writes` file is not downloaded.
3. Download the file with `context.fetch(&plan.writes)` (`shared-run.md` section 4.5).
4. Open a `WriteReader` on the local file with the sum of `plan.counts` as the expected row count.
5. Read the next batch. When there is none, go to step 7.
6. Call `send_batch` with the batch, `&tally.rejected_entities` and `&context.send`. Record each returned outcome with `Tally::record`, in the order of the batch. Go to step 5.
7. Return `tally.finish(context)`.

The reader does blocking file IO. `open` and each `next_batch` run in `tokio::task::spawn_blocking`, and the reader is moved into the closure and returned from it. `engine/src/sources/rest.rs:161-166` moves its spool the same way.

```rust
let stopped = |error: JoinError| Code::ReaderStopped.wrap(Report::new(error));
let mut tally = Tally::default();
if plan.batches > 0 {
    let path = context.fetch(&plan.writes).await?;
    let rows = plan.counts.values().sum();
    let mut reader = spawn_blocking(move || WriteReader::open(&path, rows)).await
        .map_err(stopped)??;
    loop {
        let (returned, batch) = spawn_blocking(move || {
            let batch = reader.next_batch()?;
            Ok::<_, Report<StageError>>((reader, batch))
        }).await.map_err(stopped)??;
        reader = returned;
        let Some(batch) = batch else { break };
        let outcomes = send_batch(graph, actor, &batch, &tally.rejected_entities, &context.send).await?;
        for (write, outcome) in batch.iter().zip(outcomes) {
            tally.record(context, write, outcome)?;
        }
    }
}
tally.finish(context).await
```

The stage holds one batch of writes and the unreturned rows of one record batch in memory, whatever the size of the file.

Errors: `context.fetch` returns `storage_unavailable` or `storage_mismatch` through `error::artifact`. A `JoinError` of `spawn_blocking` gives `reader_stopped`. Every error of `WriteReader`, `send_batch` and `Tally` is passed on unchanged.

### 4.4 `WriteReader`

```rust
impl WriteReader {
    /// Opens the `writes` file at `path`, which must hold `rows` rows.
    pub(super) fn open(path: &Path, rows: u64) -> Result<Self, Report<StageError>>;

    /// Returns the writes of the next batch, or `None` after the last one.
    pub(super) fn next_batch(&mut self) -> Result<Option<Vec<Write>>, Report<StageError>>;
}

/// The rows a record batch is decoded into at most.
const READ_ROWS: usize = 128;
```

The engine reads Parquet files with `parquet::arrow::arrow_reader::ParquetRecordBatchReaderBuilder` today (`engine/src/capture.rs:8`, `:54-55`; `engine/src/workspace/connection/capture.rs:141-144`). `with_batch_size` is used in `engine/tests/capture.rs:142`. `ParquetRecordBatchReader` is an iterator of `Result<RecordBatch, ArrowError>` and is `Send`.

`open`:

1. Open the file with `std::fs::File::open`.
2. Build `ParquetRecordBatchReaderBuilder::try_new(file)`.
3. Compare `builder.metadata().file_metadata().num_rows()` with `rows`. When they differ, return `Code::InvalidWrites.report()`. The check runs before the first request.
4. Build the reader with `.with_batch_size(READ_ROWS).build()`.

`next_batch`:

1. Start an empty list.
2. When `pending` is empty, read the next record batch and decode it into `pending`. When the file has no further record batch, go to step 6.
3. Look at the first write in `pending`. When the list is not empty and the write has another `batch` number, go to step 6.
4. When the list is not empty and the write differs from the first write of the list in `operation` or in `first_kind()`, return `Code::InvalidWrites.report()`.
5. Move the write from `pending` to the list and go to step 2.
6. When the list is empty, return `None`. When its `batch` number is not greater than `last_batch`, return `Code::InvalidWrites.report()`. Otherwise set `last_batch` and return the list.

```rust
let mut batch: Vec<Write> = Vec::new();
loop {
    if self.pending.is_empty() && !self.refill()? { break; }
    let Some(next) = self.pending.front() else { continue };
    if let Some(first) = batch.first() {
        if next.batch != first.batch { break; }
        if next.operation != first.operation || next.first_kind() != first.first_kind() {
            return Err(Code::InvalidWrites.report());
        }
    }
    batch.extend(self.pending.pop_front());
}
```

`refill` reads one record batch, decodes every row with `decode` and returns `false` at the end of the file. A batch of writes can span two record batches, which is why `pending` exists.

`decode` reads one record batch into `Write` values:

1. Find each column of the contracts' "`writes`" by name with `RecordBatch::column_by_name` and downcast it. A missing column or another Arrow type returns `Code::InvalidWrites.report()`. Stage 3 writes the file with `RowFile`, and the contract "Tables as files" fixes the Arrow type of each `ColumnKind`, so the reader expects this schema:

| Column | `ColumnKind` | Arrow type | Array | Nullable |
| --- | --- | --- | --- | --- |
| `seq` | `UInt64` | `UInt64` | `UInt64Array` | No |
| `batch` | `UInt32` | `UInt32` | `UInt32Array` | No |
| `operation` | `Text` | `Utf8` | `StringArray` | No |
| `change` | `Text` | `Utf8` | `StringArray` | No |
| `entity_id` | `Text` | `Utf8` | `StringArray` | No |
| `target` | `Text` | `Utf8` | `StringArray` | No |
| `source_id` | `Text` | `Utf8` | `StringArray` | No |
| `left_entity_id` | `Text` | `Utf8` | `StringArray` | Yes |
| `right_entity_id` | `Text` | `Utf8` | `StringArray` | Yes |
| `create` | `Text` | `Utf8` | `StringArray` | Yes |
| `patch` | `Text` | `Utf8` | `StringArray` | No |

2. For each row, check that `seq` equals `next_seq` and add 1 to `next_seq`.
3. Convert `operation` with `OperationKind::from_stored` and `change` with `str::parse::<Change>`.
4. Check the pair: `archive_link` and `archive_entity` have the change `archive`, and `upsert_entity` and `upsert_link` have `insert`, `update` or `resend`.
5. Build `Requests`. For an upsert, `create` must be present, and `first` is `First::Create` when `change` is `insert` and `First::Patch` otherwise. For an archive, the `patch` column is the archive body and `create` is ignored.
6. Turn each body into `Box<RawValue>` with `RawValue::from_string`. The function checks that the text is JSON and builds no value tree. The body is never read again inside the stage.
7. Any failed check in steps 2 to 6, and a null in a column the contracts do not mark nullable, returns `Code::InvalidWrites.report()`.

A `ParquetError` or `ArrowError` is wrapped with `Code::InvalidWrites.wrap(Report::new(error))`. A `std::io::Error` is mapped with `error::scratch`.

Errors:

| Kind | Code | Condition |
| --- | --- | --- |
| Retryable | `scratch_unavailable` | The local file cannot be opened or read (`std::io::Error`), through `error::scratch`. |
| Permanent | `invalid_writes` | The file is not a Parquet file, a record batch cannot be decoded, or one of the checks above fails. |

### 4.5 `request`

```rust
/// Sends one request and repeats it as the response tables say.
pub(super) async fn request(
    graph: &impl Graph,
    actor: ActorEntityUuid,
    kind: RequestKind,
    bodies: &[&RawValue],
    settings: &SendSettings,
) -> Result<Answer, Report<StageError>>

fn classify(response: GraphResponse, size: Size) -> Class

// `SendSettings` is defined in `run/context.rs`; this method is in `stage/send/request.rs`.
impl SendSettings {
    /// The wait after `attempts` attempts of one request.
    pub(super) fn wait(&self, attempts: u32) -> Duration
}
```

`classify` holds the rows of both tables of the contracts' "Sending" that repeat a request:

```rust
match (response, size) {
    (GraphResponse::Applied, _) => Class::Applied,
    (GraphResponse::Unreachable, _) => Class::Unavailable,
    (GraphResponse::Status(429 | 502 | 503 | 504), _) => Class::Unavailable,
    (GraphResponse::Status(499), Size::Single) => Class::Unavailable,
    (GraphResponse::Status(500), Size::Single) => Class::Failing(500),
    (GraphResponse::Status(status), _) => Class::Decide(status),
}
```

For a request of more than one write, 499 and 500 are "any other status", so they are `Class::Decide`.

`wait` returns `min(first_wait × 2^min(attempts − 1, 6), longest_wait)`. With the default settings the waits after attempts 1 to 8 are 500 ms, 1 s, 2 s, 4 s, 8 s, 16 s, 30 s and 30 s. Labs computes `min(500 ms << min(requests_used, 6), 30 s)` over the requests of a turn (`src/graph/executor.rs:1780-1782`).

`request`:

1. `size` is `Size::Bulk` when `bodies` has more than one entry and `Size::Single` otherwise.
2. Set `attempt` to 1.
3. Call `graph.create` or `graph.patch` by `kind` and classify the response.
4. `Class::Applied` returns `Answer::Applied`. `Class::Decide(status)` returns `Answer::Status(status)`.
5. `Class::Unavailable` on attempt `max_attempts` returns `Code::GraphUnavailable.report()` with the last response attached.
6. `Class::Failing(status)` on attempt `max_attempts` returns `Answer::Status(status)`. The single-write table says for 500: "Wait and send again; after `max_attempts` reject".
7. On an earlier attempt, `Class::Unavailable` and `Class::Failing` sleep `settings.wait(attempt)` with `tokio::time::sleep`.
8. Add 1 to `attempt` and go to step 3.

```rust
let size = if bodies.len() > 1 { Size::Bulk } else { Size::Single };
let mut attempt = 1;
loop {
    let response = match kind {
        RequestKind::Create => graph.create(actor, bodies).await,
        RequestKind::Patch => graph.patch(actor, bodies).await,
    };
    match classify(response, size) {
        Class::Applied => return Ok(Answer::Applied),
        Class::Decide(status) => return Ok(Answer::Status(status)),
        Class::Unavailable if attempt >= settings.max_attempts => {
            return Err(Code::GraphUnavailable.report().attach(format!("{response:?}")));
        }
        Class::Failing(status) if attempt >= settings.max_attempts => {
            return Ok(Answer::Status(status));
        }
        Class::Unavailable | Class::Failing(_) => tokio::time::sleep(settings.wait(attempt)).await,
    }
    attempt += 1;
}
```

One count and one wait sequence cover both classes: a request answered 503, 500, 503 with `max_attempts` 3 waits 500 ms and 1 s and fails as retryable on the third response.

`GraphResponse` does not carry a wait. The HTTP implementation keeps the `Retry-After` value itself and delays its next request (section 4.9). The stage's wait and that delay run at the same time, so the next request starts after the longer of the two.

Errors:

| Kind | Code | Condition |
| --- | --- | --- |
| Retryable | `graph_unavailable` | Attempt `max_attempts` of one request is answered 429, 502, 503, 504 or `Unreachable`, or 499 for a single write. |

### 4.6 `send_write`

```rust
/// Sends one write on its own and returns what became of it.
pub(super) async fn send_write(
    graph: &impl Graph,
    actor: ActorEntityUuid,
    write: &Write,
    settings: &SendSettings,
) -> Result<Outcome, Report<StageError>>
```

The function is the contracts' table "For a single write". Every call of `request` below passes a list of one body. The rows 429, 502, 503, 504, `Unreachable`, 499 and 500 are inside `request`; this function sees `Answer::Applied` or `Answer::Status`.

Steps for an upsert whose first request is the create:

1. Send the create. `Applied` gives `Outcome::Created`.
2. On 409, send the patch. `Applied` gives `Outcome::Patched`. 404 gives `Rejected` with `NotFoundAfterConflict`. Any other status gives `Rejected` with `GraphStatus`.
3. Any other status of the create, 404 included, gives `Rejected` with `GraphStatus`.

Steps for an upsert whose first request is the patch:

1. Send the patch. `Applied` gives `Outcome::Patched`.
2. On 404, send the create. `Applied` gives `Outcome::Created`. 409 gives `Rejected` with `ConflictAfterNotFound`. Any other status gives `Rejected` with `GraphStatus`.
3. Any other status of the patch, 409 included, gives `Rejected` with `GraphStatus`.

Steps for an archive:

1. Send the archive body as a patch. `Applied` gives `Outcome::Archived`. 404 gives `Outcome::Absent`. Any other status gives `Rejected` with `GraphStatus`.

The `status` of a `Rejected` outcome is the status of the last response.

```rust
let rejected = |status, reason| Outcome::Rejected { status: Some(status), reason };
let one = |kind, body: &RawValue| request(graph, actor, kind, &[body], settings);

Ok(match &write.requests {
    Requests::Upsert { first: First::Create, create, patch } => {
        match one(RequestKind::Create, create).await? {
            Answer::Applied => Outcome::Created,
            Answer::Status(409) => match one(RequestKind::Patch, patch).await? {
                Answer::Applied => Outcome::Patched,
                Answer::Status(404) => rejected(404, Reason::NotFoundAfterConflict),
                Answer::Status(status) => rejected(status, Reason::GraphStatus),
            },
            Answer::Status(status) => rejected(status, Reason::GraphStatus),
        }
    }
    Requests::Upsert { first: First::Patch, create, patch } => {
        match one(RequestKind::Patch, patch).await? {
            Answer::Applied => Outcome::Patched,
            Answer::Status(404) => match one(RequestKind::Create, create).await? {
                Answer::Applied => Outcome::Created,
                Answer::Status(409) => rejected(409, Reason::ConflictAfterNotFound),
                Answer::Status(status) => rejected(status, Reason::GraphStatus),
            },
            Answer::Status(status) => rejected(status, Reason::GraphStatus),
        }
    }
    Requests::Archive { archive } => match one(RequestKind::Patch, archive).await? {
        Answer::Applied => Outcome::Archived,
        Answer::Status(404) => Outcome::Absent,
        Answer::Status(status) => rejected(status, Reason::GraphStatus),
    },
})
```

Errors: `graph_unavailable` from `request`, passed on unchanged.

### 4.7 `send_batch`

```rust
/// Sends the writes of one batch and returns one outcome per write, in the order of the batch.
pub(super) async fn send_batch(
    graph: &impl Graph,
    actor: ActorEntityUuid,
    batch: &[Write],
    rejected: &HashSet<Box<str>>,
    settings: &SendSettings,
) -> Result<Vec<Outcome>, Report<StageError>>

/// Whether `write` is a link upsert with an endpoint in `rejected`.
fn endpoint_rejected(write: &Write, rejected: &HashSet<Box<str>>) -> bool

/// Sends `writes` in one request when there is more than one, and one by one when that request is refused.
async fn send_together(
    graph: &impl Graph,
    actor: ActorEntityUuid,
    writes: &[&Write],
    settings: &SendSettings,
) -> Result<Vec<Outcome>, Report<StageError>>
```

`endpoint_rejected` is true when `write.operation` is `OperationKind::UpsertLink` and `left_entity_id` or `right_entity_id` is in `rejected`. A link archive is always sent.

`send_batch`:

1. Collect the writes of the batch for which `endpoint_rejected` is false.
2. Call `send_together` with them.
3. Build the result in batch order. A write for which `endpoint_rejected` is true gets `Outcome::Rejected { status: None, reason: Reason::EndpointRejected }`. Every other write gets the next outcome of step 2.

`send_together` is the contracts' table "For a request of more than one write":

1. With no write, return an empty list and send nothing.
2. With one write, return the outcome of `send_write`. A batch of one write, and a batch that the endpoint rule reduces to one write, follow the single-write table directly.
3. With more than one write, call `request` with the `first_kind()` of the first write and the `first_body()` of every write. All writes of a batch have the same first request (contracts, "`writes`").
4. `Answer::Applied` gives every write its `first_outcome()`.
5. `Answer::Status(_)` sends each write with `send_write`, in order. Each write starts again with its own first request.

```rust
// send_batch
let open: Vec<&Write> = batch.iter().filter(|write| !endpoint_rejected(write, rejected)).collect();
let mut sent = send_together(graph, actor, &open, settings).await?.into_iter();
Ok(batch.iter().map(|write| {
    if endpoint_rejected(write, rejected) {
        Outcome::Rejected { status: None, reason: Reason::EndpointRejected }
    } else {
        sent.next().expect("should have one outcome for every write that was sent")
    }
}).collect())

// send_together
match writes {
    [] => Ok(Vec::new()),
    [write] => Ok(vec![send_write(graph, actor, write, settings).await?]),
    [first, ..] => {
        let bodies: Vec<&RawValue> = writes.iter().map(|write| write.first_body()).collect();
        match request(graph, actor, first.first_kind(), &bodies, settings).await? {
            Answer::Applied => Ok(writes.iter().map(|write| write.first_outcome()).collect()),
            Answer::Status(_) => {
                let mut outcomes = Vec::with_capacity(writes.len());
                for write in writes {
                    outcomes.push(send_write(graph, actor, write, settings).await?);
                }
                Ok(outcomes)
            }
        }
    }
}
```

The set of rejected entity IDs is read once, before the batch is sent. An entity upsert and a link upsert are never in the same batch, so every endpoint of the batch was sent in an earlier batch.

Errors: `graph_unavailable` from `request`, passed on unchanged. A batch that fails this way ends the stage, and no later batch is sent.

### 4.8 `Tally`

```rust
impl Tally {
    /// Counts `outcome` and records `write` in `rejected` when it was rejected.
    pub(super) fn record(
        &mut self,
        context: &RunContext,
        write: &Write,
        outcome: Outcome,
    ) -> Result<(), Report<StageError>>;

    /// Stores the `rejected` file, if any write was rejected, and returns the stage's output.
    pub(super) async fn finish(self, context: &RunContext) -> Result<SendOutput, Report<StageError>>;
}
```

`record`:

1. `Created`, `Patched`, `Archived` and `Absent` add 1 to the count of the same name.
2. `Rejected` adds 1 to `counts.rejected`.
3. For `Rejected`, when `file` is `None`, create it with `RowFile::create(context, &REJECTED_COLUMNS)`.
4. For `Rejected`, push one row and log one `tracing::warn!` event with the entity ID, the operation, the status and the reason.
5. For `Rejected`, when `write.operation` is `OperationKind::UpsertEntity`, insert `write.entity_id` into `rejected_entities`.

The columns and the row, in the order of the contracts' "`rejected`":

| Column | `ColumnKind` | Nullable | Cell |
| --- | --- | --- | --- |
| `entity_id` | `Text` | No | `write.entity_id` |
| `operation` | `Text` | No | `write.operation.as_str()` |
| `change` | `Text` | No | `write.change.as_str()` |
| `target` | `Text` | No | `write.target` |
| `source_id` | `Text` | No | `write.source_id` |
| `status` | `UInt16` | Yes | `Cell::UInt(status)` or `Cell::Null` |
| `reason` | `Text` | No | `reason.as_str()` |

The row holds values of the `writes` row and the response status. `GraphResponse` has no response body, so none can reach the file. The contract "`rejected`" requires the rows in `seq` order. They are written in that order, because batches are sent in `seq` order and outcomes are recorded in batch order.

`finish` returns `SendOutput { rejected, counts }`. `rejected` is `Some(file.store(context).await?)` when a file exists and `None` otherwise.

Errors: those of `RowFile::create`, `RowFile::push` and `RowFile::store`, passed on unchanged.

### 4.9 The HTTP implementation: `GraphClient`

`GraphClient` implements `Graph`. A request of one write uses the bulk route with an array of one body. The Graph's single routes call the same store functions with a list of one entity (`libs/@local/graph/store/rust/src/entity/store.rs:764-775`, `:946-957`), so both routes give the same status for one entity, and the client needs one request path and one way to build a body.

The request:

| Part | Bulk create | Bulk patch |
| --- | --- | --- |
| Method | `POST` | `PATCH` |
| URL | `{graph_url}/entities/bulk` | `{graph_url}/entities/bulk` |
| `Authorization` | `{SERVICE_AUTH_SCHEME} {service secret}`, marked sensitive | Same |
| `ACTOR_ID_HEADER` | The actor as text | Same |
| `Content-Type` | `application/json` | Same |
| Body | `[` + the create bodies joined with `,` + `]` | `[` + the patch or archive bodies joined with `,` + `]` |

The headers are those of `engine/src/graph/client/mod.rs:148-158`. The Graph's handlers accept the body:

- `create_entities` reads the body as JSON and deserializes it into `Vec<CreateEntityParams>` (`libs/@local/graph/api/src/rest/legacy/entity/mod.rs:343-349`). A body it cannot read is answered 400.
- `patch_entities` takes `Json<Vec<PatchEntityParams>>` (`:619`). An archive body is a `PatchEntityParams` whose other fields have defaults (`libs/@local/graph/store/rust/src/entity/store.rs:496-517`).
- Both types refuse unknown fields (`store.rs:150`, `:496`).
- Each handler runs one transaction (`libs/@local/graph/postgres-store/src/store/postgres/knowledge/entity/mod.rs:1211-1214`, `:2178`, `:2234`).

Functions:

```rust
impl GraphClient {
    pub fn new(graph_url: &Url, service_secret: Pin<Box<Secret<str>>>)
        -> Result<Self, Report<GraphError>>;

    /// Sends `bodies` as one bulk request and turns the result into a `GraphResponse`.
    async fn exchange(&self, method: Method, actor: ActorEntityUuid, bodies: &[&RawValue])
        -> GraphResponse;

    /// Waits until requests may be sent again.
    async fn pace(&self);

    async fn request(&self, method: Method, actor: ActorEntityUuid, body: String)
        -> Result<Response, Report<GraphError>>;

    /// Reads the status and the `Retry-After` header and discards the body.
    async fn answer(&self, response: Response) -> GraphResponse;
}

impl Graph for GraphClient {
    async fn create(&self, actor, bodies) -> GraphResponse { self.exchange(Method::POST, actor, bodies).await }
    async fn patch(&self, actor, bodies) -> GraphResponse { self.exchange(Method::PATCH, actor, bodies).await }
}

/// The JSON array of `bodies`.
fn array(bodies: &[&RawValue]) -> String

/// The wait a `Retry-After` header asks for, at most 30 seconds.
fn retry_after(headers: &HeaderMap) -> Option<Duration>
```

`new` keeps the checks of `engine/src/graph/client/mod.rs:81-87` and the client options of `:94-99` with these changes:

1. The URL gets the path segments `entities` and `bulk` (`:89-93` push `entities` only).
2. The timeout is 120 seconds (`:97` has 30). A bulk request holds up to 128 entities. 120 seconds is the labs default (`src/config.rs:75-77`).
3. `new` builds the `Authorization` header value once and returns `GraphError::Configuration` when the secret cannot be a header value. Today that check runs on every request (`:148-152`).

`array` allocates `sum of the body lengths + bodies.len() + 1` bytes, pushes `[`, each `RawValue::get()` with `,` between two bodies, and `]`. No body is parsed.

`exchange`:

1. Await `pace`.
2. Call `request` with `array(bodies)`.
3. On an error, log it with `tracing::warn!` and return `GraphResponse::Unreachable`. A timeout is such an error.
4. On a response, return `answer(response)`.

`request` is the function at `engine/src/graph/client/mod.rs:142-164` with two changes: the body parameter is the `String` of `array`, and the URL is `self.bulk`.

`answer`:

1. Read the status.
2. For a status outside 200 to 299, set `not_before` to now plus `retry_after(response.headers())` when the header gives a value.
3. Read the body to its end with `Response::chunk` and count its bytes. The bytes are dropped. Reading to the end lets the connection be used again.
4. A status from 200 to 299 returns `GraphResponse::Applied`, also when step 3 failed. The body is not read for content (labs behaviour 40, `src/graph/client.rs:179-181`).
5. Any other status logs one `tracing::warn!` event with the status and the byte count, and returns `GraphResponse::Status(status)`.

`retry_after` reads the header as whole seconds and caps the value at 30 seconds. Any other form gives `None`. This is the labs rule (`src/graph/client.rs:173-178`).

`pace` copies `not_before` out of the lock and awaits `tokio::time::sleep_until` when it is in the future. **Rate limiting (D11) will be added in `pace`**: the function is called once before every request, so a shared token bucket is awaited there and the stage needs no change.

What happens to the existing items:

- `GraphClient::send` (`:114-140`) is removed. Its create-then-patch logic and its 404 rule for archives are in `send_write`.
- `Applied` (`:52-60`) is removed. `Outcome` and `SendCounts` take its place.
- `GraphError` keeps `Configuration` and `Request`. `Payload` and `Status` are removed. `GraphResponse::Status` takes the place of `GraphError::Status`.
- `accepted` (`:168-180`) and `DIAGNOSTIC_LIMIT` (`:32`) are removed. No part of a response body is kept.

Errors: `GraphClient::new` returns `GraphError::Configuration`. The trait methods return no error.

### 4.10 The fake: `FakeGraph`

```rust
impl FakeGraph {
    /// Answers `status` to every later request of `kind` that contains `entity_id`.
    pub fn answer(&self, kind: RequestKind, entity_id: EntityId, status: u16);

    /// Answers `status` to the next `times` requests of `kind` that contain `entity_id`.
    pub fn answer_times(&self, kind: RequestKind, entity_id: EntityId, status: u16, times: u32);

    /// Removes every answer set with `answer` and `answer_times`.
    pub fn clear_answers(&self);

    /// Answers the next `requests` requests and is unreachable after them.
    pub fn unreachable_after(&self, requests: u64);

    /// Answers every request again.
    pub fn reachable(&self);

    /// Returns every request received since the last call, in order, and forgets them.
    pub fn requests(&self) -> Vec<Recorded>;

    /// Returns the state of `entity_id`, or `None` when the fake does not hold it.
    pub fn entity(&self, entity_id: EntityId) -> Option<FakeEntity>;
}

impl Graph for FakeGraph { /* create and patch call `handle` */ }
```

`handle(kind, actor, bodies)` answers one request:

1. When `reachable_for` is `Some(0)`, the response is `Unreachable`. When it is `Some(n)`, set it to `n − 1`. Go to step 6 when unreachable.
2. Deserialize every body: a create body into `hash_graph_store::entity::CreateEntityParams`, a patch body into `PatchEntityParams`. These are the types the Graph reads. When a body cannot be read, the response is `Status(400)` for a create and `Status(422)` for a patch.
3. Find the first rule with the request's `kind` whose `entity_id` is in the request. When there is one, the response is `Status(rule.status)`. Lower `remaining` and remove the rule at 0.
4. Otherwise apply the bodies in order to a copy of `entities`. The first body that fails decides the response and the copy is dropped.
5. When every body was applied, the copy takes the place of `entities` and the response is `Applied`.
6. Record the request with its response and return the response. A request answered by a rule or with `Unreachable` changes no entity.

Applying a create body:

| Condition | Response |
| --- | --- |
| The body has no `entityUuid` | `Status(400)` |
| The ID `{webId}~{entityUuid}` is in the copy, archived or not | `Status(409)` |
| The body has `linkData` and its left or right entity is not in the copy | `Status(500)` |
| Otherwise | The copy gets the ID with `archived: false`, the body's `properties` and `editions: 1`. |

Applying a patch body:

| Condition | Response |
| --- | --- |
| The `entityId` is not in the copy | `Status(404)` |
| `properties` holds an operation other than one `replace` with an empty path and an object | `Status(500)` |
| Otherwise | The property object is the object of the replace, or the stored one when `properties` is empty. `archived` is the body's value, or the stored one when the body has none. When the property object or `archived` differs from the stored value, both are stored and `editions` grows by 1. Otherwise nothing changes. |

How this matches the Graph:

- One transaction per request, and a create of an existing ID answers 409 (`libs/@local/graph/postgres-store/src/store/postgres/knowledge/entity/mod.rs:1722-1733`, mapped by `libs/@local/status/rust/src/status_code/http_compat.rs:12`).
- A patch of a missing ID answers 404 (`libs/@local/graph/postgres-store/src/store/postgres/knowledge/entity/patch.rs:289-303`).
- A patch that changes nothing returns the stored entity and writes no edition (`patch.rs:414-426`). `archived` is a field of the edition, so an archived entity is found by a patch, and an archive of an archived entity changes nothing.
- A failure without a status code answers 500 (`libs/@local/graph/api/src/rest/legacy/status.rs:107-117`). The overview's review found this for a missing link endpoint.
- A link endpoint that is archived counts as existing in the fake. The Graph's answer for that case was not checked (section 8, open question 4).
- The fake compares the property object and `archived`. The Graph also compares entity types, draft state and confidence (`patch.rs:414-426`), and no body of the pipeline changes those for an existing ID.

### 4.11 A second execution of the stage

`send` can stop at any point and be called again with the same input. The table gives the state at each stopping point and what the second execution does.

| The first execution stopped | State | The second execution |
| --- | --- | --- |
| Before `mark_sending` returned | No request was sent. `current.json` is unchanged, or lists the run when the write happened and the call did not return. | Runs steps 1 to 8. `mark_sending` first returns `base_moved` when another run committed in between. Otherwise it does nothing when the run is listed. |
| While sending | Some batches reached the Graph. `sending` lists the run. No marker exists. | Sends every batch again from `seq` 0 (D8). The outcomes and the `rejected` file are built again from the start. |
| After the last batch, before the marker | Every batch reached the Graph. No marker exists. The `rejected` file may be stored. | The same as the row above. A `rejected` file of the first execution stays in storage without a reference. |
| After the marker, before `commit` returned | The marker exists. `sending` lists the run. | `finished` returns the stored output. No request is sent. `commit` runs. |
| After `commit` | `committed` is the run. | `finished` returns the stored output. `commit` does nothing. The function returns the stored output. |

What a resend does in the Graph:

- A bulk create of entities that exist answers 409. Each write is then sent on its own: its create answers 409 and its patch is applied. The patch holds the same values, so the Graph writes no edition.
- A patch and an archive that were applied before change nothing.
- The counts describe the execution that wrote the marker. An insert that the first execution created is counted in `patched` by the second.
- A batch of `n` creates that was applied before costs `1 + 2n` requests on the resend (257 for 128 writes).

When a later run has committed, `commit` of a stage that runs again returns `base_moved`, because `committed` is neither the run nor its base.

## 5. Existing code

### Monorepo

| Path:line | Item | Change |
| --- | --- | --- |
| `engine/src/graph/client/mod.rs:1-9` | Module documentation | Rewritten for bulk requests and the `Graph` trait. |
| `engine/src/graph/client/mod.rs:29` | `use super::{PlannedWrite, plan::SavedRequests}` | Removed. |
| `engine/src/graph/client/mod.rs:32` | `DIAGNOSTIC_LIMIT` | Removed. |
| `engine/src/graph/client/mod.rs:35-49` | `GraphError` | `Payload` (`:40-42`) and `Status` (`:46-48`) are removed. `Configuration` and `Request` are used as is. |
| `engine/src/graph/client/mod.rs:52-60` | `Applied` | Removed. |
| `engine/src/graph/client/mod.rs:63-68` | `GraphClient` | The field `entities` becomes `bulk`. The field `not_before` is added. |
| `engine/src/graph/client/mod.rs:77-105` | `GraphClient::new` | The three changes of section 4.9. |
| `engine/src/graph/client/mod.rs:114-140` | `GraphClient::send` | Removed. |
| `engine/src/graph/client/mod.rs:142-164` | `GraphClient::request` | The body parameter becomes `String` and the URL becomes `self.bulk`. |
| `engine/src/graph/client/mod.rs:168-180` | `accepted` | Removed. `answer` takes its place. |
| `engine/src/graph/client/tests.rs:47-104` | The mock server `Graph` and `record` | Renamed `MockGraph`, because `Graph` is now the trait. It serves `{prefix}/entities/bulk` and can answer with a `Retry-After` header. It stays the test server of the HTTP implementation. The in-memory fake is new code and takes its per-entity rules from this spec. |
| `engine/src/graph/mod.rs:24-25` | Re-export of `Applied`, `GraphClient`, `GraphError` | `Applied` is removed from the list. `Graph`, `GraphResponse`, `RequestKind` and the fake's types are added, as in section 2. |
| `engine/src/graph/mod.rs:152-158` | `OperationKind` | Used as is. The stage 3 spec adds `as_str` and `from_stored`. |
| `engine/src/graph/plan/request.rs:69`, `:115` | `SavedRequests`, `Payload::requests` | Their only caller is `GraphClient::send`. They have no caller after this spec. The stage 3 spec decides their removal. |
| `engine/src/lib.rs:34-39` | Crate exports | Changed as in section 2. |
| `engine/src/storage/artifact/mod.rs:142` | `ArtifactStorage::materialize` | Used as is, through `RunContext::fetch`. |
| `engine/src/storage/mod.rs:16` | `ArtifactError` | Used as is. `error::artifact` maps it. |
| `engine/src/sources/tests.rs:29`, `:46` | `Server`, `server` | `pub(super)` in the checkout and `pub(crate)` on `main`. They become `pub(crate)` again, because `engine/src/graph/client/tests.rs:30` imports them. |
| `engine/src/capture.rs:54-55`, `engine/src/workspace/connection/capture.rs:141-144` | Use of `ParquetRecordBatchReaderBuilder` | Used as a pattern. `WriteReader` builds its own reader. |
| `engine/src/progress/mod.rs:20` | `Progress` | Not used by this spec. |
| `engine/Cargo.toml` | Features and dev-dependencies | Changed as in section 2. |
| `tests/integrations/graph/aviation/mod.rs:299-308` | The loop over `client.send` | Removed. Section 7.7 gives the new test. |

### Labs

| Path:line | Logic | Taken | Left |
| --- | --- | --- | --- |
| `src/graph/executor.rs:1728-1764` `classify` | Maps a response to success, conflict, retryable or permanent | 409 on a create leads to the patch. 429, 502, 503, 504 and a transport failure are repeated. Every other 4xx ends the write. | The rule that a response body with `duplicate key` or `ALREADY_EXISTS` is a conflict: `GraphResponse` has no body. "Every 5xx is retryable": 500 follows C3. `bounded_diagnostic` (`:1766-1778`): no body is kept. |
| `src/graph/executor.rs:1413-1528` `deliver_once` | One write: create, patch on conflict; archive | Create then patch on 409. | The known-conflict set, the request cost, the 409 on an archive as success (the contracts reject it), the 404 on an archive as failure (the contracts count it as absent). |
| `src/graph/executor.rs:1211-1336` `execute_patch_first_effect` | Patch, create on 404, patch again on 409 | Patch then create on 404. | The third request. The contracts send each request at most once as a fallback. |
| `src/graph/executor.rs:1017-1111` `execute_create_batch_group` | One bulk create, then single writes when it is refused | The step from the whole batch to single writes, with no halving. | Patch-first singles after a bulk 409 (`:1069-1090`), the stop at the first write that fails (`:1096-1102`), the request budget. |
| `src/graph/executor.rs:1780-1782` `retry_delay` | `min(500 ms << min(n, 6), 30 s)` | The formula, counted per request. | The count over a turn. |
| `src/graph/executor.rs:761-764` | `Retry-After` replaces the default wait | The value delays the next request inside `GraphClient`. | The replacement: the stage waits its own wait as well. |
| `src/graph/client.rs:173-178`, `:220-225` | `Retry-After` as whole seconds, capped at 30 s | Taken as `retry_after`. | Nothing. |
| `src/graph/client.rs:191-254` `create_batch_once` | `POST /entities/bulk` with an array of create bodies | The route and the array. | The parsed `Vec<Value>` body, the token per batch, the log of 512 characters of the response body (`:230-247`, labs defect 34). |
| `src/graph/client.rs:133-189` `effect_request_once` | One request to `/entities`; any 2xx is success | "Any 2xx is success" and "a timeout is a transport failure". | The single route. |
| `src/config.rs:75-77` | Request timeout of 120 s | The value. | The environment variable. |
| `src/throttle.rs:17-65` | Token bucket per scope | Nothing in the first version (D11). | The whole file. |
| `src/graph/executor.rs:706-1015`, `:1113-1209`, `:1338-1411`, `:1530-1659` | Turns, cursor, parallel sending, budgets, lease permit | Nothing. Batches are sent one after another (C2) and no progress is stored (D8). | All of it. |

## 6. Error mapping

The stage uses the shared mapping functions of `run/error.rs` (`shared-run.md` sections 4.2 and 6) and writes no mapping of its own for their error types.

| Source | Error | Kind | Code |
| --- | --- | --- | --- |
| `finished`, `finish`, `current::read`, `current::mark_sending`, `current::commit`, `RunContext::fetch`, `RowFile::create`, `RowFile::push`, `RowFile::store` | `Report<StageError>` | Unchanged | Unchanged, `base_moved` included |
| `send`, step 3 | A run that is neither this run nor in `DiffOutput::resent` is listed in `sending` | Permanent | `superseded` |
| `RunContext::fetch`, through `error::artifact` | `ArtifactError::Read`, `ArtifactError::Write` | Retryable | `storage_unavailable` |
| `RunContext::fetch`, through `error::artifact` | `ArtifactError::Mismatch` | Permanent | `storage_mismatch` |
| `tokio::task::spawn_blocking` around `WriteReader` | `JoinError` | Retryable | `reader_stopped` |
| `WriteReader`, through `error::scratch` | `std::io::Error` on the local file | Retryable | `scratch_unavailable` |
| `WriteReader` | `ParquetError`, `ArrowError`, a failed check of section 4.4 | Permanent | `invalid_writes` |
| `request` | Attempt `max_attempts` answered 429, 502, 503, 504 or `Unreachable`; or 499 for a single write | Retryable | `graph_unavailable` |
| `send_write` | A status the tables reject, 500 after `max_attempts` included | No stage error | The write is recorded in `rejected`. |
| `GraphClient::new` | `GraphError::Configuration` | Outside the stage | The caller that builds the client handles it. `send` receives a built client. |
| `GraphClient::request` | `GraphError::Request` | No stage error | `exchange` turns it into `GraphResponse::Unreachable`. |

The `Code` variants this stage adds to `run/error.rs`, each with its entry in `Code::ALL`:

| Variant | Text | Kind | Condition |
| --- | --- | --- | --- |
| `GraphUnavailable` | `graph_unavailable` | Retryable | Attempt `max_attempts` of one request is answered 429, 502, 503, 504 or `Unreachable`, or 499 for a single write. |
| `InvalidWrites` | `invalid_writes` | Permanent | The `writes` file is not a Parquet file, has another schema than section 4.4 expects, has another row count than `PlanOutput::counts`, or breaks a rule of the contracts' "`writes`". |
| `ReaderStopped` | `reader_stopped` | Retryable | The blocking task that reads the `writes` file panicked or was cancelled. |

`ArtifactError::Read` also covers a missing object. The stage cannot tell the two cases apart, and a missing `writes` file fails as retryable until the engine's retry policy ends.

## 7. Tests

The unit tests are in `engine/src/stage/send/tests/`. Tests that wait use `#[tokio::test(start_paused = true)]`, so `tokio::time::sleep` returns at once and `tokio::time::Instant` shows the waited time. The tests of the HTTP implementation use real time, because a paused clock fires the client's timeout.

### 7.1 Fixtures (`tests/mod.rs`)

- `web()` is `00000000-0000-4000-8000-000000000001`. `actor()` is any fixed `ActorEntityUuid`.
- `id(name)` returns the `EntityId` of a scenario entity from the UUID table of `03-scenarios.md`.
- `entity(name, properties)` returns the create, patch and archive bodies of an entity as `Box<RawValue>`, in the shapes of the contracts' "Request bodies". `link(name, left, right)` does the same for a link with an empty property object.
- `insert(name)`, `update(name)`, `resend(name)` and `archive(name)` return a `Write` for the entity. A test sets `seq` and `batch`.
- `settings(max_attempts)` returns `SendSettings` with the default waits. The unit tests of `request`, `send_write` and `send_batch` pass it as the `settings` argument.
- `unreachable_once(fake, call)` calls `fake.unreachable_after(0)` and joins `call` with a future that sleeps 400 ms and calls `fake.reachable()`. The first attempt gets `Unreachable` and the second, 500 ms later, is answered. The tables below write "unreachable once" for it.
- `context(directory)` returns a `RunContext` over `ArtifactStorage::local` in a `TempDir`, with `send: SendSettings::default()`. The tests of `send` read `max_attempts` 5 from it.
- `writes_file(context, writes)` stores a `writes` file with `RowFile` and returns its `ArtifactRef` with a `PlanOutput`.

Below, `A`, `B` and `C` are entities, `L1` to `L3` are links, and `max` is `max_attempts`. Unit tests use `settings(3)`.

### 7.2 `request`, `classify`, `wait` (`tests/request.rs`)

| Test | Input | Expected |
| --- | --- | --- |
| `wait_doubles_to_the_cap` | `wait(1)` to `wait(8)` with the default settings | 500 ms, 1 s, 2 s, 4 s, 8 s, 16 s, 30 s, 30 s |
| `classify_single` | `Applied`; `Unreachable`; 429, 502, 503, 504, 499; 500; 400, 404, 409, 422 | `Applied`; `Unavailable`; `Unavailable` five times; `Failing(500)`; `Decide` with the same status |
| `classify_bulk` | `Applied`; `Unreachable`; 429, 502, 503, 504; 499; 500; 400, 409 | `Applied`; `Unavailable`; `Unavailable` four times; `Decide(499)`; `Decide(500)`; `Decide` with the same status |
| `applied_first_time` | One body, fake applies | `Answer::Applied`, 1 request, 0 ms waited |
| `unavailable_then_applied` (cases 429, 502, 503, 504, 499) | One body, rule `answer_times(.., status, 1)` | `Answer::Applied`, 2 requests, 500 ms waited |
| `unreachable_then_applied` | One body, the fake unreachable once | `Answer::Applied`, 2 requests, 500 ms waited |
| `unavailable_to_the_limit` (cases 429, 503, 499, unreachable) | One body, the answer for every request | `Retryable` with `graph_unavailable`, 3 requests, 1,500 ms waited |
| `failing_then_applied` | One body, 500 twice | `Answer::Applied`, 3 requests, 1,500 ms waited |
| `failing_to_the_limit` | One body, 500 for every request | `Answer::Status(500)`, 3 requests, 1,500 ms waited |
| `decided_status` (cases 400, 403, 404, 409, 422) | One body, the status | `Answer::Status` with the same status, 1 request |
| `bulk_499_and_500_are_decided` | Two bodies, 499; two bodies, 500 | `Answer::Status(499)`; `Answer::Status(500)`; 1 request each |
| `bulk_unavailable_then_applied` | Two bodies, 503 once | `Answer::Applied`, 2 requests, 500 ms waited |
| `bulk_unreachable_to_the_limit` | Two bodies, unreachable | `Retryable` with `graph_unavailable`, 3 requests |
| `one_count_for_both_classes` | One body, answers 503, 500, 503 | `Retryable` with `graph_unavailable`, 3 requests, 1,500 ms waited |

### 7.3 `send_write` (`tests/single.rs`)

Each row is one cell of the single-write table or one fallback rule. "Requests" lists the kinds the fake records.

| Test | Write and fake | Requests | Expected `Outcome` |
| --- | --- | --- | --- |
| `create_applied` | Insert of `A`, fake empty | create | `Created` |
| `create_409_patch_applied` | Insert of `A`, fake holds `A` | create, patch | `Patched` |
| `create_409_patch_404` | Insert of `A`, rules create 409 and patch 404 | create, patch | `Rejected { 404, NotFoundAfterConflict }` |
| `create_409_patch_409` | Insert of `A`, rules create 409 and patch 409 | create, patch | `Rejected { 409, GraphStatus }` |
| `create_409_patch_422` | Insert of `A`, rules create 409 and patch 422 | create, patch | `Rejected { 422, GraphStatus }` |
| `create_409_patch_500` | Insert of `A`, rules create 409 and patch 500 | create, patch × 3 | `Rejected { 500, GraphStatus }` |
| `create_409_patch_unavailable` | Insert of `A`, rules create 409 and patch 503 | create, patch × 3 | Error `graph_unavailable` |
| `create_409_patch_429_then_applied` | Insert of `A`, fake holds `A`, rule patch 429 once | create, patch, patch | `Patched` |
| `create_404` | Insert of `A`, rule create 404 | create | `Rejected { 404, GraphStatus }` |
| `create_unavailable_then_applied` (429, 502, 503, 504, unreachable) | Insert of `A`, the answer once | create × 2 | `Created` |
| `create_unavailable_to_the_limit` | Insert of `A`, rule create 503 | create × 3 | Error `graph_unavailable` |
| `create_499` | Insert of `A`, rule create 499 once; then for every request | create × 2; create × 3 | `Created`; error `graph_unavailable` |
| `create_500_to_the_limit` | Insert of `A`, rule create 500 | create × 3 | `Rejected { 500, GraphStatus }` |
| `create_500_then_409_then_patch` | Insert of `A`, fake holds `A`, rule create 500 once | create × 2, patch | `Patched` |
| `create_other_status` (400, 403, 413) | Insert of `A`, the rule | create | `Rejected { status, GraphStatus }` |
| `patch_applied` | Update of `A`, fake holds `A` | patch | `Patched` |
| `patch_409` | Update of `A`, rule patch 409 | patch | `Rejected { 409, GraphStatus }` |
| `patch_404_create_applied` | Update of `A`, fake empty | patch, create | `Created` |
| `patch_404_create_409` | Update of `A`, fake empty, rule create 409 | patch, create | `Rejected { 409, ConflictAfterNotFound }` |
| `patch_404_create_404` | Update of `A`, fake empty, rule create 404 | patch, create | `Rejected { 404, GraphStatus }` |
| `patch_404_create_500` | Update of `A`, fake empty, rule create 500 | patch, create × 3 | `Rejected { 500, GraphStatus }` |
| `patch_unavailable` (429, 502, 503, 504, unreachable) | Update of `A`, the answer once; then for every request | patch × 2; patch × 3 | `Patched`; error `graph_unavailable` |
| `patch_499_to_the_limit` | Update of `A`, rule patch 499 | patch × 3 | Error `graph_unavailable` |
| `patch_500_to_the_limit` | Update of `A`, rule patch 500 | patch × 3 | `Rejected { 500, GraphStatus }` |
| `patch_other_status` (400, 422, 423) | Update of `A`, the rule | patch | `Rejected { status, GraphStatus }` |
| `resend_starts_with_the_patch` | Resend of `A`, fake holds `A` | patch | `Patched` |
| `archive_applied` | Archive of `A`, fake holds `A` | patch | `Archived` |
| `archive_409` | Archive of `A`, rule patch 409 | patch | `Rejected { 409, GraphStatus }` |
| `archive_404` | Archive of `A`, fake empty | patch | `Absent`. No create is sent. |
| `archive_unavailable` (429, 502, 503, 504, unreachable) | Archive of `A`, the answer once; then for every request | patch × 2; patch × 3 | `Archived`; error `graph_unavailable` |
| `archive_499_to_the_limit` | Archive of `A`, rule patch 499 | patch × 3 | Error `graph_unavailable` |
| `archive_500_to_the_limit` | Archive of `A`, rule patch 500 | patch × 3 | `Rejected { 500, GraphStatus }` |
| `archive_other_status` (400, 403) | Archive of `A`, the rule | patch | `Rejected { status, GraphStatus }` |
| `bodies_are_sent_unchanged` | Insert of `A`, fake holds `A` | create, patch | Each recorded body equals the stored text byte for byte. |

### 7.4 `send_batch` (`tests/batch.rs`)

"Requests" lists the kind and the entities of each request.

| Test | Batch, set of rejected IDs and fake | Requests | Expected outcomes |
| --- | --- | --- | --- |
| `bulk_create_applied` | Inserts of `A`, `B`, `C`; fake empty | create[A, B, C] | `Created` × 3 |
| `bulk_patch_applied` | Updates of `A`, `B`, `C`; fake holds them | patch[A, B, C] | `Patched` × 3 |
| `bulk_archive_applied` | Archives of `A`, `B`; fake holds them | patch[A, B] | `Archived` × 2 |
| `bulk_unavailable_then_applied` (429, 502, 503, 504, unreachable) | Inserts of `A`, `B`; the answer once | create[A, B] × 2 | `Created` × 2, 500 ms waited |
| `bulk_unavailable_to_the_limit` | Inserts of `A`, `B`; unreachable | create[A, B] × 3 | Error `graph_unavailable` |
| `bulk_409_sends_each_write` | Inserts of `A`, `B`, `C`; fake holds `B` | create[A, B, C], create[A], create[B], patch[B], create[C] | `Created`, `Patched`, `Created` |
| `bulk_400_sends_each_write` | Inserts of `A`, `B`, `C`; rule create 400 for `B` | create[A, B, C], create[A], create[B], create[C] | `Created`, `Rejected { 400, GraphStatus }`, `Created` |
| `bulk_404_sends_each_write` | Updates of `A`, `B`; fake holds `A` | patch[A, B], patch[A], patch[B], create[B] | `Patched`, `Created` |
| `bulk_500_sends_each_write` | Inserts of `A`, `B`; rule create 500 for `A` once | create[A, B], create[A], create[B] | `Created` × 2 |
| `bulk_499_sends_each_write` | Updates of `A`, `B`; fake holds them; rule patch 499 for `A` once | patch[A, B], patch[A], patch[B] | `Patched` × 2 |
| `one_write_follows_the_single_table` | Insert of `A`; fake holds `A` | create[A], patch[A] | `Patched` |
| `rejected_endpoint_is_not_sent` | Link inserts `L1`, `L2`, `L3`; the left entity of `L1` is in the set; fake holds every endpoint | create[L2, L3] | `Rejected { None, EndpointRejected }`, `Created`, `Created` |
| `rejected_right_endpoint` | Link inserts `L1`, `L2`; the right entity of `L1` is in the set | create[L2] | `Rejected { None, EndpointRejected }`, `Created` |
| `every_endpoint_rejected` | Link inserts `L1`, `L2`; both left entities are in the set | none | `Rejected { None, EndpointRejected }` × 2 |
| `link_archive_ignores_the_set` | Archive of `L1`; its left entity is in the set; fake holds `L1` | patch[L1] | `Archived` |
| `missing_endpoint_is_a_graph_status` | Link insert `L1`; set empty; fake holds no endpoint | create[L1] × 3 | `Rejected { 500, GraphStatus }` |
| `empty_batch` | No write | none | Empty list |

### 7.5 `WriteReader`, `Tally`, `FakeGraph`

`tests/writes.rs`:

| Test | File | Expected |
| --- | --- | --- |
| `reads_batches_in_order` | The six rows of S1 run 1 | Two batches of 4 and 2 writes with the fields of the rows. The entity batch is `AC-SEXXX`, `AC-N100`, `AF-ESSB`, `AF-ESSA` in target order. Those four writes are `Upsert { first: Create, .. }`; the reader preserves `seq` even though entity IDs decrease at a target boundary. |
| `empty_file` | No rows, expected row count 0 | `None` on the first call |
| `batch_spans_record_batches` | 300 rows in batches of 100 | Three batches of 100 writes. `READ_ROWS` is 128, so each batch after the first spans two record batches. |
| `bodies_are_kept_as_text` | One row whose bodies hold spaces and unusual key order | `RawValue::get` equals the stored text. |
| `archive_row` | One `archive_entity` row with a null `create` | `Requests::Archive` with the `patch` column as its body |
| `row_count_differs` | Six rows, expected row count 5 | `open` returns `invalid_writes`. |
| `invalid_rows` (cases) | An upsert with a null `create`; `operation` `upsert`; `archive_entity` with change `insert`; `upsert_link` with change `archive`; a body that is not JSON; `seq` 0, 2; a batch number that decreases; a batch that holds two operations; a batch that holds an insert and an update | `invalid_writes` for each |
| `invalid_schema` (cases) | No `patch` column; `seq` as text | `invalid_writes` for each |

`tests/tally.rs`:

| Test | Input | Expected |
| --- | --- | --- |
| `counts_each_outcome` | `Created` twice, `Patched`, `Archived`, `Absent` | `created` 2, `patched` 1, `archived` 1, `absent` 1, `rejected` 0. `finish` returns `rejected: None`. |
| `records_a_rejected_entity` | An `upsert_entity` insert of `AC-N100` with `Rejected { 400, GraphStatus }` | `rejected` 1. `rejected_entities` holds the ID. The file has one row: the ID, `upsert_entity`, `insert`, `sink-aircraft`, `N100`, 400, `graph_status`. |
| `records_a_rejected_link` | An `upsert_link` insert with `Rejected { None, EndpointRejected }` | The row has a null `status` and `endpoint_rejected`. `rejected_entities` is empty. |
| `reason_texts` | The four reasons | `graph_status`, `endpoint_rejected`, `not_found_after_conflict`, `conflict_after_not_found` |
| `rows_keep_their_order` | Three rejected writes | Three rows in the order recorded |
| `file_has_seven_columns` | One rejected write | The file's columns are the seven of the contracts' "`rejected`". |

`tests/fake.rs`:

| Test | Requests | Expected |
| --- | --- | --- |
| `create_two` | create[A, B] | `Applied`. Both exist with `archived: false`, the sent property object and `editions` 1. |
| `create_existing` | create[A], create[A] | The second answers 409. |
| `create_is_one_transaction` | create[A], create[B, A] | The second answers 409 and `B` does not exist. |
| `create_archived` | create[A], archive of `A`, create[A] | The third answers 409. |
| `create_same_id_twice` | create[A, A] | 409 and `A` does not exist. |
| `patch_missing` | patch[A] | 404 |
| `patch_is_one_transaction` | create[A], patch[A with a changed value, B] | 404. `A` keeps its value and `editions` 1. |
| `patch_unchanged` | create[A], patch[A with the same properties] | `Applied`, `editions` 1 |
| `patch_changed` | create[A with `model` and `empty-mass`], patch[A with `model` only] | `Applied`, `editions` 2, no `empty-mass` property |
| `archive_and_revive` | create[A], archive, archive, patch with `archived: false` | `editions` 2 and archived; `editions` 2; `editions` 3 and not archived |
| `link_needs_endpoints` | create[L1] without endpoints; create[A, B], create[L1]; archive of `A`, create[L2 from A to B] | 500; `Applied`; `Applied` |
| `answer_for_an_entity` | `answer(Create, A, 400)`; create[A, B]; patch[A]; create[B] | 400 and neither exists; 404; `Applied` |
| `answer_times` | `answer_times(Create, A, 503, 2)`; create[A] three times | 503, 503, `Applied` |
| `clear_answers` | `answer(Create, A, 400)`, `clear_answers`, create[A] | `Applied` |
| `unreachable_after` | `unreachable_after(2)`; create[A], create[B], create[C], create[C]; `reachable`; create[C] | `Applied`, `Applied`, `Unreachable`, `Unreachable`, `Applied`. `C` does not exist before the last request. |
| `records_every_request` | create[A, B], a refused request, an unreachable request | `requests` returns three entries with kind, actor, entity IDs, body texts and response. A second call returns an empty list. |
| `unreadable_body` | A create body with an unknown field; a patch body with an unknown field; a patch with an `add` operation | 400; 422; 500 |

### 7.6 The stage and the scenarios

`tests/stage.rs` holds the cases of "Cases tested per stage" for stage 4 and the stopping points of section 4.11. Each test builds a `writes` file, a `DiffOutput` and a `current.json`, and calls `send` with a `FakeGraph`.

| Test | Setup | Expected |
| --- | --- | --- |
| `conflict_then_not_found` | One insert of `A`; rules create 409 and patch 404 | `rejected` has `A` with 404 and `not_found_after_conflict`. `SendCounts::rejected` is 1. The run commits. |
| `single_499_fails_as_retryable` | One update of `A`; fake holds `A`; rule patch 499 | 5 patch requests. `Retryable` with `graph_unavailable`. No marker. `sending` lists the run. 7,500 ms waited. |
| `single_500_is_rejected` | One update of `A`; fake holds `A`; rule patch 500 | 5 patch requests. 7,500 ms waited. `rejected` has `A` with 500 and `graph_status`. The run commits. |
| `base_moved` | `committed` is run X; `DiffOutput::base` is `None` | `Permanent` with `base_moved`. No request. No marker. `current.json` is unchanged. |
| `superseded` | `sending` is [run Y]; `DiffOutput::resent` is empty | `Permanent` with `superseded`. No request. `sending` is still [run Y]. |
| `resent_runs_do_not_supersede` | `sending` is [run Y]; `DiffOutput::resent` is [run Y] | The stage sends and commits. `sending` is empty. |
| `superseded_while_listed` | `sending` is [this run, run Y] | `Permanent` with `superseded`. No request. |
| `marker_exists` | The marker is stored with `finish`; `sending` lists the run | No request. The stored output is returned. `committed` is the run and `sending` is empty. |
| `second_call_returns_the_first_output` | `send` twice with S1 run 1 | The second call returns the same output and sends no request. The marker and `current.json` are unchanged. |
| `no_writes` | An empty `writes` file, `batches` 0 | No request. The marker holds counts of 0 and no `rejected`. The run commits. |
| `stopped_while_sending` | S7 run 2 to the failure, then `reachable`, then `send` again | See below. |
| `stopped_before_the_marker` | `deliver` with S1 run 1 after `mark_sending`, then `send` | Requests of the second execution: create[4 entities] 409, then create 409 and patch for each of the four, then create[2 links] 409, then create 409 and patch for each of the two. 14 requests. `patched` 6. Every entity has `editions` 1. The run commits. |
| `later_batches_wait` | Batches 0 and 1; batch 0 is answered 503 for every request | 5 requests for batch 0 and none for batch 1. `Retryable`. |
| `rejected_file_has_no_body` | S6 run 1 | The file's columns are the seven of the contracts and no cell holds a property value of `AC-N100`. |

`stopped_while_sending`, second execution of S7 run 2:

| Request | Response |
| --- | --- |
| create[`AC-GABCD`] | 409 |
| patch[`AC-GABCD`] | Applied, no edition |
| patch[`AC-N100`] | Applied, no edition |
| create[`L-GABCD-ESSB`] | Applied |
| patch[`L-SEXXX-ESSA`], archive | Applied |
| patch[`AC-SEXXX`], archive | Applied |

`SendOutput`: `created` 1, `patched` 2, `archived` 2. `current.json`: `committed` 2, `sending` empty.

`tests/scenarios.rs` runs stage 4 of every run of every scenario. One `FakeGraph` and one storage directory are kept across the runs of a scenario, so `current.json` and the Graph state carry over. Each run gets the `writes` rows listed in `03-scenarios.md` or below, and `DiffOutput::base` and `resent` as listed. The bodies carry the capture time of the run from "What a test compares" in `03-scenarios.md` as `loadedAt`. The `SendOutput` column repeats the section "Expected `SendOutput`" of `03-scenarios.md`, and the counts agree with it. Every `SendOutput` has `rejected` absent and every count 0 unless the table says otherwise. Every entity has `archived: false` unless the table says otherwise. "ed." is the edition count.

**S1.**

| Run | `base`, `resent` | Requests in order | `SendOutput` | Graph after | `current.json` after |
| --- | --- | --- | --- | --- | --- |
| 1 | none, [] | create[`AC-SEXXX`, `AC-N100`, `AF-ESSB`, `AF-ESSA`] applied; create[`L-N100-ESSA`, `L-SEXXX-ESSA`] applied | `created` 6 | Six entities, ed. 1 | `committed` 1, `sending` [] |
| 2 | 1, [] | none | all 0 | Unchanged | `committed` 2, `sending` [] |

Run 1 of S2, S3, S4, S5, S7, S8 and S9 is S1 run 1.

**S2.**

| Run | `base`, `resent` | Requests in order | `SendOutput` | Graph after | `current.json` after |
| --- | --- | --- | --- | --- | --- |
| 2 | 1, [] | patch[`AC-N100`] applied | `patched` 1 | `AC-N100` has model `L-1049G`, ed. 2. The other five have ed. 1. | `committed` 2 |
| 3 | 2, [] | patch[`AC-SEXXX`] applied | `patched` 1 | `AC-SEXXX` has no `empty-mass` property, ed. 2 | `committed` 3 |

**S3.**

| Run | `base`, `resent` | Requests in order | `SendOutput` | Graph after | `current.json` after |
| --- | --- | --- | --- | --- | --- |
| 2 | 1, [] | patch[`L-N100-ESSA`] applied; patch[`AC-N100`] applied. Both bodies are archive bodies. | `archived` 2 | `L-N100-ESSA` and `AC-N100` are archived, ed. 2 | `committed` 2 |
| 3 | 2, [] | patch[`AC-N100`] applied; patch[`L-N100-ESSA`] applied | `patched` 2 | Both are not archived, ed. 3 | `committed` 3 |
| 4 | 3, [] | none | all 0 | Unchanged | `committed` 4 |
| 5 | 4, [] | patch[`L-N100-ESSA`, `L-SEXXX-ESSA`] applied; patch[`AC-SEXXX`, `AC-N100`] applied | `archived` 4 | The four are archived. `L-N100-ESSA` ed. 4, `L-SEXXX-ESSA` ed. 2, `AC-SEXXX` ed. 2, `AC-N100` ed. 4. The airfields have ed. 1. | `committed` 5 |

**S4.**

| Run | `base`, `resent` | Requests in order | `SendOutput` | Graph after | `current.json` after |
| --- | --- | --- | --- | --- | --- |
| 2 | 1, [] | none | all 0 | Unchanged, every entity ed. 1 | `committed` 2 |
| 3 | 2, [] | patch[`AC-SEXXX`, `AC-N100`] applied | `patched` 2 | Neither aircraft has a `model` property, ed. 2 | `committed` 3 |

**S5.**

| Run | `base`, `resent` | Requests in order | `SendOutput` | Graph after | `current.json` after |
| --- | --- | --- | --- | --- | --- |
| 2 | 1, [] | create[`AC2-SEXXX`, `AC2-N100`] applied; create[`L2-SEXXX-ESSA`, `L2-N100-ESSA`] applied; patch[`L-N100-ESSA`, `L-SEXXX-ESSA`] applied; patch[`AC-SEXXX`, `AC-N100`] applied | `created` 4, `archived` 4 | Ten entities. The four new ones have ed. 1. The four old ones are archived, ed. 2. The airfields have ed. 1. | `committed` 2 |

**S6.** Before run 1 the test calls `answer(RequestKind::Create, id("AC-N100"), 400)`. Before run 2 it calls `clear_answers`.

| Run | `base`, `resent` | Requests in order | `SendOutput` | Graph after | `current.json` after |
| --- | --- | --- | --- | --- | --- |
| 1 | none, [] | create[`AC-SEXXX`, `AC-N100`, `AF-ESSB`, `AF-ESSA`] 400; create[`AC-SEXXX`] applied; create[`AC-N100`] 400; create[`AF-ESSB`] applied; create[`AF-ESSA`] applied; create[`L-SEXXX-ESSA`] applied | `created` 4, `rejected` 2, `rejected` file present | `AC-SEXXX`, `AF-ESSB`, `AF-ESSA` and `L-SEXXX-ESSA` exist, ed. 1. `AC-N100` and `L-N100-ESSA` do not exist. | `committed` 1, `sending` [] |
| 2 | 1, [] | patch[`AC-N100`] 404; create[`AC-N100`] applied; patch[`L-N100-ESSA`] 404; create[`L-N100-ESSA`] applied | `created` 2 | Six entities, ed. 1 | `committed` 2 |

The `rejected` file of run 1, in this order:

| `entity_id` | `operation` | `change` | `target` | `source_id` | `status` | `reason` |
| --- | --- | --- | --- | --- | --- | --- |
| `AC-N100` | `upsert_entity` | `insert` | `sink-aircraft` | `N100` | 400 | `graph_status` |
| `L-N100-ESSA` | `upsert_link` | `insert` | `aircraft-based-at` | `{aircraft type URL}::N100::{airfield type URL}::ESSA` | null | `endpoint_rejected` |

**S7.** Before run 2 the test calls `unreachable_after(2)`. Before run 3 it calls `reachable`.

| Run | `base`, `resent` | Requests in order | `SendOutput` | Graph after | `current.json` after |
| --- | --- | --- | --- | --- | --- |
| 2 | 1, [] | create[`AC-GABCD`] applied; patch[`AC-N100`] applied; create[`L-GABCD-ESSB`] unreachable, 5 times | None. `Retryable` with `graph_unavailable`. No marker. 7,500 ms waited. | `AC-GABCD` exists, ed. 1. `AC-N100` has model `L-1049G`, ed. 2. `AC-SEXXX` and `L-SEXXX-ESSA` are not archived, ed. 1. `L-GABCD-ESSB` does not exist. | `committed` 1, `sending` [2] |
| 3 | 1, [2] | patch[`AC-SEXXX`, `AC-N100`] applied; patch[`L-SEXXX-ESSA`] applied; patch[`L-GABCD-ESSB`] 404; patch[`AC-GABCD`] applied. The last two bodies are archive bodies. | `patched` 3, `archived` 1, `absent` 1 | `AC-N100` has model `L-1049`, ed. 3. `AC-SEXXX` and `L-SEXXX-ESSA` have ed. 1. `AC-GABCD` is archived, ed. 2. | `committed` 3, `sending` [] |

**S8.** The `writes` of run 2 are: `upsert_entity` `insert` `AF-ESGG` in batch 0, `upsert_entity` `update` `AC-N100` in batch 1, `archive_entity` `AF-ESSB` in batch 2.

| Run | `base`, `resent` | Requests in order | `SendOutput` | Graph after | `current.json` after |
| --- | --- | --- | --- | --- | --- |
| 2 | 1, [] | create[`AF-ESGG`] applied; patch[`AC-N100`] applied; patch[`AF-ESSB`] applied, archive body | `created` 1, `patched` 1, `archived` 1 | `AF-ESGG` ed. 1. `AC-N100` has model `L-1049G`, ed. 2. `AF-ESSB` is archived, ed. 2. | `committed` 2 |
| 3 | 2, [] | patch[`AC-N100`, `AF-ESSB`] applied; patch[`AF-ESGG`] applied, archive body | `patched` 2, `archived` 1 | `AF-ESSB` is not archived, ed. 3. `AC-N100` has model `L-1049`, ed. 3. `AF-ESGG` is archived, ed. 2. | `committed` 3 |
| 4 | 3, [] | patch[`L-N100-ESSA`, `L-SEXXX-ESSA`] applied; patch[`AC-SEXXX`, `AC-N100`, `AF-ESSB`, `AF-ESSA`] applied. All are archive bodies. | `archived` 6 | All seven are archived. `L-N100-ESSA` ed. 2, `L-SEXXX-ESSA` ed. 2, `AC-SEXXX` ed. 2, `AF-ESSB` ed. 4, `AF-ESSA` ed. 2, `AC-N100` ed. 4, `AF-ESGG` ed. 2. | `committed` 4 |

**S9.** After run 1 the test changes the Graph as `03-scenarios.md` says for S9: against the fake it calls the fake's own `patch` with an archive body for `AC-N100` and a patch body for `AF-ESSA` with the name `Stockholm`. Against a real Graph the scenario uses a store call. Both then have ed. 2. The test then calls `requests` to drop the two records.

| Run | `base`, `resent` | Requests in order | `SendOutput` | Graph after | `current.json` after |
| --- | --- | --- | --- | --- | --- |
| 2 | 1, [] | patch[`AC-SEXXX`, `AC-N100`, `AF-ESSB`, `AF-ESSA`] applied; patch[`L-N100-ESSA`, `L-SEXXX-ESSA`] applied | `patched` 6 | `AC-N100` is not archived, ed. 3. `AF-ESSA` has the name `Arlanda`, ed. 3. The other four have ed. 1. | `committed` 2 |
| 3 | 2, [] | patch[`L-N100-ESSA`] applied; patch[`AC-N100`] applied. Both are archive bodies. | `archived` 2 | `L-N100-ESSA` is archived, ed. 2. `AC-N100` is archived, ed. 4. | `committed` 3 |
| 4 | 3, [] | patch[`AC-SEXXX`, `AF-ESSB`, `AF-ESSA`] applied; patch[`L-SEXXX-ESSA`] applied; patch[`L-N100-ESSA`] applied, archive body; patch[`AC-N100`] applied, archive body | `patched` 4, `archived` 2 | No entity has a new edition. | `committed` 4 |

### 7.7 Existing tests

`engine/src/graph/client/tests.rs`. The helpers `planned` (`:148`), `saved` (`:153`) and `received` (`:162`) depend on `PlannedWrite` and are replaced by raw bodies built with `serde_json::value::to_raw_value`. `Received::path` is `/entities/bulk`.

| Test | Line | Change |
| --- | --- | --- |
| `upsert_creates` | `:173` | Becomes `create_bulk`. `client.create(actor(), &[a, b])` against a server that answers POST with 200 returns `GraphResponse::Applied`. The server received one POST to `/entities/bulk` with the body `[{a},{b}]`, the actor header and the service credential. |
| `upsert_patches_existing` | `:192` | Removed. `create_409_patch_applied` in `tests/single.rs` covers the rule. |
| `archive` | `:217` | Becomes `patch_bulk`. `client.patch(actor(), &[archive])` with 200 returns `Applied`, and the server received one PATCH to `/entities/bulk` with the body `[{archive}]`. The case 404 returns `GraphResponse::Status(404)`. `archive_404` in `tests/single.rs` covers "absent". |
| `upsert_rejected` | `:238` | Becomes `status`. POST answered 422 returns `Status(422)`. PATCH answered 423 returns `Status(423)`. POST answered 409 returns `Status(409)` and no PATCH is sent. The assertion on the attached response text is removed. |
| `graph_url_path` | `:260` | The expected path is `/graph/entities/bulk`. |
| `configuration` | `:285` | Unchanged. One case is added: a secret that holds a line break returns `GraphError::Configuration`. |

New tests in the same file:

| Test | Input | Expected |
| --- | --- | --- |
| `array_of_bodies` | Two bodies; one body | `[{…},{…}]`; `[{…}]`. Each body appears byte for byte. |
| `graph_types_read_the_array` | `array` of two create bodies; of a patch body and an archive body | `serde_json::from_str::<Vec<CreateEntityParams>>` and `::<Vec<PatchEntityParams>>` succeed with two entries each. |
| `one_body_uses_the_bulk_route` | `client.create(actor(), &[a])` | One POST to `/entities/bulk` with the body `[{a}]` |
| `unreachable` | A client for a local port with no listener | `GraphResponse::Unreachable` |
| `retry_after_header` | `7`; `999999`; `Wed, 21 Oct 2015 07:28:00 GMT`; no header | 7 s; 30 s; `None`; `None` |
| `retry_after_delays_the_next_request` | The server answers 429 with `Retry-After: 1`, then 200 | The first call returns `Status(429)`. The second call returns `Applied` and the server received it at least 1 s after the first. |
| `response_body_is_not_kept` | The server answers 400 with the text `graph says no` | `Status(400)`. The test asserts the return value only; the type has no field for a body. |

`tests/integrations/graph/aviation/mod.rs`, test `delivery_replay` (`:274`):

- The loop at `:299-308` calls `GraphClient::send` and expects `Applied::Created`, then `Applied::Patched`. Both are removed. The test runs the scenario runs below through the runner `run` of the contracts, with the `GraphClient` of `:291-298` as the `Graph`. The import of `Applied` at `:21` is removed.
- The namespace stays `aviation/{web_id}` (`:59-61`), so every test run writes new entities.
- `provenance()` (`:43-57`) sets `loaded_at: None`. The runner sets `loadedAt` from `CaptureOutput::captured_at`, and the snapshot redacts it.
- A new helper `editions(entities)` returns a map from entity ID to `entity.metadata.record_id.edition_id`.
- `read` (`:149-188`) asserts six entities. It takes the expected count as a parameter, because `live_only` (`:167`) leaves out archived entities.

| Run | Request | Expected `SendOutput` | Expected in the Graph |
| --- | --- | --- | --- |
| 1 | S1 run 1 | `created` 6 | The snapshot `aviation`. The test stores `editions`. |
| 2 | S1 run 2 | all 0 | `editions` equals the stored map. |
| 3 | S9 run 2, a reconcile with no change made in between | `patched` 6 | `editions` equals the stored map. Every one of the six patches reached the Graph and wrote no edition. This is the test of the statement the design depends on. |
| 4 | S2 run 2 | `patched` 1 | The edition ID of `AC-N100` differs from the stored one. The other five are equal. `AC-N100` has model `L-1049G`. |
| 5 | S3 run 2 after run 4, the source without `N100` | `archived` 2 | `read` returns four entities. |
| 6 | The same reconcile as run 3 | `patched` 4, `archived` 2 | `editions` of the four live entities equals the map read after run 5. |

Runs 2 to 6 need stages 1 to 3 and the runner. The stage 4 part of the change is the removal of `send` and `Applied`, the `SendOutput` assertions and the edition ID comparison.

### 7.8 Labs tests to port

| Labs test | Path:line | Ported as |
| --- | --- | --- |
| `create_409_patch_consumes_two_requests_and_commits_only_that_prefix` | `src/graph/executor.rs:2494` | `create_409_patch_applied` |
| `a_proven_conflict_retries_patch_first_instead_of_recreating` | `src/graph/executor.rs:2540` | `create_409_patch_429_then_applied` |
| `transport_failure_yields_with_default_backoff_instead_of_hot_looping` | `src/graph/executor.rs:2644` | `unreachable_then_applied` |
| `duplicate_words_in_a_non_409_response_never_trigger_patch` | `src/graph/executor.rs:2671` | `create_other_status` with 400 |
| `retry_consumes_budget_then_converges_through_create_409_patch` | `src/graph/executor.rs:2703` | `create_500_then_409_then_patch` |
| `permanent_failure_commits_the_prior_contiguous_prefix_first` | `src/graph/executor.rs:2744` | `rejected_file_has_no_body`. The expected result changes: the run commits. |
| `replayed_archive_conflict_converges_instead_of_failing_permanently` | `src/graph/executor.rs:2817` | `archive_409`. The expected result changes: the contracts reject the write. |
| `successful_full_bulk_create_charges_one_actual_graph_request` | `src/graph/executor.rs:3081` | `bulk_create_applied` |
| `rejected_bulk_create_falls_back_only_within_the_remaining_request_budget` | `src/graph/executor.rs:3110` | `bulk_409_sends_each_write`, without the budget |
| `a_rejected_full_batch_never_sends_or_advances_a_later_batch` | `src/graph/executor.rs:3178` | `later_batches_wait` |
| `conflicting_batch_uses_patch_first_and_creates_only_patch_misses` | `src/graph/executor.rs:3212` | `bulk_409_sends_each_write`. The expected requests change: each write starts with its create. |
| `parallel_turn_never_crosses_an_effect_dependency_class` | `src/graph/executor.rs:3364` | S1 run 1: the request with the entities comes before the request with the links. |
| `parallel_failure_commits_only_the_acknowledged_prefix` | `src/graph/executor.rs:3408` | `bulk_400_sends_each_write`. The expected result changes: the third write is sent. |
| `empty_work_completes_the_turn_without_inventing_a_cursor` | `src/graph/executor.rs:3437` | `no_writes` |
| `effect_transport_returns_create_409_without_hiding_the_patch_cost` | `src/graph/client.rs:824` | `status`, case 409 |
| `durable_effect_transport_authenticates_the_service_and_uses_the_run_owner` | `src/graph/client.rs:852` | `create_bulk` and `patch_bulk` |
| `effect_transport_exposes_one_429_and_capped_retry_after_to_the_budget_owner` | `src/graph/client.rs:902` | `retry_after_header` |
| `apply_advances_applied_state_only_after_final_cursor_and_completion` | `src/graph/apply.rs:1009` | S1 run 1 and S7 run 2: `committed` changes only after the marker. |
| `apply_remains_unapplied_between_durable_chunks` | `src/graph/apply.rs:1145` | S7 run 2 |
| `zero_effect_apply_still_completes_without_a_graph_request_or_cursor` | `src/graph/apply.rs:1199` | `no_writes` |
| `local_loss_after_send_before_cursor_recovers_by_create_409_patch` | `src/graph/apply.rs:1231` | `stopped_while_sending` |
| `permanent_graph_failure_terminates_apply_and_requires_restore` | `src/graph/apply.rs:1408` | S6 run 1. The expected result changes: the run commits. |
| `lost_create_ack_converges_through_429_retry_conflict_and_patch` | `tests/crash_replay_test.rs:245` | `create_409_patch_429_then_applied` and `stopped_while_sending` |

Not ported: `duplicate_key_bodies_prove_conflict_only_for_create_requests` (`src/graph/executor.rs:1817`) and `graph_429_is_counted_from_the_existing_response_without_a_probe` (`:2615`), because the stage sees no response body; the tests of the cursor, the lease, the budget and parallel sending (`:2321`, `:2352`, `:2583`, `:2786`, `:2852` to `:3053`, `:3143`, `:3247`, `:3303`, `:3462`); and the four tests of `src/throttle.rs` (`:89`, `:99`, `:123`, `:137`), which belong to D11.

## 8. Open questions and contract problems

### Open questions

1. **The value of `max_attempts`.** `SendSettings::default()` uses 5. Labs limits the requests of a turn and has no limit per request, so the value has no source.
2. **A Graph that answers 500 to everything.** Every write is then sent 5 times and rejected, and the run commits with all of its writes in `rejected`. The next run sends them again (P2). The wait before each repeated 500 slows this: with the default settings one request waits 7.5 s before it is rejected. A limit on rejected writes is recorded as the deferred item D14 in `00-overview.md`. Labs has a counter of that kind that nothing calls (`HASH_GRAPH_MAX_FAILED_BATCHES`, `src/config.rs:71-73`).
3. **Singles after a bulk create answered 409.** Each write starts with its create, so a batch that was applied before costs `1 + 2n` requests. Labs sends the patch first in that case (`src/graph/executor.rs:1069-1090`), which costs `1 + n`. The contracts fix the first request by `change`.
4. **A link whose endpoint is archived.** The fake accepts the create. Whether the Graph accepts it was not checked.
5. **The request timeout.** The spec raises it from 30 s to 120 s for every request. A bulk request that times out after the Graph applied it is sent again and converges through 409 and the patches.
6. **Memory.** `rejected_entities` holds one ID of 73 bytes per rejected entity upsert. A record batch holds up to 128 rows with two bodies each, and the contracts set no upper limit for one body.
7. **`Retry-After`.** The stage waits its own wait and `GraphClient` delays the next request, so the effective wait is the longer of the two. Labs waits the `Retry-After` value in place of its own wait (`src/graph/executor.rs:761-764`).
8. **Logging.** A refused request is logged with its status and the byte count of the response. Labs also logs the sha256 of the body (`src/graph/executor.rs:1766-1778`).

### Contract problems

The contracts and the scenarios now fix every point this section listed before. None remains open.
