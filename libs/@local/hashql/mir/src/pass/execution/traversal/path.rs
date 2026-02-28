use super::EntityPathBitSet;

/// Resolved traversal paths for a single vertex access.
///
/// Each variant corresponds to a vertex type in the graph schema. A `GraphReadFilter` body
/// operates over exactly one vertex type, so all traversal locals within a body share the same
/// variant.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum TraversalPaths {
    /// Paths into the entity schema.
    ///
    /// An all-bits-set bitset indicates full entity access is required.
    Entity(EntityPathBitSet),
}
