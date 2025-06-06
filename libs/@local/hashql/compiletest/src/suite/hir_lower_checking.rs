use core::fmt::Write as _;

use hashql_ast::{lowering::lower, node::expr::Expr};
use hashql_core::{
    heap::Heap,
    module::ModuleRegistry,
    pretty::{PrettyOptions, PrettyPrint as _},
    r#type::environment::Environment,
};
use hashql_hir::{
    fold::Fold as _,
    intern::Interner,
    lower::{
        alias::AliasReplacement, checking::TypeChecking, ctor::ConvertTypeConstructor,
        inference::TypeInference,
    },
    node::Node,
    visit::Visitor as _,
};

use super::{
    Suite, SuiteDiagnostic,
    common::{Annotated, Header, process_diagnostics},
};

pub(crate) struct HirLowerTypeCheckingSuite;

impl Suite for HirLowerTypeCheckingSuite {
    fn name(&self) -> &'static str {
        "hir/lower/type-checking"
    }

    fn run<'heap>(
        &self,
        heap: &'heap Heap,
        mut expr: Expr<'heap>,
        diagnostics: &mut Vec<SuiteDiagnostic>,
    ) -> Result<String, SuiteDiagnostic> {
        let mut environment = Environment::new(expr.span, heap);
        let registry = ModuleRegistry::new(&environment);
        let mut output = String::new();

        let (types, lower_diagnostics) = lower(
            heap.intern_symbol("::main"),
            &mut expr,
            &environment,
            &registry,
        );

        process_diagnostics(diagnostics, lower_diagnostics)?;

        let interner = Interner::new(heap);
        let (node, reify_diagnostics) = Node::from_ast(expr, &environment, &interner, &types);
        process_diagnostics(diagnostics, reify_diagnostics)?;

        let node = node.expect("should be `Some` if there are non-fatal errors");

        let _ = writeln!(
            output,
            "{}\n\n{}",
            Header::new("Initial HIR"),
            node.pretty_print(&environment, PrettyOptions::default().without_color())
        );

        let mut replacement = AliasReplacement::new(&interner);
        let Ok(node) = replacement.fold_node(node);

        let mut converter =
            ConvertTypeConstructor::new(&interner, &types.locals, &registry, &environment);

        let node = match converter.fold_node(node) {
            Ok(node) => node,
            Err(reported) => {
                let diagnostic = process_diagnostics(diagnostics, reported)
                    .expect_err("reported diagnostics should always be fatal");
                return Err(diagnostic);
            }
        };

        let mut inference = TypeInference::new(&environment, &registry);
        inference.visit_node(&node);

        let (solver, inference_residual, inference_diagnostics) = inference.finish();
        process_diagnostics(diagnostics, inference_diagnostics)?;

        let (substitution, solver_diagnostics) = solver.solve();
        process_diagnostics(diagnostics, solver_diagnostics.into_vec())?;

        environment.substitution = substitution;

        let mut checking = TypeChecking::new(&environment, &registry, inference_residual);
        checking.visit_node(&node);

        let (residual, checking_diagnostics) = checking.finish();
        process_diagnostics(diagnostics, checking_diagnostics)?;

        // We sort so that the output is deterministic
        let mut checking_types: Vec<_> = residual
            .types
            .iter()
            .map(|(&hir_id, &type_id)| (hir_id, type_id))
            .collect();
        checking_types.sort_unstable_by_key(|&(hir_id, _)| hir_id);

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
            node.pretty_print(&environment, PrettyOptions::default().without_color())
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

        if !checking_types.is_empty() {
            let _ = writeln!(output, "\n{}\n", Header::new("Types"));
        }

        for (hir_id, type_id) in checking_types {
            let _ = writeln!(
                output,
                "{}\n",
                Annotated {
                    content: interner
                        .node
                        .index(hir_id)
                        .pretty_print(&environment, PrettyOptions::default().without_color()),
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
