use core::{error::Error, fmt};

use cedar_policy_core::ast;
use error_stack::{Report, ResultExt as _, TryReportIteratorExt as _};

use crate::policies::cedar::{CedarExpressionVisitor, CedarExpressionVisitorError};

#[derive(Debug, derive_more::Display)]
#[display("Parsing base url failed: {_variant}")]
pub(crate) enum ParseSetError {
    #[display("unexpected expression")]
    UnexpectedExpression,
    #[display("invalid set element")]
    InvalidElement,
}

impl Error for ParseSetError {}

impl CedarExpressionVisitorError for ParseSetError {
    fn unexpected_expression() -> Self {
        Self::UnexpectedExpression
    }
}

pub(crate) struct ExpressionSetVisitor<V>(pub V);

impl<V> CedarExpressionVisitor for ExpressionSetVisitor<V>
where
    V: CedarExpressionVisitor,
{
    type Error = ParseSetError;
    type Value = Vec<V::Value>;

    fn expecting(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("a set")
    }

    fn visit_set(&self, set: &[ast::Expr]) -> Result<Self::Value, Report<Self::Error>> {
        set.iter()
            .map(|expr| self.0.visit_expr(expr))
            .try_collect_reports()
            .change_context(ParseSetError::InvalidElement)
    }
}
