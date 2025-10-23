use hashql_ast::lowering::ExtractedTypes;
use hashql_core::r#type::environment::Environment;
use hashql_diagnostics::{DiagnosticIssues, StatusExt as _, Success};

use self::{
    alias::AliasReplacement,
    checking::TypeChecking,
    ctor::ConvertTypeConstructor,
    error::{LoweringDiagnosticCategory, LoweringDiagnosticStatus},
    hoist::{GraphHoisting, GraphHoistingConfig},
    inference::TypeInference,
    normalization::{Normalization, NormalizationState},
    specialization::Specialization,
    thunking::Thunking,
};
use crate::{context::HirContext, fold::Fold as _, node::Node, visit::Visitor as _};

pub mod alias;
pub mod checking;
pub mod ctor;
pub mod dataflow;
pub mod error;
pub mod hoist;
pub mod inference;
pub mod normalization;
pub mod specialization;
pub mod thunking;

/// Lowers the given node by performing different phases.
///
/// This will set the "substitution" field of the environment given.
///
/// # Errors
///
/// Returns a vector of `LoweringDiagnostic` if any errors occurred during lowering.
///
/// The vector is guaranteed to be non-empty.
pub fn lower<'env, 'heap>(
    node: Node<'heap>,
    types: &'env ExtractedTypes<'heap>,
    env: &'env mut Environment<'heap>,
    context: &mut HirContext<'_, 'heap>,
) -> LoweringDiagnosticStatus<Node<'heap>> {
    let mut diagnostics = DiagnosticIssues::new();
    let mut replacement = AliasReplacement::new(context, &mut diagnostics);
    let Ok(node) = replacement.fold_node(node);

    let mut converter = ConvertTypeConstructor::new(context, &types.locals, env, &mut diagnostics);
    let Ok(node) = converter.fold_node(node);
    drop(converter);

    let Success {
        value: node,
        advisories,
    } = diagnostics.into_status(node)?;

    // Pre type-checking diagnostic boundary

    let mut diagnostics = advisories.generalize();

    let mut inference = TypeInference::new(env, context);
    inference.visit_node(node);

    let (solver, inference_residual, mut inference_diagnostics) = inference.finish();

    let mut result = solver
        .solve()
        .map_category(LoweringDiagnosticCategory::TypeChecking);
    result.append_diagnostics(&mut diagnostics);
    result.append_diagnostics(&mut inference_diagnostics);

    // Type-inference diagnostic boundary
    let Success {
        value: substitution,
        advisories,
    } = result?;
    let mut diagnostics = advisories.generalize();

    env.substitution = substitution;

    let mut checking = TypeChecking::new(env, context, inference_residual);
    checking.visit_node(node);

    let mut result = checking.finish();
    result.append_diagnostics(&mut diagnostics);

    let Success {
        value: residual,
        advisories,
    } = result?;

    // Post type-checking diagnostic boundary
    let mut diagnostics = advisories.generalize();

    let mut specialization =
        Specialization::new(env, context, residual.intrinsics, &mut diagnostics);
    let Ok(node) = specialization.fold_node(node);

    let mut norm_state = NormalizationState::default();
    let normalization = Normalization::new(context, &mut norm_state);
    let node = normalization.run(node);

    // Graph hoisting does *not* break HIR(ANF)
    let graph_hoisting = GraphHoisting::new(context, GraphHoistingConfig::default());
    let node = graph_hoisting.run(node);

    let thunking = Thunking::new(context, env);
    let node = thunking.run(node);

    // Thunking breaks normalization, so re-normalize
    let normalization = Normalization::new(context, &mut norm_state);
    let node = normalization.run(node);

    diagnostics.into_status(node)
}
