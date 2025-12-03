use core::fmt::Write as _;

use hashql_ast::node::expr::Expr;
use hashql_core::{
    heap::Heap,
    module::ModuleRegistry,
    pretty::{Formatter, RenderOptions},
    r#type::environment::Environment,
};
use hashql_diagnostics::DiagnosticIssues;
use hashql_hir::{
    context::HirContext, fold::Fold as _, intern::Interner, lower::specialization::Specialization,
    node::Node, pretty::NodeFormatter,
};

use super::{
    RunContext, Suite, SuiteDiagnostic, common::Header, hir_lower_alias_replacement::TestOptions,
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
    let (node, residual) = hir_lower_checking(heap, expr, environment, context, options)?;

    let mut issues = DiagnosticIssues::new();
    let mut specialisation =
        Specialization::new(environment, context, residual.intrinsics, &mut issues);
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
        RunContext {
            heap, diagnostics, ..
        }: RunContext<'_, 'heap>,
        expr: Expr<'heap>,
    ) -> Result<String, SuiteDiagnostic> {
        let mut environment = Environment::new(heap);
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

        let formatter = Formatter::new(heap);
        let mut formatter = NodeFormatter::with_defaults(&formatter, &environment, &context);

        let _ = writeln!(
            output,
            "\n{}\n\n{}",
            Header::new("HIR after specialization"),
            formatter.render(node, RenderOptions::default().with_plain())
        );

        Ok(output)
    }
}
