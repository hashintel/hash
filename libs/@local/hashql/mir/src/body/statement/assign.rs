//! Assignment statement representation for HashQL MIR.
//!
//! Assignment statements represent the fundamental operation of copying or moving
//! values from source expressions (r-values) to destination storage locations (places).

use crate::body::{place::Place, rvalue::RValue};

/// An assignment statement in the HashQL MIR.
///
/// Assignment statements represent the operation of evaluating an r-value expression
/// and storing the result in a destination place. This is one of the most fundamental
/// operations in the MIR, enabling data flow between variables and expressions.
///
/// # Semantics
///
/// The assignment operation:
/// 1. Evaluates the right-hand side r-value expression
/// 2. Stores the resulting value in the left-hand side place
/// 3. The place becomes available for subsequent reads
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Assign<'heap> {
    /// The destination place where the computed value will be stored.
    ///
    /// This [`Place`] specifies the storage location that will receive the
    /// result of evaluating the right-hand side. It may reference a simple
    /// local variable or a complex path through structured data.
    pub lhs: Place<'heap>,

    /// The source r-value expression that will be evaluated and stored.
    ///
    /// This [`RValue`] specifies the computation or value that will be
    /// evaluated and then stored in the left-hand side place. It may be
    /// a simple load, a complex expression, or an aggregate construction.
    pub rhs: RValue<'heap>,
}
