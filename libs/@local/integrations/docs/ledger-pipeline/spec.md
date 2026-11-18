# Ledger pipeline: high-level spec

The ingestion pipeline changes from four stages with a completion marker each to three stages that share one status file per run. Today the crate [`pipeline`](../../pipeline/src) captures full sources, diffs them against the previous run by content hash, stores the Graph request bodies in a file, and sends that file. The new pipeline captures incremental updates, stores each entity change once in an append-only sync table, and builds the Graph requests from that table when it sends them.

This document fixes the stages, what each stage reads and writes, and the state kept in S3. Each stage is planned in detail against it. Questions it leaves unanswered are in [open-issues.md](open-issues.md). The steps of each stage, one per issue, are in [steps.md](steps.md).

Every statement was decided with Paul on 2026-11-17.

## Scope

The first version covers one kind of run: apply the incremental updates of a capture to the Graph.

Outside the first version:

- Starting a run. A CLI is added later, and a queue such as RabbitMQ is considered after that. A stage takes its input from S3, so both can call the same stage.
- Reading source systems. A separate data collection service will read the sources and push data to this pipeline.
- Full captures. Hash and diff and initial sync are later variants of Prepare with the same input and output as the incremental variant.
- Restore, reconcile and resend-all.

## Terms

- **Run:** one pass of a capture through the three stages, identified by a run id.
- **Sync table:** the append-only table of entity changes, stored in the integration's S3 bucket.
- **Change:** one row of the sync table. It creates, updates or archives one entity or link.
- **`run.json`:** the status file of one run.
- **`current.json`:** the status file of the integration.

## Stages

```text
local Parquet files → Capture → Prepare → Send → Graph
                         │         │        │
                         └──── run.json ────┘     current.json
                      capture files   sync table
```

| Stage   | Reads                                                                                   | Writes                                                                                                                 |
| ------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Capture | One local Parquet file of changed rows per source                                       | The capture files in S3, then its part of `run.json`                                                                   |
| Prepare | The capture files named in `run.json`, the pinned definition                            | The run's changes in the sync table, an issues file if a row or a value could not be used, then its part of `run.json` |
| Send    | The run's changes in the sync table, the batch settings and Send progress in `run.json` | Graph requests, Send progress after each batch, the Send part, then `current.json`                                     |

Rules for every stage:

- A stage writes its result to S3 first and updates `run.json` second.
- A stage is complete when its part is present in `run.json`. There is no separate status field.
- A stage that returns an error writes the failure part of `run.json`: the stage, whether the failure is retryable or permanent, the error code and, for Send, the batch index. The retry class and the code are the existing `StageError` and `Code`. A stage that crashes writes nothing.
- A stage removes the failure part with its first successful write to `run.json`. For Send that is the first send progress write of the attempt.
- A stage takes the run id and reads `run.json` to find its input and its progress. A retry runs the stage again with the same run id.
- Run N+1 starts only after run N has completed all three stages. `start` writes the first `run.json` and sets the active run in `current.json`, and it refuses when another run is active.

### Capture

The CLI gives Capture one local Parquet file of changed rows per source of the definition. A checkpoint source has no file, because a pipeline produces it. Capture uploads each file as it is with `ArtifactStorage::publish`, without a local copy, and reads the row count from the Parquet footer. When all files are stored, it writes the capture time, the file references and the row counts to `run.json`.

A retry reads every file again. A file that is already stored is not uploaded a second time.

A capture file holds the source's own rows, one row per changed source record. For an incremental source, the column `_change` says what happened to each record: `insert`, `update` or `delete`. The sender provides that column with the data, and writes the rows in the order the changes happened.

Capture adds no column and reads no row, and it is the same code for every variant of Prepare. The columns the pipelines need are added by Prepare. The row shape is still to be agreed within the team; see "What a row of the incremental capture holds" in the open issues.

### Prepare

Prepare turns the captured rows into changes:

1. It stages each capture file (`stage_sources`): it builds the table the pipelines read and adds three internal columns. `_op` is taken from `_change`, `_key` is computed from the primary key, and `_seq` is the position of the row in the capture file.
2. It runs the definition's pipelines to build one table per target (`prepare_rows`).
3. It assigns the entity id of each row (`ids::assign`).
4. It resolves the properties of each row through the definition's mapping (`SinkRow::resolve`).
5. It maps the `_op` of each row to a Graph operation.
6. It assigns `order_id`: the rows sorted by target, in the order of the definition, and then by `_seq`.
7. It appends one change per row to the sync table.

A pipeline's SQL has to keep `_op`, `_key` and `_seq`. `engine` checks the first two after every step of an entity pipeline, and does not check link pipelines. Prepare checks `_seq` on each target table and fails the run when a pipeline dropped it. That loading a Parquet file keeps its row order is assumed and has to be confirmed by a test.

Staging is the step a variant of Prepare replaces. Hash and diff stages every row as a snapshot row, as `stage_table` in `engine` does today, and it also replaces step 5, because it finds the operation by comparing with the previous state. The other steps are shared.

Prepare expects valid entity updates in the capture. It computes no diff and reads no earlier run.

Prepare fails the run when a target reads more than one source. A capture holds only the rows that changed, so a pipeline that joins two sources can miss the row it joins to. The set of sources per target is already computed in `stage/diff/rows/pipelines.rs`. See "Joins and aggregations in incremental runs" in the open issues.

Prepare does not stop a run for one bad row or one bad value:

- A row without a usable source id is left out. So is a link row without both endpoints.
- A value that cannot be converted is left out, and the rest of the row is written.

Both are listed in the issues file of the run. The file has the seven columns of the previous refactor: `kind`, `target`, `entity_id`, `key`, `issue`, `property` and `reason`. `issue` is `missing_id`, `missing_endpoint` or `property_unconverted`. `key` holds the primary key of the source row, so the file contains source values. The file is written only when there is an entry, and `run.json` holds its reference and the number of entries.

Several rows of a target may have the same entity id, because an incremental capture can hold more than one change to an entity. The check that refuses this belongs to the hash and diff variant.

### Sync table

- The table is append-only. A run adds rows and changes no existing row.
- Each row belongs to one run and has a position in that run.
- A row holds the new value its change carries. Prepare does not read earlier rows to complete it.
- A row says whether it creates, updates or archives. Prepare derives this from the `_change` column of the capture file. Send has no fallback between create and patch, so it cannot find the kind out from the Graph.
- The Graph writes of a run are derived from its rows. Request bodies and batch numbers are not stored.
- The state of the integration at a run can be reconstructed by merging the rows of each entity up to that run.

| Column                              | Content                                              |
| ----------------------------------- | ---------------------------------------------------- |
| `run_id`                            | The run that added the row                           |
| `order_id`                          | The position of the row in its run                   |
| `op`                                | Create, update or archive, of an entity or of a link |
| `entity_id`                         | The id of the entity or link                         |
| `entity_type`                       | The entity type or link type                         |
| `left_entity_id`, `right_entity_id` | The two endpoints of a link. Empty for an entity.    |
| `properties`                        | The new value: the properties the change carries     |

The actor and the provenance of a request come from `run.json` and have no column. `entity_id` and the two endpoint ids are full entity ids, which include the web. `properties` is empty for an archive.

The physical format of the table is settled in Prepare planning. How the table is stored is open; see "How the sync table is stored" in the open issues.

### Send

Send turns the run's changes into Graph requests:

1. It reads the run's rows, sorted by operation first and by position in the run second. The operations are sent in the order entity upserts, link upserts, link archives, entity archives. `op` has six values, and within an upsert group the creates are sent before the updates: create entity, update entity, create link, update link, archive link, archive entity.
2. It encodes each row as a Graph request. A create carries the properties of the row. An update carries one `add` operation per property of the row, and a property that is absent from the row stays unchanged in the Graph. An archive carries no properties.
3. It cuts the sorted rows into batches. A new batch starts when the operation changes, which includes a switch from create to update, at the write limit, at the byte limit, or when the entity is already in the open batch.
4. It sends the batches in order, starting at the confirmed batch count in `run.json`. After each confirmed batch it writes the new batch count and the running counts to the Send progress part of `run.json`.

Batches are deterministic. The same rows, the same sort and the same batch settings give the same batches, so a retry needs only the batch count. For this reason the write limit and the byte limit are pinned in `run.json`.

A create that the Graph answers with a conflict counts as done. A batch can then be sent again without changing the history of an entity.

When the last batch is confirmed, Send writes the Send part with the final counts to `run.json` and sets the run as the last completed run in `current.json`. Send progress and the Send part are separate, so the Send part is present only when Send is complete. A Send that resumes reads the running counts from Send progress. A Send that finds the Send part present sends nothing and still sets the run as the last completed run, so a stop between the two writes is repaired by running Send again.

## State in S3

Each integration has one S3 bucket. It holds the capture files, the sync table, the issues files, one `run.json` per run at `runs/{run}/run.json`, and one `current.json`. In `engine`'s storage today an integration has its own root instead, `tenants/{web}/integrations/{id}`, and every path in this document is below that root.

`run.json` is the only status file of a run. Each stage updates it with a conditional write. When another writer changed the file first, the update reads it again and applies its change to the new state. The first version assumes that one process works on a run at a time; see "Two attempts of one stage at the same time" in the open issues.

```rust
/// The contents of `run.json`.
pub struct Run {
    pub input: RunInput,
    pub batch: BatchSettings,
    pub capture: Option<CaptureOutput>,
    pub prepare: Option<PrepareOutput>,
    pub send_progress: Option<SendProgress>,
    pub send: Option<SendOutput>,
    pub failure: Option<Failure>,
}

pub struct RunInput {
    pub run: RunId,
    pub web: WebId,
    pub connector: ConnectorId,
    pub actor: ActorEntityUuid,
    pub definition: Option<Box<str>>,
    pub namespace: Box<str>,
}

/// The limits of one batch. Today these are the constants 128 and 1_500_000.
pub struct BatchSettings {
    pub max_writes: u32,
    pub max_bytes: u64,
}

pub struct CaptureOutput {
    pub captured_at: OffsetDateTime,
    pub sources: BTreeMap<SourceName, CapturedSource>,
}

pub struct CapturedSource {
    pub file: ArtifactRef,
    pub rows: u64,
}

pub struct PrepareOutput {
    /// The number of rows the run added to the sync table.
    pub rows: u64,
    /// The issues file. Present when a row was left out or a value could not be converted.
    pub issues: Option<ArtifactRef>,
    pub issue_count: u64,
}

pub struct SendProgress {
    pub confirmed_batches: u32,
    /// The counts of the confirmed batches.
    pub counts: SendCounts,
}

pub struct SendOutput {
    pub counts: SendCounts,
}

pub struct SendCounts {
    pub created: u64,
    pub patched: u64,
    pub archived: u64,
    pub absent: u64,
    pub rejected: u64,
}

pub struct Failure {
    pub stage: Stage,
    /// `Retryable` or `Permanent`.
    pub error: StageError,
    pub code: Code,
    /// The index of the batch that failed. Present when a batch of Send failed.
    pub batch: Option<u32>,
}
```

| Part           | Field of `Run`  | Written by                       |
| -------------- | --------------- | -------------------------------- |
| Pinned input   | `input`         | The start of the run             |
| Batch settings | `batch`         | The start of the run             |
| Capture        | `capture`       | Capture                          |
| Prepare        | `prepare`       | Prepare                          |
| Send progress  | `send_progress` | Send, after each confirmed batch |
| Send           | `send`          | Send, after the last batch       |
| Failure        | `failure`       | The stage that failed            |

`CapturedSource`, `SendCounts` and `ArtifactRef` are the existing types, unchanged. `StageError` is the existing type and gains a serialized form, `retryable` or `permanent`, for the failure part. `Code` loses eight codes that no stage of the new design returns and gains `run_active` and `run_not_ready`. Three existing types lose fields:

- `RunInput` loses `operation` and `allow_mass_archive`. Only apply is in scope, and only the diff stage reads `allow_mass_archive`.
- `CaptureOutput` loses `adopted_from`, which exists for restore and reconcile.
- `SendOutput` loses `rejected`, the reference to the file of refused writes. Whether that file returns depends on "What happens to a write the Graph refuses" in the open issues.

`Run`, `BatchSettings`, `PrepareOutput`, `SendProgress`, `Failure` and `Stage` are new. `Stage` names the three stages.

A `run.json` after Capture and Prepare have completed:

```json
{
  "input": {
    "run": "…",
    "web": "…",
    "connector": "…",
    "actor": "…",
    "definition": "…",
    "namespace": "…"
  },
  "batch": { "max_writes": 128, "max_bytes": 1500000 },
  "capture": {
    "captured_at": "2026-11-17T14:02:11Z",
    "sources": {
      "people": {
        "file": {
          "version": "v1",
          "value": {
            "key": "…",
            "sha256": "…",
            "size": 48211,
            "format": "parquet"
          }
        },
        "rows": 312
      }
    }
  },
  "prepare": { "rows": 312, "issues": null, "issue_count": 0 },
  "send_progress": null,
  "send": null,
  "failure": null
}
```

The parts that are present give the status of a run:

| Parts present                    | Status of the run                                                          |
| -------------------------------- | -------------------------------------------------------------------------- |
| A failure part                   | Stopped. The retry class says whether running the stage again can succeed. |
| No failure part and no Send part | In progress, or stopped by a crash                                         |
| The Send part                    | Complete                                                                   |

`current.json` holds two fields: the active run and the last completed run.

## Stage contracts

A stage takes the run id, reads `run.json` itself and returns its own output (Paul, 2026-11-18). A stage writes its part of `run.json` itself. Nothing hands a stage the output of another stage, so `run.json` is the only place a stage's input comes from, and a message that starts a stage holds the integration, the run id and the stage.

```rust
pub async fn capture(context: &RunContext, run: RunId) -> Result<CaptureOutput, Report<StageError>>;
pub async fn prepare(context: &RunContext, run: RunId) -> Result<PrepareOutput, Report<StageError>>;
pub async fn send(context: &RunContext, run: RunId, graph: &impl Graph) -> Result<SendOutput, Report<StageError>>;
```

| Stage   | Reads from `run.json`                                                                    | Output          |
| ------- | ---------------------------------------------------------------------------------------- | --------------- |
| Capture | `RunInput`                                                                               | `CaptureOutput` |
| Prepare | `RunInput`, `CaptureOutput`                                                              | `PrepareOutput` |
| Send    | `RunInput`, `BatchSettings`, `CaptureOutput`, `PrepareOutput`, `SendProgress` if present | `SendOutput`    |

The definition in `RunInput` names the local Parquet file of each source for Capture. Send reads `CaptureOutput` for the capture time, which every request carries as `loadedAt`.

A stage returns the retryable error `run_not_ready` when the run has no `run.json`, or when the part of the stage before it is missing. `start` writes the first `run.json`, so a run is started before its first stage.

## Crate layout

The new pipeline is the crate `hash-integrations-ledger` in `libs/@local/integrations/ledger`. It follows [RUST_DESIGN_GUIDELINES.md](RUST_DESIGN_GUIDELINES.md).

```text
src/
├── lib.rs            the three stage functions and the run types
├── run/
│   ├── mod.rs        Run, RunInput, BatchSettings, Failure, Stage
│   ├── store.rs      read run.json, conditional write
│   ├── current.rs    current.json
│   ├── error.rs      StageError, Code
│   └── serde.rs      text adapters for the names of the definition crate
├── capture.rs        capture(), CaptureOutput, CapturedSource
├── prepare/
│   ├── mod.rs        prepare(), PrepareOutput
│   ├── rows.rs       load the capture files, run the pipelines
│   ├── ids.rs        entity and link ids
│   └── issues.rs     the issues file
├── table.rs          Parquet row files, used by the issues file and the sync table
├── sync_table/
│   ├── mod.rs        the row type and the operation
│   ├── write.rs      append the rows of a run
│   └── read.rs       read the rows of a run in send order
├── send/
│   ├── mod.rs        send(), SendOutput, SendProgress, SendCounts
│   ├── request.rs    encode a row as a request body
│   ├── batch.rs      cut batches
│   └── delivery.rs   send a batch, retry, conflicts
└── graph/
    ├── mod.rs        Graph trait, GraphResponse
    ├── client.rs     HTTP client
    └── fake.rs       FakeGraph for tests
```

- Each stage is one module at the top level. `run`, `sync_table` and `table` are the three modules the stages share.
- The crate builds on `hash-integrations-engine` and does not copy its modules (Paul, 2026-11-18). It takes from `engine`: the DuckDB workspace and the pipelines, storage (`ArtifactStorage`), `SourceCapture`, `derive_entity_id`, property resolution (`SinkRow`), and the operation types `EntityUpsert`, `LinkUpsert` and `Archive`.
- `engine`'s storage module comes from the open pull request hashintel/hash#10392 and is not on `main` yet. The crate builds only on a branch that has it.
- `engine`'s `GraphClient` sends one write at a time and falls back from create to patch. Send needs bulk requests without a fallback, so the client and the batching are new code in this crate.
- `engine` encodes the create, update and archive bodies of a write into one sealed `Payload`. Send needs them separately. `engine` will expose them separately.
- Property conversion follows `engine`: Prepare calls `SinkRow::resolve` there. Labs differs in three cases, listed in [steps.md](steps.md).
- The steps need four changes to `engine`: the conditional write, the path check for local files as a function, the function that renders an id as text, and the request bodies exposed separately. [steps.md](steps.md) has the details.
- The conditional write for `run.json` and `current.json` goes into `engine`'s storage module (Paul, 2026-11-18). The previous refactor's `storage/artifact/mutable` module moves there with its tests: `read_versioned` returns the bytes and a version, and `replace_if` writes only if the version still matches. `ArtifactNamespace` gets the two key names. A file is limited to 1 MiB, and `run.json` embeds the definition.
- `Graph` is the only trait. It exists so that tests can use `FakeGraph`.

## Existing code

The crate of the previous refactor, [`libs/@local/integrations/pipeline`](../../pipeline/src), stays unchanged. Code that the new crate reuses is copied from it, and its tests stay available as a reference.

Expected values in tests come from the labs proof of concept (`pocs/integrations_rs` in the labs repository) and from the `engine` crate first. The tests of the previous refactor are the second choice.

The update request follows labs: `entity_patch_params` in `src/graph/client.rs` builds one `add` operation per property. `engine` on `main` has the same encoder in `graph/plan/request.rs`.

The paths below are in the previous refactor.

| Used by   | Reused                                                                                                                                                                                                 | No longer needed                                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Capture   | `SourceCapture::open` and `ArtifactStorage::publish` from `engine`, `CapturedSource` (`sources/mod.rs`)                                                                                                | The SQL, PostgreSQL and REST readers, the secret lookup, the binding file per source                                                           |
| Prepare   | `prepare_rows` and `ids::assign` (`stage/diff/rows`), `SinkRow::resolve` (`graph/property`)                                                                                                            | The hash table, the diff labels and the per-target change files (`stage/diff`)                                                                 |
| Send      | The create and archive encoders (`graph/plan/request.rs`), the batch cut rule (`stage/plan/write.rs`), the `Graph` trait and client (`graph`), the retry loop (`stage/send/delivery.rs`), `SendCounts` | `writes.parquet` and its reader, the fallback from create to patch and from patch to create, the patch that replaces the whole property object |
| Run state | Conditional writes (`storage/artifact/mutable`), the error codes (`run/error.rs`)                                                                                                                      | The four `_done.json` markers, `input.json`, the `sending` list in `current.json`                                                              |
