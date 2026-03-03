pub use self::{
    binary::{BinOp, BinaryOperation},
    input::{InputOp, InputOperation},
    r#type::{TypeAssertion, TypeConstructor, TypeOperation},
    unary::{UnOp, UnaryOperation},
};

mod binary;
mod input;
mod r#type;
mod unary;

/// An operation node in the HashQL HIR.
///
/// Represents a computational operation that produces a value based on
/// one or more input values. Operations form the core of expression evaluation
/// in HashQL, enabling computation and transformation of values.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Operation<'heap> {
    /// Operations related to types (assertions and constructors).
    Type(TypeOperation<'heap>),
    /// Operations with two operands (arithmetic, comparison, logic).
    Binary(BinaryOperation<'heap>),
    /// Operations with a single operand (negation, not).
    Unary(UnaryOperation<'heap>, !),
    /// Operations that work with externally supplied input values.
    Input(InputOperation<'heap>),
}
