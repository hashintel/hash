# Milestone 5: Workspace

## What it adds

`stage/prepare/workspace/`: DuckDB for one run. A `Workspace` opens a DuckDB file with access to files, the network and extensions switched off, loads a Parquet file into a table, checks that a query is a single `SELECT`, creates tables, describes and counts, and reads rows. All functions block. Prepare (8) calls them inside one blocking task, and the SQL steps (6) add three functions to the same type.

```text
Prepare (8) ── spawn_blocking ──► [ Workspace ] ──► prepare.duckdb in the run's scratch directory
                                    open, load_capture     ◄── one capture file per table (D14), through Arrow
                                    create_table, query    ◄── single SELECT, $NAME variables
                                    describe, count,       ◄── also used by pipeline/mod.rs (6)
                                    pipeline_sql
```

The new `Workspace` is `engine`'s `Connection` without the layer above it: no thread, no command queue, no cancellation, no metrics, no snapshots, no disk limit, no lock file, and no kinds of DuckDB error (D11).

**Decided in:** `../plan.md`, step 2, "Prepare" and "Decided with this list" (item 2), and step 4; `decisions.md`, D11.

## Size

|           | Lines   |                                                                                                                                                                                                                             |
| --------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Moved     | 298     | `select.rs`, `rows.rs`, `sql.rs`, `ByteSize`, `select`, `parameter_values`, the schema table function                                                                                                                       |
| Adapted   | 389     | opening, `query`, `create_table`, `describe`, `count`, `pipeline_sql`, `load_capture` out of the thread; `WorkspaceConfig`; `Setting`, `OpenError` and `StatementError` without their thread, disk and DuckDB-kind variants |
| New       | 3       | the module declarations                                                                                                                                                                                                     |
| **Total** | **690** | **reused 100%**                                                                                                                                                                                                             |

The plan has 965 (525 moved, 440 adapted). Moved is 227 lower: D11 removes `QueryErrorType`, `DataErrorType`, `from_duckdb` and `VariantName` (198), and `Setting` (28) becomes adapted, since it now names its settings with a `match`. Adapted is 51 lower: `files.rs` is left behind whole, since `open` takes the database path as it is (the plan counted 20 for "the paths"); the blocking functions lose their metrics, disk checks and the error docs for a stopped thread and for the DuckDB kinds; `WorkspaceConfig` derives `Default` once `queue_capacity` is gone; and `lib.rs` needs no `#![feature]`.

## Interface

`contracts.md`, "Workspace and SQL steps", the first seven functions, and `Identifier`. The page writes `pub`. By its note on visibility, the code makes them `pub(crate)`: no caller outside the crate uses the workspace.

```rust
// workspace/mod.rs
pub(crate) struct Workspace { duckdb: duckdb::Connection, variables: Variables, capture_schema: CaptureSchema }
#[derive(Debug, Default)]
pub(crate) struct WorkspaceConfig {
    pub variables: Variables,                    // the values of the $NAME parameters
    pub memory_limit: Option<ByteSize>,          // None: DuckDB's default
    pub threads: Option<NonZeroUsize>,
    pub temp_directory_limit: Option<ByteSize>,
}

impl Workspace {
    pub(crate) fn open(path: &Path, config: WorkspaceConfig) -> Result<Self, Report<OpenError>>;
    pub(crate) fn load_capture(&self, file: &Path, table: &str) -> Result<u64, Report<StatementError>>;   // load.rs
    pub(crate) fn create_table(&self, table: &str, sql: &str) -> Result<(), Report<StatementError>>;
    pub(crate) fn describe(&self, sql: &str) -> Result<Vec<(String, String)>, Report<StatementError>>;   // of a query
    pub(crate) fn count(&self, sql: &str) -> Result<u64, Report<StatementError>>;
    pub(crate) fn pipeline_sql(&self, sql: &str) -> Result<String, Report<StatementError>>;
    pub(crate) fn query(&self, sql: &str) -> Result<Rows, Report<StatementError>>;
}
pub(crate) use self::sql::Identifier;            // for pipeline/mod.rs (6) and incremental/staging.rs (8)

// workspace/error.rs
pub(crate) enum OpenError { Configure { setting: Setting, value: Box<str> }, Open { path: PathBuf } }
pub(crate) enum StatementError {
    NotSelect { reason }, StatementCount { count }, TableFunction { name }, UnknownParameter { name },
    UnsupportedType { column, data_type },
    /// DuckDB could not run the statement. Its error, with DuckDB's message, is in the report.
    Failed,
}
```

**The files.** The plan's tree has `mod.rs`, `select.rs` and `rows.rs`. Three more each hold one responsibility that the code already has:

| File        | Content                                                                                                                                        | Why a file of its own                                                                                                             |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `mod.rs`    | `Workspace`, `WorkspaceConfig`, `ByteSize`, `open`, `query`, `create_table`, `describe`, `count`, `pipeline_sql`, `select`, `parameter_values` | the entry point. `ByteSize` (18 lines) only types two settings of `WorkspaceConfig`, so it sits beside it                         |
| `load.rs`   | `load_capture`, `load_batches`, `CaptureSchema`, `SchemaTable`                                                                                 | loading a Parquet file through Arrow, with a table function and `unsafe`. Not `capture.rs`, which would read as the Capture stage |
| `select.rs` | `Select`, as it is                                                                                                                             | in the plan                                                                                                                       |
| `rows.rs`   | `Rows`, as it is                                                                                                                               | in the plan                                                                                                                       |
| `sql.rs`    | `Identifier`, as it is                                                                                                                         | quoting a name in generated SQL. Used by `mod.rs`, `load.rs`, `pipeline/mod.rs` (6) and `staging.rs` (8)                          |
| `error.rs`  | `Setting`, `OpenError`, `StatementError`                                                                                                       | the error types the page names, about 65 lines                                                                                    |

Dependencies added by this milestone:

```toml
duckdb       = { workspace = true, features = ["appender-arrow", "bundled", "json"] }  # json: json_serialize_sql
parquet      = { workspace = true, features = ["arrow", "snap"] }    # snap: read Snappy-compressed captures
serde_json   = { workspace = true }                                   # select.rs
tracing      = { workspace = true, features = ["attributes"] }
hash-integrations-definition = { workspace = true }                   # Variables
# dev: proptest (sql.rs), pretty_assertions
```

`lib.rs` gets no `#![feature]`. In `engine` the five features of `lib.rs:8-15` other than `ip` serve only the DuckDB kinds and `VariantName` (D11).

## Pseudo code

**`open`** (adapted, 65 lines with its doc; from `connection/mod.rs:146-220`)

```rust
pub(crate) fn open(path: &Path, config: WorkspaceConfig) -> Result<Self, Report<OpenError>> {
    let settings = [
        (AllowCommunityExtensions, "false"), (AutoinstallKnownExtensions, "false"),
        (AutoloadKnownExtensions, "false"), (EnableExternalAccess, "false"),
        (MemoryLimit, config.memory_limit?.setting()), (MaxTempDirectorySize, config.temp_directory_limit?.setting()),
        (Threads, config.threads?),                         // a limit that is None is skipped
        (LockConfiguration, "true"),                        // last: nothing can change them after
    ];
    let duckdb_config = each setting into Config::with      // OpenError::Configure { setting, value }
    let duckdb = duckdb::Connection::open_with_flags(path, duckdb_config)?;   // OpenError::Open { path }
    let capture_schema = CaptureSchema::default();
    duckdb.register_table_function_with_extra_info::<SchemaTable, _>("_capture_schema", &capture_schema)?;
    Ok(Self { duckdb, variables: config.variables, capture_schema })
}
```

Gone: the lock file, the `WorkspaceFiles`, the interrupt guard, the metrics and the disk check after opening. There is no `close`: dropping the `Workspace` drops the connection, and DuckDB checkpoints and closes the file. `Setting` displays as DuckDB's name through a `match` over its eight variants, in place of `VariantName`.

**`load_capture` and `load_batches`** (adapted, 59 lines; from `connection/capture.rs:134-190`)

```rust
pub(crate) fn load_capture(&self, file: &Path, table: &str) -> Result<u64, Report<StatementError>> {
    let builder = ParquetRecordBatchReaderBuilder::try_new(File::open(file)?)?;   // Failed
    let schema = builder.schema().clone();
    let batches = builder.build()?;                                                // Failed
    *self.capture_schema.lock()? = Some(schema);         // the table function returns these columns
    let result = self.load_batches(table, batches);
    *self.capture_schema.lock()? = None;
    result
}

fn load_batches(&self, table: &str, batches: ParquetRecordBatchReader) -> Result<u64, Report<StatementError>> {
    let transaction = self.duckdb.unchecked_transaction()?;                        // Failed
    transaction.execute_batch("CREATE OR REPLACE TABLE {table} AS SELECT * FROM _capture_schema()")?;
    let mut rows = 0;
    { let mut appender = transaction.appender(table)?;
      for batch in batches { let batch = batch?; rows += batch.num_rows(); appender.append_record_batch(batch)?; }
      appender.flush()?; }
    transaction.commit()?;                       // a failed load leaves the earlier table as it was
    Ok(rows)
}
```

Changed: it takes a path in place of a `SourceCapture`, returns the number of rows, and reports `StatementError::Failed` in place of `CaptureError`, with the IO, `parquet` or DuckDB error in the report. The cancellation checks and the disk check are gone. The batches are appended in the order of the file, which `_seq` relies on (milestone 8).

**`query` and `create_table`** (adapted, 61 and 34 lines with docs; `connection/mod.rs:259-326`). Unchanged but for the end: the metrics calls (`:300-303`, `:324`) and `check_disk_limit` go. The `# Errors` lists of `workspace/mod.rs:340-403` move onto them without `InvalidQuery`, `InvalidData`, `DiskLimit`, `DiskUsage` and `Stopped`.

**`pipeline_sql`, `describe`, `count`** (adapted, 38 lines; `connection/staging.rs:19-65`). Unchanged but for two things: `check_preparation_cancelled` goes from the first line of each, and every `.map_err(StatementError::from_duckdb).change_context(PreparationError::Statement)` becomes `.change_context(StatementError::Failed)`. `pipeline_count` is named `count`, as on the page. `describe` and `count` run SQL the crate builds, so they skip the `SELECT` check, as in `engine`.

Everywhere else, `map_err(StatementError::from_duckdb)` becomes `change_context(StatementError::Failed)`, the same length (D11).

Moved unchanged: `select` (`connection/mod.rs:227-236`), `parameter_values` (`:238-257`), `Select` (`workspace/select.rs`), `Rows` (`workspace/rows.rs`), `Identifier` (`sql.rs`), `ByteSize` (`byte_size.rs`), `CaptureSchema` and `SchemaTable` (`connection/capture.rs:92-132`).

## Source table

`engine/` is `libs/@local/integrations/engine/src/`. Source lines are measured, result lines estimated.

| New file                         | Item                                    | Comes from                                                                    | Kind    | Lines |
| -------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------- | ------- | ----- |
| `select.rs`                      | `Select`                                | `workspace/select.rs` (92)                                                    | moved   | 92    |
| `rows.rs`                        | `Rows`                                  | `workspace/rows.rs` (88)                                                      | moved   | 88    |
| `sql.rs`                         | `Identifier`                            | `sql.rs:1-29` (29)                                                            | moved   | 29    |
| `mod.rs`                         | `ByteSize`                              | `byte_size.rs` (18)                                                           | moved   | 18    |
| `mod.rs`                         | `select`, `parameter_values`            | `connection/mod.rs:227-257` (31)                                              | moved   | 30    |
| `load.rs`                        | `CaptureSchema`, `SchemaTable`          | `connection/capture.rs:92-132` (41)                                           | moved   | 41    |
| `error.rs`                       | `Setting` with a `match` for its names  | `workspace/error.rs:8-35` (28)                                                | adapted | 29    |
| `error.rs`                       | imports, `OpenError`, `StatementError`  | `workspace/error.rs:1-6`, `:47-66`, `:172-210` (65)                           | adapted | 36    |
| `mod.rs`                         | declarations, imports, re-exports       | `workspace/mod.rs:1-36`, `connection/mod.rs:1-32` (68)                        | adapted | 25    |
| `mod.rs`                         | `WorkspaceConfig`                       | `workspace/mod.rs:38-76` (39)                                                 | adapted | 14    |
| `mod.rs`                         | `Workspace` and its doc                 | `workspace/mod.rs:120-144`, `connection/mod.rs:40-54` (40)                    | adapted | 16    |
| `mod.rs`                         | `open`                                  | `connection/mod.rs:146-220`, doc `workspace/mod.rs:201-221` (96)              | adapted | 65    |
| `mod.rs`                         | `query`                                 | `connection/mod.rs:259-306`, doc `workspace/mod.rs:340-368` (77)              | adapted | 61    |
| `mod.rs`                         | `create_table`                          | `connection/mod.rs:308-326`, doc `workspace/mod.rs:377-403` (46)              | adapted | 34    |
| `mod.rs`                         | `pipeline_sql`, `describe`, `count`     | `connection/staging.rs:19-65` (47)                                            | adapted | 38    |
| `load.rs`                        | imports, `load_capture`, `load_batches` | `connection/capture.rs:1-25`, `:134-190`, doc `workspace/mod.rs:147-155` (91) | adapted | 71    |
| `stage/mod.rs`, `prepare/mod.rs` | `mod prepare;`, `mod workspace;`        | none                                                                          | new     | 3     |

Moved 298, adapted 389, new 3: 690 lines.

## Tests

The tests become unit tests in `workspace/tests.rs`: `Workspace` is `pub(crate)`, so `tests/` cannot reach it. Every moved test needs the same mechanical change, because the functions no longer go through a thread: `#[test]` in place of `#[tokio::test]`, no `.await`, `&str` in place of `"…".into()`, and the helpers `open`, `open_with` and `first_value` become plain functions.

**Moved, with only that change** (from `engine/tests/workspace.rs`): `query_returns_rows_in_column_order` (`:65`), `query_without_rows_keeps_columns` (`:97`), `create_table_replaces_table` (`:115`), `query_refuses_other_statements` (`:191`), `create_table_refuses_other_statement_counts` (`:216`), `query_refuses_disallowed_table_functions` (`:240`), `open_locks_settings` (`:284`), `query_reads_supported_types` (`:316`), `query_refuses_unsupported_types` (`:338`), `query_binds_parameters` (`:782`), `query_refuses_unknown_parameter` (`:835`).

**Moved, and not in the plan's list:** `open_applies_limits` (`:615`). The plan leaves it behind with the disk limit tests, but it checks `memory_limit`, `temp_directory_limit` and `threads`, which are kept. `..WorkspaceConfig::default()` still compiles.

**Moved and adapted:**

- `query_failure_keeps_workspace_open` (`tests/workspace.rs:138`): expects `StatementError::Failed` in place of `InvalidQuery { Catalog }` (D11). It keeps its check that the `duckdb::Error` is in the report.
- `load_capture_types_and_empty_schema` (`tests/capture.rs:465`): also checks that `load_capture` returns 5,000 and 0. `close()` at the end goes.
- `load_invalid_capture_preserves_table` (`tests/capture.rs:546`): expects `StatementError::Failed` in place of `CaptureError::Read`. It still checks that user SQL cannot call `_capture_schema`.

The two `load_capture` tests made their Parquet files with `Workspace::capture`, which is left behind. In `tests.rs`, a helper `write_parquet(path, sql)` writes them instead, with a plain in-memory DuckDB (`Statement::query_arrow`) and `parquet`'s `ArrowWriter`, about 12 lines.

**Moved with its code, unchanged:** the unit test `identifier_round_trips` (`sql.rs:37`).

**New, one test:** `describe_and_count`. `describe` returns the names and DuckDB types of a query's columns, with a `$NAME` parameter bound, and creates no table; `count` returns the number a `SELECT count(*)` gives. Prepare's staging (8) calls both directly, and no moved test does. The SQL steps (6) test them again through `pipeline/mod.rs`.

**Left behind**, with the code they test. From `tests/workspace.rs`: `query_reports_invalid_data` (D11: with one error it checks the same as `query_failure_keeps_workspace_open`); `open_refuses_second_workspace` (lock file); `dropping_request_interrupts_query`, `dropping_queued_request_skips_it`, `dropping_workspace_interrupts_running_query` (cancellation); the five `snapshot_*` tests; `open_refuses_files_over_disk_limit`, `create_table_over_disk_limit_keeps_table`, `disk_limit_counts_temp_directory`, `disk_limit_checkpoints_before_refusing`. All of `tests/workspace_metrics.rs`. From `tests/capture.rs`: the ten tests of `capture` and `SourceCapture::copy_from`. The unit tests `from_duckdb_reads_error_type` (`workspace/error.rs:281`), `words_joins_lowercase_words` and `matches_words_ignores_case_and_spaces` (`variant_name.rs:79`, `:94`), with D11.

## What was stripped

- The thread and its command queue: `answer`, `run`, `serve` (`connection/mod.rs:420-562`, 141), `Command` and `request` (`workspace/mod.rs:78-118`, `:241-261`, 62), the bodies of the async `load_capture`, `open`, `query` and `create_table` (`:156-170`, `:222-239`, `:369-375`, `:404-414`, 51), the async wrappers of `stage_table`, `prepare_pipeline` and `prepare_link_pipeline` (`:263-338`, 76; milestone 6 names two of them too, and they are counted here only), `queue_capacity` with the hand-written `Default` (17), `workspace/reply.rs` (36), and `OpenError::Spawn`, `Stopped` and `StatementError::Stopped`.
- Cancellation: `workspace/interrupt.rs` (185), `Connection::interrupt` (4), and the two checks in `load_batches`. `check_preparation_cancelled` is counted in milestone 6.
- Metrics: `workspace/metrics.rs` (121) and its calls in `query`, `create_table` and `close`.
- Snapshots: `write_copy`, `snapshot` (`connection/mod.rs:328-393`, 66), `Workspace::snapshot` (27), `SnapshotError` (14).
- The disk limit: `DiskUsage`, `file_size`, `workspace_size`, `disk_usage`, `check_disk_limit` (`connection/mod.rs:34-38`, `:83-144`, 67), the check in `open`, `disk_limit` (9), `DiskUsageError` (9), and the `DiskLimit` and `DiskUsage` variants of `OpenError` and `StatementError` (16).
- The lock file: `Connection::lock` (26) and `OpenError::Lock`, `Locked`.
- `workspace/files.rs` (84), all of it. What is left of it is the database path, which `open` takes as it is.
- Closing: `Connection::close` (24), `Workspace::close` (15), `CloseError` (8).
- A query's result written to Parquet: `capture` with `check_capture_cancelled` (`connection/capture.rs:27-90`, 64) and `Workspace::capture` (28).
- The kinds of DuckDB error (D11): `QueryErrorType` and `DataErrorType` (`workspace/error.rs:68-170`, 103), `from_duckdb` (`:212-240`, 29), the variants `InvalidQuery` and `InvalidData` (8), `variant_name.rs` (67), and the `#![feature]` attribute (`lib.rs:8-15`, 7 of its 8 lines; `ip` serves the sources).

About 1,360 lines without tests. About 50 of them (`queue_capacity`, `disk_limit` and the removed variants) lie inside the sources of adapted rows. `check_metadata` goes to milestone 6. `stage_table` goes to milestone 8, as `incremental/staging.rs`. `check_assertions` is stripped, and milestone 8's file counts it.

## Open points

- **Decided:** D11, the classification of DuckDB errors is dropped (`decisions.md`).
- **Settled in `contracts.md`:** `describe`, `count` and `pipeline_sql` return `StatementError`. `PreparationError` is defined by milestone 6, which comes later, and all these functions ever report is a failed statement. Milestone 6 wraps it as `PreparationError::Statement`.
- **Settled in `contracts.md`:** `pipeline_sql` and `Identifier` are on the page. Milestone 6 calls both, and milestone 8's staging uses `Identifier`.
- **Fact:** `describe` takes a query, not a table name: it runs `DESCRIBE ({sql})` (`connection/staging.rs:43`). Milestone 8 passes `SELECT * FROM` with the quoted table name, as `pipeline.rs:92` does.
- **Fact:** `engine`'s `load_capture` takes a `SourceCapture` and returns `()` and `CaptureError` (`connection/capture.rs:135-139`). The page's `&Path`, `u64` and `StatementError` fit with the small changes above.
- **Chosen:** the three limits `memory_limit`, `threads` and `temp_directory_limit` stay as in `engine`, with DuckDB's defaults when unset. Milestone 8 builds `WorkspaceConfig { variables: definition.variables().clone(), ..Default::default() }`. They cost about 35 lines (the three settings in `open`, about 10; the fields with their docs, 7; `ByteSize`, 18) and the test `open_applies_limits`, which is what stripping them would save.
- **Chosen:** `load.rs`, `error.rs` and `sql.rs` are not in the plan's tree. Each holds one responsibility the ported code already has, and `mod.rs` would otherwise grow from about 300 to about 510 lines.
- **Chosen:** the test helper `write_parquet` (about 12 lines in `tests.rs`). The moved `load_capture` tests need a Parquet file, and the code that wrote one, `Workspace::capture`, is left behind.
- **Chosen:** no `close`. The brief names closing, the page has no such function. The database lives in the run's scratch directory and is thrown away, so a checkpoint whose failure is reported buys nothing. Dropping the `Workspace` closes it.
- **Chosen:** a Parquet file that cannot be read is `StatementError::Failed`, with the `parquet` or IO error in the report. `StatementError` has no variant for a file, and adding one is not needed to tell the cases apart in a report.
- **Chosen:** the tests live in `workspace/tests.rs`, one file, since `Workspace` is crate-internal.
- **Chosen:** `ByteSize` keeps its `Display` derive, unused once the disk limit errors are gone. It is moved as it is, so a reviewer can skip it.
