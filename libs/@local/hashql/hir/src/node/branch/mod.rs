//! Branch expressions in the HashQL HIR.
//!
//! This module represents control flow branching operations in the HashQL
//! language. Currently implemented as a placeholder with planned support
//! for conditional expressions like if/else statements.
use core::marker::PhantomData;

use hashql_core::span::SpanId;

/// The different kinds of branching operations in the HashQL HIR.
///
/// This enum represents the various forms of control flow branching available in HashQL.
/// Currently defined as a placeholder with only an `If` variant using the never type.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum BranchKind {
    /// Conditional branching with if/else (currently a placeholder)
    Never(!),
}

/// A branch node in the HashQL HIR.
///
/// Represents control flow operations that can conditionally execute different
/// expressions based on a test condition. Examples include if/else expressions.
///
/// This is currently implemented as a placeholder structure awaiting full implementation.
/// When completed, branch nodes will be used for conditional logic in HashQL programs.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Branch<'heap> {
    pub span: SpanId,

    pub kind: BranchKind,

    pub _marker: PhantomData<&'heap ()>,
}
