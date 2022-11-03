use crate::arrow::meta::BufferType;

/// Internal representation of Arrow `FieldNode` Message
#[derive(Debug, Clone, Eq, PartialEq)]
pub struct Node {
    /// Number of value slots (if Node is the base column node, then it is the number of items in
    /// column)
    pub length: usize,
    pub null_count: usize,
}

impl Node {
    #[must_use]
    pub fn new(length: usize, null_count: usize) -> Self {
        Self { length, null_count }
    }

    #[must_use]
    pub fn null() -> &'static Self {
        const NULL_NODE: Node = Node {
            length: 0,
            null_count: 0,
        };

        &NULL_NODE
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

#[derive(Debug, Clone, PartialEq, Eq)]
/// Contains data which does not change about a node, such as how many buffers it has, and of what
/// type those buffers are.
///
/// Note: there is a one-to-one correspondence between a [`NodeStatic`] and each Arrow array (i.e.
/// we create one [`NodeStatic`] for each Arrow array).
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
