use hashql_ast::lowering::ExtractedTypes;
use hashql_core::{module::ModuleRegistry, r#type::environment::Environment};
use hashql_diagnostics::{DiagnosticIssues, StatusExt as _, Success};

use self::{
    alias::AliasReplacement,
    checking::TypeChecking,
    ctor::ConvertTypeConstructor,
    error::{LoweringDiagnosticCategory, LoweringDiagnosticStatus},
    inference::TypeInference,
    specialization::Specialization,
};
use crate::{fold::Fold as _, intern::Interner, node::Node, visit::Visitor as _};

pub mod alias;
pub mod checking;
pub mod ctor;
pub mod error;
pub mod inference;
pub mod specialization;

/// Lowers the given node by performing different phases.
///
/// This will set the "substitution" field of the environment given.
///
/// # Errors
///
/// Returns a vector of `LoweringDiagnostic` if any errors occurred during lowering.
///
/// The vector is guaranteed to be non-empty.
pub fn lower<'heap>(
    node: Node<'heap>,
    types: &ExtractedTypes<'heap>,
    env: &mut Environment<'heap>,
    registry: &ModuleRegistry<'heap>,
    interner: &Interner<'heap>,
) -> LoweringDiagnosticStatus<Node<'heap>> {
    let mut diagnostics = DiagnosticIssues::new();
    let mut replacement = AliasReplacement::new(interner, &mut diagnostics);
    let Ok(node) = replacement.fold_node(node);

    let mut converter =
        ConvertTypeConstructor::new(interner, &types.locals, registry, env, &mut diagnostics);
    let Ok(node) = converter.fold_node(node);

    let Success {
        value: node,
        advisories,
    } = diagnostics.into_status(node)?;

    // Pre type-checking diagnostic boundary

    let mut diagnostics = advisories.generalize();

    let mut inference = TypeInference::new(env, registry);
    inference.visit_node(&node);

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

    let mut checking = TypeChecking::new(env, registry, inference_residual);
    checking.visit_node(&node);

    let mut result = checking.finish();
    result.append_diagnostics(&mut diagnostics);

    let Success {
        value: mut residual,
        advisories,
    } = result?;

    // Post type-checking diagnostic boundary
    let mut diagnostics = advisories.generalize();

    let mut specialization = Specialization::new(
        env,
        interner,
        &mut residual.types,
        residual.intrinsics,
        &mut diagnostics,
    );
    let Ok(node) = specialization.fold_node(node);

    diagnostics.into_status(node)
}
