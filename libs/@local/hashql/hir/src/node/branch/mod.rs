//! Branch expressions in the HashQL HIR.
//!
//! This module represents control flow branching operations in the HashQL
//! language. Currently implemented as a placeholder with planned support
//! for conditional expressions like if/else statements.
pub mod r#if;

use hashql_core::span::SpanId;

use self::r#if::If;

/// The different kinds of branching operations in the HashQL HIR.
///
/// This enum represents the various forms of control flow branching available in HashQL.
/// Currently defined as a placeholder with only an `If` variant using the never type.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum BranchKind<'heap> {
    /// Conditional branching with if/else
    If(If<'heap>),
}

/// A branch node in the HashQL HIR.
///
/// Represents control flow operations that can conditionally execute different
/// expressions based on a test condition.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Branch<'heap> {
    pub span: SpanId,

    pub kind: BranchKind<'heap>,
}
