//! This file ccontains items to read IPC data.

use std::sync::Arc;

use arrow2::{
    datatypes::Schema,
    io::ipc::{write::default_ipc_fields, IpcSchema},
};
use arrow_format::ipc::planus::ReadAsRoot;
use tracing::trace;

use super::RecordBatch;
use crate::shared_memory::Segment;

/// Reads the [`RecordBatch`] stored in the given [`Segment`].
///
/// If the data in the [`Segment`] is incorrectly formatted, this method will
/// return an error.
pub fn read_record_batch(segment: &Segment, schema: Arc<Schema>) -> crate::Result<RecordBatch> {
    trace!("started reading record batch");
    trace!("reading from {}", segment.id());

    let batch = read_record_batch_message(segment)?;

    let mut reader = std::io::Cursor::new(segment.get_data_buffer()?);

    let mut scratch = Vec::new();

    let columns = arrow2::io::ipc::read::read_record_batch(
        batch,
        &schema.fields,
        &IpcSchema {
            fields: default_ipc_fields(&schema.fields),
            is_little_endian: cfg!(target_endian = "little"),
        },
        None,
        None,
        &Default::default(),
        arrow_format::ipc::MetadataVersion::V4,
        &mut reader,
        0,
        segment.get_data_buffer_len().unwrap() as u64,
        &mut scratch,
    )?;

    trace!("successfully finished reading from {}", segment.id());
    Ok(RecordBatch::new(schema, columns))
}

/// Loads the Flatbuffers RecordBatch _message_ - i.e. the data in the header (_not_ the data in the
/// actual columns). You may also be interested in the [`read_record_batch`] function, which reads
/// an entire record batch from the IPC data.
pub fn read_record_batch_message(
    segment: &Segment,
) -> crate::Result<arrow_format::ipc::RecordBatchRef<'_>> {
    trace!("started reading RecordBatch header message");
    let metadata = segment.get_metadata()?;
    let msg = arrow_format::ipc::MessageRef::read_as_root(metadata)?;
    let header = msg.header()?.ok_or_else(|| {
        crate::Error::ArrowBatch(
            "the message header was missing on the record batch (this is a bug in the engine)"
                .to_string(),
        )
    })?;
    let batch = match header {
        arrow_format::ipc::MessageHeaderRef::RecordBatch(batch) => batch,
        _ => {
            return Err(crate::Error::ArrowBatch(
                "the message was not a record batch message".to_string(),
            ));
        }
    };

    trace!("successfully finished reading RecordBatch header message");

    Ok(batch)
}
