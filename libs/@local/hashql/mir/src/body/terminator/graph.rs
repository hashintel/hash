use hashql_core::heap;

use super::target::Target;
use crate::{
    body::{local::Local, operand::Operand},
    def::DefId,
};

/// The starting point for a graph read operation.
///
/// Determines where the query begins in the bi-temporal graph.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum GraphReadHead<'heap> {
    /// Start the query from entities in the bi-temporal graph.
    ///
    /// The `axis` [`Node`] specifies the time axis for the bi-temporal query.
    Entity { axis: Operand<'heap> },
}

/// Operations that can be applied to narrow down query results.
///
/// The body of a graph read operation contains filtering and transformation steps
/// that process the data selected by the [`GraphReadHead`]. These operations are
/// applied sequentially to refine the result set.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum GraphReadBody {
    /// Apply a filter predicate to narrow down results.
    ///
    /// The [`DefId`] refers to the function that implements the filter predicate, which must be
    /// of arity 1, whereas `Local` refers to the variable that holds the environment.
    Filter(DefId, Local),
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

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct GraphRead<'heap> {
    pub head: GraphReadHead<'heap>,
    pub body: heap::Vec<'heap, GraphReadBody>,
    pub tail: GraphReadTail,

    pub target: Target<'heap>,
}
