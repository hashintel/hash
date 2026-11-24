use deltalake_core::{
    kernel::{Action, transaction::CommitBuilder},
    protocol::{DeltaOperation, SaveMode},
    writer::{DeltaWriter as _, RecordBatchWriter},
};
use error_stack::{Report, ResultExt as _};

use super::{RUN, SyncRow, SyncTableError, open, row, run_files};
use crate::{RunId, storage::Storage};

/// Replaces the rows of `run` in the sync table with `rows`, in one commit.
///
/// The commit removes the run's files and adds the new ones, so a repeated write leaves the rows
/// of its last attempt. A write that stopped before its commit left files that no commit names.
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
    let mut table = open(storage).await?;
    if table.version().is_none() {
        table = table
            .create()
            .with_columns(row::columns())
            .with_partition_columns([RUN])
            .await
            .change_context(SyncTableError::Storage)?;
    }

    let mut actions = run_files(&table, run)
        .await?
        .iter()
        .map(|file| Action::Remove(file.remove_action(true)))
        .collect::<Vec<_>>();
    let mut writer =
        RecordBatchWriter::for_table(&table).change_context(SyncTableError::Storage)?;
    if !rows.is_empty() {
        let batch = row::to_batch(&rows, &writer.arrow_schema())?;
        writer
            .write(batch)
            .await
            .change_context(SyncTableError::Invalid)?;
    }
    actions.extend(
        writer
            .flush()
            .await
            .change_context(SyncTableError::Storage)?
            .into_iter()
            .map(Action::Add),
    );
    if actions.is_empty() {
        return Ok(());
    }

    let operation = DeltaOperation::Write {
        mode: SaveMode::Overwrite,
        partition_by: Some(vec![RUN.to_owned()]),
        predicate: Some(format!("{RUN} = '{run}'")),
    };
    CommitBuilder::default()
        .with_actions(actions)
        .build(
            Some(table.snapshot().change_context(SyncTableError::Storage)?),
            table.log_store(),
            operation,
        )
        .await
        .change_context(SyncTableError::Storage)?;
    Ok(())
}
