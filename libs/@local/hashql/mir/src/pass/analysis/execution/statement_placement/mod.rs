use core::alloc::Allocator;

use hashql_core::heap::Heap;

use super::target::ExecutionTarget;
use crate::{
    body::Body,
    context::MirContext,
    pass::{
        analysis::execution::cost::{StatementCostVec, TraversalCostVec},
        transform::Traversals,
    },
};

mod common;
mod embedding;
mod interpret;
mod lookup;
mod postgres;

pub(crate) trait StatementPlacement<'heap, A: Allocator> {
    type Target: ExecutionTarget;

    fn statement_placement(
        &mut self,
        context: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        traversals: &Traversals<'heap>,
        alloc: A,
    ) -> (TraversalCostVec<&'heap Heap>, StatementCostVec<&'heap Heap>);
}
