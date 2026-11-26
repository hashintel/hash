//! Capture, the first stage: stores the files a run works on in the run's folder.

mod footer;
#[cfg(test)]
mod tests;

use alloc::collections::BTreeMap;
use std::path::PathBuf;

use error_stack::{Report, ResultExt as _};
use hash_integrations_definition::SourceName;

use super::{StageError, begin, end, failure::retryable};
use crate::{
    run::{self, CapturePart, CapturedFile, RunId, Stage},
    storage::Storage,
};

/// Captures `run`: stores each of `files` as `runs/{run}/capture/{table}.parquet` and records
/// its key, size and row count in `run.json`.
///
/// `files` holds one Parquet file per table, by the table's name. Capture does not check the
/// names against the definition; Prepare does. A run that was captured before is left as it is.
///
/// # Errors
///
/// - [`StageError::Permanent`] if a file is missing or is not Parquet, which is recorded in
///   `run.json`, or if the run cannot be captured: it is not the run `current.json` names, it
///   failed before, or its `run.json` is missing or unreadable
/// - [`StageError::Retryable`] if the bucket cannot be read or written. Nothing is recorded, and
///   capturing the run again can succeed.
pub async fn capture(
    storage: &Storage,
    run: RunId,
    files: &BTreeMap<SourceName, PathBuf>,
) -> Result<(), Report<StageError>> {
    let mut open = begin(storage, run, Stage::Capture).await?;
    if open.record.capture.is_some() {
        return Ok(());
    }
    let result = store(storage, run, files)
        .await
        .map(|part| open.record.capture = Some(part));
    end(storage, open, result).await
}

/// Uploads each file and returns the `capture` part. Files uploaded before a failing one stay in
/// the bucket.
async fn store(
    storage: &Storage,
    run: RunId,
    files: &BTreeMap<SourceName, PathBuf>,
) -> Result<CapturePart, Report<StageError>> {
    let mut sources = BTreeMap::new();
    for (source, file) in files {
        let rows = footer::rows(file)?;
        let key = run::capture_file(run, source);
        let size = storage
            .upload(file, &key)
            .await
            .change_context(retryable(Stage::Capture))?;
        sources.insert(
            source.as_ref().into(),
            CapturedFile {
                key: key.into(),
                size,
                rows,
            },
        );
    }
    Ok(CapturePart { sources })
}
