#![coverage(off)]
mod ast_lower_expander;
mod ast_lower_node_mangler;
mod ast_lower_node_renumberer;
mod ast_lower_sanitizer;
mod ast_lower_type_definition_extractor;
mod ast_lower_type_extractor;
pub(crate) mod common;
mod eval_postgres;
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
mod mir_interpret;
mod mir_pass_analysis_data_dependency;
mod mir_pass_transform_administrative_reduction;
mod mir_pass_transform_cfg_simplify;
mod mir_pass_transform_dse;
mod mir_pass_transform_forward_substitution;
mod mir_pass_transform_inline;
mod mir_pass_transform_inst_simplify;
mod mir_pass_transform_post_inline;
mod mir_pass_transform_pre_inline;
mod mir_reify;
mod parse_syntax_dump;

use core::panic::RefUnwindSafe;

use error_stack::ReportSink;
use hashql_ast::node::expr::Expr;
use hashql_core::{collections::FastHashMap, heap::Heap, span::SpanId};
use hashql_diagnostics::{Diagnostic, category::DiagnosticCategory};

use self::{
    ast_lower_expander::AstLowerExpanderSuite, ast_lower_node_mangler::AstLowerNameManglerSuite,
    ast_lower_node_renumberer::AstLowerNodeRenumbererSuite,
    ast_lower_sanitizer::AstLowerSanitizerSuite,
    ast_lower_type_definition_extractor::AstLowerTypeDefinitionExtractorSuite,
    ast_lower_type_extractor::AstLowerTypeExtractorSuite, eval_postgres::EvalPostgres,
    hir_lower_alias_replacement::HirLowerAliasReplacementSuite,
    hir_lower_checking::HirLowerTypeCheckingSuite, hir_lower_ctor::HirLowerCtorSuite,
    hir_lower_graph_hoisting::HirLowerGraphHoistingSuite,
    hir_lower_inference::HirLowerTypeInferenceSuite,
    hir_lower_inference_intrinsics::HirLowerTypeInferenceIntrinsicsSuite,
    hir_lower_normalization::HirLowerNormalizationSuite,
    hir_lower_specialization::HirLowerSpecializationSuite,
    hir_lower_thunking::HirLowerThunkingSuite, hir_reify::HirReifySuite,
    mir_interpret::MirInterpret, mir_pass_analysis_data_dependency::MirPassAnalysisDataDependency,
    mir_pass_transform_administrative_reduction::MirPassTransformAdministrativeReduction,
    mir_pass_transform_cfg_simplify::MirPassTransformCfgSimplify,
    mir_pass_transform_dse::MirPassTransformDse,
    mir_pass_transform_forward_substitution::MirPassTransformForwardSubstitution,
    mir_pass_transform_inline::MirPassTransformInline,
    mir_pass_transform_inst_simplify::MirPassTransformInstSimplify,
    mir_pass_transform_post_inline::MirPassTransformPostInline,
    mir_pass_transform_pre_inline::MirPassTransformPreInline, mir_reify::MirReifySuite,
    parse_syntax_dump::ParseSyntaxDumpSuite,
};
use crate::harness::trial::TrialError;

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
    &AstLowerExpanderSuite,
    &AstLowerNameManglerSuite,
    &AstLowerNodeRenumbererSuite,
    &AstLowerSanitizerSuite,
    &AstLowerTypeDefinitionExtractorSuite,
    &AstLowerTypeExtractorSuite,
    &EvalPostgres,
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
    &MirInterpret,
    &MirPassAnalysisDataDependency,
    &MirPassTransformAdministrativeReduction,
    &MirPassTransformCfgSimplify,
    &MirPassTransformDse,
    &MirPassTransformForwardSubstitution,
    &MirPassTransformInline,
    &MirPassTransformInstSimplify,
    &MirPassTransformPostInline,
    &MirPassTransformPreInline,
    &MirReifySuite,
    &ParseSyntaxDumpSuite,
];

pub(crate) fn find_suite(name: &str) -> Option<&'static dyn Suite> {
    SUITES.iter().find(|&suite| suite.name() == name).copied()
}

pub(crate) fn iter() -> &'static [&'static dyn Suite] {
    SUITES
}
