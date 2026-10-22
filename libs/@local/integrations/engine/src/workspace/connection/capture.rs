use std::path::Path;

use arrow_array::{
    Array as _, RecordBatch, StructArray,
    ffi::{FFI_ArrowArray, FFI_ArrowSchema, from_ffi},
};
use duckdb::{
    arrow::{array::Array as _, ffi::to_ffi, record_batch::RecordBatch as DuckDbRecordBatch},
    params_from_iter,
};
use error_stack::{Report, ResultExt as _};
use parquet::{arrow::ArrowWriter, basic::Compression, file::properties::WriterProperties};

use super::Connection;
use crate::{CaptureError, SourceCapture, StatementError};

fn parquet_batch(
    batch: &duckdb::arrow::array::StructArray,
) -> Result<RecordBatch, Report<CaptureError>> {
    let (mut array, mut schema) = to_ffi(&batch.to_data()).change_context(CaptureError::Write)?;
    #[expect(
        unsafe_code,
        reason = "transfers Arrow batches through the stable C data interface"
    )]
    // SAFETY: Both Arrow versions implement the stable C data interface. `from_raw` moves each
    // owned export and clears its release callback, so each allocation is released exactly once.
    // The array and schema come from the same valid batch and remain owned through the import.
    let data = unsafe {
        let array = FFI_ArrowArray::from_raw((&raw mut array).cast());
        let schema = FFI_ArrowSchema::from_raw((&raw mut schema).cast());
        from_ffi(array, &schema)
    }
    .change_context(CaptureError::Write)?;
    Ok(RecordBatch::from(&StructArray::from(data)))
}

impl Connection {
    fn check_capture_cancelled(&self) -> Result<(), Report<CaptureError>> {
        if self.interrupt().is_interrupted() {
            Err(Report::new(CaptureError::Cancelled))
        } else {
            Ok(())
        }
    }

    #[tracing::instrument(level = "debug", skip(self, sql))]
    pub(super) fn capture(
        &self,
        sql: &str,
        target: &Path,
    ) -> Result<SourceCapture, Report<CaptureError>> {
        if self.files.contains(target) {
            return Err(Report::new(CaptureError::WorkspaceFile {
                path: target.to_owned(),
            }));
        }
        let select = self.select(sql).change_context(CaptureError::Query)?;
        let mut partial = SourceCapture::stage(target)?;
        let mut statement = self
            .duckdb
            .prepare(select.as_str())
            .map_err(StatementError::from_duckdb)
            .change_context(CaptureError::Query)?;
        let values = self
            .parameter_values(&statement)
            .change_context(CaptureError::Query)?;
        let batches = statement
            .stream_arrow(params_from_iter(values))
            .map_err(StatementError::from_duckdb)
            .change_context(CaptureError::Query)?;
        let properties = WriterProperties::builder()
            .set_compression(Compression::SNAPPY)
            .set_max_row_group_row_count(Some(64 * 1024))
            .build();
        let schema = parquet_batch(&duckdb::arrow::array::StructArray::from(
            DuckDbRecordBatch::new_empty(batches.get_schema()),
        ))?
        .schema();
        let mut writer = ArrowWriter::try_new(partial.as_file_mut(), schema, Some(properties))
            .change_context(CaptureError::Write)?;
        drop(batches);
        let mut rows = 0_u64;
        while let Some(array) = statement
            .step()
            .map_err(StatementError::from_duckdb)
            .change_context(CaptureError::Query)?
        {
            self.check_capture_cancelled()?;
            let batch = parquet_batch(&array)?;
            writer.write(&batch).change_context(CaptureError::Write)?;
            if writer.in_progress_size() >= 8 * 1024 * 1024 {
                writer.flush().change_context(CaptureError::Write)?;
            }
            rows = rows.saturating_add(u64::try_from(batch.num_rows()).unwrap_or(u64::MAX));
        }
        writer.close().change_context(CaptureError::Write)?;
        self.metrics.rows("capture", rows);
        self.check_disk_limit()
            .change_context(CaptureError::Query)?;
        self.check_capture_cancelled()?;
        SourceCapture::publish(partial, target, rows)
    }
}

#[derive(Clone, Default)]
pub(super) struct CaptureSchema(
    alloc::sync::Arc<std::sync::Mutex<Option<duckdb::arrow::datatypes::SchemaRef>>>,
);

pub(super) struct SchemaTable;

impl duckdb::vtab::VTab for SchemaTable {
    type BindData = ();
    type InitData = ();

    fn bind(bind: &duckdb::vtab::BindInfo) -> Result<(), Box<dyn core::error::Error>> {
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
        let schema = alloc::sync::Arc::clone(guard.as_ref().ok_or("no capture is being loaded")?);
        drop(guard);
        for field in schema.fields() {
            bind.add_result_column(
                field.name(),
                duckdb::vtab::to_duckdb_logical_type_for_field(field)?,
            );
        }
        Ok(())
    }

    fn init(_: &duckdb::vtab::InitInfo) -> Result<(), Box<dyn core::error::Error>> {
        Ok(())
    }

    fn func(
        _: &duckdb::vtab::TableFunctionInfo<Self>,
        output: &mut duckdb::core::DataChunkHandle,
    ) -> Result<(), Box<dyn core::error::Error>> {
        output.set_len(0);
        Ok(())
    }
}

fn workspace_batch(batch: RecordBatch) -> Result<DuckDbRecordBatch, Report<CaptureError>> {
    let batch = StructArray::from(batch);
    let (mut array, mut schema) =
        arrow_array::ffi::to_ffi(&batch.to_data()).change_context(CaptureError::Read)?;
    #[expect(
        unsafe_code,
        reason = "transfers Arrow batches through the stable C data interface"
    )]
    // SAFETY: The matched exports implement the stable Arrow C data ABI. `from_raw` transfers
    // ownership and clears each original release callback, leaving one owner for every allocation.
    let data = unsafe {
        let array = duckdb::arrow::ffi::FFI_ArrowArray::from_raw((&raw mut array).cast());
        let schema = duckdb::arrow::ffi::FFI_ArrowSchema::from_raw((&raw mut schema).cast());
        duckdb::arrow::ffi::from_ffi(array, &schema)
    }
    .change_context(CaptureError::Read)?;
    Ok(DuckDbRecordBatch::from(
        &duckdb::arrow::array::StructArray::from(data),
    ))
}

impl Connection {
    pub(super) fn load_capture(
        &self,
        capture: &SourceCapture,
        table: &str,
    ) -> Result<(), Report<CaptureError>> {
        let file = std::fs::File::open(capture.path()).change_context(CaptureError::Read)?;
        let builder = parquet::arrow::arrow_reader::ParquetRecordBatchReaderBuilder::try_new(file)
            .change_context(CaptureError::Read)?;
        let empty = workspace_batch(RecordBatch::new_empty(alloc::sync::Arc::clone(
            builder.schema(),
        )))?;
        let batches = builder.build().change_context(CaptureError::Read)?;
        *self
            .capture_schema
            .0
            .lock()
            .map_err(|_error| Report::new(CaptureError::Read))? = Some(empty.schema());
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
        batches: parquet::arrow::arrow_reader::ParquetRecordBatchReader,
    ) -> Result<(), Report<CaptureError>> {
        let transaction = self
            .duckdb
            .unchecked_transaction()
            .change_context(CaptureError::Query)?;
        transaction
            .execute_batch(&format!(
                "CREATE OR REPLACE TABLE {} AS SELECT * FROM _capture_schema()",
                crate::sql::Identifier::new(table)
            ))
            .change_context(CaptureError::Query)?;
        {
            let mut appender = transaction
                .appender(table)
                .change_context(CaptureError::Query)?;
            for batch in batches {
                self.check_capture_cancelled()?;
                appender
                    .append_record_batch(workspace_batch(
                        batch.change_context(CaptureError::Read)?,
                    )?)
                    .change_context(CaptureError::Query)?;
            }
            appender.flush().change_context(CaptureError::Query)?;
        }
        self.check_capture_cancelled()?;
        transaction.commit().change_context(CaptureError::Query)?;
        self.check_disk_limit().change_context(CaptureError::Query)
    }
}
