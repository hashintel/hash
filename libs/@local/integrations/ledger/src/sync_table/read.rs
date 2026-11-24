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
/// Returns [`SyncTableError::Invalid`] if a row cannot be read or the storage has no bucket, and
/// [`SyncTableError::Storage`] if the table cannot be read.
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
    for location in run_files(&table, run).await? {
        let bytes = store
            .get(&location)
            .await
            .change_context(SyncTableError::Storage)?
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
    // A run's rows can be in more than one file, which are listed in no fixed order. Rows with
    // the same `seq` are ordered by their entity.
    rows.sort_by_key(|row| (row.seq, order_key(&row.entity_id)));
    Ok(rows)
}
