use core::fmt::{self, Write as _};

use crate::store::postgres::query::{Expression, Transpile};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[expect(
    clippy::doc_paragraphs_missing_punctuation,
    reason = "The documentation is only the transpiled symbols"
)]
pub enum UnaryOperator {
    /// `NOT(<expr>)`
    Not,
    /// `<expr> IS NULL`
    IsNull,
    /// `-<expr>`
    Negate,
    /// `~<expr>`
    BitwiseNot,
}

#[derive(Debug, Clone, PartialEq)]
pub struct UnaryExpression {
    pub op: UnaryOperator,
    pub expr: Box<Expression>,
}

impl Transpile for UnaryExpression {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self.op {
            UnaryOperator::Not => {
                if let Expression::Unary(Self {
                    op: UnaryOperator::IsNull,
                    expr,
                }) = &*self.expr
                {
                    expr.transpile(fmt)?;
                    fmt.write_str(" IS NOT NULL")
                } else {
                    fmt.write_str("NOT(")?;
                    self.expr.transpile(fmt)?;
                    fmt.write_char(')')
                }
            }
            UnaryOperator::IsNull => {
                self.expr.transpile(fmt)?;
                fmt.write_str(" IS NULL")
            }
            UnaryOperator::Negate => {
                fmt.write_str("-(")?;
                self.expr.transpile(fmt)?;
                fmt.write_char(')')
            }
            UnaryOperator::BitwiseNot => {
                fmt.write_str("~(")?;
                self.expr.transpile(fmt)?;
                fmt.write_char(')')
            }
        }
    }
}
