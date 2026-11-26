use deltalake_core::parquet::arrow::arrow_reader::ParquetRecordBatchReaderBuilder;
use error_stack::{Report, ResultExt as _};
use object_store::ObjectStoreExt as _;

use super::{SyncRow, SyncTableError, open, order_key, row, run_files};
use crate::{RunId, storage::Storage};

/// The rows of `run`, ordered by `seq`, then by [`order_key`]. A run that was never written has
/// no rows.
///
/// # Errors
///
/// Returns [`SyncTableError::Invalid`] if a row cannot be read, a data file is missing, or the
/// storage has no bucket, and [`SyncTableError::Storage`] if the table cannot be read.
pub(crate) async fn read(
    storage: &Storage,
    run: RunId,
) -> Result<Vec<SyncRow>, Report<SyncTableError>> {
    let table = open(storage).await?;
    if table.version().is_none() {
        return Ok(Vec::new());
    }
    let store = table.object_store();
    let mut rows = Vec::new();
    for file in run_files(&table, run).await? {
        let location = file.object_store_path();
        let bytes = store
            .get(&location)
            .await
            .map_err(|error| {
                // Nothing deletes a data file a commit names, so a missing one stays missing.
                let context = if matches!(error, object_store::Error::NotFound { .. }) {
                    SyncTableError::Invalid
                } else {
                    SyncTableError::Storage
                };
                Report::new(error)
                    .change_context(context)
                    .attach(format!("the data file `{location}`"))
            })?
            .bytes()
            .await
            .change_context(SyncTableError::Storage)?;
        let batches = ParquetRecordBatchReaderBuilder::try_new(bytes)
            .change_context(SyncTableError::Invalid)?
            .build()
            .change_context(SyncTableError::Invalid)?;
        for batch in batches {
            rows.extend(row::from_batch(
                run,
                &batch.change_context(SyncTableError::Invalid)?,
            )?);
        }
    }
    // `write` keeps the caller's order, and a run's rows can be in several files, which are
    // listed in no fixed order.
    rows.sort_by_key(|row| (row.seq, order_key(&row.entity_id)));
    Ok(rows)
}
