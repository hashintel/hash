use super::prelude::*;

/// Internal representation of Arrow `FieldNode` Message
#[derive(Debug, Clone)]
pub struct Node {
    /// Number of value slots (if Node is the base column node, then it is the number of items in
    /// column)
    pub length: usize,
    pub null_count: usize,
}

static NULL_NODE: Node = Node {
    length: 0,
    null_count: 0,
};

impl Node {
    #[must_use]
    pub fn new(length: usize, null_count: usize) -> Node {
        Node { length, null_count }
    }

    #[must_use]
    pub fn null() -> &'static Node {
        &NULL_NODE
    }
}

/// Internal representation of Arrow `Buffer` Message with padding included
#[derive(Debug, Clone)]
pub struct Buffer {
    /// Offset from data_buffer start (beginning of first column)
    pub offset: usize,
    /// Byte-length of the memory buffer
    pub length: usize,
    /// Byte-length of the memory buffer's padding
    pub padding: usize,
}

static NULL_BUFFER: Buffer = Buffer {
    offset: 0,
    length: 0,
    padding: 0,
};

impl Buffer {
    #[must_use]
    pub fn new(offset: usize, length: usize, padding: usize) -> Buffer {
        Buffer {
            offset,
            length,
            padding,
        }
    }

    #[must_use]
    pub fn null() -> &'static Buffer {
        &NULL_BUFFER
    }

    #[must_use]
    pub fn get_next_offset(&self) -> usize {
        self.offset + self.length + self.padding
    }
}

/// When mutable sized buffers are resized/moved/overwritten, this
/// is used to calculate positions and potential resizes to shared buffers
#[allow(dead_code)]
pub enum BufferAction<'a> {
    Move {
        old_offset: usize,
        old_total_length: usize,
        new_offset: usize,
        first_index: usize,
        last_index: usize,
    },
    Owned {
        index: usize,
        offset: usize,
        padding: usize,
        buffer: Vec<u8>,
    },
    Ref {
        index: usize,
        offset: usize,
        padding: usize,
        buffer: &'a [u8],
    },
}

/// Dynamic metadata is metadata specific to a shared batch.
/// It contains the Nodes and Buffers that are also in
/// the metadata buffer of a shared batch. This metadata
/// can be modified and later used to overwrite shared batch
/// Arrow metadata
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
        let nodes = cols
            .iter()
            .flat_map(|meta| meta.nodes.iter())
            .cloned()
            .collect();
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

#[derive(Clone, Debug, PartialEq)]
pub struct NodeMapping(pub Vec<NodeMapping>);

impl NodeMapping {
    #[must_use]
    pub fn empty() -> NodeMapping {
        NodeMapping(Vec::with_capacity(0))
    }

    #[must_use]
    pub fn singleton(mapping: NodeMapping) -> NodeMapping {
        NodeMapping(vec![mapping])
    }
}

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

#[derive(Debug, Clone, PartialEq)]
pub enum BufferType {
    /// This buffer contains the null bitmap of the node or is just binary data
    BitMap { is_null_bitmap: bool },
    /// This buffer contains i32 offsets
    Offset,
    /// This buffer contains i64 offsets (currently not implemented)
    // TODO: UNUSED: Needs triage
    LargeOffset,
    /// This buffer contains fixed-size (byte-level) data
    Data {
        // Note that for f64, it is 8, while for fixed size lists of f64 it's a multiple
        unit_byte_size: usize,
    },
}

#[derive(Debug, Clone, PartialEq)]
pub struct NodeStatic {
    /// 1 if is row-level or other buffers point to a non-fixed-size list,
    /// > 1 if direct child of fixed size list
    unit_multiplier: usize,
    data_types: Vec<BufferType>,
}

impl NodeStatic {
    #[must_use]
    pub fn new(unit_multiplier: usize, data_types: Vec<BufferType>) -> NodeStatic {
        NodeStatic {
            unit_multiplier,
            data_types,
        }
    }

    #[must_use]
    pub fn get_unit_multiplier(&self) -> usize {
        self.unit_multiplier
    }

    #[must_use]
    pub fn get_data_types(&self) -> &[BufferType] {
        &self.data_types
    }
}

/// Static metadata remains constant for a simulation run,
/// it contains information about which `Node`s and `Buffer`s in
/// `DynamicMeta` are relevant to columns. This is basically
/// the hierarchical map to Arrow metadata and hence `DynamicMeta`.
/// Also contains information about which buffers are growable.
#[derive(Debug, Clone)]
pub struct Static {
    /// Column-level information
    column_meta: Vec<Column>,
    /// Information on whether each buffer is growable or not.
    /// This is currently not used, as all agent
    /// batch buffers get extra padding regardless of it
    /// being fixed-size. This is because agent creation/removal
    /// is applied to every buffer.
    padding_meta: Vec<bool>,
    node_meta: Vec<NodeStatic>,
    buffer_count: usize,
    node_count: usize,
}

impl Static {
    #[must_use]
    pub fn new(
        column_meta: Vec<Column>,
        padding_meta: Vec<bool>,
        node_meta: Vec<NodeStatic>,
    ) -> Static {
        let buffer_count = padding_meta.len();
        let node_count = column_meta.iter().fold(0, |acc, col| acc + col.node_count);
        Static {
            column_meta,
            padding_meta,
            node_meta,
            buffer_count,
            node_count,
        }
    }

    pub fn validate_lengths(&self, dynamic: &Dynamic) -> bool {
        let base_length = dynamic.length;
        for (i, col) in self.column_meta.iter().enumerate() {
            let node = &dynamic.nodes[col.node_start];
            if node.length != base_length {
                tracing::warn!(
                    "Column {} base node does not have required length, is {}, should be {}",
                    i,
                    node.length,
                    base_length
                );
                return false;
            }
        }
        true
    }

    #[must_use]
    pub fn get_column_meta(&self) -> &Vec<Column> {
        &self.column_meta
    }

    #[must_use]
    pub fn get_padding_meta(&self) -> &Vec<bool> {
        &self.padding_meta
    }

    #[must_use]
    pub fn get_node_meta(&self) -> &Vec<NodeStatic> {
        &self.node_meta
    }

    #[must_use]
    pub fn get_buffer_count(&self) -> usize {
        self.buffer_count
    }

    #[must_use]
    pub fn get_node_count(&self) -> usize {
        self.node_count
    }
}

pub struct ColumnDynamicMetadata {
    /// Flattened node metadata
    pub nodes: Vec<Node>,
    /// Flattened buffer metadata
    pub buffers: Vec<Buffer>,
}

impl ColumnDynamicMetadata {
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
    // TODO: UNUSED: Needs triage
    pub fn new() -> ColumnDynamicMetadataBuilder {
        Self::default()
    }

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
        let buf_len = arrow::util::bit_util::ceil(num_elements, 8);
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
