//! Operand representation for HashQL MIR.
//!
//! Operands represent the inputs to MIR operations. They can either reference
//! a storage location (place) or contain an immediate constant value.

use super::{constant::Constant, place::Place};

/// An operand in a HashQL MIR operation.
///
/// Operands represent the input values for MIR operations such as assignments,
/// function calls, and arithmetic operations. They provide a unified way to
/// reference either stored values or immediate constants.
///
/// # Usage in MIR
///
/// Operands are used throughout the MIR to represent:
/// - Arguments to function calls
/// - Inputs to binary and unary operations
/// - Source values in assignment statements
/// - Indices for array/field access
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Operand<'heap> {
    /// References a [`Place`] that can be read to obtain a value.
    ///
    /// This variant represents an operand that reads from a storage location, such as a local
    /// variable or a field of a struct. The place may include projections to access nested
    /// data.
    Place(Place<'heap>),

    /// Contains a [`Constant`] immediate value.
    ///
    /// This variant represents an operand that provides an immediate constant value, such as a
    /// literal number, string, or function pointer. No memory access is required to obtain the
    /// value.
    Constant(Constant<'heap>),
}

impl<'heap> From<Place<'heap>> for Operand<'heap> {
    fn from(place: Place<'heap>) -> Self {
        Operand::Place(place)
    }
}

impl<'heap> From<Constant<'heap>> for Operand<'heap> {
    fn from(constant: Constant<'heap>) -> Self {
        Operand::Constant(constant)
    }
}
