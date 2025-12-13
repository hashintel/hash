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
mod hir_lower_graph_hoisting;
mod hir_lower_inference;
mod hir_lower_inference_intrinsics;
mod hir_lower_normalization;
mod hir_lower_specialization;
mod hir_lower_thunking;
mod hir_reify;
mod mir_pass_analysis_data_dependency;
mod mir_pass_transform_cfg_simplify;
mod mir_reify;
mod parse_syntax_dump;

use core::panic::RefUnwindSafe;

use error_stack::ReportSink;
use hashql_ast::node::expr::Expr;
use hashql_core::{collections::FastHashMap, heap::Heap, span::SpanId};
use hashql_diagnostics::{Diagnostic, category::DiagnosticCategory};

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
    hir_lower_graph_hoisting::HirLowerGraphHoistingSuite,
    hir_lower_inference::HirLowerTypeInferenceSuite,
    hir_lower_inference_intrinsics::HirLowerTypeInferenceIntrinsicsSuite,
    hir_lower_normalization::HirLowerNormalizationSuite,
    hir_lower_specialization::HirLowerSpecializationSuite,
    hir_lower_thunking::HirLowerThunkingSuite, hir_reify::HirReifySuite,
    mir_pass_analysis_data_dependency::MirPassAnalysisDataDependency,
    mir_pass_transform_cfg_simplify::MirPassTransformCfgSimplify, mir_reify::MirReifySuite,
    parse_syntax_dump::ParseSyntaxDumpSuite,
};
use crate::executor::TrialError;

pub(crate) type SuiteDiagnostic = Diagnostic<Box<dyn DiagnosticCategory>, SpanId>;

mod private {
    pub(crate) struct Private(pub ());
}

pub(crate) type SuiteDirectives = FastHashMap<String, toml::Value>;

pub(crate) struct RunContextPartial<'ctx, 'heap> {
    pub heap: &'heap Heap,
    pub diagnostics: &'ctx mut Vec<SuiteDiagnostic>,
    pub suite_directives: &'ctx SuiteDirectives,
    pub secondary_outputs: &'ctx mut FastHashMap<&'static str, String>,
    pub reports: &'ctx mut ReportSink<TrialError>,
}

pub(crate) struct RunContext<'ctx, 'heap> {
    pub heap: &'heap Heap,
    pub diagnostics: &'ctx mut Vec<SuiteDiagnostic>,
    pub suite_directives: &'ctx SuiteDirectives,
    pub secondary_outputs: &'ctx mut FastHashMap<&'static str, String>,
    pub reports: &'ctx mut ReportSink<TrialError>,

    // Makes sure that the type is non-exhaustive within the crate, this is important so that we
    // can ensure that adding another attribute won't have any cascading results in all compiletest
    // suites that destructure.
    _private: private::Private,
}

impl<'ctx, 'heap> RunContext<'ctx, 'heap> {
    pub(crate) fn new(
        RunContextPartial {
            heap,
            diagnostics,
            suite_directives,
            secondary_outputs,
            reports,
        }: RunContextPartial<'ctx, 'heap>,
    ) -> Self {
        Self {
            heap,
            diagnostics,
            suite_directives,
            secondary_outputs,
            reports,
            _private: private::Private(()),
        }
    }
}

pub(crate) trait Suite: RefUnwindSafe + Send + Sync + 'static {
    fn priority(&self) -> usize {
        0
    }

    fn secondary_file_extensions(&self) -> &[&str] {
        &[]
    }

    fn name(&self) -> &'static str;
    fn description(&self) -> &'static str;

    fn run<'heap>(
        &self,
        ctx: RunContext<'_, 'heap>,
        expr: Expr<'heap>,
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
    &HirLowerGraphHoistingSuite,
    &HirLowerNormalizationSuite,
    &HirLowerSpecializationSuite,
    &HirLowerThunkingSuite,
    &HirLowerTypeCheckingSuite,
    &HirLowerTypeInferenceIntrinsicsSuite,
    &HirLowerTypeInferenceSuite,
    &HirReifySuite,
    &MirPassAnalysisDataDependency,
    &MirPassTransformCfgSimplify,
    &MirReifySuite,
    &ParseSyntaxDumpSuite,
];

pub(crate) fn find_suite(name: &str) -> Option<&'static dyn Suite> {
    SUITES.iter().find(|&suite| suite.name() == name).copied()
}

pub(crate) fn iter() -> &'static [&'static dyn Suite] {
    SUITES
}
