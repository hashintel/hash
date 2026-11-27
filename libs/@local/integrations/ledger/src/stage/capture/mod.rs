//! Capture, the first stage: stores the files a run works on in the run's folder.

mod changes;
mod footer;
#[cfg(test)]
mod tests;

use alloc::{collections::BTreeMap, sync::Arc};
use std::path::{Path, PathBuf};

use error_stack::{Report, ResultExt as _};
use hash_integrations_definition::{Definition, PrimaryKey, SourceName};
use object_store::ObjectStore;
use url::Url;

use self::changes::Window;
pub(super) use self::changes::{ChangesError, SourceTable};
use super::{
    StageError, begin, end,
    failure::{from_run, permanent, retryable},
};
use crate::{
    run::{self, CapturePart, CapturedFile, RunId, RunRecord, Stage, Watermark, current},
    storage::{Storage, open_bucket},
};

/// The changes of a source's table cannot be captured: the table is of no table of the
/// definition, or its Delta table does not exist or has no change data feed for the run.
const CHANGES_INVALID: &str = "capture_changes_invalid";

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
                watermark: None,
            },
        );
    }
    Ok(CapturePart { sources })
}

/// Captures `run` from the Delta tables a collector wrote, one per table, by the table's name.
///
/// Writes the changes of each table since the last completed run as its capture file, stores the
/// files as [`capture`] does, and records the versions each file holds in `run.json`.
///
/// A table's changes start after the version the last completed run captured of the same table.
/// A table no completed run captured, or whose URL changed, is captured whole, as inserts. The
/// changes of a key collapse to its net change, and an update that changed none of the table's own
/// columns is dropped, so a table without changes gives an empty file. A run that was captured
/// before is left as it is.
///
/// # Errors
///
/// - [`StageError::Permanent`] with the code `capture_changes_invalid` if a table is of no table of
///   the definition, or its Delta table does not exist or has no change data feed for the run,
///   which is recorded in `run.json`, or without writing if the run cannot be captured, as for
///   [`capture`]
/// - [`StageError::Retryable`] if the bucket cannot be read or written
pub async fn capture_changes(
    storage: &Storage,
    run: RunId,
    tables: &BTreeMap<SourceName, Url>,
) -> Result<(), Report<StageError>> {
    let mut open = begin(storage, run, Stage::Capture).await?;
    if open.record.capture.is_some() {
        return Ok(());
    }
    let result = collect(storage, &open.record, tables)
        .await
        .map(|part| open.record.capture = Some(part));
    end(storage, open, result).await
}

/// Writes the capture file of each table, stores the files, and returns the `capture` part with
/// each table's watermark.
async fn collect(
    storage: &Storage,
    record: &RunRecord,
    tables: &BTreeMap<SourceName, Url>,
) -> Result<CapturePart, Report<StageError>> {
    let definition = Definition::from_yaml(&record.input.definition)
        .change_context(permanent(Stage::Capture, CHANGES_INVALID))?;
    let last = last_watermarks(storage).await?;
    let sources = tables
        .iter()
        .map(|(table, url)| {
            let key = definition
                .sources()
                .get(table)
                .and_then(|source| source.primary_key())
                .ok_or_else(|| {
                    Report::new(permanent(Stage::Capture, CHANGES_INVALID))
                        .attach(format!("`{table}` is no table of the definition"))
                })?;
            Ok(Source {
                table: table.clone(),
                url: url.clone(),
                key: key.clone(),
                from: last
                    .get(table.as_ref())
                    .filter(|watermark| *watermark.table == *url.as_str())
                    .map(|watermark| watermark.to_version),
            })
        })
        .collect::<Result<Vec<_>, Report<StageError>>>()?;
    let objects = storage
        .bucket()
        .ok_or_else(|| {
            Report::new(permanent(Stage::Capture, CHANGES_INVALID))
                .attach("the storage has no bucket")
        })
        .and_then(|bucket| {
            open_bucket(bucket).change_context(permanent(Stage::Capture, CHANGES_INVALID))
        })?;
    let scratch = tempfile::tempdir().change_context(retryable(Stage::Capture))?;
    let folder = scratch.path().to_owned();
    // delta-kernel and DuckDB block, so the files are written on a blocking thread.
    let written = tokio::task::spawn_blocking(move || {
        sources
            .into_iter()
            .map(|source| source.write(Arc::clone(&objects), &folder))
            .collect::<Result<Vec<_>, _>>()
    })
    .await
    .change_context(retryable(Stage::Capture))?
    .map_err(|report| {
        let context = match report.current_context() {
            ChangesError::Storage => retryable(Stage::Capture),
            ChangesError::Invalid => permanent(Stage::Capture, CHANGES_INVALID),
        };
        report.change_context(context)
    })?;

    let files = written
        .iter()
        .map(|file| (file.table.clone(), file.path.clone()))
        .collect();
    let mut part = store(storage, record.input.run, &files).await?;
    for file in written {
        if let Some(captured) = part.sources.get_mut(file.table.as_ref()) {
            captured.watermark = Some(file.watermark);
        }
    }
    Ok(part)
}

/// The watermark of each table the last completed run captured from a Delta table.
pub(super) async fn last_watermarks(
    storage: &Storage,
) -> Result<BTreeMap<Box<str>, Watermark>, Report<StageError>> {
    let (current, _) = current::read(storage)
        .await
        .map_err(|report| from_run(Stage::Capture, report))?;
    let Some(last) = current.last_completed else {
        return Ok(BTreeMap::new());
    };
    let (record, _) = run::load(storage, last)
        .await
        .map_err(|report| from_run(Stage::Capture, report))?;
    Ok(record.capture.map_or_else(BTreeMap::new, |capture| {
        capture
            .sources
            .into_iter()
            .filter_map(|(table, file)| Some((table, file.watermark?)))
            .collect()
    }))
}

/// A table to capture from its Delta table, and the version its changes start after.
struct Source {
    table: SourceName,
    url: Url,
    key: PrimaryKey,
    from: Option<u64>,
}

impl Source {
    /// Writes the table's capture file in `folder`, up to its Delta table's newest version. It
    /// blocks.
    fn write(
        self,
        store: Arc<dyn ObjectStore>,
        folder: &Path,
    ) -> Result<WrittenChanges, Report<ChangesError>> {
        let table = SourceTable::open(store, self.url.clone());
        let window = Window {
            from: self.from,
            to: table.version()?,
        };
        let scratch = folder.join(format!("{}.scratch", self.table));
        std::fs::create_dir_all(&scratch).change_context(ChangesError::Invalid)?;
        let path = folder.join(format!("{}.parquet", self.table));
        table.write_changes(window, &self.key, &scratch, &path)?;
        Ok(WrittenChanges {
            watermark: Watermark {
                table: self.url.as_str().into(),
                from_version: window.from,
                to_version: window.to,
            },
            table: self.table,
            path,
        })
    }
}

/// A table's capture file, written from its Delta table, and the versions it holds.
struct WrittenChanges {
    table: SourceName,
    path: PathBuf,
    watermark: Watermark,
}
