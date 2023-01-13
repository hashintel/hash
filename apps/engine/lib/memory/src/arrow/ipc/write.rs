use arrow2::{
    datatypes::Schema,
    io::ipc::write::{default_ipc_fields, schema_to_bytes},
};
use arrow_format::ipc::Message;
use tracing::trace;

use super::serialize::assert_buffer_monotonicity;
use crate::{
    arrow::record_batch::RecordBatch,
    shared_memory::{padding::pad_to_8, MemoryId, Metaversion, Segment},
};

/// This function computes the header data for the given [`RecordBatch`].
///
/// There is more
/// [documentation about record batches](https://arrow.apache.org/docs/format/Columnar.html#recordbatch-message)
/// in the Arrow specification.
// Note: more documentation can be found in the [`crate::arrow::ipc::serialize`] module.
pub fn calculate_ipc_header_data(record_batch: &RecordBatch) -> IpcHeaderData {
    let mut buffers = Vec::new();
    let mut nodes = Vec::new();

    let mut offset = 0;
    let mut data_len = 0;
    for array in record_batch.columns() {
        super::serialize::calculate::write(
            array.as_ref(),
            &mut buffers,
            &mut data_len,
            &mut nodes,
            &mut offset,
            cfg!(target_endian = "little"),
        )
    }

    IpcHeaderData {
        body_len: offset as usize,
        num_rows: if record_batch.columns().is_empty() {
            0
        } else {
            record_batch.column(0).len()
        },
        nodes,
        buffers,
    }
}

#[derive(Debug)]
pub struct IpcHeaderData {
    /// The length of the body, in bytes
    pub body_len: usize,
    pub num_rows: usize,
    pub nodes: Vec<arrow_format::ipc::FieldNode>,
    pub buffers: Vec<arrow_format::ipc::Buffer>,
}

/// Writes the header of the message to the buffer.
pub fn write_record_batch_message_header(
    buf: &mut Vec<u8>,
    metadata: &IpcHeaderData,
) -> crate::Result<()> {
    assert_buffer_monotonicity(&metadata.buffers);

    let mut builder = arrow_format::ipc::planus::Builder::new();
    let msg = Message::create(
        &mut builder,
        arrow_format::ipc::MetadataVersion::V4,
        arrow_format::ipc::MessageHeader::RecordBatch(Box::new(arrow_format::ipc::RecordBatch {
            length: metadata.num_rows as i64,
            nodes: Some(metadata.nodes.clone()),
            buffers: Some(metadata.buffers.clone()),
            compression: None,
        })),
        metadata.body_len as i64,
        Option::<arrow_format::ipc::planus::Offset<_>>::None,
    );
    let data = builder.finish(msg, None);
    let padding_len = pad_to_8(data.len());

    buf.extend_from_slice(data);
    buf.extend_from_slice(&vec![0; padding_len]);

    Ok(())
}

/// Writes the body section of a record batch to the provided buffer.
///
/// **Important**: callers _must_ ensure that the length of the buffer is equal
/// to the value provided by [`calculate_ipc_header_data`] (otherwise this
/// function will panic).
pub fn write_record_batch_body(
    record_batch: &RecordBatch,
    buf: &mut [u8],
    metadata: &IpcHeaderData,
) -> crate::Result<()> {
    let mut nodes = vec![];
    let mut buffers = vec![];
    let mut offset = 0;
    let mut data_len = 0;

    for col in record_batch.columns() {
        let before_offset = offset;

        super::serialize::write::write(
            col.as_ref(),
            &mut buffers,
            buf,
            &mut data_len,
            &mut nodes,
            &mut offset,
            cfg!(target_endian = "little"),
        );

        if offset < before_offset {
            panic!(
                "The offsets list must be increasing, but the offset afterwards was {} (before it \
                 was {})",
                offset, before_offset
            )
        }
    }

    debug_assert_eq!(buffers, metadata.buffers);
    debug_assert_eq!(nodes, metadata.nodes);

    Ok(())
}

pub fn write_record_batch_to_segment(
    record_batch: &RecordBatch,
    schema: &Schema,
    memory_id: MemoryId,
) -> crate::Result<Segment> {
    trace!(
        "writing record batch with schema {:?} to shared memory segment {}",
        schema,
        memory_id
    );

    let metaversion = Metaversion::default().to_le_bytes();

    let header_data = calculate_ipc_header_data(record_batch);

    let schema = schema_to_bytes(schema, &default_ipc_fields(&schema.fields));

    let mut metadata = vec![];
    write_record_batch_message_header(&mut metadata, &header_data)?;

    let mut segment = Segment::from_sizes(
        memory_id,
        schema.len(),
        metaversion.len(),
        metadata.len(),
        header_data.body_len,
        true,
    )?;

    // set header, schema and metadata
    let _ = segment.set_schema(&schema)?;
    let _ = segment.set_header(&metaversion)?;
    let _ = segment.set_metadata(&metadata)?;

    // write the data
    let data_buffer = segment.get_mut_data_buffer()?;
    assert_eq!(data_buffer.len(), header_data.body_len);
    write_record_batch_body(record_batch, data_buffer, &header_data)?;

    Ok(segment)
}
