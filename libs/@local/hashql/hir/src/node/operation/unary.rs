use hashql_core::{
    span::Spanned,
    symbol::{Symbol, sym},
};

use crate::node::Node;

/// A unary operator in the HashQL HIR.
///
/// Represents a specific unary operation to be performed, such as negation or logical not.
/// Includes source span information for error reporting.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum UnOp {
    /// The `!` operator (not).
    Not,
    /// The `~` operator (bitwise not).
    BitNot,
    /// The `-` operator (negation).
    Neg,
}

impl UnOp {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Not => "!",
            Self::BitNot => "~",
            Self::Neg => "-",
        }
    }

    #[must_use]
    pub const fn as_symbol(self) -> Symbol<'static> {
        match self {
            Self::Not => sym::symbol::exclamation_mark,
            Self::BitNot => sym::symbol::tilde,
            Self::Neg => sym::symbol::sub,
        }
    }
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
