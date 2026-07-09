//! Result accumulation strategies for graph read operations.
//!
//! After each row is hydrated and passes any filter chains, the resulting
//! [`Value`] must be collected into a final output. The [`Tail`] enum
//! determines the accumulation strategy, currently only [`Collect`], which
//! gathers all values into a [`List`].
//!
//! [`Value`]: hashql_mir::interpret::value::Value
//! [`Collect`]: Tail::Collect
//! [`List`]: hashql_mir::interpret::value::List

use core::alloc::Allocator;

use hashql_mir::{
    body::terminator::GraphReadTail,
    interpret::value::{self, Value},
};

/// Accumulator for row results, determined by the [`GraphReadTail`] variant.
///
/// Created once per graph read suspension, receives each post-filter value via
/// [`push`](Self::push), and produces the final output via
/// [`finish`](Self::finish).
pub(crate) enum Tail<'heap, A: Allocator> {
    Collect(value::List<'heap, A>),
}

impl<'heap, A: Allocator> Tail<'heap, A> {
    pub(crate) fn new(tail: GraphReadTail) -> Self {
        match tail {
            GraphReadTail::Collect => Self::Collect(value::List::new()),
        }
    }

    pub(crate) fn push(&mut self, value: value::Value<'heap, A>)
    where
        A: Clone,
    {
        match self {
            Self::Collect(list) => list.push_back(value),
        }
    }

    pub(crate) fn finish(self) -> Value<'heap, A> {
        match self {
            Self::Collect(list) => Value::List(list),
        }
    }
}
