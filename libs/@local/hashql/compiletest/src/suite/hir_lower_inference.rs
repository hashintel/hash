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
    fold::Fold as _,
    intern::Interner,
    lower::{alias::AliasReplacement, ctor::ConvertTypeConstructor, inference::TypeInference},
    node::Node,
    visit::Visitor as _,
};

use super::{
    Suite, SuiteDiagnostic,
    common::{Annotated, Header, process_diagnostics},
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
        let mut output = String::new();

        let result = lower(
            heap.intern_symbol("::main"),
            &mut expr,
            &environment,
            &registry,
        );
        let types = process_status(diagnostics, result)?;

        let interner = Interner::new(heap);
        let node = process_status(
            diagnostics,
            Node::from_ast(expr, &environment, &interner, &types),
        )?;

        let _ = writeln!(
            output,
            "{}\n\n{}",
            Header::new("Initial HIR"),
            node.pretty_print(&environment, PrettyOptions::default().without_color())
        );

        let mut issues = DiagnosticIssues::new();
        let mut replacement = AliasReplacement::new(&interner, &mut issues);
        let Ok(node) = replacement.fold_node(node);

        let mut converter = ConvertTypeConstructor::new(
            &interner,
            &types.locals,
            &registry,
            &environment,
            &mut issues,
        );
        let Ok(node) = converter.fold_node(node);

        process_issues(diagnostics, issues)?;

        let mut inference = TypeInference::new(&environment, &registry);
        inference.visit_node(&node);

        let (solver, inference_residual, inference_diagnostics) = inference.finish();
        process_diagnostics(diagnostics, inference_diagnostics)?;

        // We sort so that the output is deterministic
        let mut inference_types: Vec<_> = inference_residual
            .types
            .iter()
            .map(|(&hir_id, &type_id)| (hir_id, type_id))
            .collect();
        inference_types.sort_unstable_by_key(|&(hir_id, _)| hir_id);

        let (substitution, solver_diagnostics) = solver.solve();
        process_diagnostics(diagnostics, solver_diagnostics.into_vec())?;

        environment.substitution = substitution;

        let _ = writeln!(
            output,
            "\n{}\n\n{}",
            Header::new("HIR after type inference"),
            node.pretty_print(&environment, PrettyOptions::default().without_color())
        );

        let _ = writeln!(output, "\n{}\n", Header::new("Types"));

        for (hir_id, type_id) in inference_types {
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
