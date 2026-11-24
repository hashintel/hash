# Milestone 4: Sync table

## What it adds

The table that Prepare writes and Send reads, with its two functions. It is a Delta table under `sync/` in the integration's place in the bucket, partitioned by run.

```text
Prepare ──► write(run, rows) ──► sync/run={run}/…parquet    the files of one run
                                 sync/_delta_log/…json      one commit per write, written last
Send    ◄── read(run)        ◄── only that run's files are opened
```

**Decided in:** D17. Paul and Fedor chose Delta on 2026-11-19, in place of the Iceberg table with its pointer file that `../plan.md`, step 3, describes.

## Size

|           | Lines   |                                                                      |
| --------- | ------- | -------------------------------------------------------------------- |
| Moved     | 0       |                                                                      |
| Adapted   | 30      | `storage/s3.rs`: the bucket is opened at its root for the sync table |
| New       | 425     | the row and its conversion, opening the table, writing, reading      |
| **Total** | **455** | **reused 7%**                                                        |

The plan estimated 600 for Iceberg. Delta needs no pointer file and no catalog.

Nothing is ported from labs or `engine`, which have no such table.

## Interface

In `contracts.md`: `Op`, `SyncRow`, `write`, `read`, `order_key`.

## Pseudo code

**`sync_table/row.rs`: one row** (new, 160 lines)

```rust
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Op { CreateEntity, UpdateEntity, CreateLink, UpdateLink, ArchiveLink, ArchiveEntity }

#[derive(Serialize, Deserialize)]
pub(crate) struct SyncRow {                                 // contracts page; also the row of the table
    #[serde(with = "run_text")] pub run: RunId,             // a UUID would be bytes: `serde_arrow` is not human readable
    ..                                                      // ids and types serialize as text themselves
    #[serde(with = "json_text")] pub properties: PropertyObjectWithMetadata,
}
pub(crate) struct OrderKey { web_id: Uuid, entity_uuid: Uuid }
pub(crate) fn order_key(id: &EntityId) -> OrderKey;

fn columns() -> [StructField; 8];                           // written out: `run` and `seq` first, `seq` as a 64-bit number,
                                                            // the rest text
fn to_batch(rows: &[SyncRow], schema: &SchemaRef) -> Result<RecordBatch, _>;   // `serde_arrow::to_record_batch`
fn from_batch(run: RunId, batch: &RecordBatch) -> Result<Vec<SyncRow>, _>;    // adds the `run` column, which a data file
                                                                              // lacks, then `serde_arrow::from_record_batch`
```

`SyncRow` is the row of the table: `serde_arrow` writes it to a batch and reads it back, and no second row type exists. The columns are written out and not traced from the type, for two reasons. The table's format is stored, so a change to it should be a change to this list and not a side effect of editing a field. And `serde_arrow` traces a type by deserializing empty sample text, which `EntityId`, `VersionedUrl` and the properties refuse.

`Op` is written as text, such as `create_entity`. The order of its variants is the order Send delivers them, so Send sorts by `(op, seq, order_key)` without a table of its own.

**`sync_table/mod.rs`: opening the table** (new, 135 lines)

```rust
async fn open(storage) -> Result<DeltaTable, Report<SyncTableError>> {
    let bucket = storage.bucket().ok_or(SyncTableError::Invalid)?;    // the in-memory store has none
    let location = Url::parse(&format!("{}/sync", bucket.uri))?;
    let mut table = DeltaTableBuilder::from_url(location.clone())?
        .with_storage_backend(Arc::new(open_bucket(bucket)?), location)  // the bucket at its root
        .build()?;
    match table.load().await {
        Ok(()) | Err(DeltaTableError::NotATable(_)) => Ok(table),   // no version yet: nothing was written
        Err(error) => Err(error).change_context(SyncTableError::Storage),
    }
}

async fn run_files(table, run) -> Result<Vec<LogicalFileView>, _>;   // the files whose partition value is `run`
```

The first call registers Delta's default log store for `s3://` locations. It commits with "create if absent", which S3 and MinIO support, so no lock and no second service are needed.

**`sync_table/write.rs`: writing a run** (new, 80 lines)

```rust
pub(crate) async fn write(storage, run, rows: Vec<SyncRow>) -> Result<(), Report<SyncTableError>> {
    // every row must be of `run`
    let mut table = open(storage).await?;
    if table.version().is_none() {
        table = table.create().with_columns(row::columns()).with_partition_columns(["run"]).await?;
    }
    let mut actions: Vec<Action> = run_files(&table, run).await?           // the run's files are removed
        .iter().map(|file| Action::Remove(file.remove_action(true))).collect();
    let mut writer = RecordBatchWriter::for_table(&table)?;
    writer.write(row::to_batch(&rows, &writer.arrow_schema())?).await?;  // skipped for no rows
    actions.extend(writer.flush().await?.into_iter().map(Action::Add));  // and the new ones added
    CommitBuilder::default().with_actions(actions)                       // in one commit, written last
        .build(Some(table.snapshot()?), table.log_store(), DeltaOperation::Write {
            mode: SaveMode::Overwrite, partition_by: Some(vec!["run".into()]), predicate: Some(format!("run = '{run}'")),
        })
        .await?;
    Ok(())
}
```

A write replaces the rows of the run, so a repeated write leaves the rows of its last attempt, and a write without rows leaves the run without rows. If the process stops before the commit, the table keeps the rows it had. The files of that attempt stay in the bucket and no commit names them.

**`sync_table/read.rs`: reading a run** (new, 50 lines)

```rust
pub(crate) async fn read(storage, run) -> Result<Vec<SyncRow>, Report<SyncTableError>> {
    let table = open(storage).await?;
    if table.version().is_none() { return Ok(vec![]); }
    let mut rows = vec![];
    for path in run_files(&table, run).await? {
        let bytes = table.object_store().get(&path).await?.bytes().await?;
        for batch in ParquetRecordBatchReaderBuilder::try_new(bytes)?.build()? {
            rows.extend(row::from_batch(run, &batch?)?);
        }
    }
    rows.sort_by_key(|row| (row.seq, order_key(&row.entity_id)));      // a run can have more than one file; rows of one
                                                                       // capture row share a `seq`, so the id settles the order
    Ok(rows)
}
```

## Source table

| New file              | Item                                                           | Starting point                                        | Kind    | Lines |
| --------------------- | -------------------------------------------------------------- | ----------------------------------------------------- | ------- | ----- |
| `sync_table/row.rs`   | `Op`, `SyncRow`, `order_key`, the columns, the two conversions | none                                                  | new     | 160   |
| `sync_table/mod.rs`   | `open`, `run_files`, the log store for S3, `SyncTableError`    | none                                                  | new     | 135   |
| `sync_table/write.rs` | `write`                                                        | none                                                  | new     | 80    |
| `sync_table/read.rs`  | `read`                                                         | none                                                  | new     | 50    |
| `storage/s3.rs`       | `open_bucket`                                                  | `open`, split so the bucket can be opened at its root | adapted | 30    |

Also in this milestone:

- `deltalake-core` 2.0.0 in the workspace manifest, with its `rustls` feature in the crate, and `serde_arrow` 0.15.1 with its `arrow-60` feature. No release of `deltalake-core` uses `arrow` 60 yet, so `[patch.crates-io]` takes it from the commit of delta-io/delta-rs#5017. The release before it, 1.1.4, uses `parquet` 59, which brings `brotli-decompressor` 5.0.3, and `object_store` 0.13, which brings `quick-xml` 0.39.4. Both have open advisories, and code scanning blocks them.
- The workspace's `object_store` moves from 0.12.5 to 0.14.2, the version `deltalake-core` uses. The storage module only imports `ObjectStoreExt` in three places, because `get`, `put` and `put_multipart` moved to that trait.

## Tests

All new, against a MinIO container, because Delta opens its own connection to the bucket.

1. A run's rows come back in `seq` order with every column unchanged, for entities and for links.
2. A read of one run returns no rows of another. A read of a run that was never written returns none, before and after the table exists.
3. A second write of a run replaces its rows.
4. A write without rows removes the run's rows.
5. A write that stopped before its commit: the run's files are written without a commit, the run is written again, and its rows are in the table once.
6. Rows of another run are `Invalid`.
7. A storage without a bucket is `Invalid`.
8. The columns are the fields of `SyncRow`: a row serialized with `serde_json` has the names of `columns()`, so a field added to `SyncRow` without a column fails the test.

## What was stripped

Nothing existing. Left out on purpose: checkpoints and log cleanup tuned for the table, compaction, removing files nothing refers to, and schema changes.

## Open points

- **Fact:** the patched `deltalake-core` uses `arrow` and `parquet` 60, as `duckdb` 1.20000.1 and the rest of the workspace do, so the build has one copy of each. The sync table uses the `arrow` and `parquet` that `deltalake-core` re-exports. The patch goes once a release of `deltalake-core` includes delta-io/delta-rs#5017.
- **Fact:** `deltalake-core` without its `datafusion` feature can create a table, append with `RecordBatchWriter`, and list a snapshot's files with their partition values. It cannot scan. `read` therefore lists the run's files and reads them with `parquet`.
- **Fact:** `EntityId` has no order of its own (`libs/@blockprotocol/type-system/rust/src/knowledge/entity/id.rs:81`). `order_key` gives its web id and its entity UUID, which is how `engine` sorts (`graph/plan/mod.rs:162-167`). Send uses the same function.
- **Fact:** the rows of one file come back in the order they were written. Several files are listed in no fixed order, so `read` sorts.
- `SyncTableError` has two cases, as in `contracts.md`: `Storage` when the bucket cannot be reached, and `Invalid` when a row cannot be turned into a row of the table or back, or the storage has no bucket.
- **Decided by Paul (review, 2026-11-24):** `write` always replaces the run's rows, and does not check whether the run was written. Running a stage again is the stages' job, so the sync table keeps no retry logic of its own.
- **Fact:** two writes of a run at the same time conflict only when the run had files: both commits remove them, and the second fails. Two first writes of a run both commit, and the run has both sets of rows. Callers run one attempt of a run at a time, as for Capture.
- **Chosen:** the table is created by the first write. There is no separate setup step.
- **Chosen:** `read` returns no rows for an integration without a table, and does not fail.
- **Chosen:** `order_key` returns a struct, not a pair of UUIDs.
- **Decided:** D5, a run's rows are one list in memory. D6, no local folder: these tests need MinIO either way. D17, Delta.
