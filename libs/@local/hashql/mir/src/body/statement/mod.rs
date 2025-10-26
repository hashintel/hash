//! Statement representation for HashQL MIR.
//!
//! Statements represent the individual operations that execute within a basic block.
//! Unlike terminators, statements do not affect control flow and execute sequentially
//! within their containing basic block.

pub mod assign;

use hashql_core::span::SpanId;

pub use self::assign::Assign;
use super::local::Local;

/// A statement in the HashQL MIR.
///
/// Statements represent individual operations that execute within a basic block
/// without affecting control flow. Each statement performs a specific action
/// such as assignment, storage management, or other side effects.
///
/// # Execution Model
///
/// Statements within a basic block execute sequentially from first to last.
/// They cannot branch, jump, or otherwise alter control flow - that responsibility
/// belongs to the basic block's terminator.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Statement<'heap> {
    /// The source location span for this statement.
    ///
    /// This [`SpanId`] tracks where in the original source code this statement
    /// originated from.
    pub span: SpanId,

    /// The specific kind of operation this statement performs.
    ///
    /// The [`StatementKind`] determines what action this statement takes when
    /// executed.
    pub kind: StatementKind<'heap>,
}

/// The specific kind of operation performed by a statement.
///
/// Statement kinds represent the different types of operations that can be
/// performed within a basic block without affecting control flow. Each variant
/// corresponds to a different category of operation.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum StatementKind<'heap> {
    /// Assignment from an r-value to a place.
    ///
    /// This statement kind performs assignment operations or loading values from
    /// sources (r-values) to destinations (places). The [`Assign`] contains both the target
    /// location and the source expression.
    Assign(Assign<'heap>),

    /// No operation.
    ///
    /// This statement kind represents a placeholder that performs no action
    /// when executed. It may be used for removed instructions, alignment,
    /// or as a temporary placeholder during MIR transformations.
    Nop,

    /// Marks a local variable as live and available for use.
    ///
    /// This statement kind indicates that the specified [`Local`] variable
    /// becomes available for use. After this point, the variable can be
    /// read from and written to until a corresponding [`StorageDead`] statement.
    ///
    /// [`StorageDead`]: StatementKind::StorageDead
    StorageLive(Local),

    /// Marks a local variable as dead and no longer accessible.
    ///
    /// This statement kind indicates that the specified [`Local`] variable
    /// is no longer accessible and its storage can be reclaimed. Attempting
    /// to use the variable after this point is invalid.
    StorageDead(Local),
}
