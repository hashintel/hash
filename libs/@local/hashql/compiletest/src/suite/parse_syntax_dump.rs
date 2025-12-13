use hashql_ast::{format::SyntaxDump as _, node::expr::Expr};

use super::{RunContext, Suite, SuiteDiagnostic};

pub(crate) struct ParseSyntaxDumpSuite;

impl Suite for ParseSyntaxDumpSuite {
    fn name(&self) -> &'static str {
        "parse/syntax-dump"
    }

    fn description(&self) -> &'static str {
        "Parser output as a syntax dump"
    }

    fn run<'heap>(
        &self,
        _: RunContext<'_, 'heap>,
        expr: Expr<'heap>,
    ) -> Result<String, SuiteDiagnostic> {
        Ok(expr.syntax_dump_to_string())
    }
}
