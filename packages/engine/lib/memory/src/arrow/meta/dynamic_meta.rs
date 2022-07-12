use arrow::ipc;
use flatbuffers::FlatBufferBuilder;

use crate::{
    arrow::meta::{Buffer, ColumnDynamicMetadata, Node},
    Error,
};

/// Dynamic metadata is metadata specific to a shared batch.
///
/// It contains the Nodes and Buffers that are also in the metadata buffer of a shared batch. This
/// metadata can be modified and later used to overwrite shared batch Arrow metadata
#[derive(Debug, Clone)]
pub struct DynamicMetadata {
    /// Agent count i.e. row count
    pub length: usize,
    /// Length of the data buffer
    pub data_length: usize,
    /// Flattened node metadata
    pub nodes: Vec<Node>,
    /// Flattened buffer metadata
    pub buffers: Vec<Buffer>,
}

impl DynamicMetadata {
    #[must_use]
    pub fn new(
        length: usize,
        data_length: usize,
        nodes: Vec<Node>,
        buffers: Vec<Buffer>,
    ) -> DynamicMetadata {
        DynamicMetadata {
            length,
            data_length,
            nodes,
            buffers,
        }
    }

    pub fn from_column_dynamic_meta_list(
        cols: &[ColumnDynamicMetadata],
        num_elements: usize,
    ) -> DynamicMetadata {
        let nodes = cols.iter().flat_map(|meta| meta.nodes()).cloned().collect();
        let mut buffers = Vec::with_capacity(cols.iter().map(|d| d.buffers.len()).sum());
        let mut next_offset = 0;

        for metadata in cols {
            for buffer in &metadata.buffers {
                let new_buffer = Buffer::new(next_offset, buffer.length, buffer.padding);
                next_offset = new_buffer.get_next_offset();
                buffers.push(new_buffer);
            }
        }

        let data_length = buffers
            .last()
            .map(|buffer: &Buffer| buffer.get_next_offset())
            .unwrap_or(0);
        DynamicMetadata {
            length: num_elements,
            data_length,
            nodes,
            buffers,
        }
    }

    /// Constructs the relevant [`DynamicMetadata`] from the given [`arrow::ipc::RecordBatch`]
    /// message (note: not [`arrow::record_batch::RecordBatch`]).
    pub fn from_record_batch(
        record_batch: &ipc::RecordBatch<'_>,
        data_length: usize,
    ) -> crate::Result<Self> {
        let nodes = record_batch
            .nodes()
            .ok_or_else(|| Error::ArrowBatch("Missing field nodes".into()))?
            .iter()
            .map(|n| Node {
                length: n.length() as usize,
                null_count: n.null_count() as usize,
            })
            .collect();

        let buffers = record_batch
            .buffers()
            .ok_or_else(|| Error::ArrowBatch("Missing buffers".into()))?;

        let buffers: Vec<Buffer> = buffers
            .iter()
            .enumerate()
            .map(|(i, b)| {
                let padding = buffers
                    .get(i + 1)
                    .map_or(data_length - (b.offset() + b.length()) as usize, |next| {
                        (next.offset() - b.offset() - b.length()) as usize
                    });

                Ok(Buffer {
                    offset: b.offset() as usize,
                    length: b.length() as usize,
                    padding,
                })
            })
            .collect::<crate::Result<_>>()?;

        Ok(DynamicMetadata {
            length: record_batch.length() as usize,
            data_length,
            nodes,
            buffers,
        })
    }

    /// Computes the flat_buffers builder from the metadata, using this builder
    /// the metadata of a shared batch can be modified
    pub fn get_flatbuffers(&self) -> crate::Result<Vec<u8>> {
        // TODO: OPTIM: Evaluate, if we want to return the flatbuffer instead to remove the
        // slice-to-vec   conversion.
        // Build Arrow Buffer and FieldNode messages
        let buffers: Vec<ipc::Buffer> = self
            .buffers
            .iter()
            .map(|b| ipc::Buffer::new(b.offset as i64, b.length as i64))
            .collect();
        let nodes: Vec<ipc::FieldNode> = self
            .nodes
            .iter()
            .map(|n| ipc::FieldNode::new(n.length as i64, n.null_count as i64))
            .collect();

        let mut fbb = FlatBufferBuilder::new();

        // Copied from `ipc.rs` from function `record_batch_to_bytes`
        // with some modifications:
        // - `meta.length` is used instead of `batch.num_rows()` (refers to the same thing)
        // - `meta.data_length ` is used instead of `arrow_data.len()` (same thing)
        let buffers = fbb.create_vector(&buffers);
        let nodes = fbb.create_vector(&nodes);

        let root = {
            let mut batch_builder = ipc::RecordBatchBuilder::new(&mut fbb);
            batch_builder.add_length(self.length as i64);
            batch_builder.add_nodes(nodes);
            batch_builder.add_buffers(buffers);
            let b = batch_builder.finish();
            b.as_union_value()
        };
        // create an ipc::Message
        let mut message = ipc::MessageBuilder::new(&mut fbb);
        message.add_version(ipc::MetadataVersion::V4);
        message.add_header_type(ipc::MessageHeader::RecordBatch);
        message.add_bodyLength(self.data_length as i64);
        message.add_header(root);
        let root = message.finish();
        fbb.finish(root, None);
        let finished_data = fbb.finished_data();

        Ok(finished_data.to_vec())
    }
}
