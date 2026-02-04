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

use hashql_core::heap::Heap;

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
use super::target::ExecutionTarget;
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
    type Target: ExecutionTarget;

    /// Computes placement costs for `body`.
    ///
    /// Returns two cost vectors:
    /// - Traversal costs: For locals that require backend data fetching
    /// - Statement costs: For all statements in the body
    ///
    /// A `None` cost means the target cannot execute that statement/traversal.
    fn statement_placement(
        &mut self,
        context: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        traversals: &Traversals<'heap>,
        alloc: A,
    ) -> (TraversalCostVec<&'heap Heap>, StatementCostVec<&'heap Heap>);
}
