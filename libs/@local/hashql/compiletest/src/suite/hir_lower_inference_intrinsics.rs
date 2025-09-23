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
    lower::{ctor::ConvertTypeConstructor, inference::TypeInference},
    node::Node,
    visit::Visitor as _,
};

use super::{
    Suite, SuiteDiagnostic,
    common::{Annotated, Header, process_diagnostics},
};
use crate::suite::common::process_diagnostic_result;

pub(crate) struct HirLowerTypeInferenceIntrinsicsSuite;

impl Suite for HirLowerTypeInferenceIntrinsicsSuite {
    fn name(&self) -> &'static str {
        "hir/lower/type-inference/intrinsics"
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
        let types = process_diagnostic_result(diagnostics, result)?;

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

        // We sort so that the output is deterministic
        let mut inference_intrinsics: Vec<_> = inference_residual
            .intrinsics
            .iter()
            .map(|(&id, &type_id)| (id, type_id))
            .collect();
        inference_intrinsics.sort_unstable_by_key(|&(id, _)| id);

        let (substitution, solver_diagnostics) = solver.solve();
        process_diagnostics(diagnostics, solver_diagnostics.into_vec())?;

        environment.substitution = substitution;

        let _ = writeln!(
            output,
            "\n{}\n\n{}",
            Header::new("HIR after type inference"),
            node.pretty_print(&environment, PrettyOptions::default().without_color())
        );

        let _ = writeln!(output, "\n{}\n", Header::new("Intrinsics"));

        for (hir_id, intrinsic) in inference_intrinsics {
            let _ = writeln!(
                output,
                "{}\n",
                Annotated {
                    content: interner
                        .node
                        .index(hir_id)
                        .pretty_print(&environment, PrettyOptions::default().without_color()),
                    annotation: intrinsic
                }
            );
        }

        Ok(output)
    }
}
