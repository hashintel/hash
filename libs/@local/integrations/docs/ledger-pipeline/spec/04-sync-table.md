# Milestone 4: Sync table

### What it adds

The table that Prepare writes and Send reads, with its two functions. It is stored as an Apache Iceberg table under `sync/` in the integration's bucket, with the pointer to its current state in `sync/pointer.json`.

```text
Prepare ──► write(run, rows) ──► sync/data/run_id={run}/…parquet   one file per run
                                 sync/metadata/…                   Iceberg's own files
                                 sync/pointer.json                 moved last
Send    ◄── read(run)        ◄── only that run's file is opened
```

**Decided in:** `../plan.md`, step 3, "The sync table"; the facts are in `../background/spikes.md`, "Iceberg from Rust".

### Size

|           | Lines   |                                                                              |
| --------- | ------- | ---------------------------------------------------------------------------- |
| Moved     | 0       |                                                                              |
| Adapted   | 0       |                                                                              |
| New       | 580     | the row and its conversion, opening the table, the pointer, writing, reading |
| **Total** | **580** | **reused 0%**                                                                |

The plan estimated 600. The row's conversion came out shorter.

Nothing is ported from labs or `engine`, which have no such table. The spike is the starting point: about 190 lines for the bare flow, with `unwrap` in place of errors and test data in place of the conversion.

### Interface

In `contracts.md`: `Op`, `SyncRow`, `write`, `read`.

### Pseudo code

**`sync_table/row.rs`: one row** (new, 210 lines)

```rust
pub enum Op { CreateEntity, UpdateEntity, CreateLink, UpdateLink, ArchiveLink, ArchiveEntity }
pub struct SyncRow { .. }                                  // contracts page

fn schema() -> iceberg::spec::Schema;                      // the eight columns, `seq` as a 64-bit number, the rest text
fn to_batch(rows: &[SyncRow]) -> Result<RecordBatch, _>;   // ids and types as text, properties as JSON text
fn from_batch(batch: &RecordBatch) -> Result<Vec<SyncRow>, _>;
```

`Op` is written as text, such as `create_entity`. The order of its variants is the order Send delivers them, so Send sorts by `(op, seq, entity_id)` without a table of its own.

**`sync_table/mod.rs`: opening the table** (new, 130 lines)

```rust
/// The table, and the version of the pointer it was opened from.
async fn open(storage) -> Result<(MemoryCatalog, Table, Option<CasVersion>), Report<SyncTableError>> {
    let bucket = storage.bucket().ok_or(SyncTableError::Invalid)?;       // the in-memory store has none
    let location = format!("{}/sync", bucket.uri);                       // the same place the pointer is in
    let catalog = MemoryCatalogBuilder::default()
        .with_storage_factory(OpenDalStorageFactory::S3 { .. })
        .load("sync", s3_properties(bucket))?;                           // endpoint, region, keys
    match pointer::read(storage).await? {
        Some((metadata, version)) => Ok((catalog, catalog.register_table(&ident(), metadata).await?, Some(version))),
        None => Ok((catalog, catalog.create_table(&namespace(), TableCreation {
            location: Some(location), schema: row::schema(), partition_spec: identity("run_id"), .. }).await?, None)),
    }
}
```

The catalog lives in memory for one call. Nothing but the pointer says where the table is.

The table's location is set, and not left to the catalog. Its files are then under `sync/data/run_id={run}/` and `sync/metadata/`, beside `sync/pointer.json`, also when the bucket's address has a prefix.

**`sync_table/pointer.rs`: the pointer** (new, 60 lines)

```rust
pub(super) async fn read(storage) -> Result<Option<(String, CasVersion)>, _>;   // storage.read_versioned("sync/pointer.json")
pub(super) async fn replace(storage, version: Option<&CasVersion>, location: &str) -> Result<(), _> {
    // storage.replace_if: fails if another writer moved the pointer in between
}
```

**`sync_table/write.rs`: writing a run** (new, 110 lines)

```rust
pub async fn write(storage, run, rows: Vec<SyncRow>) -> Result<(), Report<SyncTableError>> {
    let (catalog, table, version) = open(storage).await?;            // the pointer is read once
    if has_run(&table, run) { return Ok(()); }             // a snapshot carries this run id: written before

    // one Parquet file in the partition of this run
    let key = PartitionKey::new(spec, schema, [run]);
    let mut writer = DataFileWriterBuilder::new(RollingFileWriterBuilder::new(ParquetWriterBuilder::new(..), ..))
        .build(Some(key)).await?;
    writer.write(row::to_batch(&rows)?).await?;
    let files = writer.close().await?;

    // one append, with the run id in the snapshot's summary
    let table = Transaction::new(&table).fast_append()
        .add_data_files(files)
        .set_snapshot_properties([("sync.run-id", run)])
        .apply(..)?.commit(&catalog).await?;

    pointer::replace(storage, version.as_ref(), table.metadata_location()).await   // last
}
```

If the process stops before the pointer is moved, the table does not have the run, and the next call writes it. The files of the first attempt stay in the bucket and nothing refers to them.

**`sync_table/read.rs`: reading a run** (new, 70 lines)

```rust
pub async fn read(storage, run) -> Result<Vec<SyncRow>, Report<SyncTableError>> {
    let Some((location, _)) = pointer::read(storage).await? else { return Ok(vec![]) };
    let table = StaticTable::from_metadata_file(&location, ident(), file_io(storage)).await?.into_table();
    let batches = table.scan()
        .with_filter(Reference::new("run_id").equal_to(Datum::string(run)))
        .build()?.to_arrow(..).await?.try_collect().await?;
    let mut rows = batches.iter().map(row::from_batch).flatten().collect();
    rows.sort_by_key(|row| (row.seq, order_key(&row.entity_id)));       // a run can have more than one file; rows of one
                                                             // capture row share a `seq`, so the id settles the order
    Ok(rows)
}
```

### Source table

| New file                | Item                                         | Starting point                                                                | Kind | Lines |
| ----------------------- | -------------------------------------------- | ----------------------------------------------------------------------------- | ---- | ----- |
| `sync_table/row.rs`     | `Op`, `SyncRow`, schema, the two conversions | the spike's `schema` and `batch` (55 lines, test data)                        | new  | 210   |
| `sync_table/mod.rs`     | `open`, the S3 properties, `SyncTableError`  | the spike's `new_catalog` and `open_from_pointer` (40)                        | new  | 130   |
| `sync_table/pointer.rs` | `read`, `replace`                            | the spike's `read_pointer` and `write_pointer` (10), on `Storage::replace_if` | new  | 60    |
| `sync_table/write.rs`   | `write`, `has_run`                           | the spike's `write_data_file`, `commit_append`, `run_already_committed` (45)  | new  | 110   |
| `sync_table/read.rs`    | `read`                                       | the spike's `read_order_ids` (15) and `StaticTable`                           | new  | 70    |

The spike is in the session's scratch folder and is not in the repository. Its findings are in `../background/spikes.md`.

Also in this milestone: the `iceberg` crates as git dependencies in the workspace manifest, pinned to commit `641f590` of `apache/iceberg-rust`, with the note to move to version 0.12 when it is released.

### Tests

All new, against a MinIO container, because Iceberg opens its own connection to the bucket. Four tests:

1. A run's rows come back in `seq` order with every column unchanged, for entities and for links.
2. A read of one run returns no rows of another, and a read of a run that was never written returns none.
3. A second write of a run adds nothing.
4. A write whose pointer was not moved: the pointer is set back to its old value, the run is written again, and its rows are in the table once.

### What was stripped

Nothing existing. Against a full use of Iceberg, left out on purpose: a catalog of our own, expiring snapshots, removing files nothing refers to, and schema changes. `../background/spikes.md` records that old metadata files accumulate.

### Open points

- **Fact:** all calls in the pseudo code exist in the pinned crate and were run in the spike against MinIO: `MemoryCatalogBuilder`, `register_table`, `fast_append`, `set_snapshot_properties`, `StaticTable::from_metadata_file`, a scan with a filter.
- **Fact:** a table can be given its location when it is created (`TableCreation.location`, `crates/iceberg/src/catalog/mod.rs:348` at commit `641f590`). The spike left it to the catalog.
- **Fact:** `EntityId` has no order of its own (`libs/@blockprotocol/type-system/rust/src/knowledge/entity/id.rs:81`). `order_key` in `row.rs` gives its web id and entity id as two UUIDs, which is how `engine` sorts (`graph/plan/mod.rs:162-167`). Send uses the same function.
- **Fact:** the rows of one file come back in the order they were written. Several files are merged in no fixed order, so `read` sorts.
- `SyncTableError` has two cases, as in `contracts.md`: `Storage` when the bucket cannot be reached, and `Invalid` when a row cannot be turned into a row of the table or back, or the storage has no bucket.
- **Chosen:** the pointer is moved with "replace if unchanged". With one writer per integration it never fails. If it does, two processes wrote at once, and the second one stops.
- **Chosen:** the table is created by the first write. There is no separate setup step.
- **Chosen:** `read` returns no rows for an integration without a table, and does not fail.
- **Decided:** D5, a run's rows are one list in memory. D6, no local folder: these tests need MinIO either way.
