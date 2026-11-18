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
- The file holds the source's own columns plus `_change`, which says `insert`, `update` or `delete`. Capture adds no column. Labs does it differently: its capture step writes the internal columns `_op`, `_key` and `_before` into every file. Those columns exist for the pipeline step, so they belong to Prepare.
- Prepare stages the file with `stage_table` in `engine`, which adds `_op = 'snapshot'` and `_key` and rejects a source column named `_op`, `_key` or `_content_hash` (`engine/src/workspace/connection/staging.rs:75-111`). The incremental staging step then copies `_change` into `_op`. This needs no change to `engine`. A later change to `stage_table` could take the kind of change directly.
- Link tables carry no `_op` today. See "Link changes in incremental runs".
- A definition written for full captures also works for incremental captures, as long as each pipeline reads one row at a time.
- A pipeline that joins two sources or aggregates rows sees only the changed rows and produces wrong results. Such a pipeline needs the earlier source rows, which the sync table does not hold.
- Prepare needs DuckDB and a workspace on this path.

**Option B: rows in the shape of the target.** The capture holds one row per entity change: the target, the source id, the kind of change, and the columns that the target's property mapping reads. Prepare assigns entity ids and resolves the properties. It runs no SQL pipelines.

- Prepare is smaller: id assignment and property conversion only.
- Joins and aggregations cannot go wrong in Prepare, because Prepare does not run them.
- Something before Capture has to produce rows in this shape. That component does not exist, and it would own the joins and aggregations.
- The `pipelines` section of the definition is unused on this path. A definition for incremental captures differs from one for full captures.
- The capture format is new and has to be specified.

**Chosen for now:** option A with plain source rows and a `_change` column (Paul, 2026-11-18). The labs capture format, chosen on 2026-11-17, is dropped, because its internal columns are Prepare's concern. The limit option A puts on joins and aggregations is described in "Joins and aggregations in incremental runs".

### Joins and aggregations in incremental runs

**Stage:** Prepare.

A pipeline of the definition is SQL that builds a target table from the source tables. An incremental capture holds only the rows that changed. A pipeline that computes each output row from one input row gives the right result. Two kinds of pipeline do not:

- **Join.** A pipeline joins `people` to `departments` to put the department name on a person. A person changes and their department does not. The capture has no department rows. An inner join drops the person, and a left join writes an empty department name over the real one.
- **Aggregation.** A pipeline counts the orders per customer. It counts only the orders that changed in this run.

Neither case produces an error.

A relation between two records needs no join. It is a link, and an entity id is derived from the web, the namespace, the entity type and the source id (`derive_entity_id` in `stage/diff/rows/ids.rs`). A person row that carries the department's key is enough to build the link. For this reason few joins are expected in incremental runs. Joins are mainly used with hash and diff, which has the full capture (Paul, 2026-11-17).

**Chosen for now:** Prepare fails an incremental run when a target reads more than one source (Paul, 2026-11-17). Links and joins are still under discussion in the team; see "Link changes in incremental runs". An aggregation over one source is not detected; finding it would require parsing the SQL.

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

**Status:** deferred (Paul, 2026-11-18). The integration team is still discussing links and joins, and no decision is made. How a link row gets its Graph operation stays open until then.

**Under discussion: [Links From Joins](https://claude.ai/artifact/PzCHqfjKBYHyWpH5DygnJW).** The page proposes one rule: a join row becomes a link once both of its entities are in the lake, and until then the row waits there. It says the planner today writes a link for every row without checking its ends. It states these Graph rules and gives a Lean proof against them:

- The Graph refuses a link when one of its ends was never created.
- The Graph accepts a link when one of its ends is archived, which leaves a live link to an archived entity.
- Archiving an entity does not archive its links.
- The Graph removes nothing. A record deleted at the source is archived.

The page delivers in the order this spec uses: upsert entities, upsert links, archive links, archive entities. It proves that every arrival order of the tables ends in the same live Graph. It also names a case that matters for incremental runs: checking only the changed rows misses an unchanged row that gains a link.

What this means for the ledger pipeline, as Claude reads it and not yet discussed:

- The rule needs rows that stay available after their run. A person row captured in run 2 gets its link in run 3, when the company arrives, and the person row is not in run 3's capture. The spec has no such store: the sync table holds entity changes, and Prepare reads no earlier run.
- "Joins and aggregations in incremental runs" needs the same store for a different reason: the latest row per source key.

One option was drafted before the deferral and is recorded here without a decision. Prepare requires `_op` on link tables, as it does on entity tables. An insert and an update both create the link, and a conflict counts as done. A delete archives the link when the row still carries both endpoint values. It covers a new row, a changed foreign key and an unchanged link. It sends many creates for links that exist, it does not archive the old link, and it does not apply changes to a link's own properties.

### A source that cannot tell an insert from an update

**Stage:** Capture, Prepare and Send.

Capture deals with the source data only. `_change` in the capture file says what happened to a source record: `insert`, `update` or `delete`. Prepare is the only stage that turns this into a Graph operation (Paul, 2026-11-18).

Many sources cannot say whether a changed record is new. A query for "everything changed since yesterday" returns changed records without that information. Only a change feed knows it.

One way to express this is a fourth `_change` value that means "this is the record as it is now; new or changed is not known". Labs calls that value `snapshot`. Something later then has to find out whether the entity exists:

- **Send asks the Graph.** For such a row Send sends a create, and if the Graph answers with a conflict, it sends an update.
  - The Graph is the only component that knows for certain whether an entity exists.
  - The `pipeline` crate's `stage/send/delivery.rs` does this today, with tests.
  - A replay is safe as long as the Graph writes no new edition for an update with unchanged values. See "How the Graph answers a replayed write".
  - It costs more requests. The bulk endpoint is atomic, so a batch with one existing entity fails as a whole and is sent again one write at a time.
- **Prepare checks the sync table.** If the table already holds a create for the entity id, the row becomes an update, otherwise a create.
  - Send keeps one behaviour, with no fallback.
  - Prepare has to read earlier rows and needs an efficient lookup over the whole table.
  - The result is wrong whenever the table and the Graph differ, for example after a refused write.

A source that reports only changed records also cannot report a deleted one. Finding those needs a full capture and a comparison, which is the hash and diff variant of Prepare.

**Chosen for now:** `_change` has the three values `insert`, `update` and `delete`, and Send has no fallback (Paul, 2026-11-18). A source that cannot tell an insert from an update is not supported in the first version.

### How the Graph answers a replayed write

**Stage:** Send and record.

Send treats a create that the Graph answers with a conflict as done (Paul, 2026-11-17). The aim is that a batch can be sent again without changing the history of an entity in the Graph. This rests on Graph behaviour that has not been checked. Each point below needs a test against a real Graph before the Send design is accepted:

- **Create of an existing entity.** Which status the bulk create endpoint returns, and whether the response names the entity that conflicted. The bulk endpoints are atomic, so one existing entity fails the whole batch.
- **Patch with unchanged values.** Whether the Graph writes a new edition when a patch carries the values the entity already has. If it does, a replayed update changes the history.
- **Patch of a missing entity.** Which status is returned. The previous refactor answered a 404 by sending a create; without that fallback the update is lost.
- **Archive of an archived or missing entity.** The previous refactor counted a 404 as `Absent` and continued.
- **An update stored as a create, or the reverse.** Each row says whether it creates or updates. A row with the wrong kind is ignored on conflict or fails with a 404.

Found in the code and its tests on 2026-11-18 ([inventory/send.md](inventory/send.md)). None of it has been tested with the new request bodies.

- **Patch with unchanged values.** The Graph returns `Unchanged` and writes no new edition when the properties, their metadata, the archived flag, the draft flag, the types and the confidence are equal. It does not compare the provenance (`postgres-store/src/store/postgres/knowledge/entity/patch.rs:413-426`). A test against a pinned Graph image confirms this for a patch that replaces the whole property object. No test covers a patch made of `add` operations.
- **Create of an existing entity.** On the pinned image, a bulk create with one write gets a 409. For a bulk create with several writes and one existing entity, the status is not known, and the client discards the response body, so Send cannot tell which entity existed. The rule "a create conflict counts as done" needs a decision for such a batch: count the whole batch as created, send it again one write at a time, or read the body.
- **Patch of a missing entity.** On the pinned image it gets a 404.
- **An update of an archived entity.** Every update body carries `archived: false`, so an update makes an archived entity live again.

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

## Raised by the code inventory

The inventory of labs, `engine` and the `pipeline` crate is in [inventory/](inventory/). Section 5 of each file lists the questions it raises. These contradict the spec or the skeleton and need a decision before the stage that depends on them is specified:

- **`engine` differed between this branch and `main`.** Resolved on 2026-11-18 by merging `main` into the branch: `engine` now has the storage module and the `graph` module. The storage module still comes from the open pull request hashintel/hash#10392, so the new crate builds only on a branch that has it.
- **A conditional write cannot be built on `engine`'s public API.** The object store is a private field, `ArtifactKey` has no public constructor, and `bind` can create a key but never update it. The `pipeline` crate's copy of the storage module adds `read_versioned` and `replace_if`.
- **The sync table has no way to find its files.** `PrepareOutput` holds no file references, `engine` has no list operation, and `publish` names a file by its content.
- **Send needs the capture time.** Every request body carries it as `loadedAt`. The Send contract in the spec takes no `CaptureOutput`.
- **No code cuts a batch when an entity is already in it.** The existing `Batcher` cuts on the operation, on create or update, at 128 writes and at 1,500,000 bytes. `engine` on `main` refuses two writes to one entity.
- **Nothing preserves the order of the captured rows.** `order_id` has no source when one entity changes several times in a run.
- **The skeleton contradicts today's behaviour in three places.** It fails on a blank source id, where `pipeline` leaves the row out and lists it. It fails when two rows of a target share an entity id, which sending every change has to allow. Its issue type has two fields, where the issues file has seven columns.
- **Labs and `pipeline` convert some values differently.** A blank boolean is `false` in labs and left out in `pipeline`. An unknown unit gives the bare amount in labs and a failure in `pipeline`. The spec takes expected values from labs first.
- **`run.json` embeds the definition.** The existing conditional write refuses an object over 1 MiB.
