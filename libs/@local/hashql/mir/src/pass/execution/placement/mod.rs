//! Target placement determination for MIR basic blocks.
//!
//! The placement algorithm assigns a concrete execution target to each basic block in two phases:
//!
//! 1. **AC-3 arc consistency** ([`ArcConsistency`]): prunes per-block target domains by removing
//!    targets that lack support across CFG edges.
//! 2. **Placement solving** ([`PlacementSolver`]): assigns a concrete execution target to each
//!    basic block using SCC condensation, cost estimation, and constraint satisfaction.
//!
//! The solver groups blocks into placement regions via SCC condensation, then runs a forward pass
//! (topological order) and backward pass (reverse topological) to refine assignments. The
//! [`PlacementSolverContext`] provides the shared state needed across both passes.

mod arc;
mod solve;

pub use self::{
    arc::ArcConsistency,
    solve::{PlacementSolver, PlacementSolverContext},
};
