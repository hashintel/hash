use hashql_core::{intern::Interned, span::SpanId};

use crate::node::Node;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum BinOpKind {
    /// The `+` operator (addition)
    Add,
    /// The `-` operator (subtraction)
    Sub,
    /// The `*` operator (multiplication)
    Mul,
    /// The `/` operator (division)
    Div,
    /// The `%` operator (remainder)
    Rem,
    /// The `%%`/`⟲` operator (modulo)
    Mod,
    /// The `**`/`↑` operator (exponentiation)
    Pow,
    /// The `&&` operator (logical and)
    And,
    /// The `||` operator (logical or)
    Or,
    /// The `^` operator (bitwise xor)
    BitXor,
    /// The `&` operator (bitwise and)
    BitAnd,
    /// The `|` operator (bitwise or)
    BitOr,
    /// The `<<` operator (shift left)
    BitShl,
    /// The `>>` operator (shift right)
    BitShr,
    /// The `==` operator (equality)
    Eq,
    /// The `<` operator (less than)
    Lt,
    /// The `<=` operator (less than or equal to)
    Lte,
    /// The `!=` operator (not equal to)
    Ne,
    /// The `>=` operator (greater than or equal to)
    Ge,
    /// The `>` operator (greater than)
    Gte,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct BinOp {
    pub span: SpanId,

    pub kind: BinOpKind,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct BinaryOperation<'heap> {
    pub span: SpanId,

    pub op: BinOp,
    pub left: Interned<'heap, Node<'heap>>,
    pub right: Interned<'heap, Node<'heap>>,
}
