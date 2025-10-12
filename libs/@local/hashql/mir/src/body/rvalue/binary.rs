//! Binary operation representation for HashQL MIR.
//!
//! Binary operations represent computations that take two input operands and
//! produce a single result value. They are fundamental building blocks for
//! arithmetic, logical, and comparison operations in the MIR.

use hashql_hir::node::operation::BinOp;

use crate::body::operand::Operand;

/// A binary operation in the HashQL MIR.
///
/// Binary operations represent computations that take two input operands and
/// apply a binary operator to produce a result value. They are used extensively
/// for arithmetic calculations, logical operations, comparisons, and other
/// two-operand computations.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Binary<'heap> {
    /// The binary operator to apply to the operands.
    pub op: BinOp,

    /// The left-hand operand of the binary operation.
    ///
    /// This [`Operand`] provides the first input value for the binary operation.
    /// It may reference a storage location or contain an immediate constant value.
    pub left: Operand<'heap>,

    /// The right-hand operand of the binary operation.
    ///
    /// This [`Operand`] provides the second input value for the binary operation.
    /// It may reference a storage location or contain an immediate constant value.
    pub right: Operand<'heap>,
}
