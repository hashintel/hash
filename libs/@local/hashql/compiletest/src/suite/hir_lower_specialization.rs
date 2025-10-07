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
    lower::{
        alias::AliasReplacement, checking::TypeChecking, ctor::ConvertTypeConstructor,
        inference::TypeInference, specialization::Specialization,
    },
    node::Node,
    pretty::PrettyPrintEnvironment,
    visit::Visitor as _,
};

use super::{Suite, SuiteDiagnostic, common::Header};
use crate::suite::common::{process_issues, process_status};

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

        let substitution = process_status(diagnostics, solver.solve())?;

        environment.substitution = substitution;

        let mut checking = TypeChecking::new(&environment, &context, inference_residual);
        checking.visit_node(&node);

        let mut residual = process_status(diagnostics, checking.finish())?;

        let mut issues = DiagnosticIssues::new();
        let mut specialisation = Specialization::new(
            &environment,
            &context,
            &mut residual.types,
            residual.intrinsics,
            &mut issues,
        );
        let Ok(node) = specialisation.fold_node(node);

        process_issues(diagnostics, issues)?;

        let _ = writeln!(
            output,
            "\n{}\n\n{}",
            Header::new("HIR after specialization"),
            node.pretty_print(
                &PrettyPrintEnvironment {
                    env: &environment,
                    symbols: &context.symbols,
                },
                PrettyOptions::default().without_color()
            )
        );

        Ok(output)
    }
}
