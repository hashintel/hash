use hashql_core::{intern::Interned, span::SpanId};

use crate::node::Node;

/// The kinds of unary operators available in HashQL.
///
/// Represents the various operations that can be performed with a single operand,
/// including logical negation, bitwise negation, and arithmetic negation.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum UnOpKind {
    /// The `!` operator (not)
    Not,
    /// The `~` operator (bitwise not)
    BitNot,
    /// The `-` operator (negation)
    Neg,
}

/// A unary operator in the HashQL HIR.
///
/// Represents a specific unary operation to be performed, such as negation or logical not.
/// Includes source span information for error reporting.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct UnOp {
    pub span: SpanId,

    pub kind: UnOpKind,
}

/// A unary operation expression in the HashQL HIR.
///
/// Represents a computation that applies a single operator to an operand,
/// such as negation, logical not, or bitwise not.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct UnaryOperation<'heap> {
    pub span: SpanId,

    pub op: UnOp,
    pub expr: Interned<'heap, Node<'heap>>,
}
