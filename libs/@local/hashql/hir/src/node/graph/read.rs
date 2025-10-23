//! Graph read operations in the HashQL HIR.
//!
//! This module defines the structure for graph read operations, which are used to query and
//! retrieve data from the bi-temporal graph database. A graph read operation consists of three main
//! components:
//!
//! - **Head**: Determines the starting point of the query.
//! - **Body**: Contains filtering operations to narrow down results.
//! - **Tail**: Specifies how to finalize the query.

use hashql_core::intern::Interned;

use crate::node::Node;

/// The starting point for a graph read operation.
///
/// Determines where the query begins in the bi-temporal graph.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum GraphReadHead<'heap> {
    /// Start the query from entities in the bi-temporal graph.
    ///
    /// The `axis` [`NodeRef`] specifies the time axis for the bi-temporal query.
    Entity { axis: Node<'heap> },
}

/// Operations that can be applied to narrow down query results.
///
/// The body of a graph read operation contains filtering and transformation steps
/// that process the data selected by the [`GraphReadHead`]. These operations are
/// applied sequentially to refine the result set.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum GraphReadBody<'heap> {
    /// Apply a filter predicate to narrow down results.
    ///
    /// The [`NodeRef`] represents a closure that takes each item from the current
    /// result set and returns a boolean indicating whether the item should be
    /// included in the filtered results.
    Filter(Node<'heap>),
}

/// The final operation that determines how the query results are returned.
///
/// Specifies how the processed data should be finalized and returned to the caller.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum GraphReadTail {
    /// Collect all results into a collection.
    ///
    /// Gathers all items that pass through the query pipeline and returns them as a list of
    /// entities.
    Collect,
}

/// A complete graph read operation in the HashQL HIR.
///
/// Represents a structured query for reading data from the bi-temporal graph database. The
/// operation is organized as a pipeline with three distinct phases:
///
/// 1. **Head**: Selects the starting data set from the graph
/// 2. **Body**: Applies zero or more filtering and transformation operations
/// 3. **Tail**: Determines how the results are returned
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct GraphRead<'heap> {
    /// The starting point of the query, determining the initial dataset and time axis.
    pub head: GraphReadHead<'heap>,

    /// Sequential operations applied to process and filter the data.
    ///
    /// The operations in the body are applied in order, with each operation
    /// receiving the output of the previous operation as its input.
    pub body: Interned<'heap, [GraphReadBody<'heap>]>,

    /// The final operation that determines how the results are returned.
    pub tail: GraphReadTail,
}
