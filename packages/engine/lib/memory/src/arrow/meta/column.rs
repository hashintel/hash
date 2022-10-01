use crate::{
    arrow::{
        meta::{Buffer, Node, NodeMapping},
        util::bit_util,
    },
    shared_memory::padding,
};

// Information that is constant throughout a simulation run
#[derive(Clone, Debug, PartialEq)]
pub struct Column {
    pub node_start: usize,
    pub node_count: usize,
    pub buffer_start: usize,
    /// Number of buffers in total,
    /// i.e. `buffer_count == buffer_counts.iter().sum()`
    pub buffer_count: usize,
    pub root_node_mapping: NodeMapping,
    /// Number of buffers per node,
    /// i.e. `node_count` == `buffer_counts.len()`
    pub buffer_counts: Vec<usize>, // TODO: rename to something like num_buffers_per_node
}

pub struct ColumnDynamicMetadata {
    /// Flattened node metadata
    nodes: Vec<Node>,
    /// Flattened buffer metadata
    pub buffers: Vec<Buffer>,
}

impl ColumnDynamicMetadata {
    pub fn nodes(&self) -> &[Node] {
        &self.nodes
    }

    pub fn byte_length(&self) -> usize {
        self.buffers
            .last()
            .map(|buffer| buffer.get_next_offset())
            .unwrap_or(0)
    }
}

#[derive(Debug, Default)]
pub struct ColumnDynamicMetadataBuilder {
    nodes: Vec<Node>,
    buffers: Vec<Buffer>,
    next_offset: usize,
}

impl ColumnDynamicMetadataBuilder {
    pub fn with_capacities(
        node_capacity: usize,
        buffer_capacity: usize,
    ) -> ColumnDynamicMetadataBuilder {
        ColumnDynamicMetadataBuilder {
            nodes: Vec::with_capacity(node_capacity),
            buffers: Vec::with_capacity(buffer_capacity),
            next_offset: 0,
        }
    }

    fn add_buffer(&mut self, num_bytes: usize, num_padding_bytes: usize) {
        let buffer = Buffer::new(self.next_offset, num_bytes, num_padding_bytes);
        self.next_offset = buffer.get_next_offset();
        self.buffers.push(buffer);
    }

    pub fn add_static_bit_buffer(&mut self, num_elements: usize) {
        let buf_len = bit_util::ceil(num_elements, 8);
        let buf_padding = padding::get_static_buffer_pad(buf_len);
        self.add_buffer(buf_len, buf_padding);
    }

    pub fn add_static_byte_buffer(&mut self, num_bytes: usize) {
        let num_padding_bytes = padding::get_static_buffer_pad(num_bytes);
        self.add_buffer(num_bytes, num_padding_bytes);
    }

    pub fn add_node(&mut self, num_elements: usize, num_null_elements: usize) {
        self.nodes.push(Node::new(num_elements, num_null_elements));
    }

    pub fn add_string_array_dynamic_meta(&mut self, num_elements: usize, num_total_chars: usize) {
        self.add_node(num_elements, 0);
        self.add_static_bit_buffer(num_elements);
        self.add_static_byte_buffer((num_elements + 1) * 4);
        self.add_static_byte_buffer(num_total_chars);
    }

    pub fn finish(self) -> ColumnDynamicMetadata {
        ColumnDynamicMetadata {
            nodes: self.nodes,
            buffers: self.buffers,
        }
    }
}
