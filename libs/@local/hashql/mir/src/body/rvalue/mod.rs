//! R-value expression representation for HashQL MIR.
//!
//! R-values represent expressions that produce values in the MIR. They are used
//! on the right-hand side of assignments and as operands in various operations.
//! Unlike places, r-values represent computations rather than storage locations.

mod aggregate;
mod apply;
mod binary;
mod input;
mod unary;

pub use self::{
    aggregate::{Aggregate, AggregateKind},
    apply::{Apply, ArgIndex},
    binary::{BinOp, Binary},
    input::Input,
    unary::Unary,
};
use crate::body::operand::Operand;

/// An r-value expression in the HashQL MIR.
///
/// R-values represent computations that produce values when evaluated. They are
/// used extensively throughout the MIR as the source of assignments, function
/// arguments, and other contexts where values are needed rather than storage
/// locations.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum RValue<'heap> {
    /// Load a value from an operand.
    ///
    /// This r-value reads a value from either a place (storage location) or
    /// a constant. It represents the fundamental operation of obtaining a
    /// value for use in computations.
    Load(Operand<'heap>),

    /// Perform a binary operation between two operands.
    ///
    /// This r-value computes the result of applying a binary operator (such as
    /// addition, comparison, or logical operations) to two input operands.
    Binary(Binary<'heap>),

    /// Perform a unary operation on a single operand.
    ///
    /// This r-value computes the result of applying a unary operator (such as
    /// negation, logical not, or type conversions) to a single input operand.
    Unary(Unary<'heap>),

    /// Construct an aggregate value from component parts.
    ///
    /// This r-value creates structured data such as tuples, arrays, or custom
    /// types by combining multiple component values.
    Aggregate(Aggregate<'heap>),

    /// Access external input data or query parameters.
    ///
    /// This r-value provides access to input parameters that are supplied
    /// at query execution time. It enables HashQL queries to accept dynamic
    /// values from the calling context, such as user-provided parameters
    /// or configuration values.
    Input(Input<'heap>),

    /// Apply a function to a list of arguments.
    ///
    /// This r-value represents a function call operation, where a callable
    /// function is invoked with a list of argument operands. This covers
    /// all forms of function application including user-defined functions,
    /// built-in operations, method calls, and constructor invocations.
    Apply(Apply<'heap>),
}
