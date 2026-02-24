//! Operand representation for HashQL MIR.
//!
//! Operands represent the inputs to MIR operations. They can either reference
//! a storage location (place) or contain an immediate constant value.

use hashql_core::r#type::TypeId;

use super::{
    constant::Constant,
    local::{Local, LocalDecl, LocalSlice},
    place::Place,
};

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

impl<'heap> Operand<'heap> {
    /// Returns the contained [`Place`] if this operand is a place reference.
    ///
    /// Returns [`None`] if this operand is a constant.
    #[must_use]
    pub const fn as_place(&self) -> Option<&Place<'heap>> {
        match self {
            Operand::Place(place) => Some(place),
            Operand::Constant(_) => None,
        }
    }

    /// Returns the contained [`Constant`] if this operand is an immediate value.
    ///
    /// Returns [`None`] if this operand is a place reference.
    #[must_use]
    pub const fn as_constant(&self) -> Option<&Constant<'heap>> {
        match self {
            Operand::Constant(constant) => Some(constant),
            Operand::Place(_) => None,
        }
    }
}

impl From<!> for Operand<'_> {
    fn from(value: !) -> Self {
        value
    }
}

impl From<Local> for Operand<'_> {
    fn from(local: Local) -> Self {
        Operand::Place(Place::local(local))
    }
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
