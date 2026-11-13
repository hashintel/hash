# Simplifying the integrations pipeline

The planned pipeline keeps two full copies of every integration's previous state between runs:

- a DuckDB snapshot with the content hashes;
- a stored "desired projection" holding the exact Graph request for every entity ever written.

Delivery works from an effect index into that projection. Separate apply, restore and reconcile work replays it.

The proposed pipeline keeps only the content hashes. A run has four stages, and three of them end in a checkpoint in S3. Every retry starts over from the last checkpoint, and the workflow engine stores no data. The projection, the effect index, and the restore and reconcile machinery are no longer needed. By the tickets' own estimates, that is about 10,000 fewer planned lines, including tests.

This document records what changes, why it is safe, and what to watch for. It is a proposal: nothing here is implemented, and no ticket has changed yet.

## Documents

Both pages are private Claude artifacts until shared.

- [Integration pipeline map](https://claude.ai/artifact/YKNCkNoiLLcvAoRzzxpJSo): the planned design, stage by stage, as labs implements it at `40a8d14` and the Integrations V1 tickets plan it for the monorepo.
- [Simplified integration pipeline](https://claude.ai/artifact/M1EncM83AGjix7VQvjRPdN): the proposed design. Clicking a step or checkpoint shows its input and output.

## Terms

- **Run N:** the run being described. **Run N-1** is the last run that committed.
- **Content hash:** an md5 of the mapped columns of a sink row, with text trimmed and blanks as null (labs `graph/hash.rs`). Provenance is not part of it.
- **Desired projection:** labs' stored record of every Graph object an integration wants, with the exact request bytes for each (`graph/artifacts.rs`). Labs calls the previous run's projection `A` and the current run's plan `G`.
- **Checkpoint:** a folder in S3 that a stage writes when it finishes, ending with a `_done.json` file that is written last.

## The planned design

The [pipeline map](https://claude.ai/artifact/YKNCkNoiLLcvAoRzzxpJSo) has ten stages. In short:

1. Capture each source to Parquet and store it in S3 (BE-1085, BE-933).
2. Load it into DuckDB and run the SQL steps (BE-930, BE-931).
3. Restore run N-1's whole DuckDB file, and hash every sink row (BE-1108).
4. Diff the hashes with a `FULL OUTER JOIN` (BE-1108).
5. Turn every sink row into request JSON, changed or not (BE-1106, BE-1107, BE-1123).
6. Upload the whole DuckDB file as snapshot N.
7. Load projection N-1 in full and merge it with the plan (`finalize_projection_plan`, BE-1116).
8. Write projection N: one pack with every object's bytes, pages of 256 objects, and an index of at most 4 MiB (BE-1116).
9. Write the effect index, whose pages point into the pack, and the work manifest (BE-1117, BE-1137).
10. Deliver in budgeted turns, with a cursor in the shard journal (BE-1118 to BE-1120). Restore and reconcile are separate work over the projection (BE-1154, BE-1155).

Stages 6 to 10 are the part this proposal removes or replaces.

## The proposed design

A run has seven steps in four stages. A stage either finishes and pushes its result to S3 as a checkpoint, or pushes nothing. When any step in a stage fails, the whole stage starts over from the checkpoint before it.

| Stage | Steps | Checkpoint pushed to S3 |
| --- | --- | --- |
| Capture | 1 Capture | 1: `capture/{source}.parquet` |
| Hash and diff | 2 Stage + SQL, 3 Hash, 4 Diff | 2: `diff/{sink}/hashes.parquet`, `diff/{sink}/changes.parquet` |
| Plan writes | 5 Plan requests | 3: `plan/writes.parquet`, `plan/issues.parquet` |
| Send and commit | 6 Deliver, 7 Commit | none; commit updates `current.json` |

How each stage behaves:

- **On success,** a stage hands its result straight to the next stage. The next stage keeps using the files already on the worker's disk, so nothing is downloaded again.
- **After a restart,** possibly on another worker, the next stage loads the checkpoint from S3. A stage first checks whether its own `_done.json` exists, and skips itself if it does.
- **The workflow engine** (Restate or DBOS, behind the run interface in hashintel/hash#10410) runs the stages in order. It restarts the run after a crash, keeps one run active per integration, and handles cancel. It holds no data, only where a checkpoint is.

One small file per integration, `current.json`, records which run is committed and which runs started sending but never committed:

```text
tenants/{web}/integrations/{integration}/
  current.json                  { "committed": "N-1", "sending": ["N"] }
  runs/{run}/
    capture/{source}.parquet
    capture/_done.json          checkpoint 1
    diff/{sink}/hashes.parquet  every entity this sink has written, live or archived
    diff/{sink}/changes.parquet only rows that changed since the committed run
    diff/_done.json             checkpoint 2
    plan/writes.parquet         one row per Graph request body, in send order and batches
    plan/issues.parquet
    plan/_done.json             checkpoint 3
    send/rejected.parquet       only if the Graph refused writes
```

The diff in step 4 compares this run's hashes with the hashes in the committed run's checkpoint 2. Every run keeps its three checkpoints, so any run can be computed again from any of them. The [simplified pipeline page](https://claude.ai/artifact/M1EncM83AGjix7VQvjRPdN) has struct sketches for each stage's input and checkpoint.

### What is new

- Only changed rows become request JSON. Today every row is planned on every run, and unchanged ones are discarded at stage 7.
- Parquet files replace the DuckDB snapshot. They do not depend on DuckDB's storage format, and they leave out the workspace's intermediate tables.
- `writes.parquet` replaces the effect index and the pack. It holds the request bodies directly, already in send order and cut into batches.
- Restore and reconcile become ordinary runs:
  - **Restore to run K:** run with K's checkpoint 1 and K's definition, and diff against the committed run.
  - **Reconcile:** run in reconcile mode, which resends every live row and archives every archived entity again.
- A run that dies while sending is repaired by the next run. Its ID stays in `sending`, and the next run resends every entity in that run's `writes.parquet`, with current values, or archives it.

## Why the stored projection is not needed

Labs stores the projection because of `loadedAt`:

- **In labs, every write would change something.** Every request body carries the run's capture time. Labs also writes it into each property's provenance (`row_to_entity_op` in `graph/planner.rs`, `source_json` in `graph/mod.rs`). Resending an unchanged entity would therefore change its property metadata, and the Graph would create a new edition. Labs avoids that by planning every row, then copying run N-1's exact bytes for every row the diff marked unchanged. Projection N is that merged result, and the effect index points into it.
- **The monorepo planner writes no property provenance.** Only the edition provenance carries `loadedAt`; property metadata holds just the data type (`engine/src/graph/property/mod.rs` on `main`, from BE-1123).
- **The Graph skips a patch that changes nothing.** It checks properties, property metadata, entity types, draft, archived and confidence, and does not compare edition provenance (`prepare_entity_patch` in `libs/@local/graph/postgres-store/src/store/postgres/knowledge/entity/patch.rs`, around line 414).

So in the monorepo, resending an unchanged entity costs one request and writes nothing. The content hash already decides what changed. Exact bytes for unchanged objects protect against nothing, and the projection that holds them can go. So can the comparison against it, and the effect index that points into it.

The other jobs the projection does in labs have simpler replacements:

| Job in labs | Replacement |
| --- | --- |
| Freeze the requests a retry sends | `writes.parquet` in checkpoint 3 |
| Archive objects that a removed sink or link pipeline left behind | Their entity IDs are in the committed run's `hashes.parquet`; step 4 archives IDs that are no longer wanted |
| Restore: resend every object of the previous state | A run from an earlier run's captures and definition |
| Reconcile: resend every object, including archives | Reconcile mode: every live row, plus the archived IDs kept in `hashes.parquet` |

## Why this works

The design relies on four facts, each checked in the code:

1. Entity IDs are deterministic: UUID v5 of namespace, versioned entity type and source ID (`engine/src/entity_id.rs`).
2. The monorepo Graph client creates with that ID and patches when the entity exists. Archiving an entity the Graph doesn't have succeeds (`engine/src/graph/client/mod.rs`, BE-1109).
3. The Graph ignores a patch that changes nothing (see above).
4. A stage reads only its checkpoint inputs, so running it again gives the same result.

Together these make every stage safe to repeat, and that is all the retry rule needs.

| What happens | What the system does |
| --- | --- |
| A worker crashes inside a stage | The engine restarts the run. Finished stages are skipped, and the interrupted stage starts over from its checkpoint. |
| The Graph is down or rate limits | The send stage fails as retryable, and starts over from checkpoint 3. |
| The Graph refuses a write because of its data | It goes to `rejected.parquet`. The run still commits, and the write is retried once its hash, the definition or the engine version changes. |
| A run fails for good while sending | `current.json` still names run N-1, and N stays in `sending`. The next run resends N's entities. |

The design uses established patterns:

- **Layered, immutable data files:** raw input, then cleaned and diffed data, then output ready to send. Data lakehouses call these bronze, silver and gold. Labs already calls captures "bronze".
- **A marker file written last** to say a folder is complete, like Hadoop's and Spark's `_SUCCESS` file.
- **One small file updated with a conditional write to commit,** the way Git moves a branch ref and Delta Lake and Iceberg commit a table version.
- **Durable execution with idempotent steps,** the model of Restate, DBOS and Temporal.

## Gotchas

An independent review of the first draft found most of these.

- **Entity IDs include the versioned type URL.** A type version bump gives every entity a new ID. Hashes and diffs are therefore keyed by entity ID, so the old IDs show up as gone and are archived. Those archives are expected, so the mass-archive guard must not count them.
- **The entity ID must be derived in one place.** The ID is a UUID v5 over text, and DuckDB and the planner's Rust code render a source ID that is not text differently: a decimal `8030.00` is `8030.00` in a DuckDB cast and `8030` in Rust. Step 3 therefore reads the ID column into Rust, derives the ID with `derive_entity_id`, and writes it back as a column. The diff, the planner and the archives all use that column. Labs derives upsert IDs in Rust and archive IDs from DuckDB text, so its archives of numeric IDs target the wrong entity.
- **Patches only ever add properties today.** The planner sends one `PropertyPatch::Add` per property (`engine/src/graph/plan/request.rs` on `main`), so a value that becomes empty, or a property dropped from the mapping, stays in the Graph. Labs has the same gap. The fix is one replace of the whole property object. Confirm with the Graph team that a replace at the root path works and is still a no-op when nothing changed. This is worth fixing now, whatever happens to this proposal.
- **Bulk requests are all or nothing.** `POST /entities/bulk` and `PATCH /entities/bulk` each run in one database transaction, so one bad entity fails its batch. The send stage retries a refused batch one write at a time.
- **Graph status codes need care.**
  - Only errors about one write's own data count as rejections. Update races and conflicts come back as 4xx statuses and must be retried.
  - A patch that finds no entity, for example after a Graph wipe, should fall back to its create. So `writes.parquet` stores both bodies for every upsert.
- **Requests have a size limit.** The Graph's entity endpoints use axum's default 2 MB body limit. Batches must be cut by bytes as well as by count. The proposal uses at most 128 writes and about 1.5 MB.
- **`current.json` must be written conditionally.** Commit writes only if the file is unchanged since send marked the run as sending, and it clears every `sending` entry the run handled. Both writes must treat "already done" as success, because a response can be lost.
- **A worker that is presumed dead can still finish a batch late.** The send stage checks that its run is still the newest in `sending` before each batch. A request already in flight can still land; a reconcile repairs that rare case.
- **Partial sources.** A key that must be resent but was not in this run's partial read must stay marked for resending, or it drops out.
- **Restore is no longer byte-exact.** It plans the old data again with the old definition, instead of resending stored bytes.
- **Per-property provenance must stay out.** If `loadedAt` ever goes into property metadata, every resend creates a new edition, and the reason for the projection comes back.
- **The legacy sync path.** BE-1111, BE-1115 and parts of BE-1108 and BE-1112 port labs' older direct sync, with windowed `_upsert` tables and pending links. Nothing calls `batch_sync::run` at `40a8d14`. Those tickets should be closed or rescoped whichever design is chosen.

## What it removes

These are the tickets' own estimates, including tests. Most of this code is planned and has not been written.

| Ticket | Scope | Planned lines | Proposed lines |
| --- | --- | ---: | ---: |
| BE-1116 | Publish desired projections | 1,200 | 0 |
| BE-1117 | Effect indexes and request packs | 1,250 | 400 |
| BE-1118 | Load and verify planned work | 1,100 | 250 |
| BE-1119 | Deliver in budgeted turns | 1,200 | 400 |
| BE-1120 | Delivery progress in the shard journal | 1,100 | 0 |
| BE-1153 | Apply a run's plan | 1,000 | 400 |
| BE-1154 | Restore | 750 | 200 |
| BE-1155 | Reconcile | 750 | 50 |
| BE-1111 | Windowed upserts (legacy) | 900 | 0 |
| BE-1112 | Link diff and pending links | 700 | 300 |
| BE-1115 | Flush pending links (legacy) | 650 | 0 |
| BE-1108 | Entity diff, keyed by entity ID | 900 | 950 |
| BE-1114, BE-1110 | Fair scheduling, per-class rates | 1,525 | deferred |
| **Total** | | **13,025** | **about 2,950** |

Two smaller changes:

- About 12,000 lines of labs code no longer need porting: `graph/artifacts.rs`, `effects.rs`, `executor.rs`, `apply.rs`, `restore.rs`, `reconcile.rs` and the `throttle` modules.
- The state version and work manifest records in hashintel/hash#10453 (BE-1137, about 750 lines) would become the much smaller `current.json` and `_done.json` files.

Unchanged:

- capture (BE-933, BE-1085);
- the DuckDB engine (BE-930, BE-931);
- the planner from rows to Graph operations (BE-1106, BE-1107, BE-1123);
- the Graph client (BE-1109, BE-1113);
- the run interface (BE-1131, BE-1132).

## Open decisions

- **Type version bumps.** They recreate every entity under a new ID and archive the old ones. That is today's behaviour too. The alternative is deriving IDs from the base URL, which would change IDs already in the Graph.
- **Roll forward or restore immediately.** After a run dies while sending, the Graph holds a mix of old and new values until the next run, or until a restore run.
- **Fair scheduling.** Should fair scheduling across integrations (BE-1114, BE-1110) wait until one integration starves others? The shared token bucket in `CoordinationStore` already caps the total Graph rate.
- **Retention.** How many runs keep their checkpoints (BE-944).
- **The send-stage cursor.** A restarted send stage resends everything from checkpoint 3. A million changed writes at the default 500 requests per second take about half an hour to resend. A progress counter can be added later if that matters.
- **What the config hash covers.** The content hash covers only the mapped column values. Anything else that shapes a request must be in the per-sink `config_hash`, or a change to it is never sent. Not urgent: a missed input leaves stale values in the Graph, and a hash version bump resends every row.
  - Labs hashes the sink's entity type, ID column, namespace, property mappings and provenance settings (`graph/hash.rs`), and stores the result in `_state/meta`. It leaves out the unit maps, so a corrected unit map never reaches the Graph.
  - The monorepo has the content hash (`_content_hash`, BE-931) and no config hash yet. BE-1108 plans one without listing its inputs.
  - Inputs to decide: the sink's mapping, the unit maps its measures use, and for links the link type, endpoint types and columns. Namespace, web and type version need no entry, because they change the entity ID.

## Future: sources that send only changes

The first version reads every source in full on every run. A later version will receive only the rows that changed (BE-1033). This is not designed yet. What is known today:

- **Restore can no longer recompute a run from its capture,** because the capture holds only that run's changed rows. The old values come from the stored changes instead.
- **The lookup walks backwards from the target run, not from the current one.** `changes.parquet` holds the new value of each changed row, not the value it replaced. To restore to run 2 from run 6, compare the two hash tables to find the entities that differ. For each one, read the most recent `changes.parquet` at or before run 2 that contains it. Runs 3 to 6 are not read.
- **The hash table is built from the previous one.** A run's hash table becomes the previous table with the run's changes applied, instead of a table computed from the capture.
- **Deletes must come from the source.** A row missing from the capture no longer means the row was deleted, so the source has to report deletes, and the empty-source and mass-archive guards change meaning.
- **Retention is coupled across runs.** A run's changes must be kept for as long as any retained run still depends on them. A periodic full snapshot of the sink rows would bound how far back the walk goes.
- **A `changed_in` column in the hash table** (the run that last changed the entity) turns the walk into one exact lookup per entity.

What the first version must keep for this to stay possible: `changes.parquet` holds the full mapped row for every changed entity, and the hash table is one file per run.

## Sources

- Labs `pocs/integrations_rs/src` at `40a8d14`: `orchestrator/planning.rs`, `orchestrator/worker_dispatch.rs`, `engine/candidate.rs`, `engine/source_capture.rs`, `graph/sink.rs`, `graph/hash.rs`, `graph/planner.rs`, `graph/artifacts.rs`, `graph/apply.rs`, `graph/restore.rs`, `graph/executor.rs`, `graph/state_meta.rs`, `graph/mod.rs`.
- Monorepo `main`: `libs/@local/integrations/engine/src/{entity_id.rs, graph/plan/request.rs, graph/property/mod.rs, graph/client/mod.rs}`, `libs/@local/graph/api/src/rest/legacy/entity/mod.rs`, `libs/@local/graph/postgres-store/src/store/postgres/knowledge/entity/{patch.rs, mod.rs}`.
- Branches: this branch (`engine/src/storage`, BE-933), hashintel/hash#10410 (the run interface), hashintel/hash#10453 (state version and work manifest records).
- Linear project Integrations V1: BE-933, BE-1108, BE-1110 to BE-1120, BE-1123, BE-1132, BE-1137, BE-1151 to BE-1155.
