use arrow_format::ipc;
use tracing::trace;

use crate::{
    arrow::meta::{Buffer, ColumnDynamicMetadata, Node},
    Error,
};

/// Dynamic metadata is metadata specific to a shared batch (the difference between
/// [`DynamicMetadata`] and [`StaticMetadata`] is that the
/// dynamic metadata changes as the Arrow arrays are mutated, whereas the static metadata does not).
///
/// It contains the Nodes and Buffers that are also in the metadata buffer of a shared batch. This
/// metadata can be modified and later used to overwrite shared batch Arrow metadata.
///
/// [`StaticMetadata`]: crate::arrow::meta::StaticMetadata
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

    /// Constructs the relevant [`DynamicMetadata`] from the given
    /// [`arrow_format::ipc::RecordBatchRef`] message.
    pub fn from_record_batch(
        record_batch: &arrow_format::ipc::RecordBatchRef<'_>,
        data_length: usize,
    ) -> crate::Result<Self> {
        trace!("started reading dynamic metadata from the RecordBatchRef");

        let nodes = record_batch
            .nodes()?
            .ok_or_else(|| Error::ArrowBatch("Missing field nodes".into()))?
            .iter()
            .map(|n| Node {
                length: n.length() as usize,
                null_count: n.null_count() as usize,
            })
            .collect();

        let buffers = record_batch
            .buffers()?
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

        trace!("successfully finished reading dynamic metadata from the RecordBatchRef");

        Ok(DynamicMetadata {
            length: record_batch.length()? as usize,
            data_length,
            nodes,
            buffers,
        })
    }

    /// Computes the flat_buffers builder from the metadata, using this builder
    /// the metadata of a shared batch can be modified
    pub fn get_flatbuffers(&self) -> crate::Result<Vec<u8>> {
        let mut builder = arrow_format::ipc::planus::Builder::new();

        // TODO: OPTIM: Evaluate, if we want to return the flatbuffer instead to remove the
        // slice-to-vec   conversion.
        // Build Arrow Buffer and FieldNode messages
        let buffers: Vec<ipc::Buffer> = self
            .buffers
            .iter()
            .map(|b| ipc::Buffer {
                offset: b.offset as i64,
                length: b.length as i64,
            })
            .collect();
        let nodes: Vec<ipc::FieldNode> = self
            .nodes
            .iter()
            .map(|n| ipc::FieldNode {
                length: n.length as i64,
                null_count: n.null_count as i64,
            })
            .collect();

        let message = ipc::Message::create(
            &mut builder,
            ipc::MetadataVersion::V4,
            ipc::MessageHeader::RecordBatch(Box::new(ipc::RecordBatch {
                length: self.length as i64,
                nodes: Some(nodes),
                buffers: Some(buffers),
                compression: None,
            })),
            self.data_length as i64,
            Option::<Vec<arrow_format::ipc::KeyValue>>::None,
        );
        let finished_data = builder.finish(message, None);

        Ok(finished_data.to_vec())
    }
}
