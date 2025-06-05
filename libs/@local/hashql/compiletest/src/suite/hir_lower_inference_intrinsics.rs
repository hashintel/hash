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

use super::{Suite, SuiteDiagnostic, common::process_diagnostics};

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

        let mut output = node
            .pretty_print(&environment, PrettyOptions::default().without_color())
            .to_string();

        output.push_str("\n\n--------------------------------------\n\n");

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

        write!(
            &mut output,
            "{}",
            node.pretty_print(&environment, PrettyOptions::default().without_color())
        )
        .expect("infallible");

        for (hir_id, intrinsic) in inference_intrinsics {
            output.push_str("\n\n--------------------------------------\n\n");

            output.push_str("Node:\n");

            writeln!(
                &mut output,
                "{}\n\n",
                interner
                    .node
                    .index(hir_id)
                    .pretty_print(&environment, PrettyOptions::default().without_color())
            )
            .expect("infallible");

            output.push_str("Intrinsic:\n");

            write!(&mut output, "{intrinsic}").expect("infallible");
        }

        Ok(output)
    }
}
