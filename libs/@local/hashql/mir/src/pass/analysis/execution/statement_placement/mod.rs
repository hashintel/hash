use core::alloc::Allocator;

use hashql_core::heap::Heap;

mod common;
mod embedding;
mod interpret;
mod lookup;
mod postgres;

pub use self::{
    embedding::EmbeddingStatementPlacement, interpret::InterpreterStatementPlacement,
    postgres::PostgresStatementPlacement,
};
use super::target::ExecutionTarget;
use crate::{
    body::Body,
    context::MirContext,
    pass::{
        analysis::execution::cost::{StatementCostVec, TraversalCostVec},
        transform::Traversals,
    },
};

pub trait StatementPlacement<'heap, A: Allocator> {
    type Target: ExecutionTarget;

    fn statement_placement(
        &mut self,
        context: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        traversals: &Traversals<'heap>,
        alloc: A,
    ) -> (TraversalCostVec<&'heap Heap>, StatementCostVec<&'heap Heap>);
}
