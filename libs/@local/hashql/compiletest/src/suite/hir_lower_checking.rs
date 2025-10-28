use core::fmt::Write as _;

use hashql_ast::node::expr::Expr;
use hashql_core::{
    heap::Heap,
    module::ModuleRegistry,
    pretty::{PrettyOptions, PrettyPrint as _},
    r#type::environment::Environment,
};
use hashql_hir::{
    context::HirContext,
    intern::Interner,
    lower::checking::{TypeChecking, TypeCheckingResidual},
    node::Node,
    pretty::PrettyPrintEnvironment,
    visit::Visitor as _,
};

use super::{
    Suite, SuiteDiagnostic,
    common::{Annotated, Header},
    hir_lower_alias_replacement::TestOptions,
    hir_lower_inference::hir_lower_inference,
};
use crate::suite::{common::process_status, hir_lower_inference::collect_hir_nodes};

pub(crate) fn hir_lower_checking<'heap>(
    heap: &'heap Heap,
    expr: Expr<'heap>,
    environment: &mut Environment<'heap>,
    context: &mut HirContext<'_, 'heap>,
    options: &mut TestOptions,
) -> Result<(Node<'heap>, TypeCheckingResidual<'heap>), SuiteDiagnostic> {
    let (node, solver, inference_residual) =
        hir_lower_inference(heap, expr, environment, context, options)?;

    let substitution = process_status(options.diagnostics, solver.solve())?;

    environment.substitution = substitution;

    let mut checking = TypeChecking::new(environment, context, inference_residual);
    checking.visit_node(node);

    let residual = process_status(options.diagnostics, checking.finish())?;
    Ok((node, residual))
}

pub(crate) struct HirLowerTypeCheckingSuite;

impl Suite for HirLowerTypeCheckingSuite {
    fn name(&self) -> &'static str {
        "hir/lower/type-checking"
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

        let (node, residual) = hir_lower_checking(
            heap,
            expr,
            &mut environment,
            &mut context,
            &mut TestOptions {
                skip_alias_replacement: false,
                output: &mut output,
                diagnostics,
            },
        )?;

        let mut checking_inputs: Vec<_> = residual
            .inputs
            .iter()
            .map(|(&name, &type_id)| (name, type_id))
            .collect();
        checking_inputs.sort_unstable_by_key(|&(hir_id, _)| hir_id);

        let _ = writeln!(
            output,
            "\n{}\n\n{}",
            Header::new("HIR after type checking"),
            node.pretty_print(
                &PrettyPrintEnvironment {
                    env: &environment,
                    symbols: &context.symbols,
                    map: &context.map,
                },
                PrettyOptions::default().without_color()
            )
        );

        if !checking_inputs.is_empty() {
            let _ = writeln!(output, "\n{}\n", Header::new("Inputs"));
        }

        for (name, type_id) in checking_inputs {
            let _ = writeln!(
                output,
                "\n{}\n",
                Annotated {
                    content: name,
                    annotation: environment
                        .r#type(type_id)
                        .pretty_print(&environment, PrettyOptions::default().without_color())
                }
            );
        }

        let _ = writeln!(output, "\n{}\n", Header::new("Types"));

        let nodes = collect_hir_nodes(node);

        for node in nodes {
            let type_id = context.map.type_id(node.id);

            let _ = writeln!(
                output,
                "{}\n",
                Annotated {
                    content: node.pretty_print(
                        &PrettyPrintEnvironment {
                            env: &environment,
                            symbols: &context.symbols,
                            map: &context.map,
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
