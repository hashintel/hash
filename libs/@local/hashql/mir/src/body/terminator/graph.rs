use crate::body::{operand::Operand, place::Place};

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
pub enum GraphReadBody<'heap> {
    /// Apply a filter predicate to narrow down results.
    ///
    /// The [`Operand`] refers to the function that implements the filter predicate, which must be
    /// of arity 1.
    Filter(Operand<'heap>),
}

// TODO: does this work? what about captured variables?
// TODO: closures just take an implicit first argument of their captured environment and are
// therefore just another body! This means that we need to analyze the captured environment to
// determine what we need to put there, this means that the graph read body needs to have the
// captured environment as a parameter. We can directly associate this with the closure when it is
// defined, because everything is static.
// But this means that we would need to implement thunking a bit earlier, no? because otherwise we
// can't do the "body trick" for every top level closure.

// TODO: what I am not yet sure about is how to do calling convention - like how do I know *what* I
// need to call?

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct GraphRead<'heap> {
    pub head: GraphReadHead<'heap>,

    pub destination: Place<'heap>,
}
