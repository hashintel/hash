// From `engine/src/workspace/connection/capture.rs:1-25`
use alloc::sync::Arc;
use core::error::Error;
use std::{fs::File, path::Path, sync::Mutex};

use arrow_array::RecordBatch;
use duckdb::{
    arrow::datatypes::SchemaRef,
    core::DataChunkHandle,
    params_from_iter,
    vtab::{BindInfo, InitInfo, TableFunctionInfo, VTab, to_duckdb_logical_type_for_field},
};
use error_stack::{Report, ResultExt as _};
use parquet::{
    arrow::{
        ArrowWriter,
        arrow_reader::{ParquetRecordBatchReader, ParquetRecordBatchReaderBuilder},
    },
    basic::Compression,
    file::properties::WriterProperties,
};

use super::Connection;
use crate::{
    CaptureError, SourceCapture, StatementError, sql::Identifier, workspace::metrics::Operation,
};

// From `engine/src/workspace/connection/capture.rs:92-133`
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

impl Connection {
    // From `engine/src/workspace/mod.rs:147-155`
    /// Loads an immutable capture into `table`, preserving its schema even when it has no rows.
    ///
    /// The replacement is transactional. Queries retain their restrictions on external access.
    ///
    /// # Errors
    ///
    /// Returns [`CaptureError::Read`] for invalid Parquet, [`CaptureError::Query`] for a failed
    /// import, [`CaptureError::DiskUsage`] for a failed workspace disk-limit check, or
    /// [`CaptureError::Stopped`] if the workspace thread stops.
    // From `engine/src/workspace/connection/capture.rs:135-190`
    pub(super) fn load_capture(
        &self,
        capture: &SourceCapture,
        table: &str,
    ) -> Result<(), Report<CaptureError>> {
        let file = File::open(capture.path()).change_context(CaptureError::Read)?;
        let builder =
            ParquetRecordBatchReaderBuilder::try_new(file).change_context(CaptureError::Read)?;
        let schema = Arc::clone(builder.schema());
        let batches = builder.build().change_context(CaptureError::Read)?;
        *self
            .capture_schema
            .0
            .lock()
            .map_err(|_error| Report::new(CaptureError::Read))? = Some(schema);
        let result = self.load_batches(table, batches);
        *self
            .capture_schema
            .0
            .lock()
            .map_err(|_error| Report::new(CaptureError::Read))? = None;
        result
    }

    fn load_batches(
        &self,
        table: &str,
        batches: ParquetRecordBatchReader,
    ) -> Result<(), Report<CaptureError>> {
        let transaction = self
            .duckdb
            .unchecked_transaction()
            .change_context(CaptureError::Query)?;
        transaction
            .execute_batch(&format!(
                "CREATE OR REPLACE TABLE {} AS SELECT * FROM _capture_schema()",
                Identifier::new(table)
            ))
            .change_context(CaptureError::Query)?;
        {
            let mut appender = transaction
                .appender(table)
                .change_context(CaptureError::Query)?;
            for batch in batches {
                self.check_capture_cancelled()?;
                appender
                    .append_record_batch(batch.change_context(CaptureError::Read)?)
                    .change_context(CaptureError::Query)?;
            }
            appender.flush().change_context(CaptureError::Query)?;
        }
        self.check_capture_cancelled()?;
        transaction.commit().change_context(CaptureError::Query)?;
        self.check_disk_limit()
            .change_context(CaptureError::DiskUsage)
    }
}
