use hashql_core::span::SpanId;

use crate::node::Node;

/// The kinds of binary operators available in HashQL.
///
/// Represents the various operations that can be performed with two operands,
/// including arithmetic, comparison, logical, and bitwise operations.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum BinOpKind {
    /// The `+` operator (addition)
    Add(!),
    /// The `-` operator (subtraction)
    Sub(!),
    /// The `*` operator (multiplication)
    Mul(!),
    /// The `/` operator (division)
    Div(!),
    /// The `%` operator (remainder)
    Rem(!),
    /// The `%%`/`⟲` operator (modulo)
    Mod(!),
    /// The `**`/`↑` operator (exponentiation)
    Pow(!),
    /// The `&&` operator (logical and)
    And,
    /// The `||` operator (logical or)
    Or,
    /// The `^` operator (bitwise xor)
    BitXor(!),
    /// The `&` operator (bitwise and)
    BitAnd(!),
    /// The `|` operator (bitwise or)
    BitOr(!),
    /// The `<<` operator (shift left)
    BitShl(!),
    /// The `>>` operator (shift right)
    BitShr(!),
    /// The `==` operator (equality)
    Eq,
    /// The `!=` operator (not equal to)
    Ne,
    /// The `<` operator (less than)
    Lt,
    /// The `<=` operator (less than or equal to)
    Lte,
    /// The `>` operator (greater than)
    Gt,
    /// The `>=` operator (greater than or equal to)
    Gte,
}

impl BinOpKind {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::And => "&&",
            Self::Or => "||",
            Self::Eq => "==",
            Self::Lt => "<",
            Self::Lte => "<=",
            Self::Ne => "!=",
            Self::Gte => ">=",
            Self::Gt => ">",
        }
    }
}

/// A binary operator in the HashQL HIR.
///
/// Represents a specific binary operation to be performed, such as addition,
/// comparison, or a logical operation. Includes source span information for error reporting.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct BinOp {
    pub span: SpanId,

    pub kind: BinOpKind,
}

/// A binary operation expression in the HashQL HIR.
///
/// Represents a computation that combines two operands with a binary operator
/// such as addition, comparison, or a logical operation. Binary operations form
/// the core of most computational expressions in HashQL.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct BinaryOperation<'heap> {
    pub span: SpanId,

    pub op: BinOp,
    pub left: Node<'heap>,
    pub right: Node<'heap>,
}
