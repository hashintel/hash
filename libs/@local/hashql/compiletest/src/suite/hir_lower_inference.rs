use core::fmt::Write as _;

use hashql_ast::node::expr::Expr;
use hashql_core::{
    heap::Heap,
    module::ModuleRegistry,
    pretty::{PrettyOptions, PrettyPrint as _},
    r#type::{environment::Environment, inference::InferenceSolver},
};
use hashql_hir::{
    context::HirContext,
    intern::Interner,
    lower::inference::{TypeInference, TypeInferenceResidual},
    node::NodeData,
    pretty::PrettyPrintEnvironment,
    visit::Visitor as _,
};

use super::{
    Suite, SuiteDiagnostic,
    common::{Annotated, Header},
    hir_lower_ctor::hir_lower_ctor,
};
use crate::suite::{
    common::{process_issues, process_status},
    hir_lower_alias_replacement::TestOptions,
};

pub(crate) fn hir_lower_inference<'env, 'heap>(
    heap: &'heap Heap,
    expr: Expr<'heap>,
    environment: &'env Environment<'heap>,
    context: &mut HirContext<'_, 'heap>,
    options: &mut TestOptions,
) -> Result<
    (
        NodeData<'heap>,
        InferenceSolver<'env, 'heap>,
        TypeInferenceResidual<'heap>,
    ),
    SuiteDiagnostic,
> {
    let node = hir_lower_ctor(heap, expr, environment, context, options)?;

    let mut inference = TypeInference::new(environment, context);
    inference.visit_node(&node);

    let (solver, inference_residual, inference_diagnostics) = inference.finish();
    process_issues(options.diagnostics, inference_diagnostics)?;

    Ok((node, solver, inference_residual))
}

pub(crate) struct HirLowerTypeInferenceSuite;

impl Suite for HirLowerTypeInferenceSuite {
    fn name(&self) -> &'static str {
        "hir/lower/type-inference"
    }

    fn run<'heap>(
        &self,
        heap: &'heap Heap,
        expr: Expr<'heap>,
        diagnostics: &mut Vec<SuiteDiagnostic>,
    ) -> Result<String, SuiteDiagnostic> {
        let mut environment = Environment::new(expr.span, heap);
        let registry = ModuleRegistry::new(&environment);
        let interner = Interner::new(heap);
        let mut context = HirContext::new(&interner, &registry);

        let mut output = String::new();

        let (node, solver, inference_residual) = hir_lower_inference(
            heap,
            expr,
            &environment,
            &mut context,
            &mut TestOptions {
                skip_alias_replacement: false,
                output: &mut output,
                diagnostics,
            },
        )?;

        // We sort so that the output is deterministic
        let mut inference_types: Vec<_> = inference_residual
            .types
            .iter()
            .map(|(&hir_id, &type_id)| (hir_id, type_id))
            .collect();
        inference_types.sort_unstable_by_key(|&(hir_id, _)| hir_id);

        let substitution = process_status(diagnostics, solver.solve())?;

        environment.substitution = substitution;

        let _ = writeln!(
            output,
            "\n{}\n\n{}",
            Header::new("HIR after type inference"),
            node.pretty_print(
                &PrettyPrintEnvironment {
                    env: &environment,
                    symbols: &context.symbols,
                },
                PrettyOptions::default().without_color()
            )
        );

        let _ = writeln!(output, "\n{}\n", Header::new("Types"));

        for (hir_id, type_id) in inference_types {
            let _ = writeln!(
                output,
                "{}\n",
                Annotated {
                    content: interner.node.index(hir_id).pretty_print(
                        &PrettyPrintEnvironment {
                            env: &environment,
                            symbols: &context.symbols,
                        },
                        PrettyOptions::default().without_color()
                    ),
                    annotation: environment.r#type(type_id).pretty_print(
                        &environment,
                        PrettyOptions::default()
                            .without_color()
                            .with_resolve_substitutions(true)
                    )
                }
            );
        }

        Ok(output)
    }
}
