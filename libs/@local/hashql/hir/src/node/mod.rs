pub mod access;
pub mod data;
pub mod kind;
pub mod variable;

use hashql_core::{id, span::SpanId};

use self::kind::NodeKind;

id::newtype!(
    /// A unique identifier for nodes in the HashQL High-Level Intermediate Representation (HIR).
    ///
    /// Each node in the HIR has a unique `NodeId` that can be used to track the node
    /// through various processing stages. These IDs are particularly important for
    /// error reporting, cross-referencing between nodes, and maintaining node identity
    /// during transformations.
    ///
    /// The value space is restricted to 0..=0xFFFF_FF00, reserving the last 256 for niches.
    /// As real pattern types are an experimental feature in Rust, these can currently only be
    /// used by directly modifying and accessing the `NodeId`'s internal value.
    pub struct HirId(u32 is 0..=0xFFFF_FF00)
);

impl HirId {
    /// A placeholder ID used during initial parsing.
    ///
    /// When parsing, we initially give all AST nodes this placeholder ID. After resolving special
    /// forms, the nodes are renumbered to have small indices.
    pub const PLACEHOLDER: Self = <Self as id::Id>::MAX;
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Node<'heap> {
    pub id: HirId,
    pub span: SpanId,

    pub kind: NodeKind<'heap>,
}
