//! Binary operation representation for HashQL MIR.
//!
//! Binary operations represent computations that take two input operands and
//! produce a single result value. They are fundamental building blocks for
//! arithmetic, logical, and comparison operations in the MIR.

use hashql_core::symbol::{Symbol, sym};

use crate::body::operand::Operand;

/// The kinds of binary operators available in HashQL.
///
/// Represents the various operations that can be performed with two operands,
/// including arithmetic, comparison, logical, and bitwise operations.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum BinOp {
    /// The `+` operator (addition).
    Add,
    /// The `-` operator (subtraction).
    Sub,
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
    /// The `^` operator (bitwise xor).
    BitXor(!),
    /// The `&` operator (bitwise and).
    BitAnd,
    /// The `|` operator (bitwise or).
    BitOr,
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
            Self::Add => "+",
            Self::Sub => "-",
            Self::BitAnd => "&",
            Self::BitOr => "|",
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
            Self::Add => sym::symbol::plus,
            Self::Sub => sym::symbol::minus,
            Self::BitAnd => sym::symbol::ampersand,
            Self::BitOr => sym::symbol::pipe,
            Self::Eq => sym::symbol::eqeq,
            Self::Lt => sym::symbol::lt,
            Self::Lte => sym::symbol::lteq,
            Self::Ne => sym::symbol::excleq,
            Self::Gte => sym::symbol::gteq,
            Self::Gt => sym::symbol::gt,
        }
    }
}

impl From<hashql_hir::node::operation::BinOp> for BinOp {
    fn from(value: hashql_hir::node::operation::BinOp) -> Self {
        // `And` on bools (what the HIR enforces) is the same as a bitwise `And` and `Or`
        // respectively
        match value {
            hashql_hir::node::operation::BinOp::And => Self::BitAnd,
            hashql_hir::node::operation::BinOp::Or => Self::BitOr,
            hashql_hir::node::operation::BinOp::Eq => Self::Eq,
            hashql_hir::node::operation::BinOp::Ne => Self::Ne,
            hashql_hir::node::operation::BinOp::Lt => Self::Lt,
            hashql_hir::node::operation::BinOp::Lte => Self::Lte,
            hashql_hir::node::operation::BinOp::Gt => Self::Gt,
            hashql_hir::node::operation::BinOp::Gte => Self::Gte,
        }
    }
}

/// A binary operation in the HashQL MIR.
///
/// Binary operations represent computations that take two input operands and
/// apply a binary operator to produce a result value. They are used extensively
/// for arithmetic calculations, logical operations, comparisons, and other
/// two-operand computations.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Binary<'heap> {
    /// The binary operator to apply to the operands.
    pub op: BinOp,

    /// The left-hand operand of the binary operation.
    ///
    /// This [`Operand`] provides the first input value for the binary operation.
    /// It may reference a storage location or contain an immediate constant value.
    pub left: Operand<'heap>,

    /// The right-hand operand of the binary operation.
    ///
    /// This [`Operand`] provides the second input value for the binary operation.
    /// It may reference a storage location or contain an immediate constant value.
    pub right: Operand<'heap>,
}
