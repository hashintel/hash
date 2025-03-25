use hql_core::id;

// Last 256 indices are there for niches, and or for reserved values.
id::newtype!(pub struct NodeId(u32 is 0..=0xFFFF_FF00));

impl NodeId {
    /// When parsing we initially give all AST nodes this placeholder ID. After resolving special
    /// forms the nodes are renumbered to have small indices.
    const PLACEHOLDER: Self = <Self as id::Id>::MAX;
}
