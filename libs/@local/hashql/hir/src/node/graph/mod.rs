//! Graph operations in the HashQL HIR.
//!
//! This module represents operations specific to HashQL's graph querying capabilities.
//! It provides structures for interacting with the underlying graph database,
//! including traversals, pattern matching, and data retrieval operations.
pub mod read;

use hashql_core::span::SpanId;

use self::read::GraphRead;

/// The different kinds of graph operations in the HashQL HIR.
///
/// This enum represents the various graph-specific operations available in HashQL.
/// Currently defined as a placeholder with only a Never variant using the never type.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum GraphKind<'heap> {
    Read(GraphRead<'heap>),
}

/// A graph operation node in the HashQL HIR.
///
/// Represents operations specific to HashQL's graph querying capabilities,
/// such as traversals, pattern matching, and data retrieval from the graph.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Graph<'heap> {
    pub span: SpanId,

    pub kind: GraphKind<'heap>,
}
