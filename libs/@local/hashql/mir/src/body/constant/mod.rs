//! Constant value representation for HashQL MIR.
//!
//! Constants represent compile-time known values that can be used directly
//! in MIR operations without requiring memory access or computation.

mod int;

use hashql_core::value::Primitive;

pub use self::int::{Int, TryFromIntegerError, TryFromPrimitiveError};
use crate::def::DefId;

/// A constant value in the HashQL MIR.
///
/// Constants represent compile-time known values that can be embedded directly
/// into the MIR without requiring storage allocation or runtime computation.
/// They are used extensively in operands and expressions to represent literal
/// values and function references.
///
/// # Usage in MIR
///
/// Constants appear throughout the MIR in contexts such as:
/// - Immediate operands in expressions and assignments
/// - Default values for variables and parameters
/// - Comparison targets in conditional operations
/// - Function references for direct and indirect calls
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Constant<'heap> {
    Int(Int),

    /// A primitive constant value.
    ///
    /// This variant contains immediate primitive values such as integers,
    /// floating-point numbers, strings, booleans, and other literal types
    /// supported by the HashQL type system.
    Primitive(Primitive<'heap>),

    /// The unit constant representing a zero-sized type (ZST).
    ///
    /// This variant represents the unit value `()`, which is a zero-sized type
    /// that carries no data but serves as a meaningful value in contexts where
    /// a value is required but no information needs to be conveyed.
    ///
    /// # Zero-Sized Type Properties
    ///
    /// - Takes no memory space at runtime
    /// - All unit values are identical and interchangeable
    /// - Used to represent "void" or "no meaningful value" scenarios
    Unit,

    /// A function pointer constant.
    ///
    /// This variant represents a reference to a specific function definition
    /// identified by a [`DefId`]. Function pointers enable both direct function
    /// calls and higher-order programming patterns where functions are treated
    /// as first-class values.
    FnPtr(DefId),
}
