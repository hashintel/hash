use core::fmt::{self, Write as _};

use crate::store::postgres::query::{Expression, Transpile};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[expect(
    clippy::doc_paragraphs_missing_punctuation,
    reason = "The documentation is only the transpiled symbols"
)]
pub enum BinaryOperator {
    // --- Comparison ---
    /// `<lhs> = <rhs>`
    Equal,
    /// `<lhs> != <rhs>`
    NotEqual,
    /// `<lhs> > <rhs>`
    Greater,
    /// `<lhs> >= <rhs>`
    GreaterOrEqual,
    /// `<lhs> < <rhs>`
    Less,
    /// `<lhs> <= <rhs>`
    LessOrEqual,
    /// `<lhs> = ANY(<rhs>)`
    In,

    // --- Arithmetic ---
    /// `<lhs> + <rhs>`
    Add,
    /// `<lhs> - <rhs>`
    Subtract,
    /// `<lhs> * <rhs>`
    Multiply,
    /// `<lhs> / <rhs>`
    Divide,
    /// `<lhs> % <rhs>`
    Modulo,

    // --- Bitwise ---
    /// `<lhs> & <rhs>`
    BitwiseAnd,
    /// `<lhs> | <rhs>`
    BitwiseOr,

    // --- JSON ---
    /// `<lhs> -> <rhs>`
    JsonAccess,
    /// `<lhs> ->> <rhs>`
    JsonAccessAsText,

    // --- Domain-specific ---
    /// `<lhs> @> <rhs>::TIMESTAMPTZ`
    TimeIntervalContainsTimestamp,
    /// `<lhs> && <rhs>`
    Overlap,
    /// `<lhs> <=> <rhs>`
    CosineDistance,
}

impl BinaryOperator {
    fn transpile(self, fmt: &mut fmt::Formatter) -> fmt::Result {
        let string = match self {
            Self::Equal => " = ",
            Self::NotEqual => " != ",
            Self::Greater => " > ",
            Self::GreaterOrEqual => " >= ",
            Self::Less => " < ",
            Self::LessOrEqual => " <= ",
            Self::In => " = ANY(",
            Self::Add => " + ",
            Self::Subtract => " - ",
            Self::Multiply => " * ",
            Self::Divide => " / ",
            Self::Modulo => " % ",
            Self::BitwiseAnd => " & ",
            Self::BitwiseOr => " | ",
            Self::JsonAccess => " -> ",
            Self::JsonAccessAsText => " ->> ",
            Self::TimeIntervalContainsTimestamp => " @> ",
            Self::Overlap => " && ",
            Self::CosineDistance => " <=> ",
        };
        fmt.write_str(string)
    }

    fn transpile_post(self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::In => fmt.write_char(')'),
            Self::TimeIntervalContainsTimestamp => fmt.write_str("::TIMESTAMPTZ"),
            Self::Equal
            | Self::NotEqual
            | Self::Greater
            | Self::GreaterOrEqual
            | Self::Less
            | Self::LessOrEqual
            | Self::Add
            | Self::Subtract
            | Self::Multiply
            | Self::Divide
            | Self::Modulo
            | Self::BitwiseAnd
            | Self::BitwiseOr
            | Self::JsonAccess
            | Self::JsonAccessAsText
            | Self::Overlap
            | Self::CosineDistance => Ok(()),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct BinaryExpression {
    pub op: BinaryOperator,
    pub left: Box<Expression>,
    pub right: Box<Expression>,
}

impl Transpile for BinaryExpression {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        self.left.transpile(fmt)?;
        self.op.transpile(fmt)?;
        self.right.transpile(fmt)?;
        self.op.transpile_post(fmt)
    }
}
