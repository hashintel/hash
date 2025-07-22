use hashql_ast::lowering::ExtractedTypes;
use hashql_core::{module::ModuleRegistry, r#type::environment::Environment};

use self::{
    alias::AliasReplacement,
    checking::TypeChecking,
    ctor::ConvertTypeConstructor,
    error::{LoweringDiagnostic, LoweringDiagnosticCategory},
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
) -> Result<Node<'heap>, Vec<LoweringDiagnostic>> {
    let mut replacement = AliasReplacement::new(interner);
    let Ok(node) = replacement.fold_node(node);

    let mut converter = ConvertTypeConstructor::new(interner, &types.locals, registry, env);
    let node = converter.fold_node(node)?;

    let mut inference = TypeInference::new(env, registry);
    inference.visit_node(&node);

    let (solver, inference_residual, inference_diagnostics) = inference.finish();
    let (substitution, solver_diagnostics) = solver.solve();

    // Diagnostic checkpoint, if an error happened during the inference phase, then we cannot
    // continue
    let diagnostics: Vec<_> = inference_diagnostics
        .into_iter()
        .chain(solver_diagnostics)
        .map(|diagnostic| diagnostic.map_category(LoweringDiagnosticCategory::TypeChecking))
        .collect();
    if !diagnostics.is_empty() {
        return Err(diagnostics);
    }

    env.substitution = substitution;

    let mut checking = TypeChecking::new(env, registry, inference_residual);
    checking.visit_node(&node);

    let (mut residual, checking_diagnostics) = checking.finish();

    // Diagnostic checkpoint, if an error happened during the type checking phase, then we cannot
    // continue
    if !checking_diagnostics.is_empty() {
        return Err(checking_diagnostics);
    }

    let mut specialization =
        Specialization::new(env, interner, &mut residual.types, residual.intrinsics);
    let node = specialization.fold_node(node).map_err(|diagnostics| {
        diagnostics
            .into_iter()
            .map(|diagnostic| diagnostic.map_category(LoweringDiagnosticCategory::Specialization))
            .collect::<Vec<_>>()
    })?;

    Ok(node)
}
