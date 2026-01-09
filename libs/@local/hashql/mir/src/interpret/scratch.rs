use core::alloc::Allocator;

use super::value::Value;
use crate::body::local::Local;

pub(crate) struct Scratch<'heap, A: Allocator> {
    pub indices: Vec<Value<'heap, A>, A>,
    pub target_args: Vec<(Local, Value<'heap, A>), A>,
}

impl<A: Allocator> Scratch<'_, A> {
    pub(crate) fn new_in(alloc: A) -> Self
    where
        A: Clone,
    {
        Self {
            indices: Vec::new_in(alloc.clone()),
            target_args: Vec::new_in(alloc),
        }
    }

    pub(crate) fn clear(&mut self) {
        self.indices.clear();
        self.target_args.clear();
    }
}
