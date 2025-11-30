//! Constant value representation for HashQL MIR.
//!
//! This module defines the [`Constant`] enum and supporting types for representing
//! compile-time known values in the MIR. Constants can be used directly in MIR
//! operations without requiring memory access or runtime computation.
//!
//! # Constant Variants
//!
//! - [`Constant::Int`] - Finite-precision integers that participate in constant evaluation
//! - [`Constant::Primitive`] - Opaque primitive values (not evaluated)
//! - [`Constant::Unit`] - The unit value `()`
//! - [`Constant::FnPtr`] - Function pointer references
//!
//! # Constant Evaluation
//!
//! The MIR distinguishes between values that participate in constant evaluation and
//! those that are treated as opaque:
//!
//! - **[`Int`]** values are used for constant evaluation. Operations like `SwitchInt` can inspect
//!   and branch on these values at compile time.
//!
//! - **[`Primitive`]** values are treated as opaque by the MIR. Even though a [`Primitive`] may
//!   contain an integer or boolean, the MIR will not inspect or evaluate it. These values pass
//!   through unchanged until runtime.
//!
//! This separation allows the compiler to perform optimizations on [`Int`] values
//! while preserving the semantics of complex primitive types that should not be
//! evaluated at compile time.

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
///
/// # Constant Evaluation
///
/// Only [`Int`] values participate in constant evaluation. [`Primitive`] values
/// are treated as opaque and pass through the MIR unchanged. See the
/// [module documentation](self) for details.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Constant<'heap> {
    /// A finite-precision integer constant.
    ///
    /// This variant holds integers that participate in constant evaluation.
    /// Operations like [`SwitchInt`] can inspect and branch on these values
    /// at compile time.
    ///
    /// [`SwitchInt`]: crate::body::terminator::SwitchInt
    Int(Int),

    /// An opaque primitive constant value.
    ///
    /// This variant contains primitive values such as integers, floating-point
    /// numbers, strings, booleans, and null. Unlike [`Int`], these values are
    /// treated as **opaque** by the MIR and do not participate in constant
    /// evaluation.
    ///
    /// Even if a [`Primitive`] contains an integer or boolean, the MIR will not
    /// inspect or evaluate it. These values pass through unchanged until runtime.
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
