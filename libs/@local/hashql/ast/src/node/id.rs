use hashql_core::id;

id::newtype!(
    /// A unique identifier for nodes in the HashQL Abstract Syntax Tree.
    ///
    /// Each node in the AST has a unique `NodeId` that can be used to track the node
    /// through various processing stages. These IDs are particularly important for
    /// error reporting, cross-referencing between nodes, and maintaining node identity
    /// during transformations.
    ///
    /// The value space is restricted to 0..=0xFFFF_FF00, reserving the last 256 for niches.
    /// As real pattern types are an experimental feature in Rust, these can currently only be
    /// used by directly modifying and accessing the `NodeId`'s internal value.
    ///
    /// # Implementation Note
    ///
    /// We're currently liberal in the use of `NodeId`s. In the future, we might want to
    /// revisit this to see if we can use fewer of them or optimize their allocation.
    pub struct NodeId(u32 is 0..=0xFFFF_FF00)
);

impl NodeId {
    /// A placeholder ID used during initial parsing.
    ///
    /// When parsing, we initially give all AST nodes this placeholder ID. After resolving special
    /// forms, the nodes are renumbered to have small indices.
    pub const PLACEHOLDER: Self = <Self as id::Id>::MAX;
}
