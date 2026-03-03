//! Branch expressions in the HashQL HIR.
//!
//! This module represents control flow branching operations in the HashQL
//! language. Currently implemented as a placeholder with planned support
//! for conditional expressions like if/else statements.
mod r#if;

pub use self::r#if::If;

/// A branch node in the HashQL HIR.
///
/// Represents control flow operations that can conditionally execute different
/// expressions based on a test condition.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Branch<'heap> {
    /// Conditional branching with if/else.
    If(If<'heap>),
}
