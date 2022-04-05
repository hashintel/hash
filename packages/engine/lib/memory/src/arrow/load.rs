use std::sync::Arc;

use arrow::{datatypes::Schema, ipc, ipc::reader::read_record_batch, record_batch::RecordBatch};

use crate::{
    error::{Error, Result},
    shared_memory::Segment,
};

/// Read the Arrow RecordBatch metadata from memory
pub fn record_batch_message(segment: &Segment) -> Result<ipc::RecordBatch<'_>> {
    let meta_buffer = segment.get_batch_buffers()?.meta();
    ipc::root_as_message(meta_buffer)?
        .header_as_record_batch()
        .ok_or(Error::InvalidRecordBatchIpcMessage)
}

pub fn record_batch(
    segment: &Segment,
    record_batch_message: ipc::RecordBatch<'_>,
    schema: Arc<Schema>,
) -> Result<RecordBatch> {
    let data_buffer = segment.get_batch_buffers()?.data();
    Ok(read_record_batch(
        data_buffer,
        record_batch_message,
        schema,
        &[],
    )?)
}
