use deltalake_core::{
    kernel::{Transaction, transaction::CommitProperties},
    writer::{DeltaWriter as _, RecordBatchWriter},
};
use error_stack::{Report, ResultExt as _};

use super::{RUN, SyncRow, SyncTableError, open, row, run_files};
use crate::{RunId, storage::Storage};

/// Appends the rows of `run` to the sync table, in one commit. Does nothing if the table holds
/// rows of `run` already.
///
/// A write that stopped before its commit left files that no commit names, and is written again.
/// The commit names `run` as its application transaction, so two writes of `run` at the same
/// time cannot both commit.
///
/// # Errors
///
/// Returns [`SyncTableError::Invalid`] if a row is not of `run` or cannot be written, or the
/// storage has no bucket, and [`SyncTableError::Storage`] if the table cannot be read or written.
pub(crate) async fn write(
    storage: &Storage,
    run: RunId,
    rows: Vec<SyncRow>,
) -> Result<(), Report<SyncTableError>> {
    if let Some(row) = rows.iter().find(|row| row.run != run) {
        return Err(Report::new(SyncTableError::Invalid).attach(format!(
            "a row of run {} was written for run {run}",
            row.run
        )));
    }
    if rows.is_empty() {
        return Ok(());
    }
    let mut table = open(storage).await?;
    if table.version().is_none() {
        table = table
            .create()
            .with_columns(row::columns())
            .with_partition_columns([RUN])
            .await
            .change_context(SyncTableError::Storage)?;
    }
    if !run_files(&table, run).await?.is_empty() {
        return Ok(());
    }

    let mut writer = RecordBatchWriter::for_table(&table)
        .change_context(SyncTableError::Storage)?
        .with_commit_properties(
            CommitProperties::default()
                .with_application_transaction(Transaction::new(application_id(run), 0)),
        );
    let batch = row::to_batch(&rows, &writer.arrow_schema())?;
    writer
        .write(batch)
        .await
        .change_context(SyncTableError::Invalid)?;
    writer
        .flush_and_commit(&mut table)
        .await
        .change_context(SyncTableError::Storage)?;
    Ok(())
}

/// The application id a commit of `run` carries.
fn application_id(run: RunId) -> String {
    format!("ledger/run/{run}")
}
