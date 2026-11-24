//! The sync table: every entity change of every run. Prepare writes a run's rows, and Send reads
//! them.
//!
//! The table is a Delta table under `sync/` in the integration's place in the bucket. It is
//! partitioned by run, so a run's rows are in files of their own, and a run is written in one
//! commit.

mod read;
mod row;
#[cfg(test)]
mod tests;
mod write;

use alloc::sync::Arc;
use std::sync::Once;

use deltalake_core::{
    DeltaTable, DeltaTableBuilder, DeltaTableError,
    kernel::LogicalFileView,
    logstore::{
        LogStore, LogStoreFactory, ObjectStoreRef, StorageConfig, default_logstore,
        logstore_factories,
    },
};
use error_stack::{Report, ResultExt as _};
use futures_util::TryStreamExt as _;
use url::Url;

#[cfg_attr(
    not(test),
    expect(unused_imports, reason = "Prepare and Send are the first callers")
)]
pub(crate) use self::{
    read::read,
    row::{Op, SyncRow, order_key},
    write::write,
};
use crate::{
    RunId,
    storage::{Storage, open_bucket},
};

/// Reports why the sync table could not be written or read.
#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub(crate) enum SyncTableError {
    /// The bucket could not be reached. Running the stage again can help.
    #[display("the sync table could not be reached")]
    Storage,
    /// A row cannot be written or read, or the storage has no bucket. Running the stage again
    /// cannot help.
    #[display("the sync table cannot hold the rows")]
    Invalid,
}

/// The partition column, which holds the run of a row.
const RUN: &str = "run";

/// Makes Delta use its default log store for `s3://` locations. Delta commits with a conditional
/// write, which S3 and MinIO support, so it needs no lock.
#[derive(Debug)]
struct S3LogStoreFactory;

impl LogStoreFactory for S3LogStoreFactory {
    fn with_options(
        &self,
        prefixed_store: ObjectStoreRef,
        root_store: ObjectStoreRef,
        location: &Url,
        options: &StorageConfig,
    ) -> Result<Arc<dyn LogStore>, DeltaTableError> {
        Ok(default_logstore(
            prefixed_store,
            root_store,
            location,
            options,
        ))
    }
}

/// Opens the sync table of `storage`. Its version is `None` if nothing was written to it yet.
///
/// # Errors
///
/// Returns [`SyncTableError::Invalid`] if `storage` has no bucket, or [`SyncTableError::Storage`]
/// if the table cannot be read.
async fn open(storage: &Storage) -> Result<DeltaTable, Report<SyncTableError>> {
    static REGISTER: Once = Once::new();
    REGISTER.call_once(|| {
        logstore_factories().insert(
            Url::parse("s3://").expect("`s3://` should be a URL"),
            Arc::new(S3LogStoreFactory),
        );
    });

    let bucket = storage
        .bucket()
        .ok_or_else(|| Report::new(SyncTableError::Invalid))?;
    let location = Url::parse(&format!("{}/sync", bucket.uri.trim_end_matches('/')))
        .change_context(SyncTableError::Invalid)?;
    let store = open_bucket(bucket).change_context(SyncTableError::Invalid)?;
    let mut table = DeltaTableBuilder::from_url(location.clone())
        .change_context(SyncTableError::Invalid)?
        .with_storage_backend(store, location)
        .build()
        .change_context(SyncTableError::Invalid)?;
    match table.load().await {
        Ok(()) | Err(DeltaTableError::NotATable(_)) => Ok(table),
        Err(error) => Err(Report::new(error).change_context(SyncTableError::Storage)),
    }
}

/// The data files of `run` in `table`.
///
/// # Errors
///
/// Returns [`SyncTableError::Storage`] if the table's files cannot be listed.
async fn run_files(
    table: &DeltaTable,
    run: RunId,
) -> Result<Vec<LogicalFileView>, Report<SyncTableError>> {
    let run = run.to_string();
    let snapshot = table.snapshot().change_context(SyncTableError::Storage)?;
    snapshot
        .snapshot()
        .file_views(table.log_store().as_ref(), None)
        .try_filter(|file| {
            core::future::ready(
                file.partition_values_map()
                    .get(RUN)
                    .is_some_and(|value| value.as_deref() == Some(run.as_str())),
            )
        })
        .try_collect()
        .await
        .change_context(SyncTableError::Storage)
}
