//! Graph operations in the HashQL HIR.
//!
//! This module represents operations specific to HashQL's graph querying capabilities.
//! It provides structures for interacting with the underlying graph database,
//! including traversals, pattern matching, and data retrieval operations.
pub mod read;

pub use self::read::{GraphRead, GraphReadBody, GraphReadHead, GraphReadTail};

/// A graph operation node in the HashQL HIR.
///
/// Represents operations specific to HashQL's graph querying capabilities,
/// such as traversals, pattern matching, and data retrieval from the graph.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Graph<'heap> {
    Read(GraphRead<'heap>),
}
