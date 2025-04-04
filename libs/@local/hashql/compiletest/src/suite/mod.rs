mod parse_syntax_dump;

use hashql_ast::node::expr::Expr;
use hashql_core::span::SpanId;
use hashql_diagnostics::{Diagnostic, category::DiagnosticCategory};

use self::parse_syntax_dump::ParseSyntaxDumpSuite;

type SuiteDiagnostic = Diagnostic<Box<dyn DiagnosticCategory>, SpanId>;

pub(crate) trait Suite: Send + Sync + 'static {
    fn name(&self) -> &'static str;

    fn run(
        &self,
        expr: Expr<'_>,
        diagnostics: &mut Vec<SuiteDiagnostic>,
    ) -> Result<String, SuiteDiagnostic>;
}

const SUITES: &[&dyn Suite] = &[&ParseSyntaxDumpSuite];

pub(crate) fn suite(name: &str) -> Option<&'static dyn Suite> {
    SUITES.iter().find(|&suite| suite.name() == name).copied()
}
