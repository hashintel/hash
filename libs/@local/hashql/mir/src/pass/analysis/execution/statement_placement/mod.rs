use std::alloc::Allocator;

use super::target::ExecutionTarget;
use crate::{
    body::{Body, basic_block::BasicBlockId, location::Location, statement::Statement},
    context::MirContext,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Cost(u32);

impl Cost {
    pub const fn new(value: u32) -> Self {
        Self(value)
    }
}

pub trait StatementPlacementVisitor<'env, 'heap> {
    type Target: ExecutionTarget;
    type State<'ctx, A: Allocator>;

    fn target(&self) -> &Self::Target;

    fn initialize_state<'ctx, A: Allocator>(
        &self,
        context: &'ctx MirContext<'env, 'heap>,
        body: &Body<'heap>,
        alloc: A,
    ) -> Self::State<'ctx, A>;

    fn enter_basic_block<A: Allocator>(&self, id: BasicBlockId, state: &mut Self::State<'_, A>) {}
    fn leave_basic_block<A: Allocator>(&self, id: BasicBlockId, state: &mut Self::State<'_, A>) {}

    fn visit_statement<A: Allocator>(
        &self,
        location: Location,
        statement: &Statement<'heap>,
        state: &mut Self::State<'_, A>,
    ) -> Option<Cost>;
}
