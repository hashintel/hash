mod ast_lowering_name_resolver;
mod parse_syntax_dump;

use hashql_ast::{heap::Heap, node::expr::Expr};
use hashql_core::span::{SpanId, node::SpanNode};
use hashql_diagnostics::{Diagnostic, category::DiagnosticCategory};
use hashql_syntax_jexpr::span::Span;

use self::{
    ast_lowering_name_resolver::AstLoweringNameResolverSuite,
    parse_syntax_dump::ParseSyntaxDumpSuite,
};

pub(crate) type SuiteDiagnostic = Diagnostic<Box<dyn DiagnosticCategory>, SpanId>;
pub(crate) type ResolvedSuiteDiagnostic = Diagnostic<Box<dyn DiagnosticCategory>, SpanNode<Span>>;

pub(crate) trait Suite: Send + Sync + 'static {
    fn name(&self) -> &'static str;

    fn run<'heap>(
        &self,
        heap: &'heap Heap,
        expr: Expr<'heap>,
        diagnostics: &mut Vec<SuiteDiagnostic>,
    ) -> Result<String, SuiteDiagnostic>;
}

const SUITES: &[&dyn Suite] = &[&ParseSyntaxDumpSuite, &AstLoweringNameResolverSuite];

pub(crate) fn find_suite(name: &str) -> Option<&'static dyn Suite> {
    SUITES.iter().find(|&suite| suite.name() == name).copied()
}
