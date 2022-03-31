use crate::arrow::meta::{Buffer, ColumnDynamicMetadata, Node};

/// Dynamic metadata is metadata specific to a shared batch.
///
/// It contains the Nodes and Buffers that are also in the metadata buffer of a shared batch. This
/// metadata can be modified and later used to overwrite shared batch Arrow metadata
#[derive(Debug, Clone)]
pub struct Dynamic {
    /// Agent count i.e. row count
    pub length: usize,
    /// Length of the data buffer
    pub data_length: usize,
    /// Flattened node metadata
    pub nodes: Vec<Node>,
    /// Flattened buffer metadata
    pub buffers: Vec<Buffer>,
}

impl Dynamic {
    #[must_use]
    pub fn new(
        length: usize,
        data_length: usize,
        nodes: Vec<Node>,
        buffers: Vec<Buffer>,
    ) -> Dynamic {
        Dynamic {
            length,
            data_length,
            nodes,
            buffers,
        }
    }

    pub fn from_column_dynamic_meta_list(
        cols: &[ColumnDynamicMetadata],
        num_elements: usize,
    ) -> Dynamic {
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
        Dynamic {
            length: num_elements,
            data_length,
            nodes,
            buffers,
        }
    }
}
