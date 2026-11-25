# Ledger pipeline: implementation plan

This file is built in seven steps. It holds what exists in the code and what Paul has decided. A section marked "for review" is a proposal until Paul agrees to it. Questions that are not decided stay in `open-issues.md`.

| Step | Content                                                       | State       |
| ---- | ------------------------------------------------------------- | ----------- |
| 1    | Flow map: what a row goes through in labs and in `engine`     | agreed      |
| 2    | Keep, cut, new: every item of the flow map marked, per stage  | agreed      |
| 3    | Interfaces: what each stage reads and leaves behind           | agreed      |
| 4    | Module tree and the steps of each stage                       | agreed      |
| 5    | Tests to carry over, mapped to the steps                      | agreed      |
| 6    | Build order as milestones                                     | agreed      |
| 7    | Implementation spec per milestone, then the plan for the team | in progress |

Two spikes ran before step 3: Iceberg from Rust, and how the Graph answers bulk writes. Their results are in `background/spikes.md`.

## Requirements

From Paul, 2026-11-18.

**Goal**

- A simpler design with less code. It is the base of the integration framework for the coming months, so it has to be easy to maintain.
- A new crate. Logic is ported from `engine` and labs when a stage needs it. `engine` stays as it is and remains the reference to copy more from later (confirmed 2026-11-19).
- Tests from labs and `engine` are reused where the logic is reused, to show the results did not change.

**Stages**

- Three stages: Capture, Prepare, Send. Each stores its result in S3 when it finishes.
- A stage that failed is run again and reads its state back from S3.
- Each stage has a fixed input, output and interface.
- The stages can later be run from a queue such as RabbitMQ and scaled up and down.
- The runs of one integration are strictly sequential and never run in parallel.

**Capture**

- The input is a Parquet file on the local disk. Capture makes no REST request and reads no database.
- Capture is the same for every version of Prepare. It does not write `_op`, because the value differs between hash and diff and incremental updates. The column gets a generic name.
- Capture writes the file to S3 and then updates `run.json`.
- How the change column is produced is not fixed. Paul left the choice to Claude, with the instruction to keep it simple, because it depends on the data collection service built later (2026-11-19).

**Prepare**

- Reads the capture file and the SQL operations of the YAML definition.
- Only integrations with a single source are supported for now. Made exact on 2026-11-19 (`spec/decisions.md`, D14): the aim is to prevent joins between tables that are synced apart. A run can carry several tables of one integration, and a pipeline that reads a second table is refused.
- Does the transformations and conversions as labs and `engine` do today.
- This milestone builds the version for incremental updates: the capture file already holds the entity deltas. Prepare converts and maps them and writes the Graph writes into the sync table.
- Other versions, hash and diff and initial sync, come later and replace this stage's logic.
- Updates `run.json` when the sync table holds the run's rows.

**Send**

- Reads the run's entity changes from the sync table and builds the batches for the Graph API.
- Respects the request limits and the order of submission, for example links last.
- Batching is deterministic: the same order and content every time.
- Tracks which batches the Graph has written. Changed by the rule "How a stage writes" in step 3: Send records its result once, at the end, and a Send that stopped starts again from the first batch.
- When a batch fails, each entity of the batch is submitted alone to find the one that failed. This uses the upsert behaviour, as labs does.
- Guideline for retries (2026-11-19): submit in batches; if a batch fails, retry each entity one by one; rely on the upsert to prevent duplicate entries. The Graph itself has no upsert route (`background/spikes.md`). The upsert is what `engine`'s client does: a create under the derived id, and a patch when the Graph answers that the id exists.
- A failed entity is recorded in `run.json` by batch index and entity index, with debug information.
- When everything is submitted, `current.json` is updated.

**Sync table**

- Based on Apache Iceberg, append only, holding every entity write operation.
- Rows are identified by `run_id` and an order. The order is the position in the capture file, so several updates to one entity in a run keep their sequence.
- Reading the changes of one run is cheap. The aim is one Parquet file per run.

**S3**

- Each integration has its own bucket.
- A run stores its capture file and its `run.json`, and adds its entity updates to the integration's sync table.
- `current.json` names the latest and the current run of the integration.

**`run.json`**

- Holds everything about one run: its state, what is needed to retry at the right stage, and debug information.
- The definition in the walkthrough is a reference and can change.

## 1. Flow map

Moved to `background/flow-map.md`: what a source row goes through today in labs and in `engine`, the work in review on Linear, and what the new design needs that neither has. Agreed by Paul on 2026-11-19.

## 2. Keep, cut, new

Agreed by Paul on 2026-11-19. Every item of the flow map is marked: ported into the new crate, left behind, or new. Line counts are code without tests, and those for the new crate are estimates. The new crate uses the `definition` crate as a dependency and ports nothing from it.

### Storage and run state, used by all stages

Port:

- From hashintel/hash#10392: the S3 backend, the upload and the download of a file, and their tests against MinIO. About 250 lines. The local folder as a second kind of storage is left behind (`spec/decisions.md`, D6). Its naming of files by their content hash, with `ArtifactRef`, is left behind: step 3 decided that a run's files have fixed names in the run's folder.
- From labs `blob.rs`: writing a small JSON file with "create if absent" and "replace if the version matches" (`create_json`, `compare_and_swap_json`). About 80 lines. `current.json` needs it, so that two starts cannot both claim an integration.

Leave behind:

- `bind` and `bound` of hashintel/hash#10392. `run.json` records where a capture is stored. `ArtifactNamespace` is kept as `IntegrationNamespace`: all integrations share one bucket (Paul, 2026-11-20).
- The state version and work manifest records of hashintel/hash#10453. They describe stored request bodies, which the new design does not have.
- From labs: the journal, shards, leases, inbox, garbage collection and `durable-kernel` (about 28,000 lines), and the local cache of `blob.rs`.

New:

- `run.json` and `current.json`: their types, reading them, and updating one part. Starting a run. About 250 lines.

### Capture

Port:

- `SourceCapture::open` from `engine/capture.rs`: the row count from the file's footer. About 15 lines.

Leave behind:

- `engine/sources/` with the readers for SQL, Postgres and REST, secrets, the HTTP client and the fingerprint (about 1,750 lines), and the first half of `workspace/connection/capture.rs`, which writes a query's result to a Parquet file (about 90 lines).
- The rest of `engine/capture.rs`: copying and publishing a file on the local disk.
- From labs: `capture_sources`, `materialize` and the capture binding.

New:

- The stage itself: for each table, find its file, count its rows and store it; then write the `capture` part (one file per table, D14). About 100 lines. How the change column gets into the file is a question for step 3.

### Prepare

Port:

- DuckDB for the SQL steps, from `engine/workspace`: opening DuckDB with access to files, the network and extensions switched off; the check that a query is a single `SELECT` (`select.rs`); `stage_table`; `prepare_pipeline` and `prepare_link_pipeline`; reading rows (`rows.rs`); the error types; `sql.rs`. About 1,150 lines, with `tests/pipeline.rs`.
- `load_capture` from `workspace/connection/capture.rs`: loading a Parquet file into a table. About 100 lines. Added on 2026-11-19 while planning the tests: DuckDB has file access switched off, so it cannot read the file itself, and this function loads it through Arrow.
- `derive_entity_id` and the id rules of `EntityUpsert::new` and `LinkUpsert::new`. About 80 lines, with the recorded test values.
- `engine/graph/property/` as it is: `SinkRow`, `resolve`, the conversions and unit maps. 653 lines, 409 of tests.
- The row loop of `Planner::plan_entities` and `plan_links`, with `PlanIssue`. It reads the source id, skips a row without one, converts the properties and collects what could not be used. About 150 lines. Its output changes from request bodies to rows of the sync table.

Leave behind:

- The rest of `engine/workspace`: the thread with its command queue, cancellation, metrics, the snapshot of the DuckDB file, the disk limit checks and the lock file. About 1,450 lines with `variant_name` and `byte_size`. `byte_size` is moved after all: `ByteSize` types the DuckDB limits that milestone 5 keeps. The kinds of DuckDB error are left behind too (D11).
- `_content_hash` and the source checks for row counts, empty and unique columns. Nothing reads the hash without hash and diff, and a definition in hash cannot declare such checks.
- From labs: hash and diff with its state tables, the guard against mass archives, and the comparison with stored request bodies (over 1,500 lines). They belong to the hash and diff version of Prepare.
- `GraphPlan::finish` with its refusal of a second write to an entity.

New:

- Staging for incremental input: `_op` from the change column, `_key`, and the position of the row in the file.
- The kind of change from the row: insert becomes a create, update an update, delete an archive.
- The sync table: its row type, writing a run's rows, reading them back.
- The issues file, and the check that no pipeline reads a second table.
- About 500 lines together.

### Send

Port:

- From `engine/graph/plan/request.rs`: the create, patch and archive bodies and the link data. About 150 lines, with the tests that check the Graph can read them.
- `integration_provenance` and the order of `OperationKind` from `engine/graph/mod.rs`.
- `engine/graph/client`: the two headers, sending a request, reading a refusal, the error type. 180 lines, 293 of tests.
- From labs `graph/client.rs`: the bulk create request (`create_batch_once`). About 60 lines.
- From labs `graph/executor.rs`: the fallback from a refused batch to single writes (`execute_create_batch_group`) and `classify`. About 150 lines of the 1,080, with the scripted tests for a refused batch. Waiting between attempts (`retry_delay`) is not ported: Send does not retry by itself (step 3, "Send").

Leave behind:

- `Payload`, `Delivery` and `SavedRequests` in `engine`: request bodies stored at plan time, with their version field.
- From labs: turns with a request budget, the cursor, permits, the lock registry, sending several batches at once, the set of known conflicts, and the scheduler that shares a rate between integrations.

New:

- Reading and sorting a run's rows, and cutting them into batches by count and by size.
- Recording a failed entity by batch and entity index in `run.json`, and going on with the next one.
- Updating `current.json` when the run is complete.
- About 350 lines together.

### Not used in the first version

- The `orchestration` crate (hashintel/hash#10402, hashintel/hash#10410) and the service and command line on top of it (hashintel/hash#10440, hashintel/hash#10458). The stages are called with a run id and keep their state in `run.json`.
- `engine/progress`.

### Size

The line counts in this step were first estimates, about 3,600 lines together, and are too low. `spec/README.md` has the measured numbers per milestone: on 2026-11-19, 5,170 lines without tests, of which 54% exist already.

### Decided with this list

Paul, 2026-11-19:

1. **Orchestration.** The first version does not use the `orchestration` crate or the service. A command line tool calls the stages. The crate's "one active run per admission key" and its recorded steps cover the same ground as `current.json` and `run.json`, so using both would track a run twice.
2. **DuckDB.** The SQL parts of the workspace are ported and its request machinery is left behind. Prepare runs its DuckDB work in one blocking task. This gives up cancelling a running query and the disk limit.
3. **Links.** The link pipeline and the link id are ported now, so that Send can order links after entities. A link row takes the kind of its source row (step 3, "Prepare"). The two cases this misses stay in `open-issues.md`.

## 3. Interfaces

Agreed with Paul on 2026-11-19, one topic at a time.

### How a stage writes

Decided by Paul on 2026-11-19.

- A stage writes `run.json` once, with everything the stage has to record. It does not update the file while it works.
- That write is the last thing a stage writes to S3. It is what moves the run to the next stage.
- If the write does not happen, the stage runs again from its start and repeats all of its steps, also when its files are already stored.

What follows from this:

- **Capture** uploads the file and then writes its part.
- **Prepare** writes the issues file, then the sync table, then its part. A second attempt computes everything again. The sync table finds the run's rows already there and writes nothing.
- **Send** has no `send_progress` part. It writes the `send` part once, after the last batch, with the counts and the failed entities. A Send that stops in the middle starts again from the first batch.
- `current.json` is the one file besides `run.json` that records status. Start writes it when a run begins. Send writes it right after its `send` part, to name the run as the last completed run. If Send stops between the two writes, it runs again, finds the `send` part, and only writes `current.json`.

### What a run leaves in the bucket

Decided with Paul on 2026-11-19. One bucket per integration:

```text
current.json                   the active run and the last completed run
runs/{run}/run.json            the status of one run
runs/{run}/capture/{table}.parquet   one capture file per table
runs/{run}/issues.jsonl        the issues file, if Prepare noted anything
sync table                     decided in its own topic below
```

- A run's files are stored in the run's folder under fixed names. They are not named by a hash of their content.
- No hash of a file is computed or stored in the first version. `run.json` records a file's key and its size. Paul left this choice to Claude. The reasons: S3 checks an upload itself, one process writes a run, and nothing would read the hash.
- `current.json` and the parts of `run.json` stay as `review.md` describes them, with two changes:
  - The `capture` part lists one file per table, each with its key, size and row count (changed back from a single file on 2026-11-19, D14): `{ "sources": { "aircraft": { "key": "runs/{run}/capture/aircraft.parquet", "size": 2140, "rows": 4 } } }`.
  - The `send` part lists every entity that failed.

```json
"send": {
  "created": 4120, "updated": 310, "archived": 12,
  "create_existed": 0, "update_missing": 2, "archive_missing": 0,
  "failed": [
    { "batch": 3, "index": 17, "entity_id": "…", "status": 400, "message": "…" }
  ]
}
```

- `batch` is the number of the batch and `index` the position of the entity in it. `message` is the Graph's answer, cut to 1,024 characters.
- A run with failed entities counts as successful. Send retries a failed batch one entity at a time, records the entities that fail, goes on with the next batch, and at the end names the run as the last completed run in `current.json`. What failed can be read exactly from `run.json`.

### Capture

Decided with Paul on 2026-11-19.

**The capture file**

- It holds the source's own columns and one more, `_change`, with `insert`, `update` or `delete` for each row. The name says what happened to the source row and names no Graph operation, so the file is not tied to one version of Prepare.
- The column arrives with the file. Only the sender knows what changed. Capture adds nothing and rewrites nothing.
- Capture does not look at `_change`. The incremental Prepare requires it and fails if it is missing or holds another value. A file for hash and diff has no such column, and Capture is the same for both.
- The order of the rows in the file is the order of the changes.

**The stage**

|                     |                                                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Called with         | The run id and the paths of the local Parquet files, one per table of the definition                                       |
| Reads               | `run.json`. If the `capture` part is there, Capture has finished before and does nothing.                                  |
| Does                | For each table: reads the row count from the file's footer, then uploads the file to `runs/{run}/capture/{table}.parquet`. |
| Writes last         | The `capture` part: key, size, rows.                                                                                       |
| Fails for good when | The file is missing or is not a Parquet file.                                                                              |
| If it runs again    | It uploads the file again under the same name.                                                                             |

- The file path is an argument, passed by the command line tool. It is not taken from the definition, which describes the real source and not the file of changes.
- A file without `_change` is noticed in Prepare, one stage later than it could be. This is accepted.

### The sync table

Decided with Paul on 2026-11-19.

**Columns,** as `review.md` has them:

| Column                              | Content                                                                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `run_id`                            | The run that added the row                                                                                       |
| `seq`                               | The position of the change's source row in the capture file. It is the `_seq` that staging adds, taken as it is. |
| `op`                                | Create, update or archive, of an entity or of a link                                                             |
| `entity_id`                         | The id of the entity or link                                                                                     |
| `entity_type`                       | The entity type or link type                                                                                     |
| `left_entity_id`, `right_entity_id` | The two ends of a link, empty for an entity                                                                      |
| `properties`                        | The new values of the change, as JSON text                                                                       |

**Interface.** Two functions and nothing else: write the rows of a run, and read the rows of a run in `seq` order. Prepare calls the first, Send the second. Neither stage knows how the table is stored. The team has not chosen the storage for good (BE-1162, BE-1175), and a change of format stays inside this module.

**Storage**

- Apache Iceberg, partitioned by `run_id`. A run is one Parquet file, and a read opens only that file.
- The table has its own folder in the integration's bucket, apart from the run folders: `sync/pointer.json`, `sync/metadata/`, `sync/data/run_id={run}/`.
- `sync/pointer.json` holds the location of the table's current metadata file. It is written with "replace if the version matches" through the ported storage code. No catalog service and no database are used.
- The `iceberg` crate is pinned to a commit on its `main` branch, which uses the workspace's `arrow` and `parquet` version. It moves to version 0.12 when that is released.

**Writing a run twice is refused.** Each append stores the run id in the table's history, and the write function checks for it first. If a process stops after the append and before the pointer is written, the table does not have the run, and the retry appends it. Either way a run's rows are in the table exactly once.

### Prepare, for incremental updates

Decided with Paul on 2026-11-19.

|                     |                                                                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Called with         | The run id                                                                                                                                                                                                   |
| Reads               | `run.json` for the definition and the `capture` part. If the `prepare` part is there, it does nothing.                                                                                                       |
| Does                | Downloads the capture files, one per table (D14), stages each in DuckDB, runs the SQL steps, gives each row its entity id and properties, decides the kind of change, and writes the rows to the sync table. |
| Also writes         | `runs/{run}/issues.jsonl`, if a row had no id or a value could not be converted. One line of JSON per issue (changed from Parquet on 2026-11-19, `spec/decisions.md` D3).                                    |
| Writes last         | The `prepare` part: number of rows, issues file, number of issues                                                                                                                                            |
| Fails for good when | `_change` is missing or holds another value, a pipeline reads a second table, the capture files are not those of the definition's tables, or an SQL step fails                                               |
| If it runs again    | It starts over from the capture files. The sync table refuses a second write of the run.                                                                                                                     |

- **Internal columns.** Staging adds `_op`, `_key` and `_seq` to the DuckDB table. `_op` is copied from `_change`. `_seq` is the row's position in the capture file. The names `_op` and `_key` are kept, because `engine`'s staging, its checks after each SQL step and its tests use them. The SQL of a definition has to carry all three through.
- **Order.** The sync table has no number of its own. Its `seq` column is `_seq`. Two changes to one entity come from two capture rows, so they keep their sequence. One capture row can produce several rows in the sync table, such as an entity and a link, and they share the value. Send sorts by kind, then `seq`, then entity id.
- **A later version of Prepare,** such as hash and diff, replaces staging and leaves `insert`, `update` or `delete` in `_op` its own way, for hash and diff by comparing with the previous run. The incremental version does it in staging. The shared step reads the kind of change from `_op` (D13). The rest is shared.
- **Links.** A link row takes the kind of its source row: insert creates the link, update updates it, delete archives it. Compared with labs, two cases are missing, and both stay with the team under BE-1174:
  - A row whose link target changes gets the new link, and the old link stays live.
  - A delete row that no longer carries the link's columns cannot name the link, so the link is not archived.
- Labs handles both because it captures the whole source and compares the pairs of ends with those of the previous run (`prepare_link_diff` in `graph/link_pipeline.rs`). The hash and diff version of Prepare will port that comparison.

### Send

Decided with Paul on 2026-11-19.

|                  |                                                                                                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Called with      | The run id                                                                                                                                                                                                                           |
| Reads            | `run.json` for the actor, the connector, the submission time and the batch limits. The web and the id namespace are in the ids of the rows. If the `send` part is there, it only makes sure `current.json` names the run, and stops. |
| Does             | Reads the run's rows from the sync table, sorts them, builds the requests, cuts them into batches and sends the batches one after another.                                                                                           |
| Writes last      | The `send` part, once: the counts and the failed entities. Then `current.json`.                                                                                                                                                      |
| If it runs again | It starts from the first batch.                                                                                                                                                                                                      |

- **Order.** Entity creates, entity updates, link creates, link updates, link archives, entity archives. Inside a group by `seq`, then entity id.
- **A batch** holds one kind, at most 128 requests and 1.5 MB, and never two rows for the same entity. The Graph's own limit is 2 MiB. The limits are stored in `run.json`, so every attempt cuts the same batches.
- **Request bodies** are built when sending, from the row. A create carries the whole entity, an update one "set this property" per property, an archive the archived flag.
- **Bulk requests for all kinds.** Creates go to the bulk create route, updates and archives to the bulk patch route.
- **A refused batch is sent one entity at a time, each as an upsert:**
  - A create that the Graph answers with "exists" is followed by a patch.
  - An update that the Graph answers with "not found" is followed by a create.
  - An archive that the Graph answers with "not found" counts as done.
  - Any other refusal is recorded as a failed entity, and Send goes on.
- **Nothing is absorbed silently.** The Graph must not differ from the sync table without this being visible. Each of the three upsert cases means the Graph was not in the state the row expected. Send counts them in the `send` part as `create_existed`, `update_missing` and `archive_missing`, and logs a warning with the entity id for each. A Send that runs a second time counts every create it applied before as `create_existed`.
- **"The Graph is not available" is not a refusal.** No answer, a timeout, 429, 502, 503 and 504 stop Send with an error that says it can be run again. Send does not wait and retry by itself, and no entity is recorded as failed. Every other answer that is not a success is a refusal. This includes 500, because the Graph answers a link with a missing end with 500. Kept simple for now, at Paul's request: if the Graph answers everything with 500, every entity is recorded as failed.
- **No shortcut for a repeated Send.** A batch of creates that the Graph applied before is refused and sent one by one. Paul turned down a bulk patch in between as over-optimization.
- **One request at a time.** No rate limit of our own: requests with the service secret skip the Graph's limits.

Two changes to the Graph API would remove most of this fallback. They are not part of this work:

- An error for a bulk request that names the entities that failed.
- Statuses that tell a refused entity from a server fault.

One known gap stays in `open-issues.md`: an entity that is deleted and then inserted again in the same run is created first and archived second, so it ends up archived.

## 4. Module tree and steps

Agreed by Paul on 2026-11-19, in its second version. The first version was organised by kind of code. Paul asked for a crate that reads as a staged pipeline: a `stage` module with what all stages share, one folder per stage, versions of Prepare as nested folders, and storage and rows split into their own modules.

It follows `RUST_DESIGN_GUIDELINES.md`: the module tree is the map of the system, `mod.rs` is the entry point of its folder, modules are named after what they do, the code is concrete functions and structs, and there is no trait and no `utils` or `helpers` module.

### The crate

A new crate next to `definition` and `engine`. The name `ledger` is a proposal.

```text
libs/@local/integrations/ledger/src/
├── lib.rs                    what a caller uses: start a run, then the three stages
│
├── stage/                    THE PIPELINE
│   ├── mod.rs                what every stage does the same way: read run.json at the start,
│   │                         stop if its part is there, write its part as the last step
│   ├── failure.rs            a stage's error: which stage, why, and whether a rerun can help
│   │
│   ├── capture/              STAGE 1
│   │   ├── mod.rs            the steps of Capture, in order
│   │   └── footer.rs         the row count from the Parquet footer
│   │
│   ├── prepare/              STAGE 2
│   │   ├── mod.rs            the steps every version of Prepare shares, in order
│   │   ├── incremental/      the version for incremental updates
│   │   │   ├── mod.rs        its entry function
│   │   │   └── staging.rs    _op from _change, _key, _seq
│   │   ├── full/             later: the version for full captures, with hash and diff
│   │   ├── workspace/        DuckDB for one run
│   │   │   ├── mod.rs        open it with access to files and the network switched off
│   │   │   ├── select.rs     the check that a query is a single SELECT
│   │   │   └── rows.rs       read the rows of a table
│   │   ├── pipeline/         run the SQL steps of entity and link pipelines
│   │   │   ├── mod.rs        the steps and the check of the internal columns
│   │   │   └── tests.rs      its tests, beside it (milestone 6)
│   │   ├── entity_id.rs      entity id and link id
│   │   ├── property/         a column value becomes a property
│   │   │   ├── mod.rs        SinkRow and resolve
│   │   │   ├── coerce.rs     date, time, number and the other conversions
│   │   │   └── value.rs      DuckDB values
│   │   ├── changes.rs        the rows of a table become rows of the sync table, or issues
│   │   └── issues.rs         the issues file
│   │
│   └── send/                 STAGE 3
│       ├── mod.rs            the steps of Send, in order
│       ├── plan/             sort the rows and cut them into batches
│       ├── request.rs        create, patch and archive bodies, provenance
│       ├── delivery/         one batch: in bulk, then one by one as upserts
│       ├── tally.rs          the counts of the `send` part
│       └── client.rs         the Graph routes: bulk create, bulk patch, single create, single patch
│
├── run/                      WHAT IS KNOWN ABOUT A RUN
│   ├── mod.rs                the run id, reading and writing run.json
│   ├── record.rs             the parts of run.json: input, batch, capture, prepare, send, failure
│   ├── current.rs            current.json: the active run and the last completed run
│   └── start.rs              start a run
│
├── sync_table/               WHAT PREPARE HANDS TO SEND
│   ├── mod.rs                open the table of an integration
│   ├── row.rs                one row: its columns and the kinds of change
│   ├── pointer.rs            sync/pointer.json
│   ├── write.rs              append a run, refuse a second append
│   └── read.rs               read a run in order
│
└── storage/                  THE INTEGRATION'S BUCKET
    ├── mod.rs                open a bucket
    ├── s3.rs                 the S3 settings and client
    ├── file.rs               upload and download a file
    └── versioned.rs          read and write a small file, with "create if absent" and
                              "replace if the version matches"
```

**How to read it**

- `stage/` is the pipeline. Its three folders are the three stages, in the order they run. The `mod.rs` of each stage lists that stage's steps in order and calls one function per step, so the file reads like the step list below.
- `stage/mod.rs` and `stage/failure.rs` hold what all stages share. A reader who knows them knows how any stage starts, ends and fails.
- `stage/prepare/` shows its versions as folders. `incremental/` holds only what differs between versions: the entry function and staging. Staging leaves `insert`, `update` or `delete` in `_op`, and the shared step reads the kind of change from there (D13). Everything else in `prepare/` is shared, and `full/` will reuse it.
- `run/`, `sync_table/` and `storage/` are what the stages work with. None of them knows a stage.

**Who calls whom**

- `lib.rs` → `run::start` and the three stage functions.
- A stage → `stage` (shared), `run`, `storage`, and its own folder. Prepare and Send also → `sync_table`.
- No stage calls another stage. `run` and `sync_table` → `storage`. `storage` calls nothing in the crate.

**The command line tool** is not in this tree. It lives in the existing app as `hash-integrations ledger start | capture | prepare | send` (`spec/decisions.md`, D15).

### What each stage does, step by step

Each step names the file that holds it. Every stage begins and ends with the two shared steps in `stage/mod.rs`.

**Start** (`run/start.rs`)

1. Take the definition the caller parsed (D9). The caller needs its connector to open the storage.
2. Read `current.json`. If it names an active run, refuse.
3. Write `runs/{run}/run.json` with the `input` and `batch` parts.
4. Name the run as active in `current.json`. If the file changed since step 2, refuse.

**Capture** (`stage/capture/mod.rs`)

1. Read `run.json`. Stop if the `capture` part is there (`stage/mod.rs`).
2. Read the row count from the file's footer (`footer.rs`).
3. Upload the file to `runs/{run}/capture/{table}.parquet` (`storage/file.rs`). Steps 2 and 3 are done for each table.
4. Write the `capture` part (`stage/mod.rs`).

**Prepare, incremental** (`stage/prepare/incremental/mod.rs`, which calls the shared steps in `stage/prepare/mod.rs`)

1. Read `run.json`. Stop if the `prepare` part is there (`stage/mod.rs`). Fail if a pipeline of the definition reads a second table.
2. Download the capture files, one per table (`storage/file.rs`), and open the workspace (`workspace/`).
3. Stage each file: `_op` from `_change`, `_key`, `_seq` (`incremental/staging.rs`).
4. Run the SQL steps (`pipeline/`).
5. Turn the rows of each entity and link table into rows of the sync table: source id, entity id, properties, kind of change (`changes.rs`, with `entity_id.rs` and `property/`). A row that cannot be used becomes an issue.
6. Write the issues file (`issues.rs`).
7. Write the run's rows to the sync table (`sync_table/write.rs`).
8. Write the `prepare` part (`stage/mod.rs`).

Step 3 belongs to the version: it leaves `insert`, `update` or `delete` in `_op`. The other steps are shared, and step 5 reads the kind of change from `_op` (D13).

**Send** (`stage/send/mod.rs`)

1. Read `run.json` (`stage/mod.rs`). If the `send` part is there, go to step 6.
2. Read the run's rows (`sync_table/read.rs`) and build the body of each (`request.rs`). The bodies come first, because a batch is limited by its size in bytes.
3. Sort the rows and cut them into batches (`plan/`), then send each batch (`delivery/`, on `client.rs`), and count what the Graph did (`tally.rs`).
4. Collect the counts and the failed entities.
5. Write the `send` part (`stage/mod.rs`).
6. Name the run as the last completed run in `current.json` (`run/current.rs`).

### Errors

- Every stage returns the same error type, from `stage/failure.rs`. It names the stage, the reason, and whether running the stage again can help. "The Graph is not available" and a failed S3 request can be helped by a rerun. A missing `_change` column cannot.
- A stage that fails for good writes the `failure` part of `run.json`, as its last write. Capture may have uploaded files before. Otherwise a failed run looks the same in S3 as one that never ran. Claude proposed this twice and Paul agreed to the section without commenting on it, so it counts as chosen for now.

## 5. Tests to carry over

Agreed by Paul on 2026-11-19. For each module of the new crate: the existing tests that move with the ported code, the existing tests that are left behind, and the tests that new code needs. Test names are from `engine` unless they say labs. A ported test must give the same result as before; where the design changed what the code returns, the list says "adapted".

### `storage/`

- **Carry over** from hashintel/hash#10392 (`engine/src/storage/tests.rs`, against a MinIO container): `artifacts_round_trip_through_new_staging`, adapted to a fixed file name; `s3_errors_are_not_missing_bindings`, adapted to a JSON file. The MinIO test setup (`minio`, `bucket`) is reused as it is.
- **Leave behind:** the tests of content names and references (`publishing_the_same_bytes_returns_the_same_reference`, `materialize_rejects_a_changed_artifact`, `references_round_trip_through_json`, `rejects_malformed_references`, `materialize_rejects_unaddressed_references`, `namespace_keys_are_stable`) and of bindings (`bound_returns_the_bound_reference`, `bind_keeps_the_first_reference`).
- **New:** "create if absent" is refused on an existing file; "replace if the version matches" is refused with an old version. Labs has the model: `json_updates_are_compare_and_swap` (`blob.rs:2317`).

### `run/`

- **New:** `run.json` is written and read back unchanged, with a snapshot of its JSON. Start refuses while a run is active. Start names the run as active. Of two starts at the same time, one is refused.

### `stage/` (shared)

- **New:** a stage whose part is there does nothing. A stage writes its part after everything else. A stage that fails for good writes the `failure` part.

### `stage/capture/`

- **New:** each file is in the bucket under `runs/{run}/capture/{table}.parquet` and the part holds its key, size and row count. A missing file and a file that is not Parquet fail for good. A second run uploads again and gives the same part.
- **Leave behind:** all of `tests/capture.rs` except the two `load_capture` tests below, and the two tests in `capture.rs`. They cover writing a query to Parquet and publishing a file on the local disk.

### `stage/prepare/workspace/`

- **Carry over** from `tests/workspace.rs`: `query_returns_rows_in_column_order`, `query_without_rows_keeps_columns`, `create_table_replaces_table`, `query_failure_keeps_workspace_open`, `query_refuses_other_statements`, `create_table_refuses_other_statement_counts`, `query_refuses_disallowed_table_functions`, `open_locks_settings`, `open_applies_limits`, `query_reads_supported_types`, `query_refuses_unsupported_types`, `query_binds_parameters`, `query_refuses_unknown_parameter`. 13 tests. `query_reports_invalid_data` is left behind, since the kinds of DuckDB error are (D11). `open_applies_limits` moves, because the three DuckDB limits are kept (`spec/05-workspace.md`).
- **Carry over** from `tests/capture.rs`: `load_capture_types_and_empty_schema`, `load_invalid_capture_preserves_table`.
- **Leave behind** from `tests/workspace.rs`, with the code they test: the second workspace on one file (1), cancelling a request (3), snapshots (5), the disk limit (4). Also `tests/workspace_metrics.rs`.

### `stage/prepare/incremental/`

- **Carry over** from `tests/pipeline.rs`, adapted to `_op` from `_change` and to `_seq`: `staging_composite_keys`, `staging_invalid_columns`, `staging_empty_source`.
- **New:** `_op` equals `_change` for each row. `_seq` follows the order of the file. A file without `_change` fails for good. A value other than insert, update and delete fails for good.
- **Leave behind:** `staging_assertion_failures`, `staging_assertion_row_bounds`.

### `stage/prepare/pipeline/`

- **Carry over** from `tests/pipeline.rs` with their fixtures `pipeline-branches.yaml`, `pipeline-links.yaml` and `definition/examples/aviation.yaml`: `pipeline_branch_isolation`, `pipeline_metadata_loss` (unchanged; a new test covers `_seq`), `pipeline_named_inputs`, `pipeline_sql_sandbox`, `link_named_inputs`, `definition_aviation_tables`, `pipeline_bound_parameters`.
- **Leave behind:** `pipeline_content_hashes`, `pipeline_converted_hashes`, `pipeline_measured_hashes` with `pipeline-sink.yaml` and `pipeline-measured.yaml`, and `pipeline_cancellation`.

### `stage/prepare/entity_id.rs` and `property/`

- **Carry over, unchanged:** `tests/entity_id.rs` with `entity-ids-typescript.json`, the ids recorded from the TypeScript proof of concept. All of `graph/property/tests.rs`: 12 tests with 64 cases.
- **Carry over, adapted:** from `graph/tests.rs`, `entity_id_from_source_record` and `link_id_from_type_and_endpoints`. They built an `EntityUpsert` and a `LinkUpsert`, which no longer exist. `link_endpoints_match_entities` is left behind, and milestone 8 checks its point (`spec/07-ids-and-properties.md`).
- These are the tests that show the new crate derives the same ids and the same property values as before.

### `stage/prepare/changes.rs` and `issues.rs`

- **Carry over, adapted,** from `graph/plan/tests.rs`: `plan_aviation`. Its snapshot today holds request bodies. It becomes a snapshot of sync table rows for the same aviation rows, with the same ids, properties and issues.
- **New:** insert, update and delete become create, update and archive, for entities and for links. Every row carries the `_seq` of its source row. A row without a source id becomes an issue and no row. A value that cannot be converted becomes an issue and the row is written without it. The issues file holds what the issues were.
- **Leave behind:** `finish_duplicate_entity`. A second write to an entity is now allowed.

### `sync_table/`

- **New,** against MinIO: a run's rows come back in `seq` order with every column unchanged. A read of one run returns no rows of another. A second write of a run adds nothing. After a write that stopped before the pointer was moved, the next write leaves the rows in the table once. The two spikes observed all of this by hand.

### `stage/send/plan/`

- **Carry over, adapted,** from `graph/tests.rs` and `graph/plan/tests.rs`: `operations_sort_into_application_order` and `finish_order`, for six kinds and the order by `seq`.
- **New:** a batch holds one kind, at most the count and at most the size from `run.json`. An entity is never twice in a batch. The same rows give the same batches every time.

### `stage/send/request.rs`

- **Carry over** from `graph/plan/tests.rs` and `graph/tests.rs`: `requests_graph_readable`, which checks that the Graph's own request types can read the bodies; `payload_property_order`; `archive_payload`, adapted; `integration_provenance_wire_shape`.
- **Leave behind:** the three `unreadable_payload` tests. Bodies are no longer stored and read back.

### `stage/send/client.rs` and `delivery/`

- **Carry over** from `graph/client/tests.rs`, which run against a small HTTP server in the test: `upsert_creates`, `archive`, `upsert_rejected`, `graph_url_path`, `configuration`, adapted to routes that no longer follow a create with a patch. The case of `upsert_patches_existing` moves to Send's test of a refused batch (`spec/10-send.md`, test 3).
- **Carry over as scenarios** from labs `graph/executor.rs`. The labs tests are written against labs types, so the cases move and the code is written again on the same test server: a bulk create refused with a conflict falls back to single writes (`:3110`); a create answered with a conflict is followed by a patch (`:2494`); a patch that finds nothing is followed by a create (`:3303`); a failure that is not a conflict is recorded and not retried (`:2671`). From labs `tests/crash_replay_test.rs:245`: a create whose answer was lost is sent again and ends as a patch.
- **New:** a bulk patch for updates and for archives. A refused batch records the failed entity with its batch and index, and Send goes on. The three counts `create_existed`, `update_missing` and `archive_missing`. An answer of "not available" stops Send without a `send` part and without a failed entity.
- **Not carried over from labs:** a create counts as a conflict only on a 409. Labs also reads the words `duplicate key` and `ALREADY_EXISTS` in the answer of a create (test `:1817`). The Graph code on `main` answers an existing id with 409.

### The whole pipeline

- **New, against MinIO and the test HTTP server:** the aviation definition, with a small capture file of inserts, updates and deletes for each of its two tables, runs through Start, Capture, Prepare and Send. The test checks the files in the bucket, `run.json` after each stage, the requests the server received, and `current.json`.
- **New:** every stage is run twice and gives the same result. A Send that is stopped after some batches and run again ends with the same Graph requests applied and counts the repeated creates as `create_existed`.
- **New, against a real Graph,** following `tests/integrations/graph/aviation`: the same run against the Graph and Postgres. This also observes the Graph answers that the spike only read from the code.

### In numbers

About 55 existing tests move with their code, about 30 are left behind with the code they test, and about 45 are new. The counts are estimates from the lists above.

## 6. Build order

The order was agreed by Paul on 2026-11-19 ("the order makes sense to me overall"). Eleven milestones. Each is one pull request that covers whole modules, ends with its tests passing, and is reviewed before the next one that depends on it starts.

| #   | Milestone                 | Adds                                                                            | Needs         |
| --- | ------------------------- | ------------------------------------------------------------------------------- | ------------- |
| 1   | Crate and storage         | The crate `ledger`; `storage/`                                                  |               |
| 2   | Run state                 | `run/`: `run.json`, `current.json`, Start                                       | 1             |
| 3   | Stage frame and Capture   | `stage/mod.rs`, `stage/failure.rs`, `stage/capture/`                            | 2             |
| 4   | Sync table                | `sync_table/`, the pinned `iceberg` crate                                       | 1, 2          |
| 5   | Workspace                 | `stage/prepare/workspace/`                                                      | 3             |
| 6   | SQL steps                 | `stage/prepare/pipeline/mod.rs` with `tests.rs`                                 | 5             |
| 7   | Ids and properties        | `stage/prepare/entity_id.rs`, `property/`                                       | 3             |
| 8   | Prepare, incremental      | `stage/prepare/mod.rs`, `incremental/`, `changes.rs`, `issues.rs`               | 3, 4, 6, 7    |
| 9   | Graph requests and client | `stage/send/request.rs`, `client.rs`                                            | 2, 3, 4       |
| 10  | Send                      | `stage/send/mod.rs`, `plan/`, `delivery/`, `tally.rs`                           | 1, 2, 3, 4, 9 |
| 11  | The whole pipeline        | The command line tool, the run through all stages, the run against a real Graph | 2, 3, 8, 10   |

### How much code, and how much of it exists already

The numbers per milestone are in `spec/README.md`. `spec/sizes.py` recomputes them from the source tables of the milestone files. On 2026-11-19 they are 5,170 lines without tests, of which 54% exist already. The first rough estimate, in step 2, was 3,600 lines, and the first measured one 5,885.

**What is counted.** Lines of source files without tests, as a reviewer sees them in a pull request: code, doc comments and blank lines. Manifest files, the README and the licence file are not counted.

**Three kinds of line**

- **Moved:** copied from `engine` or from the storage pull request with only paths, imports and visibility changed. A reviewer can compare it with the source and skip it.
- **Adapted:** existing logic with real changes: parts removed, or other inputs and outputs.
- **New:** no counterpart in `engine`. Where labs has similar logic, the milestone file says so.

**For comparison,** `engine` without tests has 6,547 lines by the same count. It reads sources, runs the SQL steps and plans single requests. It stores nothing in S3, tracks no run and sends nothing in bulk.

**What each milestone shows when it is done**

1. A file and a small versioned file go to a bucket and come back, on MinIO. A conditional write is refused when it should be.
2. A run can be started, a second start is refused, and `run.json` has the agreed shape.
3. Capture stores a file and records it. This is the first stage that runs, and it fixes how every stage starts, ends and fails.
4. A run's rows go into the sync table and come back in order, exactly once.
5. A Parquet file is loaded into a locked-down DuckDB, and a query that is not a single `SELECT` is refused.
6. The aviation definition's SQL steps give the same tables as in `engine`.
7. The same ids and the same property values as in `engine`, shown by the unchanged tests.
8. Prepare turns a capture file into rows of the sync table and an issues file.
9. The Graph's own types can read the request bodies. The client sends bulk and single requests to a test server.
10. Send delivers a run's rows, falls back to single upserts, and records what failed.
11. One command line run takes a capture file to the Graph.

**Order and parallel work**

- Milestones 1, 2 and 3 come first and in this order. After them, every stage has its frame.
- After milestone 3, which creates `stage/`, three lines of work do not depend on each other: the sync table (4), the workspace and SQL steps (5, 6), and ids and properties (7). The Graph requests and client (9) come after the sync table (4), whose row they read. They can be built in any order, or by different people at the same time.
- Milestones 8 and 10 join the lines. Milestone 11 joins the stages.
- The largest milestone is 5, the workspace. Milestones 5, 6 and 7 are ported code, so they are quick to review.

**How a milestone is run**

Before any code, a short brief: what the milestone adds, where it sits in the flow, what goes in and out, the new names, and the choices Paul can still veto. After Paul's go-ahead, the code and its tests. Then a short note on what differs from the brief. A commit is made when Paul asks for one.

**Open points**

- **Where the command line tool lives.** Decided (`spec/decisions.md`, D15): in the existing app, `apps/hash-integrations`, as `hash-integrations ledger start | capture | prepare | send`, added in milestone 11. The app has open pull requests that add `submit`, `status` and `cancel` on the orchestration interface.
- **The storage pull request is not merged.** Milestone 1 ports from its branch. If it changes before then, the port follows it.
- **Linear.** Not created. The earlier agreement was one issue per stage with a sub-issue per piece. With this order that gives five issues: shared parts (1, 2, 4), Capture (3), Prepare (5 to 8), Send (9, 10), the whole pipeline (11).

## 7. The spec, and the plan for the team

### What Paul asked for

From Paul, 2026-11-19.

**Planning and review**

- One cohesive implementation plan, with pseudo code, references to the labs and `engine` code that is reused, and the tests.
- A number that shows how much of the code is reused or slightly adjusted, and how much is built from scratch.
- An issue has to be quick to grasp: what it does, where it sits in the pipeline, and how close it is to a module that exists in labs or `engine`.
- A concise format to present the plan and its issues to the team.
- The order of work: first a large spec file with the details. Then the plan for the team, derived from it by leaving details out. Then review and agreement. Only then issues on Linear.

**Code and tests**

- A lean pipeline. Everything that is no longer needed is stripped out, and what remains is simplified.
- No repeated code, and the Rust guidelines are followed.
- Good tests of the core behaviour. Not every helper needs a test now.
- Hundreds of lines of tests for helper functions cost more in review than they give. Reviews come first.

### How it is done

Agreed by Paul on 2026-11-19.

**Two files, each with one job**

- The folder `spec/`, for whoever builds a milestone. One file per milestone, all in the same form, with `contracts.md` and `decisions.md` beside them (split from one file on 2026-11-19, at Paul's request). It holds only what this plan does not: signatures, pseudo code, source references and tests. For a decision it points to this plan and does not repeat it.
- `review.md`, for the team. Rewritten from the agreed design, since parts of it are out of date. The architecture in short, then one card per milestone. It stays a Markdown file that imports into Notion.

**A milestone file in `spec/`** has the same eight parts every time. `spec/README.md` lists them.

**A milestone card in `review.md`**

```text
 8  Prepare, incremental                                            750 lines
    reused █████░░░░░ 49%     adapted 370 · new 380
    Does:       stage 2: staging, the steps in order, rows into changes, the issues file
    In flow:    stage 2
    Closest to: engine stage_table and Planner::plan_entities, labs plan_candidate
```

**Rules that keep reviews short**

- A pull request states its three numbers: moved, adapted, new.
- Moved code is committed first, as it was copied, with its tests. The changes come in a second commit. A reviewer then reads the changes as a diff and can skip the copy.
- Tests that move with their code stay unchanged, and the pull request says so.
- New code gets tests for what a stage promises: its result, a second run, and its failures. A helper is tested through the function that uses it. As a guide, three to six new tests per milestone. The list in step 5 is the pool to pick from, not a list to complete.

**Open points are sorted when they come up**

- **A fact** is answered at once, by reading code or running a small test, and written down with the place.
- **A local choice** stays inside one milestone and is cheap to change. Claude chooses by Paul's principles and marks it "chosen".
- **A decision** crosses milestones or changes something agreed. Only these go to Paul. They are collected in `spec/decisions.md`, and its waiting list is empty when the spec is done.

**Order**

1. The milestone 8 sample. Done, and the form is agreed.
2. The contracts page: the types and functions that cross milestones. Claude writes it, Paul reviews it. After that a milestone depends only on this page.
3. The milestones in three batches: shared parts (1 to 4), Prepare (5 to 8), Send and the whole pipeline (9 to 11). Subagents draft the mostly ported ones (1, 5, 6, 7, 9), and Claude checks a sample of their references. Claude writes the mostly new ones (2, 3, 4, 8, 10, 11).
4. After each batch, a fresh subagent compares it with the contracts page and the plan. It reports signatures that do not match, steps nobody implements, anything specified twice, and anything the plan does not have. It decides nothing.
5. After each batch, Paul reviews the batch and its decisions as a short numbered list.
6. A final check over the whole spec, and a script that recomputes the size table from the source tables.
7. `review.md` for the team, rewritten from the spec.
8. Review with the team, then the Linear issues.
