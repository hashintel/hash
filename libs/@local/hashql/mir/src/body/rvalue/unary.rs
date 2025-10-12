//! Unary operation representation for HashQL MIR.
//!
//! Unary operations represent computations that take a single input operand and
//! produce a single result value. They are used for operations like negation,
//! logical NOT, type conversions, and other single-operand transformations.

use hashql_hir::node::operation::UnOp;

use crate::body::operand::Operand;

/// A unary operation in the HashQL MIR.
///
/// Unary operations represent computations that take a single input operand and
/// apply a unary operator to produce a result value. They are used for various
/// single-operand transformations including arithmetic negation, logical negation,
/// type conversions, and other unary computations.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Unary<'heap> {
    /// The unary operator to apply to the operand.
    ///
    /// This [`UnOp`] specifies what kind of unary operation to perform,
    /// such as arithmetic negation, logical NOT. The operator determines both the computation
    /// performed and the result type.
    pub op: UnOp,

    /// The operand of the unary operation.
    ///
    /// This [`Operand`] provides the input value for the unary operation.
    /// It may reference a storage location or contain an immediate constant value.
    pub operand: Operand<'heap>,
}
