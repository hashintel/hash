use hashql_ast::{format::SyntaxDump as _, node::expr::Expr};
use hashql_core::heap::Heap;

use super::{Suite, SuiteDiagnostic};

pub(crate) struct ParseSyntaxDumpSuite;

impl Suite for ParseSyntaxDumpSuite {
    fn name(&self) -> &'static str {
        "parse/syntax-dump"
    }

    fn run<'heap>(
        &self,
        _: &'heap Heap,
        expr: Expr<'heap>,
        _: &mut Vec<SuiteDiagnostic>,
    ) -> Result<String, SuiteDiagnostic> {
        Ok(expr.syntax_dump_to_string())
    }
}
