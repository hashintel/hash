//! Graph operations in the HashQL HIR.
//!
//! This module represents operations specific to HashQL's graph querying capabilities.
//! It provides structures for interacting with the underlying graph database,
//! including traversals, pattern matching, and data retrieval operations.
//! Currently implemented as a placeholder for future implementation.
use core::marker::PhantomData;

use hashql_core::span::SpanId;

/// The different kinds of graph operations in the HashQL HIR.
///
/// This enum represents the various graph-specific operations available in HashQL.
/// Currently defined as a placeholder with only a Never variant using the never type.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum GraphKind {
    /// Placeholder variant (currently unimplemented)
    Never(!),
}

/// A graph operation node in the HashQL HIR.
///
/// Represents operations specific to HashQL's graph querying capabilities,
/// such as traversals, pattern matching, and data retrieval from the graph.
///
/// This is currently implemented as a placeholder structure awaiting full implementation.
/// When completed, graph nodes will be central to HashQL's graph querying functionality,
/// allowing for powerful and expressive graph operations.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Graph<'heap> {
    pub span: SpanId,

    pub kind: GraphKind,

    pub _marker: PhantomData<&'heap ()>,
}
