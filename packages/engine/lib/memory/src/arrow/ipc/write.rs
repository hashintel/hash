use arrow::{
    datatypes::Schema,
    io::ipc::write::{default_ipc_fields, schema_to_bytes},
};
use arrow_format::ipc::Message;

use crate::{
    arrow::record_batch::RecordBatch,
    shared_memory::{padding::pad_to_8, MemoryId, Metaversion, Segment},
};

/// Contains the data which [`record_batch_msg_offset`] computes. This struct exists to make it
/// impossible to call [`write_record_batch_data_to_bytes`] without first computing the necessary
/// information using [`record_batch_msg_offset`]. Previously we did allow this behaviour, but it
/// could lead to unsafety.
pub struct RecordBatchBytes {
    /// The length (in bytes) of the Arrow columns.
    pub data_len: usize,
    /// The data corresponding to the arrow message.
    pub msg_data: Vec<u8>,
    /// The total offset calculated.
    pub offset: i64,
}

impl RecordBatchBytes {
    /// Returns [`Self::msg_data`], replacing it with an empty vector.
    pub fn take_msg_data(&mut self) -> Vec<u8> {
        let mut empty = Vec::new();

        std::mem::swap(&mut empty, &mut self.msg_data);

        empty
    }
}

/// This function computes the number of bytes the data section of the IPC file takes up.
///
/// More documentation can be found in the [`crate::arrow::ipc::serialize`] module.
///
/// [RecordBatch]: https://arrow.apache.org/docs/format/Columnar.html#recordbatch-message
pub fn calculate_ipc_data_size(record_batch: &super::RecordBatch) -> IpcDataMetadata {
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
            cfg!(target = "litte_endian"),
        )
    }

    IpcDataMetadata {
        body_len: offset as usize,
        nodes,
        buffers,
    }
}

pub struct IpcDataMetadata {
    pub body_len: usize,
    pub nodes: Vec<arrow_format::ipc::FieldNode>,
    pub buffers: Vec<arrow_format::ipc::Buffer>,
}

/// Writes the header of the message to the buffer.
///
/// We write to a `Vec<u8>` beacuse we do not compute the size of the header upfront, and it is
/// likely to be small.
pub fn write_record_batch_message_header(
    buf: &mut Vec<u8>,
    metadata: &IpcDataMetadata,
) -> crate::Result<()> {
    let mut builder = arrow_format::ipc::planus::Builder::new();
    let msg = Message::create(
        &mut builder,
        arrow_format::ipc::MetadataVersion::V4,
        arrow_format::ipc::MessageHeader::RecordBatch(Box::new(arrow_format::ipc::RecordBatch {
            length: metadata.body_len as i64,
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

pub fn write_record_batch_body(record_batch: &RecordBatch, buf: &mut [u8]) -> crate::Result<()> {
    let mut nodes = vec![];
    let mut buffers = vec![];
    let mut offset = 0;

    for col in record_batch.columns() {
        super::serialize::write::write(
            col.as_ref(),
            &mut buffers,
            buf,
            &mut nodes,
            &mut offset,
            true,
        )
    }

    Ok(())
}

pub fn write_record_batch_to_segment(
    record_batch: &RecordBatch,
    schema: &Schema,
    memory_id: MemoryId,
) -> crate::Result<Segment> {
    let metaversion = Metaversion::default().to_le_bytes();

    let data_metadata = calculate_ipc_data_size(record_batch);

    let schema = schema_to_bytes(schema, &default_ipc_fields(&schema.fields));

    let mut metadata = vec![];
    write_record_batch_message_header(&mut metadata, &data_metadata)?;

    let mut segment = Segment::from_sizes(
        memory_id,
        schema.len(),
        metaversion.len(),
        metadata.len(),
        data_metadata.body_len,
        true,
    )?;

    // set header, schema and metadata
    let _ = segment.set_schema(&schema)?;
    let _ = segment.set_header(&metaversion)?;
    let _ = segment.set_metadata(&metadata)?;

    // write the data
    let data_buffer = segment.get_mut_data_buffer()?;
    write_record_batch_body(record_batch, data_buffer)?;

    Ok(segment)
}
