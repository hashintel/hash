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
        inference::TypeInference, specialization::Specialization,
    },
    node::Node,
    visit::Visitor as _,
};

use super::{
    Suite, SuiteDiagnostic,
    common::{Header, process_diagnostics, process_result},
};

pub(crate) struct HirLowerSpecializationSuite;

impl Suite for HirLowerSpecializationSuite {
    fn name(&self) -> &'static str {
        "hir/lower/specialization"
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

        let node = process_result(diagnostics, converter.fold_node(node))?;

        let mut inference = TypeInference::new(&environment, &registry);
        inference.visit_node(&node);

        let (solver, inference_residual, inference_diagnostics) = inference.finish();
        process_diagnostics(diagnostics, inference_diagnostics)?;

        let (substitution, solver_diagnostics) = solver.solve();
        process_diagnostics(diagnostics, solver_diagnostics.into_vec())?;

        environment.substitution = substitution;

        let mut checking = TypeChecking::new(&environment, &registry, inference_residual);
        checking.visit_node(&node);

        let (mut residual, checking_diagnostics) = checking.finish();
        process_diagnostics(diagnostics, checking_diagnostics)?;

        let mut specialisation = Specialization::new(
            &environment,
            &interner,
            &mut residual.types,
            residual.intrinsics,
        );

        let node = process_result(diagnostics, specialisation.fold_node(node))?;

        let _ = writeln!(
            output,
            "\n{}\n\n{}",
            Header::new("HIR after specialization"),
            node.pretty_print(&environment, PrettyOptions::default().without_color())
        );

        Ok(output)
    }
}
