//! Terminator representation for HashQL MIR.
//!
//! Terminators represent the control flow operations that end basic blocks and
//! determine where execution continues. Unlike statements, terminators can affect
//! control flow by jumping to other blocks, calling functions, or ending execution.

mod branch;
mod goto;
mod graph;
mod r#return;
mod target;

use hashql_core::span::SpanId;

pub use self::{
    branch::Branch,
    goto::Goto,
    graph::{GraphRead, GraphReadBody, GraphReadHead, GraphReadLocation, GraphReadTail},
    r#return::Return,
    target::Target,
};

/// A terminator in the HashQL MIR.
///
/// Terminators represent control flow operations that end basic blocks and
/// determine where execution continues next. Every basic block must end with
/// exactly one terminator, which specifies all possible successor blocks
/// or execution endpoints.
///
/// # Control Flow Semantics
///
/// Terminators are the only way to:
/// - Transfer control between basic blocks
/// - Call functions and handle returns
/// - End execution of the current function
/// - Perform graph operations with control flow implications
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Terminator<'heap> {
    /// The source location span for this terminator.
    ///
    /// This [`SpanId`] tracks where in the original source code this terminator
    /// originated from, enabling accurate error reporting and debugging information
    /// for control flow operations.
    pub span: SpanId,

    /// The specific kind of control flow operation this terminator performs.
    ///
    /// The [`TerminatorKind`] determines what control flow action this terminator
    /// takes when executed, such as jumping to another block, calling a function,
    /// or ending execution.
    pub kind: TerminatorKind<'heap>,
}

/// The specific kind of control flow operation performed by a terminator.
///
/// Terminator kinds represent the different types of control flow operations
/// that can end a basic block. Each variant corresponds to a different way
/// of transferring control or ending execution.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum TerminatorKind<'heap> {
    /// Unconditional jump to another basic block.
    ///
    /// This terminator kind transfers control directly to a target basic block
    /// without any conditions or side effects.
    Goto(Goto<'heap>),

    /// Conditional branch based on a boolean test.
    ///
    /// This terminator kind evaluates a boolean condition and transfers control
    /// to one of two target basic blocks based on the result.
    Branch(Branch<'heap>),

    /// Return from the current function.
    ///
    /// This terminator kind ends execution of the current function and returns
    /// control to the caller.
    Return(Return<'heap>),

    /// Graph database read operation.
    ///
    /// This terminator kind performs a graph database read operation that has
    /// control flow implications, such as conditional execution based on query
    /// results.
    GraphRead(GraphRead<'heap>),

    /// Unreachable code marker.
    ///
    /// This terminator kind indicates that execution should never reach this
    /// point in the code. It is used for optimization and verification purposes,
    /// and reaching it at runtime typically indicates a bug or invalid state.
    Unreachable,
}
