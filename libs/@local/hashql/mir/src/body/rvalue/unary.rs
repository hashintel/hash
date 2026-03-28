//! Unary operation representation for HashQL MIR.
//!
//! Unary operations represent computations that take a single input operand and
//! produce a single result value. They are used for operations like negation,
//! logical NOT, type conversions, and other single-operand transformations.

use hashql_core::symbol::{Symbol, sym};

use crate::body::operand::Operand;

/// The kinds of unary operators available in HashQL.
///
/// Represents the various operations that can be performed with a single
/// operand, including bitwise and arithmetic negation.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum UnOp {
    /// The `~` operator (bitwise not).
    BitNot,
    /// The `-` operator (negation).
    Neg,
}

impl UnOp {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::BitNot => "~",
            Self::Neg => "-",
        }
    }

    #[must_use]
    pub const fn as_symbol(self) -> Symbol<'static> {
        match self {
            Self::BitNot => sym::symbol::tilde,
            Self::Neg => sym::symbol::minus,
        }
    }
}

impl From<hashql_hir::node::operation::UnOp> for UnOp {
    fn from(value: hashql_hir::node::operation::UnOp) -> Self {
        // `!` is equivalent to `~` on booleans, but `~` only operates on integers, whereas `!`
        // operates on booleans, we are able to collapse that disctinction inside the MIR, because
        // we specialize bools to be bit-width 1 integers.
        match value {
            hashql_hir::node::operation::UnOp::Not | hashql_hir::node::operation::UnOp::BitNot => {
                Self::BitNot
            }
            hashql_hir::node::operation::UnOp::Neg => Self::Neg,
        }
    }
}

/// A unary operation in the HashQL MIR.
///
/// Unary operations represent computations that take a single input operand and
/// apply a unary operator to produce a result value. They are used for various
/// single-operand transformations including arithmetic negation, logical negation,
/// type conversions, and other unary computations.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Unary<'heap> {
    /// The unary operator to apply to the operand.
    pub op: UnOp,

    /// The operand of the unary operation.
    ///
    /// This [`Operand`] provides the input value for the unary operation.
    /// It may reference a storage location or contain an immediate constant value.
    pub operand: Operand<'heap>,
}
