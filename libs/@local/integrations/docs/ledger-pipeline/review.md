# Ledger pipeline: architecture and build plan, for review

The ledger pipeline is the next version of the ingestion pipeline. A sender hands it the rows that changed in a source. The pipeline turns them into entity changes, keeps every change in an append-only table called the sync table, and applies the changes to the Graph.

- **Status:** the design and the build plan are written and checked. No code is written.
- **Scope of the first version:** incremental updates only, started by hand from a command line tool. Reading source systems, full captures with hash and diff, and restore come later.
- **Size:** about 5,200 lines without tests, in a new crate. 54% of them exist today in `engine` and move over unchanged or adapted.

## What changes from the POC

- **Three stages, each with one result in S3.** Capture, Prepare, Send. A stage that fails is run again and reads what it needs from S3.
- **One status file per run,** `run.json`, in place of the journal, its events and the projection folded from them.
- **A table of entity changes between planning and sending.** The POC built every request body while planning and stored the bodies.
- **The kind of change comes from the sender.** Each captured row says insert, update or delete. The POC compared every run with the previous one.
- **A refused entity does not stop the run.** It is recorded, and Send goes on. The POC ended the run at the first one.
- **No orchestration.** No shards, leases, turns, budgets or cursor. One run of an integration at a time, enforced by a small file.

## The flow

```text
changed rows                 Capture ──────► Prepare ──────► Send ──────► Graph API
(local Parquet files) ────►     │               │              │
                                ▼               ▼              │ reads
data in S3                capture files     sync table ────────┘
                                            issues file

status in S3   runs/{run}/run.json   one per run: what the run works with, and what each stage finished
               current.json          one per integration: the active run and the last completed run
```

All integrations share one bucket. Each has its own place in it, `tenants/{web}/integrations/{hash}/`, which holds:

```text
current.json
runs/{run}/run.json
runs/{run}/capture/{table}.parquet     one capture file per table
runs/{run}/issues.jsonl                if Prepare noted anything
sync/                                  the sync table
```

## How a run is tracked

`run.json` has one part per stage. A part that is there means that stage has finished.

| Part      | Written by                | Holds                                                                                                                                            |
| --------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `input`   | Start                     | The run id, the web, the connector, the actor, the definition as written, the id namespace, the submission time                                  |
| `batch`   | Start                     | The limits of one batch of Graph requests: 128 requests and 1.5 MB                                                                               |
| `capture` | Capture                   | For each table, where its file is stored, its size and its row count                                                                             |
| `prepare` | Prepare                   | The number of changes, the issues file and the number of issues                                                                                  |
| `send`    | Send                      | What the Graph did: created, updated, archived. The entities it refused, each with its batch, its place in the batch, the status and the message |
| `failure` | A stage that cannot go on | The stage, a code for the reason, and the error's text                                                                                           |

Five rules follow:

1. **A stage is called with the run id and reads `run.json`.** Nothing hands a stage the output of another stage, so a command line tool and a queue can call the same function.
2. **A stage writes `run.json` once, as its last write to S3.** That write moves the run to the next stage.
3. **If that write does not happen, the stage runs again from its start,** also when its files are already stored.
4. **A stage works only on the run that `current.json` names.** A new run starts only when no run is active.
5. **A failure that a rerun cannot fix is written as the `failure` part.** The run then stays active, and the integration is blocked until someone clears it by hand. The first version has no command for that.

## The stages

### Start

Start is not a stage. It is the call that creates a run.

1. Check that the definition parses.
2. Read `current.json`. If a run is active, refuse.
3. Write `run.json` with the `input` and `batch` parts.
4. Name the run as active in `current.json`. If the file changed since step 2, refuse.

### Stage 1: Capture

Capture stores the files the sender provided, so that nothing later depends on the sender.

**Starts from:** one Parquet file per table of the definition, on the local disk. A file holds the table's own columns and one more, `_change`, which says `insert`, `update` or `delete` for each row. The rows are in the order the changes happened. A table without changes gets an empty file.

1. Read `run.json`. If the `capture` part is there, stop.
2. For each file, read the row count from its footer. The rows are not read.
3. Upload each file as it is.
4. Write the `capture` part.

**Leaves behind:** the capture files and the `capture` part.

**Changed from the POC:** Capture reads no source and adds no column. The POC's capture connected to the database or the API and wrote `_op`, `_key` and `_before` into every file. Those columns are for the SQL steps, and their values depend on the kind of input, so Prepare adds them. Capture is then the same for every kind of input.

### Stage 2: Prepare, for incremental updates

Prepare turns each captured row into the entity changes it stands for and appends them to the sync table. This is the version for incremental updates. A version for full captures, with hash and diff, comes later and replaces one step of it: how `_op` is filled.

**Starts from:** the capture files and the definition.

1. Read `run.json`. If the `prepare` part is there, stop. Refuse a definition in which a pipeline reads a second table.
2. Download the capture files and load each into DuckDB.
3. **Stage each table.** Add three columns the SQL steps carry through: `_op`, copied from `_change`; `_key`, the row's primary key; `_seq`, the row's position in its file.
4. **Run the SQL steps** of the definition. The result is one table per entity type and per link type.
5. **Turn each row into one change.** Its entity id is computed from the id namespace, the entity type and the row's own key. Its values are converted into properties. `insert` becomes a create, `update` an update, `delete` an archive. A link takes the kind of the row it comes from.
6. A row without a key, and a value that cannot be converted, are noted in the issues file. The row is still written without that value.
7. **Append the changes to the sync table.**
8. Write the `prepare` part.

**Leaves behind:** the run's rows in the sync table, the issues file, and the `prepare` part.

**Why a pipeline may read only one table:** an incremental capture holds only the rows that changed. A join of two tables would see only the changed rows of each and give wrong results without an error. A link needs no join: an entity id is computed from values, so a row that holds the key of another record is enough to name it.

**If it runs again:** it computes everything again. The sync table finds the run's rows already there and writes nothing.

### Stage 3: Send

Send applies the run's changes to the Graph.

**Starts from:** the run's rows in the sync table, and the batch limits in `run.json`.

1. Read `run.json`. If the `send` part is there, go to step 7.
2. Read the run's rows and build the request body of each.
3. **Sort and cut into batches.** Entity creates come first, then entity updates, link creates, link updates, link archives, entity archives. Inside a group the rows are in captured order. A batch holds one kind, at most 128 requests and 1.5 MB, and never two rows for the same entity. The same rows always give the same batches.
4. **Send each batch as one bulk request,** one after another.
5. **A batch the Graph refuses is sent again one entity at a time, each as an upsert.** A create that finds the entity is followed by a patch. An update that does not find it is followed by a create. An archive that does not find it counts as done. Anything else the Graph refuses is recorded as a failed entity, and Send goes on.
6. Write the `send` part: the counts and the failed entities.
7. Name the run as the last completed run in `current.json`. The next run can now start.

**Leaves behind:** the changes in the Graph, the `send` part, and the run as the last completed run.

**Nothing is absorbed silently.** Each upsert case means the Graph was not in the state the row expected. Send counts the three cases in the `send` part and logs each with the entity id. The counts add up to the number of rows of the run.

**"The Graph is not available" is not a refusal.** No answer, a timeout, and the statuses 429, 502, 503 and 504 stop Send with an error that says it can be run again. Nothing is recorded.

**If it runs again:** it starts from the first batch. Batches the Graph applied before are refused as existing and go through the one-by-one path. That is correct and slow, and it is accepted for the first version.

## The sync table

The sync table is the only thing Prepare hands to Send. A run adds rows and changes no existing row.

| Column                              | Content                                                     |
| ----------------------------------- | ----------------------------------------------------------- |
| `run_id`                            | The run that added the row                                  |
| `seq`                               | The position of the change's source row in its capture file |
| `op`                                | Create, update or archive, of an entity or of a link        |
| `entity_id`                         | The id of the entity or link                                |
| `entity_type`                       | The entity type or link type                                |
| `left_entity_id`, `right_entity_id` | The two ends of a link                                      |
| `properties`                        | The new values of the change                                |

- **Stored as Apache Iceberg,** partitioned by run. A run is one Parquet file, and reading a run opens only that file.
- **No catalog service.** Iceberg needs one place that says which metadata file is current. That place is a small file in the bucket, `sync/pointer.json`, written only if nobody else changed it.
- **A run's rows are in the table exactly once,** also after a retry. Each append stores the run id, and a second write of the same run is refused.
- **Two functions touch the storage:** write a run, read a run. The team has not chosen the storage for good, and a change of format stays inside one module.
- **The Iceberg crate is pinned to an unreleased commit,** because the released version would bring a second copy of `arrow` and `parquet` into the workspace.

## Limits of the first version

- An entity that is deleted and inserted again in the same run ends up archived, because all creates are sent before all archives.
- A row whose link target changes gets the new link, and the old link stays live. A delete row that no longer holds the link's columns does not archive the link.
- A run that failed for good blocks its integration until someone clears it by hand.
- A source that cannot tell an insert from an update is not supported.
- A run's rows are held in memory as one list.
- A value that becomes empty at the source is not removed from the entity.

`open-issues.md` has the options for each.

## The crate

A new crate, `ledger`, next to `definition` and `engine`. `engine` stays as it is. The module tree is the pipeline:

```text
ledger/src/
├── stage/                 the pipeline
│   ├── mod.rs             how every stage starts, ends and fails
│   ├── capture/           stage 1
│   ├── prepare/           stage 2
│   │   ├── incremental/   the version for incremental updates
│   │   ├── workspace/     DuckDB for one run
│   │   └── …              SQL steps, entity ids, properties, changes, issues
│   └── send/              stage 3: batches, requests, client, delivery
├── run/                   run.json, current.json, Start
├── sync_table/            the row, the pointer, write a run, read a run
└── storage/               one bucket: files, and small files with conditional writes
```

No stage calls another stage. Prepare and Send share only the sync table.

## The build plan

Eleven milestones, one pull request each. A line is a line of source without tests. "Reused" is the share of lines that exist in `engine` today.

| #   | Milestone                 | Lines     | Moved     | Adapted   | New       | Reused  | Needs       |
| --- | ------------------------- | --------- | --------- | --------- | --------- | ------- | ----------- |
| 1   | Crate and storage         | 316       | 51        | 237       | 28        | 91%     |             |
| 2   | Run state                 | 425       | 0         | 0         | 425       | 0%      | 1           |
| 3   | Stage frame and Capture   | 305       | 0         | 35        | 270       | 11%     | 1, 2        |
| 4   | Sync table                | 580       | 0         | 0         | 580       | 0%      | 1, 2        |
| 5   | Workspace                 | 690       | 298       | 389       | 3         | 100%    | 3           |
| 6   | SQL steps                 | 328       | 63        | 265       | 0         | 100%    | 5           |
| 7   | Ids and properties        | 705       | 681       | 20        | 4         | 99%     | 3           |
| 8   | Prepare, incremental      | 750       | 0         | 370       | 380       | 49%     | 1 to 7      |
| 9   | Graph requests and client | 371       | 72        | 240       | 59        | 84%     | 2, 3, 4     |
| 10  | Send                      | 440       | 0         | 40        | 400       | 9%      | 1 to 4, 9   |
| 11  | The whole pipeline        | 260       | 0         | 20        | 240       | 8%      | 2, 3, 8, 10 |
|     | **All**                   | **5,170** | **1,165** | **1,616** | **2,389** | **54%** |             |

- **Moved:** copied with only paths and imports changed. A reviewer can skip it.
- **Adapted:** existing logic with real changes.
- **New:** no counterpart in `engine`.

For comparison, `engine` has 6,547 lines by the same count. It reads sources, runs the SQL steps and plans single requests. It stores nothing in S3, tracks no run and sends nothing in bulk.

Milestones 1, 2 and 3 come first, in order. After them, three lines of work do not depend on each other: the sync table (4), the workspace and SQL steps (5, 6), and ids and properties (7).

```text
 1  Crate and storage                                               316 lines
    reused █████████░ 91%     moved 51 · adapted 237 · new 28
    Does:       one S3 bucket: upload and download a file, and write a small file only if nobody changed it
    In flow:    under every stage
    Closest to: the storage pull request for engine (hashintel/hash#10392), labs blob.rs

 2  Run state                                                       425 lines
    reused ░░░░░░░░░░ 0%      new 425
    Does:       run.json, current.json, and Start
    In flow:    before stage 1, and read by every stage
    Closest to: nothing in engine. Labs keeps this as journal events and an admission pointer

 3  Stage frame and Capture                                         305 lines
    reused █░░░░░░░░░ 11%     adapted 35 · new 270
    Does:       how every stage starts, ends and fails, and stage 1
    In flow:    stage 1
    Closest to: engine SourceCapture::open for the row count. The frame is new

 4  Sync table                                                      580 lines
    reused ░░░░░░░░░░ 0%      new 580
    Does:       the Iceberg table with its pointer: write a run, read a run
    In flow:    between stage 2 and stage 3
    Closest to: nothing in engine or labs. A spike showed the approach

 5  Workspace                                                       690 lines
    reused ██████████ 100%    moved 298 · adapted 389 · new 3
    Does:       DuckDB for one run, with access to files and the network switched off
    In flow:    inside stage 2
    Closest to: engine workspace, without its thread, cancelling, metrics, snapshots and error kinds

 6  SQL steps                                                       328 lines
    reused ██████████ 100%    moved 63 · adapted 265
    Does:       runs the SQL steps of entity and link pipelines
    In flow:    inside stage 2
    Closest to: engine prepare_pipeline and prepare_link_pipeline, without the content hash

 7  Ids and properties                                              705 lines
    reused ██████████ 99%     moved 681 · adapted 20 · new 4
    Does:       entity ids and link ids, and column values into properties
    In flow:    inside stage 2
    Closest to: engine entity_id and graph/property, moved as they are with their tests

 8  Prepare, incremental                                            750 lines
    reused █████░░░░░ 49%     adapted 370 · new 380
    Does:       stage 2: staging, the steps in order, rows into changes, the issues file
    In flow:    stage 2
    Closest to: engine stage_table and Planner::plan_entities, labs plan_candidate

 9  Graph requests and client                                       371 lines
    reused ████████░░ 84%     moved 72 · adapted 240 · new 59
    Does:       the create, patch and archive bodies, and the bulk and single routes
    In flow:    inside stage 3
    Closest to: engine graph/plan/request.rs and graph/client, labs create_batch_once

10  Send                                                            440 lines
    reused █░░░░░░░░░ 9%      adapted 40 · new 400
    Does:       stage 3: sort, cut batches, send in bulk, fall back to single upserts, record
    In flow:    stage 3
    Closest to: labs execute_create_batch_group and deliver_once, without turns, budgets and cursor

11  The whole pipeline                                              260 lines
    reused █░░░░░░░░░ 8%      adapted 20 · new 240
    Does:       hash-integrations ledger start | capture | prepare | send, and a run through all stages as a test
    In flow:    around all stages
    Closest to: the submit, status and cancel subcommands (hashintel/hash#10458)
```

### How a milestone is built and reviewed

- A pull request states its three numbers: moved, adapted, new.
- Moved code is committed first, as it was copied, with its tests. The changes come in a second commit, so a reviewer reads only the changes.
- Existing tests move unchanged with their code. They show that ids, property values and SQL results are the same as in `engine`.
- New code gets a few tests of what a stage promises: its result, a second run, and its failures. A helper is tested through the function that uses it.

## Decisions to review

1. **Capture only stores what it is given.** The sender provides one file per table and the `_change` column. The cost: reading sources needs its own service.
2. **A stage writes its status once, as its last write.** The cost: a stage that stops repeats all of its work, and Send starts again from the first batch.
3. **The sync table is Iceberg with its pointer in the bucket.** No catalog service. The cost: an unreleased crate pinned to a commit, and metadata files that accumulate.
4. **A row holds only the new values of its change, and its order is the position in the capture file.** The cost: the state of an entity at a point in time has to be merged from its rows.
5. **No joins between tables in incremental runs.** The cost: a definition that joins tables is refused until the version for full captures exists.
6. **A link takes the kind of its source row.** The cost: the two cases under "Limits".
7. **A refused batch is sent one entity at a time as upserts, and a refused entity is recorded.** The run completes. The cost: the Graph can lack an entity the sync table has, visible in `run.json`.
8. **A 500 from the Graph is a refusal, not "not available".** The Graph answers a link with a missing end with 500. The cost: if the Graph answers everything with 500, every entity is recorded as failed. Two changes to the Graph API would remove most of the fallback: bulk errors that name the failed entities, and statuses that tell a refused entity from a server fault.
9. **A failure that a rerun cannot fix blocks the integration.** The cost: someone has to clear it by hand.
10. **No orchestration crate and no service in the first version.** A command line tool calls the stages. The cost: the open pull requests for the orchestration interface and the service are not used yet.
11. **Left behind from `engine`:** the source readers, the workspace's thread with its command queue, cancelling, metrics, snapshots, disk limits, the kinds of DuckDB error, and the content hash.
12. **No local folder as storage.** Tests use an in-memory store and MinIO.

## Where the details are

|                     |                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| `plan.md`           | The design with its reasons, and every decision with its date                                         |
| `spec/`             | Per milestone: signatures, pseudo code, the existing code it ports with file and lines, and the tests |
| `spec/contracts.md` | What one milestone calls from another                                                                 |
| `background/`       | What labs and `engine` do today, and what the Graph and Iceberg spikes found                          |
| `open-issues.md`    | What the team has not decided, with the choice made for now                                           |
