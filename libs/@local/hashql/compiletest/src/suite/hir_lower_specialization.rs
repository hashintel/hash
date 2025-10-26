use core::fmt::Write as _;

use hashql_ast::node::expr::Expr;
use hashql_core::{
    heap::Heap,
    module::ModuleRegistry,
    pretty::{PrettyOptions, PrettyPrint as _},
    r#type::environment::Environment,
};
use hashql_diagnostics::DiagnosticIssues;
use hashql_hir::{
    context::HirContext, fold::Fold as _, intern::Interner, lower::specialization::Specialization,
    node::Node, pretty::PrettyPrintEnvironment,
};

use super::{
    Suite, SuiteDiagnostic, common::Header, hir_lower_alias_replacement::TestOptions,
    hir_lower_checking::hir_lower_checking,
};
use crate::suite::common::process_issues;

pub(crate) fn hir_lower_specialization<'heap>(
    heap: &'heap Heap,
    expr: Expr<'heap>,
    environment: &mut Environment<'heap>,
    context: &mut HirContext<'_, 'heap>,
    options: &mut TestOptions,
) -> Result<Node<'heap>, SuiteDiagnostic> {
    let (node, mut residual) = hir_lower_checking(heap, expr, environment, context, options)?;

    let mut issues = DiagnosticIssues::new();
    let mut specialisation = Specialization::new(
        environment,
        context,
        &mut residual.types,
        residual.intrinsics,
        &mut issues,
    );
    let Ok(node) = specialisation.fold_node(node);

    process_issues(options.diagnostics, issues)?;

    Ok(node)
}

pub(crate) struct HirLowerSpecializationSuite;

impl Suite for HirLowerSpecializationSuite {
    fn name(&self) -> &'static str {
        "hir/lower/specialization"
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

        let node = hir_lower_specialization(
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
