# Milestone 4: Sync table

## What it adds

The table that Prepare writes and Send reads, as the type `SyncTable` with two methods. It is a Delta table under `sync/` in the integration's place in the bucket, partitioned by run, and read and written through the lake of milestone 1.

```text
Prepare ──► SyncTable::write(run, rows) ──► sync/run={run}/…parquet    the files of one run
                                            sync/_delta_log/…json      one commit per run, tagged with it
Send    ◄── SyncTable::read(run)        ◄── DuckDB reads only that run's partition
```

**Decided in:** D17. Paul and Fedor chose Delta on 2026-11-19, in place of the Iceberg table with its pointer file that `../plan.md`, step 3, describes. Through DuckDB in place of `deltalake-core`: D18. Written once per run: D19.

## Size

|           | Lines   |                                                                    |
| --------- | ------- | ------------------------------------------------------------------ |
| Moved     | 0       |                                                                    |
| Adapted   | 35      | `storage/s3.rs`: the bucket is opened at its root                  |
| New       | 307     | the row and its conversion, the columns, writing and reading a run |
| **Total** | **342** | **reused 10%**                                                     |

The plan estimated 600 for Iceberg. Delta needs no pointer file and no catalog. The first version with `deltalake-core` had 510 new lines. Through the lake, opening the table, its log store, the file listing and the Parquet reading are gone.

Nothing is ported from labs or `engine`, which have no such table.

## Interface

In `contracts.md`: `Op`, `SyncRow`, `SyncTable` with `open`, `write` and `read`, the function `read`, and `order_key`.

## Pseudo code

**`sync_table/row.rs`: one row** (new, 130 lines)

```rust
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Op { CreateEntity, UpdateEntity, CreateLink, UpdateLink, ArchiveLink, ArchiveEntity }
impl ToSql for Op;                                          // its text, such as `create_entity`

pub(crate) struct SyncRow { pub run: RunId, .. }           // contracts page
impl SyncRow {
    pub(super) fn properties_text(&self) -> Result<String, _>;            // the properties as JSON text
    pub(super) fn read(row: &duckdb::Row, run: RunId) -> Result<Self, _>; // by column name; `Invalid` for an empty
                                                                          // required column or a value that does not parse
}
pub(crate) struct OrderKey { web_id: Uuid, entity_uuid: Uuid }
pub(crate) fn order_key(id: &EntityId) -> OrderKey;
```

A row is written with DuckDB's `Appender`, each value as text or a number: ids and types as text, `seq` as a 64-bit number, and the properties as JSON text. It is read back by column name and parsed. `run` is not stored with the row: the lake adds it.

`Op` is written as text, such as `create_entity`. The order of its variants is the order Send delivers them, so Send sorts by `(op, seq, order_key)` without a table of its own.

**`sync_table/mod.rs`: the table** (new, 177 lines)

```rust
pub(crate) enum SyncTableError { Storage, Invalid, Unconfigured }   // `from_lake` maps `LakeError` one to one

fn columns() -> Columns;    // seq BIGINT, op, entity_id, entity_type, left_entity_id, right_entity_id,
                            // properties VARCHAR; written out, the table's format is stored

pub(crate) struct SyncTable<'lake> { lake: &'lake Lake, table: Table<'lake> }

impl<'lake> SyncTable<'lake> {
    pub(crate) fn open(lake: &'lake Lake) -> Result<Self, _>;        // attaches `sync`

    pub(crate) fn write(&self, run: RunId, rows: &[SyncRow]) -> Result<u64, Report<SyncTableError>> {
        // `Invalid` if a row is of another run
        if self.table.has_run(run)? { return self.table.rows(run); }   // written before: left as it is
        let staged = self.lake.stage_rows(&columns())?;
        let mut appender = staged.appender()?;
        for row in rows { appender.append_row(params![row.seq, row.op, …, row.properties_text()?])?; }
        appender.flush()?;
        self.table.append_run(run, &staged)                            // one commit, tagged with `run`
    }

    pub(crate) fn read(&self, run: RunId) -> Result<Vec<SyncRow>, Report<SyncTableError>> {
        if !self.table.exists()? { return Ok(vec![]); }
        let mut rows = self.table.read_run(run, &columns(), from_lake, |row| SyncRow::read(row, run))?;
        rows.sort_by_key(|row| (row.seq, order_key(&row.entity_id)));   // DuckDB gives no order; rows of one
        Ok(rows)                                                         // capture row share a `seq`
    }
}

/// Opens a lake on a blocking thread and reads `run`. Send calls this.
pub(crate) async fn read(storage: &Storage, run: RunId) -> Result<Vec<SyncRow>, Report<SyncTableError>>;
```

A run is written once. If the table holds the run already, from an earlier attempt of Prepare or from another process, `write` leaves it as it is and returns the number of rows it has. A retry of Prepare therefore keeps the rows of the first attempt that committed, and records their number. A write without rows commits nothing, so the run does not count as written, and reads back without rows. If the process stops before the commit, the table keeps the rows it had.

Prepare opens one lake for copying the capture tables and for the write, and calls `SyncTable::write` inside it. Send calls `read`, which opens a lake of its own.

## Source table

| New file            | Item                                                             | Starting point                                        | Kind    | Lines |
| ------------------- | ---------------------------------------------------------------- | ----------------------------------------------------- | ------- | ----- |
| `sync_table/row.rs` | `Op`, `SyncRow`, `order_key`, reading and writing a row's values | none                                                  | new     | 130   |
| `sync_table/mod.rs` | `SyncTableError`, the columns, `SyncTable`, `read`               | none                                                  | new     | 177   |
| `storage/s3.rs`     | `open_bucket`                                                    | `open`, split so the bucket can be opened at its root | adapted | 35    |

Also in this milestone: the workspace's `object_store` moves from 0.12.5 to 0.14.2. The only change this needs in the storage module is importing `ObjectStoreExt` in three places, because `get`, `put` and `put_multipart` moved to that trait. It came with `deltalake-core`, which the sync table no longer uses, and stays.

## Tests

All new. All but 6 and 10 run against a MinIO container, because the lake opens its own connection to the bucket.

1. A run's rows come back in `seq` order with every column unchanged, for entities and for links.
2. A read of one run returns no rows of another, and writing a run leaves the rows of another. A read of a run that was never written returns none, before and after the table exists.
3. A second write of a run leaves the rows of the first.
4. A write without rows leaves the run without rows.
5. A batch with a row of another run is `Invalid`, and the run keeps its rows.
6. A storage without a bucket is `Unconfigured`.
7. A table at the sync table's place with other columns is `Invalid`.
8. With a prefix in the bucket's URI, the log and the run's files are under `{prefix}/{namespace}/sync/`, the files in the run's partition.
9. Wrong credentials are `Storage` for a read and a write, not an empty run.
10. `order_key` compares web ids before entity UUIDs.

## What was stripped

Nothing existing. Left out on purpose: log cleanup, compaction, removing files nothing refers to, and schema changes. The lake writes a checkpoint when the number of runs in the table is a multiple of 100 (milestone 1). DuckDB alone would write none, and every read would replay the whole log.

## Open points

- **Fact:** `EntityId` has no order of its own (`libs/@blockprotocol/type-system/rust/src/knowledge/entity/id.rs:81`). `order_key` gives its web id and its entity UUID, which is how `engine` sorts (`graph/plan/mod.rs:162-167`). Send uses the same function.
- **Fact:** DuckDB returns a run's rows in no fixed order. `read` therefore sorts.
- `SyncTableError` has three cases, one for each case of `LakeError`: `Storage` when running the stage again can help, `Invalid` when it cannot, and `Unconfigured` for a storage without a bucket. A row of another run, a table with other columns, an empty required column and a value that does not parse are `Invalid`.
- **Decided by Paul (review, 2026-11-24), superseded by D19:** `write` always replaced the run's rows, and did not check whether the run was written. Running a stage again was the stages' job, so the sync table kept no retry logic of its own.
- **Decided:** D19, a run is written once. Its commit is tagged with the run, so a second write of the run, also one by another process at the same time, leaves the first write's rows and returns their number (milestone 1).
- **Chosen:** the table is created by the first write, with the columns of `columns()`. There is no separate setup step.
- **Chosen:** `read` returns no rows for an integration without a table, and does not fail.
- **Chosen:** `order_key` returns a struct, not a pair of UUIDs.
- **Chosen:** the columns are written out in `columns()` and not traced from `SyncRow`. The table's format is stored, so a change to it should be a change to this list and not a side effect of editing a field.
- **Decided:** D5, a run's rows are one list in memory. D6, no local folder: these tests need MinIO either way. D17, Delta. D18, through DuckDB.
