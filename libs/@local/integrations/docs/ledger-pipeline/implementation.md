# Ledger pipeline: implementation spec

Each part of the ledger pipeline becomes one issue, and each step of [steps.md](steps.md) becomes a sub-issue. For every step this file gives the interface, the code to reuse, the tests to port with their expected values, and how labs does the same job.

[steps.md](steps.md) stays the short list of steps. [spec.md](spec.md) stays the contract. A decision that changes either is written there as well.

Run state is written first, as the sample of the form (2026-11-18). Capture, row files and the sync table, Prepare and Send follow in the same form.

## How to read a step

- **Interface:** the functions and types the step adds, with their inputs and outputs. Signatures are quoted from the skeleton crate [`ledger`](../../ledger/src). The interface is fixed. Private helpers are the implementer's choice.
- **Reuse:** each file to take code from. "Ported" means the named function is the source, and the listed changes are what the types of `engine` or the ledger crate force. "Called" means the function is used where it is. Code without a source is new, and the step says so.
- **Tests:** each test to port, with its fixture and expected values, and the new tests. "Passes today" means the test was run in its own repository on 2026-11-18.
- **Reference flow:** how labs does the same job, and where this design differs. This is a recommendation.
- **Found while planning:** facts the code check turned up, each with the handling this file assumes. "To confirm" marks an assumption Paul has not agreed yet.

The sources are labs and the hash repository (Paul, 2026-11-18). Labs is `pocs/integrations_rs` in the labs repository at `40a8d14`. In the hash repository the source is `engine`, the copy on `codex/ingestion-pipeline`. The crate of the previous refactor, `pipeline`, is not a source.

Paths into the hash repository are relative to `libs/@local/integrations`. Paths into labs start with `src/` or `tests/`.

## Run state

After this issue the crate can create a run, read and change its `run.json`, keep one active run per integration, and classify errors. Every stage calls it. No stage is implemented by it.

What the stages and the caller use:

```rust
// run/mod.rs: called by whatever starts a run
pub async fn start(context: &RunContext, input: RunInput, batch: BatchSettings) -> Result<Run, Report<StageError>>;

// run/store.rs: called by every stage
pub(crate) async fn read(context: &RunContext, run: RunId) -> Result<Option<Run>, Report<StageError>>;
pub(crate) async fn update(context: &RunContext, run: RunId, change: impl FnMut(&mut Run) + Send) -> Result<Run, Report<StageError>>;
pub(crate) async fn fail(context: &RunContext, run: RunId, stage: Stage, error: &Report<StageError>, batch: Option<u32>);

// run/current.rs: called by Send
pub(crate) async fn complete(context: &RunContext, run: RunId) -> Result<(), Report<StageError>>;
```

It keeps two files in the integration's storage: `runs/{run}/run.json` and `current.json`.

| Step | Delivers                      | Needs      | Source lines in labs  | New lines, about     |
| ---- | ----------------------------- | ---------- | --------------------- | -------------------- |
| R1   | Conditional write in `engine` | Nothing    | 245, and 120 of tests | 40                   |
| R4   | Error helpers                 | Nothing    | None                  | 25, and 30 of tests  |
| R5   | Run context                   | R4, R1     | None                  | 80                   |
| R2   | `run.json`                    | R1, R4, R5 | 110, and 35 of tests  | 60, and 180 of tests |
| R3   | Start and completion          | R2         | 150, and 170 of tests | 60, and 150 of tests |

Labs code is ported into other types, so the source lines say how much there is to read, and the ported code can be shorter. R5 needs R1 for one visibility change in `engine`; see R1.

### Shared fixture

The run state tests share these values. They are chosen here. The walkthrough example names no run id, web or actor.

| Value     | Content                                                                     |
| --------- | --------------------------------------------------------------------------- |
| Connector | `aviation`                                                                  |
| Web       | `00000000-0000-4000-8000-000000000001`                                      |
| Actor     | `00000000-0000-4000-8000-000000000002`                                      |
| Run `n`   | `Uuid::from_u128(0x4000_8000_0000_0000_00A0 + n)`, so run 1 ends in `…00a1` |
| Clock     | `FixedClock(2026-11-06 12:00 UTC)`                                          |
| Storage   | `ArtifactStorage::local("{dir}/artifacts")`                                 |
| Scratch   | `{dir}/scratch-{uuid}`, one per context                                     |
| Local     | `{dir}/local`                                                               |

After `start` of run 1 with the definition `connector: aviation\n` and the namespace `aviation`, the tests expect these two files:

```json
{
  "input": {
    "run": "00000000-0000-4000-8000-0000000000a1",
    "web": "00000000-0000-4000-8000-000000000001",
    "connector": "aviation",
    "actor": "00000000-0000-4000-8000-000000000002",
    "definition": "connector: aviation\n",
    "namespace": "aviation"
  },
  "batch": { "max_writes": 128, "max_bytes": 1500000 },
  "capture": null,
  "prepare": null,
  "send_progress": null,
  "send": null,
  "failure": null
}
```

```json
{ "active": "00000000-0000-4000-8000-0000000000a1", "last_completed": null }
```

After `current::complete` of run 1, `current.json` is `{ "active": null, "last_completed": "…00a1" }`.

### R1. Conditional write in `engine`

**Interface.** All of it is in `engine`. The function names are those of [steps.md](steps.md).

```rust
// engine/src/storage/artifact/
impl ArtifactStorage {
    pub async fn read_versioned(&self, key: &ArtifactKey) -> Result<Option<(Vec<u8>, CasVersion)>, Report<ArtifactError>>;
    pub async fn replace_if(&self, key: &ArtifactKey, expected: Option<&CasVersion>, bytes: Vec<u8>) -> Result<bool, Report<ArtifactError>>;
}
pub struct CasVersion { pub e_tag: Option<String>, pub provider_version: Option<String> }

// engine/src/storage/namespace.rs
impl ArtifactNamespace {
    pub fn run(&self, run: Uuid) -> ArtifactKey;   // {root}/runs/{run}/run.json
    pub fn current(&self) -> ArtifactKey;          // {root}/current.json
}
```

- `read_versioned` returns `None` only for a missing key. A file over 1 MiB is `ArtifactError::Read`, and its body is not downloaded.
- `replace_if` with `expected` of `None` writes only if the key is missing. With a version it writes only if the file still has that version.
- `replace_if` returns `false` only for a conflict. Bytes over 1 MiB are `ArtifactError::Write`.
- On S3 the version is the object's ETag and provider version. On the local file system it is the SHA-256 of the file as hex text in `provider_version`, compared under one lock file per storage root.

**Reuse.**

| From                                                                                | Lines | How    | Changes                                                                                                     |
| ----------------------------------------------------------------------------------- | ----- | ------ | ----------------------------------------------------------------------------------------------------------- |
| Labs `src/blob.rs:312-331`, `CasVersion` and `CasVersionV1`                         | 20    | Ported | One struct with the two fields. The versioned wrapper and serde go, because a version is never stored       |
| Labs `src/blob.rs:1540-1570`, `get_cas_document_bounded`                            | 31    | Ported | Becomes `read_versioned` with a limit of 1 MiB. Returns `Vec<u8>`. Errors become `ArtifactError::Read`      |
| Labs `src/blob.rs:1621-1658`, `put_cas_document`                                    | 38    | Ported | Becomes `replace_if`. `None` is `PutMode::Create`, a version is `PutMode::Update`. A conflict is `false`    |
| Labs `src/blob.rs:1706-1718`, `cas_version` and `local_cas_version`                 | 13    | Ported | None                                                                                                        |
| Labs `src/blob.rs:1724-1834`, `local_put_json`                                      | 111   | Ported | The lock uses `File::lock` of the standard library; labs uses the crate `fs4`, which `engine` does not have |
| Labs `src/blob.rs:2066-2095`, `fsync_ancestors`, `cas_temp_name`, `cas_temp_prefix` | 30    | Ported | None                                                                                                        |
| `engine/src/storage/artifact/binding.rs:28-67`, `bind` and `bound`                  | 40    | Model  | `engine`'s own port of the labs create and bounded read: how the key, the errors and the size check look    |

`ArtifactStorage` gets the field `local_root: Option<PathBuf>`, as labs has it (`src/blob.rs:430`). `engine` already depends on `object_store`, `hash-crypto` and `hex`, so its `Cargo.toml` does not change.

**Tests.**

| Test                                                                                                    | Fixture                                                                                                                                                                     | Expected                                                                                                                             |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Labs `json_updates_are_compare_and_swap`, `src/blob.rs:2317`. Passes today                              | Create `{"run":1}`. Create `{"run":2}`. Read. Replace with the version read, twice                                                                                          | `true`, `false`. Then `true`, `false`. Labs also compares the version of the create with the version read; `replace_if` returns none |
| Labs `local_json_cas_emulates_provider_update_across_store_handles`, `src/blob.rs:2352`. Passes today   | Two handles over one local folder. Handle 1 creates `{"generation":1}`. Handle 2 reads and replaces with `{"generation":2}`. Handle 1 replaces with the version from before | `true`, `true`, `false`                                                                                                              |
| Labs `conditional_put_contract`, `tests/s3_contract_test.rs:432`. Not run today: it needs a real bucket | Create `{"generation":1,"writer":"first"}`, read, create again, replace with the version read, replace with it again, read                                                  | `true`, the value written, `false`, `true`, `false`, and the stored value is the second writer's                                     |
| `namespace_keys_are_stable`, `engine/src/storage/tests.rs:390`. Passes today                            | Web `Uuid::from_u128(1)`, run `Uuid::from_u128(2)`                                                                                                                          | Two more keys: `{root}/runs/00000000-0000-0000-0000-000000000002/run.json` and `{root}/current.json`                                 |
| New: size limit                                                                                         | A write of 1 MiB + 1 byte. Then a file of that size put in place directly                                                                                                   | The write is `Write` and the key stays missing. The read is `Read`                                                                   |

The third test runs on local storage and on MinIO, as `bind_keeps_the_first_reference` (`engine/src/storage/tests.rs:160`) does with the helper `minio()` of that file. Labs runs it only from a test that is ignored without a real bucket.

**Reference flow.** Labs, `src/blob.rs`:

1. `create_cas_document` (`:1580`) and `compare_and_swap_cas_document` (`:1588`) both call `put_cas_document` with a `PutMode`.
2. On S3, `put_cas_document` sends one conditional put. `AlreadyExists` and `Precondition` are a conflict.
3. On a local store it calls `local_put_json`. That takes the lock file `.integrations-cas.lock` of the root, compares the SHA-256 of the current file with the expected version, removes temporary files a crashed writer left, writes a temporary file, syncs it, renames it and syncs the folder.
4. `get_cas_document_bounded` reads the object and its version, and refuses an object over the limit before it downloads the body.

Recommended: this flow. `engine` already took its create-only write from the same labs code (`binding.rs:22-23`).

**Found while planning.**

- **The labs version type keeps `engine`'s dependencies private.** `CasVersionV1` holds two optional strings, so the public signature names no type of `object_store`. Labs writes take `Vec<u8>`. The read returns `Vec<u8>` here, where labs returns `Bytes`.
- **The function names.** Assumed: the two names of [steps.md](steps.md) stay, `read_versioned` and `replace_if`, with the labs code behind them. `replace_if` returns `bool` where labs returns `CasWrite`, because no caller uses the version of a write. (To confirm.)
- **Labs has no limit on a write.** It limits reads, and its limit for a run input record is 1 MiB (`src/orchestrator/internal_metadata.rs:21`). The check on a write is new code, three lines.
- **Labs has no test with two processes or a killed writer.** Its local write is built for both, and the local store is the one for development and tests. Assumed: the first version adds no such test. (To confirm.)
- **The scratch file helper is not public.** `ArtifactStorage::staging_file` is `pub(crate)` (`engine/src/storage/artifact/mod.rs:95`), and `Format::extension` is `pub(super)`. R5 needs to name scratch files. Assumed: R1 makes `staging_file` `pub`, because it changes the same module.
- **The base branch.** `engine`'s storage module comes from hashintel/hash#10392, which is open against `main` (checked 2026-11-18). The pull request for R1 is based on that branch, or waits for it.

### R4. Error helpers

**Interface.** `StageError` and `Code` are in the skeleton (`ledger/src/run/error.rs`). This step adds the four functions that run state calls. Each keeps the original report as the cause.

```rust
pub(crate) fn artifact(report: Report<ArtifactError>) -> Report<StageError>;
pub(crate) fn stored_json(error: serde_json::Error) -> Report<StageError>;
pub(crate) fn scratch<E: Error + Send + Sync + 'static>(error: E) -> Report<StageError>;
pub(crate) fn open(report: Report<OpenError>) -> Report<StageError>;
```

| Error                          | Code                    | Retry class |
| ------------------------------ | ----------------------- | ----------- |
| `ArtifactError::Read`, `Write` | `storage_unavailable`   | Retryable   |
| `ArtifactError::Mismatch`      | `storage_mismatch`      | Permanent   |
| `serde_json::Error`            | `stored_json_invalid`   | Permanent   |
| An I/O error on a scratch file | `scratch_unavailable`   | Retryable   |
| `OpenError`                    | `workspace_unavailable` | Retryable   |

**Reuse.** New code, about 25 lines. Neither labs nor `engine` maps `engine`'s errors to codes.

**Tests.**

| Test             | Fixture                   | Expected                                                                                   |
| ---------------- | ------------------------- | ------------------------------------------------------------------------------------------ |
| New: code text   | Every code of `Code::ALL` | `as_str()`, `Display` and the JSON text are equal                                          |
| New: retry class | Every code of `Code::ALL` | Nine are retryable, listed below. `StageError` is stored as `"retryable"` or `"permanent"` |
| New: the cause   | Each of the four helpers  | The code of the table, and the report still holds the original error                       |

The retryable codes are `storage_unavailable`, `scratch_unavailable`, `workspace_unavailable`, `source_unavailable`, `secret_unavailable`, `graph_unavailable`, `run_active`, `run_not_ready` and `reader_stopped` (`ledger/src/run/error.rs:154-162`).

**Reference flow.** Labs has the same two classes and no list of codes. A handler returns `ExecutionError::Retryable` or `ExecutionError::Permanent` (`src/orchestrator/port.rs:259`), and a recorded failure is `FailureSummary { code, message, retryable }` (`src/orchestrator/events.rs:333`). The failure part of `run.json` holds the same three facts, without the message.

**Found while planning.**

- **The other mappings move to the step that calls them.** A failed SQL statement, a failed pipeline and a failed capture are first handled in Prepare and Capture. Assumed: their helpers and the table of their codes are specified there, and R4 holds the four above. (To confirm.)
- **Seven codes have no user yet.** No doc comment in the skeleton names `duplicate_entity_id`, `reader_stopped`, `row_key`, `secret_unavailable`, `source_credentials`, `source_response` or `source_unavailable`. Assumed: they stay, as decided when the eight codes were removed. The sections of Capture and Prepare check them against the code they reuse.

### R5. Run context

**Interface.** `RunContext`, `Clock`, `SystemClock` and `SendSettings` are in the skeleton (`ledger/src/run/mod.rs:126-187`, `ledger/src/send/mod.rs:17-33`). This step adds:

```rust
impl RunContext {
    pub fn new(
        storage: ArtifactStorage,
        web: WebId,
        connector: &ConnectorId,
        scratch: PathBuf,
        local: PathBuf,
        workspace: WorkspaceConfig,
        send: SendSettings,
        clock: Box<dyn Clock>,
    ) -> Self;
    pub(crate) fn scratch_file(&self, format: Format) -> PathBuf;
    pub(crate) async fn publish(&self, path: &Path, format: Format) -> Result<ArtifactRef, Report<StageError>>;
    pub(crate) async fn fetch(&self, artifact: &ArtifactRef) -> Result<PathBuf, Report<StageError>>;
    pub(crate) async fn open_workspace(&self, variables: Variables) -> Result<Workspace, Report<StageError>>;
}

pub struct FixedClock(pub OffsetDateTime);
```

The parameters of `new` follow the order of the fields of the struct.

- `new` builds the namespace from the web and the connector with `ArtifactNamespace::new`.
- `scratch_file` returns a new path in the scratch folder on every call.
- `publish` stores the file under `artifacts/` and removes the local file.
- `fetch` downloads a stored file into the scratch folder and checks it against its reference.
- `open_workspace` opens a DuckDB workspace on a new scratch file, with the given variables and the settings of the context.

**Reuse.** New code, about 80 lines with the test fixture. Each function calls a public function of `engine`:

| Function         | Calls                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------ |
| `scratch_file`   | `ArtifactStorage::staging_file` (`engine/src/storage/artifact/mod.rs:95`), public after R1 |
| `publish`        | `ArtifactStorage::publish` (`:110`) with `ArtifactNamespace::artifacts()`                  |
| `fetch`          | `ArtifactStorage::materialize` (`:142`)                                                    |
| `open_workspace` | `Workspace::open` (`engine/src/workspace/mod.rs:222`)                                      |

The code goes into `run/mod.rs`, next to the struct. The ledger `Cargo.toml` needs the `fs` feature of `tokio`, and `tempfile`, `rstest`, `similar-asserts` and `tokio` with `macros` and `rt` as test dependencies.

**Tests.** None of its own. The step adds the test fixture: `connector()`, `run_id(n)` and `context(dir)` with the values of the shared fixture. Every test of R2, R3 and the stages uses it.

**Reference flow.** Labs has no such type. It passes its stores and settings to each function separately, and sets up the DuckDB workspace in `src/orchestrator/planning.rs`.

**Found while planning.**

- **`WorkspaceConfig` has no `Clone`** (`engine/src/workspace/mod.rs:39`). All six fields are public, five are `Copy`, and `open_workspace` replaces the sixth, `variables`. Assumed: `open_workspace` builds a new `WorkspaceConfig` from the fields, and `engine` does not change.

### R2. `run.json`

**Interface.** The types `Run`, `RunInput`, `BatchSettings`, `Stage` and `Failure` are in the skeleton (`ledger/src/run/mod.rs:56-124`). This step fills the four functions of `ledger/src/run/store.rs`:

```rust
pub(crate) async fn read(context: &RunContext, run: RunId) -> Result<Option<Run>, Report<StageError>>;
pub(super) async fn create(context: &RunContext, run: &Run) -> Result<bool, Report<StageError>>;
pub(crate) async fn update(context: &RunContext, run: RunId, change: impl FnMut(&mut Run) + Send) -> Result<Run, Report<StageError>>;
pub(crate) async fn fail(context: &RunContext, run: RunId, stage: Stage, error: &Report<StageError>, batch: Option<u32>);
```

- `read` returns `None` when the run has no `run.json`. A file that is not a `Run`, including one with an unknown field, is `stored_json_invalid`.
- `create` writes the file only if the run has none, and returns `false` if it has one.
- `update` reads the file with its version, applies `change`, and writes it only if the version still matches. On a conflict it starts again, up to eight times. It returns the state it stored.
- `update` returns `run_not_ready` when the run has no `run.json`, and `storage_unavailable` after eight conflicts.
- `fail` writes the failure part through `update`: the stage, `*error.current_context()`, `Code::of(error)` and `batch`. A write error is logged.
- A stage removes the failure part by setting `failure` to `None` in the `change` of its first write.

The loop of `update` is one private function. R3 uses it for `current.json`.

**Reuse.**

| From                                                                             | Lines | How    | Changes                                                                                |
| -------------------------------------------------------------------------------- | ----- | ------ | -------------------------------------------------------------------------------------- |
| Labs `src/orchestrator/record_io.rs:132-160`, `create` and `compare_and_swap`    | 29    | Ported | Encode with `serde_json`, call `replace_if`. The record registry of labs is not taken  |
| Labs `src/orchestrator/record_io.rs:164-192`, the read of `read_mutable`         | 29    | Ported | Read with the version and decode. The rewrite of older encodings after it is not taken |
| Labs `src/run_manifest.rs:93-126`, `open_or_create`                              | 34    | Ported | Create, and on a conflict read the winner. Becomes `create` and the read in `start`    |
| Labs `src/run_manifest.rs:223-246`, `update`                                     | 24    | Ported | Read with the version, change, write conditionally. The retry loop is added around it  |
| Labs `src/orchestrator/submission.rs:31`, `:328-406`, the loop of eight attempts | 3     | Model  | `for _attempt in 0..MAX_ADMISSION_ATTEMPTS`, and the error after the last attempt      |

**Tests.**

| Test                                                                                                    | Fixture                                                                                                                 | Expected                                                                                                                      |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Labs `admitted_input_is_immutable_across_repository_instances`, `src/run_manifest.rs:278`. Passes today | Context 1 creates `run.json` for run 1 and updates it. Context 2 over the same folder reads it                          | Context 2 reads the state context 1 stored                                                                                    |
| From the conflict branch of labs `open_or_create`, `src/run_manifest.rs:117-124`                        | Two contexts over one folder call `create` for run 1 at the same time, with different batch settings                    | Exactly one `true`. A third context reads the winner's file                                                                   |
| New: eight conflicts                                                                                    | An `update` whose `change` also overwrites the file on disk with another valid `run.json`, a different one on each call | `storage_unavailable`, retryable, after `change` ran eight times. A plain `update` then succeeds                              |
| New: no file                                                                                            | `update` for a run that was not started                                                                                 | `run_not_ready`, retryable                                                                                                    |
| New: unknown field                                                                                      | A stored file with the extra field `"status": "done"`                                                                   | `stored_json_invalid`, permanent                                                                                              |
| New: stored form                                                                                        | `create` for run 1 of the shared fixture                                                                                | The stored file equals the first JSON block of the shared fixture                                                             |
| New: failure part                                                                                       | `fail` for Prepare with a `storage_unavailable` report, then an `update` that sets `failure` to `None`                  | After `fail`: `{"stage":"prepare","error":"retryable","code":"storage_unavailable","batch":null}`. After the `update`: `null` |

The third test needs no hook in `engine`. Local storage keeps a key at `{dir}/artifacts/{key}`, and a file whose bytes changed since the read is a conflict.

**Reference flow.** Labs keeps one document per run, at `runs/{run}/current.json` (`src/run_manifest.rs:87-91`):

1. `open_or_create` (`:93`) creates the document. On a conflict it loads the document the other writer created.
2. `update` (`:223`) loads the document with its version, applies a closure, and writes it conditionally. It fails on the first conflict.
3. Typed records go through `record_io` (`src/orchestrator/record_io.rs`), which encodes a record and calls the conditional write of `src/blob.rs`.
4. Where labs retries a conflict, it does so eight times: the admission of a run (`src/orchestrator/submission.rs:31`, `:328`) and its retirement (`:453`).

Recommended: steps 1 and 2 for `run.json`, with the loop of step 4 around `update`. `RunManifestRepository` is used by `src/engine/batch_sync.rs` and `src/graph/link_pipeline.rs`. The older inventory (`docs/pipeline/reference/labs.md:7`) says that path has no caller, which was not rechecked here.

**Found while planning.**

- **Labs fails `update` on the first conflict.** This design retries, as agreed in [steps.md](steps.md), so a stage never sees a conflict. The number eight is the one labs uses for its admission record.
- **A report without a code.** `Failure::code` is required, and `Code::of` returns an `Option`. Every report built with `Code::report` or `Code::wrap` has a code. Assumed: `fail` logs a report without a code and writes nothing.

### R3. Start and completion

**Interface.** The functions are in the skeleton with empty bodies: `start` (`ledger/src/run/mod.rs:156`), and `read`, `activate` and `complete` in `ledger/src/run/current.rs`. This step adds `RunInput::parse_definition`, which Capture and Prepare also call:

```rust
impl RunInput {
    pub fn parse_definition(&self) -> Result<Definition, Report<StageError>>;
}
```

It returns the definition and no `Option`; see the second point under "Found while planning".

`start` does these steps in order:

1. It returns `integration_mismatch` if the namespace of the context is not the namespace of `input.web` and `input.connector`.
2. It parses the definition with `Definition::from_yaml`. It returns `invalid_definition` if that fails, and `integration_mismatch` if the definition names another connector.
3. It reads `current.json` and returns `run_active` if another run is active.
4. It creates `run.json` with `input` and `batch`. If the run has one, it compares the stored `input` and `batch` with the given ones and returns `request_mismatch` if they differ.
5. It sets the run as the active run with `current::activate`.
6. It returns the stored `Run`.

Steps 1 and 2 write nothing.

- `current::read` returns `Current::default()` when the integration has no `current.json`.
- `activate` sets `active` to the run. It does nothing if the run is active already, and returns `run_active` if another run is.
- `complete` sets `last_completed` to the run and clears `active`. It does nothing if the run is the last completed run already, and returns `run_active` if another run is active.

**Reuse.**

| From                                                                                | Lines | How    | Changes                                                                                                                    |
| ----------------------------------------------------------------------------------- | ----- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| Labs `src/orchestrator/submission.rs:294-407`, `submit_durable_for_run`             | 114   | Ported | The loop over the admission record becomes `activate`. A second run is refused; labs attaches the caller to the active run |
| Labs `src/orchestrator/submission.rs:444-482`, `retire_admission_for_terminal_runs` | 39    | Ported | Becomes `complete`. It also records the run as the last completed run                                                      |
| Labs `src/orchestrator/submission.rs:203-218`, `AdmissionPointerV1` and its state   | 16    | Model  | The record per integration that names the run in progress. `Current` in the skeleton holds `active` and `last_completed`   |
| `Definition::from_yaml` and `Definition::connector` of the crate `definition`       |       | Called | None                                                                                                                       |

The pending submission, the run locator, the shard marker and the journal event of the labs function are not taken.

**Tests.** The labs tests pass today. Their fixtures are labs records, so a port keeps the case and the expected result and builds the fixture from `start` and `complete`.

| Test                                                                                                     | Fixture                                                                                                                   | Expected                                                                                           |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Labs `concurrent_submitters_attach_to_one_admission_without_submission_dependency`, `submission.rs:1351` | Two contexts call `start` for run 1 at the same time, with the same input                                                 | Both return the same `Run`. Run 1 is active                                                        |
| The same case with two runs                                                                              | Two contexts start run 1 and run 2 at the same time                                                                       | Exactly one succeeds. The other returns `run_active`, retryable. `active` is the winner            |
| Labs `terminal_admission_is_retired_in_place_and_replaced_by_exact_cas`, `submission.rs:1404`            | Run 1 is active, `start` of run 2. Then `complete` of run 1 and `start` of run 2                                          | `run_active`. Then success, and `current.json` holds run 2 as active and run 1 as last completed   |
| Labs `run_locator_is_durable_before_admission_and_conflicting_reuse_fails_closed`, `submission.rs:1468`  | `start` with the definition `connector: other\n`. Then `start` of run 1 twice, the second time with the namespace `other` | `integration_mismatch`, and no file is written. `request_mismatch` for the second `start` of run 1 |
| New: invalid definition                                                                                  | The definition `connector: [\n`                                                                                           | `invalid_definition`. `store::read` is `None` and `current.json` is missing                        |
| New: stored files                                                                                        | `start` of run 1 of the shared fixture                                                                                    | The two JSON blocks of the shared fixture                                                          |
| New: `complete` twice                                                                                    | `complete` of run 1, twice                                                                                                | Both succeed, and the file is the same after the second                                            |
| New: `start` stopped halfway                                                                             | `store::create` for run 1 without `activate`, then `start` of run 1                                                       | `start` returns the stored `Run`, and run 1 is active                                              |
| New: a completed run                                                                                     | Run 1 has its send part and is the last completed run. `start` of run 1                                                   | `start` returns the stored `Run`, and `active` stays empty                                         |

Labs `second_submission_after_completion_starts_and_completes_a_new_run` (`tests/worker_e2e_test.rs:314`) is the same rule from end to end. It belongs to the test of a whole run in the Send section, and was not run here.

**Reference flow.** Labs, `src/orchestrator/submission.rs`:

1. `submit_durable_for_run` (`:294`) stores the submission, then reads the admission record of the integration with its version.
2. If the record names a run in progress, the caller gets that run back and creates nothing.
3. If the record names a finished run, the function replaces it conditionally. If there is no record, it creates one. A conflict starts the loop again, up to eight times.
4. `retire_admission_for_terminal_runs` (`:444`) marks the record as finished when the run has ended, with the same loop.
5. The journal applies the same rule a second time: a run is accepted only when the integration has no active and no queued run (`src/orchestrator/projection.rs:117-124`).

Recommended: steps 1, 3 and 4, with `current.json` as the admission record. Step 2 differs: this design refuses a second run with `run_active`.

**Found while planning.**

- **Starting a completed run again makes it active.** Step 3 passes because no run is active, step 4 finds the same input, and step 5 sets the run as active. Only Send clears the active run, so the integration is blocked until Send runs again for that run. Assumed: `start` skips step 5 when the stored `run.json` has the send part. (To confirm.)
- **`RunInput::definition` is optional** (`ledger/src/run/mod.rs:89`), and no run of this design is without one. Assumed: `start` returns `invalid_definition` for an input without a definition, and `parse_definition` returns the same for a stored one. (To confirm.)
- **The MinIO helpers are private to `engine`'s tests** (`engine/src/storage/tests.rs:23-64`). Assumed: the ledger crate's run state tests use local storage, and R1's tests in `engine` cover the conditional write on S3. (To confirm.)
- **Two runs started at the same time can both get a `run.json`.** Only one becomes active. The other returns `run_active`, and a `run.json` it wrote stays. Starting it again later succeeds. Nothing changes for this.
- **A definition over 1 MiB** makes step 4 fail with `storage_unavailable`, which is retryable, although no retry can succeed. This is recorded under "Raised by the code inventory" in [open-issues.md](open-issues.md), and no code is named for it yet.
