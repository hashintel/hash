use core::fmt::{self, Write as _};

use crate::store::postgres::query::{Expression, Transpile};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[expect(
    clippy::doc_paragraphs_missing_punctuation,
    reason = "The documentation is only the transpiled symbols"
)]
pub enum VariadicOperator {
    /// `(c1) AND (c2) AND ...`
    ///
    /// Empty list transpiles to `TRUE`.
    And,
    /// `((c1) OR (c2) OR ...)`
    ///
    /// Empty list transpiles to `FALSE`.
    Or,
    /// `(e1 || e2 || ...)`
    ///
    /// Empty list transpiles to nothing (panics — caller must ensure non-empty).
    Concatenate,
}

#[derive(Debug, Clone, PartialEq)]
pub struct VariadicExpression {
    pub op: VariadicOperator,
    pub exprs: Vec<Expression>,
}

impl Transpile for VariadicExpression {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self.op {
            VariadicOperator::And => {
                if self.exprs.is_empty() {
                    return fmt.write_str("TRUE");
                }
                for (idx, expr) in self.exprs.iter().enumerate() {
                    if idx > 0 {
                        fmt.write_str(" AND ")?;
                    }
                    fmt.write_char('(')?;
                    expr.transpile(fmt)?;
                    fmt.write_char(')')?;
                }
                Ok(())
            }
            VariadicOperator::Or => {
                if self.exprs.is_empty() {
                    return fmt.write_str("FALSE");
                }
                if self.exprs.len() > 1 {
                    fmt.write_char('(')?;
                }
                for (idx, expr) in self.exprs.iter().enumerate() {
                    if idx > 0 {
                        fmt.write_str(" OR ")?;
                    }
                    fmt.write_char('(')?;
                    expr.transpile(fmt)?;
                    fmt.write_char(')')?;
                }
                if self.exprs.len() > 1 {
                    fmt.write_char(')')?;
                }
                Ok(())
            }
            VariadicOperator::Concatenate => {
                fmt.write_char('(')?;
                for (idx, expr) in self.exprs.iter().enumerate() {
                    if idx > 0 {
                        fmt.write_str(" || ")?;
                    }
                    expr.transpile(fmt)?;
                }
                fmt.write_char(')')
            }
        }
    }
}
