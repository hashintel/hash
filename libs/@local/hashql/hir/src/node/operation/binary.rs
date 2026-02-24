use hashql_core::{
    span::Spanned,
    symbol::{Symbol, sym},
};

use crate::node::Node;

/// The kinds of binary operators available in HashQL.
///
/// Represents the various operations that can be performed with two operands,
/// including arithmetic, comparison, logical, and bitwise operations.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum BinOp {
    /// The `+` operator (addition).
    Add(!),
    /// The `-` operator (subtraction).
    Sub(!),
    /// The `*` operator (multiplication).
    Mul(!),
    /// The `/` operator (division).
    Div(!),
    /// The `%` operator (remainder).
    Rem(!),
    /// The `%%`/`⟲` operator (modulo).
    Mod(!),
    /// The `**`/`↑` operator (exponentiation).
    Pow(!),
    /// The `&&` operator (logical and).
    And,
    /// The `||` operator (logical or).
    Or,
    /// The `^` operator (bitwise xor).
    BitXor(!),
    /// The `&` operator (bitwise and).
    BitAnd(!),
    /// The `|` operator (bitwise or).
    BitOr(!),
    /// The `<<` operator (shift left).
    BitShl(!),
    /// The `>>` operator (shift right).
    BitShr(!),
    /// The `==` operator (equality).
    Eq,
    /// The `!=` operator (not equal to).
    Ne,
    /// The `<` operator (less than).
    Lt,
    /// The `<=` operator (less than or equal to).
    Lte,
    /// The `>` operator (greater than).
    Gt,
    /// The `>=` operator (greater than or equal to).
    Gte,
}

impl BinOp {
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

    #[must_use]
    pub const fn as_symbol(self) -> Symbol<'static> {
        match self {
            Self::And => sym::symbol::ampamp,
            Self::Or => sym::symbol::pipepipe,
            Self::Eq => sym::symbol::eqeq,
            Self::Lt => sym::symbol::lt,
            Self::Lte => sym::symbol::lteq,
            Self::Ne => sym::symbol::excleq,
            Self::Gte => sym::symbol::gteq,
            Self::Gt => sym::symbol::gt,
        }
    }
}

/// A binary operation expression in the HashQL HIR.
///
/// Represents a computation that combines two operands with a binary operator
/// such as addition, comparison, or a logical operation. Binary operations form
/// the core of most computational expressions in HashQL.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct BinaryOperation<'heap> {
    pub op: Spanned<BinOp>,

    pub left: Node<'heap>,
    pub right: Node<'heap>,
}
