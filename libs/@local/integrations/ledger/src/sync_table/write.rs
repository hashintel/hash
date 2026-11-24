use deltalake_core::{
    kernel::{
        Action, LogicalFileView,
        transaction::{CommitBuilder, CommitProperties},
    },
    protocol::{DeltaOperation, SaveMode},
    writer::{DeltaWriter as _, RecordBatchWriter},
};
use error_stack::Report;

use super::{RUN, SyncRow, SyncTableError, delta_error, open, row, run_files};
use crate::{RunId, storage::Storage};

/// Replaces the rows of `run` in the sync table with `rows`, in one commit.
///
/// The commit removes the run's files and adds the new ones, so a repeated write leaves the rows
/// of its last attempt. A write that stops before its commit leaves files in the run's partition
/// that no commit names: reads skip them, and nothing deletes them. The commit conflicts only with
/// a concurrent commit that removed files of the run.
///
/// # Errors
///
/// Returns [`SyncTableError::Invalid`] if a row is not of `run`, the storage has no bucket, or the
/// table cannot hold the rows, and [`SyncTableError::Storage`] if the bucket cannot be reached or
/// another commit conflicts.
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
            .map_err(delta_error)?;
    }

    let files = run_files(&table, run).await?;
    #[expect(
        deprecated,
        reason = "the conflict checker takes the files a commit read as `Add` actions"
    )]
    let read_files = files
        .iter()
        .map(LogicalFileView::add_action)
        .collect::<Vec<_>>();
    let mut actions = files
        .iter()
        .map(|file| Action::Remove(file.remove_action(true)))
        .collect::<Vec<_>>();
    let mut writer = RecordBatchWriter::for_table(&table).map_err(delta_error)?;
    if !rows.is_empty() {
        let batch = row::to_batch(&rows, &writer.arrow_schema())?;
        writer.write(batch).await.map_err(delta_error)?;
    }
    actions.extend(
        writer
            .flush()
            .await
            .map_err(delta_error)?
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
    // `CommitProperties` turns on the checkpoint every 100 commits, which `CommitBuilder` alone
    // leaves off.
    CommitBuilder::from(CommitProperties::default())
        .with_actions(actions)
        .with_read_files(read_files)
        .build(
            Some(table.snapshot().map_err(delta_error)?),
            table.log_store(),
            operation,
        )
        .await
        .map_err(delta_error)?;
    Ok(())
}
