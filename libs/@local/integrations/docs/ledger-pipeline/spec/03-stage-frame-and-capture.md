# Milestone 3: Stage frame and Capture

## What it adds

Two things. The frame: how every stage starts, ends and fails, written once. And Capture, the first stage, which stores the capture file in the bucket. After this milestone a run can be started and captured, and the two later stages have their frame.

```text
start ──► [ Capture ] ──► Prepare ──► Send
            reads   the local Parquet file it is given
            writes  runs/{run}/capture/{table}.parquet, one per table
            last    the `capture` part of run.json
```

**Decided in:** `../plan.md`, step 3, "How a stage writes" and "Capture"; step 4, "Errors".

## Size

|           | Lines   |                                                  |
| --------- | ------- | ------------------------------------------------ |
| Moved     | 0       |                                                  |
| Adapted   | 35      | the row count from the Parquet footer            |
| New       | 270     | the frame, the stage error, the steps of Capture |
| **Total** | **305** | **reused 11%**                                   |

The plan estimated 325. One error type for all stages replaced an error type per stage. Several tables per run (D14) added 10 lines.

## Interface

In `contracts.md`: `Stage`, `StageError`, `begin`, `end`, and `capture(storage, run, files)`.

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

**`stage/failure.rs`: the stage error** (new, 60 lines)

`StageError` of `contracts.md`, with its text for a reader of a log, the table above as one conversion, and two small constructors that the stages use where something fails:

```rust
file_error.change_context(permanent(Stage::Capture, "capture_file_invalid"))
storage_error.change_context(retryable(Stage::Capture))
```

**`stage/capture/mod.rs`: the steps of Capture** (new, 100 lines)

```rust
pub async fn capture(storage, run, files: &BTreeMap<SourceName, PathBuf>) -> Result<(), Report<StageError>> {
    let mut open = stage::begin(storage, run, Stage::Capture).await?;
    if open.record.capture.is_some() { return Ok(()); }              // finished before
    let result = store(storage, run, files).await
        .map(|part| open.record.capture = Some(part));
    stage::end(storage, open, result).await
}

async fn store(storage, run, files) -> Result<CapturePart, Report<StageError>> {
    let mut sources = BTreeMap::new();
    for (source, file) in files {                                    // one file per table (D14)
        let rows = footer::rows(file)?;                              // permanent: missing, or not Parquet
        let key = run::capture_file(run, source);                    // runs/{run}/capture/{source}.parquet
        let size = storage.upload(file, &key).await?;                // retryable
        sources.insert(source.clone(), CapturedFile { key: key.into(), size, rows });
    }
    Ok(CapturePart { sources })
}
```

Capture does not read the definition. It stores the files it is given, under the names it is given. A file that is missing or is not Parquet fails the run for good, and the `failure` part is written (D16). Files uploaded before the failing one stay in the bucket.

Prepare checks that the names are those of the definition's tables. A wrong name therefore passes Capture and fails Prepare for good. Either failure is cleared by hand, as D7 has it.

**`stage/capture/footer.rs`: the row count** (adapted, 35 lines)

```rust
pub(super) fn rows(file: &Path) -> Result<u64, Report<StageError>> {
    let reader = ParquetRecordBatchReaderBuilder::try_new(File::open(file)?)?;
    Ok(u64::try_from(reader.metadata().file_metadata().num_rows())?)      // as `engine` does
}
```

This is the first half of `SourceCapture::open` in `engine`. The rows of the file are not read.

## Source table

| New file                  | Item                                                           | Comes from                                                                                                     | Kind    | Lines |
| ------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------- | ----- |
| `stage/mod.rs`            | `Open`, `begin`, `end`                                         | none                                                                                                           | new     | 110   |
| `stage/failure.rs`        | `StageError`, its constructors, the conversion from `RunError` | none                                                                                                           | new     | 60    |
| `stage/capture/mod.rs`    | `capture`, `store`                                             | none. Labs `engine/source_capture.rs:76-180`, `capture_sources`, does the same job for sources it reads itself | new     | 100   |
| `stage/capture/footer.rs` | `rows`                                                         | `engine/capture.rs:51-60`, `SourceCapture::open` (10 of its 21 lines)                                          | adapted | 35    |

## Tests

All new, on the in-memory store. Five tests:

1. Capture stores two files under `runs/{run}/capture/`, one per table, and the `capture` part holds the key, size and row count of each.
2. A second Capture does nothing: `run.json` is unchanged.
3. A file that is missing, and a file that is not Parquet, fail for good, and `run.json` gets the `failure` part with the code and the message. Two cases of one test.
4. A stage ends with a retryable error: `run.json` is unchanged. A stage ends with a permanent error: `run.json` gets the `failure` part with the code and the message.
5. A stage is refused on a run with a `failure` part, on a run that `current.json` does not name, and Prepare on a run without a `capture` part. Three cases of one test.

Tests 4 and 5 test the frame with a stage's steps replaced by a fixed result. They are the tests for Prepare's and Send's start and end too.

## What was stripped

From `engine/capture.rs`: copying a file on the local disk, publishing it without overwriting, syncing the directory, and the nine-variant `CaptureError` (about 120 of its 154 lines, with its two tests). From `engine`: the source readers, as `../plan.md`, step 2, lists.

## Open points

- **Chosen:** two small constructors, `permanent` and `retryable`, so that a failure site is one line.
- **Chosen:** the failure codes are fixed texts named where the failure happens. There is no enum of all codes. Capture has one, `capture_file_invalid`, for a file that is missing or is not Parquet. The message says which.
- **Decided:** D16, a wrong file fails the run for good, as the plan has it.
- **Chosen:** a stage called on a run with a `failure` part returns the permanent error and writes nothing.
- **Chosen:** a stage called before the stage before it has finished returns `NotReady` and writes nothing. It is not a failure of the run.
- **Fact:** the row count is in the footer and needs no row to be read (`engine/capture.rs:51-60`).
- **Decided:** D10, a stage works only on the run that `current.json` names.
