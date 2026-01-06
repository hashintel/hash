use alloc::alloc::Global;
use core::alloc::Allocator;

use super::{error::RuntimeError, value::Value};
use crate::body::{
    Body,
    basic_block::BasicBlock,
    local::{Local, LocalVec},
    place::Place,
};

enum ValueCow<'heap> {
    Borrowed(&'heap Value<'heap>),
    Owned(Value<'heap>),
}

struct Locals<'heap, A: Allocator = Global> {
    inner: LocalVec<Option<Value<'heap>>, A>,
}

impl<'heap, A: Allocator> Locals<'heap, A> {
    fn local(&self, local: Local) -> Result<&Value<'heap>, RuntimeError> {
        self.inner
            .lookup(local)
            .ok_or(RuntimeError::UninitializedLocal(local))
    }

    fn place(
        &self,
        Place { local, projections }: Place<'heap>,
    ) -> Result<&Value<'heap>, RuntimeError> {
        self.local(local)
    }
}

struct Frame<'ctx, 'heap> {
    locals: Locals<'heap>,

    body: &'ctx Body<'heap>,
    current_block: &'ctx BasicBlock<'heap>,
    current_statement: usize,
}

impl<'ctx, 'heap> Frame<'ctx, 'heap> {}
