use core::fmt::Write as _;

use hashql_ast::{lowering::lower, node::expr::Expr};
use hashql_core::{
    heap::Heap,
    module::ModuleRegistry,
    pretty::{PrettyOptions, PrettyPrint as _},
    r#type::environment::Environment,
};
use hashql_diagnostics::DiagnosticIssues;
use hashql_hir::{
    context::HirContext,
    fold::Fold as _,
    intern::Interner,
    lower::{alias::AliasReplacement, ctor::ConvertTypeConstructor, inference::TypeInference},
    node::Node,
    pretty::PrettyPrintEnvironment,
    visit::Visitor as _,
};

use super::{
    Suite, SuiteDiagnostic,
    common::{Annotated, Header},
};
use crate::suite::common::{process_issues, process_status};

pub(crate) struct HirLowerTypeInferenceSuite;

impl Suite for HirLowerTypeInferenceSuite {
    fn name(&self) -> &'static str {
        "hir/lower/type-inference"
    }

    fn run<'heap>(
        &self,
        heap: &'heap Heap,
        mut expr: Expr<'heap>,
        diagnostics: &mut Vec<SuiteDiagnostic>,
    ) -> Result<String, SuiteDiagnostic> {
        let mut environment = Environment::new(expr.span, heap);
        let registry = ModuleRegistry::new(&environment);
        let interner = Interner::new(heap);
        let mut context = HirContext::new(&interner, &registry);

        let mut output = String::new();

        let result = lower(
            heap.intern_symbol("::main"),
            &mut expr,
            &environment,
            &registry,
        );
        let types = process_status(diagnostics, result)?;

        let node = process_status(diagnostics, Node::from_ast(expr, &mut context, &types))?;

        let _ = writeln!(
            output,
            "{}\n\n{}",
            Header::new("Initial HIR"),
            node.pretty_print(
                &PrettyPrintEnvironment {
                    env: &environment,
                    symbols: &context.symbols,
                },
                PrettyOptions::default().without_color()
            )
        );

        let mut issues = DiagnosticIssues::new();
        let mut replacement = AliasReplacement::new(&context, &mut issues);
        let Ok(node) = replacement.fold_node(node);

        let mut converter =
            ConvertTypeConstructor::new(&context, &types.locals, &environment, &mut issues);
        let Ok(node) = converter.fold_node(node);

        process_issues(diagnostics, issues)?;

        let mut inference = TypeInference::new(&environment, &context);
        inference.visit_node(&node);

        let (solver, inference_residual, inference_diagnostics) = inference.finish();
        process_issues(diagnostics, inference_diagnostics)?;

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
