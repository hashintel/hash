use hashql_core::span::Spanned;

use crate::node::Node;

/// A unary operator in the HashQL HIR.
///
/// Represents a specific unary operation to be performed, such as negation or logical not.
/// Includes source span information for error reporting.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum UnOp {
    /// The `!` operator (not)
    Not,
    /// The `~` operator (bitwise not)
    BitNot,
    /// The `-` operator (negation)
    Neg,
}

/// A unary operation expression in the HashQL HIR.
///
/// Represents a computation that applies a single operator to an operand,
/// such as negation, logical not, or bitwise not.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct UnaryOperation<'heap> {
    pub op: Spanned<UnOp>,
    pub expr: Node<'heap>,
}
