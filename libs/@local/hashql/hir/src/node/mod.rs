pub mod access;
pub mod branch;
pub mod call;
pub mod closure;
pub mod data;
pub mod graph;
pub mod input;
pub mod kind;
pub mod r#let;
pub mod operation;
pub mod variable;

use hashql_core::{
    id::{self, HasId},
    intern::{Decompose, Interned},
    span::SpanId,
};

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

id::newtype_collections!(pub type HirId* from HirId);

impl HirId {
    /// A placeholder ID used during initial parsing.
    ///
    /// When parsing, we initially give all AST nodes this placeholder ID. After resolving special
    /// forms, the nodes are renumbered to have small indices.
    pub const PLACEHOLDER: Self = <Self as id::Id>::MAX;
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct HirPtr {
    pub id: HirId,
    pub span: SpanId,
}

impl HirPtr {
    pub const PLACEHOLDER: Self = Self {
        id: HirId::PLACEHOLDER,
        span: SpanId::SYNTHETIC,
    };
}

/// A node in the HashQL High-Level Intermediate Representation (HIR).
///
/// The HIR is an optimized, more refined representation of the program derived from the AST.
/// While the AST closely mirrors the source syntax, the HIR represents a more semantically
/// meaningful structure that's better suited for type checking, optimization, and code generation.
///
/// Key differences between HIR and AST:
/// - Special forms (like `let`, `if`, etc.) are fully expanded in the HIR
/// - Syntactic sugar is desugared and normalized
/// - The HIR uses interned references for better memory efficiency
/// - Nodes are more compact and optimized for compiler operations
///
/// Each HIR node has:
/// - A unique identifier for tracking through compilation phases
/// - A span linking to its origin in source code for error reporting
/// - A specific kind that determines the node's semantics and structure
///
/// The HIR is designed to be immutable after construction and uses arena allocation
/// through the `'heap` lifetime for efficient memory management.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Node<'heap> {
    pub id: HirId,
    pub span: SpanId,

    // Consider if we want to intern the `NodeKind` separately
    pub kind: &'heap NodeKind<'heap>,
}

impl Node<'_> {
    #[must_use]
    pub const fn ptr(&self) -> HirPtr {
        HirPtr {
            id: self.id,
            span: self.span,
        }
    }
}

impl HasId for Node<'_> {
    type Id = HirId;

    fn id(&self) -> Self::Id {
        self.id
    }
}

impl<'heap> Decompose<'heap> for Node<'heap> {
    type Partial = PartialNode<'heap>;

    fn from_parts(id: Self::Id, partial: Interned<'heap, Self::Partial>) -> Self {
        let Interned(partial, _) = partial;

        Self {
            id,
            span: partial.span,
            kind: &partial.kind,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct PartialNode<'heap> {
    pub span: SpanId,

    pub kind: NodeKind<'heap>,
}
