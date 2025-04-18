mod ast_lowering_node_mangler;
mod ast_lowering_node_renumberer;
mod ast_lowering_pre_expansion_name_resolver;
mod ast_lowering_special_form_expander;
pub(crate) mod common;
mod parse_syntax_dump;

use hashql_ast::{heap::Heap, node::expr::Expr};
use hashql_core::span::SpanId;
use hashql_diagnostics::{Diagnostic, category::DiagnosticCategory, span::AbsoluteDiagnosticSpan};

use self::{
    ast_lowering_node_mangler::AstLoweringNameManglerSuite,
    ast_lowering_node_renumberer::AstLoweringNodeRenumbererSuite,
    ast_lowering_pre_expansion_name_resolver::AstLoweringNameResolverSuite,
    ast_lowering_special_form_expander::AstLoweringSpecialFormExpanderSuite,
    parse_syntax_dump::ParseSyntaxDumpSuite,
};

pub(crate) type SuiteDiagnostic = Diagnostic<Box<dyn DiagnosticCategory>, SpanId>;
pub(crate) type ResolvedSuiteDiagnostic =
    Diagnostic<Box<dyn DiagnosticCategory>, AbsoluteDiagnosticSpan>;

pub(crate) trait Suite: Send + Sync + 'static {
    fn name(&self) -> &'static str;

    fn run<'heap>(
        &self,
        heap: &'heap Heap,
        expr: Expr<'heap>,
        diagnostics: &mut Vec<SuiteDiagnostic>,
    ) -> Result<String, SuiteDiagnostic>;
}

const SUITES: &[&dyn Suite] = &[
    &ParseSyntaxDumpSuite,
    &AstLoweringNameResolverSuite,
    &AstLoweringSpecialFormExpanderSuite,
    &AstLoweringNodeRenumbererSuite,
    &AstLoweringNameManglerSuite,
];

pub(crate) fn find_suite(name: &str) -> Option<&'static dyn Suite> {
    SUITES.iter().find(|&suite| suite.name() == name).copied()
}
