use alloc::sync::Arc;
use core::error::Error;
use std::{fs::File, path::Path, sync::Mutex};

use duckdb::{
    arrow::datatypes::SchemaRef,
    core::DataChunkHandle,
    vtab::{BindInfo, InitInfo, TableFunctionInfo, VTab, to_duckdb_logical_type_for_field},
};
use error_stack::{Report, ResultExt as _};
use parquet::arrow::arrow_reader::{ParquetRecordBatchReader, ParquetRecordBatchReaderBuilder};

use super::{Identifier, StatementError, Workspace};

#[derive(Clone, Default)]
pub(super) struct CaptureSchema(Arc<Mutex<Option<SchemaRef>>>);

pub(super) struct SchemaTable;

impl VTab for SchemaTable {
    type BindData = ();
    type InitData = ();

    fn bind(bind: &BindInfo) -> Result<(), Box<dyn Error>> {
        #[expect(
            unsafe_code,
            reason = "reads the typed state owned by DuckDB's table function registration"
        )]
        // SAFETY: `_capture_schema` is registered with a cloned `CaptureSchema`. DuckDB owns that
        // allocation until the connection closes, and invokes this callback only while it is alive.
        let state = unsafe { &*bind.get_extra_info::<CaptureSchema>() };
        let guard = state
            .0
            .lock()
            .map_err(|_error| "capture schema lock is poisoned")?;
        let schema = Arc::clone(guard.as_ref().ok_or("no capture is being loaded")?);
        drop(guard);
        for field in schema.fields() {
            bind.add_result_column(field.name(), to_duckdb_logical_type_for_field(field)?);
        }
        Ok(())
    }

    fn init(_: &InitInfo) -> Result<(), Box<dyn Error>> {
        Ok(())
    }

    fn func(
        _: &TableFunctionInfo<Self>,
        output: &mut DataChunkHandle,
    ) -> Result<(), Box<dyn Error>> {
        output.set_len(0);
        Ok(())
    }
}

impl Workspace {
    /// Loads the Parquet file at `file` into `table`, preserving its schema even when it has no
    /// rows, and returns the number of rows.
    ///
    /// The rows keep the order of the file. The replacement is transactional, so a failed load
    /// leaves an existing table as it was. Queries retain their restrictions on external access.
    ///
    /// # Errors
    ///
    /// - [`Failed`] if the file cannot be read as Parquet, or DuckDB cannot load its rows
    ///
    /// [`Failed`]: StatementError::Failed
    pub(crate) fn load_capture(
        &self,
        file: &Path,
        table: &str,
    ) -> Result<u64, Report<StatementError>> {
        let file = File::open(file).change_context(StatementError::Failed)?;
        let builder = ParquetRecordBatchReaderBuilder::try_new(file)
            .change_context(StatementError::Failed)?;
        let schema = Arc::clone(builder.schema());
        let batches = builder.build().change_context(StatementError::Failed)?;
        *self
            .capture_schema
            .0
            .lock()
            .map_err(|_error| Report::new(StatementError::Failed))? = Some(schema);
        let result = self.load_batches(table, batches);
        *self
            .capture_schema
            .0
            .lock()
            .map_err(|_error| Report::new(StatementError::Failed))? = None;
        result
    }

    fn load_batches(
        &self,
        table: &str,
        batches: ParquetRecordBatchReader,
    ) -> Result<u64, Report<StatementError>> {
        let transaction = self
            .duckdb
            .unchecked_transaction()
            .change_context(StatementError::Failed)?;
        transaction
            .execute_batch(&format!(
                "CREATE OR REPLACE TABLE {} AS SELECT * FROM _capture_schema()",
                Identifier::new(table)
            ))
            .change_context(StatementError::Failed)?;
        let mut rows = 0_u64;
        {
            let mut appender = transaction
                .appender(table)
                .change_context(StatementError::Failed)?;
            for batch in batches {
                let batch = batch.change_context(StatementError::Failed)?;
                rows = rows.saturating_add(u64::try_from(batch.num_rows()).unwrap_or(u64::MAX));
                appender
                    .append_record_batch(batch)
                    .change_context(StatementError::Failed)?;
            }
            appender.flush().change_context(StatementError::Failed)?;
        }
        transaction
            .commit()
            .change_context(StatementError::Failed)?;
        Ok(rows)
    }
}
