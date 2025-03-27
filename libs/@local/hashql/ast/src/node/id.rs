use hashql_core::id;

// Last 256 indices are there for niches, and or for reserved values.
// We're quite liberal in the use of `NodeId`s, in the future we might want to revisit this to see
// if we can't use less of them.
id::newtype!(pub struct NodeId(u32 is 0..=0xFFFF_FF00));

impl NodeId {
    /// When parsing we initially give all AST nodes this placeholder ID. After resolving special
    /// forms the nodes are renumbered to have small indices.
    pub const PLACEHOLDER: Self = <Self as id::Id>::MAX;
}
