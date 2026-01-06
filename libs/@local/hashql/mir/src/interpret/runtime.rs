use super::locals::Locals;
use crate::body::{Body, basic_block::BasicBlock};

struct Frame<'ctx, 'heap> {
    locals: Locals<'heap>,

    body: &'ctx Body<'heap>,
    current_block: &'ctx BasicBlock<'heap>,
    current_statement: usize,
}

impl<'ctx, 'heap> Frame<'ctx, 'heap> {}
