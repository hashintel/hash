//! The sync table: every entity change of every run. Prepare writes a run's rows, and Send reads
//! them.
//!
//! The table is a Delta table under `sync/` in the integration's place in the bucket. It is
//! partitioned by run, so a run's rows are in files of their own, and each write of a run is one
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
    kernel::{LogicalFileView, transaction::TransactionError},
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
    expect(unused_imports, reason = "only the tests read the sync table")
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

/// Whether running the stage again can help with `error`. An error of the table's contents or of
/// its format cannot pass. Any other error, such as one of the bucket, of the network, or a
/// conflict with another commit, can.
#[expect(
    clippy::wildcard_enum_match_arm,
    reason = "an error this function does not name is one a rerun can help with"
)]
const fn classify(error: &DeltaTableError) -> SyncTableError {
    match error {
        DeltaTableError::Parquet { .. }
        | DeltaTableError::Arrow { .. }
        | DeltaTableError::InvalidJsonLog { .. }
        | DeltaTableError::InvalidStatsJson { .. }
        | DeltaTableError::InvalidVersion(_)
        | DeltaTableError::VersionDowngrade { .. }
        | DeltaTableError::InvalidData { .. }
        | DeltaTableError::NoSchema
        | DeltaTableError::SchemaMismatch { .. }
        | DeltaTableError::PartitionError { .. }
        | DeltaTableError::InvalidPartitionFilter { .. }
        | DeltaTableError::CommitValidation { .. }
        | DeltaTableError::MissingFeature { .. }
        | DeltaTableError::InvalidTableLocation(_)
        | DeltaTableError::SerializeLogJson { .. }
        | DeltaTableError::MetadataError(_)
        | DeltaTableError::UnsupportedColumnMapping { .. }
        | DeltaTableError::Transaction {
            source:
                TransactionError::DeltaTableAppendOnly
                | TransactionError::UnsupportedTableFeatures(_)
                | TransactionError::TableFeaturesRequired(_)
                | TransactionError::SerializeLogJson { .. },
        } => SyncTableError::Invalid,
        _ => SyncTableError::Storage,
    }
}

/// `error` as a report, with the context [`classify`] gives it.
fn delta_error(error: DeltaTableError) -> Report<SyncTableError> {
    let context = classify(&error);
    Report::new(error).change_context(context)
}

/// Makes Delta use its default log store for `s3://` locations. Without `deltalake-aws`,
/// `deltalake-core` registers none for them. The default log store commits with a conditional
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

/// Opens the sync table of `storage`. Its version is `None` if the table does not exist.
///
/// # Errors
///
/// Returns [`SyncTableError::Invalid`] if `storage` has no bucket or the table at its place is not
/// a sync table, and [`SyncTableError::Storage`] if the table cannot be read.
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
        .ok_or_else(|| Report::new(SyncTableError::Invalid).attach("the storage has no bucket"))?;
    let location = Url::parse(&format!("{}/sync", bucket.uri.trim_end_matches('/')))
        .change_context(SyncTableError::Invalid)?;
    let store = open_bucket(bucket).change_context(SyncTableError::Invalid)?;
    let mut table = DeltaTableBuilder::from_url(location.clone())
        .map_err(delta_error)?
        .with_storage_backend(store, location.clone())
        .build()
        .map_err(delta_error)?;
    match table.load().await {
        Ok(()) => {}
        Err(DeltaTableError::NotATable(_)) => return Ok(table),
        Err(error) => return Err(delta_error(error)),
    }

    let snapshot = table.snapshot().map_err(delta_error)?;
    let columns = snapshot.schema().fields().cloned().collect::<Vec<_>>();
    if snapshot.metadata().partition_columns() != [RUN] || columns != row::columns() {
        return Err(Report::new(SyncTableError::Invalid).attach(format!(
            "the table at `{location}` is not partitioned by `{RUN}` or has other columns"
        )));
    }
    Ok(table)
}

/// The data files of `run` in `table`.
///
/// # Errors
///
/// Returns [`SyncTableError::Invalid`] if a file has no run, and [`SyncTableError::Storage`] if the
/// table's files cannot be listed.
async fn run_files(
    table: &DeltaTable,
    run: RunId,
) -> Result<Vec<LogicalFileView>, Report<SyncTableError>> {
    let run = run.to_string();
    let snapshot = table.snapshot().map_err(delta_error)?;
    snapshot
        .snapshot()
        .file_views(table.log_store().as_ref(), None)
        .map_err(delta_error)
        .try_filter_map(|file| {
            let in_run = match file.partition_values_map().get(RUN) {
                Some(Some(value)) => Ok(*value == run),
                Some(None) | None => Err(Report::new(SyncTableError::Invalid)
                    .attach(format!("the file `{}` has no run", file.path()))),
            };
            core::future::ready(in_run.map(|in_run| in_run.then_some(file)))
        })
        .try_collect()
        .await
}
