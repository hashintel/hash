#![coverage(off)]
mod ast_lowering_import_resolver;
mod ast_lowering_import_resolver_continue;
mod ast_lowering_node_mangler;
mod ast_lowering_node_renumberer;
mod ast_lowering_pre_expansion_name_resolver;
mod ast_lowering_sanitizer;
mod ast_lowering_special_form_expander;
mod ast_lowering_type_definition_extractor;
mod ast_lowering_type_extractor;
pub(crate) mod common;
mod eval_graph_read_entity;
mod hir_lower_alias_replacement;
mod hir_lower_checking;
mod hir_lower_ctor;
mod hir_lower_inference;
mod hir_lower_inference_intrinsics;
mod hir_lower_specialization;
mod hir_reify;
mod parse_syntax_dump;

use core::panic::RefUnwindSafe;

use hashql_ast::node::expr::Expr;
use hashql_core::{heap::Heap, span::SpanId};
use hashql_diagnostics::{Diagnostic, category::DiagnosticCategory, span::AbsoluteDiagnosticSpan};

use self::{
    ast_lowering_import_resolver::AstLoweringImportResolverSuite,
    ast_lowering_import_resolver_continue::AstLoweringImportResolverContinueSuite,
    ast_lowering_node_mangler::AstLoweringNameManglerSuite,
    ast_lowering_node_renumberer::AstLoweringNodeRenumbererSuite,
    ast_lowering_pre_expansion_name_resolver::AstLoweringNameResolverSuite,
    ast_lowering_sanitizer::AstLoweringSanitizerSuite,
    ast_lowering_special_form_expander::AstLoweringSpecialFormExpanderSuite,
    ast_lowering_type_definition_extractor::AstLoweringTypeDefinitionExtractorSuite,
    ast_lowering_type_extractor::AstLoweringTypeExtractorSuite,
    eval_graph_read_entity::EvalGraphReadEntitySuite,
    hir_lower_alias_replacement::HirLowerAliasReplacementSuite,
    hir_lower_checking::HirLowerTypeCheckingSuite, hir_lower_ctor::HirLowerCtorSuite,
    hir_lower_inference::HirLowerTypeInferenceSuite,
    hir_lower_inference_intrinsics::HirLowerTypeInferenceIntrinsicsSuite,
    hir_lower_specialization::HirLowerSpecializationSuite, hir_reify::HirReifySuite,
    parse_syntax_dump::ParseSyntaxDumpSuite,
};

pub(crate) type SuiteDiagnostic = Diagnostic<Box<dyn DiagnosticCategory>, SpanId>;
pub(crate) type ResolvedSuiteDiagnostic =
    Diagnostic<Box<dyn DiagnosticCategory>, AbsoluteDiagnosticSpan>;

pub(crate) trait Suite: RefUnwindSafe + Send + Sync + 'static {
    fn name(&self) -> &'static str;

    fn run<'heap>(
        &self,
        heap: &'heap Heap,
        expr: Expr<'heap>,
        diagnostics: &mut Vec<SuiteDiagnostic>,
    ) -> Result<String, SuiteDiagnostic>;
}

const SUITES: &[&dyn Suite] = &[
    &AstLoweringImportResolverContinueSuite,
    &AstLoweringImportResolverSuite,
    &AstLoweringNameManglerSuite,
    &AstLoweringNameResolverSuite,
    &AstLoweringNodeRenumbererSuite,
    &AstLoweringSanitizerSuite,
    &AstLoweringSpecialFormExpanderSuite,
    &AstLoweringTypeDefinitionExtractorSuite,
    &AstLoweringTypeExtractorSuite,
    &EvalGraphReadEntitySuite,
    &HirLowerAliasReplacementSuite,
    &HirLowerCtorSuite,
    &HirLowerSpecializationSuite,
    &HirLowerTypeCheckingSuite,
    &HirLowerTypeInferenceIntrinsicsSuite,
    &HirLowerTypeInferenceSuite,
    &HirReifySuite,
    &ParseSyntaxDumpSuite,
];

pub(crate) fn find_suite(name: &str) -> Option<&'static dyn Suite> {
    SUITES.iter().find(|&suite| suite.name() == name).copied()
}
