//! Classification of function bodies for administrative reduction.
//!
//! This module determines which bodies are eligible for inlining and how they should be reduced.

use crate::body::{
    Body,
    basic_block::BasicBlockId,
    operand::Operand,
    rvalue::RValue,
    statement::{Assign, Statement, StatementKind},
    terminator::{Return, TerminatorKind},
};

/// Checks whether all statements in a sequence are "trivial" for reduction purposes.
///
/// Trivial statements are those that don't perform computation or have side effects beyond
/// simple data movement:
/// - `Nop`: No operation
/// - `Assign` with `Load`: Simple value copy
/// - `Assign` with `Aggregate`: Struct/tuple construction
///
/// Non-trivial statements include function calls (`Apply`), arithmetic (`Binary`, `Unary`),
/// and storage markers (`StorageLive`, `StorageDead`).
fn all_statements_trivial<'stmt, 'heap: 'stmt>(
    statements: impl IntoIterator<Item = &'stmt Statement<'heap>>,
) -> bool {
    statements
        .into_iter()
        .all(|statement| match statement.kind {
            StatementKind::Nop
            | StatementKind::Assign(Assign {
                lhs: _,
                rhs: RValue::Aggregate(_) | RValue::Load(_),
            }) => true,
            StatementKind::Assign(Assign {
                lhs: _,
                rhs: RValue::Apply(_) | RValue::Binary(_) | RValue::Unary(_) | RValue::Input(_),
            })
            | StatementKind::StorageLive(_)
            | StatementKind::StorageDead(_) => false,
        })
}

/// The kind of administrative reduction applicable to a function body.
///
/// Each variant represents a different reduction strategy:
///
/// - [`TrivialThunk`](Self::TrivialThunk): The body contains only trivial statements and can be
///   fully inlined, replacing the call with the body's statements and a load of the return value.
///
/// - [`ForwardingClosure`](Self::ForwardingClosure): The body is a thin wrapper that performs some
///   trivial setup then delegates to another function. The wrapper is eliminated, exposing the
///   inner call directly.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) enum ReductionKind {
    /// A function with only trivial statements that immediately returns a value.
    ///
    /// Shape: single basic block, all statements are `Nop`/`Load`/`Aggregate`, terminator is
    /// `Return`. No control flow, no calls.
    TrivialThunk,

    /// A function that forwards to another call after trivial setup.
    ///
    /// Shape: single basic block, trivial prelude statements, final statement is an `Apply`,
    /// terminator returns the result of that `Apply`.
    ForwardingClosure,
}

impl ReductionKind {
    /// Attempts to classify a body as a trivial thunk.
    ///
    /// Requirements:
    /// - Single basic block (no control flow)
    /// - All statements are trivial (no calls, no arithmetic)
    /// - Terminator is a `Return`
    ///
    /// Note: `StorageLive`/`StorageDead` markers are intentionally considered non-trivial
    /// because their presence indicates liveness analysis has already run, and we want to
    /// reduce before that phase.
    fn thunk(body: &Body<'_>) -> Option<Self> {
        if body.basic_blocks.len() > 1 {
            return None;
        }

        let bb = &body.basic_blocks[BasicBlockId::START];

        let is_trivial = all_statements_trivial(&bb.statements);

        if !matches!(bb.terminator.kind, TerminatorKind::Return(_)) {
            return None;
        }

        if is_trivial {
            return Some(Self::TrivialThunk);
        }

        None
    }

    /// Attempts to classify a body as a forwarding closure.
    ///
    /// A forwarding closure has the shape:
    /// ```text
    /// bb0:
    ///     <trivial prelude statements>
    ///     result = Apply(callee, args)
    ///     Return(result)
    /// ```
    ///
    /// Requirements:
    /// - Single basic block (no control flow)
    /// - At least one statement (the call). Empty blocks are trivial thunks, not forwarders.
    /// - Final statement must be a call assignment.
    fn closure(body: &Body<'_>) -> Option<Self> {
        if body.basic_blocks.len() > 1 {
            return None;
        }

        let bb = &body.basic_blocks[BasicBlockId::START];

        // Need at least one statement (the call). Empty blocks are trivial thunks, not forwarders.
        let [prelude @ .., final_stmt] = &*bb.statements else {
            return None;
        };

        if !all_statements_trivial(prelude) {
            return None;
        }

        // Final statement must be a call assignment.
        let StatementKind::Assign(Assign {
            lhs,
            rhs: RValue::Apply(_),
        }) = final_stmt.kind
        else {
            return None;
        };

        // Terminator must return the call's result.
        if bb.terminator.kind
            == TerminatorKind::Return(Return {
                value: Operand::Place(lhs),
            })
        {
            return Some(Self::ForwardingClosure);
        }

        None
    }

    /// Classifies a body for administrative reduction, if applicable.
    ///
    /// Returns `Some(kind)` if the body is reducible, `None` otherwise.
    ///
    /// Classification priority:
    /// 1. Try [`TrivialThunk`](Self::TrivialThunk) first (fully inlinable, no calls)
    /// 2. Fall back to [`ForwardingClosure`](Self::ForwardingClosure) (wrapper elimination)
    ///
    /// Bodies with multiple basic blocks (control flow) are never reducible.
    pub(crate) fn of(body: &Body<'_>) -> Option<Self> {
        // Early exit for bodies with control flow.
        if body.basic_blocks.len() > 1 {
            return None;
        }

        // Prefer TrivialThunk classification when possible, as it's simpler to inline.
        if let Some(target) = Self::thunk(body) {
            return Some(target);
        }

        Self::closure(body)
    }
}
