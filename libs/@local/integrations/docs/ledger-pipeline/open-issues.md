# Ledger pipeline: open issues

Questions the high-level spec leaves unanswered. Each entry names the stage that has to answer it.

## Open

### Prepare retry appends the same rows twice

**Stage:** Prepare, and the physical format of the sync table.

The sync table is append-only. If Prepare writes some rows, stops, and runs again, the second attempt appends rows the first attempt already wrote. Send then reads each of those changes twice.

A solution needs one of these properties:

- A run's rows become visible in one atomic step, so a stopped attempt leaves nothing behind.
- The files of a run have names fixed by the run and the row order, so a retry replaces the earlier files.
- Readers drop duplicate rows by `run_id` and the row's position in the run.

### What happens to a write the Graph refuses

**Stage:** Send and record.

The Graph can refuse a write for a reason that a retry does not fix, for example a property value that fails type validation. The sync table then holds a change that the Graph does not have.

The previous refactor wrote each refused write to `rejected.parquet`, counted it in `SendCounts.rejected`, and completed the run. It also skipped a link when one of its endpoints was refused in the same run.

The spec has to say whether a refused write stops the run, where the refusal is recorded, and whether a later run sends the change again.

### Capture once a data collection service exists

**Stage:** Capture.

A separate data collection service will later read the sources. It will coordinate the collection and push the data to this pipeline (Paul, 2026-11-17). The current work covers the pipeline only.

**Chosen for now:** Capture supports incremental updates only (Paul, 2026-11-17). It reads no source system. The CLI is given one local Parquet file of changed rows per source. Capture copies each file to S3 with the existing `SourceCapture::copy_from` and writes the capture time and the files to `run.json` once.

**Deferred:**

- **Reading source systems.** The existing readers for SQL, PostgreSQL and REST sources each read a whole source. They belong to data collection.
- **Full dumps.** Hash and diff and initial sync need a full capture. Both are later variants of Prepare.
- **Reuse of finished sources on retry.** The previous refactor wrote a binding file per source (`runs/{run}/capture/{source}.{fingerprint}.json`) so that a retry skipped the sources already stored. The first version has no bindings.
- **Captures taken from an earlier run.** `CaptureOutput.adopted_from` exists for restore and reconcile.
- **A manifest for several input kinds.** The earlier draft of this stage described full dumps, partial updates, cursor ranges and a way to tell an omitted field from a null one. None of it is in the first version.

**To answer when the service is designed:**

- What the service pushes: the file format and the row shape. This depends on "What a row of the incremental capture holds".
- Who creates the run and pins the definition: the service or the pipeline.
- What happens to data that arrives while a run is active. Runs are strictly sequential, so the data has to wait somewhere.
- Whether the source readers and the secret lookup move out of the pipeline crate into the service.
- Whether Capture stays a stage, or becomes the endpoint that accepts a push and starts a run.

### What a row of the incremental capture holds

**Stage:** Capture and Prepare. To be agreed within the team.

The capture is the input of Prepare. Its row shape decides how much of the definition Prepare runs.

**Option A: source rows, as in labs.** The capture holds one Parquet file per source of the definition. Each row is a changed source record. Prepare runs the definition's SQL pipelines on these rows to build one table per target, assigns entity ids, and resolves the properties.

- Reuses `prepare_rows`, `ids::assign` and `SinkRow::resolve` from the previous refactor without change.
- The capture format is the one the source readers already write. Labs writes the columns `_op`, `_key` and `_before` into every capture file and sets `_op` to `'snapshot'`. The monorepo staging and pipeline code already carries `_op` and `_key` through to the target tables, so `_op` can hold the kind of change.
- A definition written for full captures also works for incremental captures, as long as each pipeline reads one row at a time.
- A pipeline that joins two sources or aggregates rows sees only the changed rows and produces wrong results. Such a pipeline needs the earlier source rows, which the sync table does not hold.
- Prepare needs DuckDB and a workspace on this path.

**Option B: rows in the shape of the target.** The capture holds one row per entity change: the target, the source id, the kind of change, and the columns that the target's property mapping reads. Prepare assigns entity ids and resolves the properties. It runs no SQL pipelines.

- Prepare is smaller: id assignment and property conversion only.
- Joins and aggregations cannot go wrong in Prepare, because Prepare does not run them.
- Something before Capture has to produce rows in this shape. That component does not exist, and it would own the joins and aggregations.
- The `pipelines` section of the definition is unused on this path. A definition for incremental captures differs from one for full captures.
- The capture format is new and has to be specified.

**Chosen for now:** option A, the labs format (Paul, 2026-11-17). The limit this puts on joins and aggregations is described in "Joins and aggregations in incremental runs".

### Joins and aggregations in incremental runs

**Stage:** Prepare.

A pipeline of the definition is SQL that builds a target table from the source tables. An incremental capture holds only the rows that changed. A pipeline that computes each output row from one input row gives the right result. Two kinds of pipeline do not:

- **Join.** A pipeline joins `people` to `departments` to put the department name on a person. A person changes and their department does not. The capture has no department rows. An inner join drops the person, and a left join writes an empty department name over the real one.
- **Aggregation.** A pipeline counts the orders per customer. It counts only the orders that changed in this run.

Neither case produces an error.

A relation between two records needs no join. It is a link, and an entity id is derived from the web, the namespace, the entity type and the source id (`derive_entity_id` in `stage/diff/rows/ids.rs`). A person row that carries the department's key is enough to build the link. For this reason few joins are expected in incremental runs. Joins are mainly used with hash and diff, which has the full capture (Paul, 2026-11-17).

**Chosen for now:** Prepare fails an incremental run when a target reads more than one source (Paul, 2026-11-17). An aggregation over one source is not detected; finding it would require parsing the SQL.

**Options for later:**

- **Allow joins and make the sender responsible.** The capture has to contain every source row its pipelines need: the department of each changed person, and every person of each changed department. This needs no code, and a capture that breaks the rule loses data without an error.
- **Allow joins and report them.** Prepare writes an entry to the issues file for each target that reads more than one source.
- **Join in the data collection service.** The service has the full source and sends rows that are already joined. This is option B of "What a row of the incremental capture holds".
- **Join in Prepare against the latest row per source key.** Prepare keeps a table of current source rows and joins the changed rows against it. Hash and diff needs the same table.

### Removing a property with per-property updates

**Stage:** Prepare and Send.

An update carries one `add` operation per property of the row, and a property that is absent from the row stays unchanged in the Graph (Paul, 2026-11-17). `SinkRow::resolve` leaves a blank value out of the row. A value that becomes blank in the source is therefore never removed from the entity.

The spec has to say how a removal is expressed: for example a `remove` operation for each mapped property that is blank in the row, or no removal in the first version.

### Link changes in incremental runs

**Stage:** Prepare.

In labs a link is derived from a source row by a link pipeline, and its id is derived from its two endpoints. Labs finds changed links by comparing with the links of the previous run. An incremental run has no previous state to compare with. Two cases need the old endpoint:

- **A row changes its foreign key.** A person moves from department A to department B. The new link to B can be created from the row. The old link to A has to be archived, and the row no longer holds A.
- **A row is deleted.** The links of the deleted entity have to be archived as well.

The labs capture format has a `_before` column for change streams. It could carry the old values of a changed or deleted row. Labs sets it to null and never reads it.

### How the Graph answers a replayed write

**Stage:** Send and record.

Send treats a create that the Graph answers with a conflict as done (Paul, 2026-11-17). The aim is that a batch can be sent again without changing the history of an entity in the Graph. This rests on Graph behaviour that has not been checked. Each point below needs a test against a real Graph before the Send design is accepted:

- **Create of an existing entity.** Which status the bulk create endpoint returns, and whether the response names the entity that conflicted. The bulk endpoints are atomic, so one existing entity fails the whole batch.
- **Patch with unchanged values.** Whether the Graph writes a new edition when a patch carries the values the entity already has. If it does, a replayed update changes the history.
- **Patch of a missing entity.** Which status is returned. The previous refactor answered a 404 by sending a create; without that fallback the update is lost.
- **Archive of an archived or missing entity.** The previous refactor counted a 404 as `Absent` and continued.
- **An update stored as a create, or the reverse.** Each row says whether it creates or updates. A row with the wrong kind is ignored on conflict or fails with a 404.

### Several changes to one entity in a run

**Stage:** Send and record.

An incremental capture can hold more than one change to the same entity. There are two ways to send them:

- **Send every change.** Two changes to one entity never go into the same batch.
- **Send the last change only.** Send merges the changes to an entity into one write.

Both should be supported in the end (Paul, 2026-11-17).

**Chosen for now:** send every change. A row holds only the new values of its change, so sending the last change only would require merging the rows of an entity first. Sending every change needs no merge. This choice was made by Claude on Paul's instruction to pick the easier option.

Send sorts a run's rows by operation first and by their position in the run second (Paul, 2026-11-17). The operations are sent in the order entity upserts, link upserts, link archives, entity archives. Changes to one entity keep their order within one operation. Across operations they can swap. The known case: an entity that is archived and then created again in one run is sent as create, then archive, and ends up archived. The spec has to say whether Prepare refuses such a run, or whether the case is accepted.

## Kept for later

- **Periodic snapshots of the sync table.** A job merges the rows of each entity into one table of current values, for example once a week. Reconstructing the state at a run then starts from the latest snapshot. This is an optimization and is outside the first version (Paul, 2026-11-17).
