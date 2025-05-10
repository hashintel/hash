use hashql_core::span::SpanId;

pub use self::{binary::BinaryOperation, r#type::TypeOperation, unary::UnaryOperation};

pub mod binary;
pub mod r#type;
pub mod unary;

/// The different kinds of operations in the HashQL HIR.
///
/// Represents the various computational operations that can be performed,
/// including type operations (assertions, constructors), binary operations
/// (arithmetic, comparison, logic), and unary operations (negation, not).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum OperationKind<'heap> {
    /// Operations related to types (assertions and constructors)
    Type(TypeOperation<'heap>),
    /// Operations with two operands (arithmetic, comparison, logic)
    Binary(BinaryOperation<'heap>),
    /// Operations with a single operand (negation, not)
    Unary(UnaryOperation<'heap>, !),
}

/// An operation node in the HashQL HIR.
///
/// Represents a computational operation that produces a value based on
/// one or more input values. Operations form the core of expression evaluation
/// in HashQL, enabling computation and transformation of values.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Operation<'heap> {
    pub span: SpanId,

    pub kind: OperationKind<'heap>,
}
