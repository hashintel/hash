use std::alloc::Allocator;

use hashql_core::heap::Heap;

use crate::{
    body::Body,
    context::MirContext,
    pass::analysis::execution::{Cost, StatementCostVec},
};

pub(crate) struct EmbeddingStatementPlacement {
    statement_cost: Cost,
}

// Embeddings only support anything in the `encoding.vectors` path, which is in the entity try.
impl Default for EmbeddingStatementPlacement {
    fn default() -> Self {
        Self {
            statement_cost: cost!(4),
        }
    }
}

impl EmbeddingStatementPlacement {
    fn compute<'heap, A: Allocator + Clone>(
        &self,
        context: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        alloc: A,
    ) -> StatementCostVec<&'heap Heap> {
        todo!()
    }
}
