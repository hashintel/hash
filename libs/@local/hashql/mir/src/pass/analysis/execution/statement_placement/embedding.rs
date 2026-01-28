use crate::pass::analysis::execution::Cost;

pub(crate) struct EmbeddingStatementPlacement {
    statement_cost: Cost,
}

// Embeddings only support anything in the `encoding.vectors` path, which is in the entity try.
