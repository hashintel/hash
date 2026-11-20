use std::{fs::File, path::Path};

use error_stack::{Report, ResultExt as _};
use parquet::arrow::arrow_reader::ParquetRecordBatchReaderBuilder;

use crate::{
    run::Stage,
    stage::{StageError, failure::permanent},
};

// Origin: `SourceCapture::open` in `engine/src/capture.rs`.
/// Reads the number of rows of the Parquet file at `file` from its footer. No row is read.
///
/// # Errors
///
/// Returns [`StageError::Permanent`] with the code `capture_file_invalid` if the file is missing
/// or is not Parquet.
pub(super) fn rows(file: &Path) -> Result<u64, Report<StageError>> {
    let invalid = || permanent(Stage::Capture, "capture_file_invalid");
    let file = File::open(file).change_context_lazy(invalid)?;
    let reader = ParquetRecordBatchReaderBuilder::try_new(file).change_context_lazy(invalid)?;
    u64::try_from(reader.metadata().file_metadata().num_rows()).change_context_lazy(invalid)
}
