//! This file loads data from memory into

use std::sync::Arc;

use arrow2::{
    datatypes::Schema,
    io::ipc::{write::default_ipc_fields, IpcSchema},
};
use arrow_format::ipc::planus::ReadAsRoot;
use tracing::log::trace;

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

    let columns = arrow2::io::ipc::read::read_record_batch(
        batch,
        &schema.fields,
        &IpcSchema {
            fields: default_ipc_fields(&schema.fields),
            is_little_endian: cfg!(target_endian = "little"),
        },
        None,
        &Default::default(),
        arrow_format::ipc::MetadataVersion::V4,
        &mut reader,
        0,
    )?;

    trace!("successfully finished reading record batch");
    Ok(RecordBatch { schema, columns })
}

/// Loads the Flatbuffers RecordBatch _message_ - i.e. the data in the header (_not_ the data in the
/// actual columns). You may also be interested in the [`record_batch`] function, which reads an
/// entire record batch (metadata and all).
///
/// Unfortunately, there is some confusing naming here:
/// - in arrow-rs (i.e. not `arrow2` which is what we use) there are two types: one in `ipc` called
///   `RecordBatch`, and another in `record_batch` called `RecordBatch`
///   - ipc RecordBatch refers only to the _header_ - i.e. the data at the start of the batch which
///     provides all the offsets at which the columns are in the file
///   - record_batch RecordBatch is what arrow-rs uses to store the entire
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
