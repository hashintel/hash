use std::alloc::Allocator;

use hashql_mir::{
    body::terminator::GraphReadTail,
    interpret::value::{self, Value},
};

pub enum Tail<'heap, A: Allocator> {
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
