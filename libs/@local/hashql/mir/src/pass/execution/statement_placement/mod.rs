//! Statement placement analysis for MIR execution targets.
//!
//! Determines which MIR statements can be executed on each [`ExecutionTarget`] and assigns costs
//! to supported statements. The execution planner uses these costs to select optimal targets for
//! different parts of a query.
//!
//! Each target has different capabilities:
//! - [`PostgresStatementPlacement`]: Most operations except closures and function calls
//! - [`EmbeddingStatementPlacement`]: Only `encodings.vectors` entity projections
//! - [`InterpreterStatementPlacement`]: All operations (universal fallback)

use core::alloc::Allocator;

#[cfg(test)]
mod tests;

mod common;
mod embedding;
mod interpret;
mod lookup;
mod postgres;

pub use self::{
    embedding::EmbeddingStatementPlacement, interpret::InterpreterStatementPlacement,
    postgres::PostgresStatementPlacement,
};
use super::target::TargetId;
use crate::{
    body::Body,
    context::MirContext,
    pass::{
        execution::cost::{StatementCostVec, TraversalCostVec},
        transform::Traversals,
    },
};

/// Computes statement placement costs for a specific execution target.
///
/// Implementations analyze a [`Body`] to determine which statements can be dispatched to their
/// associated [`ExecutionTarget`]. Each statement that can be executed on the target receives a
/// cost; statements that cannot be executed have no cost assigned (`None`).
///
/// The analysis considers:
/// - Whether each rvalue (operation) is supported by the target
/// - Whether operands flow through supported paths to reach return blocks
/// - Special handling for entity field projections based on storage location
pub trait StatementPlacement<'heap, A: Allocator> {
    fn target(&self) -> TargetId;

    /// Computes placement costs for `body`.
    ///
    /// Returns two cost vectors:
    /// - Traversal costs: For locals that require backend data fetching
    /// - Statement costs: For all statements in the body
    ///
    /// A `None` cost means the target cannot execute that statement/traversal.
    fn statement_placement_in(
        &mut self,
        context: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        traversals: &Traversals<'heap>,
        alloc: A,
    ) -> (TraversalCostVec<A>, StatementCostVec<A>);
}

pub enum TargetPlacementStatement<'heap, S: Allocator> {
    Interpreter(InterpreterStatementPlacement),
    Postgres(PostgresStatementPlacement<'heap, S>),
    Embedding(EmbeddingStatementPlacement<S>),
}

impl<S: Allocator + Clone> TargetPlacementStatement<'_, S> {
    #[must_use]
    pub fn new_in(target: TargetId, scratch: S) -> Self {
        match target {
            TargetId::Interpreter => Self::Interpreter(InterpreterStatementPlacement::default()),
            TargetId::Postgres => Self::Postgres(PostgresStatementPlacement::new_in(scratch)),
            TargetId::Embedding => Self::Embedding(EmbeddingStatementPlacement::new_in(scratch)),
        }
    }
}

impl<'heap, A: Allocator + Clone, S: Allocator> StatementPlacement<'heap, A>
    for TargetPlacementStatement<'heap, S>
{
    #[inline]
    fn target(&self) -> TargetId {
        match self {
            Self::Interpreter(_) => TargetId::Interpreter,
            Self::Postgres(_) => TargetId::Postgres,
            Self::Embedding(_) => TargetId::Embedding,
        }
    }

    fn statement_placement_in(
        &mut self,
        context: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        traversals: &Traversals<'heap>,
        alloc: A,
    ) -> (TraversalCostVec<A>, StatementCostVec<A>) {
        match self {
            TargetPlacementStatement::Interpreter(placement) => {
                placement.statement_placement_in(context, body, traversals, alloc)
            }
            TargetPlacementStatement::Postgres(placement) => {
                placement.statement_placement_in(context, body, traversals, alloc)
            }
            TargetPlacementStatement::Embedding(placement) => {
                placement.statement_placement_in(context, body, traversals, alloc)
            }
        }
    }
}
