# Ledger pipeline: architecture for review

The ledger pipeline is the next version of the ingestion pipeline. A sender hands it the rows that changed in a source. The pipeline turns them into entity changes, keeps every change in an append-only table called the sync table, and applies the changes to the Graph.

- **Status:** the design is agreed at this level. No stage is implemented.
- **Scope of the first version:** incremental updates only, started by hand from a command line tool. Reading source systems, full captures with hash and diff, and restore come later.

## The flow

```text
changed rows                Capture ──────► Prepare ──────► Send ──────► Graph API
(local Parquet files) ────►    │               │              │
                               ▼               ▼              │ reads
data in S3               capture files     sync table ────────┘
                                           issues file

status in S3   run.json      one per run: what the run works with, and what each stage finished
               current.json  one per integration: the active run and the last completed run
```

| Stage      | In one sentence                                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Start      | Fixes what the run works with and makes it the one active run of the integration.                                                  |
| 1. Capture | Puts the files with the changed rows into S3, so that nothing later depends on the sender.                                         |
| 2. Prepare | Turns the captured rows into entity changes and appends them to the sync table. It is the stage that depends on the kind of input. |
| 3. Send    | Applies the run's entity changes to the Graph, in batches.                                                                         |

## How a run is tracked

Every run has one status file, `runs/{run}/run.json`. It is split into parts. The first two parts are written when the run starts. Each stage then writes its own part when it has finished, and that part is how everyone else knows the stage is done.

| Part            | Written by                    | Holds                                                                                             |
| --------------- | ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `input`         | Start                         | The run id, the web, the connector, the actor, the definition, the namespace, the submission time |
| `batch`         | Start                         | The limits of one batch of Graph requests: 128 requests and 1.5 MB                                |
| `capture`       | Capture, when it has finished | For each source, the stored file and its row count                                                |
| `prepare`       | Prepare, when it has finished | The number of changes, and the issues file if there is one                                        |
| `send_progress` | Send, after each batch        | The number of batches the Graph has confirmed, and the counts so far                              |
| `send`          | Send, when it has finished    | The final counts: created, updated, archived                                                      |
| `failure`       | A stage that returns an error | The stage, the error code, and whether trying again can succeed                                   |

This is `run.json` after Capture and Prepare have finished:

```json
{
  "input": {
    "run": "…",
    "web": "…",
    "connector": "…",
    "actor": "…",
    "definition": "…",
    "namespace": "…",
    "submitted_at": "2026-07-22T10:00:00Z"
  },
  "batch": { "max_writes": 128, "max_bytes": 1500000 },
  "capture": {
    "sources": {
      "items": {
        "file": {
          "key": "…",
          "sha256": "…",
          "size": 2140,
          "format": "parquet"
        },
        "rows": 4
      }
    }
  },
  "prepare": { "rows": 5, "issues": { "key": "…" }, "issue_count": 1 },
  "send_progress": null,
  "send": null,
  "failure": null
}
```

Three rules follow from this:

- **A stage gets everything from `run.json`.** It is called with the run id, reads the file, and finds its input there. Nothing hands a stage the output of another stage. A command line tool and a queue can therefore call the same function.
- **A stage stores its result first and writes its part second.** If it stops in between, the part is missing, and the stage runs again.
- **Trying again means calling the stage again with the same run id.**

`current.json` is the second status file, one per integration. It names the active run and the last completed run. A new run starts only when no other run is active.

## The stages

### Start

Start is not a stage. It is the call that creates a run.

1. It reads `current.json`. If another run of the integration is active, it refuses.
2. It writes the first `run.json`, with the `input` and `batch` parts. From here on, nothing about the run's input can change.
3. It names the run as the active run in `current.json`.

**Changed from the POC:**

- A run is created by one function call. The POC admitted a run through a submission and the journal.
- Only one run of an integration exists at a time, and the next one starts only after it has finished.

### Stage 1: Capture

Capture takes the files the sender provided and stores them in S3. After Capture, a later stage or a retry never needs the sender again.

**Starts from:** one Parquet file per source, in a local folder. The definition says which file belongs to which source. A file holds the source's own columns and one extra column, `_change`, which says `insert`, `update` or `delete` for each row. The rows are in the order the changes happened.

**Steps:**

1. Read `run.json` to get the definition. If the `capture` part is already there, Capture has finished before, and there is nothing to do.
2. For each source of the definition, find its Parquet file in the local folder. If a file is missing or cannot be read, the run fails with an error that says trying again will not help.
3. Read how many rows the file has. This comes from the file's footer, so the rows are not read.
4. Upload the file to S3 exactly as it is. Its name in S3 is built from the SHA-256 of its content, so the same file is never uploaded twice.
5. Write the `capture` part of `run.json`: the time of the capture, and for each source where its file is stored and how many rows it has. Capture has now finished.

**Leaves behind:** one file per source in S3, and the `capture` part.

**Changed from the POC:**

- **Capture no longer reads a source.** The POC's capture connected to the database or the API. That moves to a separate data collection service.
- **Capture no longer changes the file.** The POC's capture added the columns `_op`, `_key` and `_before` to every file. The file is now stored as it was received. Those columns are added in Prepare, because their values depend on the kind of input. Stage 2 explains this.
- **A file holds only the changed rows,** each with `_change`. The POC captured the whole table.
- **The result is recorded in `run.json`.** The POC recorded one binding per source in the journal.

**If it runs again:** it reads the local files again. A file that is already in S3 is not uploaded a second time.

### Stage 2: Prepare, for incremental updates

Prepare turns each captured row into the entity changes it stands for, such as "create this entity with these properties", and appends them to the sync table.

Prepare is the stage that depends on the kind of input. This section describes Prepare for incremental updates, where every captured row already says whether it was inserted, updated or deleted. It is the only version in the first release. A version for full captures, hash and diff, comes later. It will share most of these steps and replace two of them: staging (step 2) and deciding the kind of change (step 6).

**Starts from:** the capture files in S3, which the `capture` part lists, and the definition.

**Steps:**

1. Read `run.json` to get the definition and the list of capture files. If the `prepare` part is already there, there is nothing to do.
2. **Stage the files.** Load each capture file into DuckDB and add three columns that the SQL pipelines rely on:
   - `_op`, which says what happened to the row. For incremental updates it is copied from `_change`. Any value other than `insert`, `update` or `delete` fails the run.
   - `_key`, the primary key of the row.
   - `_seq`, the position of the row in the file, so that the order of the changes is not lost.
3. **Run the SQL pipelines** of the definition. The result is one table for each entity type and each link type the definition writes. For incremental updates a pipeline may read only one source, because a join would see only the changed rows of the other source.
4. **Give every row its entity id.** The id is computed from the namespace, the entity type and the row's own id value. The same row always gets the same id, and nothing is looked up. A row without an id value is left out and noted in the issues file.
5. **Convert the values into properties,** using the mapping of the definition, for example text into a number or a date. A value that cannot be converted is left out and noted in the issues file. The rest of the row is kept.
6. **Turn each row into one change.** An `insert` row becomes a create, an `update` row an update, a `delete` row an archive. The changes are numbered in the order they were captured, and that number is the `order_id`. One entity can have several changes in a run, and they keep their order.
7. **Append the changes to the sync table,** and store the issues file if anything was noted.
8. Write the `prepare` part of `run.json`: how many changes the run has, and where the issues file is. Prepare has now finished.

**Leaves behind:** the run's rows in the sync table, an issues file if a row or a value could not be used, and the `prepare` part.

**Why staging is in Prepare:** the SQL pipelines need `_op` and `_key` on every row. In the POC, Capture added them. But what goes into `_op` depends on the kind of input. For a full capture, every row gets `snapshot`, and hash and diff later works out what changed. For incremental updates, a row gets `insert`, `update` or `delete`. That logic belongs to the stage that knows the kind of input, so staging moved from Capture to Prepare. Capture is now the same for every kind of input, and each version of Prepare stages the rows its own way.

**If it runs again:** it starts over from the capture files. How the rows of the first attempt are kept out of the sync table depends on how the table is stored, which is not decided.

### Stage 3: Send

Send applies the run's entity changes to the Graph.

**Starts from:** the run's rows in the sync table, and from `run.json` the batch limits, the submission time, and how many batches the Graph has already confirmed.

**Steps:**

1. Read `run.json`. If the `send` part is already there, only make sure the run is named as the last completed run, and stop.
2. **Read and sort** the run's changes. All entity creates come first, then entity updates, link creates, link updates, link archives and entity archives. Within each group, the changes keep the order they were captured in. This order makes sure both ends of a link exist before the link is created.
3. **Build the request** for each change:
   - A create carries the whole entity with its properties.
   - An update carries one "set this property" operation for each property of the change. Other properties of the entity are not touched.
   - An archive marks the entity as archived.
4. **Group the requests into batches.** A batch holds requests of one kind, at most 128 of them and at most 1.5 MB, and never two for the same entity. The sorting and the limits are fixed, so the same changes always give the same batches.
5. **Send the batches** one after another, starting after the ones the Graph has already confirmed. If the Graph cannot be reached or is overloaded, Send waits and tries the batch again, up to five times. A create for an entity that already exists counts as done.
6. **After each batch the Graph confirms,** save the number of confirmed batches and the counts so far in the `send_progress` part.
7. **After the last batch,** write the `send` part with the final counts, and name the run as the last completed run in `current.json`. The next run can now start.

**Leaves behind:** the changes in the Graph, the `send` part, and the run as the last completed run.

**Changed from the POC:**

- **Requests are built when they are sent.** The POC built every request body at plan time and stored them in the effect index.
- **Progress is one number, the count of confirmed batches.** The POC advanced a cursor for each write, inside turns with a budget, a lease and a lock.
- **There is no fallback from create to update.** The POC sent a create and, on a conflict, sent a patch. Now each change says whether it is a create or an update.
- **Batches are cut by fixed rules,** including a size limit in bytes. The POC cut them by count while sending.

**If it runs again:** it continues after the last confirmed batch. At most one batch is sent twice, which happens when Send stops between the Graph's answer and saving the count.

## The sync table

The sync table is the only thing Prepare hands to Send. A run adds rows and changes no existing row.

| Column                              | Content                                              |
| ----------------------------------- | ---------------------------------------------------- |
| `run_id`                            | The run that added the row                           |
| `order_id`                          | The position of the change in its run                |
| `op`                                | Create, update or archive, of an entity or of a link |
| `entity_id`                         | The id of the entity or link                         |
| `entity_type`                       | The entity type or link type                         |
| `left_entity_id`, `right_entity_id` | The two ends of a link                               |
| `properties`                        | The new values the change carries                    |

A row holds only the new values of its change. To get the state of an entity at some point in time, its rows up to that point are merged.

## Decisions to review

1. **Capture only stores what it is given.** The sender provides the files and the `_change` column. The cost: reading sources needs its own service.
2. **Prepare owns staging.** The columns the SQL pipelines need are added there, because their values depend on the kind of input. A later kind of input, such as a full capture, brings its own staging. The cost: a pipeline's SQL has to keep three internal columns, and a pipeline that reads more than one source is refused.
3. **The sync table is append-only and holds new values.** The cost: the state at a point in time has to be merged from the rows.
4. **Graph requests are not stored.** Send builds them from the rows. The cost: the same row always has to give the same request.
5. **Batches are the same on every attempt,** so progress is one number. The cost: a batch can be sent twice after a stop.
6. **A create that conflicts counts as done,** with no fallback to an update. The cost: the sender has to know whether a row is new or changed.
7. **One status file per run, and one run at a time.** The cost: a run has to finish before the next one starts.
8. **A stage is called with the run id and reads `run.json` itself,** so a command line tool and a queue call the same function.
9. **The crate builds on `engine`.** The cost: `engine`'s storage module is still in an open pull request.
