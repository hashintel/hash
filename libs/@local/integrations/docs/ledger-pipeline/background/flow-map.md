# Flow map: what labs and `engine` do today

Step 1 of `../plan.md`. Agreed by Paul on 2026-11-19 as a correct picture of the existing code.

What a source row goes through today, in labs and in `engine`. Facts only, read from the code on 2026-11-19. Two readers traced the paths, and a sample of their claims was checked a second time against the code. Labs paths are relative to `labs/pocs/integrations_rs/src`, `engine` paths to `libs/@local/integrations/engine/src`. Line counts are code without tests and are approximate.

```text
source ─► capture file ─► DuckDB table ─► SQL steps ─► one table per ─► entity id ─► kind of ─► request ─► sorted ─► sent
          (Parquet)       (staged)                     entity type      properties   change     bodies     writes
             1               2               3                             4, 5         6          7          8        9
```

Both code bases follow this path. `engine` is the port of the row logic of labs, without hash and diff, without bulk sending and without anything that tracks a run.

## 1. The capture file

Each source is read once and written to one Parquet file.

- **Labs** reads the source into DuckDB and adds three columns in front of the source's own: `_op`, always the text `snapshot`; `_key`, the primary key as JSON text; `_before`, always null. The file is uploaded under the SHA-256 of its content and tied to the run by a journal event. A retry uses the stored file. `capture_sources` (`engine/source_capture.rs`), `materialize` (`snapshot.rs`). About 350 lines without the connectors.
- **`engine`** writes the source's columns and adds nothing. The file stays on the local disk; a retry reopens it. `SourceReader::capture_sources` (`sources/mod.rs`), `SourceCapture` (`capture.rs`). `SourceCapture::open` reads the row count from the file's footer, and `copy_from` copies a local Parquet file. `capture.rs` has 154 lines. The readers for SQL, Postgres and REST, with secrets and the HTTP client, have about 1,750.

## 2. Staging into DuckDB

The file becomes a table that the SQL steps can read.

- **Labs** loads the file as it is, because the columns are already in it. `hydrate_captured_source` (`engine/candidate.rs`), about 50 lines. The DuckDB file it loads into is a copy of the previous run's file, so the state of earlier runs is present.
- **`engine`** loads the file and then builds a second table with `_op = 'snapshot'` and `_key` in front. A source column named `_op`, `_key` or `_content_hash` is refused. `Workspace::load_capture`, `Workspace::stage_table` (`workspace/connection/staging.rs`, 196 lines). It has no `_before`.
- Both can check a staged table: minimum and maximum row count, columns that must not be empty, columns that must be unique. In `engine` the function that stages all sources never passes any checks.

## 3. SQL steps

The pipelines of the definition run in dependency order. Each SQL step reads the table before it under the name `input` and writes a new table. A sink step marks the table that becomes entities of one type. A checkpoint step keeps a copy under a name, which link pipelines and later pipelines read.

- **Labs:** `plan_candidate`, `plan_source_pipeline` (`engine/candidate.rs`), `run_pipeline` (`steps.rs`), `sort_pipelines` (`engine/topology.rs`). About 550 lines. After each SQL step the output must still have `_op`, `_key` and `_before`.
- **`engine`:** `Workspace::prepare_pipeline`, `Workspace::prepare_link_pipeline` (`workspace/connection/pipeline.rs`, 305 lines). After each SQL step `_op` and `_key` must still be there. A sink step adds `_content_hash`, an MD5 over the columns its properties read.
- In both, the SQL steps of a link pipeline skip the check for the internal columns.
- `engine` runs every query inside a locked-down DuckDB: a single `SELECT`, no file or network access, limits on memory and disk, and its own thread that takes one command at a time. This is `workspace/`, about 2,600 lines with its error types, metrics, snapshot and cancellation.

## 4. Entity id and link id

The same rule in both, with a test that pins it to the same recorded values.

- The id is a UUID v5 of the text `{namespace}::{entity type}::{source id}` under one fixed namespace UUID. The source id is the value of the sink's `entityId` column. Nothing is looked up.
- A link id uses the link type and the text `{left type}::{left id}::{right type}::{right id}`, so the direction matters.
- **Labs:** `deterministic_uuid` (`graph/uuid.rs`), about 100 lines with its callers. **`engine`:** `derive_entity_id` (`entity_id.rs`, 24 lines), `EntityUpsert::new`, `LinkUpsert::new` (`graph/mod.rs`).
- A row without a source id is skipped. `engine` reports it as `PlanIssue::MissingSourceId`.

## 5. Property conversion

Each property of the definition names a column and, if needed, a conversion: date, time, boolean, number, integer, year, trim, or a measure with a unit. Text is trimmed, and an empty value is left out.

- **Labs:** `row_to_entity_op` (`graph/planner.rs`), `resolve_audited` (`graph/accessor.rs`), `coerce.rs`. About 400 lines. A value that cannot be converted is left out. The record of it is built and then dropped, so nothing is stored. Each property carries its own provenance.
- **`engine`:** `SinkRow::resolve` (`graph/property/`, 653 lines). A value that cannot be converted is left out and returned as a `ConversionFailure`, which the planner reports as `PlanIssue::Property`. The rest of the row is written. The request snapshot shows no provenance per property.

## 6. Deciding the kind of change

Neither code base takes insert, update or delete from the row.

- **Labs** finds the kind by comparison. For each sink it writes the id and the content hash of every row, joins them with the same table of the previous run, and labels each id `insert`, `update`, `unchanged` or `delete`. Unchanged rows are not sent, and ids that are gone become archives. A guard stops a run that would archive more than half of the stored rows. A second comparison against the stored request bodies of the last applied run follows. `prepare_entity_diff`, `plan_entity_sink` (`graph/sink.rs`), `graph/hash.rs`, `graph/link_pipeline.rs`, `finalize_projection_plan` (`graph/planner.rs`). Over 1,500 lines.
- The only place labs reads `_op` is a check that fails the whole plan when a row says `delete`. `_before` is never read. The change-stream code in labs (`connectors/cdc.rs`, `engine/event_table.rs`, `engine/event_store.rs`) has no caller.
- **`engine`** does not decide. `_op` is always `snapshot`, and nothing reads `_op`, `_key` or `_content_hash` after staging. Every row becomes an upsert. The archive operations exist as types and no code creates one.

## 7. Building the request bodies

Both build the bodies while planning and store them. Neither builds them when sending.

- An upsert stores three bodies in one JSON payload: a create, a patch and an archive. The create holds the whole entity. The patch holds one `add` operation per property and `archived: false`, so it never removes a property and it makes an archived entity live again.
- **Labs:** `plan_entity_upsert`, `plan_link_upsert` (`graph/planner.rs`), body builders in `graph/client.rs`. About 300 lines.
- **`engine`:** `PlannedWrite`, `Payload` (`graph/plan/mod.rs`), `Delivery` (`graph/plan/request.rs`). 673 lines with the planner. The keys of every object are sorted, so the same row always gives the same bytes.

## 8. Order of writes

The same in both: entity upserts, link upserts, link archives, entity archives, and inside each group by entity id. Two writes to the same entity fail the plan.

- **Labs:** `GraphPlanV1::finish` (`graph/planner.rs`), `GraphOperationV1::order` (`graph/effects.rs`). **`engine`:** `GraphPlan::finish` (`graph/plan/mod.rs`), `OperationKind` (`graph/mod.rs`).

## 9. Sending

- **Labs** sends upserts as bulk creates of up to 128, several requests at once, in turns with a request budget and a cursor. `execute_permitted_turn`, `execute_create_batch_group`, `deliver_once`, `classify` (`graph/executor.rs`, about 1,080 lines on this path), `create_batch_once` (`graph/client.rs`).
  - A bulk create refused with a conflict: every write of the batch is sent alone, patch first, then a create if the patch gets a 404.
  - A bulk create refused with another permanent error: every write is sent alone, create first, then a patch on a conflict.
  - A bulk create refused with 429 or 5xx: the batch is not split. The turn ends and the batch is sent again later.
  - The first write that fails for good ends the run.
  - A conflict is a 409, or a create whose answer contains `duplicate key` or `ALREADY_EXISTS`.
- **`engine`** sends one write at a time: a create, and a patch when the create gets a 409. An archive that gets a 404 counts as done. It has no bulk request, no retry and no fallback. `GraphClient::send` (`graph/client/mod.rs`, 180 lines).
- Neither uses `PATCH /entities/bulk`.

## Around the row

- **What connects the steps.** Labs: `RunPlanner::build_candidate` (`orchestrator/planning.rs`) and `plan_candidate`. `engine`: no function. One integration test, `tests/integrations/graph/aviation`, calls staging, planning and sending in a row.
- **What is recorded about a run.** Labs: events in an append-only journal per shard, folded into a view of each run and each integration. About 20,000 lines of orchestration plus a second crate, `crates/durable-kernel`, with 8,300. `engine`: nothing.
- **One run at a time.** Labs enforces it twice: a pointer object per integration written with compare-and-swap (`orchestrator/submission.rs`), and a check when the journal is folded. `engine`: nothing.
- **Object storage.** Labs: `ArtifactStore` (`blob.rs`, 2,638 lines) over the `object_store` crate. It publishes a file under its SHA-256, writes small JSON documents with "create if absent" and "replace if the version matches", and reads through a local cache. `engine`: local files only.
- **Keys in labs** are built from content hashes. No key of a run's data holds the run id.

## Work in review that `main` does not have

The issues of the project "Integrations V1" that are ready for review on Linear, read on 2026-11-19 with their pull requests. All port parts of labs. None is merged.

- **Object storage** (BE-933, hashintel/hash#10392, about 600 lines and 467 of tests). Adds `engine/src/storage`: `ArtifactStorage` over the `object_store` crate, for S3 and for a local directory.
  - `publish` stores a file under the SHA-256 of its content and uploads nothing when it is already there.
  - `materialize` downloads a file and checks it against its reference.
  - `bind` and `bound` write and read a small JSON object with "create if absent". They tie a capture to a run.
  - `ArtifactRef` is the stored reference: key, SHA-256, size, format.
  - `ArtifactNamespace` builds the keys: `tenants/{web}/integrations/{hash}/…`.
  - It has no "replace if the version matches", no list and no delete. Its tests run against a MinIO container.
- **Records of a run** (BE-935 with BE-1137, hashintel/hash#10453, 315 lines and 431 of tests). Adds state version and work manifest records for apply, restore and reconcile runs, as labs has them. They point at stored request bodies.
- **Service and command line** (BE-1136, hashintel/hash#10440; BE-1138, hashintel/hash#10458, a draft). `submit`, `status` and `cancel` in `apps/hash-integrations`, on top of the orchestration interface.
- **Orchestration** (BE-958, BE-1131, BE-1132; hashintel/hash#10402 and hashintel/hash#10410, a new crate `orchestration` of about 900 lines and 700 of tests). A run is a function that asks for its steps by name. Each finished step is recorded with its output, and a run that is executed again skips the recorded steps. The interface also has: one active run per admission key, retries with a delay, cancel, status without a worker, and a shared token bucket for the Graph rate limit. Backends on DBOS (BE-960) and on `durable-kernel` (BE-959) are separate issues.
- **FlightAware definition** (BE-938, hashintel/hash#10406). Two example definitions in the new format, with a pipeline test.

One issue in progress belongs here: BE-1151 adds the function that runs staging, the pipelines and planning in order for a whole definition, which the flow map found missing.

## What the new design needs and neither has

- A kind of change taken from the row (step 6).
- A table of entity changes between planning and sending. Both go from rows straight to stored request bodies.
- Request bodies built when sending.
- Several changes to one entity in one run. Both refuse a second write to an entity.
- A record of the entity that made a batch fail. Labs stops the run at the first one.
- One status file per run.

## One row, end to end

The aircraft `SE-XXX` from `definition/examples/aviation.yaml`, as `engine`'s tests pin it.

1. Source row: `TAIL='SE-XXX', MODEL='DC-3', FIRST_FLIGHT='17.12.1935', EMPTY_MASS='8030', MASS_UNIT='KG', HOME_BASE='ESSA'`, primary key `TAIL`.
2. Staged: the same columns with `_op='snapshot'` and `_key='{"TAIL":"SE-XXX"}'` in front.
3. The sink table adds `_content_hash`. A checkpoint keeps the staged table for the link pipeline.
4. Entity id: UUID v5 of `aviation::https://example.com/@demo/types/entity-type/aircraft/v/1::SE-XXX`, which is `468da978-f2fd-52d7-ad32-e319a155c918`, in the run's web.
5. Properties: `model` is `"DC-3"`. `first-flight` is `"1935-12-17"`, converted from the German date form. `empty-mass` is `8030.0` with the data type `kilogram`, from the unit `KG`.
6. Kind: an upsert, as for every row.
7. Payload: a create with the three properties, a patch with three `add` operations, and an archive.
8. Order: this entity, then the other aircraft, then the link from `SE-XXX` to the airfield `ESSA`.
9. Sent as `POST /entities`. Sent a second time, the create gets a 409 and the patch follows.
