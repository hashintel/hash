# Milestone 3: Stage frame and Capture

## What it adds

Two things. The frame: how every stage starts, ends and fails, written once. And Capture, the first stage, which appends the rows of each table of a run to that table's capture table in the bucket. After this milestone a run can be started and captured, and the two later stages have their frame.

```text
start ──► [ Capture ] ──► Prepare ──► Send
            reads   what one DuckDB query per table gives
            writes  the run's rows in the Delta table capture/{table}, one per table
            last    the `capture` part of run.json
```

**Decided in:** `../plan.md`, step 3, "How a stage writes" and "Capture"; step 4, "Errors". Capture reads queries and writes Delta tables: D18.

## Size

|           | Lines   |                                                  |
| --------- | ------- | ------------------------------------------------ |
| Moved     | 0       |                                                  |
| Adapted   | 0       |                                                  |
| New       | 275     | the frame, the stage error, the steps of Capture |
| **Total** | **275** | **reused 0%**                                    |

The plan estimated 325. One error type for all stages replaced an error type per stage. Several tables per run (D14) added 10 lines. Capture through the lake (D18) removed the Parquet footer (35) and moved the work of writing a table into the lake (milestone 1).

## Interface

In `contracts.md`: `Stage`, `StageError`, `begin`, `end`, and `capture(storage, run, queries)`.

## Pseudo code

**`stage/mod.rs`: what every stage does the same way** (new, 110 lines)

```rust
pub(crate) async fn begin(storage, run, stage) -> Result<Open, Report<StageError>> {
    let (record, version) = run::load(storage, run).await?;         // see the table below
    let (current, _) = run::current::read(storage).await?;
    if current.active != Some(run) && current.last_completed != Some(run) {
        return Err(permanent(stage, "run_not_active"));              // D10. Nothing is written.
    }
    if record.failure.is_some() {
        return Err(permanent(stage, "run_failed"));                  // nothing is written
    }
    let ready = match stage {
        Stage::Capture => true,
        Stage::Prepare => record.capture.is_some(),
        Stage::Send    => record.prepare.is_some(),
    };
    if !ready { return Err(StageError::NotReady { stage }); }
    Ok(Open { record, version })
}

pub(crate) async fn end(storage, mut open, result) -> Result<(), Report<StageError>> {
    match result {
        Ok(()) => run::save(storage, &open.record, Some(&open.version)).await,   // the one write, last
        Err(report) => {
            if let StageError::Permanent { stage, code } = report.current_context() {
                open.record.failure = Some(Failure { stage, code, message: the report's text });
                // If this save fails, the stage still returns its own error. A rerun fails
                // at the same step and records the failure then.
                let _ = run::save(storage, &open.record, Some(&open.version)).await;
            }
            Err(report)                                               // retryable: nothing is written
        }
    }
}
```

What an error of `run` becomes for a stage:

| `RunError`   | Becomes                                                                                            | Written                              |
| ------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `Storage`    | `Retryable`                                                                                        | nothing                              |
| `Changed`    | `Retryable`. Another process wrote `run.json` while the stage worked. A rerun reads the new state. | nothing                              |
| `NotFound`   | `Permanent`, code `run_not_found`                                                                  | nothing, there is no file            |
| `Unreadable` | `Permanent`, code `run_unreadable`                                                                 | nothing, the file cannot be extended |
| `NotActive`  | `Permanent`, code `run_not_active`                                                                 | nothing                              |

**`stage/failure.rs`: the stage error** (new, 64 lines)

`StageError` of `contracts.md`, with its text for a reader of a log, the table above as one conversion, and two small constructors that the stages use where something fails:

```rust
query_error.change_context(permanent(Stage::Capture, "capture_query_invalid"))
storage_error.change_context(retryable(Stage::Capture))
```

A second conversion, `from_lake(stage, invalid, report)`, says what an error of the lake means for a stage:

| `LakeError`    | Becomes                                                    |
| -------------- | ---------------------------------------------------------- |
| `Storage`      | `Retryable`                                                |
| `Invalid`      | `Permanent`, with the code the stage names for its input   |
| `Unconfigured` | `Permanent`, code `storage_unconfigured`: no bucket at all |

**`stage/capture/mod.rs`: the steps of Capture** (new, 101 lines)

```rust
pub async fn capture(storage, run, queries: &BTreeMap<SourceName, Box<str>>) -> Result<(), Report<StageError>> {
    let mut open = stage::begin(storage, run, Stage::Capture).await?;
    if open.record.capture.is_some() { return Ok(()); }              // finished before
    let result = store(storage, run, queries.clone()).await
        .map(|part| open.record.capture = Some(part));
    stage::end(storage, open, result).await
}

async fn store(storage, run, queries) -> Result<CapturePart, Report<StageError>> {
    LakeSettings::of(storage)?.run(capture_failed, move |lake| {     // one lake, on a blocking thread
        let mut sources = BTreeMap::new();
        for (source, query) in &queries {                            // one query per table (D14)
            let key = format!("capture/{source}");
            let table = lake.table(&key)?;
            let rows = if table.has_run(run)? {
                table.rows(run)                                       // appended by an earlier attempt
            } else {
                // the query runs into a temporary table first, so a failing query writes nothing
                table.append_run(run, &lake.stage_query(query)?.numbered("_seq"))
            }?;
            sources.insert(source.into(), CapturedTable { key: key.into(), rows });
        }
        Ok(CapturePart { sources })
    }).await
}
```

A query is DuckDB SQL that gives the rows of one table, such as `SELECT * FROM read_parquet('…')`, `SELECT * FROM read_csv('…')` or `SELECT * FROM delta_scan('s3://…')`. It runs with the bucket's credentials for the integration's place. The queries therefore come from the integration's operator configuration, and never from a definition.

Each query runs once, into a temporary table of the lake. Its rows get the column `_seq`, their position in the query's output, and are appended to the Delta table `capture/{table}` as the rows of the run, in one commit (milestone 1). The first capture of a table fixes its columns. A later query must give columns of the same names, in any order. `run.json` records each table's key and the run's number of rows.

Capture does not read the definition. It appends what the queries give, under the names it is given. A query that fails, or gives other columns than its table has, fails the run for good with the code `capture_query_invalid`, and the `failure` part holds DuckDB's message (D16). A storage without a bucket fails it with `storage_unconfigured`. Tables appended before the failing one keep the run's rows. A bucket or extension that cannot be reached is retryable, and records nothing. Capturing the run again leaves the tables that hold the run as they are.

Prepare checks that the names are those of the definition's tables. A wrong name therefore passes Capture and fails Prepare for good. Either failure is cleared by hand, as D7 has it.

## Source table

| New file               | Item                                                                            | Comes from                                                                                                     | Kind | Lines |
| ---------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---- | ----- |
| `stage/mod.rs`         | `Open`, `begin`, `end`                                                          | none                                                                                                           | new  | 110   |
| `stage/failure.rs`     | `StageError`, its constructors, the conversions from `RunError` and `LakeError` | none                                                                                                           | new  | 64    |
| `stage/capture/mod.rs` | `capture`, `store`                                                              | none. Labs `engine/source_capture.rs:76-180`, `capture_sources`, does the same job for sources it reads itself | new  | 101   |

## Tests

All new. The tests of Capture, 1 to 4, run against MinIO, because Capture writes Delta tables. The tests of the frame, 5 and 6, run on the in-memory store.

1. Capture appends the rows of two queries, each reading a Parquet file, to `capture/aircraft` and `capture/flights`. The `capture` part holds the key and row count of each, and the tables hold the run's rows in the order of `_seq`.
2. A query that reads the capture table of an earlier run with `delta_scan` is captured as a table of its own.
3. A second Capture does nothing, even with a query that would fail: `run.json` is unchanged.
4. A query that reads a missing file, one that reads a file that is not Parquet, one with other columns than its table, and a statement that is not a query each fail for good with `capture_query_invalid`. `run.json` gets the `failure` part with DuckDB's reason, and the earlier run's rows stay.
5. A stage ends with a retryable error: `run.json` is unchanged. A stage ends with a permanent error: `run.json` gets the `failure` part with the code and the message.
6. A stage is refused on a run with a `failure` part, on a run that `current.json` does not name, and Prepare on a run without a `capture` part. Three cases of one test.

Tests 5 and 6 test the frame with a stage's steps replaced by a fixed result. They are the tests for Prepare's and Send's start and end too.

## What was stripped

From `engine/capture.rs`: copying a file on the local disk, publishing it without overwriting, syncing the directory, the nine-variant `CaptureError`, and the row count from the Parquet footer (about 130 of its 154 lines, with its two tests). From `engine`: the source readers, as `../plan.md`, step 2, lists.

## Open points

- **Chosen:** two small constructors, `permanent` and `retryable`, so that a failure site is one line.
- **Chosen:** the failure codes are fixed texts named where the failure happens. There is no enum of all codes. Capture has one of its own, `capture_query_invalid`, for a query that fails or gives other columns than its table. The message says which. Every stage shares `storage_unconfigured`.
- **Decided:** D16, a query that fails fails the run for good, as the plan has it for a wrong file.
- **Decided:** D18, Capture runs a DuckDB query per table and appends to a Delta table. D19, a run is appended to a table once.
- **Chosen:** a stage called on a run with a `failure` part returns the permanent error and writes nothing.
- **Chosen:** a stage called before the stage before it has finished returns `NotReady` and writes nothing. It is not a failure of the run.
- **Decided:** D10, a stage works only on the run that `current.json` names.
